/**
 * 使用说明 · 结构真源（2026-11-08 说明性内容批）
 *
 * 这里**只有结构**，一个中文汉字都没有：文案全部走 i18n 的 `help.pages.<id>.*`。
 * 原因是项目硬约束「所有用户文案走 t('key')」+ `const en: typeof zh` 强制中英对称，
 * 把文案写死在这里会出现「中文改了英文忘了」而且 typecheck 不报错。
 *
 * 三个消费方共用这份清单：
 *   ① `pages/HelpPage.tsx` —— 完整说明书（目录 + 分节，顺序 = HELP_TOPICS 顺序）
 *   ② `hint-card.tsx`      —— 页内折叠提示卡（每页首屏一条，指向对应锚点）
 *   ③ `help-banner.tsx`    —— 首访引导条（App 顶层，可关闭、记住已读）
 *
 * 加一个新功能页的成本：这里加一行 + i18n.ts 里 zh/en 各补一段 pages.<id>。
 */
import type { TFunction } from 'i18next';

/**
 * 六个功能页。
 *
 * 顺序刻意**不按顶栏导航**，而按「先有面板、才算伤害 / 才跑模拟」的使用顺序：
 * 面板来源在 characters / showcase，消在 calculator / timeline / fullsim。
 * 新用户从帮助页第一条读下来，正好是一条走通的路。
 */
export const HELP_TOPICS = [
  { id: 'characters', route: '/characters', anchor: 'help-characters' },
  { id: 'showcase', route: '/showcase', anchor: 'help-showcase' },
  { id: 'calculator', route: '/calculator', anchor: 'help-calculator' },
  { id: 'timeline', route: '/timeline', anchor: 'help-timeline' },
  { id: 'fullsim', route: '/fullsim', anchor: 'help-fullsim' },
  { id: 'history', route: '/history', anchor: 'help-history' },
] as const;

export type HelpTopic = (typeof HELP_TOPICS)[number];
export type HelpPageId = HelpTopic['id'];

/** 一页说明的渲染形状（由 i18n 数据取来，空字段降级为空串/空数组） */
export interface HelpText {
  title: string;
  /** 一句话：这一页解决什么问题 */
  lead: string;
  /** 操作步骤（有序） */
  steps: string[];
  /** 注意事项 / 容易踩的坑（无序） */
  tips: string[];
}

/** 取某页在帮助页里的锚点 id（HintCard 的「完整说明」要深链到这一节） */
export function helpAnchor(id: HelpPageId): string {
  const topic = HELP_TOPICS.find((t) => t.id === id);
  return topic ? topic.anchor : 'help-top';
}

/** 取某页的文案键前缀，供测试与组件共用（避免两处字符串拼错） */
export function helpKeyPrefix(id: HelpPageId): string {
  return `help.pages.${id}`;
}

/**
 * 取 i18n 里的字符串数组。
 *
 * i18next 的 `returnObjects` 返回 `unknown`：缺键、类型写错（比如写成字符串）、
 * 被某个语言漏掉时都会走到这里，所以一律**降级为空数组**而不是抛错 ——
 * 说明文案缺失不该让整页白屏（completeness 由 `help-content.test.ts` 兜住）。
 */
export function helpList(t: TFunction, key: string): string[] {
  const raw: unknown = t(key, { returnObjects: true });
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

/** 取一页说明的四个字段（顺序固定，便于测试逐项断言） */
export function helpText(t: TFunction, id: HelpPageId): HelpText {
  const base = helpKeyPrefix(id);
  return {
    title: t(`${base}.title`),
    lead: t(`${base}.lead`),
    steps: helpList(t, `${base}.steps`),
    tips: helpList(t, `${base}.tips`),
  };
}
