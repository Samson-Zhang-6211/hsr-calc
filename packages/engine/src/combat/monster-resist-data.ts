/**
 * 怪物负面抵抗（DebuffResist）——手写表 + 生成表合并，非生成物本身。
 *
 * 数据源：
 * - 手写表（本文件）：Dimbreath `ExcelOutput/MonsterConfig.json` 的 `DebuffResist` 字段
 *   （格式：`[{ DebuffType: 'STAT_CTRL_Frozen', Value: 0.75 }, ...]`）。
 * - 生成表：`monster-resist-table.ts`（`data/monster-resist/pure-2027.json` →
 *   `node scripts/gen-monster-resist.mjs`），覆盖虚构叙事第 27 期的 29 只怪，
 *   同时含 `fm`（本抵抗）与 `dk`（分属性抗性）。
 * 本地 `data/monsters/*.json` 未落该字段 → 数值集中在两表，**全部可调**。
 *
 * 口径（2026-10 用户裁定「两方向都接」+ 对敌加算）：
 * - **标准语义（默认）**：该值表示「**该怪抵抗我方施加的同类负面**」；对敌概率负面统一按
 *   `p = clamp01(base + 施放者 effectHit − (怪物 effectRes + 分项抵抗))` 判定，`resist ≥ 1` 免疫。
 *   证据：怪物的 `StatusResistance`（0.3/0.4）是「抵抗一切负面」的通用字段，`DebuffResist`
 *   是「抵抗这几类控制负面」的分项值。
 * - **附加口径**：`MonsterConfig.debuffApplyResist`（默认关）表示「**该怪的负面命中我方时**」
 *   ×(1−该值)——与标准语义相反的额外旋钮，默认不生效。
 */
import type { Element } from '@hsr-calc/shared';
import { MONSTER_ELEM_RESIST, PURE_2027_MONSTERS } from './monster-resist-table.js';

export interface MonsterDebuffResist {
  /** 任意负面类型的分项抵抗（DoT/降防/易伤/植入弱点等，数据驱动） */
  [kind: string]: number | undefined;
  /** 冻结抵抗 */
  freeze?: number;
  /** 禁锢抵抗 */
  imprison?: number;
  /** 纠缠抵抗 */
  entangle?: number;
  /** 控制类总抵抗（覆盖冻结/禁锢/纠缠/恐惧/减速/目盲） */
  control?: number;
}

/** 回落 control 的控制类负面；DoT/降防/易伤等不回落控制抗性 */
const CONTROL_RESIST_KINDS = new Set(['freeze', 'imprison', 'entangle', 'fear', 'slow', 'blind', 'stun']);

/** 已知怪物的负面抵抗（Dimbreath MonsterConfig.DebuffResist 实读） */
export const MONSTER_DEBUFF_RESIST: Record<string, MonsterDebuffResist> = {
  // 步离战首•呼雷：冻结 0.75 / 禁锢 0.75 / 纠缠 0.75
  '2034010': { freeze: 0.75, imprison: 0.75, entangle: 0.75 },
  // 堕神之血•亚婆离：控制 1（完全免疫控制）
  '5034010': { control: 1 },
  // 可可利亚：冻结 1 / 禁锢 1
  '1004011': { freeze: 1, imprison: 1 },
};

/** 取某怪的负面抵抗（手写表 ∪ 生成表；未知怪 = 无抵抗） */
export function monsterDebuffResist(monsterId?: string): MonsterDebuffResist {
  if (!monsterId) return {};
  const manual = MONSTER_DEBUFF_RESIST[monsterId];
  const stage = PURE_2027_MONSTERS[monsterId]?.debuffResist;
  if (!stage) return manual ?? {};
  return { ...manual, ...stage };
}

/** 取某怪的分属性抗性（appfeng `dk`；未知怪 = 空 = 全部 0） */
export function monsterElementResistance(monsterId?: string): Partial<Record<Element, number>> {
  if (!monsterId) return {};
  return MONSTER_ELEM_RESIST[monsterId] ?? {};
}

/** 某一类负面的实际抵抗比例（单项优先；控制类可回落 control） */
export function debuffResistValue(
  resist: MonsterDebuffResist | undefined,
  kind: string,
): number {
  if (!resist) return 0;
  const v = resist[kind] ?? (CONTROL_RESIST_KINDS.has(kind) ? resist.control : undefined) ?? 0;
  return Math.min(1, Math.max(0, v));
}
