/**
 * 召唤物 / 忆灵美术（2026-11-07 用户反馈「景元的召唤物不是神君」后重做）
 *
 * 由来：原先没有召唤物美术，窄卡直接复用**主人立绘**加偏移裁切（`SUMMON_CROP`）。
 * 结果景元的卡右侧那张「6段数」窄卡画的是景元本人的脸，用户一眼看出不是神君。
 *
 * 现在：站点 CDN 上其实有一整套忆灵头像
 * `https://static.nanoka.cc/assets/hsr/servanticonteam/<1+名册id+B>.webp`（256×216、带 alpha），
 * 由 `scripts/fetch-summon-icons.mjs` 落到 `apps/web/public/summon-icon/<召唤物id>.webp`。
 * ⚠ 有 4 个召唤物 CDN 上没有图（见该脚本注释）——它们走「元素徽记 + 名字」兜底，
 *   **绝不要退回到「拿主人立绘冒充」**。
 */
import { assetUrl } from './asset-url.js';

/** 有真实忆灵头像的召唤物（引擎召唤物 id） */
export const SUMMON_ICON_IDS = [
  'yijiang', // 衣匠（阿格莱雅）
  'silong', // 死龙•玻吕刻斯（遐蝶）
  'xiaoyika', // 小伊卡（风堇）
  'changye', // 长夜（长夜月）
  'demiurge', // 德谬歌（昔涟）
  'mimi', // 迷迷（开拓者•记忆）
] as const;

export type SummonWithIcon = (typeof SUMMON_ICON_IDS)[number];

/** 召唤物头像 URL；没有图的返回 undefined（调用方走元素徽记兜底） */
export const summonIconUrl = (id: string): string | undefined =>
  (SUMMON_ICON_IDS as readonly string[]).includes(id) ? assetUrl(`summon-icon/${id}.webp`) : undefined;
