import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  BREAK_BASE_LEVEL_80,
  ELATION_BASE_LEVEL_80,
  createInteractiveBattle,
  dispatchDamage,
  lcParams,
  simulateBattle,
  skillParams,
  tickCountdownMood,
  type BattleConfig,
  type BattleStep,
  type CharId,
  type CombatEvent,
  type CombatMember,
  type DecisionInput,
  type InteractiveBattle,
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

function panel(element: Element, speed: number, energyRegen: number): MemberPanel {
  return {
    element,
    level: 80,
    hp: 10000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen,
  };
}

function members(): CombatMember[] {
  return [
    { id: 'qingge', panel: panel('Wind', 156, 0.194) },
    { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
    { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
    { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
  ];
}

function monster(hp = 1e9, toughness = 9999): MonsterConfig {
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

function baseConfig(overrides: Partial<BattleConfig> = {}): BattleConfig {
  return { members: members(), monster: monster(), ...overrides };
}

const neutral = {
  attackerLevel: 80,
  enemyLevel: 90,
  defReduction: 0,
  defIgnore: 0,
  resistance: 0,
  resReduction: 0,
  resPenetration: 0,
  vulnerability: 0,
  damageReductions: [],
  toughness: 'unbroken' as const,
};

describe('伤害七类分发（combat dispatch）', () => {
  it('七种伤害类型全部可计算且为正', () => {
    const direct = dispatchDamage({
      kind: 'direct',
      input: {
        statValue: 2000,
        multiplier: 1.4,
        damageBonus: 0.5,
        critRate: 0.05,
        critDmg: 0.5,
        common: neutral,
      },
    });
    expect(direct.total).toBeGreaterThan(0);

    const dot = dispatchDamage({
      kind: 'dot',
      input: { statValue: 2000, multiplier: 0.6, damageBonus: 0, common: neutral },
    });
    expect(dot.total).toBeGreaterThan(0);

    const breakTrigger = dispatchDamage({
      kind: 'breakTrigger',
      input: {
        breakBase: BREAK_BASE_LEVEL_80,
        element: 'Physical',
        toughnessPoints: 30,
        breakEffect: 0,
        breakDmgBoost: 0,
        breakVuln: 0,
        common: neutral,
      },
    });
    expect(breakTrigger.total).toBeGreaterThan(0);

    const breakDot = dispatchDamage({
      kind: 'breakDot',
      input: {
        breakBase: BREAK_BASE_LEVEL_80,
        dotType: 'bleed',
        stacks: 1,
        breakEffect: 0,
        breakDmgBoost: 0,
        breakVuln: 0,
        toughnessPoints: 30,
        enemyMaxHp: 100000,
        enemyClass: 'elite',
        common: neutral,
      },
    });
    expect(breakDot.total).toBeGreaterThan(0);

    const superBreak = dispatchDamage({
      kind: 'superBreak',
      input: {
        breakBase: BREAK_BASE_LEVEL_80,
        breakEffect: 0,
        skillToughnessPoints: 30,
        toughnessBoost: 0,
        weaknessBreakEfficiency: 1,
        superBreakBonus: 0,
        breakDmgBoost: 0,
        breakVuln: 0,
        common: neutral,
      },
    });
    expect(superBreak.total).toBeGreaterThan(0);

    const elation = dispatchDamage({
      kind: 'elation',
      input: {
        elationBase: ELATION_BASE_LEVEL_80,
        multiplier: 1,
        elationDegree: 0,
        mirthBonus: 0,
        mode: 'normal',
        goodWorkReward: 1,
        laughPoints: 0,
        critRate: 0,
        critDmg: 0,
        common: neutral,
      },
    });
    expect(elation.total).toBeGreaterThan(0);

    const trueDmg = dispatchDamage({
      kind: 'trueDamage',
      input: { originalTotal: 5000, ratio: 0.24 },
    });
    expect(trueDmg.total).toBeCloseTo(1200, 8);
    expect(trueDmg.kind).toBe('trueDamage');
  });
});

describe('战斗主循环（四人队 vs 自定义木桩）', () => {
  it('基础流程：产生事件与直伤，SP/能量不越界', () => {
    const r = simulateBattle(baseConfig({ maxTime: 350 }));
    expect(r.events.length).toBeGreaterThan(10);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.report.totalDamage).toBeGreaterThan(0);
    expect(r.report.byKind.direct).toBeGreaterThan(0);
    for (const e of r.events) {
      if (e.spAfter !== undefined) {
        expect(e.spAfter).toBeGreaterThanOrEqual(0);
        expect(e.spAfter).toBeLessThanOrEqual(5);
      }
      if (e.energyAfter !== undefined) expect(e.energyAfter).toBeGreaterThanOrEqual(0);
    }
    const counts = r.summary.actionCounts;
    expect(counts.qingge ?? 0).toBeGreaterThan(0);
    expect(counts.jingyuan ?? 0).toBeGreaterThan(0);
    expect(r.finalState.energy.qingge).toBeLessThanOrEqual(140);
    expect(r.finalState.energy.sunday).toBeLessThanOrEqual(130);
    // 秘技：腾荒免战技点战技开局
    expect(r.events.some((e) => e.action === 'technique')).toBe(true);
    // 神君参与行动
    expect(counts.shenjun ?? 0).toBeGreaterThan(0);
  });

  it('低血量木桩 → 胜利结算', () => {
    const r = simulateBattle(baseConfig({ monster: monster(3000, 9999) }));
    expect(r.victory).toBe(true);
    expect(r.monsterHpLeft).toBe(0);
    expect(r.events[r.events.length - 1].kind).toBe('victory');
    // 胜利后不再产生伤害
    const lastHit = r.hits[r.hits.length - 1];
    const victoryEvent = r.events[r.events.length - 1];
    expect(lastHit.time).toBeLessThanOrEqual(victoryEvent.time);
  });

  it('低韧性木桩 → 击破触发 + 击破 DoT 跳伤', () => {
    const r = simulateBattle(baseConfig({ monster: monster(1e9, 60), maxTime: 500 }));
    expect(r.report.byKind.breakTrigger ?? 0).toBeGreaterThan(0);
    expect(r.report.byKind.breakDot ?? 0).toBeGreaterThan(0);
    expect(r.hits.some((h) => h.kind === 'breakDot')).toBe(true);
    // 破韧后保持已破韧状态、韧性回满
    expect(r.finalState.monsterToughness).toBeGreaterThan(0);
  });

  it('自定义 policy 覆盖默认决策（全部普攻）', () => {
    const r = simulateBattle(
      baseConfig({
        maxTime: 350,
        policy: () => 'basic',
      }),
    );
    expect(r.summary.actionCounts.jingyuan ?? 0).toBeGreaterThan(0);
    const usedSkill = r.events.some(
      (e) => e.action === 'skill' && (e.unitId === 'jingyuan' || e.unitId === 'sunday'),
    );
    expect(usedSkill).toBe(false);
    // 纯普攻攒 SP → 上限 5
    expect(r.summary.spFinal).toBe(5);
  });

  it('长局：晴歌进入 Fever（事件与最终状态）', () => {
    const r = simulateBattle(baseConfig({ rounds: 10, maxTime: 1000 }));
    expect(r.finalState.fever).toBe(true);
    expect(r.events.some((e) => (e.note ?? []).includes('enterFever'))).toBe(true);
    expect(r.finalState.present.beisi).toBe(true);
    // 气氛值为整数
    expect(Number.isInteger(r.finalState.mood)).toBe(true);
    expect(r.finalState.mood).toBeGreaterThanOrEqual(0);
  });

  it('队伍校验：1-4 人合法；重复 / 非法速度报错', () => {
    // 自由编成 1-4 人任意组合合法（旧「缺员」断言曾被秘技无腾荒守卫缺失的崩溃意外满足）
    const trio = members().slice(0, 3);
    expect(() => simulateBattle({ members: trio, monster: monster() })).not.toThrow();
    const dup = [...members()];
    dup[1] = dup[0];
    expect(() => simulateBattle({ members: dup, monster: monster() })).toThrow();
    const slow = members();
    slow[0] = { ...slow[0], panel: { ...slow[0].panel, speed: 0 } };
    expect(() => simulateBattle({ members: slow, monster: monster() })).toThrow();
  });

  it('技能等级生效：景元普攻 6 级总伤低于 10 级', () => {
    const run = (lv: number) =>
      simulateBattle(
        baseConfig({
          maxTime: 150,
          policy: () => 'basic',
          members: members().map((m) =>
            m.id === 'jingyuan' ? { ...m, skillLevels: { basic: lv } } : m,
          ),
        }),
      );
    const d6 = run(6).report.totalDamage;
    const d10 = run(10).report.totalDamage;
    expect(d6).toBeGreaterThan(0);
    expect(d6).toBeLessThan(d10);
  });

  it('忆灵技等级生效：memoSkill 6 级忆灵技伤害低于 10 级', () => {
    const run = (lv: number) =>
      simulateBattle(
        baseConfig({
          rounds: 10,
          maxTime: 1000,
          members: members().map((m) =>
            m.id === 'qingge' ? { ...m, skillLevels: { memoSkill: lv } } : m,
          ),
        }),
      );
    const memoDamage = (r: ReturnType<typeof simulateBattle>): number =>
      r.report.bySkill.find((s) => s.skillCode === 'qingge.memo')?.damage ?? 0;
    const d6 = memoDamage(run(6));
    const d10 = memoDamage(run(10));
    expect(d6).toBeGreaterThan(0);
    expect(d6).toBeLessThan(d10);
  });

  it('报告：按来源/技能聚合且总和一致', () => {
    const r = simulateBattle(baseConfig({ maxTime: 350 }));
    const sumBySource = r.report.bySource.reduce((a, s) => a + s.damage, 0);
    expect(sumBySource).toBeCloseTo(r.report.totalDamage, 6);
    const sumByKind = Object.values(r.report.byKind).reduce((a, b) => a + (b ?? 0), 0);
    expect(sumByKind).toBeCloseTo(r.report.totalDamage, 6);
    expect(r.report.bySkill.length).toBeGreaterThan(0);
    // 明细日志与事件时间对齐
    for (const h of r.hits) {
      expect(h.factors.length).toBeGreaterThan(0);
      expect(h.total).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('面板增伤拆分（commonBonus + elementDmg）', () => {
  /** factors 为乘区形式：damageBonus 记 1+增伤；战斗内可能有既有增伤 buff，故用基线对比 */
  const factorOf = (h: { factors: readonly { key: string; value: number }[] }): number =>
    h.factors.find((f) => f.key === 'damageBonus')?.value ?? 0;

  const runWith = (patch: Partial<MemberPanel>) =>
    simulateBattle({
      members: members().map((m) => ({ ...m, panel: { ...m.panel, ...patch } })),
      monster: monster(),
      rounds: 10,
      maxTime: 1000,
    });

  const firstHit = (r: ReturnType<typeof simulateBattle>, source: string) => {
    const h = r.hits.find((x) => x.source === source && x.kind === 'direct');
    expect(h, `no direct hit by ${source}`).toBeDefined();
    return factorOf(h!);
  };

  /** 任意非雷归属（非景元/神君）的首个直伤——验证不吃 Thunder 属性增伤 */
  const firstNonThunderHit = (r: ReturnType<typeof simulateBattle>) => {
    const h = r.hits.find(
      (x) => x.kind === 'direct' && x.source !== 'jingyuan' && x.source !== 'shenjun',
    );
    expect(h, 'no non-thunder direct hit').toBeDefined();
    return factorOf(h!);
  };

  it('增伤区 = 通用增伤 + 该次伤害属性增伤；旧字段 damageBonus 不重复计入', () => {
    const base = runWith({});
    const split = runWith({ commonBonus: 0.1, elementDmg: { Thunder: 0.5 } });
    // 景元（雷）：+0.6（common 0.1 + Thunder 0.5）
    expect(firstHit(split, 'jingyuan') - firstHit(base, 'jingyuan')).toBeCloseTo(0.6, 10);
    // 非雷归属（忆灵/腾荒等）：只吃通用增伤 0.1，不吃 Thunder 0.5
    expect(firstNonThunderHit(split) - firstNonThunderHit(base)).toBeCloseTo(0.1, 10);

    // elementDmg 含该角色属性键时，旧字段 damageBonus 不额外叠加
    const both = runWith({
      damageBonus: 0.3888,
      commonBonus: 0.1,
      elementDmg: { Thunder: 0.5 },
    });
    expect(firstHit(both, 'jingyuan') - firstHit(base, 'jingyuan')).toBeCloseTo(0.6, 10);
  });

  it('旧面板回退：无 elementDmg/commonBonus 时 damageBonus 作用于该角色属性', () => {
    const base = runWith({});
    const legacy = runWith({ damageBonus: 0.3888 });
    expect(firstHit(legacy, 'jingyuan') - firstHit(base, 'jingyuan')).toBeCloseTo(0.3888, 10);
  });
});

describe('配装条件子句（光锥/遗器/位面）', () => {
  const factorOf = (h: { factors: readonly { key: string; value: number }[] }, key: string): number =>
    h.factors.find((f) => f.key === key)?.value ?? 0;

  /** 晴歌/周日/景元战技、腾荒普攻（留SP）；maxTime 100 内：腾荒44.8→晴歌51.3→景元74.1→周日74.6（晴歌含秘技拉条20%） */
  const runA = (): ReturnType<typeof simulateBattle> =>
    simulateBattle(
      baseConfig({
        rounds: 1,
        maxTime: 100,
        critMode: 'crit',
        policy: ({ id }) => (id === 'tenghuang' ? 'basic' : 'skill'),
      }),
    );

  it('景元首击乘区：拂晓18%+记忆永不落幕16%+救世主15%；攻区含露莎卡×2；暴伤含隐士+蕉乐园', () => {
    const r = runA();
    const jy = r.hits.find((h) => h.source === 'jingyuan' && h.kind === 'direct');
    expect(jy).toBeDefined();
    // 增伤 = 面板0 + 拂晓战技0.18 + 记忆永不落幕0.16 + 救世主0.15 + 秘技·我们自成旋律0.3（全队进战增伤）
    expect(factorOf(jy!, 'damageBonus')).toBeCloseTo(1 + 0.18 + 0.16 + 0.15 + 0.3, 10);
    // 暴伤 = 面板0.5 + 隐士0.15 + 蕉乐园0.32（蒙福者/司铎未触发：周日尚在景元之后行动）
    expect(factorOf(jy!, 'crit')).toBeCloseTo(1 + 0.5 + 0.15 + 0.32, 10);
    // 攻击区 = 面板2000 × (1 + 露莎卡12%×2) × 战技倍率（乐队4为战技后施加，当次不吃）
    expect(factorOf(jy!, 'base')).toBeCloseTo(2000 * (1 + 0.12 * 2) * skillParams('120402', 10)[0], 10);
    // 景元战技事件附乐队4 note
    const act = r.events.find((e) => e.kind === 'action' && e.unitId === 'jingyuan');
    expect(act?.note ?? []).toContain('band4');
  });

  it('拂晓梦身：神君追加攻击+48%；隐士挂神君而蕉乐园不挂（现状口径，待核①）', () => {
    const r = runA();
    const sl = r.hits.find((h) => h.source === 'shenjun');
    expect(sl).toBeDefined();
    // 神君 = 非忆灵类召唤物，继承景元全部正面 buff（2026-10 裁定），结算读景元 holder：
    // 增伤 = 面板0 + 拂晓梦身0.48 + 记忆永不落幕0.16 + 救世主0.15 + 周日战技0.8 + 圣咏2层(0.15×2)
    //      + 秘技·荣光之秘0.5（周日战技触发）；秘技·我们自成旋律0.3 已过期——景元至神君前已行动3次，
    //      2回合 buff 在第3动结束归零（justApplied 免首动递减）
    //      （绸缪/崇高拂尘接入后周日初始90能量，runA 内战技+大招同刻连发 → 圣咏2层、蒙福者/破阵出现）
    expect(factorOf(sl!, 'damageBonus')).toBeCloseTo(1 + 0.48 + 0.16 + 0.15 + 0.8 + 0.15 * 2 + 0.5, 10);
    // 暴伤 = 面板0.5 + 隐士0.15 + 蕉乐园0.32 + 司铎2层(0.18×2) + 蒙福者0.27(周日暴伤0.5×0.3+0.12)
    //      + 行迹·破阵0.25（神君 stacks=10≥6 触发）+ 行迹·偏离和弦0.685（0.4+触发时气氛19×0.015）
    //      触发源=景元攻击授予（1基础+2特邀=+3）；tongpao=开战角色（晴歌，slots[0]）后葳蕤不挂
    //      景元 → 腾荒整场不开大（旧口径挂景元时腾荒大招+1气势）→ 此处气势 19 而非旧值 20
    expect(factorOf(sl!, 'crit')).toBeCloseTo(
      1 + 0.5 + 0.15 + 0.32 + 0.18 * 2 + 0.27 + 0.25 + (0.4 + 19 * 0.015),
      10,
    );
    // 攻区 = 面板2000 × (1 + 露莎卡12%×2 + 乐队4 20%) × 天赋倍率（景元第2动战技重挂乐队4）
    expect(factorOf(sl!, 'base')).toBeCloseTo(
      2000 * (1 + 0.12 * 2 + 0.2) * skillParams('120404', 10)[1],
      10,
    );
  });

  it('周日光锥23034：战技/终结技触发回能+圣咏+司铎；每2次战技或终结技回1战技点；回能吃充能效率', () => {
    const r = simulateBattle(
      baseConfig({
        rounds: 2,
        maxTime: 350,
        policy: ({ id }) => (id === 'tenghuang' ? 'basic' : 'skill'),
      }),
    );
    const acts = r.events.filter((e) => e.kind === 'action' && e.unitId === 'sunday');
    expect(acts.length).toBeGreaterThanOrEqual(2);
    for (const key of ['flightEnergy', 'hymn', 'sidor']) {
      expect(acts[0].note ?? []).toContain(key);
      expect(acts[1].note ?? []).toContain(key);
    }
    // 战技点计数（2026-10 修正）：仅单体战技/终结技计数、普攻不计，满2次回1。
    // 本例时序 = 战技1(count1,不回) → 终结技(count2,回) → 战技2(count3,不回)
    expect(acts[0].note ?? []).not.toContain('flightSp');
    expect(acts[1].note ?? []).not.toContain('flightSp');
    // 终结技也触发光锥；回能 = (自开大5 + 光锥6) × 充能效率(1.194)
    const ult = r.events.find((e) => e.kind === 'ult' && e.unitId === 'sunday');
    expect(ult).toBeDefined();
    for (const key of ['blessed', 'flightEnergy', 'hymn', 'sidor', 'flightSp']) {
      expect(ult?.note ?? []).toContain(key);
    }
    expect(ult?.energyAfter ?? 0).toBeCloseTo((5 + 6) * 1.194, 6);
  });

  it('晴歌光锥24005+救世主4：战技后全队增伤刷新；贝茜在场的普攻再次刷新', () => {
    const r = simulateBattle(
      baseConfig({
        // 晴歌召唤+忆灵回能涨快：战技后很快开大进 Fever；退出后重召、再下一动普攻
        rounds: 10,
        maxTime: 600,
        techniques: false,
        policy: ({ id, beisiPresent }) =>
          id === 'qingge' ? (beisiPresent ? 'basic' : 'skill') : 'basic',
      }),
    );
    const acts = r.events.filter((e) => e.kind === 'action' && e.unitId === 'qingge');
    expect(acts.length).toBeGreaterThanOrEqual(2);
    // 首动战技：召唤贝茜 + 记忆永不落幕 + 救世主
    expect(acts[0].note ?? []).toContain('summonBeisi');
    expect(acts[0].note ?? []).toContain('memNotFade');
    expect(acts[0].note ?? []).toContain('savior');
    // 贝茜在场的后续普攻：只刷新救世主（光锥buff不重置）
    const basic = acts.find((e) => e.action === 'basic');
    expect(basic, '晴歌普攻事件').toBeDefined();
    expect(basic!.note ?? []).toContain('savior');
    expect(basic!.note ?? []).not.toContain('memNotFade');
  });

  it('位面308生命的翁瓦克：腾荒速度≥120 进战行动提前40%', () => {
    const firstTenghuangT = (speed: number): number => {
      const r = simulateBattle(
        baseConfig({
          rounds: 1,
          maxTime: 200,
          members: members().map((m) =>
            m.id === 'tenghuang' ? { ...m, planarsetId: '308', panel: { ...m.panel, speed } } : m,
          ),
        }),
      );
      const ev = r.events.find((e) => e.kind === 'action' && e.unitId === 'tenghuang' && e.action !== 'technique');
      expect(ev).toBeDefined();
      return ev!.time;
    };
    // 2026-11-07 用户裁定 A：葳蕤（无条件 40%）与位面 308（速度≥120 再 40%）**叠加**。
    // 两次提前叠加后腾荒直接在 t=0 行动；速度<120 只吃葳蕤一次，仍晚于 t=0。
    const t134 = firstTenghuangT(134);
    const t119 = firstTenghuangT(119);
    expect(t134).toBeLessThan(t119);
    expect(t119).toBeGreaterThan(0);
  });

  it('事件附 buff 快照：进战初始化配装 buff 与景元乐队4可见', () => {
    const r = simulateBattle(baseConfig({ rounds: 1, maxTime: 150, policy: () => 'skill' }));
    const first = r.events[0];
    const jy = first.buffs?.['jingyuan'] ?? [];
    expect(jy.some((b) => b.labelKey === 'banana')).toBe(true); // 蕉乐园·暴伤（永久）
    expect(jy.filter((b) => b.labelKey === 'rucaca').length).toBe(2); // 双露莎卡
    const th = first.buffs?.['tenghuang'] ?? [];
    expect(th.some((b) => b.labelKey === 'hermit')).toBe(true); // 隐士4
    const qg = first.buffs?.['qingge'] ?? [];
    expect(qg.some((b) => b.labelKey === 'hermit')).toBe(true);
    // 景元战技后：乐队4（持续1回合）在该事件快照里
    const bandEv = r.events.find((e) => e.note?.includes('band4'));
    expect(bandEv).toBeDefined();
    const band = (bandEv!.buffs?.['jingyuan'] ?? []).find((b) => b.labelKey === 'band4');
    expect(band).toBeDefined();
    expect(band!.duration).toBe(1);
    expect(band!.value).toBeCloseTo(0.2, 10);
  });
});

describe('真实伤害挂点（全伤害通道，BattleConfig.trueConversion）', () => {
  it('direct 通道：每个直伤 hit 后紧跟等比真伤 hit', () => {
    const r = simulateBattle(baseConfig({ rounds: 1, maxTime: 150, trueConversion: 0.24 }));
    const d = r.hits.find((h) => h.kind === 'direct');
    expect(d).toBeDefined();
    const t = r.hits[d!.seq + 1];
    expect(t.kind).toBe('trueDamage');
    expect(t.source).toBe(d!.source);
    expect(t.skillCode).toBe(d!.skillCode);
    expect(t.note).toBe('trueDamage');
    expect(t.total).toBeCloseTo(d!.total * 0.24, 6);
    expect(t.factors).toEqual([
      { key: 'base', value: d!.total },
      { key: 'trueDamage', value: 0.24 },
    ]);
  });

  it('破韧触发与 DoT 跳伤通道同样挂点', () => {
    const r = simulateBattle({
      members: members(),
      monster: monster(1e9, 60),
      rounds: 3,
      maxTime: 350,
      trueConversion: 0.24,
    });
    const bt = r.hits.find((h) => h.kind === 'breakTrigger');
    expect(bt).toBeDefined();
    const btTrue = r.hits[bt!.seq + 1];
    expect(btTrue.kind).toBe('trueDamage');
    expect(btTrue.total).toBeCloseTo(bt!.total * 0.24, 6);

    const bd = r.hits.find((h) => h.kind === 'breakDot');
    expect(bd).toBeDefined();
    const bdTrue = r.hits[bd!.seq + 1];
    expect(bdTrue.kind).toBe('trueDamage');
    expect(bdTrue.total).toBeCloseTo(bd!.total * 0.24, 6);
  });

  it('未配置 trueConversion 时无真伤 hit（回归）', () => {
    const r = simulateBattle(baseConfig({ rounds: 1, maxTime: 150 }));
    expect(r.hits.some((h) => h.kind === 'trueDamage')).toBe(false);
    expect(r.report.byKind.trueDamage ?? 0).toBe(0);
  });
});

describe('忆灵 = 同一单位「晴空乐手」（2026-10 裁定）', () => {
  it('忆灵行动按三木桩展开（1151201 AoE → hitSeqs = 存活木桩数 3，不按在场只数分段）', () => {
    const r = simulateBattle(baseConfig({ rounds: 3, maxTime: 350 }));
    const memoEvents = r.events.filter((e) => e.action === 'memo');
    expect(memoEvents.length).toBeGreaterThan(0);
    for (const e of memoEvents) {
      expect(e.hitSeqs?.length).toBe(3);
    }
    for (const h of r.hits) {
      if (h.skillCode === 'qingge.memo') expect(h.kind).toBe('direct');
    }
  });

  it('忆灵回能：召唤回 20（1151205）+ 每次行动回 20（1151201 sp_base，×充能效率）', () => {
    const r = simulateBattle(
      baseConfig({ rounds: 3, maxTime: 350, techniques: false, policy: () => 'skill' }),
    );
    // 首动战技（memo 尚未行动）= 70 + 战技30×1.194 + 召唤20×1.194（1151205）
    //   + 即兴蓝调3固定（腾荒首动战技→晴歌受盾获气氛→消耗1层律动）
    // （若无 1151205 召唤回能则 108.82）
    const first = r.events.find((e) => e.kind === 'action' && e.unitId === 'qingge');
    expect(first?.energyAfter).toBeCloseTo(70 + (30 + 20) * 1.194 + 3, 6);
    // 下界守恒：忆灵每动至少 +20×1.194（期间即兴蓝调等穿插只会更多；晴歌事件更新基准，
    // 含 ult 开大清零；上限140）
    let last = 0;
    let memoCount = 0;
    for (const e of r.events) {
      if (e.unitId === 'qingge') {
        if (e.energyAfter !== undefined) last = e.energyAfter;
      } else if (e.unitId === 'memo' && e.kind === 'action') {
        expect(e.energyAfter, `memo t=${e.time}`).toBeGreaterThanOrEqual(
          Math.min(140, last + 20 * 1.194) - 1e-6,
        );
        expect(e.energyAfter!, `memo t=${e.time} 上限`).toBeLessThanOrEqual(140);
        last = e.energyAfter!;
        memoCount += 1;
      }
    }
    expect(memoCount).toBeGreaterThan(0);
  });
});

describe('四人行迹（2026-10 全量接入）', () => {
  /** 全员战技（腾荒含护盾/神秀路径） */
  const runSkill = (rounds: number, maxTime: number): ReturnType<typeof simulateBattle> =>
    simulateBattle(
      baseConfig({ rounds, maxTime, policy: () => 'skill' }),
    );

  it('绸缪+崇高拂尘：初始能量 = 上限50% + 15/25（首事件回能落点区分）', () => {
    const r = runSkill(1, 100);
    const sun = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'sunday' && e.action !== 'technique',
    );
    // 90 起手：战技30×1.194 + 光锥6×1.194 → 132.98 截断130；无崇高拂尘则 65 起手 ≤108
    expect(sun?.energyAfter ?? 0).toBeGreaterThanOrEqual(120);
    const jy = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'jingyuan' && e.action !== 'technique',
    );
    // 80 起手：战技+30（无充能效率）→110；无绸缪则 95 起步。
    // （晴歌召唤/忆灵回能使晴歌与周日大招提前 → 景元首动可能已被主日渴慕/晴歌大招补满触顶，只验下界）
    expect(jy?.energyAfter ?? 0).toBeGreaterThanOrEqual(105);
  });

  it('重构谐乐：晴歌与忆灵进战即持暴击率+50%（常驻）', () => {
    const r = runSkill(1, 150);
    const first = r.events[0];
    for (const id of ['qingge', 'memo'] as const) {
      const b = (first.buffs?.[id] ?? []).find((x) => x.labelKey === 'traceZhongGou');
      expect(b, id).toBeDefined();
      expect(b!.key).toBe('critRate');
      expect(b!.value).toBeCloseTo(0.5, 10);
      expect(b!.duration).toBe(-1);
    }
  });

  it('遣将：景元战技后自身暴击率+10%、持续2回合', () => {
    const r = runSkill(1, 100);
    const act = r.events.find((e) => e.kind === 'action' && e.unitId === 'jingyuan');
    expect(act?.note ?? []).toContain('traceQianJiang');
    const b = (act!.buffs?.['jingyuan'] ?? []).find((x) => x.labelKey === 'traceQianJiang');
    expect(b).toBeDefined();
    expect(b!.key).toBe('critRate');
    expect(b!.value).toBeCloseTo(0.1, 10);
    expect(b!.duration).toBe(2);
  });

  it('神秀+偏离和弦+护盾：腾荒战技事件同帧可见三类增益', () => {
    const r = runSkill(1, 150);
    const act = r.events.find((e) => e.kind === 'action' && e.unitId === 'tenghuang' && e.action === 'skill');
    expect(act).toBeDefined();
    // 神秀：景元攻击力固定提高 = 腾荒15%攻击力（常驻）
    const shen = (act!.buffs?.['jingyuan'] ?? []).find((x) => x.labelKey === 'traceShenXiu');
    expect(shen).toBeDefined();
    expect(shen!.key).toBe('atkFlat');
    expect(shen!.source).toBe('tenghuang');
    expect(shen!.value).toBeCloseTo(2000 * 0.15, 10);
    // 偏离和弦：腾荒使晴歌受盾+1气氛 → 给腾荒；面板攻击相等走暴伤分支
    const dev = (act!.buffs?.['tenghuang'] ?? []).find((x) => x.labelKey === 'deviation');
    expect(dev).toBeDefined();
    expect(dev!.key).toBe('critDmg');
    expect(dev!.value).toBeCloseTo(0.4 + (act!.moodAfter ?? 0) * 0.015, 10);
    expect(dev!.duration).toBe(2);
    // 护盾按增益计入：四成员快照含 shield（值 = 腾荒攻×战技盾%+固定，随 shieldTurns 递减展示）
    const p = skillParams('141402', 10);
    const shieldValue = 2000 * p[0] + p[1];
    for (const id of ['qingge', 'sunday', 'jingyuan', 'tenghuang'] as const) {
      const sh = (act!.buffs?.[id] ?? []).find((x) => x.key === 'shield');
      expect(sh, id).toBeDefined();
      expect(sh!.value).toBeCloseTo(shieldValue, 6);
      expect(sh!.duration).toBeGreaterThan(0);
    }
  });

  it('偏离和弦：晴歌大招后景元攻击使晴歌获得气氛 → 给景元暴伤/攻击提高', () => {
    const r = runSkill(4, 400);
    const ultIdx = r.events.findIndex((e) => e.kind === 'ult' && e.unitId === 'qingge');
    expect(ultIdx).toBeGreaterThanOrEqual(0);
    const dev = r.events
      .slice(ultIdx + 1)
      .find((e) => e.kind === 'action' && e.unitId === 'jingyuan');
    expect(dev).toBeDefined();
    const b = (dev!.buffs?.['jingyuan'] ?? []).find((x) => x.labelKey === 'deviation');
    expect(b).toBeDefined();
    expect(b!.duration).toBe(2);
    // 景元面板攻击 2000 不 > 晴歌 2000 → 暴伤分支：40% + 气氛×1.5%
    expect(b!.key).toBe('critDmg');
    expect(b!.value).toBeCloseTo(0.4 + (dev!.moodAfter ?? 0) * 0.015, 10);
  });

  it('偏离和弦（通用规则 2026-10 裁定）：忆灵行动使晴歌获得气氛 → 忆灵归属（晴歌）带 buff', () => {
    const r = runSkill(2, 400);
    const memoEv = r.events.find((e) => e.kind === 'action' && e.unitId === 'memo');
    expect(memoEv).toBeDefined();
    // 旧实现忆灵行动处无手动触发（非特邀/护盾两源）→ 此断言旧代码为 false
    const dev = (memoEv!.buffs?.['qingge'] ?? []).find((x) => x.labelKey === 'deviation');
    expect(dev).toBeDefined();
    expect(dev!.duration).toBe(2);
    expect(dev!.key).toBe('critDmg');
    expect(dev!.value).toBeCloseTo(0.4 + (memoEv!.moodAfter ?? 0) * 0.015, 10);
  });

  it('破阵：神君段数≥6 的行动使景元 holder 获得暴伤+25%（1回合）', () => {
    const r = runSkill(2, 350);
    const sj = r.events.find((e) => e.unitId === 'shenjun' && (e.stacks ?? 0) >= 6);
    expect(sj).toBeDefined();
    expect(sj?.note ?? []).toContain('tracePoZhen');
    const b = (sj!.buffs?.['jingyuan'] ?? []).find((x) => x.labelKey === 'tracePoZhen');
    expect(b).toBeDefined();
    expect(b!.key).toBe('critDmg');
    expect(b!.value).toBeCloseTo(0.25, 10);
    expect(b!.duration).toBe(1);
  });

  it('峥嵘：强化龙灵行动 = 腾荒段 + 同袍段 + 峥嵘单体段（hitSeqs 3 段）', () => {
    const r = runSkill(1, 150);
    const enh = r.events.find((e) => e.unitId === 'longling' && (e.note ?? []).includes('enhanceAct'));
    expect(enh).toBeDefined();
    expect(enh!.hitSeqs?.length).toBe(3);
  });
});

describe('Fever 倒计时扣减（tickCountdownMood，1151203 #6=12/#10=50%）', () => {
  it('mood>=24 走 50% 扣除（奇数向下取整）', () => {
    expect(tickCountdownMood(30)).toBe(15);
    expect(tickCountdownMood(25)).toBe(12);
    expect(tickCountdownMood(24)).toBe(12);
  });

  it('mood<24 走 12 点下限；扣到 0 退出', () => {
    expect(tickCountdownMood(22)).toBe(10);
    expect(tickCountdownMood(13)).toBe(1);
    expect(tickCountdownMood(12)).toBe(0);
    expect(tickCountdownMood(0)).toBe(0);
  });
});

describe('全真模拟交互控制器', () => {
  it('推进到决策点等待玩家选择；逐步提交直至战斗结束', () => {
    const ctl = createInteractiveBattle(baseConfig());
    let step = ctl.advance();
    let decisions = 0;
    let events = 0;
    let guard = 0;
    while (step && guard < 2000) {
      guard += 1;
      if (step.type === 'decision') {
        decisions += 1;
        expect(['qingge', 'sunday', 'jingyuan', 'tenghuang']).toContain(step.unitId);
        step = ctl.advance({ action: step.status.sp >= 1 ? 'skill' : 'basic' });
      } else {
        events += 1;
        step = ctl.advance();
      }
    }
    expect(guard).toBeLessThan(2000);
    expect(decisions).toBeGreaterThan(0);
    expect(events).toBeGreaterThan(0);
    expect(step).toBeNull();
    expect(ctl.finished).toBe(true);
    const r = ctl.result();
    expect(r).not.toBeNull();
    expect(r!.events.length).toBe(events);
  });

  it('能量已满时 requestUlt 在决策等待期间立即插队释放终结技', () => {
    const ctl = createInteractiveBattle(baseConfig());
    let step = ctl.advance();
    let readyId: CharId | '' = '';
    let guard = 0;
    while (step && guard < 1000) {
      guard += 1;
      if (step.type === 'decision' && step.status.ultReady.length > 0) {
        readyId = step.status.ultReady[0];
        break;
      }
      step = step.type === 'decision' ? ctl.advance({ action: 'basic' }) : ctl.advance();
    }
    expect(readyId).not.toBe('');
    if (!readyId) throw new Error('unreachable');
    ctl.requestUlt(readyId);
    // 无参唤醒：引擎先插队释放终结技，再回到同一决策
    const after = ctl.advance();
    expect(after).not.toBeNull();
    expect(after!.type).toBe('event');
    if (after!.type === 'event') {
      expect(after!.event.kind).toBe('ult');
      expect(after!.event.unitId).toBe(readyId);
    }
    // 大招事件吐出后回到原决策点
    const back = ctl.advance();
    expect(back).not.toBeNull();
    expect(back!.type).toBe('decision');
  });

  it('运行中（事件流之间）点终结技：下次推进即插队释放', () => {
    const ctl = createInteractiveBattle(baseConfig());
    let step = ctl.advance();
    let readyId: CharId | '' = '';
    let guard = 0;
    while (step && guard < 1000) {
      guard += 1;
      if (step.status.ultReady.length > 0) {
        readyId = step.status.ultReady[0];
        break;
      }
      step = step.type === 'decision' ? ctl.advance({ action: 'basic' }) : ctl.advance();
    }
    expect(readyId).not.toBe('');
    if (!readyId) throw new Error('unreachable');
    ctl.requestUlt(readyId);
    let next = ctl.advance();
    let found = false;
    guard = 0;
    while (next && guard < 30) {
      guard += 1;
      if (next.type === 'event' && next.event.kind === 'ult' && next.event.unitId === readyId) {
        found = true;
        break;
      }
      next = next.type === 'decision' ? ctl.advance({ action: 'basic' }) : ctl.advance();
    }
    expect(found).toBe(true);
  });

  it('status 快照随 step 携带 SP/能量（决策点可判断终结技可用）', () => {
    const ctl = createInteractiveBattle(baseConfig());
    let step = ctl.advance();
    let guard = 0;
    while (step && guard < 500) {
      guard += 1;
      if (step.type === 'decision') {
        expect(step.status.sp).toBeGreaterThanOrEqual(0);
        expect(step.status.sp).toBeLessThanOrEqual(5);
        // energy 为全 CharId 键（含 aha 恒 0：啊哈用愿力开大；火花开战键=80；langzun 恒 0=隐藏分另存；shuisha/zhenzhu/tibao 正常能量；trailblazerMem/Mem2 记忆开拓者双 id；tails 藿藿；xiedie/fengjin/changyeyue/xilian 记忆四人；cerdra/robin/ruanmei/trailblazerShaman/trailblazerShaman2 同谐四人；asta/bronya/tingyun/yukong/hanya 同谐收尾五人；luocha/lingsha/natasha/lynx/bailu/gallagher 丰饶六人；hysilens 海瑟音；welt/pela/sampo 虚无三人；yinlang/jiaoqiu/huangquan/qianye 虚无批四人；luka/guinaifen/saifeir 虚无收尾三人；dahlia/fugue 收官二人；himeko/rappa 智识接入二人；sanyueqi/gepard/aventurine 存护批并行接入；saber/gilgamesh/misha 毁灭三人）
        expect(Object.keys(step.status.energy).length).toBe(99);
        break;
      }
      step = ctl.advance();
    }
    expect(step?.type).toBe('decision');
  });

  it('predict 透传纯速度推演（未来 8 条，只读不推进战斗）', () => {
    const ctl = createInteractiveBattle(baseConfig());
    const rows = ctl.predict(8);
    expect(rows).toHaveLength(8);
    for (const r of rows) {
      expect(r.time).toBeGreaterThan(0);
      expect(r.av).toBeGreaterThan(0);
    }
    // 时间单调不减
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].time).toBeGreaterThanOrEqual(rows[i - 1].time);
    }
    // 只读：predict 后继续推进仍是原第一个 step（未消费战斗进度）
    const step = ctl.advance();
    expect(step).not.toBeNull();
  });
});

describe('目标选择（全真模拟，2026-10 裁定全通）', () => {
  /** 交互推进：decision 按 decide 提交；收集事件直至 stop 命中或结束 */
  const pump = (
    ctl: InteractiveBattle,
    decide: (step: Extract<BattleStep, { type: 'decision' }>) => DecisionInput,
    stop: (step: BattleStep) => boolean,
    max = 900,
  ): BattleStep[] => {
    const out: BattleStep[] = [];
    let step = ctl.advance();
    let guard = 0;
    while (step && guard < max) {
      guard += 1;
      out.push(step);
      if (stop(step)) break;
      step = step.type === 'decision' ? ctl.advance(decide(step)) : ctl.advance();
    }
    return out;
  };

  it('周日终结技所选目标=腾荒：蒙福者/圣咏/司铎挂腾荒，景元无', () => {
    const ctl = createInteractiveBattle(baseConfig());
    const steps: BattleStep[] = [];
    let ultEv: CombatEvent | null = null;
    let step = ctl.advance();
    let guard = 0;
    while (step && guard < 900) {
      guard += 1;
      steps.push(step);
      if (step.type === 'event' && step.event.kind === 'ult' && step.event.unitId === 'sunday') {
        ultEv = step.event;
        break;
      }
      if (step.type === 'decision') {
        if (step.status.ultReady.includes('sunday')) {
          ctl.requestUlt('sunday', { allyTarget: 'tenghuang' });
          step = ctl.advance();
          continue;
        }
        // 周日战技目标同为腾荒：使圣咏/司铎不落景元（区分大招效果）
        const input: DecisionInput =
          step.unitId === 'sunday' && step.status.sp >= 1
            ? { action: 'skill', target: { allyTarget: 'tenghuang' } }
            : { action: step.status.sp >= 1 ? 'skill' : 'basic' };
        step = ctl.advance(input);
        continue;
      }
      step = ctl.advance();
    }
    expect(steps.length).toBeGreaterThan(0);
    expect(ultEv).not.toBeNull();
    expect(ultEv!.targetId).toBe('tenghuang');
    const buffs = ultEv!.buffs ?? {};
    const tb = buffs.tenghuang ?? [];
    const jb = buffs.jingyuan ?? [];
    expect(tb.some((b) => b.labelKey === 'blessed')).toBe(true);
    expect(jb.some((b) => b.labelKey === 'blessed')).toBe(false);
    expect(tb.some((b) => b.labelKey === 'hymn')).toBe(true);
    expect(jb.some((b) => b.labelKey === 'hymn')).toBe(false);
    expect(tb.some((b) => b.labelKey === 'sidor')).toBe(true);
    expect(jb.some((b) => b.labelKey === 'sidor')).toBe(false);
  });

  it('腾荒战技所选目标=周日：同袍/神秀挂周日，景元无', () => {
    const ctl = createInteractiveBattle(baseConfig());
    const steps = pump(
      ctl,
      (s) =>
        s.unitId === 'tenghuang'
          ? { action: 'skill', target: { allyTarget: 'sunday' } }
          : { action: s.status.sp >= 1 ? 'skill' : 'basic' },
      (s) => s.type === 'event' && s.event.action === 'skill' && s.event.unitId === 'tenghuang',
    );
    const ev = steps.find(
      (s) => s.type === 'event' && s.event.action === 'skill' && s.event.unitId === 'tenghuang',
    );
    expect(ev).toBeDefined();
    if (!ev || ev.type !== 'event') throw new Error('unreachable');
    expect(ev.event.targetId).toBe('sunday');
    const buffs = ev.event.buffs ?? {};
    expect((buffs.sunday ?? []).some((b) => b.labelKey === 'traceShenXiu')).toBe(true);
    expect((buffs.jingyuan ?? []).some((b) => b.labelKey === 'traceShenXiu')).toBe(false);
  });

  it('晴歌终结技所选目标=腾荒：拉条目标记入 targetId；景元靠自身气氛获得偏离和弦', () => {
    const ctl = createInteractiveBattle(baseConfig());
    const steps: BattleStep[] = [];
    let ultEv: CombatEvent | null = null;
    let basicEv: CombatEvent | null = null;
    let afterJingyuan: CombatEvent | null = null;
    let step = ctl.advance();
    let guard = 0;
    while (step && guard < 900) {
      guard += 1;
      steps.push(step);
      if (step.type === 'event') {
        const e = step.event;
        if (!basicEv && e.kind === 'action' && e.action === 'basic') basicEv = e;
        if (
          !afterJingyuan &&
          ultEv &&
          e.kind === 'action' &&
          e.unitId === 'jingyuan' &&
          (e.action === 'basic' || e.action === 'skill')
        ) {
          afterJingyuan = e;
          break;
        }
        if (e.kind === 'ult' && e.unitId === 'qingge') ultEv = e;
        step = ctl.advance();
        continue;
      }
      if (step.status.ultReady.includes('qingge')) {
        ctl.requestUlt('qingge', { allyTarget: 'tenghuang' });
        step = ctl.advance();
        continue;
      }
      step = ctl.advance({
        action: step.status.sp >= 1 ? 'skill' : 'basic',
        target: step.status.sp >= 1 ? undefined : { enemyTarget: 'monster2' },
      });
    }
    expect(ultEv).not.toBeNull();
    expect(ultEv!.targetId).toBe('tenghuang');
    expect(ultEv!.note).toContain('pullJingyuan');
    // 敌方主目标记录（单体普攻）
    expect(basicEv).not.toBeNull();
    expect(basicEv!.targetId).toBe('monster2');
    // 通用规则（2026-10 用户按行迹文本裁定）：特邀目标=腾荒，但景元自身普攻/战技使晴歌
    // 获得气氛 → 景元同样带偏离和弦（旧「仅特邀持有者」实现下此处为 false）
    expect(afterJingyuan).not.toBeNull();
    if (!afterJingyuan) throw new Error('unreachable');
    expect((afterJingyuan.buffs?.jingyuan ?? []).some((b) => b.labelKey === 'deviation')).toBe(
      true,
    );
  });
});

describe('三木桩多目标（2026-10 裁定：一套配置×3，默认中间）', () => {
  it('单体默认打中间，AoE 对三桩各一段且各自掉血', () => {
    const r = simulateBattle(baseConfig({ rounds: 3, maxTime: 350 }));
    // 单体普攻（120401 SingleAttack）主目标=中间
    const basicHits = r.hits.filter((h) => h.skillCode === 'jingyuan.basic');
    expect(basicHits.length).toBeGreaterThan(0);
    for (const h of basicHits) expect(h.target).toBe('monster2');
    // AoE 战技（120402）覆盖三桩
    const skillHits = r.hits.filter((h) => h.skillCode === 'jingyuan.skill');
    expect(skillHits.length).toBeGreaterThan(0);
    expect(new Set(skillHits.map((h) => h.target))).toEqual(
      new Set(['monster1', 'monster2', 'monster3']),
    );
    // 三桩各自掉血（hp < 初始且合计扣减 = 命中合计）
    const hpLeft = r.finalState.monsters!.reduce((s, m) => s + m.hp, 0);
    expect(hpLeft).toBeLessThan(3 * 1e9);
    expect(r.finalState.monsters!.length).toBe(3);
  });

  it('胜利需三桩全灭（finalState.monsters 全 0、monsterHpLeft 合计 0）', () => {
    const r = simulateBattle(
      baseConfig({ rounds: 10, maxTime: 10000, monster: monster(500) }),
    );
    expect(r.victory).toBe(true);
    expect(r.monsterHpLeft).toBe(0);
    expect(r.finalState.monsters!.every((m) => m.hp <= 0)).toBe(true);
    expect(r.finalState.monsterHp).toBe(0);
  });

  it('玩家指定敌方主目标：该次普攻只打 monster1', () => {
    const ctl = createInteractiveBattle(baseConfig({ rounds: 1, maxTime: 150 }));
    let step = ctl.advance();
    let guard = 0;
    let hitSeqs: number[] | undefined;
    while (step && guard < 300) {
      guard += 1;
      if (step.type === 'decision') {
        step = ctl.advance({
          action: 'basic',
          target: { enemyTarget: 'monster1' },
        });
        continue;
      }
      if (step.type === 'event' && step.event.action === 'basic' && step.event.hitSeqs?.length) {
        hitSeqs = step.event.hitSeqs;
        break;
      }
      step = ctl.advance();
    }
    expect(hitSeqs).toBeDefined();
    const hits = (ctl.hits() ?? []).filter((h) => hitSeqs!.includes(h.seq));
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.target).toBe('monster1');
  });
});

describe('阿格莱雅完整机制（2026-10 接入：衣匠/至高之姿/孤锋千吻/织线/短视之惩）', () => {
  const factorOf = (
    h: { factors: readonly { key: string; value: number }[] },
    key: string,
  ): number => h.factors.find((f) => f.key === key)?.value ?? 0;

  const aglaeaMember = (): CombatMember => ({
    id: 'aglaea',
    panel: { ...panel('Thunder', 159, 0), attack: 2000, critRate: 0.7, critDmg: 1.06 },
  });
  /** 单人阿格莱雅队（techniques:false；defaultPolicy：无衣匠→战技，有衣匠→普攻） */
  const agCfg = (overrides: Partial<BattleConfig> = {}): BattleConfig =>
    baseConfig({
      members: [aglaeaMember()],
      techniques: false,
      rounds: 10,
      maxTime: 400,
      ...overrides,
    });

  it('战技召唤衣匠：自拉立即行动（紧随其后），忆灵技为阿格莱雅回能', () => {
    const r = simulateBattle(agCfg());
    const skillEv = r.events.find((e) => e.kind === 'action' && e.unitId === 'aglaea');
    expect(skillEv?.action).toBe('skill'); // defaultPolicy 首动：无衣匠 → 战技
    expect(skillEv?.note ?? []).toContain('summonYijiang');
    // 自拉 100% → 衣匠立即行动（下一个常规事件即衣匠刺纹之陷）
    const idx = r.events.indexOf(skillEv!);
    const next = r.events.slice(idx + 1).find((e) => e.kind === 'action');
    expect(next?.unitId).toBe('yijiang');
    expect(next?.skillCode).toBe('aglaea.memo');
    expect(next?.hitSeqs?.length).toBe(3); // Blast：主 + 相邻 1↔2↔3 链两段
    // 忆灵技回能 10（能量 175+30战技+10忆灵技 = 215；充能效率 0）
    expect(r.finalState.energy.aglaea).toBeGreaterThanOrEqual(215);
    expect(r.finalState.present.yijiang).toBe(true);
  });

  it('终结技状态机：至高之姿+倒计时；supreme 期间战技回落普攻（孤锋千吻 6 段、SP 不回）', () => {
    const r = simulateBattle(
      agCfg({
        maxTime: 1000,
        // 故意在 supreme 时返回战技：验证引擎按 140203 禁战技回落普攻
        policy: (ctx) => (ctx.supreme ? 'skill' : 'basic'),
      }),
    );
    const ult = r.events.find((e) => e.kind === 'ult' && e.unitId === 'aglaea');
    expect(ult).toBeDefined();
    expect(ult!.note ?? []).toContain('supreme');
    expect(ult!.note ?? []).toContain('summonYijiang');
    // 大招使阿格莱雅立即行动 → 后续首个普攻为孤锋千吻（policy 要求 skill 被回落）
    const kissIdx = r.events.findIndex(
      (e, i) =>
        i > r.events.indexOf(ult!) &&
        e.kind === 'action' &&
        e.unitId === 'aglaea' &&
        e.action === 'basic',
    );
    expect(kissIdx).toBeGreaterThan(0);
    const kiss = r.events[kissIdx];
    expect(kiss.skillCode).toBe('aglaea.basic');
    expect(kiss.hitSeqs?.length).toBe(6); // 首波无旧线：阿格莱雅段 3 + 衣匠段 3，无织线附加
    expect(kiss.note ?? []).toContain('thread'); // 攻击后挂间隙织线
    // 无法恢复战技点：SP 与前一事件持平（全 basic 队普攻本应 +1）
    const prev = r.events[kissIdx - 1];
    expect(kiss.spAfter).toBe(prev.spAfter);
    // 短视之惩（stacks=0 时）：攻区 = (面板2000 + 速度159×720%) × 倍率（强化普攻 140208 Lv6=200%）
    const kissHits = (kiss.hitSeqs ?? []).map((s) => r.hits[s]);
    const agHit = kissHits.find(
      (h) => h.source === 'aglaea' && factorOf(h, 'base') > 4000,
    );
    expect(agHit).toBeDefined();
    expect(factorOf(agHit!, 'base')).toBeCloseTo((2000 + 159 * 7.2) * 2, 6);
    // 衣匠段：快照攻 2000 + 衣匠速度(159×35%)×360%；倍率同上 200%（独立面板）
    const yiHit = kissHits.find((h) => h.source === 'yijiang');
    expect(yiHit).toBeDefined();
    expect(factorOf(yiHit!, 'base')).toBeCloseTo(
      (2000 + 159 * 0.35 * 3.6) * 2,
      6,
    );
    // 倒计时回合开始：衣匠自毁 + 解除至高之姿（回能 20 → energyAfter ≥ 前值+20）
    const cd = r.events.find((e) => e.unitId === 'countdown2');
    expect(cd).toBeDefined();
    expect(cd!.note ?? []).toContain('yijiangGone');
    expect(cd!.note ?? []).toContain('supremeEnd');
    expect(r.finalState.supreme).toBe(false);
    expect(r.finalState.present.yijiang).toBe(false);
    // 织运之竭：消失保留 ≤1 层速度（destroy 后未再召唤）
    expect(r.finalState.tailorStacks).toBeLessThanOrEqual(1);
  });

  it('技能后跟放终结技：大招「自身立即行动」紧接同刻（finishAction 不覆盖归0）', () => {
    // 阿雅 100 速慢于腾荒 134 与衣匠：若立即行动被 finishAction 重置覆盖，
    // 大招后下一动会是衣匠/腾荒而非阿雅——此用例锁住「紧接着」语义
    const ctl = createInteractiveBattle(
      baseConfig({
        members: [
          { id: 'aglaea', panel: panel('Thunder', 100, 4.9) },
          { id: 'tenghuang', panel: panel('Physical', 134, 0) },
        ],
        techniques: false,
        rounds: 10,
        maxTime: 300,
      }),
    );
    const seen: CombatEvent[] = [];
    let step: BattleStep | null = ctl.advance();
    let castDone = false;
    let guard = 0;
    while (step && guard < 400) {
      guard += 1;
      if (step.type === 'decision') {
        // 首个 decision=腾荒（更快）；阿雅 decision=战技回满（energyRegen 490%）+跟放大招
        const input: DecisionInput =
          step.unitId === 'aglaea' && !castDone
            ? { action: 'skill', afterUlts: [{ id: 'aglaea' }] }
            : { action: step.status.sp >= 1 ? 'skill' : 'basic' };
        if (step.unitId === 'aglaea') castDone = true;
        step = ctl.advance(input);
        continue;
      }
      seen.push(step.event);
      step = ctl.advance();
    }
    const ult = seen.find((e) => e.kind === 'ult' && e.unitId === 'aglaea');
    expect(ult).toBeDefined();
    expect(ult!.afterSkill).toBe(true);
    const ui = seen.indexOf(ult!);
    expect(ult!.note ?? []).toContain('supreme');
    // 衣匠由同刻的战技召唤（大招在战技后释放 → 已在场，走回满分支）
    const skillEv = seen.slice(0, ui).find((e) => e.kind === 'action' && e.unitId === 'aglaea');
    expect(skillEv?.note ?? []).toContain('summonYijiang');
    const next = seen.slice(ui + 1).find((e) => e.kind === 'action');
    expect(next?.unitId).toBe('aglaea');
    expect(next?.time).toBe(ult!.time); // 同刻紧接（立即行动归0，非等跑道）
    expect(next?.action).toBe('basic'); // supreme 期间战技回落孤锋千吻
  });

  it('星魂1连携去重：孤锋千吻（阿雅段+衣匠段）打带线目标只回一次20', () => {
    // 充能效率 4.9 → ×5.9：战技 30×5.9=177（175→350满）→ 普攻挂线后跟放大招（归0、supreme）
    // 大招 sp_base=5 → 开大后 29.5；孤锋千吻 = 行动 20×5.9=118 + 星魂1 一次 20×5.9=118
    // 合计 265.5（旧实现连携两段各判一次 → 29.5+354=350 封顶，与 265.5 可区分）
    const ctl = createInteractiveBattle(
      baseConfig({
        members: [
          { id: 'aglaea', panel: panel('Thunder', 159, 4.9), eidolonLevel: 1 },
          { id: 'tenghuang', panel: panel('Physical', 134, 0) },
        ],
        techniques: false,
        rounds: 10,
        maxTime: 400,
      }),
    );
    const seen: CombatEvent[] = [];
    let step: BattleStep | null = ctl.advance();
    let agCount = 0;
    let guard = 0;
    while (step && guard < 400) {
      guard += 1;
      if (step.type === 'decision') {
        let input: DecisionInput;
        if (step.unitId === 'aglaea') {
          agCount += 1;
          if (agCount === 1) input = { action: 'skill' };
          else if (agCount === 2) input = { action: 'basic', afterUlts: [{ id: 'aglaea' }] };
          else input = { action: 'basic' };
        } else {
          input = { action: step.status.sp >= 1 ? 'skill' : 'basic' };
        }
        step = ctl.advance(input);
        continue;
      }
      seen.push(step.event);
      step = ctl.advance();
    }
    const ult = seen.find((e) => e.kind === 'ult' && e.unitId === 'aglaea');
    expect(ult).toBeDefined();
    expect(ult!.note ?? []).toContain('supreme');
    // 挂线成功（阿雅第2动普攻，衣匠在场 → thread）
    const ui = seen.indexOf(ult!);
    const basic2 = seen
      .slice(0, ui)
      .reverse()
      .find((e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'basic');
    expect(basic2?.note ?? []).toContain('thread');
    // 孤锋千吻（大招后首个阿雅行动）：开大 sp_base=5×5.9=29.5
    // + 行动回能 20×5.9=118 + 星魂1 一次 20×5.9=118 = 265.5
    //（旧实现连携两段各判一次 → 29.5+354=383.5→封顶350，与 265.5 可区分）
    const gf = seen.slice(ui + 1).find((e) => e.kind === 'action' && e.unitId === 'aglaea');
    expect(gf).toBeDefined();
    expect(gf!.action).toBe('basic');
    expect(gf!.energyAfter).toBe(265.5);
  });

  it('间隙织线：衣匠在场后普攻挂线，后续攻击触发附加伤害段', () => {
    const r = simulateBattle(agCfg({ maxTime: 300 }));
    const basics = r.events.filter(
      (e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'basic',
    );
    expect(basics.length).toBeGreaterThanOrEqual(2);
    // 首波普攻：挂线 note 有，但无线可打 → 无附加段
    expect(basics[0].note ?? []).toContain('thread');
    const firstHits = (basics[0].hitSeqs ?? []).map((s) => r.hits[s]);
    expect(firstHits.some((h) => h.skillCode === 'aglaea.thread')).toBe(false);
    // 后续普攻：主目标带线 → 追加「阿格莱雅攻击力30%」附加段
    const later = basics.slice(1).find((e) => (e.hitSeqs?.length ?? 0) > 0)!;
    const laterHits = (later.hitSeqs ?? []).map((s) => r.hits[s]);
    const thread = laterHits.find((h) => h.skillCode === 'aglaea.thread');
    expect(thread).toBeDefined();
    expect(thread!.source).toBe('aglaea');
    expect(thread!.total).toBeGreaterThan(0);
    expect(factorOf(thread!, 'base')).toBeCloseTo(2000 * 0.3, 6);
  });

  it('忆灵天赋叠层：衣匠攻击织线目标后速度层数递增（上限6）', () => {
    const r = simulateBattle(agCfg({ maxTime: 600 }));
    const memoActs = r.events.filter((e) => e.kind === 'action' && e.unitId === 'yijiang');
    expect(memoActs.length).toBeGreaterThan(1);
    expect(r.finalState.tailorStacks).toBeGreaterThanOrEqual(1);
    expect(r.finalState.tailorStacks).toBeLessThanOrEqual(6);
    expect(memoActs.some((e) => (e.note ?? []).includes('tailorStack'))).toBe(true);
  });

  it('秘技140207：召衣匠+全体100%攻击+挂线+进战回能30', () => {
    const r = simulateBattle(
      baseConfig({
        members: [aglaeaMember(), members()[2], members()[3]], // 阿格莱雅+景元+腾荒
        techniques: true,
        rounds: 1,
        maxTime: 50,
      }),
    );
    const tech = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'technique',
    );
    expect(tech).toBeDefined();
    expect(tech!.note ?? []).toContain('summonYijiang');
    expect(tech!.note ?? []).toContain('thread');
    // 进战回能 30：初始 175 + 30 = 205
    expect(tech!.energyAfter).toBe(205);
    // 全体伤害：三桩各一段
    expect(tech!.hitSeqs?.length).toBe(3);
    expect(r.finalState.present.yijiang).toBe(true);
  });

  it('星魂1「飘曳金星的行列」：带线目标受到的伤害+15%，阿格莱雅/衣匠攻线目标回20能（×充能）', () => {
    // 动1战技（召衣匠，无伤害）→ 衣匠行动 → 动2普攻挂线（需衣匠在场）→ 动3普攻打线目标（触发星魂1）
    const mkPolicy = () => {
      let n = 0;
      return (): 'skill' | 'basic' => {
        n += 1;
        return n === 1 ? 'skill' : 'basic';
      };
    };
    const run = (eidolonLevel: number) =>
      simulateBattle(agCfg({ members: [{ ...aglaeaMember(), eidolonLevel }], policy: mkPolicy() }));
    const r0 = run(0);
    const r1 = run(1);

    // ① 回能：动3普攻（首个带线攻击）事件 energyAfter —— 1魂比0魂多 20（充能效率0 → ×1）
    const basics0 = r0.events.filter((e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'basic');
    const basics1 = r1.events.filter((e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'basic');
    expect(basics0.length).toBeGreaterThanOrEqual(2);
    expect(basics1.length).toBeGreaterThanOrEqual(2);
    expect(basics1[1].energyAfter).toBe((basics0[1].energyAfter ?? 0) + 20);

    // ② 易伤：首个织线附加段（开大前两 run 序列一致；打带线目标）伤害比 = 1.15
    const firstThread = (r: typeof r0) => r.hits.find((h) => h.skillCode === 'aglaea.thread');
    const t0 = firstThread(r0);
    const t1 = firstThread(r1);
    expect(t0).toBeDefined();
    expect(t1).toBeDefined();
    expect(t1!.target).toBe(t0!.target);
    expect(t1!.total / t0!.total).toBeCloseTo(1.15, 8);
  });

  it('无景元队（阿格莱雅/周日/腾荒/晴歌）：神君不入列、事件快照不显示神君行', () => {
    const ms: CombatMember[] = [
      { id: 'aglaea', panel: panel('Thunder', 159, 0) },
      { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
      { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
      { id: 'qingge', panel: panel('Wind', 156, 0.194) },
    ];
    const r = simulateBattle(
      baseConfig({ members: ms, techniques: true, rounds: 10, maxTime: 400, mainC: 'aglaea' }),
    );
    // 神君不行动、不产生伤害
    expect(r.events.some((e) => e.unitId === 'shenjun')).toBe(false);
    expect(r.hits.some((h) => h.source === 'shenjun')).toBe(false);
    expect(r.report.bySkill.some((b) => b.skillCode.includes('shenjun'))).toBe(false);
    // 事件增益快照不含神君（腾荒隐士4/全队 buff 不再挂到不存在的神君行）
    expect(r.events.some((e) => e.buffs && 'shenjun' in e.buffs)).toBe(false);
  });

  it('特邀嘉宾：阿格莱雅攻击 +1+2 气氛并触发偏离和弦；段数列值=忆灵天赋层数', () => {
    const ms: CombatMember[] = [
      { id: 'aglaea', panel: panel('Thunder', 159, 0) },
      { id: 'qingge', panel: panel('Wind', 156, 0.194) },
      { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
      { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
    ];
    const r = simulateBattle(
      baseConfig({
        members: ms,
        techniques: false,
        rounds: 10,
        maxTime: 500,
        mainC: 'aglaea',
        policy: (ctx) => (ctx.id === 'aglaea' ? 'basic' : 'skill'),
      }),
    );
    const ultIdx = r.events.findIndex((e) => e.kind === 'ult' && e.unitId === 'qingge');
    expect(ultIdx).toBeGreaterThanOrEqual(0);
    expect(r.events[ultIdx].targetId).toBe('aglaea'); // 特邀嘉宾 = 晴歌大招所选目标
    const delta = (i: number): number =>
      (r.events[i].moodAfter ?? 0) - (i > 0 ? (r.events[i - 1].moodAfter ?? 0) : 0);
    // 修复前 bug：阿格莱雅行动完全不加气氛（delta=0）→ 大招前攻击为基础 1 点
    const preIdx = r.events.findIndex(
      (e, i) =>
        i < ultIdx && e.kind === 'action' && e.unitId === 'aglaea' && (e.hitSeqs?.length ?? 0) > 0,
    );
    expect(preIdx).toBeGreaterThanOrEqual(0);
    expect(delta(preIdx)).toBe(1);
    // 特邀窗口内：阿格莱雅攻击 = 1 基础 + 2 特邀 = 3（连携视为一次攻击），并触发源①
    const guest = r.events.findIndex(
      (e, i) =>
        i > ultIdx &&
        e.kind === 'action' &&
        e.unitId === 'aglaea' &&
        (e.hitSeqs?.length ?? 0) > 0 &&
        delta(i) === 3,
    );
    expect(guest).toBeGreaterThanOrEqual(0);
    expect(
      (r.events[guest].buffs?.['aglaea'] ?? []).some((b) => b.labelKey === 'deviation'),
    ).toBe(true);
    // 衣匠 = 阿格莱雅的召唤物：独立行动（刺纹之陷）窗口内同样 1+2=3
    expect(r.events.some((e, i) => i > ultIdx && e.unitId === 'yijiang' && delta(i) === 3)).toBe(
      true,
    );
    // 段数列（record 兜底注入）：阿格莱雅/衣匠事件 = 忆灵天赋层数（number）
    expect(
      r.events
        .filter((e) => e.unitId === 'aglaea' || e.unitId === 'yijiang')
        .every((e) => typeof e.stacks === 'number'),
    ).toBe(true);
    // 其余成员事件不带段数（编队无景元时 UI 隐藏该列，值保持 undefined）
    expect(
      r.events
        .filter((e) => e.kind === 'action' && ['qingge', 'sunday', 'tenghuang'].includes(e.unitId))
        .every((e) => e.stacks === undefined),
    ).toBe(true);
  });

  it('连携攻击视为一次攻击：孤锋千吻气氛只计 1 点（无特邀）', () => {
    const r = simulateBattle(agCfg({ maxTime: 1000 }));
    const kissIdx = r.events.findIndex(
      (e) =>
        e.kind === 'action' &&
        e.unitId === 'aglaea' &&
        e.skillCode === 'aglaea.basic' &&
        (e.hitSeqs?.length ?? 0) >= 6,
    );
    expect(kissIdx).toBeGreaterThan(0);
    const kiss = r.events[kissIdx];
    expect(typeof kiss.stacks).toBe('number'); // 阿格莱雅事件带忆灵天赋层数
    const d =
      (kiss.moodAfter ?? 0) - (kissIdx > 0 ? (r.events[kissIdx - 1].moodAfter ?? 0) : 0);
    // 阿格莱雅段+衣匠段=一次攻击 → 仅 +1（若=2 说明连携按两次重复计）
    expect(d).toBe(1);
    // 衣匠独立行动同样只 +1（无特邀）
    const memo = r.events.filter((e) => e.unitId === 'yijiang' && e.kind === 'action');
    expect(memo.length).toBeGreaterThan(0);
    for (const e of memo) {
      const i = r.events.indexOf(e);
      expect((e.moodAfter ?? 0) - (r.events[i - 1].moodAfter ?? 0)).toBe(1);
    }
  });
});

describe('无景元队击破 DoT 跳伤（全真模拟提前停止根因，2026-10 修复）', () => {
  it('破韧后木桩行动跳击破 DoT 不抛错，模拟跑满 maxTime', () => {
    const ms: CombatMember[] = [
      { id: 'aglaea', panel: panel('Thunder', 159, 0), eidolonLevel: 1 },
      { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
      { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
      { id: 'qingge', panel: panel('Wind', 156, 0.194) },
    ];
    // 修复前：无景元队破韧登记击破 DoT 后，木桩行动跳伤时 panelOf('jingyuan') 抛
    // 「队伍中没有角色：jingyuan」→ 交互式 generator 异常关闭 → 全真模拟静默显示
    // 「战斗结束」（用户报障：行动值 86.89 停止，未到截止 350）
    const r = simulateBattle(
      baseConfig({
        members: ms,
        monster: monster(2e6, 300),
        techniques: true,
        rounds: 10,
        maxTime: 350,
        mainC: 'aglaea',
      }),
    );
    // 破韧发生（雷 → 触电 DoT 登记）
    expect(r.events.some((e) => e.kind === 'break')).toBe(true);
    // 木桩行动完成击破 DoT 跳伤（修复点：景元不在队时 breakEffect/attackerLevel 取安全缺省）
    expect(r.hits.some((h) => h.kind === 'breakDot')).toBe(true);
    // 跑满截止行动值（修复前在破韧首跳处异常中断）
    expect(r.summary.totalTime).toBeCloseTo(350, 5);
  });
});

describe('预计算能量（predictAfter）与技能后跟放终结技（2026-10 用户需求）', () => {
  /** 交互推进：每个决策点先预测（行动+目标）→ 提交 → 与实际行动后能量逐 id 比对；
   * 返回比对次数。用于锁定 predictAfter 与 charAction 回能源不漂移。 */
  const checkPredict = (cfg: BattleConfig, want: number): number => {
    const ctl = createInteractiveBattle(cfg);
    let step = ctl.advance();
    let checked = 0;
    let n = 0;
    let guard = 0;
    while (step && guard < 900 && checked < want) {
      guard += 1;
      if (step.type === 'decision') {
        n += 1;
        expect(step.predictAfter).toBeDefined();
        if (!step.predictAfter) throw new Error('unreachable');
        const action = n % 2 === 1 && step.status.sp >= 1 ? 'skill' : 'basic';
        const target: DecisionInput['target'] =
          action === 'basic' ? { enemyTarget: 'monster2' } : undefined;
        const pred = step.predictAfter({ action, target });
        for (const id of Object.keys(pred.caps) as CharId[]) {
          expect(pred.caps[id]).toBeGreaterThan(0);
        }
        step = ctl.advance({ action, target });
        expect(step).not.toBeNull();
        if (step?.type !== 'event') throw new Error('advance(input) 应先返回行动侧事件步');
        // 事件步 status = 行动后快照（破韧 break 先吐时同为行动后，charAction 已完整执行）
        for (const id of Object.keys(pred.energy) as CharId[]) {
          expect([id, step.status.energy[id]]).toEqual([id, pred.energy[id]]);
        }
        checked += 1;
      }
      step = ctl.advance();
    }
    expect(checked).toBe(want);
    return checked;
  };

  it('漂移锁定（4人·星魂1/光锥回能/即兴蓝调/首次召贝茜源）：预测=实际行动后能量', () => {
    checkPredict(
      baseConfig({
        members: [
          { id: 'aglaea', panel: panel('Thunder', 159, 0), eidolonLevel: 1 },
          { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
          { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
          { id: 'qingge', panel: panel('Wind', 156, 0.194) },
        ],
        techniques: true,
        mainC: 'aglaea',
        rounds: 10,
        maxTime: 500,
      }),
      8,
    );
  });

  it('漂移锁定（景元+腾荒二人队）：覆盖行迹葳蕤回源', () => {
    checkPredict(
      baseConfig({
        members: [
          { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
          { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
        ],
        techniques: true,
        mainC: 'jingyuan',
        rounds: 10,
        maxTime: 500,
      }),
      8,
    );
  });

  it('afterUlts：跟放终结技紧随该技能、同刻同轮次并带 afterSkill 标记', () => {
    const ctl = createInteractiveBattle(baseConfig());
    let step = ctl.advance();
    let readyId: CharId | null = null;
    let cast = false;
    let actionEv: CombatEvent | null = null;
    let ultEv: CombatEvent | null = null;
    let guard = 0;
    const evSeq: { kind: string; unitId?: string; afterSkill?: true; time: number; cast: boolean }[] = [];
    while (step && guard < 900 && !ultEv) {
      guard += 1;
      if (step.type === 'decision') {
        if (!cast && step.status.ultReady.length > 0) {
          readyId = step.status.ultReady[0];
          const action = step.status.sp >= 1 ? 'skill' : 'basic';
          step = ctl.advance({ action, afterUlts: [{ id: readyId }] });
          cast = true;
          continue;
        }
        step = ctl.advance({ action: step.status.sp >= 1 ? 'skill' : 'basic' });
        continue;
      }
      const ev = step.event;
      if (cast && ev.kind === 'action') {
        if (!actionEv) actionEv = ev;
        // 跟放终结技紧邻技能之后：actionEv 之后又出现行动事件 = 未跟放
        else if (!ultEv) throw new Error('跟放终结技之前出现了其他行动事件');
      }
      evSeq.push({ kind: ev.kind, unitId: ev.unitId, afterSkill: ev.afterSkill, time: ev.time, cast });
      if (cast && actionEv && ev.kind === 'ult' && ev.afterSkill === true) ultEv = ev;
      step = ctl.advance();
    }
    expect(cast).toBe(true);
    expect(actionEv).not.toBeNull();
    expect(ultEv).not.toBeNull();
    if (!actionEv || !ultEv || !readyId) throw new Error('unreachable');
    expect(ultEv.unitId).toBe(readyId);
    // 用户裁定：终结技与该技能所在回合数一致（同刻同轮次）
    expect(ultEv.time).toBe(actionEv.time);
    expect(ultEv.round).toBe(actionEv.round);
    // 明细表并入同一 #（UI 按 afterSkill 分组）
    expect(ultEv.afterSkill).toBe(true);
  });
});

describe('秘技系统（2026-10：晴歌全队增伤/周日荣光之秘/攻击类互斥）', () => {
  it('晴歌「我们自成旋律」：进战全队增伤 30% 持续 2 回合；关秘技则无', () => {
    const on = simulateBattle(baseConfig({ techniques: true, rounds: 1, maxTime: 200 }));
    const first = on.events.find((e) => e.kind === 'action');
    expect(first).toBeDefined();
    const buff = first?.buffs?.['jingyuan']?.find((b) => b.labelKey === 'techQingge');
    expect(buff).toBeDefined();
    expect(buff?.value).toBeCloseTo(0.3, 10);
    expect(buff?.duration).toBe(2);
    expect(buff?.source).toBe('qingge');
    expect(buff?.key).toBe('damageBonus');
    // 召唤物 holder 也挂（明细表全队显示）
    expect(first?.buffs?.['memo']?.some((b) => b.labelKey === 'techQingge')).toBe(true);

    const off = simulateBattle(baseConfig({ techniques: false, rounds: 1, maxTime: 100 }));
    const f2 = off.events.find((e) => e.kind === 'action');
    expect(f2?.buffs?.['jingyuan']?.some((b) => b.labelKey === 'techQingge')).toBe(false);
  });

  it('周日「荣光之秘」：首次友方目标战技 → 目标 +50% 增伤 2 回合，第二次不再触发', () => {
    const ctl = createInteractiveBattle(
      baseConfig({ techniques: true, rounds: 10, maxTime: 500 }),
    );
    let step = ctl.advance();
    let sundaySkills = 0;
    let guard = 0;
    while (step && guard < 900 && sundaySkills < 2) {
      guard += 1;
      if (step.type === 'decision') {
        if (step.unitId === 'sunday' && step.status.sp >= 1) {
          const t: CharId = sundaySkills === 0 ? 'qingge' : 'jingyuan';
          step = ctl.advance({ action: 'skill', target: { allyTarget: t } });
          continue;
        }
        step = ctl.advance({ action: step.status.sp >= 1 ? 'skill' : 'basic' });
        continue;
      }
      const ev = step.event;
      if (ev.kind === 'action' && ev.unitId === 'sunday' && ev.skillCode === 'sunday.skill') {
        sundaySkills += 1;
        if (sundaySkills === 1) {
          expect(ev.targetId).toBe('qingge');
          const b = ev.buffs?.['qingge']?.find((x) => x.labelKey === 'techGlory');
          expect(b).toBeDefined();
          expect(b?.value).toBeCloseTo(0.5, 10);
          expect(b?.duration).toBe(2);
          expect(b?.source).toBe('sunday');
        } else {
          expect(ev.targetId).toBe('jingyuan');
          expect(ev.buffs?.['jingyuan']?.some((x) => x.labelKey === 'techGlory')).toBe(false);
        }
      }
      step = ctl.advance();
    }
    expect(sundaySkills).toBe(2);
  });

  it('关秘技：荣光之秘不触发', () => {
    const ctl = createInteractiveBattle(
      baseConfig({ techniques: false, rounds: 10, maxTime: 500 }),
    );
    let step = ctl.advance();
    let sundaySkills = 0;
    let guard = 0;
    while (step && guard < 900 && sundaySkills < 1) {
      guard += 1;
      if (step.type === 'decision') {
        if (step.unitId === 'sunday' && step.status.sp >= 1) {
          step = ctl.advance({ action: 'skill', target: { allyTarget: 'jingyuan' } });
          continue;
        }
        step = ctl.advance({ action: step.status.sp >= 1 ? 'skill' : 'basic' });
        continue;
      }
      const ev = step.event;
      if (ev.kind === 'action' && ev.unitId === 'sunday' && ev.skillCode === 'sunday.skill') {
        sundaySkills += 1;
        expect(ev.buffs?.['jingyuan']?.some((x) => x.labelKey === 'techGlory')).toBe(false);
      }
      step = ctl.advance();
    }
    expect(sundaySkills).toBe(1);
  });

  it('晴歌秘技「下一次战斗开始时行动提前20%」：进战首动 = 常规×0.8；关秘技则常规', () => {
    // 151207 #3=0.2：combat/team-axis 双侧 initialAv = 10000/速度 × 0.8（156速：64.10→51.28）
    const on = simulateBattle(baseConfig({ policy: () => 'basic', rounds: 1, maxTime: 100 }));
    const first = on.events.find((e) => e.kind === 'action' && e.unitId === 'qingge');
    expect(first).toBeDefined();
    expect(first!.time).toBeCloseTo((10000 / 156) * 0.8, 6);

    const off = simulateBattle(
      baseConfig({ policy: () => 'basic', techniques: false, rounds: 1, maxTime: 100 }),
    );
    const f2 = off.events.find((e) => e.kind === 'action' && e.unitId === 'qingge');
    expect(f2).toBeDefined();
    expect(f2!.time).toBeCloseTo(10000 / 156, 6);
  });
});

describe('周日战技拉衣匠 + 葳蕤同袍泛化（2026-10 修复）', () => {
  /** 阿雅主C队：阿雅159 / 周日134 / 腾荒134 / 景元135（techniques:false，tongpao 初始 = mainC = 阿雅） */
  const teamCfg = (overrides: Partial<BattleConfig> = {}): BattleConfig =>
    baseConfig({
      members: [
        { id: 'aglaea', panel: panel('Thunder', 159, 0.194) },
        { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
        { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
        { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
      ],
      mainC: 'aglaea',
      techniques: false,
      rounds: 5,
      maxTime: 400,
      ...overrides,
    });

  it('周日战技对阿雅：目标与衣匠一并立即行动，召唤物增伤加成（#4）生效', () => {
    const r = simulateBattle(teamCfg());
    const sun = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'sunday' && e.skillCode === 'sunday.skill',
    );
    expect(sun).toBeDefined();
    expect(sun!.targetId).toBe('aglaea');
    // 「目标拥有召唤物 → 伤害提高额外 +#4」：阿雅衣匠在场 → value = p[1] + p[3]
    const p = skillParams('131302', 10);
    const b = sun!.buffs?.['aglaea']?.find((x) => x.labelKey === 'sundaySkill');
    expect(b).toBeDefined();
    expect(b?.value).toBeCloseTo(p[1] + p[3], 10);
    // 立即行动：战技后阿雅（目标）与衣匠同刻紧随（后拉先动 → 目标先、召唤物后）
    const acts = r.events
      .slice(r.events.indexOf(sun!) + 1)
      .filter((e) => e.kind === 'action');
    expect(acts[0]?.unitId).toBe('aglaea');
    expect(acts[0]?.time).toBe(sun!.time);
    expect(acts[1]?.unitId).toBe('yijiang');
    expect(acts[1]?.time).toBe(sun!.time);
  });

  it('行迹葳蕤：同袍=阿雅时其攻击触发（+6能量/龙灵拉15%），战技与他人攻击不触发', () => {
    const r = simulateBattle(teamCfg());
    // 同袍 = mainC = 阿雅：她的普攻（含至高之姿强化普攻）全部触发
    const agBasics = r.events.filter(
      (e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'basic',
    );
    expect(agBasics.length).toBeGreaterThan(0);
    expect(agBasics.every((e) => (e.note ?? []).includes('traceWeiRui'))).toBe(true);
    // 阿雅战技非攻击 → 不触发
    const agSkill = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'skill',
    );
    expect(agSkill).toBeDefined();
    expect(agSkill!.note ?? []).not.toContain('traceWeiRui');
    // 同袍≠景元 → 景元的攻击不触发（tongpao 恒为阿雅：腾荒战技不选目标时回落 mainC）
    const jyAtks = r.events.filter((e) => e.kind === 'action' && e.unitId === 'jingyuan');
    expect(jyAtks.length).toBeGreaterThan(0);
    expect(jyAtks.every((e) => !(e.note ?? []).includes('traceWeiRui'))).toBe(true);
  });
});

describe('开战角色（2026-10 裁定：攻击类秘技触发者开战，否则 slots[0]）', () => {
  const techEvents = (r: ReturnType<typeof simulateBattle>) =>
    r.events.filter((e) => e.kind === 'action' && e.action === 'technique');

  it('含阿雅队：阿雅秘技事件最前（先于腾荒），地坼同袍/神秀落阿雅，阿雅普攻触发葳蕤而景元不触发', () => {
    const r = simulateBattle(
      baseConfig({
        // 景元在 1 号位：开战者仍 = 攻击类秘技触发者（阿雅），验证 attackTechFirst 优先 slots[0]
        members: [
          { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
          { id: 'aglaea', panel: panel('Thunder', 159, 0.194) },
          { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
        ],
        rounds: 1,
        maxTime: 150,
      }),
    );
    const techs = techEvents(r);
    // 开战者事件排最前：阿雅秘技（攻击类）先于腾荒秘技
    expect(techs.map((e) => e.unitId)).toEqual(['aglaea', 'tenghuang']);
    expect(r.events.find((e) => e.kind === 'action')?.unitId).toBe('aglaea');
    // 地坼自动战技 → 神秀落开战者（阿雅），1 号位景元没有
    const tt = techs[1];
    expect(tt.note ?? []).toContain('traceShenXiu');
    expect(tt.buffs?.['aglaea']?.some((b) => b.key === 'atkFlat' && b.source === 'tenghuang')).toBe(
      true,
    );
    expect(tt.buffs?.['jingyuan']?.some((b) => b.key === 'atkFlat')).toBeFalsy();
    // 同袍 = 阿雅 → 她的普攻触发葳蕤，景元的攻击不触发
    const agBasic = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'basic',
    );
    expect(agBasic).toBeDefined();
    expect(agBasic!.note ?? []).toContain('traceWeiRui');
    const jyAtks = r.events.filter((e) => e.kind === 'action' && e.unitId === 'jingyuan');
    expect(jyAtks.length).toBeGreaterThan(0);
    expect(jyAtks.every((e) => !(e.note ?? []).includes('traceWeiRui'))).toBe(true);
  });

  it('baseConfig（无攻击类）：腾荒秘技事件在最前，开战者 = slots[0] 晴歌（神秀/葳蕤归属）', () => {
    const r = simulateBattle(baseConfig({ policy: () => 'basic', rounds: 1, maxTime: 150 }));
    const techs = techEvents(r);
    // 晴歌秘技无独立事件（仅状态）→ 首个秘技事件仍为腾荒；无攻击类时开战者 = 编队 1 号位
    expect(techs.map((e) => e.unitId)).toEqual(['tenghuang']);
    expect(techs[0].buffs?.['qingge']?.some((b) => b.key === 'atkFlat' && b.source === 'tenghuang')).toBe(
      true,
    );
    // 同袍 = 晴歌 → 她的普攻触发葳蕤，景元普攻不触发
    const qgBasic = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'qingge' && e.action === 'basic',
    );
    expect(qgBasic).toBeDefined();
    expect(qgBasic!.note ?? []).toContain('traceWeiRui');
    const jyBasic = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'jingyuan' && e.action === 'basic',
    );
    expect(jyBasic).toBeDefined();
    expect(jyBasic!.note ?? []).not.toContain('traceWeiRui');
  });

  it('无腾荒进战：techniques 不崩，无龙灵事件、无秘技事件', () => {
    const r = simulateBattle(
      baseConfig({ members: members().slice(0, 3), techniques: true, rounds: 1, maxTime: 150 }),
    );
    expect(r.events.every((e) => e.unitId !== 'longling')).toBe(true);
    expect(r.events.every((e) => !(e.note ?? []).includes('summonLongling'))).toBe(true);
    expect(techEvents(r)).toEqual([]);
  });
});

describe('护盾回合计数与秘技盾量（2026-10 裁定：按受益者各自行动递减 / 盾量用配置技能等级）', () => {
  it('按受益者各自行动递减：晴歌/腾荒先动过 → 其盾2，未动成员仍3', () => {
    const r = simulateBattle(baseConfig({ rounds: 2, maxTime: 150 }));
    // 实测行动序：腾荒44.78（翁瓦克拉40%）→ 晴歌51.28（秘技拉20%）→ 景元首动74.07（周日74.63）
    // 各自行动后仅本人计数-1（旧全局实现此处全为3）
    const jy = r.events.find((e) => e.kind === 'action' && e.unitId === 'jingyuan');
    expect(jy).toBeDefined();
    expect((jy!.buffs?.['qingge'] ?? []).find((x) => x.key === 'shield')?.duration).toBe(2);
    expect((jy!.buffs?.['tenghuang'] ?? []).find((x) => x.key === 'shield')?.duration).toBe(2);
    expect((jy!.buffs?.['sunday'] ?? []).find((x) => x.key === 'shield')?.duration).toBe(3);
    expect((jy!.buffs?.['jingyuan'] ?? []).find((x) => x.key === 'shield')?.duration).toBe(3);
  });

  it('到期仅清自己：周日3动盾归零时腾荒盾仍在（独立计数）', () => {
    // 腾荒低速80 → 行动125/250/375；周日3动（74.6/149/224）后229到期。
    // 晴歌首动后进 Fever 全程只动1次（盾冻结），故以周日作到期样本
    const r = simulateBattle(
      baseConfig({
        members: [
          { id: 'qingge', panel: panel('Wind', 156, 0) },
          { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
          { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
          { id: 'tenghuang', panel: panel('Physical', 80, 0.194) },
        ],
        rounds: 4,
        maxTime: 420,
        techniques: true,
      }),
    );
    const ev = r.events.find(
      (e) =>
        e.kind === 'action' &&
        !(e.buffs?.['sunday'] ?? []).some((x) => x.key === 'shield') &&
        (e.buffs?.['tenghuang'] ?? []).some((x) => x.key === 'shield'),
    );
    expect(ev, '存在周日盾已到期而腾荒盾仍在的事件').toBeDefined();
    expect(
      (ev!.buffs?.['tenghuang'] ?? []).find((x) => x.key === 'shield')!.duration,
    ).toBeLessThan(3);
  });

  it('秘技盾量按配置技能等级（lv10，非 lv1）', () => {
    const r = simulateBattle(baseConfig({ rounds: 1, maxTime: 150, techniques: true }));
    const tech = r.events.find(
      (e) => e.kind === 'action' && e.action === 'technique' && e.unitId === 'tenghuang',
    );
    expect(tech).toBeDefined();
    const p10 = skillParams('141402', 10);
    const p1 = skillParams('141402', 1);
    const expectValue = 2000 * p10[0] + p10[1];
    // lv1 盾量 = 2000×0.14+100 = 380，与 lv10 不同（可区分旧 lv1 硬编码实现）
    expect(expectValue).not.toBeCloseTo(2000 * p1[0] + p1[1], 6);
    for (const id of ['qingge', 'sunday', 'jingyuan', 'tenghuang'] as const) {
      const sh = (tech!.buffs?.[id] ?? []).find((x) => x.key === 'shield');
      expect(sh, id).toBeDefined();
      expect(sh!.duration).toBe(3);
      expect(sh!.value).toBeCloseTo(expectValue, 6);
    }
  });
});

describe('专武叠影参数化与织锦（2026-10 裁定：现在参数化）', () => {
  const factorOf = (h: { factors: readonly { key: string; value: number }[] }, key: string): number =>
    h.factors.find((f) => f.key === key)?.value ?? 0;

  /** 单人景元纯净环境（techniques:false → 无秘技增伤；首动=战技 stacks<10） */
  const runJingyuan = (lc?: { lightconeId?: string; refinement?: number }) =>
    simulateBattle(
      baseConfig({
        members: [{ id: 'jingyuan', panel: panel('Thunder', 135, 0), ...lc }],
        techniques: false,
        rounds: 1,
        maxTime: 100,
        critMode: 'crit',
      }),
    );

  it('拂晓叠影5：战技增伤 = 叠影参数 #2（21%→按表），区别约定叠1的18%', () => {
    const r = runJingyuan({ lightconeId: '23010', refinement: 5 });
    const jy = r.hits.find((h) => h.source === 'jingyuan' && h.kind === 'direct');
    expect(jy).toBeDefined();
    const p5 = lcParams('23010', 5)!;
    expect(p5[1]).not.toBeCloseTo(0.18, 6);
    expect(factorOf(jy!, 'damageBonus')).toBeCloseTo(1 + p5[1], 10);
  });

  it('无 lightconeId 字段（旧档）→ 回退约定值：拂晓叠1 = 18%', () => {
    const r = runJingyuan();
    const jy = r.hits.find((h) => h.source === 'jingyuan' && h.kind === 'direct');
    expect(jy).toBeDefined();
    expect(factorOf(jy!, 'damageBonus')).toBeCloseTo(1 + 0.18, 10);
  });

  it('光锥≠专武 → 拂晓效果禁用（增伤因子=1），遗器蕉乐园照旧生效', () => {
    const r = runJingyuan({ lightconeId: '99999' });
    const jy = r.hits.find((h) => h.source === 'jingyuan' && h.kind === 'direct');
    expect(jy).toBeDefined();
    expect(factorOf(jy!, 'damageBonus')).toBeCloseTo(1, 10);
    // 遗器条款不受影响：暴伤 = 面板0.5 + 蕉乐园0.32
    expect(factorOf(jy!, 'crit')).toBeCloseTo(1 + 0.5 + 0.32, 10);
  });

  it('织锦：阿雅与忆灵攻击后叠层（上限6），满层后普攻段增伤 +0.09×6', () => {
    const r = simulateBattle(
      baseConfig({
        members: [{ id: 'aglaea', panel: panel('Thunder', 159, 0.194) }],
        techniques: false,
        rounds: 5,
        maxTime: 400,
      }),
    );
    const stackOf = (e: CombatEvent, uid: string): number =>
      (e.buffs?.[uid] ?? []).find((x) => x.labelKey === 'lcZhijin')?.stacks ?? 0;
    // 忆灵首动（刺纹之陷）事件即带 1 层（攻击后、记录前叠层），双方 holder 同步
    const firstYj = r.events.find((e) => e.kind === 'action' && e.unitId === 'yijiang');
    expect(firstYj).toBeDefined();
    expect(stackOf(firstYj!, 'aglaea')).toBe(1);
    expect(stackOf(firstYj!, 'yijiang')).toBe(1);
    // 阿雅第 2 个动作（普攻）事件 = 2 层
    const agActs = r.events.filter((e) => e.kind === 'action' && e.unitId === 'aglaea');
    expect(agActs.length).toBeGreaterThan(1);
    expect(stackOf(agActs[1], 'aglaea')).toBe(2);
    // 层数封顶 6（永不到 7）
    const maxStacks = Math.max(...r.events.map((e) => stackOf(e, 'aglaea')));
    expect(maxStacks).toBe(6);
    // 满层后阿雅普攻段增伤因子 = 1 + 0.09×6（单人纯净环境增伤区仅织锦）
    const capped = r.hits.find(
      (h) => h.source === 'aglaea' && h.kind === 'direct' && factorOf(h, 'damageBonus') > 1,
    );
    expect(capped).toBeDefined();
    expect(factorOf(capped!, 'damageBonus')).toBeCloseTo(1 + 0.09 * 6, 10);
    // 忆灵技刺纹之陷（aglaea.memo）非普攻 → 满层也不吃织锦普攻加成
    const memoHits = r.hits.filter(
      (h) => h.source === 'yijiang' && h.kind === 'direct' && h.skillCode === 'aglaea.memo',
    );
    expect(memoHits.length).toBeGreaterThan(0);
    for (const h of memoHits) expect(factorOf(h, 'damageBonus')).toBeCloseTo(1, 10);
    // 孤锋千吻衣匠段（aglaea.basic，若开大）按普攻计 → 满层吃 +0.54（范围含忆灵段=待核，先含入）
    const linkHits = r.hits.filter(
      (h) => h.source === 'yijiang' && h.kind === 'direct' && h.skillCode === 'aglaea.basic',
    );
    for (const h of linkHits) expect(factorOf(h, 'damageBonus')).toBeCloseTo(1 + 0.09 * 6, 10);
  });

  it('阿雅光锥≠专武 23036 → 织锦禁用（全程无织锦 buff、普攻无额外增伤）', () => {
    const r = simulateBattle(
      baseConfig({
        members: [
          { id: 'aglaea', panel: panel('Thunder', 159, 0.194), lightconeId: '99999' },
        ],
        techniques: false,
        rounds: 3,
        maxTime: 250,
      }),
    );
    expect(
      r.events.some((e) =>
        (e.buffs?.['aglaea'] ?? []).some((x) => x.labelKey === 'lcZhijin'),
      ),
    ).toBe(false);
    const agHits = r.hits.filter((h) => h.source === 'aglaea' && h.kind === 'direct');
    expect(agHits.length).toBeGreaterThan(0);
    for (const h of agHits) expect(factorOf(h, 'damageBonus')).toBeCloseTo(1, 10);
  });
});

describe('景元星魂（方案B，2026-10）', () => {
  /** 景元单人队（techniques 默认开 → 神君初始 6 段；三木桩；战斗无随机数完全确定） */
  const soloCfg = (eidolonLevel: number): BattleConfig => ({
    members: [{ id: 'jingyuan', panel: panel('Thunder', 135, 0), eidolonLevel }],
    monster: monster(),
    rounds: 6,
  });
  const ef = (
    h: { factors: readonly { key: string; value: number }[] },
    key: string,
  ): number => h.factors.find((x) => x.key === key)?.value ?? Number.NaN;
  const firstHit = (r: ReturnType<typeof simulateBattle>, code: string): typeof r.hits[number] => {
    const h = r.hits.find((x) => x.skillCode === code);
    if (!h) throw new Error(`缺少 hit: ${code}`);
    return h;
  };

  it('E3/E5：终结技/普攻/战技/天赋等级提高，普攻 +1 触发上限 10', () => {
    const r0 = simulateBattle(soloCfg(0));
    const r5 = simulateBattle(soloCfg(5));
    // E5 战技 +2（120402：10级 1.0 → 12级 1.1）
    expect(ef(firstHit(r5, 'jingyuan.skill'), 'base')).toBeCloseTo(
      ef(firstHit(r0, 'jingyuan.skill'), 'base') *
        (skillParams('120402', 12)[0] / skillParams('120402', 10)[0]),
      6,
    );
    // E3 终结技 +2（120403：10级 2.0 → 12级 2.08）
    expect(ef(firstHit(r5, 'jingyuan.ult'), 'base')).toBeCloseTo(
      ef(firstHit(r0, 'jingyuan.ult'), 'base') *
        (skillParams('120403', 12)[0] / skillParams('120403', 10)[0]),
      6,
    );
    // E5 天赋 +2（120404 神君段倍率：10级 0.66 → 12级 0.726）
    expect(ef(firstHit(r5, 'jingyuan.shenjun'), 'base')).toBeCloseTo(
      ef(firstHit(r0, 'jingyuan.shenjun'), 'base') *
        (skillParams('120404', 12)[1] / skillParams('120404', 10)[1]),
      6,
    );
    // E3 普攻 +1：基准 = 正常满级 6，星魂再 +1 → 7，倍率按 7/6 档提升（2026-10-29 等级口径修正）
    expect(ef(firstHit(r5, 'jingyuan.basic'), 'base')).toBeCloseTo(
      ef(firstHit(r0, 'jingyuan.basic'), 'base') *
        (skillParams('120401', 7)[0] / skillParams('120401', 6)[0]),
      6,
    );
  });

  it('神君基础相邻段（天赋 #5=25%）+ 星魂1 相邻倍率额外 +25%', () => {
    // 只取首次神君行动的段1（各次神君行动 note 同为 '1/8'，须按事件 hitSeqs 圈定）
    const seg = (r: ReturnType<typeof simulateBattle>) => {
      const sj = r.events.find((e) => e.unitId === 'shenjun');
      const inEvent = new Set(sj?.hitSeqs ?? []);
      // 2026-11-02：景元秘技让首轮神君段数 8→11（含景元侧加成），note 的总段数后缀会变 → 只认前缀
      return r.hits.filter((h) => inEvent.has(h.seq) && (h.note ?? '').startsWith('1/'));
    };
    const r0 = simulateBattle(soloCfg(0));
    const parts0 = seg(r0);
    const main0 = parts0.find((h) => h.target === 'monster2');
    const adj0 = parts0.filter((h) => h.target !== 'monster2');
    expect(main0).toBeTruthy();
    expect(adj0.length).toBe(2);
    // 基础相邻段 = 主目标 × 120404 参数 #5（=0.25，2026-10 用户裁定补齐）
    for (const a of adj0) expect(ef(a, 'base') / ef(main0!, 'base')).toBeCloseTo(skillParams('120404', 10)[4], 10);
    // 星魂1（param_list [0.25]）：相邻 = 25% + 25% = 50%；主目标倍率不受影响
    const r1 = simulateBattle(soloCfg(1));
    const parts1 = seg(r1);
    const main1 = parts1.find((h) => h.target === 'monster2');
    const adj1 = parts1.filter((h) => h.target !== 'monster2');
    expect(adj1.length).toBe(2);
    for (const a of adj1) expect(ef(a, 'base') / ef(main1!, 'base')).toBeCloseTo(0.25 + 0.25, 10);
    expect(ef(main1!, 'base')).toBeCloseTo(ef(main0!, 'base'), 6);
  });

  it('星魂2：神君行动后普攻/战技/终结技增伤 20%、随行动递减 2 回合', () => {
    const r0 = simulateBattle(soloCfg(0));
    const r2 = simulateBattle(soloCfg(2));
    const sj1 = r2.events.find((e) => e.unitId === 'shenjun');
    expect(sj1?.note).toContain('jingyuanE2');
    const sjT0 = r0.events.find((e) => e.unitId === 'shenjun')!.time;
    // 神君行动前的首个战技：无差异
    expect(ef(firstHit(r2, 'jingyuan.skill'), 'damageBonus')).toBeCloseTo(
      ef(firstHit(r0, 'jingyuan.skill'), 'damageBonus'),
      10,
    );
    // 神君行动后首个本体攻击（战技）+20%
    const post = (r: ReturnType<typeof simulateBattle>) =>
      r.hits.find(
        (h) => (h.skillCode === 'jingyuan.skill' || h.skillCode === 'jingyuan.ult') && h.time > sjT0,
      )!;
    expect(ef(post(r2), 'damageBonus')).toBeCloseTo(ef(post(r0), 'damageBonus') + 0.2, 10);
    // 神君追加攻击不吃 E2（只增伤本体普攻/战技/终结技）
    expect(ef(firstHit(r2, 'jingyuan.shenjun'), 'damageBonus')).toBeCloseTo(
      ef(firstHit(r0, 'jingyuan.shenjun'), 'damageBonus'),
      10,
    );
    // 增益快照：神君事件挂 E2（value 0.2、剩余 2 回合）；战技行动结束递减 → 同刻终结技快照 duration=1
    const snap = (ev: CombatEvent) =>
      ev.buffs?.['jingyuan']?.find((b) => b.labelKey === 'jingyuanE2');
    expect(snap(sj1!)?.value).toBeCloseTo(0.2, 10);
    expect(snap(sj1!)?.duration).toBe(2);
    const ultEv = r2.events.find((e) => e.skillCode === 'jingyuan.ult');
    expect(ultEv).toBeTruthy();
    expect(snap(ultEv!)?.duration).toBe(1);
  });

  it('星魂4：神君每段后景元恢复 2 能（×充能效率）', () => {
    const atShenjun = (eidolonLevel: number) => {
      const ctl = createInteractiveBattle(soloCfg(eidolonLevel));
      let step: BattleStep | null = ctl.advance();
      let guard = 0;
      while (step && guard < 80) {
        guard += 1;
        if (step.type === 'event') {
          if (step.event.unitId === 'shenjun') return step;
          step = ctl.advance();
        } else {
          step = ctl.advance({ action: step.status.sp >= 1 ? 'skill' : 'basic' });
        }
      }
      throw new Error('未到达神君行动');
    };
    const s0 = atShenjun(0);
    const s4 = atShenjun(4);
    if (s0.type !== 'event' || s4.type !== 'event') throw new Error('步骤类型错误');
    const stacks = s0.event.stacks ?? 0;
    const stacks4 = s4.event.stacks ?? 0;
    expect(stacks).toBeGreaterThan(0);
    // 无星魂 → 有星魂：E4「神君每段后回 2 能」。
    // 2026-11-02 重锚：秘技 120407 改变首轮段数后，「event.stacks」不再等于**实际结算段数**，
    // 因此不再写「差值 = 2×stacks」的等式，只锁方向 + 偶数性 + 实测差值（20 = 2×10 段）。
    const delta = s4.status.energy.jingyuan - s0.status.energy.jingyuan;
    expect(delta).toBeGreaterThan(0);
    expect(delta % 2).toBe(0);
    expect(delta).toBeCloseTo(20, 6);
    void stacks4;
    expect(s4.event.note).toContain('jingyuanE4');
    expect(s0.event.note).not.toContain('jingyuanE4');
  });

  it('星魂6：神君每段后目标易伤 +12%（≤3 层，攻击结束清除）', () => {
    const r6 = simulateBattle(soloCfg(6));
    const sj = r6.events.find((e) => e.unitId === 'shenjun');
    expect(sj?.note).toContain('jingyuanE6');
    const segs = (sj!.hitSeqs ?? []).map((q) => r6.hits[q]);
    const mainHits = segs.filter((h) => h.target === 'monster2');
    const adjHits = segs.filter((h) => h.target !== 'monster2');
    expect(mainHits.length).toBeGreaterThanOrEqual(4);
    // 段 i（0 起）主目标易伤 = 1 + min(i,3)×0.12（首段 0 层、第 4 段起封顶 3 层）
    mainHits.forEach((h, i) => {
      expect(ef(h, 'vuln')).toBeCloseTo(1 + Math.min(i, 3) * 0.12, 10);
    });
    // 相邻目标不叠层
    for (const h of adjHits) expect(ef(h, 'vuln')).toBeCloseTo(1, 10);
    // 攻击结束清除：其后本体战技不带易伤
    const next = r6.hits.find((h) => h.skillCode === 'jingyuan.skill' && h.time > sj!.time);
    expect(next).toBeTruthy();
    expect(ef(next!, 'vuln')).toBeCloseTo(1, 10);
    // 对照组：无星魂时神君全程无易伤
    const r0 = simulateBattle(soloCfg(0));
    const sj0 = r0.events.find((e) => e.unitId === 'shenjun');
    for (const q of sj0?.hitSeqs ?? []) expect(ef(r0.hits[q], 'vuln')).toBeCloseTo(1, 10);
  });
});

describe('周日星魂（方案B，2026-10）', () => {
  /** 周日+景元二人队（techniques 关闭避免秘技增益干扰；战斗无随机数完全确定）。
   * 事件序列（dump 实测）：#0 景元战技(74.07) → #1 周日战技(74.63) → #2 周日终招 →
   * #3 景元终招 → #4 景元战技(同刻被拉) → #5 神君 → …… 第 2 次周日战技在 149.25 */
  const cfg = (sundayEidolon: number, overrides: Partial<BattleConfig> = {}): BattleConfig => ({
    members: [
      { id: 'sunday', panel: panel('Imaginary', 134, 0.194), eidolonLevel: sundayEidolon },
      { id: 'jingyuan', panel: panel('Thunder', 135, 0), eidolonLevel: 0 },
    ],
    monster: monster(),
    rounds: 4,
    maxTime: 400,
    techniques: false,
    policy: () => 'skill',
    ...overrides,
  });
  /** 高暴击变体（E6 溢出转暴伤用）：面板暴击率 0.9 */
  const hiCfg = (sundayEidolon: number): BattleConfig => {
    const c = cfg(sundayEidolon);
    return {
      ...c,
      members: c.members.map((m) => ({ ...m, panel: { ...m.panel, critRate: 0.9 } })),
    };
  };
  const ef = (
    h: { factors: readonly { key: string; value: number }[] },
    key: string,
  ): number => h.factors.find((x) => x.key === key)?.value ?? Number.NaN;
  const hitOf = (r: ReturnType<typeof simulateBattle>, code: string, idx = 0) => {
    const h = r.hits.filter((x) => x.skillCode === code)[idx];
    if (!h) throw new Error(`缺少 hit: ${code} #${idx}`);
    return h;
  };
  const evOf = (r: ReturnType<typeof simulateBattle>, code: string, idx = 0) => {
    const e = r.events.filter((x) => x.skillCode === code)[idx];
    if (!e) throw new Error(`缺少事件: ${code} #${idx}`);
    return e;
  };
  const snap = (ev: CombatEvent, unit: string, label: string) =>
    ev.buffs?.[unit as keyof NonNullable<CombatEvent['buffs']>]?.find(
      (b) => b.labelKey === label,
    );
  /** 防御区 = 100 / (100 + 110 ×(1−无视防御%))（攻方 80 级 / 守方 90 级） */
  const defOf = (defIgnore: number): number => 100 / (100 + 110 * (1 - defIgnore));
  /** 首个周日战技时刻之后（含同刻）的 hit（景元战技一次 3 hit，按索引取会错位） */
  const hitsAfterSundaySkill = (
    r: ReturnType<typeof simulateBattle>,
    code: string,
  ): ReturnType<typeof hitOf>[] => {
    const t = evOf(r, 'sunday.skill').time;
    const hs = r.hits.filter((h) => h.skillCode === code && h.time >= t);
    if (!hs.length) throw new Error(`周日战技后缺少 hit: ${code}`);
    return hs;
  };

  it('天赋基础（E0）与 E3/E5 技能等级提高', () => {
    const r0 = simulateBattle(cfg(0));
    const r5 = simulateBattle(cfg(5));
    // 天赋基础（131304 本轮补进 skill-data）：战技后目标暴击率 +20%、持续 3 回合
    const s1 = evOf(r0, 'sunday.skill');
    expect(s1.note).toContain('sundayTalent');
    const t0 = snap(s1, 'jingyuan', 'sundayTalent');
    expect(t0?.value).toBeCloseTo(skillParams('131304', 10)[0], 10);
    expect(t0?.stacks).toBe(1);
    expect(t0?.duration).toBe(3);
    // E5 天赋+2（≤15）→ 12 级
    expect(snap(evOf(r5, 'sunday.skill'), 'jingyuan', 'sundayTalent')?.value).toBeCloseTo(
      skillParams('131304', 12)[0],
      10,
    );
    // E5 战技+2 → 131302 12 级增伤（目标有召唤物 → +p[3]）
    const p10 = skillParams('131302', 10);
    const p12 = skillParams('131302', 12);
    expect(snap(s1, 'jingyuan', 'sundaySkill')?.value).toBeCloseTo(p10[1] + p10[3], 10);
    expect(snap(evOf(r5, 'sunday.skill'), 'jingyuan', 'sundaySkill')?.value).toBeCloseTo(
      p12[1] + p12[3],
      10,
    );
    // E3 终结技+2 → 131303 12 级蒙福者暴伤 = p[1]×面板暴伤(0.5) + p[3]
    const u10 = skillParams('131303', 10);
    const u12 = skillParams('131303', 12);
    expect(snap(evOf(r0, 'sunday.ult'), 'jingyuan', 'blessed')?.value).toBeCloseTo(
      u10[1] * 0.5 + u10[3],
      10,
    );
    expect(snap(evOf(r5, 'sunday.ult'), 'jingyuan', 'blessed')?.value).toBeCloseTo(
      u12[1] * 0.5 + u12[3],
      10,
    );
    // E3 普攻 +1：基准 6 → 7（倍率按 7/6 档提升，2026-10-29 等级口径修正）
    const basicPolicy: BattleConfig['policy'] = ({ id }) =>
      id === 'sunday' ? 'basic' : 'skill';
    const b0 = simulateBattle(cfg(0, { policy: basicPolicy }));
    const b5 = simulateBattle(cfg(5, { policy: basicPolicy }));
    expect(ef(hitOf(b5, 'sunday.basic'), 'base')).toBeCloseTo(
      ef(hitOf(b0, 'sunday.basic'), 'base') *
        (skillParams('131301', 7)[0] / skillParams('131301', 6)[0]),
      6,
    );
  });

  it('星魂1：目标本体无视防御 16%、其召唤物无视 40%（持续 2 回合）', () => {
    const r0 = simulateBattle(cfg(0));
    const r1 = simulateBattle(cfg(1));
    // 周日战技前的首攻：无无视防御
    expect(ef(hitOf(r1, 'jingyuan.skill'), 'defense')).toBeCloseTo(defOf(0), 10);
    // 战技后本体（首个终招 hit）：16%
    expect(ef(hitsAfterSundaySkill(r1, 'jingyuan.skill')[0], 'defense')).toBeCloseTo(
      defOf(0.16),
      10,
    );
    expect(ef(hitOf(r1, 'jingyuan.ult'), 'defense')).toBeCloseTo(defOf(0.16), 10);
    expect(ef(hitOf(r0, 'jingyuan.ult'), 'defense')).toBeCloseTo(defOf(0), 10);
    // 神君 = 目标的召唤物：40%
    expect(ef(hitOf(r1, 'jingyuan.shenjun'), 'defense')).toBeCloseTo(defOf(0.4), 10);
    expect(ef(hitOf(r0, 'jingyuan.shenjun'), 'defense')).toBeCloseTo(defOf(0), 10);
    // 增益快照：本体 0.16 / 神君 0.4
    const s1 = evOf(r1, 'sunday.skill');
    expect(snap(s1, 'jingyuan', 'sundayE1')?.value).toBeCloseTo(0.16, 10);
    expect(snap(s1, 'shenjun', 'sundayE1')?.value).toBeCloseTo(0.4, 10);
    expect(snap(s1, 'jingyuan', 'sundayE1')?.duration).toBe(2);
    expect(snap(evOf(r0, 'sunday.skill'), 'jingyuan', 'sundayE1')).toBeUndefined();
    expect(s1.note).toContain('sundayE1');
    expect(evOf(r0, 'sunday.skill').note).not.toContain('sundayE1');
  });

  it('星魂2：首次终结技回 2 战技点（仅一次）+ 蒙福者伤害提高 30%', () => {
    const r0 = simulateBattle(cfg(0));
    const r2 = simulateBattle(cfg(2));
    // 首次终结技：SP +2（dump 实测 e0 sp=2 / e2 sp=4）
    const u1_0 = evOf(r0, 'sunday.ult');
    const u1_2 = evOf(r2, 'sunday.ult');
    expect(u1_2.spAfter! - u1_0.spAfter!).toBeCloseTo(2, 6);
    expect(u1_2.note).toContain('sundayE2');
    expect(u1_0.note).not.toContain('sundayE2');
    // 第二次终结技不再 +2（差值保持 2，不累积为 4；dump e0=-2 / e2=0）
    const u2_0 = evOf(r0, 'sunday.ult', 1);
    const u2_2 = evOf(r2, 'sunday.ult', 1);
    expect(u2_2.spAfter! - u2_0.spAfter!).toBeCloseTo(2, 6);
    // 蒙福者增伤 30% 快照（value 0.3、随蒙福者定点移除 → duration 取蒙福者 3 回合）
    const e2b = snap(u1_2, 'jingyuan', 'sundayE2');
    expect(e2b?.value).toBeCloseTo(0.3, 10);
    expect(e2b?.duration).toBe(3);
    // 周日战技后首个景元战技 +30%；战技前（周日开大前）无差
    expect(ef(hitsAfterSundaySkill(r2, 'jingyuan.skill')[0], 'damageBonus')).toBeCloseTo(
      ef(hitsAfterSundaySkill(r0, 'jingyuan.skill')[0], 'damageBonus') + 0.3,
      10,
    );
    expect(ef(hitOf(r2, 'jingyuan.skill'), 'damageBonus')).toBeCloseTo(
      ef(hitOf(r0, 'jingyuan.skill'), 'damageBonus'),
      10,
    );
  });

  it('星魂4：回合开始时恢复 8 点能量（×充能效率，决策点前生效）', () => {
    const r0 = simulateBattle(cfg(0));
    const r4 = simulateBattle(cfg(4));
    // 首动能量封顶 130 看不出差；第 2 次行动（dump 实测 56.118 → 65.670）
    const s2_0 = evOf(r0, 'sunday.skill', 1);
    const s2_4 = evOf(r4, 'sunday.skill', 1);
    expect(s2_4.energyAfter! - s2_0.energyAfter!).toBeCloseTo(8 * 1.194, 6);
    expect(s2_0.note).not.toContain('sundayE4');
    expect(s2_4.note).not.toContain('sundayE4'); // E4 无 note（回能发生在行动前）
    // 决策点（交互模式）：周日首次决策时能量已含 E4（90 → 90+8×1.194）
    const atDecision = (e: number): number => {
      const ctl = createInteractiveBattle(cfg(e));
      let step: BattleStep | null = ctl.advance();
      let guard = 0;
      while (step && guard < 40) {
        guard += 1;
        if (step.type === 'decision' && step.unitId === 'sunday') return step.status.energy.sunday;
        step =
          step.type === 'decision'
            ? ctl.advance({ action: step.status.sp >= 1 ? 'skill' : 'basic' })
            : ctl.advance();
      }
      throw new Error('未到达周日决策点');
    };
    expect(atDecision(4) - atDecision(0)).toBeCloseTo(8 * 1.194, 6);
    expect(atDecision(0)).toBeCloseTo(90, 6); // 130 上限 50% + 崇高拂尘 25
  });

  it('星魂6：天赋可叠 3 层、持续+1 回合、终结技也添加天赋', () => {
    const r0 = simulateBattle(cfg(0));
    const r6 = simulateBattle(cfg(6));
    const talent = (r: ReturnType<typeof simulateBattle>, i: number) =>
      snap(evOf(r, 'sunday.skill', i), 'jingyuan', 'sundayTalent');
    // 持续 3+1=4 回合；层数：战技1 → 终结技+1=2 → 第2次战技=3 → 之后封顶
    expect(talent(r6, 0)).toMatchObject({ stacks: 1, duration: 4 });
    expect(snap(evOf(r6, 'sunday.ult'), 'jingyuan', 'sundayTalent')?.stacks).toBe(2);
    expect(talent(r6, 1)?.stacks).toBe(3);
    expect(talent(r6, 2)?.stacks).toBe(3); // 封顶
    expect(talent(r6, 3)?.stacks).toBe(3); // 封顶
    // 无星魂：封顶 1 层、持续 3 回合
    expect(talent(r0, 0)).toMatchObject({ stacks: 1, duration: 3 });
    expect(talent(r0, 3)?.stacks).toBe(1);
    // 终结技也为目标添加天赋（仅 E6）
    expect(evOf(r6, 'sunday.ult').note).toContain('sundayTalent');
    expect(evOf(r0, 'sunday.ult').note).not.toContain('sundayTalent');
    expect(snap(evOf(r6, 'sunday.ult'), 'jingyuan', 'sundayTalent')?.stacks).toBe(2);
  });

  it('星魂6：天赋生效且暴击率溢出 100% 时每溢出 1% 暴击率 → 暴伤 2%', () => {
    const r5 = simulateBattle(hiCfg(5));
    const r6 = simulateBattle(hiCfg(6));
    // 条件一：未持有天赋（首攻，周日战技前）→ 不溢出加成，两组 crit 相同
    expect(ef(hitOf(r6, 'jingyuan.skill'), 'crit')).toBeCloseTo(
      ef(hitOf(r5, 'jingyuan.skill'), 'crit'),
      10,
    );
    // 条件二：持有天赋且暴击率>100%。周日战技+终招后首个景元战技（同刻序列 e5/e6 一致）
    const c5 = hitsAfterSundaySkill(r5, 'jingyuan.skill')[0];
    const c6 = hitsAfterSundaySkill(r6, 'jingyuan.skill')[0];
    const st5 = snap(evOf(r5, 'sunday.skill'), 'jingyuan', 'sundayTalent')?.stacks ?? 0;
    const st6 = snap(evOf(r6, 'sunday.ult'), 'jingyuan', 'sundayTalent')?.stacks ?? 0;
    // E5/E6 天赋同为 12 级；cr = 面板 0.9 + 行迹遣将 0.1 + 天赋层 ×每层值
    const val = skillParams('131304', 12)[0];
    const cr5 = 0.9 + 0.1 + val * st5;
    const cr6 = 0.9 + 0.1 + val * st6;
    expect(st5).toBe(1); // 无 E6 大招不添加天赋 → 封顶 1 层
    expect(st6).toBe(2); // E6：战技 1 层 + 终结技 +1
    expect(cr5).toBeGreaterThan(1);
    expect(cr6).toBeGreaterThan(1);
    // 从 e5 反推暴伤（吸收遗器/蒙福者/圣咏等全部来源），验证 e6 只注入溢出加成
    const cd5 = 1 + (ef(c5, 'crit') - 1) / cr5;
    expect(ef(c6, 'crit')).toBeCloseTo(1 + cr6 * (cd5 + (cr6 - 1) * 2 - 1), 6);
    // dump 实测锚点（面板暴击 0.9 二人队）：crit5=2.800720 / crit6=4.392640
    expect(ef(c5, 'crit')).toBeCloseTo(2.80072, 6);
    expect(ef(c6, 'crit')).toBeCloseTo(4.39264, 6);
  });
});

describe('晴歌星魂（方案B，2026-10）', () => {
  const factorOf = (
    h: { factors: readonly { key: string; value: number }[] },
    key: string,
  ): number => h.factors.find((f) => f.key === key)?.value ?? 0;

  /** 四人队（顺序与 dump 一致：晴歌/景元/周日/腾荒），仅晴歌带星魂 */
  const qgMembers = (e: number): CombatMember[] => [
    { id: 'qingge', panel: panel('Wind', 156, 0.194), eidolonLevel: e },
    { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
    { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
    { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
  ];

  const cfg = (e: number): BattleConfig => ({
    members: qgMembers(e),
    monster: monster(),
    rounds: 12,
    maxTime: 1500,
    techniques: false,
    policy: ({ id }) => (id === 'qingge' ? 'skill' : 'basic'),
  });

  const run = (e: number) => simulateBattle(cfg(e));

  const maxMood = (r: ReturnType<typeof simulateBattle>) =>
    Math.max(...r.events.map((e) => e.moodAfter ?? -Infinity));

  const enterFeverOf = (r: ReturnType<typeof simulateBattle>) => {
    const ev = r.events.find((e) => (e.note ?? []).includes('enterFever'));
    expect(ev, '无 enterFever 事件').toBeDefined();
    return ev!;
  };

  /** 首个忆灵技直伤（Fever 内）的 defense 乘区反解无视防御率（攻80/守90） */
  const memoDefIgnore = (r: ReturnType<typeof simulateBattle>) => {
    const h = r.hits.find((x) => x.skillCode === 'qingge.memo' && x.kind === 'direct');
    expect(h, '无忆灵技直伤').toBeDefined();
    const f = factorOf(h!, 'defense');
    return 1 - (100 / f - 100) / 110;
  };

  const memoBase = (r: ReturnType<typeof simulateBattle>) => {
    const h = r.hits.find((x) => x.skillCode === 'qingge.memo' && x.kind === 'direct');
    expect(h, '无忆灵技直伤').toBeDefined();
    return factorOf(h!, 'base');
  };

  it('E1 记录1%滚动真伤：结算=余量×(11%+气氛×0.1%)后清空50%；E0 无真伤', () => {
    const r0 = run(0);
    const r1 = run(1);
    expect(r0.hits.some((h) => h.kind === 'trueDamage')).toBe(false);
    expect(r1.hits.some((h) => h.kind === 'trueDamage')).toBe(true);

    const bySeq = new Map(r1.hits.map((h) => [h.seq, h]));
    let pending = 0;
    let settlements = 0;
    for (const ev of r1.events) {
      for (const seq of ev.hitSeqs ?? []) {
        const h = bySeq.get(seq)!;
        if (h.kind === 'trueDamage') {
          expect(h.note).toBe('qinggeE1');
          expect(factorOf(h, 'base')).toBeCloseTo(pending, 6);
          expect(factorOf(h, 'trueDamage')).toBeCloseTo(0.11 + (ev.moodAfter ?? 0) * 0.001, 6);
          settlements += 1;
          pending *= 0.5;
        } else {
          pending += h.total * 0.01;
        }
      }
    }
    expect(settlements).toBeGreaterThan(0);

    // dump 锚点：首个结算在首忆灵技 t=99.72（气氛5），真伤 total≈42.71、ratio=0.115
    // （2026-11-02 round 63：遗器127 生命上限 +24% 半边落地后整场伤害基数上浮 → 35.56 → 42.71）
    const first = r1.hits.find((h) => h.kind === 'trueDamage')!;
    expect(first.time).toBeCloseTo(99.72, 1);
    expect(factorOf(first, 'trueDamage')).toBeCloseTo(0.115, 6);
    expect(first.total).toBeCloseTo(42.71, 1);
    const settleEv = eventWithNote(r1, 'qinggeE1');
    expect(settleEv.time).toBeCloseTo(99.72, 1);
    expect(settleEv.moodAfter).toBe(5);
  });

  /** 含指定 note 的首个事件（E1 结算等通用查找） */
  function eventWithNote(r: ReturnType<typeof simulateBattle>, note: string) {
    const ev = r.events.find((e) => (e.note ?? []).includes(note));
    expect(ev, `无 note=${note} 事件`).toBeDefined();
    return ev!;
  }

  it('E2 全属性抗穿18% + 每次行动首次获气氛+2', () => {
    const r0 = run(0);
    const r2 = run(2);
    expect(factorOf(r0.hits[0], 'resist')).toBeCloseTo(1, 10);
    expect(factorOf(r2.hits[0], 'resist')).toBeCloseTo(1.18, 10);
    expect(r0.hits[0].total).toBeCloseTo(885.0, 1);
    expect(r2.hits[0].total).toBeCloseTo(1044.3, 1);
    expect(r0.events[0].moodAfter).toBe(1);
    expect(r2.events[0].moodAfter).toBe(3);
  });

  it('E2 气氛上限 +20（50→70）', () => {
    const r0 = run(0);
    const r4 = run(4);
    expect(maxMood(r0)).toBeLessThanOrEqual(50);
    const m4 = maxMood(r4);
    expect(m4).toBeGreaterThan(50);
    expect(m4).toBeLessThanOrEqual(70);
  });

  it('E3 天赋+2：Fever 中无视防御 0.21→0.22（defense 乘区反解，事件序列对齐）', () => {
    const r2 = run(2);
    const r3 = run(3);
    expect(memoDefIgnore(r2)).toBeCloseTo(0.21, 10);
    expect(memoDefIgnore(r3)).toBeCloseTo(0.22, 10);
    expect(memoDefIgnore(r3) - memoDefIgnore(r2)).toBeCloseTo(0.01, 10);
    // e2≈e3 时间线完全对齐（E3 只改 defense 不改时序）
    expect(r3.events.length).toBe(r2.events.length);
    r2.events.forEach((ev, i) => {
      expect(r3.events[i].time).toBeCloseTo(ev.time, 6);
      expect(r3.events[i].unitId).toBe(ev.unitId);
      expect(r3.events[i].skillCode).toBe(ev.skillCode);
    });
  });

  it('E4 进入 Fever 立即 +12 气氛', () => {
    const r3 = run(3);
    const r4 = run(4);
    const f3 = enterFeverOf(r3);
    const f4 = enterFeverOf(r4);
    expect(f4.time).toBeCloseTo(f3.time, 6);
    expect(f4.time).toBeCloseTo(89.55, 1);
    expect(f3.moodAfter).toBe(12);
    expect(f4.moodAfter).toBe(24);
    expect(f4.note ?? []).toContain('qinggeE4');
    expect(f3.note ?? []).not.toContain('qinggeE4');
  });

  it('E5 终结技+2：晴歌大招为目标回能 20%→21.6%（二人队锚点差 2.24）', () => {
    expect(skillParams('151203', 10)[2]).toBeCloseTo(0.2, 10);
    expect(skillParams('151203', 12)[2]).toBeCloseTo(0.216, 10);
    const cfg5 = (e: number): BattleConfig => ({
      members: [
        { id: 'qingge', panel: panel('Wind', 156, 0.194), eidolonLevel: e },
        { id: 'tenghuang', panel: panel('Physical', 40, 0.194) },
      ],
      monster: monster(),
      mainC: 'tenghuang',
      rounds: 12,
      maxTime: 1500,
      techniques: false,
      policy: ({ id }) => (id === 'qingge' ? 'skill' : 'basic'),
    });
    /** 首次晴歌大招后腾荒下一行动的能量（锚点来自 qingge-dump3） */
    const afterFirstUlt = (r: ReturnType<typeof simulateBattle>) => {
      const ult = r.events.find((ev) => ev.kind === 'ult' && ev.skillCode === 'qingge.ult');
      expect(ult, '无晴歌终结技事件').toBeDefined();
      expect(ult!.targetId).toBe('tenghuang');
      const idx = r.events.indexOf(ult!);
      const next = r.events
        .slice(idx + 1)
        .find((ev) => ev.kind === 'action' && ev.unitId === 'tenghuang');
      expect(next, '晴歌大招后无腾荒行动').toBeDefined();
      return next!.energyAfter!;
    };
    const en0 = afterFirstUlt(simulateBattle(cfg5(0)));
    const en5 = afterFirstUlt(simulateBattle(cfg5(5)));
    expect(en0).toBeCloseTo(126.544, 3);
    expect(en5).toBeCloseTo(128.784, 3);
    expect(en5 - en0).toBeCloseTo(2.24, 6);
  });

  it('E6 首次进Fever与每个倒计时回合固定回能140（蓄层：事件能量=0）', () => {
    const r4 = run(4);
    const r6 = run(6);
    expect(enterFeverOf(r6).note ?? []).toContain('qinggeE6');
    expect(enterFeverOf(r4).note ?? []).not.toContain('qinggeE6');
    const cd6 = r6.events.filter((e) => e.unitId === 'countdown');
    expect(cd6.length).toBeGreaterThan(0);
    for (const cd of cd6) {
      expect(cd.note ?? []).toContain('qinggeE6');
      expect(cd.energyAfter).toBe(0);
    }
    const cd4 = r4.events.filter((e) => e.unitId === 'countdown');
    expect(cd4.length).toBeGreaterThan(0);
    expect(cd4.every((e) => !(e.note ?? []).includes('qinggeE6'))).toBe(true);
    expect(cd4[0].energyAfter).toBeGreaterThan(0);
  });

  it('E6 交互：进Fever后能量0且终结技就绪；忆灵技伤害倍率 +100%（base×2）', () => {
    // 倍率×2：e5 首个忆灵技 base=14322 → e6=28644（dump 锚点）
    // （2026-11-02 round 63：遗器127 生命上限 +24% 半边落地 → 基数 11550/23100 整体 ×1.24）
    const b5 = memoBase(simulateBattle(cfg(5)));
    const b6 = memoBase(simulateBattle(cfg(6)));
    expect(b5).toBeCloseTo(14322, 6);
    expect(b6).toBeCloseTo(28644, 6);
    expect(b6).toBeCloseTo(b5 * 2, 6);

    // 交互推进到首次 enterFever：蓄层回满 → 能量清零、终结技就绪
    const ctl = createInteractiveBattle(cfg(6));
    let step = ctl.advance();
    let guard = 0;
    let checked = false;
    while (step && guard < 400) {
      guard += 1;
      if (step.type === 'decision') {
        step = ctl.advance({
          action: step.unitId === 'qingge' && step.status.sp >= 1 ? 'skill' : 'basic',
        });
      } else {
        if ((step.event.note ?? []).includes('enterFever')) {
          expect(step.event.note ?? []).toContain('qinggeE6');
          expect(step.status.ultReady).toContain('qingge');
          expect(step.status.energy.qingge).toBe(0);
          checked = true;
          break;
        }
        step = ctl.advance();
      }
    }
    expect(checked).toBe(true);
  });
});

describe('腾荒星魂（方案B，2026-10）', () => {
  const factorOf = (
    h: { factors: readonly { key: string; value: number }[] },
    key: string,
  ): number => h.factors.find((f) => f.key === key)?.value ?? 0;

  /** 二人队（与 dump 一致：腾荒134/景元135，techniques:false），仅腾荒带星魂 */
  const tfMembers = (e: number): CombatMember[] => [
    { id: 'tenghuang', panel: panel('Physical', 134, 0.194), eidolonLevel: e },
    { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
  ];

  const cfg = (e: number): BattleConfig => ({
    members: tfMembers(e),
    monster: monster(),
    rounds: 12,
    maxTime: 1500,
    techniques: false,
    policy: ({ id }) => (id === 'tenghuang' ? 'skill' : 'basic'),
  });

  const run = (e: number) => simulateBattle(cfg(e));

  const firstUlt = (r: ReturnType<typeof simulateBattle>) => {
    const ev = r.events.find((e) => e.kind === 'ult' && e.unitId === 'tenghuang');
    expect(ev, '无腾荒终结技事件').toBeDefined();
    return ev!;
  };

  const firstSkill = (r: ReturnType<typeof simulateBattle>) => {
    const ev = r.events.find((e) => e.skillCode === 'tenghuang.skill');
    expect(ev, '无腾荒战技事件').toBeDefined();
    return ev!;
  };

  /** 首次强化龙灵行动（note=enhanceAct；龙灵非强化行动无此 note） */
  const firstEnhance = (r: ReturnType<typeof simulateBattle>) => {
    const ev = r.events.find((e) => (e.note ?? []).includes('enhanceAct'));
    expect(ev, '无强化龙灵事件').toBeDefined();
    return ev!;
  };

  const ultEvents = (r: ReturnType<typeof simulateBattle>) =>
    r.events.filter((e) => e.kind === 'ult' && e.unitId === 'tenghuang');

  const hitsOf = (r: ReturnType<typeof simulateBattle>, ev: { hitSeqs?: number[] }) =>
    (ev.hitSeqs ?? []).map((s) => {
      const h = r.hits.find((x) => x.seq === s);
      expect(h, `无 hit seq=${s}`).toBeDefined();
      return h!;
    });

  const shieldOf = (
    ev: { buffs?: Record<string, readonly { key: string; value: number }[] | undefined> },
    unit: string,
  ) => ev.buffs?.[unit]?.find((b) => b.key === 'shield')?.value;

  /** defense 乘区反解无视防御率（攻80/守90） */
  const diOf = (h: { factors: readonly { key: string; value: number }[] }) => {
    const f = factorOf(h, 'defense');
    return 1 - (100 / f - 100) / 110;
  };

  it('E1 大招SP+1与同袍抗穿18%：buff落景元、同袍/峥嵘段与景元普攻 resist=1.18', () => {
    const r0 = run(0);
    const r1 = run(1);
    expect(r0.report.totalDamage).toBeCloseTo(152038.22, 1);
    expect(r1.report.totalDamage).toBeCloseTo(161557.29, 1);

    const u0 = firstUlt(r0);
    const u1 = firstUlt(r1);
    expect(u0.spAfter).toBe(2);
    expect(u1.spAfter).toBe(3); // E1 大招 SP+1
    expect(u0.note ?? []).not.toContain('tenghuangE1');
    expect(u1.note ?? []).toContain('tenghuangE1');
    const rb = u1.buffs?.jingyuan?.find((b) => b.key === 'resPenetration');
    expect(rb).toMatchObject({ value: 0.18, labelKey: 'tenghuangE1', source: 'tenghuang' });
    expect(rb?.duration).toBe(3);

    // 大招自身不吃（抗穿挂景元 holder）
    expect(factorOf(hitsOf(r1, u1)[0], 'resist')).toBeCloseTo(1, 10);

    // 首次强化：同袍/峥嵘段吃 1.18，强化追加段不吃；base 不变
    const h0 = hitsOf(r0, firstEnhance(r0));
    const h1 = hitsOf(r1, firstEnhance(r1));
    expect(factorOf(h0[0], 'resist')).toBeCloseTo(1, 10);
    expect(factorOf(h1[0], 'resist')).toBeCloseTo(1, 10);
    expect(factorOf(h1[1], 'resist')).toBeCloseTo(1.18, 10);
    expect(factorOf(h1[2], 'resist')).toBeCloseTo(1.18, 10);
    expect(factorOf(h0[1], 'resist')).toBeCloseTo(1, 10);
    expect(factorOf(h1[1], 'base')).toBeCloseTo(2281.6, 1);

    // 抗穿生效窗口：大招后的景元普攻吃 1.18，大招前的不吃
    const b1 = r1.hits.find((h) => h.skillCode === 'jingyuan.basic' && h.time > u1.time + 1);
    const b0 = r0.hits.find((h) => h.skillCode === 'jingyuan.basic' && h.time > u0.time + 1);
    expect(b1, '无大招后景元普攻').toBeDefined();
    expect(b0, '无大招后景元普攻').toBeDefined();
    expect(factorOf(b1!, 'resist')).toBeCloseTo(1.18, 10);
    expect(factorOf(b0!, 'resist')).toBeCloseTo(1, 10);
    const firstBasic0 = r0.hits.find((h) => h.skillCode === 'jingyuan.basic')!;
    expect(factorOf(firstBasic0, 'resist')).toBeCloseTo(1, 10); // buff 前
  });

  it('E2 强化+2并拉条龙灵：首强化与大招同刻、盾×2、同袍/峥嵘伤害×2、时间线对齐', () => {
    const r0 = run(0);
    const r2 = run(2);
    expect(r2.report.totalDamage).toBeCloseTo(223208.04, 1);
    const u0 = firstUlt(r0);
    const u2 = firstUlt(r2);
    expect(u2.note ?? []).toContain('tenghuangE2');
    expect(u0.note ?? []).not.toContain('tenghuangE2');

    // 拉条：首次强化与大招同刻（e0 在 t=134.68）
    const e0 = firstEnhance(r0);
    const e2 = firstEnhance(r2);
    expect(e0.time).toBeCloseTo(134.68, 1);
    expect(e2.time).toBeCloseTo(89.55, 1);
    expect(e2.time).toBeCloseTo(u2.time, 6);

    // 当次峥嵘盾 ×2：基础 +200 → +400（技能盾 800 打底）
    expect(shieldOf(e0, 'tenghuang')).toBeCloseTo(1000, 5);
    expect(shieldOf(e2, 'tenghuang')).toBeCloseTo(1200, 5);

    // 同袍/峥嵘段伤害 ×2，强化追加段不变
    const h0 = hitsOf(r0, e0);
    const h2 = hitsOf(r2, e2);
    expect(factorOf(h0[0], 'base')).toBeCloseTo(1600, 1);
    expect(factorOf(h2[0], 'base')).toBeCloseTo(1600, 1);
    expect(factorOf(h0[1], 'base')).toBeCloseTo(2281.6, 1);
    expect(factorOf(h2[1], 'base')).toBeCloseTo(4563.2, 1);
    expect(factorOf(h2[2], 'base')).toBeCloseTo(2281.6, 1);
    expect(factorOf(h2[2], 'base')).toBeCloseTo(factorOf(h0[2], 'base') * 2, 1);

    // 两首大招间强化行动数 2 → 4（拉条多插 2 次）
    const ul0 = ultEvents(r0);
    const ul2 = ultEvents(r2);
    expect(ul0.length).toBe(5);
    const cnt = (r: ReturnType<typeof simulateBattle>, ul: typeof ul0) =>
      r.events.filter(
        (e) =>
          (e.note ?? []).includes('enhanceAct') &&
          e.time >= ul[0].time &&
          e.time < ul[1].time,
      ).length;
    expect(cnt(r0, ul0)).toBe(2);
    expect(cnt(r2, ul2)).toBe(4);

    // 拉条只影响龙灵：腾荒大招时刻完全对齐
    expect(ul2.length).toBe(5);
    ul0.forEach((u, i) => expect(ul2[i].time).toBeCloseTo(u.time, 6));
  });

  it('E3 终结技+2：大招段 6000→6600、大招盾 800→869、战技盾不变 800', () => {
    expect(skillParams('141403', 10)[0]).toBe(3);
    expect(skillParams('141403', 12)[0]).toBeCloseTo(3.3, 10);
    expect(skillParams('141402', 10)[0]).toBeCloseTo(0.2, 10);
    expect(skillParams('141402', 12)[0]).toBeCloseTo(0.212, 10);

    const r0 = run(0);
    const r3 = run(3);
    // E3 不升战技 → 战技盾不变；升终结技 → 大招盾随 141403 lv12（0.212×2000+445）
    expect(shieldOf(firstSkill(r0), 'tenghuang')).toBeCloseTo(800, 5);
    expect(shieldOf(firstSkill(r3), 'tenghuang')).toBeCloseTo(800, 5);
    expect(shieldOf(firstUlt(r0), 'tenghuang')).toBeCloseTo(800, 5);
    expect(shieldOf(firstUlt(r3), 'tenghuang')).toBeCloseTo(869, 5);

    const u0 = firstUlt(r0);
    const u3 = firstUlt(r3);
    expect(factorOf(hitsOf(r0, u0)[0], 'base')).toBeCloseTo(6000, 1);
    expect(factorOf(hitsOf(r3, u3)[0], 'base')).toBeCloseTo(6600, 1); // p[0] 3→3.3

    // 强化追加 p[7] 0.8→0.88；同袍附加 = 2852×0.88×E2(×2)；天赋未升（峥嵘不变）
    const h3 = hitsOf(r3, firstEnhance(r3));
    expect(factorOf(h3[0], 'base')).toBeCloseTo(1760, 1);
    expect(factorOf(h3[1], 'base')).toBeCloseTo(5019.52, 1);
    expect(factorOf(h3[2], 'base')).toBeCloseTo(2281.6, 1);
    expect(r3.report.totalDamage).toBeCloseTo(233460.16294, 4);
  });

  it('E5 战技+2：战技盾 800→869，伤害与 E3 完全一致', () => {
    const r3 = run(3);
    const r5 = run(5);
    expect(shieldOf(firstSkill(r3), 'tenghuang')).toBeCloseTo(800, 5);
    expect(shieldOf(firstSkill(r5), 'tenghuang')).toBeCloseTo(869, 5); // 0.212×2000+445
    // E5 天赋+2 不可观测（伤害段不走天赋参数）→ 总伤逐位相同
    expect(r5.report.totalDamage).toBeCloseTo(r3.report.totalDamage, 6);
  });

  it('E6 无视防御12%+易伤20%+大招追加同袍附加330%（三木桩）', () => {
    const r0 = run(0);
    const r6 = run(6);

    // 战斗开始即生效：景元普攻吃 E6①易伤 与 E6②无视防御（同袍=景元）
    const b0 = r0.hits.find((h) => h.skillCode === 'jingyuan.basic')!;
    const b6 = r6.hits.find((h) => h.skillCode === 'jingyuan.basic')!;
    expect(diOf(b0)).toBeCloseTo(0, 10);
    expect(factorOf(b0, 'vuln')).toBeCloseTo(1, 10);
    expect(diOf(b6)).toBeCloseTo(0.12, 6);
    expect(factorOf(b6, 'vuln')).toBeCloseTo(1.2, 10);

    // 大招：腾荒本体不吃 E6②（无视防御）但吃 E6①（易伤）
    const u0 = firstUlt(r0);
    const u6 = firstUlt(r6);
    expect(u0.note ?? []).not.toContain('tenghuangE6');
    expect(u6.note ?? []).toContain('tenghuangE6');
    const uh0 = hitsOf(r0, u0);
    const uh6 = hitsOf(r6, u6);
    expect(uh0.length).toBe(3);
    expect(uh6.length).toBe(6); // 本体3段 + E6③追加3段
    expect(diOf(uh6[0])).toBeCloseTo(0, 10);
    expect(factorOf(uh6[0], 'vuln')).toBeCloseTo(1.2, 10);

    // E6③：三段同袍附加 330%（2852×3.3），吃抗穿+无视防御+易伤，目标=三木桩
    const e6hits = uh6.filter((h) => h.note === 'tenghuangE6');
    expect(e6hits.length).toBe(3);
    expect(e6hits.map((h) => h.target)).toEqual(['monster1', 'monster2', 'monster3']);
    for (const h of e6hits) {
      expect(factorOf(h, 'base')).toBeCloseTo(9411.6, 1);
      expect(diOf(h)).toBeCloseTo(0.12, 6);
      expect(factorOf(h, 'resist')).toBeCloseTo(1.18, 10);
      expect(factorOf(h, 'vuln')).toBeCloseTo(1.2, 10);
    }

    // 强化行动：龙灵本体不吃 E6②，同袍/峥嵘附加吃（面板为景元面板）
    const eh = hitsOf(r6, firstEnhance(r6));
    expect(diOf(eh[0])).toBeCloseTo(0, 10);
    expect(factorOf(eh[0], 'vuln')).toBeCloseTo(1.2, 10);
    expect(diOf(eh[1])).toBeCloseTo(0.12, 6);
    expect(diOf(eh[2])).toBeCloseTo(0.12, 6);
    expect(factorOf(eh[1], 'vuln')).toBeCloseTo(1.2, 10);

    expect(r6.report.totalDamage).toBeCloseTo(386370.63, 1);
  });

  it('E6 击破DoT跳伤吃易伤20%（E6①）', () => {
    const breakCfg = (e: number): BattleConfig => ({
      members: tfMembers(e),
      monster: monster(2e6, 150),
      rounds: 10,
      maxTime: 600,
      techniques: false,
      policy: ({ id }) => (id === 'tenghuang' ? 'skill' : 'basic'),
    });
    const r0 = simulateBattle(breakCfg(0));
    const r6 = simulateBattle(breakCfg(6));
    const dot0 = r0.hits.filter((h) => h.kind === 'breakDot');
    const dot6 = r6.hits.filter((h) => h.kind === 'breakDot');
    expect(dot0.length, 'E0 无破韧击破DoT').toBeGreaterThan(0);
    expect(dot6.length, 'E6 无破韧击破DoT').toBeGreaterThan(0);
    for (const h of dot0) expect(factorOf(h, 'vuln')).toBeCloseTo(1, 10);
    for (const h of dot6) expect(factorOf(h, 'vuln')).toBeCloseTo(1.2, 10);
  });
});

describe('阿雅星魂（方案B，2026-10）', () => {
  const factorOf = (
    h: { factors: readonly { key: string; value: number }[] },
    key: string,
  ): number => h.factors.find((f) => f.key === key)?.value ?? 0;

  const ag = (eidolonLevel: number, extra: Partial<CombatMember> = {}): CombatMember => ({
    id: 'aglaea',
    panel: { ...panel('Thunder', 159, 0), attack: 2000, critRate: 0.7, critDmg: 1.06 },
    eidolonLevel,
    ...extra,
  });

  /** E2「无视防御」n 层时的防御区（攻80/守90、无减防）：100/(100+110×(1−0.14n)) */
  const defWith = (n: number): number => 100 / (100 + 110 * (1 - 0.14 * n));
  const isDef = (h: { factors: readonly { key: string; value: number }[] }, n: number) =>
    Math.abs(factorOf(h, 'defense') - defWith(n)) < 1e-12;

  const agCfg = (overrides: Partial<BattleConfig> = {}): BattleConfig =>
    baseConfig({
      members: [ag(0)],
      techniques: false,
      rounds: 10,
      maxTime: 400,
      ...overrides,
    });

  const firstHitOf = (
    r: ReturnType<typeof simulateBattle>,
    pred: (e: CombatEvent) => boolean,
  ): (typeof r)['hits'][number] => {
    const ev = r.events.find((e) => e.kind === 'action' && pred(e));
    expect(ev, '未找到目标事件').toBeDefined();
    return r.hits[ev!.hitSeqs![0]];
  };

  it('E2 无视防御：行动前叠层、上限3、他角行动清除、木桩不清除', () => {
    const duo = (e: number): BattleConfig =>
      agCfg({
        members: [ag(e), { id: 'jingyuan', panel: panel('Thunder', 135, 0), eidolonLevel: 0 }],
      });
    const r2 = simulateBattle(duo(2));
    const r0 = simulateBattle(duo(0));
    // 阿雅战技叠1（无伤害）→ 衣匠立即行动再叠1 → 首个忆灵技按2层
    expect(isDef(firstHitOf(r2, (e) => e.unitId === 'yijiang'), 2)).toBe(true);
    expect(r2.events.find((e) => e.kind === 'action' && e.unitId === 'yijiang')!.note).toContain(
      'aglaeaE2',
    );
    // 景元行动清除 → 阿雅下一普攻仅1层（未清则应为3层）
    expect(isDef(firstHitOf(r2, (e) => e.unitId === 'aglaea' && e.action === 'basic'), 1)).toBe(
      true,
    );
    // 景元事件不带叠层 note、其自身伤害不吃无视防御
    const jev = r2.events.find((e) => e.kind === 'action' && e.unitId === 'jingyuan')!;
    expect(jev.note ?? []).not.toContain('aglaeaE2');
    expect(isDef(r2.hits[jev.hitSeqs![0]], 0)).toBe(true);
    // 无人清层区间（仅阿雅/衣匠行动）出现3层封顶
    expect(r2.hits.some((h) => isDef(h, 3))).toBe(true);
    // E0 基线：全程无无视防御
    expect(r0.hits.every((h) => isDef(h, 0))).toBe(true);
    // 单人队：木桩行动（t=100 无伤害）不清除 → 阿雅首普攻前已叠满3层
    const solo = simulateBattle(agCfg({ members: [ag(2)] }));
    const mIdx = solo.events.findIndex((e) => e.kind === 'action' && e.unitId === 'monster1');
    expect(mIdx).toBeGreaterThan(0);
    const aIdx = solo.events.findIndex(
      (e, i) => i > mIdx && e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'basic',
    );
    expect(isDef(solo.hits[solo.events[aIdx].hitSeqs![0]], 3)).toBe(true);
  });

  it('E4 忆灵天赋层数上限7：阿雅普攻打中旧织线后+1、每次攻击只+1', () => {
    const stackNotes = (r: ReturnType<typeof simulateBattle>) =>
      r.events.filter((e) => (e.note ?? []).includes('tailorStack'));
    const r0 = simulateBattle(agCfg());
    const r4 = simulateBattle(agCfg({ members: [ag(4)] }));
    // E0：阿雅自身普攻从不叠层（叠层仅来自衣匠刺纹之陷）
    for (const e of r0.events) {
      if (e.kind === 'action' && e.unitId === 'aglaea') {
        expect(e.note ?? []).not.toContain('tailorStack');
      }
    }
    // E4：首普攻（攻击后才挂织线，无旧线）不叠；第2普攻打旧线 +1
    const basics = r4.events.filter(
      (e) => e.kind === 'action' && e.unitId === 'aglaea' && e.action === 'basic',
    );
    expect(basics.length).toBeGreaterThan(1);
    expect(basics[0].note ?? []).not.toContain('tailorStack');
    expect(basics[1].note ?? []).toContain('tailorStack');
    // 上限 7（基础6 + E4上限+1）：整场叠层 note 恰7条，触顶后普攻不再增长
    expect(stackNotes(r4).length).toBe(7);
    expect(stackNotes(r0).length).toBe(3);
  });

  it('E3 等级+2：普攻倍率（basic:9→10，上限10）可观测', () => {
    const firstBasicBase = (e: number): number =>
      factorOf(
        firstHitOf(simulateBattle(agCfg({ members: [ag(e, { skillLevels: { basic: 9 } })] })), (
          x,
        ) => x.unitId === 'aglaea' && x.action === 'basic'),
        'base',
      );
    // 140201 普攻倍率 p[0]：lv9=1.3 → E3 升 lv10=1.4（面板攻击 2000，无短视之惩）
    expect(firstBasicBase(0)).toBeCloseTo(2000 * 1.3, 6);
    expect(firstBasicBase(3)).toBeCloseTo(2000 * 1.4, 6);
  });

  it('E5 等级+2：天赋织线附加段倍率（0.3→0.336）可观测', () => {
    const firstThreadBase = (e: number): number => {
      const r = simulateBattle(agCfg({ members: [ag(e)] }));
      const th = r.hits.find((h) => h.skillCode === 'aglaea.thread');
      expect(th, '无织线附加段').toBeDefined();
      return factorOf(th!, 'base');
    };
    // 140204 p[0]：lv10=0.3 → E5 升 lv12=0.336（首段在至高之姿前，攻击2000）
    expect(firstThreadBase(0)).toBeCloseTo(600, 6);
    expect(firstThreadBase(5)).toBeCloseTo(672, 6);
  });

  it('E6 至高之姿连携：全属性抗穿20%、速度判档增伤（织线附加段不吃）', () => {
    const kissRun = (e: number) => {
      const r = simulateBattle(
        agCfg({
          members: [ag(e)],
          maxTime: 1000,
          policy: (ctx) => (ctx.supreme ? 'skill' : 'basic'),
        }),
      );
      const ultIdx = r.events.findIndex((x) => x.kind === 'ult' && x.unitId === 'aglaea');
      expect(ultIdx, '未开出终结技').toBeGreaterThanOrEqual(0);
      const first = r.events.find(
        (x, i) =>
          i > ultIdx && x.kind === 'action' && x.unitId === 'aglaea' && x.action === 'basic',
      );
      expect(first).toBeDefined();
      return { r, first: first! };
    };
    const { r: r0, first: k0 } = kissRun(0);
    const { r: r6, first: k6 } = kissRun(6);
    const hitsOf = (r: ReturnType<typeof simulateBattle>, ev: CombatEvent) =>
      (ev.hitSeqs ?? []).map((s) => r.hits[s]);
    // 首次孤锋千吻（两版本时间线一致 t≈566.04）：E6 全段抗性区1.2、E0 为1
    expect(hitsOf(r6, k6).length).toBeGreaterThan(0);
    for (const h of hitsOf(r6, k6)) {
      expect(factorOf(h, 'resist')).toBeCloseTo(1.2, 10);
      // 速度判档：首波阿雅159≤160、衣匠≈55.65+层×63.8 未过160 → 无连携增伤
      expect(factorOf(h, 'damageBonus')).toBeCloseTo(1.54, 10);
    }
    for (const h of hitsOf(r0, k0)) expect(factorOf(h, 'resist')).toBeCloseTo(1, 10);
    expect(k6.note ?? []).not.toContain('aglaeaE6');
    expect(k0.note ?? []).not.toContain('aglaeaE6');
    // 后续孤锋千吻：阿雅段过160档 +10%（伤害区 1.54→1.64）且事件带 aglaeaE6 note
    expect(
      r6.hits.some(
        (h) =>
          h.source === 'aglaea' &&
          h.skillCode === 'aglaea.basic' &&
          Math.abs(factorOf(h, 'damageBonus') - 1.64) < 1e-9,
      ),
      '阿雅段未吃到160档增伤',
    ).toBe(true);
    // 衣匠段独立判档：忆灵天赋按正常满级 6 → 每层速度 +55（Lv10 时 63.8）→ 本窗口内只到 160 档 +10%
    // （原断言 240 档 +30% 已在 2026-10-29 等级口径修正后不再达成）
    expect(
      r6.hits.some(
        (h) =>
          h.source === 'yijiang' &&
          h.skillCode === 'aglaea.basic' &&
          Math.abs(factorOf(h, 'damageBonus') - 1.64) < 1e-9,
      ),
      '衣匠段未吃到160档增伤',
    ).toBe(true);
    expect(r6.events.some((e) => (e.note ?? []).includes('aglaeaE6'))).toBe(true);
    // 织线附加段：不吃连携增伤（damageBonus 恒1）；抗穿随至高之姿开关（姿内1.2、解除后回落1）
    const threads = r6.hits.filter((h) => h.skillCode === 'aglaea.thread');
    expect(threads.length).toBeGreaterThan(0);
    for (const h of threads) expect(factorOf(h, 'damageBonus')).toBeCloseTo(1, 10);
    expect(
      threads.some((h) => factorOf(h, 'resist') > 1.1),
      '姿内织线段未吃抗穿',
    ).toBe(true);
    expect(
      threads.some((h) => factorOf(h, 'resist') < 1.01),
      '解除后织线段仍吃抗穿',
    ).toBe(true);
    // E0 对照：全程无连携增伤 note
    expect(r0.events.some((e) => (e.note ?? []).includes('aglaeaE6'))).toBe(false);
  });
});
