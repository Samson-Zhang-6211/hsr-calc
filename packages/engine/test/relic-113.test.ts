import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 113「宝命长存的莳者」四件套（2026-11-02 round 50 接入**受击**半边）
 *
 * 条款（`data/relicsets/113.json` → `require_num['4'].param_list = [0.08, 2, 2]`）：
 * 当装备者受到攻击**或被我方目标消耗生命值**后，暴击率提高 8%、持续 2 回合、最多叠加 2 层。
 *
 * 本轮只接「受到攻击」半边：「被我方目标消耗生命值」在引擎里**没有统一入口**
 * （刃/流萤/遐蝶各自直接写 memberHp），属结构与 §四十七 §2 同类的缺口，已在文档挂口。
 *
 * dump 锚点（杰帕德 6 回合 / 可可利亚连打）：首回合两次受击 → 层数 1 → **2（封顶）**、
 * 每层 value=0.08、持续 2 回合；不装 113 时全程无 `relic113`。
 */

const mon = {
  level: 90,
  hp: 5_000_000,
  maxHp: 5_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 1500,
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

const cfg = (relic: string | undefined): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 700,
    techniques: false,
    members: [
      { id: 'gepard', panel: card('Ice', 100, 40000), eidolonLevel: 0, relicsetId: relic },
      { id: 'fengjin', panel: card('Wind', 110, 60000), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    seed: 20261011,
  }) as unknown as BattleConfig;

const relic113Stacks = (relic: string | undefined): number[] => {
  const rep = simulateBattleReplay(cfg(relic));
  const out: number[] = [];
  for (const st of rep.steps) {
    const b = st.event.buffs as unknown as Record<string, { labelKey?: string; stacks: number }[]> | undefined;
    for (const inst of b?.gepard ?? []) {
      if (inst.labelKey === 'relic113') out.push(inst.stacks);
    }
  }
  return out;
};

describe('遗器 113 宝命长存的莳者 4pc（受击半边）', () => {
  it('受击后暴击率 +8%/层，最多 2 层；不装备时不出现', () => {
    const stacks = relic113Stacks('113');
    expect(stacks.length).toBeGreaterThan(0);
    expect(Math.max(...stacks)).toBe(2); // 封顶 #3=2
    expect(Math.min(...stacks)).toBeGreaterThanOrEqual(1);
    expect(relic113Stacks(undefined)).toEqual([]);
  }, 120_000);
});
