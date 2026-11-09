import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig } from '../src/index.js';

/**
 * 遗器 134「贪噬禁果的异端」四件套（2026-11-02 round 47 补）
 *
 * 条款：使装备者普攻造成的伤害提高 #1=36%；当装备者施放普攻时，使装备者的攻击力提高 #2=20%、持续 #3=2 回合。
 * 参数 = `data/relicsets/134.json` 的 `zh.require_num['4'].param_list = [0.36, 0.2, 2]`。
 *
 * dump 锚点（希儿 115 速 / 6 回合）：装 134 时首次普攻 `damageBonus` **2.16**，不装/装 102 时 **1.8** → 差 0.36；
 * 之后每次普攻都保持 +0.36，且事件 buffs 里出现 `relic134`（施放普攻后才给，所以当次普攻不吃攻击力）。
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
  weaknesses: ['Quantum', 'Ice', 'Wind'] as Element[],
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

const cfg = (relic: string | undefined): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 700,
    techniques: false,
    members: [
      { id: 'seele', panel: card('Quantum', 115), eidolonLevel: 0, relicsetId: relic },
      { id: 'fengjin', panel: card('Wind', 110), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const basics = (relic: string | undefined) => {
  const r = simulateBattle(cfg(relic));
  return r.hits
    .filter((h) => h.skillCode === 'seele.basic')
    .map((h) => h.factors.find((f) => f.key === 'damageBonus')!.value);
};

describe('遗器 134 贪噬禁果的异端 4pc', () => {
  it('普攻伤害 +36%，且施放普攻后获得 relic134 攻击力 buff', () => {
    const withLc = basics('134');
    const bare = basics(undefined);
    expect(withLc.length).toBeGreaterThan(1);
    expect(bare.length).toBe(withLc.length);
    // 每一段普攻都 +0.36（仅普攻吃，其他技能不吃）
    for (let i = 0; i < withLc.length; i += 1) {
      expect(withLc[i] - bare[i]).toBeCloseTo(0.36, 10);
    }
    // buff 只在装备时出现
    const has = (relic: string | undefined) =>
      simulateBattle(cfg(relic)).events.some((e) => JSON.stringify(e.buffs ?? {}).includes('relic134'));
    expect(has('134')).toBe(true);
    expect(has(undefined)).toBe(false);
  }, 120_000);
});
