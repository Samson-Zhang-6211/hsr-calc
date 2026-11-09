import { describe, expect, it } from 'vitest';
import { stagePresets } from './monster-presets';

// ── 段血量两种口径（第四十一轮）──
// `hp` = 游戏原值（该段所有敌人血量合计，与游戏内界面一致）
// `hpBattle` = 本模拟器战斗内**实际需要打掉**的血量：
//   · 普通段：每波只加载前 3 只（波次模型只有 monster1|2|3）→ 各波前 3 只之和
//   · 虚构段：第 1 波按击杀数换波（前 20 只之和），第 2 波起 boss 死亡即换波（只算 boss）
// 之所以单列用例：虚构段的两个数字差一个量级（3.7 亿 vs 千万），
// 界面上必须能看出「为什么打不出界面上的血量」。

describe('段血量口径', () => {
  it('普通段：hpBattle = 各波前 3 只之和，且不超过原值', () => {
    for (const s of stagePresets().filter((x) => x.mode !== 'pure')) {
      const expectBattle = s.waves.reduce((sum, w) => sum + w.slice(0, 3).reduce((a, c) => a + c.hp, 0), 0);
      expect(s.hpBattle, `${s.key} 实战血量口径不对`).toBe(expectBattle);
      // 允许 ±2 的取整误差：段的 hp 是数据里写死的合计，与逐只相加可能差 1
      expect(s.hpBattle, `${s.key} 实战血量超过原值`).toBeLessThanOrEqual(s.hp + 2);
      expect(s.hpBattle, `${s.key} 实战血量非正`).toBeGreaterThan(0);
    }
  });

  it('虚构段：第 1 波按 20 只、之后各波只算 boss，且明显小于原值', () => {
    const pure = stagePresets().filter((x) => x.mode === 'pure');
    expect(pure.length).toBe(3);
    for (const s of pure) {
      const first = s.waves[0]!.slice(0, 20).reduce((a, c) => a + c.hp, 0);
      const rest = s.waves.slice(1).reduce((sum, w) => sum + (w[0]?.hp ?? 0), 0);
      expect(s.hpBattle, `${s.key} 实战血量口径不对`).toBe(first + rest);
      // 小怪潮段的原值至少是实战值的 2 倍（第 1 波 30~41 只只打 20 只，2/3 波只打 boss）
      expect(s.hp, `${s.key} 原值与实战值差距异常`).toBeGreaterThan(s.hpBattle * 2);
    }
  });

  it('虚构其四上半：两个数值锚（原值 192,908,819 / 实战 85,896,779）', () => {
    const s = stagePresets().find((x) => x.key === 'pure-p27|4|上半')!;
    expect(s.hp).toBe(192_908_819);
    expect(s.hpBattle).toBe(85_896_779);
    expect(s.waveClearRule).toBe('pure');
    expect(s.pureKillTarget).toBe(20);
  });

  it('非虚构段不带波次规则，实战血量与原值同源（首 3 只仍在原值内）', () => {
    for (const s of stagePresets().filter((x) => x.mode !== 'pure')) {
      expect(s.waveClearRule).toBeUndefined();
      expect(s.waves.every((w) => w.length <= 3)).toBe(true);
    }
  });
});
