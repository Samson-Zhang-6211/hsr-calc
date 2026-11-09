#!/usr/bin/env node
/**
 * 遗器**两件套**条件半句审计（只读，CI 守卫用）
 *
 * 背景：2026-11-02 round 56 人工审过一遍（位面 28 条条件型 2pc 全实现、四件套套装仅 117 条件型已实现），
 * 见 `docs/AGENTS-clause-ledger.md` §五十五。本脚本把那次人工结论固化成**可复跑**的守卫。
 *
 * 判定口径（故意保守，只做「有没有落点」的烟测，不判对错）：
 *   1. 从 `data/relicsets/*.json` 取 `zh.require_num['2'].desc`，含条件词（当/若/每/大于/小于/超过/低于/处于/后/状态/叠加/层）的算「条件型」；
 *   2. 对每个条件型套装的 id，在 `packages/engine/src/combat/battle.ts` 里找**代码锚点**：
 *      同一行同时出现 `'<id>'` 与判定 API（planar 判定 / relicPlanarOf / relicPlanarId / relic<id> 系列 helper）；
 *   3. 有锚点 → OK；零锚点 → 列出并 **exit 1**。
 *
 * 局限（不要当成覆盖率证明）：「有锚点」不等于「数值对」，数值正确性仍需逐条对账（同 §十.9 口径）。
 * 用法：`node scripts/audit-relic-2pc.mjs`（`--verbose` 打印每条锚点首行）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RELIC_DIR = path.join(ROOT, 'data', 'relicsets');
const BATTLE = path.join(ROOT, 'packages', 'engine', 'src', 'combat', 'battle.ts');
const COND = /当|若|每|大于|小于|超过|低于|处于|后|状态|叠加|层/;
const VERBOSE = process.argv.includes('--verbose');

function conditionalTwoPiece() {
  const out = [];
  for (const f of fs.readdirSync(RELIC_DIR)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const id = f.replace(/\.json$/, '');
    const j = JSON.parse(fs.readFileSync(path.join(RELIC_DIR, f), 'utf8'));
    const zh = j.zh ?? j;
    const r = zh?.require_num?.['2'];
    const desc = r?.desc ? String(r.desc).replace(/<unbreak>|<\/unbreak>/g, '') : '';
    if (!desc || !COND.test(desc)) continue;
    out.push({ id, name: zh?.name ?? '?', desc });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function anchorsFor(id) {
  const lines = fs.readFileSync(BATTLE, 'utf8').split(/\r?\n/);
  const hit = [];
  // 命名约定锚点：遗器条款实现常用 `relic<id>XXX` helper / labelKey（如 relic117OnDebuff、relic315Stacks）
  const helperRe = new RegExp(`relic${id}(?![0-9])`);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const byHelper = helperRe.test(line);
    const byJudge =
      line.includes(`'${id}'`) &&
      (/planar\s*===|relicPlanarOf|relicPlanarId|relicPlanarWearer|relicPlanarCritNow|planarsetId/.test(line) ||
        helperRe.test(line));
    if (!byHelper && !byJudge) continue;
    hit.push({ line: i + 1, text: line.trim().slice(0, 160), kind: byHelper ? 'helper' : 'judge' });
  }
  return hit;
}

const sets = conditionalTwoPiece();
const missing = [];
const rows = [];
for (const s of sets) {
  const anchors = anchorsFor(s.id);
  rows.push({ ...s, anchors });
  if (anchors.length === 0) missing.push(s);
}

for (const r of rows) {
  const tag = r.anchors.length === 0 ? 'MISSING' : 'ok';
  console.log(`${tag.padEnd(7)} [${r.id}] ${r.name}  anchors=${r.anchors.length}`);
  if (VERBOSE || r.anchors.length === 0) {
    for (const a of r.anchors.slice(0, 3)) console.log(`         L${a.line}: ${a.text}`);
    if (r.anchors.length === 0) console.log(`         clause: ${r.desc}`);
  }
}

console.log(`\n条件型两件套 ${rows.length} 条：有落点 ${rows.length - missing.length}，缺落点 ${missing.length}`);
if (missing.length > 0) {
  console.error(`❌ 缺落点：${missing.map((m) => `${m.id} ${m.name}`).join('、')}`);
  process.exit(1);
}
