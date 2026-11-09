/**
 * 首页（2026-11-08 首页批）
 *
 * 原来的 `/` 是伤害计算器，用户实际最常用的是「数值代理模拟」和「全真模拟」，
 * 于是把首页让给这两扇门：三步引导（录面板 → 选玩法 → 存历史）+ 两块大卡。
 *
 * 进度不额外存：**有没有面板**就是进度，直接读 localStorage 里角色档的数量
 * （与角色管理页、两个战斗页同一个键 `hsr-sim.characters`，同口径挂载读一次）。
 * 一份都没有时两块大卡的按钮变成「先录入面板」并直奔角色管理，避免新手冲进空队页面。
 *
 * 不碰引擎、不加第三方库；样式全用 `styles.css` 的令牌。
 */
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../storage.js';

export interface HomePageProps {
  /** 已存面板数；缺省由组件自己读 localStorage（仅供测试注入） */
  savedCount?: number;
}

export default function HomePage({ savedCount }: HomePageProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 只在挂载时读一次：从角色管理存完档再回来，路由已卸载重建，会重新读到新数量
  const [saved] = useState<number>(() => savedCount ?? storage.getCharacters().length);
  const ready = saved > 0;
  const go = (path: string) => () => void navigate(path);

  return (
    <div>
      <section className="panel home-hero">
        <h2>{t('home.title')}</h2>
        <p className="muted">{t('home.lead')}</p>
        <p className="home-count muted">{t('home.panelCount', { n: saved })}</p>
        <ol className="home-steps">
          <li className={`home-step${ready ? ' home-step--done' : ' home-step--current'}`}>
            <span className="home-step__idx" aria-hidden="true">
              {ready ? '✓' : '1'}
            </span>
            <span className="home-step__text">
              <strong>{t('home.stepPanelTitle')}</strong>
              <span className="muted">{t('home.stepPanelDesc')}</span>
            </span>
            <button type="button" className="secondary" onClick={go('/characters')}>
              {t('home.stepPanelCta')}
            </button>
          </li>
          <li className={`home-step${ready ? ' home-step--current' : ' home-step--locked'}`}>
            <span className="home-step__idx" aria-hidden="true">
              2
            </span>
            <span className="home-step__text">
              <strong>{t('home.stepPlayTitle')}</strong>
              <span className="muted">
                {ready ? t('home.stepPlayDesc') : t('home.stepPlayLocked')}
              </span>
            </span>
          </li>
          <li className={`home-step${ready ? '' : ' home-step--locked'}`}>
            <span className="home-step__idx" aria-hidden="true">
              3
            </span>
            <span className="home-step__text">
              <strong>{t('home.stepSaveTitle')}</strong>
              <span className="muted">{t('home.stepSaveDesc')}</span>
            </span>
          </li>
        </ol>
      </section>

      <div className="home-cards">
        <section className={`panel home-card${ready ? '' : ' home-card--locked'}`}>
          <div className="home-card__tag">{t('home.proxyTag')}</div>
          <h2>{t('nav.timeline')}</h2>
          <p>{t('home.proxyDesc')}</p>
          <button
            type="button"
            className="primary"
            onClick={go(ready ? '/timeline' : '/characters')}
          >
            {ready ? t('home.proxyCta') : t('home.needPanel')}
          </button>
        </section>
        <section className={`panel home-card${ready ? '' : ' home-card--locked'}`}>
          <div className="home-card__tag">{t('home.fullsimTag')}</div>
          <h2>{t('nav.fullSim')}</h2>
          <p>{t('home.fullsimDesc')}</p>
          <button
            type="button"
            className="primary"
            onClick={go(ready ? '/fullsim' : '/characters')}
          >
            {ready ? t('home.fullsimCta') : t('home.needPanel')}
          </button>
        </section>
      </div>

      <section className="panel home-aside">
        <h2>{t('home.asideTitle')}</h2>
        <ul className="home-aside__list">
          <li>
            <Link className="home-aside__link" to="/calculator">
              {t('home.asideCalculator')}
            </Link>
          </li>
          <li>
            <Link className="home-aside__link" to="/showcase">
              {t('home.asideShowcase')}
            </Link>
          </li>
          <li>
            <Link className="home-aside__link" to="/history">
              {t('home.asideHistory')}
            </Link>
          </li>
          <li>
            <Link className="home-aside__link" to="/help">
              {t('home.asideHelp')}
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
