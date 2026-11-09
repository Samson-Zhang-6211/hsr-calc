// 把逐条批准的「分配权重 + 爆率上限」写进 data/characters/{id}.json 的 meta
// 2026-10-08 用户 99 角色逐批批准（清单硬编码）；data 重爬会覆盖 meta → 重跑本脚本回填。
// 写入两字段：
//   meta.substatWeights  键=有效词条 property（data/relic-affixes/sub.json rarity5 命名），未列出的键=权重 1（缺省零回归）
//   meta.critRateTarget  面板爆率上限（仅写非默认 0.95 的 11 条，其余缺省 0.95）
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

// 模板（用户批准基线）
const DIRECT = { [cd]: 5, [cr]: 3, [atk]: 3, [spd]: 3 };              // 直伤：暴伤5/暴击3/攻击3/速度3
const HPDIRECT = { [hp]: 5, [cd]: 5, [cr]: 3, [spd]: 3 };              // 生命倍率直伤：生命5/暴伤5/暴击3/速度3
const BREAK = { [be]: 5, [spd]: 3, [atk]: 1 };                          // 击破：击破5/速度3/攻击1

const WT = {
  // 批1
  '1001': { [def]: 3, [spd]: 3, [ehr]: 1 },
  '1002': DIRECT,
  '1003': DIRECT,
  '1004': { [ehr]: 5, [spd]: 3, [cd]: 3, [cr]: 3, [atk]: 1 },
  '1005': { [spd]: 5, [atk]: 3, [ehr]: 1 },
  // 批2
  '1006': { [ehr]: 3, [spd]: 3, [atk]: 1 },
  '1008': DIRECT,
  '1009': { [spd]: 5, [atk]: 3, [ehr]: 1 },
  '1013': DIRECT,
  '1014': DIRECT,
  '1015': DIRECT,
  // 批3
  '1101': { [spd]: 5, [cd]: 5, [res]: 1 },
  '1102': DIRECT,
  '1103': { [spd]: 5, [atk]: 3, [ehr]: 1, [be]: 1 },
  '1104': { [def]: 5, [spd]: 3, [res]: 1, [ehr]: 1 },
  '1105': { [hp]: 5, [spd]: 3, [res]: 1 },
  '1106': { [ehr]: 3, [spd]: 3, [atk]: 1 },
  // 批4
  '1107': DIRECT,
  '1108': { [spd]: 5, [atk]: 3, [ehr]: 1, [be]: 1 },
  '1109': DIRECT,
  '1110': { [hp]: 5, [spd]: 3, [res]: 1 },
  '1111': { [spd]: 5, [atk]: 3, [ehr]: 1, [be]: 1 },
  '1112': DIRECT,
  // 批5
  '1201': DIRECT,
  '1202': { [spd]: 5, [atk]: 3, [res]: 1 },
  '1203': { [spd]: 5, [atk]: 5, [res]: 1 },
  '1204': DIRECT,
  '1205': HPDIRECT, // 爆率80%
  '1206': DIRECT,
  // 批6
  '1207': { [spd]: 5, [res]: 1 },
  '1208': { [hp]: 5, [spd]: 3, [res]: 1 },
  '1209': DIRECT, // 爆率0
  '1210': { [spd]: 5, [atk]: 3, [ehr]: 1, [be]: 1 },
  '1211': { [hp]: 5, [spd]: 3, [res]: 1 },
  '1212': HPDIRECT, // 爆率35%
  // 批7
  '1213': DIRECT,
  '1214': { [be]: 5, [spd]: 3, [cd]: 3, [cr]: 3, [atk]: 1 },
  '1215': { [spd]: 5, [res]: 1 },
  '1217': { [hp]: 5, [spd]: 3, [res]: 1 },
  '1218': { [ehr]: 3, [spd]: 3, [atk]: 1 },
  '1220': DIRECT,
  // 批8
  '1221': DIRECT,
  '1222': { [be]: 5, [atk]: 3, [spd]: 3, [res]: 1 },
  '1223': DIRECT,
  '1224': DIRECT,
  '1225': { [be]: 5, [spd]: 3, [ehr]: 3 },
  '1301': BREAK,
  // 批9
  '1302': DIRECT, // 爆率70%
  '1303': { [be]: 5, [spd]: 5, [res]: 1 },
  '1304': { [def]: 5, [spd]: 3, [res]: 1 },
  '1305': DIRECT, // 爆率80%
  '1306': { [cd]: 5, [spd]: 5, [res]: 1 },
  '1307': { [ehr]: 5, [spd]: 3, [atk]: 1 },
  // 批10
  '1308': DIRECT,
  '1309': { [spd]: 5, [atk]: 3, [res]: 1 },
  '1310': BREAK,
  '1312': DIRECT,
  '1313': { [spd]: 3, [cd]: 5, [res]: 1 },
  '1314': DIRECT,
  // 批11
  '1315': BREAK,
  '1317': BREAK,
  '1321': BREAK,
  '1401': DIRECT,
  '1402': DIRECT,
  '1403': { [hp]: 5, [cd]: 5, [cr]: 3 }, // 无速度
  // 批12
  '1404': HPDIRECT, // 爆率45%
  '1405': DIRECT,
  '1406': { [ehr]: 5, [spd]: 3, [cd]: 3, [cr]: 3, [atk]: 1 }, // 爆率40%
  '1407': { [hp]: 5, [cd]: 5, [cr]: 3 },
  '1408': DIRECT,
  '1409': { [spd]: 5, [hp]: 3, [cd]: 1, [res]: 1 },
  // 批13
  '1410': { [ehr]: 3, [spd]: 3, [atk]: 1 },
  '1412': { [spd]: 5, [atk]: 3, [res]: 1 },
  '1413': { [hp]: 3, [cd]: 5, [cr]: 3, [spd]: 3 }, // 爆率55%
  '1414': { [spd]: 5, [atk]: 5, [res]: 1 },
  '1415': { [spd]: 5, [cd]: 3, [hp]: 1 }, // 爆率35%；cr 无权重→缺省1
  '1501': DIRECT,
  // 批14
  '1502': { [spd]: 5, [cr]: 3, [cd]: 3 },
  '1503': { [def]: 5, [spd]: 5, [res]: 1 },
  '1504': DIRECT,
  '1505': { [cd]: 5, [cr]: 3, [spd]: 1 },
  '1506': { [cd]: 5, [cr]: 3, [spd]: 3, [atk]: 1 },
  '1507': HPDIRECT, // 爆率70%
  // 批15
  '1508': DIRECT,
  '1509': DIRECT,
  '1510': DIRECT,
  '1511': { [spd]: 5, [cd]: 5, [cr]: 3 },
  '1512': HPDIRECT, // 爆率45%
  '1513': { [cd]: 5, [cr]: 3, [spd]: 3, [atk]: 1 },
  // 批16
  '8001': DIRECT,
  '8002': DIRECT,
  '8003': { [def]: 5, [spd]: 3, [res]: 1 },
  '8004': { [def]: 5, [spd]: 3, [res]: 1 },
  '8005': { [be]: 5, [spd]: 5 },
  '8006': { [be]: 5, [spd]: 5 },
  // 批17
  '8007': { [cd]: 5, [atk]: 3, [spd]: 3 },
  '8008': { [cd]: 5, [atk]: 3, [spd]: 3 },
  '8009': { [cd]: 5, [cr]: 3, [spd]: 3 },
  '8010': { [cd]: 5, [cr]: 3, [spd]: 3 },
};

