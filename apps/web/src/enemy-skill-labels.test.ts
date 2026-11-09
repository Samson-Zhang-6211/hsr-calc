import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import i18n from './i18n.js';
import { ENEMY_SKILLS } from '@hsr-calc/engine';

/**
 * 敌方技能名与官方文本对齐（2026-10-30 第四十九轮）。
 *
 * 背景：`i18n.enemySkills.<skillId>` 里的中文名是**手写**的，而官方技能名就在本地
 * `data/monsters/<id>.json` 的 `zh.child[*].skill_list[*].skill_name` 里。手写名一旦编错
 * （曾出现「噬咬」「弹幕糊脸」这类自造名，以及「残破容器共祭（留口）」把内部标记漏给用户），
 * 明细表显示的就是假技能名，且日后填倍率时没法按官方名反查。
 *
 * 本测试把「表里的每个 skillId 都有官方同名条目」锁死：
 * - 官方文本缺失的怪（8003060 虚构集合体）跳过；
 * - 官方确实没有名字的隐藏被动（402302005）白名单；
 * - 标签里禁止出现内部字眼（占位/留口/待核/TODO），那是给开发看的，不该出现在界面上。
 */

const INTERNAL_MARKS = ['占位', '留口', '待核', 'TODO'];

/** 官方 skill_list 里没有对应条目的技能（白名单 + 原因） */
const NO_OFFICIAL_NAME: Record<string, string> = {
  // 皂泡蛾的隐藏被动：官方 skill_list 只有 4 个「月相」技能，这条是 ParamList 待核的被动段
  '402302005': '官方 skill_list 无此条目的隐藏被动（ParamList 含义待核）',
};

interface MonsterJson {
  zh?: {
    child?: { skill_list?: { skill_name?: string | null; skill_desc?: string | null }[] }[];
  };
}

function officialNames(monsterId: string): Set<string> {
  const p = path.join(process.cwd(), '..', '..', 'data', 'monsters', `${monsterId}.json`);
  const names = new Set<string>();
  if (!fs.existsSync(p)) return names;
  const j = JSON.parse(fs.readFileSync(p, 'utf8')) as MonsterJson;
  for (const c of j.zh?.child ?? []) {
    for (const s of c.skill_list ?? []) if (s.skill_name) names.add(s.skill_name);
  }
  return names;
}

const zh = i18n.getResourceBundle('zh', 'translation').enemySkills as Record<string, string>;
const en = i18n.getResourceBundle('en', 'translation').enemySkills as Record<string, string>;

describe('敌方技能名 · 与官方文本对齐', () => {
  it('每个技能的 zh 标签都等于该怪的官方技能名（逐条列出不一致的）', () => {
    const wrong: string[] = [];
    const noText: string[] = [];
    for (const [mid, defs] of Object.entries(ENEMY_SKILLS)) {
      const off = officialNames(mid);
      if (off.size === 0) {
        noText.push(mid);
        continue;
      }
      for (const d of defs) {
        if (NO_OFFICIAL_NAME[d.skillId]) continue;
        const label = zh[d.skillId];
        if (!label) {
          wrong.push(`${mid}/${d.skillId} 缺标签`);
          continue;
        }
        if (!off.has(label)) wrong.push(`${mid}/${d.skillId} 标签「${label}」不在官方列表 [${[...off].join('/')}]`);
      }
    }
    expect(noText, `这些怪官方无技能文本（应只有 8003060）：${noText.join(',')}`).toEqual(['8003060']);
    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  it('标签不含内部字眼，且中英都有（英文侧不出现占位/留口/待核/TODO）', () => {
    const bad: string[] = [];
    for (const [mid, defs] of Object.entries(ENEMY_SKILLS)) {
      for (const d of defs) {
        const z = zh[d.skillId];
        const e = en[d.skillId];
        if (!z || !e) {
          bad.push(`${mid}/${d.skillId} 中英标签缺失`);
          continue;
        }
        for (const m of INTERNAL_MARKS) {
          if (z.includes(m)) bad.push(`${d.skillId} zh 含内部字眼「${m}」：${z}`);
          if (e.includes(m)) bad.push(`${d.skillId} en 含内部字眼「${m}」：${e}`);
        }
        if (z.trim() === '' || e.trim() === '') bad.push(`${mid}/${d.skillId} 标签为空`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('白名单只登记确实没有官方名的技能（防止白名单被滥用成「随便写」）', () => {
    for (const skillId of Object.keys(NO_OFFICIAL_NAME)) {
      const owner = Object.entries(ENEMY_SKILLS).find(([, defs]) => defs.some((d) => d.skillId === skillId));
      expect(owner, `${skillId} 白名单登记了但技能表里没有`).toBeTruthy();
      const off = officialNames(owner![0]);
      expect(off.size, `${owner![0]} 官方其实有技能文本，不该走白名单`).toBeGreaterThan(0);
      // 官方名里确实没有这条标签
      expect(off.has(zh[skillId]!), `${skillId} 其实和官方名一致，不需要白名单`).toBe(false);
    }
  });
});
