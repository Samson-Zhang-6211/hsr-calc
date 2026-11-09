import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 阿哈（1511）天赋 151104「笑点首达 #2=40」edge（2026-11-02 round 34 接线）
 *
 * 原文：我方笑点**首次达到 #2=40 点后**，星神★阿哈立即获得 #3=1 点【愿力】，
 *       随后使我方全体暴击伤害提高 #9%（lv10=40%），持续 #10=3 回合，**阿哈回合结束后可再次触发**。
 * 锚点：临时 `_aha-laugh-dump`（rounds 14，seed 20261011，4 欢愉角色）→ 首次触发在 t=153.8
 *       （爻光终结技把笑点推到 42），事件 `buffs` 出现 `ahaLaugh40`，愿力 4 → 5。
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
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'imaginary'] as Element[],
};

const panel = (el: Element, speed: number) => ({
  level: 80,
  hp: 8000,
  attack: 1500,
  defence: 900,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: 0.3,
  element: el,
  damageBonus: 0,
  breakEffect: 0,
});

const cfg = (): BattleConfig =>
  ({
    rounds: 14,
    maxTime: 1400,
    techniques: false,
    members: [
      { id: 'aha', panel: panel('Physical', 120), eidolonLevel: 0 },
      { id: 'shuisha', panel: panel('Fire', 140), eidolonLevel: 0 },
      { id: 'feiying', panel: panel('Fire', 150), eidolonLevel: 0 },
      { id: 'yaoguang', panel: panel('Quantum', 130), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    seed: 20261011,
  }) as unknown as BattleConfig;

describe('阿哈 151104「笑点首达 40」edge', () => {
  it('笑点越过 40 时：全队获得 ahaLaugh40（暴伤 +40%·3 回合），且愿力 +1', () => {
    const rep = simulateBattleReplay(cfg());
    type St = { willPower?: number; laughPoints?: number };
    let prevWill = 0;
    let first: { lp: number; dWill: number; t: number } | undefined;
    let sawBeforeCrossing = false;
    for (const st of rep.steps) {
      const s = st.status as unknown as St;
      const lp = s.laughPoints ?? 0;
      const will = s.willPower ?? 0;
      const has = JSON.stringify(st.event.buffs ?? {}).includes('ahaLaugh40');
      if (has && first === undefined) first = { lp, dWill: will - prevWill, t: st.event.time };
      // 触发之前不该有这条 buff（即不是进战就挂）
      if (first === undefined && has) sawBeforeCrossing = true;
      prevWill = will;
    }
    expect(first).toBeDefined();
    expect(first!.lp).toBeGreaterThanOrEqual(40); // 阈值 #2=40
    expect(first!.dWill).toBeGreaterThanOrEqual(1); // #3=1 点愿力
    expect(sawBeforeCrossing).toBe(false);
  }, 120_000);
});
