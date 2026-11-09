// 下载 nanoka 的角色立绘到 apps/web/public/ 下。
// 路径约定来自 nanoka 前端站点 bundle；两种图各有用处：
//   draw（avatardrawcard）= 2048×2048 正方形带 alpha 原图，单张 0.6–1.6MB。nanoka 角色卡就是拿这张图
//     用 CSS 裁成圆角竖卡 + 叠属性/命途徽章 + 底部名字条。做「完整卡」复刻时用这张，裁切参数可控。
//   shop（avatarshopicon）= 站点已裁好的竖版半身图，单张约 100KB。直接当竖版用最省事。
// 用法：
//   node scripts/fetch-portraits.mjs                      只拉 draw（默认）
//   node scripts/fetch-portraits.mjs --kind=shop          只拉 shop
//   node scripts/fetch-portraits.mjs --kind=both          两种都拉
//   node scripts/fetch-portraits.mjs --kind=both --force   已存在的也重下（整站换图/版本更新时用）
//   node scripts/fetch-portraits.mjs --ids=1001,1513      只拉指定 id（逗号分隔，配合 --force 可精准更新）
//
// 说明：
//   - id 列表以本地 data/characters/*.json 实况为准（本地有什么就拉什么，默认 99 份）。
//   - draw 全量约 89MB、shop 全量约 10MB；public 目录会被 Vite 原样拷进 dist。
//   - 只下载不写库：meta 字段由 scripts/gen-portrait-meta.mjs 单独回填。
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const idsArg = argv.find((a) => a.startsWith('--ids='));
const idFilter = idsArg
  ? new Set(idsArg.slice('--ids='.length).split(',').map((s) => s.trim()).filter(Boolean))
  : null;
const kindArg = (argv.find((a) => a.startsWith('--kind=')) ?? '--kind=draw').slice('--kind='.length).trim();

// cdn 目录 → 输出目录；两者与 gen-portrait-meta.mjs 的字段名一一对应
const KINDS = {
  draw: { cdn: 'avatardrawcard', dir: 'portraits' },
  shop: { cdn: 'avatarshopicon', dir: 'portraits-shop' },
};
const kindNames = kindArg === 'both' ? ['draw', 'shop'] : [kindArg];
for (const k of kindNames) {
  if (!Object.hasOwn(KINDS, k)) {
    console.error(`--kind 取值非法：${k}（可用 draw / shop / both）`);
    process.exit(1);
  }
}

const CDN_BASE = 'https://static.nanoka.cc/assets/hsr';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SRC_DIR = `${ROOT}data/characters`;
const PUBLIC_DIR = `${ROOT}apps/web/public`;
const MIN_BYTES = 10 * 1024;

async function fetchImage(url) {
  let lastErr;
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status === 404) throw new Error(`HTTP 404 ${url}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) throw new Error(`非图片响应 ${type} ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < MIN_BYTES) throw new Error(`响应过小 ${buf.byteLength}B ${url}`);
      return buf;
    } catch (e) {
      lastErr = e;
      if (e instanceof Error && /HTTP 404/.test(e.message)) throw e;
      await delay(400 * (i + 1));
    }
  }
  throw lastErr;
}

async function pool(items, limit, worker) {
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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const files = (await readdir(SRC_DIR)).filter((f) => /^\d+\.json$/.test(f));
const ids = files.map((f) => f.replace(/\.json$/, '')).sort((a, b) => Number(a) - Number(b));
const wanted = ids.filter((id) => !idFilter || idFilter.has(id));
if (wanted.length === 0) {
  console.error('没有匹配的角色 id（本地 data/characters 为空或 --ids 全不命中）');
  process.exit(1);
}

const failures = [];

for (const kind of kindNames) {
  const { cdn, dir } = KINDS[kind];
  const outDir = `${PUBLIC_DIR}/${dir}`;
  await mkdir(outDir, { recursive: true });

  const pending = [];
  for (const id of wanted) {
    if (!FORCE && (await exists(`${outDir}/${id}.webp`))) continue;
    pending.push(id);
  }

  let bytes = 0;
  if (pending.length > 0) {
    let done = 0;
    await pool(pending, 6, async (id) => {
      try {
        const buf = await fetchImage(`${CDN_BASE}/${cdn}/${id}.webp`);
        await writeFile(`${outDir}/${id}.webp`, buf);
        bytes += buf.byteLength;
        done += 1;
        if (done % 10 === 0 || done === pending.length) {
          console.log(`[${kind}] ${done}/${pending.length}（${(bytes / 1048576).toFixed(1)}MB）`);
        }
      } catch (e) {
        failures.push(`${kind}/${id}: ${e.message}`);
      }
    });
  }

  // 汇总：目录实况统计
  const onDisk = (await readdir(outDir)).filter((f) => /^\d+\.webp$/.test(f));
  let totalBytes = 0;
  for (const f of onDisk) totalBytes += (await stat(`${outDir}/${f}`)).size;
  console.log(
    `[${kind}] 本次新增 ${pending.length - failures.length} 张 / 共 ${(bytes / 1048576).toFixed(1)}MB；` +
      `目录现有 ${onDisk.length} 张，合计 ${(totalBytes / 1048576).toFixed(1)}MB（角色 ${ids.length} 个）`,
  );
}

if (failures.length > 0) {
  console.error(`失败 ${failures.length} 项：`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

// 顺带核一遍本地角色文档是否都能读，避免回填脚本对着坏文件写字段
let broken = 0;
for (const f of files) {
  try {
    JSON.parse(await readFile(`${SRC_DIR}/${f}`, 'utf8'));
  } catch {
    broken += 1;
    console.error(`本地文档损坏：data/characters/${f}`);
  }
}
if (broken > 0) process.exit(1);
console.log('全部完成；下一步：node scripts/gen-portrait-meta.mjs');