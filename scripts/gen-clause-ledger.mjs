#!/usr/bin/env node
/**
 * 生成「条款台账」：把 data/characters/*.json 里每一条中文文案切成条款，附上解析后的参数值，
 * 再合并人工落点标注（data/clause-ledger/landing.json），并跑三条引擎侧审计。
 *
 * 为什么要有这个脚本（2026-11-02 用户裁定：先做条款台账）：
 * 现有测试锚点全部来自 dump 的当前输出 → 只能防「漂移」，防不了「缺失」。
 * 文案里的每个 #N 与 param_list 严格对应，因此「文案条款 ↔ 代码落点」可以做成一张可机读的台账：
 * 脚本负责穷举条款（机械、100% 准确），人工只需标注「落点 + 判据」。
 *
 * 数据源（全部本地，不联网）：
 * - data/characters/*.json            条款原文 + param_list（99 角色）
 * - data/clause-ledger/landing.json   人工标注（手写源，脚本只读不写）
 * - packages/engine/src/**            审计：TRACE 常量消费 / 花名册对齐 / skillParams 消费
 *
 * 条款粒度 = 「半句」：先按 。！？/换行 切句，再按 ，； 切半句（括号内不切，
 * 例如「迷梦，流失，如露」这种技能名必须保持完整）。每条款带 `s`（句序号），
 * 句子原文存在 source.sentences 里，标注时能看回完整上下文。
 *
 * 生成物（勿手改）：
 * - data/clause-ledger/ledger.json
 * - docs/clause-ledger.md
 *
 * 用法：
 *   node scripts/gen-clause-ledger.mjs                      # 全量：写 JSON + MD
 *   node scripts/gen-clause-ledger.mjs --no-audit           # 跳过引擎审计（快）
 *   node scripts/gen-clause-ledger.mjs --char=1413          # 只打印单角色条款表（标注用）
 *   node scripts/gen-clause-ledger.mjs --char=1413 --md     # 同上，输出 markdown 表格
 *   node scripts/gen-clause-ledger.mjs --check              # 校验 landing.json 的 id 是否都还在
 *   node scripts/gen-clause-ledger.mjs --audit-only         # 只打印审计结果（JSON）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHAR_DIR = path.join(ROOT, 'data/characters');
const OUT_DIR = path.join(ROOT, 'data/clause-ledger');
const LEDGER_FILE = path.join(OUT_DIR, 'ledger.json');
const LANDING_FILE = path.join(OUT_DIR, 'landing.json');
const REPORT_FILE = path.join(ROOT, 'docs/clause-ledger.md');
const BATTLE_FILE = path.join(ROOT, 'packages/engine/src/combat/battle.ts');
const SKILLDATA_FILE = path.join(ROOT, 'packages/engine/src/combat/skill-data.ts');
const TEAMAXIS_FILE = path.join(ROOT, 'packages/engine/src/team-axis.ts');
const WEB_SRC = path.join(ROOT, 'apps/web/src');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
function opt(name, dflt) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
}

// ---------------------------------------------------------------- 条款切分
/** 这些括号内的 ，； 不切（技能名/状态名里带逗号，例如「迷梦，流失，如露」） */
const OPEN = '「『【（(《<';
const CLOSE = '」』】）)》>';
const isOpen = (ch) => OPEN.includes(ch);
const isClose = (ch) => CLOSE.includes(ch);