// 爆率上限非默认（仅 11 条；其余缺省 0.95 不写）
const CRIT = {
  '1209': 0,      // 彦卿 不需要爆率
  '1212': 0.35,   // 镜流
  '1415': 0.35,   // 昔涟
  '1406': 0.4,    // 赛飞儿
  '1404': 0.45,   // 万敌
  '1512': 0.45,   // 晴歌
  '1413': 0.55,   // 长夜月
  '1302': 0.7,    // 银枝
  '1507': 0.7,    // 千冶•刃
  '1205': 0.8,    // 刃
  '1305': 0.8,    // 真理医生
};

const ids = Object.keys(WT);
if (ids.length !== 99) throw new Error(`权重清单应为 99 条，实际 ${ids.length}`);
if (Object.keys(CRIT).length !== 11) throw new Error('爆率非默认应为 11 条');

// 与有效词条清单交叉校验：id 集必须一致、权重键必须属于该角色有效词条
const effSrc = readFileSync('scripts/gen-effective-substats.mjs', 'utf8');
const effIds = new Set([...effSrc.matchAll(/^ {2}'(\d+)': \[/gm)].map(m => m[1]));
if (effIds.size !== 99) throw new Error(`有效词条清单解析应为 99 条，实际 ${effIds.size}`);
for (const id of ids) {
  if (!effIds.has(id)) throw new Error(`${id}: 不在有效词条清单中`);
}
for (const id of Object.keys(CRIT)) {
  if (!WT[id]) throw new Error(`${id}: 爆率条目缺权重清单`);
}

let ok = 0;
const problems = [];
for (const [id, weights] of Object.entries(WT)) {
  for (const k of Object.keys(weights)) {
    if (!VALID.has(k)) problems.push(`${id}: 非法键 ${k}`);
    if (!(weights[k] === 1 || weights[k] === 3 || weights[k] === 5)) {
      problems.push(`${id}: 权重值应为 1/3/5，实际 ${k}=${weights[k]}`);
    }
  }
  const path = `data/characters/${id}.json`;
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    problems.push(`${id}: 数据文件缺失或损坏`);
    continue;
  }
  const eff = Array.isArray(doc.meta?.effectiveSubstats) ? doc.meta.effectiveSubstats : null;
  if (!eff) {
    problems.push(`${id}: 缺 meta.effectiveSubstats（先跑 gen-effective-substats.mjs）`);
    continue;
  }
  for (const k of Object.keys(weights)) {
    if (!eff.includes(k)) problems.push(`${id}: 权重键 ${k} 不在该角色有效词条内`);
  }
  doc.meta.substatWeights = { ...weights };
  if (CRIT[id] !== undefined) doc.meta.critRateTarget = CRIT[id];
  else delete doc.meta.critRateTarget; // 幂等：清掉历史残留，非默认才写
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  ok++;
}
if (problems.length) throw new Error('问题：\n' + problems.join('\n'));
console.log(`权重写入完成：${ok}/99（meta.substatWeights）+ 爆率上限 ${Object.keys(CRIT).length} 条（meta.critRateTarget）`);
