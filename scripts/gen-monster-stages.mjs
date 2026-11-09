#!/usr/bin/env node
/**
 * 生成 packages/engine/src/combat/monster-stages.ts（高难本关卡包预设表）。
 *
 * 数据源（全部本地文件，不联网）：
 * - data/monster-stages/{moc-p43,moc-p44,pure-p27,apo-p21,arb-p10}.json
 *   schema v2：pack/mode/period/title/p/roundMode/difficultyGroup + stages[]
 *   （kind = boss（含上半/下半）/ star（星启）/ single（仲裁单关））
 * - data/monsters/{id}.json                    怪物模板基础值 / 子变体倍率 / 弱点 / 分属性抗性
 * - data/monster-growth/HardLevelGroup.json    难度乘区（每包自己的 HardLevelGroup）
 *
 * 血量口径（关卡页原文）：
 *   关卡血量 = 怪物基础值 × 该怪自己的倍率（子变体）× 难度乘区（第 N 组 × 该关等级）
 *              [× 虚构叙事该波增幅（已乘进页面逐怪血量）]
 *   怪物图鉴面板血量用的是第 1 组乘区，故比挑战血量低两成多 —— 两套口径不可混用。
 *   本表逐怪 hp 直接取页面值（虚构的波次增幅已含），生成器只做校验 + 反推子变体。
 *
 * 难度乘区分组：混沌回忆 = 3、异相仲裁 = 3、虚构叙事 = 1、末日幻影 = 1（页面 title 提示语）。
 *
 * 用法：node scripts/gen-monster-stages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * 2026-11-06 用户裁定：击破韧性系数取「敌方韧性上限」，且要喂**局内显示单位**。
 * 游戏 stance_base 是内部单位 = 显示值 ×3（录像：4063010 韧条 160 ↔ 480；2013020 100 ↔ 300），
 * 故在 buildStageMonster 里额外输出 toughnessUiMax = maxToughness / 3，供击破系数使用；
 * maxToughness 本身保持内部单位，以免改动破韧节奏与既有锚点。
 */
const TOUGHNESS_UI_SCALE = 3;
const DATA_DIR = path.join(ROOT, 'data/monster-stages');
const OUT_FILE = path.join(ROOT, 'packages/engine/src/combat/monster-stages.ts');

/** 包顺序 = web 三级选择的展示顺序（模式顺序：混沌 / 虚构 / 末日 / 仲裁） */
const PACK_FILES = ['moc-p43.json', 'moc-p44.json', 'pure-p27.json', 'apo-p21.json', 'arb-p10.json'];
/** 兼容旧口径的「12 关表」取哪一包 */
const LEGACY_PACK = 'moc-p44';

const growthRaw = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/monster-growth/HardLevelGroup.json'), 'utf8'),
);
const growthRows = Object.values(growthRaw);

