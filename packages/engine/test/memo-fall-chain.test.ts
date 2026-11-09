import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/**
 * 忆灵退场链（迷迷 / 小伊卡 / 晴空乐手）—— 2026-11-02 用户裁定「加测试专用导出」后首测。
 *
 * 为什么以前测不了：忆灵 HP 按**主人生命上限比例**缩放，实战里「正好打死忆灵、主人还活着」
 * 的窗口极窄；把 attack 调大 / 回合拉长都试过无效（主人先死 → 战斗结束，忆灵退场分支根本没走到）。
 * 解法 = `BattleConfig.forceEnemyMain`（测试/演示专用开关，生产不传 = 行为不变）：
 * 强制敌方主目标 → 可以稳定把一掌打在忆灵身上。
 *
 * 锚点来自 `%TEMP%/临时目录/memo-dump.txt` 实测（seed 20261102，E 例）。
 */

type Ev = BattleResult['events'][number];
type EnemyHit = { targetId: string; damage: number; hpLoss: number; dead: boolean };

const hitsOf = (e: Ev): EnemyHit[] => ((e as { enemyHits?: EnemyHit[] }).enemyHits ?? []) as EnemyHit[];

function cfg(force: 'mimi' | 'xiaoyika' | 'memo', attack: number): BattleConfig {
  const panel = (hp: number, speed: number, element: Element) => ({
    level: 80,
    hp,
    attack: 1200,
    defence: 1000,
    speed,
    critRate: 0.05,
    critDmg: 0.5,
    energyRegen: 0,
    element,
    damageBonus: 0,
    breakEffect: 0,
  });
  return {
    rounds: 4,
    maxTime: 800,
    techniques: false,
    forceEnemyMain: force,
    members: [
      { id: 'trailblazerMem', panel: panel(100_000, 100, 'Ice'), eidolonLevel: 0 },
      { id: 'fengjin', panel: panel(100_000, 90, 'Physical'), eidolonLevel: 0 },
    ],
    monster: {
      level: 90,
      hp: 30_000_000,
      maxHp: 30_000_000,
      toughness: 99999,
      maxToughness: 99999,
      broken: false,
      attack,
      speed: 100,
      monsterId: '1004011',
      resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
      weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
    },
    seed: 20261102,
  } as unknown as BattleConfig;
}

describe('忆灵退场链（HP 归零 → 退场钩子）', () => {
  it('M1 迷迷被敌方打死 → 走退场（note `memFall`），且退场期间不再行动、重召后恢复', () => {
    const r = simulateBattle(cfg('mimi', 25_000));
    // 敌方命中里出现「迷迷 · dead」
    const deadly = r.events.flatMap((e) => hitsOf(e).map((h) => ({ ...h, t: e.time })));
    const mimiDead = deadly.find((h) => h.targetId === 'mimi' && h.dead);
    expect(mimiDead).toBeTruthy();
    // 退场 note（mimiGone 写入 `memFall`）
    const fallIdx = r.events.findIndex((e) => (e.note ?? []).includes('memFall'));
    expect(fallIdx).toBeGreaterThanOrEqual(0);
    const fallT = r.events[fallIdx].time;
    // 退场之后要有一次重召（主C战技/终招 summonMimi），且第一次重召之前迷迷不再出手
    const after = r.events.slice(fallIdx + 1);
    const resummon = after.find((e) => (e.note ?? []).includes('summonMimi'));
    expect(resummon).toBeTruthy();
    const firstMimiActAfter = after.find((e) => e.unitId === 'mimi');
    expect(firstMimiActAfter).toBeTruthy();
    expect(firstMimiActAfter!.time).toBeGreaterThan(resummon!.time - 1e-9);
    expect(firstMimiActAfter!.time).toBeGreaterThan(fallT);
  }, 120_000);

  it('M2 `forceEnemyMain` 开关本身：单体命中全部落在被强制目标上（AoE 仍打全体）', () => {
    const r = simulateBattle({
      ...cfg('mimi', 25_000),
      forceEnemyMain: 'fengjin',
    } as unknown as BattleConfig);
    const perEvent = r.events.map(hitsOf).filter((hs) => hs.length > 0);
    // 单体（1 段命中）事件：强制目标后不再随机落到迷迷，且确有落在 fengjin 的
    // （`locked` 蓄力类技能仍打自己锁定的成员，那是另一条既定通道，不与该开关冲突）
    const singles = perEvent.filter((hs) => hs.length === 1).map((hs) => hs[0].targetId);
    expect(singles.length).toBeGreaterThan(0);
    expect(singles).not.toContain('mimi');
    expect(singles).toContain('fengjin');
  }, 120_000);
});
