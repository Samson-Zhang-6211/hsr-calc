// 下载 nanoka 的怪物美术到本地 public 目录，供全真模拟战场可视化当敌方头像。
//
// 路径约定（2026-10 实测）：文件名带 Monster_ 前缀，缺前缀一律 404。
//   monsterfigure/Monster_{id}.webp     —— 1024x1024 alpha，42–224KB（大立绘）
//   monstermiddleicon/Monster_{id}.webp  —— 376x512 alpha，27–99KB（竖版半身，适合当头像）
// 美术覆盖不完整：并非每个 monster id 都有图（如 1004011 可可利亚两种都 404），
// 脚本会把 404 记为 skipped 而不是失败，UI 侧需保留占位兜底。
//
// 用法：
//   node scripts/fetch-monster-art.mjs [--ids=8001030,1002011] [--kind=middle|figure|both] [--force] [--all]
//   --all  ：对 data/monsters/ 下全部怪物批量拉取（数百次请求，耗时较长）
import { mkdirSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://static.nanoka.cc/assets/hsr';
const PUBLIC = join(ROOT, 'apps', 'web', 'public');
const MONSTER_DIR = join(ROOT, 'data', 'monsters');

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const FORCE = argv.includes('--force');
const ALL = argv.includes('--all');
const KIND = flag('kind', 'both');
if (!['middle', 'figure', 'both'].includes(KIND)) {
  console.error(`--kind 取值非法：${KIND}（可用：middle / figure / both）`);
  process.exit(1);
}

const KINDS = {
  middle: { cdn: 'monstermiddleicon', out: 'monster-art', suffix: '.webp' },
  figure: { cdn: 'monsterfigure', out: 'monster-art-lg', suffix: '.webp' },
};

function allMonsterIds() {
  if (!existsSync(MONSTER_DIR)) return [];
  return readdirSync(MONSTER_DIR)
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => f.slice(0, -5));
}

const ids = flag('ids') ? flag('ids').split(',').map((s) => s.trim()).filter(Boolean) : ALL ? allMonsterIds() : ['8001030'];
if (ids.length === 0) {
  console.error('没有可处理的怪物 id（data/monsters/ 为空？）');
  process.exit(1);
}

const MIN_BYTES = 1024;

async function fetchImage(url) {
  let lastErr = null;
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return { skip: '404' };
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

const kindList = KIND === 'both' ? ['middle', 'figure'] : [KIND];
const failures = [];
let skipped = 0;

// 并发拉取（与 fetch-portraits 一致的 pool(6)），--all 模式有数百个 id
const CONCURRENCY = 6;
async function pool(items, worker, limit) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

for (const kind of kindList) {
  const k = KINDS[kind];
  const outDir = join(PUBLIC, k.out);
  mkdirSync(outDir, { recursive: true });
  let added = 0;
  let kept = 0;
  let bytes = 0;

  const todo = [];
  for (const id of ids) {
    const file = join(outDir, `${id}${k.suffix}`);
    if (existsSync(file) && !FORCE) {
      kept += 1;
      continue;
    }
    todo.push(id);
  }

  let done = 0;
  await pool(
    todo,
    async (id) => {
      const file = join(outDir, `${id}${k.suffix}`);
      const { buf, err, skip } = await fetchImage(`${CDN}/${k.cdn}/Monster_${id}.webp`);
      if (skip) {
        skipped += 1;
      } else if (err) {
        failures.push(`${kind}/${id}: ${err}`);
      } else {
        writeFileSync(file, buf);
        added += 1;
        bytes += buf.length;
      }
      done += 1;
      if (done % 50 === 0) console.log(`  …${done}/${todo.length}`);
    },
    CONCURRENCY,
  );

  console.log(`${kind}：新增 ${added} 张 · 已存在 ${kept} 张 · 无美术跳过 ${skipped} 张 · 本次 ${(bytes / 1024 / 1024).toFixed(2)}MB`);
}

if (failures.length) {
  console.error(`\n失败 ${failures.length} 项：`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  if (failures.length > 20) console.error(`  …另有 ${failures.length - 20} 项`);
  process.exit(1);
}

console.log('\nUI 侧按 /monster-art/{id}.webp 引用；无图时回退 CSS 占位徽章。');