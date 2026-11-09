import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  enemySkills,
  enemyUsableSkills,
  simulateBattle,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 混沌回忆 P43「来生泅渡」其十二 + 星启 · 第四批 6 只（2026-10-30）──
// 数据源：data/monster-stages/moc-p43.json（其十二 index 12 上半/下半、星启 index 0）
// 技能表：packages/engine/src/combat/monster-skill-data.ts（倍率全部占位 1，TODO(实机)）
// 本轮新增框架：**通用我方 DoT（风化/灼烧）**、我方状态标记、【冰点】、【破晓力场】+【失意】、【盾反】、持续伤害全员引爆。
// 锚点来自 zz-p43-dump 实测：基础命中 334.58 = 625.5117 × 0.5349（Lv95 打 Lv80）。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

function members(): CombatMember[] {
  return [
    { id: 'sunday', panel: panel(156) },
    { id: 'jingyuan', panel: panel(134) },
    { id: 'tenghuang', panel: panel(135) },
    { id: 'aventurine', panel: panel(134) },
  ];
}

function cfgOf(monsterId: string, half?: '上半' | '下半', index = 12): MonsterConfig {
  for (const wave of buildPackStageWaves('moc-p43', index, half)) {
    for (const c of wave) if (c.monsterId === monsterId) return { ...c, hp: Math.min(c.hp, 3e7) };
  }
  throw new Error(`missing ${monsterId}`);
}

function run(wave: MonsterConfig[], rounds = 6): CombatEvent[] {
  return simulateBattle({
    members: members(),
    monsterWaves: [wave],
    techniques: false,
    rounds,
    maxTime: 2400,
    roundMode: 'phantom',
  }).events;
}

const mon = (id: string, half?: '上半' | '下半', index?: number) => cfgOf(id, half, index);
const casts = (evs: CombatEvent[], id: string) =>
  evs.filter((e) => e.skillCode === `monster.${id}`);

describe('P43 第四批 · 技能表', () => {
  it('6 只全部登记：曙光/苍翼各 5 条、冰 3 条、承露天人 5 条、尉官 4 条、醉宴 4 条、绘世 5 条', () => {
    expect(enemySkills('5013060').map((s) => s.skillId)).toEqual([
      '501306001',
      '501306002',
      '501306003',
      '501306004',
      '501306005',
    ]);
    expect(enemySkills('5013040').map((s) => s.skillId)).toEqual([
      '501304001',
      '501304002',
      '501304003',
      '501304004',
      '501304005',
    ]);
    expect(enemySkills('8003010').map((s) => s.skillId)).toEqual(['800301001', '800301002', '800301003']);
    expect(enemySkills('2023030')).toHaveLength(5);
    expect(enemySkills('1003010')).toHaveLength(4);
    expect(enemySkills('3003050')).toHaveLength(4);
    expect(enemySkills('5014030')).toHaveLength(5);
    // 关键字段
    expect(enemySkills('5013060').find((s) => s.skillId === '501306003')!.forceField).toMatchObject({
      element: 'Imaginary',
      attacks: 3,
    });
    expect(enemySkills('5013060').find((s) => s.skillId === '501306004')!.forceFieldSkill).toBe(true);
    expect(enemySkills('8003010').find((s) => s.skillId === '800301003')!.requiresFrostPoint).toBe(true);
    expect(enemySkills('1003010').find((s) => s.skillId === '100301003')!.counterStance!.skillId).toBe('100301002');
    expect(enemySkills('3003050').find((s) => s.skillId === '300305004')!.dotDetonateAll).toBe(true);
    expect(enemySkills('5014030').find((s) => s.skillId === '501403005')!.allyDot).toMatchObject({ kind: 'burn' });
  });

  it('AI 池：自身增益技（冰点/盾反）可被选中；【破晓意志】为阶段转换（不进池，首动强制）、退散不进池', () => {
    expect(enemyUsableSkills('5013060').map((s) => s.skillId)).toEqual([
      '501306001',
      '501306002',
      '501306004',
    ]);
    expect(enemyUsableSkills('5013060').some((s) => s.skillId === '501306003')).toBe(false);
    // 退散（无倍率、无自身增益）= 不进池（只由力场受击计数触发）
    expect(enemyUsableSkills('5013060').some((s) => s.skillId === '501306005')).toBe(false);
    // 冰：永冬之雨在池内，但 requiresFrostPoint 未满足时不选（见战斗用例）
    expect(enemyUsableSkills('8003010').map((s) => s.skillId)).toContain('800301003');
    expect(enemyUsableSkills('1003010').map((s) => s.skillId)).toContain('100301003');
  });
});

describe('【冰点】外宇宙之冰 8003010', () => {
  it('先汲取霜晶（冰点）→ 才施放永冬之雨（全体冰伤 + 冻结）', () => {
    const evs = run([mon('8003010', '上半')]);
    const frost = casts(evs, '800301002')[0];
    expect(frost).toBeDefined();
    expect(frost!.note).toContain('enemyFrostPoint');
    const rain = casts(evs, '800301003')[0];
    expect(rain).toBeDefined();
    expect(rain!.time ?? 0).toBeGreaterThan(frost!.time ?? 0);
    // 永冬之雨 = 全体 4 段，每段 = 基础命中
    expect(rain!.enemyHits!.length).toBe(4);
    for (const h of rain!.enemyHits!) expect(h.damage).toBeCloseTo(334.58, 2);
    expect(rain!.note).toContain('freeze');
    // 首次永冬之雨前不会出现该技能
    expect(casts(evs, '800301003')[0]!.time).toBeGreaterThan(casts(evs, '800301002')[0]!.time);
  });
});

