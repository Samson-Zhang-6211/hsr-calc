import type { Element } from '@hsr-calc/shared';
import type { StageMeta } from './monster-presets.js';
import type { SkillLevels, BattleResult } from '@hsr-calc/engine';
import type { EffectClause } from './equipment-effects.js';

export interface RelicSubState {
  property: string;
  rolls: number;
  /** 新版随机生成：精确总值（存在时面板合成直接用本值，覆盖 rolls 公式） */
  value?: number;
  /** 新版随机生成：初始 + 各次强化档位明细（0/1/2） */
  tiers?: number[];
}

export interface RelicPieceState {
  rarity: number;
  enhance: number;
  mainProperty: string;
  subs: RelicSubState[];
}

export interface StoredEquipment {
  lightconeId: string;
  refinement: number;
  /** 洞窟遗器套装（4件位）；散件 2+2 时为第一套 */
  relicsetId: string;
  /** 散件第二套（可选，与 relicsetId 各 2 件，仅激活各自 2 件套效果） */
  relicsetId2?: string;
  /** 位面套装（与遗器套同时生效） */
  planarsetId?: string;
  /** 星魂 0-6（缺省 0） */
  eidolonLevel?: number;
  charLevel: number;
  charPromotion: number;
  lcLevel: number;
  lcPromotion: number;
  traceChecked: Record<string, boolean>;
  relicPieces: RelicPieceState[];
  effectClauses: EffectClause[];
}

export interface StoredBuild {
  /** 光锥 id（data/lightcones） */
  lightconeId: string;
  /** 叠影 1-5 */
  refinement: number;
  /** 四件套遗器 id（data/relicsets） */
  relicsetId: string;
  /** 散件第二套（可选） */
  relicsetId2?: string;
  /** 位面套装 id */
  planarsetId?: string;
  /** 星魂 0-6（缺省 0） */
  eidolonLevel?: number;
}

export interface StoredCharacter {
  id: string;
  rosterId?: string;
  name: string;
  element: string;
  level: number;
  atk: number;
  hp: number;
  def: number;
  critRate: number;
  critDmg: number;
  breakEffect: number;
  damageBonus: number;
  /** 通用增伤（全属性共享，缺省 0）：增伤区 = commonBonus + elementDmg[伤害属性] */
  commonBonus?: number;
  /** 7 属性增伤（各属性独立）；缺省时回退旧语义 damageBonus→该角色属性 */
  elementDmg?: Partial<Record<Element, number>>;
  /** 面板速度（manual 手填 / equipment 取 panelStats），行动轴模拟必需 */
  speed?: number;
  /** 能量恢复效率（比例，0.194 = 充能绳 19.4%），manual 手填 / equipment 取 panelStats */
  energyRegen?: number;
  /** 面板欢愉度基础值（比例，0.15 = 15%；缺省 0）。令使/行迹加算由引擎自动处理 */
  elationDegree?: number;
  /** 面板效果命中比例（0.5=50%；遗器304贝洛伯格门槛判定；manual 手填 / equipment 取 panelStats） */
  effectHit?: number;
  /** 面板效果抵抗比例（0.3=30%；遗器310龙骨门槛判定） */
  effectRes?: number;
  /** 面板治疗量加成比例（0.12=12%） */
  healBonus?: number;
  /** 面板来源：缺省视为 manual（兼容旧存档） */
  mode?: 'manual' | 'equipment';
  /** 技能等级（战斗模拟按等级取参；缺省各 10）。basic普攻 skill战技 ult终结技 talent天赋 memoSkill忆灵技 */
  skillLevels?: Partial<SkillLevels>;
  /** 配装记录（光锥/遗器/星魂；战斗条件子句据此硬编码启用） */
  build?: StoredBuild;
  /** 导入 JSON 用的自由备注（界面不显示） */
  _note?: string;
  equipment?: StoredEquipment;
}

export interface HistoryEntry {
  id: string;
  time: number;
  kind: string;
  total: number;
  summary: string;
}

