/**
 * 面板合成公式（2026-01 与用户逐条确认，对应 4.6）：
 *
 * - 成长：段内值 = base + add × (等级 − 1)。三方验证通过
 *   （nanoka 数据 + 本公式 = BWIKI 游戏显示值；显示口径为截断取整 floor，
 *   本模块输出**精确浮点**，floor 仅用于 UI 展示——面板值是否需先截断再参与
 *   伤害计算尚待游戏内验证）。
 * - 段选择：突破段 = max(用户选择, 等级最低要求)；突破点 20/30/40/50/60/70
 *   → 等级 21-30 至少段 1，…… 71-80 至少段 6。
 * - 合成：攻/生命/防御 = (角色白值 + 光锥白值) × (1 + Σ百分比) + Σ固定值；
 *   速度 = (角色速度 + Σ速度固定值) × (1 + Σ速度百分比)——速度百分比来自
 *   装备效果子句 SpeedAddedRatio（遗器2件套「速度提高6%」，2026-10-10 裁定
 *   接入；遗器词条体系本身仍无速度%）；
 *   暴击率/暴伤/击破特攻/效果命中/效果抵抗/治疗加成/能量恢复
 *   = 基础值(0.05 / 0.5 / 0 / 0 / 0 / 0 / 0) + Σ词条。
 * - 词条属性命名与 nanoka 行迹、Fribbels 词条表统一（fribbels/hsr-optimizer
 *   relic_main_affixes / relic_sub_affixes，已存 data/relic-affixes/）。
 */

/** 成长段：段内值 = base + add × (level − 1) */
export interface GrowSegment {
  base: number;
  add: number;
}

export function grownValue(segment: GrowSegment, level: number): number {
  return segment.base + segment.add * (level - 1);
}

/** 等级突破最低段位：21-30 → 1，……，71-80 → 6（1-20 → 0） */
export function minPromotionForLevel(level: number): number {
  if (level <= 20) return 0;
  if (level <= 30) return 1;
  if (level <= 40) return 2;
  if (level <= 50) return 3;
  if (level <= 60) return 4;
  if (level <= 70) return 5;
  return 6;
}

/** 实际生效突破段 = max(用户选择, 等级最低要求)，等级上限 80、段上限 6 */
export function resolvePromotion(level: number, userPromotion: number): number {
  const levelClamped = Math.min(80, Math.max(1, Math.round(level)));
  const user = Math.min(6, Math.max(0, Math.round(userPromotion)));
  return Math.max(user, minPromotionForLevel(levelClamped));
}

/** 面板属性词条（value 为原始小数，如 0.16 = 16%、34 = 固定值 34） */
export interface PanelAddition {
  property: string;
  value: number;
}

export type PanelStatCategory =
  | 'flatHp'
  | 'flatAtk'
  | 'flatDef'
  | 'flatSpd'
  | 'pctSpd'
  | 'pctHp'
  | 'pctAtk'
  | 'pctDef'
  | 'critRate'
  | 'critDmg'
  | 'breakEffect'
  | 'effectHit'
  | 'effectRes'
  | 'healBonus'
  | 'energyRegen'
  | 'elementDmg'
  | 'breakDmgBoost';

const ELEMENT_PROPERTIES: Readonly<Record<string, string>> = {
  PhysicalAddedRatio: 'Physical',
  FireAddedRatio: 'Fire',
  IceAddedRatio: 'Ice',
  ThunderAddedRatio: 'Thunder',
  WindAddedRatio: 'Wind',
  QuantumAddedRatio: 'Quantum',
  ImaginaryAddedRatio: 'Imaginary',
};

const FLAT_PROPERTIES: Readonly<Record<string, PanelStatCategory>> = {
  HPDelta: 'flatHp',
  AttackDelta: 'flatAtk',
  DefenceDelta: 'flatDef',
  SpeedDelta: 'flatSpd',
};

const DIRECT_PROPERTIES: Readonly<Record<string, PanelStatCategory>> = {
  HPAddedRatio: 'pctHp',
  AttackAddedRatio: 'pctAtk',
  DefenceAddedRatio: 'pctDef',
  SpeedAddedRatio: 'pctSpd',
  CriticalChanceBase: 'critRate',
  CriticalDamageBase: 'critDmg',
  BreakDamageAddedRatioBase: 'breakEffect',
  StatusProbabilityBase: 'effectHit',
  StatusResistanceBase: 'effectRes',
  HealRatioBase: 'healBonus',
  SPRatioBase: 'energyRegen',
  BreakDamageAddedRatio: 'breakDmgBoost',
};

/**
 * 词条属性分类；未识别返回 null（UI 展示原文，不硬接进面板，符合
 * 「解析不了的不进计算」约定）。
 */
export function categorizeStat(property: string): PanelStatCategory | null {
  if (FLAT_PROPERTIES[property]) return FLAT_PROPERTIES[property];
  if (DIRECT_PROPERTIES[property]) return DIRECT_PROPERTIES[property];
  if (ELEMENT_PROPERTIES[property]) return 'elementDmg';
  return null;
}

