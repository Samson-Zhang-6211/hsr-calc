import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  enemySkills,
  simulateBattle,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 【怨火灼身】二选一（5014030 绘世；2026-11-02 用户逐条裁定）──
// 裁定：
//  1) 扑灭成功率按**每名角色各自累计**的尝试次数：第 1 次 33%、第 2 次 66%、第 3 次起 100%，成功解除后清零。
//  2) 【扑灭火焰】**不消耗本回合行动**（数据原文「本回合不会结束」）。
//  3) 【忍耐灼烧】= 解除【怨火灼身】+ 回 1 战技点 + 跳过本回合 + 【忍耐】受伤降低 1 回合（数值占位 30%）。
//  4) 自动策略：默认总是扑灭；战技点不足时只能忍耐。
//  5) 扑灭失败的火伤照现有敌方伤害通道结算（倍率仍是占位 1）。

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

function cfgOf(monsterId: string): MonsterConfig {
  for (const wave of buildPackStageWaves('moc-p43', 0)) {
    for (const c of wave) if (c.monsterId === monsterId) return { ...c, hp: Math.min(c.hp, 3e7) };
  }
  throw new Error(`missing ${monsterId}`);
}

function run(wave: MonsterConfig[], rounds = 12): CombatEvent[] {
  return simulateBattle({
    members: members(),
    monsterWaves: [wave],
    techniques: false,
    rounds,
    maxTime: 2400,
    roundMode: 'phantom',
  }).events;
}

const EMBER_NOTES = ['emberExtinguish', 'emberExtinguishFail', 'emberEndure'];

describe('【怨火灼身】二选一（5014030 绘世）', () => {
  it('绘世的灼烧 DoT 全部带 emberChoice 标记', () => {
    const burns = enemySkills('5014030').filter((s) => s.allyDot);
    expect(burns.length).toBeGreaterThan(0);
    for (const s of burns) expect(s.allyDot!.emberChoice).toBe(true);
  });

  it('行动前先判定：出现扑灭/忍耐事件，且连续失败不超过 2 次（第 3 次起 100%）', () => {
    const evs = run([cfgOf('5014030')], 12);
    const choice = evs.filter((e) => (e.note ?? []).some((n) => EMBER_NOTES.includes(n)));
    expect(choice.length).toBeGreaterThan(0);

    const streak = new Map<string, number>();
    for (const e of choice) {
      const note = e.note ?? [];
      const id = String(e.unitId);
      if (note.includes('emberEndure')) continue;
      if (note.includes('emberExtinguishFail')) {
        const s = (streak.get(id) ?? 0) + 1;
        // 第 1 次 33%、第 2 次 66%、第 3 次必成 → 不可能连续失败 3 次
        expect(s).toBeLessThanOrEqual(2);
        streak.set(id, s);
      } else {
        streak.set(id, 0);
      }
    }
  });

  it('扑灭消耗 1 点战技点；失败的事件带一次 dot.ember 火伤', () => {
    const evs = run([cfgOf('5014030')], 12);
    const choice = evs.filter((e) => (e.note ?? []).some((n) => EMBER_NOTES.includes(n)));
    expect(choice.length).toBeGreaterThan(0);
    for (const e of choice) {
      const idx = evs.indexOf(e);
      const prevSp = idx > 0 ? (evs[idx - 1]!.spAfter ?? 0) : (e.spAfter ?? 0) + 1;
      if ((e.note ?? []).includes('emberEndure')) {
        // 忍耐：回 1 战技点
        expect((e.spAfter ?? 0) - prevSp).toBe(1);
      } else {
        // 扑灭：耗 1 战技点
        expect(prevSp - (e.spAfter ?? 0)).toBe(1);
      }
      if ((e.note ?? []).includes('emberExtinguishFail')) {
        expect(e.enemyHits?.[0]?.skillId).toBe('dot.ember');
        expect(e.enemyHits?.[0]?.damage ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('扑灭成功后该成员的 dot.burn 跳伤只会在再次被点燃之后出现', () => {
    const evs = run([cfgOf('5014030')], 12);
    const okIdx = evs.findIndex((e) => (e.note ?? []).includes('emberExtinguish'));
    expect(okIdx).toBeGreaterThanOrEqual(0);
    const id = String(evs[okIdx]!.unitId);
    // 成功后第一次「该成员又被点燃」（敌方技能事件 note=allyBurn 且命中他）必须早于他下一次 dot.burn 跳伤
    const firstTick = evs.findIndex(
      (e, i) => i > okIdx && e.skillCode === 'dot.burn' && String(e.unitId) === id,
    );
    const firstReburn = evs.findIndex(
      (e, i) =>
        i > okIdx &&
        (e.note ?? []).includes('allyBurn') &&
        (e.enemyHits ?? []).some((h) => h.targetId === id),
    );
    if (firstTick >= 0) {
      expect(firstReburn).toBeGreaterThanOrEqual(0);
      expect(firstReburn).toBeLessThan(firstTick);
    }
  });
});
