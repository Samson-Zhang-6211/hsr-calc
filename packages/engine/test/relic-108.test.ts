import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig } from '../src/index.js';

/**
 * 遗器 108「繁星璀璨的天才」四件套（2026-11-02 round 46 补）
 *
 * 条款：当装备者对敌方目标造成伤害时，无视其 #1=10% 防御力；若目标拥有量子属性弱点，额外无视其 #2=10%。
 * 两段都是「造成伤害时」条件句 → 引擎接；2pc 的量子属性增伤走 web 面板（防双计）。
 *
 * 断言用防御区因子（`HitLog.factors` 的 `defense`）：
 * `defense = (lv+20) / ((lv+20) + (敌lv+20) × (1 − 无视防御))`，80 级 vs 90 级 → 100 / (100 + 110×(1−x))。
 */

const mon = (weak: Element[]) => ({
  level: 90,
  hp: 5_000_000,
  maxHp: 5_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: weak,
});

const card = (el: Element, speed: number) => ({
  level: 80,
  hp: 8000,
  attack: 1200,
  defence: 900,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: 0.4,
  element: el,
  damageBonus: 0,
  breakEffect: 0,
});

const cfg = (relic: string | undefined, weak: Element[]): BattleConfig =>
  ({
    rounds: 4,
    maxTime: 400,
    techniques: false,
    members: [
      { id: 'seele', panel: card('Quantum', 115), eidolonLevel: 0, relicsetId: relic },
      { id: 'fengjin', panel: card('Wind', 110), eidolonLevel: 0 },
    ],
    monster: mon(weak),
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const defFactor = (relic: string | undefined, weak: Element[]): number => {
  const r = simulateBattle(cfg(relic, weak));
  const h = r.hits.find((x) => String(x.skillCode).startsWith('seele'));
  return h!.factors.find((f) => f.key === 'defense')!.value;
};

const expected = (ignore: number) => 100 / (100 + 110 * (1 - ignore));

describe('遗器 108 繁星璀璨的天才 4pc', () => {
  it('对量子弱点目标无视 20% 防御；无量子弱点只无视 10%；不装备时 0', () => {
    expect(defFactor('108', ['Quantum', 'Ice', 'Fire'])).toBeCloseTo(expected(0.2), 10);
    expect(defFactor('108', ['Ice', 'Fire', 'Wind'])).toBeCloseTo(expected(0.1), 10);
    expect(defFactor(undefined, ['Quantum', 'Ice', 'Fire'])).toBeCloseTo(expected(0), 10);
  }, 120_000);
});
