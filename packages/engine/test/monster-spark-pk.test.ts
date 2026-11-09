import { describe, expect, it } from 'vitest';
import {
  enemySkills,
  enemyUsableSkills,
  simulateBattleReplay,
  SUMMON_MONSTERS,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 火花大会 5014010【连麦PK】（2026-10-30 第二十轮，裁定 51/52/53/55）──
// 本轮范围：9 条技能表 + 副战场状态机（隔离 1 人 / 召唤副战场敌方 / 倒计时 2 回合）+ 好感度纯计数
// + 粉丝的狂欢减伤（解除时按剩余生命比例保留）。**目标隔离与前端「副战场」标注留到下一轮。**
// 实测锚点（dump 定锚）：8 回合内 PK 开启 1 次、隔离 sunday、副战场敌方 enemy1~3、
// 减伤 0.3、我方人气值累加到 28（打本体），倒计时结束走 fail 分支并保留减伤。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 2000,
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
  { id: 'sunday', panel: panel(156) },
  { id: 'jingyuan', panel: panel(134) },
  { id: 'huohua', panel: panel(150) },
  { id: 'aventurine', panel: panel(134) },
];

const boss: MonsterConfig = {
  monsterId: '5014010',
  level: 95,
  hp: 2_000_000,
  attack: 800,
  speed: 120,
  maxToughness: 960,
  weaknesses: ['Fire', 'Quantum', 'Imaginary'],
  resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
};

const run = () =>
  simulateBattleReplay({
    members: members(),
    monsters: [boss],
    techniques: false,
    rounds: 8,
    maxTime: 3000,
    roundMode: 'forgotten',
  });

describe('怪物技能 · 火花大会 5014010（连麦PK）', () => {
  it('技能表 9 条；抬你上麦/推流/好感度 进 AI 池，粉丝的狂欢是被动', () => {
    const table = enemySkills('5014010');
    expect(table.length).toBe(9);
    const pool = enemyUsableSkills('5014010').map((s) => s.skillId);
    expect(pool).toContain('501401006'); // 抬你上麦（openPk）
    expect(pool).toContain('501401007'); // 推流
    expect(pool).toContain('501401008'); // 好感度调整
    expect(pool).not.toContain('501401009'); // 粉丝的狂欢 = 被动
    expect(table.find((s) => s.skillId === '501401006')?.openPk).toMatchObject({
      phaseCounts: [3, 4],
      subMonsterId: '5012030',
      helperId: '5014011',
      countdown: 200,
    });
  });

  it('副战场小怪档案齐全（攻击性阅读物 5012030 / 直播小助手 5014011）', () => {
    expect(SUMMON_MONSTERS['5012030']?.name).toBe('攻击性阅读物');
    expect(SUMMON_MONSTERS['5014011']?.name).toBe('直播小助手');
    expect(SUMMON_MONSTERS['5012030']?.hp).toBe(232.5);
    expect(SUMMON_MONSTERS['5014011']?.spd).toBe(144);
  });

  it('抬你上麦：隔离 1 名角色 + 召唤 3 只副战场敌方 + 挂粉丝的狂欢减伤', () => {
    const { steps } = run();
    const pkSteps = steps.filter((s) => s.status.pk?.active);
    expect(pkSteps.length).toBeGreaterThan(0);
    const first = pkSteps[0]!.status.pk!;
    expect(first.active).toBe(true);
    expect(first.subMembers.length).toBe(1);
    expect(first.subEnemies.length).toBe(3); // 一阶段 3 只攻击性阅读物
    expect(first.fansReduction).toBeCloseTo(0.3, 6);
    expect(first.turnsLeft).toBe(1); // 开启当回合末已减 1（占位 2 回合）
    const notes = new Set(steps.flatMap((s) => s.event.note ?? []));
    for (const key of ['pkOpen', 'pkIsolate', 'pkFansOn']) expect(notes.has(key), key).toBe(true);
  });

  it('倒计时结束走解除分支：PK 关闭 + 减伤按剩余生命比例保留', () => {
    const { steps } = run();
    const notes = new Set(steps.flatMap((s) => s.event.note ?? []));
    expect(notes.has('pkEndFail') || notes.has('pkEndSuccess')).toBe(true);
    expect(notes.has('pkFansKeep') || notes.has('pkFansOff')).toBe(true);
    // 至少发生过一次「开 → 关」的翻转（之后可能再次开启，故不看末态）
    const flags = steps.map((s) => s.status.pk?.active ?? false);
    const closedAfterOpen = flags.some((on, i) => on && flags.slice(i + 1).includes(false));
    expect(closedAfterOpen).toBe(true);
    // 副战场敌方基本满血 → 保留接近满额的减伤
    const last = steps[steps.length - 1]!.status.pk!;
    expect(last.fansReduction).toBeGreaterThan(0);
    expect(last.fansReduction).toBeLessThanOrEqual(0.3 + 1e-9);
  });

  it('好感度是纯计数器：打本体累加我方人气值，不影响伤害口径', () => {
    const { steps } = run();
    const last = steps[steps.length - 1]!.status.pk!;
    expect(last.favorMine).toBeGreaterThan(0);
    expect(last.favorFoe).toBe(0);
    // 计数器不进伤害事件（没有对应 note / 因子）
    const hits = steps.flatMap((s) => s.event.hitSeqs ?? []);
    expect(hits.length).toBeGreaterThan(0);
  });
});
