import { describe, expect, it } from 'vitest';
import { simulateBattle, feiyingSgUltMult, type BattleConfig, type CombatEvent, type CombatMember, type HitLog } from '../src/index.js';

/** 绯英1505接入（dump 锚点法，seed 20261009；锚点来源=临时 feiying-dump.test.ts 六组运行） */

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 104,
  attack: 2000,
  hp: 3000,
  defence: 800,
  element: 'Physical' as const,
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
  elementDmg: { Physical: 0.3 },
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

const fy = (eidolon: number): CombatMember => ({
  id: 'feiying',
  eidolonLevel: eidolon,
  panel: mkPanel(),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const cfg = (members: CombatMember[], techniques = false): BattleConfig => ({
  members,
  monster: MON,
  techniques,
  rounds: 40,
  maxTime: 3000,
  seed: 20261009,
});

const noteArr = (n: unknown): string[] =>
  Array.isArray(n) ? (n as string[]) : n ? [String(n)] : [];

const factorOf = (h: HitLog, k: string): number =>
  h.factors.find((f) => f.key === k)?.value ?? Number.NaN;

const actsOf = (r: ReturnType<typeof simulateBattle>): CombatEvent[] =>
  r.events.filter((e) => e.kind === 'action' || e.kind === 'ult');

const ev = (r: ReturnType<typeof simulateBattle>, pred: (e: CombatEvent) => boolean): CombatEvent => {
  const e = actsOf(r).find(pred);
  if (!e) throw new Error('no matching event');
  return e;
};

const hitsOf = (r: ReturnType<typeof simulateBattle>, e: CombatEvent): HitLog[] =>
  (e.hitSeqs ?? []).map((s) => r.hits.find((h) => h.seq === s)!);

describe('绯英1505接入', () => {
  const r0 = simulateBattle(cfg([fy(0)]));

  it('战技结构与能量/好活同步（e0 锚点）', () => {
    const sk = ev(r0, (e) => e.kind === 'action' && e.action === 'skill');
    expect(sk.time).toBeCloseTo(96.15, 1);
    expect(sk.energyAfter).toBe(290); // 240 初始 + 进战好活20 转能量 + 战技30
    expect(sk.laughPointsAfter).toBe(10); // 战技 #4 固定笑点10
    expect(noteArr(sk.note)).toContain('fyTalent');
    const hs = hitsOf(r0, sk);
    expect(hs).toHaveLength(6); // 3怪×(直伤+天赋附带欢愉段)
    const main = hs.find((h) => h.kind === 'direct' && factorOf(h, 'base') === 6000);
    expect(main).toBeTruthy();
    const adj = hs.filter((h) => h.kind === 'direct' && factorOf(h, 'base') === 3000);
    expect(adj).toHaveLength(2); // Blast 相邻=×1.5
    const tal = hs.find((h) => h.kind === 'elation');
    expect(tal).toBeTruthy();
    expect(factorOf(tal!, 'base')).toBeCloseTo(1205.61712, 5); // 7535.107×0.16
    // 欢愉度=面板暴伤1.0×20%+行迹0.18（面板欢愉度0）
    expect(factorOf(tal!, 'elationDegree')).toBeCloseTo(1.38, 6);
    // 伤害结算时好活=260（初始能量 240 + 秘技/战技 20）→ 笑点区=1+5×260/500=3.6
    expect(factorOf(tal!, 'laugh')).toBeCloseTo(3.6, 5); // 好活 260 = 初始能量 240 + 20
    // 直伤 crit = 1+(0.5+行迹0.3)×1.0
    expect(factorOf(main!, 'crit')).toBeCloseTo(1.8, 6);
    expect(factorOf(main!, 'damageBonus')).toBeCloseTo(1.3, 6); // elementDmg Physical 0.3
    // 2026-11-05 用户裁定：啊哈不在队 = 无升格 → 无「无视防御10%」→ 防御区=100/(100+110)
    expect(factorOf(main!, 'defense')).toBeCloseTo(0.47619, 5);
  });

  it('普攻结构（e0）', () => {
    const ba = ev(r0, (e) => e.kind === 'action' && e.action === 'basic');
    const hs = hitsOf(r0, ba);
    expect(hs).toHaveLength(1);
    expect(factorOf(hs[0]!, 'base')).toBe(2800); // ×1.4
  });

  it('能量→好活/好活→能量双向同步终态（e0）', () => {
    expect(r0.finalState.energy['feiying']).toBe(85); // 无升格溢出上限 → 溢出能量丢弃
    expect(r0.finalState.goodWork['feiying']).toBe(40);
    expect(r0.finalState.laughPoints).toBe(10);
    expect(r0.victory).toBe(false);
  });

  it('终招结构：全体+弹射×6（point06）+xFloor480', () => {
    const ult = ev(r0, (e) => e.kind === 'ult');
    expect(ult.time).toBeCloseTo(496.03, 1);
    expect(ult.energyAfter).toBe(5);
    const ultNotes = noteArr(ult.note);
    expect(ultNotes).toEqual(expect.arrayContaining(['fyTalent', 'fyUlt']));
    expect(ultNotes).not.toContain('fySgRestore'); // 升格终招回能：啊哈不在队 → 无
    const hs = hitsOf(r0, ult);
    expect(hs).toHaveLength(18); // 全体直3+欢愉3 + 弹射6×(直+欢愉)
    expect(hs.filter((h) => h.kind === 'direct' && factorOf(h, 'base') === 3200)).toHaveLength(3); // ×1.6
    const bounces = hs.filter((h) => h.kind === 'direct' && factorOf(h, 'base') === 2400);
    expect(bounces).toHaveLength(6); // 基础5 + point06（≥3敌+1）=6
    const near = (h: HitLog, v: number) => Math.abs(factorOf(h, 'base') - v) < 1e-4;
    expect(hs.filter((h) => h.kind === 'elation' && near(h, 1808.42568))).toHaveLength(3); // ×0.24
    expect(hs.filter((h) => h.kind === 'elation' && near(h, 2109.82996))).toHaveLength(6); // 弹射附带 ×0.28
    // xFloor=480 → 笑点区=1+5×480/720
    for (const h of hs.filter((x) => x.kind === 'elation')) {
      expect(factorOf(h, 'laugh')).toBeCloseTo(4.333333, 5);
      expect(factorOf(h, 'elationDegree')).toBeCloseTo(1.38, 6);
    }
  });

  it('狐狸老师：即时结算独立事件（不占行动条）', () => {
    const foxes = actsOf(r0).filter((e) => e.kind === 'action' && e.action === 'fox');
    expect(foxes).toHaveLength(5);
    const fx = foxes[0]!;
    expect(fx.skillCode).toBe('feiying.fox');
    expect(noteArr(fx.note)).toEqual(expect.arrayContaining(['fyFox', 'fyTalent', 'fyPoint07']));
    // 与触发它的阿哈时刻同刻（即时结算，不推进时间）
    const trigger = actsOf(r0).find(
      (e) => e.action === 'ahaMoment' && Math.abs(e.time - fx.time) < 1e-9,
    );
    expect(trigger).toBeTruthy();
    const hs = hitsOf(r0, fx);
    expect(hs).toHaveLength(6); // 3怪×(全体直伤+欢愉段)；e0 无 E1 欢愉技
    expect(hs.filter((h) => h.kind === 'direct' && factorOf(h, 'base') === 2000)).toHaveLength(3);
    const el = hs.filter((h) => h.kind === 'elation');
    expect(el).toHaveLength(3);
    expect(factorOf(el[0]!, 'base')).toBeCloseTo(1883.77675, 5); // 7535.107×0.25
    expect(factorOf(el[0]!, 'laugh')).toBeCloseTo(2.0, 6); // 当时好活=60 → 1+5×60/300
  });

  it('point07：狐狸老师后敌方受伤提高', () => {
    const sk = ev(r0, (e) => e.kind === 'action' && e.action === 'skill');
    expect(factorOf(hitsOf(r0, sk)[0]!, 'vuln')).toBe(1);
    const ult = ev(r0, (e) => e.kind === 'ult');
    const ultHit = hitsOf(r0, ult).find((h) => h.kind === 'elation')!;
    expect(factorOf(ultHit, 'vuln')).toBeCloseTo(1.12, 6); // 240%×10%=24%，场上最高
  });

  it('E1：全属性抗穿+狐狸欢愉技', () => {
    const r1 = simulateBattle(cfg([fy(1)]));
    const sk = ev(r1, (e) => e.kind === 'action' && e.action === 'skill');
    expect(factorOf(hitsOf(r1, sk)[0]!, 'resist')).toBeCloseTo(1.2, 6);
    expect(factorOf(hitsOf(r0, ev(r0, (e) => e.kind === 'action' && e.action === 'skill'))[0]!, 'resist')).toBe(1); // e0 对照
    const fx = actsOf(r1).find((e) => e.action === 'fox')!;
    expect(fx.hitSeqs).toHaveLength(9); // 原6段 + E1 欢愉技全体3段
    expect(noteArr(fx.note)).toContain('fyE1');
    const ult1 = actsOf(r1).find((e) => e.kind === 'ult')!;
    expect(ult1.energyAfter).toBe(5); // e0 同锚（无升格 → 无额外回能）；E1 额外转化体现在终态
    expect(r1.finalState.energy['feiying']).toBe(165);
  });

  it('E2：暴伤提高36%（e0 crit 1.8→e2 2.088）', () => {
    const r2 = simulateBattle(cfg([fy(2)]));
    const sk = ev(r2, (e) => e.kind === 'action' && e.action === 'skill');
    expect(factorOf(hitsOf(r2, sk)[0]!, 'crit')).toBeCloseTo(2.088, 6); // 1+0.8×1.36
    // E3 未到：终招主段倍率不变
    const ult2 = ev(r2, (e) => e.kind === 'ult');
    expect(factorOf(hitsOf(r2, ult2).find((h) => h.kind === 'direct' && h.target === 'monster1')!, 'base')).toBe(3200);
  });

  it('E3/E5：技能等级（终招+2、天赋+2）', () => {
    const r4 = simulateBattle(cfg([fy(4)]));
    const ult4 = ev(r4, (e) => e.kind === 'ult');
    const main4 = hitsOf(r4, ult4).find((h) => h.kind === 'direct' && h.target === 'monster1')!;
    expect(factorOf(main4, 'base')).toBe(3520); // 1.6→1.76（lv12）×2000
    const r6 = simulateBattle(cfg([fy(6)]));
    const ult6 = ev(r6, (e) => e.kind === 'ult');
    const tal6 = hitsOf(r6, ult6).find((h) => h.kind === 'elation' && h.target === 'monster1')!;
    expect(factorOf(tal6, 'base')).toBeCloseTo(1989.268248, 5); // 0.24→0.264（E5 天赋+2）
  });

  it('E4：欢愉无视防御+15%（防御区抬升）', () => {
    const r4 = simulateBattle(cfg([fy(4)]));
    const ult4 = ev(r4, (e) => e.kind === 'ult');
    const main4 = hitsOf(r4, ult4).find((h) => h.kind === 'direct' && h.target === 'monster1')!;
    // 无升格（0%）+E4 15%=15% → 100/(100+110×0.85)
    expect(factorOf(main4, 'defense')).toBeCloseTo(0.516796, 5);
  });

  it('E6：首次终招固定恢复+120能量、欢愉增伤、仅每第1/5次', () => {
    const r6 = simulateBattle(cfg([fy(6)]));
    const ults = actsOf(r6).filter((e) => e.kind === 'ult');
    expect(ults).toHaveLength(3);
    expect(ults[0]!.energyAfter).toBe(125); // 5（同E1）+120
    expect(noteArr(ults[0]!.note)).toContain('fyE6');
    expect(ults[1]!.energyAfter).toBe(5);
    expect(noteArr(ults[1]!.note)).not.toContain('fyE6');
    expect(ults[2]!.energyAfter).toBe(5);
    expect(noteArr(ults[2]!.note)).not.toContain('fyE6');
    // mirthBonus：首招时好活∈[100,200) → 1+0.15+0.02×1=1.17（e0 对照=1.0）
    const mirth6 = hitsOf(r6, ults[0]!).find((h) => h.kind === 'elation')!;
    expect(factorOf(mirth6, 'mirthBonus')).toBeCloseTo(1.17, 6);
    const mirth0 = hitsOf(r0, ev(r0, (e) => e.kind === 'ult')).find((h) => h.kind === 'elation')!;
    expect(factorOf(mirth0, 'mirthBonus')).toBe(1);
    // E6 保留更多：终态好活 80（e0=40）
    expect(r6.finalState.goodWork['feiying']).toBe(80);
  });

  it('秘技：进战全体攻击+好活20 转能量', () => {
    const rf = simulateBattle(cfg([fy(0)], true));
    const tech = rf.events.find((e) => e.kind === 'action' && e.action === 'technique')!;
    expect(tech.time).toBe(0);
    expect(tech.skillCode).toBe('feiying.skill');
    expect(noteArr(tech.note)).toContain('technique');
    expect(tech.hitSeqs).toHaveLength(3); // 3怪各一段
    expect(tech.energyAfter).toBe(280); // 240+进战20转+秘技20转
    const hs = hitsOf(rf, tech);
    for (const h of hs) expect(factorOf(h, 'base')).toBe(2000); // 倍率×1
    expect(rf.finalState.energy['feiying']).toBe(85); // e0 techniques:false 同锚（无升格溢出上限）
  });
});

describe('升格150529 #1（累计 480【绝活共赏】→ 下一次终结技倍率 +原倍率×#1，不叠加）', () => {
  it('纯函数：未武装 = 1；武装 = 1 + #1（lv1 1.75 / lv2 2.5）', () => {
    const lv1 = [0.75, 0.1, 60, 480];
    const lv2 = [1.5, 0.24, 240, 480];
    expect(feiyingSgUltMult(false, lv1)).toBe(1);
    expect(feiyingSgUltMult(false, lv2)).toBe(1);
    expect(feiyingSgUltMult(true, lv1)).toBeCloseTo(1.75, 10);
    expect(feiyingSgUltMult(true, lv2)).toBeCloseTo(2.5, 10);
    expect(feiyingSgUltMult(true, [])).toBe(1);
  });

  it('战斗内：首次终招未武装；累计跨 480 后的终招带 note fySgUltMult', () => {
    // 锚点来自临时 feiying-sg-dump（rounds 20，seed 20261011）：t=400 未武装、t=1200 / t=2000 武装
    const cfg = {
      rounds: 20,
      maxTime: 2400,
      techniques: false,
      members: [
        {
          id: 'feiying',
          panel: { ...mkPanel(), speed: 150, hp: 6000, element: 'Fire', energyRegen: 0 },
          eidolonLevel: 0,
        },
        { id: 'fengjin', panel: { ...mkPanel(), speed: 110, hp: 7000, energyRegen: 0 }, eidolonLevel: 0 },
        // 2026-11-05 用户裁定：升格需啊哈在队 → 本用例必须带啊哈 E0（lv1）
        { id: 'aha', eidolonLevel: 0, panel: mkPanel({ speed: 96 }) } as CombatMember,
      ],
      monster: { ...MON, attack: 0, hp: 5_000_000 },
      seed: 20261011,
    } as unknown as BattleConfig;
    const r = simulateBattle(cfg);
    const ults = r.events.filter((e: CombatEvent) => e.skillCode === 'feiying.ult');
    expect(ults.length).toBeGreaterThanOrEqual(3);
    // 2026-11-06：天赋150504 的「初始能量→好活」（240 点）落地后，好活→能量同步让【绝活共赏】
    // 更早跨过 480，首次终招即已武装（旧锚点「首次未武装」作废）。
    const armed = ults.filter((u) => (u.note ?? []).includes('fySgUltMult'));
    expect(armed.length).toBeGreaterThanOrEqual(1);
    expect(ults[0].note ?? []).toContain('fySgUltMult');
    for (const u of ults) {
      expect((u.note ?? []).filter((x) => x === 'fySgUltMult').length).toBeLessThanOrEqual(1);
    }
  }, 120_000);
});
