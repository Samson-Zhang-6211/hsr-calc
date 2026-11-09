import { URL, fileURLToPath } from 'node:url';

/**
 * vitest 专用配置（2026-10-26 补，修「web 单测在加载配置阶段就失败」）。
 *
 * 为什么不能复用 `vite.config.ts`：
 *   该文件 import 了 `@vitejs/plugin-react@5.2`，它内部 `import('vite/internal')`；
 *   而 web 侧安装的是 `vite@7.3.6`，其 exports 里没有 `./internal`。
 *   vite 7 自己的 esbuild 配置加载器会把它外部化（dev/build 不受影响），
 *   但 vitest 5 自带的 vite 8 rolldown 加载器会**静态解析**这个子路径 →
 *   `[RESOLVE_ERROR] Could not resolve 'vite/internal'`，整个 web 测试套件起不来。
 *
 * 测试不需要 React 插件（`.tsx` 由 esbuild 直接转 JSX），这里只复刻
 * engine/shared 两个 alias。**新增 alias 时两边都要加**；`base`/`server.proxy`
 * 等构建与联调配置仍只在 `vite.config.ts` 里。
 */
export default {
  resolve: {
    alias: {
      '@hsr-calc/engine': fileURLToPath(
        new URL('../../packages/engine/src/index.ts', import.meta.url),
      ),
      '@hsr-calc/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
};
