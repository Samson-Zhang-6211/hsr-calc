import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 德谬歌「献予诗」两首新接入（2026-11-02 round 39）
 *
 * - `1141520` 诡计（赛飞儿）：本场伤害 +#1、[老主顾] 防御 −#2、其他敌防御 −#3（整场）
 * - `1141523` 律法（刻律德菈）：持【军功】角色暴伤 +#1（整场）、奇袭结束后 +充能 #2
 *
 * 锚点来自临时 `_poem-dump`（2 人队 xilian+伙伴，seed 20261011）：
 *   saifeir → t=800.0 `xilian.ult` 带 note `poemTrick`；cerdra → t=666.7 带 note `poemLaw`。
 *   两例后续事件的 `buffs` 里都能看到对应 labelKey（`poemTrickDmg` / `poemLaw`）。
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
  weaknesses: ['Ice', 'Fire', 'Quantum'] as Element[],
};

const card = (element: Element, speed: number, er: number) => ({
  level: 80,
  hp: 7000,
  attack: 1200,
  defence: 900,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: er,
  element,
  damageBonus: 0,
  breakEffect: 0,
});

const cfg = (partner: 'saifeir' | 'cerdra' | 'anaxa' | 'mydei'): BattleConfig =>
  ({
    rounds: 10,
    maxTime: 1000,
    techniques: false,
    members: [
      { id: 'xilian', panel: card('Ice', 150, 0.8), eidolonLevel: 0 },
      {
        id: partner,
        panel: card(
          partner === 'saifeir' ? 'Quantum' : partner === 'mydei' ? 'Fire' : 'Wind',
          120,
          0.3,
        ),
        eidolonLevel: 0,
      },
    ],
    monster: { ...mon },
    mainC: 'xilian',
    seed: 20261011,
  }) as unknown as BattleConfig;

type BuffSnap = { key?: string; labelKey?: string; value?: number; stacks?: number };

/** 在事件快照里找指定 labelKey 的 buff（`event.buffs` 是 unitId → buff[] 的字典） */
const findBuff = (buffs: unknown, labelKey: string): BuffSnap | undefined => {
  if (!buffs || typeof buffs !== 'object') return undefined;
  for (const arr of Object.values(buffs as Record<string, unknown>)) {
    if (!Array.isArray(arr)) continue;
    for (const b of arr as BuffSnap[]) {
      if (b?.labelKey === labelKey) return b;
    }
  }
  return undefined;
};

describe('德谬歌献予诗 1141518 / 1141520 / 1141523', () => {
  // 诗篇参数一律按 `skillParams(poemId, 1)`（lv1）取值 → 断言值也锚 lv1
  for (const [partner, note, buffKey, expectValue] of [
    ['saifeir', 'poemTrick', 'poemTrickDmg', 0.18],
    ['cerdra', 'poemLaw', 'poemLaw', 0.15],
    ['anaxa', 'poemReason', 'poemInsight', 0.3],
  ] as const) {
    it(`${note}：召唤时挂载，且 ${buffKey} 的数值 = ${expectValue}`, () => {
      const rep = simulateBattleReplay(cfg(partner));
      const evs = rep.steps.map((s) => s.event);
      const summon = evs.find((e) => (e.note ?? []).includes(note));
      expect(summon).toBeDefined();
      expect(summon!.skillCode).toBe('xilian.ult'); // 德谬歌只由昔涟终结技召唤
      // 召唤之后（含本次）的某个事件快照里应能看到该 buff，且值等于诗篇 lv1 参数
      const idx = evs.indexOf(summon!);
      let found: BuffSnap | undefined;
      for (const e of evs.slice(idx)) {
        found = findBuff(e.buffs, buffKey);
        if (found) break;
      }
      expect(found).toBeDefined();
      expect(found!.value).toBeCloseTo(expectValue, 10);
    }, 120_000);
  }

  it('poemStrife（万敌）：召唤时给 note，且不改 buff（效果是解控/弑神登神或行动提前）', () => {
    const rep = simulateBattleReplay(cfg('mydei'));
    const evs = rep.steps.map((s) => s.event);
    const summon = evs.find((e) => (e.note ?? []).includes('poemStrife'));
    expect(summon).toBeDefined();
    expect(summon!.skillCode).toBe('xilian.ult');
    // 未处于【血仇】时按条款走「万敌行动提前 #2=1（100%）」：召唤之后万敌应当立刻有一次行动
    const idx = evs.indexOf(summon!);
    const mydeiAfter = evs.slice(idx + 1).find((e) => e.unitId === 'mydei' && e.kind === 'action');
    expect(mydeiAfter).toBeDefined();
  }, 120_000);
});
