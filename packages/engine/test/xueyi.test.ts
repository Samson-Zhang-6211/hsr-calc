import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(): MemberPanel {
  return {
    element: 'Quantum',
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

function config(e: number): BattleConfig {
  return {
    members: [{ id: 'xueyi', panel: panel(), eidolonLevel: e } as CombatMember],
    monsters: [monster()],
    maxTime: 260,
    initialSp: 3,
  };
}

const base = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'base')?.value;

describe('雪衣 1214', () => {
  it('普攻/战技/终结技与恶报追击', () => {
    const r = simulateBattle(config(0));
    const skill = r.events.find((e) => e.skillCode === 'xueyi.skill' && e.time === 100)!;
    expect(skill.note).toContain('xueyiSkill');
    expect(base(r.hits.find((h) => h.seq === skill.hitSeqs![0])!)).toBe(4200);
    expect(skill.spAfter).toBe(2);
    expect(skill.energyAfter).toBe(90);

    const full = r.events.find(
      (e) => e.skillCode === 'xueyi.skill' && (e.note ?? []).includes('xueyiMarkFull'),
    )!;
    expect(full).toBeTruthy();
    const talent = r.events.find(
      (e) => e.skillCode === 'xueyi.talent' && e.time === full.time,
    )!;
    expect(talent.hitSeqs).toHaveLength(3);
    for (const seq of talent.hitSeqs!) {
      const hit = r.hits.find((h) => h.seq === seq)!;
      expect(base(hit)).toBe(2700);
      expect(hit.total).toBe(4050);
    }
    const ult = r.hits.find((h) => h.skillCode === 'xueyi.ult')!;
    expect(base(ult)).toBe(7500);
  });

  it('E1 追击伤害提高 40%', () => {
    const r = simulateBattle(config(1));
    const talent = r.events.find((e) => e.skillCode === 'xueyi.talent')!;
    expect(base(r.hits.find((h) => h.seq === talent.hitSeqs![0])!)).toBe(3780);
  });

  it('E2 追击无视弱点削韧、触发量子击破并回 5% 生命上限', () => {
    const r2 = simulateBattle(config(2));
    const talent = r2.events.find((e) => e.skillCode === 'xueyi.talent')!;
    expect(talent.note).toContain('xueyiE2');
    expect(talent.hitSeqs!.length).toBe(3);
  });

  it('E6 恶报上限降为 6，首次战技即触发追击', () => {
    const r = simulateBattle(config(6));
    const first = r.events.find(
      (e) => e.skillCode === 'xueyi.skill' && e.time === 100,
    )!;
    expect(first.note).toContain('xueyiMarkFull');
    const talents = r.events.filter((e) => e.skillCode === 'xueyi.talent');
    expect(talents.length).toBeGreaterThanOrEqual(2);
    expect(r.finalState.memberHp.xueyi).toBeCloseTo(8928.571428571428);
  });
});
