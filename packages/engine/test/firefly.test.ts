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
    element: 'Fire',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0,
    critDmg: 1,
    breakEffect: 1,
    damageBonus: 0,
    speed: 100,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(): MonsterConfig[] {
  return [
    {
      level: 90,
      hp: 5e8,
      maxToughness: 360,
      speed: 100,
      resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
      weaknesses: ['Physical', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
      enemyClass: 'normal',
      monsterId: 'monster1',
      effectRes: 0,
      attack: 0,
    } as MonsterConfig,
  ];
}

function config(
  e: number,
  opts: { maxTime?: number; techniques?: boolean; sp?: number } = {},
): BattleConfig {
  return {
    members: [{ id: 'firefly', panel: panel(), eidolonLevel: e } as CombatMember],
    monsters: monster(),
    maxTime: opts.maxTime ?? 260,
    techniques: opts.techniques ?? false,
    initialSp: opts.sp ?? 3,
  };
}

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const hitAt = (r: ReturnType<typeof simulateBattle>, seq: number) => {
  const h = r.hits.find((x) => x.seq === seq);
  if (!h) throw new Error(`missing hit ${seq}`);
  return h;
};

describe('流萤 1310', () => {
  it('E0：普通战技自扣 40% 生命上限并回满能量，终结技进入完全燃烧', () => {
    const r = simulateBattle(config(0, { maxTime: 120 }));
    const skill = r.events.find((e) => e.skillCode === 'firefly.skill' && e.time === 100)!;
    expect(skill.note).toContain('fireflySkill');
    expect(skill.spAfter).toBe(2);
    expect(skill.energyAfter).toBe(240);
    const skillHit = hitAt(r, skill.hitSeqs![0]);
    expect(factor(skillHit, 'base')).toBeCloseTo(6000);
    expect(skillHit.total).toBeCloseTo(2571.4285714285716);

    const ult = r.events.find((e) => e.skillCode === 'firefly.ult' && e.time === 100)!;
    expect(ult.note).toContain('fireflyUlt');
    expect(ult.energyAfter).toBe(5);

    const enhanced = r.events.find(
      (e) => e.skillCode === 'firefly.enhancedSkill' && e.time === 100,
    )!;
    expect(enhanced.note).toContain('fireflyEnhancedSkill');
    expect(factor(hitAt(r, enhanced.hitSeqs![0]), 'base')).toBeCloseTo(7326);
    expect(r.finalState.memberHp.firefly).toBeCloseTo(8500);
  });

  it('完全燃烧：强化攻击、倒计时退燃、普通战技行动提前 25%', () => {
    const r = simulateBattle(config(0, { maxTime: 500 }));
    const basic = r.events.find((e) => e.skillCode === 'firefly.enhancedBasic' && e.time === 225)!;
    expect(basic.note).toContain('fireflyEnhancedBasic');
    expect(factor(hitAt(r, basic.hitSeqs![0]), 'base')).toBeCloseTo(8400);
    expect(basic.spAfter).toBe(1);

    const countdown = r.events.find((e) => e.unitId === 'fireflyCountdown')!;
    expect(countdown.time).toBeCloseTo(242.85714285714286);
    expect(countdown.note).toContain('fireflyExitCombustion');

    const nextSkill = r.events.find((e) => e.skillCode === 'firefly.skill' && e.time === 314.2857142857143)!;
    expect(nextSkill).toBeTruthy();
    const after = r.events.find(
      (e) => e.unitId === 'firefly' && e.time > nextSkill.time && e.time < 400,
    )!;
    expect(after.time).toBeCloseTo(389.2857142857143);
  });

  it('E1：强化战技不消耗战技点并无视 15% 防御', () => {
    const r = simulateBattle(config(1, { maxTime: 170 }));
    const skill = r.events.find(
      (e) => e.skillCode === 'firefly.enhancedSkill' && e.time === 100,
    )!;
    expect(skill.spAfter).toBe(2);
    expect(factor(hitAt(r, skill.hitSeqs![0]), 'defense')).toBeCloseTo(0.5167958656330749);
    expect(r.events.some((e) => (e.note ?? []).includes('fireflyE2'))).toBe(false);
  });

  it('E2：燃烧中击破触发一次额外回合（同刻追加强化战技）', () => {
    const r = simulateBattle(config(2, { maxTime: 230, sp: 5 }));
    const breakEvent = r.events.find(
      (e) => e.time === 225 && (e.note ?? []).includes('fireflyP06'),
    )!;
    expect(breakEvent).toBeTruthy();
    const actions = r.events.filter(
      (e) => e.time === 225 && e.skillCode === 'firefly.enhancedSkill' && e.action === 'skill',
    );
    expect(actions.length).toBe(2);
    expect(actions[0].note).toContain('fireflyE2');
  });

  it('行迹6：燃烧中击破使倒计时延后 10%', () => {
    const r = simulateBattle(config(1, { maxTime: 270 }));
    expect(r.events.some((e) => (e.note ?? []).includes('fireflyP06'))).toBe(true);
    const countdown = r.events.find((e) => e.unitId === 'fireflyCountdown')!;
    expect(countdown.time).toBeCloseTo(257.14285714285717);
  });

  it('行迹7：对已破韧目标按击破特攻转超击破', () => {
    const r = simulateBattle(config(0, { maxTime: 420 }));
    const sb = r.hits.find((h) => h.note === 'fireflyP07')!;
    expect(sb).toBeTruthy();
    expect(factor(sb, 'base')).toBeCloseTo(125.585);
    expect(factor(sb, 'skillToughness')).toBeCloseTo(90);
    expect(sb.total).toBeCloseTo(31098.428571428572, 1);
  });

  it('E6：燃烧中火穿 20%、强化攻击弱点击破效率 +50%', () => {
    const r = simulateBattle(config(6, { maxTime: 170 }));
    const skill = r.events.find(
      (e) => e.skillCode === 'firefly.enhancedSkill' && e.time === 100,
    )!;
    expect(factor(hitAt(r, skill.hitSeqs![0]), 'resist')).toBeCloseTo(1.2);
    // 2026-11-06 裁定①：破韧那一击只把「溢出段」转超击破，全额 90 点的段落在后续命中上
    const sbs = r.hits.filter((h) => h.note === 'fireflyP07');
    expect(sbs.length).toBeGreaterThan(0);
    const sb = sbs.find((h) => factor(h, 'skillToughness') === 90) ?? sbs[0];
    expect(factor(sb, 'weaknessBreakEfficiency')).toBeCloseTo(2);
    if (factor(sb, 'skillToughness') === 90) expect(sb.total).toBeCloseTo(41464.57857142857);
    // 破韧那一击的溢出段必须小于全额（分段生效的最小断言）
    else expect(sb.total).toBeLessThan(41464.57857142857);
  });

  it('秘技：进战全体 200% 火伤并植入火弱点', () => {
    const r = simulateBattle(config(0, { maxTime: 120, techniques: true }));
    const tech = r.events.find((e) => e.skillCode === 'firefly.tech')!;
    expect(tech.note).toContain('fireflyTech');
    expect(hitAt(r, tech.hitSeqs![0]).total).toBeCloseTo(2571.4285714285716);
  });
});
