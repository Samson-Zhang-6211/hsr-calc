import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 121「重循苦旅的司铎」4pc —— **泛化**（2026-11-02 round 61）
 *
 * 条款（`data/relicsets/121.json` → `require_num['4'].param_list = [0.18, 2, 2]`）：
 * 装备者对我方单体目标施放战技/终结技时，使**技能目标**的暴击伤害提高 18%、持续 2 回合、最多叠加 2 次。
 *
 * 改前：只对**星期日**生效 —— 增益写死在 `GEAR.sunday.sidorCritDmg` + `sundayFlightTrigger`
 * （他的单体战技/终结技走自定义分支，不经过 `resolveAlly`）。其他角色穿 121 **完全无效**。
 *
 * 改后：在 `resolveAlly` 里补通用路径 `relic121OnAllySkill(spActor, out)`（复用 126/133/118 的
 * `out !== spActor` 判定）；星期日仍走原烘焙路径，helper 内显式跳过防双计。
 *
 * dump 锚点（6 回合，施法者 140 速 + 希儿）：
 * - 布洛妮娅/停云 穿 121：`relic121` buff 出现 **34/37 次**、层数最高 **2**、value **0.18**；不穿 **0 次**。
 * - 星期日：无论是否显式声明 121 都有 33 次（他**默认配装**就是 121，走烘焙路径 `sidor`）。
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
  weaknesses: ['Ice', 'Quantum', 'Wind'] as Element[],
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

const cfg = (relic: string | undefined, caster: string): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 1400,
    techniques: false,
    members: [
      { id: caster, panel: card('Ice', 140), eidolonLevel: 0, relicsetId: relic },
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const scan = (relic: string | undefined, caster: string) => {
  const rep = simulateBattleReplay(cfg(relic, caster));
  let events = 0;
  let maxStacks = 0;
  let value = 0;
  for (const st of rep.steps) {
    const b = st.event.buffs as unknown as Record<string, { labelKey?: string; stacks?: number; value: number }[]> | undefined;
    for (const arr of Object.values(b ?? {})) {
      for (const inst of arr) {
        if (inst.labelKey !== 'relic121') continue;
        events += 1;
        maxStacks = Math.max(maxStacks, inst.stacks ?? 0);
        value = inst.value;
      }
    }
  }
  return { events, maxStacks, value };
};

describe('遗器 121 重循苦旅的司铎 4pc（泛化到任意装备者）', () => {
  it('任意角色穿 121 对我方单体施放战技/终结技 → 目标暴伤 +18%（2 层）', () => {
    for (const caster of ['bronya', 'tingyun']) {
      const on = scan('121', caster);
      expect(on.events).toBeGreaterThan(0);
      expect(on.maxStacks).toBe(2);
      expect(on.value).toBeCloseTo(0.18, 10);
      expect(scan(undefined, caster)).toEqual({ events: 0, maxStacks: 0, value: 0 });
    }
  }, 300_000);
});
