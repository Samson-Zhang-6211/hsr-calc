import type { HitLog } from '../src/index.js';

/**
 * 对账基座：**按暴击结果分组选分支**（2026-11-06 用户裁定，推广至全部单段核对）
 *
 * 实战飘字是"一次实现"——某一段要么暴击、要么没有，所以不能用期望值（1+CR×CD）去比。
 * 做法：
 *   ① 引擎用 `critMode:'random'` 跑 N 个 seed；
 *   ② 按该段暴击结果分成「暴击组 / 未暴击组」（组内应恒定）；
 *   ③ **取更贴近实测的那一组**（不混在一起拟合）；
 *   ④ 多段行动按 2^n 组合枚举后同样选最近的组合；
 *   ⑤ 判定组必须与画面「暴击」标签一致，偏差 ≤ tolerance 判通过。
 */

export type Branch = 'crit' | 'normal';

export interface BranchPick {
  branch: Branch;
  /** 该组的代表值（中位数） */
  value: number;
  /** value / observed − 1 */
  deviation: number;
  /** 该组样本数（≈ N × 暴率） */
  n: number;
}

export const critFactorOf = (h: HitLog): number =>
  h.factors.find((f) => f.key === 'crit')?.value ?? Number.NaN;

export const isCrit = (h: HitLog): boolean => critFactorOf(h) > 1.000001;

const median = (xs: readonly number[]): number => {
  if (!xs.length) return Number.NaN;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
};

/** 单段：按暴击分组，返回更贴近实测的分支 */
export function pickBranchByCrit(
  samples: readonly { hit: HitLog }[],
  observed: number,
): BranchPick {
  const groups: Record<Branch, number[]> = { crit: [], normal: [] };
  for (const s of samples) {
    (isCrit(s.hit) ? groups.crit : groups.normal).push(s.hit.total);
  }
  const cand: BranchPick[] = (['crit', 'normal'] as const)
    .filter((b) => groups[b].length > 0)
    .map((b) => ({
      branch: b,
      value: median(groups[b]),
      n: groups[b].length,
      deviation: Number.NaN,
    }));
  if (!cand.length) throw new Error('pickBranchByCrit: 没有可用样本');
  for (const c of cand) c.deviation = c.value / observed - 1;
  cand.sort((a, b) => Math.abs(a.deviation) - Math.abs(b.deviation));
  return cand[0]!;
}

/**
 * 多段行动：按每段的暴击/未暴击组合枚举（2^n），取合计最贴近实测的组合。
 * `segments[i][j]` = 第 i 段在第 j 个 seed 下的命中日志（各段需按同一 seed 对齐）。
 */
export function pickComboByCrit(
  segments: readonly (readonly HitLog[])[],
  observed: number,
  maxSegments = 8,
): { pattern: Branch[]; total: number; deviation: number } {
  const n = Math.min(segments.length, maxSegments);
  if (n === 0) throw new Error('pickComboByCrit: 段数为 0');
  // 每段的两个分支代表值
  const reps = segments.slice(0, n).map((seg) => {
    const crit = seg.filter(isCrit).map((h) => h.total);
    const normal = seg.filter((h) => !isCrit(h)).map((h) => h.total);
    return { crit: median(crit), normal: median(normal) };
  });
  let best: { pattern: Branch[]; total: number; deviation: number } | undefined;
  for (let mask = 0; mask < 1 << n; mask += 1) {
    const pattern: Branch[] = [];
    let total = 0;
    let ok = true;
    for (let i = 0; i < n; i += 1) {
      const want: Branch = (mask >> i) & 1 ? 'crit' : 'normal';
      const v = reps[i]![want];
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      pattern.push(want);
      total += v;
    }
    if (!ok) continue;
    const deviation = total / observed - 1;
    if (!best || Math.abs(deviation) < Math.abs(best.deviation)) {
      best = { pattern, total, deviation };
    }
  }
  if (!best) throw new Error('pickComboByCrit: 没有可行组合');
  return best;
}
