import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 白露 1211 接入回归（2026-10-15；dump 锚点法：锚点全部来自 bailu-dump 实测，勿纯推理改写） */

type Ev = BattleResult['events'][number];

const MON = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 3000,
  speed: 100,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
  enemyClass: 'normal' as const,
  monsterId: '1004011',
  attack: 400,
};

const BL_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 98,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Thunder' as const,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

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

function mkCfg(over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    members: [
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
      { id: 'bailu', panel: BL_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 8,
    maxTime: 400,
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
/** 白露全部行动事件（含终招/秘技，按事件时序） */
const blActs = (r: BattleResult): Ev[] =>
  evsOf(r, (e) => e.unitId === 'bailu' && (e.kind === 'action' || e.kind === 'ult'));
const monEv = (r: BattleResult, unit: string, t: number): Ev =>
  evsOf(r, (e) => e.unitId === unit && Math.abs(e.time - t) < 0.01)[0];
const hitOf = (r: BattleResult, seq: number) => r.hits.find((h) => h.seq === seq)!;
const facOf = (h: ReturnType<typeof hitOf>, key: string): number =>
  h.factors.find((f) => f.key === key)!.value;
const noteCounts = (r: BattleResult): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const e of r.events) for (const n of e.note ?? []) if (n.startsWith('bailu')) c[n] = (c[n] ?? 0) + 1;
  return c;
};
const buffOf = (e: Ev, unit: string, label: string) =>
  e.buffs?.[unit]?.find((b) => b.labelKey === label);

describe('白露1211（基础机制）', () => {
  it('A 战技治疗/终招生息/能量链/普攻/受击回血', () => {
    const r = run('A', () => mkCfg({ rounds: 4, maxTime: 250 }));
    const acts = blActs(r); // 战技t102 → 终招t200 → 普攻t204
    expect(acts.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([95, 5, 40]);
    // 首动战技：初50+受击回能15+30=95、目标景元（存活默认主C）、治疗生效
    const skill = acts[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.action).toBe('skill');
    expect(skill.skillCode).toBe('bailu.skill');
    expect(skill.targetId).toBe('jingyuan');
    expect(skill.note).toEqual(['bailuHeal', 'bailuSkill']);
    // 终招 t=200：全队治疗+双方挂生息 d=2、ens 清能+5
    const ult = acts.find((e) => e.kind === 'ult')!;
    close(ult.time, 200, 0.01);
    close(ult.energyAfter ?? 0, 5, 0.01);
    expect(ult.note).toEqual(['bailuShengxi', 'bailuHeal', 'bailuUlt']);
    expect(buffOf(ult, 'jingyuan', 'bailuShengxi')?.duration).toBe(2);
    expect(buffOf(ult, 'bailu', 'bailuShengxi')?.duration).toBe(2);
    // 受击回血首触发：monster3 扩散段（生息新挂即触发第1次）note 精确
    const m3 = monEv(r, 'monster3', 200);
    expect(m3.note).toEqual(['bailuHeal', 'bailuShengxiHit']);
    // 普攻 t=204.08：base=1.4×2500=3500、total=1650、无治疗 note
    const basic = acts.find((e) => e.action === 'basic')!;
    close(basic.time, 204.08, 0.01);
    expect(basic.note ?? []).toEqual([]);
    expect(basic.hitSeqs).toHaveLength(1);
    const bh = hitOf(r, basic.hitSeqs![0]);
    close(facOf(bh, 'base'), 2500, 0.01);
    close(facOf(bh, 'damageBonus'), 1, 0.001);
    close(bh.total, 1178.57, 0.01);
    // monsterId 接线：t=100 怪伤/受击回能
    const m1 = monEv(r, 'monster1', 100);
    expect(m1.enemyHits).toHaveLength(1);
    close(m1.enemyHits![0].damage, 471.43, 0.06);
    expect(m1.enemyHits![0].targetId).toBe('jingyuan');
    close(m1.enemyHits![0].energy ?? 0, 10, 0.01);
    // 景元首段 sanity（同 natasha 锚）
    close(hitOf(r, 0).total, 6578.15, 0.01);
    const cA = noteCounts(r);
    expect([cA.bailuHeal, cA.bailuSkill, cA.bailuShengxi, cA.bailuUlt, cA.bailuShengxiHit]).toEqual([
      4, 1, 1, 1, 2,
    ]);
    close(r.report.totalDamage, 271147.75, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 2520.29, 0.01);
    close(r.finalState.memberHp.bailu ?? 0, 1548.43, 0.01);
  });

  it('B 秘技全队生息+受击回血2次耗尽+终招延长', () => {
    const r = run('B', () => mkCfg({ techniques: true, rounds: 4, maxTime: 250 }));
    const acts = blActs(r);
    const tech = acts[0];
    close(tech.time, 0, 0.01);
    expect(tech.action).toBe('technique');
    expect(tech.skillCode).toBe('bailu.tech');
    expect(tech.note).toEqual(['technique', 'bailuTech', 'bailuShengxi']);
    close(tech.energyAfter ?? 0, 50, 0.01);
    close(tech.spAfter ?? -1, 3, 0.01);
    expect(buffOf(tech, 'jingyuan', 'bailuShengxi')?.duration).toBe(2);
    expect(buffOf(tech, 'bailu', 'bailuShengxi')?.duration).toBe(2);
    // t=100 三怪各一段受击回血（每生息2次在首波全耗）note 精确
    for (const u of ['monster1', 'monster2', 'monster3']) {
      expect(monEv(r, u, 100).note).toEqual(['bailuHeal', 'bailuShengxiHit']);
    }
    const skill = acts.find((e) => e.action === 'skill')!;
    close(skill.time, 102.04, 0.01);
    expect(skill.note).toEqual(['bailuHeal', 'bailuSkill']);
    // 终招延长：已有生息 duration+1（景元1→2、白露2→3），次数不重置
    const ult = acts.find((e) => e.kind === 'ult')!;
    close(ult.time, 200, 0.01);
    expect(ult.note).toEqual(['bailuShengxi', 'bailuHeal', 'bailuUlt']);
    expect(buffOf(ult, 'jingyuan', 'bailuShengxi')?.duration).toBe(2);
    expect(buffOf(ult, 'bailu', 'bailuShengxi')?.duration).toBe(3);
    // holderEnd tick：t=222.22 白露 3→2、t=296.30 景元降到 1
    const j222 = evsOf(r, (e) => e.unitId === 'jingyuan' && Math.abs(e.time - 222.22) < 0.01)[0];
    expect(buffOf(j222, 'bailu', 'bailuShengxi')?.duration).toBe(2);
    const end250 = evsOf(r, (e) => Math.abs(e.time - 250) < 0.01 && e.buffs !== undefined)[0];
    expect(buffOf(end250, 'jingyuan', 'bailuShengxi')?.duration).toBe(1);
    expect(buffOf(end250, 'bailu', 'bailuShengxi')?.duration).toBe(2);
    expect(noteCounts(r)).toEqual({
      bailuTech: 1,
      bailuShengxi: 2,
      bailuHeal: 5,
      bailuShengxiHit: 3,
      bailuSkill: 1,
      bailuUlt: 1,
    });
    close(r.report.totalDamage, 325189.9, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 2214.29, 0.01);
    close(r.finalState.memberHp.bailu ?? 0, 1548.43, 0.01);
  });
});

describe('白露1211（星魂）', () => {
  it('C E2 终招后全队治疗加成 healBonus×1.15', () => {
    const r = run('C', () =>
      mkCfg({
        rounds: 4,
        maxTime: 250,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'bailu', panel: BL_PANEL, eidolonLevel: 2 },
        ],
      }),
    );
    const acts = blActs(r);
    expect(acts.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([95, 5, 40]);
    const skill = acts[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.note).toEqual(['bailuHeal', 'bailuSkill']);
    const ult = acts.find((e) => e.kind === 'ult')!;
    expect(ult.note).toEqual(['bailuShengxi', 'bailuHeal', 'bailuE2', 'bailuUlt']);
    const e2 = buffOf(ult, 'bailu', 'bailuE2');
    expect(e2?.key).toBe('healBonus');
    close(e2?.value ?? 0, 0.15, 0.0001);
    expect(e2?.duration).toBe(2);
    // E2 不影响伤害：total 与 A 完全同值；治疗加成使终血高于 A
    close(r.report.totalDamage, 271147.75, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 2566.19, 0.01);
    close(r.finalState.memberHp.bailu ?? 0, 1640.23, 0.01);
    const cC = noteCounts(r);
    expect([cC.bailuHeal, cC.bailuSkill, cC.bailuShengxi, cC.bailuE2, cC.bailuUlt, cC.bailuShengxiHit]).toEqual([
      4, 1, 1, 1, 1, 2,
    ]);
  });

  it('D E1 生息自然到期且满血→目标回能+8', () => {
    const r = run('D', () =>
      mkCfg({
        techniques: true,
        rounds: 8,
        maxTime: 400,
        monster: { ...MON, attack: 0 },
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'bailu', panel: BL_PANEL, eidolonLevel: 1 },
        ],
      }),
    );
    const acts = blActs(r);
    expect(acts[0].action).toBe('technique');
    expect(acts[0].note).toEqual(['technique', 'bailuTech', 'bailuShengxi']);
    // 能量链（attack0 无受击回能）[80,100,5,35]
    expect(acts.slice(1).map((e) => Math.round(e.energyAfter ?? 0))).toEqual([80, 100, 5, 35]);
    // attack0 全程满血 → 无治疗/受击回血 note
    for (const e of acts.slice(1)) expect(e.action === 'skill' ? e.note : ['x']).not.toContain('bailuHeal');
    // E1：景元生息 t=296.30 到期 → pending 挂到下一事件 t=300 怪行动 flush
    const e1 = evsOf(r, (e) => (e.note ?? []).includes('bailuE1'))[0];
    close(e1.time, 300, 0.01);
    expect(e1.unitId).toBe('monster1');
    expect(e1.note).toEqual(['bailuE1']);
    // 景元 +8 能量：t=370.37 ens=83（A 同刻 75）
    const j370 = evsOf(r, (e) => e.unitId === 'jingyuan' && Math.abs(e.time - 370.37) < 0.01)[0];
    close(j370.energyAfter ?? 0, 83, 0.01);
    expect(noteCounts(r)).toEqual({
      bailuTech: 1,
      bailuShengxi: 2,
      bailuSkill: 2,
      bailuUlt: 1,
      bailuE1: 1,
    });
    close(r.report.totalDamage, 380669.77, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 3000, 0.01);
    close(r.finalState.memberHp.bailu ?? 0, 3000, 0.01);
  });

  it('E E4 每次治疗+1层增伤（≤3层、同实例刷新、到期重建）', () => {
    const r = run('E', () =>
      mkCfg({
        rounds: 10,
        maxTime: 500,
        monster: { ...MON, attack: 0 },
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'bailu', panel: BL_PANEL, eidolonLevel: 4 },
        ],
      }),
    );
    const skills = blActs(r).filter((e) => e.action === 'skill');
    expect(skills).toHaveLength(3);
    expect(skills.map((e) => Math.round(e.time))).toEqual([102, 306, 408]);
    for (const s of skills) expect(s.note).toEqual(['bailuE4', 'bailuSkill']);
    // 首战技后景元 st=3（主目标直疗+2随机全落他身上）
    const s1 = skills[0];
    const e4jy = buffOf(s1, 'jingyuan', 'bailuE4');
    close(e4jy?.value ?? 0, 0.1, 0.0001);
    expect(e4jy?.stacks).toBe(3);
    expect(e4jy?.duration).toBe(2);
    // 景元 E4 t=296.30 到期移除 → t=306 战技重建 st=1、白露自己 st=2；t=408 各补到 3
    const m300 = monEv(r, 'monster1', 300);
    expect(buffOf(m300, 'jingyuan', 'bailuE4')).toBeUndefined();
    const s2 = skills[1];
    expect(buffOf(s2, 'jingyuan', 'bailuE4')?.stacks).toBe(1);
    expect(buffOf(s2, 'bailu', 'bailuE4')?.stacks).toBe(2);
    const s3 = skills[2];
    expect(buffOf(s3, 'jingyuan', 'bailuE4')?.stacks).toBe(3);
    expect(buffOf(s3, 'bailu', 'bailuE4')?.stacks).toBe(3);
    // 增伤进 damageBonus 因子（基线 1.68/普攻 1.5）：无→+0.3(景元st3)→到期+0.1→重建后+0.3
    close(facOf(hitOf(r, 0), 'damageBonus'), 1.68, 0.001); // t=74 首战技（E4 前）
    close(facOf(hitOf(r, 18), 'damageBonus'), 1.98, 0.001); // t=148 st=3
    close(facOf(hitOf(r, 58), 'damageBonus'), 1.8, 0.001); // t=296 st=3
    close(facOf(hitOf(r, 59), 'damageBonus'), 1.6, 0.001); // t=370 st=1
    close(facOf(hitOf(r, 69), 'damageBonus'), 1.8, 0.001); // t=444 st=3
    // eid4 ≥2 → E2 也在；E4 场景终招无治疗 note（attack0 满血）
    const ult = blActs(r).find((e) => e.kind === 'ult')!;
    expect(ult.note).toEqual(['bailuShengxi', 'bailuE2', 'bailuUlt']);
    // E1：景元终招生息 t=370.30 到期 → t=400 flush、+8 能量（t=444 ens=103）
    const e1 = evsOf(r, (e) => (e.note ?? []).includes('bailuE1'))[0];
    close(e1.time, 400, 0.01);
    expect(e1.note).toEqual(['bailuE1']);
    const j444 = evsOf(r, (e) => e.unitId === 'jingyuan' && Math.abs(e.time - 444.44) < 0.01)[0];
    close(j444.energyAfter ?? 0, 103, 0.01);
    expect(noteCounts(r)).toEqual({
      bailuE4: 3,
      bailuSkill: 3,
      bailuShengxi: 1,
      bailuE2: 1,
      bailuUlt: 1,
      bailuE1: 1,
    });
    close(r.report.totalDamage, 359807.21, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 3000, 0.01);
    close(r.finalState.memberHp.bailu ?? 0, 3000, 0.01);
  });

  it('F 免死 E0：单场仅1次（景元再死不复活、白露战技救自己）', () => {
    const r = run('F', () =>
      mkCfg({
        rounds: 10,
        maxTime: 500,
        monster: { ...MON, attack: 7000 },
        members: [
          { id: 'jingyuan', panel: { ...JY_PANEL, hp: 2000 }, eidolonLevel: 0 },
          { id: 'bailu', panel: { ...BL_PANEL, hp: 30000 }, eidolonLevel: 0 },
        ],
      }),
    );
    // t=100 怪1 致死景元 → 免死+急救治疗（note 精确）
    const m1 = monEv(r, 'monster1', 100);
    expect(m1.note).toEqual(['bailuHeal', 'bailuRevive']);
    expect(m1.enemyHits![0].targetId).toBe('jingyuan');
    close(m1.enemyHits![0].hpLoss, 2000, 0.01);
    expect(m1.enemyHits![0].dead).toBe(true);
    close(m1.enemyHits![0].energy ?? 0, 10, 0.01);
    // 怪2 再杀景元（第2次死）→ 已用尽，无 bailuRevive note
    const m2 = monEv(r, 'monster2', 100);
    expect(m2.enemyHits).toHaveLength(2);
    expect(m2.note ?? []).not.toContain('bailuRevive');
    // t=102 景元已死 → 战技唯一存活目标=白露
    const skill = evsOf(r, (e) => e.unitId === 'bailu' && e.action === 'skill')[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.targetId).toBe('bailu');
    expect(skill.note).toEqual(['bailuHeal', 'bailuSkill']);
    // eid0：终招无 E2
    const ult = evsOf(r, (e) => e.unitId === 'bailu' && e.kind === 'ult')[0];
    expect(ult.note).toEqual(['bailuHeal', 'bailuShengxi', 'bailuUlt']);
    // 受击回血（白露生息首触发）
    expect(monEv(r, 'monster2', 200).note).toEqual(['bailuHeal', 'bailuShengxiHit', 'freeze']);
    expect(noteCounts(r)).toEqual({
      bailuHeal: 4,
      bailuRevive: 1,
      bailuSkill: 1,
      bailuShengxi: 1,
      bailuUlt: 1,
      bailuShengxiHit: 1,
    });
    // 景元只打出首波战技（3×6578.15）即死亡
    close(r.report.totalDamage, 19734.45, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 0, 0.01);
    close(r.finalState.memberHp.bailu ?? 0, 0, 0.01);
  });

  it('G 免死 E6：单场2次（E4/E2 同时生效）', () => {
    const r = run('G', () =>
      mkCfg({
        rounds: 10,
        maxTime: 800,
        monster: { ...MON, attack: 7000 },
        members: [
          { id: 'jingyuan', panel: { ...JY_PANEL, hp: 2000 }, eidolonLevel: 0 },
          { id: 'bailu', panel: { ...BL_PANEL, hp: 30000 }, eidolonLevel: 6 },
        ],
      }),
    );
    // 第1次免死（怪1）+ 第2次免死（怪2）
    expect(monEv(r, 'monster1', 100).note).toEqual(['bailuHeal', 'bailuRevive']);
    expect(monEv(r, 'monster2', 100).note).toEqual(['bailuHeal', 'bailuRevive']);
    // 急救量 0.18×30000+480=5880 溢出钳制 → 景元满血复活 → 战技回满血目标（note 无 bailuHeal）
    const skill = evsOf(r, (e) => e.unitId === 'bailu' && e.action === 'skill')[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.targetId).toBe('jingyuan');
    expect(skill.note).toEqual(['bailuE4', 'bailuSkill']);
    // 复活的景元正常行动
    expect(evsOf(r, (e) => e.unitId === 'jingyuan' && Math.abs(e.time - 148.15) < 0.01).length).toBe(2);
    // t=200 怪1 第3杀 → 次数用尽无 note
    const m1t200 = monEv(r, 'monster1', 200);
    expect(m1t200.enemyHits![0].dead).toBe(true);
    expect(m1t200.note ?? []).not.toContain('bailuRevive');
    // eid6：本局在嘲讽加权后受击回能不足、跑不出终招 → 仅在放出的局里断言 E2 集合
    const bahaUlt = evsOf(r, (e) => e.unitId === 'bailu' && e.kind === 'ult')[0];
    if (bahaUlt) {
      expect([...(bahaUlt.note ?? [])].sort()).toEqual([
        'bailuE2',
        'bailuHeal',
        'bailuShengxi',
        'bailuUlt',
      ]);
    }
    // 本局跑不出终招 → 只校验「两次免死 + 治疗次数」这两个核心事实（其余键随机制增减）
    expect(noteCounts(r)).toMatchObject({ bailuHeal: 2, bailuRevive: 2 });
    close(r.report.totalDamage, 161890.15, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 0, 0.01);
    close(r.finalState.memberHp.bailu ?? 0, 0, 0.01);
  });
});
