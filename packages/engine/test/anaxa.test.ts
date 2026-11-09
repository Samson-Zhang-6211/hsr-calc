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

function monster(hp = 1e9, weaknesses: string[] = []): MonsterConfig {
  return {
    level: 85,
    hp,
    resistance: {},
    weaknesses: weaknesses as MonsterConfig['weaknesses'],
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

describe('那刻夏 1405', () => {
  it('初始能量 70', () => {
    const r = simulateBattle(config([{ id: 'anaxa', element: 'Wind', speed: 200 }], { maxTime: 1 }));
    expect(r.finalState.energy.anaxa).toBe(70);
  });

  it('战技 5 段；质性揭露后同次行动追加 5 段额外战技（不耗 SP）', () => {
    const r = simulateBattle(
      config([{ id: 'anaxa', element: 'Wind', speed: 200 }], { maxTime: 60 }),
    );
    const ev = r.events.filter((e) => e.skillCode === 'anaxa.skill');
    expect(ev).toHaveLength(1);
    expect(ev[0].hitSeqs).toHaveLength(10);
    expect(ev[0].note).toContain('anaxaExtraSkill');
    const hits = hitsOf(r, 'anaxa.skill');
    expect(hits).toHaveLength(10);
    expect(factor(hits[0]!, 'damageBonus')).toBe(1.2);
    expect(factor(hits[hits.length - 1]!, 'damageBonus')).toBe(1.5);
    expect(hits.filter((h) => factor(h, 'damageBonus') === 1.5).length).toBeGreaterThanOrEqual(
      5,
    );
  });

  it('E1：首次战技回 1 SP，战技命中使后续伤害防御区提高', () => {
    const e0 = simulateBattle(
      config([{ id: 'anaxa', element: 'Wind', speed: 200 }], { maxTime: 60 }),
    );
    const e1 = simulateBattle(
      config([{ id: 'anaxa', element: 'Wind', speed: 200, e: 1 }], { maxTime: 60 }),
    );
    expect(e0.finalState.sp).toBe(2);
    expect(e1.finalState.sp).toBe(3);
    expect(factor(hitsOf(e1, 'anaxa.skill')[1]!, 'defense')).toBeGreaterThan(
      factor(hitsOf(e0, 'anaxa.skill')[1]!, 'defense'),
    );
  });

  it('E2：敌人入场全属性抗性 -20%（抗性区 1.2）', () => {
    const r = simulateBattle(
      config([{ id: 'anaxa', element: 'Wind', speed: 200, e: 2 }], { maxTime: 60 }),
    );
    expect(factor(hitsOf(r, 'anaxa.skill')[0]!, 'resist')).toBeCloseTo(1.2, 10);
  });

  it('E4：施放战技攻击力 +30%（首段基础值 2730）', () => {
    const r = simulateBattle(
      config([{ id: 'anaxa', element: 'Wind', speed: 200, e: 4 }], { maxTime: 60 }),
    );
    const first = hitsOf(r, 'anaxa.skill')[0]!;
    expect(factor(first, 'base')).toBeCloseTo(2730, 5);
  });

  it('E6：最终伤害独立乘区 ×1.3（且含 E2 减抗、E4 加攻）', () => {
    const r = simulateBattle(
      config([{ id: 'anaxa', element: 'Wind', speed: 200, e: 6 }], { maxTime: 60 }),
    );
    const first = hitsOf(r, 'anaxa.skill')[0]!;
    expect(factor(first, 'independent')).toBeCloseTo(1.3, 10);
    expect(factor(first, 'base')).toBeCloseTo(2730, 5);
    expect(factor(first, 'resist')).toBeCloseTo(1.2, 10);
  });

  it('终结技先升华 7 弱点，随后敌人回合开始跳过行动', () => {
    const r = simulateBattle(
      config([{ id: 'anaxa', element: 'Wind', speed: 200 }], { maxTime: 120, count: 2 }),
    );
    const ult = r.events.find((e) => e.skillCode === 'anaxa.ult');
    expect(ult).toBeDefined();
    expect(ult!.note).toContain('anaxaUlt');
    const skips = r.events.filter((e) => (e.note ?? []).includes('enemySublimationSkip'));
    expect(skips).toHaveLength(2);
  });

  it('秘技：为每个敌人附加风弱点（无直接伤害）', () => {
    const r = simulateBattle(
      config([{ id: 'anaxa', element: 'Wind', speed: 200 }], { maxTime: 1, techniques: true }),
    );
    expect(r.events[0]?.skillCode).toBe('anaxa.tech');
    expect(r.events[0]?.note).toContain('anaxaTechnique');
    expect(hitsOf(r, 'anaxa.skill')).toHaveLength(0);
    expect(notesOf(r).has('anaxaTechnique')).toBe(true);
  });
});