/** 战斗模拟历史（完整 BattleResult，历史页「战斗模拟」区可回看整表） */
export interface StoredBattleEntry {
  id: string;
  time: number;
  /** 列表展示摘要：轮次 · 用时 · 总伤 */
  summary: string;
  total: number;
  /**
   * 关卡上下文（第四十六轮，可选）：用了哪一段关卡、该段的关卡机制。
   * **旧战报没有这个字段**（读历史时按 `undefined` 处理，界面不显示那一行）。
   */
  stage?: StageMeta;
  /** 完整战斗结果（events/hits/report/summary/finalState，纯数据可序列化） */
  result: BattleResult;
}

const CHAR_KEY = 'hsr-sim.characters';
const HISTORY_KEY = 'hsr-sim.history';
const BATTLE_HISTORY_KEY = 'hsr-sim.battleHistory';
/** 上次选中的关卡段 key（第四十七轮；空串 = 不用预设） */
const STAGE_PRESET_KEY = 'hsr-sim.stagePreset';
/**
 * 首访引导条是否已看过（2026-11-08 说明性内容批）。
 * 只控制「要不要自动弹那一条横幅」；顶栏 `?` 与 `/help` 任何时候都能打开，
 * 所以即使用户清了这个键、或者换了浏览器，也丢不掉说明书。
 */
const HELP_SEEN_KEY = 'hsr-sim.help.seen';
/** 战斗历史条数上限（单条含完整事件流，体积远大于计算器历史） */
const BATTLE_HISTORY_MAX = 30;

/**
 * 生成本地记录 id。`crypto.randomUUID` 只在安全上下文（HTTPS/localhost）可用——
 * 云端 独立端口部署 为非安全上下文，该函数为 undefined，直接调用会抛
 * TypeError 导致保存失败（2026-10-11 用户报「云端角色管理无法保存」根因，CDP 实测确认）。
 * 降级：时间戳 + 双随机段，本应用单机 localStorage 冲突概率可忽略。
 */
export function newId(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** 读单值字符串键（存储不可用时回落空串，与 getStagePresetKey 同口径） */
function readStr(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

// ── 存档快照（2026-11-08）：整站数据的导出/导入 ──────────────────────────────
// 动机：面板、历史与战报只存在 localStorage，清缓存/换浏览器/换设备即全丢。
// 这里把四类键打包成一个带版本号的 JSON 文件，用户可自行备份与迁移。
// 校验集中在 parseSnapshot（纯函数，便于单测），写回统一走 applySnapshot。
export const SNAPSHOT_APP = 'hsr-calc';
/** 存档格式版本：字段有不兼容变化时 +1，parseSnapshot 严格比对 */
export const SNAPSHOT_VERSION = 1;

export interface SaveSnapshot {
  app: typeof SNAPSHOT_APP;
  version: number;
  exportedAt: number;
  characters: StoredCharacter[];
  history: HistoryEntry[];
  battleHistory: StoredBattleEntry[];
  stagePresetKey: string;
}

export type SnapshotParseResult =
  | { ok: true; snapshot: SaveSnapshot }
  | { ok: false; reason: 'invalid-json' | 'not-snapshot' | 'version' | 'shape'; found?: string };

export function serializeSnapshot(s: SaveSnapshot): string {
  return JSON.stringify(s, null, 2);
}

/**
 * 解析并校验存档文本。宁放行不误杀：只校验「是不是本工具的存档」与三组数组的
 * 外层形态，**不深挖每条记录的字段**——记录结构会随版本演进，深层校验会让旧档失效。
 */
export function parseSnapshot(raw: string): SnapshotParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'not-snapshot' };
  }
  const o = data as Record<string, unknown>;
  if (o.app !== SNAPSHOT_APP || typeof o.version !== 'number') {
    return { ok: false, reason: 'not-snapshot' };
  }
  if (o.version !== SNAPSHOT_VERSION) {
    return { ok: false, reason: 'version', found: String(o.version) };
  }
  if (!Array.isArray(o.characters) || !Array.isArray(o.history) || !Array.isArray(o.battleHistory)) {
    return { ok: false, reason: 'shape' };
  }
  for (const arr of [o.characters, o.history, o.battleHistory] as unknown[][]) {
    if (arr.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) {
      return { ok: false, reason: 'shape' };
    }
  }
  return {
    ok: true,
    snapshot: {
      app: SNAPSHOT_APP,
      version: SNAPSHOT_VERSION,
      exportedAt: typeof o.exportedAt === 'number' ? o.exportedAt : 0,
      characters: o.characters as StoredCharacter[],
      history: o.history as HistoryEntry[],
      battleHistory: o.battleHistory as StoredBattleEntry[],
      stagePresetKey: typeof o.stagePresetKey === 'string' ? o.stagePresetKey : '',
    },
  };
}

