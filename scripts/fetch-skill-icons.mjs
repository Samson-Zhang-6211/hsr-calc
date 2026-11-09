// 下载 社区数据源 的角色技能图标到本地 public 目录。
// 用途：战场可视化卡底的技能按钮（普攻/战技/终结技/天赋）、角色管理页技能展示。
//
// 用法：
//   node scripts/fetch-skill-icons.mjs [--force] [--ids=1512,1204]
//
// 已知路径约定（2026-10 实测，来源 站点 实际网络请求）：
//   assets/hsr/skillicons/SkillIcon_{角色id}_{Normal|BP|Ultra|Passive}.webp
//     —— 128x128 alpha
//   Normal=普攻 / BP=战技 / Ultra=终结技 / Passive=天赋
//
// 角色 id 以本地 data/characters/*.json 实况为准（99 个）。
// 覆盖不全属正常：并非每个角色四类都有图，404 记 skipped 不算失败。
import { mkdirSync, existsSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetBase } from './lib/env-base.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDN = assetBase();
const PUBLIC = join(ROOT, 'apps', 'web', 'public');
const CHAR_DIR = join(ROOT, 'data', 'characters');
const OUT_DIR = join(PUBLIC, 'skillicon');

const KINDS = ['Normal', 'BP', 'Ultra', 'Passive'];
const CONCURRENCY = 6;
const FORCE = process.argv.includes('--force');
const MIN_BYTES = 200;

const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const idsFilter = idsArg ? new Set(idsArg.slice('--ids='.length).split(',').filter(Boolean)) : null;

// 角色 id 清单：本地角色文档为准（index.json 是索引不是角色，排除掉）
const ids = readdirSync(CHAR_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => f.replace(/\.json$/, ''))
  .filter((id) => (idsFilter ? idsFilter.has(id) : true))
  .sort();

if (ids.length === 0) {
  console.error(`未在 ${CHAR_DIR} 找到角色 json，无法取 id 清单`);
  process.exit(1);
}

async function fetchImage(url) {
  let lastErr = null;
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return { err: '404' };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('image/')) return { err: `非图片响应 ${type}` };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_BYTES) return { err: `过小 ${buf.length}B` };
      return { buf };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return { err: String(lastErr && lastErr.message ? lastErr.message : lastErr) };
}

// 游标式并发池（与 fetch-portraits / fetch-monster-art 同风格）
async function pool(items, worker, limit) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

mkdirSync(OUT_DIR, { recursive: true });

let added = 0;
let kept = 0;
let skipped = 0;
const failures = [];

// 先分出已存在的，只下载待办项
const todo = [];
for (const id of ids) {
  for (const kind of KINDS) {
    const file = join(OUT_DIR, `${id}_${kind}.webp`);
    if (existsSync(file) && !FORCE) {
      kept += 1;
      continue;
    }
    todo.push({ id, kind, file });
  }
}

console.log(`角色 ${ids.length} 个 × ${KINDS.length} 类 = ${ids.length * KINDS.length} 项，本次待下载 ${todo.length} 项…`);

await pool(todo, async ({ id, kind, file }) => {
  const url = `${CDN}/skillicons/SkillIcon_${id}_${kind}.webp`;
  const { buf, err } = await fetchImage(url);
  if (err === '404') {
    skipped += 1;
    return;
  }
  if (err) {
    failures.push(`${id}_${kind}: ${err}`);
    return;
  }
  writeFileSync(file, buf);
  added += 1;
  if ((added + skipped + failures.length) % 50 === 0) {
    process.stdout.write(`  …${added + skipped + failures.length}/${todo.length}\n`);
  }
}, CONCURRENCY);

const onDisk = statSync(OUT_DIR).isDirectory() ? readdirSync(OUT_DIR).filter((f) => f.endsWith('.webp')).length : 0;
const bytes = readdirSync(OUT_DIR)
  .filter((f) => f.endsWith('.webp'))
  .reduce((s, f) => s + statSync(join(OUT_DIR, f)).size, 0);
console.log(`\n本次新增 ${added} 张 · 已存在 ${kept} 张 · 源站无图 ${skipped} 项 · 目录现有 ${onDisk} 张（${(bytes / 1024 / 1024).toFixed(2)}MB）`);

if (failures.length) {
  console.error(`\n失败 ${failures.length} 项：`);
  for (const f of failures.slice(0, 30)) console.error(`  ${f}`);
  if (failures.length > 30) console.error(`  …（其余 ${failures.length - 30} 项省略）`);
  process.exit(1);
}

console.log('\n下一步：UI 侧按 /skillicon/{角色id}_{Normal|BP|Ultra|Passive}.webp 引用（角色 id 用 BATTLE_ROSTER_ID 映射）。');