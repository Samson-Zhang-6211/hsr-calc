import type { Element } from '@hsr-calc/shared';
import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
  type PolicyFn,
} from '../src/index.js';

// 素裳 1206（物理/巡猎）接入回归（2026-10-29 接入；裁定见 docs/AGENTS-rogue.md §2）。
// 锚点全部来自 test/sushang-dump.test.ts 实跑（%TEMP%/临时目录/sushang-dump.txt），勿凭推理改数。
// 关键口径：【剑势】= 附加伤害（直伤通道、吃双暴、削韧 0、不视为一次攻击）；
// 破韧目标必定发动、否则 33% 固定概率（不吃效果命中）；终结技额外 +2 次判定且该次伤害 50%。

const ALL_ELEMENTS: Element[] = [
  'Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary',
];

function mp(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Physical', level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed: 110, energyRegen: 0, ...extra,
  };
}
function mon(hp = 5e8, toughness = 9999): MonsterConfig {
  return {
    level: 90, hp, maxToughness: toughness, speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ALL_ELEMENTS, enemyClass: 'normal', monsterId: '1004011', attack: 0,
  } as MonsterConfig;
}
const su = (eidolonLevel = 0, extra: Partial<MemberPanel> = {}): CombatMember => ({
  id: 'sushang',
  panel: mp(extra),
  eidolonLevel,
});
function cfg(
  members: CombatMember[],
  opts: { techniques?: boolean; maxTime?: number; policy?: PolicyFn; monster?: MonsterConfig; seed?: number } = {},
): BattleConfig {
  return {
    members,
    monster: opts.monster ?? mon(),
    maxTime: opts.maxTime ?? 400,
    initialSp: 3,
    seed: opts.seed ?? 1,
    techniques: opts.techniques ?? false,
    policy: opts.policy,
  };
}
type R = BattleResult;
const basicOnly: PolicyFn = () => 'basic';
const skillOnly: PolicyFn = () => 'skill';

function actsOf(r: R, uid: string): CombatEvent[] {
  return r.events.filter((e) => e.kind === 'action' && e.unitId === uid);
}
function hitsOf(r: R, ev: CombatEvent, code: string) {
  return (ev.hitSeqs ?? []).map((s) => r.hits[s]).filter((h) => h.skillCode === code);
}
function factor(h: R['hits'][number] | undefined, key: string): number | undefined {
  return h?.factors.find((f) => f.key === key)?.value;
}
function notesOf(r: R): Set<string> {
  const s = new Set<string>();
  for (const e of r.events) for (const n of e.note ?? []) s.add(n);
  return s;
}

