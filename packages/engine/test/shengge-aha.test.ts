import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type CombatMember, type CombatEvent } from '../src/index.js';

/**
 * 「欢愉」命途**升格**门控 —— 2026-11-05 用户裁定：
 *
 * > 当啊哈为 E2 且与狼尊Lv.999 同时加入编队…**啊哈未入队是没有升格效果的！**
 * > 其余欢愉角色也满足该规则。
 *
 * 因此所有 `xxShengGeLv()` 一律：**啊哈不在队 → 0（无升格）**；啊哈在队 → lv1；啊哈 E2 → lv2。
 * 本文件用「同一时刻、同一行动序列」的三档对照锁住五条支线的门控：
 *
 * | 角色 | 升格条款 | 无啊哈 | 啊哈 E0（lv1） | 啊哈 E2（lv2） |
 * | --- | --- | --- | --- | --- |
 * | 爻光 150229 #2/#4 | 终招后固定回能 / +10 笑点 | 0 / 0 | +12 / +10 | +30 / +10 |
 * | 开拓者 800929 #1 | 终招暴伤加成对象 | 仅目标 | 全队 +20% | 全队 +30% |
 * | 绯英 150529 #2 | 无视防御 | 0% | 10% | 24% |
 * | 真珠 150329 #1 | 【好活】上限 | 天赋上限 | 升格上限 | 升格上限（同值） |
 * | 水砂 151329 | 独水砂模式 | —（该模式定义即「啊哈为唯一欢愉队友」，天然要求啊哈在队） | | |
 *
 * dump 实锚（`%TEMP%\临时目录\sg2-dump.txt`，seed 20261009、12 回合）：
 * 爻光 终招 t=297.0/792.1 三档 en=**10 / 22 / 40**、laugh=8 / 18 / 18.33；
 * 开拓者 终招暴伤覆盖 `[trailblazer]`（无啊哈）→ `[trailblazer, seele, aha]`（啊哈 E0）。
 */

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 110,
  attack: 2000,
  hp: 3000,
  defence: 800,
  element: 'Imaginary' as const,
  critRate: 0.5,
  critDmg: 1.0,
  elationDegree: 0,
  damageBonus: 0,
  breakEffect: 0,
  effectHit: 0,
  effectRes: 0,
  damageReduction: 0,
  energyRegen: 0,
  outgoingHealing: 0,
  elementDmg: { Imaginary: 0.3 },
  ...over,
});

const MON: BattleConfig['monster'] = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 9999,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};

const mem = (id: string, eid: number, over: Record<string, unknown> = {}): CombatMember =>
  ({
    id,
    eidolonLevel: eid,
    panel: mkPanel(over),
    skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
  }) as unknown as CombatMember;

const cfg = (members: CombatMember[]): BattleConfig => ({
  members,
  monster: MON,
  techniques: false,
  rounds: 12,
  maxTime: 3000,
  seed: 20261009,
});

const yg = (): CombatMember => mem('yaoguang', 0, { speed: 101, element: 'Imaginary' as Element });
const aha = (eid: number): CombatMember => mem('aha', eid, { speed: 96 });

/** 爻光首个终结技：能量与笑点 */
const ygUlt = (team: CombatMember[]): CombatEvent => {
  const r = simulateBattle(cfg(team));
  const e = r.events.find((x) => x.kind === 'ult' && x.unitId === 'yaoguang');
  expect(e, '爻光没有放出终结技').toBeDefined();
  return e!;
};

/** 事件快照里挂了 critDmg 的单位 */
const critHolders = (e: CombatEvent): string[] => {
  const b = e.buffs as unknown as Record<string, { key: string }[]> | undefined;
  return Object.entries(b ?? {})
    .filter(([, arr]) => arr.some((x) => x.key === 'critDmg'))
    .map(([u]) => u)
    .sort();
};

describe('「欢愉」升格门控：啊哈不在队 → 无升格（150229 / 800929）', () => {
  it('爻光 150229：同刻三档「终招回能」= 0 / +12 / +30，笑点 = 0 / +10 / +10', () => {
    const none = ygUlt([yg()]);
    const lv1 = ygUlt([yg(), aha(0)]);
    const lv2 = ygUlt([yg(), aha(2)]);
    // 同一时刻、同一行动序列（啊哈不改变爻光前两次行动的时间）
    expect(none.time).toBeCloseTo(297.03, 2);
    expect(lv1.time).toBeCloseTo(none.time, 6);
    expect(lv2.time).toBeCloseTo(none.time, 6);
    expect(none.energyAfter).toBe(10);
    expect(lv1.energyAfter).toBe(22); // +12（150229 lv1 #2）
    expect(lv2.energyAfter).toBe(40); // +30（lv2 #2）
    expect(none.laughPointsAfter).toBe(8);
    expect(lv1.laughPointsAfter).toBe(18); // +10（#4）
  }, 300_000);

  it('开拓者 800929：终招暴伤「仅目标」→ 啊哈在队变「全队」', () => {
    const tb = mem('trailblazer', 0, { speed: 100, element: 'Fire' as Element });
    const se = mem('seele', 0, { speed: 150, element: 'Quantum' as Element });
    const none = simulateBattle(cfg([tb, se]));
    const withAha = simulateBattle(cfg([tb, se, aha(0)]));
    const firstUlt = (r: typeof none): CombatEvent =>
      r.events.find((x) => x.kind === 'ult' && x.unitId === 'trailblazer')!;
    expect(firstUlt(none).targetId).toBe('trailblazer'); // 自目标（默认策略）
    expect(critHolders(firstUlt(none))).toEqual(['trailblazer']); // 无升格：只给目标
    expect(critHolders(firstUlt(withAha))).toEqual(['aha', 'seele', 'trailblazer']); // lv1：全队
  }, 300_000);

  it('绯英 150529 #2：无视防御 0% / 10% / 24%（防御区公式三档）', () => {
    const fy = (eid: number): CombatMember =>
      mem('feiying', eid, { speed: 150, element: 'Fire' as Element, hp: 6000, energyRegen: 0 });
    const defenseOf = (team: CombatMember[]): number => {
      const r = simulateBattle(cfg(team));
      const sk = r.events.find((e) => e.kind === 'action' && e.action === 'skill' && e.unitId === 'feiying')!;
      const h = r.hits.find((x) => x.seq === sk.hitSeqs![0])!;
      return h.factors.find((f) => f.key === 'defense')?.value ?? Number.NaN;
    };
    // 防御区 = (80+20) / [(80+20) + (90+20)×(1-无视%)]
    const d = (ignore: number): number => 100 / (100 + 110 * (1 - ignore));
    expect(defenseOf([fy(0)])).toBeCloseTo(d(0), 6); // 无升格
    expect(defenseOf([fy(0), aha(0)])).toBeCloseTo(d(0.1), 6); // lv1 #2=10%
    expect(defenseOf([fy(0), aha(2)])).toBeCloseTo(d(0.24), 6); // lv2 #2=24%
  }, 300_000);
});
