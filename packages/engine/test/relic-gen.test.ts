import { describe, expect, it } from 'vitest';
import {
  allocateEffectiveRelicSubs,
  effectiveRollTarget,
  generateRelicSubstats,
  type RelicAffix,
} from '../src/relic-gen.js';

/** data/relic-affixes/sub.json rarity 5（三档 = base/+step/+2step，即表格局部第一列精确值） */
const RARITY5: RelicAffix[] = [
  { property: 'HPDelta', base: 33.87004, step: 4.233755 },
  { property: 'AttackDelta', base: 16.935019, step: 2.116877 },
  { property: 'DefenceDelta', base: 16.935019, step: 2.116877 },
  { property: 'HPAddedRatio', base: 0.034560002, step: 0.0043200003 },
  { property: 'AttackAddedRatio', base: 0.034560002, step: 0.0043200003 },
  { property: 'DefenceAddedRatio', base: 0.0432, step: 0.0054 },
  { property: 'SpeedDelta', base: 2, step: 0.3 },
  { property: 'CriticalChanceBase', base: 0.02592, step: 0.0032400002 },
  { property: 'CriticalDamageBase', base: 0.05184, step: 0.0064800004 },
  { property: 'BreakDamageAddedRatioBase', base: 0.05184, step: 0.0064800004 },
  { property: 'StatusProbabilityBase', base: 0.034560002, step: 0.0043200003 },
  { property: 'StatusResistanceBase', base: 0.034560002, step: 0.0043200003 },
];

/** 躯干部位：主词条暴击率 → 池排除 CR（调用方职责，11 条） */
const BODY_POOL = RARITY5.filter((a) => a.property !== 'CriticalChanceBase');

describe('遗器随机生成（新版方案）', () => {
  it('同 seed 同参数 → 同结果；seed 变化 → 结果不同', () => {
    const opts = { subPool: BODY_POOL, subCount: 4 as const, seed: 42 };
    const a = generateRelicSubstats(opts);
    const b = generateRelicSubstats(opts);
    expect(a).toEqual(b);
    const c = generateRelicSubstats({ ...opts, seed: 43 });
    expect(c).not.toEqual(a);
  });

  it('4 词条：初始 4 条 + 强化 5 次 = 9 roll，词条互异且全部在池内', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = generateRelicSubstats({ subPool: BODY_POOL, subCount: 4, seed });
      expect(r.subs).toHaveLength(4);
      expect(r.enhancementHits).toBe(5);
      expect(r.totalRolls).toBe(9);
      const props = r.subs.map((s) => s.property);
      expect(new Set(props).size).toBe(4);
      for (const p of props) {
        expect(BODY_POOL.some((a) => a.property === p)).toBe(true);
        expect(p).not.toBe('CriticalChanceBase');
      }
      let rollSum = 0;
      for (const s of r.subs) {
        expect(s.tiers[0]).toBeDefined(); // 初始档
        expect(s.rolls).toBe(s.tiers.length);
        expect(s.rolls).toBeGreaterThanOrEqual(1);
        expect(s.rolls).toBeLessThanOrEqual(6);
        for (const tier of s.tiers) {
          expect(tier).toBeGreaterThanOrEqual(0);
          expect(tier).toBeLessThanOrEqual(2);
        }
        // value = Σ(base + step×档)，精确浮点
        const affix = RARITY5.find((a) => a.property === s.property)!;
        const expected = s.tiers.reduce(
          (sum, t) => sum + affix.base + affix.step * t,
          0,
        );
        expect(s.value).toBeCloseTo(expected, 10);
        // 界于全低档与全高档之间
        expect(s.value).toBeGreaterThanOrEqual(s.rolls * affix.base - 1e-9);
        expect(s.value).toBeLessThanOrEqual(s.rolls * (affix.base + 2 * affix.step) + 1e-9);
        rollSum += s.rolls;
      }
      expect(rollSum).toBe(9);
    }
  });

  it('3 词条：初始 3 条 + 随机补第 4 条 + 强化 4 次 = 8 roll', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = generateRelicSubstats({ subPool: BODY_POOL, subCount: 3, seed });
      expect(r.subs).toHaveLength(4); // 成品恒 4 条
      expect(r.enhancementHits).toBe(4);
      expect(r.totalRolls).toBe(8);
      const props = r.subs.map((s) => s.property);
      expect(new Set(props).size).toBe(4);
      for (const s of r.subs) {
        expect(s.rolls).toBe(s.tiers.length);
        expect(s.rolls).toBeGreaterThanOrEqual(1);
      }
      expect(r.subs.reduce((sum, s) => sum + s.rolls, 0)).toBe(8);
    }
  });

  it('等概率：三档取值与强化目标分布（固定种子序列，确定性断言）', () => {
    const tierCounts = [0, 0, 0];
    const hitCounts = [0, 0, 0, 0];
    let totalRolls = 0;
    let totalHits = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const r = generateRelicSubstats({ subPool: BODY_POOL, subCount: 4, seed });
      for (let i = 0; i < r.subs.length; i++) {
        const s = r.subs[i];
        for (const t of s.tiers) tierCounts[t]++;
        hitCounts[i] += s.rolls - 1; // 该位置被强化命中的次数（初始不计）
        totalRolls += s.tiers.length;
      }
      totalHits += r.enhancementHits;
    }
    // 三档各约 1/3（1000 组 × 9 roll = 9000，3σ ≈ ±0.015，取宽容差）
    for (const c of tierCounts) {
      const ratio = c / totalRolls;
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.37);
    }
    // 4 条词条各约 1/4 被强化命中（5000 次命中）
    expect(totalHits).toBe(5000);
    for (const c of hitCounts) {
      const ratio = c / totalHits;
      expect(ratio).toBeGreaterThan(0.19);
      expect(ratio).toBeLessThan(0.31);
    }
  });

  it('三档都会实际出现（大样本覆盖 0/1/2）', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = generateRelicSubstats({ subPool: BODY_POOL, subCount: 3, seed });
      for (const s of r.subs) for (const t of s.tiers) seen.add(t);
    }
    expect(seen).toEqual(new Set([0, 1, 2]));
  });

  it('参数校验：subCount 非 3/4 或池不足 4 条 → 抛错', () => {
    expect(() =>
      generateRelicSubstats({
        subPool: BODY_POOL,
        subCount: 5 as unknown as 3,
        seed: 1,
      }),
    ).toThrow();
    expect(() =>
      generateRelicSubstats({ subPool: RARITY5.slice(0, 3), subCount: 4, seed: 1 }),
    ).toThrow();
  });
});

