import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig } from '../src/index.js';

/**
 * 昔涟忆灵技 **1141521「献予「负世」之诗」**（2026-11-05 用户裁定：按字面**无限**刷新）
 *
 * `data/characters/1415.json` → `zh.memosprite.skills['1141521']`（忆灵技 lv6 = 引擎默认等级）：
 * `[0.16, 0.15, 5, 0.1, 12, 0.12, 0.72, 6, 4]`
 * → 暴击率 +16% / 每额外回合耗当前生命 15% / 攻击后 5 段随机单体、每段 10% 攻击力火附伤 /
 *   火种阈值 12、每超 1 点暴伤 +12%（上限 +72%）/ 施放时 +6 火种 / 刷新时 +4【毁伤】。
 *
 * 落点：
 * - `poemMap.phainon = '1141521'` → 德谬歌登场时自动施放（`case '1141521'`：+6 火种、授予永续燃烧）；
 * - `phainonStartForm`：变身时挂 `phainonBurnCr`（暴率）与 `phainonBurnCd`（暴伤，按火种超出量）；
 * - `phainonRunExtraTurn`：每回合扣 15% 当前生命；**额外回合耗尽 → 不结束变身**，
 *   `phainonExtraLeft` 重置为 8、`+4 毁伤`、记 `phainonBurnRefresh` 事件；
 * - 每次额外回合攻击（808/811/反击）后追加 5 段 `phainon.burn`（火属性、0 削韧）。
 *
 * dump 实锚（昔涟160 / 白厄130 / 希儿150，木桩 90 级、30 回合、`techniques:true`）：
 * - t=1766.03 德谬歌登场 → 事件 note 含 `poemBurnSeed`+`poemBurn`；
 * - t=1858.97 白厄终结技 → note 含 `phainonBurn`+`phainonForm`（火种刚好清零 → 无暴伤实例）；
 * - t=2884.62 `phainon.burnRefresh`（第 8 个额外回合耗尽）→ 之后仍有额外回合行动、**无** `phainonEnd`；
 * - `phainon.burn` 段 30 条（6 次额外回合攻击 × 5）→ 断言为 5 的整数倍且 >0。
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
  weaknesses: ['Ice', 'Physical', 'Fire', 'Quantum'] as Element[],
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

const cfg = (): BattleConfig =>
  ({
    rounds: 30,
    maxTime: 4000,
    techniques: true,
    members: [
      { id: 'xilian', panel: card('Ice', 160), eidolonLevel: 0 },
      { id: 'phainon', panel: card('Physical', 130), eidolonLevel: 0 },
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const noteArr = (n: unknown): string[] =>
  Array.isArray(n) ? (n as string[]) : n ? [String(n)] : [];

const run = simulateBattle(cfg());

describe('昔涟 1141521 献予「负世」之诗 / 白厄【永续的燃烧】', () => {
  it('德谬歌登场自动施放诗篇：白厄 +6 火种 并拿到【永续的燃烧】', () => {
    const poem = run.events.find((e) => noteArr(e.note).includes('poemBurn'));
    expect(poem, '没有 poemBurn 事件（德谬歌未登场）').toBeDefined();
    expect(noteArr(poem!.note)).toContain('poemBurnSeed');
    expect(poem!.unitId).toBe('xilian');
    // 之后白厄变身：note 带 phainonBurn（= 永续燃烧特效已生效）
    const form = run.events.find((e) => noteArr(e.note).includes('phainonBurn'));
    expect(form, '白厄变身未拿到永续的燃烧').toBeDefined();
    expect(noteArr(form!.note)).toContain('phainonForm');
  }, 300_000);

  it('变身时挂暴击率 +16%（忆灵技 lv6 #1）；暴伤按火种超出 12 的部分给', () => {
    const idx = run.events.findIndex((e) => noteArr(e.note).includes('phainonBurn'));
    expect(idx).toBeGreaterThanOrEqual(0);
    // 变身事件之后的快照里应有 phainonBurnCr
    const buffsAt = (i: number) => {
      const ev = run.events[i];
      const b = ev.buffs as unknown as
        | Record<string, { labelKey?: string; value: number }[]>
        | undefined;
      return Object.entries(b ?? {}).flatMap(([unit, arr]) =>
        arr.filter((x) => x.labelKey?.startsWith('phainonBurn')).map((x) => ({ unit, ...x })),
      );
    };
    const after = buffsAt(idx + 1);
    const cr = after.find((x) => x.labelKey === 'phainonBurnCr');
    expect(cr?.unit).toBe('phainon');
    expect(cr!.value).toBeCloseTo(0.16, 10);
    // 本场白厄以 12 火种整开大（变身扣 12 → 余 0）→ 没有暴伤实例
    const seedAfter = Number(run.events[idx].energyAfter ?? 0);
    const expectCd = Math.min(0.72, Math.max(0, seedAfter) * 0.12);
    const cd = after.find((x) => x.labelKey === 'phainonBurnCd');
    if (expectCd > 0) expect(cd!.value).toBeCloseTo(expectCd, 10);
    else expect(cd).toBeUndefined();
  }, 300_000);

  it('额外回合耗尽 → 不结束变身、刷新全部额外回合（字面无限）+ 攻击后 5 段火附伤', () => {
    const refreshIdx = run.events.findIndex((e) =>
      noteArr(e.note).includes('phainonBurnRefresh'),
    );
    expect(refreshIdx, '没有触发永续燃烧刷新').toBeGreaterThanOrEqual(0);
    // 刷新之后：仍有额外回合行动、且没有变身结束
    const after = run.events.slice(refreshIdx + 1);
    expect(after.some((e) => e.unitId === 'phainonExtra')).toBe(true);
    expect(after.some((e) => noteArr(e.note).includes('phainonEnd'))).toBe(false);
    // 火附伤：每次额外回合攻击 5 段（#3），0 削韧
    const burn = run.hits.filter((h) => h.skillCode === 'phainon.burn');
    expect(burn.length).toBeGreaterThan(0);
    expect(burn.length % 5).toBe(0);
    for (const h of burn.slice(0, 5)) {
      expect(h.kind).toBe('direct');
      expect(h.note).toBeUndefined();
    }
    // 同一事件内的 5 段应聚在同一个额外回合事件里（取【永续的燃烧】生效后的第一个 811）
    const burnFormIdx = run.events.findIndex((e) => noteArr(e.note).includes('phainonBurn'));
    expect(burnFormIdx).toBeGreaterThanOrEqual(0);
    const attackEv = run.events
      .slice(burnFormIdx)
      .find(
        (e) =>
          e.unitId === 'phainonExtra' &&
          e.skillCode === 'phainon.skill811' &&
          (e.hitSeqs?.length ?? 0) > 0,
      )!;
    expect(attackEv).toBeDefined();
    const codes = attackEv.hitSeqs!.map((s) => run.hits[s].skillCode);
    expect(codes.filter((c) => c === 'phainon.burn').length).toBe(5);
  }, 300_000);
});
