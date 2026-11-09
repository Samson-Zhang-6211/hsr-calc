import { describe, expect, it } from 'vitest';
import { mechanicIdsFor } from '@hsr-calc/engine';
import { stagePresets, stagePackViews } from './monster-presets.js';

// ── 关卡机制下发链（2026-10-30 第二十轮）──
// 数据里「记忆紊流 / 末法余烬」挂在**包级 `modeMechanics`**，而页面只读 `stage.mechanics`
// 时机制永远到不了战斗 → 段预设改为 `half.mechanics ?? stage.mechanics ?? pack.modeMechanics`。

describe('关卡机制下发链', () => {
  it('混沌 P43 每段都带「记忆紊流」→ miasma', () => {
    const secs = stagePresets().filter((s) => s.packId === 'moc-p43');
    expect(secs.length).toBeGreaterThan(0);
    for (const s of secs) {
      expect(s.mechanics.map((m) => m.name)).toContain('记忆紊流');
      expect(mechanicIdsFor(s.mechanics.map((m) => m.name))).toContain('miasma');
    }
  });

  it('末日 P21 每段都带「末法余烬」→ ember', () => {
    const secs = stagePresets().filter((s) => s.packId === 'apo-p21');
    expect(secs.length).toBeGreaterThan(0);
    for (const s of secs) {
      expect(s.mechanics.map((m) => m.name)).toContain('末法余烬');
      expect(mechanicIdsFor(s.mechanics.map((m) => m.name))).toContain('ember');
    }
  });

  it('仲裁段带自己的关卡机制（血嗜/洞穿 等），虚构无机制，P44 带「物竞天择」', () => {
    const arb = stagePresets().filter((s) => s.packId === 'arb-p10');
    expect(arb.length).toBe(5);
    expect(arb.every((s) => s.mechanics.length > 0)).toBe(true);
    const arbIds = arb.flatMap((s) => mechanicIdsFor(s.mechanics.map((m) => m.name)));
    expect(arbIds).toContain('bloodthirst');
    // 虚构 P27 本期无模式机制
    for (const s of stagePresets().filter((x) => x.packId === 'pure-p27')) {
      expect(s.mechanics).toEqual([]);
    }
    // 混沌 P44（2026-11-06 用户录像 t≈84s 关卡页原文）：
    // 「我方目标施放终结技时获得5个笑点」「每个轮开始时阿哈获得固定计入20笑点的额外回合」
    for (const s of stagePresets().filter((x) => x.packId === 'moc-p44')) {
      expect(s.mechanics.map((m) => m.name)).toContain('物竞天择');
      expect(mechanicIdsFor(s.mechanics.map((m) => m.name))).toContain('naturalSelection');
    }
  });

  it('包视图里的段与全量段一致（每段都能拿到机制）', () => {
    const all = stagePresets();
    const fromViews = stagePackViews().flatMap((v) => v.sections);
    expect(fromViews.length).toBe(all.length);
    for (const s of fromViews) expect(Array.isArray(s.mechanics)).toBe(true);
  });
});
