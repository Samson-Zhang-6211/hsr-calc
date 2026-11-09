#!/usr/bin/env node
/**
 * 我方目标（「我方全体 / 我方目标 / 忆灵」语义）落点审计。
 *
 * 为什么要有这个脚本（2026-11-02 复盘的第 1 类系统性 bug）：
 * 召唤物/忆灵不继承主人 buff —— `holderOf` 按单位 id 独立，忆灵出手时读
 * `attackerBuffs: attackerHolder('<自己>')`。所以只要一个「我方全体」条款只遍历
 * `members`（角色），忆灵就永远吃不到；反之把全队 buff 挂到 `allHolders()` 才算覆盖。
 *
 * 三类检查：
 * - **红 C1**：手写「members + holderOf(...)」数组。规范写法永远是 `allHolders()`；
 *   手写清单一旦漏项，就是「某只忆灵吃不到该 buff」。
 * - **红 C4**：`allHolders()` 必须从 `SUMMON_OWNERS` 派生（单一真相），不能自己列 id。
 * - **黄 C2**：代码里出现「≥2 个召唤物 id 的字面量清单」。合法子集（如受击池只含有 HP
 *   模型的忆灵）必须在白名单里写明理由，否则就是漏项候选。
 * - **观察 C3**：`for (const X of members)` + 写 holder 的循环。这类**不一定错**
 *   （很多全队 buff 确实只该给角色），逐条裁定成本太高，因此只按 buff key 分组统计，
 *   不阻塞；要收紧时在白名单里登记「已确认只给角色」的 key 分类即可。
 *
 * 用法：
 *   node scripts/audit-ally-targets.mjs             # 审计 + 写 docs/ally-targets.md
 *   node scripts/audit-ally-targets.mjs --check     # 只报红/黄（CI 用，红或黄即退出码 1）
 *   node scripts/audit-ally-targets.mjs --list      # 额外打印 C3 观察项明细
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATTLE_FILE = path.join(ROOT, 'packages/engine/src/combat/battle.ts');
const WHITELIST_FILE = path.join(ROOT, 'data/clause-ledger/ally-targets.json');
const REPORT_FILE = path.join(ROOT, 'docs/ally-targets.md');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);

const text = fs.readFileSync(BATTLE_FILE, 'utf8');
const lines = text.split('\n');
const sf = ts.createSourceFile(BATTLE_FILE, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** 最近的外层具名函数（function xxx / const xxx = () => / xxx(...) {），用于给观察项归组 */
function enclosingName(node) {
  let n = node.parent;
  while (n) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      n.parent &&
      ts.isVariableDeclaration(n.parent) &&
      ts.isIdentifier(n.parent.name)
    ) {
      return n.parent.name.text;
    }
    if (ts.isMethodDeclaration(n) && n.name) return n.name.getText(sf);
    n = n.parent;
  }
  return '(顶层)';
}

function unwrap(e) {
  let n = e;
  while (n && (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n))) n = n.expression;
  return n;
}
function findTopDecl(name) {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === name) return d;
    }
  }
  return null;
}

