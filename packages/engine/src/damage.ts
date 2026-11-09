import type { BreakDotType, DamageKind, Element } from '@hsr-calc/shared';
import {
  bonusZone,
  critZone,
  defenseZone,
  reductionZone,
  resistZone,
  toughnessZone,
  vulnZone,
  type CritMode,
  type ToughnessState,
} from './zones.js';

/**
 * 伤害公式口径（2026-01 经用户逐条确认，对应游戏版本 4.6；2026-10 真伤区改造）：
 * - 全程浮点，不取整；不做数值上限封顶。
 * - 防御区 = (攻方lv+20) / [(攻方lv+20) + (守方lv+20) × (1 − 减防% − 无视防御%)]
 * - 抗性区 = 1 − 抗性 + 减抗 + 穿透（溢出全额转增伤，可 > 1）
 * - 减伤（受到的伤害降低）区内乘算；韧性减伤区未破韧 ×0.9（'notApplied' 用于 DoT 首跳不吃韧性减伤，多源实测）。
 * - 真伤区已废除（2026-10 用户裁定）：真实伤害为独立第七类伤害，无属性，
 *   不走任何乘区（不吃增伤/抗性/暴击等一切效果），数值 = 原伤害值 × 比例，
 *   仅依附技能效果在实战中结算（见 combat 挂点）；计算器中该类型为占位（恒 0）。
 * - 击破/超击破不吃增伤与暴击；欢愉不吃攻击与常规增伤但可暴击。
 * - 韧性一律用游戏显示点数口径（常规单攻普攻削韧 = 30 点，与技能 show_stance_list / 怪物 stance_base 同口径）。
 */

export interface DamageFactor {
  key: string;
  value: number;
}

export interface DamageResult {
  kind: DamageKind;
  factors: readonly DamageFactor[];
  total: number;
  /** 该段的期望暴击因子 1+CR×CD（random 模式下 pushHit 用它折算 expectedTotal） */
  expectedCrit?: number;
}

function build(kind: DamageKind, factors: DamageFactor[]): DamageResult {
  const reduction = factors.find((f) => f.key === 'reduction');
  // 减伤 ≥ 100%：每次伤害实例固定 1 点（kind 不变，属性仍由调用方决定）
  const total = reduction && reduction.value <= 0 ? 1 : factors.reduce((acc, f) => acc * f.value, 1);
  return { kind, factors, total };
}

/** 特殊独立乘区（部分角色伤害拥有，独立于其他乘区；默认 1） */
function independentFactor(value?: number): DamageFactor {
  return { key: 'independent', value: value ?? 1 };
}

export interface CommonZonesInput {
  attackerLevel: number;
  enemyLevel: number;
  defReduction: number;
  defIgnore: number;
  resistance: number;
  resReduction: number;
  resPenetration: number;
  vulnerability: number;
  damageReductions: readonly number[];
  toughness: ToughnessState;
}

function commonFactors(input: CommonZonesInput, breakVuln = 0): DamageFactor[] {
  return [
    {
      key: 'defense',
      value: defenseZone({
        attackerLevel: input.attackerLevel,
        enemyLevel: input.enemyLevel,
        defReduction: input.defReduction,
        defIgnore: input.defIgnore,
      }),
    },
    {
      key: 'resist',
      value: resistZone({
        resistance: input.resistance,
        resReduction: input.resReduction,
        resPenetration: input.resPenetration,
      }),
    },
    { key: 'vuln', value: vulnZone(input.vulnerability + breakVuln) },
    { key: 'reduction', value: reductionZone(input.damageReductions) },
    { key: 'toughness', value: toughnessZone(input.toughness) },
  ];
}

export interface DirectDamageInput {
  statValue: number;
  multiplier: number;
  damageBonus: number;
  critRate: number;
  critDmg: number;
  critMode?: CritMode;
  /** random 模式的骰子（注入 battle 种子 PRNG） */
  critRand?: () => number;
  /** 特殊独立乘区（默认 1） */
  independentMultiplier?: number;
  common: CommonZonesInput;
}

export function computeDirectDamage(input: DirectDamageInput): DamageResult {
  const r = build('direct', [
    { key: 'base', value: input.statValue * input.multiplier },
    { key: 'damageBonus', value: bonusZone(input.damageBonus) },
    {
      key: 'crit',
      value: critZone({
        critRate: input.critRate,
        critDmg: input.critDmg,
        mode: input.critMode,
        rand: input.critRand,
      }),
    },
    independentFactor(input.independentMultiplier),
    ...commonFactors(input.common),
  ]);
  return {
    ...r,
    expectedCrit: 1 + Math.max(0, Math.min(1, input.critRate)) * input.critDmg,
  };
}

export interface DotDamageInput {
  statValue: number;
  multiplier: number;
  damageBonus: number;
  /** 特殊独立乘区（默认 1） */
  independentMultiplier?: number;
  common: CommonZonesInput;
}

