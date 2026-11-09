import {
  computeBreakDot,
  computeBreakTrigger,
  computeDirectDamage,
  computeDotDamage,
  computeElation,
  computeSuperBreak,
  computeTrueDamage,
  type BreakDotInput,
  type BreakTriggerInput,
  type CommonZonesInput,
  type DamageResult,
  type DirectDamageInput,
  type DotDamageInput,
  type ElationInput,
  type SuperBreakInput,
  type TrueDamageInput,
} from '../damage.js';
import { BREAK_BASE_LEVEL_80, ELATION_BASE_LEVEL_80 } from '../base-tables.js';
import type { ToughnessState } from '../zones.js';

/** 公共乘区组装参数（攻击方 + 木桩动态状态的快照） */
export interface ZoneSnapshot {
  attackerLevel: number;
  monsterLevel: number;
  /** 木桩防御降低 debuff 合计 */
  defReduction: number;
  /** 无视防御合计（晴歌结界 15%+0.5%×气氛 等） */
  defIgnore: number;
  /** 木桩该属性抗性 */
  resistance: number;
  /** 木桩抗性降低 debuff 合计 */
  resReduction: number;
  /** 攻击方穿透合计 */
  resPenetration: number;
  /** 木桩易伤合计（含忆灵在场「受到伤害提高」） */
  vulnerability: number;
  /** 受到的击破伤害提高：并入易伤区加算，仅击破类生效 */
  breakVulnerability: number;
  toughness: ToughnessState;
  damageReductions?: readonly number[];
}

export function buildCommon(z: ZoneSnapshot, isBreak: boolean): CommonZonesInput {
  return {
    attackerLevel: z.attackerLevel,
    enemyLevel: z.monsterLevel,
    defReduction: z.defReduction,
    defIgnore: z.defIgnore,
    resistance: z.resistance,
    resReduction: z.resReduction,
    resPenetration: z.resPenetration,
    vulnerability: z.vulnerability + (isBreak ? z.breakVulnerability : 0),
    damageReductions: z.damageReductions ?? [],
    toughness: z.toughness,
  };
}

/** 七类伤害的统一分发（四人队实战只产生 direct/break/breakDot；其余类型无触发源，由单测直接验证） */
export type DamageDispatch =
  | { kind: 'direct'; input: DirectDamageInput }
  | { kind: 'dot'; input: DotDamageInput }
  | { kind: 'breakTrigger'; input: BreakTriggerInput }
  | { kind: 'breakDot'; input: BreakDotInput }
  | { kind: 'superBreak'; input: SuperBreakInput }
  | { kind: 'elation'; input: ElationInput }
  | { kind: 'trueDamage'; input: TrueDamageInput };

export function dispatchDamage(d: DamageDispatch): DamageResult {
  switch (d.kind) {
    case 'direct':
      return computeDirectDamage(d.input);
    case 'dot':
      return computeDotDamage(d.input);
    case 'breakTrigger':
      return computeBreakTrigger(d.input);
    case 'breakDot':
      return computeBreakDot(d.input);
    case 'superBreak':
      return computeSuperBreak(d.input);
    case 'elation':
      return computeElation(d.input);
    case 'trueDamage':
      return computeTrueDamage(d.input);
  }
}

export { BREAK_BASE_LEVEL_80, ELATION_BASE_LEVEL_80 };
