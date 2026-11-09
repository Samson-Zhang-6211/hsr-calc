import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 桑博 1108 接入回归（2026-10-19；dump 锚点法：锚点全部来自 x-dump23 实测 seed=20261018，勿纯推理改写） */

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

const SP_PANEL = {
  level: 80,
  hp: 30000,
  attack: 2500,
  defence: 800,
  speed: 102,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Wind' as const,
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

const WEAK_JY = {
  ...JY_PANEL,
  attack: 1,
  critRate: 0,
  critDmg: 0,
  damageBonus: 0,
};

function mkCfg(over: Partial<BattleConfig> = {}, eidolon = 0, jy = JY_PANEL): BattleConfig {
  return {
    members: [
      { id: 'sampo', panel: SP_PANEL, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: jy, eidolonLevel: 0 },
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
const noteCountOf = (r: BattleResult): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const e of r.events) for (const n of e.note ?? []) c[n] = (c[n] ?? 0) + 1;
  return c;
};
const jumpAt = (r: BattleResult, t: number): BattleResult['hits'][number] =>
  r.hits.find((h) => h.skillCode === 'skilldot.windShear' && Math.abs(h.time - t) < 0.01)!;

describe('桑博1108（基础机制）', () => {
  it('A 战技弹射风化/回开始跳伤/终招 dotTaken', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 331137.69, 0.5);
    // 战技 t=98.04：主段 + 4 次随机弹射，每次 65% 挂风化
    const skill = evsOf(r, (e) => e.unitId === 'sampo' && e.action === 'skill')[0];
    close(skill.time, 98.04, 0.01);
    expect(skill.note).toContain('spSkill');
    expect(skill.note!.filter((n) => n === 'spWind')).toHaveLength(5);
    close(skill.energyAfter ?? 0, 66, 0.01);
    expect(skill.spAfter).toBe(1);
    expect(skill.hitSeqs).toHaveLength(5);
    for (const s of skill.hitSeqs!) {
      close(baseOf(r, s), 1400, 0.01); // 0.56×2500
      close(hitOf(r, s).total, 660, 0.01);
    }
    // 回合开始跳伤 t=100：风化层数×1300×atk → m1/m3 双层、m2 单层
    close(jumpAt(r, 100).total, 1238.1, 0.01); // m1 2层
    const m2 = r.hits.filter((h) => h.skillCode === 'skilldot.windShear' && Math.abs(h.time - 100) < 0.01);
    close(m2.find((h) => h.target === 'monster2')!.total, 619.05, 0.01);
    // 普攻 t=196.08 命中也挂风化
    const basic = evsOf(r, (e) => e.unitId === 'sampo' && e.action === 'basic')[0];
    close(basic.time, 196.08, 0.01);
    expect(basic.note).toContain('spWind');
    close(hitOf(r, basic.hitSeqs![0]).total, 1178.57, 0.01);
    // t=200 跳伤：三桩均 2 层
    for (const tgt of ['monster1', 'monster2', 'monster3']) {
      const h = r.hits.find((x) => x.skillCode === 'skilldot.windShear' && Math.abs(x.time - 200) < 0.01 && x.target === tgt)!;
      close(h.total, 1238.1, 0.01);
    }
    // 普攻 t=294.12 入满 → 终招同刻：AoE 1.6× + dotTaken 0.3 2回合 + 点07 回 10
    const ult = evsOf(
      r,
      (e) => e.unitId === 'sampo' && e.kind === 'ult' && Math.abs(e.time - 294.12) < 0.01,
    )[0];
    expect(ult.note).toEqual(expect.arrayContaining(['spUlt', 'spTalent']));
    expect(ult.note!.filter((n) => n === 'spTalent')).toHaveLength(3);
    close(ult.energyAfter ?? 0, 15, 0.01);
    expect(ult.hitSeqs).toHaveLength(3);
    for (const s of ult.hitSeqs!) close(hitOf(r, s).total, 1885.71, 0.01);
    // t=300 跳伤：终招又各挂 1 层 → 3 层
    close(jumpAt(r, 300).total, 2414.29, 0.01);
    const nc = noteCountOf(r);
    expect(nc.spWind).toBe(7); // 战技 5（弹射1失败不计数已在该5内）+ 普攻1 + 同刻前普攻1；终招走 spTalent 不计 spWind
  });

  it('B 秘技你最闪亮（进战推条 25%，目盲不建模）', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 449630.19, 0.5);
    const tech = evsOf(r, (e) => e.unitId === 'sampo' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toEqual(['technique', 'spTech']);
    close(tech.energyAfter ?? 0, 60, 0.01);
    expect(tech.spAfter).toBe(3);
    expect(tech.hitSeqs ?? []).toHaveLength(0); // 秘技非攻击，无伤害段（目盲不建模）
    // 110807 #3：进战行动延后 25% → 怪物首动 100 → 125
    const monAct = evsOf(r, (e) => e.unitId === 'monster2' && e.action === 'monster')[0];
    close(monAct.time, 125, 0.01);
  });

  it('C E1 战技额外弹射（6 段伤害）', () => {
    const r = run('C', () => mkCfg({}, 1));
    close(r.report.totalDamage, 323515.83, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'sampo' && e.action === 'skill')[0];
    expect(skill.hitSeqs).toHaveLength(6); // 主段 + 5 弹射（1 个 65% roll 失败 → note 5×spWind）
    expect(skill.note!.filter((n) => n === 'spWind')).toHaveLength(5);
  });

  it('D E4 战技击中≥5层目标爆炸 8%（长局首次爆炸 t≈392）', () => {
    const r = run('D', () => mkCfg({ rounds: 8, maxTime: 800 }, 4));
    close(r.report.totalDamage, 786641.08, 1);
    const e4hits = r.hits.filter((h) => h.skillCode === 'sampo.eidolon4');
    expect(e4hits.length).toBeGreaterThan(5);
    const first = e4hits[0];
    close(first.time, 392.16, 0.01);
    expect(first.target).toBe('monster2');
    close(first.total, 245.14, 0.01);
    const nc = noteCountOf(r);
    expect(nc.spE4).toBe(13);
  });

  it('E E3/E5 lv12 + E6 风化倍率×1.15', () => {
    const r = run('E', () => mkCfg({}, 6));
    close(r.report.totalDamage, 328693.88, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'sampo' && e.action === 'skill')[0];
    for (const s of skill.hitSeqs!) close(baseOf(r, s), 1540, 0.01); // 0.616×2500（E3 lv12）
    // E6 风化每层 base=1644.5 → 双层 3289
    close(jumpAt(r, 100).total, 1566.19, 0.01); // m1 双层
    const ult = evsOf(r, (e) => e.unitId === 'sampo' && e.kind === 'ult')[0];
    for (const s of ult.hitSeqs!) {
      close(baseOf(r, s), 4320, 0.01); // 1.728×2500（E5 lv12）
      close(hitOf(r, s).total, 2036.57, 0.01);
    }
    // t=300 m1 三层 4933.5 → total 3101.0571
    close(jumpAt(r, 300).total, 3101.06, 0.01);
  });

  it('F E2 击杀风化目标 → 全体挂层（弱景元+低血怪）', () => {
    const r = run('F', () =>
      mkCfg({ monster: { ...MON, hp: 4000, maxToughness: 3000 } }, 2, WEAK_JY),
    );
    close(r.report.totalDamage, 16970.93, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'sampo' && e.action === 'skill')[0];
    expect(skill.hitSeqs).toHaveLength(6);
    expect(skill.note!.filter((n) => n === 'spWind')).toHaveLength(5); // 1 个 65% roll 失败
    // t=200 跳伤杀 m2 → E2 触发：全体挂层 note（怪物事件 note [spE2,spE2]）
    const mc = evsOf(
      r,
      (e) => e.unitId === 'monster2' && Math.abs(e.time - 200) < 0.01,
    );
    const notes = mc.flatMap((e) => e.note ?? []);
    expect(notes.filter((n) => n === 'spE2')).toHaveLength(2);
    // 同刻桑博终招 note 含 spE2，且只打存活两怪
    const ult = evsOf(
      r,
      (e) => e.unitId === 'sampo' && e.kind === 'ult' && Math.abs(e.time - 200) < 0.01,
    )[0];
    expect(ult.note).toEqual(expect.arrayContaining(['spUlt', 'spE2']));
    expect(ult.hitSeqs).toHaveLength(2);
  });
});
