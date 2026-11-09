import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 千冶•刃 1507 接入回归（2026-10；dump 锚点法：锚点全部来自 quad-dump 实测 seed=20261018，勿纯推理改写）
 *  近似落档：qyExtra=下一次自身行动强制战技（非立即追放）；point07 三项/E6受击充能/秘技伤害段未接。
 *  **2026-11-02 重锚**：point06 百炼骨真正接入（溢出能量池 80 / 终招后等量回充 / 战斗开始+结界解除
 *  能量不足 75% 补到 75% / 回满清自身负面），同时修正旧实现把 #1=75% 误当 **HP** 下限的问题 →
 *  千冶更脆、开大更频繁，四条 total 与 A/B/D 的 note 计数整体重锚（来源：`%TEMP%/临时目录/qy-anchor-dump.txt`）。 */

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

function panel(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    level: 80,
    hp: 3000,
    attack: 2500,
    defence: 800,
    speed: 107,
    critRate: 0.2,
    critDmg: 0.5,
    element: 'Fire' as const,
    energyRegen: 0,
    damageBonus: 0,
    breakEffect: 0,
    ...over,
  };
}

const JY_PANEL = {
  level: 80,
  hp: 15000,
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

function mkCfg(
  over: Partial<BattleConfig> = {},
  eidolon = 0,
  qyOver: Record<string, unknown> = {},
  jyHp = 15000,
): BattleConfig {
  return {
    members: [
      { id: 'qianye', panel: panel(qyOver) as never, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: { ...JY_PANEL, hp: jyHp } as never, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 6,
    maxTime: 450,
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

describe('千冶•刃1507（无量忿怒/结界/充能）', () => {
  it('A 基础（普攻 HP 倍率/开结界/忿怒战技）', () => {
    const r = run('A', () => mkCfg({ rounds: 6, maxTime: 450 }, 0, { hp: 20000 }));
    close(r.report.totalDamage, 966702.38, 0.5);
    // 普攻 t=93.46：0.7×maxHp（HP 输出）
    const basic = evsOf(r, (e) => e.unitId === 'qianye' && e.action === 'basic')[0];
    close(basic.time, 93.46, 0.01);
    close(baseOf(r, basic.hitSeqs![0]), 10000, 0.01);
    close(hitOf(r, basic.hitSeqs![0]).total, 4714.286, 0.01);
    // 终招 t=186.92：150703 开结界（Enhance 无伤害 hit）
    const ult = evsOf(r, (e) => e.unitId === 'qianye' && e.kind === 'ult')[0];
    close(ult.time, 186.92, 0.01);
    expect(ult.note).toContain('qyFury');
    expect(ult.note).toContain('qyUlt');
    // 忿怒战技 t=280.37：AoE3段+随机4段=7 hits
    const skill = evsOf(r, (e) => e.unitId === 'qianye' && e.action === 'skill')[0];
    close(skill.time, 280.37, 0.01);
    expect(skill.note).toContain('qySkill');
    expect(skill.hitSeqs).toHaveLength(7);
    const nc = noteCountOf(r);
    expect(nc.qyFury).toBe(2);
    expect(nc.qyUlt).toBe(2);
    expect(nc.qySkill).toBe(1);
    // point06：本场各触发一次（终招后溢出回充 / 结界解除 75% 补能 / 回满清负面）
    expect(nc.qyP06Restore).toBe(1);
    expect(nc.qyP06Floor).toBe(1);
    expect(nc.qyP06Cleanse).toBe(1);
  });

  it('B 长局（充能满→天赋额外战技、150714 新终招）', () => {
    const r = run('B', () =>
      mkCfg({ rounds: 14, maxTime: 1100 }, 0, { hp: 20000, energyRegen: 1 }),
    );
    close(r.report.totalDamage, 3801174.0, 0.5);
    const nc = noteCountOf(r);
    expect(nc.qyFury).toBe(7);
    expect(nc.qyUlt).toBe(9);
    expect(nc.qySkill).toBe(3);
    expect(nc.qyCharge).toBe(2);
    expect(nc.qyExtra).toBe(2);
    // 150714：fury 中终招、3×maxHp 全体（damageBonus=1+0.5 point08+0.75 self ult）
    const ultNew = evsOf(
      r,
      (e) =>
        e.unitId === 'qianye' &&
        e.kind === 'ult' &&
        (e.hitSeqs ?? []).some((s) => hitOf(r, s).skillCode === 'qianye.ultNew'),
    )[0];
    expect(ultNew.note).toContain('qyUlt');
    const s0 = ultNew.hitSeqs![0];
    close(baseOf(r, s0), 70000, 0.01);
    close(factorOf(r, s0, 'damageBonus'), 2.25, 0.001);
    close(factorOf(r, s0, 'crit'), 1.44, 0.001);
    close(factorOf(r, s0, 'vuln'), 1.5, 0.001);
    close(hitOf(r, s0).total, 172983.05, 0.01);
    // 天赋额外战技（视为追加）skillCode=qianye.skillExtra
    const extra = evsOf(
      r,
      (e) =>
        e.unitId === 'qianye' &&
        e.action === 'skill' &&
        (e.note ?? []).includes('qyExtra'),
    )[0];
    expect(hitOf(r, extra.hitSeqs![0]).skillCode).toBe('qianye.skillExtra');
  });

  it('C 低血免死（无量忿怒中致命→回50%解结界）', () => {
    const r = run('C', () => mkCfg({ rounds: 6, maxTime: 450 }, 0, { hp: 3000 }));
    close(r.report.totalDamage, 752789.99, 0.5);
    expect(noteCountOf(r).qyRevive).toBe(1);
    const rev = evsOf(r, (e) => (e.note ?? []).includes('qyRevive'))[0];
    // note 经 pending flush 到下一事件（免死发生在 t=200 怪事件、note 落随后行动事件）
    close(rev.time, 200, 0.01);
  });

  it('D E6（充能上限7、150714 倍率×1.5）', () => {
    const r = run('D', () =>
      mkCfg({ rounds: 14, maxTime: 1100 }, 6, { hp: 20000, energyRegen: 1 }),
    );
    close(r.report.totalDamage, 8538820.94, 0.5);
    const nc = noteCountOf(r);
    expect(nc.qyCharge).toBe(4);
    expect(nc.qyExtra).toBe(2);
    expect(nc.qyUlt).toBe(10);
  });
});
