// 下载 社区数据源 的元素图标与命途图标到本地 public 目录。
// 用途：全真模拟战场可视化（属性徽章 / 命途徽章）。
//
// 用法：
//   node scripts/fetch-ui-icons.mjs [--force]
//
// 已知路径约定（2026-10 实测，来源 站点 实际网络请求）：
//   元素：assets/hsr/element/{小写英文名}.webp   —— 32x32 alpha，0.7–1.0KB
//   命途：assets/hsr/pathicon/{小写英文名}.webp   —— 612x612（memory/elation 为 512x512）alpha，13–35KB
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetBase } from './lib/env-base.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDN = assetBase();
const PUBLIC = join(ROOT, 'apps', 'web', 'public');

const SETS = [
  { key: 'element', dir: 'element', names: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] },
  { key: 'pathicon', dir: 'pathicon', names: ['Warrior', 'Rogue', 'Mage', 'Shaman', 'Warlock', 'Knight', 'Priest', 'Memory', 'Elation'] },
];

const FORCE = process.argv.includes('--force');
const MIN_BYTES = 200;

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

const failures = [];

for (const set of SETS) {
  const outDir = join(PUBLIC, set.key);
  mkdirSync(outDir, { recursive: true });
  let added = 0;
  let kept = 0;

  for (const name of set.names) {
    const file = join(outDir, `${name.toLowerCase()}.webp`);
    if (existsSync(file) && !FORCE) {
      kept += 1;
      continue;
    }
    const url = `${CDN}/${set.dir}/${name.toLowerCase()}.webp`;
    const { buf, err } = await fetchImage(url);
    if (err) {
      failures.push(`${set.key}/${name}: ${err}`);
      continue;
    }
    writeFileSync(file, buf);
    added += 1;
  }

  const total = statSync(outDir).isDirectory()
    ? set.names.filter((n) => existsSync(join(outDir, `${n.toLowerCase()}.webp`))).length
    : 0;
  console.log(`${set.key}：本次新增 ${added} 张 · 已存在 ${kept} 张 · 目录现有 ${total}/${set.names.length} 张`);
}

if (failures.length) {
  console.error(`\n失败 ${failures.length} 项：`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log('\n下一步：UI 侧按 /element/<小写元素名>.webp 与 /pathicon/<小写命途名>.webp 引用。');