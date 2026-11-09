// 回填立绘路径到 data/characters/{id}.json 的 meta。
// 2026-10-10：立绘本身由 scripts/fetch-portraits.mjs 下载，图片分两种：
//   meta.portrait     = /portraits/{id}.webp      方图原图（avatardrawcard，2048²带 alpha，做卡时自行裁切）
//   meta.portraitShop = /portraits-shop/{id}.webp 竖版半身图（avatarshopicon，站点已裁好）
//   本脚本只写库不碰图片，重爬 data（fetch-local-data.mjs 会覆盖 meta）后重跑即可恢复。
//   幂等：字段已一致的文件不重写（避免每次都把 99 份大文档落盘一遍）。
//   目录不存在 / 没有图片的种类直接跳过（只拉过一种也照常能跑）。
// 用法：node scripts/gen-portrait-meta.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const PUBLIC_DIR = 'apps/web/public';
const CHAR_DIR = 'data/characters';
// public 目录由 Vite 原样服务到站点根，故写成站点绝对路径
const KINDS = [
  { dir: 'portraits', key: 'portrait' },
  { dir: 'portraits-shop', key: 'portraitShop' },
];

// 每种图各自列出已落盘的 id
const perKind = [];
for (const { dir, key } of KINDS) {
  const abs = `${PUBLIC_DIR}/${dir}`;
  if (!existsSync(abs)) continue;
  const list = readdirSync(abs)
    .filter((f) => /^\d+\.webp$/.test(f))
    .map((f) => f.replace(/\.webp$/, ''))
    .sort((a, b) => Number(a) - Number(b));
  if (list.length > 0) perKind.push({ dir, key, list });
}
if (perKind.length === 0) {
  throw new Error(`public 下没有任何立绘图片，先跑 node scripts/fetch-portraits.mjs --kind=both`);
}

const charIds = readdirSync(CHAR_DIR)
  .filter((f) => /^\d+\.json$/.test(f))
  .map((f) => f.replace(/\.json$/, ''))
  .sort((a, b) => Number(a) - Number(b));

const writtenByKind = {};
const keptByKind = {};
for (const k of perKind) {
  writtenByKind[k.key] = 0;
  keptByKind[k.key] = 0;
}

const problems = [];
for (const id of charIds) {
  const file = `${CHAR_DIR}/${id}.json`;
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    problems.push(`${id}: 文档无法解析（${e.message}）`);
    continue;
  }
  if (doc.meta === undefined) doc.meta = {};
  let changed = false;
  for (const k of perKind) {
    if (!k.list.includes(id)) continue; // 该种类缺这张图就不写这个字段
    const value = `/${k.dir}/${id}.webp`;
    if (doc.meta[k.key] === value) {
      keptByKind[k.key] += 1;
      continue;
    }
    doc.meta[k.key] = value;
    writtenByKind[k.key] += 1;
    changed = true;
  }
  if (changed) writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

for (const k of perKind) {
  const missing = charIds.filter((id) => !k.list.includes(id));
  const orphan = k.list.filter((id) => !charIds.includes(id));
  console.log(
    `meta.${k.key}：新增 ${writtenByKind[k.key]}，已一致 ${keptByKind[k.key]}（该类图片 ${k.list.length} 张 / 角色 ${charIds.length} 个）`,
  );
  if (missing.length > 0) console.log(`  缺图的角色 ${missing.length} 个：${missing.join(',')}`);
  if (orphan.length > 0) console.log(`  有图无角色文档 ${orphan.length} 个：${orphan.join(',')}`);
}

// 未拉过图的种类提示一下，避免误以为字段已写入
for (const k of KINDS) {
  if (!perKind.some((p) => p.key === k.key)) {
    console.log(`跳过 meta.${k.key}：public/${k.dir} 下没有图片（需 node scripts/fetch-portraits.mjs --kind=...）`);
  }
}

if (problems.length > 0) throw new Error(`问题：\n${problems.join('\n')}`);