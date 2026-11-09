import { describe, expect, it } from 'vitest';
import { ENEMY_SKILLS } from '@hsr-calc/engine';
import i18n from './i18n.js';

// ── 敌方技能名 i18n 覆盖（2026-10-30 第三十轮）──
// 关卡包新增技能表时最容易漏的一步是 i18n：明细表/事件表把 `monster.<skillId>` 渲染成技能名，
// 缺条目就退化显示成裸 id。本用例把「每张技能表的每个 skillId 都有中英条目」锁死，
// 并校验没有多余条目（改名/删表后的遗留）。
// 注：`i18n.ts` 只 default 导出实例，zh/en 在 resources 里，故从 `getResourceBundle` 取。

type Bundle = { enemySkills?: Record<string, string> };

const enemySkillNames = (lng: 'zh' | 'en'): Set<string> => {
  const bundle = i18n.getResourceBundle(lng, 'translation') as Bundle | undefined;
  return new Set(Object.keys(bundle?.enemySkills ?? {}));
};

describe('i18n · 敌方技能名覆盖', () => {
  it('每条 ENEMY_SKILLS 的 skillId 都有中英技能名', () => {
    const zhNames = enemySkillNames('zh');
    const enNames = enemySkillNames('en');
    expect(zhNames.size).toBeGreaterThan(0);
    const missingZh: string[] = [];
    const missingEn: string[] = [];
    for (const list of Object.values(ENEMY_SKILLS)) {
      for (const skill of list) {
        if (!zhNames.has(skill.skillId)) missingZh.push(skill.skillId);
        if (!enNames.has(skill.skillId)) missingEn.push(skill.skillId);
      }
    }
    expect(missingZh, `缺中文技能名: ${missingZh.join(', ')}`).toEqual([]);
    expect(missingEn, `缺英文技能名: ${missingEn.join(', ')}`).toEqual([]);
  });

  it('没有多余条目（每个 i18n 键都对应真实技能）', () => {
    const all = new Set<string>();
    for (const list of Object.values(ENEMY_SKILLS)) for (const s of list) all.add(s.skillId);
    // 非数字键是引擎侧 hit skillCode（`dot.shock` / `dominate.attack` 等），不在技能表内，跳过
    const extra = [...enemySkillNames('zh')]
      .filter((id) => /^\d+$/.test(id))
      .filter((id) => !all.has(id));
    expect(extra, `多余技能名: ${extra.join(', ')}`).toEqual([]);
  });
});
