/** 静态资源 URL 拼接（2026-10-16 主站并轨）：站点挂在 `站点根路径 /hsr/`，
 * vite `base: '/hsr/'` 令 `import.meta.env.BASE_URL` = `/hsr/`（本地 dev 则为 `/`）。
 * public/ 下资源一律经此拼接，**禁止再散写 `/portraits/` 等根绝对路径**（主站挂载下会 404）。 */
export const assetUrl = (path: string): string =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
