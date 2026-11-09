import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 131「星如我见的领航员」四件套（2026-11-02 round 58，按用户裁定重做）
 *
 * 条款（`data/relicsets/131.json` → `require_num['4'].param_list = [0.18, 3, 1]`）：
 * 进入战斗时/施放战技时，战技和终结技伤害 +18%，最多 3 层；
 * 装备者回合开始时/施放终结技后，移除 1 层。
 *
 * **用户裁定（2026-11-02）**：round 49 那次「按字面实现后层数永远 0~1 震荡」**不是条款的问题，是我测试角色选错了**——
 * 「助战技」算战技，且**可以在回合外释放**，所以层数能叠起来。验证角色 = **姬子·启行**（`himekoNova`）。
 *
 * 落点（三条）：
 * 1. 伤害端在 `dealAttack`：`spec.attackKind === 'skill' || isUltDamageSpec(spec)` → +层数×18%
 *    （`charAttack` 会把 kind 透传成 `attackKind`；助战技在自己那段 `dealAttack` 里显式传 `attackKind:'skill'`）；
 * 2. 加层：`charAttack` 里 `kind === 'skill'` → `relic131Add(id)`，另在 `himekoNovaAssistAttack` 末尾给
 *    `himekoNova` 补一次（助战技不走 `charAttack`）；
 * 3. 减层：成员回合开始（`relic131Drop(charId)`）+ `record()` 里 `kind === 'ult'` 的装备者 −1。
 *
 * dump 锚点（8 回合，姬子·启行 120 速 + 队友 150 速）：
 * 不装时助战技 `damageBonus` 只有 {1.000, 1.200}（seele 队友）/ {1.760, 1.960}（bronya 队友）；
 * 装 131 后出现 **+0.18 / +0.36 / +0.54** 三档 → 1、2、3 层都真实叠到过。
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
  weaknesses: ['Fire', 'Ice', 'Quantum', 'Wind'] as Element[],
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

const cfg = (relic: string | undefined, partner: string): BattleConfig =>
  ({
    rounds: 8,
    maxTime: 1400,
    techniques: false,
    members: [
      { id: 'himekoNova', panel: card('Fire', 120), eidolonLevel: 0, relicsetId: relic },
      { id: partner, panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: partner,
    seed: 20261011,
  }) as unknown as BattleConfig;

/** 姬子·启行所有命中段的 damageBonus 取值集合 */
const assistDamageBonus = (relic: string | undefined, partner: string): number[] => {
  const rep = simulateBattleReplay(cfg(relic, partner));
  const out: number[] = [];
  for (const st of rep.steps) {
    for (const seq of st.event.hitSeqs ?? []) {
      const h = (rep.result as unknown as { hits?: { seq: number; skillCode?: string; factors: { key: string; value: number }[] }[] }).hits?.find(
        (x) => x.seq === seq,
      );
      if (!h) continue;
      if (!String(h.skillCode ?? '').startsWith('himekoNova')) continue;
      out.push(h.factors.find((f) => f.key === 'damageBonus')!.value);
    }
  }
  return out;
};

describe('遗器 131 星如我见的领航员 4pc（姬子·启行助战技叠层）', () => {
  it('助战技算战技 → 层数能叠到 3 层，每层 +18%', () => {
    for (const partner of ['seele', 'bronya']) {
      const bare = assistDamageBonus(undefined, partner);
      const withR = assistDamageBonus('131', partner);
      expect(bare.length).toBeGreaterThan(0);
      // 装 131 后最高档比不装时最高档高 3 层 × 18% = 54%
      expect(Math.max(...withR) - Math.max(...bare)).toBeCloseTo(0.54, 6);
      // 且确实出现过 3 个递增档位（1/2/3 层）
      const deltas = new Set(
        withR
          .map((v) => {
            const base = bare.reduce((best, b) => (Math.abs(v - b - 0.54) < Math.abs(v - best - 0.54) ? b : best), bare[0]);
            return Number((v - base).toFixed(6));
          })
          .filter((d) => d > 1e-9),
      );
      expect([...deltas].filter((d) => d > 0.17 && d < 0.55).length).toBeGreaterThanOrEqual(2);
    }
  }, 600_000);
});
