import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 128「隐士」4pc —— 两条半边的**显式测试**（2026-11-02 round 63）
 *
 * 条款（`data/relicsets/128.json` → `require_num['4'].param_list = [0.12, 0.15]`）：
 * 装备者提供的护盾量 **+12%**；我方目标**持有装备者提供的护盾**时暴击伤害 **+15%**。
 *
 * round 61 已把两条半边泛化，但两次探测（三月七 / 腾荒）都拿不到可观测差值 —— 原因是
 * 三月七的盾不走 `relicShieldMult` 那条倍率路径、腾荒走的是进战烘焙的常驻实例。
 * 本文件改用**存护开拓者**（`tbkTeamShield` → `relicShieldMult(source)` → `shieldWrite`）定锚。
 *
 * dump 实锚（3 回合；开拓者 140 速 + 希儿 150 速，木桩 90 级、攻击 0）：
 * | 佩戴者四件套 | 全队护盾量 | 希儿直伤 `crit` 因子 |
 * | --- | --- | --- |
 * | 无（旧档） | **134** | 1.0250 |
 * | 128 隐士 | **150.08** = 134×1.12 | **1.0325** = 1 + 0.05×(0.5+0.15) |
 * | 103 圣骑士（对照） | 160.8 = 134×1.2 | 1.0250（103 只有护盾量半边） |
 * 首次希儿战技（t=66.7，护盾尚未产生）三档都是 1.0250 → 暴伤半边确实以「持盾」为条件。
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
  weaknesses: ['Quantum', 'Ice'] as Element[],
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

const cfg = (tbRelic: string | undefined): BattleConfig =>
  ({
    rounds: 3,
    maxTime: 1400,
    techniques: false,
    members: [
      { id: 'trailblazerKnight', panel: card('Fire', 140), eidolonLevel: 0, relicsetId: tbRelic },
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const factorOf = (hit: { factors: { key: string; value: number }[] }, key: string): number => {
  const f = hit.factors.find((x) => x.key === key);
  expect(f, `缺少乘区 ${key}`).toBeDefined();
  return f!.value;
};

interface Run {
  /** 全队护盾量峰值（status.shield） */
  shieldPeak: number;
  /** 希儿全部直伤的 crit 因子（按时间序） */
  seeleCrit: number[];
}

const run = (tbRelic: string | undefined): Run => {
  const rep = simulateBattleReplay(cfg(tbRelic));
  let shieldPeak = 0;
  for (const st of rep.steps) {
    for (const v of Object.values(st.status.shield ?? {})) {
      shieldPeak = Math.max(shieldPeak, Number(v) || 0);
    }
  }
  const seeleCrit = rep.result.hits
    .filter((h) => h.source === 'seele' && h.kind === 'direct')
    .map((h) => factorOf(h, 'crit'));
  return { shieldPeak, seeleCrit };
};

describe('遗器 128 隐士 4pc（护盾 +12% / 持盾者暴伤 +15%）', () => {
  it('护盾量 +12%：存护开拓者产盾 134 → 150.08（按产盾者四件套判定）', () => {
    const off = run(undefined);
    const on = run('128');
    expect(off.shieldPeak).toBeCloseTo(134, 6); // 防御 900×6% + 80
    expect(on.shieldPeak).toBeCloseTo(134 * 1.12, 6); // 150.08
    // 103 圣骑士是同形条款（+20%）→ 对照，证明倍率来自「佩戴者的四件套」而非无条件
    expect(run('103').shieldPeak).toBeCloseTo(134 * 1.2, 6); // 160.8
  }, 300_000);

  it('持盾者暴伤 +15%：仅当护盾来源穿 128 才生效（无盾时不吃）', () => {
    const off = run(undefined);
    const on = run('128');
    // 希儿首动（t=66.7）时护盾还不存在 → 两边同值，证明是「持有该护盾」条件
    expect(off.seeleCrit[0]).toBeCloseTo(1.025, 10);
    expect(on.seeleCrit[0]).toBeCloseTo(1.025, 10);
    // 持盾后：1 + 暴率0.05 × (暴伤0.5 + 0.15) = 1.0325
    expect(on.seeleCrit[1]).toBeCloseTo(1 + 0.05 * 0.65, 10);
    expect(off.seeleCrit[1]).toBeCloseTo(1 + 0.05 * 0.5, 10);
    // 103 圣骑士只有护盾量半边 → 暴伤不动
    expect(run('103').seeleCrit[1]).toBeCloseTo(1 + 0.05 * 0.5, 10);
  }, 300_000);
});
