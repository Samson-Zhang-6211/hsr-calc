import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type CombatEvent,
  type CombatMember,
  type HitLog,
  type MemberPanel,
} from '../src/index.js';

/**
 * 【物竞天择】（混沌 P44 本期关卡机制，2026-11-06 用户录像 t≈84s 关卡页原文）：
 * - 我方目标施放终结技时获得 5 个笑点
 * - 每个轮开始时，使阿哈立即获得 1 个固定计入 20 笑点的额外回合，该回合不消耗笑点
 *
 * 锚点来自临时 dump（`v4-ns-dump.test.ts`，seed 20261106，爻光单人 / 木桩 5e8 HP）：
 *  - 无机制：t=88.5 时刻 x=0 → laugh 因子 1.0617；终招 laugh 3→8（自身 +5）
 *  - 有机制：t=177.0 r1 / t=265.5 r2 各多出 1 个 note=stageNsAha 的时刻，laugh 因子 **1.3846**
 *            （= 1+5×20/260，固定计入 20 笑点）；终招 note 带 stageNsLaugh，laugh 3→10
 */

const panel: MemberPanel = {
  level: 80,
  speed: 165,
  attack: 1886,
  hp: 3443,
  defence: 1138,
  element: 'Physical',
  critRate: 0.648,
  critDmg: 1.212,
  elationDegree: 0.3,
  damageBonus: 0,
  breakEffect: 0,
  effectHit: 0.073,
  effectRes: 0.159,
  damageReduction: 0,
  energyRegen: 0.244,
};

const yg: CombatMember = {
  id: 'yaoguang',
  eidolonLevel: 0,
  panel,
  skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
};

const MON: BattleConfig['monster'] = {
  level: 95,
  hp: 500_000_000,
  maxToughness: 9999,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};

const cfg = (mechanics?: string[]): BattleConfig => ({
  members: [yg],
  monster: MON,
  techniques: false,
  rounds: 3,
  maxTime: 3000,
  seed: 20261106,
  ...(mechanics ? { mechanics } : {}),
});

const notesOf = (e: CombatEvent): string[] =>
  Array.isArray(e.note) ? (e.note as string[]) : e.note ? [String(e.note)] : [];

const factorOf = (h: HitLog, k: string): number =>
  h.factors.find((f) => f.key === k)?.value ?? Number.NaN;

const hitsOf = (r: ReturnType<typeof simulateBattle>, e: CombatEvent): HitLog[] =>
  (e.hitSeqs ?? []).map((s) => r.hits.find((h) => h.seq === s)!);

describe('物竞天择（P44 关卡机制）', () => {
  const withNs = simulateBattle(cfg(['naturalSelection']));
  const without = simulateBattle(cfg());

  it('每个轮开始多出 1 次 note=stageNsAha 的阿哈额外回合', () => {
    const nsMoments = withNs.events.filter(
      (e) => e.unitId === 'ahaMoment' && notesOf(e).includes('stageNsAha'),
    );
    expect(nsMoments).toHaveLength(2);
    expect(nsMoments[0]!.time).toBeCloseTo(176.99, 1);
    expect(nsMoments[1]!.time).toBeCloseTo(265.49, 1);
    // 无机制时一次都没有
    expect(
      without.events.filter(
        (e) => e.unitId === 'ahaMoment' && notesOf(e).includes('stageNsAha'),
      ),
    ).toHaveLength(0);
  });

  it('该额外回合固定计入 20 笑点（laugh 因子 1.3846）且不消耗笑点', () => {
    const first = withNs.events.find(
      (e) => e.unitId === 'ahaMoment' && notesOf(e).includes('stageNsAha'),
    )!;
    const hs = hitsOf(withNs, first);
    expect(hs.length).toBeGreaterThan(0);
    for (const h of hs) {
      expect(h.kind).toBe('elation');
      expect(factorOf(h, 'laugh')).toBeCloseTo(1 + (5 * 20) / 260, 6);
    }
    // 不消耗：时刻记录的笑点 = 该时刻之前最后一次记录的笑点
    const prior = withNs.events
      .filter((e) => e.time < first.time && typeof e.laughPointsAfter === 'number')
      .at(-1)!;
    expect(first.laughPointsAfter).toBe(prior.laughPointsAfter);
  });

  it('施放终结技时 +5 笑点（note=stageNsLaugh）', () => {
    const ult = withNs.events.find((e) => e.kind === 'ult')!;
    expect(notesOf(ult)).toContain('stageNsLaugh');
    const ultNo = without.events.find((e) => e.kind === 'ult')!;
    expect(notesOf(ultNo)).not.toContain('stageNsLaugh');
    // 同一时点：有机制比无机制多 2 点（终招前的插入时刻消耗了池内点数，条目本身 +5 仍成立）
    expect(ult.laughPointsAfter).toBe(10);
    expect(ultNo.laughPointsAfter).toBe(8);
  });
});
