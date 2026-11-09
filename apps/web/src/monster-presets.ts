import {
  STAGE_PACKS,
  buildPackStageWaves,
  type MonsterConfig,
  type RoundMode,
  type StageDef,
  type StagePackDef,
} from '@hsr-calc/engine';
import type { Element } from '@hsr-calc/shared';

/**
 * 关卡预设（高难本 5 个包）→ 前端三级选择（模式 → 期数 → 关卡/半）。
 *
 * 数据链：`data/monster-stages/*.json` → `scripts/gen-monster-stages.mjs`
 *   → `packages/engine/src/combat/monster-stages.ts`（引擎侧生成物，导出 STAGE_PACKS）
 *
 * 一段 = 一场独立战斗的波次序列：
 * - `boss` 关（混沌 / 虚构 / 末日最难关）拆「上半 / 下半」两条；
 * - `star` 星启、`single` 仲裁单段关各一条（无上下半）。
 */
export type StagePackMode = 'moc' | 'pure' | 'apo' | 'arb';
export type StageHalfName = '上半' | '下半';

export interface StageSectionPreset {
  /** 选项 key：`${包 id}|${关卡序号}|${半名或空}` */
  key: string;
  /** 包 id（moc-p43 / pure-p27 …） */
  packId: string;
  mode: StagePackMode;
  /** 期数 */
  period: number;
  /** 该包默认轮次模式（选中即套用） */
  roundMode: RoundMode;
  stage: StageDef;
  /** boss 关的段名；星启 / 仲裁单段关为 undefined */
  half?: StageHalfName;
  /** 该段等级 */
  level: number;
  /** 该段总血量（游戏原值：该段所有敌人的血量合计） */
  hp: number;
  /**
   * 战斗内**实际需要打掉**的血量（第四十一轮）：
   * - 普通段：每波只加载前 3 只 → 各波前 3 只血量之和
   * - 虚构段（`waveClearRule: 'pure'`）：第 1 波按击杀数换波 → 前 `pureKillTarget` 只之和；
   *   第 2 波起 boss 死亡即换波 → 只算 boss（每波第一只）
   * 用于在界面上把「游戏原值」与「本模拟器实战值」同时展示（虚构段两者差一个量级）。
   */
  hpBattle: number;
  /** 该段属性标签（= 该段所有怪弱点交集） */
  tags: readonly Element[];
  /** 波次阵容（每波最多 5 只，对应 monster1..5 槽；2026-11-01 用户裁定） */
  waves: MonsterConfig[][];
  /**
   * 该段适用的关卡机制：**关卡级 `stage.mechanics` / 半段 `half.mechanics` 优先，
   * 否则回落本期的 `pack.modeMechanics`**。混沌「记忆紊流」与末日「末法余烬」都挂在包级，
   * 只读 `stage.mechanics` 会拿不到 → 机制永远到不了战斗（2026-10-30 修正）。
   */
  mechanics: readonly { name: string; desc: string }[];
  /**
   * 波次清场规则（2026-10-30 用户裁定 56）：虚构叙事（pure）是「第 1 波按击杀数、第 2 波起按 boss 死亡」
   * 推进，其余模式为 undefined（= 三槽全灭才换波，旧口径）。
   */
  waveClearRule?: 'pure';
  /** `waveClearRule: 'pure'` 时第 1 波换波所需击杀数（用户口头给的 20） */
  pureKillTarget?: number;
}

/** 一个关卡包（一期）→ 可选段列表 */
export interface StagePackView {
  pack: StagePackDef;
  sections: StageSectionPreset[];
}

/** 战斗内实际需打掉的血量（口径见 StageSectionPreset.hpBattle） */
function hpBattleOf(waves: readonly (readonly { hp: number }[])[], pure: boolean, pureKillTarget: number): number {
  if (!pure) {
    return waves.reduce((sum, w) => sum + w.slice(0, 5).reduce((s, c) => s + c.hp, 0), 0);
  }
  // 虚构：第 1 波打够 pureKillTarget 只，之后每波只打 boss（第一只）
  const first = waves[0]?.slice(0, pureKillTarget).reduce((s, c) => s + c.hp, 0) ?? 0;
  const rest = waves.slice(1).reduce((sum, w) => sum + (w[0]?.hp ?? 0), 0);
  return first + rest;
}

let sectionCache: StageSectionPreset[] | null = null;
let viewCache: StagePackView[] | null = null;

