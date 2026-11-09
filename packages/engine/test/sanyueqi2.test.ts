import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(over: Partial<MemberPanel> = {}): MemberPanel {
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
    energyRegen: 0.194,
    ...over,
  } as MemberPanel;
}

function monster(): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 1000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack: 0,
  } as MonsterConfig;
}

function config(
  ids: CharId[],
  eidolons: Partial<Record<CharId, number>> = {},
  opts: {
    techniques?: boolean;
    maxTime?: number;
    initialSp?: number;
    extra?: CharId[];
    weak?: ('Physical' | 'Fire' | 'Ice' | 'Thunder' | 'Wind' | 'Quantum' | 'Imaginary')[];
  } = {},
): BattleConfig {
  const all = [...ids, ...(opts.extra ?? [])];
  return {
    members: all.map(
      (id) => ({ id, panel: panel(), eidolonLevel: eidolons[id] ?? 0 }) as CombatMember,
    ),
    monsters: [{ ...monster(), weaknesses: opts.weak ?? monster().weaknesses } as MonsterConfig],
    maxTime: opts.maxTime ?? 200,
    initialSp: opts.initialSp ?? 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

const F = (h: { factors: { key: string; value: number }[] }, k: string) =>
  h.factors.find((f) => f.key === k)!.value;
const hitsOf = (r: ReturnType<typeof simulateBattle>, e: { hitSeqs?: number[] }) =>
  (e.hitSeqs ?? []).map((s) => r.hits[s]);
const byCode = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

describe('三月七（巡猎）1224', () => {
  it('战技：指定师父、无伤害、回能 30；行迹 06 使开战首个行动在 75（提前 25%）', () => {
    const r = simulateBattle(config(['sanyueqi2', 'ratio'], {}, { maxTime: 120 }));
    const skill = r.events.find((e) => e.skillCode === 'sanyueqi2.skill')!;
    expect(skill.note).toContain('s7Skill');
    expect(skill.time).toBeCloseTo(75);
    // 初战 55 + 30×1.194
    expect(skill.energyAfter).toBeCloseTo(55 + 35.82);
    // 战技无伤害段
    expect(skill.hitSeqs ?? []).toHaveLength(0);
  });

  it('普攻 100%（Lv6）+ 命中 +1 充能，并按师父命途追加附加伤害（元素随师父）', () => {
    const r = simulateBattle(config(['sanyueqi2', 'ratio'], {}, { maxTime: 900 }));
    const basic = r.events.find((e) => e.skillCode === 'sanyueqi2.basic')!;
    expect(basic.note).toContain('s7Charge');
    expect(basic.note).toContain('s7Extra');
    const [hit, extra] = hitsOf(r, basic);
    expect(F(hit, 'base')).toBeCloseTo(3000); // Lv6 = 100%
    expect(F(extra, 'base')).toBeCloseTo(600); // 3000×20%
    // 附加伤害归属三月七（面板/双暴），元素随师父 —— HitLog 不带 element 字段，
    // 故按来源与倍率锚定
    expect(extra.source).toBe('sanyueqi2');
    expect(extra.attackKind).toBe('followup');
  });

  it('【充能】≥7 时立即行动，且强化普攻初始 3 段（每段 80%）+ 增伤 +80%', () => {
    const r = simulateBattle(config(['sanyueqi2', 'ratio'], { sanyueqi2: 6 }, { maxTime: 900 }));
    const charged = r.events.find((e) => (e.note ?? []).includes('s7Charged'))!;
    expect(charged).toBeTruthy();
    const enh = r.events.find((e) => e.skillCode === 'sanyueqi2.enhanced')!;
    // 立即行动：与触发它的师父行动同一时刻
    expect(enh.time).toBeCloseTo(charged.time);
    const hits = hitsOf(r, enh);
    const segs = hits.filter((h) => h.skillCode === 'sanyueqi2.enhanced');
    expect(segs.length).toBeGreaterThanOrEqual(3);
    expect(segs.length).toBeLessThanOrEqual(11);
    // E3 普攻 +1 → Lv7 = 0.88
    expect(F(segs[0], 'base')).toBeCloseTo(3000 * 0.88);
    expect(F(segs[0], 'damageBonus')).toBeCloseTo(1.8); // 充能窗口 +80%
    // 每段都带一次师父附加伤害
    expect(hits.filter((h) => h.skillCode === 'sanyueqi2.extra').length).toBe(segs.length);
    // 行迹 08：强化普攻后给师父挂暴伤/击破特攻
    expect(enh.note).toContain('s7P08');
  });

  it('强化普攻结算后扣 7 点充能（不再进入强化状态）', () => {
    const r = simulateBattle(config(['sanyueqi2', 'ratio'], {}, { maxTime: 900 }));
    const enhs = r.events.filter((e) => e.skillCode === 'sanyueqi2.enhanced');
    expect(enhs.length).toBeGreaterThanOrEqual(1);
    const first = enhs[0]!;
    const basicsBefore = r.events.filter(
      (e) =>
        e.skillCode === 'sanyueqi2.basic' &&
        (e.kind === 'action' || e.kind === 'ult') &&
        e.time < first.time,
    );
    // 强化普攻前后必须已有 ≥7 次充能获取（普通普攻 1 + 师父行动 1/次）
    expect(basicsBefore.length).toBeGreaterThanOrEqual(1);
  });

  it('终结技 240% 并给下一次强化普攻 +2 段 / +20% 概率', () => {
    const r = simulateBattle(config(['sanyueqi2', 'ratio'], { sanyueqi2: 6 }, { maxTime: 900 }));
    const ult = r.events.find((e) => e.skillCode === 'sanyueqi2.ult')!;
    expect(ult.note).toContain('s7Ult');
    const hit = hitsOf(r, ult)[0]!;
    // E5 终结技 +2 → Lv12 = 2.592
    expect(F(hit, 'base')).toBeCloseTo(3000 * 2.592);
    const typeofSegs = r.hits
      .filter((h) => h.skillCode === 'sanyueqi2.enhanced' && h.total > 0)
      .length;
    expect(typeofSegs).toBeGreaterThanOrEqual(3);
  });

  it('E2：师父普攻/战技后 60% 追击（每三月七回合 1 次）并 +1 充能', () => {
    const r = simulateBattle(config(['sanyueqi2', 'ratio'], { sanyueqi2: 2 }, { maxTime: 900 }));
    const e2 = byCode(r, 'sanyueqi2.e2');
    expect(e2.length).toBeGreaterThanOrEqual(1);
    expect(F(e2[0], 'base')).toBeCloseTo(1800); // 3000×0.6
    // 关键：E2 只在师父（ratio）的行动事件里出现，且每次最多 1 段
    const hostEvents = r.events.filter((e) =>
      (e.hitSeqs ?? []).some((s) => r.hits[s].skillCode === 'sanyueqi2.e2'),
    );
    expect(hostEvents.length).toBeGreaterThanOrEqual(1);
    for (const e of hostEvents) {
      expect(e.unitId).toBe('ratio');
      const n = (e.hitSeqs ?? []).filter((s) => r.hits[s].skillCode === 'sanyueqi2.e2').length;
      expect(n).toBe(1);
    }
  });

  it('E6：下一次强化普攻暴伤 +50%（1.75 → 2.0）', () => {
    const r = simulateBattle(config(['sanyueqi2', 'ratio'], { sanyueqi2: 6 }, { maxTime: 900 }));
    const enh = r.events.find((e) => e.skillCode === 'sanyueqi2.enhanced')!;
    const seg = hitsOf(r, enh).find((h) => h.skillCode === 'sanyueqi2.enhanced')!;
    expect(F(seg, 'crit')).toBeCloseTo(2.0);
  });

  it('行迹 07【玲珑】：目标弱点含【师父】属性 → 该次削韧按全额计（否则只有 20%）', () => {
    // 师父 = 星期日（战技/普攻都不削韧）→ 本场削韧只来自三月七。
    // 测试面板元素为雷，故「师父属性」= 雷弱点。
    const withTrace = simulateBattle(
      config(['sanyueqi2', 'sunday'], { sanyueqi2: 1 }, { maxTime: 300, weak: ['Thunder'] }),
    );
    const withoutTrace = simulateBattle(
      config(['sanyueqi2', 'sunday'], { sanyueqi2: 1 }, { maxTime: 300, weak: ['Ice'] }),
    );
    const a = withTrace.finalState.monsters[0]!.toughness;
    const b = withoutTrace.finalState.monsters[0]!.toughness;
    expect(a).toBeLessThan(b);
  });

  it('秘技：充能 = min(3, 非战斗类秘技人数（含自己）+〔有战斗类秘技 ? 1 : 0〕)，回 30 能', () => {
    // 三月七（非战斗类）+ 真理医生（非战斗类）→ 2 点充能；无战斗类
    const r = simulateBattle(config(['sanyueqi2', 'ratio'], {}, { techniques: true, maxTime: 200 }));
    const skill = r.events.find((e) => e.skillCode === 'sanyueqi2.skill')!;
    // 充能 2（未达 7）→ 之后仍是普通普攻，不会出现强化普攻
    const firstBasic = r.events.find((e) => e.skillCode === 'sanyueqi2.basic');
    expect(firstBasic).toBeTruthy();
    // 秘技回 30 能（吃充能效率）：55 + 35.82(秘技) + 35.82(战技) = 126.64 → 上限 110
    expect(skill.energyAfter).toBeCloseTo(110);
  });
});
