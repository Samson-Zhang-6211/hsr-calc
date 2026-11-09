import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  simulateBattleReplay,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 关卡机制【记忆紊流】尾句（2026-10-30 第二十五轮）──
// 文案：每个轮次开始时，编队第一位角色以「固定计入 20 笑点」释放【极乐漩涡】，
// 且随后追加一次「阿哈额外回合」。
// 本实现：每轮 `stage.miasma` 事件之后置 `miasmaAhaPending` → 主循环下一迭代跑一次
// 完整阿哈时刻（`fixedLaughRound = 20`，note `stageMiasmaAha`）。
// 实测锚点（dump 定锚）：每轮 1 次 `stageMiasma` + 1 次 `stageMiasmaAha`，3 轮共 3 对。

function panel(speed: number, elationDegree = 0): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 3000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
    elationDegree,
  } as MemberPanel;
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(160, 0.5) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
];

const boss: MonsterConfig = {
  monsterId: '5013010',
  level: 95,
  hp: 3_000_000,
  attack: 800,
  speed: 120,
  maxToughness: 960,
  weaknesses: ['Fire', 'Quantum', 'Imaginary'],
  resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
};

const run = (mechanics?: string[]) =>
  simulateBattleReplay({
    members: members(),
    monsters: [boss],
    techniques: false,
    rounds: 4,
    maxTime: 2000,
    roundMode: 'forgotten',
    ...(mechanics ? { mechanics } : {}),
  });

describe('关卡机制 · 记忆紊流', () => {
  it('每轮：极乐漩涡 + 阿哈额外回合（note stageMiasmaAha）', () => {
    const { steps } = run(['miasma']);
    const vortex = steps.filter((s) => s.event.skillCode === 'stage.miasma');
    const extra = steps.filter((s) => (s.event.note ?? []).includes('stageMiasmaAha'));
    expect(vortex.length).toBe(3);
    expect(extra.length).toBe(vortex.length);
    // 阿哈额外回合都发生在极乐漩涡之后
    for (const e of extra) {
      const i = steps.indexOf(e);
      const before = steps.slice(0, i).filter((s) => s.event.skillCode === 'stage.miasma');
      expect(before.length).toBeGreaterThan(0);
      expect(e.event.action).toBe('ahaMoment');
      expect(e.event.skillCode).toBe('aha.moment');
    }
  });

  it('不带该机制时不产生记忆紊流事件', () => {
    const r = simulateBattle({
      members: members(),
      monsters: [boss],
      techniques: false,
      rounds: 4,
      maxTime: 2000,
      roundMode: 'forgotten',
    });
    expect(r.events.some((e) => e.skillCode === 'stage.miasma')).toBe(false);
    expect(r.events.some((e) => (e.note ?? []).includes('stageMiasmaAha'))).toBe(false);
  });
});
