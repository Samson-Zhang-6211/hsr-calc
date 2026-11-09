import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TRANSLATIONS } from './i18n.js';
import CharactersPage from './pages/CharactersPage.js';

/**
 * 角色管理 → 两个模拟页的入口（2026-11-08）。
 *
 * 锁两件事：
 *   ① 入口必须真的渲染出来 —— 它不在顶栏导航里，页面改版很容易顺手删掉；
 *   ② 没有面板时两个入口是禁用态 + 给出原因，否则点进去是空队页面。
 * 空列表由 storage 读取失败/为空自然产生（SSR 下 localStorage 不存在，走 try/catch 空数组）。
 */
const zh = TRANSLATIONS.zh;

describe('CharactersPage 去开战入口', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <CharactersPage />
    </MemoryRouter>,
  );

  it('渲染「去开战」条与两个模拟页入口', () => {
    expect(html).toContain('class="chars-next"');
    expect(html).toContain(zh.chars.goBattle);
    expect(html).toContain(zh.nav.timeline);
    expect(html).toContain(zh.nav.fullSim);
  });

  it('没有任何面板时两个入口禁用，并说明原因', () => {
    expect(html).toContain(zh.chars.goBattleEmpty);
    expect(html.match(/disabled/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
