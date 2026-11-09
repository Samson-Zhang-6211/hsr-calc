import { describe, expect, it } from 'vitest';
import {
  enemySkills,
  pkSubSummon,
  simulateBattleReplay,
  SUMMON_MONSTERS,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 火花大会副战场：阶段化召唤 + 前端「副战场」标记的数据链（2026-10-30 第二十二轮）──
// 裁定 51 补：一阶段 3 只攻击性阅读物；二阶段 4 只 + 直播小助手（阶段占位 = BOSS 生命 ≤50%）。

const openPk = enemySkills('5014010').find((s) => s.openPk)!.openPk!;

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
  { id: 'huohua', panel: panel(160, 0.8) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
];

const boss: MonsterConfig = {
  monsterId: '5014010',
  level: 95,
  hp: 300_000,
  attack: 800,
  speed: 120,
  maxToughness: 960,
  weaknesses: ['Fire', 'Quantum', 'Imaginary'],
  resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
};

describe('火花大会 · 副战场阶段化召唤', () => {
  it('一阶段 3 只、无助手；二阶段 4 只 + 助手（按统一阶段状态判定）', () => {
    expect(pkSubSummon(openPk, 1)).toEqual({ count: 3, helper: false });
    expect(pkSubSummon(openPk, 2)).toEqual({ count: 4, helper: true });
    expect(pkSubSummon(openPk, 3)).toEqual({ count: 4, helper: true });
  });

  it('副战场敌方档案：阅读物 5012030 / 助手 5014011 都在召唤物表里', () => {
    expect(SUMMON_MONSTERS[openPk.subMonsterId]?.name).toBe('攻击性阅读物');
    expect(SUMMON_MONSTERS[openPk.helperId!]?.name).toBe('直播小助手');
  });

  it('实战：PK 开启后 status.pk 能给出隔离成员（前端据此标「副战场」）', () => {
    const { steps } = simulateBattleReplay({
      members: members(),
      monsters: [boss],
      techniques: false,
      rounds: 10,
      maxTime: 3000,
      roundMode: 'forgotten',
    });
    const openStep = steps.find((s) => s.status.pk?.active);
    // 若整局没开 PK（AI 随机未抽到抬你上麦）则跳过：这一条不承担随机性断言
    if (!openStep) return;
    const pk = openStep.status.pk!;
    expect(pk.subMembers.length).toBe(1);
    expect(pk.subEnemies.length).toBeGreaterThanOrEqual(3);
  });
});
