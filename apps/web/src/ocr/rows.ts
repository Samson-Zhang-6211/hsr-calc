import type { Element } from '@hsr-calc/shared';

/**
 * OCR 面板「行」的规范顺序（与 scripts/gen-ocr-templates.mjs 的 FIELDS 严格一致）。
 *
 * 来自游戏内「属性详情」弹窗的真实 27 行：
 *   基础属性 4（生命/攻击/防御/速度）
 *   进阶属性 9（暴击率/暴击伤害/击破特攻/治疗量加成/能量上限/能量恢复效率/效果命中/效果抵抗/欢愉度）
 *   伤害属性 14（7 系伤害提高 + 7 系抗性提高）
 *
 * **顺序是行身份的最后一道判据**：图标/标签模板有歧义时，用「行序连续/单调」约束纠错。
 */
export const OCR_FIELDS = [
  'hp', 'atk', 'def', 'speed',
  'critRate', 'critDmg', 'breakEffect', 'healBonus', 'energyMax', 'energyRegen', 'effectHit', 'effectRes', 'elationDegree',
  'dmgPhysical', 'dmgFire', 'dmgIce', 'dmgThunder', 'dmgWind', 'dmgQuantum', 'dmgImaginary',
  'resPhysical', 'resFire', 'resIce', 'resThunder', 'resWind', 'resQuantum', 'resImaginary',
] as const;

export type OcrFieldKey = (typeof OCR_FIELDS)[number];
export type OcrSection = 'base' | 'advanced' | 'damage';

/** 三段标题在 27 行中的起始 index（基础/进阶/伤害） */
export const OCR_SECTION_START: Record<'base' | 'advanced' | 'damage', number> = {
  base: 0,
  advanced: 4,
  damage: 13,
};

/** 行元数据：section / 写入语义 / 元素归属 */
export type OcrRowKind = 'flat' | 'percent' | 'energyRegen' | 'element' | 'ignored';

export interface OcrRowMeta {
  key: OcrFieldKey;
  section: OcrSection;
  kind: OcrRowKind;
  /** StoredCharacter.elementDmg 的元素键（kind='element' 时） */
  element?: Element;
  /** 表格里的 i18n 标签：固定键，或 element 前缀 + 后缀 */
  label:
    | { type: 'key'; key: string }
    | { type: 'element'; suffixKey: string };
}

const BASE_ROWS: OcrRowMeta[] = [
  { key: 'hp', section: 'base', kind: 'flat', label: { type: 'key', key: 'calc.panel.hp' } },
  { key: 'atk', section: 'base', kind: 'flat', label: { type: 'key', key: 'calc.panel.atk' } },
  { key: 'def', section: 'base', kind: 'flat', label: { type: 'key', key: 'calc.panel.def' } },
  { key: 'speed', section: 'base', kind: 'flat', label: { type: 'key', key: 'calc.panel.spd' } },
];

const ADVANCED_ROWS: OcrRowMeta[] = [
  { key: 'critRate', section: 'advanced', kind: 'percent', label: { type: 'key', key: 'calc.panel.critRate' } },
  { key: 'critDmg', section: 'advanced', kind: 'percent', label: { type: 'key', key: 'calc.panel.critDmg' } },
  { key: 'breakEffect', section: 'advanced', kind: 'percent', label: { type: 'key', key: 'calc.panel.breakEffect' } },
  { key: 'healBonus', section: 'advanced', kind: 'percent', label: { type: 'key', key: 'calc.panel.healBonus' } },
  { key: 'energyMax', section: 'advanced', kind: 'ignored', label: { type: 'key', key: 'chars.ocr.energyMax' } },
  { key: 'energyRegen', section: 'advanced', kind: 'energyRegen', label: { type: 'key', key: 'chars.ocr.energyRegen' } },
  { key: 'effectHit', section: 'advanced', kind: 'percent', label: { type: 'key', key: 'calc.panel.effectHit' } },
  { key: 'effectRes', section: 'advanced', kind: 'percent', label: { type: 'key', key: 'calc.panel.effectRes' } },
  { key: 'elationDegree', section: 'advanced', kind: 'percent', label: { type: 'key', key: 'chars.ocr.elation' } },
];

const ELEMENTS: Element[] = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];

const DAMAGE_ROWS: OcrRowMeta[] = [
  ...ELEMENTS.map<OcrRowMeta>((element) => ({
    key: (`dmg${element}`) as OcrFieldKey,
    section: 'damage',
    kind: 'element',
    element,
    label: { type: 'element', suffixKey: 'chars.ocr.dmg' },
  })),
  ...ELEMENTS.map<OcrRowMeta>((element) => ({
    key: (`res${element}`) as OcrFieldKey,
    section: 'damage',
    kind: 'ignored',
    element,
    label: { type: 'element', suffixKey: 'chars.ocr.resistance' },
  })),
];

/** 27 行元数据（index 与 OCR_FIELDS 一一对应） */
export const OCR_ROW_META: readonly OcrRowMeta[] = [...BASE_ROWS, ...ADVANCED_ROWS, ...DAMAGE_ROWS];

/** 写入手填面板的字段（不含 ignored 行） */
export const OCR_WRITABLE_KEYS = OCR_ROW_META.filter((r) => r.kind !== 'ignored').map((r) => r.key);
