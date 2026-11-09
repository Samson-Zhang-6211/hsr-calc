import {
  composePanel,
  grownValue,
  mainAffixValue,
  resolvePromotion,
  type PanelAddition,
  type PanelStats,
  type WhiteValues,
} from '@hsr-calc/engine';
import {
  markEidolonClausesEngine,
  parseEquipmentEffect,
  type EffectClause,
} from './equipment-effects.js';
import {
  mainAffixesFor,
  subAffixesFor,
  type CharacterDetail,
  type LightconeDetail,
  type RelicSetDetail,
} from './game-data.js';
import { relicSubValue } from './relic-pieces.js';
import { CHARACTER_ROSTER } from './data/character-roster.js';
import { LIGHTCONE_ROSTER } from './data/lightcone-roster.js';
import type { RelicPieceState } from './storage.js';

/**
 * 配装面板烘焙（2026-10-26 从 CharactersPage 抽出为共享模块）。
 *
 * 数据流：白值（角色成长段 + 光锥成长段）→ 加算项（遗器主/副词条 + 行迹属性点）
 * → composePanel → 面板 13 项；同时产出装备/星魂效果子句（effectClauses）。
 * **角色管理「配装模式」与展示柜导入必须共用这一份实现**，否则「展示柜面板」
 * 与「导入后的面板」会漂移。
 */

/** 烘焙输入（与角色管理配装模式的表单状态一一对应） */
export interface LoadoutInput {
  rosterId: string;
  charLevel: number;
  charPromotion: number;
  lcLevel: number;
  lcPromotion: number;
  lightconeId: string;
  refinement: number;
  relicsetId: string;
  relicsetId2?: string;
  planarsetId?: string;
  eidolonLevel: number;
  traceChecked: Record<string, boolean>;
  relicPieces: readonly RelicPieceState[];
}

export interface LoadoutDetails {
  charDetail: CharacterDetail | null;
  lightcone: LightconeDetail | null;
  relicSets: Readonly<Record<string, RelicSetDetail | undefined>>;
  /** 战斗引擎已接入的 rosterId 集合（星魂 unknown 子句改标「已接入」） */
  battleRosterIds: ReadonlySet<string>;
}

export interface LoadoutResult {
  /** 角色白值（不含光锥） */
  charWhite: WhiteValues | null;
  /** 光锥白值 */
  lcWhite: WhiteValues | null;
  /** 光锥/套装/星魂效果子句（顺序固定：lc → 2件 → 2件b → 4件 → 位面 → 星魂） */
  clauses: EffectClause[];
  /** 面板；白值缺失时为 null */
  panel: PanelStats | null;
  /** 命途不匹配：光锥只有白值生效、文案效果不生效（2026-10-29 用户裁定） */
  lightconePathMismatch: boolean;
}

/** 命途等价名（引擎 CHAR_PATH 里 6 个旧名写 'Nihility'，数据侧统一 'Warlock'） */
const PATH_ALIAS: Record<string, string> = { Nihility: 'Warlock' };
const normPath = (p: string | undefined): string | undefined => (p ? (PATH_ALIAS[p] ?? p) : p);

const CHAR_PATH_BY_ROSTER: ReadonlyMap<string, string> = new Map(
  CHARACTER_ROSTER.map((c) => [c.id, c.path]),
);
const LC_PATH_BY_ID: ReadonlyMap<string, string> = new Map(
  LIGHTCONE_ROSTER.map((l) => [l.id, l.path]),
);

/**
 * 光锥命途校验（2026-10-29 用户裁定）：非对应命途角色装备光锥时，光锥文案效果不生效、
 * 只有白值（生命/攻击/防御）生效。未知 id 一律放行（旧档/样例存档零回归）。
 */
export function lightconePathMatches(rosterId: string, lightconeId: string): boolean {
  if (!rosterId || !lightconeId) return true;
  const need = normPath(LC_PATH_BY_ID.get(lightconeId));
  const have = normPath(CHAR_PATH_BY_ROSTER.get(rosterId));
  if (!need || !have) return true;
  return need === have;
}


/** 角色成长段白值（等级 + 突破段） */
export function characterWhite(
  detail: CharacterDetail | null,
  level: number,
  promotion: number,
): WhiteValues | null {
  const segs = detail?.stats;
  if (!segs || segs.length === 0) return null;
  const seg = segs[Math.min(resolvePromotion(level, promotion), segs.length - 1)];
  if (!seg) return null;
  return {
    hp: grownValue({ base: seg.hpBase, add: seg.hpAdd }, level),
    atk: grownValue({ base: seg.atkBase, add: seg.atkAdd }, level),
    def: grownValue({ base: seg.defBase, add: seg.defAdd }, level),
    speed: seg.speedBase,
  };
}

/** 光锥成长段白值（光锥无速度） */
export function lightconeWhite(
  lightcone: LightconeDetail | null,
  level: number,
  promotion: number,
): WhiteValues | null {
  const segs = lightcone?.stats;
  if (!segs || segs.length === 0) return null;
  const seg = segs[Math.min(resolvePromotion(level, promotion), segs.length - 1)];
  if (!seg) return null;
  return {
    hp: grownValue({ base: seg.hpBase, add: seg.hpAdd }, level),
    atk: grownValue({ base: seg.atkBase, add: seg.atkAdd }, level),
    def: grownValue({ base: seg.defBase, add: seg.defAdd }, level),
    speed: 0,
  };
}

