// 增量同步 nanoka 静态源 → data/.incoming/<版本>/，产出差异报告；默认 **不写回 data/**。
// 用法：
//   node scripts/sync-data.mjs [版本] [类型...] [--ids=1001,1310] [--jobs=6] [--force] [--promote] [--offline]
//     版本      缺省 = 站点探测到的最新版本（首页内嵌 static.nanoka.cc/hsr/<版本>/），再缺省读锁文件
//     类型      characters / lightcones / relicsets / monsters / monster-growth（缺省 = 全部）
//     --ids=    只同步指定 id（逗号分隔；测试服期只补新增内容时用，可隔离既有参数漂移）
//     --force   忽略 ETag 缓存，强制重新下载
//     --offline 不联网，用 data/.incoming/<版本>/ 里已抓到的内容重算报告（改报告格式时用）
//     --promote 把已审阅的暂存结果写回 data/、重建索引、重跑手工补丁、更新锁文件（不跑派生链）
//
// 为什么先 staging：直接覆盖 data/ 后只能靠测试变红反推「改了什么」，而锚点是绝对伤害值，
// 红的时候分不清真 bug 与参数漂移。这里把「抓取」和「落盘」拆开，中间插一页可审阅的报告。
//
// 三类「伪差异」在这里被剔除，避免真变更被淹没：
//   1. meta 里的本地回填字段（effectiveSubstats / portrait / portraitShop / substatWeights /
//      patchNote / patched / critRateTarget）—— 上游没有，只按上游 meta 的键比较；
//   2. en 分支 —— 引擎只读 zh，en 只作参考，单独统计不混进「真实数值变更」；
//   3. 手工补丁作用域（apply-<id>-enhanced.mjs 改写的 skills/ranks/skill_trees）—— 折叠计数。
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import {
  DATA_ROOT,
  FALLBACK_VERSION,
  REPO_ROOT,
  SOURCE_BASE,
  TYPES,
  buildDoc,
  canonical,
  contentSha,
  detectLatestVersion,
  enhancedPatchMap,
  fetchJson,
  listIds,
  pool,
  readLock,
  sha256,
  writeLock,
} from './lib/data-source.mjs';

/** 手工补丁作用域兜底（拿不到 enhanced 块时按路径前缀判） */
const PATCH_SCOPE = /^(zh|en)\.(skills|ranks|ex_ranks|skill_trees|enhanced)(\.|$)/;

/**
 * 精确折叠判定：apply-<id>-enhanced.mjs 只覆写 enhanced['1'] 里出现过的条目，所以
 * 只有「enhanced 里有对应键」的路径才算补丁造成的差异；没覆盖到的（例如上游 4.6.54 把
 * 流萤 point06/point07 的加强值直接落到基础行迹）必须当成真实上游变更报出来。
 * enhanced 技能 id 恒为 `'1' + 基础 id`（1131001 ↔ 131001，8 个补丁脚本一致）。
 */
function makeFoldCheck(doc) {
  const sets = {};
  for (const lang of ['zh', 'en']) {
    const enh = doc?.[lang]?.enhanced?.['1'] ?? {};
    sets[lang] = {
      skills: new Set(Object.keys(enh.skills ?? {})),
      ranks: new Set(Object.keys(enh.ranks ?? {})),
      trees: new Set(Object.keys(enh.skill_trees ?? {})),
      known: Boolean(doc?.[lang]?.enhanced?.['1']),
    };
  }
  return (path) => {
    const lang = path.startsWith('en.') ? 'en' : 'zh';
    const s = sets[lang];
    if (!s.known) return PATCH_SCOPE.test(path);
    let m = /^[a-z]+\.skills\.(\d+)\./.exec(path);
    if (m) return s.skills.has(`1${m[1]}`);
    m = /^[a-z]+\.ranks\.(\d+)\./.exec(path);
    if (m) return s.ranks.has(m[1]);
    m = /^[a-z]+\.skill_trees\.(point\d+)\./.exec(path);
    if (m) return s.trees.has(m[1]);
    if (/^[a-z]+\.(ex_ranks|enhanced)\./.test(path)) return true;
    return false;
  };
}

