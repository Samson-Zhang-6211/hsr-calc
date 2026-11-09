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

// ── 异相仲裁 P10「落叶归根」第五批 6 只（2026-10-30）──
// 数据源：data/monster-stages/arb-p10.json（index 1 王棋 / 3 骑士三 / 4 骑士二 / 5 骑士一）
// 本轮新增框架：计数状态（我方攻击 −N / 敌方攻击 +N）、收束（counterZero）、
// 【弱点无效】、【鼓舞】（敌方全体按层数减伤）、【监视目标】（retargetMark）、标记消耗（consumeMark）。
// 锚点来自 zz-arb-dump 实测（基础命中 334.58 = 625.5117 × 0.5349，Lv95 打 Lv80）。

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

function cfgOf(index: number, monsterId: string): MonsterConfig {
  for (const wave of buildPackStageWaves('arb-p10', index)) {
    for (const c of wave) if (c.monsterId === monsterId) return { ...c, hp: Math.min(c.hp, 3e7) };
  }
  throw new Error(`missing ${monsterId}`);
}

function run(mon: MonsterConfig, rounds = 8) {
  return simulateBattle({
    members: members(),
    monsterWaves: [[mon]],
    techniques: false,
    rounds,
    maxTime: 3000,
    roundMode: 'arbiter',
  });
}
const evs = (mon: MonsterConfig, rounds = 8): CombatEvent[] => run(mon, rounds).events;
const hitNotes = (mon: MonsterConfig, rounds = 8): string[] =>
  run(mon, rounds)
    .hits.map((h) => h.note)
    .filter((n): n is string => typeof n === 'string');

describe('仲裁 P10 · 技能表', () => {
  it('6 只全部登记，AI 池包含自身增益 / 蓄力技', () => {
    expect(enemySkills('5013050').map((s) => s.skillId)).toEqual([
      '501305001',
      '501305002',
      '501305003',
      '501305004',
      '501305005',
    ]);
    expect(enemySkills('5013070')).toHaveLength(5);
    expect(enemySkills('2023020')).toHaveLength(3);
    expect(enemySkills('5023010')).toHaveLength(4);
    expect(enemySkills('8033020')).toHaveLength(4);
    expect(enemySkills('5014020')).toHaveLength(6);
    // 力场（阶段转换）不进池；剑影舞进池
    expect(enemyUsableSkills('5013050').map((s) => s.skillId)).toEqual([
      '501305001',
      '501305002',
      '501305004',
    ]);
    expect(enemySkills('8033020').find((s) => s.skillId === '803302002')!.allyAttackCounter).toMatchObject({
      status: 'wish',
      delta: 1,
    });
    expect(enemySkills('5014020').find((s) => s.skillId === '501402002')!.counterZero!.selfDamageRatio).toBe(0.2);
    expect(enemyUsableSkills('2023020')).toHaveLength(3);
    expect(enemyUsableSkills('5014020')).toHaveLength(6);
  });
});

describe('破晓战队•赤焰 5013050 / 灰烬 5013070（火 / 物理形态）', () => {
  it('首动开【破晓力场】，受击 3 次后【破晓退散】+【失意】', () => {
    for (const [id, hit] of [
      ['5013050', 334.58],
      ['5013070', 334.58],
    ] as const) {
      const e = evs(cfgOf(4, id), 8);
      const first = e.find((x) => x.action === 'monster');
      expect(first!.skillCode).toBe(`monster.${id}03`);
      expect(first!.note).toContain('enemyForceField');
      const dispel = e.find((x) => x.skillCode === `monster.${id}05`);
      expect(dispel).toBeDefined();
      expect(dispel!.note).toContain('enemyDispirited');
      // 剑影舞/战刃等单体命中 = 基础防御区
      const dmg = e.find((x) => x.skillCode === `monster.${id}01`)!.enemyHits![0]!.damage;
      expect(dmg).toBeCloseTo(hit, 2);
    }
  });
});

