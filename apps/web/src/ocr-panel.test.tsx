import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import './i18n.js';
import { OcrPanel } from './ocr-panel.js';

/** 截图识别面板渲染烟测：锁住入口/提示/角色选择/按钮，防止后续改版把面板改没。 */
describe('OcrPanel', () => {
  it('渲染标题、提示、角色选择与按钮', () => {
    const html = renderToStaticMarkup(
      <OcrPanel open initialRosterId="1505" onClose={() => {}} onApply={() => {}} />,
    );
    expect(html).toContain('截图识别面板');
    expect(html).toContain('拖入图片');
    expect(html).toContain('已添加 0 张');
    expect(html).toContain('开始识别');
    expect(html).toContain('填入表单');
    expect(html).toContain('<select');
    expect(html).toContain('绯英');
    expect(html).toContain('disabled');
  });

  it('未打开时不渲染', () => {
    const html = renderToStaticMarkup(
      <OcrPanel open={false} initialRosterId="" onClose={() => {}} onApply={() => {}} />,
    );
    expect(html).toBe('');
  });
});
