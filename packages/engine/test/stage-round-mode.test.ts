import { describe, expect, it } from 'vitest';
import {
  STAGE_PACKS,
  buildPackStageWaves,
  simulateBattle,
  type BattleResult,
  type CombatMember,
  type MemberPanel,
  type RoundMode,
} from '../src/index.js';

// ── 关卡包「模式 → 轮次模式」口径（2026-10-30 第五十三轮）──
// 轮次模式决定轮次边界的间隔（忘却首轮 150 / 仲裁 300 / 幻影无边界），
// **直接决定同一段时间里打出几个轮次**。数据写错的后果是「轮次数看起来对、边界其实是别人的」，
// 不报错也不红测 —— 只能把映射与边界数值一起锁死。
//
// 实测锚（arb-p10#5，怪物血量压到 500 万、12 轮上限、maxTime 20000）：
//   forgotten：边界 1@150 → 11@1150（每 +100）
//   arbiter  ：边界 1@300 → 11@1300（每 +100）
//   phantom  ：**无任何边界事件**，summary.rounds = 0
//
// 官方口径（裁定 47）：混沌/虚构 = 忘却式；末日 = 幻影；异相仲裁 = arbiter。

const EXPECTED: Record<string, RoundMode> = {
  moc: 'forgotten',
  pure: 'forgotten',
  apo: 'phantom',
  arb: 'arbiter',
};

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 400_000,
    attack: 5000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(160) },
  { id: 'feixiao', panel: panel(150) },
];

function run(roundMode: RoundMode): BattleResult {
  const wave = buildPackStageWaves('arb-p10', 5).map((w) =>
    w.map((c) => ({ ...c, hp: Math.min(c.hp, 5_000_000) })),
  );
  return simulateBattle({
    members: members(),
    monsterWaves: wave,
    techniques: false,
    rounds: 12,
    maxTime: 20_000,
    roundMode,
  });
}

describe('关卡包 · 模式与轮次模式', () => {
  it('每个包的 roundMode 与其模式一致（moc/pure=forgotten、apo=phantom、arb=arbiter）', () => {
    const wrong = STAGE_PACKS.filter((p) => p.roundMode !== EXPECTED[p.mode]).map(
      (p) => `${p.id}: mode=${p.mode} roundMode=${p.roundMode}（应为 ${EXPECTED[p.mode]}）`,
    );
    expect(wrong, wrong.join('\n')).toEqual([]);
    expect(STAGE_PACKS.length).toBe(5);
  });

  it('忘却式：首个轮次边界在 150，之后每 100 一个', () => {
    const bounds = run('forgotten').events.filter((e) => e.kind === 'round');
    expect(bounds.length).toBeGreaterThan(2);
    expect(bounds[0]!.time).toBeCloseTo(150, 5);
    expect(bounds[1]!.time).toBeCloseTo(250, 5);
    expect(bounds[1]!.time - bounds[0]!.time).toBeCloseTo(100, 5);
    expect(bounds.map((e) => e.round)).toEqual(bounds.map((_, i) => i + 1));
  });

  it('仲裁：首个轮次边界在 300（比忘却晚 150），之后同样每 100 一个', () => {
    const mine = run('arbiter').events.filter((e) => e.kind === 'round');
    const base = run('forgotten').events.filter((e) => e.kind === 'round');
    expect(mine[0]!.time).toBeCloseTo(300, 5);
    expect(mine[0]!.time - base[0]!.time).toBeCloseTo(150, 5);
    expect(mine[1]!.time - mine[0]!.time).toBeCloseTo(100, 5);
  });

  it('幻影（末日）：没有轮次边界，rounds 恒 0', () => {
    const r = run('phantom');
    expect(r.events.filter((e) => e.kind === 'round').length, '幻影不该有轮次边界事件').toBe(0);
    expect(r.summary.rounds).toBe(0);
  });
});