/** 生成物不参与「引用面」扫描（它们本来就含全部 skill id，是噪声） */
const GENERATED = new Set([
  'skill-data.ts',
  'skill-raw.json',
  'monster-stages.ts',
  'monster-resist-table.ts',
  'lightcone-data.ts',
  'relic-set-data.ts',
]);

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const PROMOTE = argv.includes('--promote');
const OFFLINE = argv.includes('--offline');
const jobsArg = argv.find((a) => a.startsWith('--jobs='));
const JOBS = Math.max(1, Number(jobsArg?.slice('--jobs='.length) ?? 6) || 6);
const idsArg = argv.find((a) => a.startsWith('--ids='));
const idFilter = idsArg
  ? new Set(idsArg.slice('--ids='.length).split(',').map((s) => s.trim()).filter(Boolean))
  : null;
const positionals = argv.filter((a) => !a.startsWith('--'));
const explicitVersion = positionals.find((a) => /^\d/.test(a)) ?? null;
const typeFilter = new Set(positionals.filter((a) => !/^\d/.test(a)));

const lock = await readLock();
const patchMap = await enhancedPatchMap();
const version =
  explicitVersion ??
  (OFFLINE ? lock.version : await detectLatestVersion()) ??
  lock.version ??
  FALLBACK_VERSION;
const base = `${SOURCE_BASE}/${version}`;
const stagingRoot = `${DATA_ROOT}.incoming/${version}/`;

const TYPES_TO_SYNC = TYPES.filter((t) => typeFilter.size === 0 || typeFilter.has(t.folder));
const WANT_GROWTH = typeFilter.size === 0 || typeFilter.has('monster-growth');

if (TYPES_TO_SYNC.length === 0 && !WANT_GROWTH) {
  console.error(`未知类型：${[...typeFilter].join(',')}（可选 characters/lightcones/relicsets/monsters/monster-growth）`);
  process.exit(1);
}

const stamp = () => `${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`;

if (PROMOTE) {
  await promote();
  process.exit(0);
}

// ───────────────────────── sync ─────────────────────────
await mkdir(stagingRoot, { recursive: true });

const failures = [];
const manifest = { version, generatedAt: stamp(), source: base, offline: OFFLINE, types: {} };
const report = { version, generatedAt: stamp(), source: base, offline: OFFLINE, base: {}, types: {}, growth: null };