/** 按 。！？/换行 切句（保留句末标点）；括号内不切 */
function splitSentences(raw) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (const ch of String(raw)) {
    if (isOpen(ch)) depth += 1;
    else if (isClose(ch)) depth = Math.max(0, depth - 1);
    buf += ch;
    if (depth === 0 && (ch === '。' || ch === '！' || ch === '？' || ch === '\n')) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** 按 ，； 切半句；括号内不切 */
function splitHalves(sentence) {
  const out = [];
  let buf = '';
  let depth = 0;
  for (const ch of sentence) {
    if (isOpen(ch)) depth += 1;
    else if (isClose(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === '，' || ch === '；')) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const TAG_RE = /<[^>]+>/g;
/** 去标签（<unbreak>/<color>/<u>/<icon>）+ 还原换行 + 收空白 */
function plain(text) {
  return String(text)
    .replace(/\\n/g, '\n')
    .replace(TAG_RE, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** 严格占位符：必须是 #N[i] / #N[f1] 形式（游戏数据里 desc 一律带方括号） */
const PH_STRICT = /#(\d+)\[([a-zA-Z]\d*)\]/g;
/** 宽松占位符：忆灵本体字段是裸 #5（hp_inherit 等） */
const PH_LOOSE = /#(\d+)(?!\d)/g;

/** 占位符后面紧跟 % → 百分比条款（允许中间夹 </unbreak> 之类的收尾标签） */
function isPercentAfter(raw, endIdx) {
  let rest = raw.slice(endIdx);
  for (;;) {
    const m = /^<\/?[^>]*>/.exec(rest);
    if (!m) break;
    rest = rest.slice(m[0].length);
  }
  return rest.startsWith('%');
}

/** 按 [i]/[f1]/[f2] 格式化；百分比条款先 ×100 */
function formatParam(value, fmt, pct) {
  if (typeof value !== 'number') return null;
  const scaled = pct ? value * 100 : value;
  if (fmt === 'i') return Math.round(scaled);
  const digits = /^f(\d+)$/.exec(fmt || '');
  if (digits) return Number(scaled.toFixed(Number(digits[1])));
  return Number(scaled.toFixed(4));
}

/** 抽取一段原文里的占位符 */
function extractParams(raw, paramList, loose = false) {
  const re = loose ? PH_LOOSE : PH_STRICT;
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(raw))) {
    const idx = Number(m[1]);
    const value = paramList[idx - 1];
    const fmt = loose ? null : m[2];
    const pct = isPercentAfter(raw, m.index + m[0].length);
    out.push({
      idx,
      raw: m[0],
      fmt,
      pct,
      value: typeof value === 'number' ? value : null,
      display: typeof value === 'number' ? formatParam(value, fmt, pct) : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- 技能分类
/** data 的 type/type_name → 台账 kind + 引擎默认等级（对应 battle.ts DEFAULT_LEVELS） */
function classify(sk, fromMemo) {
  const tn = (sk.type_name || '').trim();
  const t = sk.type || null;
  if (fromMemo) return tn === '忆灵技' ? { kind: '忆灵技', level: 6 } : { kind: '忆灵天赋', level: 6 };
  if (t === 'Normal') return { kind: '普攻', level: 6 };
  if (t === 'BPSkill') return { kind: '战技', level: 10 };
  if (t === 'Ultra') return { kind: '终结技', level: 10 };
  if (t === 'Talent' || tn === '天赋') return { kind: '天赋', level: 10 };
  if (t === 'Maze') return { kind: '秘技', level: 1 };
  if (t === 'MazeNormal') return { kind: 'MazeNormal', level: 1, inBattle: false };
  if (t === 'Servant') return { kind: '忆灵技', level: 6 };
  if (t === 'ElationDamage') return { kind: '欢愉技', level: 10 };
  if (t === 'Assist') return { kind: '助战技', level: 10 };
  if (tn === '固有行迹') return { kind: '固有行迹', level: 1 };
  return { kind: tn || t || '技能', level: 10 };
}

/** 技能等级档位（缺档时回落到最高档） */
function levelsOf(sk) {
  const lv = sk.level || {};
  const keys = Object.keys(lv).map(Number).sort((a, b) => a - b);
  return { keys, paramsOf: (k) => (lv[String(k)] || {}).param_list || [] };
}

/** kind 排序权重（台账里的展示顺序） */
const KIND_ORDER = [
  '普攻', '战技', '终结技', '天赋', '秘技', '忆灵技', '忆灵天赋', '忆灵本体', '欢愉技', '助战技', '固有行迹',
  'MazeNormal',
  '星魂1', '星魂2', '星魂3', '星魂4', '星魂5', '星魂6', 'EX星魂1',
  'point06', 'point07', 'point08', 'point21', 'point23',
];
const kindRank = (k) => {
  const i = KIND_ORDER.indexOf(k);
  if (i >= 0) return i;
  if (k.startsWith('加强-')) return 100 + kindRank(k.slice(3));
  return 200;
};

// ---------------------------------------------------------------- 角色 → 条款源
/**
 * 一个「条款源」= 一段带文案的原文（技能 / 星魂 / 行迹 / 忆灵技能 / 加强版技能）。
 * key 形如 `skill.141302` / `rank.2` / `trace.point08` / `memo.1141303` / `enh1.skill.1100402`。
 */
function makeSource({ charId, key, kind, gameId, name, desc, paramList, paramLists, level, levelMax, inBattle, loose }) {
  const raw = desc || '';
  const sentencesRaw = splitSentences(raw);
  const sentences = [];
  const clauses = [];
  sentencesRaw.forEach((sentRaw, si) => {
    sentences.push(plain(sentRaw));
    splitHalves(sentRaw).forEach((halfRaw, hi) => {
      clauses.push({
        id: `${charId}.${key}.${si}.${hi}`,
        s: si,
        h: hi,
        text: plain(halfRaw),
        params: extractParams(halfRaw, paramList, loose),
      });
    });
  });
  return {
    key,
    kind,
    gameId: gameId ? String(gameId) : null,
    name: name || null,
    level,
    levelMax,
    inBattle: inBattle !== false,
    paramCount: paramList.length,
    paramList,
    paramLists: paramLists && paramLists.length ? paramLists : (paramList.length ? [paramList] : []),
    sentences,
    clauses,
  };
}

/**
 * 忆灵本体字段（hp_base/hp_inherit/speed_base/speed_inherit）里的 #N 指向「召唤它的那个技能的 param_list」。
 * 数据里用 `memosprite.hp_skill` 指明是哪个技能，但个别角色该项为 null —— 手工补：
 * - 1407 遐蝶：`hp_skill` 为 null，speed_base=#1；battle.ts「终招140703 [165,3,1,0.2,0] 召死龙（速165…）」
 *   与 140703 的 param_list[0]=165 实测吻合 → 指向终结技 140703。
 */
const MEMO_BODY_SKILL_OVERRIDE = { 1407: '140703' };

function sourcesOfChar(d, skillIndex) {
  const z = d.zh;
  const charId = d.id;
  const out = [];

  for (const [sid, sk] of Object.entries(z.skills || {})) {
    if (!sk.desc) continue;
    const { kind, level, inBattle } = classify(sk, false);
    const { keys, paramsOf } = levelsOf(sk);
    if (!keys.length) continue;
    const levelMax = keys[keys.length - 1];
    const use = keys.includes(level) ? level : levelMax;
    out.push(makeSource({
      charId, key: `skill.${sid}`, kind, gameId: sid, name: sk.name, desc: sk.desc,
      paramList: paramsOf(use), paramLists: keys.map(paramsOf), level: use, levelMax, inBattle,
    }));
  }
  for (const [rk, r] of Object.entries(z.ranks || {})) {
    if (!r.desc) continue;
    out.push(makeSource({
      charId, key: `rank.${rk}`, kind: `星魂${rk}`, name: r.name, desc: r.desc,
      paramList: r.param_list || [], level: null, levelMax: null,
    }));
  }
  for (const [rk, r] of Object.entries(z.ex_ranks || {})) {
    if (!r || !r.desc) continue;
    out.push(makeSource({
      charId, key: `exrank.${rk}`, kind: `EX星魂${rk}`, name: r.name, desc: r.desc,
      paramList: r.param_list || [], level: null, levelMax: null,
    }));
  }
  for (const [pk, pobj] of Object.entries(z.skill_trees || {})) {
    const lv1 = pobj && (pobj['1'] || Object.values(pobj)[0]);
    if (!lv1 || !lv1.point_desc) continue;
    out.push(makeSource({
      charId, key: `trace.${pk}`, kind: pk, gameId: lv1.point_id, name: lv1.point_name,
      desc: lv1.point_desc, paramList: lv1.param_list || [], level: 1, levelMax: 1,
    }));
  }
  const memo = z.memosprite;
  if (memo) {
    for (const [sid, sk] of Object.entries(memo.skills || {})) {
      if (!sk.desc) continue;
      const { kind, level } = classify(sk, true);
      const { keys, paramsOf } = levelsOf(sk);
      if (!keys.length) continue;
      const levelMax = keys[keys.length - 1];
      const use = keys.includes(level) ? level : levelMax;
      out.push(makeSource({
        charId, key: `memo.${sid}`, kind, gameId: sid, name: sk.name, desc: sk.desc,
        paramList: paramsOf(use), paramLists: keys.map(paramsOf), level: use, levelMax,
      }));
    }
    // 忆灵本体：hp_base/hp_inherit/speed_base/speed_inherit 里的 #N 指向「召唤它的那个技能」的 param_list
    const bodySkillId = MEMO_BODY_SKILL_OVERRIDE[charId] || (memo.hp_skill ? String(memo.hp_skill) : null);
    const hpSkill = bodySkillId ? skillIndex.get(bodySkillId) : null;
    const bodyFields = ['hp_base', 'hp_inherit', 'speed_base', 'speed_inherit']
      .filter((f) => typeof memo[f] === 'string' && /#\d/.test(memo[f]));
    if (bodyFields.length) {
      const bodyLevels = hpSkill ? levelsOf(hpSkill) : { keys: [], paramsOf: () => [] };
      const blMax = bodyLevels.keys.length ? bodyLevels.keys[bodyLevels.keys.length - 1] : null;
      const bodyParams = blMax ? bodyLevels.paramsOf(blMax) : [];
      out.push(makeSource({
        charId, key: 'memo.body', kind: '忆灵本体',
        gameId: bodySkillId, name: memo.name,
        desc: bodyFields.map((f) => `${f}=${memo[f]}`).join('；'),
        paramList: bodyParams, paramLists: bodyLevels.keys.map(bodyLevels.paramsOf),
        level: blMax, levelMax: blMax, loose: true,
      }));
    }
  }
  for (const [vk, v] of Object.entries(z.enhanced || {})) {
    for (const [sid, sk] of Object.entries(v.skills || {})) {
      if (!sk.desc) continue;
      const { kind, level, inBattle } = classify(sk, false);
      const { keys, paramsOf } = levelsOf(sk);
      if (!keys.length) continue;
      const levelMax = keys[keys.length - 1];
      const use = keys.includes(level) ? level : levelMax;
      out.push(makeSource({
        charId, key: `enh${vk}.skill.${sid}`, kind: `加强-${kind}`, gameId: sid, name: sk.name, desc: sk.desc,
        paramList: paramsOf(use), paramLists: keys.map(paramsOf), level: use, levelMax, inBattle,
      }));
    }
  }
  out.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || String(a.gameId).localeCompare(String(b.gameId)));
  return out;
}

// ---------------------------------------------------------------- 加载角色
function loadCharacters() {
  const files = fs.readdirSync(CHAR_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();
  const raws = [];
  for (const f of files) raws.push(JSON.parse(fs.readFileSync(path.join(CHAR_DIR, f), 'utf8')));
  // 全角色技能索引（忆灵 hp_skill 可能指向同构的另一份角色数据，如 8008 的迷迷用 8007 的 800704）
  const skillIndex = new Map();
  for (const d of raws) {
    for (const [sid, sk] of Object.entries((d.zh || {}).skills || {})) skillIndex.set(sid, sk);
  }
  const chars = [];
  for (const d of raws) {
    const z = d.zh || {};
    chars.push({
      id: d.id,
      name: plain(z.name || d.id),
      element: (d.meta && d.meta.element) || null,
      path: (d.meta && d.meta.path) || null,
      version: d.version || null,
      sources: sourcesOfChar(d, skillIndex),
    });
  }
  return chars;
}

// ---------------------------------------------------------------- TS 辅助
const parseFile = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  return { text, sf: ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS) };
};
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
function unwrap(e) {
  let n = e;
  while (
    n && (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) ||
      ts.isParenthesizedExpression(n) || ts.isTypeAssertionExpression(n) ||
      ts.isNonNullExpression(n))
  ) n = n.expression;
  return n;
}
/** 取顶层 `const NAME = ...` 的声明 */
function findTopDecl(sf, name) {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const dd of st.declarationList.declarations) {
      if (ts.isIdentifier(dd.name) && dd.name.text === name) return dd;
    }
  }
  return null;
}
const propName = (n) => n.getText().replace(/^['"]|['"]$/g, '');
/** 顶层 `const NAME = [..]` / `new Set([..])` 的字符串集合 */
function stringSetOf(sf, name) {
  const decl = findTopDecl(sf, name);
  if (!decl) return null;
  let init = unwrap(decl.initializer);
  if (!init) return null;
  if (ts.isNewExpression(init)) init = init.arguments && unwrap(init.arguments[0]);
  if (!init || !ts.isArrayLiteralExpression(init)) return null;
  return new Set(init.elements.filter((e) => ts.isStringLiteralLike(e)).map((e) => e.text));
}
/** 顶层 `const NAME = {..} as const` 的键集合 */
function keySetOf(sf, name) {
  const decl = findTopDecl(sf, name);
  if (!decl) return null;
  const init = unwrap(decl.initializer);
  if (!init || !ts.isObjectLiteralExpression(init)) return null;
  return new Set(init.properties.filter((p) => ts.isPropertyAssignment(p)).map((p) => propName(p.name)));
}

// ---------------------------------------------------------------- A2 花名册映射
/** alias → 名册 id：apps/web 的 BATTLE_ROSTER_ID（展开 engine TEAM_ROSTER_ID） */
function loadRosterMap() {
  const { sf: axis } = parseFile(TEAMAXIS_FILE);
  const teamMap = new Map();
  const teamDecl = findTopDecl(axis, 'TEAM_ROSTER_ID');
  if (teamDecl) {
    const obj = unwrap(teamDecl.initializer);
    if (obj && ts.isObjectLiteralExpression(obj)) {
      for (const p of obj.properties) {
        if (ts.isPropertyAssignment(p) && ts.isStringLiteralLike(p.initializer)) {
          teamMap.set(propName(p.name), p.initializer.text);
        }
      }
    }
  }

  const perFile = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name) || e.name.includes('.test.')) continue;
      const text = fs.readFileSync(p, 'utf8');
      if (!text.includes('BATTLE_ROSTER_ID')) continue;
      const { sf } = parseFile(p);
      const decl = findTopDecl(sf, 'BATTLE_ROSTER_ID');
      if (!decl) continue;
      const obj = unwrap(decl.initializer);
      if (!obj || !ts.isObjectLiteralExpression(obj)) continue;
      const map = new Map();
      for (const prop of obj.properties) {
        if (ts.isPropertyAssignment(prop) && ts.isStringLiteralLike(prop.initializer)) {
          map.set(propName(prop.name), prop.initializer.text);
        } else if (ts.isSpreadAssignment(prop) && ts.isIdentifier(prop.expression) &&
          prop.expression.text === 'TEAM_ROSTER_ID') {
          for (const [k, v] of teamMap) map.set(k, v);
        }
      }
      perFile.push({ file: path.relative(ROOT, p), map });
    }
  };
  walk(WEB_SRC);

  const merged = new Map();
  const conflicts = [];
  for (const { file, map } of perFile) {
    for (const [alias, id] of map) {
      if (merged.has(alias) && merged.get(alias) !== id) {
        conflicts.push({ alias, a: merged.get(alias), b: id, file });
      } else merged.set(alias, id);
    }
  }
  return { aliasToId: merged, conflicts, files: perFile.map((x) => x.file), teamMap };
}

// ---------------------------------------------------------------- A1 TRACE 常量死字段
const round9 = (n) => Math.round(n * 1e9) / 1e9;
/** 取初始化的纯数字（数组摊平）；含标识符/表达式 → null */
function numericValuesOf(node) {
  const n = unwrap(node);
  if (!n) return null;
  if (ts.isNumericLiteral(n)) return [Number(n.text)];
  if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken) {
    const inner = numericValuesOf(n.operand);
    return inner ? inner.map((v) => -v) : null;
  }
  if (ts.isArrayLiteralExpression(n)) {
    const out = [];
    for (const el of n.elements) {
      const v = numericValuesOf(el);
      if (!v) return null;
      out.push(...v);
    }
    return out;
  }
  return null;
}
/** values 是否等于某个 param_list 的连续片段 */
function matchesSlice(values, paramLists) {
  if (!values.length) return false;
  for (const list of paramLists) {
    if (!list || list.length < values.length) continue;
    for (let i = 0; i + values.length <= list.length; i += 1) {
      let ok = true;
      for (let k = 0; k < values.length; k += 1) {
        if (round9(list[i + k]) !== round9(values[k])) { ok = false; break; }
      }
      if (ok) return true;
    }
  }
  return false;
}

