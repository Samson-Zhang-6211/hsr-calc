import { describe, expect, it } from 'vitest';
import {
  computeBreakDot,
  computeBreakTrigger,
  computeDirectDamage,
  computeDotDamage,
  computeElation,
  computeSuperBreak,
  computeTrueDamage,
  laughZone,
  toughnessCoeff,
  type CommonZonesInput,
  type ElationMode,
} from '../src/index.js';

const neutral: CommonZonesInput = {
  attackerLevel: 80,
  enemyLevel: 80,
  defReduction: 0,
  defIgnore: 0,
  resistance: 0,
  resReduction: 0,
  resPenetration: 0,
  vulnerability: 0,
  damageReductions: [],
  toughness: 'broken',
};

function total(factors: readonly { key: string; value: number }[]): number {
  return factors.reduce((acc, f) => acc * f.value, 1);
}

describe('直伤', () => {
  it('基础×增伤×暴击×公共乘区，结果可由因子连乘还原', () => {
    const r = computeDirectDamage({
      statValue: 2000,
      multiplier: 1.5,
      damageBonus: 0.5,
      critRate: 0.6,
      critDmg: 1.2,
      common: { ...neutral, vulnerability: 0.2, resistance: 0.2 },
    });
    const expected =
      2000 * 1.5 * 1.5 * (1 + 0.6 * 1.2) * 1.2 * 0.8 * 0.5 * 1 * 1;
    expect(r.total).toBeCloseTo(expected, 8);
    expect(total([...r.factors])).toBeCloseTo(r.total, 12);
  });

  it('不暴击模式暴击区为 1', () => {
    const r = computeDirectDamage({
      statValue: 1000,
      multiplier: 1,
      damageBonus: 0,
      critRate: 1,
      critDmg: 2,
      critMode: 'normal',
      common: neutral,
    });
    expect(r.total).toBeCloseTo(1000 * 0.5, 12);
  });
});

describe('普通 DoT', () => {
  it('吃增伤不吃暴击', () => {
    const r = computeDotDamage({
      statValue: 1000,
      multiplier: 0.8,
      damageBonus: 0.3,
      common: neutral,
    });
    expect(r.total).toBeCloseTo(1000 * 0.8 * 1.3 * 0.5, 12);
    expect(r.factors.some((f) => f.key === 'crit')).toBe(false);
  });
});

describe('击破触发伤害', () => {
  it('米游社公式代入案例：30 级 231 基数雷击破 T=2（60 点）打 26 级 = 108.28125', () => {
    // 原文写 108.18125，按其自身公式 231×1×(2+2)/4×500/960×0.9 代入实为 108.28125（原文算术笔误，
    // 同文量子/触电两例代入均精确吻合），此处按公式计算值断言。
    const r = computeBreakTrigger({
      breakBase: 231,
      element: 'Thunder',
      toughnessPoints: 60,
      breakEffect: 0,
      breakDmgBoost: 0,
      breakVuln: 0,
      common: {
        ...neutral,
        attackerLevel: 30,
        enemyLevel: 26,
        toughness: 'unbroken',
      },
    });
    expect(r.total).toBeCloseTo(231 * 1 * 1 * (500 / 960) * 0.9, 6);
    expect(r.total).toBeCloseTo(108.28125, 6);
  });

  it('属性系数：物理/火 2，风 1.5，量子/虚数 0.5', () => {
    const base = {
      breakBase: 1000,
      toughnessPoints: 60,
      breakEffect: 0,
      breakDmgBoost: 0,
      breakVuln: 0,
      common: neutral,
    };
    const phys = computeBreakTrigger({ ...base, element: 'Physical' });
    const quantum = computeBreakTrigger({ ...base, element: 'Quantum' });
    expect(phys.total / quantum.total).toBeCloseTo(4, 12);
    expect(phys.total).toBeCloseTo(1000 * 2 * 1 * 0.5, 8);
  });

  it('韧性系数 = (点数÷30+2)÷4', () => {
    expect(toughnessCoeff(60)).toBeCloseTo(1, 12);
    expect(toughnessCoeff(300)).toBeCloseTo(3, 12);
    expect(toughnessCoeff(30)).toBeCloseTo(0.75, 12);
  });
});