for (const type of TYPES_TO_SYNC) {
  const localIds = await listIds(type.folder).catch(() => []);
  const localSet = new Set(localIds);
  const stagedIds = await listIds(`.incoming/${version}/${type.folder}`).catch(() => []);

  let rows = {};
  let remoteIds;
  if (OFFLINE) {
    // 离线：远端集合 = 本地 ∪ 暂存（暂存里只有新增/变更）
    remoteIds = [...new Set([...localIds, ...stagedIds])].sort((a, b) => Number(a) - Number(b));
  } else {
    rows = (await fetchJson(`${base}/${type.endpoint}.json`)).data;
    remoteIds = Object.keys(rows).sort((a, b) => Number(a) - Number(b));
  }
  const remoteSet = new Set(remoteIds);
  const wanted = idFilter ? remoteIds.filter((id) => idFilter.has(id)) : remoteIds;

  const added = wanted.filter((id) => !localSet.has(id));
  const removed = OFFLINE || idFilter ? [] : localIds.filter((id) => !remoteSet.has(id));

  const records = [];
  let done = 0;
  await pool(wanted, JOBS, async (id) => {
    const relPath = `${type.folder}/${id}.json`;
    let localDoc = null;
    try {
      localDoc = JSON.parse(await readFile(`${DATA_ROOT}${relPath}`, 'utf8'));
    } catch {
      /* 本地还没有这份文档 → 按新增处理 */
    }

    try {
      let zh;
      let en;
      let etagZh = null;
      let etagEn = null;
      let nameRow;

      if (OFFLINE) {
        let remoteDoc = null;
        try {
          remoteDoc = JSON.parse(await readFile(`${stagingRoot}${relPath}`, 'utf8'));
        } catch {
          remoteDoc = null;
        }
        const source = remoteDoc ?? localDoc;
        if (!source) return; // 本地与暂存都没有，无从判断
        zh = source.zh;
        en = source.en;
        // 离线没有 index，只能从文档自己的 meta 反推 metaOf 需要的 index 行
        nameRow = rowFromMeta(type.folder, source.meta, source.name);
      } else {
        const entry = lock.files?.[relPath];
        const may304 = !FORCE && localDoc && entry?.version === version;
        const [zhRes, enRes] = await Promise.all([
          fetchJson(`${base}/zh/${type.endpoint}/${id}.json`, may304 && entry.etagZh ? { etag: entry.etagZh } : {}),
          fetchJson(`${base}/en/${type.endpoint}/${id}.json`, may304 && entry.etagEn ? { etag: entry.etagEn } : {}),
        ]);
        zh = zhRes.status === 304 ? localDoc.zh : zhRes.data;
        en = enRes.status === 304 ? localDoc.en : enRes.data;
        etagZh = zhRes.status === 304 ? entry.etagZh : zhRes.etag;
        etagEn = enRes.status === 304 ? entry.etagEn : enRes.etag;
        nameRow = rows[id];
      }

      const doc = buildDoc({ id, endpoint: type.endpoint, version, row: nameRow, zh, en });
      // 只按上游 meta 的键比较：本地回填的 effectiveSubstats/portrait/... 不算内容变更
      const metaKeys = Object.keys(doc.meta);
      const status = !localDoc ? 'new' : compareKey(localDoc, metaKeys) === compareKey(doc, metaKeys) ? 'same' : 'changed';

      const rec = {
        id,
        path: relPath,
        status,
        name: doc.name?.zh ?? '',
        sha256: contentSha(doc),
        etagZh,
        etagEn,
      };
      if (status !== 'same' && !OFFLINE) {
        const docText = `${JSON.stringify(doc, null, 2)}\n`;
        const outPath = `${stagingRoot}${relPath}`;
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, docText, 'utf8');
        rec.bytes = Buffer.byteLength(docText, 'utf8');
      }
      if (status === 'changed') {
        const all = diffPaths(
          { name: localDoc.name, meta: pickMeta(localDoc.meta, metaKeys), zh: localDoc.zh, en: localDoc.en },
          { name: doc.name, meta: pickMeta(doc.meta, metaKeys), zh: doc.zh, en: doc.en },
        ).map((c) => ({ ...c, kind: classify(c), branch: branchOf(c.path) }));
        const patched = Boolean(patchMap[id]);
        const foldCheck = patched ? makeFoldCheck(doc) : () => false;
        const folded = patched ? all.filter((c) => foldCheck(c.path)) : [];
        const rest = all.filter((c) => !folded.includes(c));
        const genuine = rest.filter((c) => c.branch !== 'en');
        const enRef = rest.filter((c) => c.branch === 'en');
        // 补丁角色的 skills 差异是加强本体（量大、预期内），但 ranks/skill_trees 差异很少，
        // 且上游若把某个加强值直接落进基础字段（如 4.6.54 流萤 point06 0.25→0.55），正好落在这里
        // → 单独列出供人工抽查，避免被折叠掉。
        const review = folded
          .filter((c) => !/^(zh|en)\.skills\./.test(c.path))
          .map((c) => ({ path: c.path, local: c.before, upstream: c.after }));
        rec.patched = patched;
        rec.folded = folded.length;
        rec.review = review;
        rec.changes = genuine;
        rec.numeric = genuine.filter((c) => c.kind === 'numeric').length;
        rec.text = genuine.filter((c) => c.kind === 'text').length;
        rec.enRef = enRef.length;
        rec.enNumeric = enRef.filter((c) => c.kind === 'numeric').length;
      }
      records.push(rec);
    } catch (e) {
      failures.push(`${relPath}: ${e.message}`);
    }
    done += 1;
    if (done % 50 === 0 || done === wanted.length) console.log(`[${type.folder}] ${done}/${wanted.length}`);
  });

  records.sort((a, b) => Number(a.id) - Number(b.id));
  const changed = records.filter((r) => r.status === 'changed');
  manifest.types[type.folder] = {
    version,
    endpoint: type.endpoint,
    records: records.map((r) => ({
      id: r.id,
      path: r.path,
      status: r.status,
      sha256: r.sha256,
      etagZh: r.etagZh ?? null,
      etagEn: r.etagEn ?? null,
    })),
  };
  report.base[type.folder] = lock.byType?.[type.folder] ?? lock.version ?? '?';
  report.types[type.folder] = {
    local: localIds.length,
    remote: remoteIds.length,
    same: records.filter((r) => r.status === 'same').length,
    added: added.map((id) => ({ id, name: records.find((r) => r.id === id)?.name ?? '' })),
    removed: removed.map((id) => ({ id, name: '' })),
    changed: changed.map((r) => ({
      id: r.id,
      name: r.name,
      patched: Boolean(r.patched),
      folded: r.folded ?? 0,
      numeric: r.numeric ?? 0,
      text: r.text ?? 0,
      enRef: r.enRef ?? 0,
      enNumeric: r.enNumeric ?? 0,
      review: r.review ?? [],
      changes: r.changes ?? [],
    })),
  };
  for (const item of report.types[type.folder].removed) {
    try {
      item.name = JSON.parse(await readFile(`${DATA_ROOT}${type.folder}/${item.id}.json`, 'utf8')).name?.zh ?? '';
    } catch {
      item.name = '';
    }
  }
  const realNumeric = changed.filter((r) => (r.numeric ?? 0) > 0).length;
  const foldedOnly = changed.filter((r) => (r.changes?.length ?? 0) === 0 && (r.folded ?? 0) > 0).length;
  const enOnly = changed.filter((r) => (r.changes?.length ?? 0) === 0 && (r.folded ?? 0) === 0 && (r.enRef ?? 0) > 0).length;
  console.log(
    `[${type.folder}] 本地 ${localIds.length} / 远端 ${remoteIds.length} · 新增 ${added.length} · 消失 ${removed.length} · 变更 ${changed.length}（真实数值 ${realNumeric} / 仅补丁 ${foldedOnly} / 仅 EN ${enOnly}）· 未变 ${records.filter((r) => r.status === 'same').length}`,
  );
}

