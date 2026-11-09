import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  CombatMember,
  MemberPanel,
  MonsterConfig,
} from '../src/index.js';

function panel(): MemberPanel {
  return {
    element: 'Ice',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1.0,
    damageBonus: 0,
    speed: 200,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(count = 1): MonsterConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    level: 90,
    hp: 5e8,
    maxToughness: 1e9,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: `monster${i + 1}`,
    effectRes: 0,
    attack: 0,
  }) as MonsterConfig);
}

function config(
  e: number,
  opts: { maxTime?: number; techniques?: boolean } = {},
): BattleConfig {
  return {
    members: [{ id: 'misha', panel: panel(), eidolonLevel: e } as CombatMember],
    monsters: monster(),
    maxTime: opts.maxTime ?? 160,
    techniques: opts.techniques ?? false,
  };
}

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const hitAt = (r: ReturnType<typeof simulateBattle>, seq: number) => {
  const h = r.hits.find((x) => x.seq === seq);
  if (!h) throw new Error(`missing hit ${seq}`);
  return h;
};

describe('米沙 1312', () => {
  it('E0：两次战技后终结技 7 段，首段 100% 冻结并触发冻结伤害', () => {
    const r = simulateBattle(config(0, { maxTime: 110 }));
    const ult = r.events.find((e) => e.skillCode === 'misha.ult' && e.time === 100)!;
    expect(ult.hitSeqs).toHaveLength(7);
    expect(ult.note).toContain('enemyBreakFreeze');
    const hits = ult.hitSeqs!.map((seq) => hitAt(r, seq));
    expect(factor(hits[0], 'base')).toBeCloseTo(1800);
    expect(factor(hits[0], 'crit')).toBeCloseTo(1.75);
    expect(factor(hits[1], 'crit')).toBeCloseTo(1.9);
    const freeze = r.events.find((e) => (e.note ?? []).includes('mishaFreezeDmg'))!;
    expect(freeze.note).toContain('enemyFreezeSkip');
    expect(factor(hitAt(r, freeze.hitSeqs![0]), 'base')).toBeCloseTo(900);
    expect(factor(hitAt(r, freeze.hitSeqs![0]), 'crit')).toBeCloseTo(1);
    expect(hitAt(r, freeze.hitSeqs![0]).total).toBeCloseTo(385.7142857142857);
  });

  it('E6：终结技倍率 +6%，战技后回 1 战技点', () => {
    const r = simulateBattle(config(6));
    const ult = r.events.find((e) => e.skillCode === 'misha.ult' && e.time === 100)!;
    expect(ult.hitSeqs).toHaveLength(8);
    expect(factor(hitAt(r, ult.hitSeqs![0]), 'base')).toBeCloseTo(1980);
    const freeze = r.events.find((e) => (e.note ?? []).includes('mishaFreezeDmg'))!;
    expect(hitAt(r, freeze.hitSeqs![0]).total).toBeCloseTo(547.2972972972973);
    const skill = r.events.find((e) => e.skillCode === 'misha.skill' && e.time === 150)!;
    expect(skill.note).toContain('mishaE6Sp');
    expect(skill.spAfter).toBe(1);
    expect(hitAt(r, skill.hitSeqs![0]).total).toBeCloseTo(6385.135135135136);
  });

  it('E2：终结技命中挂防御降低，后续段与冻结伤害提高', () => {
    const r = simulateBattle(config(2, { maxTime: 110 }));
    const ult = r.events.find((e) => e.skillCode === 'misha.ult' && e.time === 100)!;
    const first = hitAt(r, ult.hitSeqs![0]);
    const second = hitAt(r, ult.hitSeqs![1]);
    expect(factor(first, 'defense')).toBeCloseTo(0.47619047619047616);
    expect(factor(second, 'defense')).toBeCloseTo(0.5197505197505198);
    const freeze = r.events.find((e) => (e.note ?? []).includes('mishaFreezeDmg'))!;
    expect(hitAt(r, freeze.hitSeqs![0]).total).toBeCloseTo(420.997920997921);
  });

  it('E1：每有 1 个敌方目标额外 +1 段，三目标共 10 段', () => {
    const c = config(1, { maxTime: 110 });
    c.monsters = monster(3);
    const r = simulateBattle(c);
    const ult = r.events.find((e) => e.skillCode === 'misha.ult' && e.time === 100)!;
    expect(ult.hitSeqs).toHaveLength(10);
  });

  it('秘技：终结技段数 +2，共 9 段', () => {
    const r = simulateBattle(config(0, { techniques: true, maxTime: 110 }));
    const tech = r.events.find((e) => e.skillCode === 'misha.tech')!;
    expect(tech.note).toContain('mishaTech');
    const ult = r.events.find((e) => e.skillCode === 'misha.ult' && e.time === 100)!;
    expect(ult.hitSeqs).toHaveLength(9);
  });
});
