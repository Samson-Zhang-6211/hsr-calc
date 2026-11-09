import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 130「应天涉远的卜者」四件套（2026-11-02 round 52 补）
 *
 * 条款（`data/relicsets/130.json` → `require_num['4'].param_list = [120, 160, 0.1, 0.18, 0.1]`）：
 * ① 进入战斗前，若装备者速度 ≥ 120 / 160 → 暴击率 +10% / +18%（高档替换低档，常驻）；
 * ② 每场战斗**首次施放欢愉技**时 → 我方全体欢愉度 +10%（不可叠加）。
 *
 * dump 锚点（希儿 4 回合 / 速度按配置）：
 * 120→**0.10**、150→**0.10**、160→**0.18**、100→无、不装备→无；
 * 阿哈装 130 时事件 buffs 里出现 `relic130deg`（全队欢愉度 +10%）。
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

const cfg = (relic: string | undefined, spd: number): BattleConfig =>
  ({
    rounds: 4,
    maxTime: 500,
    techniques: false,
    members: [
      { id: 'seele', panel: card('Quantum', spd), eidolonLevel: 0, relicsetId: relic },
      { id: 'fengjin', panel: card('Wind', 110), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const critBuff = (relic: string | undefined, spd: number): number | undefined => {
  const rep = simulateBattleReplay(cfg(relic, spd));
  const b = rep.steps[0]?.event.buffs as unknown as Record<string, { labelKey?: string; value: number }[]> | undefined;
  return (b?.seele ?? []).find((x) => x.labelKey === 'relic130')?.value;
};

describe('遗器 130 应天涉远的卜者 4pc', () => {
  it('进战速度 ≥120 → 暴率 +10%；≥160 → +18%；不足 120 无效果', () => {
    expect(critBuff('130', 120)).toBeCloseTo(0.1, 10);
    expect(critBuff('130', 150)).toBeCloseTo(0.1, 10);
    expect(critBuff('130', 160)).toBeCloseTo(0.18, 10);
    expect(critBuff('130', 100)).toBeUndefined();
    expect(critBuff(undefined, 160)).toBeUndefined();
  }, 120_000);

  it('首次施放欢愉技 → 我方全体欢愉度 +10%（每场只一次）', () => {
    const rep = simulateBattleReplay({
      rounds: 4,
      maxTime: 500,
      techniques: false,
      members: [
        { id: 'aha', panel: card('Wind', 130), eidolonLevel: 0, relicsetId: '130' },
        { id: 'fengjin', panel: card('Ice', 110), eidolonLevel: 0 },
      ],
      monster: { ...mon },
      mainC: 'aha',
      seed: 20261011,
    } as unknown as BattleConfig);
    // 只统计“首次出现”的 holder 数：应为全队每名成员各 1 个实例
    const holders = new Set<string>();
    for (const st of rep.steps) {
      const b = st.event.buffs as unknown as Record<string, { labelKey?: string; value: number }[]> | undefined;
      for (const [id, arr] of Object.entries(b ?? {})) {
        for (const inst of arr) {
          if (inst.labelKey === 'relic130deg') {
            holders.add(id);
            expect(inst.value).toBeCloseTo(0.1, 10);
          }
        }
      }
    }
    expect(holders.size).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
