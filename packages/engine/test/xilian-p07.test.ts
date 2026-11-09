import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 昔涟 1415 行迹 point07「岁月的旅人」（2026-11-02 用户给出黄金裔名单后落地）
 *
 * 原文：我方队伍中存在 1 名 / 2 名 / 3 名**除昔涟外**的<黄金裔>角色或「记忆」命途角色时，
 *       昔涟在战斗开始时获得 #1/#2/#3 = **2 / 3 / 6** 点【追忆】。
 *
 * 黄金裔名单（用户 2026-11-02 逐条给定，引擎侧 `GOLDEN_BLOOD_IDS`）：
 * 昔涟、缇宝、刻律德菈、长夜月、丹恒•腾荒、海瑟音、风堇、白厄、那刻夏、阿格莱雅、万敌、遐蝶、赛飞儿、开拓者•记忆。
 * 判定 =（队友 ∈ 黄金裔）∪（`CHAR_PATH` 为 `Memory`），且排除昔涟自己。
 *
 * dump 锚点（3 回合、无秘技、昔涟 250 速，`status.energy.xilian` 就是追忆的显示层）：
 * 0 名 = 3（开战基础）/ 海瑟音 = 5（+2）/ 海瑟音+白厄 = 6（+3）/ 三人 = 9（+6）/ 晴歌（记忆非黄金裔）= 5（+2）。
 */
const mon = {
  level: 90,
  hp: 5_000_000,
  maxHp: 5_000_000,
  maxToughness: 300,
  enemyClass: 'normal' as const,
  attack: 0,
  speed: 100,
  resistance: {} as Record<string, number>,
  weaknesses: ['Ice', 'Quantum', 'Wind'] as Element[],
};

const card = (el: Element, speed: number, hp = 6000) => ({
  level: 80,
  hp,
  attack: 1500,
  defence: 900,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: 0.6,
  element: el,
  damageBonus: 0,
  breakEffect: 0,
});

const mk = (others: string[]): BattleConfig =>
  ({
    rounds: 3,
    maxTime: 600,
    techniques: false,
    members: [
      { id: 'xilian', panel: card('Ice', 250, 9000), eidolonLevel: 0 },
      ...others.map((id, i) => ({ id, panel: card('Ice', 120 + i * 5), eidolonLevel: 0 })),
    ],
    monster: { ...mon },
    mainC: 'xilian',
    seed: 7,
  }) as unknown as BattleConfig;

const zhuiyiAtStart = (others: string[]): number => {
  const rep = simulateBattleReplay(mk(others));
  const st = rep.steps[0]?.status as unknown as { energy: Record<string, number> } | undefined;
  return st?.energy.xilian ?? -1;
};

describe('昔涟 point07 岁月的旅人', () => {
  it('黄金裔/记忆命途各 1/2/3 名 → 开战 +2/+3/+6 追忆', () => {
    const base = zhuiyiAtStart([]);
    expect(base).toBeGreaterThanOrEqual(0);
    expect(zhuiyiAtStart(['hysilens']) - base).toBe(2);
    expect(zhuiyiAtStart(['hysilens', 'phainon']) - base).toBe(3);
    expect(zhuiyiAtStart(['hysilens', 'phainon', 'mydei']) - base).toBe(6);
  }, 300_000);

  it('「记忆」命途也算（晴歌不是黄金裔）', () => {
    const base = zhuiyiAtStart([]);
    expect(zhuiyiAtStart(['qingge']) - base).toBe(2);
  }, 300_000);

  it('非黄金裔且非记忆命途的队友不计数', () => {
    const base = zhuiyiAtStart([]);
    expect(zhuiyiAtStart(['jingyuan']) - base).toBe(0);
    expect(zhuiyiAtStart(['kafka']) - base).toBe(0);
  }, 300_000);
});
