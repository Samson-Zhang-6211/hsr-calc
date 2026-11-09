import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { STAGE_PACKS } from '../src/index.js';

// ── 关卡段等级口径（2026-10-30 第五十四轮）──
// `StageHalf.level` / `StageDef.level` 进的是**防御区**：`(攻方lv+20) / ((攻方lv+20)+(守方lv+20)×…)`，
// 写错一个数字（95 写成 85）全段伤害整体偏移 ~5%，而且不报错、不红测 —— 只能拿游戏成长表校验。
//
// 本文件把两件事锁死：
// ① 每个段的 level **必须是该难度组（difficultyGroup）在 `data/monster-growth/HardLevelGroup.json`
//    里真实存在的等级**（不是手写时随手编的数）；
// ② 我方 80 级打这些等级的防御区系数单调（等级越高系数越小），并给出实测锚点。

const dataDir = path.join(process.cwd(), '..', '..', 'data');

interface GrowthRow {
  HardLevelGroup: number;
  Level: number;
  AttackRatio: number;
  DefenceRatio: number;
  HPRatio: number;
}

/** 某难度组的合法等级 → 该等级的增长行 */
function legalLevels(group: number): Map<number, GrowthRow> {
  const raw = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'monster-growth', 'HardLevelGroup.json'), 'utf8'),
  ) as Record<string, GrowthRow | GrowthRow[]>;
  const out = new Map<number, GrowthRow>();
  for (const v of Object.values(raw)) {
    for (const row of Array.isArray(v) ? v : [v]) {
      if (row.HardLevelGroup === group) out.set(row.Level, row);
    }
  }
  return out;
}

/** 防御区系数（不含减防/无视防御；我方 80 级） */
function defFactor(attackerLv: number, defenderLv: number): number {
  const a = attackerLv + 20;
  return a / (a + (defenderLv + 20));
}

/** 每个可选段的等级（boss 关按上下半取） */
function sectionLevels(): { label: string; group: number; level: number }[] {
  const out: { label: string; group: number; level: number }[] = [];
  for (const pack of STAGE_PACKS) {
    for (const st of pack.stages) {
      if (st.halves.length === 0) {
        // 单段关的等级挂在 StageDef 上（可选字段；缺失即视为数据错误，断言里会体现）
        if (st.level !== undefined) {
          out.push({ label: `${pack.id}#${st.index}`, group: pack.difficultyGroup, level: st.level });
        }
      } else {
        for (const h of st.halves) {
          out.push({ label: `${pack.id}#${st.index} ${h.half}`, group: pack.difficultyGroup, level: h.level });
        }
      }
    }
  }
  return out;
}

describe('关卡段 · 等级口径', () => {
  it('17 段的等级都存在于该难度组的游戏成长表里（手写值与 data/ 对齐）', () => {
    const bad: string[] = [];
    for (const s of sectionLevels()) {
      const legal = legalLevels(s.group);
      if (!legal.has(s.level)) {
        const nearest = [...legal.keys()].filter((l) => Math.abs(l - s.level) <= 10).sort((a, b) => a - b);
        bad.push(`${s.label}: level=${s.level} 不在 group=${s.group} 的合法等级里（附近有 ${nearest.join('/')}）`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
    expect(sectionLevels().length).toBe(11 + 6); // 5 段 arbitration/star 单段 + boss 关上下半
  });

  it('我方面板 80 级：等级越高防御区系数越小（实测锚点）', () => {
    // 锚点来自公示：(80+20) / ((80+20) + (lv+20))
    expect(defFactor(80, 85)).toBeCloseTo(100 / 205, 6);
    expect(defFactor(80, 90)).toBeCloseTo(100 / 210, 6);
    expect(defFactor(80, 95)).toBeCloseTo(100 / 215, 6);
    expect(defFactor(80, 100)).toBeCloseTo(100 / 220, 6);
    expect(defFactor(80, 120)).toBeCloseTo(100 / 240, 6);
    const asc = [85, 90, 95, 100, 120];
    for (let i = 1; i < asc.length; i += 1) {
      expect(defFactor(80, asc[i]!), `lv${asc[i]} 应低于 lv${asc[i - 1]}`).toBeLessThan(
        defFactor(80, asc[i - 1]!),
      );
    }
  });

  it('各包的等级落在合理区间（80~120），且混沌两期/虚构/末日各自统一', () => {
    const byLevel = new Map<string, Set<number>>();
    for (const s of sectionLevels()) {
      const packId = s.label.split('#')[0]!;
      const set = byLevel.get(packId) ?? new Set<number>();
      set.add(s.level);
      byLevel.set(packId, set);
    }
    // 混沌两期同等级、虚构/末日各自统一
    expect([...byLevel.get('moc-p43')!]).toEqual([95]);
    expect([...byLevel.get('moc-p44')!]).toEqual([95]);
    expect([...byLevel.get('pure-p27')!]).toEqual([85]);
    expect([...byLevel.get('apo-p21')!]).toEqual([90]);
    // 仲裁 5 关等级不同（100 / 120 / 95×3）
    expect([...byLevel.get('arb-p10')!].sort((a, b) => a - b)).toEqual([95, 100, 120]);
    for (const s of sectionLevels()) {
      expect(s.level, `${s.label} 等级越界`).toBeGreaterThanOrEqual(80);
      expect(s.level).toBeLessThanOrEqual(120);
    }
  });
});
