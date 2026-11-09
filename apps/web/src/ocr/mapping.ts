import type { Element } from '@hsr-calc/shared';
import { OCR_FIELDS, OCR_ROW_META, type OcrFieldKey, type OcrRowMeta } from './rows.js';
import type { MergedSlot, MergeResult, MergeWarning } from './recognize.js';

/**
 * 识别结果 → 存档草稿。
 *
 * 铁律（2026-10-28 用户裁定）：**面板是游戏内最终值**，所有非条件子句已计入。
 * 所以这里只做「面板值 → 手填字段」的直读映射，绝不重算装备/行迹，也不把光锥/遗物
 * 的无条件部分再叠一次；build 只用于条件子句（由角色管理页的纯登记选择器负责）。
 */

export interface OcrFieldRow {
  slot: number;
  key: OcrFieldKey;
  meta: OcrRowMeta;
  present: boolean;
  /** 面板原值（展示用，如 "2000 + 947" / "119.4%"） */
  raw: string;
  /** 写入值（展示用，如 "2947" / "19.4%"；ignored 行 = '—'） */
  valueText: string;
  /** 写入引擎的数值（ratio 口径；ignored 行 = null） */
  numeric: number | null;
  confidence: number;
  ignored: boolean;
}

/** 填回角色管理「手动输入」表单的补丁（只含已识别字段） */
export interface OcrFormPatch {
  level?: string;
  hp?: string;
  atk?: string;
  def?: string;
  speed?: string;
  critRate?: string;
  critDmg?: string;
  breakEffect?: string;
  healBonus?: string;
  energyRegen?: string;
  effectHit?: string;
  effectRes?: string;
  elationDegree?: string;
  elementDmg?: Partial<Record<Element, string>>;
}

/**
 * 视频页登记 → 存档 build（用户裁定 2026-10-28/29）：
 * 只做「纯登记」——光锥/叠影、四件套/位面套、技能等级、星魂；单件遗器主/副词条不写
 * （面板已是最终值，战斗模拟只需要套装条件门控）。
 */
export interface OcrBuildPatch {
  lightconeId?: string;
  refinement?: number;
  relicsetId?: string;
  /** 2+2：第二套四件套（两套各 2 件）；不填 = 普通四件套 */
  relicsetId2?: string;
  planarsetId?: string;
  skillLevels?: Partial<Record<'basic' | 'skill' | 'ult' | 'talent', number>>;
  eidolonLevel?: number;
}

export interface OcrDraft {
  fields: OcrFieldRow[];
  warnings: MergeWarning[];
  warningsExtra: string[];
  coverage: number;
  imageCount: number;
  patch: OcrFormPatch;
}

const PERCENT = /^(\d+(?:\.\d+)?)%$/;

function parsePercent(text: string): number | null {
  const m = PERCENT.exec(text.trim());
  if (!m) return null;
  const v = Number(m[1]) / 100;
  return Number.isFinite(v) ? v : null;
}

