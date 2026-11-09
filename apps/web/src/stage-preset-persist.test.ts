import { describe, expect, it } from 'vitest';
import { sanitizeStagePresetKey, stagePreset, stagePresets } from './monster-presets';

// ── 关卡段选择持久化（第四十七轮）──
// 两页把「上次选中的段 key」存进 localStorage，刷新后恢复。
// 这里锁住清洗逻辑：**只接受当前仍存在的段**，其余一律回落空串（= 不用预设），
// 否则旧版本/手改的 key 会让页面带着一个查不到的段开打。

describe('段 key 清洗', () => {
  it('当前存在的段原样保留', () => {
    for (const s of stagePresets()) {
      expect(sanitizeStagePresetKey(s.key), `${s.key} 被误清`).toBe(s.key);
      expect(stagePreset(sanitizeStagePresetKey(s.key))?.key).toBe(s.key);
    }
  });

  it('空值 / 过期 key / 手改 key 一律回落空串', () => {
    expect(sanitizeStagePresetKey('')).toBe('');
    expect(sanitizeStagePresetKey(null)).toBe('');
    expect(sanitizeStagePresetKey(undefined)).toBe('');
    // 旧版本关卡号、拼接错误、乱写
    expect(sanitizeStagePresetKey('moc-p43|99|上半')).toBe('');
    expect(sanitizeStagePresetKey('moc-p43|12')).toBe('');
    expect(sanitizeStagePresetKey('not-a-key')).toBe('');
    expect(sanitizeStagePresetKey('arb-p10|6|')).toBe('');
    // 清洗后一定能取到段（或空串），不会返回「查不到但非空」
    for (const bad of ['moc-p43|99|上半', 'xx|1|', '  ']) {
      const cleaned = sanitizeStagePresetKey(bad);
      expect(cleaned === '' || stagePreset(cleaned) !== undefined).toBe(true);
    }
  });
});