/**
 * 定位「按角色分派」的代码块：语句文本里出现 `'alias'` 的语句（if/else-if/case 分支等）算该角色的代码区。
 * 返回 alias → 合并后的区间列表。用于判「常量的值有没有出现在本角色自己的代码里」。
 */
function collectCharRegions(sf, aliases) {
  const ranges = new Map();
  const push = (alias, start, end) => {
    if (!ranges.has(alias)) ranges.set(alias, []);
    ranges.get(alias).push([start, end]);
  };
  const pats = [...aliases].map((a) => ({ a, re: new RegExp(`['"\`]${a}['"\`]`) }));
  const visit = (node) => {
    if (ts.isStatement(node)) {
      const text = node.getText(sf);
      if (text.length < 8000) {
        for (const { a, re } of pats) {
          if (re.test(text)) push(a, node.getStart(sf), node.getEnd());
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // 合并重叠区间
  for (const [alias, list] of ranges) {
    list.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const r of list) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    ranges.set(alias, merged);
  }
  return ranges;
}
const inRanges = (ranges, pos) => {
  if (!ranges) return false;
  for (const [a, b] of ranges) {
    if (pos >= a && pos <= b) return true;
  }
  return false;
};

/**
 * 用 TS 类型检查器解析 TRACE（能穿透 `const t = TRACE.xxx` 这类本地别名），
 * 统计每个 `alias.field` 的真实读取次数；0 次 = 定义未消费。
 * 死字段再叠三层交叉判定，把「参数镜像注释」「值在别处硬编码」和真嫌疑分开。
 */
function auditTrace(chars, aliasToId) {
  const program = ts.createProgram([BATTLE_FILE], {
    noEmit: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, strict: false,
    allowJs: false, types: [],
  });
  const sf = program.getSourceFile(BATTLE_FILE);
  if (!sf) throw new Error('无法解析 battle.ts');
  const checker = program.getTypeChecker();
  const decl = findTopDecl(sf, 'TRACE');
  if (!decl) throw new Error('battle.ts 里找不到 TRACE 常量');
  const traceType = checker.getTypeAtLocation(decl.name);
  const aliasProps = traceType.getProperties();
  if (aliasProps.length < 10) throw new Error(`TRACE 解析异常（只拿到 ${aliasProps.length} 个键）`);

  const fieldDecl = new Map(); // 声明节点 → { alias, field, numeric }
  for (const ap of aliasProps) {
    const alias = ap.getName();
    const aliasType = checker.getTypeOfSymbolAtLocation(ap, decl);
    for (const fp of aliasType.getProperties()) {
      const node = fp.declarations && fp.declarations[0];
      if (!node || !ts.isPropertyAssignment(node)) continue;
      fieldDecl.set(node, { alias, field: fp.getName(), numeric: numericValuesOf(node.initializer) });
    }
  }

  const reads = new Map();
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const nameNode = ts.isPropertyAccessExpression(node) ? node.name : node.argumentExpression;
      if (nameNode) {
        const sym = checker.getSymbolAtLocation(nameNode);
        if (sym && sym.declarations) {
          for (const dd of sym.declarations) {
            const info = fieldDecl.get(dd);
            if (!info) continue;
            const key = `${info.alias}.${info.field}`;
            reads.set(key, (reads.get(key) || 0) + 1);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // 每个角色的全部 param_list（镜像判定用；带来源 key，便于报「它抄的是哪条」）
  const listsByChar = new Map();
  for (const c of chars) {
    const lists = [];
    for (const s of c.sources) for (const l of s.paramLists) if (l && l.length) lists.push({ key: s.key, list: l });
    listsByChar.set(c.id, lists);
  }
  const flatByChar = new Map();
  for (const [id, lists] of listsByChar) flatByChar.set(id, new Set(lists.flatMap((x) => x.list).map(round9)));

  // battle.ts 里的全部数字字面量 —— 判「这个值是不是在别处被硬编码实现了」
  const literalValues = new Set();
  const literalPositions = [];
  const collectLiterals = (node) => {
    if (ts.isNumericLiteral(node)) {
      const v = round9(Number(node.text));
      literalValues.add(v);
      literalPositions.push([v, node.getStart(sf)]);
    } else if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)) {
      const v = round9(-Number(node.operand.text));
      literalValues.add(v);
      literalPositions.push([v, node.getStart(sf)]);
    }
    ts.forEachChild(node, collectLiterals);
  };
  collectLiterals(sf);

  // 每个角色自己的代码区 → 该区里出现过的数字字面量集合
  const regions = collectCharRegions(sf, aliasProps.map((p) => p.getName()));
  const ownLiterals = new Map();
  for (const [alias, list] of regions) {
    const set = new Set();
    for (const [v, pos] of literalPositions) if (inRanges(list, pos)) set.add(v);
    ownLiterals.set(alias, set);
  }

  const dead = [];
  const stat = { total: 0, read: 0, unread: 0, arrayExact: 0, arrayPartial: 0, valueInParams: 0, noMatch: 0, suspect: 0 };
  // 被读取字段的数值（按角色）→ 供 A3b 判「这条参数是否由已消费的 TRACE 常量间接承接」
  const readValues = new Map();
  const collectRead = (id, numeric) => {
    if (!id || !numeric) return;
    if (!readValues.has(id)) readValues.set(id, new Set());
    for (const v of numeric) readValues.get(id).add(round9(v));
  };
  for (const info of fieldDecl.values()) {
    if (reads.has(`${info.alias}.${info.field}`)) collectRead(aliasToId.get(info.alias) || null, info.numeric);
  }

  for (const [node, info] of fieldDecl) {
    stat.total += 1;
    const key = `${info.alias}.${info.field}`;
    if (reads.has(key)) { stat.read += 1; continue; }
    stat.unread += 1;
    const id = aliasToId.get(info.alias) || null;
    const lists = id ? listsByChar.get(id) : null;
    let verdict = 'no-match';
    let mirrorOf = null;
    if (info.numeric && lists && lists.length) {
      if (info.numeric.length >= 2) {
        const hit = lists.find((x) => matchesSlice(info.numeric, [x.list]));
        if (hit) { verdict = 'array-exact'; mirrorOf = hit.key; } else if (info.numeric.every((v) => flatByChar.get(id).has(round9(v)))) verdict = 'array-partial'; else verdict = 'no-match';
      } else {
        const v = round9(info.numeric[0]);
        if (flatByChar.get(id).has(v)) {
          verdict = 'value-in-params';
          // 标量值可能出现在多条 param_list 里，报前三个来源供人工核对
          const srcs = [];
          for (const x of lists) {
            if (x.list.some((n) => round9(n) === v) && !srcs.includes(x.key)) srcs.push(x.key);
            if (srcs.length >= 3) break;
          }
          mirrorOf = srcs.join(', ') || null;
        } else verdict = 'no-match';
      }
    }
    // 交叉判定：值在 battle.ts 里有同名数字字面量？/ 在本角色自己的代码区里出现？/ 值等于本角色另一个「已被读取」的常量？
    const asLiteral = !!info.numeric && info.numeric.every((v) => literalValues.has(round9(v)));
    const own = ownLiterals.get(info.alias);
    const inOwnCode = !!info.numeric && !!own && info.numeric.every((v) => own.has(round9(v)));
    const viaReadConstant = !!info.numeric && !!id && readValues.has(id) &&
      info.numeric.every((v) => readValues.get(id).has(round9(v)));
    // 真嫌疑 = 值不在参数表、也不在本角色代码区里出现、也没有同值常量在用 → 这个值在本角色实现里根本没落点
    const suspect = !inOwnCode && !viaReadConstant && (verdict === 'no-match' || info.numeric === null);
    if (verdict === 'array-exact') stat.arrayExact += 1;
    else if (verdict === 'array-partial') stat.arrayPartial += 1;
    else if (verdict === 'value-in-params') stat.valueInParams += 1;
    else stat.noMatch += 1;
    if (suspect) stat.suspect += 1;
    dead.push({
      alias: info.alias,
      char: id,
      field: info.field,
      value: info.numeric ? (info.numeric.length === 1 ? info.numeric[0] : info.numeric) : null,
      line: lineOf(sf, node.getStart(sf)),
      verdict,
      mirrorOf,
      asLiteral,
      inOwnCode,
      viaReadConstant,
      suspect,
    });
  }
  dead.sort((a, b) => a.line - b.line);
  return { stat, dead, aliasCount: aliasProps.length, readValues };
}

// ---------------------------------------------------------------- A2 对齐审计
function auditRoster(chars, roster) {
  const dataIds = new Set(chars.map((c) => c.id));
  const aliasById = new Map();
  for (const [alias, id] of roster.aliasToId) if (!aliasById.has(id)) aliasById.set(id, alias);

  const { sf } = parseFile(BATTLE_FILE);
  const supported = stringSetOf(sf, 'SUPPORTED_IDS');
  const energy = keySetOf(sf, 'ENERGY_MAX');
  const targets = keySetOf(sf, 'ALLY_TARGET_KINDS');
  const eidolonUp = keySetOf(sf, 'EIDOLON_SKILL_UP');
  const traceKeys = keySetOf(sf, 'TRACE');
  const webIds = new Set(roster.aliasToId.values());

  const report = { aliasCount: roster.aliasToId.size, webIds: webIds.size, conflicts: roster.conflicts, checks: [] };
  const check = (label, ok, detail) => report.checks.push({ label, ok, detail });

  check('名册 id 覆盖全部角色', webIds.size === dataIds.size && [...dataIds].every((id) => webIds.has(id)),
    `data ${dataIds.size} 个 / BATTLE_ROSTER_ID ${webIds.size} 个`);
  check('一个名册 id 只对应一个 alias', aliasById.size === webIds.size, `唯一 alias ${aliasById.size} / id ${webIds.size}`);
  check('BATTLE_ROSTER_ID 各页无冲突', roster.conflicts.length === 0,
    roster.conflicts.map((c) => `${c.alias}:${c.a}/${c.b}@${c.file}`).join(', '));

  if (supported) {
    const miss = [...dataIds].filter((id) => !supported.has(aliasById.get(id)));
    const extra = [...supported].filter((a) => !roster.aliasToId.has(a));
    check('SUPPORTED_IDS = 名册全部角色', miss.length === 0 && extra.length === 0,
      `缺 ${miss.length}（${miss.slice(0, 5).join(',')}）/ 多 ${extra.length}（${extra.slice(0, 5).join(',')}）`);
    for (const [name, set] of [['ENERGY_MAX', energy], ['ALLY_TARGET_KINDS', targets]]) {
      if (!set) { check(`${name} 存在`, false, '未找到常量'); continue; }
      const m = [...supported].filter((a) => !set.has(a));
      const e = [...set].filter((a) => !supported.has(a));
      check(`${name} 键集 = SUPPORTED_IDS`, m.length === 0 && e.length === 0,
        `缺 ${m.length}（${m.slice(0, 6).join(',')}）/ 多 ${e.length}（${e.slice(0, 6).join(',')}）`);
    }
    if (eidolonUp) {
      const e = [...eidolonUp].filter((a) => !supported.has(a));
      check('EIDOLON_SKILL_UP 键 ⊆ SUPPORTED_IDS', e.length === 0, `多 ${e.length}（${e.slice(0, 6).join(',')}）`);
    }
    if (traceKeys) {
      const e = [...traceKeys].filter((a) => !supported.has(a));
      check('TRACE 键 ⊆ SUPPORTED_IDS', e.length === 0, `多 ${e.length}（${e.slice(0, 6).join(',')}）`);
      report.traceKeys = traceKeys.size;
      report.withoutTrace = [...supported].filter((a) => !traceKeys.has(a)).sort();
    }
  }
  return report;
}

// ---------------------------------------------------------------- A3 skillParams 消费
/**
 * A3a 豁免表：「未进技能表」但原因明确的 id（不算缺口）。
 * 改这里之前先读对应注释，别把真缺口当豁免。
 */
const TABLE_EXEMPT = {
  // 加强版：引擎实现的是基础 id，加强数值已由 scripts/apply-*-enhanced.mjs 回写基础字段
  ENHANCED: '加强版（数值已回写基础 id）',
  // 开拓者同构副本：生成器只取奇数侧（8001/8003/8005/8007/8009）参数
  TRAILBLAZER_TWIN: '开拓者同构副本（生成器只取奇数侧参数）',
};
/** 逐个 id 的具体豁免理由 */
const TABLE_EXEMPT_IDS = {
  101509: 'Archer「结束」非战斗技能（见 项目维护记录）',
  121309: '丹恒•饮月「取消」非战斗技能',
  141407: '腾荒秘技无独立盾量参数（battle.ts 注释已说明）',
  1151206: '晴歌忆灵天赋无参数（退场提前拉条用固定 0.5）',
};
const TRAILBLAZER_TWIN_PREFIX = ['8002', '8004', '8006', '8008', '8010'];

function enclosingFunction(node) {
  let n = node.parent;
  while (n) {
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n)) return n;
    if (ts.isSourceFile(n)) return null;
    n = n.parent;
  }
  return null;
}

/**
 * A3a（精确）：data 里的技能 id 是否进了引擎技能表 SKILL_TABLES —— 没进 = 引擎读不到它的参数。
 * A3b（启发式）：`skillParams('<id>', lv)` 之后读了第几个下标（[k] / p[k] / 解构 / 整体逃逸）。
 */
function auditParams(chars, readValues, landing = { clauses: {} }) {
  const { sf: sdf } = parseFile(SKILLDATA_FILE);
  const tableDecl = findTopDecl(sdf, 'SKILL_TABLES');
  const tableSkills = new Set();
  if (tableDecl) {
    const obj = unwrap(tableDecl.initializer);
    if (obj && ts.isObjectLiteralExpression(obj)) {
      for (const p of obj.properties) if (ts.isPropertyAssignment(p)) tableSkills.add(propName(p.name));
    }
  }

  const { sf: bsf } = parseFile(BATTLE_FILE);
  const consumed = new Map(); // skillId → Set<index>
  const allConsumed = new Set(); // 参数整体逃逸（下标不可知）
  const callSites = new Map(); // skillId → [行号]

  const mark = (id, idx) => {
    if (!consumed.has(id)) consumed.set(id, new Set());
    consumed.get(id).add(idx);
  };

  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'skillParams') {
      const a0 = node.arguments[0];
      if (a0 && ts.isStringLiteralLike(a0) && /^\d{6,7}$/.test(a0.text)) {
        const id = a0.text;
        if (!callSites.has(id)) callSites.set(id, []);
        callSites.get(id).push(lineOf(bsf, node.getStart(bsf)));

        const parent = node.parent;
        const p = unwrap(parent);
        if (p && ts.isElementAccessExpression(p) && p.expression === node) {
          const arg = unwrap(p.argumentExpression);
          if (arg && ts.isNumericLiteral(arg)) mark(id, Number(arg.text));
          else allConsumed.add(id);
        } else if (p && ts.isVariableDeclaration(p) && ts.isArrayBindingPattern(p.name)) {
          p.name.elements.forEach((el, i) => { if (ts.isBindingElement(el)) mark(id, i); });
        } else if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
          const varName = p.name.text;
          const scope = enclosingFunction(p) || bsf;
          let escaped = false;
          const scan = (n) => {
            if (escaped || n === p) return;
            if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === varName) {
              const arg = unwrap(n.argumentExpression);
              if (arg && ts.isNumericLiteral(arg)) { mark(id, Number(arg.text)); return; }
              escaped = true;
              return;
            }
            if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === varName) {
              // p.length / p[m] —— 下标不可知
              escaped = true;
              return;
            }
            if (ts.isIdentifier(n) && n.text === varName) {
              const np = n.parent;
              const asArg = np && (ts.isCallExpression(np) || ts.isNewExpression(np)) &&
                np.arguments && np.arguments.includes(n);
              const spread = np && (ts.isSpreadElement(np) || ts.isSpreadAssignment(np));
              const returned = np && ts.isReturnStatement(np);
              const arrowBody = np && ts.isArrowFunction(np);
              if (asArg || spread || returned || arrowBody) { escaped = true; return; }
            }
            ts.forEachChild(n, scan);
          };
          scan(scope);
          if (escaped) allConsumed.add(id);
        } else if (p && ts.isPropertyAccessExpression(p) && p.expression === node) {
          // skillParams(...).length 之类，不影响下标判定
        } else {
          allConsumed.add(id);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(bsf);

  // A3a：data 里进战斗的技能 id 但不在技能表，按原因分类
  const notInTable = [];
  const noLiteralCall = [];
  const paramGaps = [];
  // 技能 id 还被哪些「非 skillParams」的函数字面量接收（如 charAttack('xx','xx.ult','100103','ult')）
  // —— 这些技能的参数由泛用路径消费，下标级分析判不了，A3b 里标成低信度
  const genericUse = new Map(); // skillId → Set<被调函数名>
  const collectGenericUse = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : (ts.isPropertyAccessExpression(callee) ? callee.name.text : null);
      if (name && name !== 'skillParams' && node.arguments) {
        for (const a of node.arguments) {
          if (ts.isStringLiteralLike(a) && /^\d{6,7}$/.test(a.text)) {
            if (!genericUse.has(a.text)) genericUse.set(a.text, new Set());
            genericUse.get(a.text).add(name);
          }
        }
      }
    }
    ts.forEachChild(node, collectGenericUse);
  };
  collectGenericUse(bsf);

  // battle.ts 里所有数字字面量 —— 用来判「这个值是不是被硬编码实现了」
  const literalValues = new Set();
  const collectLiterals = (node) => {
    if (ts.isNumericLiteral(node)) literalValues.add(round9(Number(node.text)));
    else if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)) literalValues.add(round9(-Number(node.operand.text)));
    ts.forEachChild(node, collectLiterals);
  };
  collectLiterals(bsf);

  for (const c of chars) {
    for (const s of c.sources) {
      if (!s.gameId || !/^\d{6,7}$/.test(s.gameId)) continue;
      if (s.inBattle === false) continue;
      if (/^(星魂|EX星魂)/.test(s.kind) || /^point\d+$/.test(s.kind) || s.kind === '忆灵本体') continue;
      const isSkillish = s.kind !== '忆灵本体';
      if (isSkillish && !tableSkills.has(s.gameId)) {
        let exempt = TABLE_EXEMPT_IDS[s.gameId] || null;
        if (!exempt && s.kind.startsWith('加强-')) exempt = TABLE_EXEMPT.ENHANCED;
        if (!exempt && TRAILBLAZER_TWIN_PREFIX.includes(s.gameId.slice(0, 4))) exempt = TABLE_EXEMPT.TRAILBLAZER_TWIN;
        notInTable.push({ char: c.id, name: c.name, kind: s.kind, gameId: s.gameId, srcName: s.name, exempt });
      }
      if (!tableSkills.has(s.gameId)) continue;
      if (!callSites.has(s.gameId)) { noLiteralCall.push({ char: c.id, name: c.name, kind: s.kind, gameId: s.gameId }); continue; }
      if (allConsumed.has(s.gameId)) continue;
      const got = consumed.get(s.gameId) || new Set();
      for (const cl of s.clauses) {
        for (const p of cl.params) {
          if (p.value === null) continue;
          if (got.has(p.idx - 1)) continue;
          paramGaps.push({
            char: c.id, name: c.name, kind: s.kind, gameId: s.gameId, srcName: s.name,
            clauseId: cl.id, idx: p.idx, value: p.value, text: cl.text,
            generic: [...(genericUse.get(s.gameId) || [])].sort(),
            // 该数值等于本角色某个「已被读取」的 TRACE 常量 → 很可能由常量间接承接
            viaConstant: !!(readValues && readValues.get(c.id) && readValues.get(c.id).has(round9(p.value))),
            // 该数值在 battle.ts 里以数字字面量出现过 → 多半是硬编码实现（如符玄 0.5、云璃 2.2）
            asLiteral: literalValues.has(round9(p.value)),
            // 该条款已在 landing.json 对过账（done/partial/na 任一）→ 不再计入缺口
            landed: Object.prototype.hasOwnProperty.call(landing.clauses ?? {}, cl.id),
          });
        }
      }
    }
  }

  return { tableSkills, calledSkills: callSites, consumed, allConsumed, notInTable, noLiteralCall, paramGaps, genericSkills: genericUse };
}

