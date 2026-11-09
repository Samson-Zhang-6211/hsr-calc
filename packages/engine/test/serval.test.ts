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
    weaknesses: ['Ice', 'Thunder'],
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

describe('希露瓦 1103', () => {
  it('初始能量 = 上限 50% + point07 15', () => {
    const r = simulateBattle(config([['serval', 'Thunder', 120, 0]], 1));
    expect(r.finalState.energy.serval).toBe(65);
  });

  it('秘技：随机单体 50% 雷伤 + 全体触电，并触发天赋', () => {
    const r = simulateBattle(
      config([['serval', 'Thunder', 120, 0]], 200, { techniques: true }),
    );
    expect(notesOf(r).has('servalTech')).toBe(true);
    expect(notesOf(r).has('servalTalent')).toBe(true);
    expect(hitsOf(r, 'serval.tech')).toHaveLength(1);
    expect(hitsOf(r, 'skilldot.shock').length).toBeGreaterThanOrEqual(1);
  });

  it('战技：对命中目标施加触电并触发天赋', () => {
    const r = simulateBattle(config([['serval', 'Thunder', 120, 0]], 120));
    expect(notesOf(r).has('servalShock')).toBe(true);
    expect(notesOf(r).has('servalTalent')).toBe(true);
    expect(hitsOf(r, 'serval.talent').length).toBeGreaterThanOrEqual(1);
  });

  it('星魂6：对触电目标伤害 +30%，触电 DoT 独立乘区 ×1.3', () => {
    const e0 = simulateBattle(config([['serval', 'Thunder', 120, 0]], 200, { techniques: true }));
    const e6 = simulateBattle(config([['serval', 'Thunder', 120, 6]], 200, { techniques: true }));
    const t0 = hitsOf(e0, 'serval.talent')[0];
    const t6 = hitsOf(e6, 'serval.talent')[0];
    expect(t0).toBeDefined();
    expect(t6).toBeDefined();
    expect(factor(t0!, 'damageBonus')).toBeCloseTo(1, 10);
    expect(factor(t6!, 'damageBonus')).toBeCloseTo(1.3, 10);
    expect(factor(hitsOf(e0, 'skilldot.shock')[0]!, 'independent')).toBeCloseTo(1, 10);
    expect(factor(hitsOf(e6, 'skilldot.shock')[0]!, 'independent')).toBeCloseTo(1.3, 10);
  });

  it('星魂4：终结技对未触电目标补挂战技同款触电', () => {
    const r = simulateBattle(
      config([['serval', 'Thunder', 120, 4]], 400, {
        policy: () => 'basic',
      }),
    );
    expect(r.events.some((e) => e.kind === 'ult' && e.unitId === 'serval')).toBe(true);
    expect(notesOf(r).has('servalE4')).toBe(true);
    expect(hitsOf(r, 'skilldot.shock').length).toBeGreaterThanOrEqual(1);
  });

  it('星魂1：普攻对 1 个相邻目标追加 60% 普攻伤害', () => {
    const r = simulateBattle(
      config([['serval', 'Thunder', 120, 1]], 220, { count: 2, policy: () => 'basic' }),
    );
    const basics = hitsOf(r, 'serval.basic');
    const e1 = hitsOf(r, 'serval.e1');
    expect(basics.length).toBeGreaterThanOrEqual(1);
    expect(e1).toHaveLength(basics.length);
    expect(new Set(e1.map((h) => h.target)).size).toBeGreaterThan(0);
  });

  it('point08：消灭敌人后攻击力 +20% 并标记', () => {
    const r = simulateBattle(
      config([['serval', 'Thunder', 120, 0]], 10, { techniques: true, hp: 1000 }),
    );
    expect(hitsOf(r, 'serval.tech')[0]?.note).toBe('servalP08');
  });
});
