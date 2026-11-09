import { ROSTER_VERSION } from './data/character-roster.js';
import { LIGHTCONE_ROSTER_VERSION } from './data/lightcone-roster.js';
import { RELICSET_ROSTER_VERSION } from './data/relicset-roster.js';
import { createLocalSource, type LocalSource } from './local-data.js';

const BASE = 'https://static.nanoka.cc/hsr';

// ---- 本地文档优先（data/ 目录，由 scripts/fetch-local-data.mjs 下载） ----

interface LocalDataRecord {
  id: string;
  version: string;
  zh: Record<string, unknown>;
  en: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

// 数据来源（2026-11-08 抽出）：在线构建 = 懒加载分片；离线包 = 经典脚本注入。
// 两个实现在 local-data.ts / local-data.offline.ts 里同名导出，由 vite 插件按 OFFLINE 替换。
const localCharacters = createLocalSource('characters');
const localLightcones = createLocalSource('lightcones');
const localRelicsets = createLocalSource('relicsets');
const localMonsters = createLocalSource('monsters');

/** 读取本地文档；不存在、版本与**该类名册**不一致或损坏时返回 null（回落在线拉取）。
 *
 * 2026-10-27 修：原来一律比 `ROSTER_VERSION`（角色 4.6.53），而光锥/遗器数据仍停
 * 4.6.51 → 本地文件被判版本不符、全部回落 CDN；一旦 CDN 不可达（国内网络实测超时）
 * 光锥/遗器详情就整块加载失败。改为按「角色 / 光锥 / 遗器」各自的名册版本校验。
 */
async function loadLocal(
  source: LocalSource,
  id: string,
  expectedVersion: string,
): Promise<LocalDataRecord | null> {
  const load = source.get(id);
  if (!load) return null;
  try {
    const mod = (await load()) as { default?: LocalDataRecord } & Partial<LocalDataRecord>;
    // 离线包按类注入，类里有这张表但没有这个 id 时 mod 为 undefined
    if (!mod) return null;
    const rec = (mod.default ?? mod) as LocalDataRecord;
    if (!rec || rec.version !== expectedVersion || !rec.zh || !rec.en) return null;
    return rec;
  } catch {
    return null;
  }
}

export interface GameSkillLevel {
  level: number;
  param_list: number[];
}

export type SkillForm = 'normal' | 'enhanced' | 'memosprite';

export interface GameSkill {
  id: string;
  name: string;
  type: string | null;
  type_name: string | null;
  desc: string | null;
  level: Record<string, GameSkillLevel>;
  form: SkillForm;
}

/** 角色成长段（键=突破段 0..6），段内值 = base + add×(等级−1) */
export interface CharacterStatSegment {
  hpBase: number;
  hpAdd: number;
  atkBase: number;
  atkAdd: number;
  defBase: number;
  defAdd: number;
  speedBase: number;
}

/** 行迹属性点（skill_trees 中带 status_add_list 的节点），由玩家手动勾选 */
export interface TraceStatPoint {
  key: string;
  /** 游戏内 SkillTreeConfig 的 point_id（展示柜按此判定是否已解锁；缺失为 null） */
  pointId: number | null;
  property: string;
  value: number;
  /** 属性名（随语言，如「冰属性伤害提高」） */
  name: string | null;
}

/** 行迹节点 → 升级的技能（point_id ↔ skill id；展示柜技能等级映射用） */
export interface SkillNode {
  pointId: number;
  /** 该节点升级的技能 id（行迹属性点/属性节点为 null） */
  skillId: string | null;
}

export interface CharacterDetail {
  name: string;
  base_type: string | null;
  damage_type: string | null;
  skills: Record<string, GameSkill>;
  /** 成长段 7 份 */
  stats: CharacterStatSegment[];
  /** 行迹属性点（手动勾选） */
  tracePoints: TraceStatPoint[];
  /** 行迹节点 ↔ 技能（point_id 映射，展示柜导入用） */
  skillNodes: SkillNode[];
  /** 星魂 1-6（按 level 升序） */
  eidolons: EidolonInfo[];
}

/** 星魂条目（desc 含 #N 参数，paramList 已按序号对齐） */
export interface EidolonInfo {
  level: number;
  name: string;
  desc: string;
  paramList: number[];
}

export type StatKind = 'atk' | 'hp' | 'def';
export type DataLang = 'zh' | 'en';

/** 网站（hsr.nanoka.cc）技能文案默认展示等级，来自其前端源码常量 Vl */
export const SKILL_DEFAULT_LEVEL: Readonly<Record<string, number>> = {
  Normal: 6,
  BPSkill: 10,
  Ultra: 10,
  QTE: 10,
  ElationDamage: 10,
  Assist: 10,
  Maze: 1,
  Servant: 6,
  Talent: 6,
};

export function defaultLevelFor(skill: GameSkill): number {
  const keys = Object.keys(skill.level)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const maxKey = keys.length > 0 ? Math.max(...keys) : 1;
  const preferred =
    SKILL_DEFAULT_LEVEL[skill.type ?? ''] ??
    SKILL_DEFAULT_LEVEL[skill.type_name ?? ''] ??
    maxKey;
  return Math.min(preferred, maxKey);
}

const memCache = new Map<string, CharacterDetail>();

function parseCharacterStats(raw: Record<string, unknown>): CharacterStatSegment[] {
  const stats = raw.stats as
    | Record<
        string,
        {
          hp_base?: number;
          hp_add?: number;
          attack_base?: number;
          attack_add?: number;
          defence_base?: number;
          defence_add?: number;
          speed_base?: number;
        }
      >
    | undefined;
  if (!stats) return [];
  return Object.keys(stats)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => {
      const s = stats[k];
      return {
        hpBase: s.hp_base ?? 0,
        hpAdd: s.hp_add ?? 0,
        atkBase: s.attack_base ?? 0,
        atkAdd: s.attack_add ?? 0,
        defBase: s.defence_base ?? 0,
        defAdd: s.defence_add ?? 0,
        speedBase: s.speed_base ?? 0,
      };
    });
}

