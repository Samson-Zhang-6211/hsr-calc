import { describe, expect, it } from 'vitest';
import { simulateBattleReplay, type CombatMember, type MemberPanel, type MonsterConfig } from '../src/index.js';

// ── 火花大会 5014010【连麦PK】战场隔离（2026-10-30 第二十一轮，裁定 51）──
// 口径：对同阵营技能正常生效；跨阵营攻击只在本战场内成立 ——
//   · 主战场施放者打不到副战场敌方（dealAttack 直接跳过该目标）；
//   · 副战场施放者打主战场目标 → 改打副战场敌方；
//   · 阿哈时刻（`pkForceField='sub'`）期间欢愉技一律打副战场；
//   · 敌方出手也只打自己战场上的成员（`pkLivingMembers`）。
// 实测锚点（dump 定锚）：PK 开启后花火欢愉技由 monster1 改为命中 enemy1（2371 → 1185/段），副战场 HP 递减。

function panel(speed: number, elationDegree = 0): MemberPanel {
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
    elationDegree,
  } as MemberPanel;
}

const members = (): CombatMember[] => [
  { id: 'sunday', panel: panel(156) },
  { id: 'jingyuan', panel: panel(134) },
  { id: 'huohua', panel: panel(150, 0.5) },
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

describe('火花大会 · 战场隔离（裁定 51）', () => {
  it('PK 期间欢愉技只打副战场敌方；主战场角色仍打本体', () => {
    const { result, steps } = run();
    const pkOpenStep = steps.findIndex((s) => s.status.pk?.active);
    expect(pkOpenStep).toBeGreaterThan(0);
    // PK 开启后：副战场敌方吃到伤害
    const subHitSeqs = new Set<number>();
    for (const s of steps.slice(pkOpenStep)) {
      if (!s.status.pk?.active) continue;
      if (s.event.action !== 'ahaMoment' && s.event.unitId !== 'huohua') continue;
      for (const seq of s.event.hitSeqs ?? []) subHitSeqs.add(seq);
    }
    const subHits = result.hits.filter(
      (h) => subHitSeqs.has(h.seq) && String(h.target).startsWith('enemy'),
    );
    expect(subHits.length).toBeGreaterThan(0);
    expect(subHits.every((h) => h.kind === 'elation')).toBe(true);
    // 主战场角色（景元）在 PK 期间仍打 monster1
    const jyPk = result.hits.filter(
      (h) => h.source === 'shenjun' && String(h.target) === 'monster1',
    );
    expect(jyPk.length).toBeGreaterThan(0);
  });

  it('副战场小怪有攻击技能表（隔离角色会被它们打）', () => {
    const { steps } = run();
    const minionCasts = steps
      .filter((s) => String(s.event.unitId).startsWith('enemy') && s.event.action === 'monster')
      .map((s) => s.event.skillCode);
    expect(minionCasts.length).toBeGreaterThan(0);
    // 至少一次真打出了技能（有 skillCode）
    expect(minionCasts.some((c) => typeof c === 'string' && c.startsWith('monster.'))).toBe(true);
  });

  it('敌方出手按战场选成员：副战场小怪只会打被隔离角色', () => {
    const { steps } = run();
    const pkStep = steps.find((s) => s.status.pk?.active);
    expect(pkStep).toBeDefined();
    const isolated = pkStep!.status.pk!.subMembers;
    expect(isolated.length).toBe(1);
    const subMember = isolated[0]!;
    // PK 期间（pk.active）副战场小怪只允许打隔离开的那个角色；
    // PK 结束后残余小怪仍可自由行动，不在本断言范围内
    const minionHits = steps
      .filter((s) => s.status.pk?.active && String(s.event.unitId).startsWith('enemy'))
      .flatMap((s) => s.event.enemyHits ?? []);
    for (const h of minionHits) {
      expect(h.targetId).toBe(subMember);
    }
    expect(minionHits.length).toBeGreaterThan(0);
  });
});
