/**
 * 本地 data 的加载实现（**离线包**用，2026-11-08）。
 *
 * 为什么换一套：`file://` 下页面 origin 是 `null`，`import()` 出来的 module 分片
 * 和 `fetch()` 都会被 CORS 拦死，双击 index.html 就是白屏。唯一不受限制的加载
 * 方式是经典 `<script src>` —— 所以离线包把四类数据预先生成为经典脚本
 * （`scripts/gen-offline-data.mjs` 产出 `data-offline/*.js`），脚本里把整类文档
 * 挂到 `window.__HSR_STATIC__`，这里按类懒加载一次。
 *
 * 与 `local-data.ts` 导出同名同类型的 `createLocalSource`，调用方不感知差异。
 */
import type { LocalDataCategory, LocalSource } from './local-data.js';
import { offlineDataUrl } from './offline-mode.js';

const BASE = import.meta.env.BASE_URL;
/** 每类只注入一次；失败也缓存（离线包里重试没有意义） */
const pending = new Map<LocalDataCategory, Promise<Record<string, unknown>>>();

type StaticBag = Record<string, Record<string, unknown>>;

function readGlobal(category: LocalDataCategory): Record<string, unknown> | undefined {
  const w = window as unknown as { __HSR_STATIC__?: StaticBag };
  return w.__HSR_STATIC__?.[category];
}

function loadCategory(category: LocalDataCategory): Promise<Record<string, unknown>> {
  const hit = pending.get(category);
  if (hit) return hit;

  const p = new Promise<Record<string, unknown>>((resolve) => {
    const ready = readGlobal(category);
    if (ready) {
      resolve(ready);
      return;
    }
    const script = document.createElement('script');
    script.src = offlineDataUrl(BASE, category);
    script.onload = () => resolve(readGlobal(category) ?? {});
    // 文件缺失（用户只拷了部分文件）时给空表：上层会当作「本地没有」，
    // 进而回落在线拉取并失败 —— 但不会让整页崩掉。
    script.onerror = () => resolve({});
    document.head.appendChild(script);
  });

  pending.set(category, p);
  return p;
}

export function createLocalSource(category: LocalDataCategory): LocalSource {
  return {
    get: (id) => async () => (await loadCategory(category))[id],
  };
}

/** 整类一次性加载：离线包里整类就在同一个脚本对象里，直接返回即可 */
export async function loadCategoryFiles(
  category: LocalDataCategory,
): Promise<Record<string, unknown>> {
  return loadCategory(category);
}