function parseTracePoints(raw: Record<string, unknown>): TraceStatPoint[] {
  const trees = raw.skill_trees as
    | Record<
        string,
        | Record<
            string,
            {
              point_id?: number | null;
              status_add_list?: Array<{
                property_type?: string;
                value?: number;
                name?: string | null;
              }>;
            }
          >
        | undefined
      >
    | undefined;
  const points: TraceStatPoint[] = [];
  for (const [anchorKey, levels] of Object.entries(trees ?? {})) {
    for (const [levelKey, node] of Object.entries(levels ?? {})) {
      let index = 0;
      for (const status of node?.status_add_list ?? []) {
        if (!status?.property_type) continue;
        points.push({
          key: `${anchorKey}:${levelKey}:${index++}`,
          pointId: typeof node?.point_id === 'number' ? node.point_id : null,
          property: status.property_type,
          value: status.value ?? 0,
          name: status.name ?? null,
        });
      }
    }
  }
  return points;
}

/** 行迹节点 → 升级技能（每个锚点取首个等级行的 point_id / level_up_skill_id） */
function parseSkillNodes(raw: Record<string, unknown>): SkillNode[] {
  const trees = raw.skill_trees as
    | Record<
        string,
        | Record<
            string,
            { point_id?: number | null; level_up_skill_id?: number[] | null } | undefined
          >
        | undefined
      >
    | undefined;
  const nodes: SkillNode[] = [];
  const seen = new Set<number>();
  for (const levels of Object.values(trees ?? {})) {
    const first = Object.values(levels ?? {})[0];
    const pointId = first?.point_id;
    if (typeof pointId !== 'number' || seen.has(pointId)) continue;
    seen.add(pointId);
    const skillIds = first?.level_up_skill_id ?? [];
    nodes.push({ pointId, skillId: skillIds.length > 0 ? String(skillIds[0]) : null });
  }
  return nodes;
}

function parseEidolons(raw: Record<string, unknown>): EidolonInfo[] {
  const ranks = raw.ranks as
    | Record<
        string,
        { name?: string; desc?: string | null; param_list?: number[] | null }
      >
    | undefined;
  if (!ranks) return [];
  return Object.keys(ranks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => {
      const r = ranks[String(level)] ?? {};
      return {
        level,
        name: r.name ?? '',
        desc: r.desc ?? '',
        paramList: r.param_list ?? [],
      };
    });
}

