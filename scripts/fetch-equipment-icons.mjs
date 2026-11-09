// 下载光锥/遗器套装图标到 apps/web/public/（2026-10-29）。
// 数据源与 nanoka 前端一致：
//   光锥   https://static.nanoka.cc/assets/hsr/lightconemediumicon/{id}.webp
//   遗器套装 https://static.nanoka.cc/assets/hsr/itemfigures/{iconId}.webp
//            （iconId 来自套装详情 zh/relicset/{id}.json 的 icon: "SpriteOutput/ItemIcon/71000.png"）
// 用法：
//   node scripts/fetch-equipment-icons.mjs              全量（已存在且够大的跳过）
//   node scripts/fetch-equipment-icons.mjs --force      全部重下
//   node scripts/fetch-equipment-icons.mjs --only=lc    只拉光锥
//   node scripts/fetch-equipment-icons.mjs --only=relic 只拉遗器
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveVersion } from './lib/data-source.mjs';

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const onlyArg = (argv.find((a) => a.startsWith('--only=')) ?? '').slice('--only='.length);
const only = onlyArg || 'both';

// 版本口径唯一来源 = data/source.lock.json（遗器套装详情按 relicsets 口径）
const VERSION = await resolveVersion(null, 'relicsets');
const CDN = 'https://static.nanoka.cc';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC = `${ROOT}apps/web/public`;
const MIN_BYTES = 4 * 1024;
const CONCURRENCY = 6;
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; hsr-calc asset fetcher)' };

const readJson = async (p) => JSON.parse((await readFile(p, 'utf8')).replace(/^\uFEFF/, ''));

async function fetchBuf(url) {
  let lastErr;
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 404) throw new Error(`HTTP 404 ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) throw new Error(`非图片响应 ${type} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < MIN_BYTES) throw new Error(`响应过小 ${buf.byteLength}B ${url}`);
      return buf;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

async function exists(p) {
  try {
    const s = await stat(p);
    return s.size >= MIN_BYTES;
  } catch {
    return false;
  }
}

async function runPool(items, worker, n = CONCURRENCY) {
  let i = 0;
  const results = [];
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await worker(items[idx], idx);
      }
    }),
  );
  return results;
}

const jobs = [];

if (only === 'both' || only === 'lc') {
  const idx = await readJson(`${ROOT}data/lightcones/index.json`);
  const ids = idx.items.map((it) => it.id);
  jobs.push({
    label: 'lc',
    dir: `${PUBLIC}/lightcones`,
    ids,
    urlOf: (id) => `${CDN}/assets/hsr/lightconemediumicon/${id}.webp`,
  });
}

if (only === 'both' || only === 'relic') {
  const idx = await readJson(`${ROOT}data/relicsets/index.json`);
  const ids = idx.items.map((it) => it.id);
  // 先解析每套的 iconId
  const iconIds = await runPool(ids, async (id) => {
    try {
      const res = await fetch(`${CDN}/hsr/${VERSION}/zh/relicset/${id}.json`, { headers: UA });
      if (!res.ok) return null;
      const j = await res.json();
      const m = /ItemIcon\/(\d+)/.exec(String(j.icon ?? ''));
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }, 4);
  const map = new Map(ids.map((id, i) => [id, iconIds[i]]));
  jobs.push({
    label: 'relic',
    dir: `${PUBLIC}/relicsets`,
    ids: ids.filter((id) => map.get(id)),
    urlOf: (id) => `${CDN}/assets/hsr/itemfigures/${map.get(id)}.webp`,
  });
}

for (const job of jobs) {
  await mkdir(job.dir, { recursive: true });
  let ok = 0;
  let skip = 0;
  const failed = [];
  await runPool(job.ids, async (id) => {
    const out = `${job.dir}/${id}.webp`;
    if (!FORCE && (await exists(out))) {
      skip += 1;
      return;
    }
    try {
      const buf = await fetchBuf(job.urlOf(id));
      await writeFile(out, buf);
      ok += 1;
    } catch (e) {
      failed.push(`${id}: ${e.message}`);
    }
  });
  console.log(`[${job.label}] 下载 ${ok} / 跳过 ${skip} / 失败 ${failed.length} / 共 ${job.ids.length}`);
  if (failed.length > 0) console.log(failed.slice(0, 10).join('\n'));
}