describe('素裳 1206（物理/巡猎）', () => {
  it('A 普攻：140%→Lv6 基准 100% 攻击力；+1 SP / +20 能', () => {
    const r = simulateBattle(cfg([su()], { policy: basicOnly }));
    const first = actsOf(r, 'sushang')[0];
    expect(first.time).toBeCloseTo(90.91, 2); // 速度 110 → av 90.91
    expect(first.skillCode).toBe('sushang.basic');
    expect(first.spAfter).toBe(4);
    expect(first.energyAfter).toBeCloseTo(80, 2); // 初战 60 + 20
    const hit = hitsOf(r, first, 'sushang.basic')[0];
    // base = 面板攻击 2000 × 普攻 Lv6 倍率 1.0
    expect(factor(hit, 'base')).toBeCloseTo(2000, 6);
    // 未破韧 ×0.9：2000 × crit 1.025 × def 0.4762 × 0.9
    expect(hit.total).toBeCloseTo(878.57, 1);
    expect(factor(hit, 'crit')).toBeCloseTo(1.025, 6);
  });

  it('B 战技 + 剑势：210% 主段，33% 固定概率触发附加伤害（削韧 0）', () => {
    const r = simulateBattle(cfg([su()], { policy: skillOnly }));
    const acts = actsOf(r, 'sushang');
    const first = acts[0];
    const main = hitsOf(r, first, 'sushang.skill')[0];
    expect(factor(main, 'base')).toBeCloseTo(4200, 6); // 2000 × 2.1
    expect(first.spAfter).toBe(2); // 战技 −1
    // seed 1：第 2 次战技触发剑势（33% 命中）→ 总伤翻出 sushang.sword 段
    const swordEv = acts.find((e) => hitsOf(r, e, 'sushang.sword').length > 0);
    expect(swordEv, 'seed 1 应至少触发 1 次剑势').toBeDefined();
    const sword = hitsOf(r, swordEv!, 'sushang.sword')[0];
    expect(sword.kind).toBe('direct');
    // 剑势 base = 2000 × 战技 #2（1.0）×（1 + point07 0 层）
    expect(factor(sword, 'base')).toBeCloseTo(2000, 6);
    expect(sword.total).toBeCloseTo(878.57, 1);
  });

  it('C 破韧场景：剑势必发 + point08 行动提前 + 天赋加速', () => {
    const r = simulateBattle(
      cfg([su()], { policy: skillOnly, maxTime: 300, monster: mon(5e8, 60) }),
    );
    const acts = actsOf(r, 'sushang');
    // 每次战技都有剑势段（目标处于弱点击破状态 → 必定发动）
    for (const ev of acts) {
      expect(hitsOf(r, ev, 'sushang.sword').length).toBeGreaterThanOrEqual(1);
    }
    // point08 破敌：场上有破韧目标 → 自身行动提前 15%
    expect(notesOf(r).has('sushangP08')).toBe(true);
    // 天赋：击破 → 速度 +20%（2 回合）+ point08 行动提前 15% → 第二次行动 90.91 → 155.30
    expect(notesOf(r).has('sushangTalent')).toBe(true);
    expect(acts[1].time).toBeCloseTo(155.3, 1);
    // 破韧后不再吃「未破韧 ×0.9」：同倍率普攻段总伤 = 878.57 / 0.9
    const sword = hitsOf(r, acts[0], 'sushang.sword')[0];
    expect(sword.total).toBeCloseTo(976.19, 1);
  });

  it('C2 E1：对破韧目标施放战技后恢复 1 个战技点', () => {
    const opts = { policy: skillOnly, maxTime: 300, monster: mon(5e8, 60) } as const;
    const e0 = simulateBattle(cfg([su(0)], opts));
    const e1 = simulateBattle(cfg([su(1)], opts));
    const a0 = actsOf(e0, 'sushang')[0];
    const a1 = actsOf(e1, 'sushang')[0];
    expect(a1.spAfter).toBe((a0.spAfter as number) + 1);
    expect(notesOf(e0).has('sushangE1')).toBe(false);
    expect(notesOf(e1).has('sushangE1')).toBe(true);
  });

  it('D 终结技：320% 单体 + 立即行动 + 攻击力 +30%（2 回合）+ 额外 2 次剑势判定（50%）', () => {
    const r = simulateBattle(cfg([su()], { policy: skillOnly, maxTime: 545 }));
    const acts = actsOf(r, 'sushang');
    // 「立即行动」：终极技后同刻出现下一次自身行动
    const sameTime = acts.filter((e) => Math.abs(e.time - 181.82) < 0.02);
    expect(sameTime.length).toBeGreaterThanOrEqual(2);
    // 攻击力 +30% 生效：战技 base 4200 → 5460
    const boosted = acts.find(
      (e) => Math.abs((factor(hitsOf(r, e, 'sushang.skill')[0], 'base') ?? 0) - 5460) < 1,
    );
    expect(boosted, '战后战技 base 应为 5460（4200×1.3）').toBeDefined();
    // 额外判定：50% 倍率的剑势段（base = 2000 × 0.5 × 1.3 = 1300 上下，含 point07 叠层）
    const swords = acts.flatMap((e) => hitsOf(r, e, 'sushang.sword'));
    const halfSword = swords.find((h) => (factor(h, 'base') ?? 0) < 1500);
    expect(halfSword, '终结技期间应出现 50% 伤害的额外剑势').toBeDefined();
  });

  it('E 星魂6：进战自带 1 层天赋加速（速度 110 → 132，首动 75.76）', () => {
    const e0 = simulateBattle(cfg([su(0)], { policy: skillOnly }));
    const e6 = simulateBattle(cfg([su(6)], { policy: skillOnly }));
    expect(actsOf(e0, 'sushang')[0].time).toBeCloseTo(90.91, 2);
    expect(actsOf(e6, 'sushang')[0].time).toBeCloseTo(75.76, 2);
  });

  it('F 秘技 120607：全体 80% 攻击力物理伤害（入场事件，削韧 60）', () => {
    const r = simulateBattle(cfg([su()], { techniques: true, policy: basicOnly, maxTime: 300 }));
    const tech = r.events.find((e) => e.action === 'technique' && e.unitId === 'sushang');
    expect(tech, '应有素裳秘技事件').toBeDefined();
    expect(tech!.skillCode).toBe('sushang.tech');
    expect(tech!.hitSeqs).toHaveLength(3); // 三木桩各一段
    for (const s of tech!.hitSeqs ?? []) {
      const h = r.hits[s];
      expect(factor(h, 'base')).toBeCloseTo(1600, 6); // 2000 × 0.8
      expect(h.total).toBeCloseTo(702.86, 1);
    }
    expect(tech!.note ?? []).toContain('sushangTech');
  });

  it('G 星魂4：击破特攻 +40%（常驻 buff，进战即可见）', () => {
    const r = simulateBattle(cfg([su(4)], { policy: basicOnly }));
    const be = r.events
      .flatMap((e) => e.buffs?.sushang ?? [])
      .find((b) => b.labelKey === 'sushangE4');
    expect(be, 'E4 击破特攻 buff 应存在').toBeDefined();
    expect(be!.key).toBe('breakEffect');
    expect(be!.value).toBeCloseTo(0.4, 6);
  });
});
