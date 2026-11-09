import {
  OCR_DIGITS,
  OCR_HEADERS,
  OCR_ICONS,
  OCR_LABELS,
  OCR_META,
  OCR_TEMPLATE_VERSION,
} from './templates-data.js';

/**
 * 模板运行时：把生成器产出的量化像素（base64 Uint8，0..255）解成 0..1 的 Float32 向量。
 * 只在首次识别时解码一次；模板来源于校准截图，不含截图本身。
 */
export interface GlyphTemplate {
  /** 数字字符（0-9 / . / % / +），或行 key（图标/标签/标题） */
  key: string;
  vec: Float32Array;
}

export const TEMPLATE_META = OCR_META;
export const TEMPLATE_VERSION = OCR_TEMPLATE_VERSION;

const decode = (b64: string): Float32Array => {
  const bin = atob(b64);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) / 255;
  return out;
};

let digitCache: GlyphTemplate[] | null = null;
let iconCache: GlyphTemplate[] | null = null;
let labelCache: GlyphTemplate[] | null = null;
let headerCache: GlyphTemplate[] | null = null;

export function digitTemplates(): GlyphTemplate[] {
  digitCache ??= OCR_DIGITS.map((d) => ({ key: d.ch, vec: decode(d.data) }));
  return digitCache;
}

export function iconTemplates(): GlyphTemplate[] {
  iconCache ??= OCR_ICONS.map((data, i) => ({ key: String(i), vec: decode(data) }));
  return iconCache;
}

export function labelTemplates(): GlyphTemplate[] {
  labelCache ??= OCR_LABELS.map((data, i) => ({ key: String(i), vec: decode(data) }));
  return labelCache;
}

export function headerTemplates(): GlyphTemplate[] {
  headerCache ??= OCR_HEADERS.map((h) => ({ key: h.key, vec: decode(h.data) }));
  return headerCache;
}

/** 均方根距离（0..1 量级；越小越像） */
export function vectorDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 1;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s / a.length);
}

/** 最近邻 + 次近邻（margin 按**不同字符/行**算，同类实例不互相压低置信度） */
export function nearest(
  vec: Float32Array,
  templates: readonly GlyphTemplate[],
): { key: string; distance: number; margin: number } | null {
  const byKey = new Map<string, number>();
  for (const t of templates) {
    const d = vectorDistance(vec, t.vec);
    const prev = byKey.get(t.key);
    if (prev === undefined || d < prev) byKey.set(t.key, d);
  }
  let bestKey = '';
  let best = Infinity;
  let second = Infinity;
  for (const [key, d] of byKey) {
    if (d < best) {
      second = best;
      best = d;
      bestKey = key;
    } else if (d < second) {
      second = d;
    }
  }
  if (!Number.isFinite(best)) return null;
  return { key: bestKey, distance: best, margin: Number.isFinite(second) ? second - best : 1 };
}