describe('按档分配有效词条（A/S/SS/SSS）', () => {
  const EFF2 = ['CriticalChanceBase', 'CriticalDamageBase'];
  const EFF3 = [...EFF2, 'SpeedDelta'];
  const EFF4 = [...EFF3, 'AttackAddedRatio'];

  /** 6 件池：主词条取非有效 property（不占用有效词条），第 i 件排除第 i 条非效 */
  const poolsWithout = (eff: readonly string[]): RelicAffix[][] => {
    const nonEff = RARITY5.filter((a) => !eff.includes(a.property));
    return Array.from({ length: 6 }, (_, i) =>
      RARITY5.filter((a) => a.property !== nonEff[i % nonEff.length].property),
    );
  };

  /** 3 件占用池（主词条取前 3 条有效，池中有效数 = N-1）+ 3 件不占用池 */
  const poolsWithOccupied = (eff: readonly string[]): RelicAffix[][] => {
    const nonEff = RARITY5.filter((a) => !eff.includes(a.property));
    return [
      ...eff.slice(0, 3).map((e) => RARITY5.filter((a) => a.property !== e)),
      ...Array.from({ length: 3 }, (_, i) =>
        RARITY5.filter((a) => a.property !== nonEff[i].property),
      ),
    ];
  };

  const countEffRolls = (piece: { property: string; rolls: number }[], eff: readonly string[]) =>
    piece.reduce((sum, s) => sum + (eff.includes(s.property) ? s.rolls : 0), 0);

  it('目标表：floor(满配×比例)，5+ 有效按 4 算、<2 抛错', () => {
    // 2 有效（满配 40）：24 / 28 / 32 / 36
    expect(effectiveRollTarget(2, 'A')).toBe(24);
    expect(effectiveRollTarget(2, 'S')).toBe(28);
    expect(effectiveRollTarget(2, 'SS')).toBe(32);
    expect(effectiveRollTarget(2, 'SSS')).toBe(36);
    // 3 有效（满配 46）：floor(27.6/32.2/36.8/41.4)
    expect(effectiveRollTarget(3, 'A')).toBe(27);
    expect(effectiveRollTarget(3, 'S')).toBe(32);
    expect(effectiveRollTarget(3, 'SS')).toBe(36);
    expect(effectiveRollTarget(3, 'SSS')).toBe(41);
    // 4 有效（满配 52）：floor(31.2/36.4/41.6/46.8)
    expect(effectiveRollTarget(4, 'A')).toBe(31);
    expect(effectiveRollTarget(4, 'S')).toBe(36);
    expect(effectiveRollTarget(4, 'SS')).toBe(41);
    expect(effectiveRollTarget(4, 'SSS')).toBe(46);
    // 5+ 有效按 4 算
    expect(effectiveRollTarget(5, 'SSS')).toBe(46);
    expect(effectiveRollTarget(99, 'A')).toBe(31);
    expect(() => effectiveRollTarget(1, 'A')).toThrow();
    expect(() => effectiveRollTarget(0, 'S')).toThrow();
  });

  it('各档×各有效数：actual 恒 = floor(满配×比例)，件结构合法，Σ有效 roll = target', () => {
    const cases: [number, string[]][] = [
      [2, EFF2],
      [3, EFF3],
      [4, EFF4],
    ];
    for (const [n, eff] of cases) {
      for (const tier of ['A', 'S', 'SS', 'SSS'] as const) {
        for (let seed = 1; seed <= 10; seed++) {
          const pools = poolsWithout(eff);
          const r = allocateEffectiveRelicSubs({
            subPools: pools,
            effective: eff,
            tier,
            seed,
          });
          expect(r.target).toBe(effectiveRollTarget(n, tier));
          expect(r.actual).toBe(r.target);
          expect(r.subCounts).toHaveLength(6);
          let effRolls = 0;
          for (let i = 0; i < 6; i++) {
            const subs = r.pieces[i];
            expect(subs).toHaveLength(4);
            expect(new Set(subs.map((s) => s.property)).size).toBe(4);
            const totalRolls = subs.reduce((sum, s) => sum + s.rolls, 0);
            expect(totalRolls).toBe(r.subCounts[i] === 3 ? 8 : 9);
            const d = subs.filter((s) => eff.includes(s.property)).length;
            expect(d).toBeLessThanOrEqual(Math.min(eff.length, 4));
            for (const s of subs) {
              expect(pools[i].some((a) => a.property === s.property)).toBe(true);
              expect(s.rolls).toBe(s.tiers.length);
              expect(s.rolls).toBeGreaterThanOrEqual(1);
              for (const t of s.tiers) {
                expect(t).toBeGreaterThanOrEqual(0);
                expect(t).toBeLessThanOrEqual(2);
              }
              const affix = pools[i].find((a) => a.property === s.property)!;
              const expected = s.tiers.reduce(
                (sum, t) => sum + affix.base + affix.step * t,
                0,
              );
              expect(s.value).toBeCloseTo(expected, 10);
            }
            effRolls += countEffRolls(subs, eff);
          }
          expect(effRolls).toBe(r.target);
        }
      }
    }
  });

  it('同种子整套复现；不同种子结果不同', () => {
    const opts = { subPools: poolsWithout(EFF4), effective: EFF4, tier: 'SSS' as const, seed: 7 };
    const a = allocateEffectiveRelicSubs(opts);
    const b = allocateEffectiveRelicSubs(opts);
    expect(a).toEqual(b);
    const c = allocateEffectiveRelicSubs({ ...opts, seed: 8 });
    expect(c).not.toEqual(a);
  });

  it('主词条占用有效词条的部位自然 -1，且可行性翻转下仍精确达成', () => {
    const pools = poolsWithOccupied(EFF4); // 3 件占用：池中有效 = 3
    let sawThreeOnly = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = allocateEffectiveRelicSubs({
        subPools: pools,
        effective: EFF4,
        tier: 'SSS',
        seed,
      });
      expect(r.actual).toBe(46);
      // 全 3 词条件时 Σ上限 = 3×7 + 3×8 = 45 < 46 → 必须被翻，不允许出现「全 3」
      if (r.subCounts.every((c) => c === 3)) sawThreeOnly++;
      expect(r.subCounts.every((c) => c === 3 || c === 4)).toBe(true);
      for (let i = 0; i < 3; i++) {
        // 占用件：有效 distinct ≤ 3（池中只剩 3 条有效）
        const d = r.pieces[i].filter((s) => EFF4.includes(s.property)).length;
        expect(d).toBeLessThanOrEqual(3);
      }
      expect(countEffRolls(r.pieces.flat(), EFF4)).toBe(46);
    }
    expect(sawThreeOnly).toBe(0);
  });

  it('参数校验：件数≠6 / 有效词条<2 / 池不足 4 条 → 抛错', () => {
    const pools = poolsWithout(EFF3);
    expect(() =>
      allocateEffectiveRelicSubs({ subPools: pools.slice(0, 5), effective: EFF3, tier: 'A', seed: 1 }),
    ).toThrow();
    expect(() =>
      allocateEffectiveRelicSubs({ subPools: pools, effective: ['SpeedDelta'], tier: 'A', seed: 1 }),
    ).toThrow();
    expect(() =>
      allocateEffectiveRelicSubs({
        subPools: pools.map((_, i) => (i === 0 ? RARITY5.slice(0, 3) : pools[i])),
        effective: EFF3,
        tier: 'A',
        seed: 1,
      }),
    ).toThrow();
  });
});

