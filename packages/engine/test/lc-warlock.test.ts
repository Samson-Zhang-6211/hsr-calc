import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
} from '../src/index.js';

/** 虚无命途 24 光锥接入回归测试（2026-10-15 批）。
 * 锚点取自 2026-10-15 dump（%TEMP%/opencode/lc-warlock-dump.txt，seed=20261009 可复现）。
 * 已确认裁定（勿再改）：21008/24003 无条件/半句走通用 damageBonus buff（外溢直伤=已知简化）；
 * 21001/21022 DoT 半句引擎无消费点（留口）；20011 减速留口；游丝不吃增伤；23059 进战一次；
 * 23050 队友=击破特攻最高；23047 DoT 层上限 p47[4]（已修，勿回退 p47[5]）；
 * 23024 泡影=命中挂怪 lcMark dur1，下一动才吃 per-target 增伤。 */

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 107,
  attack: 2000,
  hp: 3000,
  defence: 800,
  element: 'Quantum' as const,
  critRate: 0.5,
  critDmg: 1.0,
  elationDegree: 0,
  damageBonus: 0,
  breakEffect: 0,
  effectHit: 0,
  effectRes: 0,
  damageReduction: 0,
  energyRegen: 0,
  outgoingHealing: 0,
  elementDmg: { Quantum: 0.3 },
  ...over,
});

const MON: BattleConfig['monster'] = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 99999,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};
const MON_BREAK: BattleConfig['monster'] = { ...MON, maxToughness: 120 };
const MON_LOW: BattleConfig['monster'] = { ...MON, hp: 3000, maxToughness: 60 };

