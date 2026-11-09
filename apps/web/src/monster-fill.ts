// 木桩配置「怪物+等级 → 自动填充全套」（2026-10-09 裁定2：覆盖手配，之后仍可手改）。
// 两页（数值代理模拟/全真模拟）共用；防御值换算有结果但战斗公式按等级制不消费、
// UI 无字段，故不填充（见 AGENTS.md）。
import { computeMonsterStats } from './monster-stats.js';

export interface MonsterFillValues {
  hp: string;
  attack: string;
  speed: string;
  toughness: string;
  /** 效果抵抗（百分比字符串，'29.6'）；不是元素抗性 */
  effectRes: string;
  /** 效果命中（百分比字符串，'36'）；不是元素抗性 */
  effectHit: string;
}

/** 按怪物 id + 等级换算可回填的木桩字段；数据缺失/等级无效返回 null（保持手配值）。 */
export async function fillMonsterFields(
  monsterId: string,
  level: number,
): Promise<MonsterFillValues | null> {
  if (!monsterId || !Number.isFinite(level) || level < 1) return null;
  const p = await computeMonsterStats(monsterId, level);
  if (!p) return null;
  return {
    hp: String(p.hp),
    attack: String(p.attack),
    speed: String(p.speed),
    toughness: String(p.stance),
    effectRes: String(Math.round(p.effectRes * 1000) / 10),
    effectHit: String(Math.round(p.effectHit * 1000) / 10),
  };
}
