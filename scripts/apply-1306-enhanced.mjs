/**
 * 花火 1306 加强版数据补丁（2026-10-10）。
 *
 * 背景：花火经过老角色加强，nanoka 4.6.51 静态 JSON 的基础 skills/ranks/skill_trees
 * 仍是旧版；新版完整数据（含全等级参数）已内置于同一文件的 enhanced 字段
 * （zh.enhanced['1'] / en.enhanced['1']，技能键=11306xx）。用户网页端截图已逐项
 * 核实 enhanced 即新版权威数据。
 *
 * 本脚本把 enhanced 版本覆写到基础字段（键维持 1306xx，引擎 gen-combat-raw 管线
 * 免改 id）：skills（desc+全等级 param_list）、ranks（desc+param_list）、
 * skill_trees（point06/07/08 + point09-18 status_add_list）。
 * sp_base/bp_need/bp_add/name/type/tag 等 gameplay 字段保持基础版原值（未变）。
 *
 * **重爬 data/characters/1306.json 会回退到旧版基础字段 → 重跑本脚本即可恢复**
 * （同 gen-effective-substats / gen-portrait-meta 惯例）。enhanced 字段本身保留不动。
 *
 * 用法：node scripts/apply-1306-enhanced.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join('data', 'characters', '1306.json');
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let changes = 0;

/** enhanced 技能键 11306xx → 基础键 1306xx */
const skillIdMap = {
  '1130601': '130601',
  '1130602': '130602',
  '1130603': '130603',
  '1130604': '130604',
  '1130607': '130607',
};
/** 行迹节点（06/07/08=大节点重做；09-18=属性小节点） */
const treeKeys = [
  'point06', 'point07', 'point08',
  'point09', 'point10', 'point11', 'point12', 'point13',
  'point14', 'point15', 'point16', 'point17', 'point18',
];
/** 星魂（E1/E2 文案与参数变；E3-E6 无变化也一并覆写保证一致） */
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

// 版本标注：本地数据仍是 4.6.51 抓取，但 1306 基础字段已手工打加强补丁
doc.meta = doc.meta ?? {};
doc.meta.patched = 'enhanced-buff-2026-10';
doc.meta.patchNote =
  '基础 skills/ranks/skill_trees 已用 enhanced[1]（老角色加强版）覆写；重爬本文件后需重跑 scripts/apply-1306-enhanced.mjs';

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n', 'utf8');
console.log(`apply-1306-enhanced: ${changes} field(s) updated`);
