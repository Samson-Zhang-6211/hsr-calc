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
    members: [{ id: 'yunli', panel: panel(), eidolonLevel: e } as CombatMember],
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

describe('云璃 1221', () => {
  it('E0：初始 120 能量开大，格挡受击触发【勘破·灭】', () => {
    const r = simulateBattle(config(0));
    const ult = r.events.find((e) => e.skillCode === 'yunli.ult')!;
    expect(ult.time).toBe(0);
    expect(ult.note).toContain('yunliUlt');
    expect(ult.energyAfter).toBe(5);

    const annihilation = r.events.find(
      (e) => e.skillCode === 'yunli.ultAnnihilation' && e.time === 100,
    )!;
    expect(annihilation.note).toContain('yunliAnnihilation');
    expect(annihilation.hitSeqs!.length).toBe(7);
    expect(base(r.hits[annihilation.hitSeqs![0]])).toBeCloseTo(8580);
    expect(base(r.hits[annihilation.hitSeqs![1]])).toBeCloseTo(2808);
  });

  it('E1：斩/灭伤害 +20%，灭额外 +3 段', () => {
    const r = simulateBattle(config(1));
    const annihilation = r.events.find(
      (e) => e.skillCode === 'yunli.ultAnnihilation' && e.time === 100,
    )!;
    expect(annihilation.hitSeqs!.length).toBe(10);
    expect(base(r.hits[annihilation.hitSeqs![0]])).toBeCloseTo(10296);
    expect(base(r.hits[annihilation.hitSeqs![1]])).toBeCloseTo(3369.6);
  });

  it('E2：反击伤害无视 20% 防御', () => {
    const r = simulateBattle(config(2));
    const annihilation = r.events.find(
      (e) => e.skillCode === 'yunli.ultAnnihilation' && e.time === 100,
    )!;
    expect(factor(r.hits[annihilation.hitSeqs![0]], 'defense')).toBeCloseTo(0.5319148936170213);
  });

  it('E4：施放灭后获得效果抵抗', () => {
    const r = simulateBattle(config(4));
    const annihilation = r.events.find(
      (e) => e.skillCode === 'yunli.ultAnnihilation' && e.time === 100,
    )!;
    expect(annihilation.note).toContain('yunliE4');
  });

  it('E6：斩/灭火？物理穿透 +20% 与暴率 +15%', () => {
    const r = simulateBattle(config(6));
    const annihilation = r.events.find(
      (e) => e.skillCode === 'yunli.ultAnnihilation' && e.time === 100,
    )!;
    expect(factor(r.hits[annihilation.hitSeqs![0]], 'resist')).toBeCloseTo(1.2);
  });

  it('天赋：未格挡时受击反击 1.2×攻击', () => {
    const r = simulateBattle(config(0));
    const talent = r.events.find((e) => e.skillCode === 'yunli.talent' && e.time === 200)!;
    expect(talent.note).toContain('yunliTalent');
    expect(base(r.hits[talent.hitSeqs![0]])).toBeCloseTo(4680);
  });

  it('秘技：进战立即施放【勘破·灭】', () => {
    const r = simulateBattle(config(0, true));
    const tech = r.events.find((e) => e.skillCode === 'yunli.tech')!;
    expect(tech.note).toContain('yunliTech');
    expect(r.events.some((e) => e.skillCode === 'yunli.ultAnnihilation' && e.time === 0)).toBe(true);
  });
});
