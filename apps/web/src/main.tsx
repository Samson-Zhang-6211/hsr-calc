import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App.js';
import { initTheme } from './theme.js';
import { isOfflineBase } from './offline-mode.js';
import './i18n.js';
import './styles.css';

// 渲染前应用已保存的皮肤（<html data-theme="...">），避免默认皮肤一闪
initTheme();

// 主站并轨（2026-10-16）：线上挂载在 /hsr/ 子路径（vite base 同源），dev 下 BASE_URL='/' 退化为空 basename
const baseUrl = import.meta.env.BASE_URL;
const basename = baseUrl.replace(/\/$/, '');

// 离线包（2026-11-08）：双击 index.html 时 location.pathname 是磁盘路径，
// BrowserRouter 的 history 会把它当路由 → 必须换 HashRouter（`#/calculator`）。
const router = isOfflineBase(baseUrl) ? (
  <HashRouter>
    <App />
  </HashRouter>
) : (
  <BrowserRouter basename={basename}>
    <App />
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(<StrictMode>{router}</StrictMode>);
