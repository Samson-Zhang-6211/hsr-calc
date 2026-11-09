import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 银狼 1006 接入回归（2026-10；dump 锚点法：锚点全部来自 quad-dump 实测 seed=20261018，勿纯推理改写） */

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

const YW_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 107,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Quantum' as const,
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
      { id: 'yinlang', panel: YW_PANEL, eidolonLevel: eidolon },
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
const factorOf = (r: BattleResult, seq: number, key: string): number =>
  r.hits.find((h) => h.seq === seq)!.factors.find((f) => f.key === key)!.value;
const hitOf = (r: BattleResult, seq: number): BattleResult['hits'][number] => r.hits.find((h) => h.seq === seq)!;
const noteCountOf = (r: BattleResult): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const e of r.events) for (const n of e.note ?? []) c[n] = (c[n] ?? 0) + 1;
  return c;
};

describe('银狼1006（基础机制）', () => {
  it('A 战技/终招/缺陷/全抗降低/能量锚', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 424709.8301672087, 0.5);
    // 战技 t=93.46：单体 1.96×（hit 快照先于缺陷施加 → defense/resist 仍基线）
    const skill = evsOf(r, (e) => e.unitId === 'yinlang' && e.action === 'skill')[0];
    close(skill.time, 93.45794392523365, 0.01);
    expect(skill.note).toContain('swSkill');
    close(skill.energyAfter ?? 0, 110, 0.01);
    expect(skill.spAfter).toBe(1);
    close(baseOf(r, skill.hitSeqs![0]), 4900, 0.01);
    close(hitOf(r, skill.hitSeqs![0]).total, 2310, 0.01);
    // 终招同刻：3×3.8×（E1 无——终招后回能走 hook），note [swUlt, swBug]
    const ult = evsOf(r, (e) => e.unitId === 'yinlang' && e.kind === 'ult')[0];
    close(ult.time, 93.45794392523365, 0.01);
    expect(ult.note).toContain('swUlt');
    expect(ult.note).toContain('swBug');
    close(ult.energyAfter ?? 0, 5, 0.01);
    close(baseOf(r, ult.hitSeqs![0]), 9500, 0.01);
    close(hitOf(r, ult.hitSeqs![0]).total, 4478.571428571428, 0.01);
    close(hitOf(r, ult.hitSeqs![1]).total, 5060.785714285714, 0.01);
    // 普攻 t=186.92：缺陷降防+全抗-13% 已生效（defense 0.4762→0.6231、resist 1.13）
    const basic = evsOf(r, (e) => e.unitId === 'yinlang' && e.action === 'basic')[0];
    close(basic.time, 186.9158878504673, 0.01);
    close(basic.energyAfter ?? 0, 55, 0.01);
    close(baseOf(r, basic.hitSeqs![0]), 2500, 0.01);
    close(factorOf(r, basic.hitSeqs![0], 'defense'), 0.6230529595015576, 0.001);
    close(factorOf(r, basic.hitSeqs![0], 'resist'), 1.13, 0.001);
    close(hitOf(r, basic.hitSeqs![0]).total, 1742.5233644859811, 0.01);
    const nc = noteCountOf(r);
    expect(nc.swSkill).toBe(1);
    expect(nc.swUlt).toBe(1);
    expect(nc.swBug).toBe(5);
  });

  it('B 秘技（强制结束进程）', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 649733.2589989272, 0.5);
    const tech = evsOf(r, (e) => e.action === 'technique')[0];
    expect(tech.note).toContain('swTech');
    const nc = noteCountOf(r);
    expect(nc.technique).toBe(1);
    expect(nc.swTech).toBe(1);
    expect(nc.swBug).toBe(9);
  });

  it('C E2（进战受伤+20%、被攻击重植入缺陷）', () => {
    const r = run('C', () => mkCfg({}, 2));
    close(r.report.totalDamage, 577808.2418783187, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'yinlang' && e.action === 'skill')[0];
    close(factorOf(r, skill.hitSeqs![0], 'vuln'), 1.2, 0.001);
    expect(noteCountOf(r).swBug).toBe(39);
  });

  it('D E4+E6（终招附加段、每负面增伤）', () => {
    const r = run('D', () => mkCfg({}, 6));
    close(r.report.totalDamage, 656192.3579889208, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'yinlang' && e.action === 'skill')[0];
    close(baseOf(r, skill.hitSeqs![0]), 5390, 0.01);
    close(factorOf(r, skill.hitSeqs![0], 'damageBonus'), 1.4, 0.001);
    const ult = evsOf(r, (e) => e.unitId === 'yinlang' && e.kind === 'ult')[0];
    // E4 附加段 base=1500（0.6×atk）×damageBonus1.6（E6 每负面封顶）
    const extra = ult.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'yinlang.ultExtra')!;
    close(extra.factors.find((f) => f.key === 'base')!.value, 1500.0000000000002, 0.01);
    close(extra.factors.find((f) => f.key === 'damageBonus')!.value, 1.6, 0.001);
    close(extra.total, 1798.6373959121884, 0.01);
  });
});