// 怪物成长表（原始 JSON 比较，无 version 字段）
if (WANT_GROWTH) {
  const growth = [];
  for (const name of ['EliteGroup', 'HardLevelGroup']) {
    try {
      let remoteData;
      if (OFFLINE) {
        try {
          remoteData = JSON.parse(await readFile(`${stagingRoot}monster-growth/${name}.json`, 'utf8'));
        } catch {
          remoteData = JSON.parse(await readFile(`${DATA_ROOT}monster-growth/${name}.json`, 'utf8'));
        }
      } else {
        remoteData = (await fetchJson(`${base}/${name}.json`)).data;
      }
      const remoteText = JSON.stringify(remoteData);
      let localText = null;
      try {
        localText = JSON.stringify(JSON.parse(await readFile(`${DATA_ROOT}monster-growth/${name}.json`, 'utf8')));
      } catch {
        localText = null;
      }
      const changed = localText !== remoteText;
      if (changed && !OFFLINE) {
        const outPath = `${stagingRoot}monster-growth/${name}.json`;
        await mkdir(dirname(outPath), { recursive: true });
        await writeFile(outPath, `${JSON.stringify(remoteData, null, 2)}\n`, 'utf8');
      }
      growth.push({
        name,
        status: localText === null ? 'new' : changed ? 'changed' : 'same',
        entries: Object.keys(remoteData).length,
      });
    } catch (e) {
      failures.push(`monster-growth/${name}.json: ${e.message}`);
    }
  }
  report.growth = growth;
  manifest.growth = growth;
  console.log(`[monster-growth] ${growth.map((g) => `${g.name}:${g.status}(${g.entries})`).join(' ')}`);
}

const corpus = reportHasChanges(report) ? await loadCorpus() : [];
if (corpus.length) attachReferences(report, corpus);

