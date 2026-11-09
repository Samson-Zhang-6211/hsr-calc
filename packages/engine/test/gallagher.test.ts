import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 加拉赫 1301 接入回归（2026-10-15；dump 锚点法：锚点全部来自 gallagher-dump 实测，勿纯推理改写） */

type Ev = BattleResult['events'][number];

const MON = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 3000,
  speed: 100,
  monsterId: '1004011',
  attack: 400,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
  enemyClass: 'normal' as const,
};

const GA_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 98,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Fire' as const,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

/** 长局专用面板：抬高 gallagher 生命防其早退（旧 hp3000 版 F/G 全作废） */
const GA_TANK = { ...GA_PANEL, hp: 20000 };

const JY_PANEL = {
  level: 80,
  hp: 3000,
  attack: 3000,
  defence: 1000,
  speed: 135,
  critRate: 0.8,
  critDmg: 1.5,
  element: 'Thunder' as const,
  energyRegen: 0,
  damageBonus: 0.5,
  breakEffect: 0,
};

const LONG: Partial<BattleConfig> = { rounds: 12, maxTime: 650 };

function mkCfg(over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    members: [
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
      { id: 'gallagher', panel: GA_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 4,
    maxTime: 250,
    techniques: false,
    seed: 20261013,
    ...over,
  } as BattleConfig;
}

const runCache = new Map<string, BattleResult>();
function run(key: string, cfg: () => BattleConfig): BattleResult {
  let r = runCache.get(key);
  if (!r) {
    r = simulateBattle(cfg());
    runCache.set(key, r);
  }
  return r;
}

const evsOf = (r: BattleResult, pred: (e: Ev) => boolean): Ev[] => r.events.filter(pred);
const close = (a: number, b: number, eps = 0.01): void => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};
/** 加拉赫全部行动事件（含终招/秘技，按事件时序） */
const gaActs = (r: BattleResult): Ev[] =>
  evsOf(r, (e) => e.unitId === 'gallagher' && (e.kind === 'action' || e.kind === 'ult'));
const monEv = (r: BattleResult, unit: string, t: number): Ev =>
  evsOf(r, (e) => e.unitId === unit && Math.abs(e.time - t) < 0.01)[0];
const hitOf = (r: BattleResult, seq: number) => r.hits.find((h) => h.seq === seq)!;
const facOf = (h: ReturnType<typeof hitOf>, key: string): number =>
  h.factors.find((f) => f.key === key)!.value;
const noteCounts = (r: BattleResult): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const e of r.events)
    for (const n of e.note ?? []) if (n.startsWith('ga') || n === 'technique') c[n] = (c[n] ?? 0) + 1;
  return c;
};
const buffOf = (e: Ev, unit: string, label: string) =>
  e.buffs?.[unit]?.find((b) => b.labelKey === label);

