// 从 data/ 实况重建 data/source.lock.json（幂等；保留既有 etag 缓存）。
// 用法：node scripts/gen-source-lock.mjs
//
// 锁文件是「版本口径唯一来源」：7 个 fetch/gen 脚本的默认版本都读它，不再各自硬编码。
// 字段说明：
//   version     全局口径（多数类型一致的版本）
//   byType      各类型实际版本（历史上 characters 4.6.53 / 其余 4.6.51 混装，这里如实记录）
//   files       <类型>/<id>.json → { version, sha256, bytes, etagZh, etagEn, patches[] }
//               sha256 是内容键（排除 version 字段）的哈希，用于跨版本比对「内容是否真的变了」
//   patches     该文件在上游修好前必须重跑的手工补丁（scripts/apply-<id>-enhanced.mjs）
import { readFile, readdir } from 'node:fs/promises';
import {
  DATA_ROOT,
  FALLBACK_VERSION,
  LOCK_PATH,
  SOURCE_BASE,
  TYPES,
  contentSha,
  enhancedPatchMap,
  listIds,
  readLock,
  sha256,
  writeLock,
} from './lib/data-source.mjs';

const lock = await readLock();
const patchMap = await enhancedPatchMap();
const files = {};
const byType = {};
const warnings = [];

for (const type of TYPES) {
  const ids = await listIds(type.folder);
  const versionCount = new Map();
  let patched = 0;

  for (const id of ids) {
    const path = `${type.folder}/${id}.json`;
    const raw = await readFile(`${DATA_ROOT}${path}`, 'utf8');
    const doc = JSON.parse(raw);
    const v = doc.version ?? '?';
    versionCount.set(v, (versionCount.get(v) ?? 0) + 1);

    const entry = {
      version: v,
      sha256: contentSha(doc),
      bytes: Buffer.byteLength(raw, 'utf8'),
    };
    const prev = lock.files?.[path];
    if (prev?.etagZh) entry.etagZh = prev.etagZh;
    if (prev?.etagEn) entry.etagEn = prev.etagEn;
    const patches = patchMap[id] ? [patchMap[id]] : [];
    if (patches.length) {
      entry.patches = patches;
      patched += 1;
    }
    files[path] = entry;
  }

  const sorted = [...versionCount.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    warnings.push(`[${type.folder}] 目录为空`);
  } else {
    byType[type.folder] = sorted[0][0];
    if (sorted.length > 1) {
      warnings.push(`[${type.folder}] 版本混装：${sorted.map(([v, n]) => `${v}×${n}`).join(' ')}（按多数取 ${sorted[0][0]}）`);
    }
  }
  console.log(`[${type.folder}] ${ids.length} 份 → ${byType[type.folder] ?? '?'}${patched ? `（${patched} 份带手工补丁）` : ''}`);
}

// 怪物成长表：无 version 字段，沿用既有锁口径
try {
  const growthDir = `${DATA_ROOT}monster-growth/`;
  const names = (await readdir(growthDir)).filter((f) => f.endsWith('.json')).sort();
  if (names.length) {
    byType['monster-growth'] = lock.byType?.['monster-growth'] ?? lock.version ?? FALLBACK_VERSION;
    for (const name of names) {
      const raw = await readFile(`${growthDir}${name}`, 'utf8');
      files[`monster-growth/${name}`] = {
        version: byType['monster-growth'],
        sha256: sha256(raw),
        bytes: Buffer.byteLength(raw, 'utf8'),
      };
    }
    console.log(`[monster-growth] ${names.length} 份`);
  }
} catch {
  console.log('[monster-growth] 目录不存在，跳过');
}

// 全局口径：取条目最多的类型版本
const globalCount = new Map();
for (const [folder, v] of Object.entries(byType)) {
  if (folder === 'monster-growth') continue;
  const n = Object.keys(files).filter((p) => p.startsWith(`${folder}/`)).length;
  globalCount.set(v, (globalCount.get(v) ?? 0) + n);
}
const globalVersion = [...globalCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

const sortedFiles = {};
for (const path of Object.keys(files).sort()) sortedFiles[path] = files[path];

await writeLock({
  schema: 1,
  source: SOURCE_BASE,
  version: globalVersion,
  byType,
  updatedAt: new Date().toISOString(),
  files: sortedFiles,
});

console.log(`\n全局口径 version = ${globalVersion}，byType = ${JSON.stringify(byType)}`);
console.log(`文件条目 ${Object.keys(sortedFiles).length} 个 → ${LOCK_PATH}`);
for (const w of warnings) console.warn(`⚠ ${w}`);
