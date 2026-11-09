/**
 * 离线包判定与路径（2026-11-08）。
 *
 * 为什么不用独立环境变量开关：vite 的 `base` 已经是唯一的构建开关——
 * 服务器构建是 `/hsr/`，离线包是 `./`，两者互斥；再叠一个 `VITE_OFFLINE`
 * 只会多一处不同步的地方（base 改了开关没改，路由就会和资源路径打架）。
 */

/** `base: './'`（离线包）或空串才算离线；`/` 与 `/hsr/` 都是服务器构建 */
export const isOfflineBase = (baseUrl: string): boolean => baseUrl === './' || baseUrl === '';

/** 离线数据分片位置（相对 index.html；file:// 下相对路径同样可解析） */
export const offlineDataUrl = (baseUrl: string, category: string): string =>
  `${baseUrl}data-offline/${category}.js`;