function trim(raw: Record<string, unknown>): CharacterDetail {
  const skills: Record<string, GameSkill> = {};
  const add = (s: GameSkill, form: SkillForm) => {
    if (s && s.id !== undefined) skills[String(s.id)] = { ...s, form };
  };
  for (const s of Object.values((raw.skills as Record<string, GameSkill>) ?? {})) {
    add(s, 'normal');
  }
  const enhanced = raw.enhanced as
    | Record<string, { skills?: Record<string, GameSkill> }>
    | undefined;
  for (const form of Object.values(enhanced ?? {})) {
    for (const s of Object.values(form?.skills ?? {})) add(s, 'enhanced');
  }
  const memo = raw.memosprite as { skills?: Record<string, GameSkill> } | undefined;
  for (const s of Object.values(memo?.skills ?? {})) add(s, 'memosprite');
  return {
    name: (raw.name as string) ?? '',
    base_type: (raw.base_type as string) ?? null,
    damage_type: (raw.damage_type as string) ?? null,
    skills,
    stats: parseCharacterStats(raw),
    tracePoints: parseTracePoints(raw),
    skillNodes: parseSkillNodes(raw),
    eidolons: parseEidolons(raw),
  };
}

export async function fetchCharacterDetail(
  id: string,
  lang: DataLang,
): Promise<CharacterDetail> {
  const key = `${ROSTER_VERSION}:v5:${lang}:${id}`;
  const hit = memCache.get(key);
  if (hit) return hit;
  const local = await loadLocal(localCharacters, id, ROSTER_VERSION);
  if (local) {
    const detail = trim(local[lang] as Record<string, unknown>);
    memCache.set(key, detail);
    return detail;
  }
  const lsKey = `hsr-sim.detail.${key}`;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const parsed = JSON.parse(raw) as CharacterDetail;
      memCache.set(key, parsed);
      return parsed;
    }
  } catch {
    /* 缓存损坏则忽略 */
  }
  const res = await fetch(`${BASE}/${ROSTER_VERSION}/${lang}/character/${id}.json`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const detail = trim((await res.json()) as Record<string, unknown>);
  memCache.set(key, detail);
  try {
    localStorage.setItem(lsKey, JSON.stringify(detail));
  } catch {
    /* 超配额则放弃持久化 */
  }
  return detail;
}

const PARAM_RE = /#(\d+)(\[[if]\d*\])?(%)?/g;

/** 读取角色有效词条（data/characters/{id}.json 的 meta.effectiveSubstats）。
 *  本地文档缺失、版本不一致或字段无效时返回 null。 */
export async function fetchEffectiveSubstats(id: string): Promise<string[] | null> {
  if (!id) return null;
  const local = await loadLocal(localCharacters, id, ROSTER_VERSION);
  const arr = local?.meta?.effectiveSubstats;
  if (
    Array.isArray(arr) &&
    arr.length > 0 &&
    arr.every((x): x is string => typeof x === 'string')
  ) {
    return arr;
  }
  return null;
}

export interface AllocConfig {
  /** 逐词条权重（meta.substatWeights；缺省全 1 时不给） */
  weights?: Record<string, number>;
  /** 面板爆率上限（meta.critRateTarget；缺省 0.95） */
  critRateTarget: number;
}

/** 读取分配权重配置（meta.substatWeights + meta.critRateTarget，2026-10-08 逐批批准）。
 *  两字段皆缺省（老档/无 meta）时返回 null → 调用方零回归。 */
export async function fetchAllocConfig(id: string): Promise<AllocConfig | null> {
  if (!id) return null;
  const local = await loadLocal(localCharacters, id, ROSTER_VERSION);
  const meta = local?.meta;
  if (!meta || typeof meta !== 'object') return null;
  let weights: Record<string, number> | undefined;
  const raw = meta.substatWeights;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const entries: [string, number][] = [];
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) entries.push([k, v]);
    }
    if (entries.length > 0) weights = Object.fromEntries(entries);
  }
  const t = meta.critRateTarget;
  const critRateTarget =
    typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= 1 ? t : 0.95;
  if (!weights && critRateTarget === 0.95) return null;
  return { weights, critRateTarget };
}

function formatValue(value: number, fmt: string | undefined, percent: boolean): string {
  const u = percent ? value * 100 : value;
  const dm = fmt === undefined ? null : /^\[f(\d)\]$/.exec(fmt);
  if (fmt === '[i]' || fmt === undefined) {
    const l = Math.round(u);
    return percent ? `${l}%` : String(l);
  }
  if (dm) {
    const f = 10 ** Number(dm[1]);
    const l = Math.round(u * f) / f;
    return percent ? `${l}%` : String(l);
  }
  return percent ? `${u}%` : String(u);
}