function findDeclAnywhere(name) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// ---------------------------------------------------------------- 规范集合
/** 规范召唤物集合 = SUMMON_OWNERS 的 id（新增召唤物只改那张表） */
const canonical = (() => {
  const decl = findTopDecl('SUMMON_OWNERS');
  if (!decl) throw new Error('battle.ts 里找不到 SUMMON_OWNERS');
  const arr = unwrap(decl.initializer);
  if (!arr || !ts.isArrayLiteralExpression(arr)) throw new Error('SUMMON_OWNERS 不是数组字面量');
  const ids = [];
  for (const el of arr.elements) {
    if (!ts.isObjectLiteralExpression(el)) continue;
    for (const p of el.properties) {
      if (ts.isPropertyAssignment(p) && p.name.getText(sf).replace(/['"]/g, '') === 'id' &&
        ts.isStringLiteralLike(p.initializer)) ids.push(p.initializer.text);
    }
  }
  if (ids.length < 5) throw new Error(`SUMMON_OWNERS 解析异常（只拿到 ${ids.length} 个）`);
  return ids;
})();
/** 派生写法：正文里引用这两个常量之一，就不算「手写清单」 */
const DERIVED_HINT = /SUMMON_OWNERS|ALLY_SUMMON_UNITS|MEMO_SPIRIT_UNITS/;

// ---------------------------------------------------------------- 白名单
function loadWhitelist() {
  if (!fs.existsSync(WHITELIST_FILE)) return { c1: [], c2: [], c4: [], c5: [], c3Keys: [] };
  const raw = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
  return {
    c1: raw.c1 || [],
    c2: raw.c2 || [],
    c4: raw.c4 || [],
    c5: raw.c5 || [],
    c3: raw.c3 || [],
    c3Keys: raw.c3Keys || [],
  };
}
const wl = loadWhitelist();
const matchAny = (entries, snippet) =>
  (entries || []).find((e) => e.match && norm(snippet).includes(norm(e.match)));

// ---------------------------------------------------------------- 扫描
const red = [];
const yellow = [];
const observe = [];

const visit = (node) => {
  // C1：手写「members + holderOf」数组
  if (ts.isArrayLiteralExpression(node)) {
    const body = norm(node.getText(sf));
    if (/\.\.\.members\.map/.test(body) && /holderOf\(/.test(body)) {
      if (DERIVED_HINT.test(body)) {
        observe.push({ check: 'C1', line: lineOf(node.getStart(sf)), why: '已从单一真相派生', snippet: body.slice(0, 160) });
      } else {
        const present = canonical.filter((id) => new RegExp(`holderOf\\('${id}'\\)`).test(body));
        const missing = canonical.filter((id) => !present.includes(id));
        const hit = matchAny(wl.c1, body);
        const item = { line: lineOf(node.getStart(sf)), present, missing, snippet: body.slice(0, 160) };
        if (missing.length && !hit) red.push({ ...item, check: 'C1', why: '手写 holder 清单漏召唤物' });
        else if (missing.length && hit) observe.push({ ...item, check: 'C1', why: `白名单：${hit.reason}` });
        else observe.push({ ...item, check: 'C1', why: '手写清单完整（仍建议改成 allHolders()）' });
      }
    }

    // C2：出现 ≥2 个召唤物 id 的字面量清单
    const ids = canonical.filter((id) => new RegExp(`'${id}'`).test(body));
    if (ids.length >= 2 && !/\.\.\.members\.map/.test(body) && !DERIVED_HINT.test(body)) {
      const missing = canonical.filter((id) => !ids.includes(id));
      const hit = matchAny(wl.c2, body);
      const item = { line: lineOf(node.getStart(sf)), present: ids, missing, snippet: body.slice(0, 160) };
      if (missing.length && !hit) yellow.push({ ...item, check: 'C2', why: '召唤物 id 清单不完整' });
      else if (missing.length && hit) observe.push({ ...item, check: 'C2', why: `白名单：${hit.reason}` });
      else observe.push({ ...item, check: 'C2', why: '清单完整' });
    }
  }

  // C2b：对象字面量的 key 里出现 ≥2 个召唤物 id（如 TAUNT_MEMO 的嘲讽值表）
  if (ts.isObjectLiteralExpression(node)) {
    const body = norm(node.getText(sf));
    const keys = [];
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const k = p.name.getText(sf).replace(/['"]/g, '');
      if (canonical.includes(k)) keys.push(k);
    }
    if (keys.length >= 2) {
      const missing = canonical.filter((id) => !keys.includes(id));
      const hit = matchAny(wl.c2, body);
      const item = { line: lineOf(node.getStart(sf)), present: keys, missing, snippet: body.slice(0, 160) };
      if (missing.length && !hit) yellow.push({ ...item, check: 'C2', why: '召唤物 id 对象键表不完整' });
      else if (missing.length && hit) observe.push({ ...item, check: 'C2', why: `白名单：${hit.reason}` });
    }
  }

  // C5：召唤物 holder 整批清空（`holderOf('<召唤物>').buffs = []`）—— 必须改走 resetSummonHolder
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    const right = unwrap(node.right);
    if (right && ts.isArrayLiteralExpression(right) && right.elements.length === 0) {
      const m = node.left.getText(sf).match(/^holderOf\('([a-zA-Z0-9_]+)'\)\.buffs$/);
      if (m && canonical.includes(m[1])) {
        const hit = matchAny(wl.c5, `holderOf('${m[1]}').buffs`);
        const item = {
          check: 'C5',
          line: lineOf(node.getStart(sf)),
          why: '召唤物 holder 被整批清空（静默丢掉全部全队光环）→ 改用 resetSummonHolder',
          snippet: `holderOf('${m[1]}').buffs = []`,
        };
        if (hit) observe.push({ ...item, why: `白名单：${hit.reason}` });
        else red.push(item);
      }
    }
  }

  // C3：for (const X of members) + 写 holder
  if (ts.isForOfStatement(node) && node.expression.getText(sf) === 'members' &&
    ts.isVariableDeclarationList(node.initializer)) {
    const decl = node.initializer.declarations[0];
    const varName = decl && ts.isIdentifier(decl.name) ? decl.name.text : null;
    const body = norm(node.statement.getText(sf));
    if (varName && (new RegExp(`holderOf\\(${varName}\\.id\\)`).test(body) || /addBuff\(/.test(body))) {
      const keys = [...body.matchAll(/key: '([A-Za-z]+)'/g)].map((m) => m[1]);
      // 所属函数/上下文：向后回溯最近的具名函数或 const 箭头函数，便于判断属于哪条条款
      const owner = enclosingName(node);
      // 从所在语句文本里抓「来源标识」（source: 'xxx' / ids.has('xxx')），供裁定时对号入座
      const ctxText = norm(lines.slice(Math.max(0, lineOf(node.getStart(sf)) - 12), lineOf(node.getStart(sf)) + 3).join(' '));
      const src = [...ctxText.matchAll(/source: '([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
      const guard = [...ctxText.matchAll(/ids\.has\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]);
      // 站点级白名单（按片段匹配）：条款措辞确认「只给角色」时登记，避免每次都被当「未裁定」
      const site = matchAny(wl.c3, body);
      observe.push({
        line: lineOf(node.getStart(sf)),
        check: 'C3',
        varName,
        owner,
        src: [...new Set(src)].slice(0, 3),
        guard: [...new Set(guard)].slice(0, 3),
        keys: [...new Set(keys)],
        why: site
          ? `已核（只给角色）：${site.reason}`
          : wl.c3Keys.some((k) => keys.includes(k))
            ? '观察（key 已登记为只给角色）'
            : '观察（未裁定）',
        snippet: body.slice(0, 120),
      });
    }
  }

  ts.forEachChild(node, visit);
};
visit(sf);

// C4：allHolders 必须从 SUMMON_OWNERS 派生
const allHoldersDecl = findDeclAnywhere('allHolders');
if (!allHoldersDecl) {
  red.push({ check: 'C4', line: 0, why: '找不到 allHolders()', snippet: '' });
} else {
  const body = norm(allHoldersDecl.getText(sf));
  if (!DERIVED_HINT.test(body)) {
    const hit = matchAny(wl.c4, body);
    const item = { check: 'C4', line: lineOf(allHoldersDecl.getStart(sf)), why: 'allHolders() 没有从 SUMMON_OWNERS 派生（会漏新召唤物）', snippet: body.slice(0, 160) };
    if (hit) observe.push({ ...item, why: `白名单：${hit.reason}` });
    else red.push(item);
  } else {
    observe.push({ check: 'C4', line: lineOf(allHoldersDecl.getStart(sf)), why: '已从 SUMMON_OWNERS 派生', snippet: '' });
  }
}

// ---------------------------------------------------------------- 输出
const c3 = observe.filter((o) => o.check === 'C3');
const c3ByKey = new Map();
for (const o of c3) {
  const k = o.keys.length ? o.keys.join('+') : '(无 key)';
  c3ByKey.set(k, (c3ByKey.get(k) || 0) + 1);
}

const L = [];
L.push('# 我方目标落点审计（生成物）');
L.push('');
L.push('> ⚠️ 由 `node scripts/audit-ally-targets.mjs` 生成，请勿手改。白名单写在 `data/clause-ledger/ally-targets.json`。');
L.push('');
L.push('## 为什么查这个');
L.push('');
L.push('召唤物 / 忆灵**不继承**主人 buff：`holderOf` 按单位 id 独立，忆灵出手读 `attackerBuffs: attackerHolder(\'<自己>\')`。');
L.push('所以「我方全体 X」条款如果只遍历 `members`，忆灵就永远吃不到；必须挂到 `allHolders()`。');
L.push('');
L.push(`规范召唤物集合（= \`SUMMON_OWNERS\`，共 ${canonical.length} 个）：\`${canonical.join('` `')}\``);
L.push('');
L.push('## 结论');
L.push('');
L.push('| 级别 | 含义 | 条数 |');
L.push('| --- | --- | --- |');
L.push(`| 🔴 红 C1 | 手写「members + holderOf」清单且漏召唤物 | ${red.filter((r) => r.check === 'C1').length} |`);
L.push(`| 🔴 红 C4 | \`allHolders()\` 未从 \`SUMMON_OWNERS\` 派生 | ${red.filter((r) => r.check === 'C4').length} |`);
L.push(`| 🔴 红 C5 | 召唤物 holder 被整批清空 \`holderOf(x).buffs = []\`（应走 \`resetSummonHolder\`） | ${red.filter((r) => r.check === 'C5').length} |`);
L.push(`| 🟡 黄 C2 | 召唤物 id 字面量清单不完整且未登记白名单 | ${yellow.length} |`);
L.push(`| ⚪ 观察 C3 | \`for (const X of members)\` + 写 holder（不一定错，需逐类裁定） | ${c3.length} |`);
L.push('');
if (red.length) {
  L.push('### 🔴 必须修');
  L.push('');
  L.push('| 检查 | 行 | 说明 | 片段 |');
  L.push('| --- | --- | --- | --- |');
  for (const r of red) L.push(`| ${r.check} | ${r.line} | ${r.why} | \`${r.snippet.replace(/\|/g, '\\|')}\` |`);
  L.push('');
} else {
  L.push('✅ 红项为 0。');
  L.push('');
}
if (yellow.length) {
  L.push('### 🟡 待登记（合法子集请写进白名单并写明理由）');
  L.push('');
  L.push('| 行 | 已含 | 缺 | 片段 |');
  L.push('| --- | --- | --- | --- |');
  for (const y of yellow) L.push(`| ${y.line} | ${y.present.join('/')} | ${y.missing.join('/')} | \`${y.snippet.replace(/\|/g, '\\|')}\` |`);
  L.push('');
} else {
  L.push('✅ 黄项为 0（所有召唤物 id 清单都已完整或已登记）。');
  L.push('');
}
L.push('### ⚪ 观察项：`members` 循环按 buff key 分组');
L.push('');
L.push('这些循环把 buff 只挂给角色。**是否要改成 `allHolders()` 取决于条款本身**：');
L.push('写「我方全体 / 我方目标 / 忆灵」的必须改；写「我方角色」「队友」的可保留。');
L.push('');
L.push('| buff key | 条数 |');
L.push('| --- | --- |');
for (const [k, n] of [...c3ByKey.entries()].sort((a, b) => b[1] - a[1])) L.push(`| \`${k}\` | ${n} |`);
L.push('');
// 按「所属函数」聚合：裁定时按组判，不必逐行看 90 条
const c3ByOwner = new Map();
for (const o of c3) {
  const k = `${o.owner ?? '(未知)'}｜${o.guard?.join(',') || o.src?.join(',') || '-'}`;
  if (!c3ByOwner.has(k)) c3ByOwner.set(k, []);
  c3ByOwner.get(k).push(o);
}
L.push('### ⚪ 观察项按「所属函数｜来源」聚合（**裁定入口**）');
L.push('');
L.push('判断规则只有一条：**该条款文案写的是「我方全体 / 我方目标 / 忆灵」→ 必须改 `allHolders()`；写「我方角色」「队友」→ 保留。**');
L.push('确认只给角色的组，把它的 buff key 加进 `data/clause-ledger/ally-targets.json` 的 `c3Keys` 即可（下次自动标「已登记」）。');
L.push('');
L.push('| 所属函数｜来源 | 条数 | buff key | 行 |');
L.push('| --- | --- | --- | --- |');
for (const [k, arr] of [...c3ByOwner.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const keys = [...new Set(arr.flatMap((o) => o.keys))].join('/') || '(无 key)';
  const ln = arr.map((o) => o.line).slice(0, 4).join(',') + (arr.length > 4 ? ',…' : '');
  const done = arr.filter((o) => (o.why || '').includes('已核')).length;
  L.push(`| \`${k}\` | ${arr.length}${done ? `（已核 ${done}）` : ''} | \`${keys}\` | ${ln} |`);
}
L.push('');
if (flag('list')) {
  L.push('#### 明细');
  L.push('');
  L.push('| 行 | 所属函数 | 来源/守卫 | buff key | 结论 | 片段 |');
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const o of c3) {
    const who = [...(o.guard ?? []), ...(o.src ?? [])].join(',') || '-';
    L.push(`| ${o.line} | \`${o.owner ?? '-'}\` | ${who} | \`${o.keys.join('/')}\` | ${o.why ?? ''} | \`${o.snippet.replace(/\|/g, '\\|')}\` |`);
  }
  L.push('');
}

fs.writeFileSync(REPORT_FILE, `${L.join('\n')}\n`, 'utf8');

console.log('我方目标落点审计');
console.log(`  规范召唤物 ${canonical.length} 个：${canonical.join(' ')}`);
console.log(`  🔴 红 ${red.length}（C1 ${red.filter((r) => r.check === 'C1').length} / C4 ${red.filter((r) => r.check === 'C4').length}）`);
console.log(`  🟡 黄 ${yellow.length}`);
const c3Done = c3.filter((o) => (o.why || '').includes('已核')).length;
console.log(`  ⚪ 观察 ${c3.length}（已核 ${c3Done} / 未裁定 ${c3.length - c3Done}；分组见报告）`);
console.log(`  报告 → ${path.relative(ROOT, REPORT_FILE)}`);
if (red.length) {
  console.log('\n必须修：');
  for (const r of red) console.log(`  [${r.check}] @${r.line} ${r.why}\n    ${r.snippet}`);
}
if (yellow.length) {
  console.log('\n待登记：');
  for (const y of yellow) console.log(`  @${y.line} 缺 ${y.missing.join(',')}\n    ${y.snippet}`);
}
process.exitCode = flag('check') && (red.length > 0 || yellow.length > 0) ? 1 : 0;