// 离线模式只重算报告，不覆盖暂存清单（暂存目录本身就是离线模式的输入）
if (!OFFLINE) await writeFile(`${stagingRoot}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(`${stagingRoot}diff.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(`${stagingRoot}diff.md`, renderMarkdown(report, patchMap), 'utf8');

console.log(`\n暂存目录：${stagingRoot}`);
console.log(`差异报告：${stagingRoot}diff.md`);
if (failures.length) {
  console.error(`\n失败 ${failures.length} 项：`);
  for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
  if (failures.length > 40) console.error(`  ……其余 ${failures.length - 40} 项略`);
}
console.log(`\n未写回 data/。审阅 diff.md 后运行：node scripts/sync-data.mjs ${version} --promote`);
if (failures.length) process.exit(1);

// ═════════════════════════ 工具函数 ═════════════════════════

function pickMeta(meta, keys) {
  const out = {};
  for (const k of keys) out[k] = meta?.[k];
  return out;
}

/** 离线模式：从文档自身的 meta 反推出 metaOf 需要的 index 行（保证 buildDoc 得到同样的 meta） */
function rowFromMeta(folder, meta = {}, name = {}) {
  const base = { zh: name?.zh, en: name?.en };
  if (folder === 'characters') {
    return { ...base, damageType: meta.element, baseType: meta.path, rank: `CombatPowerAvatarRarityType${meta.rarity ?? 0}` };
  }
  if (folder === 'lightcones') {
    return { ...base, baseType: meta.path, rank: String(meta.rarity ?? 0) };
  }
  if (folder === 'relicsets') {
    return { ...base, set: meta.fourPiece ? { 4: 1 } : {} };
  }
  return { ...base, rank: meta.rank ?? '', weak: meta.weak ?? [] };
}

function compareKey(doc, metaKeys) {
  return canonical({ name: doc.name, meta: pickMeta(doc.meta, metaKeys), zh: doc.zh, en: doc.en });
}

function branchOf(path) {
  if (path.startsWith('en.')) return 'en';
  if (path.startsWith('zh.')) return 'zh';
  if (path.startsWith('meta.')) return 'meta';
  return 'name';
}

function reportHasChanges(rep) {
  return (
    Object.values(rep.types).some((t) => t.added.length || t.removed.length || t.changed.length) ||
    (rep.growth ?? []).some((g) => g.status !== 'same')
  );
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = `${dir}${e.name}`;
    if (e.isDirectory()) await walk(`${p}/`, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !GENERATED.has(e.name)) out.push(p);
  }
  return out;
}

async function loadCorpus() {
  const files = [];
  for (const root of [`${REPO_ROOT}packages/engine/src/`, `${REPO_ROOT}packages/engine/test/`]) {
    await walk(root, files);
  }
  const rows = [];
  for (const f of files) {
    try {
      rows.push({ path: f.slice(REPO_ROOT.length).replaceAll('\\', '/'), text: await readFile(f, 'utf8') });
    } catch {
      /* 忽略读不到的文件 */
    }
  }
  return rows;
}

/** 给每条真实变更补「引用文件」：改了哪个 skillId / 角色 id，哪些源码与测试引用了它 */
function attachReferences(rep, corpus) {
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of t.changed) {
      if (!item.changes.length) {
        item.references = [];
        continue;
      }
      const needles = needlesFor(folder, item);
      const hits = new Set();
      for (const row of corpus) {
        if (needles.some((n) => row.text.includes(n))) hits.add(row.path);
      }
      item.references = [...hits].slice(0, 8);
    }
  }
}

function needlesFor(folder, item) {
  const set = new Set();
  if (folder === 'characters') {
    set.add(`'${item.id}'`);
    set.add(`"${item.id}"`);
    for (const c of item.changes) {
      for (const m of c.path.matchAll(/\b(\d{6})\b/g)) set.add(m[1]);
    }
  } else if (folder === 'monsters') {
    set.add(item.id);
  } else if (folder === 'lightcones') {
    set.add(`'${item.id}'`);
    set.add(`lc${item.id}`);
  } else {
    set.add(`relic${item.id}`);
  }
  return [...set];
}

/** 深比较，输出 {path, before, after}；undefined 表示新增/删除的键 */
function diffPaths(a, b, prefix = '', out = []) {
  if (a === b) return out;
  const isObj = (v) => v !== null && typeof v === 'object';
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
    out.push({ path: prefix, before: a, after: b });
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (!(k in a)) out.push({ path: p, before: undefined, after: b[k] });
    else if (!(k in b)) out.push({ path: p, before: a[k], after: undefined });
    else diffPaths(a[k], b[k], p, out);
  }
  return out;
}

function isNumberish(v) {
  return typeof v === 'number' || (Array.isArray(v) && v.every((x) => typeof x === 'number'));
}

/** numeric = 影响引擎数值；text = 文案；other = 结构变化 */
function classify(c) {
  if (/param_list/.test(c.path)) return 'numeric';
  if (c.path.startsWith('meta.')) return 'numeric';
  if (isNumberish(c.before) && isNumberish(c.after)) return 'numeric';
  if (typeof c.before === 'string' || typeof c.after === 'string') return 'text';
  return 'other';
}

// 注意：renderMarkdown 在主流程里就被调用，而本文件顶部有 top-level await（模块求值会挂起），
// 因此下面这些被它引用的 helper 必须是**函数声明**（提升），不能是 const 箭头（会撞 TDZ）。
function fmt(v) {
  if (v === undefined) return '（无）';
  const s = typeof v === 'string' ? v.replaceAll('\n', ' ⏎ ') : JSON.stringify(v);
  return `\`${s.length > 160 ? `${s.slice(0, 160)}…` : s}\``;
}

