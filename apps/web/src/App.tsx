import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CalculatorPage from './pages/CalculatorPage.js';
import CharactersPage from './pages/CharactersPage.js';
import FullSimPage from './pages/FullSimPage.js';
import HelpPage from './pages/HelpPage.js';
import HistoryPage from './pages/HistoryPage.js';
import HomePage from './pages/HomePage.js';
import ShowcasePage from './pages/ShowcasePage.js';
import TimelinePage from './pages/TimelinePage.js';
import { HelpBanner } from './help-banner.js';
import { storage } from './storage.js';
import { applyTheme, nextTheme, readTheme, saveTheme, type ThemeId } from './theme.js';

export default function App() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  // 皮肤状态：初始值取本地记忆（main.tsx 已在渲染前应用过一次，这里只负责切换与持久化）
  const [theme, setTheme] = useState<ThemeId>(() => readTheme());
  // 手机版开关：默认关且不记忆（刷新即回自动），开启时在 <html> 上打 data-layout='mobile'
  const [forceMobile, setForceMobile] = useState(false);
  // 首访引导条（2026-11-08）：没看过才弹；使用说明页与首页自身不弹（首页本身就是引导）
  const [helpSeen, setHelpSeen] = useState<boolean>(() => storage.getHelpSeen());
  const showHelpBanner = !helpSeen && location.pathname !== '/help' && location.pathname !== '/';

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (forceMobile) root.setAttribute('data-layout', 'mobile');
    else root.removeAttribute('data-layout');
  }, [forceMobile]);

  return (
    <div className="app">
      <header className="header">
        <h1>{t('appTitle')}</h1>
        {/* 导航顺序 = 首页批的优先级：两个模拟页排最前（它们才是日常入口），
            计算器与展示柜退到后面。`to="/"` 必须带 end，否则它在每条路由上都算选中。 */}
        <nav>
          <NavLink to="/" end>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/timeline">{t('nav.timeline')}</NavLink>
          <NavLink to="/fullsim">{t('nav.fullSim')}</NavLink>
          <NavLink to="/characters">{t('nav.characters')}</NavLink>
          <NavLink to="/calculator">{t('nav.calculator')}</NavLink>
          <NavLink to="/showcase">{t('nav.showcase')}</NavLink>
          <NavLink to="/history">{t('nav.history')}</NavLink>
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="theme-btn"
            title={t('theme.switch')}
            onClick={() => setTheme((prev) => nextTheme(prev))}
          >
            {theme === 'neon' ? t('theme.neon') : t('theme.astra')}
          </button>
          <button
            type="button"
            className="lang-btn"
            onClick={() => void i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')}
          >
            {t('lang.switch')}
          </button>
          <button
            type="button"
            className={`mobile-btn${forceMobile ? ' active' : ''}`}
            title={t('layout.mobileHint')}
            onClick={() => setForceMobile((prev) => !prev)}
          >
            {t('layout.mobile')}
          </button>
          {/* 使用说明入口：首访横幅关掉之后，这里是唯一的常驻入口，所以放在最右侧 */}
          <NavLink
            className="help-btn"
            to="/help"
            title={t('help.open')}
            aria-label={t('help.open')}
          >
            ?
          </NavLink>
        </div>
      </header>
      <main>
        {showHelpBanner && (
          <HelpBanner
            onOpen={() => {
              // 「去看说明」也算已读：否则从说明页回来横幅又弹一次
              storage.saveHelpSeen();
              setHelpSeen(true);
              void navigate('/help');
            }}
            onDismiss={() => {
              storage.saveHelpSeen();
              setHelpSeen(true);
            }}
          />
        )}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/fullsim" element={<FullSimPage />} />
          <Route path="/showcase" element={<ShowcasePage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
    </div>
  );
}
