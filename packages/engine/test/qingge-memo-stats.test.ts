import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 晴歌 151204 天赋「晴空乐手」初始面板 —— 2026-11-05 用户裁定按原文实现：
 *
 * > 忆灵「晴空乐手」初始拥有等同于知更鸟•晴歌 **#1% 生命上限**的生命上限
 * > 和等同于知更鸟•晴歌 **#2% 速度**的速度。
 *
 * `data/characters/1512.json` → `151204.level['10'].param_list = [0.7, 1.8, ...]`
 *
 * 口径：
 * - **生命上限基数 = `maxHpOf('qingge')`（实时上限）**，不再取面板值 —— 主人身上的上限类加成
 *   （遗器127 生命上限 +24%、符玄鉴知、风堇雨过天晴…）全部传导，与长夜月忆灵同口径；
 *   忆灵本身不再单独吃 `maxHpPct`（否则 127 会变成 1.24²）。
 * - 速度 = 晴歌面板速 × 151204#2（=180%，数据实读，不再硬编码 1.8）；星魂4 另有气氛加成。
 *
 * dump 实锚（晴歌 140 速 / 8000 生命 + 希儿，木桩 90 级）：
 * - 默认装（晴歌默认带遗器127）→ 忆灵 hpMax **6944** = 8000×0.7×1.24、speed **252** = 140×1.8
 * - 显式声明别的四件套（102 快枪手）→ 忆灵 hpMax **5600** = 8000×0.7（127 不生效）
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
  weaknesses: ['Ice', 'Quantum'] as Element[],
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

const cfg = (relic: string | undefined): BattleConfig =>
  ({
    rounds: 3,
    maxTime: 1400,
    techniques: false,
    members: [
      { id: 'qingge', panel: card('Ice', 140), eidolonLevel: 0, relicsetId: relic },
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

/** 忆灵登场后的末次观测（hpMax/speed 均取「最近一次在场」的值） */
const memoStat = (relic: string | undefined) => {
  const rep = simulateBattleReplay(cfg(relic));
  let hpMax = 0;
  let speed = 0;
  let seen = false;
  for (const st of rep.steps) {
    for (const s of st.status.summons) {
      if (s.id !== 'memo' || !s.present) continue;
      if (s.hpMax) {
        hpMax = s.hpMax;
        seen = true;
      }
      if (s.speed) speed = s.speed;
    }
  }
  expect(seen, '忆灵未登场').toBe(true);
  return { hpMax, speed };
};

describe('晴歌 151204：晴空乐手初始 70% 生命上限 / 180% 速度', () => {
  it('默认装（遗器127）：上限 = 8000×0.7×1.24，速度 = 140×1.8', () => {
    const s = memoStat(undefined);
    expect(s.hpMax).toBeCloseTo(8000 * 0.7 * 1.24, 6); // 6944
    expect(s.speed).toBeCloseTo(140 * 1.8, 6); // 252
  }, 300_000);

  it('声明其它四件套（102）：127 不生效 → 上限 = 8000×0.7', () => {
    const s = memoStat('102');
    expect(s.hpMax).toBeCloseTo(8000 * 0.7, 6); // 5600
    expect(s.speed).toBeCloseTo(140 * 1.8, 6);
    // 与默认装之差恰为救世主4的 +24%（实时上限传导，不是忆灵自己再乘一遍）
    expect(memoStat(undefined).hpMax / s.hpMax).toBeCloseTo(1.24, 6);
  }, 300_000);
});
