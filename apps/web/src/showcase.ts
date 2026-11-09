import type { SkillLevels } from '@hsr-calc/engine';
import type { CharacterDetail } from './game-data.js';
import type { RelicPieceState, RelicSubState } from './storage.js';

/* ------------------------------------------------------------------ */
/* Enka.Network HSR 展示柜响应（按 2026-10-26 实测结构，非官方文档）       */
/* 端点：展示柜接口 /{uid}                                              */
/* 关键实测：没有 player / avatarList；角色在 detailInfo.avatarDetailList */
/* 遗器没有顶层 setId / rarity；_flat.props 是 Enka 解算好的词条精确值     */
/* 0 星魂 / +0 遗器时 rank、level 字段整个缺失 → 一律按 0 处理             */
/* ------------------------------------------------------------------ */

export interface EnkaProp {
  type: string;
  value: number;
}

export interface EnkaRelic {
  tid: number;
  /** 部位 1..6（头/手/躯干/脚/位面球/连结绳） */
  type: number;
  level?: number;
  mainAffixId: number;
  subAffixList?: { affixId: number; cnt: number; step?: number }[];
  _flat?: { props?: EnkaProp[]; setID?: number; setName?: string };
}

export interface EnkaEquipment {
  tid: number;
  rank?: number;
  level?: number;
  promotion?: number;
}

export interface EnkaAvatar {
  avatarId: number;
  level: number;
  promotion?: number;
  rank?: number;
  skillTreeList?: { pointId: number; level: number }[];
  equipment?: EnkaEquipment;
  relicList?: EnkaRelic[];
  /** 展示柜位次（部分条目不返回） */
  pos?: number;
  /** 支援角色标记 */
  _assist?: boolean;
}

export interface EnkaShowcase {
  uid?: string;
  ttl?: number;
  region?: string;
  detailInfo?: {
    nickname?: string;
    level?: number;
    signature?: string;
    headIcon?: number;
    avatarDetailList?: EnkaAvatar[];
  };
}

/* ------------------------------------------------------------------ */
/* 本地词条表（data/relic-affixes，来源 fribbels）                       */
/* main：键 = 稀有度+部位（如 '51' 五星头）；sub：键 = 稀有度             */
/* ------------------------------------------------------------------ */

export interface AffixRow {
  property: string;
  base: number;
  step: number;
}

export type AffixTable = Record<string, Record<string, AffixRow>>;

export interface AffixTables {
  main: AffixTable;
  sub: AffixTable;
}

/* ------------------------------------------------------------------ */
/* 解析结果类型                                                         */
/* ------------------------------------------------------------------ */

export interface ShowcaseSub {
  property: string;
  /** 精确值（来自 _flat.props）；缺失时为 undefined，回退 cnt/base/step 公式 */
  value?: number;
  /** 强化次数（enka cnt；面板回退公式与展示用） */
  rolls: number;
}

export interface ShowcaseRelic {
  slot: number;
  setId: string;
  rarity: number;
  level: number;
  mainProperty: string;
  mainValue: number;
  subs: ShowcaseSub[];
  /** 稀有度由 tid 前缀推断且与主词条值吻合（false = 存疑，建议在 UI 标注） */
  rarityVerified: boolean;
  /** _flat.props 缺失 → 副词条只能用公式近似 */
  approximate: boolean;
}

export interface ShowcaseLightcone {
  id: string;
  refinement: number;
  level: number;
  promotion: number;
}

export interface ShowcaseChar {
  avatarId: string;
  /** 本地名册同 id（暂缺数据的新角色为 null） */
  rosterId: string | null;
  level: number;
  promotion: number;
  eidolon: number;
  assist: boolean;
  pos: number | null;
  lightcone: ShowcaseLightcone | null;
  relics: ShowcaseRelic[];
  /** Enka：行迹节点 pointId + level */
  points: { pointId: number; level: number }[];
  /** mihomo：已解锁行迹锚点（point09…），优先于 points 使用 */
  anchors?: string[];
  /** mihomo：技能等级直接由接口给出（Enka 需按 pointId 反推） */
  skillLevels?: Partial<SkillLevels>;
}

export interface ShowcasePlayer {
  uid: string;
  nickname: string;
  level: number;
  signature: string;
  region: string;
  ttl: number;
  chars: ShowcaseChar[];
}

/* ------------------------------------------------------------------ */
/* 纯映射                                                              */
/* ------------------------------------------------------------------ */

