import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 桂乃芬 1210 接入回归（2026-10-20；dump 锚点法：锚点全部来自 lgs-dump 实测 seed=20261018，勿纯推理改写） */

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

const GN_PANEL = {
  level: 80,
  hp: 30000,
  attack: 2500,
  defence: 800,
  speed: 106,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Fire' as const,
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
      { id: 'guinaifen', panel: GN_PANEL, eidolonLevel: eidolon },
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

describe('桂乃芬1210（基础机制）', () => {
  it('A 战技灼烧+点燃引信（gnTom）+ 终结技灼烧引爆 + DoT 跳伤', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 386373.12, 0.5);
    // 战技 t=70.75：主 1.2× + 相邻 0.4×；灼烧即挂（3× gnBurn）
    const skill = evsOf(r, (e) => e.unitId === 'guinaifen' && e.action === 'skill')[0];
    close(skill.time, 70.75, 0.01);
    expect(skill.note).toEqual(expect.arrayContaining(['gnSkill']));
    expect(skill.note!.filter((n) => n === 'gnBurn')).toHaveLength(3);
    close(skill.energyAfter ?? 0, 90, 0.01);
    expect(skill.spAfter).toBe(2);
    for (const s of skill.hitSeqs!) {
      const h = hitOf(r, s);
      if (h.skillCode !== 'guinaifen.skill') continue;
      close(baseOf(r, h.seq), h.target === 'monster2' ? 3000 : 1000, 0.01);
    }
    close(hitOf(r, 0).total, 1414.29, 0.01);
    close(hitOf(r, 1).total, 471.43, 0.01);
    // DoT 灼烧跳伤 t=100：base=5455.2（atk×2.18208）、vuln=1 无 gnTom
    const tick = hitOf(r, 6);
    expect(tick.skillCode).toBe('skilldot.burn');
    close(baseOf(r, tick.seq), 5455.2, 0.01);
    close(tick.total, 2597.71, 0.01);
    // 普攻 t=165.09 + 终结技同刻：AoE 1.2× + 全体灼烧独立0.92
    const ult = evsOf(r, (e) => e.unitId === 'guinaifen' && e.kind === 'ult')[0];
    expect(ult.note).toContain('gnUlt');
close(baseOf(r, 30), 2500, 0.01);
    close(hitOf(r, 30).total, 1261.07, 0.01);
    for (const s of [31, 32, 33]) {
      close(baseOf(r, s), 3000, 0.01);
      close(hitOf(r, s).total, 1815.94, 0.01);
    }
    for (const s of [34, 35, 36]) {
      expect(hitOf(r, s).skillCode).toBe('guinaifen.ult.burn');
      close(baseOf(r, s), 5455.2, 0.01);
      close(hitOf(r, s).total, 2557.19, 0.01);
    }
    // 点燃引信（gnTom）→ t=200 灼烧 vuln=1.07（1 层 0.07）
    const tick2 = hitOf(r, 37);
    close(tick2.total, 2779.55, 0.01);
    // t=300 二层以上
    const tick3 = hitOf(r, 77);
    close(tick3.total, 3325.07, 0.01);
    // 二次普攻 t=259.43 也吃 vuln 提高后的目标基础（0.7 vuln）
close(baseOf(r, 73), 2500, 0.01);
    close(hitOf(r, 73).total, 1508.57, 0.01);
  });

  it('B 秘技先发制人：0.5×单体 + 立即灼烧', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 496452.52, 0.5);
    const tech = evsOf(r, (e) => e.unitId === 'guinaifen' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toEqual(expect.arrayContaining(['technique', 'gnTech']));
    expect(tech.note!.filter((n) => n === 'gnTech')).toHaveLength(2);
    close(tech.energyAfter ?? 0, 60, 0.01);
    expect(tech.spAfter).toBe(3);
close(baseOf(r, 0), 1250, 0.01);
    close(hitOf(r, 0).total, 589.29, 0.01);
    // 战技 t=70.75：吃 gnTom vuln +1 层 → 主段 total=1513.2857
    const skill = evsOf(r, (e) => e.unitId === 'guinaifen' && e.action === 'skill')[0];
    close(skill.energyAfter ?? 0, 90, 0.01);
    close(hitOf(r, 1).total, 1513.29, 0.01);
    // 终结技主目标 seq48 total=2172.3428571（gnTom 正后（1层）目标 vuln 0.07 生效）
    close(hitOf(r, 48).total, 1852.94, 0.01);
    // 终结技灼烧 m2 total=3059.0683（vuln=1.19 自身倍率提高）
    close(hitOf(r, 51).total, 1852.94, 0.01);
  });

  it('C E2 叶适伤叠层漂移（total 锚）+ D E4 lv12 base=3300', () => {
    close(run('C', () => mkCfg({}, 2)).report.totalDamage, 397224.5, 0.5);
    const d = run('D', () => mkCfg({}, 4));
    close(d.report.totalDamage, 401535.79, 0.5);
    const skill = evsOf(d, (e) => e.unitId === 'guinaifen' && e.action === 'skill')[0];
    close(baseOf(d, skill.hitSeqs![0]), 3300, 0.01);
  });

  it('E E6 叠层数量提升 cap 3→4（total 锚）', () => {
    close(run('E', () => mkCfg({}, 6)).report.totalDamage, 407250.23, 0.5);
  });

  it('F E2 叶适伤叠层破韧（点火门 sticky）', () => {
    const r = run('F', () => mkCfg({ monster: { ...MON, maxToughness: 60 } }));
    close(r.report.totalDamage, 474868.2912505293, 0.5);
    // t=70.75 主段+相邻段均挂 gnTom vuln 0.07 × 1 层
    close(hitOf(r, 0).total, 1414.29, 0.01);
    close(hitOf(r, 2).total, 471.43, 0.01);
    // 三怪灼烧跳伤 t=100：3 段各 2597.71（vuln=1 无 gnTom 第一回合点燃）
    for (const s of [10, 12, 14]) close(hitOf(r, s).total, 2597.71, 0.01);
  });

  it('G E6 + 破韧（total 锚；E6 点燃引信 faster cap）', () => {
    close(run('G', () => mkCfg({ monster: { ...MON, maxToughness: 60 } }, 6)).report.totalDamage, 496697.7986791439, 0.5);
  });
});
