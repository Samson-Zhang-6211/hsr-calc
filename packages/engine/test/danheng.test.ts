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

// 丹恒 1002（风/巡猎）接入回归（2026-10-29 接入；裁定见 docs/AGENTS-rogue.md §6）。
// 锚点来自 test/danheng-dump.test.ts 实跑（%TEMP%/临时目录/danheng-dump.txt）。
// 关键口径：终结技对「减速」目标的 +120% 是**加算到倍率**（400%→520%）；
// 减速 = 怪侧真降速（speedPct −12%，E6 −20%）；战技触发暴击才判定减速（暴击按面板期望自掷 1 次）。

function mp(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Wind', level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed: 110, energyRegen: 0, ...extra,
  };
}
function mon(hp = 5e8, toughness = 9999): MonsterConfig {
  return {
    level: 90, hp, maxToughness: toughness, speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Wind', 'Physical'], enemyClass: 'normal', monsterId: '1012010', attack: 0,
  } as MonsterConfig;
}
/** critRate 默认 1 = 保证战技「触发暴击」分支稳定命中（减速判定需要暴击） */
const dh = (eidolonLevel = 0, critRate = 1): CombatMember => ({
  id: 'danheng',
  panel: mp({ critRate }),
  eidolonLevel,
});
const syq = (): CombatMember => ({ id: 'sanyueqi', panel: mp({ element: 'Ice', speed: 101 }) });
function cfg(
  members: CombatMember[],
  opts: {
    techniques?: boolean; maxTime?: number; policy?: PolicyFn;
    monster?: MonsterConfig; seed?: number; initialSp?: number;
  } = {},
): BattleConfig {
  return {
    members,
    monster: opts.monster ?? mon(),
    maxTime: opts.maxTime ?? 400,
    initialSp: opts.initialSp ?? 3,
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

describe('丹恒 1002（风/巡猎）', () => {
  it('A 普攻：Lv6 基准 100% 攻击力；+1 SP / +20 能', () => {
    const r = simulateBattle(cfg([dh(0, 0.05)], { policy: basicOnly }));
    const first = actsOf(r, 'danheng')[0];
    expect(first.time).toBeCloseTo(90.91, 2);
    expect(first.spAfter).toBe(4);
    expect(first.energyAfter).toBeCloseTo(70, 2); // 初战 50 + 20
    const hit = hitsOf(r, first, 'danheng.basic')[0];
    expect(factor(hit, 'base')).toBeCloseTo(2000, 6);
    expect(hit.total).toBeCloseTo(878.57, 1);
  });

  it('B 战技：260% 单体，暴击时使目标减速（怪侧真降速）', () => {
    const r = simulateBattle(cfg([dh()], { policy: skillOnly }));
    const first = actsOf(r, 'danheng')[0];
    const hit = hitsOf(r, first, 'danheng.skill')[0];
    expect(factor(hit, 'base')).toBeCloseTo(5200, 6); // 2000 × 2.6
    expect(notesOf(r).has('danhengSlow')).toBe(true);
    // 暴击率 0 的队伍不触发减速
    const noCrit = simulateBattle(cfg([dh(0, 0)], { policy: skillOnly }));
    expect(notesOf(noCrit).has('danhengSlow')).toBe(false);
  });

  it('C 终结技：目标减速 → 倍率**加算** +120%（400% → 520%）', () => {
    const slow = simulateBattle(cfg([dh()], { policy: skillOnly, maxTime: 900 }));
    const ultSlow = slow.events.filter((e) => e.skillCode === 'danheng.ult')[0];
    const h1 = (ultSlow.hitSeqs ?? []).map((s) => slow.hits[s])[0];
    expect(factor(h1, 'base')).toBeCloseTo(10400, 6); // 2000 × 5.2
    expect(notesOf(slow).has('danhengUltBonus')).toBe(true);
    // 未减速（无暴击 → 无减速）：只有 400%
    const plain = simulateBattle(cfg([dh(0, 0)], { policy: skillOnly, maxTime: 900 }));
    const ultPlain = plain.events.filter((e) => e.skillCode === 'danheng.ult')[0];
    const h2 = (ultPlain.hitSeqs ?? []).map((s) => plain.hits[s])[0];
    expect(factor(h2, 'base')).toBeCloseTo(8000, 6); // 2000 × 4.0
    expect(notesOf(plain).has('danhengUltBonus')).toBe(false);
  });

  it('D point08 罡风：普攻对减速目标伤害 +40%（仅普攻）', () => {
    // SP=1：先战技（上减速），SP 见底后转普攻
    const r = simulateBattle(
      cfg([dh()], { policy: (ctx) => (ctx.sp >= 1 ? 'skill' : 'basic'), initialSp: 1, maxTime: 300 }),
    );
    const acts = actsOf(r, 'danheng');
    expect(acts[0].skillCode).toBe('danheng.skill');
    const basic = hitsOf(r, acts[1], 'danheng.basic')[0];
    expect(factor(basic, 'damageBonus')).toBeCloseTo(1.4, 6);
    expect(basic.total).toBeCloseTo(1800, 1);
    // 战技本身不吃该加成
    const skill = hitsOf(r, acts[0], 'danheng.skill')[0];
    expect(factor(skill, 'damageBonus')).toBeCloseTo(1, 6);
  });

  it('E 天赋寸长寸强：成为队友战技目标 → 下一次攻击风抗穿 +36%（用后即消耗）', () => {
    const policy: PolicyFn = (ctx) => (ctx.id === 'sanyueqi' ? 'skill' : 'basic');
    const on = simulateBattle(cfg([dh(0, 0.05), syq()], { policy, maxTime: 300 }));
    const off = simulateBattle(
      cfg([dh(0, 0.05), syq()], { policy: () => 'basic', maxTime: 300 }),
    );
    const second = (r: R) => hitsOf(r, actsOf(r, 'danheng')[1], 'danheng.basic')[0];
    expect(second(off).total).toBeCloseTo(878.57, 1);
    expect(second(on).total).toBeCloseTo(1194.86, 1); // ×1.36 抗穿
    // 消耗后第三击回到基准
    const third = hitsOf(on, actsOf(on, 'danheng')[2], 'danheng.basic')[0];
    expect(third.total).toBeCloseTo(878.57, 1);
  });

  it('F 星魂1：命中当前 HP ≥50% 目标 → 暴率 +12%', () => {
    const e0 = simulateBattle(cfg([dh(0, 0.05)], { policy: skillOnly }));
    const e1 = simulateBattle(cfg([dh(1, 0.05)], { policy: skillOnly }));
    const crit = (r: R) => factor(hitsOf(r, actsOf(r, 'danheng')[0], 'danheng.skill')[0], 'crit');
    expect(crit(e0)).toBeCloseTo(1.025, 6);
    expect(crit(e1)).toBeCloseTo(1.085, 6); // 1 + (0.05+0.12) × 0.5
  });

  it('G 星魂6：战技/终结技等级 +2（战技 5200→5720、终结技 8000→8640）', () => {
    const e6 = simulateBattle(cfg([dh(6, 0)], { policy: skillOnly, maxTime: 900 }));
    const skill = hitsOf(e6, actsOf(e6, 'danheng')[0], 'danheng.skill')[0];
    expect(factor(skill, 'base')).toBeCloseTo(5720, 6); // 2.86 × 2000
    const ult = e6.events.filter((e) => e.skillCode === 'danheng.ult')[0];
    const ultHit = (ult.hitSeqs ?? []).map((s) => e6.hits[s])[0];
    expect(factor(ultHit, 'base')).toBeCloseTo(8640, 6); // 4.32 × 2000
  });

  it('H 秘技 100207：进战攻击力 +40%（3 回合）', () => {
    const off = simulateBattle(cfg([dh()], { policy: skillOnly, maxTime: 900 }));
    const on = simulateBattle(cfg([dh()], { techniques: true, policy: skillOnly, maxTime: 900 }));
    const base = (r: R) => factor(hitsOf(r, actsOf(r, 'danheng')[0], 'danheng.skill')[0], 'base');
    expect(base(off)).toBeCloseTo(5200, 6);
    expect(base(on)).toBeCloseTo(7280, 6); // 5200 × 1.4
  });

  it('I 星魂4：终结技消灭目标 → 丹恒立即行动', () => {
    const r = simulateBattle(cfg([dh(4)], { policy: skillOnly, maxTime: 600, monster: mon(3000) }));
    expect(notesOf(r).has('danhengE4')).toBe(true);
    const acts = actsOf(r, 'danheng');
    const sameTime = acts.filter((e) => Math.abs(e.time - acts[1].time) < 0.02);
    expect(sameTime.length).toBeGreaterThanOrEqual(2); // 终结技后同刻再动一次
  });
});