/** tid 前缀 → 稀有度（实测 5 星 = 6；3~6 依次对应 2~5 星） */
const RARITY_BY_TID_PREFIX: Readonly<Record<number, number>> = {
  6: 5,
  5: 4,
  4: 3,
  3: 2,
};

/** 遗器 tid 前缀推断稀有度；未知前缀返回 null（调用方回退 5 星） */
export function relicRarityFromTid(tid: number): number | null {
  const prefix = Math.floor(tid / 10000);
  return RARITY_BY_TID_PREFIX[prefix] ?? null;
}

/** 遗器 tid → 套装 id（`tid = 60000 + setID×10 + 部位`，实测 8/8） */
export function relicSetIdFromTid(tid: number): string {
  return String(Math.floor(tid / 10) % 1000);
}

function tolerance(value: number): number {
  return Math.max(1e-6, Math.abs(value) * 1e-6);
}

interface MainResolution {
  rarity: number;
  property: string;
  value: number;
  verified: boolean;
  merged: boolean;
}

/**
 * 主词条解析：按 (稀有度, 部位, mainAffixId) 查本地表得到属性与数值，
 * 再用 `_flat.props` 反查校验——**稀有度前缀是实测归纳而非官方文档**，
 * 所以这里做两遍匹配（精确 → 主副同属性合并），最后才回退前缀推断值。
 */
function resolveMain(relic: EnkaRelic, tables: AffixTables): MainResolution | null {
  const level = Math.max(0, relic.level ?? 0);
  const props = relic._flat?.props ?? [];
  const guessed = relicRarityFromTid(relic.tid) ?? 5;
  const order: number[] = [];
  for (const r of [guessed, 5, 4, 3, 2]) {
    if (!order.includes(r)) order.push(r);
  }
  let fallback: MainResolution | null = null;
  const rowOf = (rarity: number): AffixRow | undefined =>
    tables.main[`${rarity}${relic.type}`]?.[String(relic.mainAffixId)];

  // 第一遍：精确命中（主词条值原样出现在 props 里）
  for (const rarity of order) {
    const row = rowOf(rarity);
    if (!row) continue;
    const value = row.base + row.step * level;
    fallback ??= { rarity, property: row.property, value, verified: false, merged: false };
    const same = props.filter((p) => p.type === row.property);
    if (same.some((p) => Math.abs(p.value - value) <= tolerance(value))) {
      return { rarity, property: row.property, value, verified: true, merged: false };
    }
  }
  // 第二遍：主副词条同属性被合并（props 只给一条 = 主 + 副）
  for (const rarity of order) {
    const row = rowOf(rarity);
    if (!row) continue;
    const value = row.base + row.step * level;
    const same = props.filter((p) => p.type === row.property);
    if (same.some((p) => p.value > value + tolerance(value))) {
      return { rarity, property: row.property, value, verified: true, merged: true };
    }
  }
  return fallback;
}

/**
 * 副词条解析。实测换算：**value = cnt × base + step × stepField**
 * （103/103 条实测吻合；项目内 `subAffixRollValue` 的 n·base+step·n(n−1)/2
 * 在星铁口径下只对 31/103 成立）。这里优先用 `_flat.props` 的精确值，
 * 缺失时才回退该公式。
 */
function resolveSubs(
  relic: EnkaRelic,
  rarity: number,
  main: MainResolution,
  tables: AffixTables,
): ShowcaseSub[] {
  const subTable = tables.sub[String(rarity)] ?? {};
  const entries = (relic._flat?.props ?? []).map((p) => ({ ...p }));
  // 摘掉主词条（精确命中摘一条；合并情形从该条里扣掉主词条值）
  const exactIdx = entries.findIndex(
    (p) => p.type === main.property && Math.abs(p.value - main.value) <= tolerance(main.value),
  );
  if (exactIdx >= 0) {
    entries.splice(exactIdx, 1);
  } else if (main.merged) {
    const idx = entries.findIndex((p) => p.type === main.property);
    if (idx >= 0) entries[idx] = { type: main.property, value: entries[idx].value - main.value };
  }

  const subs: ShowcaseSub[] = [];
  for (const raw of relic.subAffixList ?? []) {
    const row = subTable[String(raw.affixId)];
    if (!row) continue;
    const rolls = Math.max(1, Math.round(raw.cnt ?? 1));
    const idx = entries.findIndex((p) => p.type === row.property);
    if (idx >= 0) {
      const value = entries[idx].value;
      entries.splice(idx, 1);
      subs.push({ property: row.property, value, rolls });
    } else {
      // props 缺失该词条：用实测公式近似（step 缺省 0）
      subs.push({
        property: row.property,
        value: rolls * row.base + row.step * Math.max(0, raw.step ?? 0),
        rolls,
      });
    }
  }
  return subs;
}

