import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  CharId,
  CombatMember,
  MemberPanel,
  MonsterConfig,
  PolicyFn,
} from '../src/index.js';

function panel(element: string, speed: number, attack = 3000): MemberPanel {
  return {
    element: element as MemberPanel['element'],
    level: 80,
    hp: 10000,
    attack,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1.0,
    damageBonus: 0,
    speed,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(hp = 1e9): MonsterConfig {
  return {
    level: 85,
    hp,
    resistance: {},
    weaknesses: [],
    maxToughness: 300,
    speed: 100,
    enemyClass: 'elite',
  } as MonsterConfig;
}

function config(
  members: { id: CharId; element: string; speed: number; e?: number }[],
  opts: { maxTime?: number; techniques?: boolean; count?: number; policy?: PolicyFn } = {},
): BattleConfig {
  return {
    members: members.map((m) => ({
      id: m.id,
      panel: panel(m.element, m.speed),
      eidolonLevel: m.e ?? 0,
    })) as CombatMember[],
    monsters: Array.from({ length: opts.count ?? 1 }, () => monster()),
    maxTime: opts.maxTime ?? 400,
    techniques: opts.techniques ?? false,
    policy: opts.policy,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const actionsOf = (r: ReturnType<typeof simulateBattle>) =>
  r.events.filter((e) => e.kind === 'action' && e.unitId === 'rin');

describe('远坂凛 1508', () => {
  it('初始能量 80；行迹 point07 进战速度 +20%，首动提前', () => {
    const init = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 120 }], { maxTime: 1 }));
    expect(init.finalState.energy.rin).toBe(80);
    const r = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 120 }], { maxTime: 90 }));
    const first = actionsOf(r)[0]!;
    expect(first.time).toBeCloseTo(69.4444, 3);
    expect(first.skillCode).toBe('rin.skill');
    expect(first.spAfter).toBe(2);
    expect(first.energyAfter).toBe(110);
    expect(first.note ?? []).toEqual(expect.arrayContaining(['rinDrainSp', 'rinEnhanced']));
  });

  it('强化战技：0.9× 全体 + 每 3 宝石 1 次 0.9× 随机单体', () => {
    const r = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 120 }], { maxTime: 90 }));
    expect(hitsOf(r, 'rin.enhanced')).toHaveLength(1);
    expect(hitsOf(r, 'rin.enhanced.extra')).toHaveLength(7);
    expect(hitsOf(r, 'rin.enhanced')[0]!.total).toBeCloseTo(7156.646, 3);
    expect(factor(hitsOf(r, 'rin.enhanced')[0]!, 'crit')).toBeCloseTo(2.1, 5);
  });

  it('E1：单次消耗 ≥30 宝石获得等量影子宝石，下一发强化战技免费且不耗宝石/SP', () => {
    const r = simulateBattle(
      config([{ id: 'rin', element: 'Quantum', speed: 120, e: 1 }], {
        maxTime: 170,
        techniques: true,
      }),
    );
    const acts = actionsOf(r);
    const notes = r.events.flatMap((e) => e.note ?? []);
    expect(notes).toContain('rinE1Shadow');
    expect(notes).toContain('rinShadow');
    const t0 = acts[0]!.time;
    const t1 = acts[1]!.time;
    expect(hitsOf(r, 'rin.enhanced.extra').filter((h) => Math.abs(h.time - t0) < 0.01)).toHaveLength(11);
    expect(hitsOf(r, 'rin.enhanced.extra').filter((h) => Math.abs(h.time - t1) < 0.01)).toHaveLength(11);
    expect(acts[1]!.spAfter).toBe(2);
  });

  it('E2：自身战技伤害 +30%，队伍战技伤害独立 ×1.3', () => {
    const e0 = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 120 }], { maxTime: 90 }));
    const e2 = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 120, e: 2 }], { maxTime: 90 }));
    expect(factor(hitsOf(e2, 'rin.enhanced')[0]!, 'damageBonus')).toBeCloseTo(1.3, 5);
    expect(hitsOf(e2, 'rin.enhanced')[0]!.total).toBeCloseTo(12094.732, 3);
    expect(hitsOf(e2, 'rin.enhanced')[0]!.total).toBeCloseTo(
      hitsOf(e0, 'rin.enhanced')[0]!.total * 1.3 * 1.3,
      3,
    );

    const policy: PolicyFn = ({ id }) => (id === 'serval' ? 'skill' : 'basic');
    const team = (e: number) =>
      simulateBattle(
        config(
          [
            { id: 'rin', element: 'Quantum', speed: 120, e },
            { id: 'serval', element: 'Lightning', speed: 120 },
          ],
          { maxTime: 100, policy },
        ),
      );
    const s0 = hitsOf(team(0), 'serval.skill')[0]!;
    const s2 = hitsOf(team(2), 'serval.skill')[0]!;
    expect(s2.total / s0.total).toBeCloseTo(1.3, 3);
  });

  it('E6：大招额外 +24 宝石并获得额外回合', () => {
    const r = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 120, e: 6 }], { maxTime: 250 }));
    const ultIndex = r.events.findIndex((e) => e.kind === 'ult');
    const ult = r.events[ultIndex]!;
    expect(ult.note ?? []).toContain('rinE6Extra');
    const after = r.events.slice(ultIndex + 1).find((e) => e.kind === 'action' && e.unitId === 'rin')!;
    expect(after.time).toBeCloseTo(ult.time, 5);
    expect(after.note ?? []).toContain('rinEnhanced');
    expect(after.spAfter).toBe(1);
    expect(hitsOf(r, 'rin.enhanced.extra').filter((h) => Math.abs(h.time - ult.time) < 0.01)).toHaveLength(13);
  });

  it('大招：全体易伤 20%·3 回合，后续战技伤害 ×1.2', () => {
    const r = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 200 }], { maxTime: 200, count: 3 }));
    const before = hitsOf(r, 'rin.enhanced').find((h) => h.time < 100)!;
    const ult = r.events.find((e) => e.kind === 'ult')!;
    const after = hitsOf(r, 'rin.enhanced').find((h) => h.time > ult.time)!;
    expect(after.total / before.total).toBeCloseTo(1.2, 2);
    expect(hitsOf(r, 'rin.ult').filter((h) => Math.abs(h.time - ult.time) < 0.01)).toHaveLength(3);
  });

  it('行迹 point08：大招额外 +12 宝石，可把下一次战技推为强化战技', () => {
    const r = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 120 }], { maxTime: 400 }));
    const ult = r.events.find((e) => e.kind === 'ult')!;
    expect(ult.note ?? []).toContain('rinPoint08');
    const next = actionsOf(r).find((e) => e.time > ult.time)!;
    expect(next.note ?? []).toContain('rinEnhanced');
    const extraAtNext = hitsOf(r, 'rin.enhanced.extra').filter(
      (h) => Math.abs(h.time - next.time) < 0.01,
    );
    expect(extraAtNext).toHaveLength(5);
  });

  it('行迹 point06：全队战技点上限 +2', () => {
    const policy: PolicyFn = () => 'basic';
    const rin = simulateBattle(config([{ id: 'rin', element: 'Quantum', speed: 200 }], { maxTime: 220, policy }));
    const serval = simulateBattle(config([{ id: 'serval', element: 'Lightning', speed: 200 }], { maxTime: 220, policy }));
    expect(rin.finalState.sp).toBe(7);
    expect(serval.finalState.sp).toBe(5);
  });
});
