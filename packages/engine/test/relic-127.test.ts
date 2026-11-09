import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 127「再创天地的救世主」4pc —— **泛化到任意装备者**（2026-11-02 round 63）
 *
 * 条款（`data/relicsets/127.json` → `require_num['4'].param_list = [0.24, 0.15]`）：
 * 装备者施放普攻/战技后，若**装备者的忆灵在场** → 装备者及其忆灵**生命上限 +24%**、
 * **我方全体造成的伤害 +15%**，持续至装备者下次普攻或战技。
 *
 * 改前：只有晴歌生效（`GEAR.qingge.saviorDamage`），且**只做了伤害半边**；
 * 「生命上限 +24%」全项目无人实现（`maxHpOf` 原本不吃任何百分比 buff）。
 *
 * 改后：
 * - 新增 `maxHpPct` 乘区 → `maxHpOf` = `base×(1+Σpct)+flat`；忆灵按各自上限公式乘入
 *   （晴空乐手/迷迷/死龙/小伊卡的公式不依赖主人上限 → 显式乘；长夜月派生自主人上限 → 不重复乘）；
 * - 通用刷新钩子 `relic127Refresh(wearer)` 挂主循环（`record` 之前、伤害结算之后）；
 * - 晴歌走 `DEFAULT_GEAR` 烘焙值（旧档语义不变），其余按 `relicFourOf(wearer) === '127'`。
 *
 * dump 实锚（3 回合、施法者 140 速 + 希儿、木桩 90 级）：
 * - 风堇：小伊卡 hpMax **4000 → 4960**（×1.24）；风堇自身战后 HP **8000 → 9920**（= 8000×1.24，
 *   面板上限被抬高后治疗/上限都按 `maxHpOf` 走）。
 * - 晴歌（未声明套装 id）：`savior`/`saviorHp` 双实例挂在晴歌 + 晴空乐手（旧档零回归）。
 * - 阿格莱雅：`yijiang` 只有 `savior`、没有 `saviorHp`（衣匠无 HP 建模）。
 * - 布洛妮娅（无忆灵）：0 实例。
 */

const mon = {
  level: 90,
  hp: 20_000_000,
  maxHp: 20_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: ['Ice', 'Quantum', 'Wind', 'Fire'] as Element[],
};

const card = (el: Element, speed: number) => ({
  level: 80,
  hp: 8000,
  attack: 1200,
  defence: 900,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: 0.6,
  element: el,
  damageBonus: 0,
  breakEffect: 0,
});

