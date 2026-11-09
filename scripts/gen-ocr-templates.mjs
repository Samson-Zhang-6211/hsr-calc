/**
 * 生成 OCR 模板数据（数字 / 行首图标 / 中文标签 / 三段标题）。
 *
 * 输入 = 校准用「属性详情」截图转换出的 **raw RGB**（2750x1260）：
 *   ffmpeg -y -i panel.jpg -f rawvideo -pix_fmt rgb24 panel.raw
 * 输出 = apps/web/src/ocr/templates-data.ts（只含字形/图标/标签的量化像素，不含截图与 UID）。
 *
 * 校准图必须覆盖完整 27 行（可多张、可滚动重叠）；下面的 CALIB 是这一批样本的真值锚点，
 * 换设备/换 UI 缩放重新校准时需要同步更新（行 y 区间、标签、数值）。
 *
 * 用法：node scripts/gen-ocr-templates.mjs [样本目录，默认 .tmp-ocr-samples]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const W = 2750;
const H = 1260;
const DIR = process.argv[2] ?? '.tmp-ocr-samples';
const OUT = 'apps/web/src/ocr/templates-data.ts';

/** 与运行时 rows.ts 的 FIELDS 顺序严格一致（27 行） */
const FIELDS = [
  'hp', 'atk', 'def', 'speed',
  'critRate', 'critDmg', 'breakEffect', 'healBonus', 'energyMax', 'energyRegen', 'effectHit', 'effectRes', 'elationDegree',
  'dmgPhysical', 'dmgFire', 'dmgIce', 'dmgThunder', 'dmgWind', 'dmgQuantum', 'dmgImaginary',
  'resPhysical', 'resFire', 'resIce', 'resThunder', 'resWind', 'resQuantum', 'resImaginary',
];

/** 校准样本真值（y 区间含 ? 图标的行要覆盖到行底） */
const CALIB = {
  'panel-01': [
    { y0: 464, y1: 493, field: 'hp', value: '2000', bonus: '947' },
    { y0: 523, y1: 553, field: 'atk', value: '1372', bonus: '1484' },
    { y0: 583, y1: 613, field: 'def', value: '923', bonus: '139' },
    { y0: 640, y1: 679, field: 'speed', value: '104', bonus: '5' },
    { y0: 808, y1: 837, field: 'critRate', value: '67.7%' },
    { y0: 866, y1: 897, field: 'critDmg', value: '261.4%' },
    { y0: 923, y1: 962, field: 'breakEffect', value: '18.7%' },
  ],
  'panel-02': [
    { y0: 342, y1: 382, field: 'breakEffect', value: '18.7%' },
    { y0: 405, y1: 435, field: 'healBonus', value: '0.0%' },
    { y0: 461, y1: 501, field: 'energyMax', value: '480' },
    { y0: 521, y1: 560, field: 'energyRegen', value: '119.4%' },
    { y0: 580, y1: 620, field: 'effectHit', value: '0.0%' },
    { y0: 640, y1: 679, field: 'effectRes', value: '0.0%' },
    { y0: 699, y1: 739, field: 'elationDegree', value: '26.0%' },
    { y0: 866, y1: 897, field: 'dmgPhysical', value: '38.8%' },
    { y0: 926, y1: 956, field: 'dmgFire', value: '0.0%' },
  ],
  'panel-03': [
    { y0: 415, y1: 445, field: 'dmgPhysical', value: '38.8%' },
    { y0: 474, y1: 505, field: 'dmgFire', value: '0.0%' },
    { y0: 534, y1: 564, field: 'dmgIce', value: '0.0%' },
    { y0: 593, y1: 624, field: 'dmgThunder', value: '0.0%' },
    { y0: 653, y1: 683, field: 'dmgWind', value: '0.0%' },
    { y0: 712, y1: 743, field: 'dmgQuantum', value: '0.0%' },
    { y0: 772, y1: 803, field: 'dmgImaginary', value: '0.0%' },
    { y0: 831, y1: 862, field: 'resPhysical', value: '0.0%' },
    { y0: 891, y1: 921, field: 'resFire', value: '0.0%' },
    { y0: 950, y1: 980, field: 'resIce', value: '0.0%' },
  ],
  'panel-04': [
    { y0: 345, y1: 376, field: 'dmgThunder', value: '0.0%' },
    { y0: 404, y1: 434, field: 'dmgWind', value: '0.0%' },
    { y0: 464, y1: 495, field: 'dmgQuantum', value: '0.0%' },
    { y0: 523, y1: 555, field: 'dmgImaginary', value: '0.0%' },
    { y0: 583, y1: 613, field: 'resPhysical', value: '0.0%' },
    { y0: 642, y1: 672, field: 'resFire', value: '0.0%' },
    { y0: 702, y1: 732, field: 'resIce', value: '0.0%' },
    { y0: 761, y1: 791, field: 'resThunder', value: '0.0%' },
    { y0: 821, y1: 851, field: 'resWind', value: '0.0%' },
    { y0: 880, y1: 910, field: 'resQuantum', value: '0.0%' },
    { y0: 940, y1: 972, field: 'resImaginary', value: '0.0%' },
  ],
};

