import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  CharId,
  CombatMember,
  MemberPanel,
  MonsterConfig,
} from '../src/index.js';

function panel(element: string, speed: number): MemberPanel {
  return {
    element: element as MemberPanel['element'],
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1.0,
    damageBonus: 0,
    speed,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(): MonsterConfig {
  return {
    level: 85,
    hp: 1e9,
    resistance: {},
    weaknesses: [],
    maxToughness: 300,
    speed: 100,
    enemyClass: 'elite',
  } as MonsterConfig;
}

function config(
  members: { id: CharId; element: string; speed: number; e?: number }[],
  opts: { maxTime?: number; count?: number; techniques?: boolean } = {},
): BattleConfig {
  return {
    members: members.map((m) => ({
      id: m.id,
      panel: panel(m.element, m.speed),
      eidolonLevel: m.e ?? 0,
    })) as CombatMember[],
    monsters: Array.from({ length: opts.count ?? 1 }, () => monster()),
    maxTime: opts.maxTime ?? 400,
    techniques: opts.techniques ?? false,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const notesOf = (r: ReturnType<typeof simulateBattle>) =>
  new Set(r.events.flatMap((e) => e.note ?? []));

describe('银枝 1302', () => {
  it('90 能即可施放普通终结技（开场立即施放）', () => {
    const r = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200 }], { maxTime: 1, count: 2 }),
    );
    const ult = r.events[0];
    expect(ult?.skillCode).toBe('argenti.ult');
    expect(ult?.note).toContain('argentiUlt');
    expect(ult?.note).not.toContain('argentiUltEnhanced');
    expect(ult?.hitSeqs).toHaveLength(2);
  });

  it('天赋：每次命中回能并叠加升格', () => {
    const r = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200 }], { maxTime: 200, count: 2 }),
    );
    const skills = r.events.filter((e) => e.skillCode === 'argenti.skill');
    expect(skills.map((e) => e.energyAfter)).toEqual([51, 87, 123]);
    expect(notesOf(r).has('argentiTalent')).toBe(true);
  });

  it('E2：敌人≥3 时攻击力 +40% 并作用于本次终结技', () => {
    const base = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200 }], { maxTime: 1, count: 3 }),
    );
    const e2 = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200, e: 2 }], {
        maxTime: 1,
        count: 3,
      }),
    );
    expect(factor(hitsOf(base, 'argenti.ult')[0]!, 'base')).toBeCloseTo(4800, 5);
    expect(factor(hitsOf(e2, 'argenti.ult')[0]!, 'base')).toBeCloseTo(6720, 5);
  });

  it('E4：开场 +2 层升格，首记终结技暴击区高于 E0', () => {
    const e0 = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200 }], { maxTime: 1, count: 2 }),
    );
    const e4 = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200, e: 4 }], {
        maxTime: 1,
        count: 2,
      }),
    );
    expect(factor(hitsOf(e4, 'argenti.ult')[0]!, 'crit')).toBeGreaterThan(
      factor(hitsOf(e0, 'argenti.ult')[0]!, 'crit'),
    );
  });

  it('E6：终结技无视 30% 防御', () => {
    const e0 = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200 }], { maxTime: 1, count: 2 }),
    );
    const e6 = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200, e: 6 }], {
        maxTime: 1,
        count: 2,
      }),
    );
    expect(factor(hitsOf(e0, 'argenti.ult')[0]!, 'defense')).toBeCloseTo(0.488, 3);
    expect(factor(hitsOf(e6, 'argenti.ult')[0]!, 'defense')).toBeCloseTo(0.576, 3);
  });

  it('秘技：0.8×攻击力全体伤害 +15 能', () => {
    const r = simulateBattle(
      config([{ id: 'argenti', element: 'Physical', speed: 200 }], {
        maxTime: 1,
        techniques: true,
      }),
    );
    const tech = hitsOf(r, 'argenti.tech');
    expect(tech).toHaveLength(1);
    expect(factor(tech[0]!, 'base')).toBeCloseTo(2400, 5);
    expect(notesOf(r).has('argentiTech')).toBe(true);
  });
});
