import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { TRANSLATIONS } from './i18n.js';
import { HELP_TOPICS, helpAnchor, helpKeyPrefix, helpList } from './help-content.js';

/**
 * 使用说明内容完整性（2026-11-08 说明性内容批）。
 *
 * 为什么要锁：
 *   ① 说明文案散在 i18n 的 `help.pages.<id>` 里，缺一条不会报错，只会让帮助页悄悄空掉一节；
 *   ② `const en: typeof zh` 只锁**键名**，不锁数组长度 —— 给中文加一步忘了加英文，
 *      typecheck 与 lint 都不会红，只有真机切到英文才看得见；
 *   ③ 三个消费方（帮助页 / 页内提示卡 / 首访横幅）共用这份数据，锚点或路由写重了会跳错节。
 */

const LANGS = ['zh', 'en'] as const;
const CJK = /[\u4e00-\u9fff]/;

describe('使用说明 · 内容完整性', () => {
  it('每个功能页在中英两侧都有标题、定位、至少 3 步、至少 1 条注意', () => {
    for (const lng of LANGS) {
      const pages = TRANSLATIONS[lng].help.pages;
      for (const topic of HELP_TOPICS) {
        const page = pages[topic.id];
        const where = `${lng}.${topic.id}`;
        expect(page, `${where} 缺整节`).toBeDefined();
        expect(page.title.trim(), `${where}.title`).not.toBe('');
        expect(page.lead.trim(), `${where}.lead`).not.toBe('');
        expect(page.steps.length, `${where}.steps 少于 3 步`).toBeGreaterThanOrEqual(3);
        expect(page.tips.length, `${where}.tips 没有注意事项`).toBeGreaterThanOrEqual(1);
        for (const line of [...page.steps, ...page.tips]) {
          expect(line.trim(), `${where} 有空条目`).not.toBe('');
        }
      }
    }
  });

  it('中英步骤与注意条数一一对齐', () => {
    for (const topic of HELP_TOPICS) {
      const zh = TRANSLATIONS.zh.help.pages[topic.id];
      const en = TRANSLATIONS.en.help.pages[topic.id];
      expect(en.steps.length, `${topic.id}.steps 中英条数不一致`).toBe(zh.steps.length);
      expect(en.tips.length, `${topic.id}.tips 中英条数不一致`).toBe(zh.tips.length);
    }
  });

  it('英文段没有残留中文，中文段确实写了中文', () => {
    for (const topic of HELP_TOPICS) {
      const en = TRANSLATIONS.en.help.pages[topic.id];
      for (const line of [en.title, en.lead, ...en.steps, ...en.tips]) {
        expect(CJK.test(line), `英文段残留中文：${line}`).toBe(false);
      }
    }
    for (const topic of HELP_TOPICS) {
      const zh = TRANSLATIONS.zh.help.pages[topic.id];
      for (const line of [zh.title, zh.lead, ...zh.steps, ...zh.tips]) {
        expect(CJK.test(line), `中文段没写中文：${line}`).toBe(true);
      }
    }
  });

  it('锚点与路由各自唯一（帮助页目录不会两项跳到同一节）', () => {
    const anchors = HELP_TOPICS.map((topic) => topic.anchor);
    const routes = HELP_TOPICS.map((topic) => topic.route);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('helpAnchor / helpKeyPrefix 与清单一致', () => {
    for (const topic of HELP_TOPICS) {
      expect(helpAnchor(topic.id)).toBe(topic.anchor);
      expect(helpKeyPrefix(topic.id)).toBe(`help.pages.${topic.id}`);
    }
  });

  it('helpList 对非数组与含空串的返回值降级为空数组，不抛错', () => {
    // i18next 的 returnObjects 返回 unknown：缺键会拿到键名本身，写错类型会拿到字符串
    const fake = ((key: string) => {
      if (key === 'arr') return ['甲', '', '乙'];
      if (key === 'missing') return 'help.notExist';
      return 42;
    }) as unknown as TFunction;
    expect(helpList(fake, 'arr')).toEqual(['甲', '乙']);
    expect(helpList(fake, 'missing')).toEqual([]);
    expect(helpList(fake, 'number')).toEqual([]);
  });
});
