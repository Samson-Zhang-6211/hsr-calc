import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig } from '../src/index.js';

/**
 * 光锥 21050「胜利只在朝夕间」（2026-11-02 round 45 接入条件半句）
 *
 * 条款：使装备者的暴击伤害 +#1（无条件，web 烘焙）；当**装备者的忆灵对我方目标施放技能**时，
 * 使我方全体目标造成的伤害提高 #2、持续 #3 回合。
 *
 * 引擎里"忆灵技能作用我方"只有两类落点：德谬歌诗篇（`applyDemiurgePoem`）与风堇小伊卡治疗（`fjHeal`）；
 * 其余忆灵技都打敌方（走 `lc5cOnMemoAttack`），不触发本条。
 */

const mon = {
  level: 90,
  hp: 5_000_000,
  maxHp: 5_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: ['Wind', 'Ice', 'Quantum'] as Element[],
};

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

const cfg = (lc: string | undefined): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 600,
    techniques: false,
    members: [
      { id: 'fengjin', panel: card('Wind', 140), eidolonLevel: 0, lightconeId: lc, refinement: 1 },
      { id: 'xiedie', panel: card('Quantum', 110), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'fengjin',
    seed: 20261011,
  }) as unknown as BattleConfig;

describe('光锥 21050 胜利只在朝夕间', () => {
  it('装备者忆灵对我方施放技能后，全队获得 lc21050 增伤 buff；不装备时不出现', () => {
    const withLc = simulateBattle(cfg('21050'));
    const bare = simulateBattle(cfg(undefined));
    expect(withLc.events.some((e) => JSON.stringify(e.buffs ?? {}).includes('lc21050'))).toBe(true);
    expect(bare.events.some((e) => JSON.stringify(e.buffs ?? {}).includes('lc21050'))).toBe(false);
  }, 120_000);
});
