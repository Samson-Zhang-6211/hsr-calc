import { describe, expect, it } from 'vitest';
import {
  bonusZone,
  critZone,
  defenseZone,
  reductionZone,
  resistZone,
  toughnessZone,
  vulnZone,
} from '../src/zones.js';

describe('zones', () => {
  it('防御区：80 级打 95 级 = 100/215（超击破攻略验算案例）', () => {
    expect(
      defenseZone({
        attackerLevel: 80,
        enemyLevel: 95,
        defReduction: 0,
        defIgnore: 0,
      }),
    ).toBeCloseTo(100 / 215, 12);
  });

  it('防御区：30 级打 26 级 = 500/960（米游社击破验算案例）', () => {
    expect(
      defenseZone({
        attackerLevel: 30,
        enemyLevel: 26,
        defReduction: 0,
        defIgnore: 0,
      }),
    ).toBeCloseTo(500 / 960, 12);
  });

  it('防御区：减防与无视防御同入 (1−减防−无视防御)', () => {
    expect(
      defenseZone({
        attackerLevel: 80,
        enemyLevel: 80,
        defReduction: 0.4,
        defIgnore: 0.1,
      }),
    ).toBeCloseTo(100 / (100 + 100 * 0.5), 12);
  });

  it('抗性区：溢出全额转增伤（0% 抗性吃 20% 穿透 = 1.2）', () => {
    expect(
      resistZone({ resistance: 0, resReduction: 0, resPenetration: 0.2 }),
    ).toBeCloseTo(1.2, 12);
  });

  it('抗性区：减抗与穿透加算，负抗性可 > 1', () => {
    expect(
      resistZone({ resistance: 0.2, resReduction: 0.3, resPenetration: 0.1 }),
    ).toBeCloseTo(1.2, 12);
  });

  it('增伤区/易伤区为 1+x（真伤区已废除，2026-10 改为独立真伤类型）', () => {
    expect(bonusZone(0.5)).toBeCloseTo(1.5, 12);
    expect(vulnZone(0.26)).toBeCloseTo(1.26, 12);
  });

  it('暴击区：期望/必暴/不暴三种模式', () => {
    expect(critZone({ critRate: 0.5, critDmg: 1.0 })).toBeCloseTo(1.5, 12);
    expect(
      critZone({ critRate: 0.5, critDmg: 1.274, mode: 'crit' }),
    ).toBeCloseTo(2.274, 12);
    expect(
      critZone({ critRate: 0.5, critDmg: 1.274, mode: 'normal' }),
    ).toBe(1);
  });

  it('减伤区内乘算', () => {
    expect(reductionZone([0.3, 0.5])).toBeCloseTo(0.35, 12);
    expect(reductionZone([])).toBe(1);
  });

  it('韧性减伤区：未破韧 0.9，破韧/不适用 1', () => {
    expect(toughnessZone('unbroken')).toBeCloseTo(0.9, 12);
    expect(toughnessZone('broken')).toBe(1);
    expect(toughnessZone('notApplied')).toBe(1);
  });
});