/** 三段标题（无行值） */
const HEADERS = [
  { key: 'base', file: 'panel-01', y0: 390, y1: 420 },
  { key: 'advanced', file: 'panel-01', y0: 733, y1: 763 },
  { key: 'damage', file: 'panel-02', y0: 793, y1: 823 },
];

// 与运行时一致的几何比例（相对面板）
const PANEL = { left: 556, right: 2193, top: 210, bottom: 1049 };
const PW = PANEL.right - PANEL.left;
const ZONES = {
  icon: [PANEL.left + PW * 0.032, PANEL.left + PW * 0.068],
  label: [PANEL.left + PW * 0.073, PANEL.left + PW * 0.3],
  header: [PANEL.left + PW * 0.03, PANEL.left + PW * 0.25],
  value: [PANEL.left + PW * 0.61, PANEL.left + PW * 0.745],
  bonus: [PANEL.left + PW * 0.747, PANEL.left + PW * 0.83],
};

const INK_SCALE = 140;
const INK_OFFSET = 190;

const raws = Object.fromEntries(
  Object.keys(CALIB).map((f) => [f, readFileSync(join(DIR, `${f}.raw`))]),
);

const minCh = (buf, x, y) => {
  const i = (y * W + x) * 3;
  return Math.min(buf[i], buf[i + 1], buf[i + 2]);
};
const inkAt = (buf, x, y) => Math.max(0, Math.min(1, (INK_OFFSET - minCh(buf, x, y)) / INK_SCALE));

function bbox(buf, x0, x1, y0, y1) {
  let a = 1e9, b = -1, c = 1e9, d = -1;
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(W - 1, Math.round(x1)); x++) {
      if (minCh(buf, x, y) < 150) {
        if (y < a) a = y;
        if (y > b) b = y;
        if (x < c) c = x;
        if (x > d) d = x;
      }
    }
  }
  return d < 0 ? null : { x0: c, x1: d, y0: a, y1: b, w: d - c + 1, h: b - a + 1 };
}

function norm(buf, box, canvasW, canvasH, glyphH) {
  const scale = glyphH / box.h;
  const nw = Math.max(1, Math.round(box.w * scale));
  const out = new Float32Array(canvasW * canvasH);
  const ox = (canvasW - nw) / 2;
  const oy = (canvasH - glyphH) / 2;
  for (let cy = 0; cy < glyphH; cy++) {
    for (let cx = 0; cx < nw; cx++) {
      const sx = box.x0 + (cx + 0.5) / scale - 0.5;
      const sy = box.y0 + (cy + 0.5) / scale - 0.5;
      const xf = Math.floor(sx), yf = Math.floor(sy), fx = sx - xf, fy = sy - yf;
      const px = (x, y) => inkAt(buf, Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)));
      const v =
        (px(xf, yf) * (1 - fx) + px(xf + 1, yf) * fx) * (1 - fy) +
        (px(xf, yf + 1) * (1 - fx) + px(xf + 1, yf + 1) * fx) * fy;
      const xx = Math.round(ox + cx), yy = Math.round(oy + cy);
      if (yy >= 0 && yy < canvasH && xx >= 0 && xx < canvasW) out[yy * canvasW + xx] = v;
    }
  }
  return out;
}

/** 行内切字（列投影 + 连通 bbox） */
function glyphs(buf, y0, y1, x0, x1) {
  const X0 = Math.max(0, Math.round(x0)), X1 = Math.min(W - 1, Math.round(x1));
  const Y0 = Math.max(0, Math.round(y0)), Y1 = Math.min(H - 1, Math.round(y1));
  const has = [];
  for (let x = X0; x <= X1; x++) {
    let n = 0;
    for (let y = Y0; y <= Y1; y++) if (minCh(buf, x, y) < 150) n++;
    has.push(n > 0);
  }
  const runs = [];
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
  const out = [];
  for (const [a, b] of runs) {
    let yy0 = 1e9, yy1 = -1;
    for (let y = Y0; y <= Y1; y++) {
      for (let x = a; x <= b; x++) {
        if (minCh(buf, x, y) < 150) {
          if (y < yy0) yy0 = y;
          if (y > yy1) yy1 = y;
          break;
        }
      }
    }
    const w = b - a + 1, h = yy1 - yy0 + 1;
    if (w < 3 || h < 3) continue;
    out.push({ x0: a, x1: b, y0: yy0, y1: yy1, w, h });
  }
  return out;
}

const quantize = (vec) => Buffer.from(Uint8Array.from(vec, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255))).toString('base64');

/** 同类字形最多保留 3 个实例（覆盖抗锯齿/压缩差异，控制产物体积） */
function dedupeDigits(list) {
  const seen = new Map();
  return list.filter((d) => {
    const n = seen.get(d.ch) ?? 0;
    if (n >= 3) return false;
    seen.set(d.ch, n + 1);
    return true;
  });
}

