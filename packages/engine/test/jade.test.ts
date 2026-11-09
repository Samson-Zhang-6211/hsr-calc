import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  CharId,
  CombatMember,
  MemberPanel,
  MonsterConfig,
} from '../src/index.js';

function panel(element: string, speed: number, attack = 3000): MemberPanel {
  return {
    element: element as MemberPanel['element'],
    level: 80,
    hp: 10000,
    attack,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1.0,
    damageBonus: 0,
    speed,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(hp = 1e9): MonsterConfig {
  return {
    level: 85,
    hp,
    resistance: {},
    weaknesses: [],
    maxToughness: 300,
    speed: 100,
    enemyClass: 'elite',
  } as MonsterConfig;
}

function config(
  members: { id: CharId; element: string; speed: number; attack?: number; e?: number }[],
  opts: { maxTime?: number; count?: number; techniques?: boolean } = {},
): BattleConfig {
  return {
    members: members.map((m) => ({
      id: m.id,
      panel: panel(m.element, m.speed, m.attack),
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

describe('翡翠 1314', () => {
  it('初始能量 70', () => {
    const r = simulateBattle(config([{ id: 'jade', element: 'Quantum', speed: 200 }], { maxTime: 1 }));
    expect(r.finalState.energy.jade).toBe(70);
  });

  it('战技指定攻击力最高的智识队友为收债人', () => {
    const r = simulateBattle(
      config(
        [
          { id: 'jade', element: 'Quantum', speed: 200 },
          { id: 'serval', element: 'Thunder', speed: 150, attack: 4000 },
        ],
        { maxTime: 30 },
      ),
    );
    const skill = r.events.find((e) => e.skillCode === 'jade.skill');
    expect(skill).toBeDefined();
    expect(skill!.note).toContain('jadeDebtor');
  });

  it('收债人命中触发 0.25×翡翠攻击量子附加伤害', () => {
    const r = simulateBattle(
      config(
        [
          { id: 'jade', element: 'Quantum', speed: 200 },
          { id: 'serval', element: 'Thunder', speed: 150, attack: 4000 },
        ],
        { maxTime: 200 },
      ),
    );
    expect(notesOf(r).has('jadeDebt')).toBe(true);
    const debt = hitsOf(r, 'jade.debt');
    expect(debt.length).toBeGreaterThanOrEqual(1);
    expect(debt[0]!.source).toBe('jade');
    expect(factor(debt[0]!, 'base')).toBeCloseTo(765, 5);
  });

  it('E6：自身也成为收债人，自身攻击触发附加伤害', () => {
    const r = simulateBattle(
      config([{ id: 'jade', element: 'Quantum', speed: 200, e: 6 }], { maxTime: 200 }),
    );
    const ownBasic = r.events.find(
      (e) => e.kind === 'action' && e.action === 'basic' && (e.note ?? []).includes('jadeDebt'),
    );
    expect(ownBasic).toBeDefined();
  });

  it('天赋：8 点充能触发全体追加攻击并给当品', () => {
    const r = simulateBattle(
      config([{ id: 'jade', element: 'Quantum', speed: 200, e: 6 }], { maxTime: 200 }),
    );
    expect(notesOf(r).has('jadeTalent')).toBe(true);
    expect(hitsOf(r, 'jade.talent')).toHaveLength(1);
  });

  it('终结技 2.4×攻击力，并触发 E4 无视防御', () => {
    const r = simulateBattle(
      config([{ id: 'jade', element: 'Quantum', speed: 200, e: 6 }], { maxTime: 200 }),
    );
    const ult = hitsOf(r, 'jade.ult');
    expect(ult).toHaveLength(1);
    expect(factor(ult[0]!, 'base')).toBeCloseTo(2484, 5);
    expect(r.events.find((e) => e.skillCode === 'jade.ult')?.note).toContain('jadeE4');
    const debt = hitsOf(r, 'jade.debt');
    expect(factor(debt[debt.length - 1]!, 'defense')).toBeGreaterThan(
      factor(debt[0]!, 'defense'),
    );
  });

  it('收债人 3 回合后到期，可再次施放战技', () => {
    const r = simulateBattle(
      config([{ id: 'jade', element: 'Quantum', speed: 200, e: 6 }], { maxTime: 300 }),
    );
    const skills = r.events.filter((e) => e.skillCode === 'jade.skill');
    expect(skills).toHaveLength(2);
    expect(skills.every((e) => (e.note ?? []).includes('jadeDebtor'))).toBe(true);
  });

  it('秘技：0.5×攻击力全体伤害', () => {
    const r = simulateBattle(
      config([{ id: 'jade', element: 'Quantum', speed: 200 }], { maxTime: 1, techniques: true }),
    );
    const tech = hitsOf(r, 'jade.tech');
    expect(tech).toHaveLength(1);
    expect(factor(tech[0]!, 'base')).toBeCloseTo(1507.5, 5);
    expect(notesOf(r).has('jadeTech')).toBe(true);
  });
});
