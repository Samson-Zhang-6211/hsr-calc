export type ToughnessState = 'unbroken' | 'broken' | 'notApplied';

export function defenseZone(input: {
  attackerLevel: number;
  enemyLevel: number;
  defReduction: number;
  defIgnore: number;
}): number {
  const atk = input.attackerLevel + 20;
  const def = (input.enemyLevel + 20) * (1 - input.defReduction - input.defIgnore);
  return atk / (atk + def);
}

export function resistZone(input: {
  resistance: number;
  resReduction: number;
  resPenetration: number;
}): number {
  return 1 - input.resistance + input.resReduction + input.resPenetration;
}

export function vulnZone(vulnerability: number): number {
  return 1 + vulnerability;
}

export function bonusZone(bonus: number): number {
  return 1 + bonus;
}

/**
 * 暴击口径（2026-11-06 用户裁定）：
 * - `random`：**真实掷骰**，每段独立判定 → 暴击 `1+CD`，否则 `1`（模拟默认）
 * - `expected`：期望值 `1+CR×CD`（仅用于全局统计口径，`hit.expectedTotal`）
 * - `crit` / `normal`：强制暴击/不暴击，供对账与测试分组
 */
export type CritMode = 'random' | 'expected' | 'crit' | 'normal';

export function critZone(input: {
  critRate: number;
  critDmg: number;
  mode?: CritMode;
  /** random 模式的骰子（注入 battle 的种子 PRNG，保证可复现） */
  rand?: () => number;
}): number {
  const mode = input.mode ?? 'expected';
  if (mode === 'crit') return 1 + input.critDmg;
  if (mode === 'normal') return 1;
  if (mode === 'random') {
    const r = input.rand ? input.rand() : Math.random();
    return r < Math.max(0, Math.min(1, input.critRate)) ? 1 + input.critDmg : 1;
  }
  return 1 + input.critRate * input.critDmg;
}

export function reductionZone(reductions: readonly number[]): number {
  return reductions.reduce((acc, r) => acc * (1 - r), 1);
}

export function toughnessZone(state: ToughnessState): number {
  return state === 'unbroken' ? 0.9 : 1;
}
