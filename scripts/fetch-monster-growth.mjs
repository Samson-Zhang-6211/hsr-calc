// 拉取 nanoka 怪物等级换算成长表（EliteGroup / HardLevelGroup）到 data/monster-growth/。
// 用法：node scripts/fetch-monster-growth.mjs [版本]
//   版本 默认 4.6.51（与 data/ 其余文档同版本口径）
// 换算公式（前端 nodes/23 实读）：面板 = base × childModifyRatio × EG.Ratio × HG[level].Ratio（speed/stance 另加 modify_value）
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveVersion } from './lib/data-source.mjs';

const argv = process.argv.slice(2);
// 版本口径唯一来源 = data/source.lock.json（显式传参仍优先）
const VERSION = await resolveVersion(argv.find((a) => /^\d/.test(a)), 'monster-growth');

const BASE = `https://static.nanoka.cc/hsr/${VERSION}`;
const ROOT = fileURLToPath(new URL('../data/monster-growth/', import.meta.url));

const TABLES = ['EliteGroup', 'HardLevelGroup'];

await mkdir(ROOT, { recursive: true });
for (const name of TABLES) {
  const url = `${BASE}/${name}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${url} -> ${res.status}`);
  const text = await res.text();
  JSON.parse(text); // 落盘前先校验是合法 JSON
  await writeFile(`${ROOT}${name}.json`, text, 'utf8');
  const count = Object.keys(JSON.parse(text)).length;
  console.log(`${name}.json: ${count} 条`);
}
console.log(`done: data/monster-growth/ (${VERSION})`);
