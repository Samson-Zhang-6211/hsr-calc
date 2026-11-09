import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  PERFORMANCE_ORDER,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CharId,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

const ALL_ELEMENTS: Element[] = [
  'Physical',
  'Fire',
  'Ice',
  'Wind',
  'Thunder',
  'Quantum',
  'Imaginary',
];

function mp(speed: number, extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Imaginary',
    level: 80,
    hp: 10000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0,
    ...extra,
  };
}

function mon(hp = 1e9, toughness = 9999): MonsterConfig {
  return {
    level: 90,
    hp,
    resistance: {},
    weaknesses: ALL_ELEMENTS,
    maxToughness: toughness,
    speed: 100,
    enemyClass: 'elite',
  };
}

function cfg(members: CombatMember[], overrides: Partial<BattleConfig> = {}): BattleConfig {
  return { members, monster: mon(), rounds: 6, maxTime: 800, techniques: true, ...overrides };
}

function factorOf(
  hit: BattleResult['hits'][number],
  key: string,
): number {
  const f = hit.factors.find((x) => x.key === key);
  if (!f) throw new Error(`factors 缺少 ${key}：${hit.skillCode}`);
  return f.value;
}

function ahaMember(eidolonLevel?: number): CombatMember {
  return { id: 'aha' as CharId, panel: mp(100), eidolonLevel };
}

const jy: CombatMember = { id: 'jingyuan', panel: mp(135, { element: 'Thunder', energyRegen: 0 }) };

function firstEv(r: BattleResult, pred: (e: CombatEvent) => boolean): CombatEvent {
  const ev = r.events.find(pred);
  if (!ev) throw new Error('未找到匹配事件');
  return ev;
}

