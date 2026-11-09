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

function config(eidolonLevel: number, maxTime: number, techniques = true): BattleConfig {
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
  const members: [CharId, string, number, number][] = [
    ['himekoNova', 'Fire', 98, eidolonLevel],
    ['himeko', 'Fire', 96, 0],
    ['sunday', 'Imaginary', 134, 0],
  ];
  return {
    members: members.map(([id, element, speed, eidolon]) => ({
      id,
      panel: panel(element, speed),
      eidolonLevel: eidolon,
    })) as CombatMember[],
    monsters: [monster],
    maxTime,
    techniques,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const notesOf = (r: ReturnType<typeof simulateBattle>) =>
  new Set(r.events.flatMap((e) => e.note ?? []));

describe('姬子•启行 1510', () => {
  it('初始能量为上限 50%', () => {
    const r = simulateBattle(config(0, 1, false));
    expect(r.finalState.energy.himekoNova).toBe(75);
  });

  it('E0 单体全链：秘技免费战技、助战、同行协议、终结技三段', () => {
    const r = simulateBattle(config(0, 240));
    const notes = notesOf(r);
    expect(notes.has('hnAssist')).toBe(true);
    expect(notes.has('hnFreeAssist')).toBe(true);
    expect(notes.has('hnFlag')).toBe(true);
    expect(notes.has('hnUlt')).toBe(true);
    expect(notes.has('hnUltE2')).toBe(false);

    expect(hitsOf(r, 'himekoNova.assist').length).toBeGreaterThanOrEqual(20);
    expect(hitsOf(r, 'himekoNova.ult.beam')).toHaveLength(6);
    expect(hitsOf(r, 'himekoNova.ult.pulse')).toHaveLength(3);
    expect(hitsOf(r, 'himekoNova.ult.finish')).toHaveLength(3);
  });

  it('E2：助战上限 2、终结技/助战伤害 ×1.3', () => {
    const r = simulateBattle(config(2, 240));
    const notes = notesOf(r);
    expect(notes.has('hnUltE2')).toBe(true);
    expect(hitsOf(r, 'himekoNova.assist').length).toBeGreaterThanOrEqual(60);
    expect(hitsOf(r, 'himekoNova.ult.beam')).toHaveLength(12);
    expect(hitsOf(r, 'himekoNova.ult.pulse')).toHaveLength(6);
    expect(hitsOf(r, 'himekoNova.ult.finish')).toHaveLength(6);
  });

  it('E6：源能上限 6，脉冲追加全体段', () => {
    const r = simulateBattle(config(6, 240));
    expect(hitsOf(r, 'himekoNova.ult.beam')).toHaveLength(12);
    expect(hitsOf(r, 'himekoNova.ult.pulse')).toHaveLength(14);
    expect(hitsOf(r, 'himekoNova.ult.finish')).toHaveLength(6);
  });
});
