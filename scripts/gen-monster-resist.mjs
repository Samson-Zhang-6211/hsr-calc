#!/usr/bin/env node
/**
 * 生成 packages/engine/src/combat/monster-resist-table.ts（虚构叙事效果抵抗表）。
 *
 * 数据源（本地文件，不联网）：
 * - data/monster-resist/pure-2027.json  虚构叙事第 27 期「取象为文」29 只怪
 *   （`resistance` = appfeng `dk` 分属性抗性；`debuffResist` = appfeng `fm` 效果抵抗）
 *
 * 口径（2026-10-23 用户裁定「效果抵抗全接」）：
 * - 表只覆盖本期出现的怪，其余怪仍走手写表 `monster-resist-data.ts`（未知怪 = 无抵抗）。
 * - 数值原样照抄 appfeng，不按弱点反推（弱点属性抗性 = 0，不出现在表里）。
 *
 * 用法：node scripts/gen-monster-resist.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data/monster-resist/pure-2027.json');
const OUT_FILE = path.join(ROOT, 'packages/engine/src/combat/monster-resist-table.ts');

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const ids = Object.keys(data.monsters).sort((a, b) => Number(a) - Number(b));

const inline = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

const L = [];
L.push('/**');
L.push(' * ⚠️ 生成物 —— 请勿手改。由 `node scripts/gen-monster-resist.mjs` 生成。');
L.push(' *');
L.push(` * 虚构叙事第 27 期「取象为文」怪物效果抵抗 / 分属性抗性表（${ids.length} 只）。`);
L.push(' *');
L.push(' * 数据源：`data/monster-resist/pure-2027.json`（appfeng 详情页 `fm` / `dk` 字段）。');
L.push(' * 引擎只消费本表里的值；未知怪 = 无抵抗（回落到 `monster-resist-data.ts` 的手写表）。');
L.push(' */');
L.push("import type { Element } from '@hsr-calc/shared';");
L.push("import type { MonsterDebuffResist } from './monster-resist-data.js';");
L.push('');
L.push('/** 一只怪的档案（名字 / 弱点 / 分属性抗性 / 效果抵抗） */');
L.push('export interface PureResistProfile {');
L.push('  name: string;');
L.push('  /** 弱点（只影响削韧；弱点属性抗性恒 0） */');
L.push('  weaknesses: Element[];');
L.push('  /** 分属性抗性（appfeng `dk`，未列属性 = 0） */');
L.push('  resistance: Partial<Record<Element, number>>;');
L.push('  /** 效果抵抗（appfeng `fm`，未列 = 无抵抗） */');
L.push('  debuffResist?: MonsterDebuffResist;');
L.push('}');
L.push('');
L.push('/** 本期出现的 29 只怪 */');
L.push('export const PURE_2027_MONSTERS: Record<string, PureResistProfile> = {');
for (const id of ids) {
  const m = data.monsters[id];
  L.push(`  '${id}': {`);
  L.push(`    name: ${JSON.stringify(m.name)},`);
  L.push(`    weaknesses: [${m.weaknesses.map((w) => `'${w}'`).join(', ')}],`);
  L.push(`    resistance: { ${inline(m.resistance)} },`);
  if (m.debuffResist) L.push(`    debuffResist: { ${inline(m.debuffResist)} },`);
  L.push('  },');
}
L.push('};');
L.push('');
L.push('/** 怪物 id → 分属性抗性（供 `MonsterConfig.elementResistance` 兜底） */');
L.push('export const MONSTER_ELEM_RESIST: Record<string, Partial<Record<Element, number>>> = {');
for (const id of ids) {
  const m = data.monsters[id];
  L.push(`  '${id}': { ${inline(m.resistance)} },`);
}
L.push('};');
L.push('');
L.push('/** 按怪物 id 取本期档案（未知 id = undefined） */');
L.push('export function pureStageMonsterResist(monsterId?: string): PureResistProfile | undefined {');
L.push('  if (!monsterId) return undefined;');
L.push('  return PURE_2027_MONSTERS[monsterId];');
L.push('}');
L.push('');

fs.writeFileSync(OUT_FILE, L.join('\n'), 'utf8');
console.log(`已生成 ${path.relative(ROOT, OUT_FILE)}（${ids.length} 只怪）`);
