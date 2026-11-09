import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 113「宝命长存的莳者」4pc —— **第二半边「被我方目标消耗生命值」**（2026-11-02 round 59）
 *
 * 条款（`data/relicsets/113.json` → `require_num['4'].param_list = [0.08, 2, 2]`）：
 * 受到攻击**或被我方目标消耗生命值**后，暴击率 +8%、持续 2 回合、最多 2 层。
 *
 * **用户裁定（2026-11-02）走 A**：建统一耗血入口 `consumeHp(id, amount, { keepHp })`（写回 memberHp +
 * 触发 113 钩子），在既有主动耗血点逐个接线，不强行改造全部历史直写点。已接线：
 * 刃 `bladeSpendHp` / 阿兰 `arlanSpendHp` / 万敌 `mydeiSpendCurrentHp` / 千冶 `qySpendHp` /
 * 镜流 `jingliuDrainAllies`（吸队友）/ 光锥 23042 团队扣血。
 *
 * dump 锚点（6 回合，刃 130 速 + 队友）：
 * - 刃 戴 113：出现 `relic113` buff **42 次**、层数最高 **2**（封顶）；
 * - 不戴：**0 次**。
 * - 镜像：镜流吸队友那组在本配置下未触发（0 次），故判据以刃的自耗血为准。
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
  weaknesses: ['Ice', 'Wind', 'Quantum'] as Element[],
};

const card = (el: Element, speed: number) => ({
  level: 80,
  hp: 9000,
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

const cfg = (relic: string | undefined): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 1200,
    techniques: false,
    members: [
      { id: 'blade', panel: card('Wind', 130), eidolonLevel: 0, relicsetId: relic },
      { id: 'fengjin', panel: card('Wind', 120), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'blade',
    seed: 20261011,
  }) as unknown as BattleConfig;

const scan113 = (relic: string | undefined) => {
  const rep = simulateBattleReplay(cfg(relic));
  let events = 0;
  let maxStacks = 0;
  for (const st of rep.steps) {
    const b = st.event.buffs as unknown as Record<string, { labelKey?: string; stacks?: number }[]> | undefined;
    for (const arr of Object.values(b ?? {})) {
      for (const inst of arr) {
        if (inst.labelKey !== 'relic113') continue;
        events += 1;
        maxStacks = Math.max(maxStacks, inst.stacks ?? 0);
      }
    }
  }
  return { events, maxStacks };
};

describe('遗器 113 宝命长存的莳者 4pc：被我方消耗生命值', () => {
  it('刃自耗血 → 暴击率 buff 出现并叠到 2 层封顶', () => {
    const on = scan113('113');
    expect(on.events).toBeGreaterThan(0);
    expect(on.maxStacks).toBe(2);
    expect(scan113(undefined)).toEqual({ events: 0, maxStacks: 0 });
  }, 300_000);
});