/**
 * A1×A3 交叉：某个 TRACE 死字段的值，是否等于某个「已被下标级读取」的技能参数。
 * 成立 → 该常量多半只是参数镜像（机制走 skillParams），可降级。
 * 注意星魂/行迹参数在引擎里没有运行时表，所以它们永远不会被判成「已消费」。
 */
function linkDeadToConsumedParams(chars, dead, consumed, genericSkills, landedFields = null) {
  const byValue = new Map(); // charId → Map<值, 是否有被消费的参数取该值>
  for (const c of chars) {
    const m = new Map();
    for (const s of c.sources) {
      // 走泛用路径（charAttack(skillId) 等）的技能，其参数一律视为「可能已消费」
      const generic = s.gameId && genericSkills && genericSkills.has(s.gameId);
      const got = s.gameId && consumed.get(s.gameId);
      if (!generic && !got) continue;
      for (const list of s.paramLists) {
        list.forEach((v, i) => {
          if (typeof v !== 'number') return;
          const key = round9(v);
          const isConsumed = generic || got.has(i);
          m.set(key, (m.get(key) || false) || isConsumed);
        });
      }
    }
    byValue.set(c.id, m);
  }
  for (const d of dead) {
    if (!d.char || !Array.isArray(d.value) && typeof d.value !== 'number') { d.verdictA = d.suspect ? 'no-landing' : 'hinted'; continue; }
    const vals = Array.isArray(d.value) ? d.value : [d.value];
    const m = byValue.get(d.char);
    const viaConsumedParam = !!m && vals.every((v) => m.get(round9(v)) === true);
    d.viaConsumedParam = viaConsumedParam;
    d.verdictA = d.inOwnCode || d.viaReadConstant
      ? 'implemented-elsewhere'
      : viaConsumedParam ? 'param-mirror' : 'no-landing';
    d.suspect = d.verdictA === 'no-landing';
    // landing.fields 里已登记过的字段（done / na / missing 任一）不再算「真嫌疑」——
    // 它们是**已对账**的结论，不是待查线索（2026-11-02 round 4）
    if (landedFields && Object.prototype.hasOwnProperty.call(landedFields, `${d.char}.${d.field}`)) {
      d.landedField = landedFields[`${d.char}.${d.field}`];
      d.suspect = false;
    }
  }
  return dead.filter((d) => d.suspect).length;
}