const mk = (
  id: CombatMember['id'],
  lc?: string,
  ref?: number,
  panelOver: Record<string, unknown> = {},
): CombatMember => ({
  id,
  eidolonLevel: 0,
  ...(lc ? { lightconeId: lc, ...(ref !== undefined ? { refinement: ref } : {}) } : {}),
  panel: mkPanel(panelOver),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const cfg = (
  members: CombatMember[],
  monster: BattleConfig['monster'] = MON,
): BattleConfig => ({
  members,
  monster,
  techniques: true,
  rounds: 80,
  maxTime: 4000,
  seed: 20261009,
});

const runCache = new Map<string, BattleResult>();
const run = (key: string, members: CombatMember[], monster?: BattleConfig['monster']): BattleResult => {
  let r = runCache.get(key);
  if (!r) {
    r = simulateBattle(cfg(members, monster));
    runCache.set(key, r);
  }
  return r;
};

type Case = { key: string; members: CombatMember[]; monster?: BattleConfig['monster'] };
const CASES: Case[] = [
  { key: 'base', members: [mk('trailblazer'), mk('jingyuan')] },
  { key: 'r20004', members: [mk('trailblazer', '20004'), mk('jingyuan')] },
  { key: 'r21041', members: [mk('trailblazer', '21041', undefined, { effectHit: 0.9 }), mk('jingyuan')] },
  { key: 'r23050', members: [mk('trailblazer', '23050'), mk('jingyuan')] },
  { key: 'r23059', members: [mk('trailblazer', '23059'), mk('jingyuan')] },
  { key: 'r24003', members: [mk('trailblazer', '24003'), mk('jingyuan')] },
  { key: 'r23006', members: [mk('trailblazer', '23006'), mk('jingyuan')] },
  { key: 'r21061', members: [mk('trailblazer', '21061'), mk('jingyuan')] },
  { key: 'r21008', members: [mk('trailblazer', '21008'), mk('jingyuan')] },
  { key: 'r21015', members: [mk('trailblazer', '21015'), mk('jingyuan')] },
  { key: 'r21029', members: [mk('trailblazer', '21029'), mk('jingyuan')] },
  { key: 'r20018', members: [mk('trailblazer', '20018'), mk('jingyuan')] },
  { key: 'r22000', members: [mk('trailblazer', '21015'), mk('jingyuan', '22000')] },
  { key: 'r23043', members: [mk('trailblazer', '23043', undefined, { speed: 175 }), mk('jingyuan')] },
  { key: 'r23029', members: [mk('trailblazer', '23029'), mk('jingyuan')] },
  { key: 'r23007', members: [mk('trailblazer', '23007'), mk('jingyuan')] },
  { key: 'r23047', members: [mk('trailblazer', '23047'), mk('jingyuan')] },
  { key: 'r21044', members: [mk('trailblazer', '21015'), mk('jingyuan', '21044')] },
  { key: 'r23004', members: [mk('trailblazer', '21015'), mk('jingyuan', '23004')] },
  { key: 'r23024', members: [mk('trailblazer', '23024'), mk('jingyuan')] },
  { key: 'r21022', members: [mk('trailblazer', '21022'), mk('jingyuan', '23006')] },
  { key: 'r23022', members: [mk('trailblazer', '23022'), mk('jingyuan', '23006')] },
  { key: 'r23035base', members: [mk('trailblazer', '99999'), mk('jingyuan')], monster: MON_BREAK },
  { key: 'r23035', members: [mk('trailblazer', '23035'), mk('jingyuan')], monster: MON_BREAK },
  { key: 'r23050break', members: [mk('trailblazer', '23050'), mk('jingyuan')], monster: MON_BREAK },
  { key: 'r24003kill', members: [mk('trailblazer', '24003'), mk('jingyuan')], monster: MON_LOW },
];



const get = (key: string): BattleResult => {
  const c = CASES.find((x) => x.key === key);
  if (!c) throw new Error(`unknown case ${key}`);
  return run(key, c.members, c.monster);
};

type HitF = { key: string; value?: number };
const hitAt = (
  r: BattleResult,
  time: number,
  kind: string,
  source: string,
  skillCode?: string,
): { factors: HitF[]; total: number; skillCode?: string } | undefined =>
  r.hits.find(
    (h) =>
      Math.abs(h.time - time) < 0.05 &&
      h.kind === kind &&
      h.source === source &&
      (skillCode === undefined || h.skillCode === skillCode),
  );
const factorOf = (
  r: BattleResult,
  time: number,
  kind: string,
  source: string,
  key: string,
  skillCode?: string,
): number =>
  hitAt(r, time, kind, source, skillCode)?.factors.find((f) => f.key === key)?.value ?? Number.NaN;

type BuffRow = {
  labelKey?: string;
  key?: string;
  value?: number;
  stacks?: number;
  duration?: number;
  source?: string;
};
const buffsOf = (r: BattleResult, label: string): BuffRow[] => {
  const out: BuffRow[] = [];
  for (const e of r.events) {
    for (const arr of Object.values(e.buffs ?? {})) {
      for (const b of Array.isArray(arr) ? arr : []) {
        if (b && typeof b === 'object' && 'labelKey' in b && (b as BuffRow).labelKey === label) {
          out.push(b as BuffRow);
        }
      }
    }
  }
  return out;
};

const firstEnergy = (r: BattleResult, id: string): number => {
  for (const e of r.events) {
    const ea = (e as { energyAfter?: number }).energyAfter;
    if (typeof ea === 'number' && e.unitId === id) return ea;
  }
  return Number.NaN;
};

const dotAt = (r: BattleResult, time: number): { total: number; factors: HitF[] } | undefined =>
  r.hits.find((h) => Math.abs(h.time - time) < 0.05 && h.kind === 'dot');

const breakDotAt = (
  r: BattleResult,
  time: number,
  target?: string,
): { total: number; factors: HitF[]; target?: string } | undefined =>
  r.hits.find(
    (h) =>
      Math.abs(h.time - time) < 0.05 &&
      h.kind === 'breakDot' &&
      (target === undefined || h.target === target),
  );

describe('虚无命途 24 光锥批（2026-10-15）—— 2026-10-29 命途规则改版', () => {
  // 用户裁定（2026-10-29）：**非对应命途角色装备光锥 → 光锥文案效果不生效，只有白值生效**。
  // 本文件原先拿「欢愉开拓者 / 景元（智识）」当虚无光锥的载体，属跨命途；规则生效后这些
  // 效果必须全部关闭。精确的同命途锚点待下一轮用虚无载体重建（见 docs/AGENTS-lightcones.md）。
  it('跨命途载体：光锥效果全部关闭，total 与同面板无光锥对照一致', { timeout: 600_000 }, () => {
    const base = get('base').report.totalDamage;
    const sameSetup = [
      'r20004', 'r21041', 'r23050', 'r23059', 'r24003', 'r23006', 'r21061', 'r21008', 'r21015',
      'r21029', 'r20018', 'r23029', 'r23007', 'r23047', 'r23024',
    ];
    for (const key of sameSetup) {
      expect(get(key).report.totalDamage, key).toBeCloseTo(base, 3);
    }
    // 景元戴任何非专武都会清掉 DEFAULT_GEAR（既有口径）→ 这类用例不比 total，
    // 只断言「光锥效果本身关闭」（见下一条 buff 断言：r23022/r21022/r21044/r23004/r22000）。
    expect(buffsOf(get('r23022'), 'lc23022').length).toBe(0);
    expect(buffsOf(get('r21044'), 'lc21044').length).toBe(0);
    expect(buffsOf(get('r23004'), 'lc23004').length).toBe(0);
    // 面板/木桩不同的对照：同样跨命途 → 与「同面板无光锥」一致
    const fastBase = run('r23043base', [mk('trailblazer', undefined, undefined, { speed: 175 }), mk('jingyuan')]);
    expect(get('r23043').report.totalDamage).toBeCloseTo(fastBase.report.totalDamage, 3);
    const lowBase = run('r24003lowBase', [mk('trailblazer'), mk('jingyuan')], MON_LOW);
    expect(get('r24003kill').report.totalDamage).toBeCloseTo(lowBase.report.totalDamage, 3);
    expect(get('r23035').report.totalDamage).toBeCloseTo(get('r23035base').report.totalDamage, 3);
    expect(get('r23050break').report.totalDamage).toBeCloseTo(get('r23035base').report.totalDamage, 3);
  });

  it('跨命途：光锥系 buff 一个都不挂', { timeout: 120_000 }, () => {
    const samples: Array<[string, string]> = [
      ['r20004', 'lc20004'],
      ['r23006', 'lc23006'],
      ['r21061', 'lc21061'],
      ['r23050', 'lc23050'],
      ['r23022', 'lc23022'],
      ['r24003', 'lc24003'],
    ];
    for (const [key, label] of samples) expect(buffsOf(get(key), label).length, key).toBe(0);
  });

  it('跨命途：进战回能 / 敌方减防易伤 / 附伤段 全部不生效', { timeout: 120_000 }, () => {
    expect(firstEnergy(get('r23059'), 'trailblazer')).toBeCloseTo(
      firstEnergy(get('base'), 'trailblazer'),
      6,
    );
    expect(factorOf(get('r21015'), 93.46, 'direct', 'jingyuan', 'defense')).toBeCloseTo(
      factorOf(get('base'), 93.46, 'direct', 'jingyuan', 'defense'),
      4,
    );
    expect(factorOf(get('r23029'), 93.46, 'direct', 'jingyuan', 'vuln')).toBeCloseTo(
      factorOf(get('base'), 93.46, 'direct', 'jingyuan', 'vuln'),
      4,
    );
    expect(hitAt(get('r21029'), 93.46, 'direct', 'trailblazer', 'lc21029')).toBeUndefined();
    expect(hitAt(get('r20018'), 280.37, 'direct', 'trailblazer', 'lc20018')).toBeUndefined();
    expect(dotAt(get('r23006'), 100.0)).toBeUndefined();
    expect(breakDotAt(get('r23035'), 800, 'monster1')?.total).toBeCloseTo(
      breakDotAt(get('r23035base'), 800, 'monster1')?.total ?? Number.NaN,
      3,
    );
  });
});
