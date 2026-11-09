import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(overrides: Partial<MemberPanel> = {}): MemberPanel {
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
    ...overrides,
  } as MemberPanel;
}

function monster(opts: { attack?: number; speed?: number } = {}): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 1000,
    speed: opts.speed ?? 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Fire', 'Ice'],
    enemyClass: 'elite',
    monsterId: '1004011',
    attack: opts.attack ?? 0,
  } as MonsterConfig;
}

function config(
  eidolonLevel: number,
  opts: { techniques?: boolean; slots?: number; attack?: number; monsterSpeed?: number; hp?: number } = {},
): BattleConfig {
  return {
    members: [
      {
        id: 'phainon',
        panel: panel(opts.hp ? { hp: opts.hp } : {}),
        eidolonLevel,
      } as CombatMember,
    ],
    monsters: Array.from({ length: opts.slots ?? 1 }, (_, i) =>
      monster({ attack: i === 0 ? opts.attack ?? 0 : 0, speed: opts.monsterSpeed }),
    ),
    maxTime: 2700,
    rounds: 40,
    initialSp: 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

function hitTotal(r: ReturnType<typeof simulateBattle>, event: ReturnType<typeof simulateBattle>['events'][number] | undefined): number {
  return event?.hitSeqs?.reduce((acc, seq) => acc + r.hits[seq].total, 0) ?? 0;
}

describe('phainon 1408', () => {
  it('普攻回 1 SP，战技耗 1 SP 并叠 2 火种', () => {
    const r = simulateBattle(config(0));
    const basic = r.events.find((e) => e.skillCode === 'phainon.basic');
    const skill = r.events.find((e) => e.skillCode === 'phainon.skill');
    expect(basic?.note).toContain('phainonBasic');
    expect(skill?.spAfter).toBe(2);
    expect(skill?.energyAfter).toBe(3);
    expect(skill?.note).toContain('phainonSeed');
  });

  it('12 火种变身并完整打完 8 个额外回合与最后一击', () => {
    const r = simulateBattle(config(0));
    const ult = r.events.find((e) => e.skillCode === 'phainon.ult');
    const final = r.events.find((e) => e.skillCode === 'phainon.final');
    expect(ult?.note).toEqual(expect.arrayContaining(['phainonForm', 'phainonUlt']));
    expect(ult?.energyAfter).toBe(1);
    expect(final?.note).toEqual(
      expect.arrayContaining(['phainonFinal', 'phainonP06End', 'phainonP08', 'phainonEnd']),
    );
    const actions = r.events.filter((e) => e.unitId === 'phainonExtra' && e.skillCode !== 'phainon.counter');
    expect(actions.map((e) => e.skillCode)).toEqual([
      'phainon.skill811',
      'phainon.skill808',
      'phainon.skill809',
      'phainon.skill809',
      'phainon.skill811',
      'phainon.skill808',
      'phainon.skill809',
      'phainon.final',
    ]);
    expect(actions[0].hitSeqs).toHaveLength(17);
    expect(actions[2].hitSeqs).toBeUndefined();
    expect(final?.hitSeqs).toHaveLength(1);
  });

  it('弑魂反击、芳华与强化战技的命中段数', () => {
    const r = simulateBattle(config(0));
    const counter = r.events.find((e) => e.skillCode === 'phainon.counter');
    const s808 = r.events.find((e) => e.skillCode === 'phainon.skill808');
    const s811 = r.events.find((e) => e.skillCode === 'phainon.skill811');
    expect(counter?.hitSeqs).toHaveLength(5);
    expect(s808?.hitSeqs).toHaveLength(1);
    expect(s811?.hitSeqs).toHaveLength(17);
    expect(Math.round(hitTotal(r, counter))).toBe(11592);
    expect(Math.round(hitTotal(r, s811))).toBe(60547);
  });

  it('E1 终结技暴伤、E2 物穿、E4 额外弑魂、E6 真伤', () => {
    const e0 = simulateBattle(config(0));
    const e1 = simulateBattle(config(1));
    const e2 = simulateBattle(config(2));
    const e4 = simulateBattle(config(4));
    const e6 = simulateBattle(config(6));
    const first811 = (r: ReturnType<typeof simulateBattle>) =>
      Math.round(hitTotal(r, r.events.find((e) => e.skillCode === 'phainon.skill811')));
    expect(first811(e0)).toBe(60547);
    expect(first811(e1)).toBe(69197);
    expect(first811(e2)).toBe(83037);
    expect(first811(e4)).toBe(83037);
    expect(first811(e6)).toBe(124223);
    const e1Ult = e1.events.find((e) => e.skillCode === 'phainon.ult');
    expect(e1Ult?.buffs?.phainon?.some((b) => b.labelKey === 'phainonE1Ult')).toBe(true);
    const e4Counter = e4.events.find((e) => e.skillCode === 'phainon.counter');
    expect(Math.round(hitTotal(e4, e4Counter))).toBe(18169);
    expect(e6.hits.filter((h) => h.skillCode === 'phainon.e6').length).toBeGreaterThan(0);
    expect(e6.hits.filter((h) => h.skillCode === 'phainon.e6')[0].total).toBeCloseTo(32882, 0);
    expect(e6.events.filter((e) => e.unitId === 'phainonExtra').length).toBeGreaterThanOrEqual(14);
  });

  it('变身结束后 point06 +3 与 point08 第二层生效', () => {
    const r = simulateBattle(config(0));
    const final = r.events.find((e) => e.skillCode === 'phainon.final');
    const after = r.events.find((e) => e.unitId === 'phainon' && e.time > (final?.time ?? 0));
    expect(after?.energyAfter).toBe(4);
    expect(after?.buffs?.phainon?.find((b) => b.labelKey === 'phainonP08')?.stacks).toBe(2);
  });

  it('三目标：808/最后一击打三体，811 追加全体段', () => {
    const r = simulateBattle(config(0, { slots: 3 }));
    expect(r.events.find((e) => e.skillCode === 'phainon.skill808')?.hitSeqs).toHaveLength(3);
    expect(r.events.find((e) => e.skillCode === 'phainon.final')?.hitSeqs).toHaveLength(3);
    expect(r.events.find((e) => e.skillCode === 'phainon.skill811')?.hitSeqs).toHaveLength(19);
  });

  it('秘技 140807：队友回能、+1 SP、全体 2.0 物伤', () => {
    const r = simulateBattle(config(0, { techniques: true }));
    const tech = r.events.find((e) => e.skillCode === 'phainon.tech');
    expect(tech?.time).toBe(0);
    expect(tech?.spAfter).toBe(4);
    expect(tech?.note).toEqual(expect.arrayContaining(['technique', 'phainonTech']));
    expect(tech?.hitSeqs).toHaveLength(1);
    expect(hitTotal(r, tech)).toBe(6750);
  });

  it('队友在变身期间离场，最后一击后回归行动', () => {
    const r = simulateBattle({
      members: [
        { id: 'phainon', panel: panel(), eidolonLevel: 0 } as CombatMember,
        { id: 'robin', panel: panel(), eidolonLevel: 0 } as CombatMember,
        { id: 'ruanmei', panel: panel(), eidolonLevel: 0 } as CombatMember,
      ],
      monsters: [monster()],
      maxTime: 2700,
      rounds: 40,
      initialSp: 3,
      seed: 1,
    });
    const ult = r.events.find((e) => e.skillCode === 'phainon.ult');
    const final = r.events.find((e) => e.skillCode === 'phainon.final');
    expect(ult).toBeDefined();
    expect(final).toBeDefined();
    const during = r.events.filter(
      (e) =>
        e.time > (ult?.time ?? 0) &&
        e.time < (final?.time ?? 0) &&
        (e.unitId === 'robin' || e.unitId === 'ruanmei'),
    );
    expect(during).toHaveLength(0);
    const after = r.events.find(
      (e) => e.time > (final?.time ?? 0) && (e.unitId === 'robin' || e.unitId === 'ruanmei'),
    );
    expect(after).toBeDefined();
  });

  it('致命抵抗后立即最后一击并结束变身', () => {
    const r = simulateBattle(
      config(6, { attack: 50000, monsterSpeed: 30, hp: 10000 }),
    );
    const fatal = r.events.find((e) => e.note?.includes('phainonFatal'));
    const final = r.events.find((e) => e.skillCode === 'phainon.final');
    expect(fatal).toBeDefined();
    expect(final?.note).toContain('phainonFatalStrike');
    expect(r.events.some((e) => e.note?.includes('phainonEnd'))).toBe(true);
  });
});
