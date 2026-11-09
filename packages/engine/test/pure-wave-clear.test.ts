import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  simulateBattle,
  simulateBattleReplay,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 【虚构叙事】波次规则（2026-10-30 用户裁定 56，第四十轮实现）──
// 文案：「第一波次小怪击败一定个数进入下一波次，第二波第三波次均为击败 boss 算波次结束」
// 实现：`BattleConfig.waveClearRule: 'pure'` + `pureKillTarget`（用户口头给的阈值 = 20）
//   1. 第 1 波：只加载前 3 只，槽内怪死亡 → 从本波剩余池补位；累计击杀 ≥ pureKillTarget 换波
//   2. 第 2 波起：boss（槽 1 = 数据里每波第一只）死亡即换波，小怪是否清完不影响
//   3. 最后一波 boss 死亡 = 胜利（同样不等小怪清完）
// 其余模式（缺省 `'all'`）逐位不变。

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

const foe = (id: string, hp: number, speed = 100): MonsterConfig => ({
  monsterId: id,
  level: 80,
  hp,
  attack: 0,
  speed,
  maxToughness: 60,
  weaknesses: ['Quantum'],
  resistance: {},
});

/** 小怪潮：n 只、血量各不相同（便于看出补位） */
const tide = (n: number, base = 300): MonsterConfig[] =>
  Array.from({ length: n }, (_, i) => foe('1002030', base + i * 7));

/** boss 波：槽 1 = boss（血量可控），两侧小怪 */
const bossWave = (bossHp: number) => [foe('8003060', bossHp), foe('1002030', 999_999), foe('1002030', 999_999)];

interface Run {
  waveEvents: number[];
  /** 第 1 波到第 2 波之间发生的行动数（补位越多、这项越大） */
  actionsBeforeWave2: number;
  /** 每次换波时的三槽血量 */
  hpAtWave: number[][];
  victory: boolean;
}

function run(waves: MonsterConfig[][], cfg: Record<string, unknown>): Run {
  const { result, steps } = simulateBattleReplay({
    members: members(),
    monsterWaves: waves,
    techniques: false,
    rounds: 12,
    maxTime: 6000,
    roundMode: 'forgotten',
    ...cfg,
  });
  const waveEvents: number[] = [];
  const hpAtWave: number[][] = [];
  // 补位不可直接观测（槽位状态里没有 monsterId，且死亡+补位发生在同一批），
  // 因此用「第 1 波打了多少次行动」间接度量：只打首波 3 只时行动数很少，
  // 要凑够 pureKillTarget 次击杀就必须不断补位 → 行动数成倍增加。
  let wave2Step = -1;
  steps.forEach((s, i) => {
    if (s.event.kind === 'wave') {
      waveEvents.push(s.event.wave ?? 0);
      hpAtWave.push([0, 1, 2].map((k) => Math.round(s.status.monsters?.[k]?.hp ?? 0)));
      if (waveEvents.length === 2) wave2Step = i;
    }
  });
  const actionsBeforeWave2 =
    wave2Step < 0 ? steps.length : steps.slice(0, wave2Step).filter((x) => x.event.kind === 'action').length;
  return { waveEvents, actionsBeforeWave2, hpAtWave, victory: result.victory };
}

describe('虚构叙事 · 波次规则（裁定 56）', () => {
  it('第 1 波：补位刷小怪，累计击杀达阈值才换波', () => {
    const r = run([tide(30), bossWave(1), bossWave(1)], { waveClearRule: 'pure', pureKillTarget: 20 });
    // 首波只加载 3 只，凑够 20 杀必须补位 → 换波前的行动数远多于「只打 3 只」
    expect(r.actionsBeforeWave2, `换波前只有 ${r.actionsBeforeWave2} 次行动，像是没补位`).toBeGreaterThan(4);
    expect(r.waveEvents.length).toBeGreaterThanOrEqual(2);
    // 换波到第 2 波时，槽 1 是 boss（血量 1，说明换波发生在第 1 波清完后）
    expect(r.hpAtWave[1]![2]).toBe(1);
  });

  it('默认规则（不传 waveClearRule）不补位，且第 2 波小怪没清完就不换波', () => {
    const r = run([tide(30), bossWave(1), bossWave(1)], {});
    // 只打首波 3 只 → 换波前的行动数很少
    expect(r.actionsBeforeWave2, `默认规则换波前有 ${r.actionsBeforeWave2} 次行动，疑似补位`).toBeLessThan(6);
    // boss 被秒但两侧小怪还活着 → 不换波、也不胜利
    expect(r.waveEvents.length).toBe(2);
    expect(r.victory).toBe(false);
  });

  it('第 2 波起：boss 死即换波（两侧小怪还满血也换）', () => {
    const r = run([tide(30), bossWave(1), bossWave(1)], { waveClearRule: 'pure', pureKillTarget: 6 });
    expect(r.waveEvents).toEqual([1, 2, 3]);
    // 换波到第 3 波时，第 2 波的两侧小怪应仍是满血（999999）
    expect(r.hpAtWave[2]).toEqual([999_999, 999_999, 1]);
  });

  it('boss 不死则不换波（闸门）', () => {
    const r = run([tide(30), bossWave(999_999_999), bossWave(1)], { waveClearRule: 'pure', pureKillTarget: 6 });
    expect(r.waveEvents, 'boss 未死却推进了').toEqual([1, 2]);
    expect(r.victory).toBe(false);
  });

  it('最后一波：boss 死亡即胜利，不必清完小怪', () => {
    const r = run([tide(30), bossWave(1), bossWave(1)], { waveClearRule: 'pure', pureKillTarget: 4 });
    expect(r.waveEvents).toEqual([1, 2, 3]);
    expect(r.victory, '最后一波 boss 已死但没判胜利').toBe(true);
  });

  it('真实关卡数据：pure-p27 其四上半能走完三波（不再卡在第 1 波）', () => {
    const waves = buildPackStageWaves('pure-p27', 4, '上半').map((w) =>
      w.map((c) => ({ ...c, hp: Math.min(c.hp, 120_000) })),
    );
    const r = simulateBattle({
      members: members(),
      monsterWaves: waves,
      techniques: false,
      rounds: 30,
      maxTime: 12000,
      roundMode: 'forgotten',
      waveClearRule: 'pure',
      pureKillTarget: 20,
    });
    const waveEv = r.events.filter((e) => e.kind === 'wave').map((e) => e.wave);
    expect(waveEv).toEqual([1, 2, 3]);
    expect(r.events.length).toBeGreaterThan(0);
  });
});
