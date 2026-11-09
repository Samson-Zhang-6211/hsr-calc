// Copyright (c) HSR Calc contributors. MIT License.
// 卡芙卡 1005 加强版数据补丁（2026-10-18）。
// 背景：卡芙卡经过老角色加强，nanoka 4.6.53 静态 JSON 的基础 skills/ranks/skill_trees
// 仍是旧版（战技仅主目标引爆/终招仅触电引爆100%/天赋仅普攻每回合1次）；
// 新版完整数据（含全等级参数）已内置于同一文件的 enhanced 字段
// （zh.enhanced['1'] / en.enhanced['1']，技能键=11005xx）。用户已按游戏内截图
// 逐条核对并裁定以 enhanced/截图为准（同藿藿 1217 / 花火 1306 / 黑天鹅 1307 先例）。
// 本脚本把 enhanced 版本覆写到基础字段（键维持 1005xx，引擎 gen-combat-raw 管线
// 免改 id）：skills（desc+全等级 param_list）、ranks（desc+param_list）、
// skill_trees（point06=折磨/point08=荆棘 + point09-18 属性小节点）。
// **重爬 data/characters/1005.json 会回退到旧版基础字段 → 重跑本脚本即可恢复**
// （同 gen-effective-substats / gen-portrait-meta 惯例）。enhanced 字段本身保留不动。
// 用法：node scripts/apply-1005-enhanced.mjs
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join('data', 'characters', '1005.json');
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let changes = 0;

/** enhanced 技能键 11005xx → 基础键 1005xx */
const skillIdMap = {
  '1100501': '100501',
  '1100502': '100502',
  '1100503': '100503',
  '1100504': '100504',
  '1100506': '100506',
  '1100507': '100507',
};
/** 行迹节点（06=折磨、08=荆棘；09-18=属性小节点，一并覆写保证一致） */
const treeKeys = [
  'point06', 'point07', 'point08',
  'point09', 'point10', 'point11', 'point12', 'point13',
  'point14', 'point15', 'point16', 'point17', 'point18',
];
/** 星魂（E1 文案变、E2 参数 0.25→0.33；E3/E5 无变化也一并覆写保证一致） */
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

// 版本标注：本地数据仍是 4.6.53 抓取，但 1005 基础字段已手工打加强补丁
doc.meta = doc.meta ?? {};
doc.meta.patched = 'enhanced-buff-2026-10';
doc.meta.patchNote =
  '基础 skills/ranks/skill_trees 已用 enhanced[1]（老角色加强版）覆写；重爬本文件后需重跑 scripts/apply-1005-enhanced.mjs';

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`apply-1005-enhanced: ${changes} field(s) updated`);