function renderMarkdown(rep, patches) {
  const L = [];
  const hasGrowth = Boolean(rep.growth);
  let secNo = 0;
  const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四'];
  const H = (title) => {
    secNo += 1;
    L.push(`## ${NUM[secNo - 1] ?? secNo}、${title}`, '');
  };
  L.push(`# 数据差异报告 — ${rep.version}`, '');
  L.push(`- 生成时间：${rep.generatedAt}${rep.offline ? '（离线重算）' : ''}`);
  L.push(`- 数据源：${rep.source}`);
  L.push(`- 本地基准：${Object.entries(rep.base).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  L.push(`- 暂存目录：\`data/.incoming/${rep.version}/\`（**未写回 data/**）`);
  L.push(
    '- 口径：`en` 分支仅作参考（引擎只读 `zh`）；`meta` 只比较上游字段（本地回填的 portrait/effectiveSubstats 等不算变更）；手工补丁作用域内的差异折叠。',
    '',
  );

  H('汇总');
  L.push('| 类型 | 本地 | 远端 | 新增 | 消失 | 真实数值变更 | 仅补丁 | 仅 EN 参考 | 未变 |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [folder, t] of Object.entries(rep.types)) {
    const numeric = t.changed.filter((c) => c.numeric > 0).length;
    const foldedOnly = t.changed.filter((c) => c.changes.length === 0 && c.folded > 0).length;
    const enOnly = t.changed.filter((c) => c.changes.length === 0 && c.folded === 0 && c.enRef > 0).length;
    L.push(
      `| ${folder} | ${t.local} | ${t.remote} | ${t.added.length} | ${t.removed.length} | ${numeric} | ${foldedOnly} | ${enOnly} | ${t.same} |`,
    );
  }
  L.push('');
  if (rep.offline) L.push('> 离线模式：不联网，「消失条目」未检测。', '');

  H('新增条目');
  let any = false;
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of t.added) {
      any = true;
      L.push(`- **${folder}/${item.id}** ${item.name}`);
    }
  }
  if (!any) L.push('（无）');
  L.push('');

  H('消失条目');
  any = false;
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of t.removed) {
      any = true;
      L.push(`- **${folder}/${item.id}** ${item.name}（远端已移除；本地不自动删除）`);
    }
  }
  if (!any) L.push('（无）');
  L.push('');

  H('真实数值/结构变更（需重跑派生链 + 复核测试锚点）');
  any = false;
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of t.changed.filter((c) => c.numeric > 0)) {
      any = true;
      const extra = [];
      if (item.folded) extra.push(`另有 ${item.folded} 处属手工补丁作用域`);
      if (item.enRef) extra.push(`EN 参考 ${item.enRef} 处`);
      L.push(`### ${folder}/${item.id} ${item.name}（${item.changes.length} 处${extra.length ? `，${extra.join('，')}` : ''}）`, '');
      for (const c of item.changes.slice(0, 40)) L.push(`- \`${c.path}\`：${fmt(c.before)} → ${fmt(c.after)}`);
      if (item.changes.length > 40) L.push(`- ……其余 ${item.changes.length - 40} 处略（见 diff.json）`);
      if (item.references?.length) L.push(`  - 引用：${item.references.map((r) => `\`${r}\``).join('、')}`);
      L.push('');
    }
  }
  if (!any) L.push('（无）', '');

  const reviewItems = [];
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of t.changed) if (item.review?.length) reviewItems.push([folder, item]);
  }
  if (reviewItems.length) {
    H('补丁角色的 ranks / 行迹 差异（人工抽查）');
    L.push('`apply-<id>-enhanced.mjs` 会覆写 skills/ranks/skill_trees，所以这些角色的差异默认折叠。');
    L.push('但上游若把某个加强值**直接改进基础字段**（例如 4.6.54 把流萤 point06 从 `[0.25,0.1,3]` 改成 `[0.55]`），');
    L.push('重跑补丁会把它改回旧值。skills 差异是加强本体、量大，已折叠；下面只列 ranks / skill_trees，请逐条确认。', '');
    for (const [folder, item] of reviewItems) {
      L.push(`### ${folder}/${item.id} ${item.name}（${item.review.length} 处）`, '');
      for (const s of item.review.slice(0, 30)) {
        L.push(`- \`${s.path}\`：本地(补丁) ${fmt(s.local)} ← 上游 ${fmt(s.upstream)}`);
      }
      if (item.review.length > 30) L.push(`- ……其余 ${item.review.length - 30} 处略（见 diff.json）`);
      L.push('');
    }
  }

  H('文本变更（仅提示，通常不影响引擎）');
  any = false;
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of t.changed.filter((c) => c.numeric === 0 && c.changes.length > 0)) {
      any = true;
      const kinds = [...new Set(item.changes.map((c) => c.kind))].join('/');
      L.push(
        `- ${folder}/${item.id} ${item.name}：${item.changes.length} 处（${kinds}）—— ${item.changes
          .slice(0, 3)
          .map((c) => `\`${c.path}\``)
          .join('、')}${item.changes.length > 3 ? ' 等' : ''}`,
      );
    }
  }
  if (!any) L.push('（无）');
  L.push('');

  H('仅手工补丁差异（预期内，无需处理）');
  any = false;
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of t.changed.filter((c) => c.changes.length === 0 && c.folded > 0)) {
      any = true;
      L.push(`- ${folder}/${item.id} ${item.name}：${item.folded} 处全在补丁作用域内 → \`scripts/${patches[item.id]}\``);
    }
  }
  if (!any) L.push('（无）');
  L.push('');

  H('EN 参考变更（引擎不读 en，仅供对照）');
  any = false;
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of t.changed.filter((c) => c.enRef > 0 && c.changes.length === 0 && c.folded === 0)) {
      any = true;
      L.push(`- ${folder}/${item.id} ${item.name}：${item.enRef} 处（其中数值 ${item.enNumeric} 处）`);
    }
  }
  if (!any) L.push('（无）');
  L.push('');

  if (hasGrowth) {
    H('怪物成长表');
    for (const g of rep.growth) L.push(`- ${g.name}.json：${g.status}（${g.entries} 条）`);
    L.push('');
  }

  H('手工补丁提醒');
  const touched = new Set();
  for (const [folder, t] of Object.entries(rep.types)) {
    for (const item of [...t.changed, ...t.added]) {
      if (patches[item.id]) touched.add(`${folder}/${item.id}.json → \`scripts/${patches[item.id]}\``);
    }
  }
  if (touched.size) {
    L.push('以下文件带有手工补丁，覆盖后必须重跑对应脚本（`--promote` 会自动重跑）：', '');
    for (const line of [...touched].sort()) L.push(`- ${line}`);
  } else {
    L.push('（本次变更条目均无手工补丁）');
  }
  L.push('');

  H('下一步');
  L.push('1. 审阅本报告，决定哪些条目要落盘；');
  L.push(`2. 落盘：\`node scripts/sync-data.mjs ${rep.version} --promote\`（重建索引 + 更新锁文件 + 自动重跑受影响的手工补丁）；`);
  L.push('3. 派生链：`gen-combat-raw` → `gen-combat-skill-data` → `gen-relic-set-data` → `gen-lightcone-data` → `gen-monster-stages` → `gen-monster-resist`；');
  L.push('4. 若 promote 未覆盖的手工补丁，按上节逐个重跑；');
  L.push('5. 验证：`pnpm -r typecheck` → `pnpm lint` → `pnpm -r test`，按上文「引用」定位需要重锚的用例。');
  L.push('');
  return L.join('\n');
}

