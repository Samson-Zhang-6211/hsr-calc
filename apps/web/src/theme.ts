/**
 * 皮肤（主题）与配色令牌 —— 2026-10-11 新增。
 *
 * 分工：
 *  - 皮肤只控制 `styles.css` 里 `:root` / `:root[data-theme='neon']` 的 CSS 变量，
 *    不产生任何内联样式，页面里也不会出现 `if (theme === ...)` 这类分支。
 *  - 元素 / 命途 / 稀有度配色是本模块的纯函数，供后续 UI 接入（角色卡描边、伤害数字、
 *    元素筛选按钮等）使用；本轮（Tier 1 全局皮肤）只有皮肤切换真正接线。
 *
 * 重要：元素与命途的十六进制色值是**界面配色的主观选择**，不是游戏内数据
 * （游戏未提供官方色值）。若日后要以游戏内实际取色为准，需另行核对后再改这里。
 */

/** 皮肤 id；新增皮肤时只需在这里加 id + 在 styles.css 加一组同名变量块 */
export type ThemeId = 'astra' | 'neon';

export const THEME_IDS: readonly ThemeId[] = ['astra', 'neon'];

/** 默认皮肤：星穹典雅（无 JS 时 :root 也是这一套，不会出现无样式闪烁） */
export const DEFAULT_THEME: ThemeId = 'astra';

/** localStorage 键，沿用 storage.ts 的 'hsr-sim.' 前缀习惯 */
export const THEME_STORAGE_KEY = 'hsr-sim.theme';

/** localStorage / 注入用的最小接口（便于在 node 环境下单测） */
export interface ThemeStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 承载 data-theme 的根节点最小接口（documentElement 可结构化匹配） */
export interface ThemeRoot {
  dataset: Record<string, string | undefined>;
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

/** 循环切换：astra → neon → astra（顶栏按钮用的就是它） */
export function nextTheme(current: ThemeId): ThemeId {
  const index = THEME_IDS.indexOf(current);
  return THEME_IDS[(index + 1) % THEME_IDS.length] ?? DEFAULT_THEME;
}

function defaultStore(): ThemeStore | null {
  try {
    // typeof 守卫：node（vitest）环境下 localStorage 不存在
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // 浏览器禁用存储（隐私模式等）时访问 localStorage 可能直接抛错
    return null;
  }
}

function defaultRoot(): ThemeRoot | null {
  return typeof document === 'undefined' ? null : document.documentElement;
}

/** 读取已保存的皮肤；非法值 / 无存储 / 读取抛错一律回落默认皮肤 */
export function readTheme(store: ThemeStore | null = defaultStore()): ThemeId {
  if (!store) return DEFAULT_THEME;
  try {
    const raw = store.getItem(THEME_STORAGE_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** 保存皮肤；写失败（配额满/隐私模式）不抛错，只影响下次打开时的记忆 */
export function saveTheme(id: ThemeId, store: ThemeStore | null = defaultStore()): void {
  if (!store) return;
  try {
    store.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* 忽略：本次会话仍然生效 */
  }
}

/** 把皮肤写到 <html data-theme="...">，styles.css 的变量块据此生效 */
export function applyTheme(id: ThemeId, root: ThemeRoot | null = defaultRoot()): void {
  if (!root) return;
  root.dataset.theme = id;
}

/** 启动时应用已保存的皮肤（main.tsx 在 render 前调用，避免默认皮肤一闪） */
export function initTheme(store: ThemeStore | null = defaultStore()): ThemeId {
  const id = readTheme(store);
  applyTheme(id);
  return id;
}

/** 未知键的兜底色（中性灰蓝，与两套皮肤都不冲突） */
const FALLBACK_COLOR = '#9aa3c0';

/** 元素配色，键 = data/characters 的 meta.element 小写形式（7 种） */
export const ELEMENT_COLORS: Readonly<Record<string, string>> = {
  physical: '#dcdcdc',
  fire: '#ff7a4d',
  ice: '#8fd6ff',
  thunder: '#c07bf0',
  wind: '#5ee6a8',
  quantum: '#7d6bff',
  imaginary: '#f7e05c',
};

/** 命途配色，键 = meta.path 小写形式（与 apps/web/public/pathicon/*.webp 同名，9 种） */
export const PATH_COLORS: Readonly<Record<string, string>> = {
  warrior: '#ff6b6b',
  rogue: '#7fe0c8',
  mage: '#7fb4ff',
  shaman: '#f2d16b',
  warlock: '#b48cff',
  knight: '#ffa95c',
  priest: '#8ee08a',
  memory: '#9fd8ff',
  elation: '#ff8fc8',
};

/** 稀有度配色：5★ 金 / 4★ 紫，其余走兜底色 */
export const RARITY_COLORS: Readonly<Record<number, string>> = {
  5: '#e8c87a',
  4: '#b57ce0',
};

/** 元素色（大小写不敏感；未知元素回落兜底色） */
export function elementColor(element: string | undefined | null): string {
  return ELEMENT_COLORS[String(element ?? '').toLowerCase()] ?? FALLBACK_COLOR;
}

/** 命途色（大小写不敏感；未知命途回落兜底色） */
export function pathColor(path: string | undefined | null): string {
  return PATH_COLORS[String(path ?? '').toLowerCase()] ?? FALLBACK_COLOR;
}

/** 稀有度色（未提供或未知星级回落兜底色） */
export function rarityColor(rarity: number | undefined | null): string {
  return RARITY_COLORS[rarity ?? 0] ?? FALLBACK_COLOR;
}
