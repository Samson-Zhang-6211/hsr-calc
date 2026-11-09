import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(): MemberPanel {
  return {
    element: 'Physical',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1,
    damageBonus: 0,
    speed: 100,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 300,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack: 800,
  } as MonsterConfig;
}

function config(e: number, techniques = false): BattleConfig {
  return {
    members: [{ id: 'clara', panel: panel(), eidolonLevel: e } as CombatMember],
    monsters: [monster()],
    maxTime: 260,
    techniques,
    initialSp: 3,
  };
}

const base = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'base')!.value;
const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value;

describe('克拉拉 1107', () => {
  it('E0：普攻/战技/天赋反击与终结技强化反击 4.16×攻击', () => {
    const r = simulateBattle(config(0));
    const skill1 = r.events.find((e) => e.skillCode === 'clara.skill' && e.time === 100)!;
    expect(skill1.note).toContain('claraSkill');
    expect(skill1.spAfter).toBe(2);
    expect(skill1.energyAfter).toBe(85);
    expect(skill1.hitSeqs!.length).toBe(1);
    expect(base(r.hits[skill1.hitSeqs![0]])).toBeCloseTo(3600);

    const talent = r.events.find((e) => e.skillCode === 'clara.talent' && e.time === 100)!;
    expect(talent.note).toContain('claraTalent');
    expect(base(r.hits[talent.hitSeqs![0]])).toBeCloseTo(4800);

    const skill2 = r.events.find((e) => e.skillCode === 'clara.skill' && e.time === 200)!;
    expect(skill2.hitSeqs!.length).toBe(2);

    const ult = r.events.find((e) => e.skillCode === 'clara.ult')!;
    expect(ult.note).toContain('claraUlt');
    expect(ult.energyAfter).toBe(5);

    const counter = r.events.find(
      (e) => e.skillCode === 'clara.ultCounter' && e.time === 200,
    )!;
    expect(counter.note).toContain('claraUltCounter');
    expect(base(r.hits[counter.hitSeqs![0]])).toBeCloseTo(12480);
  });

  it('E1：战技不清除反击标记（第二段额外伤害仍在）', () => {
    const r = simulateBattle(config(1));
    const skill2 = r.events.find((e) => e.skillCode === 'clara.skill' && e.time === 200)!;
    expect(skill2.hitSeqs!.length).toBe(2);
  });

  it('E2：终结技后攻击力 +30%，强化反击倍率提升', () => {
    const r = simulateBattle(config(2));
    const counter = r.events.find(
      (e) => e.skillCode === 'clara.ultCounter' && e.time === 200,
    )!;
    expect(base(r.hits[counter.hitSeqs![0]])).toBeCloseTo(16224);
    expect(counter.note).toContain('claraUltCounter');
  });

  it('E4：受击后获得减伤，不改变反击倍率', () => {
    const r = simulateBattle(config(4));
    const counter = r.events.find(
      (e) => e.skillCode === 'clara.ultCounter' && e.time === 200,
    )!;
    expect(base(r.hits[counter.hitSeqs![0]])).toBeCloseTo(16224);
  });

  it('E6：终结技强化反击次数 +1（仍能触发强化反击）', () => {
    const r = simulateBattle(config(6));
    const counters = r.events.filter((e) => e.skillCode === 'clara.ultCounter');
    expect(counters.length).toBeGreaterThan(0);
    expect(factor(r.hits[counters[0].hitSeqs![0]], 'resist')).toBeCloseTo(1);
  });

  it('秘技：进战提高受击权重', () => {
    const r = simulateBattle(config(0, true));
    const tech = r.events.find((e) => e.skillCode === 'clara.tech')!;
    expect(tech.note).toContain('claraTech');
  });
});
