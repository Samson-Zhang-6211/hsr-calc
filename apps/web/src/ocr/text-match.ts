/**
 * 闭集名字匹配（2026-10-30）：汉仪旗黑 65W 渲染的 163 个名字模板 vs 视频文字行。
 * 只用二值形状，不依赖 CJK OCR 引擎；用于遗器页右侧套装名与角色页左上角色名。
 */
import { NAME_TEMPLATES, type NameTemplate } from './name-templates.js';

export interface NameHit {
  id: string;
  name: string;
  score: number;
  kind: 'relic' | 'char';
}

type Frame = { data: Uint8ClampedArray; width: number; height: number };

interface TemplateBits {
  t: NameTemplate;
  bits: Uint8Array;
}

function decodeBits(t: NameTemplate): Uint8Array {
  const bin = atob(t.data);
  const bits = new Uint8Array(t.w * t.h);
  for (let i = 0; i < bits.length; i++) bits[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  return bits;
}

let cache: TemplateBits[] | null = null;
function templates(): TemplateBits[] {
  cache ??= NAME_TEMPLATES.map((t) => ({ t, bits: decodeBits(t) }));
  return cache;
}

/** 把一块文字区域归一成 20px 高二值图；无文字返回 null */
function norm(frame: Frame, x0: number, y0: number, x1: number, y1: number): { bits: Uint8Array; w: number } | null {
  const X0 = Math.max(0, Math.floor(x0 * frame.width));
  const Y0 = Math.max(0, Math.floor(y0 * frame.height));
  const X1 = Math.min(frame.width - 1, Math.ceil(x1 * frame.width));
  const Y1 = Math.min(frame.height - 1, Math.ceil(y1 * frame.height));
  if (X1 <= X0 || Y1 <= Y0) return null;
  const w = X1 - X0 + 1;
  const h = Y1 - Y0 + 1;
  const bright = new Uint8Array(w * h);
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = ((Y0 + y) * frame.width + X0 + x) * 4;
      const l = 0.299 * frame.data[p] + 0.587 * frame.data[p + 1] + 0.114 * frame.data[p + 2];
      if (l > 150) {
        bright[y * w + x] = 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const nw = Math.max(1, Math.round((bw * 20) / bh));
  const bits = new Uint8Array(nw * 20);
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = minX + Math.floor((x * bw) / nw);
      const sy = minY + Math.floor((y * bh) / 20);
      bits[y * nw + x] = bright[sy * w + sx];
    }
  }
  return { bits, w: nw };
}

const COMMON_W = 128;
const COMMON_H = 20;

function compare(a: { bits: Uint8Array; w: number }, b: { bits: Uint8Array; w: number }): number {
  let mismatch = 0;
  for (let y = 0; y < COMMON_H; y++) {
    for (let x = 0; x < COMMON_W; x++) {
      const av = a.bits[Math.floor((y * 20) / COMMON_H) * a.w + Math.floor((x * a.w) / COMMON_W)] ?? 0;
      const bv = b.bits[Math.floor((y * 20) / COMMON_H) * b.w + Math.floor((x * b.w) / COMMON_W)] ?? 0;
      if (av !== bv) mismatch++;
    }
  }
  const shape = 1 - mismatch / (COMMON_W * COMMON_H);
  const ratio = Math.exp(-Math.abs(Math.log((a.w / 20) / (b.w / 20))));
  return shape * 0.75 + ratio * 0.25;
}

/** 一块文字区域的最佳名字候选（top 5） */
export function matchNameLine(frame: Frame, box: readonly [number, number, number, number], kind: 'relic' | 'char'): NameHit[] {
  const n = norm(frame, box[0], box[1], box[2], box[3]);
  if (!n) return [];
  const hits = templates()
    .filter((x) => x.t.kind === kind)
    .map((x) => ({ id: x.t.id, name: x.t.name, kind: x.t.kind, score: compare(n, { bits: x.bits, w: x.t.w }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  return hits;
}

/** 在一大块区域里按行扫描文字行，每行取最佳名字；用于右侧套装效果列表 / 左上角色名 */
export function findNameHits(frame: Frame, box: readonly [number, number, number, number], kind: 'relic' | 'char'): NameHit[] {
  const X0 = Math.max(0, Math.floor(box[0] * frame.width));
  const Y0 = Math.max(0, Math.floor(box[1] * frame.height));
  const X1 = Math.min(frame.width - 1, Math.ceil(box[2] * frame.width));
  const Y1 = Math.min(frame.height - 1, Math.ceil(box[3] * frame.height));
  const rows: number[] = [];
  for (let y = Y0; y <= Y1; y++) {
    let n = 0;
    for (let x = X0; x <= X1; x++) {
      const p = (y * frame.width + x) * 4;
      if (frame.data[p] + frame.data[p + 1] + frame.data[p + 2] > 430) n++;
    }
    rows.push(n);
  }
  const bands: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= rows.length; i++) {
    const on = i < rows.length && rows[i] > 1;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      const y0 = Y0 + start;
      const y1 = Y0 + i - 1;
      if (y1 - y0 >= 8 && y1 - y0 <= 60) bands.push([y0, y1]);
      start = -1;
    }
  }
  const hits: NameHit[] = [];
  for (const [y0, y1] of bands) {
    const h = matchNameLine(frame, [box[0], (y0 - 2) / frame.height, box[2], (y1 + 2) / frame.height], kind)[0];
    if (h) hits.push(h);
  }
  return hits.sort((a, b) => b.score - a.score);
}
