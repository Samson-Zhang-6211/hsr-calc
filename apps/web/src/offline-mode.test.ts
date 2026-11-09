import { describe, expect, it } from 'vitest';
import { isOfflineBase, offlineDataUrl } from './offline-mode.js';

// ── 离线包判定（2026-11-08）──
// 路由选择与数据分片地址都由 base 推导，判断错一处就是「双击 index.html 白屏」。
// 这里锁住：只有 vite 的 `base: './'`（以及空串）才算离线，服务器构建不能误判。

describe('isOfflineBase', () => {
  it('相对路径 base 判为离线', () => {
    expect(isOfflineBase('./')).toBe(true);
    expect(isOfflineBase('')).toBe(true);
  });

  it('服务器与 dev 的绝对路径 base 都不算离线', () => {
    expect(isOfflineBase('/hsr/')).toBe(false);
    expect(isOfflineBase('/')).toBe(false);
    // 容易手滑写成 `.`（没斜杠）或 `../`（越界到上级目录）
    expect(isOfflineBase('.')).toBe(false);
    expect(isOfflineBase('../')).toBe(false);
  });
});

describe('offlineDataUrl', () => {
  it('跟随 base 拼接，离线为相对路径', () => {
    expect(offlineDataUrl('./', 'characters')).toBe('./data-offline/characters.js');
  });

  it('服务器构建里也能用（同一函数，便于复用）', () => {
    expect(offlineDataUrl('/hsr/', 'monsters')).toBe('/hsr/data-offline/monsters.js');
  });
});
