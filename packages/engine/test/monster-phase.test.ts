import { describe, expect, it } from 'vitest';
import {
  monsterPhaseCount,
  pkSubSummon,
  enemySkills,
  simulateBattleReplay,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 统一转阶段状态机（2026-10-30 第二十四轮，裁定 39）──
// 阶段数 = 技能表 `phaseList` 最大值；按 HP 均分推进（`MonsterState.phase`）；
// 进入新阶段：韧性回满 + 重挂【强化防御】+【化整为零】重新分裂，并写 note `enemyPhaseUp`。
// 两处旧占位收口：火花大会二阶段由 `phase >= 2` 判定（不再用血量比启发式）；
// 金血忆灵「转阶段重新分裂」接上（此前只有开局分裂）。

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

const isMerged = (id: string): boolean => id === '4062010' || id === '4062020' || id === '4063010';

describe('统一转阶段状态机', () => {
  it('阶段数来自 phaseList 最大值：火花大会 2、金血忆灵 2、单阶段怪 1', () => {
    expect(monsterPhaseCount('5014010')).toBe(2);
    expect(monsterPhaseCount('4064012')).toBe(2);
    expect(monsterPhaseCount('5012030')).toBe(1); // 攻击性阅读物：单阶段
    expect(monsterPhaseCount(undefined)).toBe(1);
    expect(monsterPhaseCount('9999999')).toBe(1); // 无技能表
  });

  it('火花大会二阶段召唤改由 phase 驱动（4 只 + 助手）', () => {
    const openPk = enemySkills('5014010').find((s) => s.openPk)!.openPk!;
    expect(pkSubSummon(openPk, 1)).toEqual({ count: 3, helper: false });
    expect(pkSubSummon(openPk, 2)).toEqual({ count: 4, helper: true });
  });

  it('金血忆灵转阶段：写 enemyPhaseUp、韧性回满、重新分裂', () => {
    const { steps } = simulateBattleReplay({
      members: members(),
      monsters: [judge],
      techniques: false,
      rounds: 20,
      maxTime: 6000,
      roundMode: 'forgotten',
    });
    const phaseUp = steps.findIndex((s) => (s.event.note ?? []).includes('enemyPhaseUp'));
    expect(phaseUp).toBeGreaterThan(0);
    const boss = steps[phaseUp]!.status.monsters[0]!;
    expect(boss.toughness).toBeCloseTo(360, 6); // 转阶段韧性回满
    // 转阶段后重新分裂：之后仍能看到存活的【金血忆灵】
    const after = steps.slice(phaseUp);
    expect(after.some((s) => (s.status.enemyUnits ?? []).some((u) => isMerged(u.monsterId)))).toBe(true);
  });
});