/** 单件遗器映射；`type` 越界或套装 id 缺失时返回 null */
export function mapRelic(relic: EnkaRelic, tables: AffixTables): ShowcaseRelic | null {
  if (!Number.isFinite(relic.type) || relic.type < 1 || relic.type > 6) return null;
  const main = resolveMain(relic, tables);
  if (!main) return null;
  const setId =
    relic._flat?.setID !== undefined ? String(relic._flat.setID) : relicSetIdFromTid(relic.tid);
  const subs = resolveSubs(relic, main.rarity, main, tables);
  return {
    slot: relic.type,
    setId,
    rarity: main.rarity,
    level: Math.max(0, relic.level ?? 0),
    mainProperty: main.property,
    mainValue: main.value,
    subs,
    rarityVerified: main.verified,
    approximate: !relic._flat?.props?.length,
  };
}

/** 展示柜响应 → 结构化玩家数据（不联网、不读本地名册内容，rosterIds 由外部传入） */
export function parseShowcase(
  json: EnkaShowcase,
  tables: AffixTables,
  rosterIds: ReadonlySet<string>,
): ShowcasePlayer {
  const info = json.detailInfo ?? {};
  const avatars = info.avatarDetailList ?? [];
  const chars: ShowcaseChar[] = avatars
    .map((a): ShowcaseChar | null => {
      const avatarId = String(a.avatarId);
      if (!Number.isFinite(a.avatarId)) return null;
      const relics = (a.relicList ?? [])
        .map((r) => mapRelic(r, tables))
        .filter((r): r is ShowcaseRelic => r !== null)
        .sort((x, y) => x.slot - y.slot);
      const lc = a.equipment;
      return {
        avatarId,
        rosterId: rosterIds.has(avatarId) ? avatarId : null,
        level: a.level ?? 0,
        promotion: a.promotion ?? 0,
        eidolon: a.rank ?? 0,
        assist: a._assist === true,
        pos: typeof a.pos === 'number' ? a.pos : null,
        lightcone: lc
          ? {
              id: String(lc.tid),
              refinement: Math.max(1, lc.rank ?? 1),
              level: lc.level ?? 0,
              promotion: lc.promotion ?? 0,
            }
          : null,
        relics,
        points: (a.skillTreeList ?? []).map((p) => ({
          pointId: p.pointId,
          level: p.level ?? 0,
        })),
      };
    })
    .filter((c): c is ShowcaseChar => c !== null)
    .sort((x, y) => (x.pos ?? 99) - (y.pos ?? 99));

  return {
    uid: json.uid ?? '',
    nickname: info.nickname ?? '',
    level: info.level ?? 0,
    signature: info.signature ?? '',
    region: json.region ?? '',
    ttl: json.ttl ?? 60,
    chars,
  };
}

/* ------------------------------------------------------------------ */
/* 展示柜数据 → 角色管理存档（纯函数，不联网）                            */
/* ------------------------------------------------------------------ */

const SKILL_KIND: Readonly<Record<string, keyof SkillLevels | undefined>> = {
  Normal: 'basic',
  BPSkill: 'skill',
  Ultra: 'ult',
  Talent: 'talent',
};

/**
 * pointId 归一化（2026-10-26 端到端实测踩到）：
 * 部分角色的 Enka `pointId` 是**游戏内部 id**（8 位，`11004001` = 内部 avatarId `11004` × 1000 + 1），
 * 而 `data/characters/*.json` 的 `point_id` 用**名册 id**（7 位，`1004001`）。
 * 例：瓦尔特 1004 / 刃 1205 不做归一化 → 行迹与技能等级**全部静默丢失**（面板少 14.4% 增伤等）。
 * 规则：8 位且以 `1` 开头 → 去掉首位。
 */
export function normalizePointId(pointId: number): number {
  const s = String(Math.trunc(pointId));
  return s.length === 8 && s.startsWith('1') ? Number(s.slice(1)) : pointId;
}

