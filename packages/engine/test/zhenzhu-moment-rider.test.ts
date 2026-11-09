import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type CombatMember,
  type HitLog,
  type MemberPanel,
} from '../src/index.js';

/**
 * 真珠 150320 追加段在【阿哈时刻】内也要结算（2026-11-06 用户裁定）：
 * - 150320 是「我方全体下一次攻击后，对攻击目标追加 40% 对应属性欢愉伤害」的**增伤段**，
 *   真珠本人不产生伤害段；原先该段只挂在 dealAttack 的直伤通道，欢愉通道提前 return，
 *   导致阿哈时刻内四名欢愉技的攻击全都不结算它（v6 核对实测回合 340,958、引擎少 13.3%）。
 * - 裁定口径：**每次攻击结算 1 段**（每个参演者的欢愉技算一次攻击），时刻内 x 取【笑点】。
 */

const panel = (over: Partial<MemberPanel>): MemberPanel =>
  ({
    level: 80,
    speed: 100,
    attack: 1500,
    hp: 3000,
    defence: 800,
    element: 'Physical',
    critRate: 0.5,
    critDmg: 1.0,
    elationDegree: 0,
    damageBonus: 0,
    breakEffect: 0,
    effectHit: 0,
    effectRes: 0,
    damageReduction: 0,
    energyRegen: 0,
    ...over,
  }) as MemberPanel;

const members: CombatMember[] = [
  {
    id: 'yaoguang',
    eidolonLevel: 0,
    panel: panel({ speed: 165, attack: 1886, elationDegree: 0.3, element: 'Physical' }),
    skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
  },
  {
    id: 'zhenzhu',
    eidolonLevel: 0,
    panel: panel({ speed: 173, attack: 1965, defence: 3161, elationDegree: 0.1, element: 'Ice' }),
    skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
  },
];

const MON: BattleConfig['monster'] = {
  level: 95,
  hp: 500_000_000,
  maxToughness: 9999,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};

const factorOf = (h: HitLog, k: string): number =>
  h.factors.find((f) => f.key === k)?.value ?? Number.NaN;

describe('真珠追加段 · 阿哈时刻内', () => {
  const r = simulateBattle({
    members,
    monster: MON,
    techniques: false,
    rounds: 3,
    maxTime: 3000,
    seed: 20261106,
    mechanics: ['naturalSelection'],
  } as BattleConfig);

  const moments = r.events.filter((e) => e.unitId === 'ahaMoment');
  const hitsOf = (e: (typeof moments)[number]): HitLog[] =>
    (e.hitSeqs ?? []).map((s) => r.hits.find((h) => h.seq === s)!);

  it('轮初固定 20 笑点时刻里出现 1 段真珠追加段（每次攻击 1 段）', () => {
    const ns = moments.find((e) => (e.note ?? []).includes('stageNsAha'))!;
    expect(ns).toBeTruthy();
    const hs = hitsOf(ns);
    const zz = hs.filter((h) => h.skillCode.endsWith('.zzBonus'));
    expect(zz).toHaveLength(1); // 只有爻光参演 → 1 次攻击 = 1 段
    expect(zz[0]!.source).toBe('yaoguang'); // 伤害归属攻击者，不是真珠
    expect(zz[0]!.kind).toBe('elation');
    // 时刻内 x 取笑点（固定 20）→ 笑点区 1+5×20/260
    expect(factorOf(zz[0]!, 'laugh')).toBeCloseTo(1 + (5 * 20) / 260, 6);
    // 倍率 = 150320 四欢愉档之外的 2 人档（#2=0.15）
    expect(factorOf(zz[0]!, 'base') / 7535.107).toBeCloseTo(0.15, 6);
  });

  it('时刻外不额外追加（同一行动只结算一次）', () => {
    const all = r.hits.filter((h) => h.skillCode.endsWith('.zzBonus'));
    const inMoment = new Set(moments.flatMap((e) => e.hitSeqs ?? []));
    const outside = all.filter((h) => !inMoment.has(h.seq));
    // 时刻外由真珠普攻/直伤行动触发，本次只验证不重复触发（每行动 ≤1 段）
    expect(outside.length).toBeLessThanOrEqual(r.events.filter((e) => e.kind === 'action').length);
  });
});
