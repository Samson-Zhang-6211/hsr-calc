/** 分配整套时的爆率副词条额度（2026-10-08 裁定：上限语义）。
 *  预算 = 角色爆率上限(缺省0.95) − 面板来源(5%基础+行迹+光锥/套装子句+遗器主词条，
 *  不含副词条；manual 手填值按“不含副词条”语义)，按最坏档(base+2×step)向下取整为 roll 数；
 *  60% 检查阈值 = 0.6 × 满额贡献值。来源已超上限时额度为 0（副词条不出爆率）。 */
export function critBudget(input: {
  source: number;
  target: number;
  base: number;
  step: number;
}): { maxRolls: number; minValue: number } {
  const worst = input.base + 2 * input.step;
  const budget = Math.max(0, input.target - input.source);
  const maxRolls = worst > 0 ? Math.floor(budget / worst) : 0;
  return { maxRolls, minValue: 0.6 * maxRolls * worst };
}