const cfg = (who: string, relic: string | undefined, rounds = 3): BattleConfig =>
  ({
    rounds,
    maxTime: 1400,
    techniques: false,
    members: [
      { id: who, panel: card('Quantum', 140), eidolonLevel: 0, relicsetId: relic },
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

interface Scan {
  /** 传导 `savior`（伤害 +15%）的持有者集合 */
  dmgUnits: Set<string>;
  /** 传导 `saviorHp`（生命上限 +24%）的持有者集合 */
  hpUnits: Set<string>;
  /** 任一事件里同持有者出现 >1 实例即为叠加（应为 0） */
  stackViolations: number;
  /** 观察到的事件内 savior 实例最大值（防「刷新变成 0.3」） */
  dmgValue: number;
  hpValue: number;
  saviorNotes: number;
  /** 首次登场时的忆灵 hpMax（按召唤物 id） */
  summonHpMax: Record<string, number>;
  /** 各成员最终 HP */
  finalHp: Record<string, number>;
}

const scan = (who: string, relic: string | undefined, rounds = 3): Scan => {
  const rep = simulateBattleReplay(cfg(who, relic, rounds));
  const out: Scan = {
    dmgUnits: new Set(),
    hpUnits: new Set(),
    stackViolations: 0,
    dmgValue: 0,
    hpValue: 0,
    saviorNotes: 0,
    summonHpMax: {},
    finalHp: {},
  };
  for (const st of rep.steps) {
    const ev = st.event;
    const buffs = ev.buffs as unknown as
      | Record<string, { labelKey?: string; value: number }[]>
      | undefined;
    for (const [unit, arr] of Object.entries(buffs ?? {})) {
      let dmg = 0;
      let hp = 0;
      for (const b of arr) {
        if (b.labelKey === 'savior') {
          dmg += 1;
          out.dmgUnits.add(unit);
          out.dmgValue = Math.max(out.dmgValue, b.value);
        }
        if (b.labelKey === 'saviorHp') {
          hp += 1;
          out.hpUnits.add(unit);
          out.hpValue = Math.max(out.hpValue, b.value);
        }
      }
      out.stackViolations += Math.max(0, dmg - 1) + Math.max(0, hp - 1);
    }
    if ((ev.note ?? []).includes('savior')) out.saviorNotes += 1;
    for (const s of st.status.summons) {
      if (s.present && s.hpMax) out.summonHpMax[s.id] = Math.max(out.summonHpMax[s.id] ?? 0, s.hpMax);
    }
    out.finalHp = Object.fromEntries(
      Object.entries(st.status.hp ?? {}).map(([k, v]) => [k, Math.round(v)]),
    );
  }
  return out;
};

describe('遗器 127 再创天地的救世主 4pc（泛化到任意装备者）', () => {
  it('风堇穿 127：忆灵在场 → 全体增伤 15% + 装备者/忆灵生命上限 24%', () => {
    const off = scan('fengjin', undefined);
    expect(off.dmgUnits.size).toBe(0);
    expect(off.hpUnits.size).toBe(0);
    expect(off.summonHpMax.xiaoyika).toBe(4000);

    const on = scan('fengjin', '127');
    // 伤害半边：全队（含忆灵）都挂 15%，仅一条实例（刷新不叠加）
    expect([...on.dmgUnits].sort()).toEqual(['fengjin', 'seele', 'xiaoyika']);
    expect(on.dmgValue).toBeCloseTo(0.15, 10);
    // 生命上限半边：只挂装备者与其忆灵，不给队友（seele 不在列表）
    expect([...on.hpUnits].sort()).toEqual(['fengjin', 'xiaoyika']);
    expect(on.hpValue).toBeCloseTo(0.24, 10);
    expect(on.stackViolations).toBe(0);
    expect(on.saviorNotes).toBeGreaterThan(0);
    // 忆灵上限：4000 × 1.24 = 4960
    expect(on.summonHpMax.xiaoyika).toBeCloseTo(4000 * 1.24, 6);
    // 成员上限确实参与结算：战后 HP 顶到 9920 = 8000×1.24（治疗量也按 maxHpOf 放大）
    expect(off.finalHp.fengjin).toBe(8000);
    expect(on.finalHp.fengjin).toBeGreaterThan(8000);
    expect(on.finalHp.fengjin).toBeCloseTo(8000 * 1.24, 6);
  }, 300_000);

  it('晴歌未声明套装 id（旧档默认装）：伤害+上限双实例照旧 —— 零回归', () => {
    const s = scan('qingge', undefined, 4);
    expect([...s.dmgUnits].sort()).toEqual(['memo', 'qingge', 'seele']);
    // 晴空乐手上限派生自晴歌（maxHpOf×70%）→ 只给装备者挂 maxHpPct，忆灵靠传导（否则 1.24²）
    expect([...s.hpUnits].sort()).toEqual(['qingge']);
    expect(s.dmgValue).toBeCloseTo(0.15, 10);
    expect(s.hpValue).toBeCloseTo(0.24, 10);
    expect(s.stackViolations).toBe(0);
    expect(s.saviorNotes).toBeGreaterThan(0);
    // 显式声明 127 与默认装等价（不双计）
    expect(scan('qingge', '127', 4).hpUnits.size).toBe(1);
  }, 300_000);

  it('无 HP 建模的忆灵（阿格莱雅·衣匠）只吃伤害半边', () => {
    const s = scan('aglaea', '127');
    expect(s.dmgUnits.has('yijiang')).toBe(true);
    expect(s.hpUnits.has('yijiang')).toBe(false);
    expect([...s.hpUnits]).toEqual(['aglaea']);
  }, 300_000);

  it('没有忆灵的佩戴者：条件不满足 → 0 实例', () => {
    const s = scan('bronya', '127');
    expect(s.dmgUnits.size).toBe(0);
    expect(s.hpUnits.size).toBe(0);
    expect(s.saviorNotes).toBe(0);
  }, 300_000);
});
