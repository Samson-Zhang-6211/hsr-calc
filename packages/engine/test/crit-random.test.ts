import { describe, expect, it } from 'vitest';
import {
  critZone,
  simulateBattle,
  type BattleConfig,
  type CombatMember,
  type HitLog,
  type MemberPanel,
} from '../src/index.js';
import { critFactorOf, pickBranchByCrit } from './recon-branch.js';

/**
 * 真实暴击（2026-11-06 用户裁定）：`critMode:'random'` 每段独立掷骰。
 * 对账协议（用户确认）：实战是"一次实现"（暴击或未暴击），所以
 * **按暴击结果分组选分支**比对，而不是把随机样本混在一起拟合。
 */

const critOf = critFactorOf;

describe('critZone · random 模式', () => {
  it('掷骰结果只能是 1 或 1+CD，且概率≈暴率', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let crit = 0;
    const N = 10000;
    for (let i = 0; i < N; i += 1) {
      const v = critZone({ critRate: 0.7, critDmg: 1.5, mode: 'random', rand });
      expect(v === 2.5 || v === 1).toBe(true);
      if (v === 2.5) crit += 1;
    }
    expect(crit / N).toBeGreaterThan(0.67);
    expect(crit / N).toBeLessThan(0.73);
  });

  it('expected / crit / normal 三档保持解析值', () => {
    expect(critZone({ critRate: 0.5, critDmg: 1, mode: 'expected' })).toBeCloseTo(1.5, 10);
    expect(critZone({ critRate: 0.5, critDmg: 1, mode: 'crit' })).toBeCloseTo(2, 10);
    expect(critZone({ critRate: 0.5, critDmg: 1, mode: 'normal' })).toBe(1);
  });


});

const panel = (over: Partial<MemberPanel>): MemberPanel =>
  ({
    level: 80, speed: 100, attack: 1500, hp: 3000, defence: 800, element: 'Physical',
    critRate: 0.5, critDmg: 1.0, elationDegree: 0, damageBonus: 0, breakEffect: 0,
    effectHit: 0, effectRes: 0, damageReduction: 0, energyRegen: 0, ...over,
  }) as MemberPanel;

const member: CombatMember = {
  id: 'yaoguang',
  eidolonLevel: 0,
  panel: panel({ speed: 165, attack: 1886, critRate: 0.6, critDmg: 1.2, elationDegree: 0.3 }),
  skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
};

const MON = {
  level: 95, hp: 500_000_000, maxToughness: 9999, speed: 100,
  enemyClass: 'elite' as const, resistance: {}, weaknesses: [],
};

const runOnce = (seed: number, critMode: 'random' | 'expected') =>
  simulateBattle({
    members: [member], monsterWaves: [[MON]], techniques: false, rounds: 3,
    maxTime: 3000, seed, critMode,
  } as BattleConfig);

describe('真实暴击 · 对账分组协议', () => {
  it('同 seed 两跑完全一致（可复现）', () => {
    const a = runOnce(777, 'random');
    const b = runOnce(777, 'random');
    expect(a.hits.length).toBe(b.hits.length);
    expect(a.hits.reduce((s, h) => s + h.total, 0)).toBeCloseTo(
      b.hits.reduce((s, h) => s + h.total, 0),
      6,
    );
  });

  it('不同 seed 产生暴击/未暴击两类，且分组后组内恒定', () => {
    const samples: { hit: HitLog }[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = runOnce(seed, 'random');
      const first = r.hits[0];
      if (first) samples.push({ hit: first });
    }
    expect(samples.length).toBeGreaterThan(10);
    const crits = samples.filter((s) => critOf(s.hit) > 1.0001);
    const normals = samples.filter((s) => critOf(s.hit) <= 1.0001);
    expect(crits.length).toBeGreaterThan(0);
    expect(normals.length).toBeGreaterThan(0);
    // 组内恒定：所有暴击段同一个因子，所有未暴击段都是 1
    expect(new Set(crits.map((c) => critOf(c.hit))).size).toBe(1);
    for (const n of normals) expect(critOf(n.hit)).toBeCloseTo(1, 6);
    // 暴击组应整体高于未暴击组
    const avg = (xs: { hit: HitLog }[]) => xs.reduce((s, x) => s + x.hit.total, 0) / xs.length;
    expect(avg(crits)).toBeGreaterThan(avg(normals) * 2);
  });

  it('pickBranchByCrit 能选出与实测更贴近的分支', () => {
    const samples: { hit: HitLog }[] = [];
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = runOnce(seed, 'random');
      const first = r.hits[0];
      if (first) samples.push({ hit: first });
    }
    const critSample = samples.find((s) => critOf(s.hit) > 1.0001)!;
    const pick = pickBranchByCrit(samples, critSample.hit.total);
    expect(pick.branch).toBe('crit');
    expect(Math.abs(pick.deviation)).toBeLessThan(0.01);
  });
});

describe('期望口径 · 双列', () => {
  it('random 下存在 expectedTotal，expected 下不写', () => {
    const rnd = runOnce(2026, 'random');
    const withExp = rnd.hits.filter((h) => h.expectedTotal !== undefined);
    expect(withExp.length).toBeGreaterThan(0);
    const exp = runOnce(2026, 'expected');
    expect(exp.hits.filter((h) => h.expectedTotal !== undefined).length).toBe(0);
    expect(exp.report.expectedTotalDamage).toBeCloseTo(exp.report.totalDamage, 6);
  });
});
