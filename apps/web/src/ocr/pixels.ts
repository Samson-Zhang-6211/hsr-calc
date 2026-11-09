/**
 * OCR 像素层：RGBA → 墨迹/亮度平面，面板/行/字形定位，归一化。
 *
 * 口径来自 2026-10-28 手机横屏样本标定（2750×1260，面板 1637×839）：
 * - 「属性详情」是浅色面板 + 深色文字；用 min(R,G,B) 判墨迹（蓝字/彩色图标都能覆盖）。
 * - 面板/行的几何全部用**相对面板的比例**，避免写死分辨率。
 */

export interface Raster {
  width: number;
  height: number;
  /** 每像素 min(R,G,B)（判墨迹） */
  min: Uint8Array;
  /** 每像素亮度（判浅色面板） */
  luma: Uint8Array;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

export interface PanelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RowBand {
  y0: number;
  y1: number;
}

/** 相对面板的几何比例（面板 = 浅色属性详情弹窗） */
export const OCR_LAYOUT = {
  valueRight: 0.735,
  valueLeft: 0.614,
  valuePadRight: 0.008,
  bonusLeft: 0.747,
  bonusRight: 0.83,
  iconLeft: 0.032,
  iconRight: 0.068,
  labelLeft: 0.073,
  labelRight: 0.3,
  headerLeft: 0.03,
  headerRight: 0.25,
  rowX0: 0.02,
  rowX1: 0.92,
  /** 行带阈值：面板宽度的千分比（原生 1637 → 6.5） */
  rowThreshold: 0.004,
} as const;

const INK_OFFSET = 190;
const INK_SCALE = 140;
const DARK = 150;

export function rasterize(data: Uint8ClampedArray, width: number, height: number): Raster {
  const n = width * height;
  const min = new Uint8Array(n);
  const luma = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    min[i] = r < g ? (r < b ? r : b) : g < b ? g : b;
    luma[i] = (0.299 * r + 0.587 * g + 0.114 * b + 0.5) | 0;
  }
  return { width, height, min, luma };
}

export function inkAt(r: Raster, x: number, y: number): number {
  const v = (INK_OFFSET - r.min[y * r.width + x]) / INK_SCALE;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 浅色面板定位：行/列「高亮像素占比」取最大矩形 */
export function detectPanel(r: Raster): PanelBox | null {
  const { width, height } = r;
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    let n = 0;
    let total = 0;
    for (let x = 0; x < width; x += 4, total++) if (r.luma[y * width + x] > 170) n++;
    rows.push(n / total);
  }
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    if (rows[y] > 0.45) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (top < 0 || bottom - top < height * 0.25) return null;

  const cols: number[] = [];
  for (let x = 0; x < width; x++) {
    let n = 0;
    let total = 0;
    for (let y = top; y <= bottom; y += 3, total++) if (r.luma[y * width + x] > 170) n++;
    cols.push(n / total);
  }
  let left = -1;
  let right = -1;
  for (let x = 0; x < width; x++) {
    if (cols[x] > 0.5) {
      if (left < 0) left = x;
      right = x;
    }
  }
  if (left < 0 || right - left < width * 0.25) return null;
  return { left, top, right, bottom };
}

/** 行带：面板内深色像素的行投影（排除右侧滚动条区） */
export function detectRowBands(r: Raster, panel: PanelBox): RowBand[] {
  const pw = panel.right - panel.left;
  const x0 = Math.round(panel.left + pw * OCR_LAYOUT.rowX0);
  const x1 = Math.round(panel.left + pw * OCR_LAYOUT.rowX1);
  const counts: number[] = [];
  for (let y = panel.top; y <= panel.bottom; y++) {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (r.min[y * r.width + x] < DARK) n++;
    counts.push(n);
  }
  const th = Math.max(3, Math.round(pw * OCR_LAYOUT.rowThreshold));
  const out: RowBand[] = [];
  let cur: RowBand | null = null;
  for (let i = 0; i < counts.length; i++) {
    const y = panel.top + i;
    if (counts[i] >= th) {
      if (!cur) cur = { y0: y, y1: y };
      else cur.y1 = y;
    } else if (cur) {
      if (cur.y1 - cur.y0 >= 5) out.push(cur);
      cur = null;
    }
  }
  if (cur && cur.y1 - cur.y0 >= 5) out.push(cur);
  return out;
}

/** 值区/加成区/图标区/标签区/标题区（面板相对坐标） */
export function zones(panel: PanelBox) {
  const pw = panel.right - panel.left;
  const at = (f: number) => panel.left + pw * f;
  return {
    value: [at(OCR_LAYOUT.valueLeft), at(OCR_LAYOUT.valueRight + OCR_LAYOUT.valuePadRight)] as const,
    bonus: [at(OCR_LAYOUT.bonusLeft), at(OCR_LAYOUT.bonusRight)] as const,
    icon: [at(OCR_LAYOUT.iconLeft), at(OCR_LAYOUT.iconRight)] as const,
    label: [at(OCR_LAYOUT.labelLeft), at(OCR_LAYOUT.labelRight)] as const,
    header: [at(OCR_LAYOUT.headerLeft), at(OCR_LAYOUT.headerRight)] as const,
  };
}