describe('加拉赫1301（基础机制）', () => {
  it('A 战技治疗/终招酩酊+强化普攻/能量链/受击', () => {
    const r = run('A', () => mkCfg());
    const acts = gaActs(r); // 战技t102 → 终招t200 → 普攻t204
    expect(acts.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([100, 5, 35]);
    // 首动战技：初55+受击回能(10+5+10=25)+30=100(<110 不放终招)、目标景元、固定治疗生效
    const skill = acts[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.action).toBe('skill');
    expect(skill.skillCode).toBe('gallagher.skill');
    expect(skill.targetId).toBe('jingyuan');
    expect(skill.note).toEqual(['gaHeal', 'gaSkill']);
    // t=100 怪伤/受击回能：100401101 单体、100401106 扩散（gall+jy 各5）
    const m1 = monEv(r, 'monster1', 100);
    expect(m1.enemyHits).toHaveLength(1);
    close(m1.enemyHits![0].damage, 471.43, 0.06);
    expect(m1.enemyHits![0].targetId).toBe('jingyuan');
    close(m1.enemyHits![0].energy ?? 0, 10, 0.01);
    const m2 = monEv(r, 'monster2', 100);
    expect(m2.enemyHits).toHaveLength(2);
    expect(m2.enemyHits![0].targetId).toBe('gallagher');
    close(m2.enemyHits![0].energy ?? 0, 5, 0.01);
    // 终招 t=200（受击回能后 115≥110）：AoE 三段 + 全体酩酊 + 强化 flag + 中央钩子治疗
    const ult = acts.find((e) => e.kind === 'ult')!;
    close(ult.time, 200, 0.01);
    close(ult.energyAfter ?? 0, 5, 0.01);
    expect(ult.note).toEqual(['gaDrunken', 'gaUlt', 'gaHeal', 'gaDrunkHeal']);
    expect(ult.hitSeqs).toHaveLength(3);
    // 强化普攻 t=204.08：flag 消费、hit skillCode=gallagher.enhanced、base=3.5×2500=8750、total=4125
    const basic = acts.find((e) => e.action === 'basic')!;
    close(basic.time, 204.08, 0.01);
    expect(basic.skillCode).toBe('gallagher.basic');
    expect(basic.note).toEqual(['gaEnhancedBasic', 'gaHeal', 'gaDrunkHeal']);
    const bh = hitOf(r, basic.hitSeqs![0]);
    expect(bh.skillCode).toBe('gallagher.enhanced');
    expect(bh.target).toBe('monster2'); // resolveMain 默认 2 号
    close(facOf(bh, 'base'), 6250, 0.01);
    close(facOf(bh, 'damageBonus'), 1, 0.001);
    close(bh.total, 2946.43, 0.01);
    // 终招 hit：base=1.5×2500=3750、total=1767.86（酩酊不影响直伤）
    const uh = hitOf(r, ult.hitSeqs![0]);
    close(facOf(uh, 'base'), 3750, 0.01);
    close(uh.total, 1767.86, 0.01);
    // 酩酊回血中央钩子：攻击方事件（景元 t=222.22 / 神君 t=234.33）带 gaHeal+gaDrunkHeal
    const j222 = evsOf(r, (e) => e.unitId === 'jingyuan' && Math.abs(e.time - 222.22) < 0.01)[0];
    expect(j222.note ?? []).toEqual(expect.arrayContaining(['gaHeal', 'gaDrunkHeal']));
    // 景元首段 sanity（natasha/bailu 同锚）
    close(hitOf(r, 0).total, 6578.15, 0.01);
    expect(noteCounts(r)).toEqual({
      gaHeal: 4,
      gaSkill: 1,
      gaDrunken: 1,
      gaUlt: 1,
      gaDrunkHeal: 4,
      gaEnhancedBasic: 1,
    });
    close(r.report.totalDamage, 278219.17, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 3000, 0.01);
    close(r.finalState.memberHp.gallagher ?? 0, 2237.14, 0.01);
  });

  it('B 秘技全体酩酊+火伤（开局即有酩酊→回血次数翻倍）', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    const acts = gaActs(r);
    const tech = acts[0];
    close(tech.time, 0, 0.01);
    expect(tech.action).toBe('technique');
    expect(tech.skillCode).toBe('gallagher.tech');
    expect(tech.note).toEqual(['technique', 'gaTech', 'gaDrunken']);
    close(tech.energyAfter ?? 0, 55, 0.01);
    close(tech.spAfter ?? -1, 3, 0.01);
    expect(tech.hitSeqs).toHaveLength(3);
    const th = hitOf(r, tech.hitSeqs![0]);
    close(facOf(th, 'base'), 1250, 0.01);
    close(th.total, 589.29, 0.01);
    // 能量链同 A（秘技不回能）
    expect(acts.slice(1).map((e) => Math.round(e.energyAfter ?? 0))).toEqual([100, 5, 35]);
    const skill = acts.find((e) => e.action === 'skill')!;
    close(skill.time, 102.04, 0.01);
    expect(skill.note).toEqual(['gaHeal', 'gaSkill']);
    const ult = acts.find((e) => e.kind === 'ult')!;
    close(ult.time, 200, 0.01);
    expect(ult.note).toEqual(['gaDrunken', 'gaUlt', 'gaHeal', 'gaDrunkHeal']);
    // 景元 t=74 段与 A 相同；t≥148 段 8905.08/17810.15——神君提前到 t=104.38
    // （景元自身破阵提前生效，属景元机制非加拉赫；按原值锚）
    close(hitOf(r, 3).total, 6578.15, 0.01);
    close(hitOf(r, 30).total, 6926.88, 0.01);
    close(hitOf(r, 33).total, 6926.88, 0.01);
    const sj = evsOf(r, (e) => e.unitId === 'shenjun')[0];
    close(sj.time, 104.38, 0.01);
    // gall 自身伤害与 A 完全同值（酩酊不影响直伤）
    close(hitOf(r, 36).total, 6926.88, 0.01);
    close(hitOf(r, 39).total, 8905.08, 0.01);
    expect(noteCounts(r)).toEqual({
      technique: 1,
      gaTech: 1,
      gaDrunken: 2,
      gaDrunkHeal: 8,
      gaHeal: 4,
      gaSkill: 1,
      gaUlt: 1,
      gaEnhancedBasic: 1,
    });
    close(r.report.totalDamage, 334029.19, 0.5);
    close(r.finalState.memberHp.gallagher ?? 0, 2237.14, 0.01);
  });

  it('I attack0：普通普攻 130101 else 分支（强化 flag 未消费时回落）', () => {
    const r = run('I', () => mkCfg({ monster: { ...MON, attack: 0 } }));
    const acts = gaActs(r);
    // 无受击回能：55+30=85 → t=204 普攻 ens=105<110 不放终招
    expect(acts.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([85, 105]);
    const skill = acts[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.targetId).toBe('jingyuan');
    expect(skill.note).toEqual(['gaSkill']); // 全满血钳制 → 无 gaHeal
    const basic = acts[1];
    close(basic.time, 204.08, 0.01);
    expect(basic.note ?? []).toEqual([]); // 无 gaEnhancedBasic = else 分支
    expect(basic.hitSeqs).toHaveLength(1);
    const bh = hitOf(r, basic.hitSeqs![0]);
    expect(bh.skillCode).toBe('gallagher.basic');
    expect(bh.target).toBe('monster2');
    close(facOf(bh, 'base'), 2500, 0.01); // 1.4×2500
    close(bh.total, 1178.57, 0.01);
    // attack0 → 怪行动无 ehit
    const m1 = monEv(r, 'monster1', 100);
    expect(m1.enemyHits?.length ?? 0).toBe(0);
    expect(noteCounts(r)).toEqual({ gaSkill: 1 });
    close(r.report.totalDamage, 271147.75, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 3000, 0.01);
    close(r.finalState.memberHp.gallagher ?? 0, 3000, 0.01);
  });
});

describe('加拉赫1301（星魂）', () => {
  it('C E1 进战回能+E2 效果抵抗 2 回合', () => {
    const r = run('C', () =>
      mkCfg({
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'gallagher', panel: GA_PANEL, eidolonLevel: 2 },
        ],
      }),
    );
    const acts = gaActs(r);
    // E1 +20：战技封顶 110 → 终招紧跟同刻
    expect(acts.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([110, 5, 45]);
    const skill = acts[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.note).toEqual(['gaHeal', 'gaE2', 'gaSkill']);
    const ult = acts[1];
    expect(ult.kind).toBe('ult');
    expect(ult.note).toEqual(['gaDrunken', 'gaUlt', 'gaHeal', 'gaDrunkHeal']); // eid2 <4 无 gaE4
    // E1 常驻效果抵抗 50%（permanent d=-1）；E2 效果抵抗 30% d=2
    const e1 = buffOf(skill, 'gallagher', 'gaE1');
    expect(e1?.key).toBe('effectRes');
    close(e1?.value ?? 0, 0.5, 0.0001);
    expect(e1?.duration).toBe(-1);
    const e2 = buffOf(skill, 'gallagher', 'gaE2');
    expect(e2?.key).toBe('effectRes');
    close(e2?.value ?? 0, 0.3, 0.0001);
    expect(e2?.duration).toBe(2);
    // E2 随 gall 行动 tick：t=204.08 普攻后 t=222.22 快照 d=1、t=250 收束仍 d=1
    const j222 = evsOf(r, (e) => e.unitId === 'jingyuan' && Math.abs(e.time - 222.22) < 0.01)[0];
    expect(buffOf(j222, 'gallagher', 'gaE2')?.duration).toBe(1);
    const end250 = evsOf(r, (e) => Math.abs(e.time - 250) < 0.01 && e.buffs !== undefined)[0];
    expect(buffOf(end250, 'gallagher', 'gaE2')?.duration).toBe(1);
    // E2 不影响伤害：total 与 A 同值
    expect(noteCounts(r)).toEqual({
      gaHeal: 4,
      gaE2: 1,
      gaSkill: 1,
      gaDrunken: 1,
      gaUlt: 1,
      gaDrunkHeal: 7,
      gaEnhancedBasic: 1,
    });
    close(r.report.totalDamage, 278219.17, 0.5);
    close(r.finalState.memberHp.gallagher ?? 0, 2237.14, 0.01);
  });

  it('D E4 终招酩酊延长 1 回合（dur3；250 局内与 C 无伤害差异）', () => {
    const r = run('D', () =>
      mkCfg({
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'gallagher', panel: GA_PANEL, eidolonLevel: 4 },
        ],
      }),
    );
    const ult = gaActs(r).find((e) => e.kind === 'ult')!;
    // gaE4 在 gaUlt 之前
    expect(ult.note).toEqual(['gaDrunken', 'gaE4', 'gaUlt', 'gaHeal', 'gaDrunkHeal']);
    // 怪侧 buff 不进 event.buffs → 酩酊回合数只能靠 note 区分（G/H 长局同理）
    // E1/E2 照常（eid4 ≥2）
    const skill = gaActs(r)[0];
    expect(skill.note).toEqual(['gaHeal', 'gaE2', 'gaSkill']);
    expect(buffOf(skill, 'gallagher', 'gaE1')?.duration).toBe(-1);
    expect(noteCounts(r)).toEqual({
      gaHeal: 4,
      gaE2: 1,
      gaSkill: 1,
      gaDrunken: 1,
      gaE4: 1,
      gaUlt: 1,
      gaDrunkHeal: 7,
      gaEnhancedBasic: 1,
    });
    close(r.report.totalDamage, 278513.82, 0.5);
  });

  it('E E6 击破特攻+击破效率常驻、E5 终招倍率提升', () => {
    const r = run('E', () =>
      mkCfg({
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'gallagher', panel: GA_PANEL, eidolonLevel: 6 },
        ],
      }),
    );
    const acts = gaActs(r);
    const skill = acts[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.note).toEqual(['gaHeal', 'gaE2', 'gaSkill']);
    const ult = acts.find((e) => e.kind === 'ult')!;
    expect(ult.note).toEqual(['gaDrunken', 'gaE4', 'gaUlt', 'gaHeal', 'gaDrunkHeal']);
    // E6 常驻两 buff（permanent d=-1）
    const be = buffOf(skill, 'gallagher', 'gaE6');
    expect(be?.key).toBe('breakEffect');
    close(be?.value ?? 0, 0.2, 0.0001);
    expect(be?.duration).toBe(-1);
    const eff = evsOf(r, (e) => e.buffs?.gallagher?.some((b) => b.labelKey === 'gaE6' && b.key === 'breakEfficiency') ?? false)[0];
    expect(eff).toBeDefined();
    close(eff.buffs!.gallagher!.find((b) => b.labelKey === 'gaE6' && b.key === 'breakEfficiency')!.value, 0.2, 0.0001);
    // E5 ult+2 → lv12 参数 1.65：base=1.65×2500=4125、total=1944.64（C/D=3750/1767.86）
    const uh = hitOf(r, ult.hitSeqs![0]);
    close(facOf(uh, 'base'), 4125, 0.01);
    close(uh.total, 1944.64, 0.01);
    // E3 basic+2 不改 130108 强化普攻参数：仍 base8750/total4125
    const basic = acts.find((e) => e.action === 'basic')!;
    const bh = hitOf(r, basic.hitSeqs![0]);
    close(facOf(bh, 'base'), 6875, 0.01);
    close(bh.total, 3241.07, 0.01);
    expect(noteCounts(r)).toEqual({
      gaHeal: 4,
      gaE2: 1,
      gaSkill: 1,
      gaDrunken: 1,
      gaE4: 1,
      gaUlt: 1,
      gaDrunkHeal: 7,
      gaEnhancedBasic: 1,
    });
    close(r.report.totalDamage, 279044.17, 0.5);
    close(r.finalState.memberHp.gallagher ?? 0, 2371.54, 0.01);
  });

  it('F 长局 eid0：两次强化普攻/怪攻-19% 消费端/酩酊全程不掉', () => {
    const r = run('F', () =>
      mkCfg({
        ...LONG,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'gallagher', panel: GA_TANK, eidolonLevel: 0 },
        ],
      }),
    );
    const acts = gaActs(r);
    // 链：skill100 / ult5@200 / basic25 / skill70 / skill110+ult5@408 / skill50 / basic80
    expect(acts.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([100, 5, 35, 80, 110, 5, 50, 80]);
    expect(acts.map((e) => e.action)).toEqual(['skill', 'ult', 'basic', 'skill', 'skill', 'ult', 'skill', 'basic']);
    // 两次终招 → 两次强化普攻（flag 每次终招重置、每次普攻消费）
    const basics = acts.filter((e) => e.action === 'basic');
    expect(basics).toHaveLength(2);
    close(basics[0].time, 204.08, 0.01);
    close(basics[1].time, 612.24, 0.01);
    for (const b of basics) expect(b.note ?? []).toContain('gaEnhancedBasic');
    close(hitOf(r, basics[1].hitSeqs![0]).total, 2946.43, 0.01);
    // 怪攻-19%（强化普攻 debuff 挂 monster2，per-monster atkPct 消费端）：
    // t=300 三怪同用 100401106 → m1/m3=785.7、m2=636.4(=785.7×0.81)
    const m1t300 = monEv(r, 'monster1', 300);
    close(m1t300.enemyHits![0].damage, 785.71, 0.06);
    const m2t300 = monEv(r, 'monster2', 300);
    close(m2t300.enemyHits![0].damage, 667.86, 0.06);
    // t=600：怪攻-19% 已在怪自己回合末递减到期（2026-10-23 起怪侧 buff 会 tick）
    // → m2 用 100401104 回到未减攻 314.3（不再 ×0.81）
    const m2t600 = monEv(r, 'monster2', 600);
    close(m2t600.enemyHits![0].damage, 314.29, 0.06);
    const m1t600 = monEv(r, 'monster1', 600);
    close(m1t600.enemyHits![0].damage, 785.71, 0.06);
    // 酩酊回血打满全场：末动 t=612 事件仍带 gaDrunkHeal（同口径不递减）
    expect(acts[acts.length - 1].note ?? []).toContain('gaDrunkHeal');
    expect(noteCounts(r)).toEqual({
      gaHeal: 12,
      gaSkill: 4,
      gaDrunken: 2,
      gaUlt: 2,
      gaDrunkHeal: 14,
      gaEnhancedBasic: 2,
    });
    close(r.report.totalDamage, 446651.66, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 1114.29, 0.01);
    close(r.finalState.memberHp.gallagher ?? 0, 13013.57, 0.01);
  });

  it('G 长局 eid2：4 战技 E2 循环 + 酩酊 dur2 全程触发（对照 H dur3）', () => {
    const r = run('G', () =>
      mkCfg({
        ...LONG,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'gallagher', panel: GA_TANK, eidolonLevel: 2 },
        ],
      }),
    );
    const acts = gaActs(r);
    const skills = acts.filter((e) => e.action === 'skill');
    expect(skills).toHaveLength(4);
    expect(skills.map((e) => Math.round(e.time))).toEqual([102, 306, 408, 510]);
    expect(skills.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([110, 90, 110, 50]);
    for (const s of skills) expect(s.note).toEqual(['gaHeal', 'gaE2', 'gaSkill']);
    const ults = acts.filter((e) => e.kind === 'ult');
    expect(ults).toHaveLength(2);
    close(ults[0].time, 102.04, 0.01); // E1 使首战技即满能 → 终招同刻
    close(ults[1].time, 408.16, 0.01);
    for (const u of ults) expect(u.note).toEqual(['gaDrunken', 'gaUlt', 'gaHeal', 'gaDrunkHeal']); // eid2 <4 无 gaE4
    // gaE2 循环：gall 行动事件 d=2、其他事件 d=1、每战技重挂回 2
    const s2 = skills[1];
    expect(buffOf(s2, 'gallagher', 'gaE2')?.duration).toBe(2);
    const j222 = evsOf(r, (e) => e.unitId === 'jingyuan' && Math.abs(e.time - 222.22) < 0.01)[0];
    expect(buffOf(j222, 'gallagher', 'gaE2')?.duration).toBe(1);
    // 酩酊 dur2 实际整场不掉 → gaDrunkHeal 17 次（dump 实测：E1 使首终招提前到 t=102.04、比 F 多 3 次）
    expect(noteCounts(r)).toEqual({
      gaHeal: 12,
      gaE2: 4,
      gaSkill: 4,
      gaDrunken: 2,
      gaUlt: 2,
      gaDrunkHeal: 17,
      gaEnhancedBasic: 2,
    });
    close(r.report.totalDamage, 446651.66, 0.5);
    close(r.finalState.memberHp.gallagher ?? 0, 13013.57, 0.01);
  });

  it('H 长局 eid4：与 G 唯一差异 = 两次 gaE4 note（dur3/dur2 无行为差异）', () => {
    const r = run('H', () =>
      mkCfg({
        ...LONG,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'gallagher', panel: GA_TANK, eidolonLevel: 4 },
        ],
      }),
    );
    const ults = gaActs(r).filter((e) => e.kind === 'ult');
    expect(ults).toHaveLength(2);
    for (const u of ults) expect(u.note).toEqual(['gaDrunken', 'gaE4', 'gaUlt', 'gaHeal', 'gaDrunkHeal']);
    // 怪侧 buff 不递减 → dur3 vs dur2 无触发差异，仅 note gaE4 区分
    expect(noteCounts(r)).toEqual({
      gaHeal: 12,
      gaE2: 4,
      gaSkill: 4,
      gaDrunken: 2,
      gaE4: 2,
      gaUlt: 2,
      gaDrunkHeal: 17,
      gaEnhancedBasic: 2,
    });
    close(r.report.totalDamage, 447240.94, 0.5);
    close(r.finalState.memberHp.gallagher ?? 0, 13037.14, 0.01);
  });
});