describe('击破持续伤害', () => {
  it('击破 DoT：雷触电 231×2 打 26 级首跳 = 240.625（首跳不吃韧性减伤，触电无韧性系数）', () => {
    const r = computeBreakDot({
      breakBase: 231,
      dotType: 'shock',
      stacks: 1,
      breakEffect: 0,
      breakDmgBoost: 0,
      breakVuln: 0,
      toughnessPoints: 60,
      enemyMaxHp: 1000,
      enemyClass: 'normal',
      common: {
        ...neutral,
        attackerLevel: 30,
        enemyLevel: 26,
        toughness: 'notApplied',
      },
    });
    expect(r.total).toBeCloseTo(240.625, 6);
  });

  it('击破 DoT：量子纠缠 5 层 300 点韧性（系数=3）打 29 级 = 1050', () => {
    // 韧性系数 = (300÷30+2)÷4 = 3
    const r = computeBreakDot({
      breakBase: 231,
      dotType: 'entanglement',
      stacks: 5,
      breakEffect: 0,
      breakDmgBoost: 0,
      breakVuln: 0,
      toughnessPoints: 300,
      enemyMaxHp: 1000,
      enemyClass: 'normal',
      common: {
        ...neutral,
        attackerLevel: 30,
        enemyLevel: 29,
        toughness: 'notApplied',
      },
    });
    expect(r.total).toBeCloseTo(231 * 0.6 * 5 * 3 * (500 / 990), 6);
    expect(r.total).toBeCloseTo(1050, 3);
  });

  it('风化按层数线性叠加', () => {
    const mk = (stacks: number) =>
      computeBreakDot({
        breakBase: 500,
        dotType: 'windShear',
        stacks,
        breakEffect: 0.2,
      breakDmgBoost: 0,
      breakVuln: 0,
        toughnessPoints: 60,
        enemyMaxHp: 1000,
        enemyClass: 'normal',
        common: neutral,
      });
    expect(mk(3).total / mk(1).total).toBeCloseTo(3, 12);
  });

  it('物理裂伤：min(生命×16%, 基数×韧性系数×2)，低血量吃生命值', () => {
    const r = computeBreakDot({
      breakBase: 3767.55,
      dotType: 'bleed',
      stacks: 1,
      breakEffect: 0,
      breakDmgBoost: 0,
      breakVuln: 0,
      toughnessPoints: 30,
      enemyMaxHp: 6483.77,
      enemyClass: 'normal',
      common: neutral,
    });
    // 裂伤专文验算：基础值 6483.77×0.16 = 1037.4032，上限 3767.55×0.75×2 = 5651.325（韧性系数 0.75）
    expect(r.total).toBeCloseTo(6483.77 * 0.16 * 0.5, 6);
  });

  it('物理裂伤：高血量吃到上限（精英 7%）', () => {
    const r = computeBreakDot({
      breakBase: 3767.55,
      dotType: 'bleed',
      stacks: 1,
      breakEffect: 0,
      breakDmgBoost: 0,
      breakVuln: 0,
      toughnessPoints: 30,
      enemyMaxHp: 1_000_000,
      enemyClass: 'elite',
      common: neutral,
    });
    // 生命侧 7 万 > 上限 3767.55×0.75×2 = 5651.325，min 取上限
    expect(r.total).toBeCloseTo(3767.55 * 0.75 * 2 * 0.5, 6);
  });
});

describe('超击破', () => {
  it('游民星空验算案例：≈110381（80 级基数，技能削韧 90 点，击破特攻 300%）', () => {
    const r = computeSuperBreak({
      breakBase: 3767,
      breakEffect: 3,
      breakDmgBoost: 0,
      breakVuln: 0,
      skillToughnessPoints: 90,
      toughnessBoost: 1.5,
      weaknessBreakEfficiency: 0.5,
      superBreakBonus: 0.4,
      common: { ...neutral, enemyLevel: 95, toughness: 'notApplied' },
    });
    // 原文约值 110381（原文削韧值 30 为 10 点制 = 90 点），精确代入 (3767/30)×4×(90×2.5×1.5)×1.4×100/215 = 110381.86
    expect(r.total).toBeCloseTo(
      (3767 / 30) * 4 * (90 * 2.5 * 1.5) * 1.4 * (100 / 215),
      6,
    );
    expect(r.total).toBeGreaterThan(110381);
    expect(r.total).toBeLessThan(110383);
  });
});

