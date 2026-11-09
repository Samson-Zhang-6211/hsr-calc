import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  BuffSnapshot,
  CharId,
  CombatMember,
  MemberPanel,
  MonsterConfig,
  PolicyFn,
} from '../src/index.js';

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

function monster(hp = 1e9, speed = 100): MonsterConfig {
  return {
    level: 85,
    hp,
    resistance: {},
    weaknesses: ['Ice', 'Fire'],
    maxToughness: 300,
    speed,
    enemyClass: 'elite',
  } as MonsterConfig;
}

function config(
  members: [CharId, string, number, number][],
  maxTime: number,
  opts: { techniques?: boolean; hp?: number; count?: number; policy?: PolicyFn } = {},
): BattleConfig {
  return {
    members: members.map(([id, element, speed, eidolonLevel]) => ({
      id,
      panel: panel(element, speed),
      eidolonLevel,
    })) as CombatMember[],
    monsters: Array.from({ length: opts.count ?? 1 }, () => monster(opts.hp)),
    maxTime,
    techniques: opts.techniques ?? false,
    policy: opts.policy,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const notesOf = (r: ReturnType<typeof simulateBattle>) =>
  new Set(r.events.flatMap((e) => e.note ?? []));

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const herta4Buffs = (r: ReturnType<typeof simulateBattle>): BuffSnapshot[] =>
  r.events.flatMap((e) => e.buffs?.herta4 ?? []);

describe('黑塔 1013', () => {
  it('初始能量为上限 50%', () => {
    const r = simulateBattle(config([['herta4', 'Ice', 120, 0]], 1));
    expect(r.finalState.energy.herta4).toBe(55);
  });

  it('秘技：攻击力 +40% 且不占用行动', () => {
    const r = simulateBattle(config([['herta4', 'Ice', 120, 0]], 10, { techniques: true }));
    const ev = r.events.find((e) => e.action === 'technique' && e.unitId === 'herta4');
    expect(ev?.note).toContain('herta4Tech');
    expect(ev?.buffs?.herta4?.some((b) => b.labelKey === 'herta4Tech' && b.value === 0.4)).toBe(true);
  });

  it('战技：目标生命 ≥50% 时额外 +25% 增伤（point06）', () => {
    let action = 0;
    const policy: PolicyFn = () => (action++ === 0 ? 'basic' : 'skill');
    const r = simulateBattle(
      config([['herta4', 'Ice', 120, 0]], 220, { hp: 6000, count: 2, policy }),
    );
    const damagedFirst = hitsOf(r, 'herta4.basic')[0]?.target;
    const skillHits = hitsOf(r, 'herta4.skill');
    expect(skillHits).toHaveLength(2);
    const lowTarget = skillHits.find((h) => h.target === damagedFirst);
    const highTarget = skillHits.find((h) => h.target !== damagedFirst);
    expect(factor(lowTarget!, 'damageBonus')).toBeCloseTo(1.45, 10);
    expect(factor(highTarget!, 'damageBonus')).toBeCloseTo(1.45, 10);
  });

  it('普攻 & 星魂1：对 ≤50% 目标追加 40% 攻击力冰伤', () => {
    const r = simulateBattle(
      config([['herta4', 'Ice', 120, 1]], 260, { hp: 10000, policy: () => 'basic' }),
    );
    expect(notesOf(r).has('herta4E1')).toBe(true);
    expect(hitsOf(r, 'herta4.e1')).toHaveLength(1);
  });

  it('天赋：一次事件内只触发一次，对每个存活目标各 1 段', () => {
    const r = simulateBattle(config([['herta4', 'Ice', 120, 0]], 260, { hp: 7000, count: 3 }));
    expect(notesOf(r).has('herta4Talent')).toBe(true);
    expect(hitsOf(r, 'herta4.followup')).toHaveLength(3);
    expect(new Set(hitsOf(r, 'herta4.followup').map((h) => h.target)).size).toBe(3);
  });

  it('星魂2：每次天赋 +3% 暴击率（最多 5 层）', () => {
    // 2026-10-29 等级口径修正后普攻伤害下调 → 拉长窗口让天赋仍能触发
    const r = simulateBattle(
      config([['herta4', 'Ice', 120, 2]], 600, { hp: 26000, policy: () => 'basic' }),
    );
    const e2 = herta4Buffs(r).filter((b) => b.labelKey === 'herta4E2');
    expect(e2.some((b) => b.key === 'critRate' && b.value === 0.03 && b.stacks === 1)).toBe(true);
  });

  it('星魂4：天赋伤害 +10%', () => {
    const r = simulateBattle(
      config([['herta4', 'Ice', 120, 4]], 260, { hp: 10000, policy: () => 'basic' }),
    );
    const talent = hitsOf(r, 'herta4.followup')[0];
    expect(talent).toBeDefined();
    expect(factor(talent!, 'damageBonus')).toBeCloseTo(1.1, 10);
  });

  it('星魂6：终结技后攻击力 +25%', () => {
    const r = simulateBattle(config([['herta4', 'Ice', 120, 6]], 260, { hp: 1e9 }));
    expect(r.events.some((e) => e.kind === 'ult' && e.unitId === 'herta4')).toBe(true);
    expect(
      herta4Buffs(r).some((b) => b.labelKey === 'herta4E6' && b.key === 'atkPct' && b.value === 0.25),
    ).toBe(true);
  });
});
