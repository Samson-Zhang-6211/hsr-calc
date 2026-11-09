import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  enemySkills,
  enemyUsableSkills,
  simulateBattle,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 虚构叙事 P27「取象为文」星启 6 只 + 合金保姆（2026-10-30 第八批）──
// 数据源：data/monster-stages/pure-p27.json（index 0 = 星启）
// 本轮新增框架：【掩护支援】追加攻击、支援友方怪增益、【震荡】两段式、【裂伤】DoT。
// 锚点：基础命中 311.19（= 607.5529 × 0.5121，Lv85 打 Lv80）；授勋 +10% 攻后 342.30（= 311.19 × 1.1）。

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

function cfgOf(monsterId: string): MonsterConfig {
  for (const idx of [0, 4]) {
    for (const wave of buildPackStageWaves('pure-p27', idx)) {
      const hit = wave.find((c) => c.monsterId === monsterId);
      if (hit) return { ...hit, hp: Math.min(hit.hp, 3e7) };
    }
  }
  throw new Error(`missing ${monsterId}`);
}

function run(mon: MonsterConfig, rounds = 8) {
  return simulateBattle({
    members: members(),
    monsterWaves: [[mon]],
    techniques: false,
    rounds,
    maxTime: 4000,
    roundMode: 'phantom',
  });
}

function runWave(ids: string[], rounds = 8) {
  return simulateBattle({
    members: members(),
    monsterWaves: [ids.map((id) => cfgOf(id))],
    techniques: false,
    rounds,
    maxTime: 4000,
    roundMode: 'phantom',
  });
}

describe('P27 星启 · 技能表 7 只', () => {
  it('登记与 AI 池', () => {
    expect(enemySkills('5012120').map((s) => s.skillId)).toEqual([
      '501212001',
      '501212002',
      '501212003',
    ]);
    expect(enemySkills('1002030')).toHaveLength(2);
    expect(enemySkills('1002050')).toHaveLength(1);
    expect(enemySkills('2002030')).toHaveLength(1);
    expect(enemySkills('3024010')).toHaveLength(5);
    expect(enemySkills('3021020')).toHaveLength(2);
    expect(enemySkills('3021040')).toHaveLength(2);
    // 【掩护支援】/【授勋】/【盾】都能被 AI 选中（非 passive）
    expect(enemyUsableSkills('1002030').map((s) => s.skillId)).toEqual(['100203001', '100203002']);
    expect(enemyUsableSkills('3021020')).toHaveLength(1);
    expect(enemyUsableSkills('3021040')).toHaveLength(1);
    expect(enemySkills('1002030').find((s) => s.skillId === '100203002')!.supportFollowUp).toMatchObject({
      multiplier: 1,
    });
  });
});

describe('合金保姆 5012120 / 银鬃射手 1002050', () => {
  it('泼脏水挂防御降低标记；破甲榴弹挂【裂伤】并按同一套我方 DoT 结算', () => {
    const nanny = run(cfgOf('5012120'), 8);
    expect(nanny.events.some((e) => (e.note ?? []).includes('allyDefDown'))).toBe(true);
    const shooter = run(cfgOf('1002050'), 8);
    expect(shooter.events.some((e) => (e.note ?? []).includes('allyBleed'))).toBe(true);
    const bleed = shooter.events.find((e) => e.skillCode === 'dot.bleed');
    expect(bleed).toBeDefined();
    expect(bleed!.enemyHits![0]!.damage).toBeCloseTo(311.19, 2);
  });
});

describe('幽府武弁 2002030：【震荡】两段式', () => {
  it('先挂【震荡】，再次被命中转【强烈震荡】并跳过行动', () => {
    const r = run(cfgOf('2002030'), 8);
    const notes = r.events.flatMap((e) => e.note ?? []);
    expect(notes).toContain('allyStagger');
    expect(notes).toContain('allyStaggerBreak');
    // 强烈震荡 = 复用禁锢的「跳过行动」口径
    expect(notes).toContain('allyImprison');
    expect(r.events.some((e) => e.action === 'skip')).toBe(true);
  });
});

describe('【掩护支援】与友方支援怪', () => {
  it('银鬃炮手在其他敌方攻击后追加 1 次攻击（skillId = enemy.support）', () => {
    const r = runWave(['3024010', '1002030', '3021020'], 8);
    const sup = r.events.filter((e) => (e.note ?? []).includes('enemySupportFollowUp'));
    expect(sup.length).toBeGreaterThan(0);
    expect(sup[0]!.enemyHits!.some((h) => h.skillId === 'enemy.support')).toBe(true);
  });

  it('授勋为银枝叠 +10% 攻（同一次攻击 311.19 → 342.30）；盾/授勋都会留下支援事件', () => {
    const r = runWave(['3024010', '1002030', '3021020'], 8);
    const supportNotes = r.events.filter((e) => (e.note ?? []).includes('enemySideSupport'));
    expect(supportNotes.length).toBeGreaterThan(0);
    const buffed = r.events
      .filter((e) => e.skillCode === 'monster.302401005')
      .flatMap((e) => e.enemyHits ?? []);
    expect(buffed.length).toBeGreaterThan(0);
    // 第一次赞歌未吃授勋（311.19），之后吃 +10%（342.30）
    const values = [...new Set(buffed.map((h) => Math.round(h.damage * 100) / 100))];
    expect(values).toContain(311.19);
    expect(values).toContain(342.3);
  });
});
