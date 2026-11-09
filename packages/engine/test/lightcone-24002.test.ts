import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 光锥 24002「记忆的质料」（2026-11-02 round 44 接入条件半句）
 *
 * 条款：使装备者效果抵抗 +#1（面板值，web 烘焙，引擎不重复加）；
 * 当装备者受到攻击后，如果自身未持有护盾 → 获得等同于装备者 #2% 生命上限的护盾、持续 #3 回合，
 * 该效果每 #4 回合只能触发 1 次；如果装备者持有护盾 → 自身受到的伤害降低 #5%。
 *
 * dump 锚点（可可利亚 1004011 / 8 回合）：装 24002 时 t=100 首次受击即出现 note `lc24002` +
 * `status.shield.gepard` 由 0 变为 4256（= maxHp 26600 × 16%）；不装时全程无该 note。
 */

const mon = {
  level: 90,
  hp: 5_000_000,
  maxHp: 5_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 2000,
  speed: 100,
  resistance: {} as Record<string, number>,
  weaknesses: ['Physical', 'Ice', 'Quantum'] as Element[],
  monsterId: '1004011',
};

const card = (el: Element, speed: number, hp: number) => ({
  level: 80,
  hp,
  attack: 900,
  defence: 800,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: 0.2,
  element: el,
  damageBonus: 0,
  breakEffect: 0,
});

const cfg = (lc: string | undefined): BattleConfig =>
  ({
    rounds: 8,
    maxTime: 800,
    techniques: false,
    members: [
      { id: 'gepard', panel: card('Ice', 100, 20000), eidolonLevel: 0, lightconeId: lc, refinement: 1 },
      { id: 'fengjin', panel: card('Wind', 110, 60000), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    seed: 20261011,
  }) as unknown as BattleConfig;

describe('光锥 24002 记忆的质料', () => {
  it('受击且无盾时给盾（note lc24002），并按 #4 回合冷却', () => {
    const withLc = simulateBattleReplay(cfg('24002'));
    const bare = simulateBattleReplay(cfg(undefined));
    const lcEvents = withLc.steps.filter((s) => (s.event.note ?? []).includes('lc24002'));
    expect(lcEvents.length).toBeGreaterThan(0);
    // 不装时不出现
    expect(bare.steps.some((s) => (s.event.note ?? []).includes('lc24002'))).toBe(false);
    // 触发时装备者护盾 > 0
    const first = lcEvents[0];
    const shield = (first.status as unknown as { shield?: Record<string, number> }).shield?.gepard ?? 0;
    expect(shield).toBeGreaterThan(0);
    // #4=3 回合冷却 → 8 回合内最多 3 次
    expect(lcEvents.length).toBeLessThanOrEqual(3);
  }, 120_000);
});
