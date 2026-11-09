/**
 * 页内提示卡（2026-11-08 说明性内容批 · L2）
 *
 * 一个页面首屏放一条，**默认折叠**成一行，点开才展开「步骤 + 注意」。
 * 用原生 `<details>`：不引入状态、不需要开关按钮、自带键盘可达性，
 * 也不会像常驻段落那样把首屏表单推下去（全真模拟那次「操作台在首屏之外」
 * 就是被常驻说明挤出来的，教训在案）。
 *
 * 文案来自 i18n 的 `help.pages.<id>`，与帮助页同一份数据 —— 改文案只改一处。
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { helpAnchor, helpText, type HelpPageId } from './help-content.js';

export interface HintCardProps {
  id: HelpPageId;
}

export function HintCard({ id }: HintCardProps): ReactNode {
  const { t } = useTranslation();
  const text = helpText(t, id);
  // 缺文案时不渲染空壳（内容完整性由 help-content.test.ts 兜）
  if (text.steps.length === 0 && text.lead === '') return null;
  const anchor = helpAnchor(id);
  return (
    <details className="hint-card">
      <summary className="hint-card__summary">
        <span className="hint-card__mark" aria-hidden="true">
          ?
        </span>
        <span className="hint-card__trigger">{t('help.cardTrigger')}</span>
        {text.steps.length > 0 && (
          <span className="hint-card__count">{t('help.cardSteps', { n: text.steps.length })}</span>
        )}
      </summary>
      <div className="hint-card__body">
        {text.lead !== '' && <p className="hint-card__lead">{text.lead}</p>}
        {text.steps.length > 0 && (
          <ol className="hint-card__list">
            {text.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        <Link className="hint-card__more" to={`/help#${anchor}`}>
          {t('help.cardMore')}
        </Link>
      </div>
    </details>
  );
}
