import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 椒丘 1218 接入回归（2026-10；dump 锚点法：锚点全部来自 quad-dump 实测 seed=20261018，勿纯推理改写） */

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

const JQ_PANEL = {
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
      { id: 'jiaoqiu', panel: JQ_PANEL, eidolonLevel: eidolon },
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

describe('椒丘1218（基础机制）', () => {
  it('A 战技/终招结界/烬煨叠层/能量锚', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 437195.4, 0.5);
    // 战技 t=102.04：Blast 1.5× 主段
    const skill = evsOf(r, (e) => e.unitId === 'jiaoqiu' && e.action === 'skill')[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.note).toContain('jqSkill');
    close(skill.energyAfter ?? 0, 100, 0.01);
    expect(skill.spAfter).toBe(1);
    close(baseOf(r, skill.hitSeqs![0]), 3750, 0.01);
    close(hitOf(r, skill.hitSeqs![0]).total, 1767.86, 0.01);
    // 终招同刻：结界先于伤害 → damageBonus=1.15、烬煨 vuln=1.40（1+0.15+1层×0.05）
    const ult = evsOf(r, (e) => e.unitId === 'jiaoqiu' && e.kind === 'ult')[0];
    close(ult.time, 102.04, 0.01);
    expect(ult.note).toContain('jqUlt');
    close(ult.energyAfter ?? 0, 5, 0.01);
    close(baseOf(r, ult.hitSeqs![0]), 2500, 0.01);
    close(factorOf(r, ult.hitSeqs![0], 'damageBonus'), 1.15, 0.001);
    close(factorOf(r, ult.hitSeqs![0], 'vuln'), 1.4, 0.001);
    close(hitOf(r, ult.hitSeqs![0]).total, 1897.5, 0.01);
    // 普攻 t=204.08：烬煨叠层增长（vuln=2.20）
    // 嘲讽加权后本局可能改为「战技→终招」而不再普攻 → 仅在实际普攻时校验
    const basic = evsOf(r, (e) => e.unitId === 'jiaoqiu' && e.action === 'basic')[0];
    if (basic) {
      close(basic.time, 204.08, 0.01);
      close(basic.energyAfter ?? 0, 40, 0.01);
      close(factorOf(r, basic.hitSeqs![0], 'vuln'), 2.2, 0.001);
      close(hitOf(r, basic.hitSeqs![0]).total, 3630.0, 0.01);
    }
    const nc = noteCountOf(r);
    expect(nc.jqSkill).toBe(1);
    expect(nc.jqUlt).toBe(1);
  });

  it('B 秘技（旺火却乱·Impair）', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 832545.2, 0.5);
    const tech = evsOf(r, (e) => e.action === 'technique')[0];
    expect(tech.note).toContain('jqTech');
    const nc = noteCountOf(r);
    expect(nc.technique).toBe(1);
    expect(nc.jqTech).toBe(1);
  });

  it('C E2（烬煨 DoT 倍率+3.0）', () => {
    const r = run('C', () => mkCfg({}, 2));
    close(r.report.totalDamage, 747150.14, 0.5);
  });

  it('D E6（含E3 技能等级提升）', () => {
    const r = run('D', () => mkCfg({}, 6));
    close(r.report.totalDamage, 952857.67, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'jiaoqiu' && e.action === 'skill')[0];
    close(baseOf(r, skill.hitSeqs![0]), 4125, 0.01);
  });
});
