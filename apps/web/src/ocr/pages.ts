/**
 * 全量视频页识别（2026-10-29 样例：绯英 17.4s / 1572×720）。
 *
 * 设计：
 * - 页面类型不读中文标题：属性面板靠浅色面板检测；角色页靠左侧菜单**金色选中项**的 y 位置。
 * - 光锥/遗器：读本地 public 卡面/套装图，16×16 颜色描述子比对，给候选（用户裁定：图像比对 + 候选确认）。
 * - 行迹：5 个固定等级框，白字反色后复用面板数字模板。
 * - 星魂：6 个节点中心饱和度（已解锁彩色 / 锁定灰暗）。
 *
 * 本模块只做纯计算 + 本地资源读取；不写任何存档。
 */

import { assetUrl } from '../asset-url.js';
import { LIGHTCONE_ROSTER } from '../data/lightcone-roster.js';
import { RELICSET_ROSTER } from '../data/relicset-roster.js';
import { normalizeGlyph, rasterize, segmentGlyphs } from './pixels.js';
import { TEMPLATE_META, digitTemplates, nearest } from './templates.js';
import { findNameHits, type NameHit } from './text-match.js';

export interface ImageFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** 角色页（左侧菜单）；面板单独由 detectPanel 处理 */
export type VideoPageKind =
  | 'lightcone'
  | 'traces'
  | 'relics'
  | 'eidolons'
  | 'details'
  | 'info'
  | 'dress';

export interface AssetCandidate {
  id: string;
  score: number;
}

export interface Descriptor {
  /** 4×4×4 RGB 直方图，归一化 */
  hist: number[];
  /** 8×8 亮度网格，0..1 */
  grid: number[];
}

/** 菜单金色选中项 y 位置（相对屏幕）→ 页面 */
export function detectMenuPage(f: ImageFrame): VideoPageKind | null {
  const { width: w, height: h, data } = f;
  const x0 = Math.floor(w * 0.105);
  const x1 = Math.floor(w * 0.205);
  const y0 = Math.floor(h * 0.08);
  const y1 = Math.floor(h * 0.9);
  let best = 0;
  let bestY = -1;
  for (let y = y0; y < y1; y += 2) {
    let n = 0;
    for (let x = x0; x < x1; x += 2) {
      const p = (y * w + x) * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (r > 170 && g > 130 && b < 125 && r > g + 15 && g > b + 25) n++;
    }
    if (n > best) {
      best = n;
      bestY = y;
    }
  }
  if (best < 3 || bestY < 0) return null;
  const ratio = bestY / h;
  if (ratio < 0.19) return 'details';
  if (ratio < 0.30) return 'lightcone';
  if (ratio < 0.41) return 'traces';
  if (ratio < 0.52) return 'relics';
  if (ratio < 0.63) return 'eidolons';
  if (ratio < 0.74) return 'info';
  if (ratio < 0.87) return 'dress';
  return null;
}

export function cropFrame(
  f: ImageFrame,
  fx0: number,
  fy0: number,
  fx1: number,
  fy1: number,
): ImageFrame {
  const x0 = Math.max(0, Math.min(f.width - 1, Math.floor(fx0 * f.width)));
  const y0 = Math.max(0, Math.min(f.height - 1, Math.floor(fy0 * f.height)));
  const x1 = Math.max(x0 + 1, Math.min(f.width, Math.ceil(fx1 * f.width)));
  const y1 = Math.max(y0 + 1, Math.min(f.height, Math.ceil(fy1 * f.height)));
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * f.width + x0) * 4;
    data.set(f.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { data, width: w, height: h };
}

function invertFrame(f: ImageFrame): ImageFrame {
  const data = new Uint8ClampedArray(f.data.length);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - f.data[i];
    data[i + 1] = 255 - f.data[i + 1];
    data[i + 2] = 255 - f.data[i + 2];
    data[i + 3] = 255;
  }
  return { data, width: f.width, height: f.height };
}