function parseInteger(text: string): number | null {
  const t = text.replace(/[^\d]/g, '');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function fmtRatio(v: number): string {
  return String(+(v * 100).toFixed(4));
}

function fmtPct(v: number): string {
  return `${+(v * 100).toFixed(1)}%`;
}

/** 单行数值解释（返回 web 存储口径：比例/整数） */
function interpret(meta: OcrRowMeta, slot: MergedSlot | null): { numeric: number | null; extra: string | null } {
  if (!slot) return { numeric: null, extra: null };
  if (meta.kind === 'flat') {
    const base = parseInteger(slot.value);
    const bonus = slot.bonus ? parseInteger(slot.bonus) : 0;
    if (base === null || bonus === null) return { numeric: null, extra: `format:${slot.slot}` };
    const total = base + bonus;
    const valid = meta.key === 'speed' ? total >= 50 && total <= 400 : total > 0 && total < 1_000_000;
    return { numeric: valid ? total : null, extra: valid ? null : `range:${slot.slot}` };
  }
  if (meta.kind === 'ignored') {
    if (meta.key === 'energyMax') {
      const v = parseInteger(slot.value);
      return { numeric: null, extra: v === null ? `format:${slot.slot}` : null };
    }
    const v = parsePercent(slot.value);
    return { numeric: null, extra: v === null ? `format:${slot.slot}` : null };
  }
  const pct = parsePercent(slot.value);
  if (pct === null) return { numeric: null, extra: `format:${slot.slot}` };
  if (meta.kind === 'energyRegen') {
    // 面板 119.4% = 1.194 倍；引擎字段是「加成」= 1.194 - 1 = 0.194
    const bonus = pct - 1;
    const valid = bonus >= -1 && bonus <= 2;
    return { numeric: valid ? bonus : null, extra: valid ? null : `range:${slot.slot}` };
  }
  const valid = pct >= 0 && pct <= 10;
  return { numeric: valid ? pct : null, extra: valid ? null : `range:${slot.slot}` };
}

/** 单元格展示：原值 */
function rawText(slot: MergedSlot | null): string {
  if (!slot) return '';
  return slot.bonus ? `${slot.value} ${slot.bonus}` : slot.value;
}

/** 单元格展示：写入值 */
function valueText(meta: OcrRowMeta, numeric: number | null, slot: MergedSlot | null): string {
  if (!slot || meta.kind === 'ignored') return '—';
  if (numeric === null) return '—';
  if (meta.kind === 'flat') return String(Math.round(numeric));
  return fmtPct(numeric);
}

/** 构建草稿 + 表单补丁 */
export function buildDraft(merge: MergeResult, characterLevel = 80): OcrDraft {
  const fields: OcrFieldRow[] = [];
  const patch: OcrFormPatch = { level: String(characterLevel) };
  const extra: string[] = [];

  for (let slot = 0; slot < OCR_FIELDS.length; slot++) {
    const meta = OCR_ROW_META[slot];
    const cell = merge.slots[slot];
    const interpreted = interpret(meta, cell);
    if (interpreted.extra) extra.push(interpreted.extra);
    const numeric = interpreted.numeric;
    const ignored = meta.kind === 'ignored';
    fields.push({
      slot,
      key: meta.key,
      meta,
      present: cell !== null,
      raw: rawText(cell),
      valueText: valueText(meta, numeric, cell),
      numeric,
      confidence: cell?.confidence ?? 0,
      ignored,
    });
    if (!cell || numeric === null || ignored) continue;

    switch (meta.key) {
      case 'hp':
      case 'atk':
      case 'def':
      case 'speed':
        patch[meta.key] = String(Math.round(numeric));
        break;
      case 'critRate':
      case 'critDmg':
      case 'breakEffect':
      case 'healBonus':
      case 'effectHit':
      case 'effectRes':
      case 'elationDegree':
        patch[meta.key] = fmtRatio(numeric);
        break;
      case 'energyRegen':
        patch.energyRegen = fmtRatio(numeric);
        break;
      default: {
        if (meta.kind === 'element' && meta.element) {
          patch.elementDmg ??= {};
          patch.elementDmg[meta.element] = fmtRatio(numeric);
        }
      }
    }
  }

  // 能量上限行不写入，但格式错时提示
  return {
    fields,
    warnings: merge.warnings,
    warningsExtra: extra,
    coverage: merge.coverage,
    imageCount: merge.imageCount,
    patch,
  };
}

/** 表单切换角色时用于「只覆盖已识别字段」的合并 */
export function mergeFormPatch(
  base: { elementDmg: Record<Element, string> },
  patch: OcrFormPatch,
): OcrFormPatch & { elementDmg: Partial<Record<Element, string>> } {
  return {
    ...patch,
    elementDmg: { ...base.elementDmg, ...(patch.elementDmg ?? {}) },
  };
}
