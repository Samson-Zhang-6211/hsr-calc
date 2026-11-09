// 生成 apps/web/src/data/main-stats.ts（按技能倍率属性口径，2026-10 用户裁定）
// 甄别依据：data/characters/{id}.json zh.skills / zh.memosprite.skills 官方文本
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const ids = [...readFileSync('apps/web/src/data/character-roster.ts', 'utf8').matchAll(/"id": "(\d+)"/g)].map((m) => m[1]);

const hp = new Set(['1110', '1205', '1208', '1212', '1217', '1403', '1404', '1407', '1409', '1413', '1415', '1507', '1512']);
const def = new Set(['1001', '1104', '1304', '1503', '8003', '8004']);
const special = new Set(['1511']);

const dataFiles = new Set(readdirSync('data/characters').filter((f) => f.endsWith('.json')));
const missing = ids.filter((i) => !dataFiles.has(`${i}.json`));
if (missing.length) console.log('注意：无数据文件的 roster id：', missing.join(','));

const lines = ids.map((id) => {
  const kind = hp.has(id) ? 'hp' : def.has(id) ? 'def' : special.has(id) ? 'special' : 'atk';
  return `  '${id}': '${kind}',`;
});

const out = `// 主属性映射（按技能倍率属性口径，2026-10 用户裁定；勿随意手改，新角色上线时按官方技能文本核对补入）
// 口径：伤害技能以生命上限为倍率基数 → hp；护盾/伤害以防御力为基数 → def；其余 → atk；
//       special = 不吃常规三围的特殊机制（1511 星神★阿哈：欢愉伤害吃基础值/欢愉度/双暴，不吃攻击力）。
// 甄别来源：data/characters/{id}.json zh.skills / zh.memosprite.skills 官方文本扫描后逐句人工核对
//   （已剔除假阳性：阿兰/卢卡/翡翠/大黑塔/海瑟音伤害实为攻击力倍率、绯英防御力句为自我增益）。
export type MainStatKind = 'hp' | 'atk' | 'def' | 'special';

export const CHARACTER_MAIN_STATS: Record<string, MainStatKind> = {
${lines.join('\n')}
};

/** 按 rosterId 取主属性，未知角色默认 'atk' */
export function characterMainStat(rosterId: string | undefined): MainStatKind {
  return (rosterId && CHARACTER_MAIN_STATS[rosterId]) || 'atk';
}
`;

writeFileSync('apps/web/src/data/main-stats.ts', out);
console.log('生成完成，共', ids.length, '条；hp=' + hp.size, 'def=' + def.size, 'special=' + special.size, 'atk=' + (ids.length - hp.size - def.size - special.size));