/** 16×16 颜色描述子；ignoreDark 用于视频卡面（跳过卡片外的深色背景） */
export function descriptorOf(f: ImageFrame, ignoreDark = false): Descriptor {
  const hist = new Array<number>(64).fill(0);
  const grid: number[] = [];
  let total = 0;
  for (let gy = 0; gy < 16; gy++) {
    for (let gx = 0; gx < 16; gx++) {
      const sx0 = Math.floor((gx * f.width) / 16);
      const sx1 = Math.max(sx0 + 1, Math.floor(((gx + 1) * f.width) / 16));
      const sy0 = Math.floor((gy * f.height) / 16);
      const sy1 = Math.max(sy0 + 1, Math.floor(((gy + 1) * f.height) / 16));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = sy0; y < sy1; y += 2) {
        for (let x = sx0; x < sx1; x += 2) {
          const p = (y * f.width + x) * 4;
          const cr = f.data[p];
          const cg = f.data[p + 1];
          const cb = f.data[p + 2];
          const luma = 0.299 * cr + 0.587 * cg + 0.114 * cb;
          if (ignoreDark && luma < 28) continue;
          r += cr;
          g += cg;
          b += cb;
          n++;
        }
      }
      if (!n) {
        grid.push(0);
        continue;
      }
      r /= n;
      g /= n;
      b /= n;
      hist[((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)]++;
      total++;
      grid.push((0.299 * r + 0.587 * g + 0.114 * b) / 255);
    }
  }
  for (let i = 0; i < 64; i++) hist[i] = total ? hist[i] / total : 0;
  return { hist, grid };
}

export function descriptorScore(a: Descriptor, b: Descriptor): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 64; i++) {
    dot += a.hist[i] * b.hist[i];
    na += a.hist[i] * a.hist[i];
    nb += b.hist[i] * b.hist[i];
  }
  const cos = dot / (Math.sqrt(na * nb) || 1);
  let se = 0;
  for (let i = 0; i < 64; i++) {
    const d = a.grid[i] - b.grid[i];
    se += d * d;
  }
  const mse = se / 64;
  return 0.6 * cos + 0.4 * (1 - Math.min(1, mse * 4));
}

const assetCache = new Map<string, Promise<Descriptor | null>>();

function loadDescriptor(path: string, key: string): Promise<Descriptor | null> {
  const cached = assetCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    try {
      const res = await fetch(assetUrl(path));
      if (!res.ok) return null;
      const bmp = await createImageBitmap(await res.blob());
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#10131f';
      ctx.fillRect(0, 0, 16, 16);
      ctx.drawImage(bmp, 0, 0, 16, 16);
      if (typeof bmp.close === 'function') bmp.close();
      const img = ctx.getImageData(0, 0, 16, 16);
      // 视频侧 descriptorOf(..., true) 会丢掉暗背景；资产侧也必须丢，否则透明边会被当成黑色大面积参与直方图
      return descriptorOf({ data: img.data, width: 16, height: 16 }, true);
    } catch {
      return null;
    }
  })();
  assetCache.set(key, p);
  return p;
}

function loadAsset(kind: 'lightcone' | 'relicset', id: string): Promise<Descriptor | null> {
  const dir = kind === 'lightcone' ? 'lightcones' : 'relicsets';
  return loadDescriptor(`${dir}/${id}.webp`, `${kind}:${id}`);
}

/** 部位图标：四件套 slot 1..4，位面套 slot 5..6（2026-10-29 从 nanoka relicfigures 下载） */
function loadPiece(setId: string, slot: number): Promise<Descriptor | null> {
  return loadDescriptor(`relicpieces/${setId}-${slot}.webp`, `piece:${setId}:${slot}`);
}

/** 光锥页：卡面 16×16 描述子 → 本地 172 张卡面 top 3；等级/叠影先给默认 80/1 */
export async function recognizeLightconePage(
  f: ImageFrame,
): Promise<{ candidates: AssetCandidate[]; level: number; refinement: number } | null> {
  const card = cropFrame(f, 0.43, 0.2, 0.61, 0.78);
  const desc = descriptorOf(card, true);
  const results = await Promise.all(
    LIGHTCONE_ROSTER.map(async (lc) => {
      const d = await loadAsset('lightcone', lc.id);
      return d ? { id: lc.id, score: descriptorScore(desc, d) } : null;
    }),
  );
  const candidates = results
    .filter((x): x is AssetCandidate => Boolean(x))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!candidates.length) return null;
  return { candidates, level: 80, refinement: 1 };
}

