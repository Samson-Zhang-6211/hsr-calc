/**
 * 本地 data/*.json 的懒加载索引（**在线构建**用，2026-11-08 从 game-data.ts 抽出）。
 *
 * 在线：每个 JSON 被 vite 变成独立动态 import 分片，按需拉取。
 * 离线：`vite.config.ts` 的离线插件会把本文件整体替换为 `local-data.offline.ts`，
 *   因为 `file://` 页面 origin 为 null，ES module 分片与 fetch 都会被 CORS 拒绝，
 *   而经典 `<script src>` 不受此限制（见该文件顶部说明）。
 *
 * 两个实现导出**同名同类型**的 API：
 *   - `createLocalSource(cat)`  → 按 id 懒加载单篇文档
 *   - `loadCategoryFiles(cat)`  → 整类一次性加载（只给文件很少的类用）
 */
export type LocalDataCategory =
  | 'characters'
  | 'lightcones'
  | 'relicsets'
  | 'monsters'
  | 'monster-growth';

export type LocalLoader = () => Promise<unknown>;

export interface LocalSource {
  get(id: string): LocalLoader | undefined;
}

function globFor(category: LocalDataCategory): Record<string, LocalLoader> {
  switch (category) {
    case 'characters':
      return import.meta.glob('../../../data/characters/*.json');
    case 'lightcones':
      return import.meta.glob('../../../data/lightcones/*.json');
    case 'relicsets':
      return import.meta.glob('../../../data/relicsets/*.json');
    case 'monsters':
      return import.meta.glob('../../../data/monsters/*.json');
    case 'monster-growth':
      return import.meta.glob('../../../data/monster-growth/*.json');
    default:
      // 联合类型已穷尽；这里只是为了满足 TS 的返回值要求
      return {};
  }
}

const basenameOf = (path: string): string | undefined => /([^/\\]+)\.json$/.exec(path)?.[1];

export function createLocalSource(category: LocalDataCategory): LocalSource {
  const index = new Map<string, LocalLoader>();
  for (const [path, load] of Object.entries(globFor(category))) {
    const id = basenameOf(path);
    if (id) index.set(id, load);
  }
  return { get: (id) => index.get(id) };
}

/**
 * 整类一次性加载。**只给文件数很少的类用**（当前只有 `monster-growth` 的 2 个文件）：
 * 对 monsters 这种 665 篇的类调用会把全部文档拉进内存。
 */
export async function loadCategoryFiles(
  category: LocalDataCategory,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  await Promise.all(
    Object.entries(globFor(category)).map(async ([path, load]) => {
      const id = basenameOf(path);
      if (!id) return;
      const mod = (await load()) as { default?: unknown };
      out[id] = mod?.default ?? mod;
    }),
  );
  return out;
}