describe('欢愉伤害', () => {
  it('笑点区 = 1 + 5×笑点/(笑点+240)', () => {
    expect(laughZone(2)).toBeCloseTo(1 + 10 / 242, 12);
    expect(laughZone(0)).toBeCloseTo(1, 12);
  });

  it('17173 数值验算案例：≈3633.8308（啊哈时刻伤害，笑点=2）', () => {
    const r = computeElation({
      elationBase: 7535.107,
      multiplier: 0.2,
      elationDegree: 1.2,
      mirthBonus: 0,
      mode: 'ahaMoment',
      goodWorkReward: 0,
      laughPoints: 2,
      critRate: 1,
      critDmg: 1.274,
      critMode: 'crit',
      common: {
        ...neutral,
        attackerLevel: 80,
        enemyLevel: 76,
        resistance: 0.2,
        vulnerability: 0.26,
        toughness: 'unbroken',
      },
    });
    expect(r.total).toBeCloseTo(3633.8308, 3);
  });

  it('不吃常规增伤：因子中无 damageBonus', () => {
    const r = computeElation({
      elationBase: 7535.107,
      multiplier: 1,
      elationDegree: 0,
      mirthBonus: 0,
      mode: 'normal',
      goodWorkReward: 0,
      laughPoints: 0,
      critRate: 0,
      critDmg: 0,
      common: neutral,
    });
    expect(r.factors.some((f) => f.key === 'damageBonus')).toBe(false);
    expect(r.total).toBeCloseTo(7535.107 * 0.5, 6);
  });

  it('普通欢愉伤害笑点区取好活当赏，啊哈时刻伤害取笑点（同一公式）', () => {
    const mk = (mode: ElationMode, goodWorkReward: number, laughPoints: number) =>
      computeElation({
        elationBase: 1000,
        multiplier: 1,
        elationDegree: 0,
        mirthBonus: 0,
        mode,
        goodWorkReward,
        laughPoints,
        critRate: 0,
        critDmg: 0,
        critMode: 'normal',
        common: neutral,
      });
    const laugh = (r: { factors: readonly { key: string; value: number }[] }) =>
      r.factors.find((f) => f.key === 'laugh')?.value;
    // 普通欢愉：好活当赏=2 进公式，忽略笑点
    expect(laugh(mk('normal', 2, 100))).toBeCloseTo(laughZone(2), 12);
    expect(mk('normal', 2, 100).total).toBeCloseTo(mk('normal', 2, 9999).total, 12);
    // 啊哈时刻：笑点=2 进公式，忽略好活当赏
    expect(laugh(mk('ahaMoment', 100, 2))).toBeCloseTo(laughZone(2), 12);
    expect(mk('ahaMoment', 100, 2).total).toBeCloseTo(mk('ahaMoment', 9999, 2).total, 12);
    // 同公式：两侧数值相同时结果一致
    expect(mk('normal', 50, 0).total).toBeCloseTo(mk('ahaMoment', 0, 50).total, 12);
  });
});

describe('击破伤害提高 / 受到的击破伤害提高', () => {
  const base = {
    breakBase: 1000,
    element: 'Fire' as const,
    toughnessPoints: 60,
    breakEffect: 0,
    breakVuln: 0,
    common: neutral,
  };

  it('造成的击破伤害提高为独立乘区（×1.32）', () => {
    const r0 = computeBreakTrigger({ ...base, breakDmgBoost: 0 });
    const r32 = computeBreakTrigger({ ...base, breakDmgBoost: 0.32 });
    expect(r32.total / r0.total).toBeCloseTo(1.32, 12);
    expect(
      r32.factors.find((f) => f.key === 'breakDmgBoost')?.value,
    ).toBeCloseTo(1.32, 12);
  });

  it('受到的击破伤害提高并入易伤区加算（0.1 + 0.2 = 1.3）', () => {
    const r = computeBreakTrigger({
      ...base,
      breakDmgBoost: 0,
      breakVuln: 0.2,
      common: { ...neutral, vulnerability: 0.1 },
    });
    expect(r.factors.find((f) => f.key === 'vuln')?.value).toBeCloseTo(1.3, 12);
  });

  it('超击破同时吃击破伤害提高与超击破伤害提高', () => {
    const mk = (breakDmgBoost: number, superBreakBonus: number) =>
      computeSuperBreak({
        breakBase: 3767,
        breakEffect: 0,
        skillToughnessPoints: 90,
        toughnessBoost: 0,
        weaknessBreakEfficiency: 0,
        superBreakBonus,
        breakDmgBoost,
        breakVuln: 0,
        common: { ...neutral, toughness: 'notApplied' },
      });
    expect(mk(0.32, 0.4).total / mk(0, 0).total).toBeCloseTo(1.32 * 1.4, 12);
  });

  it('击破 DoT 同样吃这两个乘区', () => {
    const mk = (breakDmgBoost: number, breakVuln: number) =>
      computeBreakDot({
        breakBase: 500,
        dotType: 'shock',
        stacks: 1,
        breakEffect: 0,
        breakDmgBoost,
        breakVuln,
        toughnessPoints: 60,
        enemyMaxHp: 1000,
        enemyClass: 'normal',
        common: neutral,
      });
    expect(mk(0.32, 0.2).total / mk(0, 0).total).toBeCloseTo(1.32 * 1.2, 12);
  });

  it('普通直伤不含击破类乘区', () => {
    const r = computeDirectDamage({
      statValue: 1000,
      multiplier: 1,
      damageBonus: 0,
      critRate: 0,
      critDmg: 0,
      common: neutral,
    });
    expect(r.factors.some((f) => f.key === 'breakDmgBoost')).toBe(false);
    expect(r.factors.some((f) => f.key === 'breakEffect')).toBe(false);
  });
});

