// Copyright (c) HSR Calc contributors. MIT License.
// 流萤 1310 加强版数据补丁（2026-10-26）。
// 背景：nanoka 4.6.53 的基础 skills/ranks/skill_trees 仍是旧版，
// 加强版完整数据内置于 zh.enhanced['1'] / en.enhanced['1']（技能键=11310xx）。
// 本脚本把 enhanced 覆写到基础字段（键维持 1310xx，gen-combat-raw 管线免改 id）。
// 用法：node scripts/apply-1310-enhanced.mjs
//
// ⚠ 2026-11-02（4.6.54 核对）：nanoka 4.6.54 的**基础字段**里 ranks.2 / skill_trees.point06 / point07
//   与 `enhanced` 块不同（point06 变成「攻击无火弱点也能削韧55%」、point07 变成 200%/360%→35%/50%、
//   E2 变成「#2 回合后可再次触发」）。用户提供游戏内截图核对后确认：**截图口径 = enhanced 块 = 本补丁值**，
//   4.6.54 那套不是当前 live 版本（疑似 4.7 向内容）。故本补丁**继续覆写**这三项，不要为了让上游而放手。
//   核对记录：data/.incoming/4.6.54/diff.md 第五节。
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join('data', 'characters', '1310.json');
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let changes = 0;

/** enhanced 技能键 11310xx → 基础键 1310xx */
const skillIdMap = {
  '1131001': '131001',
  '1131002': '131002',
  '1131003': '131003',
  '1131004': '131004',
  '1131006': '131006',
  '1131007': '131007',
  '1131008': '131008',
  '1131009': '131009',
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
  '基础 skills/ranks/skill_trees 已用 enhanced[1]（老角色加强版）覆写；重爬本文件后需重跑 scripts/apply-1310-enhanced.mjs';

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`apply-1310-enhanced: ${changes} field(s) updated`);