// ---------- 数字模板 ----------
const DIGITS = [];
for (const [file, rows] of Object.entries(CALIB)) {
  const buf = raws[file];
  for (const row of rows) {
    const valueGlyphs = glyphs(buf, row.y0 - 2, row.y1 + 2, ZONES.value[0], ZONES.value[1]);
    if (valueGlyphs.length !== row.value.length) {
      throw new Error(`[digit] ${file} ${row.field}: 期望 ${row.value}(${row.value.length}) 实得 ${valueGlyphs.length}`);
    }
    valueGlyphs.forEach((g, i) => DIGITS.push({ ch: row.value[i], data: quantize(norm(buf, g, 32, 32, 26)) }));
    if (row.bonus) {
      const bonusGlyphs = glyphs(buf, row.y0 - 2, row.y1 + 2, ZONES.bonus[0], ZONES.bonus[1]);
      const expect = `+${row.bonus}`;
      if (bonusGlyphs.length !== expect.length) {
        throw new Error(`[bonus] ${file} ${row.field}: 期望 ${expect}(${expect.length}) 实得 ${bonusGlyphs.length}`);
      }
      bonusGlyphs.forEach((g, i) => DIGITS.push({ ch: expect[i], data: quantize(norm(buf, g, 32, 32, 26)) }));
    }
  }
}

// ---------- 图标 / 标签（按 FIELDS 顺序取首次出现） ----------
const icons = new Array(FIELDS.length).fill(null);
const labels = new Array(FIELDS.length).fill(null);
for (const [file, rows] of Object.entries(CALIB)) {
  const buf = raws[file];
  for (const row of rows) {
    const idx = FIELDS.indexOf(row.field);
    if (idx < 0) throw new Error(`unknown field ${row.field}`);
    if (icons[idx] && labels[idx]) continue;
    const ib = bbox(buf, ZONES.icon[0], ZONES.icon[1], row.y0 - 3, row.y1 + 3);
    const lb = bbox(buf, ZONES.label[0], ZONES.label[1], row.y0 - 3, row.y1 + 3);
    if (!ib || !lb) throw new Error(`[crop] ${file} ${row.field} 缺图标或标签`);
    icons[idx] ??= quantize(norm(buf, ib, 20, 20, 18));
    labels[idx] ??= quantize(norm(buf, lb, 220, 24, 22));
  }
}
if (icons.some((v) => !v) || labels.some((v) => !v)) {
  throw new Error(`模板覆盖不全: icons=${icons.filter(Boolean).length}/27 labels=${labels.filter(Boolean).length}/27`);
}

// ---------- 三段标题 ----------
const headers = HEADERS.map((h) => {
  const buf = raws[h.file];
  const box = bbox(buf, ZONES.header[0], ZONES.header[1], h.y0, h.y1);
  if (!box) throw new Error(`[header] ${h.key} 缺内容`);
  return { key: h.key, data: quantize(norm(buf, box, 220, 24, 22)) };
});

// ---------- 输出 ----------
const lines = [];
lines.push('// AUTO-GENERATED by scripts/gen-ocr-templates.mjs — 勿手改。');
lines.push('// 来源：校准用「属性详情」截图的量化字形/图标/标签；不含截图、UID 或任何个人信息。');
lines.push('// 重新校准：node scripts/gen-ocr-templates.mjs [样本 raw 目录]');
lines.push('');
lines.push(`export const OCR_TEMPLATE_VERSION = 'ocr-1';`);
lines.push('');
lines.push('export const OCR_META = {');
lines.push('  digitW: 32, digitH: 32, digitGlyphH: 26,');
lines.push('  iconW: 20, iconH: 20, iconGlyphH: 18,');
lines.push('  labelW: 220, labelH: 24, labelGlyphH: 22,');
lines.push('} as const;');
lines.push('');
lines.push('/** 数字/小数点/百分号/加号（每个实例一条，允许同类多形态） */');
lines.push('export const OCR_DIGITS: { ch: string; data: string }[] = [');
const DIGITS_OUT = dedupeDigits(DIGITS);
for (const d of DIGITS_OUT) lines.push(`  { ch: ${JSON.stringify(d.ch)}, data: ${JSON.stringify(d.data)} },`);
lines.push('];');
lines.push('');
lines.push('/** 27 行行首图标，顺序 = rows.ts FIELDS */');
lines.push('export const OCR_ICONS: string[] = [');
for (const v of icons) lines.push(`  ${JSON.stringify(v)},`);
lines.push('];');
lines.push('');
lines.push('/** 27 行中文标签（不含图标），顺序 = rows.ts FIELDS */');
lines.push('export const OCR_LABELS: string[] = [');
for (const v of labels) lines.push(`  ${JSON.stringify(v)},`);
lines.push('];');
lines.push('');
lines.push('/** 三段标题（基础属性 / 进阶属性 / 伤害属性） */');
lines.push('export const OCR_HEADERS: { key: string; data: string }[] = [');
for (const h of headers) lines.push(`  { key: ${JSON.stringify(h.key)}, data: ${JSON.stringify(h.data)} },`);
lines.push('];');
lines.push('');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(
  `written ${OUT}  digits=${DIGITS_OUT.length}/${DIGITS.length} icons=${icons.length} labels=${labels.length} headers=${headers.length}`,
);
