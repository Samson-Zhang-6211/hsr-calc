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

// Archer 1015（量子/巡猎）接入回归（2026-10-29 接入；裁定见 docs/AGENTS-rogue.md §8）。
// 锚点来自 test/archer-dump.test.ts 实跑（%TEMP%/opencode/archer-dump.txt）。
// 关键口径：【回路连接】战技不结束回合（instantAction 再动，不推进时间）；
// 战技 +100% 伤害/层（上限 2，E6 3）；天赋「心眼（真）」= 队友攻击事件消耗 1 充能 → 200% 追击 + 回 1 SP；
// 充能上限 4（进战 point07 +1 / 终结技 +2 / 秘技 +1）；point06 → SP 上限 +2。

function mp(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Quantum', level: 80, hp: 12000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed: 110, energyRegen: 0, ...extra,
  };
}
function mon(hp = 5e8, toughness = 9999): MonsterConfig {
  return {
    level: 90, hp, maxToughness: toughness, speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Quantum', 'Physical'], enemyClass: 'normal', monsterId: '1012010', attack: 0,
  } as MonsterConfig;
}
const ar = (eidolonLevel = 0): CombatMember => ({ id: 'archer', panel: mp(), eidolonLevel });
const syq = (): CombatMember => ({ id: 'sanyueqi', panel: mp({ element: 'Ice', speed: 101 }) });
function cfg(
  members: CombatMember[],
  opts: { techniques?: boolean; maxTime?: number; policy?: PolicyFn; monster?: MonsterConfig; seed?: number; initialSp?: number } = {},
): BattleConfig {
  return {
    members,
    monster: opts.monster ?? mon(),
    maxTime: opts.maxTime ?? 400,
    initialSp: opts.initialSp ?? 6,
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
function ultHit(r: R) {
  const ult = r.events.find((e) => e.skillCode === 'archer.ult');
  return ult ? (ult.hitSeqs ?? []).map((s) => r.hits[s])[0] : undefined;
}

describe('Archer 1015（量子/巡猎）', () => {
  it('A 普攻：数据只有 1~9 级，Lv6 基准 = 100% 攻击力', () => {
    const r = simulateBattle(cfg([ar()], { policy: basicOnly, initialSp: 3 }));
    const first = actsOf(r, 'archer')[0];
    expect(first.spAfter).toBe(4);
    expect(first.energyAfter).toBeCloseTo(130, 2); // 初战 110 + 20
    const hit = hitsOf(r, first, 'archer.basic')[0];
    expect(factor(hit, 'base')).toBeCloseTo(2000, 6);
    expect(hit.total).toBeCloseTo(878.57, 1);
  });

  it('B 战技：360% + 耗 2 SP；【回路连接】不结束回合（同刻再动）', () => {
    const r = simulateBattle(cfg([ar()], { policy: skillOnly }));
    const acts = actsOf(r, 'archer');
    const first = acts[0];
    expect(first.skillCode).toBe('archer.skill');
    expect(first.spAfter).toBe(3); // 6 − 2（消耗）… 首回合 E6 未开，脚本内为 5→3
    const hit = hitsOf(r, first, 'archer.skill')[0];
    expect(factor(hit, 'base')).toBeCloseTo(7200, 6); // 2000 × 3.6
    expect(hit.total).toBeCloseTo(3162.86, 1);
    // 回路连接：同刻连续两次战技（不推进时间）
    expect(acts[1].time).toBeCloseTo(acts[0].time, 2);
    expect(notesOf(r).has('archerCircuit')).toBe(true);
    // 第二段吃 1 层增伤（+100% → 伤害区 ×2）
    expect(factor(hitsOf(r, acts[1], 'archer.skill')[0], 'damageBonus')).toBeCloseTo(2, 6);
  });

  it('C 回路连接退出：SP < 2 或满 5 次 → 退出并清零层数', () => {
    const r = simulateBattle(cfg([ar()], { policy: skillOnly }));
    expect(notesOf(r).has('archerCircuitEnd')).toBe(true);
    // 退出后下一次行动为普攻或重新从 0 层起算
    const third = actsOf(r, 'archer')[2];
    const thirdSkill = hitsOf(r, third, 'archer.skill')[0];
    if (thirdSkill) expect(factor(thirdSkill, 'damageBonus')).toBeCloseTo(1, 6);
  });

  it('D 终结技：1000% 单体 + 回 2 充能；E4 伤害 +150%', () => {
    const e0 = simulateBattle(cfg([ar()], { policy: skillOnly, maxTime: 545 }));
    const h0 = ultHit(e0);
    expect(factor(h0, 'base')).toBeCloseTo(20000, 6); // 2000 × 10
    expect(h0!.total).toBeCloseTo(8785.71, 1);
    const e4 = simulateBattle(cfg([ar(4)], { policy: skillOnly, maxTime: 545 }));
    const h4 = ultHit(e4);
    expect(factor(h4, 'damageBonus')).toBeCloseTo(2.5, 6); // 1 + 1.5
  });

  it('E 星魂2：终结技 → 量子抗性 −20% + 植入量子弱点', () => {
    const r = simulateBattle(cfg([ar(2)], { policy: skillOnly, maxTime: 900 }));
    expect(notesOf(r).has('archerE2')).toBe(true);
    // 「量子抗性 −20%」走**分属性减抗**（resReductionQuantum）→ 抗性区因子 1 → 1.2（只影响量子段）
    expect(r.hits.some((h) => factor(h, 'resist') === 1.2)).toBe(true);
    // 非量子段不吃（本队只有 Archer 时全部为量子段，故只校验抗性因子恰为 1.2 而非 1.4 叠加）
    expect(r.hits.every((h) => (factor(h, 'resist') ?? 1) <= 1.2001)).toBe(true);
    const e0 = simulateBattle(cfg([ar(0)], { policy: skillOnly, maxTime: 900 }));
    expect(e0.hits.some((h) => factor(h, 'resist') === 1.2)).toBe(false);
  });

  it('F 星魂6：回合开始回 1 SP + 战技层数上限 3 + 战技无视 20% 防御', () => {
    const e6 = simulateBattle(cfg([ar(6)], { policy: skillOnly, maxTime: 545 }));
    const acts = actsOf(e6, 'archer');
    // 层数上限 3：出现 damageBonus = 4（1 + 3 层）的战技段
    const dmgs = acts.flatMap((a) => hitsOf(e6, a, 'archer.skill')).map((h) => factor(h, 'damageBonus'));
    expect(dmgs.some((d) => d && d > 3.5)).toBe(true);
    expect(dmgs.every((d) => (d ?? 0) <= 4.0001)).toBe(true);
    // 无视 20% 防御：防御区因子高于 E0
    const e0 = simulateBattle(cfg([ar(0)], { policy: skillOnly, maxTime: 545 }));
    const def6 = factor(hitsOf(e6, acts[0], 'archer.skill')[0], 'defense')!;
    const def0 = factor(hitsOf(e0, actsOf(e0, 'archer')[0], 'archer.skill')[0], 'defense')!;
    expect(def6).toBeGreaterThan(def0);
  });

  it('G 天赋心眼（真）：队友攻击事件 → 消耗 1 充能发动 200% 量子追击 + 回 1 SP', () => {
    const r = simulateBattle(cfg([ar(), syq()], { policy: basicOnly }));
    const talent = r.hits.filter((h) => h.skillCode === 'archer.talent');
    expect(talent.length).toBeGreaterThan(0);
    expect(factor(talent[0], 'base')).toBeCloseTo(4000, 6); // 2000 × 2
    // 追击段挂在队友的行动事件里
    const ev = r.events.find((e) => e.unitId === 'sanyueqi' && (e.note ?? []).includes('archerTalent'));
    expect(ev).toBeDefined();
    // Archer 自己的攻击不触发
    const solo = simulateBattle(cfg([ar()], { policy: basicOnly }));
    expect(solo.hits.some((h) => h.skillCode === 'archer.talent')).toBe(false);
  });

  it('H point06 投影魔术：战技点上限 +2（5 → 7）', () => {
    // 初始 SP 由 MAX_SP=5 钳制，靠两次普攻 +1 累积到上限 7
    const r = simulateBattle(cfg([ar()], { policy: basicOnly, initialSp: 7 }));
    const acts = actsOf(r, 'archer');
    expect(acts[0].spAfter).toBe(6);
    expect(acts[1].spAfter).toBe(7); // 无 Archer 时上限为 5
  });

  it('I point08 守护者：获得战技点后 SP ≥4 → 暴伤 +120%（暴击期望 1.025 → 1.085）', () => {
    // 初始 SP=5（钳制）→ 首击 1.025；首击后 SP 仍 5（已达上限）→ 次击吃 point08 → 1.085
    const r = simulateBattle(cfg([ar()], { policy: basicOnly, initialSp: 3 }));
    const acts = actsOf(r, 'archer');
    expect(factor(hitsOf(r, acts[0], 'archer.basic')[0], 'crit')).toBeCloseTo(1.025, 6);
    // 3 → 4：本次行动结束获得 SP 后满足 ≥4
    expect(factor(hitsOf(r, acts[1], 'archer.basic')[0], 'crit')).toBeCloseTo(1.085, 6);
  });
});
