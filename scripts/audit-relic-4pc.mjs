#!/usr/bin/env node
/**
 * 遗器**四件套**落点审计（只读烟测；与 `audit-relic-2pc.mjs` 配套）
 *
 * 目的：四件套自称 64/64 已实现，本脚本把这件事变成**可复跑**的检查——
 * 逐套在 `battle.ts` 里找落点，找不到就列出来并 `exit 1`。
 *
 * 判定口径（保守，只证「有落点」，不证「数值对」）：
 *   ① 命中命名约定 `relic<id>XXX`；
 *   ② 或同一行既有 `'<id>'` 又有判定 API（`relicFourOf`/`relicsetId`/`fourPiece`/`planar` 等）；
 *   ③ 或出现在 `RELIC_SETS` 参数消费处（`fourPieceParams` 附近带 id 的分支）。
 *
 * 局限：**有落点 ≠ 数值正确**；正确性仍需逐条对账（同 HANDOFF §十 第 9 条口径）。
 *
 * 用法：`node scripts/audit-relic-4pc.mjs [--verbose]`
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RELIC_DIR = path.join(ROOT, 'data', 'relicsets');
const BATTLE = path.join(ROOT, 'packages', 'engine', 'src', 'combat', 'battle.ts');
const VERBOSE = process.argv.includes('--verbose');

function fourPieceSets() {
  const out = [];
  for (const f of fs.readdirSync(RELIC_DIR)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const id = f.replace(/\.json$/, '');
    if (!/^1\d\d$/.test(id)) continue; // 1xx = 四件套套装；3xx = 位面（只有 2pc）
    const j = JSON.parse(fs.readFileSync(path.join(RELIC_DIR, f), 'utf8'));
    const zh = j.zh ?? j;
    const r = zh?.require_num?.['4'];
    const desc = r?.desc ? String(r.desc).replace(/<unbreak>|<\/unbreak>/g, '') : '';
    out.push({ id, name: zh?.name ?? '?', desc, params: r?.param_list ?? [] });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function anchorsFor(id) {
  const lines = fs.readFileSync(BATTLE, 'utf8').split(/\r?\n/);
  const helperRe = new RegExp(`relic${id}(?![0-9])`);
  const hit = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const byHelper = helperRe.test(line);
    const byJudge =
      line.includes(`'${id}'`) &&
      /relicFourOf|relicFour\b|relicsetId|fourPiece|planar|relicSet|RELIC_SETS/.test(line);
    if (!byHelper && !byJudge) continue;
    hit.push({ line: i + 1, text: line.trim().slice(0, 160), kind: byHelper ? 'helper' : 'judge' });
  }
  return hit;
}

const sets = fourPieceSets();
const missing = [];
for (const s of sets) {
  const anchors = anchorsFor(s.id);
  const tag = anchors.length === 0 ? 'MISSING' : 'ok';
  console.log(`${tag.padEnd(7)} [${s.id}] ${s.name}  anchors=${anchors.length}`);
  if (anchors.length === 0) missing.push(s);
  if (VERBOSE) for (const a of anchors.slice(0, 3)) console.log(`         L${a.line}: ${a.text}`);
}

console.log(`\n四件套 ${sets.length} 套：有落点 ${sets.length - missing.length}，缺落点 ${missing.length}`);
if (missing.length > 0) {
  for (const m of missing) console.error(`❌ [${m.id}] ${m.name} :: ${m.desc.slice(0, 60)}`);
  process.exit(1);
}
