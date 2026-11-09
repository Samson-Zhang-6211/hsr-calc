// 下载每套遗器的**部位图标**到 apps/web/public/relicpieces/{setId}-{slot}.webp。
//
// 2026-10-29 用户要求：截图/视频识别的遗器比对要用「部位图 vs 部位图」，
// 不能用「套装徽标 vs 部位图」。图标路径来自 站点 遗器详情页实际请求：
//   （静态资源根地址）/relicfigures/IconRelic_{relicsetId}_{slot}.webp
// slot：四件套 1..4（头/手/身/脚），位面套 1..2（球/绳）。
//
// 用法：
//   node scripts/fetch-relic-pieces.mjs [--force]
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetBase } from './lib/env-base.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DATA = join(ROOT, 'data', 'relicsets');
const OUT = join(ROOT, 'apps', 'web', 'public', 'relicpieces');
const CDN = assetBase('relicfigures');
const UA = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};
const FORCE = process.argv.includes('--force');
const MIN_BYTES = 500;
mkdirSync(OUT, { recursive: true });

const files = readdirSync(DATA).filter((f) => /^\d+\.json$/.test(f));

async function fetchImage(url) {
  let lastErr = null;
  for (let i = 0; i < 4; i += 1) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 404) return { err: '404' };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_BYTES) return { err: `过小 ${buf.length}B` };
      return { buf };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  return { err: lastErr?.message ?? String(lastErr) };
}

const jobs = [];
for (const file of files) {
  const id = file.replace(/\.json$/, '');
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(DATA, file), 'utf8'));
  } catch {
    continue;
  }
  const four = doc?.meta?.fourPiece === true;
  // 四件套：1..4（头/手/身/脚）；位面套：5..6（球/绳）—— 实测 301_5/301_6 才有图
  const slots = four ? [1, 2, 3, 4] : [5, 6];
  for (const slot of slots) jobs.push({ id, slot });
}

let ok = 0;
let skip = 0;
const failed = [];
let next = 0;
const workers = Array.from({ length: 6 }, async () => {
  while (next < jobs.length) {
    const { id, slot } = jobs[next];
    next += 1;
    const out = join(OUT, `${id}-${slot}.webp`);
    if (!FORCE && existsSync(out) && statSync(out).size >= MIN_BYTES) {
      skip += 1;
      continue;
    }
    const { buf, err } = await fetchImage(`${CDN}/IconRelic_${id}_${slot}.webp`);
    if (!buf) {
      failed.push(`${id}-${slot}: ${err}`);
      continue;
    }
    writeFileSync(out, buf);
    ok += 1;
  }
});
await Promise.all(workers);
console.log(`[relicpieces] 下载 ${ok} / 跳过 ${skip} / 失败 ${failed.length} / 共 ${jobs.length}`);
if (failed.length) console.log(failed.slice(0, 20).join('\n'));
