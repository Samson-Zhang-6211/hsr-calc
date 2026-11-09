import {
  detectPanel,
  detectRowBands,
  hasInk,
  inkBox,
  normalizeGlyph,
  rasterize,
  segmentGlyphs,
  zones,
  type Box,
  type PanelBox,
  type Raster,
} from './pixels.js';
import {
  digitTemplates,
  headerTemplates,
  iconTemplates,
  labelTemplates,
  nearest,
  TEMPLATE_META,
  vectorDistance,
  type GlyphTemplate,
} from './templates.js';
import { OCR_FIELDS, OCR_SECTION_START } from './rows.js';

/**
 * 识别管线（无 UI、无副作用）：
 *   ImageData → 面板 → 行带 → 值/加成/图标/标签 → 行身份（图标+标签+行序 DP）→ 多图合并
 *
 * 口径（2026-10-28 用户裁定）：
 * - 识别到的是**游戏内最终面板**：所有非条件子句已计入，写入时不得再重算/叠加。
 * - 能量恢复效率面板值是「总值」（119.4%），写入字段是「加成」（0.194），见 mapping.ts。
 */

export interface GlyphRead {
  text: string;
  /** 0..1（最近邻距离换算） */
  confidence: number;
  distances: number[];
}

export interface IdentityRead {
  key: string;
  distance: number;
  margin: number;
  vec: Float32Array;
}

export interface RowRead {
  y0: number;
  y1: number;
  value: GlyphRead;
  bonus: GlyphRead;
  icon: IdentityRead | null;
  label: IdentityRead | null;
  /** 行带高度 / 面板高度（用于过滤局部截断行） */
  heightRatio: number;
}

export interface HeaderRead {
  key: string;
  distance: number;
  y0: number;
}

export interface PanelRead {
  panel: PanelBox;
  rows: RowRead[];
  headers: HeaderRead[];
}

export interface AlignedRow extends RowRead {
  slot: number;
  /** 值识别与行身份的最低置信度 */
  confidence: number;
  /** 行身份置信度（图标/标签中较高者，按分配到的 slot 计） */
  identityConfidence: number;
  cost: number;
}

export interface PanelAlignment {
  panel: PanelBox;
  rows: AlignedRow[];
  headers: HeaderRead[];
  /** 行对齐平均代价 */
  averageCost: number;
}

export interface MergedSlot {
  slot: number;
  raw: string;
  value: string;
  bonus: string;
  confidence: number;
  /** 出现过的图序号（0-based） */
  images: number[];
}

export type MergeWarning =
  | { kind: 'conflict'; slot: number }
  | { kind: 'missing'; slot: number }
  | { kind: 'low-confidence'; slot: number }
  | { kind: 'alignment'; averageCost: number };

export interface MergeResult {
  slots: (MergedSlot | null)[];
  warnings: MergeWarning[];
  coverage: number;
  imageCount: number;
}

const DIGIT_CHARS = /^[0-9.%]+$/;
const NUMBER_CHARS = /^[0-9]+$/;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 某一行的身份置信度：分配给该 slot 的距离 vs 其它 slot 的最近距离（margin 越大越唯一） */
function slotConfidence(dists: number[], slot: number): number {
  const d = dists[slot] ?? 1;
  let second = Infinity;
  for (let j = 0; j < dists.length; j++) {
    if (j !== slot && dists[j] < second) second = dists[j];
  }
  const margin = Number.isFinite(second) ? second - d : 0;
  return clamp01(0.5 + margin * 6 - Math.max(0, d - 0.04) * 1.5);
}

function classifyGlyphs(raster: Raster, y0: number, y1: number, x0: number, x1: number): GlyphRead {
  const boxes = segmentGlyphs(raster, y0, y1, x0, x1);
  const templates = digitTemplates();
  const chars: string[] = [];
  const distances: number[] = [];
  const margins: number[] = [];
  for (const box of boxes) {
    const vec = normalizeGlyph(raster, box, TEMPLATE_META.digitW, TEMPLATE_META.digitH, TEMPLATE_META.digitGlyphH);
    const hit = nearest(vec, templates);
    if (!hit) continue;
    chars.push(hit.key);
    distances.push(hit.distance);
    margins.push(hit.margin);
  }
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
  // 绝对距离会被亚像素/JPEG 渲染差异抬高；用「最近邻 vs 次近邻」的 margin 判歧义更稳
  return { text: chars.join(''), confidence: clamp01(0.5 + avgMargin * 5), distances };
}

