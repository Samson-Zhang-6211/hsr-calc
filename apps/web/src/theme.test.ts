import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  ELEMENT_COLORS,
  PATH_COLORS,
  RARITY_COLORS,
  THEME_IDS,
  THEME_STORAGE_KEY,
  applyTheme,
  elementColor,
  isThemeId,
  nextTheme,
  pathColor,
  rarityColor,
  readTheme,
  saveTheme,
  type ThemeRoot,
  type ThemeStore,
} from './theme.js';

/** 内存版 store，模拟 localStorage */
function memStore(initial: Record<string, string> = {}): ThemeStore & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? (data[key] ?? null) : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

/** 拒绝一切访问的 store，模拟隐私模式 / 配额满 */
const blockedStore: ThemeStore = {
  getItem() {
    throw new Error('storage blocked');
  },
  setItem() {
    throw new Error('storage blocked');
  },
};

function memRoot(): ThemeRoot {
  return { dataset: {} };
}

describe('皮肤 id 与循环切换', () => {
  it('默认皮肤在皮肤清单内，清单不重复', () => {
    expect(THEME_IDS).toContain(DEFAULT_THEME);
    expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length);
    expect(THEME_IDS).toEqual(['astra', 'neon']);
  });

  it('isThemeId 只接受清单内的字符串', () => {
    expect(isThemeId('astra')).toBe(true);
    expect(isThemeId('neon')).toBe(true);
    expect(isThemeId('rainbow')).toBe(false);
    expect(isThemeId('')).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(1)).toBe(false);
  });

  it('nextTheme 在两个皮肤之间循环（顶栏按钮点一下换一套）', () => {
    expect(nextTheme('astra')).toBe('neon');
    expect(nextTheme('neon')).toBe('astra');
    expect(nextTheme(nextTheme('astra'))).toBe('astra');
  });
});

describe('皮肤的读取与保存', () => {
  it('无存储 / 空存储时回落默认皮肤', () => {
    expect(readTheme(null)).toBe(DEFAULT_THEME);
    expect(readTheme(memStore())).toBe(DEFAULT_THEME);
  });

  it('读到已保存的皮肤', () => {
    expect(readTheme(memStore({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('neon');
    expect(readTheme(memStore({ [THEME_STORAGE_KEY]: 'astra' }))).toBe('astra');
  });

  it('存了非法值时回落默认皮肤', () => {
    expect(readTheme(memStore({ [THEME_STORAGE_KEY]: 'rainbow' }))).toBe(DEFAULT_THEME);
    expect(readTheme(memStore({ [THEME_STORAGE_KEY]: '' }))).toBe(DEFAULT_THEME);
  });

  it('存储访问抛错时不抛异常（隐私模式）', () => {
    expect(readTheme(blockedStore)).toBe(DEFAULT_THEME);
    expect(() => saveTheme('neon', blockedStore)).not.toThrow();
  });

  it('saveTheme 用固定键名写入，值就是皮肤 id', () => {
    const store = memStore();
    saveTheme('neon', store);
    expect(store.data[THEME_STORAGE_KEY]).toBe('neon');
    saveTheme('astra', store);
    expect(store.data[THEME_STORAGE_KEY]).toBe('astra');
    expect(Object.keys(store.data)).toEqual([THEME_STORAGE_KEY]);
  });
});

describe('皮肤应用（<html data-theme>）', () => {
  it('applyTheme 把皮肤写到 dataset.theme', () => {
    const root = memRoot();
    applyTheme('neon', root);
    expect(root.dataset.theme).toBe('neon');
    applyTheme('astra', root);
    expect(root.dataset.theme).toBe('astra');
  });

  it('没有根节点时不抛异常（node 环境）', () => {
    expect(() => applyTheme('neon', null)).not.toThrow();
  });
});

describe('元素 / 命途 / 稀有度配色', () => {
  const HEX = /^#[0-9a-f]{6}$/;

  it('七种元素都有配色，大小写不敏感', () => {
    expect(Object.keys(ELEMENT_COLORS)).toHaveLength(7);
    expect(elementColor('Wind')).toBe(ELEMENT_COLORS.wind);
    expect(elementColor('wind')).toBe(ELEMENT_COLORS.wind);
    expect(elementColor('IMAGINARY')).toBe(ELEMENT_COLORS.imaginary);
    expect(elementColor('Physical')).toBe(ELEMENT_COLORS.physical);
  });

  it('九种命途都有配色（与 pathicon 图标同名）', () => {
    expect(Object.keys(PATH_COLORS)).toHaveLength(9);
    expect(pathColor('Memory')).toBe(PATH_COLORS.memory);
    expect(pathColor('Elation')).toBe(PATH_COLORS.elation);
    expect(pathColor('Shaman')).toBe(PATH_COLORS.shaman);
  });

  it('稀有度：5★ 金、4★ 紫，其余回落兜底色', () => {
    expect(rarityColor(5)).toBe(RARITY_COLORS[5]);
    expect(rarityColor(4)).toBe(RARITY_COLORS[4]);
    expect(rarityColor(3)).toBe(rarityColor(undefined));
    expect(rarityColor(undefined)).toBe(rarityColor(null));
  });

  it('未知元素 / 命途回落兜底色，而不是 undefined', () => {
    expect(elementColor('dragon')).toBe(elementColor(undefined));
    expect(elementColor(undefined)).toMatch(HEX);
    expect(elementColor(null)).toMatch(HEX);
    expect(pathColor('')).toMatch(HEX);
    expect(pathColor('trailblaze')).toBe(pathColor('nope'));
    expect(pathColor(undefined)).toMatch(HEX);
  });

  it('所有色值都是合法十六进制，避免写错字面量', () => {
    const all = [
      ...Object.values(ELEMENT_COLORS),
      ...Object.values(PATH_COLORS),
      ...Object.values(RARITY_COLORS),
      elementColor(undefined),
    ];
    for (const color of all) expect(color).toMatch(HEX);
  });
});