export interface ParamPlaceholder {
  index: number;
  percent: boolean;
}

export function paramPlaceholders(desc: string): ParamPlaceholder[] {
  const seen = new Map<number, ParamPlaceholder>();
  for (const m of desc.matchAll(PARAM_RE)) {
    const index = Number(m[1]);
    if (!seen.has(index)) {
      seen.set(index, { index, percent: m[3] === '%' });
    }
  }
  return [...seen.values()].sort((a, b) => a.index - b.index);
}

export function formatSkillDesc(desc: string, params: readonly number[]): string {
  let s = desc.replace(PARAM_RE, (_full, n: string, fmt: string | undefined, pct: string | undefined) => {
    const v = params[Number(n) - 1];
    if (v === undefined) return '?';
    return formatValue(v, fmt, pct === '%');
  });
  s = s.replace(/\{RUBY_B#[^}]*\}([^{]+)\{RUBY_E#\}/g, '$1');
  s = s.replace(/\{NICKNAME\}/g, '开拓者');
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  return s;
}

export function detectStatKind(desc: string): StatKind | null {
  const rules: Array<[RegExp, StatKind]> = [
    [/攻击力|ATK/i, 'atk'],
    [/生命上限|生命值|HP/i, 'hp'],
    [/防御力|DEF/i, 'def'],
  ];
  let best: { idx: number; kind: StatKind } | null = null;
  for (const [re, kind] of rules) {
    const m = re.exec(desc);
    if (m && (best === null || m.index < best.idx)) {
      best = { idx: m.index, kind };
    }
  }
  return best?.kind ?? null;
}

export interface MonsterDetail {
  id: string;
  name: string;
  /** 韧性上限（点，常规普攻 = 30） */
  toughnessPoints: number;
  weak: string[];
  /** 各属性抗性（元素 → 小数）；数据缺失时为空对象 */
  resistances: Record<string, number>;
}

const memoCache = new Map<string, MonsterDetail>();

function parseMonster(raw: Record<string, unknown>, fallbackId: string): MonsterDetail {
  const child = (raw.child as Array<Record<string, unknown>> | undefined)?.[0];
  const ratio = Number(child?.stance_modify_ratio ?? 1);
  const value = Number(child?.stance_modify_value ?? 0);
  const base = Number(raw.stance_base ?? 0);
  const resistances: Record<string, number> = {};
  const resList =
    (child?.damage_type_resistance as
      | Array<{ damage_type?: string; value?: number }>
      | undefined) ??
    (raw.damage_type_resistance as
      | Array<{ damage_type?: string; value?: number }>
      | undefined);
  if (Array.isArray(resList)) {
    for (const r of resList) {
      const v = Number(r?.value);
      if (r?.damage_type && Number.isFinite(v)) resistances[r.damage_type] = v;
    }
  }
  return {
    id: String(raw.id ?? fallbackId),
    name: (raw.name as string) ?? '',
    toughnessPoints: base * (Number.isFinite(ratio) ? ratio : 1) + (Number.isFinite(value) ? value : 0),
    weak:
      (child?.stance_weak_list as string[] | undefined) ??
      (raw.weak as string[] | undefined) ??
      [],
    resistances,
  };
}

export async function fetchMonsterDetail(
  id: string,
  lang: DataLang,
): Promise<MonsterDetail> {
  const key = `${ROSTER_VERSION}:v3:${lang}:${id}`;
  const hit = memoCache.get(key);
  if (hit) return hit;
  const local = await loadLocal(localMonsters, id, ROSTER_VERSION);
  if (local) {
    const detail = parseMonster(lang === 'zh' ? local.zh : local.en, id);
    memoCache.set(key, detail);
    return detail;
  }
  const lsKey = `hsr-sim.monster.${key}`;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const parsed = JSON.parse(raw) as MonsterDetail;
      memoCache.set(key, parsed);
      return parsed;
    }
  } catch {
    /* 缓存损坏则忽略 */
  }
  const res = await fetch(`${BASE}/${ROSTER_VERSION}/${lang}/monster/${id}.json`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const raw = (await res.json()) as Record<string, unknown>;
  const detail = parseMonster(raw, id);
  memoCache.set(key, detail);
  try {
    localStorage.setItem(lsKey, JSON.stringify(detail));
  } catch {
    /* 超配额则放弃持久化 */
  }
  return detail;
}

export interface LightconeDetail {
  name: string;
  /** 原始稀有度串（如 CombatPowerLightconeRarity5） */
  rarity: string;
  /** 命途（如 Rogue） */
  baseType: string;
  /** 光锥技能名（叠影技能） */
  skillName: string;
  /** 光锥技能参数化文案（#N 占位） */
  skillDesc: string | null;
  /** 叠影 1-5 各级参数表 */
  refinementLevels: Record<string, number[]>;
  /** 成长段（键=突破段 0..6），段内值 = base + add×(等级−1) */
  stats: CharacterStatSegment[];
}

const lightconeCache = new Map<string, LightconeDetail>();

function parseLightcone(raw: Record<string, unknown>): LightconeDetail {
  const ref = raw.refinements as
    | {
        name?: string;
        desc?: string | null;
        level?: Record<string, { param_list?: number[] } | undefined>;
      }
    | undefined;
  const refinementLevels: Record<string, number[]> = {};
  for (const [lv, row] of Object.entries(ref?.level ?? {})) {
    refinementLevels[lv] = row?.param_list ?? [];
  }
  const statsRows = raw.stats as
    | Array<{
        base_hp?: number;
        base_hp_add?: number;
        base_attack?: number;
        base_attack_add?: number;
        base_defence?: number;
        base_defence_add?: number;
      }>
    | undefined;
  const stats: CharacterStatSegment[] = (statsRows ?? []).map((s) => ({
    hpBase: s.base_hp ?? 0,
    hpAdd: s.base_hp_add ?? 0,
    atkBase: s.base_attack ?? 0,
    atkAdd: s.base_attack_add ?? 0,
    defBase: s.base_defence ?? 0,
    defAdd: s.base_defence_add ?? 0,
    // 光锥无速度成长
    speedBase: 0,
  }));
  return {
    name: (raw.name as string) ?? '',
    rarity: (raw.rarity as string) ?? '',
    baseType: (raw.base_type as string) ?? '',
    skillName: ref?.name ?? '',
    skillDesc: ref?.desc ?? null,
    refinementLevels,
    stats,
  };
}

export async function fetchLightconeDetail(
  id: string,
  lang: DataLang,
): Promise<LightconeDetail> {
  const key = `${ROSTER_VERSION}:v2:${lang}:${id}`;
  const hit = lightconeCache.get(key);
  if (hit) return hit;
  const local = await loadLocal(localLightcones, id, LIGHTCONE_ROSTER_VERSION);
  if (local) {
    const detail = parseLightcone(local[lang] as Record<string, unknown>);
    lightconeCache.set(key, detail);
    return detail;
  }
  const lsKey = `hsr-sim.lightcone.${key}`;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const parsed = JSON.parse(raw) as LightconeDetail;
      lightconeCache.set(key, parsed);
      return parsed;
    }
  } catch {
    /* 缓存损坏则忽略 */
  }
  const res = await fetch(`${BASE}/${ROSTER_VERSION}/${lang}/lightcone/${id}.json`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const detail = parseLightcone((await res.json()) as Record<string, unknown>);
  lightconeCache.set(key, detail);
  try {
    localStorage.setItem(lsKey, JSON.stringify(detail));
  } catch {
    /* 超配额则放弃持久化 */
  }
  return detail;
}

