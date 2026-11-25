/**
 * 数字展示格式化（只影响 UI 文本，不参与任何计算）。
 *
 * 起因：速度/充能效率加成是「面板 + 遗器副属性」逐项累加出来的浮点，
 * 直接插值会显示成 `234.09951999999998` / `0.19439401499999998`（2026-11 用户反馈）。
 * 这里按位数四舍五入后再去掉尾随 0，保证既能看清精度、又不带浮点噪声。
 */
export function fmtNum(value: number | null | undefined, decimals = 3): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const fixed = value.toFixed(decimals);
  if (!fixed.includes('.')) return fixed;
  const trimmed = fixed.replace(/0+$/, '').replace(/\.$/, '');
  // -0.0001 之类四舍五入后会变成 "-0" → 统一成 "0"
  return trimmed === '-0' ? '0' : trimmed;
}