const monsterCache = new Map();
function loadMonster(id) {
  if (!monsterCache.has(id)) {
    const file = path.join(ROOT, 'data/monsters', `${id}.json`);
    if (!fs.existsSync(file)) throw new Error(`缺少怪物模板 data/monsters/${id}.json`);
    monsterCache.set(id, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  return monsterCache.get(id);
}

const round = (n, p = 6) => {
  const f = 10 ** p;
  return Math.round(n * f) / f;
};
const num = (n) => String(round(n));
const oneLine = (s) => String(s).replace(/\s*\n\s*/g, '');

/** ---------------- 读包 ---------------- */
const packs = PACK_FILES.map((file) => {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  return {
    file,
    id: raw.pack ?? path.basename(file, '.json'),
    mode: raw.mode,
    period: raw.period,
    title: raw.title,
    p: raw.p,
    roundMode: raw.roundMode ?? 'forgotten',
    difficultyGroup: raw.difficultyGroup ?? 3,
    modeMechanics: raw.modeMechanics ?? [],
    expose: raw.expose ?? null,
    stages: raw.stages,
  };
});

const warnings = [];
const problems = [];

/** 关卡等级/波次（统一迭代） */
function stageSections(st) {
  if (st.kind === 'boss') return st.halves.map((h) => ({ half: h.half, level: h.level, hp: h.hp, waves: h.waves }));
  return [{ half: undefined, level: st.level, hp: st.hp, waves: st.waves }];
}

/** ---------------- 难度乘区 ---------------- */
const scalesByGroup = new Map();
for (const pack of packs) {
  const group = pack.difficultyGroup;
  if (!scalesByGroup.has(group)) scalesByGroup.set(group, new Map());
  const table = scalesByGroup.get(group);
  for (const st of pack.stages) {
    for (const sec of stageSections(st)) {
      const level = sec.level;
      if (!level) throw new Error(`${pack.id} ${st.name} 缺关卡等级`);
      if (table.has(level)) continue;
      const row = growthRows.find((r) => r.HardLevelGroup === group && r.Level === level);
      if (!row) throw new Error(`${pack.id} 缺 HardLevelGroup=${group} 等级 ${level} 的难度乘区`);
      table.set(level, {
        hp: row.HPRatio,
        atk: row.AttackRatio,
        def: row.DefenceRatio,
        spd: row.SpeedRatio,
        stance: row.StanceRatio,
        statusHit: row.StatusProbability ?? 0,
        statusResAdd: row.StatusResistance ?? 0,
      });
    }
  }
}
const scaleOf = (group, level) => scalesByGroup.get(group)?.get(level);

/** 波次增幅（虚构叙事：页面已乘进逐怪血量，仅用于反推子变体与留档） */
const waveMult = (wave) => (wave.mult ? Number(String(wave.mult).replace(/[×x]/g, '')) : 1);

/** ---------------- 怪物档案 ----------------
 * 两步走：先按「逐怪血量 = 模板基础 × 子变体 × 难度乘区 × 波次增幅」反推每处的子变体，
 * 再按「所有出现处一致 → 取该变体；不一致 → 取本体变体 + 警告」定档案。
 * （虚构叙事给单只小BOSS 用的是波次基线血量，会出现同一只怪在不同期命中不同变体的情况。）
 */
const occurrences = new Map();
for (const pack of packs) {
  for (const st of pack.stages) {
    for (const sec of stageSections(st)) {
      const sc = scaleOf(pack.difficultyGroup, sec.level);
      for (const wave of sec.waves) {
        const mult = waveMult(wave);
        for (const foe of wave.foes) {
          const m = loadMonster(foe.monsterId);
          const ratio = foe.hp / mult / (m.zh.hp_base * sc.hp);
          const tol = Math.max(2e-3, ratio * 2e-3);
          const hit = m.zh.child.find((c) => Math.abs(c.hp_modify_ratio - ratio) <= tol);
          if (!occurrences.has(foe.monsterId)) occurrences.set(foe.monsterId, []);
          occurrences.get(foe.monsterId).push({
            pack,
            stage: st,
            level: sec.level,
            mult,
            foe,
            ratio,
            hit,
            from: `${pack.id} ${st.name}`,
          });
        }
      }
    }
  }
}

const profiles = new Map();
const plainChildOf = (m, id) => m.zh.child.find((c) => c.id === Number(id)) ?? m.zh.child[0];
const childOf = (m, id, occ) => {
  const hits = [...new Set(occ.filter((o) => o.hit).map((o) => o.hit.id))];
  if (hits.length === 1) return { child: occ.find((o) => o.hit)?.hit, plain: false };
  const plain = plainChildOf(m, id);
  if (hits.length > 1) {
    warnings.push(
      `${id} 子变体在各期不一致（${hits.join(' / ')}）→ 取本体变体 ${plain.id}`,
    );
    return { child: plain, plain: true };
  }
  warnings.push(
    `${id} 血量反推不到子变体（比值 ${occ.map((o) => round(o.ratio, 4)).join(' / ')}）→ 按本体变体 ${plain.id}`,
  );
  return { child: plain, plain: true };
};

for (const [id, occ] of occurrences) {
  const m = loadMonster(id);
  const { child } = childOf(m, id, occ);
  const last = occ[occ.length - 1];
  const names = [...new Set(occ.map((o) => o.foe.name))];
  const ranks = [...new Set(occ.map((o) => o.foe.rank))];
  if (names.length > 1) warnings.push(`${id} 名称不一致：${names.join(' / ')}（取最后一个）`);
  if (ranks.length > 1) warnings.push(`${id} 稀有度不一致：${ranks.join(' / ')}（取最后一个）`);
  const res = {};
  for (const r of child.damage_type_resistance ?? []) res[r.damage_type] = r.value;
  profiles.set(id, {
    name: last.foe.name,
    rank: last.foe.rank,
    enemyClass: last.foe.rank === '小怪Lv2' ? 'normal' : 'elite',
    from: last.from,
    base: {
      atk: m.zh.attack_base,
      def: m.zh.defence_base,
      hp: m.zh.hp_base,
      spd: m.zh.speed_base,
      stance: m.zh.stance_base,
      statusRes: m.zh.status_resistance_base,
    },
    childId: child.id,
    child: {
      hp: child.hp_modify_ratio ?? 1,
      atk: child.attack_modify_ratio ?? 1,
      spd:
        child.speed_modify_value != null
          ? child.speed_modify_value / m.zh.speed_base
          : (child.speed_modify_ratio ?? 1),
      stance:
        child.stance_modify_value != null
          ? child.stance_modify_value / m.zh.stance_base
          : (child.stance_modify_ratio ?? 1),
    },
    weaknesses: child.stance_weak_list ?? m.meta.weak ?? [],
    resistance: res,
  });
}

/** ---------------- 校验：逐怪血量 / 弱点 / 合计 ---------------- */
for (const pack of packs) {
  for (const st of pack.stages) {
    let total = 0;
    for (const sec of stageSections(st)) {
      let sum = 0;
      const sc = scaleOf(pack.difficultyGroup, sec.level);
      for (const wave of sec.waves) {
        const mult = waveMult(wave);
        for (const foe of wave.foes) {
          const p = profiles.get(foe.monsterId);
          const expect = p.base.hp * p.child.hp * sc.hp * mult;
          if (Math.abs(expect - foe.hp) > Math.max(3, foe.hp * 1e-6)) {
            warnings.push(
              `${pack.id} ${st.name} ${foe.monsterId} 血量 ${foe.hp} ≠ 公式 ${round(expect, 3)}（子变体口径差异，已在档案阶段警告）`,
            );
          }
          if (foe.weak && foe.weak.length) {
            const site = [...foe.weak].sort().join(',');
            const local = [...p.weaknesses].sort().join(',');
            if (site !== local) {
              problems.push(`${pack.id} ${foe.monsterId} 弱点不一致：站点[${site}] vs 本地[${local}]`);
            }
          }
          sum += foe.hp * foe.count;
        }
      }
      if (Math.abs(sum - sec.hp) > 5) {
        problems.push(`${pack.id} ${st.name} ${sec.half ?? ''} 逐怪合计 ${sum} ≠ 段血量 ${sec.hp}`);
      }
      total += sum;
    }
    if (Math.abs(total - st.totalHp) > 5) {
      problems.push(`${pack.id} ${st.name} 逐段合计 ${total} ≠ 关总血 ${st.totalHp}`);
    }
  }
}
if (problems.length) {
  console.error('关卡数据校验未通过：');
  for (const p of problems) console.error(' !', p);
  process.exit(1);
}
for (const w of [...new Set(warnings)]) console.warn(' ·', w);

/* ---------------- 生成 TS ---------------- */
const L = [];
const push = (...lines) => L.push(...lines);

push(`/**`);
push(` * ⚠️ 生成物 —— 请勿手改。由 \`node scripts/gen-monster-stages.mjs\` 生成。`);
push(` *`);
push(` * 高难本关卡包预设表（混沌回忆 / 虚构叙事 / 末日幻影 / 异相仲裁）。`);
push(` *`);
push(` * 数据源：`);
push(` * - \`data/monster-stages/*.json\`（关卡逐怪数据；schema v2，血量 = 该包难度乘区下的页面值）`);
push(` * - \`data/monsters/{id}.json\`（模板基础值 / 子变体倍率 / 弱点 / 分属性抗性）`);
push(` * - \`data/monster-growth/HardLevelGroup.json\`（难度乘区，每包自己的 HardLevelGroup）`);
push(` *`);
push(` * 难度乘区分组：混沌回忆 / 异相仲裁 = 第 3 组；虚构叙事 / 末日幻影 = 第 1 组（页面提示语原文）。`);
push(` * 虚构叙事的每波还带独立血量增幅（×5 / ×10 / ×46 …），页面已乘进逐怪血量，本表不再二次乘。`);
push(` *`);
push(` * \`MONSTER_STAGES\` 是历史兼容的「物竞天择 12 关」表（= moc-p44），`);
push(` * 新的三级选择请用 \`STAGE_PACKS\`（按用户 2026-10-30 裁定只暴露各模式最难关 + 星启）。`);
push(` */`);
push('');
push(`import type { Element } from '@hsr-calc/shared';`);
push(`import type { MonsterConfig, RoundMode } from './types.js';`);
push('');

/* --- 难度乘区 --- */
push(`/** 难度乘区（一个 HardLevelGroup × 一个关卡等级） */`);
push(`export interface StageScale {`);
push(`  /** 血量乘区 */`);
push(`  hp: number;`);
push(`  /** 攻击力乘区 */`);
push(`  atk: number;`);
push(`  /** 防御力乘区（引擎未建模，留档） */`);
push(`  def: number;`);
push(`  /** 速度乘区 */`);
push(`  spd: number;`);
push(`  /** 韧性乘区 */`);
push(`  stance: number;`);
push(`  /** 效果命中 */`);
push(`  statusHit: number;`);
push(`  /** 效果抵抗加值（叠加在怪物模板 status_resistance_base 上） */`);
push(`  statusResAdd: number;`);
push(`}`);
push('');
push(`/** HardLevelGroup → 关卡等级 → 难度乘区 */`);
push(`export const STAGE_SCALES_BY_GROUP: Record<number, Record<number, StageScale>> = {`);
for (const [group, table] of [...scalesByGroup].sort((a, b) => a[0] - b[0])) {
  push(`  ${group}: {`);
  for (const [lv, sc] of [...table].sort((a, b) => a[0] - b[0])) {
    push(
      `    ${lv}: { hp: ${num(sc.hp)}, atk: ${num(sc.atk)}, def: ${num(sc.def)}, spd: ${num(sc.spd)}, stance: ${num(sc.stance)}, statusHit: ${num(sc.statusHit)}, statusResAdd: ${num(sc.statusResAdd)} },`,
    );
  }
  push(`  },`);
}
push(`};`);
push('');
push(`/** 兼容旧口径：混沌回忆 / 异相仲裁 = HardLevelGroup 3 */`);
push(`export const STAGE_SCALES: Record<number, StageScale> = STAGE_SCALES_BY_GROUP[3]!;`);
push('');
push(`/** 取某难度组某等级的乘区（缺省 undefined） */`);
push(`export function stageScale(group: number, level: number): StageScale | undefined {`);
push(`  return STAGE_SCALES_BY_GROUP[group]?.[level];`);
push(`}`);
push('');

/* --- 怪物档案 --- */
push(`/** 怪物档案（模板基础值 + 子变体倍率 + 弱点/抗性） */`);
push(`export interface StageMonsterProfile {`);
push(`  /** 中文名（关卡页） */`);
push(`  name: string;`);
push(`  /** 关卡页标记：精英 / 小BOSS / 小怪Lv2 */`);
push(`  rank: string;`);
push(`  /** 引擎 enemyClass（精英与小BOSS 均为 elite） */`);
push(`  enemyClass: 'normal' | 'elite';`);
push(`  /** 怪物模板基础值 */`);
push(`  base: { atk: number; def: number; hp: number; spd: number; stance: number; statusRes: number };`);
push(`  /** 命中的子变体 id */`);
push(`  childId: number;`);
push(`  /** 子变体倍率（spd = 速度相对基础值的比值） */`);
push(`  child: { hp: number; atk: number; spd: number; stance: number };`);
push(`  /** 弱点（只影响削韧，引擎无弱点伤害乘区） */`);
push(`  weaknesses: Element[];`);
push(`  /** 分属性抗性 */`);
push(`  resistance: Partial<Record<Element, number>>;`);
push(`}`);
push('');
push(`/** 怪物 id → 档案 */`);
push(`export const STAGE_MONSTERS: Record<string, StageMonsterProfile> = {`);
for (const [id, p] of [...profiles].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const resText = Object.entries(p.resistance)
    .map(([k, v]) => `${k}: ${num(v)}`)
    .join(', ');
  push(`  '${id}': {`);
  push(`    name: '${p.name}',`);
  push(`    rank: '${p.rank}',`);
  push(`    enemyClass: '${p.enemyClass}',`);
  push(
    `    base: { atk: ${num(p.base.atk)}, def: ${num(p.base.def)}, hp: ${num(p.base.hp)}, spd: ${num(p.base.spd)}, stance: ${num(p.base.stance)}, statusRes: ${num(p.base.statusRes)} },`,
  );
  push(`    childId: ${p.childId},`);
  push(
    `    child: { hp: ${num(p.child.hp)}, atk: ${num(p.child.atk)}, spd: ${num(p.child.spd)}, stance: ${num(p.child.stance)} },`,
  );
  push(`    weaknesses: [${p.weaknesses.map((w) => `'${w}'`).join(', ')}],`);
  push(`    resistance: { ${resText} },`);
  push(`  },`);
}
push(`};`);
push('');

/* --- 关卡结构类型 --- */
push(`/** 关卡内的一只怪（count = 同波数量） */`);
push(`export interface StageFoe {`);
push(`  /** 怪物 id（同时是敌方技能表的键） */`);
push(`  monsterId: string;`);
push(`  /** 该关血量（关卡难度乘区下的值，虚构已含波次增幅） */`);
push(`  hp: number;`);
push(`  /** 同波数量 */`);
push(`  count: number;`);
push(`  /** 怪物中文名（页面对照用） */`);
push(`  name: string;`);
push(`  /** 页面上的稀有度标签（精英/小BOSS/小怪等） */`);
push(`  rank: string;`);
push(`  /** 页面标注的弱点（留档；引擎弱点取 STAGE_MONSTERS） */`);
push(`  weak?: Element[];`);
push(`}`);
push('');
push(`/** 一个波次 */`);
push(`export interface StageWave {`);
push(`  wave: number;`);
push(`  foes: StageFoe[];`);
push(`  /** 虚构叙事波次血量增幅（已计入逐怪 hp，此处只留档） */`);
push(`  mult?: string;`);
push(`}`);
push('');
push(`/** 关卡机制（页面原文：血嗜 / 洞穿 / 闭锁 / 桎梏+ …） */`);
push(`export interface StageMechanic {`);
push(`  /** 机制名 */`);
push(`  name: string;`);
push(`  /** 机制文案 */`);
push(`  desc: string;`);
push(`}`);
push('');
push(`/** 上下半（挑战关卡的两段战斗） */`);
push(`export interface StageHalf {`);
push(`  half: '上半' | '下半';`);
push(`  /** 该半所有怪弱点的交集（关卡页标签） */`);
push(`  tags: Element[];`);
push(`  level: number;`);
push(`  hp: number;`);
push(`  waves: StageWave[];`);
push(`  /** 该段独有的关卡机制 */`);
push(`  mechanics?: StageMechanic[];`);
push(`}`);
push('');
push(`/** 关卡类型：boss = 有上下半；star = 星启；single = 仲裁单段关 */`);
push(`export type StageKind = 'boss' | 'star' | 'single';`);
push('');
push(`/** 一个关卡 */`);
push(`export interface StageDef {`);
push(`  /** 关卡序号（boss = 页面 F 号；星启 = 0；仲裁单段关 = 1~5） */`);
push(`  index: number;`);
push(`  /** 关卡中文名 */`);
push(`  name: string;`);
push(`  /** 关卡英文名（官方名待核，desc 型占位） */`);
push(`  nameEn: string;`);
push(`  /** 关内序号（对应页面的 F 编号；星启 = 0） */`);
push(`  f: number;`);
push(`  kind: StageKind;`);
push(`  /** 全关总血量 */`);
push(`  totalHp: number;`);
push(`  /** star / single 的关卡等级 */`);
push(`  level?: number;`);
push(`  /** star / single 的弱点交集 */`);
push(`  tags?: Element[];`);
push(`  /** boss：上半 / 下半（其余类型为空数组） */`);
push(`  halves: StageHalf[];`);
push(`  /** star / single：波次（其余类型为空数组） */`);
push(`  waves: StageWave[];`);
push(`  /** 关卡机制 */`);
push(`  mechanics?: StageMechanic[];`);
push(`  /** 站点原文关卡名（仲裁拆关用） */`);
push(`  siteName?: string;`);
push(`}`);
push('');
push(`/** 一个关卡包（= 一期 + 模式） */`);
push(`export interface StagePackDef {`);
push(`  /** 包 id，如 moc-p44 */`);
push(`  id: string;`);
push(`  mode: 'moc' | 'pure' | 'apo' | 'arb';`);
push(`  period: number;`);
push(`  /** 期标题（中文） */`);
push(`  title: string;`);
push(`  /** 站点 p 编号 */`);
push(`  p: number;`);
push(`  /** 该模式默认轮次模式 */`);
push(`  roundMode: RoundMode;`);
push(`  /** 该包难度乘区组 */`);
push(`  difficultyGroup: number;`);
push(`  /** 本期模式机制（记忆紊流 / 末法余烬 …） */`);
push(`  modeMechanics: StageMechanic[];`);
push(`  /** 对外暴露的关卡（按裁定只含最难关 + 星启 / 仲裁 5 关） */`);
push(`  stages: StageDef[];`);
push(`}`);
push('');

/* --- 关卡数据 --- */
const constName = (pack, index) => `S_${pack.id.toUpperCase().replace(/-/g, '_')}_${index}`;
const mechText = (list) =>
  list && list.length
    ? `[${list.map((m) => `{ name: '${m.name}', desc: '${oneLine(m.desc)}' }`).join(', ')}]`
    : undefined;

function emitWaves(waves, indent) {
  const pad = ' '.repeat(indent);
  push(`${pad}waves: [`);
  for (const wave of waves) {
    push(`${pad}  {`);
    push(`${pad}    wave: ${wave.wave},`);
    if (wave.mult) push(`${pad}    mult: '${wave.mult}',`);
    push(`${pad}    foes: [`);
    for (const foe of wave.foes) {
      const weak = foe.weak && foe.weak.length ? `, weak: [${foe.weak.map((w) => `'${w}'`).join(', ')}]` : '';
      push(
        `${pad}      { monsterId: '${foe.monsterId}', hp: ${foe.hp}, count: ${foe.count}, name: '${foe.name}', rank: '${foe.rank}'${weak} },`,
      );
    }
    push(`${pad}    ],`);
    push(`${pad}  },`);
  }
  push(`${pad}],`);
}

function emitStage(pack, st) {
  const cname = constName(pack, st.index);
  push(`const ${cname}: StageDef = {`);
  push(`  index: ${st.index},`);
  push(`  name: '${st.name}',`);
  push(`  nameEn: '${st.nameEn ?? (st.kind === 'star' ? 'Tierce' : `Stage ${st.f}`)}',`);
  push(`  f: ${st.f},`);
  push(`  kind: '${st.kind}',`);
  push(`  totalHp: ${st.totalHp ?? st.hp},`);
  if (st.kind !== 'boss') {
    push(`  level: ${st.level},`);
    push(`  tags: [${(st.tags ?? []).map((t) => `'${t}'`).join(', ')}],`);
  }
  const mech = mechText(st.mechanics);
  if (mech) push(`  mechanics: ${mech},`);
  if (st.siteName && st.siteName !== st.name) push(`  siteName: '${st.siteName}',`);
  if (st.kind === 'boss') {
    push(`  halves: [`);
    for (const h of st.halves) {
      push(`    {`);
      push(`      half: '${h.half}',`);
      push(`      tags: [${h.tags.map((t) => `'${t}'`).join(', ')}],`);
      push(`      level: ${h.level},`);
      push(`      hp: ${h.hp},`);
      const hm = mechText(h.mechanics);
      if (hm) push(`      mechanics: ${hm},`);
      emitWaves(h.waves, 6);
      push(`    },`);
    }
    push(`  ],`);
    push(`  waves: [],`);
  } else {
    push(`  halves: [],`);
    emitWaves(st.waves, 2);
  }
  push(`};`);
  push('');
  return cname;
}

for (const pack of packs) {
  push(`/* ===== ${pack.id}：${pack.mode} 第 ${pack.period} 期「${pack.title}」（HardLevelGroup ${pack.difficultyGroup}） ===== */`);
  push('');
  for (const st of pack.stages) emitStage(pack, st);
}

/* --- 兼容旧表 --- */
const legacy = packs.find((p) => p.id === LEGACY_PACK);
push(`/** 兼容旧口径：物竞天择（moc-p44）12 关（新 UI 请用 STAGE_PACKS） */`);
push(`export const MONSTER_STAGES: StageDef[] = [`);
for (const st of legacy.stages.filter((s) => s.kind === 'boss')) {
  push(`  ${constName(legacy, st.index)},`);
}
push(`];`);
push('');
push(`/** 按关卡序号取旧表关卡（moc-p44） */`);
push(`export function monsterStage(index: number): StageDef | undefined {`);
push(`  return MONSTER_STAGES.find((s) => s.index === index);`);
push(`}`);
push('');

/* --- 关卡包表 --- */
push(`/** 全部关卡包（顺序 = 模式顺序：混沌 / 虚构 / 末日 / 仲裁） */`);
push(`export const STAGE_PACKS: StagePackDef[] = [`);
for (const pack of packs) {
  const exposed = pack.expose
    ? pack.stages.filter((s) => pack.expose.includes(s.index))
    : pack.stages.slice();
  push(`  {`);
  push(`    id: '${pack.id}',`);
  push(`    mode: '${pack.mode}',`);
  push(`    period: ${pack.period},`);
  push(`    title: '${pack.title}',`);
  push(`    p: ${pack.p},`);
  push(`    roundMode: '${pack.roundMode}',`);
  push(`    difficultyGroup: ${pack.difficultyGroup},`);
  push(`    modeMechanics: ${mechText(pack.modeMechanics) ?? '[]'},`);
  push(`    stages: [`);
  for (const st of exposed) push(`      ${constName(pack, st.index)},`);
  push(`    ],`);
  push(`  },`);
}
push(`];`);
push('');
push(`/** 按 id 取关卡包 */`);
push(`export function stagePack(id: string): StagePackDef | undefined {`);
push(`  return STAGE_PACKS.find((p) => p.id === id);`);
push(`}`);
push('');
push(`/** 按 包 id + 关卡序号取关卡 */`);
push(`export function packStage(packId: string, index: number): StageDef | undefined {`);
push(`  return stagePack(packId)?.stages.find((s) => s.index === index);`);
push(`}`);
push('');

/* --- 构建函数 --- */
push(`/** 关卡 → 段列表（boss = 上/下半；star/single = 单段） */`);
push(`export interface StageSection {`);
push(`  half?: '上半' | '下半';`);
push(`  level: number;`);
push(`  hp: number;`);
push(`  tags: Element[];`);
push(`  waves: StageWave[];`);
push(`}`);
push('');
push(`/** 取关卡的段列表 */`);
push(`export function stageSections(st: StageDef): StageSection[] {`);
push(`  if (st.kind === 'boss') return st.halves.map((h) => ({ half: h.half, level: h.level, hp: h.hp, tags: h.tags, waves: h.waves }));`);
push(`  return [{ level: st.level ?? 90, hp: st.totalHp, tags: st.tags ?? [], waves: st.waves }];`);
push(`}`);
push('');
push(`/** 关卡内单只怪的引擎配置（缺档案/缺乘区返回 undefined） */`);
push(`export function buildStageMonster(foe: StageFoe, level: number, group = 3): MonsterConfig | undefined {`);
push(`  const p = STAGE_MONSTERS[foe.monsterId];`);
push(`  const sc = stageScale(group, level);`);
push(`  if (!p || !sc) return undefined;`);
push(`  return {`);
push(`    name: p.name,`);
push(`    monsterId: foe.monsterId,`);
push(`    level,`);
push(`    hp: foe.hp,`);
push(`    attack: p.base.atk * p.child.atk * sc.atk,`);
push(`    speed: p.base.spd * p.child.spd * sc.spd,`);
push(`    maxToughness: p.base.stance * p.child.stance * sc.stance,`);
push(`    toughnessUiMax: (p.base.stance * p.child.stance * sc.stance) / ${TOUGHNESS_UI_SCALE},`);
push(`    enemyClass: p.enemyClass,`);
push(`    weaknesses: p.weaknesses,`);
push(`    resistance: p.resistance,`);
push(`    effectRes: p.base.statusRes + sc.statusResAdd,`);
push(`    effectHit: sc.statusHit,`);
push(`  };`);
push(`}`);
push('');
push(`/** 段波次 → 引擎波次配置（每波最多 3 只，对应 monster1/2/3 槽） */`);
push(`function buildWaves(sections: StageSection[], group: number, half?: '上半' | '下半'): MonsterConfig[][] {`);
push(`  const use = half ? sections.filter((s) => s.half === half) : sections;`);
push(`  const waves: MonsterConfig[][] = [];`);
push(`  for (const sec of use) {`);
push(`    for (const w of sec.waves) {`);
push(`      const cfgs: MonsterConfig[] = [];`);
push(`      for (const foe of w.foes) {`);
push(`        for (let i = 0; i < foe.count; i++) {`);
push(`          const cfg = buildStageMonster(foe, sec.level, group);`);
push(`          if (cfg) cfgs.push(cfg);`);
push(`        }`);
push(`      }`);
push(`      if (cfgs.length) waves.push(cfgs);`);
push(`    }`);
push(`  }`);
push(`  return waves;`);
push(`}`);
push('');
push(`/**`);
push(` * 关卡 → 引擎波次配置（每个波次最多 3 只，对应 monster1/2/3 槽）。`);
push(` *`);
push(` * half 缺省 = 上下半波次顺接（近似：游戏中上下半是两段独立战斗）；`);
push(` * 指定 '上半' / '下半' 则只取该半。`);
push(` */`);
push(`export function buildStageMonsterConfigs(`);
push(`  index: number,`);
push(`  half?: '上半' | '下半',`);
push(`): MonsterConfig[][] {`);
push(`  const st = monsterStage(index);`);
push(`  if (!st) return [];`);
push(`  return buildWaves(stageSections(st), ${legacy.difficultyGroup}, half);`);
push(`}`);
push('');
push(`/** 按 包 id + 关卡序号 → 引擎波次配置（half 只对 boss 关有意义） */`);
push(`export function buildPackStageWaves(`);
push(`  packId: string,`);
push(`  index: number,`);
push(`  half?: '上半' | '下半',`);
push(`): MonsterConfig[][] {`);
push(`  const pack = stagePack(packId);`);
push(`  const st = pack?.stages.find((s) => s.index === index);`);
push(`  if (!pack || !st) return [];`);
push(`  return buildWaves(stageSections(st), pack.difficultyGroup, half);`);
push(`}`);
push('');

fs.writeFileSync(OUT_FILE, L.join('\n'), 'utf8');
console.log(
  `已生成 ${path.relative(ROOT, OUT_FILE)}（${packs.length} 包 / ${packs.reduce((a, p) => a + p.stages.length, 0)} 关 / ${profiles.size} 种怪 / ${[...scalesByGroup.values()].reduce((a, t) => a + t.size, 0)} 个等级乘区）`,
);
