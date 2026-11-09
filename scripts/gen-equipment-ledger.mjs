#!/usr/bin/env node
/**
 * 光锥 / 遗器条款台账（2026-11-02）
 *
 * 背景：`gen-clause-ledger.mjs` 只索引**角色**（99 个），光锥 172 件 / 遗器 64 套完全没有台账，
 * 于是「某光锥的『我方全体』落点对不对」只能靠人肉翻 JSON（21032 镂月裁云就绕过一次弯路）。
 * 本脚本把两类装备也拆成条款，产出 `data/clause-ledger/equipment.json`，并支持对账校验。
 *
 * 用法：
 *   node scripts/gen-equipment-ledger.mjs            # 生成 equipment.json + docs/equipment-ledger.md
 *   node scripts/gen-equipment-ledger.mjs --check    # 只校验 landing.json 里光锥/遗器的条款 id 是否存在
 *   node scripts/gen-equipment-ledger.mjs --char=21032   # 打印单件的条款
 *
 * 条款 id 约定：`lc<光锥id>.<key>.<n>` / `rs<遗器id>.<key>.<n>`
 *   key = `refinements`（光锥效果）或 `require_num.<件数>`（遗器 2/4 件套）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LC_DIR = path.join(ROOT, 'data/lightcones');
const RS_DIR = path.join(ROOT, 'data/relicsets');
const OUT_FILE = path.join(ROOT, 'data/clause-ledger/equipment.json');
const MD_FILE = path.join(ROOT, 'docs/equipment-ledger.md');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};

/** 去掉游戏富文本标签，保留可读文本 */
const plain = (s) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

/** 按中文句读切条款（与角色台账同口径：分号/句号/换行断开，括号内不断） */
const OPEN = ['（', '(', '【', '「'];
const CLOSE = ['）', ')', '】', '」'];
function splitClauses(raw) {
  const text = plain(raw);
  const out = [];
  let buf = '';
  let depth = 0;
  const push = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const ci = OPEN.indexOf(ch);
    if (ci >= 0) depth += 1;
    const di = CLOSE.indexOf(ch);
    if (di >= 0) depth = Math.max(0, depth - 1);
    if (depth === 0 && ['。', '；', '\n'].includes(ch)) {
      push();
      continue;
    }
    buf += ch;
  }
  push();
  return out;
}

function readJsonDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        return { id: f.replace(/\.json$/, ''), j };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildLightcones() {
  const items = [];
  for (const { id, j } of readJsonDir(LC_DIR)) {
    const zh = j.zh ?? {};
    const desc = zh.refinements?.desc ?? '';
    const clauses = splitClauses(desc).map((text, n) => ({ id: `lc${id}.refinements.${n}`, text }));
    if (clauses.length === 0) continue;
    items.push({
      kind: 'lightcone',
      id,
      name: zh.name ?? j.name ?? '',
      path: j.meta?.path ?? '',
      rarity: j.rarity ?? '',
      sources: [{ key: 'refinements', name: '光锥效果', clauses }],
    });
  }
  return items;
}

function buildRelicsets() {
  const items = [];
  for (const { id, j } of readJsonDir(RS_DIR)) {
    const zh = j.zh ?? {};
    const sources = [];
    for (const piece of ['2', '4']) {
      const desc = zh.require_num?.[piece]?.desc ?? '';
      const clauses = splitClauses(desc).map((text, n) => ({ id: `rs${id}.require_num.${piece}.${n}`, text }));
      if (clauses.length > 0) sources.push({ key: `require_num.${piece}`, name: `${piece} 件套`, clauses });
    }
    if (sources.length === 0) continue;
    items.push({ kind: 'relicset', id, name: zh.name ?? j.name ?? '', sources });
  }
  return items;
}

const items = [...buildLightcones(), ...buildRelicsets()];
const clauseIds = new Set(items.flatMap((it) => it.sources.flatMap((s) => s.clauses.map((c) => c.id))));

if (flag('check')) {
  const landingFile = path.join(ROOT, 'data/clause-ledger/landing.json');
  const landing = fs.existsSync(landingFile) ? JSON.parse(fs.readFileSync(landingFile, 'utf8')) : { clauses: {} };
  const bad = [];
  let checked = 0;
  for (const id of Object.keys(landing.clauses ?? {})) {
    if (!/^(lc|rs)\d/.test(id)) continue;
    checked += 1;
    if (!clauseIds.has(id)) bad.push(id);
  }
  console.log(`equipment.json：光锥 ${items.filter((i) => i.kind === 'lightcone').length} 件、遗器 ${items.filter((i) => i.kind === 'relicset').length} 套、条款 ${clauseIds.size} 条`);
  console.log(`landing 中装备类条款 ${checked} 条`);
  if (bad.length) {
    console.error(`❌ 对不上：${bad.join(', ')}`);
    process.exit(1);
  }
  console.log('✅ 装备类条款 id 全部对得上');
  process.exit(0);
}

const one = opt('char');
if (one) {
  const hit = items.find((i) => i.id === one);
  if (!hit) {
    console.error(`找不到 ${one}`);
    process.exit(1);
  }
  console.log(`=== ${hit.kind} ${hit.id} ${hit.name}`);
  for (const s of hit.sources) for (const c of s.clauses) console.log(`  [${c.id}] ${c.text}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, `${JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 1)}\n`, 'utf8');

const L = [];
L.push('# 光锥 / 遗器条款台账（生成物）');
L.push('');
L.push('> ⚠️ 由 `node scripts/gen-equipment-ledger.mjs` 生成，请勿手改。');
L.push('');
L.push(`光锥 **${items.filter((i) => i.kind === 'lightcone').length}** 件、遗器 **${items.filter((i) => i.kind === 'relicset').length}** 套、条款 **${clauseIds.size}** 条。`);
L.push('');
L.push('## 「我方全体 / 我方目标」措辞清单（对账入口）');
L.push('');
L.push('| 类型 | id | 名称 | 条款 |');
L.push('| --- | --- | --- | --- |');
for (const it of items) {
  for (const s of it.sources) {
    for (const c of s.clauses) {
      if (!/我方全体|我方目标|我方角色|队友|全体/.test(c.text)) continue;
      L.push(`| ${it.kind === 'lightcone' ? '光锥' : '遗器'} | \`${it.id}\` | ${it.name} | ${c.text.slice(0, 90)} |`);
    }
  }
}
L.push('');
fs.writeFileSync(MD_FILE, `${L.join('\n')}\n`, 'utf8');

console.log('光锥/遗器台账');
console.log(`  光锥 ${items.filter((i) => i.kind === 'lightcone').length} 件`);
console.log(`  遗器 ${items.filter((i) => i.kind === 'relicset').length} 套`);
console.log(`  条款 ${clauseIds.size} 条`);
console.log(`  → ${path.relative(ROOT, OUT_FILE)}`);
console.log(`  → ${path.relative(ROOT, MD_FILE)}`);