export const storage = {
  getCharacters: () => read<StoredCharacter>(CHAR_KEY),
  saveCharacters: (list: StoredCharacter[]) => write(CHAR_KEY, list),
  getHistory: () => read<HistoryEntry>(HISTORY_KEY),
  saveHistory: (list: HistoryEntry[]) => write(HISTORY_KEY, list),
  /** 上次选中的关卡段 key（刷新后恢复；非法 key 由调用方用 sanitizeStagePresetKey 清洗） */
  getStagePresetKey: (): string => {
    try {
      return localStorage.getItem(STAGE_PRESET_KEY) ?? '';
    } catch {
      return '';
    }
  },
  saveStagePresetKey: (key: string) => {
    try {
      localStorage.setItem(STAGE_PRESET_KEY, key);
    } catch {
      /* 忽略（隐私模式/配额）——与其它写入口一致：UI 不因存储失败而中断 */
    }
  },
  getHelpSeen: (): boolean => {
    try {
      return localStorage.getItem(HELP_SEEN_KEY) === '1';
    } catch {
      // 隐私模式 / 配额异常：按「没看过」处理，只是多弹一次横幅，不影响使用
      return false;
    }
  },
  saveHelpSeen: () => {
    try {
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch {
      /* 忽略（隐私模式/配额）——与其它写入口一致：UI 不因存储失败而中断 */
    }
  },
  getBattleHistory: () => read<StoredBattleEntry>(BATTLE_HISTORY_KEY),
  saveBattleHistory: (list: StoredBattleEntry[]) =>
    write(BATTLE_HISTORY_KEY, list.slice(0, BATTLE_HISTORY_MAX)),
  /** 把当前四类数据打包成快照（存储不可用时得到空内容，不抛错） */
  exportSnapshot: (now: number = Date.now()): SaveSnapshot => ({
    app: SNAPSHOT_APP,
    version: SNAPSHOT_VERSION,
    exportedAt: now,
    characters: read<StoredCharacter>(CHAR_KEY),
    history: read<HistoryEntry>(HISTORY_KEY),
    battleHistory: read<StoredBattleEntry>(BATTLE_HISTORY_KEY),
    stagePresetKey: readStr(STAGE_PRESET_KEY),
  }),
  /**
   * 用快照覆盖当前四类数据。隐私模式/配额不足时返回 false 而不是抛错——
   * 调用方据此提示「写入失败」，界面不因存储异常白屏（与其它写入口同口径）。
   * 战报沿用 saveBattleHistory 的 30 条上限，避免导入一份旧档把配额撑爆。
   */
  applySnapshot: (s: SaveSnapshot): boolean => {
    try {
      write(CHAR_KEY, s.characters);
      write(HISTORY_KEY, s.history);
      write(BATTLE_HISTORY_KEY, s.battleHistory.slice(0, BATTLE_HISTORY_MAX));
      localStorage.setItem(STAGE_PRESET_KEY, s.stagePresetKey);
      return true;
    } catch {
      return false;
    }
  },
};
