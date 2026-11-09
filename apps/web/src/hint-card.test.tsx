import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TRANSLATIONS } from './i18n.js';
import { HELP_TOPICS } from './help-content.js';
import { HintCard } from './hint-card.js';
import { HelpBanner } from './help-banner.js';
import HelpPage from './pages/HelpPage.js';

/**
 * 说明层渲染烟测（2026-11-08 说明性内容批）。
 *
 * 锁的是「接线」而不是文案：
 *   ① HintCard 必须是**默认折叠**的 details —— 展开态会把首屏表单推下去，
 *      全真模拟那次「确定按钮跑到首屏之外」的返工就是这么来的；
 *   ② 每张卡必须链到帮助页里**对应那一节**的锚点，链错就等于没有说明；
 *   ③ 帮助页必须六节齐全（缺 id 会让目录点空）。
 */
describe('HintCard', () => {
  it('默认折叠，渲染摘要、步数与完整的步骤列表', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <HintCard id="calculator" />
      </MemoryRouter>,
    );
    expect(html).toContain('<details class="hint-card">');
    expect(html, '提示卡不能默认展开').not.toContain('<details class="hint-card" open');
    expect(html).toContain('怎么用？');
    const steps = TRANSLATIONS.zh.help.pages.calculator.steps;
    expect(html.match(/<li>/g)?.length ?? 0).toBe(steps.length);
    expect(html).toContain(`（${steps.length} 步）`);
    expect(html).toContain('href="/help#help-calculator"');
  });

  it('每个功能页的卡片都深链到帮助页自己那一节', () => {
    for (const topic of HELP_TOPICS) {
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <HintCard id={topic.id} />
        </MemoryRouter>,
      );
      // 必须是 /help#锚点 而不是 #锚点：这个锚点在另一条路由上，纯 hash 点了不会跳
      expect(html, `${topic.id} 锚点错了`).toContain(`href="/help#${topic.anchor}"`);
      expect(html).toContain(TRANSLATIONS.zh.help.pages[topic.id].lead);
    }
  });
});

describe('HelpBanner', () => {
  it('给出「看使用说明」与「知道了」两个动作', () => {
    const html = renderToStaticMarkup(
      <HelpBanner onOpen={() => {}} onDismiss={() => {}} />,
    );
    expect(html).toContain('第一次来？');
    expect(html).toContain(TRANSLATIONS.zh.help.bannerBody);
    expect(html).toContain(TRANSLATIONS.zh.help.bannerOpen);
    expect(html).toContain(TRANSLATIONS.zh.help.bannerDismiss);
    expect(html.match(/<button/g)?.length ?? 0).toBe(2);
  });
});

describe('HelpPage', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  );

  it('六个功能页各一节，锚点与目录链接都对得上', () => {
    for (const topic of HELP_TOPICS) {
      expect(html, `${topic.id} 缺 section id`).toContain(`id="${topic.anchor}"`);
      expect(html, `${topic.id} 缺目录链接`).toContain(`href="#${topic.anchor}"`);
      expect(html).toContain(TRANSLATIONS.zh.help.pages[topic.id].title);
    }
  });

  it('每节都有步骤与注意事项两个小标题', () => {
    const sections = html.split('class="panel help-section"').length - 1;
    expect(sections).toBe(HELP_TOPICS.length);
    expect(html.match(/class="help-label"/g)?.length ?? 0).toBe(HELP_TOPICS.length * 2);
    expect(html).toContain(TRANSLATIONS.zh.help.sectionSteps);
    expect(html).toContain(TRANSLATIONS.zh.help.sectionTips);
  });

  it('页脚写明数据只存在本机浏览器', () => {
    expect(html).toContain(TRANSLATIONS.zh.help.storageNote);
  });
});