/** 属性伤害词条 → 元素名（仅 elementDmg 类有效） */
export function elementOfStat(property: string): string | null {
  return ELEMENT_PROPERTIES[property] ?? null;
}

export interface WhiteValues {
  hp: number;
  atk: number;
  def: number;
  speed: number;
}

export interface PanelInput {
  /** 角色白值（成长公式已计算） */
  character: WhiteValues;
  /** 光锥白值（成长公式已计算）；光锥无速度，缺省 0 */
  lightcone?: WhiteValues | null;
  /** 行迹属性点、遗器词条、装备效果百分比等统一累加 */
  additions: readonly PanelAddition[];
}

export interface PanelStats {
  hp: number;
  atk: number;
  def: number;
  speed: number;
  critRate: number;
  critDmg: number;
  breakEffect: number;
  effectHit: number;
  effectRes: number;
  healBonus: number;
  energyRegen: number;
  /** 「造成的击破伤害提高」（独立乘区，非面板属性） */
  breakDmgBoost: number;
  /** 元素伤害提高（进增伤区），键为元素名 */
  elementDmg: Record<string, number>;
  /** 未识别词条（保留在结果中供 UI 提示，不参与计算） */
  unrecognized: readonly PanelAddition[];
}

const BASE_CRIT_RATE = 0.05;
const BASE_CRIT_DMG = 0.5;

/**
 * 遗器主词条值 = base + step × 强化等级(0-15)。
 * 验证：5星头部 HPDelta 112.896+39.5136×15=705.6（BWIKI 显示 705，floor）；
 * 5星球生命% 0.06912+0.024192×15=43.2%。
 */
export function mainAffixValue(
  affix: { base: number; step: number },
  enhanceLevel: number,
): number {
  return affix.base + affix.step * Math.max(0, enhanceLevel);
}

/**
 * 遗器副词条 n 次 roll 的合计值，第 i 次 roll（0 起）= base + step×i。
 * n=1 为初始词条，之后每次强化 +1 次 roll（上限由 UI 约束 1..6）。
 */
export function subAffixRollValue(
  affix: { base: number; step: number },
  rolls: number,
): number {
  const n = Math.max(0, Math.floor(rolls));
  return n * affix.base + affix.step * ((n * (n - 1)) / 2);
}

export function composePanel(input: PanelInput): PanelStats {
  const lc = input.lightcone;
  const whiteHp = input.character.hp + (lc?.hp ?? 0);
  const whiteAtk = input.character.atk + (lc?.atk ?? 0);
  const whiteDef = input.character.def + (lc?.def ?? 0);

  let pctHp = 0;
  let pctAtk = 0;
  let pctDef = 0;
  let flatHp = 0;
  let flatAtk = 0;
  let flatDef = 0;
  let flatSpd = 0;
  let pctSpd = 0;
  let critRate = BASE_CRIT_RATE;
  let critDmg = BASE_CRIT_DMG;
  let breakEffect = 0;
  let effectHit = 0;
  let effectRes = 0;
  let healBonus = 0;
  let energyRegen = 0;
  let breakDmgBoost = 0;
  const elementDmg: Record<string, number> = {};
  const unrecognized: PanelAddition[] = [];

  for (const addition of input.additions) {
    const category = categorizeStat(addition.property);
    switch (category) {
      case 'flatHp':
        flatHp += addition.value;
        break;
      case 'flatAtk':
        flatAtk += addition.value;
        break;
      case 'flatDef':
        flatDef += addition.value;
        break;
      case 'flatSpd':
        flatSpd += addition.value;
        break;
      case 'pctSpd':
        pctSpd += addition.value;
        break;
      case 'pctHp':
        pctHp += addition.value;
        break;
      case 'pctAtk':
        pctAtk += addition.value;
        break;
      case 'pctDef':
        pctDef += addition.value;
        break;
      case 'critRate':
        critRate += addition.value;
        break;
      case 'critDmg':
        critDmg += addition.value;
        break;
      case 'breakEffect':
        breakEffect += addition.value;
        break;
      case 'effectHit':
        effectHit += addition.value;
        break;
      case 'effectRes':
        effectRes += addition.value;
        break;
      case 'healBonus':
        healBonus += addition.value;
        break;
      case 'energyRegen':
        energyRegen += addition.value;
        break;
      case 'breakDmgBoost':
        breakDmgBoost += addition.value;
        break;
      case 'elementDmg': {
        const element = elementOfStat(addition.property);
        if (element) elementDmg[element] = (elementDmg[element] ?? 0) + addition.value;
        break;
      }
      case null:
        unrecognized.push(addition);
        break;
    }
  }

  return {
    hp: whiteHp * (1 + pctHp) + flatHp,
    atk: whiteAtk * (1 + pctAtk) + flatAtk,
    def: whiteDef * (1 + pctDef) + flatDef,
    speed: (input.character.speed + flatSpd) * (1 + pctSpd),
    critRate,
    critDmg,
    breakEffect,
    effectHit,
    effectRes,
    healBonus,
    energyRegen,
    breakDmgBoost,
    elementDmg,
    unrecognized,
  };
}
