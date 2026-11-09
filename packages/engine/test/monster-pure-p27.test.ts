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

// ── 虚构叙事 P27「取象为文」其四 第七批 8 只（2026-10-30）──
// 数据源：data/monster-stages/pure-p27.json（index 4 = 其四）
// 本轮新增框架：【战甲】（层数/受击递减/破坏自伤+延后+回能/回合结束恢复）、敌方全体回血、副【风行】。
// 锚点：基础命中 311.19（= 607.5529 × 0.5121，Lv85 打 Lv80）；分摊后 77.80（÷4）。

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

function cfgOf(monsterId: string, stageIdx = 4): MonsterConfig {
  for (const wave of buildPackStageWaves('pure-p27', stageIdx)) {
    const hit = wave.find((c) => c.monsterId === monsterId);
    if (hit) return { ...hit, hp: Math.min(hit.hp, 3e7) };
  }
  throw new Error(`missing ${monsterId}`);
}

function run(mon: MonsterConfig, rounds = 10) {
  return simulateBattle({
    members: members(),
    monsterWaves: [[mon]],
    techniques: false,
    rounds,
    maxTime: 4000,
    roundMode: 'phantom',
  });
}
const evs = (mon: MonsterConfig, rounds = 10): CombatEvent[] => run(mon, rounds).events;

describe('P27 其四 · 技能表 12 只', () => {
  it('登记与 AI 池', () => {
    expect(enemySkills('4012010').map((s) => s.skillId)).toEqual(['401201001', '401201002']);
    expect(enemySkills('4013010')).toHaveLength(6);
    expect(enemySkills('5012110')).toHaveLength(2);
    expect(enemySkills('8003060')).toHaveLength(1);
    expect(enemySkills('2022040')).toHaveLength(2);
    expect(enemySkills('1012010')).toHaveLength(2);
    expect(enemySkills('4032030')).toHaveLength(3);
    expect(enemySkills('4032024')).toHaveLength(3);
    expect(enemySkills('2022050')).toHaveLength(2);
    expect(enemySkills('8022010')).toHaveLength(3);
    expect(enemySkills('2002010')).toHaveLength(1);
    expect(enemySkills('5014023')).toHaveLength(7);
    // 【战甲】是被动（不进池）；自愈模块 / 风行可被选中
    expect(enemySkills('4012010').find((s) => s.skillId === '401201002')!.armor).toMatchObject({ stacks: 3 });
    expect(enemyUsableSkills('4012010')).toHaveLength(1);
    expect(enemyUsableSkills('1012010').map((s) => s.skillId)).toEqual(['101201001', '101201002']);
    expect(enemySkills('4022010').find((s) => s.skillId === '402201002')!.windWalk).toMatchObject({ turns: 1 });
    // 分摊技
    expect(enemySkills('4032030').find((s) => s.skillId === '403203002')!.splitAmongAllies).toBe(true);
    expect(enemySkills('4013010').find((s) => s.skillId === '401301004')!.splitAmongAllies).toBe(true);
  });
});

describe('【战甲】城邦守护者 4012010 / 4013010', () => {
  it('受击递减 → 破坏（自伤 + 破坏后受击额外伤害）→ 自身回合结束恢复', () => {
    for (const [id, stacks] of [
      ['4012010', 3],
      ['4013010', 5],
    ] as const) {
      const mon = { ...cfgOf(id), hp: 3e7 };
      const r = run(mon, 10);
      const notes = r.hits.map((h) => h.note).filter((n): n is string => typeof n === 'string');
      expect(notes.filter((n) => n === 'enemyArmorDown').length).toBeGreaterThanOrEqual(stacks);
      expect(notes).toContain('enemyArmorBreak');
      expect(notes).toContain('enemyArmorBrokenHit');
      // 破坏后回合结束恢复：后续还能再掉层
      expect(notes.filter((n) => n === 'enemyArmorDown').length).toBeGreaterThan(stacks);
    }
  });

  it('天谴先锋：横扫 3 个连续目标；蓄力 → 沉溺（全体分摊 77.80）', () => {
    const mon = cfgOf('4013010');
    const e = evs(mon, 10);
    const sweep = e.find((x) => x.skillCode === 'monster.401301001');
    expect(sweep).toBeDefined();
    expect(sweep!.enemyHits!.length).toBe(3);
    for (const h of sweep!.enemyHits!) expect(h.damage).toBeCloseTo(311.19, 2);
    const charge = e.find((x) => x.skillCode === 'monster.401301003');
    expect(charge).toBeDefined();
    expect(charge!.note).toContain('monsterCharge');
    const sink = e.find((x) => x.skillCode === 'monster.401301004');
    expect(sink).toBeDefined();
    expect(sink!.note).toContain('monsterChargeRelease');
    expect(sink!.enemyHits!.length).toBe(4);
    for (const h of sink!.enemyHits!) expect(h.damage).toBeCloseTo(77.8, 2);
  });
});

describe('敌方回血 / DoT / 分摊', () => {
  it('自动机兵•战犬 自愈模块：回复敌方全体（事件 enemySideHeal）', () => {
    const e = evs(cfgOf('1012010'), 10);
    const heal = e.find((x) => x.skillCode === 'monster.101201002');
    expect(heal).toBeDefined();
    expect(heal!.note).toContain('enemySideHeal');
    expect(heal!.enemyHits?.length ?? 0).toBe(0);
  });

  it('黑潮蚀斧：单体 311.19 / 全体分摊 77.80', () => {
    const e = evs(cfgOf('4032030'), 10);
    const single = e.find((x) => x.skillCode === 'monster.403203001');
    expect(single!.enemyHits![0]!.damage).toBeCloseTo(311.19, 2);
    const aoe = e.find((x) => x.skillCode === 'monster.403203002');
    expect(aoe!.enemyHits!.length).toBe(4);
    for (const h of aoe!.enemyHits!) expect(h.damage).toBeCloseTo(77.8, 2);
  });

  it('奎木【狼餐】挂触电、幼蛰虫【振翅】挂风化（同一套我方 DoT 框架）', () => {
    const shock = evs(cfgOf('2022050'), 8);
    expect(shock.some((x) => (x.note ?? []).includes('allyShock'))).toBe(true);
    expect(shock.some((x) => x.skillCode === 'dot.shock')).toBe(true);
    const wind = evs(cfgOf('8022010'), 8);
    expect(wind.some((x) => (x.note ?? []).includes('allyWindShear'))).toBe(true);
    expect(wind.some((x) => x.skillCode === 'dot.wind')).toBe(true);
  });
});

describe('合金机铠•帕姆王 5014023（其四异档）', () => {
  it('值日准备中…→【弱点无效】；高温消毒→【长效抗菌】递减至清空自伤', () => {
    const r = run(cfgOf('5014023'), 8);
    const prep = r.events.find((x) => x.skillCode === 'monster.501402305');
    expect(prep).toBeDefined();
    expect(prep!.note).toContain('enemyWeaknessInvalid');
    const clean = r.events.find((x) => x.skillCode === 'monster.501402302');
    expect(clean).toBeDefined();
    const notes = r.hits.map((h) => h.note).filter((n): n is string => typeof n === 'string');
    expect(notes).toContain('enemyCounterDown');
    expect(notes).toContain('enemySelfDamage');
  });
});
