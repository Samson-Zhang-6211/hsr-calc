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
    weaknesses: ['Imaginary'],
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

describe('乱破 1317', () => {
  it('初始能量为上限 50%', () => {
    const r = simulateBattle(config([['rappa', 'Imaginary', 130, 0]], 1));
    expect(r.finalState.energy.rappa).toBe(70);
  });

  it('秘技对全体削韧并造成虚数击破伤害、回能 10', () => {
    const r = simulateBattle(config([['rappa', 'Imaginary', 130, 0]], 1, true));
    expect(hitsOf(r, 'rappa.tech')).toHaveLength(7);
    expect(hitsOf(r, 'rappa.tech').every((h) => h.kind === 'breakTrigger')).toBe(true);
    expect(notesOf(r).has('rappaTech')).toBe(true);
    const tech = r.events.find((e) => e.action === 'technique' && e.unitId === 'rappa');
    expect(tech?.energyAfter).toBe(80);
  });

  it('结印强化普攻三段、天赋击破、point06/07 全链', () => {
    const r = simulateBattle(
      config(
        [
          ['rappa', 'Imaginary', 130, 6],
          ['sunday', 'Imaginary', 130, 0],
        ],
        160,
        true,
      ),
    );
    const notes = notesOf(r);
    expect(notes.has('rappaInk')).toBe(true);
    expect(notes.has('rappaP06')).toBe(true);
    expect(hitsOf(r, 'rappa.enhanced')).toHaveLength(18);
    expect(hitsOf(r, 'rappa.talentBreak')).toHaveLength(6);
    expect(hitsOf(r, 'rappa.enhanced.sb').length).toBeGreaterThan(0);
    expect(hitsOf(r, 'rappa.enhanced.sb').some((h) => h.note === 'rappaP07')).toBe(true);
  });
});