/** 区域内是否有墨迹（值区判空用） */
export function hasInk(r: Raster, y0: number, y1: number, x0: number, x1: number): boolean {
  const X0 = Math.max(0, Math.round(x0));
  const X1 = Math.min(r.width - 1, Math.round(x1));
  const Y0 = Math.max(0, Math.round(y0));
  const Y1 = Math.min(r.height - 1, Math.round(y1));
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) if (r.min[y * r.width + x] < DARK) return true;
  }
  return false;
}

/** 区域内墨迹的紧致边界 */
export function inkBox(r: Raster, y0: number, y1: number, x0: number, x1: number): Box | null {
  const X0 = Math.max(0, Math.round(x0));
  const X1 = Math.min(r.width - 1, Math.round(x1));
  const Y0 = Math.max(0, Math.round(y0));
  const Y1 = Math.min(r.height - 1, Math.round(y1));
  let ax = Infinity;
  let ay = Infinity;
  let bx = -1;
  let by = -1;
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      if (r.min[y * r.width + x] < DARK) {
        if (x < ax) ax = x;
        if (x > bx) bx = x;
        if (y < ay) ay = y;
        if (y > by) by = y;
      }
    }
  }
  if (bx < 0) return null;
  return { x0: ax, y0: ay, x1: bx, y1: by, w: bx - ax + 1, h: by - ay + 1 };
}

/**
 * 一行内的字形切分：列投影 → run → 紧致 bbox。
 * 间隙 ≤1px 合并（JPEG 抗锯齿断点），宽/高 <3px 的噪点丢弃；小数点（约 5×5）保留。
 */
export function segmentGlyphs(r: Raster, y0: number, y1: number, x0: number, x1: number): Box[] {
  const X0 = Math.max(0, Math.round(x0));
  const X1 = Math.min(r.width - 1, Math.round(x1));
  const Y0 = Math.max(0, Math.round(y0));
  const Y1 = Math.min(r.height - 1, Math.round(y1));
  const has: boolean[] = [];
  for (let x = X0; x <= X1; x++) {
    let dark = false;
    for (let y = Y0; y <= Y1; y++) {
      if (r.min[y * r.width + x] < DARK) {
        dark = true;
        break;
      }
    }
    has.push(dark);
  }
  const runs: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= has.length; i++) {
    if (has[i]) {
      if (s < 0) s = i;
    } else if (s >= 0) {
      runs.push([s + X0, i - 1 + X0]);
      s = -1;
    }
  }
  for (let i = runs.length - 2; i >= 0; i--) {
    if (runs[i + 1][0] - runs[i][1] <= 1) {
      runs[i][1] = runs[i + 1][1];
      runs.splice(i + 1, 1);
    }
  }
  const out: Box[] = [];
  for (const [a, b] of runs) {
    let yy0 = Infinity;
    let yy1 = -1;
    for (let y = Y0; y <= Y1; y++) {
      for (let x = a; x <= b; x++) {
        if (r.min[y * r.width + x] < DARK) {
          if (y < yy0) yy0 = y;
          yy1 = y;
          break;
        }
      }
    }
    const w = b - a + 1;
    const h = yy1 - yy0 + 1;
    if (w < 3 || h < 3) continue;
    out.push({ x0: a, y0: yy0, x1: b, y1: yy1, w, h });
  }
  return out;
}

/**
 * 归一化：按高度缩放到 glyphH，保持宽高比，水平居中到 canvas。
 * 与 scripts/gen-ocr-templates.mjs 的 norm() 必须逐位一致，否则模板对不上。
 */
export function normalizeGlyph(
  r: Raster,
  box: Box,
  canvasW: number,
  canvasH: number,
  glyphH: number,
): Float32Array {
  const out = new Float32Array(canvasW * canvasH);
  const scale = glyphH / box.h;
  const nw = Math.max(1, Math.round(box.w * scale));
  const ox = (canvasW - nw) / 2;
  const oy = (canvasH - glyphH) / 2;
  for (let cy = 0; cy < glyphH; cy++) {
    for (let cx = 0; cx < nw; cx++) {
      const sx = box.x0 + (cx + 0.5) / scale - 0.5;
      const sy = box.y0 + (cy + 0.5) / scale - 0.5;
      const xf = Math.floor(sx);
      const yf = Math.floor(sy);
      const fx = sx - xf;
      const fy = sy - yf;
      const px = (x: number, y: number) =>
        inkAt(r, Math.max(0, Math.min(r.width - 1, x)), Math.max(0, Math.min(r.height - 1, y)));
      const v =
        (px(xf, yf) * (1 - fx) + px(xf + 1, yf) * fx) * (1 - fy) +
        (px(xf, yf + 1) * (1 - fx) + px(xf + 1, yf + 1) * fx) * fy;
      const xx = Math.round(ox + cx);
      const yy = Math.round(oy + cy);
      if (xx >= 0 && xx < canvasW && yy >= 0 && yy < canvasH) out[yy * canvasW + xx] = v;
    }
  }
  return out;
}
