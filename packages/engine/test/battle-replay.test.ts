import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  simulateBattle,
  simulateBattleReplay,
  type BattleConfig,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

/**
 * 2026-10-25 攻击动画批：`simulateBattleReplay` 的逐事件状态快照契约。
 *
 * 断言口径（全部为结构/相对断言，不写任何伤害数字）：
 *  - 事件与快照一一对应、顺序一致、引用就是同一个事件对象；
 *  - 与 `simulateBattle` 同路径 → 报告与终态零差异（这是「零行为变更」的守门断言）；
 *  - 每份 status 是独立快照（不是共享可变引用），且最后一份 == 战斗终态。
 */

const ALL_ELEMENTS: Element[] = [
  'Physical',
  'Fire',
  'Ice',
  'Wind',
  'Thunder',
  'Quantum',
  'Imaginary',
];

function panel(element: Element, speed: number, energyRegen: number): MemberPanel {
  return {
    element,
    level: 80,
    hp: 10000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen,
  };
}

function members(): CombatMember[] {
  return [
    { id: 'qingge', panel: panel('Wind', 156, 0.194) },
    { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
    { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
    { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
  ];
}

function monster(hp = 1e9, toughness = 9999): MonsterConfig {
  return {
    level: 90,
    hp,
    resistance: {},
    weaknesses: ALL_ELEMENTS,
    maxToughness: toughness,
    speed: 100,
    enemyClass: 'elite',
  };
}

function config(overrides: Partial<BattleConfig> = {}): BattleConfig {
  return { members: members(), monster: monster(), rounds: 3, maxTime: 200, ...overrides };
}

describe('simulateBattleReplay（逐事件状态快照）', () => {
  it('事件与快照一一对应且顺序一致', () => {
    const { result, steps } = simulateBattleReplay(config());
    expect(steps.length).toBe(result.events.length);
    for (let i = 0; i < steps.length; i += 1) {
      // 同一个事件对象：不是拷贝，明细表/回放用的是同一份数据
      expect(steps[i]!.event).toBe(result.events[i]);
    }
    // 至少真的打起来了（否则上面的循环等于空转）
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it('与 simulateBattle 完全同路径：报告与终态零差异', () => {
    const auto = simulateBattle(config());
    const { result } = simulateBattleReplay(config());
    expect(result.events.length).toBe(auto.events.length);
    expect(result.hits.length).toBe(auto.hits.length);
    expect(result.report.totalDamage).toBe(auto.report.totalDamage);
    expect(result.report.byKind).toEqual(auto.report.byKind);
    expect(result.victory).toBe(auto.victory);
    expect(result.defeated).toBe(auto.defeated);
    expect(result.monsterHpLeft).toBe(auto.monsterHpLeft);
    expect(result.summary).toEqual(auto.summary);
    expect(result.finalState.memberHp).toEqual(auto.finalState.memberHp);
    expect(result.finalState.monsterHp).toBe(auto.finalState.monsterHp);
  });

  it('每份 status 都是独立快照（不是共享可变引用）', () => {
    const { steps } = simulateBattleReplay(config());
    expect(steps.length).toBeGreaterThan(2);
    const zero = steps[0]!.status;
    const last = steps[steps.length - 1]!.status;
    expect(zero).not.toBe(last);
    expect(zero.monsters).not.toBe(last.monsters);
    expect(zero.monsters[0]).not.toBe(last.monsters[0]);
    expect(zero.hp).not.toBe(last.hp);
    // 改一份不应污染另一份（statusOf 逐次新建对象）
    const before = steps[1]!.status.monsters[0]!.hp;
    steps[0]!.status.monsters[0]!.hp = -1;
    expect(steps[1]!.status.monsters[0]!.hp).toBe(before);
  });

  it('最后一份 status == 战斗终态（我方 HP / 护盾 / 木桩）', () => {
    const { result, steps } = simulateBattleReplay(config());
    const final = steps[steps.length - 1]!.status;
    // status.hp / status.shield 是「战斗级成员表」，会额外含忆灵等 id（晴歌 memo / 腾荒龙灵…）；
    // finalState 只列正式成员，故按成员 id 逐一比对（不是整表 toEqual）
    for (const m of result.finalState.memberHp ? Object.keys(result.finalState.memberHp) : []) {
      const id = m as keyof typeof final.hp;
      expect(final.hp[id]).toBeCloseTo(result.finalState.memberHp[id], 6);
      expect(final.shield[id] ?? 0).toBeCloseTo(result.finalState.memberShield[id] ?? 0, 6);
    }
    expect(result.finalState.monsters).toEqual(final.monsters);
    const left = final.monsters.reduce((s, m) => s + m.hp, 0);
    expect(left).toBeCloseTo(result.monsterHpLeft, 6);
  });

  it('敌方木桩 hp 随事件推进只减不增（无治疗型怪时）', () => {
    const { result, steps } = simulateBattleReplay(config({ monster: monster(2e6, 300) }));
    expect(result.hits.length).toBeGreaterThan(0);
    let prev = steps[0]!.status.monsters.map((m) => m.hp);
    for (const s of steps) {
      const next = s.status.monsters.map((m) => m.hp);
      for (let i = 0; i < next.length; i += 1) expect(next[i]!).toBeLessThanOrEqual(prev[i]! + 1e-9);
      prev = next;
    }
  });

  it('能量 / SP / 时间快照为有限非负数', () => {
    const { steps } = simulateBattleReplay(config());
    for (const s of steps) {
      expect(Number.isFinite(s.status.sp)).toBe(true);
      expect(s.status.sp).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.status.time)).toBe(true);
      expect(s.status.time).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(s.status.energy)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      for (const m of s.status.monsters) {
        expect(Number.isFinite(m.hp)).toBe(true);
        expect(m.toughness).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
