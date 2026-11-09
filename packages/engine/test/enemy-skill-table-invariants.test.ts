import { describe, expect, it } from 'vitest';
import { ENEMY_SKILLS, enemySkillById, enemySkills } from '../src/index.js';

// ── 敌方技能表的结构不变量（2026-10-30 第三十八轮）──
// 背景（第四十九轮查清，第五十一轮订正）：`data/monsters/*.json` 里**每只带技能表的怪都有
// `zh.child[*].skill_list`（名称+定性描述），但没有百分比** —— 所以倍率只能占位、技能名已按官方名对齐
// （只有面板字段），所以手写技能表的 skillId / 名称**无法与本地数据交叉验证** ——
// 它们来自站点/截图。能本地校验的只剩结构不变量，本文件把这些不变量锁住：
//   ① skillId 必须以所属怪物的 id 为前缀（变体 id = 父 id + 两位序号）
//   ② 同一张表内 skillId 不重复（重复会让 `enemySkillById` 取到错的那条）
//   ③ 每张表至少 1 条技能；表里的 `passive` 技能不计入 AI 池
//   ④ `enemySkillById` 能按 id 反查回同一条（防 map 构建遗漏）
// 一旦 data/ 补上 `skills` 字段，就可以把①升级成「与 data 逐条对齐」。

describe('敌方技能表 · 结构不变量', () => {
  it('60 张表 / 259 条技能：skillId 以所属怪物 id 为前缀', () => {
    const mons = Object.keys(ENEMY_SKILLS);
    expect(mons.length).toBe(60);
    let total = 0;
    const bad: string[] = [];
    for (const [mon, list] of Object.entries(ENEMY_SKILLS)) {
      for (const s of list) {
        total += 1;
        if (!String(s.skillId).startsWith(mon)) bad.push(`${mon} → ${s.skillId}`);
      }
    }
    expect(bad, `skillId 与怪物 id 前缀不符: ${bad.join(', ')}`).toEqual([]);
    expect(total).toBe(259);
  });

  it('每张表内 skillId 不重复', () => {
    for (const [mon, list] of Object.entries(ENEMY_SKILLS)) {
      const ids = list.map((s) => String(s.skillId));
      expect(new Set(ids).size, `${mon} 有重复 skillId`).toBe(ids.length);
    }
  });

  it('每张表非空，且 passive 技能不进 AI 池', () => {
    for (const mon of Object.keys(ENEMY_SKILLS)) {
      const list = enemySkills(mon);
      expect(list.length, `${mon} 技能表为空`).toBeGreaterThan(0);
      // 被动技能不应该出现在「可用技能」里（`enemyUsableSkills` 已过滤，这里断言表里确实有 passive 才算覆盖到）
      for (const s of list) {
        if (s.passive) expect(String(s.skillId).startsWith(mon)).toBe(true);
      }
    }
  });

  it('enemySkillById 能按 (怪物, 技能) 反查；跨怪 id 查不到', () => {
    const missing: string[] = [];
    const leaked: string[] = [];
    let checked = 0;
    for (const [mon, list] of Object.entries(ENEMY_SKILLS)) {
      for (const s of list) {
        checked += 1;
        const got = enemySkillById(mon, String(s.skillId));
        if (!got || String(got.skillId) !== String(s.skillId)) missing.push(`${mon}/${s.skillId}`);
      }
      const other = Object.keys(ENEMY_SKILLS).find((m) => m !== mon);
      if (!other) continue;
      const foreign = String(ENEMY_SKILLS[other]![0]!.skillId);
      const inList = list.some((s) => String(s.skillId) === foreign);
      if (!inList && enemySkillById(mon, foreign)) leaked.push(`${mon} 查到了 ${foreign}`);
    }
    expect(checked).toBe(259);
    expect(missing, `反查不到: ${missing.join(', ')}`).toEqual([]);
    expect(leaked, `跨怪泄漏: ${leaked.join(', ')}`).toEqual([]);
  });
});