export interface RelicSetEffect {
  desc: string | null;
  paramList: number[];
}

export interface RelicSetDetail {
  name: string;
  /** 散件（部件） */
  parts: Array<{ id: string; name: string }>;
  /** 2 件套效果 */
  twoPiece: RelicSetEffect | null;
  /** 4 件套效果（位面套装无） */
  fourPiece: RelicSetEffect | null;
}

const relicsetCache = new Map<string, RelicSetDetail>();

function parseRelicSet(raw: Record<string, unknown>): RelicSetDetail {
  const req = raw.require_num as
    | Record<string, { desc?: string | null; param_list?: number[] } | undefined>
    | undefined;
  const effectOf = (slot: string): RelicSetEffect | null => {
    const row = req?.[slot];
    if (!row) return null;
    return { desc: row.desc ?? null, paramList: row.param_list ?? [] };
  };
  const partsRaw = raw.parts as
    | Record<string, { name?: string } | undefined>
    | undefined;
  return {
    name: (raw.name as string) ?? '',
    parts: Object.entries(partsRaw ?? {}).map(([pid, p]) => ({
      id: pid,
      name: p?.name ?? '',
    })),
    twoPiece: effectOf('2'),
    fourPiece: effectOf('4'),
  };
}

export async function fetchRelicSetDetail(
  id: string,
  lang: DataLang,
): Promise<RelicSetDetail> {
  const key = `${ROSTER_VERSION}:v1:${lang}:${id}`;
  const hit = relicsetCache.get(key);
  if (hit) return hit;
  const local = await loadLocal(localRelicsets, id, RELICSET_ROSTER_VERSION);
  if (local) {
    const detail = parseRelicSet(local[lang] as Record<string, unknown>);
    relicsetCache.set(key, detail);
    return detail;
  }
  const lsKey = `hsr-sim.relicset.${key}`;
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const parsed = JSON.parse(raw) as RelicSetDetail;
      relicsetCache.set(key, parsed);
      return parsed;
    }
  } catch {
    /* 缓存损坏则忽略 */
  }
  const res = await fetch(`${BASE}/${ROSTER_VERSION}/${lang}/relicset/${id}.json`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const detail = parseRelicSet((await res.json()) as Record<string, unknown>);
  relicsetCache.set(key, detail);
  try {
    localStorage.setItem(lsKey, JSON.stringify(detail));
  } catch {
    /* 超配额则放弃持久化 */
  }
  return detail;
}

