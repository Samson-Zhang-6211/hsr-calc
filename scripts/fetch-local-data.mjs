// 将 nanoka 的角色/光锥/遗器套装/怪物详情（中英）下载为 data/ 下的本地文档。
// 用法：
//   node scripts/fetch-local-data.mjs [版本] [类型...] [--force] [--ids=1001,1002]
//   版本   缺省读 data/source.lock.json 的对应类型口径（无锁则 4.6.51）
//   类型   characters / lightcones / relicsets / monsters（缺省=全部）
//   --force 已存在的文档也重新下载（局部更新时用）
//   --ids=  只下载指定 id（逗号分隔，配合 --force 可精准更新）
//
// ⚠ 版本核对/升级请优先用 scripts/sync-data.mjs：它先落到 data/.incoming/<版本>/ 并产出差异报告，
//   不会盲覆盖 data/。本脚本是「直接落盘」的全量路径，适合首次 bootstrap 或确认无误后的批量重建。
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import {
  DATA_ROOT,
  FALLBACK_VERSION,
  SOURCE_BASE,
  TYPES,
  buildDoc,
  fetchJson,
  lockVersion,
  pool,
  readLock,
} from './lib/data-source.mjs';

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const idsArg = argv.find((a) => a.startsWith('--ids='));
const idFilter = idsArg
  ? new Set(idsArg.slice('--ids='.length).split(',').map((s) => s.trim()).filter(Boolean))
  : null;
const positionals = argv.filter((a) => !a.startsWith('--'));
const explicitVersion = positionals.find((a) => /^\d/.test(a)) ?? null;
const typeFilter = new Set(positionals.filter((a) => !/^\d/.test(a)));

const lock = await readLock();
const types = TYPES.filter((t) => typeFilter.size === 0 || typeFilter.has(t.folder));

if (typeFilter.size > 0 && types.length === 0) {
  console.error(`未知类型：${[...typeFilter].join(',')}（可选 characters/lightcones/relicsets/monsters）`);
  process.exit(1);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const failures = [];

for (const type of types) {
  // 版本按类型各自解析（历史上 characters 4.6.53 / 其余 4.6.51 混装，锁文件如实记录）
  const version = explicitVersion ?? lockVersion(lock, type.folder) ?? FALLBACK_VERSION;
  const base = `${SOURCE_BASE}/${version}`;
  const dir = `${DATA_ROOT}${type.folder}`;
  await mkdir(dir, { recursive: true });
  console.log(`[${type.folder}] 版本 ${version}`);

  const total = (await fetchJson(`${base}/${type.endpoint}.json`)).data;
  const ids = Object.keys(total).sort((a, b) => Number(a) - Number(b));
  const wanted = ids.filter((id) => !idFilter || idFilter.has(id));

  const pending = [];
  for (const id of wanted) {
    if (!FORCE && (await exists(`${dir}/${id}.json`))) continue;
    pending.push(id);
  }

  if (pending.length > 0) {
    let done = 0;
    await pool(pending, 6, async (id) => {
      try {
        const [zh, en] = await Promise.all([
          fetchJson(`${base}/zh/${type.endpoint}/${id}.json`),
          fetchJson(`${base}/en/${type.endpoint}/${id}.json`),
        ]);
        const doc = buildDoc({ id, endpoint: type.endpoint, version, row: total[id] ?? {}, zh: zh.data, en: en.data });
        await writeFile(`${dir}/${id}.json`, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        done += 1;
        if (done % 20 === 0 || done === pending.length) console.log(`[${type.folder}] ${done}/${pending.length}`);
      } catch (e) {
        failures.push(`${type.folder}/${id}: ${e.message}`);
      }
    });
  }

  // 索引：按目录实况重建（包含本次未重新下载的旧文档）
  const files = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => Number(a) - Number(b));
  const items = [];
  for (const f of files) {
    try {
      const doc = JSON.parse(await readFile(`${dir}/${f}`, 'utf8'));
      items.push({ id: doc.id, zh: doc.name?.zh ?? '', en: doc.name?.en ?? '', meta: doc.meta ?? {} });
    } catch (e) {
      failures.push(`${type.folder}/${f}: 文档损坏 ${e.message}`);
    }
  }
  await writeFile(`${dir}/index.json`, `${JSON.stringify({ version, count: items.length, items }, null, 2)}\n`, 'utf8');
  console.log(`[${type.folder}] 文档 ${files.length} 份，索引已更新`);
}

if (failures.length > 0) {
  console.error(`失败 ${failures.length} 项：`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('全部完成（若版本有变，记得跑 node scripts/gen-source-lock.mjs 刷新锁文件）');
