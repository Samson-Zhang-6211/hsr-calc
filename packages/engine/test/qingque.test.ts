import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  CharId,
  CombatMember,
  MemberPanel,
  MonsterConfig,
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
  opts: { maxTime?: number; techniques?: boolean } = {},
): BattleConfig {
  return {
    members: members.map((m) => ({
      id: m.id,
      panel: panel(m.element, m.speed),
      eidolonLevel: m.e ?? 0,
    })) as CombatMember[],
    monsters: [monster()],
    maxTime: opts.maxTime ?? 400,
    techniques: opts.techniques ?? false,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const actionsOf = (r: ReturnType<typeof simulateBattle>) =>
  r.events.filter((e) => e.kind === 'action' && e.unitId === 'qingque');

describe('青雀 1201', () => {
  it('初始能量 70', () => {
    const r = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120 }], { maxTime: 1 }));
    expect(r.finalState.energy.qingque).toBe(70);
  });

  it('战技不结束回合；首次战技回 1 SP；三连战技后自动大招进暗杠并强化普攻', () => {
    const r = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120 }], { maxTime: 100 }));
    const actions = actionsOf(r);
    expect(actions).toHaveLength(4);
    expect(actions.filter((e) => e.skillCode === 'qingque.skill')).toHaveLength(3);
    expect(actions.slice(0, 3).map((e) => e.spAfter)).toEqual([3, 2, 1]);
    expect(actions[0]!.note ?? []).toContain('qingquePoint06');
    expect(actions[1]!.note ?? []).not.toContain('qingquePoint06');

    const ult = r.events.find((e) => e.kind === 'ult');
    expect(ult?.note ?? []).toContain('qingqueDarkKong');
    expect(hitsOf(r, 'qingque.ult')[0]!.total).toBeCloseTo(9864.878, 3);
    expect(hitsOf(r, 'qingque.enhanced')).toHaveLength(1);
    expect(factor(hitsOf(r, 'qingque.enhanced')[0]!, 'damageBonus')).toBeCloseTo(2.14, 5);
    expect(actions[3]!.spAfter).toBe(1);
    expect(actions[3]!.energyAfter).toBe(25);
  });

  it('行迹 point06 仅首场首次战技触发一次', () => {
    const r = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120 }], { maxTime: 260 }));
    const notes = r.events.flatMap((e) => e.note ?? []);
    expect(notes.filter((n) => n === 'qingquePoint06')).toHaveLength(1);
    const skills = actionsOf(r).filter((e) => e.skillCode === 'qingque.skill');
    expect(skills[0]!.spAfter).toBe(3);
    expect(skills[1]!.spAfter).toBe(2);
    expect(skills[2]!.spAfter).toBe(1);
  });

  it('行迹 point08：强化普攻后速度 +10%，下一动行动值提前', () => {
    const r = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120 }], { maxTime: 170 }));
    const times = actionsOf(r).map((e) => e.time);
    expect(times[0]).toBeCloseTo(83.3333, 3);
    expect(times.find((t) => t > 100)).toBeCloseTo(159.0909, 3);
  });

  it('E1：大招伤害 +10%', () => {
    const e0 = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120 }], { maxTime: 100 }));
    const e1 = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120, e: 1 }], { maxTime: 100 }));
    expect(factor(hitsOf(e0, 'qingque.ult')[0]!, 'damageBonus')).toBeCloseTo(2.14, 5);
    expect(factor(hitsOf(e1, 'qingque.ult')[0]!, 'damageBonus')).toBeCloseTo(2.24, 5);
    expect(hitsOf(e1, 'qingque.ult')[0]!.total).toBeCloseTo(10325.854, 3);
  });

  it('E2：每次抽牌回 1 点能量', () => {
    const e0 = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120 }], { maxTime: 100 }));
    const e2 = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120, e: 2 }], { maxTime: 100 }));
    const s0 = actionsOf(e0).find((e) => e.skillCode === 'qingque.skill')!;
    const s2 = actionsOf(e2).filter((e) => e.skillCode === 'qingque.skill');
    expect(s0.energyAfter).toBe(100);
    expect(s2[0]!.energyAfter).toBe(103);
    expect(s2[1]!.energyAfter).toBe(135);
  });

  it('E4：战技概率获得【不求人】，强化普攻后追加 100% 伤害', () => {
    const r = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120, e: 4 }], { maxTime: 100 }));
    const actions = actionsOf(r);
    expect(actions.flatMap((e) => e.note ?? [])).toContain('qingqueE4');
    expect(actions.flatMap((e) => e.note ?? [])).toContain('qingqueE4Followup');
    const e4 = hitsOf(r, 'qingque.e4');
    expect(e4).toHaveLength(1);
    expect(e4[0]!.total).toBeCloseTo(hitsOf(r, 'qingque.enhanced')[0]!.total, 0);
  });

  it('E6：强化普攻回 1 点战技点', () => {
    const r = simulateBattle(config([{ id: 'qingque', element: 'Quantum', speed: 120, e: 6 }], { maxTime: 100 }));
    const enhanced = actionsOf(r).find((e) => e.note?.includes('qingqueEnhanced'))!;
    expect(enhanced.spAfter).toBe(2);
    expect(enhanced.note ?? []).toContain('qingqueE6');
  });
});
