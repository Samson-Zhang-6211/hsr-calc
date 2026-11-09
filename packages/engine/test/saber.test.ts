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
    element: 'Wind',
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
  return Array.from({ length: count }, () => ({
    level: 90,
    hp: 5e8,
    maxToughness: 1e9,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: 'monster1',
    effectRes: 0,
    attack: 0,
  }) as MonsterConfig);
}

function config(
  e: number,
  opts: { count?: number; maxTime?: number; techniques?: boolean } = {},
): BattleConfig {
  return {
    members: [{ id: 'saber', panel: panel(), eidolonLevel: e } as CombatMember],
    monsters: monster(opts.count ?? 1),
    maxTime: opts.maxTime ?? 310,
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

describe('Saber 1014', () => {
  it('E0 行迹6：消耗共鸣强化战技、返还战技点并追加一次战技', () => {
    const r = simulateBattle(config(0, { maxTime: 260 }));
    const skills = r.events.filter((e) => e.skillCode === 'saber.skill' && e.time === 250);
    expect(skills).toHaveLength(2);
    expect(skills[0].note).toContain('saberP06');
    expect(skills[0].spAfter).toBe(1);
    expect(skills[0].energyAfter).toBe(360);
    expect(factor(hitAt(r, skills[0].hitSeqs![0]), 'base')).toBeCloseTo(10800);
    expect(skills[1].note).not.toContain('saberP06');
    expect(factor(hitAt(r, skills[1].hitSeqs![0]), 'base')).toBeCloseTo(4500);
    const ult = r.events.find((e) => e.skillCode === 'saber.ult' && e.time === 250)!;
    expect(ult.note).toContain('saberTalent');
    expect(factor(hitAt(r, ult.hitSeqs![0]), 'base')).toBeCloseTo(8400);
    expect(factor(hitAt(r, ult.hitSeqs![1]), 'base')).toBeCloseTo(3300);
  });

  it('E0 终结技后强化普攻：主目标 210%、单体追加 308%', () => {
    const r = simulateBattle(config(0));
    const enhanced = r.events.find((e) => e.skillCode === 'saber.enhanced')!;
    expect(enhanced.note).toContain('saberEnhanced');
    expect(enhanced.time).toBe(300);
    expect(enhanced.spAfter).toBe(1);
    expect(factor(hitAt(r, enhanced.hitSeqs![0]), 'base')).toBeCloseTo(6300);
    expect(factor(hitAt(r, enhanced.hitSeqs![1]), 'base')).toBeCloseTo(9240);
    expect(enhanced.energyAfter).toBe(101);
  });

  it('E0 三目标时强化普攻只打三目标，不再追加单体倍率', () => {
    const r = simulateBattle(config(0, { count: 3 }));
    const enhanced = r.events.find((e) => e.skillCode === 'saber.enhanced')!;
    expect(enhanced.hitSeqs).toHaveLength(3);
    for (const seq of enhanced.hitSeqs!) {
      expect(factor(hitAt(r, seq), 'base')).toBeCloseTo(6300);
    }
  });

  it('E2 共鸣层数提高强化倍率，并无视防御', () => {
    const r = simulateBattle(config(2));
    const skill = r.events.find((e) => e.skillCode === 'saber.skill' && e.time === 250)!;
    expect(factor(hitAt(r, skill.hitSeqs![0]), 'base')).toBeCloseTo(17730);
    const enhanced = r.events.find((e) => e.skillCode === 'saber.enhanced')!;
    expect(factor(hitAt(r, enhanced.hitSeqs![0]), 'base')).toBeCloseTo(10710);
    expect(factor(hitAt(r, enhanced.hitSeqs![1]), 'base')).toBeCloseTo(15708);
    expect(factor(hitAt(r, enhanced.hitSeqs![0]), 'defense')).toBeCloseTo(0.5167958656330749);
  });

  it('E4 基础抗穿 8%，首次终结技后叠至 12%', () => {
    const r = simulateBattle(config(4));
    const enhanced = r.events.find((e) => e.skillCode === 'saber.enhanced')!;
    const e4 = enhanced.buffs?.saber?.find((b) => b.labelKey === 'saberE4');
    expect(e4?.value).toBeCloseTo(0.12);
  });

  it('E6 首次终结技返还 300 能量，强化倍率继承 E2', () => {
    const r = simulateBattle(config(6));
    const ults = r.events.filter((e) => e.skillCode === 'saber.ult' && e.time === 250);
    expect(ults.length).toBeGreaterThanOrEqual(2);
    expect(ults[0].energyAfter).toBe(360);
    expect(factor(hitAt(r, ults[0].hitSeqs![0]), 'base')).toBeCloseTo(8400);
    const enhanced = r.events.find((e) => e.skillCode === 'saber.enhanced')!;
    expect(factor(hitAt(r, enhanced.hitSeqs![0]), 'base')).toBeCloseTo(12033);
  });

  it('秘技提高攻击力，战技首段 6075', () => {
    const r = simulateBattle(config(0, { techniques: true, maxTime: 60 }));
    const tech = r.events.find((e) => e.skillCode === 'saber.tech')!;
    expect(tech.note).toContain('saberTech');
    const skill = r.events.find((e) => e.skillCode === 'saber.skill')!;
    expect(factor(hitAt(r, skill.hitSeqs![0]), 'base')).toBeCloseTo(6075);
  });
});
