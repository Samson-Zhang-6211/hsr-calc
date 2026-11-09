import { describe, expect, it } from 'vitest';
import { fillMonsterFields } from './monster-fill.js';

// 2026-10 裁定2：选怪+等级 → 自动填充全套（覆盖手配；防御值战斗公式不消费不填）
describe('fillMonsterFields（木桩自动填充）', () => {
  it('3003010 Lv74 输出可回填字符串集', async () => {
    const v = await fillMonsterFields('3003010', 74);
    expect(v).not.toBeNull();
    expect(v!.hp).toBe('194513');
    expect(v!.attack).toBe('482');
    expect(v!.speed).toBe('110');
    expect(v!.toughness).toBe('480');
    expect(v!.effectRes).toBe('29.6'); // 0.296 → 百分比字符串
    expect(v!.effectHit).toBe('19.2'); // 0.192 → 百分比字符串
  });

  it('空 id / 等级无效 / 未知怪物 → null（保持手配值）', async () => {
    expect(await fillMonsterFields('', 74)).toBeNull();
    expect(await fillMonsterFields('3003010', 0)).toBeNull();
    expect(await fillMonsterFields('3003010', Number.NaN)).toBeNull();
    expect(await fillMonsterFields('does-not-exist', 74)).toBeNull();
  });
});
