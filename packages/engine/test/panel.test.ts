import { describe, expect, it } from 'vitest';
import {
  categorizeStat,
  composePanel,
  elementOfStat,
  grownValue,
  mainAffixValue,
  minPromotionForLevel,
  resolvePromotion,
  subAffixRollValue,
} from '../src/panel.js';

describe('遗器词条值', () => {
  it('主词条 = base + step×强化等级（fribbels 表验证案例）', () => {
    // 5星头部 HPDelta：+15 → 705.6（BWIKI 显示 705）
    expect(mainAffixValue({ base: 112.896, step: 39.5136 }, 15)).toBeCloseTo(
      705.6,
      6,
    );
    expect(Math.floor(mainAffixValue({ base: 112.896, step: 39.5136 }, 15))).toBe(705);
    // 5星球生命%：+15 → 43.2%
    expect(mainAffixValue({ base: 0.06912, step: 0.024192 }, 15)).toBeCloseTo(
      0.432,
      9,
    );
    // +0 → base
    expect(mainAffixValue({ base: 112.896, step: 39.5136 }, 0)).toBeCloseTo(112.896, 9);
  });

  it('副词条 n 次 roll 合计（第 i 次 = base+step×i）', () => {
    const affix = { base: 33.87004, step: 4.233755 };
    expect(subAffixRollValue(affix, 1)).toBeCloseTo(33.87004, 6);
    expect(subAffixRollValue(affix, 2)).toBeCloseTo(33.87004 * 2 + 4.233755, 6);
    expect(subAffixRollValue(affix, 0)).toBe(0);
    expect(subAffixRollValue(affix, -3)).toBe(0);
  });
});

describe('成长公式', () => {
  it('三月七段0 生命：144 + 7.2×(lv−1)', () => {
    expect(grownValue({ base: 144, add: 7.2 }, 1)).toBeCloseTo(144, 9);
    // lv20 突破后 → 段1：201.6 + 7.2×19 = 338.4（BWIKI 显示 338，floor）
    expect(grownValue({ base: 201.6, add: 7.2 }, 20)).toBeCloseTo(338.4, 9);
    // lv80 → 段6：489.6 + 7.2×79 = 1058.4
    expect(grownValue({ base: 489.6, add: 7.2 }, 80)).toBeCloseTo(1058.4, 9);
  });

  it('光锥段6 lv80：538.56 + 7.92×79 = 1164.24（5星标准白值 1164）', () => {
    expect(grownValue({ base: 538.56, add: 7.92 }, 80)).toBeCloseTo(1164.24, 9);
    expect(Math.floor(grownValue({ base: 538.56, add: 7.92 }, 80))).toBe(1164);
    // 攻击：269.28 + 3.96×79 = 582.12 → 显示 582
    expect(Math.floor(grownValue({ base: 269.28, add: 3.96 }, 80))).toBe(582);
  });

  it('突破段选择：等级最低要求兜底', () => {
    expect(minPromotionForLevel(1)).toBe(0);
    expect(minPromotionForLevel(20)).toBe(0);
    expect(minPromotionForLevel(21)).toBe(1);
    expect(minPromotionForLevel(71)).toBe(6);
    expect(minPromotionForLevel(80)).toBe(6);
    // 用户选 0 + lv45 → 至少段 3；用户选 5 + lv30 → 段 5
    expect(resolvePromotion(45, 0)).toBe(3);
    expect(resolvePromotion(30, 5)).toBe(5);
    // 越界收敛
    expect(resolvePromotion(99, 9)).toBe(6);
    expect(resolvePromotion(-5, -1)).toBe(0);
  });
});

