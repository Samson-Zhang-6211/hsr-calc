import { describe, expect, it } from 'vitest';
import { relicSubTierValues, relicSubValue } from './relic-pieces.js';

const AFFIX = { base: 33.87004, step: 4.233755 };

describe('遗器副词条取值（新旧档兼容）', () => {
  it('新版生成档：有 value → 直接用精确值，覆盖 rolls 公式', () => {
    expect(relicSubValue({ rolls: 6, value: 123.456 }, AFFIX)).toBe(123.456);
    // 对照：同 rolls 旧档公式 = 6×base + step×15
    const legacy = 6 * AFFIX.base + AFFIX.step * 15;
    expect(relicSubValue({ rolls: 6 }, AFFIX)).toBeCloseTo(legacy, 9);
    expect(123.456).not.toBeCloseTo(legacy, 6);
  });

  it('旧档回退 rolls 公式（与 engine subAffixRollValue 同值）', () => {
    expect(relicSubValue({ rolls: 1 }, AFFIX)).toBeCloseTo(33.87004, 6);
    expect(relicSubValue({ rolls: 3 }, AFFIX)).toBeCloseTo(
      3 * AFFIX.base + AFFIX.step * 3,
      9,
    );
  });

  it('档位明细：新版逐档值之和 = value；旧档返回 null', () => {
    const tiers = [0, 2, 1];
    const values = relicSubTierValues({ tiers }, AFFIX)!;
    expect(values).toHaveLength(3);
    const sum = values.reduce((a, b) => a + b, 0);
    expect(relicSubValue({ rolls: 3, value: sum }, AFFIX)).toBeCloseTo(sum, 9);
    expect(relicSubTierValues({ tiers: undefined }, AFFIX)).toBeNull();
    expect(relicSubTierValues({}, AFFIX)).toBeNull();
  });
});
