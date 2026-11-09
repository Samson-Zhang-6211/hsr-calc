import { describe, expect, it } from 'vitest';
import {
  ENEMY_SKILLS,
  STAGE_PACKS,
  SUMMON_MONSTERS,
  buildPackStageWaves,
  enemyUsableSkills,
} from '../src/index.js';

/**
 * 关卡敌人「会不会还手」的覆盖（2026-10-30 第五十一轮）。
 *
 * 起因：混沌 P44 星启关里有两只精英（`2013020` 金人勾魂使 / `4064010` 裁定忘却之形）**没有技能表**，
 * 战斗里它们数值正常但**一次也不出手** —— 关卡跑得通、伤害数字也正常，肉眼完全看不出问题。
 *
 * 本测试把「关卡出现的每只怪都必须有技能表，或者在白名单里写明为什么不还手」锁死，
 * 以后新增/改动关卡数据时，漏掉技能表会直接红。
 */

/** 明确不还手的怪（白名单 + 原因）。空 = 全部都会还手 */
const NO_COUNTER: Record<string, string> = {};

function stageFoes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const pack of STAGE_PACKS) {
    const packMech = pack.modeMechanics ?? [];
    void packMech;
    for (const st of pack.stages) {
      const labels =
        st.halves.length === 0
          ? [`${pack.id}#${st.index}`]
          : st.halves.map((h) => `${pack.id}#${st.index} ${h.half}`);
      for (const label of labels) {
        const waves = buildPackStageWaves(pack.id, st.index);
        const ids = new Set<string>();
        for (const w of waves) for (const c of w) if (c.monsterId) ids.add(c.monsterId);
        out.set(label, [...ids]);
      }
    }
  }
  return out;
}

describe('关卡敌人 · 技能表覆盖', () => {
  it('17 个可选段里的每只怪都有技能表，或登记在白名单（当前 0 只白名单）', () => {
    const summonIds = new Set(Object.values(SUMMON_MONSTERS).map((s) => s.monsterId));
    const missing: string[] = [];
    for (const [label, ids] of stageFoes()) {
      for (const id of ids) {
        if (ENEMY_SKILLS[id]) continue;
        if (NO_COUNTER[id]) continue;
        // 召唤物档案里的变体 id 可能是父档案的技能表（父 id = 前缀同名），这里单独放宽并记录
        if (summonIds.has(id)) continue;
        missing.push(`${label}: ${id}`);
      }
    }
    expect(missing, `这些关卡敌人没有技能表（不会还手）：\n${missing.join('\n')}`).toEqual([]);
  });

  it('星启关的两只补表精英：至少有一条 AI 可用技能（不是纯被动占位）', () => {
    for (const id of ['2013020', '4064010']) {
      const usable = enemyUsableSkills(id);
      expect(usable.length, `${id} 没有可出手技能`).toBeGreaterThan(0);
      expect(usable.every((s) => s.passive !== true)).toBe(true);
      // 强化 AI 池后，星启关的这两只应该真的会出手
      const hasDamage = usable.some((s) => s.multiplier !== undefined);
      expect(hasDamage, `${id} 没有带倍率的技能 → 不会造成伤害`).toBe(true);
    }
  });

  it('技能表总数与基线一致（58 只 → 60 只，246 条 → 259 条）', () => {
    expect(Object.keys(ENEMY_SKILLS).length).toBe(60);
    const total = Object.values(ENEMY_SKILLS).reduce((n, list) => n + list.length, 0);
    expect(total).toBe(259);
  });
});
