import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, xiedieP06Take, type BattleConfig } from '../src/index.js';

/**
 * 遐蝶 1407 行迹 point06「收容的暗潮」判据（2026-11-02 口径定稿）
 *
 * 条款：除死龙外的我方目标受到治疗后，将**100%**治疗量转化为【新蕊】（死龙在场 → 死龙 HP）；
 *       单次行动期间**每个目标**累计不超过新蕊上限的 **12%**；行动结束重置累计。
 * 依据：`docs/HANDOFF-clause-ledger.md` §七（外部攻略查证：#1=100）+ §八（施工方案）。
 * 锚点：`%TEMP%/临时目录/xiedie-p06-dump.txt` 实测（风堇群奶 + 遐蝶，前 3 回合），勿纯推理改写。
 */

const MON = {
  level: 90,
  hp: 500_000_000,
  maxHp: 500_000_000,
  toughness: 99999,
  maxToughness: 99999,
  broken: false,
  attack: 0,
  speed: 100,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'imaginary'] as Element[],
};

/** 风堇（群奶，110 速）先手 + 遐蝶（95 速）；木桩攻击 0 → 我方掉血只来自遐蝶战技耗血 */
function baseConfig(): BattleConfig {
  return {
    rounds: 3,
    maxTime: 400,
    techniques: false,
    members: [
      {
        id: 'fengjin',
        panel: {
          level: 80,
          hp: 7000,
          attack: 1200,
          defence: 900,
          speed: 110,
          critRate: 0.05,
          critDmg: 0.5,
          energyRegen: 0,
          element: 'Wind',
          damageBonus: 0,
          breakEffect: 0,
        },
        eidolonLevel: 0,
      },
      {
        id: 'xiedie',
        panel: {
          level: 80,
          hp: 8000,
          attack: 2000,
          defence: 1000,
          speed: 95,
          critRate: 0.05,
          critDmg: 0.5,
          energyRegen: 0,
          element: 'Ice',
          damageBonus: 0,
          breakEffect: 0,
        },
        eidolonLevel: 0,
      },
    ],
    monster: { ...MON },
    seed: 20261011,
  } as BattleConfig;
}

/** 新蕊上限 = 我方等级和 ×100（2026-10 裁定）→ 2×80 级 = 16000，12% = 1920 */
const XINRUI_CAP = (80 + 80) * 100;
const P06_CAP = XINRUI_CAP * 0.12;

/** P4 用：符玄（会开大触发 point07 群奶，直写 memberHp）+ 遐蝶；木桩会反击以便双方掉血 */
function fuxuanConfig(): BattleConfig {
  return {
    rounds: 5,
    maxTime: 600,
    techniques: false,
    members: [
      {
        id: 'xiedie',
        panel: {
          level: 80,
          hp: 8000,
          attack: 2000,
          defence: 1000,
          speed: 95,
          critRate: 0.05,
          critDmg: 0.5,
          energyRegen: 0,
          element: 'Ice',
          damageBonus: 0,
          breakEffect: 0,
        },
        eidolonLevel: 0,
      },
      {
        id: 'fuxuan',
        panel: {
          level: 80,
          hp: 9000,
          attack: 1000,
          defence: 1200,
          speed: 105,
          critRate: 0.05,
          critDmg: 0.5,
          energyRegen: 0,
          element: 'Quantum',
          damageBonus: 0,
          breakEffect: 0,
        },
        eidolonLevel: 0,
      },
    ],
    monster: {
      ...MON,
      maxToughness: 9999,
      enemyClass: 'elite',
      attack: 600,
      speed: 120,
      resistance: {},
      monsterId: '1004011',
    },
    seed: 20261011,
  } as unknown as BattleConfig;
}

