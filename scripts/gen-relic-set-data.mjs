import fs from 'node:fs';

/**
 * 遗器套装效果表（本地 data/relicsets 4.6.51 提取：zh.require_num.2/4）。
 * desc 保留原始参数化文本（含 <unbreak>#N[i]%</unbreak>），param_list 为比值口径（0.1=10%）。
 * 由 scripts/gen-relic-set-data.mjs 生成，勿手改；data 重爬后重跑本脚本。
 */

const header = `/**
 * 遗器套装效果表（本地 data/relicsets 4.6.51 提取：zh.require_num.2/4）。
 * desc 保留原始参数化文本（含 <unbreak>#N[i]%</unbreak>），param_list 为比值口径（0.1=10%）。
 * 由 scripts/gen-relic-set-data.mjs 生成，勿手改；data 重爬后重跑本脚本。
 */

export interface RelicSetEffect {
  id: string;
  name: string;
  /** 洞窟 4 件套（位面套为 null） */
  fourPiece: boolean;
  twoPiece?: { desc: string; params: number[] };
  fourPieceDesc?: string;
  fourPieceParams?: number[];
}

export const RELIC_SETS: Record<string, RelicSetEffect> = `;

const footer = `;

/** 取套装效果；未知 id 返回 null */
export function relicSetEffect(id: string | null | undefined): RelicSetEffect | null {
  if (!id) return null;
  return RELIC_SETS[id] ?? null;
}
`;

const ids = fs
  .readdirSync('data/relicsets')
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => f.replace(/\.json$/, ''))
  .sort((a, b) => Number(a) - Number(b));

const data = {};
for (const id of ids) {
  const raw = fs.readFileSync(`data/relicsets/${id}.json`, 'utf8').replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '');
  const d = JSON.parse(raw);
  const rn = d.zh?.require_num;
  if (!rn) throw new Error(`${id} 无 zh.require_num`);
  const two = rn['2'];
  const four = rn['4'];
  const entry = { id, name: d.zh.name, fourPiece: !!four };
  if (two) entry.twoPiece = { desc: two.desc, params: two.param_list };
  if (four) {
    entry.fourPieceDesc = four.desc;
    entry.fourPieceParams = four.param_list;
  }
  data[id] = entry;
}

let body = JSON.stringify(data, null, 2);
body = body.replace(/^(\s*)"(\w+)":/gm, '$1$2:');
body = body.replace(/"/g, "'");

fs.writeFileSync('packages/engine/src/combat/relic-set-data.ts', header + body + footer, 'utf8');
const n4 = Object.values(data).filter((v) => v.fourPiece).length;
console.log(`written relic-set-data.ts (${ids.length} sets, ${n4} with 4pc)`);
