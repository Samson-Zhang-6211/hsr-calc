import { describe, expect, it } from 'vitest';
import { buildDraft, mergeFormPatch } from './mapping.js';
import {
  alignPanel,
  mergePanels,
  recognizePanel,
  type AlignedRow,
  type MergeResult,
  type MergedSlot,
  type PanelAlignment,
  type PanelRead,
  type RowRead,
} from './recognize.js';
import { digitTemplates, iconTemplates, labelTemplates, nearest, TEMPLATE_META } from './templates.js';
import { detectPanel, normalizeGlyph, rasterize, segmentGlyphs } from './pixels.js';

function readOf(slots: number[], valueText = '1'): PanelRead {
  const icons = iconTemplates();
  const labels = labelTemplates();
  const rows: RowRead[] = slots.map((slot, i) => ({
    y0: 100 + i * 40,
    y1: 130 + i * 40,
    value: { text: valueText, confidence: 1, distances: [] },
    bonus: { text: '', confidence: 1, distances: [] },
    icon: { key: String(slot), distance: 0, margin: 0.5, vec: icons[slot].vec },
    label: { key: String(slot), distance: 0, margin: 0.5, vec: labels[slot].vec },
    heightRatio: 0.03,
  }));
  return { panel: { left: 0, top: 0, right: 1000, bottom: 800 }, rows, headers: [] };
}

function mergeOf(values: (string | null)[], bonuses: (string | null)[] = []): MergeResult {
  const slots: (MergedSlot | null)[] = values.map((value, slot) => {
    if (value === null) return null;
    const bonus = bonuses[slot] ?? '';
    return { slot, raw: bonus ? `${value} ${bonus}` : value, value, bonus, confidence: 1, images: [0] };
  });
  return { slots, warnings: [], coverage: slots.filter(Boolean).length / 27, imageCount: 1 };
}

describe('ocr templates', () => {
  it('解码出完整数字/图标/标签', () => {
    const digits = digitTemplates();
    const keys = new Set(digits.map((d) => d.key));
    for (const ch of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '%', '+']) {
      expect(keys.has(ch)).toBe(true);
    }
    expect(digits[0].vec.length).toBe(TEMPLATE_META.digitW * TEMPLATE_META.digitH);
    expect(iconTemplates()).toHaveLength(27);
    expect(labelTemplates()).toHaveLength(27);
    expect(iconTemplates()[0].vec.length).toBe(TEMPLATE_META.iconW * TEMPLATE_META.iconH);
  });

  it('模板自匹配距离为 0、margin 按不同字符计', () => {
    for (const d of digitTemplates()) {
      const hit = nearest(d.vec, digitTemplates());
      expect(hit?.key).toBe(d.key);
      expect(hit?.distance).toBe(0);
      expect(hit?.margin).toBeGreaterThan(0);
    }
  });
});

describe('ocr alignment', () => {
  it('连续行按图标/标签落到正确 slot', () => {
    const al = alignPanel(readOf([5, 6, 7, 8]));
    expect(al?.rows.map((r) => r.slot)).toEqual([5, 6, 7, 8]);
  });

  it('允许缺行（条件隐藏/截断）', () => {
    const al = alignPanel(readOf([5, 6, 8]));
    expect(al?.rows.map((r) => r.slot)).toEqual([5, 6, 8]);
  });

  it('允许从面板中段开始', () => {
    const al = alignPanel(readOf([16, 17, 18, 19, 20]));
    expect(al?.rows.map((r) => r.slot)).toEqual([16, 17, 18, 19, 20]);
  });

  it('单行也能定位', () => {
    const al = alignPanel(readOf([4]));
    expect(al?.rows[0].slot).toBe(4);
  });
});

describe('ocr merge', () => {
  it('同图合并保留值；缺行给出 missing 警告', () => {
    const al = alignPanel(readOf([5, 6]))!;
    const merge = mergePanels([al]);
    expect(merge.slots[5]?.raw).toBe('1');
    expect(merge.slots[6]?.raw).toBe('1');
    expect(merge.warnings.some((w) => w.kind === 'missing')).toBe(true);
    expect(merge.coverage).toBeCloseTo(2 / 27);
  });

  it('多图同位置不同值记冲突', () => {
    const a = alignPanel(readOf([5], '1'))!;
    const b = alignPanel(readOf([5], '2'))!;
    const merge = mergePanels([a, b]);
    expect(merge.warnings.some((w) => w.kind === 'conflict' && w.slot === 5)).toBe(true);
  });
});

