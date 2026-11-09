import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 千冶·刃 1507 行迹 point06「百炼骨」判据（2026-11-02 用户裁定 = **字面意思**）
 *
 * 原文（`data/characters/1507.json` → `zh.skill_trees.point06['1'].point_desc`，param `[0.75, 80]`）：
 * 「千冶•刃可积攒最多 #2=80 点溢出能量，**施放终结技后清空并恢复相应的能量值**。
 *   战斗开始时**或**结界解除时，若能量不足 #1=75% 则立刻恢复至 75%。
 *   当能量恢复至上限时解除自身所有负面效果。」
 *
 * 三条裁定：
 * ① 开大后能量 = 溢出量（溢出多少还多少，不是白丢、也不抵消耗）；
 * ② 75% 保底两个时点都生效（战斗开始 / 结界解除）；
 * ③ 每次「能量从不足→满」那一瞬清自身全部负面（不是常驻免控）。
 *
 * 锚点来自 `%TEMP%/临时目录/qianye-p06-dump.txt` 实测，勿纯推理改写。
 * 能量上限 `ENERGY_MAX.qianye = 160`，故 75% = 120、溢出上限 80。
 * 通用「开大回 5 点能量」会乘充能效率（A 例 5×1.2=6），所以开大后 = 通用回能 + 溢出量。
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

function soloConfig(energyRegen: number, rounds: number): BattleConfig {
  return {
    rounds,
    maxTime: 900,
    techniques: false,
    members: [
      {
        id: 'qianye',
        panel: {
          level: 80,
          hp: 8000,
          attack: 1200,
          defence: 1000,
          speed: 110,
          critRate: 0.05,
          critDmg: 0.5,
          energyRegen,
          element: 'Fire',
          damageBonus: 0,
          breakEffect: 0,
        },
        eidolonLevel: 0,
      },
    ],
    monster: { ...MON },
    seed: 20261102,
  } as unknown as BattleConfig;
}

type Step = { event: { note?: string[]; skillCode?: string; kind: string }; status: { energy: Record<string, number> } };

function steps(energyRegen: number, rounds: number): Step[] {
  return simulateBattleReplay(soloConfig(energyRegen, rounds)).steps as unknown as Step[];
}

describe('千冶 point06「百炼骨」（溢出能量 / 75% 保底 / 回满清负面）', () => {
  it('P1 开战能量 = 75% 保底（160×0.75=120），普攻 +20×1.2=+24 → 144', () => {
    const s = steps(0.2, 4);
    const firstBasic = s.find((x) => x.event.skillCode === 'qianye.basic')!;
    expect(firstBasic.status.energy.qianye).toBeCloseTo(144, 6);
  });

  it('P2 溢出能量不白丢：满 160 后多出的 8 点，开大后原数还回（6+8=14）', () => {
    const s = steps(0.2, 4);
    const basics = s.filter((x) => x.event.skillCode === 'qianye.basic');
    expect(basics[1].status.energy.qianye).toBeCloseTo(160, 6); // 144+24 到上限，余 8 进溢出池
    const ult = s.find((x) => x.event.skillCode === 'qianye.ult')!;
    // 6 = 通用「开大回 5 点能量」× 充能效率 1.2；8 = 溢出量
    expect(ult.status.energy.qianye).toBeCloseTo(14, 6);
    expect(ult.event.note).toContain('qyP06Restore');
  });

  it('P3 溢出池封顶 80：一次回能 200 时只溢 80，开大后 50+80=130（没封顶会是 160）', () => {
    const s = steps(9, 3);
    const ult = s.find((x) => x.event.skillCode === 'qianye.ult')!;
    // 充能效率 10 → 普攻 +200、通用开大回能 50；若溢出无上限则会被钳到 160
    expect(ult.status.energy.qianye).toBeCloseTo(130, 6);
    expect(ult.event.note).toContain('qyP06Restore');
  });

  it('P4 结界解除时能量不足 75% → 立刻补到 120（不是补 HP）', () => {
    const s = steps(0.2, 4);
    const floor = s.find((x) => (x.event.note ?? []).includes('qyP06Floor'))!;
    expect(floor).toBeTruthy();
    expect(floor.status.energy.qianye).toBeCloseTo(120, 6);
  });
});