/** 技能等级：行迹节点的 pointId ↔ 本地 skill_trees 的 point_id（clamp 到本地可用等级）。
 *  `direct` 为接口直接给出的等级（mihomo），存在时优先。 */
export function resolveSkillLevels(
  detail: CharacterDetail | null,
  points: readonly { pointId: number; level: number }[],
  direct?: Partial<SkillLevels>,
): Partial<SkillLevels> {
  const out: Partial<SkillLevels> = {};
  if (!detail) return { ...direct };
  const levelOf = new Map(
    points
      .filter((p) => p.level > 0)
      .map((p) => [normalizePointId(p.pointId), p.level] as const),
  );
  for (const node of detail.skillNodes) {
    if (!node.skillId) continue;
    const skill = detail.skills[node.skillId];
    if (!skill) continue;
    const kind = SKILL_KIND[skill.type ?? skill.type_name ?? ''];
    if (!kind) continue;
    const level = levelOf.get(normalizePointId(node.pointId));
    if (!level) continue;
    const maxKey = Object.keys(skill.level)
      .map(Number)
      .filter(Number.isFinite)
      .reduce((a, b) => Math.max(a, b), 1);
    out[kind] = Math.min(level, maxKey);
  }
  return { ...out, ...direct };
}

/** 行迹勾选：enka 已解锁的 pointId / mihomo 的 anchor → 本地 tracePoints.key */
export function resolveTraceChecked(
  detail: CharacterDetail | null,
  points: readonly { pointId: number; level: number }[],
  anchors?: readonly string[],
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!detail) return out;
  const unlocked = new Set(
    points.filter((p) => p.level > 0).map((p) => normalizePointId(p.pointId)),
  );
  const anchorSet = new Set((anchors ?? []).map((a) => a.toLowerCase()));
  for (const tp of detail.tracePoints) {
    if (tp.pointId !== null && unlocked.has(normalizePointId(tp.pointId))) {
      out[tp.key] = true;
      continue;
    }
    // 锚点前缀（`point09:1:0` → `point09`）
    if (anchorSet.size > 0 && anchorSet.has(tp.key.split(':')[0])) out[tp.key] = true;
  }
  return out;
}

/**
 * 展示柜 6 件 → 角色管理 relicPieces（按部位 1..6 对齐）。
 * 缺件的槽位写成「空件」：`rarity: 0` 让 `mainAffixesFor/subAffixesFor` 返回空表，
 * 面板烘焙时既不补主词条也不补副词条（不能用 5 星空主词条——那会凭空加一条词条）。
 */
export function relicPiecesFromShowcase(relics: readonly ShowcaseRelic[]): RelicPieceState[] {
  const bySlot = new Map(relics.map((r) => [r.slot, r]));
  const pieces: RelicPieceState[] = [];
  for (let slot = 1; slot <= 6; slot++) {
    const relic = bySlot.get(slot);
    if (!relic) {
      pieces.push({ rarity: 0, enhance: 0, mainProperty: '', subs: [] });
      continue;
    }
    const subs: RelicSubState[] = relic.subs.map((s) => ({
      property: s.property,
      rolls: s.rolls,
      ...(s.value !== undefined ? { value: s.value } : {}),
    }));
    pieces.push({
      rarity: relic.rarity,
      enhance: relic.level,
      mainProperty: relic.mainProperty,
      subs,
    });
  }
  return pieces;
}

export interface ShowcaseSets {
  /** 四件套（或散件第一套） */
  relicsetId: string;
  /** 散件第二套 2+2 时的第二套 */
  relicsetId2?: string;
  planarsetId?: string;
}

/** 6 件遗器 → 四件套/散件/位面套装 id（按件数取主套；位面按 setId ≥ 300 判） */
export function setsFromShowcase(relics: readonly ShowcaseRelic[]): ShowcaseSets {
  const cavern = new Map<string, number>();
  const planar = new Map<string, number>();
  for (const relic of relics) {
    const bucket = Number(relic.setId) >= 300 ? planar : cavern;
    bucket.set(relic.setId, (bucket.get(relic.setId) ?? 0) + 1);
  }
  const ranked = [...cavern.entries()].sort((a, b) => b[1] - a[1]);
  const sets: ShowcaseSets = { relicsetId: ranked[0]?.[0] ?? '' };
  const second = ranked[1];
  if (second) sets.relicsetId2 = second[0];
  const topPlanar = [...planar.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPlanar) sets.planarsetId = topPlanar[0];
  return sets;
}
