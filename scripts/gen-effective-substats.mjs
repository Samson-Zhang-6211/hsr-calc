// 把逐条批准的「有效词条」写进 data/characters/{id}.json 的 meta.effectiveSubstats
// 2026-10-08 用户 99 角色逐条批准（清单硬编码）；data 重爬会覆盖 meta → 重跑本脚本回填。
// 键 = data/relic-affixes/sub.json rarity5 的 12 个 property（本表只用其中 9 个，固定值生命/攻击/防御永不有效）。
import { readFileSync, writeFileSync } from 'node:fs';

const hp = 'HPAddedRatio';
const atk = 'AttackAddedRatio';
const def = 'DefenceAddedRatio';
const spd = 'SpeedDelta';
const cr = 'CriticalChanceBase';
const cd = 'CriticalDamageBase';
const ehr = 'StatusProbabilityBase';
const res = 'StatusResistanceBase';
const be = 'BreakDamageAddedRatioBase';

const VALID = new Set([
  'HPDelta', 'AttackDelta', 'DefenceDelta',
  'HPAddedRatio', 'AttackAddedRatio', 'DefenceAddedRatio',
  'SpeedDelta', 'CriticalChanceBase', 'CriticalDamageBase',
  'StatusProbabilityBase', 'StatusResistanceBase', 'BreakDamageAddedRatioBase',
]);

const EFF = {
  '1001': [def, spd, ehr],
  '1002': [cr, cd, atk, spd],
  '1003': [cr, cd, atk, spd],
  '1004': [cr, cd, atk, spd, ehr],
  '1005': [atk, spd, ehr],
  '1006': [ehr, spd, atk],
  '1008': [cr, cd, atk, spd],
  '1009': [atk, spd, ehr],
  '1013': [cr, cd, atk, spd],
  '1014': [cr, cd, atk, spd],
  '1015': [cr, cd, atk, spd],
  '1101': [cd, spd, res],
  '1102': [cr, cd, atk, spd],
  '1103': [atk, spd, be, ehr],
  '1104': [def, spd, ehr, res],
  '1105': [hp, spd, res],
  '1106': [ehr, spd, atk],
  '1107': [cr, cd, atk, spd],
  '1108': [atk, spd, be, ehr],
  '1109': [cr, cd, atk, spd],
  '1110': [hp, spd, res],
  '1111': [atk, spd, be, ehr],
  '1112': [cr, cd, atk, spd],
  '1201': [cr, cd, atk, spd],
  '1202': [atk, spd, res],
  '1203': [atk, spd, res],
  '1204': [cr, cd, atk, spd],
  '1205': [hp, cr, cd, spd],
  '1206': [cr, cd, atk, spd],
  '1207': [spd, res],
  '1208': [hp, spd, res],
  '1209': [cr, cd, atk, spd],
  '1210': [atk, spd, be, ehr],
  '1211': [hp, spd, res],
  '1212': [hp, cr, cd, spd],
  '1213': [cr, cd, atk, spd],
  '1214': [cr, cd, atk, be, spd],
  '1215': [spd, res],
  '1217': [hp, spd, res],
  '1218': [atk, spd, ehr],
  '1220': [cr, cd, atk, spd],
  '1221': [cr, cd, atk, spd],
  '1222': [atk, spd, res, be],
  '1223': [cr, cd, atk, spd],
  '1224': [cr, cd, atk, spd],
  '1225': [be, spd, ehr],
  '1301': [be, spd, atk],
  '1302': [cr, cd, atk, spd],
  '1303': [be, spd, res],
  '1304': [def, spd, res],
  '1305': [cr, cd, atk, spd],
  '1306': [cd, spd, res],
  '1307': [atk, spd, ehr],
  '1308': [cr, cd, atk, spd],
  '1309': [atk, spd, res],
  '1310': [atk, be, spd],
  '1312': [cr, cd, atk, spd],
  '1313': [spd, cd, res],
  '1314': [cr, cd, atk, spd],
  '1315': [be, spd, atk],
  '1317': [be, spd, atk],
  '1321': [be, spd, atk],
  '1401': [cr, cd, atk, spd],
  '1402': [atk, cr, cd, spd],
  '1403': [hp, cr, cd],
  '1404': [hp, cr, cd, spd],
  '1405': [cr, cd, atk, spd],
  '1406': [cr, cd, atk, spd, ehr],
  '1407': [hp, cr, cd],
  '1408': [cr, cd, atk, spd],
  '1409': [hp, spd, res, cd],
  '1410': [atk, spd, ehr],
  '1412': [atk, spd, res],
  '1413': [hp, cr, cd, spd],
  '1414': [atk, spd, res],
  '1415': [hp, cr, cd, spd],
  '1501': [cr, cd, spd, atk],
  '1502': [cr, cd, spd],
  '1503': [def, spd, res],
  '1504': [cr, cd, atk, spd],
  '1505': [cd, cr, spd],
  '1506': [cr, cd, spd, atk],
  '1507': [hp, cr, cd, spd],
  '1508': [cr, cd, atk, spd],
  '1509': [cr, cd, atk, spd],
  '1510': [cr, cd, atk, spd],
  '1511': [cr, cd, spd],
  '1512': [hp, cr, cd, spd],
  '1513': [cr, cd, spd, atk],
  '8001': [cr, cd, atk, spd],
  '8002': [cr, cd, atk, spd],
  '8003': [def, spd, res],
  '8004': [def, spd, res],
  '8005': [be, spd],
  '8006': [be, spd],
  '8007': [cd, atk, spd],
  '8008': [cd, atk, spd],
  '8009': [cr, cd, spd],
  '8010': [cr, cd, spd],
};

const ids = Object.keys(EFF);
if (ids.length !== 99) throw new Error(`清单应为 99 条，实际 ${ids.length}`);

let ok = 0;
const problems = [];
for (const [id, subs] of Object.entries(EFF)) {
  for (const s of subs) if (!VALID.has(s)) problems.push(`${id}: 非法键 ${s}`);
  const path = `data/characters/${id}.json`;
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    problems.push(`${id}: 数据文件缺失或损坏`);
    continue;
  }
  doc.meta = doc.meta ?? {};
  doc.meta.effectiveSubstats = subs;
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  ok++;
}
if (problems.length) throw new Error('问题：\n' + problems.join('\n'));
console.log(`有效词条写入完成：${ok}/99（meta.effectiveSubstats）`);
