import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  enemySkills,
  enemyUsableSkills,
  simulateBattle,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 末日幻影 P21 星启「雷奔云谲的恶狼主」2034014（2026-10-30 第三批接入）──
// 数据源：data/monster-stages/apo-p21.json 星启段 → buildPackStageWaves('apo-p21', 0)
// 技能表：packages/engine/src/combat/monster-skill-data.ts 的 '2034014'
// 锚点全部来自 zz-wolf-dump 实测（同 seed 确定性），倍率占位 1（rulings「1 A」）。
//
// 复用 2034010 呼雷的月狂/怒意机制并换名：
//   `moonRage` = 【噬月】、【bloodRage】= 【嗜血】、【fury】= 【怒意】；
// 本批新增：噬月前**韧性不可削**（untouchableToughness）、噬月**减伤**（dmgReduction）、
//          进入噬月**立即施放【孤战】**（onEnterSkillId）、怒意**我方回合结束 −1**（furyDecayOnAllyTurnEnd）、
//          【孤战】1v1 离场 + 自身属性提升 + 我方回战技点。
// 留口：狼群敕令的「我方击杀其他敌方目标 → 伤害/削韧/【血涌】」半句（需击杀钩子），
//      因此【战血激昂】当前恒 0 层（bloodSurge 只由该半句产出）。

function panel(speed: number): MemberPanel {
  return {
    element: 'Wind',
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
  };
}

function members(): CombatMember[] {
  return [
    { id: 'sunday', panel: panel(156) },
    { id: 'jingyuan', panel: panel(134) },
    { id: 'tenghuang', panel: panel(135) },
    { id: 'aventurine', panel: panel(134) },
  ];
}

const MON = (() => {
  const cfg = buildPackStageWaves('apo-p21', 0)[0]![0]!;
  return { ...cfg, hp: 20_000_000 };
})();
/** 单体一跳 = 敌攻 × 1 × 防御区（攻方 Lv90 / 守方 Lv80） */
const HIT = MON.attack! * ((90 + 20) / (90 + 20 + (80 + 20)));
/** 【孤战】自身攻击力 +30%（占位） → 命中伤害 ×1.3 */
const DUEL_HIT = HIT * 1.3;

function run(): CombatEvent[] {
  return simulateBattle({
    members: members(),
    monsterWaves: [[MON]],
    techniques: false,
    rounds: 8,
    maxTime: 2000,
    roundMode: 'phantom',
  }).events;
}

describe('末日星启 · 2034014 技能表', () => {
  it('9 条技能；伤害技 5 条进 AI 池，【孤战】只能由噬月强放', () => {
    const all = enemySkills('2034014');
    expect(all.map((s) => s.skillId)).toEqual([
      '203401401',
      '203401402',
      '203401403',
      '203401404',
      '203401405',
      '203401406',
      '203401407',
      '203401408',
      '203401409',
    ]);
    expect(all.find((s) => s.skillId === '203401406')!.untouchableToughness).toBe(true);
    expect(all.find((s) => s.skillId === '203401406')!.allyAttackStatus).toMatchObject({
      threshold: 4,
      dmgReduction: 0.4,
      onEnterSkillId: '203401409',
      furyDecayOnAllyTurnEnd: true,
    });
    expect(all.find((s) => s.skillId === '203401407')!.furyOnEnemyAttack!.status).toBe('fury');
    expect(all.find((s) => s.skillId === '203401409')!.requiresCharge).toBe(true);
    expect(all.find((s) => s.skillId === '203401409')!.duel).toMatchObject({ spRestore: 4 });
    // AI 池：409 在池内但 requiresCharge → 选招时被过滤（与既有蓄力怪同口径）
    const usable = enemyUsableSkills('2034014').map((s) => s.skillId);
    expect(usable).toEqual([
      '203401401',
      '203401402',
      '203401403',
      '203401404',
      '203401405',
      '203401409',
    ]);
  });
});