// ---------------------------------------------------------------- landing.json
/**
 * A4：**只写不读的状态变量**（2026-11-02 新增）。
 *
 * 动机：A1 只能发现「TRACE 常量定义了但没被读取」这类死字段；但同样的 bug 还有第二个变体——
 * 模块内的 `let`/`const` 状态变量**被赋值、甚至被自己更新，却从来没被任何机制消费**。
 * 实例：昔涟 `xilianE4Stacks`（每放一次花与箭 +1，但弹射倍率从未乘进去）、
 *      `zhuiyiFromAllies`（队友获追忆时 add，但从没读过 → 1141526 的额外弹射未实现）。
 * 这类变量 TS 不会报（自更新表达式里出现就算「被使用」）。
 *
 * 判据：把对该名字的每次出现分成「写」与「读」；
 * 若**每一处读**都落在「同一个语句里也有写」的语句内（`x = min(cap, x + 1)` 这种自更新），
 * 那么它从未被任何别的逻辑消费 → 报为 write-only。
 */
function auditSelfState() {
  const { sf } = parseFile(BATTLE_FILE);
  const decls = new Map(); // name → { line, kind, reads: number[], selfReads: number[] }
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      // 只看函数体内声明的（模块级常量由 A1 负责）
      let p = node.parent;
      let inFn = false;
      while (p) {
        if (ts.isFunctionLike(p)) {
          inFn = true;
          break;
        }
        p = p.parent;
      }
      if (inFn && !decls.has(name)) {
        decls.set(name, { line: lineOf(sf, node.getStart(sf)), reads: [], selfReads: [] });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);

  /** 向上找到最近的**表达式语句**（而不是任意语句）。
   *  ⚠️ 第一版用了最近的 Statement，导致 `if (x > best) best = x;` 里条件中的读被误判成「自更新」——
   *  因为它所在的 IfStatement 内部含有对同名的写。必须只看**本语句自身的表达式**是否就是对该名的赋值。 */
  const stmtOf = (node) => {
    let p = node.parent;
    while (p && !ts.isStatement(p) && !ts.isSourceFile(p)) p = p.parent;
    return p && ts.isExpressionStatement(p) ? p : null;
  };
  const writesIn = (stmt, name) => {
    let found = false;
    const scan = (n) => {
      if (found) return;
      if (
        ts.isBinaryExpression(n) &&
        ts.isIdentifier(n.left) &&
        n.left.text === name &&
        n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        n.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      ) {
        found = true;
        return;
      }
      if (
        (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
        ts.isIdentifier(n.operand) &&
        n.operand.text === name &&
        // 只有单独成句的 `x++;` 才是写；`order: nextOrder++` 是取值
        ts.isExpressionStatement(n.parent)
      ) {
        found = true;
        return;
      }
      ts.forEachChild(n, scan);
    };
    if (stmt) scan(stmt);
    return found;
  };

  const visit = (node) => {
    if (ts.isIdentifier(node) && decls.has(node.text)) {
      const rec = decls.get(node.text);
      const p = node.parent;
      const isDeclName = ts.isVariableDeclaration(p) && p.name === node;
      // ⚠️ 必须校验运算符是**赋值**：第一版漏了这一步，把 `x = min(cap, x + 1)` 里的 RHS 读
      // 也当成写（`x + 1` 的 left 就是 x），于是真正的 write-only 变量被误判成正常。
      const isAssignOp =
        p &&
        ts.isBinaryExpression(p) &&
        p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        p.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
      const isIncDec =
        ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) &&
          (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) ||
        false;
      // `x++`/`++x` 只有在**单独成句**时才是纯写；`order: nextOrder++` 这种取值场景是读
      const incDecAsValue = isIncDec && !ts.isExpressionStatement(p.parent);
      const isWriteTarget =
        (Boolean(isAssignOp) && p.left === node) ||
        // ⚠️ 必须校验是 ++/--：`!x` 同样是 PrefixUnaryExpression，第一版把它当成写，
        // 于是所有 `if (!xUsed)` 这类一次性开关全被误判成 write-only（一次冒出 64 个假阳性）。
        (isIncDec && !incDecAsValue && p.operand === node) ||
        // `set.add(x)` / `map.set(k,v)` / `arr.push(x)` 这类容器写入也不算读；
        // ⚠️ 不含 `delete`（`if (s.delete(x))` 依赖返回值，是读）与 `has`。
        (ts.isPropertyAccessExpression(p) &&
          p.expression === node &&
          ['add', 'push', 'set', 'clear'].includes(p.name.text));
      if (isDeclName) {
        // 声明不算读
      } else if (
        // 取值型自增 / 逻辑取反 / 条件判断 —— 都是货真价实的读
        incDecAsValue ||
        (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) ||
        ts.isIfStatement(p) ||
        ts.isWhileStatement(p) ||
        ts.isConditionalExpression(p)
      ) {
        rec.reads.push(lineOf(sf, node.getStart(sf)));
      } else if (isWriteTarget) {
        // 纯写入
      } else {
        const stmt = stmtOf(node);
        if (writesIn(stmt, node.text)) rec.selfReads.push(lineOf(sf, node.getStart(sf)));
        else rec.reads.push(lineOf(sf, node.getStart(sf)));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const out = [];
  for (const [name, rec] of decls) {
    // 只要「真读」为 0 就是可疑：哪怕一次读都没有（`const s = new Set(); s.add(x)` 这种
    // TS 不会报 unused，因为 `.add` 算使用）
    if (rec.reads.length > 0) continue; // 有真正的读 → 正常
    out.push({ name, line: rec.line, selfUpdates: rec.selfReads.length });
  }
  out.sort((a, b) => a.line - b.line);
  return out;
}

function loadLanding() {
  if (!fs.existsSync(LANDING_FILE)) return { sources: {}, clauses: {}, fields: {}, doc: null };
  const raw = JSON.parse(fs.readFileSync(LANDING_FILE, 'utf8'));
  return { sources: raw.sources || {}, clauses: raw.clauses || {}, fields: raw.fields || {}, doc: raw._doc || null };
}
/** 条款/来源是否已标注（来源级兜底，条款级覆盖） */
function landingOf(landing, charId, srcKey, clauseId) {
  const s = landing.sources[`${charId}.${srcKey}`] || null;
  const c = landing.clauses[clauseId] || null;
  if (c) return { ...(s || {}), ...c, via: 'clause' };
  if (s) return { ...s, via: 'source' };
  return null;
}
const STATUS_TEXT = {
  done: '已接+有判据',
  'impl-no-test': '已接无判据',
  missing: '未接',
  na: '不参与',
  unverified: '待核',
};

// ---------------------------------------------------------------- 统计
function summarize(chars, landing) {
  const stat = {
    characters: chars.length, sources: 0, clauses: 0, placeholders: 0,
    battleClauses: 0, unresolvedParams: 0,
    byKind: new Map(), annotated: 0, statusCount: new Map(),
  };
  for (const c of chars) {
    for (const s of c.sources) {
      stat.sources += 1;
      for (const cl of s.clauses) {
        stat.clauses += 1;
        if (s.inBattle !== false) stat.battleClauses += 1;
        stat.placeholders += cl.params.length;
        for (const p of cl.params) if (p.value === null) stat.unresolvedParams += 1;
        stat.byKind.set(s.kind, (stat.byKind.get(s.kind) || 0) + 1);
        const l = landingOf(landing, c.id, s.key, cl.id);
        if (l) {
          stat.annotated += 1;
          const st = l.status || 'unverified';
          stat.statusCount.set(st, (stat.statusCount.get(st) || 0) + 1);
        }
      }
    }
  }
  return stat;
}

// ---------------------------------------------------------------- 输出：ledger.json
const jsonReplacer = (_k, v) => (v instanceof Set ? [...v] : v);

function writeLedger(chars, stat, audits) {
  const body = {
    _doc: [
      '条款台账（生成物，勿手改；由 node scripts/gen-clause-ledger.mjs 生成）。',
      '每条 clause 对应文案里一个「半句」；s = 句序号（原文见同 source 的 sentences）。',
      'params[] 为解析后的 #N 参数：idx 从 1 起、value 为 param_list 原值、display 为百分比换算后的展示值。',
      '人工落点标注在 data/clause-ledger/landing.json，不进本文件。',
    ].join(' '),
    meta: {
      dataVersion: chars.map((c) => c.version).filter(Boolean).sort().pop() || null,
      characters: stat.characters,
      sources: stat.sources,
      clauses: stat.clauses,
      battleClauses: stat.battleClauses,
      placeholders: stat.placeholders,
      unresolvedParams: stat.unresolvedParams,
    },
    characters: chars.map((c) => ({
      id: c.id,
      name: c.name,
      element: c.element,
      path: c.path,
      sources: c.sources.map((s) => ({
        key: s.key,
        kind: s.kind,
        gameId: s.gameId,
        name: s.name,
        level: s.level,
        levelMax: s.levelMax,
        inBattle: s.inBattle,
        sentences: s.sentences,
        clauses: s.clauses,
      })),
    })),
    audits: audits || null,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(LEDGER_FILE, `${JSON.stringify(body, jsonReplacer, 1)}\n`, 'utf8');
  return (fs.statSync(LEDGER_FILE).size / 1024).toFixed(0);
}

// ---------------------------------------------------------------- 输出：docs/clause-ledger.md
const charLabel = (chars, id, alias) => {
  const c = chars.find((x) => x.id === id);
  if (c) return `${c.name}（${c.id}）`;
  return alias ? `${alias}（未匹配名册）` : '—';
};
const fmtVal = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v));
const pctText = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');

function writeReport(chars, stat, audits, landing) {
  const L = [];
  L.push('# 条款台账（生成物）');
  L.push('');
  L.push('> ⚠️ 本文件由 `node scripts/gen-clause-ledger.mjs` 生成，请勿手改。');
  L.push('> 人工落点标注写在 `data/clause-ledger/landing.json`；重跑脚本后本文件的标注进度会更新。');
  L.push('');
  L.push('## 一、概览');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| --- | --- |');
  L.push(`| 数据版本 | ${chars.map((c) => c.version).filter(Boolean).sort().pop() || '—'} |`);
  L.push(`| 角色 | ${stat.characters} |`);
  L.push(`| 条款源（每段带文案的技能/星魂/行迹/忆灵…） | ${stat.sources} |`);
  L.push(`| 条款（半句） | ${stat.clauses} |`);
  L.push(`| 其中战斗内 | ${stat.battleClauses} |`);
  L.push(`| \`#N\` 占位符 | ${stat.placeholders}（解析失败 ${stat.unresolvedParams}） |`);
  L.push(`| 已标注条款 | ${stat.annotated} / ${stat.clauses}（${pctText(stat.annotated, stat.clauses)}） |`);
  L.push('');
  if (stat.annotated > 0) {
    L.push('| 标注状态 | 条数 |');
    L.push('| --- | --- |');
    for (const [k, v] of [...stat.statusCount.entries()].sort((a, b) => b[1] - a[1])) {
      L.push(`| ${STATUS_TEXT[k] || k}（\`${k}\`） | ${v} |`);
    }
    L.push('');
  }
  L.push('### 按条款类型');
  L.push('');
  L.push('| 类型 | 条款数 |');
  L.push('| --- | --- |');
  for (const [k, v] of [...stat.byKind.entries()].sort((a, b) => kindRank(a[0]) - kindRank(b[0]) || b[1] - a[1])) {
    L.push(`| ${k} | ${v} |`);
  }
  L.push('');

  if (audits) {
    const t = audits.trace.stat;
    L.push('## 二、审计 A1：`TRACE` 常量「定义了没消费」');
    L.push('');
    L.push('口径：用 TypeScript 类型检查器解析 `battle.ts` 的 `TRACE`（能穿透 `const t = TRACE.xxx` 这类本地别名），');
    L.push('统计每个 `alias.field` 的真实读取次数；0 次 = 定义未消费。**「未被读取」是事实**，是否构成 bug 要看它的值：');
    L.push('值若等于该角色某条 `param_list`、或出现在本角色代码区的数字字面量里、或等于另一个已被读取的常量，都属于「值在别处有落点」；三条都不成立才是真嫌疑。');
    L.push('');
    L.push('| 判定 | 含义 | 条数 |');
    L.push('| --- | --- | --- |');
    L.push(`| \`array-exact\` | 数组值 = 某条 param_list 的连续片段（强镜像证据） | ${t.arrayExact} |`);
    L.push(`| \`array-partial\` | 数组值每个元素都能在该角色参数全集里找到 → 疑似镜像 | ${t.arrayPartial} |`);
    L.push(`| \`value-in-params\` | 标量值在该角色参数全集里出现（可能是镜像；单值匹配不唯一，表里给出前几个来源） | ${t.valueInParams} |`);
    L.push(`| \`no-match\` | 值对不上任何参数 | ${t.noMatch} |`);
    L.push('');
    L.push('再叠三条交叉判定（仅作降噪参考，**不是免责声明**）：');
    L.push('- `本角色代码区`：该数值是否出现在 battle.ts 里「按角色分派」的代码块中（`\'<alias>\'` 语句内）→ 说明可能被硬编码实现了；');
    L.push('- `同值常量`：值是否等于本角色另一个**已被读取**的常量 → 说明同一个数另有常量在使用；');
    L.push('- `已消费参数`：值是否等于某个「下标被 `skillParams` 读到」的技能参数 → 说明是参数镜像。');
    L.push('');
    L.push('三条全否 = **无落点**（真嫌疑）。⚠️ 星魂 / 行迹参数在引擎里没有运行时表（只有技能参数有），');
    L.push('所以星魂/行迹常量的「参数镜像」永远判不出已消费 —— 这类字段即使显示「参数镜像」也必须人工看落点。');
    L.push('');
    L.push(`共 ${t.total} 个字段：被读取 ${t.read} 个，未被读取 **${t.unread}** 个`
      + `（其中值在参数表、字面量、同值常量里**全都找不到**的「真嫌疑」${t.suspect} 个）。`);
    L.push('');
    const suspectRows = audits.trace.dead.filter((d) => d.suspect);
    if (suspectRows.length) {
      L.push('### 真嫌疑（值既不在参数表、也没在源码里出现）');
      L.push('');
      L.push('| 角色 | 字段 | 值 | battle.ts 行 |');
      L.push('| --- | --- | --- | --- |');
      for (const d of suspectRows) {
        L.push(`| ${charLabel(chars, d.char, d.alias)} | \`${d.field}\` | \`${fmtVal(d.value)}\` | ${d.line} |`);
      }
      L.push('');
    }
    const unreadByChar = new Map();
    for (const d of audits.trace.dead) {
      const k = d.char || d.alias;
      if (!unreadByChar.has(k)) unreadByChar.set(k, []);
      unreadByChar.get(k).push(d);
    }
    L.push(`### 全量未读取清单（${audits.trace.dead.length} 个字段 / ${unreadByChar.size} 个角色）`);
    L.push('');
    const order = [...unreadByChar.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [k, list] of order) {
      const name = charLabel(chars, k, list[0].alias);
      L.push(`**${name}**（${list.length}）`);
      L.push('');
      L.push('| 字段 | 值 | 结论 | 值=参数（来源） | 本角色代码区 | 同值常量 | 已消费参数 | battle.ts 行 |');
      L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const d of list) {
        const verdictText = d.verdictA === 'no-landing' ? '**无落点**'
          : d.verdictA === 'param-mirror' ? '参数镜像'
            : '值已在别处实现';
        const src = d.verdict.startsWith('value-in') || d.verdict.startsWith('array') ? `\`${d.mirrorOf || '?'}\`` : '—';
        L.push(`| \`${d.field}\` | \`${fmtVal(d.value)}\` | ${verdictText} | ${src} | ${d.inOwnCode ? '有' : '无'} | ${d.viaReadConstant ? '有' : '无'} | ${d.viaConsumedParam ? '有' : '无'} | ${d.line} |`);
      }
      L.push('');
    }

    L.push('## 三、审计 A2：花名册对齐');
    L.push('');
    L.push('| 检查 | 结果 | 详情 |');
    L.push('| --- | --- | --- |');
    for (const c of audits.roster.checks) L.push(`| ${c.label} | ${c.ok ? '✅' : '❌'} | ${c.detail || ''} |`);
    L.push('');
    if (audits.roster.withoutTrace && audits.roster.withoutTrace.length) {
      L.push(`未声明 \`TRACE\` 常量的角色（${audits.roster.withoutTrace.length} 个，走纯通用路径/无专属常量，不一定是问题）：`);
      L.push('');
      L.push(`\`${audits.roster.withoutTrace.join('` `')}\``);
      L.push('');
    }

    L.push('## 四、审计 A3：技能参数消费');
    L.push('');
    L.push('### A3a（精确）技能 id 是否进了引擎技能表 `SKILL_TABLES`');
    L.push('');
    L.push('未进表 = 引擎 `skillParams()` 根本读不到它的参数（生成器 `scripts/gen-combat-raw.mjs` 没收）。');
    L.push('');
    const tableGaps = audits.params.notInTable.filter((x) => !x.exempt);
    const tableOk = audits.params.notInTable.filter((x) => x.exempt);
    if (tableGaps.length) {
      L.push(`❗ **${tableGaps.length} 条待核**（既不在表里、也没有豁免理由）：`);
      L.push('');
      L.push('| 角色 | 类型 | 技能 id | 技能名 |');
      L.push('| --- | --- | --- | --- |');
      for (const x of tableGaps) L.push(`| ${x.name}（${x.char}） | ${x.kind} | \`${x.gameId}\` | ${x.srcName || ''} |`);
      L.push('');
    } else {
      L.push('✅ 没有待核项：未进表的技能 id 全部有豁免理由。');
      L.push('');
    }
    if (tableOk.length) {
      L.push(`已豁免 ${tableOk.length} 条（\`scripts/gen-clause-ledger.mjs\` 的 \`TABLE_EXEMPT*\`；改值前先读注释）：`);
      L.push('');
      L.push('| 原因 | 条数 | 代表性 id |');
      L.push('| --- | --- | --- |');
      const byReason = new Map();
      for (const x of tableOk) {
        if (!byReason.has(x.exempt)) byReason.set(x.exempt, []);
        byReason.get(x.exempt).push(x.gameId);
      }
      for (const [reason, ids] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
        L.push(`| ${reason} | ${ids.length} | \`${ids.slice(0, 4).join('` `')}\`${ids.length > 4 ? ' …' : ''} |`);
      }
      L.push('');
    }

    L.push('### A3b（启发式）条款参数下标是否被字面量读取');
    L.push('');
    L.push('口径：扫 `skillParams(\'<id>\', lv)` 字面量调用，追踪 `[k]` / `p[k]` / `const [a,b] = ...`，');
    L.push('得到每个技能「被读了哪几个下标」；再拿条款里的 `#N` 去对。**没对上不代表一定有 bug**：');
    L.push('参数可能由「同值 TRACE 常量」间接消费，或走 `skillParams(skillId, lv)` 通用路径（已整体排除）。');
    L.push('');
    L.push(`字面量调用覆盖 **${audits.params.calledSkills.size}** 个技能，其中下标整体不可知 ${audits.params.allConsumed.size} 个；`
      + `另有 ${audits.params.noLiteralCall.length} 条走通用路径（不计入本节）。`);
    L.push('');
    // 已在 landing.json 对过账的条款不算缺口（2026-11-02：否则核清过的项会永远挂在「真嫌疑」里）
    const gaps = audits.params.paramGaps.filter((g) => !g.landed);
    const landedNote = audits.params.paramGaps.length - gaps.length;
    if (!gaps.length) {
      L.push(`✅ 所有可判定的条款参数都有字面量读取点（另有 ${landedNote} 条已在 landing.json 对账）。`);
      L.push('✅ 所有可判定的条款参数都有字面量读取点。');
      L.push('');
    } else {
      // 可信度分层：泛用路径 > 常量承接 > 字面量硬编码 > 值在源码里根本不存在
      const tier = (g) => (g.generic.length ? 4 : g.viaConstant ? 3 : g.asLiteral ? 2 : 1);
      const t1 = gaps.filter((g) => tier(g) === 1);
      const t2 = gaps.filter((g) => tier(g) === 2);
      const t3 = gaps.filter((g) => tier(g) === 3);
      const t4 = gaps.filter((g) => tier(g) === 4);
      L.push(`⚠️ 共 **${gaps.length} 条**条款参数没有字面量读取点，按可信度分四层：`);
      L.push('');
      L.push(`- **① 真嫌疑 ${t1.length} 条**：\`skillParams('<id>')\` 下标没读、数值也不等于已被消费的 TRACE 常量、更**没有以数字字面量出现在 battle.ts 里** → 这个值在引擎里根本不存在，要么缺实现要么写错；`);
      L.push(`- **② 字面量硬编码 ${t2.length} 条**：数值在 battle.ts 里有同名数字字面量 → 多半是硬编码实现了（符玄 0.5、云璃 2.2 这类），只是没走 param 表；`);
      L.push(`- **③ 常量承接 ${t3.length} 条**：数值等于本角色某个「已被读取」的 TRACE 常量 → 由常量间接承接；`);
      L.push(`- **④ 泛用路径 ${t4.length} 条**：技能 id 还被 \`charAttack\` 等函数接收，主倍率走通用路径，下标级判不了 → 仅作线索。`);
      L.push('');
      const table = (rows, withGeneric) => {
        L.push('| 角色 | 技能 id | 类型 | #N | 值 | 半句 |' + (withGeneric ? ' 泛用函数 |' : ''));
        L.push('| --- | --- | --- | --- | --- | --- |' + (withGeneric ? ' --- |' : ''));
        for (const g of rows) {
          const tail = withGeneric ? ` ${g.generic.join(' ')} |` : '';
          L.push(`| ${g.name}（${g.char}） | \`${g.gameId}\` | ${g.kind} | #${g.idx} | ${g.value} | ${g.text.replace(/\|/g, '\\|').slice(0, 40)} |${tail}`);
        }
        L.push('');
      };
      if (t1.length) {
        L.push('#### ① 真嫌疑（建议逐条核对）');
        L.push('');
        table(t1, false);
      }
      if (t2.length) {
        L.push('#### ② 字面量硬编码（大概率没问题，抽核即可）');
        L.push('');
        table(t2, false);
      }
      if (t3.length) {
        L.push('#### ③ 常量承接（大概率没问题）');
        L.push('');
        table(t3, false);
      }
      if (t4.length) {
        L.push('#### ④ 泛用路径（仅作线索）');
        L.push('');
        table(t4, true);
      }
    }
  }

  L.push('## 五、标注进度（按角色）');
  L.push('');
  L.push('| 角色 | 条款 | 已标注 | 覆盖率 |');
  L.push('| --- | --- | --- | --- |');
  const rows = [];
  for (const c of chars) {
    let total = 0;
    let done = 0;
    for (const s of c.sources) {
      for (const cl of s.clauses) {
        total += 1;
        if (landingOf(landing, c.id, s.key, cl.id)) done += 1;
      }
    }
    rows.push({ id: c.id, name: c.name, total, done });
  }
  rows.sort((a, b) => (b.done / (b.total || 1)) - (a.done / (a.total || 1)) || b.total - a.total);
  for (const r of rows) L.push(`| ${r.name}（${r.id}） | ${r.total} | ${r.done} | ${pctText(r.done, r.total)} |`);
  L.push('');

  L.push('## 六、怎么标注');
  L.push('');
  L.push('1. `node scripts/gen-clause-ledger.mjs --char=1413 --md` 打印某角色的条款表（带条款 id 和解析后的参数值）；');
  L.push('2. 在 `data/clause-ledger/landing.json` 里按 **来源级**（省事）或 **条款级**（精确）写落点：');
  L.push('');
  L.push('```json');
  L.push('{');
  L.push('  "sources": {');
  L.push('    "1413.skill.141302": { "landing": "battle.ts: changyeyue 战技分支", "judge": "test/changyeyue.test.ts", "status": "done" }');
  L.push('  },');
  L.push('  "clauses": {');
  L.push('    "1413.skill.141302.0.1": { "status": "missing", "note": "忆灵暴伤挂到了 members 而不是 allHolders()" }');
  L.push('  }');
  L.push('}');
  L.push('```');
  L.push('');
  L.push(`3. 状态取值：${Object.entries(STATUS_TEXT).map(([k, v]) => `\`${k}\`=${v}`).join('、')}；`);
  L.push('4. `node scripts/gen-clause-ledger.mjs --check` 校验 landing.json 里的 id 是否都还存在。');
  L.push('');

  fs.writeFileSync(REPORT_FILE, `${L.join('\n')}\n`, 'utf8');
  return L.length;
}

// ---------------------------------------------------------------- 单角色条款表
function printChar(chars, landing, idArg, asMd) {
  const ids = String(idArg).split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const id of ids) {
    const c = chars.find((x) => x.id === id);
    if (!c) { out.push(`❗ 找不到角色 ${id}`); continue; }
    out.push(`## ${c.name}（${c.id}）${c.element || ''} · ${c.path || ''}`);
    out.push('');
    for (const s of c.sources) {
      const l = landing.sources[`${c.id}.${s.key}`] || null;
      const flags = [
        s.inBattle === false ? '非战斗' : null,
        s.level ? `lv${s.level}/${s.levelMax}` : null,
        `参数 ${s.paramCount} 个`,
      ].filter(Boolean).join(' · ');
      out.push(`### ${s.key} — ${s.kind}${s.name ? `「${s.name}」` : ''}（${flags}）`);
      if (l) out.push(`> 来源级标注：\`${l.status || '?'}\` · 落点 ${l.landing || '—'} · 判据 ${l.judge || '—'}`);
      out.push('');
      out.push('| 条款 id | 半句 | 参数 | 标注 |');
      out.push('| --- | --- | --- | --- |');
      for (const cl of s.clauses) {
        if (!cl.text) continue;
        const params = cl.params
          .map((p) => (p.value === null ? `#${p.idx}=?` : `#${p.idx}=${p.display}${p.pct ? '%' : ''}`))
          .join(' ');
        const lc = landingOf(landing, c.id, s.key, cl.id);
        const mark = lc
          ? `\`${lc.status || '?'}\`${lc.note ? ` ${lc.note}` : ''}${lc.via === 'source' ? '（来源级）' : ''}`
          : '';
        const text = asMd ? cl.text.replace(/\|/g, '\\|') : cl.text;
        out.push(`| \`${cl.id}\` | ${text} | ${params || '—'} | ${mark.replace(/\|/g, '\\|')} |`);
      }
      out.push('');
    }
  }
  console.log(out.join('\n'));
  const outFile = opt('out', null);
  if (outFile) {
    const abs = path.isAbsolute(outFile) ? outFile : path.join(ROOT, outFile);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, `${out.join('\n')}\n`, 'utf8');
    console.log(`\n（已写入 ${path.relative(ROOT, abs)}）`);
  }
}

