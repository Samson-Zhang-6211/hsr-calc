import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 129「闪耀功勋的魔法少女」四件套（2026-11-02 round 54 补）
 *
 * 条款（`data/relicsets/129.json` → `require_num['4'].param_list = [0.1, 5, 0.01, 10]`）：
 * ① 装备者**及其忆灵**造成的欢愉伤害无视目标 **10%** 防御力；
 * ② 我方每累计获得 **5** 点笑点 → 欢愉伤害额外无视目标 **1%** 防御力，最多 **10** 层（= +10%）。
 *
 * 落点：欢愉伤害通道（`dealAttack` 内 `spec.elation` 分支）的 `elSnap.defIgnore`；
 * 笑点累计在 `gainLaugh()` 里累加 `laughTotalGained`（只增不减，与存量 `laughPoints` 区分）。
 *
 * dump 锚点（防御区因子 = 100/(100+110×(1−d))，d = defIgnore）：
 * - 银狼（笑点累计到 ≥50）：不装 **0.476190**（d=0）→ 装 129 **0.531915**（d=0.20 = 10% 基础 + 10 层封顶）；
 * - 真珠（只打 23 次欢愉、笑点累计不足 5）：不装 **0.476190** → 装 129 **0.502513**（d=0.10，仅基础半边）；
 * - 阿哈 / 飞霄 / 爻光 / 岁阳 均在「基础 + 满层」区间内，方向一致。
 */

const mon = {
  level: 90,
  hp: 20_000_000,
  maxHp: 20_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: ['Wind', 'Ice', 'Quantum', 'Fire', 'Physical', 'Lightning', 'Imaginary'] as Element[],
};

const card = (el: Element, speed: number) => ({
  level: 80,
  hp: 8000,
  attack: 1200,
  defence: 900,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: 0.6,
  element: el,
  damageBonus: 0,
  breakEffect: 0,
});

const cfg = (caster: string, relic: string | undefined): BattleConfig =>
  ({
    rounds: 8,
    maxTime: 1200,
    techniques: false,
    members: [
      { id: caster, panel: card('Wind', 130), eidolonLevel: 0, relicsetId: relic },
      { id: 'fengjin', panel: card('Ice', 110), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: caster,
    seed: 20261011,
  }) as unknown as BattleConfig;

const maxDefFactor = (caster: string, relic: string | undefined): number => {
  const rep = simulateBattleReplay(cfg(caster, relic));
  const out: number[] = [];
  for (const st of rep.steps) {
    for (const seq of st.event.hitSeqs ?? []) {
      const h = (rep.result as unknown as { hits?: { seq: number; kind?: string; factors: { key: string; value: number }[] }[] }).hits?.find(
        (x) => x.seq === seq,
      );
      if (!h || h.kind !== 'elation') continue;
      out.push(h.factors.find((f) => f.key === 'defense')!.value);
    }
  }
  return out.length > 0 ? Math.max(...out) : 0;
};

describe('遗器 129 闪耀功勋的魔法少女 4pc', () => {
  it('欢愉伤害基础无视 10% 防御；累计笑点每 5 点 +1% 最多 10 层', () => {
    // 银狼：笑点累计足以吃满 10 层 → d = 0.10 + 0.10 = 0.20
    expect(maxDefFactor('langzun', undefined)).toBeCloseTo(0.47619, 4);
    expect(maxDefFactor('langzun', '129')).toBeCloseTo(0.531915, 5);
    // 真珠：欢愉伤害次数少、笑点累计不足 5 → 只有基础 10%
    expect(maxDefFactor('zhenzhu', undefined)).toBeCloseTo(0.47619, 4);
    expect(maxDefFactor('zhenzhu', '129')).toBeCloseTo(0.502513, 5);
  }, 600_000);
});
