/**
 * 使用说明页（2026-11-08 说明性内容批 · L3）
 *
 * 结构：目录 + 每页一节（定位 / 步骤 / 注意 / 去这一页）。
 * 内容全部来自 `help-content.ts` 的 HELP_TOPICS + i18n `help.pages.<id>`，
 * 与页内提示卡 `HintCard` 共用同一份文案 —— 两边永远不会说两套话。
 *
 * 这页是「顶栏 ? 随时能回来」的落点：首访引导条关掉之后，用户仍然找得到。
 */
import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HELP_TOPICS, helpText } from '../help-content.js';

export default function HelpPage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // 从页内提示卡深链进来（/help#help-fullsim）时滚到对应那一节：
  // SPA 不做整页加载，浏览器不会自动按 hash 定位，得自己滚一次。
  useEffect(() => {
    const id = location.hash.replace(/^#/, '');
    if (id === '') return;
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [location.hash]);
  return (
    <div>
      <section className="panel" id="help-top">
        <h2>{t('help.title')}</h2>
        <p className="muted">{t('help.lead')}</p>
        <ul className="help-toc">
          {HELP_TOPICS.map((topic) => (
            <li key={topic.id}>
              <a href={`#${topic.anchor}`}>{t(`help.pages.${topic.id}.title`)}</a>
            </li>
          ))}
        </ul>
        <p className="help-note muted">{t('help.storageNote')}</p>
      </section>

      {HELP_TOPICS.map((topic) => {
        const text = helpText(t, topic.id);
        return (
          <section className="panel help-section" id={topic.anchor} key={topic.id}>
            <h2>{text.title}</h2>
            {text.lead !== '' && <p>{text.lead}</p>}
            {text.steps.length > 0 && (
              <>
                <div className="help-label">{t('help.sectionSteps')}</div>
                <ol className="help-steps">
                  {text.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </>
            )}
            {text.tips.length > 0 && (
              <>
                <div className="help-label">{t('help.sectionTips')}</div>
                <ul className="help-tips">
                  {text.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="help-go">
              <button type="button" className="secondary" onClick={() => void navigate(topic.route)}>
                {t('help.goPage')}
              </button>
            </p>
          </section>
        );
      })}
    </div>
  );
}
