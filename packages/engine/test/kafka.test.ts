import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 卡芙卡 1005 接入回归（2026-10-17；dump 锚点法：锚点全部来自 kafka-dump 实测 seed=20261017，勿纯推理改写） */

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

const KF_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 104,
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

function mkCfg(over: Partial<BattleConfig> = {}, eidolon = 0): BattleConfig {
  return {
    members: [
      { id: 'kafka', panel: KF_PANEL, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 4,
    maxTime: 350,
    techniques: false,
    seed: 20261017,
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
const baseOf = (r: BattleResult, seq: number): number =>
  r.hits.find((h) => h.seq === seq)!.factors.find((f) => f.key === 'base')!.value;
const hitOf = (r: BattleResult, seq: number): BattleResult['hits'][number] => r.hits.find((h) => h.seq === seq)!;
const noteCountOf = (r: BattleResult): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const e of r.events) for (const n of e.note ?? []) c[n] = (c[n] ?? 0) + 1;
  return c;
};

describe('卡芙卡1005（基础机制）', () => {
  it('A 战技引爆/终招/天赋追击/跳伤/能量锚', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 348710.59, 0.5);
    // 景元首动 t=74.07：本体 3 段 + 天赋追击（hit 并入触发事件、note 滞后一事件）
    const jy1 = evsOf(r, (e) => e.unitId === 'jingyuan' && e.kind === 'action')[0];
    close(jy1.time, 74.07, 0.01);
    expect(jy1.hitSeqs).toHaveLength(4);
    close(baseOf(r, jy1.hitSeqs![0]), 3720, 0.01);
    expect(hitOf(r, jy1.hitSeqs![3]).skillCode).toBe('kafka.talent');
    close(hitOf(r, jy1.hitSeqs![3]).total, 1650, 0.01);
    expect(jy1.note ?? []).not.toContain('kfFollow');
    // 战技 t=96.15：主 1.6×（m2）+ 相邻 0.6×（m1/m3）+ 相邻引爆 0.5
    const skill = evsOf(r, (e) => e.unitId === 'kafka' && e.action === 'skill')[0];
    close(skill.time, 96.15, 0.01);
    expect(skill.note).toContain('kfSkill');
    expect(skill.note).toContain('kfShock');
    expect(skill.note).toContain('kfFollow');
    close(skill.energyAfter ?? 0, 90, 0.01);
    expect(skill.spAfter).toBe(1);
    expect(skill.hitSeqs).toHaveLength(4);
    const mains = skill.hitSeqs!.filter((s) => baseOf(r, s) === 4000);
    expect(mains).toHaveLength(1);
    close(hitOf(r, mains[0]).total, 1885.71, 0.01);
    const adjs = skill.hitSeqs!.filter((s) => baseOf(r, s) === 1500);
    expect(adjs).toHaveLength(2);
    for (const s of adjs) close(hitOf(r, s).total, 707.14, 0.01);
    const det = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'kafka.skill.shock')!;
    close(det.total, 1726.19, 0.01);
    // 怪回合自然跳伤 t=100
    const jump = r.hits.find((h) => h.skillCode === 'skilldot.shock' && Math.abs(h.time - 100) < 0.01)!;
    close(jump.total, 3452.38, 0.01);
    // 终招 t=192.31：3×直伤 + 3×触电引爆120%
    const ult = evsOf(r, (e) => e.unitId === 'kafka' && e.kind === 'ult')[0];
    close(ult.time, 192.31, 0.01);
    expect(ult.note).toContain('kfUlt');
    expect(ult.note!.filter((n) => n === 'kfShock')).toHaveLength(3);
    close(ult.energyAfter ?? 0, 5, 0.01);
    expect(ult.hitSeqs).toHaveLength(6);
    for (const s of ult.hitSeqs!.slice(0, 3)) {
      close(baseOf(r, s), 2000, 0.01);
      close(hitOf(r, s).total, 942.86, 0.01);
    }
    for (const s of ult.hitSeqs!.slice(3)) {
      close(baseOf(r, s), 7250, 0.01);
      close(hitOf(r, s).total, 4142.86, 0.01);
    }
    // 普攻（同刻 basic 在 ult 前）：ens=120、base 3500
    const basic = evsOf(
      r,
      (e) => e.unitId === 'kafka' && e.action === 'basic' && Math.abs(e.time - 192.31) < 0.01,
    )[0];
    close(basic.energyAfter ?? 0, 120, 0.01);
    close(hitOf(r, basic.hitSeqs![0]).total, 1178.57, 0.01);
    // 天赋追击（荆棘 point08 引爆 80%）：JY 第 2 动 t=148.15 note 滞后 flush 出 kfShock/kfFollow
    const jy2 = evsOf(
      r,
      (e) => e.unitId === 'jingyuan' && e.kind === 'action' && Math.abs(e.time - 148.15) < 0.01,
    )[0];
    expect(jy2.note).toContain('kfShock');
    expect(jy2.note).toContain('kfFollow');
    const tdet = r.hits.find((h) => h.skillCode === 'kafka.talent.shock' && Math.abs(h.time - 222.22) < 0.01)!;
    close(tdet.total, 2761.9, 0.01);
    // note 计数：战技 1 + 终招 1 / kfFollow=4 次追击 / kfShock=4 追击挂触电 + 终招 3
    const nc = noteCountOf(r);
    expect(nc.kfSkill).toBe(1);
    expect(nc.kfUlt).toBe(1);
    expect(nc.kfFollow).toBe(4);
    expect(nc.kfShock).toBe(7);
  });

  it('B 秘技挂触电→战技主引爆 75%', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 428169.41, 0.5);
    const tech = evsOf(r, (e) => e.unitId === 'kafka' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toEqual(expect.arrayContaining(['technique', 'kfTech']));
    expect(tech.note!.filter((n) => n === 'kfShock')).toHaveLength(3);
    close(tech.energyAfter ?? 0, 60, 0.01);
    expect(tech.spAfter).toBe(3);
    for (const s of tech.hitSeqs!) {
      close(baseOf(r, s), 1250, 0.01);
      close(hitOf(r, s).total, 589.29, 0.01);
    }
    // 秘技已挂触电 → 战技主目标引爆 75%（2589.29=3452.38×0.75）、相邻 50%
    const skill = evsOf(r, (e) => e.unitId === 'kafka' && e.action === 'skill')[0];
    expect(skill.hitSeqs).toHaveLength(6);
    const dets = skill.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'kafka.skill.shock');
    expect(dets).toHaveLength(3);
    const mainDet = dets.find((h) => h.target === 'monster2')!;
    close(mainDet.total, 2589.29, 0.01);
    for (const h of dets.filter((x) => x.target !== 'monster2')) close(h.total, 1726.19, 0.01);
    // 景元首动 t=74.07 触发天赋追击 + 荆棘引爆（触电已在场）
    const jy1 = evsOf(r, (e) => e.unitId === 'jingyuan' && e.kind === 'action')[0];
    const tdet = jy1.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'kafka.talent.shock')!;
    close(tdet.total, 2761.9, 0.01);
  });

  it('C E1 受到的持续伤害+30%（只吃 DoT、直伤不变）', () => {
    const r = run('C', () => mkCfg({}, 1));
    close(r.report.totalDamage, 329368.94, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'kafka' && e.action === 'skill')[0];
    const det = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'kafka.skill.shock')!;
    close(det.total, 2244.05, 0.01); // =1726.19×1.3
    const main = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => (h.skillCode ?? '').endsWith('.skill') && h.kind === 'direct')!;
    close(main.total, 1885.71, 0.01); // 直伤吃面板暴击
    const ult = evsOf(r, (e) => e.unitId === 'kafka' && e.kind === 'ult')[0];
    close(hitOf(r, ult.hitSeqs![3]).total, 5385.71, 0.01); // =4142.86×1.3
    close(hitOf(r, ult.hitSeqs![0]).total, 942.86, 0.01); // 直伤吃面板暴击
    const jump = r.hits.find((h) => h.skillCode === 'skilldot.shock' && Math.abs(h.time - 100) < 0.01)!;
    close(jump.total, 4488.1, 0.01); // =3452.38×1.3
  });

  it('D E2 全队持续伤害+33%（与 E1 乘算 1.729）', () => {
    const r = run('D', () => mkCfg({}, 2));
    close(r.report.totalDamage, 342846.69, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'kafka' && e.action === 'skill')[0];
    const det = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'kafka.skill.shock')!;
    close(det.total, 2984.58, 0.01); // =1726.19×1.729
    const main = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => (h.skillCode ?? '').endsWith('.skill') && h.kind === 'direct')!;
    close(main.total, 1885.71, 0.01); // 直伤吃面板暴击
    const jump = r.hits.find((h) => h.skillCode === 'skilldot.shock' && Math.abs(h.time - 100) < 0.01)!;
    close(jump.total, 5969.17, 0.01); // =3452.38×1.729
  });

  it('E E3技能升级 + E4触电伤害回能', () => {
    const r = run('E', () => mkCfg({}, 4));
    close(r.report.totalDamage, 343413.93, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'kafka' && e.action === 'skill')[0];
    // E4：技能内引爆触电 +2 → ens=92（A=90）
    close(skill.energyAfter ?? 0, 92, 0.01);
    // E3 战技+2 → lv12：主 1.76×=4400、相邻 0.66×=1650
    const main = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.kind === 'direct' && baseOf(r, h.seq) > 4000)!;
    close(baseOf(r, main.seq), 4400, 0.01);
    close(main.total, 2074.29, 0.01);
    for (const s of skill.hitSeqs!.filter((s) => baseOf(r, s) === 1650)) close(hitOf(r, s).total, 777.86, 0.01);
    // lv12 相邻引爆 0.52（非 0.5）：=5969.17×0.52
    const det = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'kafka.skill.shock')!;
    close(det.total, 3103.97, 0.01);
    // E4 能量链：终招 ens=11（A=5；+2×引爆1+跳伤1+追击引爆1）
    const ult = evsOf(r, (e) => e.unitId === 'kafka' && e.kind === 'ult')[0];
    close(ult.energyAfter ?? 0, 11, 0.01);
    // E1+E2 仍生效（跳伤 = 3452.38×1.729）
    const jump = r.hits.find((h) => h.skillCode === 'skilldot.shock' && Math.abs(h.time - 100) < 0.01)!;
    close(jump.total, 5969.17, 0.01);
  });

  it('F E6 触电倍率加点+1.56/等级提升', () => {
    const r = run('F', () => mkCfg({}, 6));
    close(r.report.totalDamage, 379865.78, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'kafka' && e.action === 'skill')[0];
    close(skill.energyAfter ?? 0, 92, 0.01);
    // E6 触电 base = 2500×(lv12 触电 3.18275 + 1.56)
    const det = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'kafka.skill.shock')!;
    close(baseOf(r, det.seq), 11856.88, 0.01);
    close(det.total, 5076.32, 0.01);
    // E5 终招+2 → lv12 0.864×=2160
    const ult = evsOf(r, (e) => e.unitId === 'kafka' && e.kind === 'ult')[0];
    close(baseOf(r, ult.hitSeqs![0]), 2160, 0.01);
    close(hitOf(r, ult.hitSeqs![0]).total, 1018.29, 0.01);
    // E6 终招触电引爆（含 E1/E2）
    close(baseOf(r, ult.hitSeqs![3]), 11856.88, 0.01);
    close(hitOf(r, ult.hitSeqs![3]).total, 12105.08, 0.01);
    // E5 天赋+2：追击 base 3990（1.4→lv12 1.596）
    const jy1 = evsOf(r, (e) => e.unitId === 'jingyuan' && e.kind === 'action')[0];
    const tal = jy1.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'kafka.talent')!;
    close(baseOf(r, tal.seq), 3990, 0.01);
    close(tal.total, 1881, 0.01);
    // 自然跳伤 = 11856.88 基数 × E1/E2
    const jump = r.hits.find((h) => h.skillCode === 'skilldot.shock' && Math.abs(h.time - 100) < 0.01)!;
    close(baseOf(r, jump.seq), 11856.88, 0.01);
    close(jump.total, 9762.16, 0.01);
  });

  it('G 直伤吃面板暴击、DoT 不吃暴击', () => {
    const r = run('A', () => mkCfg());
    const skill = evsOf(r, (e) => e.unitId === 'kafka' && e.action === 'skill')[0];
    const hits = skill.hitSeqs!.map((s) => hitOf(r, s));
    const direct = hits.find((h) => h.kind === 'direct' && (h.skillCode ?? '').endsWith('.skill'))!;
    close(direct.factors.find((f) => f.key === 'crit')!.value, 1.1, 1e-9);
    const dot = hits.find((h) => h.skillCode === 'kafka.skill.shock')!;
    expect(dot.factors.find((f) => f.key === 'crit')).toBeUndefined();
  });
});