describe('ocr mapping', () => {
  const values: (string | null)[] = [
    '2000', '1372', '923', '104',
    '67.7%', '261.4%', '18.7%', '0.0%', '480', '119.4%', '0.0%', '0.0%', '26.0%',
    '38.8%', '0.0%', '0.0%', '0.0%', '0.0%', '0.0%', '0.0%',
    '0.0%', '0.0%', '0.0%', '0.0%', '0.0%', '0.0%', '0.0%',
  ];
  const bonuses: (string | null)[] = ['+947', '+1484', '+139', '+5'];

  it('面板值 → 手填字段口径', () => {
    const draft = buildDraft(mergeOf(values, bonuses));
    expect(draft.patch).toMatchObject({
      level: '80',
      hp: '2947',
      atk: '2856',
      def: '1062',
      speed: '109',
      critRate: '67.7',
      critDmg: '261.4',
      breakEffect: '18.7',
      healBonus: '0',
      energyRegen: '19.4',
      effectHit: '0',
      effectRes: '0',
      elationDegree: '26',
      elementDmg: { Physical: '38.8', Fire: '0', Ice: '0', Thunder: '0', Wind: '0', Quantum: '0', Imaginary: '0' },
    });
    // 面板总值 119.4% → 写入加成 19.4%
    expect(draft.fields[9].raw).toBe('119.4%');
    expect(draft.fields[9].valueText).toBe('19.4%');
    // 能量上限/抗性只展示不写入
    expect(draft.fields[8].ignored).toBe(true);
    expect(draft.fields[20].ignored).toBe(true);
    expect(draft.fields[8].valueText).toBe('—');
  });

  it('缺行不覆盖、非法值不写入', () => {
    const sparse = values.map((v, i) => (i === 0 || i === 4 ? v : null));
    const draft = buildDraft(mergeOf(sparse, bonuses));
    expect(draft.patch.hp).toBe('2947');
    expect(draft.patch.critRate).toBe('67.7');
    expect(draft.patch.speed).toBeUndefined();
    expect(draft.coverage).toBeCloseTo(2 / 27);

    const bad = buildDraft(mergeOf(['abc', ...values.slice(1)]));
    expect(bad.patch.hp).toBeUndefined();
    expect(bad.warningsExtra).toContain('format:0');
  });

  it('mergeFormPatch 只覆盖已识别元素', () => {
    const base = { elementDmg: { Physical: '1', Fire: '2', Ice: '3', Thunder: '4', Wind: '5', Quantum: '6', Imaginary: '7' } };
    const merged = mergeFormPatch(base, { hp: '1', elementDmg: { Physical: '38.8' } });
    expect(merged.elementDmg).toEqual({ Physical: '38.8', Fire: '2', Ice: '3', Thunder: '4', Wind: '5', Quantum: '6', Imaginary: '7' });
  });
});

// ---------- 合成图端到端（不依赖校准样本） ----------
interface Canvas {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function fill(c: Canvas, x: number, y: number, w: number, h: number, v: number) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
      const i = (py * c.width + px) * 4;
      c.data[i] = v;
      c.data[i + 1] = v;
      c.data[i + 2] = v;
      c.data[i + 3] = 255;
    }
  }
}

function drawVec(c: Canvas, vec: Float32Array, vw: number, vh: number, x: number, y: number, w: number, h: number) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const sx = Math.min(vw - 1, Math.floor((dx * vw) / w));
      const sy = Math.min(vh - 1, Math.floor((dy * vh) / h));
      if (vec[sy * vw + sx] > 0.35) fill(c, x + dx, y + dy, 1, 1, 60);
    }
  }
}

describe('ocr pixels', () => {
  it('浅色面板 + 单行 + 数字/图标/标签的端到端识别', () => {
    const canvas: Canvas = { width: 900, height: 700, data: new Uint8ClampedArray(900 * 700 * 4) };
    fill(canvas, 0, 0, 900, 700, 30);
    fill(canvas, 100, 100, 700, 500, 225);
    const icon = iconTemplates()[4];
    const label = labelTemplates()[4];
    const digit = digitTemplates().find((d) => d.key === '4')!;
    drawVec(canvas, icon.vec, 20, 20, 124, 302, 20, 20);
    drawVec(canvas, label.vec, TEMPLATE_META.labelW, TEMPLATE_META.labelH, 152, 305, 150, 16);
    drawVec(canvas, digit.vec, TEMPLATE_META.digitW, TEMPLATE_META.digitH, 592, 303, 17, 27);

    const raster = rasterize(canvas.data, canvas.width, canvas.height);
    expect(detectPanel(raster)).toEqual({ left: 100, top: 100, right: 799, bottom: 599 });

    const glyphs = segmentGlyphs(raster, 300, 332, 530, 620);
    expect(glyphs.length).toBe(1);

    const read = recognizePanel({ data: canvas.data, width: canvas.width, height: canvas.height });
    expect(read?.rows.length).toBe(1);
    expect(read?.rows[0].value.text).toBe('4');
    const al = alignPanel(read!)!;
    expect(al.rows[0].slot).toBe(4);
  });

  it('normalizeGlyph 保持尺寸与居中', () => {
    const raster = { width: 40, height: 40, min: new Uint8Array(1600).fill(220), luma: new Uint8Array(1600).fill(220) };
    for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) raster.min[y * 40 + x] = 30;
    const vec = normalizeGlyph(raster, { x0: 10, y0: 10, x1: 19, y1: 19, w: 10, h: 10 }, 32, 32, 26);
    expect(vec.length).toBe(1024);
    const center = vec[16 * 32 + 16];
    expect(center).toBeGreaterThan(0.9);
    expect(vec[0]).toBe(0);
  });
});

describe('ocr regression: 面板值为最终值', () => {
  it('写入补丁不含 build / 不改动装备', () => {
    const draft = buildDraft(mergeOf(['2000', '1372', '923', '104', ...new Array(23).fill('0')], ['+947', '+1484', '+139', '+5']));
    expect(draft.patch).not.toHaveProperty('build');
    expect(draft.patch).not.toHaveProperty('lightconeId');
    expect(draft.patch).not.toHaveProperty('relicsetId');
  });
});

// 保持 AlignedRow / PanelAlignment 类型被引用（避免 noUnusedLocals）
export type _Types = [AlignedRow, PanelAlignment];
