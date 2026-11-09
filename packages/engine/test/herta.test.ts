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
    weaknesses: ['Ice', 'Fire'],
    maxToughness: 300,
    speed: 100,
    enemyClass: 'elite',
    monsterId: 'monster2',
  } as MonsterConfig;
  return {
    members: members.map(([id, element, speed, eidolonLevel]) => ({
      id,
      panel: panel(element, speed),
      eidolonLevel,
    })) as CombatMember[],
    monsters: [monster],
    maxTime,
    techniques,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const dmgBonus = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'damageBonus')?.value ?? 0;

const notesOf = (r: ReturnType<typeof simulateBattle>) =>
  new Set(r.events.flatMap((e) => e.note ?? []));

describe('大黑塔 1401', () => {
  it('初始能量为上限 50%', () => {
    const r = simulateBattle(config([['herta', 'Ice', 99, 0]], 1));
    expect(r.finalState.energy.herta).toBe(110);
  });

  it('单体全链：强化战技、终结技、point06 满层增伤', () => {
    const r = simulateBattle(
      config(
        [
          ['herta', 'Ice', 99, 0],
          ['himeko', 'Fire', 96, 0],
          ['sunday', 'Imaginary', 134, 0],
        ],
        240,
      ),
    );
    const notes = notesOf(r);
    expect(notes.has('hertaP06')).toBe(true);
    expect(notes.has('hertaEmpowered')).toBe(true);
    expect(notes.has('hertaUlt')).toBe(true);

    expect(hitsOf(r, 'herta.skill')).toHaveLength(9);
    expect(hitsOf(r, 'herta.enhanced')).toHaveLength(4);
    expect(hitsOf(r, 'herta.ult')).toHaveLength(1);

    const normal = hitsOf(r, 'herta.skill').find((h) => h.kind === 'direct');
    const enhanced = hitsOf(r, 'herta.enhanced');
    const mainRound = enhanced[0];
    const finalAoe = enhanced[3];
    expect(normal).toBeDefined();
    expect(dmgBonus(mainRound)).toBeGreaterThan(dmgBonus(normal!) + 5);
    expect(finalAoe.total).toBeCloseTo(mainRound.total / 2, 4);
    expect(dmgBonus(finalAoe)).toBeCloseTo(dmgBonus(mainRound), 10);
  });

  it('三目标：强化战技主目标增伤高于相邻，终结技全覆盖', () => {
    const monster: MonsterConfig = {
      level: 85,
      hp: 1e9,
      resistance: {},
      weaknesses: ['Ice', 'Fire'],
      maxToughness: 300,
      speed: 100,
      enemyClass: 'elite',
    };
    const r = simulateBattle({
      members: [
        { id: 'herta', panel: panel('Ice', 99), eidolonLevel: 0 },
        { id: 'himeko', panel: panel('Fire', 96), eidolonLevel: 0 },
        { id: 'sunday', panel: panel('Imaginary', 134), eidolonLevel: 0 },
      ] as CombatMember[],
      monster,
      maxTime: 240,
    });
    const ult = hitsOf(r, 'herta.ult');
    expect(ult).toHaveLength(3);
    expect(new Set(ult.map((h) => h.target)).size).toBe(3);

    const enhanced = hitsOf(r, 'herta.enhanced');
    const main = enhanced.find((h) => h.target === 'monster2')!;
    const side = enhanced.find((h) => h.target === 'monster1')!;
    expect(dmgBonus(main)).toBeGreaterThan(dmgBonus(side));
  });
});
