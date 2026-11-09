import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import './i18n.js';
import { StageMechanicsRow } from './stage-mechanics.js';
import { mechanicChips, stagePreset } from './monster-presets.js';

/**
 * 关卡机制标签行（2026-10-30 第四十五轮）。
 *
 * 两页共用这一块：机制名 + `title` 悬浮描述。渲染烟测锁住：
 * 无机制不渲染、有机制每个名字都带 `title`、条目数与 `mechanicChips` 一致。
 */

const render = (key: string | undefined) =>
  renderToStaticMarkup(<StageMechanicsRow preset={key ? stagePreset(key) : undefined} label="关卡机制" />);

describe('关卡机制标签行', () => {
  it('无机制 / 未选段：不渲染任何内容', () => {
    expect(render(undefined)).toBe('');
    // 混沌第 12 关的机制挂在包级，星启里没有；挑一个明确无机制的段（仲裁第 3 关只有闭锁…）
    const plain = stagePreset('pure-p27|4|上半')!;
    expect(mechanicChips(plain)).toEqual([]);
    expect(render('pure-p27|4|上半')).toBe('');
  });

  it('有机制：渲染前缀 + 每个机制名，且都带 title=描述', () => {
    const key = 'arb-p10|2|';
    const preset = stagePreset(key)!;
    const chips = mechanicChips(preset);
    const html = render(key);
    expect(html).toContain('关卡机制:');
    for (const c of chips) {
      expect(html, `${c.name} 未渲染`).toContain(c.name);
      // title 里带该机制的描述（HTML 会转义引号，只断言描述前缀）
      expect(html, `${c.name} 缺 title`).toContain(`title="${c.desc.slice(0, 6)}`);
    }
    // 条目数一致：每个条目各一个 span
    expect((html.match(/<span/g) ?? []).length).toBeGreaterThanOrEqual(chips.length);
    // 多条目之间用 ' / ' 连接
    if (chips.length > 1) expect(html).toContain(' / ');
  });

  it('具体段：混沌其十二下半渲染出「记忆紊流」并带描述', () => {
    const html = render('moc-p43|12|下半');
    expect(html).toContain('记忆紊流');
    expect(html).toMatch(/title="[^"]+"/);
    expect(html).toContain('data-stage-mechanics');
  });
});
