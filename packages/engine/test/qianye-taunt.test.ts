import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
  type PolicyFn,
} from '../src/index.js';

// 千冶•刃 1507 嘲讽接线回归（2026-10-29 补接）。
// 原文：150701「残锋，掠尽」/150708「淬锋，断魄」→ **使目标陷入嘲讽状态，持续 1 回合**；
//       150707「十方无赦」秘技 → **使敌方全体陷入嘲讽状态 1 回合** + 自身受到的伤害降低 90%（2 回合）。
// 语义：嘲讽 = 强制该怪攻击的**主目标**为千冶（与「受击概率提高」权重模型分离，见 docs/AGENTS-rogue.md §0）。

function mp(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Fire', level: 80, hp: 30000, attack: 2500, defence: 800,
    critRate: 0.2, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed: 107, energyRegen: 0, ...extra,
  } as MemberPanel;
}
const MON: MonsterConfig = {
  level: 90, hp: 5e8, maxToughness: 3000, speed: 100,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
  enemyClass: 'normal', monsterId: '1004011', attack: 600,
} as MonsterConfig;

const qianye = (): CombatMember => ({ id: 'qianye', panel: mp() });
const clara = (): CombatMember => ({
  id: 'clara',
  panel: mp({ element: 'Physical', hp: 30000, speed: 90 }),
});
function cfg(
  members: CombatMember[],
  opts: { techniques?: boolean; policy?: PolicyFn; maxTime?: number } = {},
): BattleConfig {
  return {
    members,
    monster: MON,
    maxTime: opts.maxTime ?? 300,
    initialSp: 3,
    seed: 1,
    techniques: opts.techniques ?? false,
    policy: opts.policy,
  };
}
type R = BattleResult;
function notesOf(r: R): Set<string> {
  const s = new Set<string>();
  for (const e of r.events) for (const n of e.note ?? []) s.add(n);
  return s;
}
/** 指定怪物的每次攻击命中的我方目标集合 */
function enemyActionTargets(r: R, monId: string): string[][] {
  return r.events
    .filter((e) => e.unitId === monId && (e.enemyHits ?? []).length > 0)
    .map((e) => (e.enemyHits ?? []).map((h) => h.targetId));
}

describe('千冶•刃 1507 嘲讽', () => {
  it('A 普攻 150701 使被攻击目标陷入嘲讽（note qyTaunt）', () => {
    const r = simulateBattle(cfg([qianye()], { policy: () => 'basic' }));
    expect(notesOf(r).has('qyTaunt')).toBe(true);
  });

  it('B 嘲讽 = 强制主目标（且只对被嘲讽的那只怪生效）', () => {
    // 单怪配置会被引擎复制到 monster1|2|3；千冶普攻的默认主目标 = monster2 → 嘲讽只挂在它身上
    const policy: PolicyFn = (ctx) => (ctx.id === 'clara' ? 'skill' : 'basic');
    const r = simulateBattle(cfg([qianye(), clara()], { policy }));
    expect(notesOf(r).has('qyTaunt')).toBe(true);
    const taunted = enemyActionTargets(r, 'monster2');
    expect(taunted.length).toBeGreaterThan(0);
    // 被嘲讽的怪物：每次攻击的主目标都被强制为千冶（攻击必定包含千冶）
    for (const targets of taunted) expect(targets).toContain('qianye');
    // 未被嘲讽的怪物（monster1）仍按权重模型选目标：至少有一次没打到千冶（克拉拉嘲讽权重 +50）
    const free = enemyActionTargets(r, 'monster1');
    expect(free.length).toBeGreaterThan(0);
    expect(free.some((targets) => !targets.includes('qianye'))).toBe(true);
  });

  it('C 秘技 150707：敌方全体嘲讽 + 自身受到的伤害降低 90%（2 回合）', () => {
    const policy: PolicyFn = () => 'basic';
    const off = simulateBattle(cfg([qianye(), clara()], { policy }));
    const on = simulateBattle(cfg([qianye(), clara()], { policy, techniques: true }));
    // 秘技在 t=0 给**三只怪**全挂嘲讽：monster1 首次攻击的主目标也必须是千冶
    const firstMon1 = enemyActionTargets(on, 'monster1')[0];
    expect(firstMon1?.[0]).toBe('qianye');
    // 首次落到千冶身上的敌方伤害：开秘技（−90%）应低于未开（约 1 折）
    const firstQianyeDamage = (r: R) =>
      r.events.flatMap((e) => e.enemyHits ?? []).find((h) => h.targetId === 'qianye')?.damage ?? 0;
    expect(firstQianyeDamage(on)).toBeGreaterThan(0);
    expect(firstQianyeDamage(on)).toBeLessThan(firstQianyeDamage(off) * 0.2);
  });
});