export function computeDotDamage(input: DotDamageInput): DamageResult {
  return build('dot', [
    { key: 'base', value: input.statValue * input.multiplier },
    { key: 'damageBonus', value: bonusZone(input.damageBonus) },
    independentFactor(input.independentMultiplier),
    ...commonFactors(input.common),
  ]);
}

/** 属性击破触发伤害系数（多源一致） */
export const BREAK_ELEMENT_MULTIPLIER: Readonly<Record<Element, number>> = {
  Physical: 2,
  Fire: 2,
  Wind: 1.5,
  Ice: 1,
  Thunder: 1,
  Quantum: 0.5,
  Imaginary: 0.5,
};

/** 游戏显示口径：常规单攻普攻削韧值 = 30 点（技能 show_stance_list / 怪物 stance_base 同口径） */
export const TOUGHNESS_POINTS_PER_BASIC = 30;

/** 韧性系数 = (T + 2) / 4，T = 韧性点数 ÷ 30（普攻打空次数） */
export function toughnessCoeff(toughnessPoints: number): number {
  return (toughnessPoints / TOUGHNESS_POINTS_PER_BASIC + 2) / 4;
}

export interface BreakTriggerInput {
  breakBase: number;
  element: Element;
  /** 敌方韧性上限（点，常规普攻 = 30） */
  toughnessPoints: number;
  breakEffect: number;
  /** 造成的击破伤害提高（加算和，独立乘区） */
  breakDmgBoost: number;
  /** 受到的击破伤害提高（加算和，并入易伤区） */
  breakVuln: number;
  /** 特殊独立乘区（默认 1） */
  independentMultiplier?: number;
  common: CommonZonesInput;
}

export function computeBreakTrigger(input: BreakTriggerInput): DamageResult {
  return build('breakTrigger', [
    { key: 'base', value: input.breakBase },
    { key: 'elementMultiplier', value: BREAK_ELEMENT_MULTIPLIER[input.element] },
    { key: 'toughnessCoeff', value: toughnessCoeff(input.toughnessPoints) },
    { key: 'breakEffect', value: 1 + input.breakEffect },
    { key: 'breakDmgBoost', value: 1 + input.breakDmgBoost },
    independentFactor(input.independentMultiplier),
    ...commonFactors(input.common, input.breakVuln),
  ]);
}

export type EnemyClass = 'normal' | 'elite';

/** 物理裂伤的生命值系数（普通 16% / 精英及以上 7%） */
export const BLEED_HP_COEFFICIENT: Readonly<Record<EnemyClass, number>> = {
  normal: 0.16,
  elite: 0.07,
};

/** 击破持续伤害的属性系数（火/冰/冻结 1，雷 2，风每层 1，量子每层 0.6；物理为生命值倍比，另行计算） */
export const BREAK_DOT_MULTIPLIER: Readonly<Record<Exclude<BreakDotType, 'bleed'>, number>> = {
  burn: 1,
  freeze: 1,
  shock: 2,
  windShear: 1,
  entanglement: 0.6,
};

export interface BreakDotInput {
  breakBase: number;
  dotType: BreakDotType;
  stacks: number;
  breakEffect: number;
  /** 造成的击破伤害提高（加算和，独立乘区） */
  breakDmgBoost: number;
  /** 受到的击破伤害提高（加算和，并入易伤区） */
  breakVuln: number;
  /** 敌方韧性上限（点，常规普攻 = 30） */
  toughnessPoints: number;
  enemyMaxHp: number;
  enemyClass: EnemyClass;
  /** 特殊独立乘区（默认 1） */
  independentMultiplier?: number;
  common: CommonZonesInput;
}

export function computeBreakDot(input: BreakDotInput): DamageResult {
  const factors: DamageFactor[] = [];
  if (input.dotType === 'bleed') {
    // 裂伤 = min(生命×类型系数, 击破基数×韧性系数×2) × (1+击破特攻) × 公共乘区
    // 注：裂伤专文（17173 2023-09）列出增伤/引爆乘区槽位，经用户确认击破类不吃增伤，此处不设该乘区。
    const hpPart = input.enemyMaxHp * BLEED_HP_COEFFICIENT[input.enemyClass];
    const capPart = input.breakBase * toughnessCoeff(input.toughnessPoints) * 2;
    factors.push({ key: 'base', value: Math.min(hpPart, capPart) });
    factors.push({ key: 'breakEffect', value: 1 + input.breakEffect });
  } else {
    factors.push({ key: 'base', value: input.breakBase });
    factors.push({
      key: 'dotMultiplier',
      value: BREAK_DOT_MULTIPLIER[input.dotType],
    });
    if (input.dotType === 'windShear' || input.dotType === 'entanglement') {
      factors.push({ key: 'stacks', value: input.stacks });
    }
    if (input.dotType === 'entanglement') {
      factors.push({
        key: 'toughnessCoeff',
        value: toughnessCoeff(input.toughnessPoints),
      });
    }
    factors.push({ key: 'breakEffect', value: 1 + input.breakEffect });
  }
  factors.push({ key: 'breakDmgBoost', value: 1 + input.breakDmgBoost });
  factors.push(independentFactor(input.independentMultiplier));
  return build('breakDot', [...factors, ...commonFactors(input.common, input.breakVuln)]);
}

