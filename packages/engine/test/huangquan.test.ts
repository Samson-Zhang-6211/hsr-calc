import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 黄泉 1308 接入回归（2026-10；dump 锚点法：锚点全部来自 quad-dump 实测 seed=20261018，勿纯推理改写） */

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

const HQ_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 101,
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
      { id: 'huangquan', panel: HQ_PANEL, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 6,
    maxTime: 420,
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
const factorOf = (r: BattleResult, seq: number, key: string): number =>
  r.hits.find((h) => h.seq === seq)!.factors.find((f) => f.key === key)!.value;
const hitOf = (r: BattleResult, seq: number): BattleResult['hits'][number] => r.hits.find((h) => h.seq === seq)!;
const noteCountOf = (r: BattleResult): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const e of r.events) for (const n of e.note ?? []) c[n] = (c[n] ?? 0) + 1;
  return c;
};

describe('黄泉1308（残梦/集真赤/终结技）', () => {
  it('A 战技/终招（雷心/全抗降低）/残梦能量锚', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 442451.78, 0.5);
    // 战技 t=99.01：主 1.6× + 相邻 0.6×、+1 残梦 + 主目标 +1 集真赤
    const skill = evsOf(r, (e) => e.unitId === 'huangquan' && e.action === 'skill')[0];
    close(skill.time, 99.01, 0.01);
    expect(skill.note).toContain('hqSkill');
    close(baseOf(r, skill.hitSeqs![0]), 4000, 0.01);
    close(factorOf(r, skill.hitSeqs![0], 'crit'), 1.1, 0.001);
    close(hitOf(r, skill.hitSeqs![0]).total, 1885.71, 0.01);
    // 终招 t=100：残梦满9→清空（ens=0）、18 段；啼泽雨斩全抗-20%（resist1.2）+ 雷心 vuln1.3
    const ult = evsOf(r, (e) => e.unitId === 'huangquan' && e.kind === 'ult')[0];
    close(ult.time, 100, 0.01);
    expect(ult.note).toContain('hqUlt');
    close(ult.energyAfter ?? 0, 0, 0.01);
    expect(ult.hitSeqs).toHaveLength(18);
    const slash = ult.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'huangquan.ultSlash')!;
    close(slash.factors.find((f) => f.key === 'base')!.value, 600, 0.01);
    close(slash.factors.find((f) => f.key === 'resist')!.value, 1.2, 0.001);
    close(slash.factors.find((f) => f.key === 'vuln')!.value, 1.3, 0.001);
    close(slash.total, 441.26, 0.01);
    // 残梦驱动 3 次终招/局
    const nc = noteCountOf(r);
    expect(nc.hqSkill).toBe(2);
    expect(nc.hqUlt).toBe(3);
  });

  it('B E1（对负面敌暴击率+18%）', () => {
    const r = run('B', () => mkCfg({}, 1));
    close(r.report.totalDamage, 444788.94, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'huangquan' && e.action === 'skill')[0];
    close(factorOf(r, skill.hitSeqs![0], 'crit'), 1.19, 0.001);
  });

  it('C E6（晋攻战技视为终招、终招抗穿）', () => {
    const r = run('C', () => mkCfg({}, 6));
    close(r.report.totalDamage, 493658.72, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'huangquan' && e.action === 'skill')[0];
    close(baseOf(r, skill.hitSeqs![0]), 4400, 0.01);
    close(factorOf(r, skill.hitSeqs![0], 'damageBonus'), 1.08, 0.001);
    const ult = evsOf(r, (e) => e.unitId === 'huangquan' && e.kind === 'ult')[0];
    const slash = ult.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'huangquan.ultSlash')!;
    close(slash.factors.find((f) => f.key === 'base')!.value, 648, 0.01);
    close(slash.factors.find((f) => f.key === 'resist')!.value, 1.42, 0.001);
    close(slash.total, 658.87, 0.01);
  });

  it('EX 星魂（虚隙一顾··枯骨眠霜：队友攻击集真赤目标→附加+900%追加+残梦）', () => {
    // dump 实测 seed=20261018：EX 开=341503.49 / 关=281240.78（=A 用例同值=零回归）
    const r = run('EX', () => mkCfg({ huangquanEx: true }));
    const off = run('EXoff', () => mkCfg());
    close(r.report.totalDamage, 502714.49, 0.5);
    close(off.report.totalDamage, 442451.78, 0.5);
    // 首触发=景元战技 t=74.07（进战 point06 集真赤在 m2）：note hqEx、附加段+3×追加段并入该事件
    const trig = evsOf(r, (e) => (e.note ?? []).includes('hqEx'))[0];
    expect(trig.unitId).toBe('jingyuan');
    close(trig.time, 74.07, 0.01);
    const exExtra = trig.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'huangquan.exExtra')!;
    close(exExtra.factors.find((f) => f.key === 'base')!.value, 2500, 0.01); // 100%×atk
    const exFollow = trig.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'huangquan.exFollow');
    expect(exFollow).toHaveLength(3);
    for (const h of exFollow) close(h.factors.find((f) => f.key === 'base')!.value, 22500, 0.01); // 900%×atk
    // 每回合 1 次：黄泉 t=99.01 行动重置后，下一景元行动才可再触发（本局集真赤在 t=100 终招清空→全场仅 1 次）
    expect(noteCountOf(r).hqEx).toBe(1);
    expect(noteCountOf(off).hqEx).toBeUndefined();
    // 触发后 +1 残梦：黄泉首战技 ens=7（无 EX 时=6）
    const skill = evsOf(r, (e) => e.unitId === 'huangquan' && e.action === 'skill')[0];
    close(skill.energyAfter ?? 0, 7, 0.01);
  });
});
