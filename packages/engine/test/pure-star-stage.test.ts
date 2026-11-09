import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  simulateBattle,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 虚构星启关（pure-p27#0）在「纯小怪潮」下的波次规则（第四十二轮）──
// 星启关与 boss 关结构不同：没有上下半、三波都是小怪潮（30/41/41），
// 但**每波第一只仍是 boss 级怪**（wave1 = 2023030、wave2 = 3024010）。
// 因此裁定 56 的规则（第 1 波按击杀数、之后按 boss 死亡）也必须在星启关上成立。
// 数值锚（dump 定锚，cap 60k）：
//   纯规则：wave 事件 [1,2,3]、victory=true、总行动 164
//   默认规则：同样三波但只打首波 3 只 → 行动 71
//   纯规则 + 第 2 波 boss 血量 9e9：卡在 wave 2、不胜利

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

const star = () => buildPackStageWaves('pure-p27', 0);

interface Res {
  waves: number[];
  actions: number;
  victory: boolean;
}

function run(cfg: Record<string, unknown>, boss1Hp?: number, cap = 60_000): Res {
  const built: MonsterConfig[][] = star().map((w) => w.map((c) => ({ ...c, hp: Math.min(c.hp, cap) })));
  if (boss1Hp !== undefined) built[1]![0] = { ...built[1]![0]!, hp: boss1Hp };
  const r = simulateBattle({
    members: members(),
    monsterWaves: built,
    techniques: false,
    rounds: 30,
    maxTime: 12_000,
    roundMode: 'forgotten',
    ...cfg,
  });
  return {
    waves: r.events.filter((e) => e.kind === 'wave').map((e) => e.wave ?? 0),
    actions: r.events.filter((e) => e.kind === 'action').length,
    victory: r.victory,
  };
}

describe('虚构星启关 · 波次规则', () => {
  it('星启关是三波小怪潮（30/41/41），每波第一只是 boss 级', () => {
    const w = star();
    expect(w.map((x) => x.length)).toEqual([30, 41, 41]);
    expect(w[1]![0]!.monsterId).toBe('2023030');
    expect(w[2]![0]!.monsterId).toBe('3024010');
  });

  it('纯规则：三波走完并胜利；默认规则也能走完，但只打首波 3 只 → 行动数少一半以上', () => {
    const pure = run({ waveClearRule: 'pure', pureKillTarget: 20 });
    expect(pure.waves).toEqual([1, 2, 3]);
    expect(pure.victory).toBe(true);
    const plain = run({});
    expect(plain.waves).toEqual([1, 2, 3]);
    expect(plain.victory).toBe(true);
    // 纯规则要凑 20 杀才换波 → 行动数显著更多（164 vs 71）
    expect(pure.actions, `纯规则行动数 ${pure.actions} 未显著多于默认 ${plain.actions}`).toBeGreaterThan(
      plain.actions * 1.5,
    );
  });

  it('闸门：第 2 波 boss 不死 → 停在第 2 波，不胜利', () => {
    const r = run({ waveClearRule: 'pure', pureKillTarget: 20 }, 9e9);
    expect(r.waves).toEqual([1, 2]);
    expect(r.victory).toBe(false);
  });

  it('第 1 波击杀阈值可配：阈值 5 时换波更早（行动数少于阈值 20）', () => {
    const fast = run({ waveClearRule: 'pure', pureKillTarget: 5 });
    const slow = run({ waveClearRule: 'pure', pureKillTarget: 20 });
    expect(fast.waves[1]).toBe(2);
    expect(fast.actions).toBeLessThan(slow.actions);
  });
});
