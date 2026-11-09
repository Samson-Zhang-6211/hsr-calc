// nanoka 静态数据源公共层：版本解析、条件请求、文档规范化、source.lock.json 读写。
// 只做 I/O 与规范化，不含任何游戏机制口径。
// 被 fetch-local-data.mjs / fetch-monster-growth.mjs / gen-source-lock.mjs / sync-data.mjs 共用。
//
// 设计要点（2026-11-02 建立）：
//   1. 版本口径唯一来源 = data/source.lock.json，脚本不再各自硬编码 '4.6.51'；
//   2. 静态源支持 ETag / If-None-Match（实测 304 可用），同版本热更新可零字节检测；
//   3. 文档比较用 canonical(JSON) 的 sha256，排除 version 字段（版本号本身不算内容变更）。
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { dataBase } from './env-base.mjs';

export const SOURCE_BASE = dataBase();
/** 站点首页 HTML 内嵌当前版本的静态地址，用于探测最新版本（静态源无版本索引接口） */
export const SITE_URL = process.env.HSR_SITE_URL ?? '';
/** 锁文件缺失且未显式传版本时的兜底值（保持历史口径） */
export const FALLBACK_VERSION = '4.6.51';
export const DATA_ROOT = fileURLToPath(new URL('../../data/', import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SCRIPTS_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const LOCK_PATH = `${DATA_ROOT}source.lock.json`;

const rarityOfChar = (rank) => {
  const m = /Type(\d)$/.exec(rank ?? '');
  return m ? Number(m[1]) : 0;
};
const rarityOfLc = (rank) => {
  const m = /(\d)$/.exec(rank ?? '');
  return m ? Number(m[1]) : 0;
};

/** 四类可拉取文档：folder = data/ 下目录名，endpoint = 远端端点名 */
export const TYPES = [
  {
    folder: 'characters',
    endpoint: 'character',
    metaOf: (c) => ({
      element: c.damageType ?? '',
      path: c.baseType ?? '',
      rarity: rarityOfChar(c.rank),
    }),
  },
  {
    folder: 'lightcones',
    endpoint: 'lightcone',
    metaOf: (c) => ({
      path: c.baseType ?? '',
      rarity: rarityOfLc(c.rank),
    }),
  },
  {
    folder: 'relicsets',
    endpoint: 'relicset',
    metaOf: (c) => ({
      fourPiece: c.set?.['4'] !== undefined,
    }),
  },
  {
    folder: 'monsters',
    endpoint: 'monster',
    metaOf: (c) => ({
      rank: c.rank ?? '',
      weak: c.weak ?? [],
    }),
  },
];

export const typeByFolder = (folder) => TYPES.find((t) => t.folder === folder) ?? null;

/** 稳定序列化：对象键排序，数组保序。用于跨版本比较与 sha256 */
export function canonical(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * 文档内容键：id/type/version 之外的正文。
 * 版本号不进比较 —— 4.6.51 与 4.6.54 内容完全一致时不应算「变更」。
 */
export const contentKey = (doc) => canonical({ name: doc.name, meta: doc.meta, zh: doc.zh, en: doc.en });

export const contentSha = (doc) => sha256(contentKey(doc));

/** 命途中文名（开拓者占位符替换用；与 gen-roster.mjs 同口径） */
const PATH_ZH = { Warrior: '毁灭', Knight: '存护', Shaman: '同谐', Memory: '记忆', Elation: '欢愉' };
const PATH_EN = {
  Warrior: 'Destruction',
  Knight: 'Preservation',
  Shaman: 'Harmony',
  Memory: 'Remembrance',
  Elation: 'Elation',
};

/**
 * 上游 index 对 8 个开拓者 id 恒返回 `{NICKNAME}` 占位符，而 data/ 里存的是解析后的
 * 「开拓者·命途」。这里统一解析，否则每次同步都会把 8 个 id 误报成「改名」。
 */
export function nameOf(raw, baseType, lang) {
  if (!raw || !raw.includes('{NICKNAME}')) return raw ?? '';
  if (lang === 'zh') return `开拓者·${PATH_ZH[baseType] ?? baseType}`;
  return `Trailblazer · ${PATH_EN[baseType] ?? baseType}`;
}

/** 按 fetch-local-data.mjs 的历史格式构造文档（键序 id/type/version/name/meta/zh/en） */
export function buildDoc({ id, endpoint, version, row, zh, en }) {
  const type = typeByFolder(endpoint) ?? TYPES.find((t) => t.endpoint === endpoint);
  if (!type) throw new Error(`未知端点：${endpoint}`);
  const baseType = row?.baseType;
  // zh.name / en.name 同样带 {NICKNAME} 占位符，一并解析，避免与本地已解析名反复比对出伪差异
  const withName = (doc, lang) =>
    doc && typeof doc === 'object' ? { ...doc, name: nameOf(doc.name, baseType, lang) } : doc;
  return {
    id,
    type: type.endpoint,
    version,
    name: { zh: nameOf(row?.zh, baseType, 'zh'), en: nameOf(row?.en, baseType, 'en') },
    meta: type.metaOf(row ?? {}),
    zh: withName(zh, 'zh'),
    en: withName(en, 'en'),
  };
}

/**
 * 取远端资源，支持条件请求。
 * @returns {Promise<{status:number, text:string|null, etag:string|null, lastModified:string|null}>}
 */
export async function fetchResource(url, { etag, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const headers = etag ? { 'if-none-match': etag } : {};
      const res = await fetch(url, { headers });
      if (res.status === 304) {
        return { status: 304, text: null, etag, lastModified: res.headers.get('last-modified') ?? null };
      }
      if (res.ok) {
        return {
          status: 200,
          text: await res.text(),
          etag: res.headers.get('etag') ?? null,
          lastModified: res.headers.get('last-modified') ?? null,
        };
      }
      lastErr = new Error(`HTTP ${res.status} ${url}`);
      if (res.status === 404) throw Object.assign(lastErr, { fatal: true }); // 资源不存在，不重试
    } catch (e) {
      if (e?.fatal) throw e;
      lastErr = e;
    }
    if (attempt < retries) await delay(400 * (attempt + 1));
  }
  throw lastErr;
}

/** 条件请求取 JSON；304 时 data 为 null */
export async function fetchJson(url, opts) {
  const r = await fetchResource(url, opts);
  if (r.status === 304) return { ...r, data: null };
  return { ...r, data: JSON.parse(r.text) };
}

/** 固定并发池 */
export async function pool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next;
      next += 1;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

const emptyLock = () => ({
  schema: 1,
  source: SOURCE_BASE,
  version: null,
  byType: {},
  files: {},
});

/** 读锁文件；不存在时返回空骨架（不抛错，便于首次 bootstrap） */
export async function readLock() {
  try {
    const lock = JSON.parse(await readFile(LOCK_PATH, 'utf8'));
    return { ...emptyLock(), ...lock, byType: lock.byType ?? {}, files: lock.files ?? {} };
  } catch (e) {
    if (e.code === 'ENOENT') return emptyLock();
    throw e;
  }
}

export async function writeLock(lock) {
  await writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

/** 某类型当前口径的版本：优先 byType，其次全局 version */
export const lockVersion = (lock, folder) => (folder ? lock.byType?.[folder] : undefined) ?? lock.version ?? null;

/**
 * 解析版本号：显式参数 > 锁文件（按类型）> 兜底值。
 * 脚本改成 `const VERSION = await resolveVersion(argv[2], 'characters')` 即可去掉硬编码。
 */
export async function resolveVersion(explicit, folder) {
  if (explicit) return explicit;
  const lock = await readLock();
  return lockVersion(lock, folder) ?? FALLBACK_VERSION;
}

/** 探测站点当前版本（首页内嵌 数据源/hsr/<版本>/ 地址）；失败返回 null */
export async function detectLatestVersion() {
  try {
    const r = await fetchResource(SITE_URL);
    const hits = [...(r.text ?? '').matchAll(/\/(\d+\.\d+\.\d+)\//g)].map((m) => m[1]);
    return hits[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * 手工补丁登记表：scripts/apply-<charId>-enhanced.mjs → { charId: 脚本名 }。
 * 这些补丁在上游修好之前必须每次重爬后重跑，否则官方数据会盖掉手抄版。
 */
export async function enhancedPatchMap() {
  const files = await readdir(SCRIPTS_ROOT);
  const map = {};
  for (const f of files) {
    const m = /^apply-(\d+)-enhanced\.mjs$/.exec(f);
    if (m) map[m[1]] = f;
  }
  return map;
}

/** 读某类型目录下所有数字 id（不含 index.json） */
export async function listIds(folder) {
  const files = await readdir(`${DATA_ROOT}${folder}`);
  return files
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => f.slice(0, -5))
    .sort((a, b) => Number(a) - Number(b));
}