describe('词条分类', () => {
  it('已识别词条', () => {
    expect(categorizeStat('HPDelta')).toBe('flatHp');
    expect(categorizeStat('AttackAddedRatio')).toBe('pctAtk');
    expect(categorizeStat('SpeedDelta')).toBe('flatSpd');
    expect(categorizeStat('SpeedAddedRatio')).toBe('pctSpd');
    expect(categorizeStat('CriticalChanceBase')).toBe('critRate');
    expect(categorizeStat('BreakDamageAddedRatioBase')).toBe('breakEffect');
    expect(categorizeStat('BreakDamageAddedRatio')).toBe('breakDmgBoost');
    expect(categorizeStat('IceAddedRatio')).toBe('elementDmg');
    expect(elementOfStat('IceAddedRatio')).toBe('Ice');
    expect(elementOfStat('AttackAddedRatio')).toBeNull();
  });

  it('未识别词条返回 null（不硬接）', () => {
    expect(categorizeStat('SomeUnknownProperty')).toBeNull();
    expect(categorizeStat('')).toBeNull();
  });
});

describe('面板合成', () => {
  it('三月七80级 + 80级光锥 + 词条样本', () => {
    const panel = composePanel({
      character: { hp: 1058.4, atk: 511.56, def: 573.3, speed: 101 },
      lightcone: { hp: 1164.24, atk: 582.12, def: 396.9, speed: 0 },
      additions: [
        { property: 'AttackAddedRatio', value: 0.34 },
        { property: 'HPDelta', value: 705 },
        { property: 'SpeedDelta', value: 25 },
        { property: 'CriticalChanceBase', value: 0.07992 },
        { property: 'IceAddedRatio', value: 0.3888 },
        { property: 'SomeUnknownProperty', value: 9 },
      ],
    });
    // 白值和 2222.64 生命 + 705 固定
    expect(panel.hp).toBeCloseTo(2222.64 + 705, 9);
    // (511.56+582.12)×1.34
    expect(panel.atk).toBeCloseTo(1093.68 * 1.34, 9);
    expect(panel.def).toBeCloseTo(573.3 + 396.9, 9);
    expect(panel.speed).toBeCloseTo(126, 9);
    expect(panel.critRate).toBeCloseTo(0.05 + 0.07992, 9);
    expect(panel.critDmg).toBeCloseTo(0.5, 9);
    expect(panel.elementDmg['Ice']).toBeCloseTo(0.3888, 9);
    expect(panel.unrecognized).toHaveLength(1);
    expect(panel.unrecognized[0].property).toBe('SomeUnknownProperty');
  });

  it('无光锥时仅用角色白值；基础暴击 5%/50%', () => {
    const panel = composePanel({
      character: { hp: 144, atk: 69.6, def: 78, speed: 101 },
      additions: [],
    });
    expect(panel.hp).toBeCloseTo(144, 9);
    expect(panel.critRate).toBeCloseTo(0.05, 9);
    expect(panel.critDmg).toBeCloseTo(0.5, 9);
    expect(panel.breakEffect).toBeCloseTo(0, 9);
    expect(panel.unrecognized).toHaveLength(0);
  });

  it('多来源同词条累加', () => {
    const panel = composePanel({
      character: { hp: 1000, atk: 1000, def: 1000, speed: 100 },
      additions: [
        { property: 'AttackAddedRatio', value: 0.1 },
        { property: 'AttackAddedRatio', value: 0.2 },
        { property: 'AttackDelta', value: 50 },
      ],
    });
    expect(panel.atk).toBeCloseTo(1000 * 1.3 + 50, 9);
  });

  it('速度百分比 SpeedAddedRatio：(基础+固定速度)×(1+Σ%)（2026-10-10 裁定接入）', () => {
    const panel = composePanel({
      character: { hp: 1000, atk: 1000, def: 1000, speed: 100 },
      additions: [
        { property: 'SpeedDelta', value: 12 },
        { property: 'SpeedAddedRatio', value: 0.06 },
      ],
    });
    expect(panel.speed).toBeCloseTo((100 + 12) * 1.06, 9);
    // 仅速度%、无固定值时按角色基础速度乘算
    const onlyPct = composePanel({
      character: { hp: 1000, atk: 1000, def: 1000, speed: 100 },
      additions: [{ property: 'SpeedAddedRatio', value: 0.12 }],
    });
    expect(onlyPct.speed).toBeCloseTo(112, 9);
  });
});
