import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(): MemberPanel {
  return {
    element: 'Thunder',
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

function monster(attack = 800): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 1000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack,
  } as MonsterConfig;
}

function config(
  eidolonLevel: number,
  opts: { attack?: number; techniques?: boolean; initialSp?: number; slots?: number } = {},
): BattleConfig {
  return {
    members: [{ id: 'arlan', panel: panel(), eidolonLevel } as CombatMember],
    monsters: Array.from({ length: opts.slots ?? 1 }, (_, i) => monster(i === 0 ? opts.attack ?? 800 : 0)),
    maxTime: 300,
    initialSp: opts.initialSp ?? 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

const base = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'base')!.value;

describe('阿兰 1008', () => {
  it('E0：战技耗血高倍率 + 天赋按已损生命增伤；终结技主/相邻倍率', () => {
    const r = simulateBattle(config(0));
    const skill = r.events.find((e) => e.skillCode === 'arlan.skill' && e.time === 100)!;
    expect(skill.note).toContain('arlanSkill');
    expect(skill.spAfter).toBe(2);
    expect(skill.energyAfter).toBe(85);
    expect(base(r.hits[skill.hitSeqs![0]])).toBeCloseTo(7200);
    // 战技先耗 15% 上限 → 已损 15% → 天赋 +10.8%，防御/抗性区 0.75、暴击 1.75
    expect(r.hits[skill.hitSeqs![0]].total).toBeCloseTo(5983.2);

    const ult = r.events.find((e) => e.skillCode === 'arlan.ult')!;
    expect(ult.note).toContain('arlanUlt');
    expect(ult.energyAfter).toBe(5);
    expect(ult.hitSeqs!.length).toBe(1);
    expect(base(r.hits[ult.hitSeqs![0]])).toBeCloseTo(9600);
  });

  it('普攻：SP 不足时单体 140% 攻击并回能 20', () => {
    const r = simulateBattle(config(0, { initialSp: 0 }));
    const basic = r.events.find((e) => e.skillCode === 'arlan.basic' && e.time === 100)!;
    expect(basic.spAfter).toBe(1);
    expect(basic.energyAfter).toBe(75);
    expect(basic.hitSeqs!.length).toBe(1);
    expect(base(r.hits[basic.hitSeqs![0]])).toBeCloseTo(3000);
  });

  it('E1：生命值 ≤50% 时战技伤害 +10%', () => {
    const e0 = simulateBattle(config(0));
    const e1 = simulateBattle(config(1));
    const first0 = e0.events.find((e) => e.skillCode === 'arlan.skill' && e.time === 100)!;
    const first1 = e1.events.find((e) => e.skillCode === 'arlan.skill' && e.time === 100)!;
    expect(e1.hits[first1.hitSeqs![0]].total).toBeCloseTo(e0.hits[first0.hitSeqs![0]].total);

    const s0 = e0.events.find((e) => e.skillCode === 'arlan.skill' && e.time === 300)!;
    const s1 = e1.events.find((e) => e.skillCode === 'arlan.skill' && e.time === 300)!;
    expect(e1.hits[s1.hitSeqs![0]].total).toBeGreaterThan(e0.hits[s0.hitSeqs![0]].total);
  });

  it('E2：战技解除自身冻结（种子 1 下可可利亚 100401104 冻结）', () => {
    const e0 = simulateBattle(config(0, { attack: 1 }));
    const e2 = simulateBattle(config(2, { attack: 1 }));
    expect(e0.events.some((e) => e.skillCode === 'monster.100401104')).toBe(true);
    expect(e0.events.some((e) => (e.note ?? []).includes('arlanE2'))).toBe(false);
    const cleanse = e2.events.find((e) => (e.note ?? []).includes('arlanE2'))!;
    expect(cleanse.time).toBe(200);
    expect(cleanse.skillCode).toBe('arlan.skill');
  });

  it('E4：致命一击不倒下并回复 25% 上限（触发一次即失效）', () => {
    const e0 = simulateBattle(config(0, { attack: 100000 }));
    const e4 = simulateBattle(config(4, { attack: 100000 }));
    const hit0 = e0.events.find((e) => e.action === 'monster')!;
    const hit4 = e4.events.find((e) => e.action === 'monster')!;
    expect(hit0.enemyHits?.[0].dead).toBe(true);
    expect(hit4.enemyHits?.[0].dead).toBe(false);
    expect(hit4.note).toContain('arlanE4');
    expect(hit4.enemyHits?.[0].hpLoss).toBeCloseTo(8500);
  });

  it('E6：低血终结技 +20% 且相邻目标伤害等同主目标', () => {
    const e0 = simulateBattle(config(0, { attack: 5000, slots: 3 }));
    const e6 = simulateBattle(config(6, { attack: 5000, slots: 3 }));
    const ult0 = e0.events.find((e) => e.skillCode === 'arlan.ult')!;
    const ult6 = e6.events.find((e) => e.skillCode === 'arlan.ult')!;
    expect(ult0.hitSeqs!.length).toBe(3);
    expect(ult0.hitSeqs!.map((s) => base(e0.hits[s]))).toEqual([9600, 4800, 4800]);
    expect(ult6.hitSeqs!.map((s) => base(e6.hits[s]))).toEqual([9600, 9600, 9600]);
    expect(e6.hits[ult6.hitSeqs![1]].total).toBeCloseTo(e6.hits[ult6.hitSeqs![0]].total);
  });

  it('秘技：进战对敌全体造成 80% 攻击雷伤', () => {
    const r = simulateBattle(config(0, { techniques: true }));
    const tech = r.events.find((e) => e.skillCode === 'arlan.tech')!;
    expect(tech.note).toContain('arlanTech');
    expect(tech.hitSeqs!.length).toBe(1);
    expect(base(r.hits[tech.hitSeqs![0]])).toBeCloseTo(2400);
    expect(r.hits[tech.hitSeqs![0]].total).toBeCloseTo(1800);
  });
});
