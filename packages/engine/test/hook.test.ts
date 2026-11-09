import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(): MemberPanel {
  return {
    element: 'Fire',
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

function monster(attack = 0): MonsterConfig {
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
  opts: { techniques?: boolean; initialSp?: number; slots?: number; maxTime?: number } = {},
): BattleConfig {
  return {
    members: [{ id: 'hook', panel: panel(), eidolonLevel } as CombatMember],
    monsters: Array.from({ length: opts.slots ?? 1 }, () => monster(0)),
    maxTime: opts.maxTime ?? 300,
    initialSp: opts.initialSp ?? 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

const base = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'base')!.value;

describe('虎克 1109', () => {
  it('E0：战技 240% + 灼烧 DoT；下一回合天赋追加 100% 并回能', () => {
    const r = simulateBattle(config(0));
    const first = r.events.find((e) => e.skillCode === 'hook.skill' && e.time === 100)!;
    expect(first.note).toContain('hookSkill');
    expect(first.note).toContain('hookBurn');
    expect(first.spAfter).toBe(2);
    expect(first.energyAfter).toBe(90);
    expect(first.hitSeqs!.length).toBe(1);
    expect(base(r.hits[first.hitSeqs![0]])).toBeCloseTo(7200);
    expect(r.hits[first.hitSeqs![0]].total).toBeCloseTo(5400);

    const dot = r.hits.find((h) => h.kind === 'dot' && h.time === 100)!;
    expect(base(dot)).toBeCloseTo(1950);
    expect(dot.total).toBeCloseTo(928.5714285714286);

    const second = r.events.find((e) => e.skillCode === 'hook.skill' && e.time === 200)!;
    expect(second.note).toContain('hookTalent');
    expect(second.note).toContain('hookP06');
    expect(second.hitSeqs!.length).toBe(2);
    expect(base(r.hits[second.hitSeqs![1]])).toBeCloseTo(3000);
    expect(r.hits[second.hitSeqs![1]].total).toBeCloseTo(2250);
    expect(second.energyAfter).toBe(120);
  });

  it('普攻：140% + 对已灼烧目标追加 100%（t380）', () => {
    const r = simulateBattle(config(0, { slots: 3, maxTime: 400 }));
    const basic = r.events.find((e) => e.skillCode === 'hook.basic')!;
    expect(basic.time).toBe(380);
    expect(basic.spAfter).toBe(1);
    expect(basic.note).toContain('hookTalent');
    expect(basic.hitSeqs!.length).toBe(2);
    expect(base(r.hits[basic.hitSeqs![0]])).toBeCloseTo(3000);
    expect(r.hits[basic.hitSeqs![0]].total).toBeCloseTo(2250);
    expect(base(r.hits[basic.hitSeqs![1]])).toBeCloseTo(3000);
  });

  it('终结技：400% 单体、下一次战技强化；point08 回能并行动提前', () => {
    const r = simulateBattle(config(0, { slots: 3 }));
    const ult = r.events.find((e) => e.skillCode === 'hook.ult')!;
    expect(ult.note).toContain('hookUlt');
    expect(ult.note).toContain('hookP08');
    expect(ult.energyAfter).toBe(15);
    expect(base(r.hits[ult.hitSeqs![0]])).toBeCloseTo(12000);
    expect(r.hits[ult.hitSeqs![0]].total).toBeCloseTo(9000);

    const enhanced = r.events.find((e) => e.skillCode === 'hook.enhanced')!;
    expect(enhanced.time).toBe(280);
    expect(enhanced.note).toContain('hookEnhanced');
    expect(enhanced.hitSeqs!.length).toBe(4);
    expect(base(r.hits[enhanced.hitSeqs![0]])).toBeCloseTo(8400);
    expect(base(r.hits[enhanced.hitSeqs![1]])).toBeCloseTo(2400);
    expect(base(r.hits[enhanced.hitSeqs![2]])).toBeCloseTo(2400);
  });

  it('E1：强化战技主/相邻伤害 +20%（天赋段不吃）', () => {
    const e0 = simulateBattle(config(0, { slots: 3 }));
    const e1 = simulateBattle(config(1, { slots: 3 }));
    const s0 = e0.events.find((e) => e.skillCode === 'hook.enhanced')!;
    const s1 = e1.events.find((e) => e.skillCode === 'hook.enhanced')!;
    expect(e1.hits[s1.hitSeqs![0]].total).toBeCloseTo(7560);
    expect(e1.hits[s1.hitSeqs![1]].total).toBeCloseTo(2160);
    expect(e0.hits[s0.hitSeqs![0]].total).toBeCloseTo(6300);
    expect(e0.hits[s0.hitSeqs![1]].total).toBeCloseTo(1800);
    // 天赋段两档一致
    expect(e1.hits[s1.hitSeqs![3]].total).toBeCloseTo(e0.hits[s0.hitSeqs![3]].total);
  });

  it('E2：战技灼烧持续 +1 回合（t480 仍能触发天赋）', () => {
    const e0 = simulateBattle(config(0, { maxTime: 500 }));
    const e2 = simulateBattle(config(2, { maxTime: 500 }));
    const a0 = e0.events.find((e) => e.skillCode === 'hook.skill' && e.time === 480)!;
    const a2 = e2.events.find((e) => e.skillCode === 'hook.skill' && e.time === 480)!;
    expect(a0.note).not.toContain('hookTalent');
    expect(a2.note).toContain('hookTalent');
  });

  it('E4：天赋触发时给相邻挂同款灼烧', () => {
    const e0 = simulateBattle(config(0, { slots: 3 }));
    const e4 = simulateBattle(config(4, { slots: 3 }));
    const s0 = e0.events.find((e) => e.skillCode === 'hook.skill' && e.time === 200)!;
    const s4 = e4.events.find((e) => e.skillCode === 'hook.skill' && e.time === 200)!;
    expect(s0.note).not.toContain('hookE4');
    expect(s4.note?.filter((n) => n === 'hookE4')).toHaveLength(2);
    const dots0 = e0.hits.filter((h) => h.kind === 'dot' && h.time === 200);
    const dots4 = e4.hits.filter((h) => h.kind === 'dot' && h.time === 200);
    expect(dots0.map((h) => h.target)).toEqual(['monster2']);
    expect(dots4.map((h) => h.target).sort()).toEqual(['monster1', 'monster2', 'monster3']);

    const enhanced = e4.events.find((e) => e.skillCode === 'hook.enhanced')!;
    expect(enhanced.hitSeqs!.length).toBe(6);
    expect(enhanced.note?.filter((n) => n === 'hookTalent')).toHaveLength(1);
    expect(enhanced.note?.filter((n) => n === 'hookP06')).toHaveLength(3);
  });

  it('E6：对灼烧目标直伤/天赋/灼烧 DoT 全部 +20%', () => {
    const e0 = simulateBattle(config(0, { slots: 3 }));
    const e6 = simulateBattle(config(6, { slots: 3 }));
    const s0 = e0.events.find((e) => e.skillCode === 'hook.skill' && e.time === 200)!;
    const s6 = e6.events.find((e) => e.skillCode === 'hook.skill' && e.time === 200)!;
    expect(e0.hits[s0.hitSeqs![0]].total).toBeCloseTo(5400);
    expect(e6.hits[s6.hitSeqs![0]].total).toBeCloseTo(6480);
    expect(e6.hits[s6.hitSeqs![1]].total).toBeCloseTo(2700);
    const d0 = e0.hits.find((h) => h.kind === 'dot' && h.target === 'monster2')!;
    const d6 = e6.hits.find((h) => h.kind === 'dot' && h.target === 'monster2')!;
    expect(d0.total).toBeCloseTo(928.5714285714286);
    expect(d6.total).toBeCloseTo(1225.7142857142856);
  });

  it('秘技：随机单体 50% 攻击 + 每个敌方 3 回合 50% 灼烧（不触发天赋）', () => {
    const r = simulateBattle(config(0, { slots: 3, techniques: true, maxTime: 200 }));
    const tech = r.events.find((e) => e.skillCode === 'hook.tech')!;
    expect(tech.time).toBe(0);
    expect(tech.note).toContain('hookTech');
    expect(tech.hitSeqs!.length).toBe(1);
    expect(base(r.hits[tech.hitSeqs![0]])).toBeCloseTo(1500);
    expect(r.hits[tech.hitSeqs![0]].total).toBeCloseTo(1125);
    expect(tech.note).not.toContain('hookTalent');
    const firstSkill = r.events.find((e) => e.skillCode === 'hook.skill' && e.time === 100)!;
    expect(firstSkill.note).toContain('hookTalent');
    expect(firstSkill.hitSeqs!.length).toBe(2);
  });

  it('point07：控制类负面抵抗 +35%（冻结被抵抗）', () => {
    const p = panel();
    p.effectRes = 0.6;
    const r = simulateBattle({
      members: [{ id: 'hook', panel: p, eidolonLevel: 0 } as CombatMember],
      monsters: [monster(1)],
      maxTime: 300,
      initialSp: 3,
      seed: 1,
      techniques: false,
    } as BattleConfig);
    const freeze = r.events.find((e) => e.skillCode === 'monster.100401104')!;
    expect(freeze.note).toContain('freezeResist');
    expect(freeze.note).not.toContain('freeze');
  });
});