const RELIC_BOXES: readonly (readonly [number, number, number, number])[] = [
  // 图标是圆形（约 110×110），框必须按像素近似正方形，否则部位图被压扁
  // 4 件套：头/脚/手/身
  [0.3467, 0.1389, 0.4167, 0.2917],
  [0.5566, 0.1458, 0.6266, 0.2986],
  [0.299, 0.5833, 0.369, 0.7361],
  [0.5566, 0.75, 0.6266, 0.9028],
  // 位面 2 件：立方 / 球
  [0.3785, 0.4028, 0.4485, 0.5556],
  [0.4739, 0.5764, 0.5439, 0.7292],
];

export interface RelicPageResult {
  four: AssetCandidate[];
  planar: AssetCandidate[];
  /** 每个套装被 6 个图标中多少个「直接命中」：4 件套 = 4，2+2 = 2+2 */
  counts: Record<string, number>;
}

/**
 * 遗器页：6 个部位图标 → 196 张部位图标（34 套×4 + 30 套×2）。
 * 用户 2026-10-29 裁定：必须用「部位图 vs 部位图」，套装徽标比对不准；
 * 再用「一套 4 件/2+2 各 2 件」的成套关系投票，确定四件套还是 2+2。
 */
export async function recognizeRelicPage(f: ImageFrame): Promise<RelicPageResult | null> {
  // 图标外圈是金框，取内部 76% 再比对（部位艺术在环内）
  const inset = 0.12;
  const descs = RELIC_BOXES.map((b) => {
    const w = b[2] - b[0];
    const h = b[3] - b[1];
    return descriptorOf(
      cropFrame(f, b[0] + w * inset, b[1] + h * inset, b[2] - w * inset, b[3] - h * inset),
      true,
    );
  });
  const pieces = await Promise.all(
    RELICSET_ROSTER.flatMap((s) =>
      (s.fourPiece ? [1, 2, 3, 4] : [5, 6]).map(async (slot) => ({
        set: s.id,
        slot,
        fourPiece: s.fourPiece,
        desc: await loadPiece(s.id, slot),
      })),
    ),
  );
  const valid = pieces.filter(
    (p): p is { set: string; slot: number; fourPiece: boolean; desc: Descriptor } => p.desc !== null,
  );
  if (!valid.length) return null;

  // 每个图标直接命中的最佳部位 → 套装票数（4 件套=4，2+2=2+2）
  const counts: Record<string, number> = {};
  for (const desc of descs) {
    let best: { set: string; score: number } | null = null;
    for (const p of valid) {
      const score = descriptorScore(desc, p.desc);
      if (!best || score > best.score) best = { set: p.set, score };
    }
    if (best) counts[best.set] = (counts[best.set] ?? 0) + 1;
  }

  // 每套得分 = 该套每个部位在 6 个图标里的最佳匹配分平均（缺的部位会被拉低）
  const setScores = new Map<string, { total: number; n: number; fourPiece: boolean }>();
  for (const p of valid) {
    let best = 0;
    for (const desc of descs) best = Math.max(best, descriptorScore(desc, p.desc));
    const row = setScores.get(p.set) ?? { total: 0, n: 0, fourPiece: p.fourPiece };
    row.total += best;
    row.n += 1;
    setScores.set(p.set, row);
  }
  const scored = [...setScores].map(([id, r]) => ({
    id,
    score: r.total / Math.max(1, r.n),
    fourPiece: r.fourPiece,
  }));
  const toCandidates = (fourPiece: boolean): AssetCandidate[] =>
    scored
      .filter((x) => x.fourPiece === fourPiece)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ id, score }) => ({ id, score }));
  return { four: toCandidates(true), planar: toCandidates(false), counts };
}

/**
 * 遗器页右侧「套装效果」：名字行扫描 + 64 套装名闭集匹配（主信号）。
 * 中央 6 个部位图仍由 recognizeRelicPage 给件数/冲突校验。
 */
export function recognizeRelicNames(f: ImageFrame): { four: NameHit[]; planar: NameHit[] } | null {
  const hits = findNameHits(f, [0.7, 0.52, 0.995, 1], 'relic');
  const seen = new Set<string>();
  const four: NameHit[] = [];
  const planar: NameHit[] = [];
  for (const h of hits) {
    if (seen.has(h.id) || h.score < 0.5) continue;
    seen.add(h.id);
    const s = RELICSET_ROSTER.find((x) => x.id === h.id);
    if (!s) continue;
    (s.fourPiece ? four : planar).push(h);
  }
  return four.length || planar.length ? { four, planar } : null;
}

