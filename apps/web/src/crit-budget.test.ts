import { describe, expect, it } from 'vitest';
import { critBudget } from './crit-budget.js';
import { fetchAllocConfig } from './game-data.js';

describe('critBudget（分配整套爆率额度，2026-10-08 裁定）', () => {
  const CR = { base: 0.02592, step: 0.00324 };

  it('默认口径：95% 上限 − 5% 来源 → 27 roll、60% 阈值', () => {
    const r = critBudget({ source: 0.05, target: 0.95, ...CR });
    expect(r.maxRolls).toBe(27); // floor(0.90 / 0.0324)
    expect(r.minValue).toBeCloseTo(0.6 * 27 * 0.0324, 10); // 0.52488
  });

  it('来源已超上限（如镜流行迹 45% > 35% 上限）→ 额度 0', () => {
    expect(critBudget({ source: 0.45, target: 0.35, ...CR })).toEqual({
      maxRolls: 0,
      minValue: 0,
    });
  });

  it('角色上限为 0（彦卿）→ 额度 0', () => {
    expect(critBudget({ source: 0.05, target: 0, ...CR })).toEqual({
      maxRolls: 0,
      minValue: 0,
    });
  });

  it('恰好整除边界：预算 = 10×最坏档 → 精确 10 roll', () => {
    const r = critBudget({ source: 0.95 - 10 * 0.0324, target: 0.95, ...CR });
    expect(r.maxRolls).toBe(10);
    expect(r.minValue).toBeCloseTo(0.6 * 10 * 0.0324, 10);
  });
});

describe('fetchAllocConfig（meta.substatWeights / meta.critRateTarget）', () => {
  it('空 id 返 null', async () => {
    expect(await fetchAllocConfig('')).toBeNull();
  });

  it('晴歌 1512：权重键与爆率上限 0.45', async () => {
    const cfg = await fetchAllocConfig('1512');
    expect(cfg).not.toBeNull();
    expect(cfg?.critRateTarget).toBeCloseTo(0.45, 10);
    expect(cfg?.weights).toBeTruthy();
    expect(cfg?.weights?.CriticalDamageBase).toBe(5);
    expect(cfg?.weights?.CriticalChanceBase).toBe(3);
    expect(cfg?.weights?.HPAddedRatio).toBe(5);
    expect(cfg?.weights?.SpeedDelta).toBe(3);
  });

  it('默认爆率角色 1204：critRateTarget 缺省 0.95 仍返回权重', async () => {
    const cfg = await fetchAllocConfig('1204');
    expect(cfg).not.toBeNull();
    expect(cfg?.critRateTarget).toBeCloseTo(0.95, 10);
    expect(cfg?.weights?.CriticalDamageBase).toBe(5);
    expect(cfg?.weights?.AttackAddedRatio).toBe(3);
  });

  it('未知 id 返 null', async () => {
    expect(await fetchAllocConfig('does-not-exist')).toBeNull();
  });
});