describe('特殊独立乘区', () => {
  it('缺省时独立乘区 = 1，不改变总伤害', () => {
    const r = computeDirectDamage({
      statValue: 1000,
      multiplier: 1,
      damageBonus: 0,
      critRate: 0,
      critDmg: 0,
      critMode: 'normal',
      common: neutral,
    });
    expect(r.factors.find((f) => f.key === 'independent')?.value).toBe(1);
    expect(r.total).toBeCloseTo(1000 * 0.5, 12);
  });

  it('传入值按倍率线性缩放总伤害（直伤/普通 DoT）', () => {
    const base = { statValue: 1000, multiplier: 1, damageBonus: 0, common: neutral };
    const crit = { critRate: 0, critDmg: 0, critMode: 'normal' as const };
    const d0 = computeDirectDamage({ ...base, ...crit });
    const d1 = computeDirectDamage({ ...base, ...crit, independentMultiplier: 1.5 });
    expect(d1.total / d0.total).toBeCloseTo(1.5, 12);
    const t0 = computeDotDamage({ ...base });
    const t1 = computeDotDamage({ ...base, independentMultiplier: 2 });
    expect(t1.total / t0.total).toBeCloseTo(2, 12);
  });

  it('六种伤害类型均包含独立乘区行', () => {
    const results = [
      computeDirectDamage({
        statValue: 1,
        multiplier: 1,
        damageBonus: 0,
        critRate: 0,
        critDmg: 0,
        critMode: 'normal',
        common: neutral,
      }),
      computeDotDamage({ statValue: 1, multiplier: 1, damageBonus: 0, common: neutral }),
      computeBreakTrigger({
        breakBase: 1,
        element: 'Physical',
        toughnessPoints: 60,
        breakEffect: 0,
        breakDmgBoost: 0,
        breakVuln: 0,
        common: neutral,
      }),
      computeBreakDot({
        breakBase: 1,
        dotType: 'burn',
        stacks: 1,
        breakEffect: 0,
        breakDmgBoost: 0,
        breakVuln: 0,
        toughnessPoints: 60,
        enemyMaxHp: 1,
        enemyClass: 'normal',
        common: neutral,
      }),
      computeSuperBreak({
        breakBase: 1,
        breakEffect: 0,
        skillToughnessPoints: 30,
        toughnessBoost: 0,
        weaknessBreakEfficiency: 0,
        superBreakBonus: 0,
        breakDmgBoost: 0,
        breakVuln: 0,
        common: neutral,
      }),
      computeElation({
        elationBase: 1,
        multiplier: 1,
        elationDegree: 0,
        mirthBonus: 0,
        mode: 'normal',
        goodWorkReward: 0,
        laughPoints: 0,
        critRate: 0,
        critDmg: 0,
        critMode: 'normal',
        common: neutral,
      }),
    ];
    for (const r of results) {
      expect(r.factors.some((f) => f.key === 'independent' && f.value === 1)).toBe(true);
    }
  });
});

describe('真实伤害（第七类，2026-10 废除真伤区）', () => {
  it('不走任何乘区：factors 仅 base × trueDamage，total = 原伤害 × 比例', () => {
    const r = computeTrueDamage({ originalTotal: 12345.6, ratio: 0.24 });
    expect(r.kind).toBe('trueDamage');
    expect(r.factors).toEqual([
      { key: 'base', value: 12345.6 },
      { key: 'trueDamage', value: 0.24 },
    ]);
    expect(r.total).toBeCloseTo(12345.6 * 0.24, 8);
    expect(r.total).toBeCloseTo(total(r.factors), 10);
  });

  it('不吃任何乘区：factor 仅两项，不含防御/抗性/增伤/暴击', () => {
    const r = computeTrueDamage({ originalTotal: 1000, ratio: 1 });
    expect(r.factors).toHaveLength(2);
    expect(r.factors.some((f) => f.key === 'defense' || f.key === 'damageBonus')).toBe(false);
  });
});
