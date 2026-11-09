import { describe, expect, it } from 'vitest';
import { simulateBattleReplay, type BattleConfig, type CombatMember } from '../src/index.js';

/**
 * 银狼LV.999 1506「欢愉万相★全息幻象」（升格 150629）—— **2026-11-05 用户裁定**：
 *
 * > 「当啊哈为 E2 且与银狼Lv.999 同时加入编队」→ 升格 lv2；**啊哈未入队 = 没有升格效果**。
 *
 * 150629 param（`data/characters/1506.json` → `skills['150629'].level`）：
 * - lv1 `[360, 0.2, 0.4]`：#1 隐藏分溢出至 360（上限 60+360=**420**）
 * - lv2 `[999, 0.4, 0.4]`：#1 溢出至 999（上限 **1059**）、#2 好活→隐藏分 **40%**
 * - #3 暴伤 +40% 两级相同
 *
 * 引擎实现：`langzunShengGeLv()`（0 = 无升格 / 1 = 啊哈在队 / 2 = 啊哈 E2），
 * 门控三处：`langzunScoreCap()`、开战 #3 暴伤 buff（labelKey `lzShengGe`）、`addGoodWork` 的 #2 转化。
 *
 * dump 实锚（银狼 110 速 + 啊哈 / 木桩 90 级、`techniques:true`、12 回合）：
 * | 编队 | 秘技事件的隐藏分（energyAfter 映射） | `lzShengGe` 暴伤实例 |
 * | --- | --- | --- |
 * | 银狼单走 | **0**（无升格） | 无 |
 * | 银狼 + 啊哈 E0（lv1） | **4** | 0.4 |
 * | 银狼 + 啊哈 E2（lv2） | **8**（#2 20%→40%，恰×2） | 0.4 |
 *
 * ⚠ #1 的 420/1059 上限在本场景峰值仅 ~65 分，训练不出数值锚；上限由 param_list 单一来源驱动，
 *   已记入 `docs/AGENTS-clause-ledger.md` §六十二。
 */

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 110,
  attack: 2000,
  hp: 3000,
  defence: 800,
  element: 'Imaginary' as const,
  critRate: 0.5,
  critDmg: 1.0,
  elationDegree: 0,
  damageBonus: 0,
  breakEffect: 0,
  effectHit: 0,
  effectRes: 0,
  damageReduction: 0,
  energyRegen: 0,
  outgoingHealing: 0,
  elementDmg: { Imaginary: 0.3 },
  ...over,
});

const MON: BattleConfig['monster'] = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 300,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};

const lz = (): CombatMember => ({
  id: 'langzun',
  eidolonLevel: 0,
  panel: mkPanel(),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const aha = (eidolon: number): CombatMember => ({
  id: 'aha',
  eidolonLevel: eidolon,
  panel: mkPanel({ speed: 96 }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const cfg = (members: CombatMember[]): BattleConfig => ({
  members,
  monster: MON,
  techniques: true,
  rounds: 12,
  maxTime: 3000,
  seed: 20261009,
});

interface Scan {
  /** 首个事件（银狼秘技）的隐藏分（energyAfter 映射） */
  techScore: number;
  /** `lzShengGe`（暴伤 +40%）实例数量与数值 */
  sgInstances: number;
  sgValue: number;
  total: number;
}

const scan = (members: CombatMember[]): Scan => {
  const rep = simulateBattleReplay(cfg(members));
  const out: Scan = {
    techScore: Number(rep.result.events[0]?.energyAfter ?? 0),
    sgInstances: 0,
    sgValue: 0,
    total: rep.result.report.totalDamage,
  };
  for (const st of rep.steps) {
    const buffs = st.event.buffs as unknown as
      | Record<string, { labelKey?: string; value: number }[]>
      | undefined;
    for (const arr of Object.values(buffs ?? {})) {
      for (const inst of arr) {
        if (inst.labelKey !== 'lzShengGe') continue;
        out.sgInstances += 1;
        out.sgValue = inst.value;
      }
    }
  }
  return out;
};

describe('银狼 150629 升格门控（啊哈 E2 → lv2；啊哈不在队 → 无升格）', () => {
  it('啊哈不在队：完全没有升格效果（无暴伤实例、好活不转隐藏分）', () => {
    const s = scan([lz()]);
    expect(s.sgInstances).toBe(0);
    expect(s.techScore).toBe(0);
  }, 300_000);

  it('啊哈在队（E0）= lv1：暴伤 +40%、好活→隐藏分 20%', () => {
    const s = scan([lz(), aha(0)]);
    expect(s.sgInstances).toBeGreaterThan(0);
    expect(s.sgValue).toBeCloseTo(0.4, 10);
    expect(s.techScore).toBe(4);
  }, 300_000);

  it('啊哈 E2 = lv2：#2 转化翻倍（同场景 4 → 8），#3 暴伤仍 40%', () => {
    const lv1 = scan([lz(), aha(0)]);
    const lv2 = scan([lz(), aha(2)]);
    expect(lv2.sgValue).toBeCloseTo(0.4, 10);
    expect(lv2.techScore).toBeCloseTo(lv1.techScore * 2, 6);
    expect(lv2.techScore).toBe(8);
    // 升格确实改变输出（不是纯记录）
    expect(lv2.total).not.toBe(lv1.total);
    expect(lv1.total).not.toBe(scan([lz()]).total);
  }, 300_000);
});