/** 角色页左上「命途 / 角色名」：99 个角色名闭集匹配 */
export function recognizeCharacterName(f: ImageFrame): NameHit | null {
  const hits = findNameHits(f, [0.075, 0.06, 0.16, 0.12], 'char');
  return hits[0] ?? null;
}

const TRACE_BOXES: readonly (readonly [number, number, number, number, number])[] = [
  [0.505, 0.235, 0.555, 0.285, 6],
  [0.565, 0.22, 0.62, 0.27, 10],
  [0.565, 0.405, 0.62, 0.455, 10],
  [0.565, 0.595, 0.62, 0.645, 10],
  [0.565, 0.775, 0.62, 0.825, 1],
];

function readFraction(f: ImageFrame, box: readonly number[], den: number): number | null {
  const crop = cropFrame(f, box[0], box[1], box[2], box[3]);
  const inv = invertFrame(crop);
  const r = rasterize(inv.data, inv.width, inv.height);
  const glyphs = segmentGlyphs(r, 0, r.height - 1, 0, r.width - 1);
  const denDigits = String(den).length;
  const numeratorCount = glyphs.length - denDigits - 1;
  if (numeratorCount < 1) return null;
  let text = '';
  for (let i = 0; i < numeratorCount; i++) {
    const vec = normalizeGlyph(
      r,
      glyphs[i],
      TEMPLATE_META.digitW,
      TEMPLATE_META.digitH,
      TEMPLATE_META.digitGlyphH,
    );
    const hit = nearest(vec, digitTemplates());
    if (!hit) return null;
    text += hit.key;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** 行迹：普攻/战技/终结技/天赋（秘技固定 1/1，不写 build） */
export function readTraceLevels(
  f: ImageFrame,
): { basic: number; skill: number; ult: number; talent: number } | null {
  const basic = readFraction(f, TRACE_BOXES[0], 6);
  const skill = readFraction(f, TRACE_BOXES[1], 10);
  const ult = readFraction(f, TRACE_BOXES[2], 10);
  const talent = readFraction(f, TRACE_BOXES[3], 10);
  if (basic === null || skill === null || ult === null || talent === null) return null;
  return {
    basic: Math.max(1, Math.min(6, basic)),
    skill: Math.max(1, Math.min(10, skill)),
    ult: Math.max(1, Math.min(10, ult)),
    talent: Math.max(1, Math.min(10, talent)),
  };
}

const EIDOLON_NODES: readonly (readonly [number, number])[] = [
  // 节点圆心（1572×720 校准；右侧是编号，不要取编号位置）
  [0.3403, 0.1528], // E1
  [0.5407, 0.0903], // E2
  [0.7029, 0.3542], // E3
  [0.687, 0.7569], // E4
  [0.4746, 0.8722], // E5
  [0.3053, 0.7569], // E6
];

/** 星魂：已解锁节点是白色亮环，锁定节点是灰/铜色环（锁本身是白的，不能按中心亮度判） */
export function countEidolons(f: ImageFrame): number {
  const r0 = f.width * 0.016;
  const r1 = f.width * 0.022;
  let count = 0;
  for (const [fx, fy] of EIDOLON_NODES) {
    const cx = fx * f.width;
    const cy = fy * f.height;
    let bright = 0;
    let n = 0;
    const y0 = Math.max(0, Math.floor(cy - r1));
    const y1 = Math.min(f.height - 1, Math.ceil(cy + r1));
    const x0 = Math.max(0, Math.floor(cx - r1));
    const x1 = Math.min(f.width - 1, Math.ceil(cx + r1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < r0 || d > r1) continue;
        const p = (y * f.width + x) * 4;
        const l = 0.299 * f.data[p] + 0.587 * f.data[p + 1] + 0.114 * f.data[p + 2];
        if (l > 190) bright++;
        n++;
      }
    }
    if (n === 0 || bright / n < 0.08) break;
    count++;
  }
  return count;
}