function readIdentity(
  raster: Raster,
  box: Box | null,
  templates: readonly GlyphTemplate[],
  canvasW: number,
  canvasH: number,
  glyphH: number,
): IdentityRead | null {
  if (!box) return null;
  const vec = normalizeGlyph(raster, box, canvasW, canvasH, glyphH);
  const hit = nearest(vec, templates);
  return hit ? { key: hit.key, distance: hit.distance, margin: hit.margin, vec } : null;
}

/** 单张图识别（无面板返回 null） */
export function recognizePanel(image: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): PanelRead | null {
  const raster = rasterize(image.data, image.width, image.height);
  const panel = detectPanel(raster);
  if (!panel) return null;
  const ph = panel.bottom - panel.top;
  const z = zones(panel);
  const icons = iconTemplates();
  const labels = labelTemplates();
  const minRowHeight = ph * 0.022;
  const rows: RowRead[] = [];
  const headers: HeaderRead[] = [];

  for (const band of detectRowBands(raster, panel)) {
    const height = band.y1 - band.y0 + 1;
    const hasValue = hasInk(raster, band.y0, band.y1, z.value[0], z.value[1]);
    if (hasValue && height >= minRowHeight) {
      const value = classifyGlyphs(raster, band.y0 - 2, band.y1 + 2, z.value[0], z.value[1]);
      const bonusBox = inkBox(raster, band.y0 - 2, band.y1 + 2, z.bonus[0], z.bonus[1]);
      const bonus = bonusBox
        ? classifyGlyphs(raster, band.y0 - 2, band.y1 + 2, z.bonus[0], z.bonus[1])
        : { text: '', confidence: 1, distances: [] };
      if (!DIGIT_CHARS.test(value.text)) value.confidence *= 0.3;
      if (bonus.text && !NUMBER_CHARS.test(bonus.text.replace(/^\+/, ''))) bonus.confidence *= 0.3;
      const iconBox = inkBox(raster, band.y0 - 3, band.y1 + 3, z.icon[0], z.icon[1]);
      const labelBox = inkBox(raster, band.y0 - 3, band.y1 + 3, z.label[0], z.label[1]);
      rows.push({
        y0: band.y0,
        y1: band.y1,
        value,
        bonus,
        icon: readIdentity(raster, iconBox, icons, TEMPLATE_META.iconW, TEMPLATE_META.iconH, TEMPLATE_META.iconGlyphH),
        label: readIdentity(
          raster,
          labelBox,
          labels,
          TEMPLATE_META.labelW,
          TEMPLATE_META.labelH,
          TEMPLATE_META.labelGlyphH,
        ),
        heightRatio: height / ph,
      });
    } else if (!hasValue && height >= ph * 0.015 && height <= ph * 0.06) {
      const headerBox = inkBox(raster, band.y0, band.y1, z.header[0], z.header[1]);
      if (headerBox) {
        const vec = normalizeGlyph(raster, headerBox, TEMPLATE_META.labelW, TEMPLATE_META.labelH, TEMPLATE_META.labelGlyphH);
        const hit = nearest(vec, headerTemplates());
        if (hit && hit.distance < 0.08) headers.push({ key: hit.key, distance: hit.distance, y0: band.y0 });
      }
    }
  }
  if (rows.length === 0) return null;
  return { panel, rows, headers };
}

/**
 * 行对齐：图标为主、标签为辅，允许跳过（条件隐藏/局部截断）与中途起止。
 * 代价 = iconD + 0.5·labelD；DP 目标再加 skipPenalty×跳过行数。
 */