describe('【破晓力场】5013060 / 5013040', () => {
  it('力场为阶段转换：首动必开力场；受击 3 次后放【破晓退散】并附加【失意】', () => {
    const evs = run([mon('5013060', '上半')], 8);
    const firstMonster = evs.find((e) => e.action === 'monster');
    expect(firstMonster?.skillCode).toBe('monster.501306003');
    expect(firstMonster!.note).toContain('enemyForceField');
    const fieldIdx = evs.indexOf(firstMonster!);
    const dispelIdx = evs.findIndex((e, i) => i > fieldIdx && e.skillCode === 'monster.501306005');
    expect(dispelIdx).toBeGreaterThan(fieldIdx);
    expect(evs[dispelIdx]!.note).toContain('enemyDispirited');
    // 力场窗口内若怪物出手，只能是【破晓剑影舞】（力场期间 AI 池只剩它）
    const between = evs.slice(fieldIdx + 1, dispelIdx).filter((e) => e.action === 'monster');
    for (const e of between) expect(e.skillCode).toBe('monster.501306004');
    // 退散由「受到 3 次攻击」触发 → 窗口内至少有 3 次我方行动
    const allyActions = evs
      .slice(fieldIdx + 1, dispelIdx)
      .filter((e) => e.kind === 'action' && ['basic', 'skill', 'ult'].includes(e.action ?? ''));
    expect(allyActions.length).toBeGreaterThanOrEqual(3);
  });

  it('苍翼同构（量子）：首动开力场 → 退散后附加【失意】', () => {
    const evs = run([mon('5013040', undefined, 0)], 8);
    const firstMonster = evs.find((e) => e.action === 'monster');
    expect(firstMonster?.skillCode).toBe('monster.501304003');
    expect(firstMonster!.note).toContain('enemyForceField');
    const dispel = casts(evs, '501304005')[0];
    expect(dispel).toBeDefined();
    expect(dispel!.note).toContain('enemyDispirited');
  });
});

describe('通用我方 DoT：风化 / 灼烧', () => {
  it('承露天人命中后挂【风化】，持有者行动开始时跳 dot.wind（= 基础命中）', () => {
    const evs = run([mon('2023030', '下半')], 5);
    const applied = evs.find((e) => (e.note ?? []).includes('allyWindShear'));
    expect(applied).toBeDefined();
    const tick = evs.find((e) => e.skillCode === 'dot.wind');
    expect(tick).toBeDefined();
    expect(tick!.action).toBe('dot');
    expect(tick!.enemyHits![0]!.skillId).toBe('dot.wind');
    expect(tick!.enemyHits![0]!.damage).toBeCloseTo(334.58, 2);
  });

  it('绘世命中后挂【怨火灼身】（灼烧 dot.burn）', () => {
    const evs = run([mon('5014030', undefined, 0)], 5);
    expect(evs.some((e) => (e.note ?? []).includes('allyBurn'))).toBe(true);
    const tick = evs.find((e) => e.skillCode === 'dot.burn');
    expect(tick).toBeDefined();
    expect(tick!.enemyHits![0]!.damage).toBeCloseTo(334.58, 2);
  });

  it('【为你洗去一切罪】把场上全部持续伤害立即结算一次并清除', () => {
    const evs = run([mon('2023030', '下半'), mon('3003050', undefined, 0)], 6);
    const det = evs.find((e) => (e.note ?? []).includes('allyDotDetonateAll'));
    expect(det).toBeDefined();
    expect(det!.skillCode).toBe('monster.300305004');
    // 同一次施放里对被挂 DoT 的成员各结算 1 次 dot.*（文案本身无伤害 → 非 dot 段伤害为 0）
    const dotHits = det!.enemyHits!.filter((h) => h.skillId.startsWith('dot.'));
    expect(dotHits.length).toBeGreaterThan(0);
    for (const h of dotHits) expect(h.damage).toBeGreaterThan(0);
  });
});

describe('【盾反】银鬃尉官 1003010', () => {
  it('进入反击状态后，受到我方单体攻击立即施放【穿刺】（含 monsterChargeRelease）', () => {
    const evs = run([mon('1003010', '下半')], 5);
    const stance = casts(evs, '100301003')[0];
    expect(stance).toBeDefined();
    expect(stance!.note).toContain('enemyCounterStance');
    const pierce = evs.find(
      (e, i) =>
        i > evs.indexOf(stance) &&
        e.skillCode === 'monster.100301002' &&
        (e.note ?? []).includes('monsterChargeRelease'),
    );
    expect(pierce).toBeDefined();
    expect(pierce!.enemyHits![0]!.damage).toBeCloseTo(334.58, 2);
  });
});
