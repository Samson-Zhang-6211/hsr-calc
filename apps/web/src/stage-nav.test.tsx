import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import './i18n.js';
import { StageNavRow } from './stage-mechanics.js';
import { adjacentStagePreset, stagePreset, stagePresets } from './monster-presets';

/**
 * 上一段 / 下一段（2026-10-30 第四十八轮）。
 *
 * 顺序 = `stagePresets()`（包 → 关 → 上半/下半），**跨关卡、跨包连续**：
 * 末段没有「下一段」、首段没有「上一段」，此时对应按钮禁用且不出 `title`。
 */

const noop = () => {};

const render = (key: string) =>
  renderToStaticMarkup(
    <StageNavRow preset={key ? stagePreset(key) : undefined} onPick={noop} prevLabel="上一段" nextLabel="下一段" />,
  );

describe('上一段 / 下一段', () => {
  it('顺序连续：17 个段首尾相接，跨关卡与跨包都能跳', () => {
    const list = stagePresets();
    expect(list.length).toBe(17);
    // 首段没有上一段、末段没有下一段
    expect(adjacentStagePreset(list[0]!.key, -1)).toBeUndefined();
    expect(adjacentStagePreset(list.at(-1)!.key, 1)).toBeUndefined();
    // 中间段前后可跳，且构成闭环
    for (let i = 1; i < list.length - 1; i += 1) {
      const cur = list[i]!;
      expect(adjacentStagePreset(cur.key, -1)?.key, `${cur.key} 上一段不对`).toBe(list[i - 1]!.key);
      expect(adjacentStagePreset(cur.key, 1)?.key, `${cur.key} 下一段不对`).toBe(list[i + 1]!.key);
    }
  });

  it('跨包：混沌末段的下一个是虚构首段', () => {
    const mocLast = stagePresets()
      .filter((s) => s.packId === 'moc-p43')
      .at(-1)!;
    const next = adjacentStagePreset(mocLast.key, 1)!;
    expect(next.packId).toBe('moc-p44');
    // 上半 → 下半 也算下一段
    const upper = stagePreset('moc-p43|12|上半')!;
    expect(adjacentStagePreset(upper.key, 1)?.half).toBe('下半');
  });

  it('未选段 / 非法 key 不返回任何段', () => {
    expect(adjacentStagePreset('', 1)).toBeUndefined();
    expect(adjacentStagePreset('', -1)).toBeUndefined();
    expect(adjacentStagePreset('not-a-key', 1)).toBeUndefined();
  });

  it('渲染：中间段两个按钮都可用；首段上一段禁用；末段下一段禁用；未选段不渲染', () => {
    const list = stagePresets();
    const mid = render(list[5]!.key);
    expect(mid).toContain('上一段');
    expect(mid).toContain('下一段');
    expect((mid.match(/disabled=""/g) ?? []).length, '中间段不该有禁用按钮').toBe(0);

    const first = render(list[0]!.key);
    expect(first).toContain('disabled=""');
    // 首段的「上一段」禁用，但「下一段」仍可点
    expect(first.match(/disabled=""/g)?.length).toBe(1);

    const last = render(list.at(-1)!.key);
    expect(last.match(/disabled=""/g)?.length).toBe(1);

    expect(render('')).toBe('');
  });
});
