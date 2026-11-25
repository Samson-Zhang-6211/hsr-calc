import { describe, expect, it } from 'vitest';
import { resourceText, unitResourceRows, UNIT_RESOURCE_MAX } from './unit-resources.js';

describe('战场资源 HUD（4.7.51 新增角色；4.7.53 删【热量】）', () => {
  it('状态为空 → 无行（不在场/未开局）', () => {
    expect(unitResourceRows(null)).toEqual([]);
    expect(unitResourceRows(undefined)).toEqual([]);
    expect(unitResourceRows({})).toEqual([]);
  });

  it('艾莲在队 → 只有【咬合力】一行（4.7.53 行迹 point07 删【热量】）', () => {
    const rows = unitResourceRows({ ellenBite: 3 });
    expect(rows.map((r) => r.key)).toEqual(['ellenBite']);
    expect(rows[0].labelKey).toBe('battle.resEllenBite');
    expect(rows[0].max).toBe(UNIT_RESOURCE_MAX.ellenBite);
    expect(resourceText(rows[0])).toBe('3/6');
  });

  it('耀嘉音在队 → 切分音一行（0 层也显示）', () => {
    const rows = unitResourceRows({ yaoSeg: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('yaoSeg');
    expect(resourceText(rows[0])).toBe('0/10');
  });

  it('两人同队 → 两行（咬合力 → 切分音）', () => {
    const rows = unitResourceRows({ yaoSeg: 10, ellenBite: 6 });
    expect(rows.map((r) => r.key)).toEqual(['ellenBite', 'yaoSeg']);
    expect(rows.map(resourceText)).toEqual(['6/6', '10/10']);
  });

  it('无上限的行只显示数值', () => {
    expect(resourceText({ value: 7 })).toBe('7');
  });
});
