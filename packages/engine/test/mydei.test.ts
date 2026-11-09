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
    element: 'Imaginary',
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
  opts: { count?: number; maxTime?: number; techniques?: boolean } = {},
): BattleConfig {
  return {
    members: [{ id: 'mydei', panel: panel(), eidolonLevel: e } as CombatMember],
    monsters: Array.from({ length: opts.count ?? 1 }, () => monster()),
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

describe('万敌 1404', () => {
  it('初始能量 80；秘技 0.8×上限 AoE、+50 充能与嘲讽', () => {
    const r = simulateBattle(config(0, { count: 3, maxTime: 1, techniques: true }));
    expect(r.finalState.energy.mydei).toBe(80);
    expect(r.finalState.memberHp.mydei).toBeCloseTo(10000);
    expect(r.finalState.taunt?.mydei ?? 0).toBeCloseTo(175);
    const tech = r.events.find((e) => e.skillCode === 'mydei.tech');
    expect(tech?.note).toContain('mydeiTech');
    expect(tech?.spAfter).toBe(3);
    const hits = hitsOf(r, 'mydei.tech');
    expect(hits).toHaveLength(3);
    for (const h of hits) {
      expect(factor(h, 'base')).toBeCloseTo(8000);
      expect(factor(h, 'crit')).toBeCloseTo(2.47);
    }
  });

  it('E0 受击进入血仇：自动弑王成王并接终结技', () => {
    const r = simulateBattle(config(0, { maxTime: 110 }));
    const feud = r.events.find((e) => (e.note ?? []).includes('mydeiBloodFeud'));
    expect(feud?.action).toBe('monster');
    const king = r.events.find((e) => e.skillCode === 'mydei.autoKing');
    expect(king?.note).toContain('mydeiAutoKing');
    expect(factor(hitsOf(r, 'mydei.autoKing')[0], 'base')).toBeCloseTo(16500);
    const ult = r.events.find((e) => e.skillCode === 'mydei.ult');
    expect(ult?.note).toContain('mydeiUlt');
    expect(factor(hitsOf(r, 'mydei.ult')[0], 'base')).toBeCloseTo(24000);
  });

  it('E0 充能满 150 触发弑神登神额外回合', () => {
    const r = simulateBattle(config(0, { maxTime: 160 }));
    const king = r.events.filter((e) => e.skillCode === 'mydei.autoKing').at(-1)!;
    expect(king.note).toContain('mydeiGodReady');
    const god = r.events.find((e) => e.skillCode === 'mydei.autoGod');
    expect(god?.note).toContain('mydeiGod');
    expect(god?.note).toContain('mydeiGodExtra');
    expect(factor(hitsOf(r, 'mydei.autoGod')[0], 'base')).toBeCloseTo(42000);
  });

  it('E6 开局即处于血仇并立即弑王成王', () => {
    const r = simulateBattle(config(6, { maxTime: 1 }));
    const king = r.events.find((e) => e.skillCode === 'mydei.autoKing')!;
    expect(king.time).toBe(0);
    expect(king.note).toContain('mydeiAutoKing');
    expect(king.note).toContain('mydeiBloodFeud');
    expect(factor(hitAt(r, king.hitSeqs![0]), 'base')).toBeCloseTo(16500);
  });

  it('E1 弑神登神对三目标均提升 30%', () => {
    const r = simulateBattle(config(6, { count: 3, maxTime: 110 }));
    const god = r.events.find((e) => e.skillCode === 'mydei.autoGod')!;
    expect(god.hitSeqs).toHaveLength(3);
    for (const seq of god.hitSeqs!) {
      expect(factor(hitAt(r, seq), 'base')).toBeCloseTo(54600);
    }
  });

  it('E2 无视防御与 E4 暴伤/受击回血生效', () => {
    const r = simulateBattle(config(6, { maxTime: 150 }));
    const first = hitsOf(r, 'mydei.autoKing')[0];
    expect(factor(first, 'defense')).toBeCloseTo(0.5167958656330749);
    expect(factor(first, 'crit')).toBeCloseTo(2.764);
    const healed = r.events.find((e) => (e.note ?? []).includes('mydeiE4Heal'));
    expect(healed?.action).toBe('monster');
  });

  it('E6 血仇中免疫控制并记录 mydeiP07', () => {
    const r = simulateBattle(config(6, { count: 3, maxTime: 1200 }));
    const notes = r.events.flatMap((e) => e.note ?? []);
    expect(notes).toContain('mydeiP07');
    expect(notes).not.toContain('enemyFreezeSkip');
  });

  it('E2 血仇入场治疗转化为充能，更快攒出下一次弑神登神', () => {
    const count = (r: ReturnType<typeof simulateBattle>) =>
      r.events.filter((e) => e.skillCode === 'mydei.autoGod').length;
    const e0 = simulateBattle(config(0, { maxTime: 500 }));
    const e2 = simulateBattle(config(2, { maxTime: 500 }));
    expect(count(e2)).toBeGreaterThan(count(e0));
  });
});