// ═════════════════════════ promote 实现 ═════════════════════════

async function promote() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(`${stagingRoot}manifest.json`, 'utf8'));
  } catch {
    console.error(`找不到暂存清单：${stagingRoot}manifest.json\n请先运行不带 --promote 的同步。`);
    process.exit(1);
  }

  const next = { ...lock, files: { ...lock.files }, byType: { ...lock.byType } };
  let written = 0;
  const patched = [];

  for (const [folder, t] of Object.entries(manifest.types)) {
    if (typeFilter.size > 0 && !typeFilter.has(folder)) continue;
    const todo = t.records.filter((r) => r.status !== 'same');
    for (const rec of todo) {
      const to = `${DATA_ROOT}${rec.path}`;
      await mkdir(dirname(to), { recursive: true });
      await copyFile(`${stagingRoot}${rec.path}`, to);
      written += 1;
    }
    // 手工补丁：本次写入且登记了补丁的文件，自动重跑
    for (const rec of todo) {
      const script = patchMap[rec.id];
      if (!script) continue;
      const res = spawnSync(process.execPath, [`scripts/${script}`], { cwd: REPO_ROOT, stdio: 'inherit' });
      if (res.status === 0) patched.push(`${rec.path} ← ${script}`);
      else console.error(`补丁失败：${script}（exit ${res.status}）`);
    }
    // 统一版本号：整类同步时，把该目录**所有**文档的 version 盖成本版版本。
    // 必要性：未变更的文件不会被重写，其 version 仍是旧值 → gen-source-lock 会报「版本混装」
    // 并把 byType 回退成旧版本 → 后续 gen-* 按旧版本重新生成 roster，web loadLocal 版本校验随之失配。
    const allIds = await listIds(folder);
    let stamped = 0;
    if (t.records.length === allIds.length) {
      for (const id of allIds) {
        const p = `${DATA_ROOT}${folder}/${id}.json`;
        const doc = JSON.parse(await readFile(p, 'utf8'));
        if (doc.version === version) continue;
        doc.version = version;
        await writeFile(p, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        stamped += 1;
      }
    }
    // 重建索引
    const items = [];
    for (const id of allIds) {
      const doc = JSON.parse(await readFile(`${DATA_ROOT}${folder}/${id}.json`, 'utf8'));
      items.push({ id: doc.id, zh: doc.name?.zh ?? '', en: doc.name?.en ?? '', meta: doc.meta ?? {} });
    }
    await writeFile(
      `${DATA_ROOT}${folder}/index.json`,
      `${JSON.stringify({ version, count: items.length, items }, null, 2)}\n`,
      'utf8',
    );
    if (stamped) console.log(`[${folder}] 版本号盖章 ${stamped} 份 → ${version}`);
    // 更新锁（sha 在补丁重跑之后读，才反映真实落盘内容）
    for (const rec of t.records) {
      const raw = await readFile(`${DATA_ROOT}${rec.path}`, 'utf8');
      const entry = { version, sha256: contentSha(JSON.parse(raw)), bytes: Buffer.byteLength(raw, 'utf8') };
      if (rec.etagZh) entry.etagZh = rec.etagZh;
      if (rec.etagEn) entry.etagEn = rec.etagEn;
      if (patchMap[rec.id]) entry.patches = [patchMap[rec.id]];
      next.files[rec.path] = entry;
    }
    next.byType[folder] = version;
    console.log(`[${folder}] 写入 ${todo.length} 份，索引 ${items.length} 条`);
  }

  if (manifest.growth && WANT_GROWTH) {
    let n = 0;
    for (const g of manifest.growth) {
      if (g.status === 'same') continue;
      const to = `${DATA_ROOT}monster-growth/${g.name}.json`;
      await mkdir(dirname(to), { recursive: true });
      await copyFile(`${stagingRoot}monster-growth/${g.name}.json`, to);
      const raw = await readFile(to, 'utf8');
      next.files[`monster-growth/${g.name}.json`] = {
        version,
        sha256: sha256(raw),
        bytes: Buffer.byteLength(raw, 'utf8'),
      };
      n += 1;
    }
    next.byType['monster-growth'] = version;
    written += n;
    console.log(`[monster-growth] 写入 ${n} 份`);
  }

  const allSame = TYPES.every((t) => next.byType[t.folder] === version);
  next.version = allSame ? version : lock.version ?? version;
  next.updatedAt = new Date().toISOString();
  await writeLock(next);

  console.log(`\n已写回 ${written} 份；全局口径 = ${next.version}${allSame ? '' : '（尚有类型未同步到新版本，见 byType）'}`);
  if (patched.length) {
    console.log(`自动重跑补丁 ${patched.length} 个：`);
    for (const p of patched) console.log(`  ${p}`);
  }
  console.log('\n下一步（派生链，按序）：');
  for (const s of [
    'node scripts/gen-combat-raw.mjs',
    'node scripts/gen-combat-skill-data.mjs',
    'node scripts/gen-relic-set-data.mjs',
    'node scripts/gen-lightcone-data.mjs',
    'node scripts/gen-monster-stages.mjs',
    'node scripts/gen-monster-resist.mjs',
  ]) {
    console.log(`  ${s}`);
  }
  console.log('  再刷 engine dist：pnpm --filter @hsr-calc/engine exec tsc -p tsconfig.json');
  console.log('  最后：pnpm -r typecheck && pnpm lint && pnpm -r test');
}
