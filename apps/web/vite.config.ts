import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

/**
 * esbuild 临时目录兜底（2026-10-26 修「页面打不开」）。
 *
 * 现象：页面上只剩一块错误遮罩
 *   `[plugin:vite:esbuild] remove C:\...\Temp\esbuild-xxxx: Access is denied.`
 * 原因：esbuild 在系统 `%TEMP%` 下创建临时文件后要删掉，本机（Defender/权限）会拒绝删除，
 *   而 vite:esbuild 把这个失败当成致命错误抛出来 → 整页白屏。
 * 处置：在**加载配置时**把 `TEMP/TMP` 指到仓库内的可写目录；esbuild 服务是懒启动的
 *   （首次 transform / optimizeDeps 才拉起），因此子进程会继承到这里设置的值。
 * 这条与 项目维护记录「vite build 报 esbuild: remove ... Access is denied」是同一条坑。
 */
const esbuildTmpDir =
  process.env.HSR_ESBUILD_TMP ||
  fileURLToPath(new URL('../../.tmp-esbuild', import.meta.url));
try {
  fs.mkdirSync(esbuildTmpDir, { recursive: true });
  process.env.TEMP = esbuildTmpDir;
  process.env.TMP = esbuildTmpDir;
} catch {
  // 建不出来就维持系统默认（至少不比改动前更差）
}

/**
 * 离线包开关（2026-11-08）：`OFFLINE=1` 构建「解压后双击 index.html 就能跑」的包。
 *
 * 三处联动，缺一处就白屏：
 *   ① `base` 换成相对路径 `./` —— 绝对路径在 file:// 下指向磁盘根目录；
 *   ② 数据加载换成经典脚本（下方插件）—— module 分片/`fetch` 在 file:// 下被 CORS 拒绝；
 *   ③ 路由换 HashRouter（main.tsx）—— file:// 下 `location.pathname` 是磁盘路径。
 * 服务器构建（不带该变量）行为完全不变。
 */
const offline = process.env.OFFLINE === '1';

/**
 * 把 `./local-data.js` 换成离线实现。**所有** import 它的模块都要换
 * （目前是 game-data.ts 与 monster-stats.ts），否则漏掉的那个仍会生成
 * 动态 import 分片，file:// 下打不开。
 */
const offlineDataSwap = (): Plugin => ({
  name: 'hsr-offline-data-swap',
  enforce: 'pre',
  resolveId(source) {
    if (!offline) return null;
    if (source === './local-data.js') {
      return fileURLToPath(new URL('./src/local-data.offline.ts', import.meta.url));
    }
    return null;
  },
});

export default defineConfig({
  // 主站并轨（2026-10-16）：站点挂在根路径 /hsr/ 下，构建产物路径与
  // BrowserRouter basename 均依赖此值（见 main.tsx / asset-url.ts）。
  // 离线包改相对路径（2026-11-08），其余构建不受影响。
  base: offline ? './' : '/hsr/',
  plugins: [offlineDataSwap(), react()],
  resolve: {
    alias: {
      // 离线包走引擎的**编译产物**（.js）而不是 src：vite 的 esbuild 插件只处理
      // .ts/.tsx（见其 include/exclude 规则），而本机 esbuild 对大输入（battle.ts
      // 约 2MB）会走临时文件路径，并在删除临时文件时 EACCES 失败 → 构建中断。
      // 编译产物是普通 .js，不进 esbuild，于是完全绕开这条路径。
      '@hsr-calc/engine': fileURLToPath(
        new URL(
          offline ? '../../packages/engine/dist/index.js' : '../../packages/engine/src/index.ts',
          import.meta.url,
        ),
      ),
      '@hsr-calc/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { port: 5173 },
});
