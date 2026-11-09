import type { RosterLightcone } from './data/lightcone-roster.js';

export interface LightconeOrderOptions {
  /** 当前角色命途（path 枚举值）；同命途光锥排前 */
  path?: string;
  /** 当前角色的专武光锥 id；仅 5★ 非开拓者角色置顶 */
  signatureId?: string;
  /** 角色星级：只有 5★ 角色启用「专武置顶」（4★/未提供时不做置顶） */
  rarity?: number;
  /** 开拓者（多形态，id 以 80 开头）：不启用专武置顶 */
  isTrailblazer?: boolean;
  /** 名字排序语言（多语名字不同影响同组内次序），默认 zh */
  lang?: 'zh' | 'en';
}

/**
 * 角色管理光锥选择排序（2026-10-29 用户裁定）：
 * 5★ 且非开拓者角色：专属光锥 > 同命途光锥 > 其余；
 * 其余角色：同命途光锥 > 其余；所有分组内一律 5★ > 4★ > 3★，再按名字稳定排序。
 * 纯函数，不修改入参。
 */
export function orderLightcones(
  list: readonly RosterLightcone[],
  opts: LightconeOrderOptions = {},
): RosterLightcone[] {
  const { path, signatureId, rarity, isTrailblazer = false, lang = 'zh' } = opts;
  const nameOf = (lc: RosterLightcone): string => (lang === 'en' ? lc.en : lc.zh);
  // 专武置顶只对 5★ 角色生效（开拓者除外）；未传星级时保持旧行为（兼容旧调用）
  const useSignature = !!signatureId && !isTrailblazer && (rarity === undefined || rarity === 5);
  return [...list].sort((a, b) => {
    const sigA = useSignature && a.id === signatureId ? 0 : 1;
    const sigB = useSignature && b.id === signatureId ? 0 : 1;
    if (sigA !== sigB) return sigA - sigB;
    const pathMatchA = path && a.path === path ? 0 : 1;
    const pathMatchB = path && b.path === path ? 0 : 1;
    if (pathMatchA !== pathMatchB) return pathMatchA - pathMatchB;
    if (a.rarity !== b.rarity) return b.rarity - a.rarity;
    return nameOf(a).localeCompare(nameOf(b), lang === 'en' ? 'en' : 'zh-CN');
  });
}
