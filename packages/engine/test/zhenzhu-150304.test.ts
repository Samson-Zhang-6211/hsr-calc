import { describe, expect, it } from 'vitest';
import { zhenzhuLowHpDr } from '../src/index.js';

/**
 * 真珠 1503 天赋150304 #4：我方目标当前 HP% ≤ #1=50% → 受到的伤害降低 #4=30%
 * （2026-11-02 用户裁定：全队享受、受击**前** HP% 判定；挂钩在 `memberDamageReduction` 统一入口）
 * 参数实读：`skillParams('150304', 10)` = [0.5, 0.6, 50, 0.3, 200]
 */
const P = [0.5, 0.6, 50, 0.3, 200] as const;

describe('真珠 150304 #4（低血减伤）', () => {
  it('低于/等于 50% 血 → 减伤 30%；高于 → 0', () => {
    expect(zhenzhuLowHpDr(0.45, P)).toBeCloseTo(0.3, 12);
    expect(zhenzhuLowHpDr(0.5, P)).toBeCloseTo(0.3, 12); // 边界「小于等于」也算
    expect(zhenzhuLowHpDr(0.5001, P)).toBe(0);
    expect(zhenzhuLowHpDr(1, P)).toBe(0);
  });

  it('参数表缺项时用条款默认值（0.5 / 0.3），不抛错', () => {
    expect(zhenzhuLowHpDr(0.4, [])).toBeCloseTo(0.3, 12);
    expect(zhenzhuLowHpDr(0.6, [])).toBe(0);
    expect(zhenzhuLowHpDr(0.4, [0.5, 0.6, 50, 0])).toBe(0); // #4=0 → 不减伤
  });
});
