import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 卢卡 1111 接入回归（2026-10-20；dump 锚点法：锚点全部来自 lgs-dump 实测 seed=20261018，勿纯推理改写） */

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

const LUKA_PANEL = {
  level: 80,
  hp: 30000,
  attack: 2500,
  defence: 800,
  speed: 103,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Physical' as const,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

const JY_PANEL = {
  level: 80,
  hp: 30000,
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
      { id: 'luka', panel: LUKA_PANEL, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 4,
    maxTime: 350,
    techniques: false,
    seed: 20261018,
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
const hitBy = (r: BattleResult, code: string, n: number): BattleResult['hits'][number] => {
  const hs = r.hits.filter((h) => h.skillCode === code);
  expect(hs.length).toBeGreaterThanOrEqual(n);
  return hs[hs.length - 1];
};

describe('卢卡1111（基础机制）', () => {
  it('A 战技裂伤+天赋引爆直接伤害+强化普攻+终结技', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 345867.12, 0.5);
    // 首战技 t=97.09：3× 单体 + 天赋引爆（直接伤害，即挂即爆）
    const skill = evsOf(r, (e) => e.unitId === 'luka' && e.action === 'skill')[0];
    close(skill.time, 97.09, 0.01);
    expect(skill.note).toEqual(expect.arrayContaining(['lkSkill', 'lkRupture']));
    expect(skill.note!.filter((n) => n === 'lkRupture')).toHaveLength(1);
    close(skill.energyAfter ?? 0, 101, 0.01);
    expect(skill.spAfter).toBe(1);
    expect(skill.hitSeqs).toEqual([3]);
    close(baseOf(r, skill.hitSeqs![0]), 3000, 0.01);
    close(hitOf(r, skill.hitSeqs![0]).total, 1414.29, 0.01);
    // 裂伤 DoT：atk×2.18208=8450 / 跳伤
    const bleed = hitOf(r, 4);
    expect(bleed.skillCode).toBe('skilldot.bleed');
    close(baseOf(r, 4), 8450, 0.01);
    close(bleed.total, 4023.81, 0.01);
    // 强化普攻 t=194.17：3主段700 + 3天赋激发100% Extra + 衔接段 2800 + 天赋裂伤0.85独立系数
    const basic = evsOf(r, (e) => e.unitId === 'luka' && e.action === 'basic')[0];
    expect(basic.note).toContain('lkEnhanced');
    expect(basic.hitSeqs).toHaveLength(8);
    for (const s of [26, 28, 30]) {
      expect(hitOf(r, s).skillCode).toBe('luka.enhanced');
      expect(hitOf(r, s + 1).skillCode).toBe('luka.enhancedExtra');
      close(baseOf(r, s), 500, 0.01);
    }
close(baseOf(r, 32), 2000, 0.01);
close(baseOf(r, 33), 8450, 0.01);
    close(hitOf(r, 33).total, 3420.24, 0.01);
    // 终结技 t=194.17：6× + 裂伤自身引爆补翻
    const ult = evsOf(r, (e) => e.unitId === 'luka' && e.kind === 'ult')[0];
    expect(ult.note).toContain('lkUlt');
    expect(ult.hitSeqs).toEqual([34]);
close(baseOf(r, 34), 8250, 0.01);
    close(hitOf(r, 34).total, 4667.14, 0.01);
    // 跳伤 t=200 ×1.2 vuln（引爆后普攻翻倍裂伤）
    const tick = hitBy(r, 'skilldot.bleed', 2);
    close(tick.total, 4828.57, 0.01);
  });

  it('B 秘技先发制人：0.5×单体 + 立刻流血（lkRupture 技术）', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 480391.89, 0.5);
    const tech = evsOf(r, (e) => e.unitId === 'luka' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toEqual(['technique', 'lkTech', 'lkRupture']);
    close(tech.energyAfter ?? 0, 71, 0.01);
    expect(tech.spAfter).toBe(3);
    expect(tech.hitSeqs).toEqual([0]);
close(baseOf(r, 0), 1250, 0.01);
    close(hitOf(r, 0).total, 589.29, 0.01);
    // 战技 t=97.09：技能能量 30 + 技能充能回 3（68→101? 71+33=104）
    const skill = evsOf(r, (e) => e.unitId === 'luka' && e.action === 'skill')[0];
    close(skill.energyAfter ?? 0, 104, 0.01);
    expect(skill.spAfter).toBe(1);
  });

  it('C E2 追加伤害附加流（total 锚）', () => {
    const r = run('C', () => mkCfg({}, 2));
    close(r.report.totalDamage, 347260.19, 0.5);
  });

  it('D E4（total 锚）', () => {
    const r = run('D', () => mkCfg({}, 4));
    close(r.report.totalDamage, 353080.6, 0.5);
    // E4 天赋裂伤 lv12：base=9720×1.1=10689.25
    close(baseOf(r, 4), 10689.25, 0.01);
  });

  it('E E6 强化普攻追加 6 次流血（独立0.08）', () => {
    const r = run('E', () => mkCfg({}, 6));
    close(r.report.totalDamage, 359904.04, 0.5);
    // E3 战技+2 lv12：base=3300 / 裂伤 10689.25
    const skill = evsOf(r, (e) => e.unitId === 'luka' && e.action === 'skill')[0];
    close(baseOf(r, skill.hitSeqs![0]), 3300, 0.01);
close(baseOf(r, 4), 10689.25, 0.01);
    // E6 强化普攻 6 次 r6.bleed（独立0.08）— 首个强化普攻内每段 base=9759.75 total=371.8
    const basic1 = evsOf(r, (e) => e.unitId === 'luka' && e.action === 'basic')[0];
    const r6s = basic1.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'luka.r6.bleed');
    expect(r6s).toHaveLength(6);
    for (const h of r6s) close(h.total, 371.8, 0.01);
    // 终结技 lv12 base=10246.5
    const ult = evsOf(r, (e) => e.unitId === 'luka' && e.kind === 'ult')[0];
    close(baseOf(r, ult.hitSeqs![0]), 10246.5, 0.01);
  });

  it('F 破韧裂伤基础 3767.55（maxToughness=60）', () => {
    const r = run('F', () => mkCfg({ monster: { ...MON, maxToughness: 60 } }));
    close(r.report.totalDamage, 417335.9700143236, 0.5);
    const brk = evsOf(r, (e) => e.unitId === 'luka' && e.kind === 'break')[0];
    const brkHit = hitOf(r, brk.hitSeqs![0]);
    expect(brkHit.skillCode).toBe('luka.skill.break');
    close(baseOf(r, brkHit.seq), 3767.55, 0.01);
    close(brkHit.total, 3588.14, 0.01);
  });

  it('G E6 + 破韧（total 锚）', () => {
    const r = run('G', () => mkCfg({ monster: { ...MON, maxToughness: 60 } }, 6));
    close(r.report.totalDamage, 432121.8096280556, 0.5);
    // E3 战技 lv12 base=3300 破韧场景同值
    const skill = evsOf(r, (e) => e.unitId === 'luka' && e.action === 'skill')[0];
    close(baseOf(r, skill.hitSeqs![0]), 3300, 0.01);
  });
});