export function alignPanel(read: PanelRead): PanelAlignment | null {
  const rows = read.rows;
  const n = rows.length;
  const slotCount = OCR_FIELDS.length;
  if (n === 0 || n > slotCount) return null;
  const icons = iconTemplates();
  const labels = labelTemplates();

  const iconD: number[][] = rows.map((row) =>
    row.icon ? icons.map((t) => vectorDistance(row.icon!.vec, t.vec)) : new Array(slotCount).fill(1),
  );
  const labelD: number[][] = rows.map((row) =>
    row.label ? labels.map((t) => vectorDistance(row.label!.vec, t.vec)) : new Array(slotCount).fill(1),
  );
  const costMat: number[][] = rows.map((_, i) =>
    Array.from({ length: slotCount }, (_, j) => iconD[i][j] + 0.5 * labelD[i][j]),
  );

  const SKIP = 0.02;
  const INF = 1e9;
  const dp: number[][] = Array.from({ length: n }, () => new Array<number>(slotCount).fill(INF));
  const back: number[][] = Array.from({ length: n }, () => new Array<number>(slotCount).fill(-1));
  for (let j = 0; j < slotCount; j++) dp[0][j] = costMat[0][j];
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < slotCount; j++) {
      for (let k = 0; k < j; k++) {
        const cand = dp[i - 1][k] + SKIP * (j - k - 1) + costMat[i][j];
        if (cand < dp[i][j]) {
          dp[i][j] = cand;
          back[i][j] = k;
        }
      }
    }
  }
  let endSlot = -1;
  let endCost = INF;
  for (let j = 0; j < slotCount; j++) {
    if (dp[n - 1][j] < endCost) {
      endCost = dp[n - 1][j];
      endSlot = j;
    }
  }
  if (endSlot < 0) return null;
  const assigned = new Array<number>(n).fill(-1);
  let cur = endSlot;
  for (let i = n - 1; i >= 0; i--) {
    assigned[i] = cur;
    if (i > 0) cur = back[i][cur];
  }

  const aligned: AlignedRow[] = rows.map((row, i) => {
    const slot = assigned[i];
    const valueConfidence = Math.min(row.value.confidence, row.bonus.confidence);
    const identityConfidence = Math.max(slotConfidence(iconD[i], slot), slotConfidence(labelD[i], slot));
    return {
      ...row,
      slot,
      confidence: Math.min(valueConfidence, identityConfidence),
      identityConfidence,
      cost: costMat[i][slot],
    };
  });
  const averageCost = n ? aligned.reduce((a, r) => a + r.cost, 0) / n : 0;
  return { panel: read.panel, rows: aligned, headers: read.headers, averageCost };
}

/** 多图合并：同一行取置信度最高的一次；数值不一致记冲突 */
export function mergePanels(alignments: PanelAlignment[]): MergeResult {
  const slots: (MergedSlot | null)[] = new Array(OCR_FIELDS.length).fill(null);
  const conflicts = new Set<number>();
  const low = new Set<number>();
  alignments.forEach((alignment, imageIndex) => {
    for (const row of alignment.rows) {
      const raw = row.bonus.text ? `${row.value.text} ${row.bonus.text}` : row.value.text;
      const prev = slots[row.slot];
      if (!prev) {
        slots[row.slot] = {
          slot: row.slot,
          raw,
          value: row.value.text,
          bonus: row.bonus.text,
          confidence: row.confidence,
          images: [imageIndex],
        };
      } else {
        if (prev.value !== row.value.text || prev.bonus !== row.bonus.text) conflicts.add(row.slot);
        prev.images.push(imageIndex);
        if (row.confidence > prev.confidence) {
          prev.confidence = row.confidence;
          prev.raw = raw;
          prev.value = row.value.text;
          prev.bonus = row.bonus.text;
        }
      }
      if (row.confidence < 0.5) low.add(row.slot);
    }
  });
  const warnings: MergeWarning[] = [];
  for (const slot of conflicts) warnings.push({ kind: 'conflict', slot });
  for (let slot = 0; slot < slots.length; slot++) if (!slots[slot]) warnings.push({ kind: 'missing', slot });
  for (const slot of low) warnings.push({ kind: 'low-confidence', slot });
  const maxCost = alignments.length ? Math.max(...alignments.map((a) => a.averageCost)) : 0;
  if (maxCost > 0.25) warnings.push({ kind: 'alignment', averageCost: maxCost });
  const coverage = slots.filter(Boolean).length / slots.length;
  return { slots, warnings, coverage, imageCount: alignments.length };
}

/** 识别入口：多张 ImageData → 对齐 + 合并 */
export function recognizeImages(
  images: readonly { data: Uint8ClampedArray; width: number; height: number }[],
): { merge: MergeResult; panels: PanelRead[]; alignments: PanelAlignment[]; failed: number } {
  const panels: PanelRead[] = [];
  const alignments: PanelAlignment[] = [];
  let failed = 0;
  for (const image of images) {
    const read = recognizePanel(image);
    if (!read) {
      failed++;
      continue;
    }
    panels.push(read);
    const aligned = alignPanel(read);
    if (aligned) alignments.push(aligned);
  }
  return { merge: mergePanels(alignments), panels, alignments, failed };
}

/** 段落标题与对齐结果的一致性检查（返回冲突的标题 key） */
export function headerConflicts(alignment: PanelAlignment): string[] {
  const out: string[] = [];
  for (const header of alignment.headers) {
    const start = OCR_SECTION_START[header.key as keyof typeof OCR_SECTION_START];
    if (start === undefined) continue;
    const first = alignment.rows.find((r) => r.y0 > header.y0);
    if (first && first.slot !== start) out.push(header.key);
  }
  return out;
}