// ---------------------------------------------------------------- --check
function checkLanding(chars, landing) {
  const knownClause = new Set();
  const knownSource = new Set();
  for (const c of chars) {
    for (const s of c.sources) {
      knownSource.add(`${c.id}.${s.key}`);
      for (const cl of s.clauses) knownClause.add(cl.id);
    }
  }
  const badSrc = Object.keys(landing.sources).filter((k) => !knownSource.has(k));
  // 装备类条款（lc*/rs*）由 `gen-equipment-ledger.mjs --check` 校验，这里跳过
  const isEquip = (k) => /^(lc|rs)\d/.test(k);
  const badClause = Object.keys(landing.clauses).filter((k) => !isEquip(k) && !knownClause.has(k));
  const equipCount = Object.keys(landing.clauses).filter(isEquip).length;
  console.log(`landing.json：来源级 ${Object.keys(landing.sources).length} 条、条款级 ${Object.keys(landing.clauses).length} 条（其中装备类 ${equipCount} 条由 gen-equipment-ledger 校验）`);
  console.log(`台账：来源 ${knownSource.size} 个、条款 ${knownClause.size} 条`);
  if (!badSrc.length && !badClause.length) {
    console.log('✅ 全部 id 都能对上');
    return 0;
  }
  if (badSrc.length) {
    console.log(`\n❗ ${badSrc.length} 个来源 id 不存在：`);
    for (const k of badSrc.slice(0, 40)) console.log(`  ${k}`);
  }
  if (badClause.length) {
    console.log(`\n❗ ${badClause.length} 个条款 id 不存在：`);
    for (const k of badClause.slice(0, 40)) console.log(`  ${k}`);
  }
  return 1;
}

