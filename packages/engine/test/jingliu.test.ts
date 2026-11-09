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
    element: 'Ice',
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

function monster(): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 3000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack: 800,
  } as MonsterConfig;
}

function config(
  e: number,
  opts: { count?: number; maxTime?: number; techniques?: boolean; mon?: MonsterConfig } = {},
): BattleConfig {
  return {
    members: [{ id: 'jingliu', panel: panel(), eidolonLevel: e } as CombatMember],
    monsters: Array.from({ length: opts.count ?? 1 }, () => ({ ...(opts.mon ?? monster()) })),
    maxTime: opts.maxTime ?? 400,
    techniques: opts.techniques ?? false,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const hitAt = (r: ReturnType<typeof simulateBattle>, seq: number) => {
  const h = r.hits.find((x) => x.seq === seq);
  if (!h) throw new Error(`missing hit ${seq}`);
  return h;
};

describe('镜流 1212', () => {
  it('初始能量 70；秘技回 15 能并叠 1 层朔望', () => {
    const base = simulateBattle(config(0, { maxTime: 1 }));
    expect(base.finalState.energy.jingliu).toBe(70);

    const r = simulateBattle(config(0, { count: 3, maxTime: 1, techniques: true }));
    expect(r.finalState.energy.jingliu).toBe(85);
    const tech = r.events.find((e) => e.skillCode === 'jingliu.tech');
    expect(tech?.note).toContain('jingliuTech');
    expect(tech?.energyAfter).toBe(85);
    expect(tech?.spAfter).toBe(3);
    expect(hitsOf(r, 'jingliu.tech')).toHaveLength(0);

    const after = simulateBattle(config(0, { maxTime: 60, techniques: true }));
    const skill = after.events.find((e) => e.skillCode === 'jingliu.skill');
    expect(skill?.note).toContain('jingliuTranscend');
    expect(skill?.energyAfter).toBe(130);
  });

  it('两次普通战技进入转魄，SP 3→1、能量 140', () => {
    const r = simulateBattle(config(0, { maxTime: 110 }));
    const skills = r.events.filter((e) => e.skillCode === 'jingliu.skill');
    expect(skills).toHaveLength(2);
    expect(skills[0].note).not.toContain('jingliuTranscend');
    expect(skills[1].note).toContain('jingliuTranscend');
    expect(skills[1].spAfter).toBe(1);
    expect(skills[1].energyAfter).toBe(140);
    expect(factor(hitsOf(r, 'jingliu.skill')[0], 'base')).toBeCloseTo(15000);
  });

  it('强化战技消耗朔望，归零退出转魄后可再次入转魄', () => {
    const r = simulateBattle(config(0, { maxTime: 360 }));
    const enhanced = r.events.filter((e) => e.skillCode === 'jingliu.enhanced');
    expect(enhanced.length).toBeGreaterThanOrEqual(4);
    expect(enhanced[0].note).toContain('jingliuEnhanced');
    expect(enhanced.some((e) => (e.note ?? []).includes('jingliuExit'))).toBe(true);
    const reenter = r.events.filter((e) => e.skillCode === 'jingliu.skill').at(-1)!;
    expect(reenter.note).toContain('jingliuTranscend');
    const first = hitAt(r, enhanced[0].hitSeqs![0]);
    expect(factor(first, 'base')).toBeCloseTo(15000);
  });

  it('E6 强化战技 4 段（E1 追加 0.8×上限）', () => {
    const r = simulateBattle(config(6, { count: 3, maxTime: 160 }));
    const enhanced = r.events.find((e) => e.skillCode === 'jingliu.enhanced')!;
    expect(enhanced.hitSeqs).toHaveLength(4);
    const bases = enhanced.hitSeqs!.map((s) => factor(hitAt(r, s), 'base'));
    expect(bases).toEqual([15000, 7500, 7500, 8000]);
  });

  it('E6 终结技 4 段，E1 追加为 0.8×上限且吃终结技增伤', () => {
    const r = simulateBattle(config(6, { count: 3, maxTime: 110 }));
    const ult = r.events.find((e) => e.skillCode === 'jingliu.ult')!;
    expect(ult.hitSeqs).toHaveLength(4);
    const seqs = ult.hitSeqs!;
    expect(factor(hitAt(r, seqs[0]), 'base')).toBeCloseTo(18000);
    expect(factor(hitAt(r, seqs[0]), 'damageBonus')).toBeCloseTo(1.2);
    expect(factor(hitAt(r, seqs[1]), 'base')).toBeCloseTo(9000);
    expect(factor(hitAt(r, seqs[2]), 'base')).toBeCloseTo(9000);
    expect(factor(hitAt(r, seqs[3]), 'base')).toBeCloseTo(8000);
    expect(factor(hitAt(r, seqs[3]), 'damageBonus')).toBeCloseTo(1.2);
  });

  it('秘技冻结成功：怪物回合跳过并结算 0.8×上限冰伤', () => {
    const mon = { ...monster(), debuffResist: {} } as MonsterConfig;
    const r = simulateBattle(config(0, { maxTime: 200, techniques: true, mon }));
    const tech = r.events.find((e) => e.skillCode === 'jingliu.tech');
    expect(tech?.note).toContain('enemyBreakFreeze');
    const frozen = r.events.find((e) => (e.note ?? []).includes('jingliuFreezeDmg'));
    expect(frozen?.note).toContain('enemyFreezeSkip');
    expect(frozen?.skillCode).toBeUndefined();
    const h = hitsOf(r, 'jingliu.technique')[0];
    expect(factor(h, 'base')).toBeCloseTo(8000);
    expect(h.total).toBeCloseTo(8571.42857142857);
  });

  it('可可利亚冻结免疫：秘技只留下控制抵抗', () => {
    const r = simulateBattle(config(0, { count: 3, maxTime: 1, techniques: true }));
    const tech = r.events.find((e) => e.skillCode === 'jingliu.tech')!;
    expect(tech.note).not.toContain('enemyBreakFreeze');
    expect(tech.note?.filter((n) => n === 'enemyBreakControlResist')).toHaveLength(3);
    expect(hitsOf(r, 'jingliu.technique')).toHaveLength(0);
  });
});
