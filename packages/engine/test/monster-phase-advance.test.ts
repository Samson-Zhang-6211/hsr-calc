import { describe, expect, it } from 'vitest';
import {
  simulateBattleReplay,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 统一转阶段：掉血瞬间推进 + 转阶段清负面（2026-10-30 第二十七轮）──
// 之前的实现只在 BOSS 自己回合开头结算阶段，且不清负面；本轮改为：
//   · `checkVictory()`（每次伤害结算后都会调用）里扫描阶段推进 → note 经 `enemyPhaseNotes` 并入下一个事件；
//   · 进入新阶段时清空自身 DoT / 技能 DoT / 减益 buff / 状态层数（增益与被动保留）。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 4000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  } as MemberPanel;
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(150) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
];

const judge: MonsterConfig = {
  monsterId: '4064012',
  level: 95,
  hp: 600_000,
  attack: 800,
  speed: 144,
  maxToughness: 360,
  weaknesses: ['Physical', 'Fire', 'Thunder', 'Imaginary'],
  resistance: { Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
};

const run = () =>
  simulateBattleReplay({
    members: members(),
    monsters: [judge],
    techniques: false,
    rounds: 20,
    maxTime: 6000,
    roundMode: 'forgotten',
  });

describe('统一转阶段 · 掉血瞬间推进 + 清负面', () => {
  it('阶段在伤害结算后即可推进（不必等 BOSS 回合），note 落在随后的第一个事件上', () => {
    const { steps } = run();
    const i = steps.findIndex((s) => (s.event.note ?? []).includes('enemyPhaseUp'));
    expect(i).toBeGreaterThan(0);
    // 推进后 BOSS 韧性回满（360）
    expect(steps[i]!.status.monsters[0]!.toughness).toBeCloseTo(360, 6);
    // note 不会长时间悬空：最多 1 个事件之后即被并入
    const carried = steps.slice(Math.max(0, i - 1), i + 1).filter((s) => (s.event.note ?? []).includes('enemyPhaseUp'));
    expect(carried.length).toBe(1);
  });

  it('阶段只推进一次（2 阶段怪不会重复触发 enemyPhaseUp）', () => {
    const { steps } = run();
    const ups = steps.filter((s) => (s.event.note ?? []).includes('enemyPhaseUp'));
    expect(ups.length).toBe(1);
    // 推进后 BOSS 仍处于二阶段：后续事件不再重复写 note
    const after = steps.slice(steps.indexOf(ups[0]!) + 1);
    expect(after.some((s) => (s.event.note ?? []).includes('enemyPhaseUp'))).toBe(false);
  });
});
