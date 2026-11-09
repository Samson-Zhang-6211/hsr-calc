import { describe, expect, it } from 'vitest';
import { mechanicChips, stagePreset, stagePresets } from './monster-presets';

// ── 关卡机制小标签（第四十四轮）──
// 两页在段信息后面加一行「关卡机制: 血嗜 / 洞穿 …」。这里锁住取值口径：
// 有机制的段要给全（name + desc 都非空）、无机制的段返回空数组（前端据此不渲染那一行）。

describe('关卡机制小标签', () => {
  it('有机制的段：每个机制都给 name + desc，且与预设顺序一致', () => {
    const withMech = stagePresets().filter((s) => s.mechanics.length > 0);
    expect(withMech.length, '没有任何段带机制').toBeGreaterThan(0);
    for (const s of withMech) {
      const chips = mechanicChips(s);
      expect(chips.length, `${s.key} 标签数不对`).toBe(s.mechanics.length);
      chips.forEach((c, i) => {
        expect(c.name, `${s.key} 第 ${i} 个机制缺名`).toBe(s.mechanics[i]!.name);
        expect(c.desc.length, `${s.key}/${c.name} 缺描述`).toBeGreaterThan(0);
        expect(c.key).toBe(c.name);
      });
    }
  });

  it('无机制的段返回空数组（前端不渲染那一行）', () => {
    const plain = stagePresets().filter((s) => s.mechanics.length === 0);
    expect(plain.length).toBeGreaterThan(0);
    for (const s of plain) expect(mechanicChips(s)).toEqual([]);
    expect(mechanicChips(undefined)).toEqual([]);
  });

  it('具体段：混沌其十二下半带「记忆紊流」、仲裁第 2 关带 3 项', () => {
    const moc = stagePreset('moc-p43|12|下半')!;
    expect(mechanicChips(moc).map((c) => c.name)).toEqual(['记忆紊流']);
    const arb2 = stagePreset('arb-p10|2|')!;
    expect(mechanicChips(arb2).map((c) => c.name)).toEqual(['血嗜+', '洞穿+', '不屈']);
    // 展示文案里 desc 用于 title 提示
    expect(mechanicChips(arb2)[0]!.desc.length).toBeGreaterThan(0);
  });
});
