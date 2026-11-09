import fs from 'node:fs';

/**
 * 生成 packages/engine/src/combat/lightcone-data.ts。
 *
 * 数据源：data/lightcones/index.json（全部 172 件）+ data/lightcones/{id}.json 的
 * `zh.refinements.level`（叠影 1~5 → param_list）与 `meta.path`（命途，供光锥命途校验）。
 * 一件不落：新增光锥只要重爬 data/ 后重跑本脚本即可，无需再改 IDS 清单（2026-10-29 改）。
 */

const header = `/**
 * 光锥叠影参数表 + 命途表（本地 data/lightcones 4.6.51 提取：refinements.level → param_list；
 * meta.path → 命途）。百分比参数为比值口径（0.18 = 18%），与伤害引擎一致。
 * 由 scripts/gen-lightcone-data.mjs 生成，勿手改；data 更新后重跑脚本。
 */

export interface LightconeSkill {
  name: string;
  skillName: string;
  desc: string;
  /** 命途（Rogue/Warlock/...；非对应命途角色装备时只有白值生效） */
  path: string;
  /** 叠影 1-5 → param_list（#1..#n 顺序） */
  levels: Record<string, number[]>;
}

export const LIGHTCONE_SKILLS: Record<string, LightconeSkill> = `;

const footer = `;

/** 取叠影参数（refinement clamp 1~5；未知光锥返回 null） */
export function lcParams(id: string, refinement: number): number[] | null {
  const lc = LIGHTCONE_SKILLS[id];
  if (!lc) return null;
  const r = Math.min(5, Math.max(1, Math.round(refinement)));
  return lc.levels[String(r)] ?? lc.levels['1'] ?? null;
}

/** 取光锥命途（未知光锥返回 undefined） */
export function lcPath(id: string): string | undefined {
  return LIGHTCONE_SKILLS[id]?.path;
}
`;

const index = JSON.parse(fs.readFileSync('data/lightcones/index.json', 'utf8').replace(/^\uFEFF/, ''));
const IDs = index.items.map((x) => x.id);

const data = {};
for (const id of IDs) {
  const raw = fs.readFileSync(`data/lightcones/${id}.json`, 'utf8').replace(/^\uFEFF/, '');
  const d = JSON.parse(raw);
  const r = d.zh.refinements;
  if (!r?.level) throw new Error(`${id} 无 refinements.level`);
  const path = d.meta?.path;
  if (!path) throw new Error(`${id} 无 meta.path`);
  data[id] = {
    name: d.zh.name,
    skillName: r.name,
    desc: r.desc,
    path,
    levels: Object.fromEntries(Object.entries(r.level).map(([lv, v]) => [lv, v.param_list])),
  };
}

let body = JSON.stringify(data, null, 2);
body = body.replace(/^(\s*)"(\w+)":/gm, '$1$2:');
body = body.replace(/"/g, "'");

fs.writeFileSync('packages/engine/src/combat/lightcone-data.ts', header + body + footer, 'utf8');
console.log(`written lightcone-data.ts (${IDs.length} lightcones)`);
