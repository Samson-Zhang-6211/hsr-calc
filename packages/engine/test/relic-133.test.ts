import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 133「戏梦点星的伶人」四件套（2026-11-02 round 53 补）
 *
 * 条款（`data/relicsets/133.json` → `require_num['4'].param_list = [0.16, 3, 10, 0.12, 3]`）：
 * ① 装备者对我方**其他单体目标**施放战技/终结技 → 技能目标欢愉度 +16%、持续 3 回合；
 * ② 若装备者【好活当赏】≥ 10 点 → 我方全体暴击伤害 +12%、持续 3 回合。
 *
 * 挂点与 126 相同：`resolveAlly`（我方单体目标唯一解析器），`out !== spActor` 即「其他我方目标」；
 * 【好活当赏】读 `goodWorkOf(caster)`（欢愉角色进战自带 20 点，非欢愉角色恒 0）。
 *
 * dump 锚点（9 名候选施法者 × 装/不装，6 回合）：
 * - 布洛妮娅（非欢愉）装 133：`relic133deg` 出现 **40 次**、`relic133crit` **0 次**（好活=0）；
 * - 阿哈（欢愉，进战 20 好活 ≥10）装 133：`relic133deg` **45 次**、`relic133crit` **28 次**；
 * - 真珠/绯英/银狼/昔涟 不指向队友 → 两半都不触发；任何人不装 → 都不触发。
 */

const mon = {
  level: 90,
  hp: 8_000_000,
  maxHp: 8_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: ['Quantum', 'Ice', 'Wind', 'Fire', 'Physical', 'Lightning', 'Imaginary'] as Element[],
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

const cfg = (caster: string, relic: string | undefined): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 900,
    techniques: false,
    members: [
      { id: caster, panel: card('Quantum', 140), eidolonLevel: 0, relicsetId: relic },
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const count = (caster: string, relic: string | undefined) => {
  const rep = simulateBattleReplay(cfg(caster, relic));
  let deg = 0;
  let crit = 0;
  for (const st of rep.steps) {
    const j = JSON.stringify(st.event.buffs ?? {});
    if (j.includes('relic133deg')) deg += 1;
    if (j.includes('relic133crit')) crit += 1;
  }
  return { deg, crit };
};

describe('遗器 133 戏梦点星的伶人 4pc', () => {
  it('指向队友的战技 → 目标欢愉度 +16%；好活 <10 时不给全队暴伤', () => {
    const on = count('bronya', '133');
    expect(on.deg).toBeGreaterThan(0);
    expect(on.crit).toBe(0); // 布洛妮娅非欢愉：【好活当赏】恒 0
    expect(count('bronya', undefined)).toEqual({ deg: 0, crit: 0 });
  }, 300_000);

  it('欢愉装备者好活 ≥10 → 额外给我方全体暴伤 +12%', () => {
    const on = count('aha', '133');
    expect(on.deg).toBeGreaterThan(0);
    expect(on.crit).toBeGreaterThan(0);
    expect(count('aha', undefined)).toEqual({ deg: 0, crit: 0 });
  }, 300_000);
});
