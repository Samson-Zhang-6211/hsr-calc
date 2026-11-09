import { describe, expect, it } from 'vitest';
import { computeMonsterStats } from './monster-stats.js';

// 锚点 = nanoka.cc 怪物详情页 3003010「惊梦剧团的十七分熟」截图（2026-10-09 用户提供）
describe('computeMonsterStats（怪物面板换算，2026-10-09 破解）', () => {
  it('3003010 Lv50 与截图逐项吻合', async () => {
    const p = await computeMonsterStats('3003010', 50);
    expect(p).not.toBeNull();
    expect(p!.level).toBe(50);
    expect(p!.hp).toBe(37063);
    expect(p!.attack).toBe(234);
    expect(p!.defence).toBe(700);
    expect(p!.speed).toBe(100);
    expect(p!.stance).toBe(480);
    expect(p!.effectHit).toBe(0);
    expect(p!.effectRes).toBeCloseTo(0.2, 10);
  });

  it('3003010 Lv74 与截图逐项吻合（含速度成长与效果命中）', async () => {
    const p = await computeMonsterStats('3003010', 74);
    expect(p).not.toBeNull();
    expect(p!.level).toBe(74);
    expect(p!.hp).toBe(194513);
    expect(p!.attack).toBe(482);
    expect(p!.defence).toBe(940);
    expect(p!.speed).toBe(110);
    expect(p!.stance).toBe(480);
    expect(p!.effectHit).toBeCloseTo(0.192, 10);
    expect(p!.effectRes).toBeCloseTo(0.296, 10);
  });

  it('等级 clamp 到 [1,120]；不存在的怪物 id 返回 null', async () => {
    const p = await computeMonsterStats('3003010', 999);
    expect(p!.level).toBe(120);
    const missing = await computeMonsterStats('does-not-exist', 50);
    expect(missing).toBeNull();
  });
});
