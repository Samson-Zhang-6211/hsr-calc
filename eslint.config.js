import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      // 离线包的生成物（数据分片 39MB + 交付包整份拷贝）——不是源码，不参与 lint
      'apps/web/.offline-data/**',
      'offline/**',
      // 临时工作目录（预告片成帧/音频、识别样本；见 .gitignore）——不是源码，不参与 lint
      '**/.tmp-*/**',
      // Cloudflare Pages 转发器：跑在边缘运行时（caches/fetch/Response 都是宿主全局），
      // 不属于本项目 TS 工程，也不参与打包（见 deploy/cf-pages/_worker.js）
      'deploy/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 允许用下划线前缀标注「有意不用的形参/变量」（如 gainZhuiyi(n, _from)）
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 空 catch 是脚本里的既定写法（探测/清理失败一律忽略），不算漏处理
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        // 预告片/截图脚本在 Chrome DevTools Protocol 页面上下文里用浏览器全局
        WebSocket: 'readonly',
      },
    },
  },
);
