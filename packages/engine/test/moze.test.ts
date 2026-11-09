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
  opts: { techniques?: boolean; maxTime?: number; initialSp?: number } = {},
): BattleConfig {
  return {
    members: ids.map(
      (id) => ({ id, panel: panel(), eidolonLevel: eidolons[id] ?? 0 }) as CombatMember,
    ),
    monsters: [monster()],
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

describe('貊泽 1223', () => {
  it('战技 150% + 挂【猎物】（+25% 追加攻击易伤）并进入离场（之后不再占用行动条）', () => {
    const r = simulateBattle(config(['moze', 'danheng'], {}, { maxTime: 200 }));
    const skill = r.events.find((e) => e.skillCode === 'moze.skill')!;
    expect(skill.note).toContain('mozePrey');
    const hit = hitsOf(r, skill)[0]!;
    expect(F(hit, 'base')).toBeCloseTo(4500); // 3000×1.5
    expect(F(hit, 'vuln')).toBeCloseTo(1); // 猎物移速易伤只对追加攻击生效
    // 离场：战技之后貊泽再也没有自己的行动事件
    const laterMozeActions = r.events.filter(
      (e) => e.unitId === 'moze' && e.time > skill.time && (e.kind === 'action' || e.kind === 'ult'),
    );
    expect(laterMozeActions).toHaveLength(0);
  });

  it('天赋附加伤害：我方每次攻击行动 1 次 30% 雷伤，并消耗 1 点充能', () => {
    const r = simulateBattle(config(['moze', 'danheng'], {}, { maxTime: 200 }));
    const dh1 = r.events.find((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.skill')!;
    const extra = hitsOf(r, dh1).find((h) => h.skillCode === 'moze.extra')!;
    expect(F(extra, 'base')).toBeCloseTo(900); // 3000×0.3
    // 猎物易伤 +25% 只作用于追加攻击（附加伤害按追加攻击通道结算）
    expect(F(extra, 'vuln')).toBeCloseTo(1.25);
    expect(extra.attackKind).toBe('followup');
  });

  it('每消耗 3 点充能发动 1 次天赋追击 160%，point06 追击后回 1 战技点', () => {
    const r = simulateBattle(config(['moze', 'danheng'], {}, { maxTime: 200 }));
    const follow = byCode(r, 'moze.talent');
    expect(follow.length).toBeGreaterThanOrEqual(1);
    expect(F(follow[0], 'base')).toBeCloseTo(4800); // 3000×1.6
    expect(F(follow[0], 'vuln')).toBeCloseTo(1.25);
    const withP06 = r.events.filter((e) => (e.note ?? []).includes('mozeP06'));
    expect(withP06.length).toBeGreaterThanOrEqual(1);
  });

  it('E1：进战 +20 能量（固定），每次附加伤害 +2 能量（吃充能效率）', () => {
    const r = simulateBattle(config(['moze', 'danheng'], { moze: 1 }, { maxTime: 200 }));
    const skill = r.events.find((e) => e.skillCode === 'moze.skill')!;
    // 初战 60 + E1 20 + 战技 30×1.194
    expect(skill.energyAfter).toBeCloseTo(60 + 20 + 35.82);
    const dh = r.events.find((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.skill')!;
    expect(dh.note).toContain('mozeE1');
  });

  it('E2：我方对【猎物】造成伤害时暴伤 +40%', () => {
    const base = simulateBattle(config(['moze', 'danheng'], {}, { maxTime: 200 }));
    const e2 = simulateBattle(config(['moze', 'danheng'], { moze: 2 }, { maxTime: 200 }));
    const a = byCode(base, 'moze.extra')[0]!;
    const b = byCode(e2, 'moze.extra')[0]!;
    expect(F(a, 'crit')).toBeCloseTo(1.75);
    expect(F(b, 'crit')).toBeCloseTo(1.95); // 1 + 0.5×(1.5+0.4)
  });

  it('E6：天赋追击倍率 ×1.25（160% → 200%）', () => {
    const r = simulateBattle(config(['moze', 'danheng'], { moze: 6 }, { maxTime: 200 }));
    const follow = byCode(r, 'moze.talent')[0]!;
    // E3 天赋 +2 → 天赋 Lv12 = 1.76；E6 ×1.25 → 2.2
    expect(F(follow, 'base')).toBeCloseTo(3000 * 1.76 * 1.25);
  });

  it('秘技：进战自身增伤 +30%（2 回合）', () => {
    const r = simulateBattle(config(['moze', 'danheng'], {}, { techniques: true, maxTime: 200 }));
    const skill = r.events.find((e) => e.skillCode === 'moze.skill')!;
    expect(F(hitsOf(r, skill)[0]!, 'damageBonus')).toBeCloseTo(1.3);
  });

  it('solo：场上无其他可战斗角色 → 不施战技（不打【猎物】、不离场）', () => {
    const r = simulateBattle(config(['moze'], {}, { maxTime: 200 }));
    expect(r.events.some((e) => e.skillCode === 'moze.skill')).toBe(false);
    expect(r.hits.every((h) => h.skillCode !== 'moze.extra')).toBe(true);
    expect(r.events.some((e) => e.skillCode === 'moze.basic')).toBe(true);
  });
});