describe('丰饶灵兽•长右 2023020：【元气】与【监视目标】', () => {
  it('怒啸：+3 层【元气】并标记随机我方；我方施放战技后改标最新施放者；猱击消耗 1 层', () => {
    const e = evs(cfgOf(3, '2023020'), 6);
    const rage = e.find((x) => x.skillCode === 'monster.202302003');
    expect(rage).toBeDefined();
    expect(rage!.note).toContain('allyWatchTarget');
    expect(rage!.note).toContain('enemyRetarget');
    // 我方战技结算后「改为标记最新施放者」
    const skillEv = e.find((x) => x.action === 'skill' && (x.note ?? []).includes('allyWatchTarget'));
    expect(skillEv).toBeDefined();
    // 猱击消耗【元气】
    const claw = e.find((x) => x.skillCode === 'monster.202302001');
    expect(claw).toBeDefined();
    expect(claw!.note).toContain('enemyStateDown');
    expect(claw!.enemyHits![0]!.damage).toBeCloseTo(334.58, 2);
  });
});

describe('乐变化天人 5023010：【极乐】与【极乐螺旋】', () => {
  it('微笑挂【极乐】；笑蕾蓄力 → 极乐螺旋移除标记 → 行动延后 + 少 1 战技点', () => {
    const r = run(cfgOf(5, '5023010'), 12);
    const e = r.events;
    const smile = e.find((x) => x.skillCode === 'monster.502301002');
    expect(smile).toBeDefined();
    expect(smile!.note).toContain('allyElysium');
    expect(smile!.enemyHits!.length).toBe(3);
    // 第一次极乐螺旋时场上还没有【极乐】；挂了标记之后的螺旋才会移除
    const spirals = e.filter((x) => x.skillCode === 'monster.502301004');
    expect(spirals.length).toBeGreaterThan(0);
    const spiral = spirals.find((x) => (x.note ?? []).includes('allyMarkConsumed'));
    expect(spiral).toBeDefined();
    expect(spiral!.note).toContain('monsterChargeRelease');
    // 少 1 战技点（0 下限）
    const before = e.filter((x) => (x.spAfter ?? 0) > 0 && (x.time ?? 0) < (spiral!.time ?? 0)).pop();
    expect(before!.spAfter! - spiral!.spAfter!).toBeGreaterThanOrEqual(1);
  });
});

describe('「灯塔」8033020：【众愿】/【弱点无效】/【鼓舞】/【失堕】', () => {
  it('不屈正义：获得【众愿】+【弱点无效】+ 蓄力；我方攻击递减；层数归零触发收束（失堕）', () => {
    const r = run(cfgOf(1, '8033020'), 8);
    const e = r.events;
    const justice = e.find((x) => x.skillCode === 'monster.803302002');
    expect(justice).toBeDefined();
    expect(justice!.note).toContain('enemyStateUp');
    expect(justice!.note).toContain('enemyWeaknessInvalid');
    expect(justice!.note).toContain('monsterCharge');
    const doom = e.find((x) => x.skillCode === 'monster.803302003');
    expect(doom).toBeDefined();
    expect(doom!.note).toContain('monsterDelayAllies');
    // 我方的命中会递减【众愿】，归零后落到【失堕】标记
    const notes = hitNotes(cfgOf(1, '8033020'), 8);
    expect(notes.some((n) => n === 'enemyCounterDown')).toBe(true);
    expect(notes.some((n) => n === 'allyDespair')).toBe(true);
    // 层数归零 → 立即行动延后（同一时刻不再紧接行动）
    expect(e.length).toBeGreaterThan(10);
  });
});

describe('合金机铠•帕姆王 5014020：【弱点无效】与【长效抗菌】', () => {
  it('值日准备中…：获得【弱点无效】+ 蓄力；高温消毒：我方攻击递减层数，清空时自伤', () => {
    const r = run(cfgOf(5, '5014020'), 8);
    const e = r.events;
    const prep = e.find((x) => x.skillCode === 'monster.501402005');
    expect(prep).toBeDefined();
    expect(prep!.note).toContain('enemyWeaknessInvalid');
    expect(prep!.note).toContain('monsterCharge');
    const clean = e.find((x) => x.skillCode === 'monster.501402006');
    expect(clean).toBeDefined();
    expect(clean!.note).toContain('monsterChargeRelease');
    const notes = hitNotes(cfgOf(5, '5014020'), 8);
    expect(notes.some((n) => n === 'enemyCounterDown')).toBe(true);
    expect(notes.some((n) => n === 'enemySelfDamage')).toBe(true);
  });
});
