import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TRANSLATIONS } from './i18n.js';
import CharactersPage from './pages/CharactersPage.js';

/**
 * 存档导出/导入入口（2026-11-08）。
 *
 * 面板、计算历史与战报只存在 localStorage，这个文件是用户唯一的备份手段。
 * 锁两件事：① 两个按钮真的渲染出来（它们不在顶栏，改版最容易顺手删）；
 * ② 文件选择框的 accept 只能收 JSON —— 换成 image/* 之类会让用户选错文件。
 * SSR 下 localStorage 不存在，页面按空列表渲染，正好不需要桩。
 */
const zh = TRANSLATIONS.zh;

describe('CharactersPage 存档导出/导入入口', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <CharactersPage />
    </MemoryRouter>,
  );

  it('渲染导出与导入两个按钮', () => {
    expect(html).toContain(zh.chars.snapshot.export);
    expect(html).toContain(zh.chars.snapshot.importBtn);
  });

  it('隐藏的文件选择框只接受 JSON', () => {
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="application/json,.json"');
  });
});
