import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  simulateBattle,
  type BattleConfig,
  type CombatMember,
  type HitLog,
  type MemberPanel,
} from '../src/index.js';

/**
 * 真珠追加段（150320）的**暴击归属**回归（2026-11-06 用户裁定 + v7 录像反推）：
 * - 追加段整段按【真珠】实时暴击结算（`critFrom: 'zhenzhu'`），元素/抗性仍跟攻击者；
 * - 依据：绯英普攻 45,556 = 35,826（直伤·暴击）+ 9,730（追加段）。
 *   若用攻击者暴伤（绯英 97.7%/341.4%）反推 9,730，需要的欢愉度×笑点区 = 0.8 —— 数学上不可能。
 */

const panel = (over: Partial<MemberPanel>): MemberPanel =>
  ({
    level: 80, speed: 100, attack: 2000, hp: 3000, defence: 800, element: 'Physical',
    critRate: 0.05, critDmg: 0.5, elationDegree: 0, damageBonus: 0, breakEffect: 0,
    effectHit: 0, effectRes: 0, damageReduction: 0, energyRegen: 0, ...over,
  }) as MemberPanel;

const members: CombatMember[] = [
  {
    id: 'feiying',
    eidolonLevel: 0,
    panel: panel({ speed: 109, attack: 2856, critRate: 0.977, critDmg: 3.414, elationDegree: 0.08 }),
    skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
  },
  {
    id: 'zhenzhu',
    eidolonLevel: 0,
    panel: panel({ speed: 173, attack: 1965, defence: 3161, critRate: 0.079, critDmg: 0.61, elationDegree: 0.1, element: 'Ice' }),
    skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
  },
];

const critOf = (h: HitLog) => h.factors.find((f) => f.key === 'crit')?.value ?? NaN;

describe('真珠追加段 · 暴击归属（critFrom）', () => {
  const r = simulateBattle({
    members,
    monsterWaves: buildPackStageWaves('moc-p44', 12, '下半'),
    techniques: false,
    rounds: 6,
    roundMode: 'forgotten',
    maxTime: 4000,
    seed: 20261106,
    critMode: 'expected',
  } as BattleConfig);

  const riders = r.hits.filter((h) => h.skillCode.endsWith('.zzBonus'));

  it('追加段存在，伤害与元素归属攻击者', () => {
    expect(riders.length).toBeGreaterThan(0);
    const fromFeiying = riders.find((h) => h.source === 'feiying');
    expect(fromFeiying).toBeTruthy();
    expect(fromFeiying!.kind).toBe('elation');
    const res = fromFeiying!.factors.find((f) => f.key === 'resist')?.value ?? 0;
    // 元素/抗性跟攻击者（物理）：弱点 ×1.2 或 非弱点 ×0.8，取决于自身元素弱点
    expect([1.2, 0.8]).toContain(Number(res.toFixed(1)));
  });

  it('暴击因子取真珠面板（≈1+7.9%×61%），与攻击者绯英（≈4.34）明显不同', () => {
    for (const h of riders) {
      expect(critOf(h)).toBeGreaterThan(1);
      expect(critOf(h)).toBeLessThan(1.6);
    }
    expect(Math.abs(critOf(riders[0]!) - (1 + 0.977 * 3.414))).toBeGreaterThan(3);
  });

  it('倍率取 150320 对应档位', () => {
    for (const h of riders) {
      const mult = (h.factors.find((f) => f.key === 'base')?.value ?? 0) / 7535.107;
      expect([0.4, 0.15, 0.1]).toContain(Number(mult.toFixed(3)));
    }
  });
});
