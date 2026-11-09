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

// ── 金血忆灵 4064012【化整为零】分裂/合体（2026-10-30 第二十三轮，简化口径）──
// 文案：战斗开始时自身分裂为雉形/犬形/翼蛇形（获得【合而为一】），自身获得【血脉衰弱】；
// 分裂体每次行动 → 血脉衰弱 −1；分裂体全部陷入【假死】→ 重新合体，并按剩余血脉衰弱削减韧性。
// 本实现：
//   · 开局召唤 3 只分裂体（states.merged = 1），本体 states.feignDeath = 1 并进入【假死】：
//     不再行动（`action:'skip'` + note `karmaFeignDeathSkip`），且**不可被攻击**（伤害转打存活分裂体）；
//   · 分裂体 HP 归零不清场，改为【假死】（HP 置 1）；全部假死 → 合体：清场、解假死、
//     按剩余血脉衰弱 × ⌈满韧性/3⌉ 削减本体韧性（占位）。
// 实测锚点（dump 定锚）：分裂期间本体 HP 恒 = 上限 2,000,000；合体后立刻恢复掉血（终态 1,208,313）。

function panel(speed: number): MemberPanel {
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
  hp: 2_000_000,
  attack: 800,
  speed: 144,
  maxToughness: 360,
  weaknesses: ['Physical', 'Fire', 'Thunder', 'Imaginary'],
  resistance: { Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
};

const MERGED_IDS = ['4062010', '4062020', '4063010'];
const isMerged = (id: string): boolean => MERGED_IDS.includes(id);

const run = () =>
  simulateBattleReplay({
    members: members(),
    monsters: [judge],
    techniques: false,
    rounds: 20,
    maxTime: 6000,
    roundMode: 'forgotten',
  });

describe('怪物技能 · 金血忆灵【化整为零】', () => {
  it('数据：被动挂 splitOnStart（3 只分裂体 + 血脉衰弱 3 层），分裂体都有技能表与档案', () => {
    const passive = enemySkills('4064012').find((s) => s.splitOnStart);
    expect(passive?.splitOnStart).toEqual({ monsterIds: MERGED_IDS, bloodWeak: 3 });
    expect(passive?.passive).toBe(true);
    for (const id of MERGED_IDS) {
      expect(SUMMON_MONSTERS[id], id).toBeDefined();
      expect(enemyUsableSkills(id).length, id).toBeGreaterThan(0);
    }
  });

  it('开局分裂：场上出现 3 只【金血忆灵】，本体【假死】不再行动', () => {
    const { steps } = run();
    const mine = steps.flatMap((s) => s.status.enemyUnits ?? []).filter((u) => isMerged(u.monsterId));
    expect(mine.length).toBeGreaterThan(0);
    const spread = new Set(mine.map((u) => u.monsterId));
    expect(spread.size).toBe(3);
    const skips = steps.filter(
      (s) => s.event.action === 'skip' && (s.event.note ?? []).includes('karmaFeignDeathSkip'),
    );
    expect(skips.length).toBeGreaterThan(0);
  });

  it('【假死】期间本体不可被攻击：分裂体在场时本体 HP 恒为上限', () => {
    const { steps } = run();
    let checked = 0;
    for (const s of steps) {
      const merged = (s.status.enemyUnits ?? []).filter((u) => isMerged(u.monsterId));
      if (merged.length === 0) continue;
      checked += 1;
      expect(s.status.monsters[0]!.hp, `t=${s.event.time}`).toBe(2_000_000);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('全部假死 → 合体：分裂体清场，本体恢复可攻击', () => {
    const { steps, result } = run();
    const mergedGone = steps.some((s) => {
      const alive = (s.status.enemyUnits ?? []).filter((u) => isMerged(u.monsterId));
      return alive.length === 0;
    });
    expect(mergedGone).toBe(true);
    // 合体后本体重新掉血
    expect(result.finalState.monsters[0]!.hp).toBeLessThan(2_000_000);
    // 合体按剩余血脉衰弱削韧：不会超过满韧性
    expect(result.finalState.monsters[0]!.toughness).toBeLessThanOrEqual(360);
  });
});