/** 全部段（按包顺序 + 关内顺序） */
export function stagePresets(): StageSectionPreset[] {
  if (sectionCache) return sectionCache;
  const list: StageSectionPreset[] = [];
  for (const pack of STAGE_PACKS) {
    for (const st of pack.stages) {
      if (st.kind === 'boss') {
        for (const half of st.halves) {
          list.push({
            key: `${pack.id}|${st.index}|${half.half}`,
            packId: pack.id,
            mode: pack.mode,
            period: pack.period,
            roundMode: pack.roundMode,
            stage: st,
            half: half.half,
            level: half.level,
            hp: half.hp,
            tags: half.tags,
            waves: buildPackStageWaves(pack.id, st.index, half.half),
            hpBattle: hpBattleOf(
              buildPackStageWaves(pack.id, st.index, half.half),
              pack.mode === 'pure',
              20,
            ),
            mechanics: half.mechanics ?? st.mechanics ?? pack.modeMechanics ?? [],
            ...(pack.mode === 'pure' ? { waveClearRule: 'pure' as const, pureKillTarget: 20 } : {}),
          });
        }
        continue;
      }
      const level = st.level ?? 90;
      list.push({
        key: `${pack.id}|${st.index}|`,
        packId: pack.id,
        mode: pack.mode,
        period: pack.period,
        roundMode: pack.roundMode,
        stage: st,
        level,
        hp: st.totalHp,
        tags: st.tags ?? [],
        waves: buildPackStageWaves(pack.id, st.index),
        hpBattle: hpBattleOf(buildPackStageWaves(pack.id, st.index), pack.mode === 'pure', 20),
        mechanics: st.mechanics ?? pack.modeMechanics ?? [],
        ...(pack.mode === 'pure' ? { waveClearRule: 'pure' as const, pureKillTarget: 20 } : {}),
      });
    }
  }
  sectionCache = list;
  return list;
}

/**
 * 清洗持久化的段 key（第四十七轮）：只接受当前仍存在的段，其余（旧版本 key / 手改 localStorage）
 * 一律回落成空串 = 「不用预设」，避免刷新后带着一个查不到的段跑到战斗里。
 */
export function sanitizeStagePresetKey(key: string | null | undefined): string {
  if (!key) return '';
  return stagePresets().some((s) => s.key === key) ? key : '';
}

/** 按 key 取段预设 */
export function stagePreset(key: string): StageSectionPreset | undefined {
  if (!key) return undefined;
  return stagePresets().find((p) => p.key === key);
}

/**
 * 上一段 / 下一段（第四十八轮）：按 `stagePresets()` 的顺序（包 → 关 → 上半/下半）前后跳，
 * 跨关卡、跨包连续。`step` 为 -1 / +1；当前未选段或已在首/末段时返回 undefined（界面据此禁用按钮）。
 */
export function adjacentStagePreset(
  key: string,
  step: -1 | 1,
): StageSectionPreset | undefined {
  if (!key) return undefined;
  const list = stagePresets();
  const i = list.findIndex((s) => s.key === key);
  if (i < 0) return undefined;
  return list[i + step];
}

/** 全部包 + 各自的可选段 */
export function stagePackViews(): StagePackView[] {
  if (viewCache) return viewCache;
  const byPack = new Map<string, StageSectionPreset[]>();
  for (const p of stagePresets()) {
    const list = byPack.get(p.packId) ?? [];
    list.push(p);
    byPack.set(p.packId, list);
  }
  viewCache = STAGE_PACKS.map((pack) => ({ pack, sections: byPack.get(pack.id) ?? [] }));
  return viewCache;
}

/** 某个包的可选段 */
export function packSections(packId: string): StageSectionPreset[] {
  return stagePackViews().find((v) => v.pack.id === packId)?.sections ?? [];
}

/** 模式顺序（混沌 → 虚构 → 末日 → 仲裁），每项带该模式的包 */
export function stageModeViews(): { mode: StagePackMode; packs: StagePackView[] }[] {
  const order: StagePackMode[] = ['moc', 'pure', 'apo', 'arb'];
  const out = order.map((mode) => ({ mode, packs: [] as StagePackView[] }));
  for (const view of stagePackViews()) {
    const slot = out.find((o) => o.mode === view.pack.mode);
    if (slot) slot.packs.push(view);
  }
  return out.filter((o) => o.packs.length > 0);
}

/**
 * 关卡机制小标签（第四十四轮）：把该段生效的机制整理成界面可直接渲染的条目。
 * 只做展示（name + desc），不改战斗逻辑；无机制时返回空数组（前端据此不渲染那一行）。
 */
export function mechanicChips(
  preset: StageSectionPreset | undefined,
): { key: string; name: string; desc: string }[] {
  if (!preset || preset.mechanics.length === 0) return [];
  return preset.mechanics.map((m) => ({ key: m.name, name: m.name, desc: m.desc }));
}

/**
 * 关卡上下文（第四十六轮）：战报里记录「用的是哪一段 + 哪些机制」，历史页可回看。
 * 与 `mechanicChips` 同源，都只读段预设；未选段返回 undefined。
 */
export interface StageMeta {
  packId: string;
  stageIndex: number;
  /** boss 关的上半/下半；单段关没有 */
  half?: '上半' | '下半';
  level: number;
  /** 该段生效的机制名（中文，与关卡数据一致） */
  mechanics: string[];
}

export function stageMetaOf(preset: StageSectionPreset | undefined): StageMeta | undefined {
  if (!preset) return undefined;
  return {
    packId: preset.packId,
    stageIndex: preset.stage.index,
    ...(preset.half ? { half: preset.half } : {}),
    level: preset.level,
    mechanics: preset.mechanics.map((m) => m.name),
  };
}

/** 预设里第一只怪的 id（用于敌方美术） */
export function presetArtId(preset: StageSectionPreset | undefined): string | undefined {
  return preset?.waves[0]?.[0]?.monsterId;
}
