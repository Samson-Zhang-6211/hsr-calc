// 生成离线包用的「经典脚本」数据分片（2026-11-08）。
//
// 为什么不是 JSON：`file://` 页面里 fetch/XHR/动态 import 都会被 CORS 拦死
// （origin 是 null），只有经典 `<script src="...">` 不受限制。所以把每类文档
// 预先拼成一个脚本，运行时挂到 `window.__HSR_STATIC__[类别]`。
//
// 输出：apps/web/.offline-data/{characters,lightcones,relicsets,monsters}.js
// 用法：node scripts/gen-offline-data.mjs
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'apps', 'web', '.offline-data');
const CATEGORIES = ['characters', 'lightcones', 'relicsets', 'monsters', 'monster-growth'];

/** 单类文档 → 一个经典脚本；键用聚合 JSON 原文，省一次 parse+stringify */
function buildCategory(category) {
  const dir = join(ROOT, 'data', category);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();
  const parts = [];
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    const raw = readFileSync(join(dir, file), 'utf8');
    // 坏 JSON 立刻抛：宁可不生成，也不要产出半个数据包
    JSON.parse(raw);
    parts.push(`${JSON.stringify(id)}:${raw}`);
  }
  const code =
    '/* 自动生成，勿手改（node scripts/gen-offline-data.mjs）—— 离线包数据分片 */\n' +
    ';(function (g) {\n' +
    '  g.__HSR_STATIC__ = g.__HSR_STATIC__ || {};\n' +
    // 必须用方括号：类别名里有连字符（monster-growth），点号写法是语法错误
    `  g.__HSR_STATIC__[${JSON.stringify(category)}] = {${parts.join(',')}};\n` +
    '})(this);\n';
  // 生成的脚本必须能解析。new Function 只编译不执行，足够抓语法错误
  // —— 曾经把 `monster-growth` 写成 `.monster-growth`，产出一个加载就抛错的静默坏包。
  new Function(code);
  const target = join(OUT_DIR, `${category}.js`);
  writeFileSync(target, code, 'utf8');
  const mb = statSync(target).size / (1024 * 1024);
  console.log(`  ${category.padEnd(11)} ${String(files.length).padStart(4)} 篇 → ${mb.toFixed(1)} MB`);
}

mkdirSync(OUT_DIR, { recursive: true });
console.log('[gen-offline-data] 生成离线数据分片：');
for (const category of CATEGORIES) buildCategory(category);
console.log(`[gen-offline-data] 输出目录 ${OUT_DIR}`);