// ---------------------------------------------------------------- main
function main() {
  const chars = loadCharacters();
  const roster = loadRosterMap();
  const landing = loadLanding();

  if (flag('check')) {
    process.exitCode = checkLanding(chars, landing);
    return;
  }

  const charArg = opt('char', null);
  if (charArg) {
    printChar(chars, landing, charArg, flag('md'));
    return;
  }

  const stat = summarize(chars, landing);
  let audits = null;
  let ms = 0;
  if (!flag('no-audit')) {
    const t0 = Date.now();
    const trace = auditTrace(chars, roster.aliasToId);
    const rosterReport = auditRoster(chars, roster);
    const params = auditParams(chars, trace.readValues, landing);
    const selfState = auditSelfState();
    // A1×A3 交叉：把「值是已消费参数的镜像」的死字段降级
    trace.stat.suspect = linkDeadToConsumedParams(chars, trace.dead, params.consumed, params.genericSkills, landing.fields ?? null);
    ms = Date.now() - t0;
    audits = {
      trace,
      roster: rosterReport,
      params: {
        tableSkills: params.tableSkills,
        calledSkills: params.calledSkills,
        allConsumed: params.allConsumed,
        notInTable: params.notInTable,
        noLiteralCall: params.noLiteralCall,
        paramGaps: params.paramGaps,
        consumed: params.consumed,
      },
      selfState,
      ms,
    };
  }

  if (flag('audit-only')) {
    console.log(JSON.stringify(audits, jsonReplacer, 1));
    return;
  }

  const kb = writeLedger(chars, stat, audits);
  const lines = writeReport(chars, stat, audits, landing);

  console.log('条款台账已生成');
  console.log(`  角色 ${stat.characters} · 来源 ${stat.sources} · 条款 ${stat.clauses} · 占位符 ${stat.placeholders}（解析失败 ${stat.unresolvedParams}）`);
  console.log(`  ${path.relative(ROOT, LEDGER_FILE)}（${kb}KB）`);
  console.log(`  ${path.relative(ROOT, REPORT_FILE)}（${lines} 行）`);
  console.log(`  已标注 ${stat.annotated}/${stat.clauses} 条`);
  if (audits) {
    const t = audits.trace.stat;
    console.log(`  审计 A1：TRACE ${t.total} 个字段，未被读取 ${t.unread}，真嫌疑 ${t.suspect}`
      + `（array-exact ${t.arrayExact} / value-in-params ${t.valueInParams} / no-match ${t.noMatch}）`);
    const fail = audits.roster.checks.filter((c) => !c.ok);
    console.log(`  审计 A2：${audits.roster.checks.length} 项检查，失败 ${fail.length}`
      + (fail.length ? `（${fail.map((f) => f.label).join('、')}）` : ''));
    const gapTier = (g) => (g.generic.length ? 4 : g.viaConstant ? 3 : g.asLiteral ? 2 : 1);
    const openGaps = audits.params.paramGaps.filter((g) => !g.landed);
    const landed = audits.params.paramGaps.length - openGaps.length;
    const t1 = openGaps.filter((g) => gapTier(g) === 1).length;
    const t2 = openGaps.filter((g) => gapTier(g) === 2).length;
    const t3 = openGaps.filter((g) => gapTier(g) === 3).length;
    console.log(`  审计 A3：技能表 ${audits.params.tableSkills.size} 个 / 未进表 ${audits.params.notInTable.length}`
      + `（待核 ${audits.params.notInTable.filter((x) => !x.exempt).length}）`
      + ` / 字面量覆盖 ${audits.params.calledSkills.size} 个`);
    console.log(`          条款参数无读取点 ${openGaps.length}`
      + `（①真嫌疑 ${t1} / ②字面量 ${t2} / ③常量 ${t3} / ④泛用 ${openGaps.length - t1 - t2 - t3}）`
      + `；已对账排除 ${landed} 条`);
    console.log(`  审计 A4：只写不读的状态变量 ${audits.selfState.length} 个`);
    for (const s of audits.selfState) console.log(`          L${s.line} ${s.name}（自更新 ${s.selfUpdates} 次）`);
    console.log(`  （引擎审计耗时 ${ms}ms）`);
  }
}

main();
