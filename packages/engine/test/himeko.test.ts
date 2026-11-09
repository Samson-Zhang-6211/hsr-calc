import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

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

function config(members: [CharId, string, number, number][], maxTime: number, techniques = false): BattleConfig {
  const monster: MonsterConfig = {
    level: 85,
    hp: 1e9,
    resistance: {},
    weaknesses: ['Fire'],
    maxToughness: 120,
    speed: 100,
    enemyClass: 'elite',
  };
  return {
    members: members.map(([id, element, speed, eidolonLevel]) => ({
      id,
      panel: panel(element, speed),
      eidolonLevel,
    })) as CombatMember[],
    monster,
    maxTime,
    techniques,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const notesOf = (r: ReturnType<typeof simulateBattle>) =>
  new Set(r.events.flatMap((e) => e.note ?? []));

describe('姬子 1003', () => {
  it('初始能量为上限 50%', () => {
    const r = simulateBattle(config([['himeko', 'Fire', 120, 0]], 1));
    expect(r.finalState.energy.himeko).toBe(60);
  });

  it('秘技、终结技、追击、灼烧与星魂 6 全链', () => {
    const r = simulateBattle(
      config(
        [
          ['himeko', 'Fire', 120, 6],
          ['sunday', 'Imaginary', 130, 0],
        ],
        160,
        true,
      ),
    );
    const notes = notesOf(r);
    expect(notes.has('himekoTech')).toBe(true);
    expect(notes.has('himekoCharge')).toBe(true);
    expect(notes.has('himekoE6')).toBe(true);
    expect(notes.has('himekoE1')).toBe(true);
    expect(notes.has('himekoBurn')).toBe(true);
    expect(hitsOf(r, 'himeko.followup')).toHaveLength(3);
    expect(hitsOf(r, 'himeko.ult').filter((h) => h.kind === 'direct')).toHaveLength(5);
    expect(hitsOf(r, 'himeko.skill')).toHaveLength(6);
    expect(hitsOf(r, 'skilldot.burn').length).toBeGreaterThanOrEqual(2);

    const ult = r.events.find((e) => e.kind === 'ult' && e.unitId === 'himeko');
    const followupSeqs = hitsOf(r, 'himeko.followup').map((h) => h.seq);
    expect(ult?.hitSeqs).toEqual(expect.arrayContaining(followupSeqs));
  });
});