export interface SuperBreakInput {
  /** 击破基数（等级相关，80 级 ≈ 3767.55）；公式内部除以 30 配合点数口径 */
  breakBase: number;
  breakEffect: number;
  /** 技能削韧值（点，常规普攻 = 30，与技能 show_stance_list 同口径） */
  skillToughnessPoints: number;
  toughnessBoost: number;
  weaknessBreakEfficiency: number;
  superBreakBonus: number;
  /** 造成的击破伤害提高（加算和，独立乘区；超击破同时吃超击破伤害提高与击破伤害提高） */
  breakDmgBoost: number;
  /** 受到的击破伤害提高（加算和，并入易伤区） */
  breakVuln: number;
  /** 特殊独立乘区（默认 1） */
  independentMultiplier?: number;
  common: CommonZonesInput;
}

export function computeSuperBreak(input: SuperBreakInput): DamageResult {
  return build('superBreak', [
    { key: 'base', value: input.breakBase / TOUGHNESS_POINTS_PER_BASIC },
    { key: 'breakEffect', value: 1 + input.breakEffect },
    { key: 'skillToughness', value: input.skillToughnessPoints },
    { key: 'toughnessBoost', value: 1 + input.toughnessBoost },
    { key: 'weaknessBreakEfficiency', value: 1 + input.weaknessBreakEfficiency },
    { key: 'superBreakBonus', value: 1 + input.superBreakBonus },
    { key: 'breakDmgBoost', value: 1 + input.breakDmgBoost },
    independentFactor(input.independentMultiplier),
    ...commonFactors(input.common, input.breakVuln),
  ]);
}

export function laughZone(laughPoints: number): number {
  return 1 + (5 * laughPoints) / (laughPoints + 240);
}

/**
 * 欢愉伤害类型：
 * - normal（普通欢愉伤害）：啊哈时刻之外造成的欢愉伤害，笑点区取「好活当赏」
 * - ahaMoment（啊哈时刻伤害）：啊哈时刻内欢愉技伤害，笑点区取「笑点」
 * 两者乘区公式一致：1 + 5×x/(x+240)（多源确认，233乐园「两者计算公式一致」）。
 */
export type ElationMode = 'normal' | 'ahaMoment';

export interface ElationInput {
  elationBase: number;
  multiplier: number;
  elationDegree: number;
  mirthBonus: number;
  /** 欢愉伤害类型（决定笑点区取值来源） */
  mode: ElationMode;
  /** 好活当赏（普通欢愉伤害的笑点区输入） */
  goodWorkReward: number;
  /** 笑点（啊哈时刻伤害的笑点区输入） */
  laughPoints: number;
  critRate: number;
  critDmg: number;
  critMode?: CritMode;
  /** random 模式的骰子（注入 battle 种子 PRNG） */
  critRand?: () => number;
  /** 特殊独立乘区（默认 1） */
  independentMultiplier?: number;
  common: CommonZonesInput;
}

export function computeElation(input: ElationInput): DamageResult {
  const laughInput =
    input.mode === 'ahaMoment' ? input.laughPoints : input.goodWorkReward;
  const r = build('elation', [
    { key: 'base', value: input.elationBase * input.multiplier },
    { key: 'elationDegree', value: 1 + input.elationDegree },
    { key: 'mirthBonus', value: 1 + input.mirthBonus },
    { key: 'laugh', value: laughZone(laughInput) },
    {
      key: 'crit',
      value: critZone({
        critRate: input.critRate,
        critDmg: input.critDmg,
        mode: input.critMode,
        rand: input.critRand,
      }),
    },
    independentFactor(input.independentMultiplier),
    ...commonFactors(input.common),
  ]);
  return {
    ...r,
    expectedCrit: 1 + Math.max(0, Math.min(1, input.critRate)) * input.critDmg,
  };
}

export interface TrueDamageInput {
  /** 原伤害结算完成后的最终数值 */
  originalTotal: number;
  /** 技能效果的转化比例（0.24 = 24%） */
  ratio: number;
}

/**
 * 真实伤害（第七类，2026-10 用户裁定）：无属性伤害，直接作用于目标，
 * 不走任何乘区——不吃增伤、无视属性抗性等一切效果。
 * 数值 = 原伤害值 × 比例（如昔涟战技结界「等同于原伤害24%的真实伤害」）。
 * 每次伤害计算后由 combat 挂点结算一次；计算器中该类型为占位（恒 0）。
 */
export function computeTrueDamage(input: TrueDamageInput): DamageResult {
  return build('trueDamage', [
    { key: 'base', value: input.originalTotal },
    { key: 'trueDamage', value: input.ratio },
  ]);
}
