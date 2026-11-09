import { subAffixRollValue } from '@hsr-calc/engine';
import type { RelicSubState } from './storage.js';

/** 副词条最终值：新版随机生成存了精确 value 直接用；旧档回退 rolls 公式（第 i 次 roll = base+step×i） */
export function relicSubValue(
  sub: Pick<RelicSubState, 'rolls' | 'value'>,
  affix: { base: number; step: number },
): number {
  return sub.value ?? subAffixRollValue(affix, sub.rolls);
}

/** 新版生成词条的逐档值明细（初始 + 各次强化）；旧档（无 tiers）返回 null */
export function relicSubTierValues(
  sub: Pick<RelicSubState, 'tiers'>,
  affix: { base: number; step: number },
): number[] | null {
  if (!sub.tiers) return null;
  return sub.tiers.map((t) => affix.base + affix.step * t);
}
