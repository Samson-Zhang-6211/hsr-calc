import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 126「恶海逐波的船长」四件套（2026-11-02 round 51 补）
 *
 * 条款（`data/relicsets/126.json` → `require_num['4'].param_list = [2, 0.48, 1]`）：
 * 装备者成为**其他我方目标**的技能目标时，获得 1 层【助力】，最多叠加 2 层；
 * 施放终结技时，若持有 2 层【助力】，消耗所有【助力】，使装备者攻击力提高 48%、持续 1 回合。
 *
 * 挂点：`resolveAlly` 是所有我方目标技能/终结技的中央解析器（已有 `phainonOnTargeted` /
 * `danhengOnAllyTargeted` 两个先例），在其尾部加 `out !== spActor` 判定；
 * 消耗侧在 `castUltFor` 伤害结算**之前**调用（「施放终结技时」→ 本次终结技即吃攻击力）。
 *
 * dump 锚点（希儿 150 速 + 布洛妮娅 99 速，6 回合）：装 126 时 t=255.4 希儿终结技事件起
 * `relic126` buff value **0.48**、持续 1 回合；不装时全程无该 buff。
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
  weaknesses: ['Quantum', 'Ice', 'Wind', 'Fire'] as Element[],
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

const cfg = (relic: string | undefined, partner: 'bronya' | 'mydei'): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 800,
    techniques: false,
    members: [
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0, relicsetId: relic },
      {
        id: partner,
        panel: card(partner === 'bronya' ? 'Wind' : 'Fire', partner === 'bronya' ? 99 : 120),
        eidolonLevel: 0,
      },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const has126 = (relic: string | undefined, partner: 'bronya' | 'mydei'): boolean => {
  const rep = simulateBattleReplay(cfg(relic, partner));
  return rep.steps.some((s) => JSON.stringify(s.event.buffs ?? {}).includes('relic126'));
};

describe('遗器 126 恶海逐波的船长 4pc', () => {
  it('被队友技能指向 2 次 → 开大时消耗【助力】换 48% 攻击力', () => {
    expect(has126('126', 'bronya')).toBe(true);
    // 没有“指向队友的技能”的队友 → 不会触发
    expect(has126('126', 'mydei')).toBe(false);
    // 不装备 → 无 buff
    expect(has126(undefined, 'bronya')).toBe(false);
  }, 120_000);
});