/* ------------------------------------------------------------------ */
/* 遗器词条表（data/relic-affixes/，来源 fribbels/hsr-optimizer）        */
/* 主词条值 = base + step×强化等级(0-15)；副词条第 i 次 roll = base+step×i */
/* ------------------------------------------------------------------ */

export interface MainAffix {
  property: string;
  base: number;
  step: number;
}

export interface SubAffix {
  property: string;
  base: number;
  step: number;
}

const affixModules = import.meta.glob('../../../data/relic-affixes/*.json', {
  eager: true,
}) as Record<string, { default: unknown }>;

function loadAffixFile(file: 'main' | 'sub'): Record<string, unknown> | null {
  const entry = Object.entries(affixModules).find(([path]) =>
    path.endsWith(`/${file}.json`),
  );
  if (!entry) return null;
  return (entry[1].default ?? null) as Record<string, unknown> | null;
}

let mainAffixCache: Record<string, Record<string, MainAffix>> | null = null;
let subAffixCache: Record<string, Record<string, SubAffix>> | null = null;

function normalizeMainTable(
  raw: Record<string, unknown> | null,
): Record<string, Record<string, MainAffix>> {
  const out: Record<string, Record<string, MainAffix>> = {};
  for (const [key, slotRaw] of Object.entries(raw ?? {})) {
    const affixes = (slotRaw as { affixes?: Record<string, MainAffix> } | undefined)
      ?.affixes;
    if (affixes) out[key] = affixes;
  }
  return out;
}

function normalizeSubTable(
  raw: Record<string, unknown> | null,
): Record<string, Record<string, SubAffix>> {
  const out: Record<string, Record<string, SubAffix>> = {};
  for (const [key, levelRaw] of Object.entries(raw ?? {})) {
    const affixes = (levelRaw as { affixes?: Record<string, SubAffix> } | undefined)
      ?.affixes;
    if (affixes) out[key] = affixes;
  }
  return out;
}

/** 主词条表：键 = 稀有度+槽位（如 '51' 头、'56' 绳） */
export function mainAffixTable(): Record<string, Record<string, MainAffix>> {
  mainAffixCache ??= normalizeMainTable(loadAffixFile('main'));
  return mainAffixCache;
}

/** 副词条表：键 = 稀有度（'2'..'5'） */
export function subAffixTable(): Record<string, Record<string, SubAffix>> {
  subAffixCache ??= normalizeSubTable(loadAffixFile('sub'));
  return subAffixCache;
}

/** 指定稀有度+槽位可选的主词条 */
export function mainAffixesFor(rarity: number, slot: number): MainAffix[] {
  return Object.values(mainAffixTable()[String(rarity) + String(slot)] ?? {});
}

/** 指定稀有度可选的副词条 */
export function subAffixesFor(rarity: number): SubAffix[] {
  return Object.values(subAffixTable()[String(rarity)] ?? {});
}