describe('【噬月】韧性锁与减伤', () => {
  it('进入【噬月】前不会出现击破（韧性不可削）；首次击破晚于首次【孤战】', () => {
    const evs = run();
    const firstDuel = evs.findIndex((e) => e.skillCode === 'monster.203401409');
    expect(firstDuel).toBeGreaterThanOrEqual(0);
    const firstBreak = evs.findIndex((e) => e.kind === 'break');
    expect(firstBreak).toBeGreaterThan(firstDuel);
    // 噬月之外不会出现击破：任何 break 都必须落在某个「噬月窗口」内
    //（窗口 = 首次【孤战】之后到 enemyFuryBreak 之前；这里只校验首个 break 的时序）
  });
});

describe('【孤战】1v1', () => {
  it('噬月进入即施放【孤战】：我方回战技点 + 其余成员离场（只有留下的那名行动）', () => {
    const evs = run();
    const duelIdx = evs.findIndex((e) => e.skillCode === 'monster.203401409');
    const duel = evs[duelIdx]!;
    expect(duel.note).toContain('allySpRestore');
    expect(duel.note).toContain('enemyDuelEnter');
    expect(duel.note).toContain('monsterChargeRelease');
    // 战技点：施放后到上限 5
    expect(duel.spAfter).toBe(5);
    const keep = duel.enemyHits![0]!.targetId;
    // 窗口 = 本次孤战 → 下一次 enemyFuryBreak（怒意归零退出噬月）
    const exitIdx = evs.findIndex((e, i) => i > duelIdx && (e.note ?? []).includes('enemyFuryBreak'));
    expect(exitIdx).toBeGreaterThan(duelIdx);
    const window = evs.slice(duelIdx + 1, exitIdx);
    // 我方只有留下的那名成员行动（含其召唤物神君/龙灵）
    const allyActors = new Set(
      window
        .filter((e) => e.kind === 'action' && (e.action === 'basic' || e.action === 'skill' || e.action === 'ult'))
        .map((e) => e.unitId),
    );
    for (const id of allyActors) expect(id).toBe(keep);
    // 敌方召唤物在孤战期间不出手、也不召唤
    expect(window.every((e) => !/^enemy\d$/.test(e.unitId))).toBe(true);
  });

  it('孤战期间自身攻击力 +30%（命中 347.17 → 451.32），退场后还原', () => {
    const evs = run();
    const duelIdx = evs.findIndex((e) => e.skillCode === 'monster.203401409');
    const exitIdx = evs.findIndex((e, i) => i > duelIdx && (e.note ?? []).includes('enemyFuryBreak'));
    const inWindow = evs
      .slice(duelIdx + 1, exitIdx)
      .filter((e) => e.skillCode?.startsWith('monster.2034014') && e.enemyHits?.length);
    expect(inWindow.length).toBeGreaterThan(0);
    for (const e of inWindow) {
      expect(e.enemyHits![0]!.damage).toBeCloseTo(DUEL_HIT, 2);
    }
    // 退出后（同一场里下一次普通出手）回到基础倍率
    const after = evs
      .slice(exitIdx + 1)
      .find((e) => e.skillCode?.startsWith('monster.2034014') && e.enemyHits?.length);
    if (after) expect(after.enemyHits![0]!.damage).toBeCloseTo(HIT, 2);
  });

  it('【怒意】我方回合结束 −1：归零时打出 enemyFuryBreak，随后其余成员回归行动', () => {
    const evs = run();
    const duelIdx = evs.findIndex((e) => e.skillCode === 'monster.203401409');
    const exitIdx = evs.findIndex((e, i) => i > duelIdx && (e.note ?? []).includes('enemyFuryBreak'));
    expect(exitIdx).toBeGreaterThan(duelIdx);
    // 退出发生在某个我方行动上（回合结束时递减）
    const exitEv = evs[exitIdx]!;
    expect(exitEv.kind).toBe('action');
    expect(['sunday', 'jingyuan', 'tenghuang', 'aventurine']).toContain(exitEv.unitId);
    // 退出后离场成员回归：后续出现非「留下者」的成员行动
    const keep = evs[duelIdx]!.enemyHits![0]!.targetId;
    const later = evs
      .slice(exitIdx + 1)
      .filter((e) => e.kind === 'action' && ['basic', 'skill'].includes(e.action ?? ''))
      .map((e) => e.unitId);
    expect(later.some((id) => id !== keep)).toBe(true);
  });
});
