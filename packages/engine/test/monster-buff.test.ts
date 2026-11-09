import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  computeDirectDamage,
  computeElation,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CommonZonesInput,
  type MonsterConfig,
} from '../src/index.js';

/**
 * 怪侧增益统一走 mon.buffs（2026-10-23 用户裁定）：
 * - 减伤多来源**求和**（zoneSnapshot 内 buffSum('dmgReduction') 后作为单条目传入）；
 * - 减伤 ≥ 100% 时每次伤害实例固定 1 点（kind 不变，欢愉仍是欢愉）；
 * - 怪侧 buff 在自己回合末递减（justApplied 当次不减）→ 见 gallagher.test.ts F 的到期断言。
 * 数值来自实跑/公式推导，改动机制须重跑确认。
 */

const neutral: CommonZonesInput = {
  attackerLevel: 80,
  enemyLevel: 80,
  defReduction: 0,
  defIgnore: 0,
  resistance: 0,
  resReduction: 0,
  resPenetration: 0,
  vulnerability: 0,
  damageReductions: [],
  toughness: 'broken',
};

const direct = (damageReductions: number[]) =>
  computeDirectDamage({
    statValue: 2000,
    multiplier: 1,
    damageBonus: 0,
    critRate: 0,
    critDmg: 0,
    common: { ...neutral, damageReductions },
  });

const elation = (damageReductions: number[]) =>
  computeElation({
    elationBase: 2000,
    multiplier: 1,
    elationDegree: 0,
    mirthBonus: 0,
    mode: 'ahaMoment',
    goodWorkReward: 0,
    laughPoints: 0,
    critRate: 0,
    critDmg: 0,
    common: { ...neutral, damageReductions },
  });

describe('怪侧减伤乘区（求和 + ≥100% 固定 1 点）', () => {
  it('A 单条减伤 20% → 总伤 ×0.8', () => {
    const base = direct([]);
    const red = direct([0.2]);
    expect(red.factors.find((f) => f.key === 'reduction')!.value).toBeCloseTo(0.8, 10);
    expect(red.total).toBeCloseTo(base.total * 0.8, 8);
  });

  it('B 减伤 100%（求和后单条 1）→ 每段固定 1 点', () => {
    const r = direct([1]);
    expect(r.factors.find((f) => f.key === 'reduction')!.value).toBe(0);
    expect(r.total).toBe(1);
  });

  it('C 减伤超过 100%（单条 >1）→ 仍固定 1 点', () => {
    expect(direct([1.2]).total).toBe(1);
  });

  it('D 欢愉伤害同样固定 1 点且 kind 不变', () => {
    const r = elation([1]);
    expect(r.kind).toBe('elation');
    expect(r.total).toBe(1);
    // 未达 100% 时欢愉照常吃减伤
    expect(elation([0.2]).total).toBeCloseTo(elation([]).total * 0.8, 8);
  });
});

const ALL: Element[] = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];

const PANEL = {
  level: 80,
  hp: 30000,
  attack: 2000,
  defence: 800,
  speed: 120,
  critRate: 0,
  critDmg: 0,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

function mon(over: Partial<MonsterConfig> = {}): MonsterConfig {
  return {
    level: 90,
    hp: 10_000_000,
    resistance: {},
    weaknesses: [...ALL],
    maxToughness: 1,
    speed: 10,
    attack: 0,
    enemyClass: 'normal',
    ...over,
  };
}

function run(monster: MonsterConfig): BattleResult {
  // 用桑博取样：佩拉战技会先解除该被动减伤（解增益回归见 dispel.test.ts），不适合做被动锚点
  const cfg: BattleConfig = {
    members: [{ id: 'sampo', panel: { ...PANEL, element: 'Wind' } }],
    monster,
    rounds: 1,
    maxTime: 200,
    techniques: false,
    seed: 1,
  } as BattleConfig;
  return simulateBattle(cfg);
}

const firstHitFactor = (r: BattleResult, key: string): number => {
  const act = r.events.find((e) => e.action === 'basic' || e.action === 'skill')!;
  const hit = r.hits.find((h) => h.seq === act.hitSeqs![0])!;
  return hit.factors.find((f) => f.key === key)?.value ?? Number.NaN;
};

describe('怪侧被动减伤走 buff（流年盾纱 8003040）', () => {
  it('E 被动 10% 减伤 → 命中 reduction 因子 0.9', () => {
    expect(firstHitFactor(run(mon({ monsterId: '8003040' })), 'reduction')).toBeCloseTo(0.9, 10);
  });

  it('F 无 monsterId 的旧木桩不受影响（reduction = 1）', () => {
    expect(firstHitFactor(run(mon()), 'reduction')).toBe(1);
  });
});
