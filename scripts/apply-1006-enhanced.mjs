// Copyright (c) HSR Calc contributors. MIT License.
// 银狼 1006 加强版数据补丁（2026-10-18）。
// 背景：银狼经过老角色加强，nanoka 4.6.53 静态 JSON 的基础 skills/ranks/skill_trees
// 仍是旧版（终招单体/战技随机弱点/旧E2效果抵抗降低/DEF缺陷0.08）；
// 新版完整数据（含全等级参数）已内置于同一文件的 enhanced 字段
// （zh.enhanced['1'] / en.enhanced['1']，技能键=11006xx）。用户裁定以 enhanced 为准
// （同藿藿 1217 / 花火 1306 / 黑天鹅 1307 / 卡芙卡 1005 先例）。
// 加强内容：终结技改群体攻击；战技优先添加编队第一位角色属性弱点；
// 战斗开始和回合开始时恢复能量；天赋DEF缺陷0.08→0.12、概率72%→100%、
// 击杀后弱点转移；E2 改为「进战受到的伤害提高20% + 受击时银狼挂随机缺陷」。
// 本脚本把 enhanced 版本覆写到基础字段（键维持 1006xx，引擎 gen-combat-raw 管线免改 id）。
// **重爬 data/characters/1006.json 会回退到旧版基础字段 → 重跑本脚本即可恢复**。
// 用法：node scripts/apply-1006-enhanced.mjs
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join('data', 'characters', '1006.json');
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let changes = 0;

/** enhanced 技能键 11006xx → 基础键 1006xx */
const skillIdMap = {
  '1100601': '100601',
  '1100602': '100602',
  '1100603': '100603',
  '1100604': '100604',
  '1100606': '100606',
  '1100607': '100607',
};
/** 行迹节点（06=生成、07=注入、08=旁注；09-18=属性小节点，一并覆写保证一致） */
const treeKeys = [
  'point06', 'point07', 'point08',
  'point09', 'point10', 'point11', 'point12', 'point13',
  'point14', 'point15', 'point16', 'point17', 'point18',
];
/** 星魂（E2 语义改写；其余无变化也一并覆写保证一致） */
const rankKeys = ['1', '2', '3', '4', '5', '6'];

for (const lang of ['zh', 'en']) {
  const enhanced = doc[lang]?.enhanced?.['1'];
  if (!enhanced) throw new Error(`${lang}.enhanced['1'] missing`);

  // 1) skills：desc + 全等级 param_list
  for (const [eId, baseId] of Object.entries(skillIdMap)) {
    const src = enhanced.skills?.[eId];
    const dst = doc[lang].skills?.[baseId];
    if (!src) throw new Error(`${lang} enhanced skill ${eId} missing`);
    if (!dst) throw new Error(`${lang} base skill ${baseId} missing`);
    if (dst.desc !== src.desc) changes += 1;
    dst.desc = src.desc;
    if (src.level) {
      for (const [lv, info] of Object.entries(src.level)) {
        const cur = dst.level?.[lv];
        if (!cur) {
          dst.level ??= {};
          dst.level[lv] = { param_list: info.param_list };
          changes += 1;
          continue;
        }
        if (JSON.stringify(cur.param_list) !== JSON.stringify(info.param_list)) changes += 1;
        cur.param_list = info.param_list;
      }
    }
  }

  // 2) ranks：desc + param_list
  for (const rk of rankKeys) {
    const src = enhanced.ranks?.[rk];
    const dst = doc[lang].ranks?.[rk];
    if (!src || !dst) throw new Error(`${lang} rank ${rk} missing`);
    if (dst.desc !== src.desc) changes += 1;
    dst.desc = src.desc;
    if (JSON.stringify(dst.param_list) !== JSON.stringify(src.param_list)) changes += 1;
    dst.param_list = src.param_list;
  }

  // 3) skill_trees：desc + param_list + status_add_list（point01-05 无变化跳过）
  for (const tk of treeKeys) {
    const srcNode = enhanced.skill_trees?.[tk]?.['1'];
    const dstNode = doc[lang].skill_trees?.[tk]?.['1'];
    if (!srcNode || !dstNode) throw new Error(`${lang} tree ${tk} missing`);
    if ((dstNode.point_desc ?? null) !== (srcNode.point_desc ?? null)) changes += 1;
    dstNode.point_desc = srcNode.point_desc;
    if (JSON.stringify(dstNode.param_list) !== JSON.stringify(srcNode.param_list)) changes += 1;
    dstNode.param_list = srcNode.param_list;
    if (JSON.stringify(dstNode.status_add_list ?? []) !== JSON.stringify(srcNode.status_add_list ?? [])) {
      changes += 1;
    }
    dstNode.status_add_list = srcNode.status_add_list;
  }
}

// 版本标注：本地数据仍是 4.6.53 抓取，但 1006 基础字段已手工打加强补丁
doc.meta = doc.meta ?? {};
doc.meta.patched = 'enhanced-buff-2026-10';
doc.meta.patchNote =
  '基础 skills/ranks/skill_trees 已用 enhanced[1]（老角色加强版）覆写；重爬本文件后需重跑 scripts/apply-1006-enhanced.mjs';

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`apply-1006-enhanced: ${changes} field(s) updated`);
