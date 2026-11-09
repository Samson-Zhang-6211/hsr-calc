import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TRANSLATIONS } from './i18n.js';
import HomePage from './pages/HomePage.js';

/**
 * 首页渲染烟测（2026-11-08 首页批）。
 *
 * 锁的是「进度判定」而不是文案措辞：
 *   ① 一份面板都没有时，两块大卡必须处于 locked 且主按钮改成「先录入面板」
 *      —— 否则新手会直接冲进一个空队页面；
 *   ② 有面板时两卡解锁、按钮换成真入口；
 *   ③ 三步步骤条一直在，第三步写明战果可存历史。
 */
const zh = TRANSLATIONS.zh.home;

function render(savedCount: number): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <HomePage savedCount={savedCount} />
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  it('零面板：两块大卡锁住，主按钮变「先录入面板」', () => {
    const html = render(0);
    expect(html.match(/home-card--locked/g)?.length ?? 0).toBe(2);
    expect(html).toContain(zh.needPanel);
    expect(html).not.toContain(zh.proxyCta);
    expect(html).not.toContain(zh.fullsimCta);
    // 第 1 步是当前步，第 2、3 步置灰
    expect(html).toContain('home-step--current');
    expect(html.match(/home-step--locked/g)?.length ?? 0).toBe(2);
    expect(html).toContain(zh.stepPlayLocked);
    expect(html).not.toContain(zh.stepPlayDesc);
  });

  it('有面板：两卡解锁，按钮换成两个真入口', () => {
    const html = render(2);
    expect(html.match(/home-card--locked/g) ?? []).toHaveLength(0);
    expect(html).toContain(zh.proxyCta);
    expect(html).toContain(zh.fullsimCta);
    expect(html).not.toContain(zh.needPanel);
    expect(html).toContain(zh.stepPlayDesc);
    expect(html).not.toContain(zh.stepPlayLocked);
    expect(html.match(/home-step--done/g)?.length ?? 0).toBe(1);
    expect(html).toContain(zh.panelCount.replace('{{n}}', '2'));
  });

  it('三步步骤条齐全，第三步写明战果可存历史', () => {
    const html = render(1);
    // 只数 <li>：`home-step__idx` / `home-step__text` 是子元素，别把它们算进步骤数
    expect(html.match(/<li class="home-step/g)?.length ?? 0).toBe(3);
    expect(html.match(/home-step__idx/g)?.length ?? 0).toBe(3);
    expect(html).toContain(zh.stepPanelTitle);
    expect(html).toContain(zh.stepPlayTitle);
    expect(html).toContain(zh.stepSaveTitle);
    expect(html).toContain(zh.stepSaveDesc);
  });

  it('次要入口四个都在（计算器 / 展示柜 / 历史 / 说明）', () => {
    const html = render(1);
    for (const path of ['/calculator', '/showcase', '/history', '/help']) {
      expect(html, `缺少 ${path} 入口`).toContain(`href="${path}"`);
    }
  });
});