describe('分配权重与爆率额度（2026-10-08 裁定）', () => {
  const EFF2 = ['CriticalChanceBase', 'CriticalDamageBase'];
  const EFF3 = [...EFF2, 'SpeedDelta'];
  const EFF4 = [...EFF3, 'AttackAddedRatio'];

  const poolsWithout = (eff: readonly string[]): RelicAffix[][] => {
    const nonEff = RARITY5.filter((a) => !eff.includes(a.property));
    return Array.from({ length: 6 }, (_, i) =>
      RARITY5.filter((a) => a.property !== nonEff[i % nonEff.length].property),
    );
  };

  /** 景元 1204 批准权重（直伤模板：暴伤5/暴击3/攻击3/速度3） */
  const WEIGHTS = {
    CriticalDamageBase: 5,
    CriticalChanceBase: 3,
    AttackAddedRatio: 3,
    SpeedDelta: 3,
  };

  const rollsByProp = (r: { pieces: { property: string; rolls: number }[][] }) => {
    const acc: Record<string, number> = {};
    for (const s of r.pieces.flat()) acc[s.property] = (acc[s.property] ?? 0) + s.rolls;
    return acc;
  };

  it('权重偏置方向：高权重词条吃掉更多 roll（30 seed 汇总）', () => {
    const plainAcc: Record<string, number> = {};
    const weightAcc: Record<string, number> = {};
    for (let seed = 1; seed <= 30; seed++) {
      const base = { subPools: poolsWithout(EFF4), effective: EFF4, tier: 'SSS' as const, seed };
      for (const [acc, extra] of [
        [plainAcc, {}],
        [weightAcc, { weights: WEIGHTS }],
      ] as const) {
        const r = allocateEffectiveRelicSubs({ ...base, ...extra });
        for (const [k, v] of Object.entries(rollsByProp(r))) acc[k] = (acc[k] ?? 0) + v;
      }
    }
    // 加权：cd(权重5) > cr(3)；且 cd 明显高于不加权基线（吃掉 atk/spd 的份额）
    expect(weightAcc.CriticalDamageBase).toBeGreaterThan(weightAcc.CriticalChanceBase);
    expect(weightAcc.CriticalDamageBase).toBeGreaterThan(weightAcc.AttackAddedRatio);
    expect(weightAcc.CriticalDamageBase).toBeGreaterThan(plainAcc.CriticalDamageBase);
    // 不加权：有效四条接近均分（样本波动容差）
    expect(Math.abs(plainAcc.AttackAddedRatio - plainAcc.CriticalDamageBase)).toBeLessThan(40);
    // 有效词条总量不变：加权只改份额不改 target
    const total = (acc: Record<string, number>, keys: string[]) =>
      keys.reduce((s, k) => s + (acc[k] ?? 0), 0);
    expect(total(weightAcc, EFF4)).toBe(total(plainAcc, EFF4));
  });

  it('权重只换分布不破不变式：10 seed 下 actual=target、结构合法、同 seed 复现', () => {
    const opts = {
      subPools: poolsWithout(EFF4),
      effective: EFF4,
      tier: 'SSS' as const,
      weights: WEIGHTS,
    };
    expect(allocateEffectiveRelicSubs({ ...opts, seed: 3 })).toEqual(
      allocateEffectiveRelicSubs({ ...opts, seed: 3 }),
    );
    expect(allocateEffectiveRelicSubs({ ...opts, seed: 3 })).not.toEqual(
      allocateEffectiveRelicSubs({ ...opts, seed: 4 }),
    );
    for (let seed = 1; seed <= 10; seed++) {
      const r = allocateEffectiveRelicSubs({ ...opts, seed });
      expect(r.actual).toBe(r.target);
      expect(r.critValue).toBeUndefined(); // 未传 critCap 不给 critValue
      expect(r.attempts).toBeUndefined();
      expect(r.pieces.flat().reduce((s, x) => s + x.rolls, 0)).toBeGreaterThanOrEqual(46);
    }
  });

  it('爆率额度截断：maxRolls=5 时全套 crit roll ≤5 且让位后 actual 仍逼近 target', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = allocateEffectiveRelicSubs({
        subPools: poolsWithout(EFF4),
        effective: EFF4,
        tier: 'SSS',
        seed,
        weights: WEIGHTS,
        critCap: { property: 'CriticalChanceBase', maxRolls: 5, minValue: 0 },
      });
      const critRolls = r.pieces
        .flat()
        .filter((s) => s.property === 'CriticalChanceBase')
        .reduce((sum, s) => sum + s.rolls, 0);
      expect(critRolls).toBeLessThanOrEqual(5);
      expect(r.critValue).toBeGreaterThanOrEqual(0);
      expect(r.attempts).toBe(1);
      expect(r.critWarning).toBe(false);
      // 出局让位：缺口回填后仍应接近目标（实测 9/10 = 46，1 例 45）
      expect(r.actual).toBeGreaterThanOrEqual(45);
    }
  });

  it('maxRolls=0（如彦卿爆率上限 0）：crit 完全不出现且 actual=target', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const r = allocateEffectiveRelicSubs({
        subPools: poolsWithout(EFF4),
        effective: EFF4,
        tier: 'SSS',
        seed,
        weights: WEIGHTS,
        critCap: { property: 'CriticalChanceBase', maxRolls: 0, minValue: 0 },
      });
      const critRolls = r.pieces
        .flat()
        .filter((s) => s.property === 'CriticalChanceBase')
        .reduce((sum, s) => sum + s.rolls, 0);
      expect(critRolls).toBe(0);
      expect(r.critValue).toBe(0);
      expect(r.actual).toBe(r.target);
      expect(r.target).toBe(46);
      expect(r.attempts).toBe(1);
      expect(r.critWarning).toBe(false);
    }
  });

  it('60% 贡献值检查：minValue=0.35 第 3 次达标（seed=7 序列锚点）', () => {
    const opts = {
      subPools: poolsWithout(EFF4),
      effective: EFF4,
      tier: 'SSS' as const,
      seed: 7,
      weights: WEIGHTS,
      critCap: { property: 'CriticalChanceBase', maxRolls: 27, minValue: 0.35 },
    };
    const r = allocateEffectiveRelicSubs(opts);
    expect(r.attempts).toBe(3); // 前 2 次 <0.35，第 3 次（seed=9）达标
    expect(r.critWarning).toBe(false);
    expect(r.critValue).toBeCloseTo(0.359640003, 10);
    // 同 seed 同结果（seed+尝试次数递推仍确定）
    expect(allocateEffectiveRelicSubs(opts)).toEqual(r);
  });

  it('60% 检查不可能达标（minValue 超理论上限）：50 次后标警告', () => {
    const r = allocateEffectiveRelicSubs({
      subPools: poolsWithout(EFF4),
      effective: EFF4,
      tier: 'SSS',
      seed: 7,
      weights: WEIGHTS,
      // 理论上限 = 27 roll × 最坏档 0.0324 = 0.8748 < 0.9
      critCap: { property: 'CriticalChanceBase', maxRolls: 27, minValue: 0.9 },
    });
    expect(r.attempts).toBe(50);
    expect(r.critWarning).toBe(true);
    expect(r.critValue).toBeLessThan(0.9);
  });

  it('组合 weights+critCap 高额度：30 seed 恒 actual=target、一次达标', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = allocateEffectiveRelicSubs({
        subPools: poolsWithout(EFF4),
        effective: EFF4,
        tier: 'SSS',
        seed,
        weights: WEIGHTS,
        critCap: { property: 'CriticalChanceBase', maxRolls: 27, minValue: 0 },
      });
      expect(r.actual).toBe(r.target);
      expect(r.attempts).toBe(1);
      expect(r.critWarning).toBe(false);
      expect(r.critValue).toBeGreaterThan(0);
    }
  });

  it('参数校验：critCap 负值 → 抛错', () => {
    const pools = poolsWithout(EFF4);
    expect(() =>
      allocateEffectiveRelicSubs({
        subPools: pools,
        effective: EFF4,
        tier: 'A',
        seed: 1,
        critCap: { property: 'CriticalChanceBase', maxRolls: -1, minValue: 0 },
      }),
    ).toThrow();
    expect(() =>
      allocateEffectiveRelicSubs({
        subPools: pools,
        effective: EFF4,
        tier: 'A',
        seed: 1,
        critCap: { property: 'CriticalChanceBase', maxRolls: 5, minValue: -0.1 },
      }),
    ).toThrow();
  });
});