export function buildLoadout(
  input: LoadoutInput,
  details: LoadoutDetails,
): LoadoutResult {
  const charWhite = characterWhite(details.charDetail, input.charLevel, input.charPromotion);
  const lcWhite = lightconeWhite(details.lightcone, input.lcLevel, input.lcPromotion);

  const setA = input.relicsetId ? (details.relicSets[input.relicsetId] ?? null) : null;
  const setB = input.relicsetId2 ? (details.relicSets[input.relicsetId2] ?? null) : null;
  const planarSet = input.planarsetId ? (details.relicSets[input.planarsetId] ?? null) : null;

  const clauses: EffectClause[] = [];
  const lc = details.lightcone;
  const lightconePathMismatch =
    !!input.lightconeId && !!input.rosterId && lightconePathMatches(input.rosterId, input.lightconeId) === false;
  // 命途不匹配：光锥只有白值生效 → 文案子句一条都不进 clauses（面板/计算器都不烘）
  if (lc?.skillDesc && !lightconePathMismatch) {
    clauses.push(
      ...parseEquipmentEffect('lc', lc.skillDesc, lc.refinementLevels[String(input.refinement)] ?? [], {
        lightconeId: input.lightconeId,
      }),
    );
  }
  if (setA?.twoPiece?.desc) {
    clauses.push(...parseEquipmentEffect('r2', setA.twoPiece.desc, setA.twoPiece.paramList));
  }
  // 散件 2+2：两套各穿 2 件，只激活各自 2 件套效果
  if (setB?.twoPiece?.desc) {
    clauses.push(...parseEquipmentEffect('r2b', setB.twoPiece.desc, setB.twoPiece.paramList));
  }
  if (setA?.fourPiece?.desc && !input.relicsetId2) {
    clauses.push(...parseEquipmentEffect('r4', setA.fourPiece.desc, setA.fourPiece.paramList));
  }
  if (planarSet?.twoPiece?.desc) {
    clauses.push(...parseEquipmentEffect('p2', planarSet.twoPiece.desc, planarSet.twoPiece.paramList));
  }
  // 已激活星魂（1..eidolonLevel）
  for (const e of details.charDetail?.eidolons ?? []) {
    if (e.level <= input.eidolonLevel && e.desc) {
      clauses.push(...parseEquipmentEffect(`e${e.level}`, e.desc, e.paramList));
    }
  }
  // 引擎已接入角色：星魂 unknown 子句改标「战斗模拟已接入」——
  // 星魂战斗内按 eidolonLevel 走引擎、不经此解析器，原「未接入计算」标注会误导
  if (input.rosterId && details.battleRosterIds.has(input.rosterId)) {
    markEidolonClausesEngine(clauses);
  }

  const additions: PanelAddition[] = [];
  for (const c of clauses) {
    // 条件面板子句（如蕉乐园「有召唤物时暴伤+32%」）不进面板——战斗内由引擎
    // 按进战时实际状态判定挂载（裁定③），烘焙进面板会与引擎 GEAR 双计
    if (c.zone === 'panel' && c.property && !c.conditional) {
      additions.push({ property: c.property, value: c.value });
    }
  }
  for (const point of details.charDetail?.tracePoints ?? []) {
    if (input.traceChecked[point.key]) {
      additions.push({ property: point.property, value: point.value });
    }
  }
  input.relicPieces.forEach((piece, index) => {
    const slot = index + 1;
    const mains = mainAffixesFor(piece.rarity, slot);
    const main = mains.find((m) => m.property === piece.mainProperty) ?? mains[0];
    if (main) {
      additions.push({ property: main.property, value: mainAffixValue(main, piece.enhance) });
    }
    const subs = subAffixesFor(piece.rarity);
    for (const sub of piece.subs) {
      const affix = subs.find((s) => s.property === sub.property);
      if (affix) {
        additions.push({ property: affix.property, value: relicSubValue(sub, affix) });
      }
    }
  });

  let panel = charWhite
    ? composePanel({ character: charWhite, lightcone: lcWhite, additions })
    : null;
  if (panel && input.relicsetId === '124' && !input.relicsetId2) {
    const p = setA?.fourPiece?.paramList;
    if (p && p.length >= 5) {
      // 124 诗人4：速度降低#6%（p[0]=-0.08 带符号乘数，equipment-effects 走 unknown
      // 不进面板防双计）；进入战斗前速度 <#3→暴率+#5、<#2→暴率+#4（互斥取高）。
      // 忆灵自动继承面板快照
      const speed = panel.speed * (1 + p[0]);
      const critAdd = speed < p[2] ? p[4] : speed < p[1] ? p[3] : 0;
      panel = { ...panel, speed, critRate: panel.critRate + critAdd };
    }
  }

  return { charWhite, lcWhite, clauses, panel, lightconePathMismatch };
}
