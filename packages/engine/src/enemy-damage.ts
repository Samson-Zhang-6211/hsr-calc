import { defenseZone, reductionZone } from './zones.js';
import type { DamageFactor } from './damage.js';

/**
 * 敌方对我方的伤害计算（2026-10-09 用户裁定，仿直伤公式简化）：
 * - 基础 = 敌方攻击力 × 技能倍率（敌攻换算见 web monster-stats，MonsterConfig.attack）。
 * - 防御区 = (敌方lv+20) / [(敌方lv+20) + (我方lv+20) × (1 − 我方减防 − 无视防御)]，
 *   本轮我方减防/无视防御 = 0（后续敌方 debuff 接入时扩展）。
 * - 抗性区 = 1、不吃敌方增伤、不暴击、不适用韧性区（我方无韧性）。
 * - 减伤区 = 1 − 我方受击减伤（MemberPanel.damageReduction，缺省 0；留腾荒E4/光锥接入口）。
 * - 本轮只写公式与受击结算，木桩攻击挂点等后续指令再接（裁定：不挂 monsterTurn）。
 */

export interface EnemyDamageInput {
  /** 敌方攻击力（木桩配置 MonsterConfig.attack） */
  attack: number;
  /** 技能倍率（比值口径，1 = 100%） */
  multiplier: number;
  /** 敌方等级（防御区攻方） */
  attackerLevel: number;
  /** 我方等级（防御区守方，角色面板 level，默认 80） */
  defenderLevel: number;
  /** 我方受击减伤比例（0.2 = 20%；MemberPanel.damageReduction 缺省 0） */
  damageReduction?: number;
  /** 我方全属性抗性比例（2026-10-29 接入：光锥 21002「全属性抗性提高」→ 抗性区 = 1 − 抗性） */
  resistance?: number;
}

export interface EnemyDamageResult {
  factors: readonly DamageFactor[];
  total: number;
}

/** 敌方对我方一次攻击的伤害（无暴击/无增伤；抗性区 = 1 − 全属性抗性，2026-10-29）。 */
export function computeEnemyDamage(input: EnemyDamageInput): EnemyDamageResult {
  const resistance = Math.min(1, Math.max(0, input.resistance ?? 0));
  const factors: DamageFactor[] = [
    { key: 'base', value: input.attack * input.multiplier },
    {
      key: 'defense',
      value: defenseZone({
        attackerLevel: input.attackerLevel,
        enemyLevel: input.defenderLevel,
        defReduction: 0,
        defIgnore: 0,
      }),
    },
    { key: 'reduction', value: reductionZone([input.damageReduction ?? 0]) },
    { key: 'resist', value: 1 - resistance },
  ];
  return { factors, total: factors.reduce((acc, f) => acc * f.value, 1) };
}

/** 我方成员受击前状态（战斗内每成员一份：当前生命/上限/当前护盾） */
export interface MemberHitState {
  hp: number;
  maxHp: number;
  shield: number;
}

export interface MemberDamageOutcome {
  /** 受击后生命（clamp ≥ 0） */
  hp: number;
  /** 受击后护盾（clamp ≥ 0；盾量优先消耗，裁定②） */
  shield: number;
  /** 本次被护盾吸收的伤害 */
  blocked: number;
  /** 本次实际损失的生命 */
  hpLoss: number;
  /** hp 归零 → 退场（不行动/不再被选为目标/盾清零，裁定④） */
  dead: boolean;
}

/** 受击结算：盾量优先消耗，盾不足部分扣生命。伤害与状态值均防御性 clamp ≥ 0。 */
export function applyDamageToMember(
  state: MemberHitState,
  damage: number,
): MemberDamageOutcome {
  const dmg = Math.max(0, damage);
  const shield = Math.max(0, state.shield);
  const blocked = Math.min(shield, dmg);
  const rest = dmg - blocked;
  const hpBefore = Math.max(0, state.hp);
  const hpLoss = Math.min(hpBefore, rest);
  const hp = hpBefore - hpLoss;
  return {
    hp,
    shield: shield - blocked,
    blocked,
    hpLoss,
    dead: hp <= 0,
  };
}