describe('遐蝶 point06「收容的暗潮」（治疗→新蕊，100% / 每目标 ≤12%）', () => {
  it('P1 转化率 = 100%（旧常量 0.01 是错值，此例即红线）', () => {
    expect(xiedieP06Take(1200, P06_CAP, 1)).toBe(1200);
    expect(xiedieP06Take(1200, P06_CAP, 0.01)).toBe(12);
    expect(xiedieP06Take(0, P06_CAP, 1)).toBe(0);
    expect(xiedieP06Take(-5, P06_CAP, 1)).toBe(0);
  });

  it('P2 单目标单次行动封顶 12%：超额截断，剩余额度递减', () => {
    expect(xiedieP06Take(5000, P06_CAP, 1)).toBeCloseTo(1920, 6);
    expect(xiedieP06Take(1500, P06_CAP - 1000, 1)).toBeCloseTo(920, 6); // 剩余额度 920 先耗尽
    expect(xiedieP06Take(5000, 0, 1)).toBe(0);
  });

  it('P3 12% 是「每个目标」而不是「每次行动」：一次群奶两目标可各拿 12%', () => {
    const got = xiedieP06Take(9000, P06_CAP, 1) + xiedieP06Take(9000, P06_CAP, 1);
    expect(got).toBeCloseTo(3840, 6);
  });

  it('I 战斗内前 3 回合：群奶后新蕊增量 = 各目标实际入账治疗量之和', () => {
    const rep = simulateBattleReplay(baseConfig());
    type HP = Record<string, number>;
    const hpOf = (s: unknown): HP => (s as { hp: HP }).hp;
    const energyOf = (s: unknown): number =>
      ((s as { energy: Record<string, number> }).energy.xiedie ?? 0) as number;

    let prevHp: HP = {};
    let prevEnergy = 0;
    const healWindows: { time: number; gain: number; energyDelta: number }[] = [];
    const xiedieSkillEnergy: number[] = [];
    let ultNote: string[] = [];

    for (const st of rep.steps) {
      const hp = hpOf(st.status);
      const energy = energyOf(st.status);
      const keys = Object.keys(hp);
      const gains = keys.reduce((s, k) => s + Math.max(0, hp[k] - (prevHp[k] ?? hp[k])), 0);
      const loss = keys.reduce((s, k) => s + Math.min(0, hp[k] - (prevHp[k] ?? hp[k])), 0);
      // 只挑「纯治疗窗口」：本步无掉血、新蕊有增量、且未顶到上限（顶上限是池封顶，另一回事）
      if (energy > prevEnergy && loss === 0 && energy < XINRUI_CAP) {
        healWindows.push({ time: st.event.time, gain: gains, energyDelta: energy - prevEnergy });
      }
      if (st.event.skillCode === 'xiedie.skill') xiedieSkillEnergy.push(energy);
      if (st.event.skillCode === 'xiedie.ult') ultNote = st.event.note ?? [];
      prevHp = hp;
      prevEnergy = energy;
    }

    // 前 3 回合里两次群奶（t=181.82 / 272.73）都落在纯治疗窗口
    expect(healWindows.map((w) => Math.round(w.time))).toEqual([182, 273]);
    // 核心判据：新蕊增量 == 实际入账治疗量总和（含忆灵小伊卡 → 100% 转化，无折损）
    expect(healWindows[0].gain).toBeCloseTo(936 + 936 + 140, 6);
    expect(healWindows[0].energyDelta).toBeCloseTo(healWindows[0].gain, 6);
    expect(healWindows[1].gain).toBeCloseTo(1170 + 1170 + 140, 6);
    expect(healWindows[1].energyDelta).toBeCloseTo(healWindows[1].gain, 6);
    // 两次窗口每个目标都远低于 12% 额度 → 未被截断（截断口径由 P2/P3 单测覆盖）
    expect(healWindows[0].gain).toBeLessThan(P06_CAP * 3);

    // 新蕊链（dump 实测）：0 → 5142（战技耗血）→ 7154 → 11860.7 → 14340.7 → 16000 封顶 → 开大归 0
    expect(xiedieSkillEnergy).toHaveLength(3);
    expect(xiedieSkillEnergy[0]).toBe(5142);
    expect(xiedieSkillEnergy[1]).toBeCloseTo(11860.7, 6);
    expect(xiedieSkillEnergy[2]).toBeCloseTo(XINRUI_CAP, 6);
    // 满新蕊 → 自动开大召死龙（新蕊清零）
    expect(ultNote).toContain('xiedieSummon');
    expect(rep.result.finalState.energy.xiedie).toBe(0);
  }, 120_000);

  it('P4 绕过 healUnit 的直接回血同样转化（符玄 point07 终结技群奶）', () => {
    // 2026-11-02 round 31：`p06DirectHeal` 已挂到 14 处直写 memberHp 的回血点；
    // 本例取「符玄 point07：施放终结技时为其他我方目标回复 符玄生命上限×5%+133」——
    // 该路径不经过 healUnit（直写 memberHp），旧实现下新蕊完全不涨。
    const rep = simulateBattleReplay(fuxuanConfig());
    type St = { hp: Record<string, number>; energy: Record<string, number> };
    let prevXin = 0;
    let prevHp = 0;
    let win: { dXin: number; dHp: number } | undefined;
    for (const st of rep.steps) {
      const s = st.status as unknown as St;
      const xin = s.energy.xiedie ?? 0;
      const hp = s.hp.xiedie ?? 0;
      // 取**首个** fxP07 窗口：符玄后续还会再开大，那时遐蝶可能已满血（差值 0）
      if (win === undefined && (st.event.note ?? []).includes('fxP07')) {
        win = { dXin: xin - prevXin, dHp: hp - prevHp };
      }
      prevXin = xin;
      prevHp = hp;
    }
    expect(win).toBeDefined();
    expect(win!.dHp).toBeCloseTo(610, 6); // dump 实测：符玄 panel.hp 9000 → 9000×5%+133 = 583，实读 610（含面板生命加成）
    expect(win!.dXin).toBeCloseTo(win!.dHp, 6); // 100% 转化，与 healUnit 通道同口径
  }, 120_000);
});
