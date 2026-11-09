import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig } from '../src/index.js';

/**
 * 遗器 107「熔岩锻铸的火匠」四件套（2026-11-02 round 48 补）
 *
 * 条款（`data/relicsets/107.json` 的 `zh.require_num['4'].param_list = [0.12, 0.12]`）：
 * ① 使装备者战技造成的伤害提高 12%；
 * ② 并使施放终结技后的**下一次攻击**造成的**火属性**伤害提高 12%（一次性）。
 *
 * dump 锚点：
 * - 希儿（量子）：战技 `damageBonus` 1 → **1.12**；终结技/普攻不受益。
 * - 阿兰（火）：终结技后下一次战技 1.3809… → **1.5009…**（+0.12，消费即清）。
 *
 * ⚠ 已知边界：①的挂点在 `charAttack` 的 `gearExtra`（与 102/122/120 同位置），
 * 因此**绕过 `charAttack` 的自定义战技（如阿兰）吃不到**这一条 —— 属既有结构限制，已在文档记口。
 */

const mon = (weak: Element[]) => ({
  level: 90,
  hp: 5_000_000,
  maxHp: 5_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: weak,
});

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

const ELEMENT_OF = { seele: 'Quantum', arlan: 'Thunder', hook: 'Fire' } as const;
const SPEED_OF = { seele: 150, arlan: 120, hook: 130 } as const;

const cfg = (char: 'seele' | 'arlan' | 'hook', relic: string | undefined): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 700,
    techniques: false,
    members: [
      {
        id: char,
        panel: card(ELEMENT_OF[char], SPEED_OF[char]),
        eidolonLevel: 0,
        relicsetId: relic,
      },
      { id: 'fengjin', panel: card('Wind', 110), eidolonLevel: 0 },
    ],
    monster: mon(['Quantum', 'Fire', 'Wind', 'Thunder']),
    mainC: char,
    seed: 20261011,
  }) as unknown as BattleConfig;

const dmgBonus = (char: 'seele' | 'arlan' | 'hook', relic: string | undefined, code: string) => {
  const r = simulateBattle(cfg(char, relic));
  return r.hits
    .filter((h) => h.skillCode === code)
    .map((h) => h.factors.find((f) => f.key === 'damageBonus')!.value);
};

describe('遗器 107 熔岩锻铸的火匠 4pc', () => {
  it('战技伤害 +12%（其他技能不受益）', () => {
    const withLc = dmgBonus('seele', '107', 'seele.skill');
    const bare = dmgBonus('seele', undefined, 'seele.skill');
    expect(withLc.length).toBeGreaterThan(0);
    for (let i = 0; i < withLc.length; i += 1) expect(withLc[i] - bare[i]).toBeCloseTo(0.12, 10);
    // 终结技不吃这条
    const ultWith = dmgBonus('seele', '107', 'seele.ult');
    const ultBare = dmgBonus('seele', undefined, 'seele.ult');
    for (let i = 0; i < ultWith.length; i += 1) expect(ultWith[i]).toBeCloseTo(ultBare[i], 10);
  }, 120_000);

  it('自定义战技路径（阿兰）也吃「战技 +12%」——2026-11-02 下沉到 dealAttack 后修复', () => {
    const withLc = dmgBonus('arlan', '107', 'arlan.skill');
    const bare = dmgBonus('arlan', undefined, 'arlan.skill');
    const diffs = withLc.map((v, i) => v - (bare[i] ?? 0));
    // 阿兰的战技是自定义路径（不经 charAttack）；下沉前这一条他吃不到，现在是每段 +0.12
    expect(diffs.length).toBeGreaterThan(0);
    for (const d of diffs) expect(d).toBeCloseTo(0.12, 10);
    // 阿兰是雷属性 → 107 的「火属性额外 +12%」不该出现（不存在 +0.24 档）
    expect(diffs.some((d) => Math.abs(d - 0.24) < 1e-9)).toBe(false);
  }, 120_000);

  it('施放终结技后的下一次攻击：火属性额外 +12%（一次性）', () => {
    // 虎克（火）：普攻链里恰好 1 段多 0.12，其余为 0
    const withLc = dmgBonus('hook', '107', 'hook.basic');
    const bare = dmgBonus('hook', undefined, 'hook.basic');
    const diffs = withLc.map((v, i) => v - (bare[i] ?? 0));
    expect(diffs.length).toBeGreaterThan(0);
    const boosted = diffs.filter((d) => Math.abs(d - 0.12) < 1e-9).length;
    // 每次终结技后的下一次攻击各吃一次（虎克 6 回合开大 2 次 → 2 段），其余段不吃、也不残留
    expect(boosted).toBeGreaterThan(0);
    expect(boosted).toBeLessThan(diffs.length);
    expect(diffs.filter((d) => Math.abs(d) < 1e-9).length).toBe(diffs.length - boosted);
  }, 120_000);
});
