// Copyright (c) HSR Calc contributors. MIT License.
// 镜流 1212 加强版数据补丁（2026-10-25）。
// 背景：nanoka 4.6.53 的基础 skills/ranks/skill_trees 仍是旧版，
// 加强版完整数据内置于 zh.enhanced['1'] / en.enhanced['1']（技能键=11212xx）。
// 本脚本把 enhanced 覆写到基础字段（键维持 1212xx，gen-combat-raw 管线免改 id）。
// 用法：node scripts/apply-1212-enhanced.mjs
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join('data', 'characters', '1212.json');
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let changes = 0;

/** enhanced 技能键 11212xx → 基础键 1212xx */
const skillIdMap = {
  '1121201': '121201',
  '1121202': '121202',
  '1121203': '121203',
  '1121204': '121204',
  '1121206': '121206',
  '1121207': '121207',
  '1121209': '121209',
};

for (const lang of ['zh', 'en']) {
  const enhanced = doc[lang]?.enhanced?.['1'];
  if (!enhanced) throw new Error(`${lang}.enhanced['1'] missing`);

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

  for (const rk of ['1', '2', '3', '4', '5', '6']) {
    const src = enhanced.ranks?.[rk];
    const dst = doc[lang].ranks?.[rk];
    if (!src || !dst) throw new Error(`${lang} rank ${rk} missing`);
    if (dst.desc !== src.desc) changes += 1;
    dst.desc = src.desc;
    if (JSON.stringify(dst.param_list) !== JSON.stringify(src.param_list)) changes += 1;
    dst.param_list = src.param_list;
  }

  for (const tk of Object.keys(enhanced.skill_trees ?? {})) {
    const srcNode = enhanced.skill_trees[tk]?.['1'];
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

doc.meta = doc.meta ?? {};
doc.meta.patched = 'enhanced-buff-2026-10';
doc.meta.patchNote =
  '基础 skills/ranks/skill_trees 已用 enhanced[1]（老角色加强版）覆写；重爬本文件后需重跑 scripts/apply-1212-enhanced.mjs';

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`apply-1212-enhanced: ${changes} field(s) updated`);