describe('啊哈 1511（欢愉角色 combat 接入）', () => {
  it('秘技进战：固定20笑点额外回合 + 首事件与欢愉伤害乘区', () => {
    const r = simulateBattle(cfg([ahaMember(), jy]));

    // 进战首事件 = 啊哈攻击类秘技，欢愉技 +1 愿力（天赋 151104）
    const e0 = r.events[0]!;
    expect(e0.unitId).toBe('aha');
    expect(e0.action).toBe('technique');
    expect(e0.skillCode).toBe('aha.technique');
    expect(e0.note).toContain('ahaMomentTech');
    expect(e0.willPowerAfter).toBe(1);

    // 首次阿哈时刻 t=83.33（默认速度 100 + 自身 100/5 = 120 → 10000/120）
    const moment = firstEv(r, (e) => e.unitId === 'ahaMoment');
    expect(moment.time).toBeCloseTo(83.33, 2);

    // 秘技段首命中：0.6 倍率 × 欢愉基础值 7535.107，好活 20 → 笑点区 1+100/260
    const h0 = r.hits[0]!;
    expect(h0.skillCode).toBe('aha.elation');
    expect(factorOf(h0, 'base')).toBeCloseTo(4521.0642, 3);
    expect(factorOf(h0, 'laugh')).toBeCloseTo(1.3846153846153846, 12);
    expect(factorOf(h0, 'mirthBonus')).toBe(1);
    expect(factorOf(h0, 'elationDegree')).toBe(1);
    expect(factorOf(h0, 'defense')).toBeCloseTo(0.47619047619047616, 12);

    // 欢愉技真伤均分：0.2 比例 × 各 1/3
    const td = r.hits[3]!;
    expect(td.kind).toBe('trueDamage');
    expect(td.note).toBe('elationTrue');
    expect(factorOf(td, 'trueDamage')).toBe(0.2);
    expect(factorOf(td, 'split')).toBeCloseTo(1 / 3, 12);

    // 首开大：耗 8 愿力（8→0）、万相 30% 无视防御、3 全体 + 5 弹射 = 8 hits
    const ult = firstEv(r, (e) => e.skillCode === 'aha.ult');
    expect(ult.note).toContain('ahaWanXiang');
    expect(ult.willPowerAfter).toBe(0);
    expect(ult.hitSeqs).toHaveLength(8);
    const ultHit = r.hits[ult.hitSeqs![0]!]!;
    expect(factorOf(ultHit, 'base')).toBeCloseTo(15070.214, 3);
    expect(factorOf(ultHit, 'defense')).toBeCloseTo(0.5649717514124294, 12);

    // 汇总锚点（2026-11-02 重锚：景元秘技 120407 → 神君首轮 +3 段）
    expect(r.report.totalDamage).toBeCloseTo(312611.18, 1);
    expect(r.summary.rounds).toBe(5);
    expect(r.summary.totalTime).toBeCloseTo(600, 2);
    expect(r.finalState.willPower).toBe(5);
    expect(r.finalState.laughPoints).toBe(0);
  });

  it('techniques:false 无秘技进战（对照组）', () => {
    const r = simulateBattle(cfg([ahaMember(), jy], { techniques: false }));

    expect(r.events[0]!.unitId).not.toBe('aha');
    expect(r.events[0]!.skillCode).not.toBe('aha.technique');

    const moment = firstEv(r, (e) => e.unitId === 'ahaMoment');
    expect(moment.time).toBeCloseTo(83.33, 2);

    expect(r.report.totalDamage).toBeCloseTo(278736.15, 1);
    expect(r.summary.rounds).toBe(5);
    expect(r.summary.totalTime).toBeCloseTo(600.0, 2);
    expect(r.finalState.willPower).toBe(4);
  });

  it('阿哈时刻速度：elationAha 面板速度替代与 v1/5 加成', () => {
    // present + panelSpeed150 → 基础 150 + 队内欢愉最高 100/5 = 170 → 10000/170
    const c = simulateBattle(
      cfg([ahaMember(), jy], { elationAha: { present: true, panelSpeed: 150 } }),
    );
    const firstC = firstEv(c, (e) => e.unitId === 'ahaMoment');
    expect(firstC.time).toBeCloseTo(58.824, 2);

    // 默认（无 elationAha、aha 在队）→ 基础 100 + 100/5 = 120
    const d = simulateBattle(cfg([ahaMember(), jy]));
    const firstD = firstEv(d, (e) => e.unitId === 'ahaMoment');
    expect(firstD.time).toBeCloseTo(83.333, 2);
  });

  it('欢愉度面板 + 行迹 point08（速度≥125 高档 +120%）', () => {
    const r = simulateBattle(
      cfg([{ id: 'aha' as CharId, panel: mp(130, { elationDegree: 0.5 }) }, jy]),
    );

    const h = r.hits.find(
      (x) => x.source === 'aha' && (x.skillCode === 'aha.basic' || x.skillCode === 'aha.skill'),
    );
    expect(h).toBeDefined();
    // 1 + 基础欢愉度0.5 + point08 高档1.2 = 2.7
    expect(factorOf(h!, 'elationDegree')).toBe(2.7);

    expect(r.finalState.willPower).toBe(2);
    expect(r.finalState.laughPoints).toBe(0);
    expect(r.finalState.goodWork).toEqual({ aha: 0, jingyuan: 0 });
  });

  it('星魂1：进战+4愿力 与 全队欢愉增笑+15%', () => {
    const r = simulateBattle(cfg([ahaMember(1), jy]));

    // 进战 4 愿力 + 秘技欢愉技 +1 → 首事件 5
    expect(r.events[0]!.willPowerAfter).toBe(5);

    // 增笑 15% 常驻
    expect(factorOf(r.hits[0]!, 'mirthBonus')).toBe(1.15);

    // 愿力更早满 8 → 首开大提前到 t=148.15（e0 为 250）
    const ult = firstEv(r, (e) => e.skillCode === 'aha.ult');
    expect(ult.time).toBeCloseTo(148.15, 2);
    expect(ult.willPowerAfter).toBe(0);

    expect(r.report.totalDamage).toBeCloseTo(420019.28, 1);
    expect(r.summary.rounds).toBe(5);
    expect(r.summary.totalTime).toBeCloseTo(600, 2);
    expect(r.finalState.willPower).toBe(1);
  });

  it('星魂6：欢愉负债地板 + 首开大固定40笑点额外回合 + E2-E5 等级/倍率', () => {
    const r = simulateBattle(cfg([ahaMember(6), jy]));

    // 首开大 note 含 ahaE6，且首开大后立即释放「固定计入40笑点的额外回合」
    // → 该事件共 8（大招）+ 6（额外回合欢愉技含真伤）= 14 hits，8 愿力 → 1
    const ult = firstEv(r, (e) => e.skillCode === 'aha.ult');
    expect(ult.note).toContain('ahaWanXiang');
    expect(ult.note).toContain('ahaE6');
    expect(ult.hitSeqs).toHaveLength(14);
    expect(ult.willPowerAfter).toBe(1);

    // 大招全体段：E5 欢愉技/终招等级提升 → base×1.08；E2 → 行迹lv2 万相 60% 无视防御
    const ultHit = r.hits[ult.hitSeqs![0]!]!;
    expect(ultHit.skillCode).toBe('aha.ult');
    expect(factorOf(ultHit, 'base')).toBeCloseTo(16275.83112, 3);
    expect(factorOf(ultHit, 'defense')).toBeCloseTo(0.6944444444444444, 12);
    expect(factorOf(ultHit, 'mirthBonus')).toBe(1.15);

    // 额外回合欢愉技（笑点区 x=40 固定：1+200/280）；E5 欢愉技+1 → base 0.6→0.66
    const fixedLaugh = r.hits.find(
      (x) =>
        x.source === 'aha' &&
        x.kind === 'elation' &&
        x.skillCode === 'aha.elation' &&
        factorOf(x, 'laugh') > 1.7,
    );
    expect(fixedLaugh).toBeDefined();
    expect(factorOf(fixedLaugh!, 'laugh')).toBeCloseTo(1.7142857142857144, 12);
    expect(factorOf(fixedLaugh!, 'base')).toBeCloseTo(4973.17062, 3);

    // E4：欢愉技真伤倍率 0.2 → 0.25
    const td = r.hits.find((x) => x.kind === 'trueDamage' && x.note === 'elationTrue');
    expect(td).toBeDefined();
    expect(factorOf(td!, 'trueDamage')).toBe(0.25);

    // E6①：敌方生命恒 ≥20% → 进战压缩至 ~8e8
    for (const m of r.finalState.monsters ?? []) {
      expect(m.hp).toBeGreaterThan(7.9e8);
      expect(m.hp).toBeLessThan(8.005e8);
    }

    expect(r.report.totalDamage).toBeCloseTo(576754.38, 1);
    expect(r.summary.rounds).toBe(5);
    expect(r.summary.totalTime).toBeCloseTo(643.33, 2);
    expect(r.finalState.willPower).toBe(4);
  });

  it('行迹 point06：战技追加第二段换令使属性抗性 + 回1SP', () => {
    const res = { Quantum: 0.4, Thunder: 0.1 };
    const ahaQ: CombatMember = { id: 'aha' as CharId, panel: mp(100, { element: 'Quantum' }) };
    const base = (overrides: Partial<BattleConfig>): BattleConfig =>
      cfg([ahaQ, jy], { monster: { ...mon(), resistance: res }, techniques: false, ...overrides });

    // 令使=景元（雷）：第一段吃量子抗 0.4，第二段换令使属性吃雷抗 0.1
    const r = simulateBattle(base({}));
    const ev = firstEv(r, (e) => e.skillCode === 'aha.skill');
    expect(ev.time).toBeCloseTo(100, 2);
    expect(ev.note).toContain('ahaEnvoy');
    expect(ev.hitSeqs).toHaveLength(6);
    const seg1 = r.hits[ev.hitSeqs![0]!]!;
    const seg2 = r.hits[ev.hitSeqs![3]!]!;
    expect(seg1.skillCode).toBe('aha.skill');
    expect(factorOf(seg1, 'base')).toBeCloseTo(3767.5535, 3);
    expect(factorOf(seg1, 'resist')).toBeCloseTo(0.6, 12);
    expect(seg2.skillCode).toBe('aha.point06');
    expect(seg2.note).toBe('ahaPoint06');
    expect(factorOf(seg2, 'base')).toBeCloseTo(753.5107, 3); // 3767.5535×0.2
    expect(factorOf(seg2, 'resist')).toBeCloseTo(0.9, 12);
    // SP：初始3 → 景元战技 −1 → 啊哈战技 −1 + point06 回1 = 2（净不变）
    expect(ev.spAfter).toBe(2);

    // 令使=啊哈自己（mainC=aha）→ 第二段仍量子（resist 0.6）；
    // 战技欢愉度+0.2 落在令使（=啊哈）→ 两段 elationDegree 均 1.2
    const r2 = simulateBattle(base({ mainC: 'aha' as CharId }));
    const ev2 = firstEv(r2, (e) => e.skillCode === 'aha.skill');
    const s1 = r2.hits[ev2.hitSeqs![0]!]!;
    const s2 = r2.hits[ev2.hitSeqs![3]!]!;
    expect(factorOf(s2, 'resist')).toBeCloseTo(0.6, 12);
    expect(factorOf(s1, 'elationDegree')).toBeCloseTo(1.2, 12);
    expect(factorOf(s2, 'elationDegree')).toBeCloseTo(1.2, 12);
  });

  it('参演编号：PERFORMANCE_ORDER 登记 啊哈=1000（阿哈时刻升序排序依据）', () => {
    // 阿哈时刻按参演编号升序依次触发欢愉技（runAhaMoment casters 排序）。
    // 用户 2026-10-08 提供全表（其余角色未接入 combat，接入时补登记）：
    // 爻光116、火花144、开拓者·欢愉120、狼尊999、绯英146、水砂156、真珠104、啊哈1000
    expect(PERFORMANCE_ORDER.aha).toBe(1000);

    // 单欢愉成员场景：排序不改变行为（回归——既有用例的时序/伤害锚点全绿即为证明）
    const r = simulateBattle(cfg([ahaMember(), jy], { techniques: false }));
    const moment = firstEv(r, (e) => e.unitId === 'ahaMoment');
    expect(moment.skillCode).toBe('aha.moment');
  });
});
