import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
} from '../src/index.js';

/** 专武23064「向浪花掷下盛夏」（浪行，水砂1513）接入回归测试。
 * 裁定（2026-10-09 question 原话）：①风口/潮流持续到下一次施放欢愉技（覆盖刷新）
 * ②首施无比较对象→潮流触发 ③单波开战=波次开始回1SP ④按光锥 id 激活、叠影经
 * lcParams 覆写；暴击率=面板词条不进引擎。全部锚点取自 2026-10-09 dump
 * （%TEMP%/临时目录/lc64-dump.txt，seed=20261009 单机复现）。 */

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

const ss = (refinement?: number): CombatMember => ({
  id: 'shuisha',
  eidolonLevel: 0,
  ...(refinement !== undefined ? { lightconeId: '23064', refinement } : {}),
  panel: mkPanel(),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const cfg = (members: CombatMember[], techniques = true): BattleConfig => ({
  members,
  monster: MON,
  techniques,
  rounds: 60,
  maxTime: 3000,
  seed: 20261009,
});

const runCache = new Map<string, BattleResult>();
const run = (key: string, c: BattleConfig): BattleResult => {
  let r = runCache.get(key);
  if (!r) {
    r = simulateBattle(c);
    runCache.set(key, r);
  }
  return r;
};
const runW = (): BattleResult => run('W', cfg([ss(1)])); // R1 装备·开秘技
const runX = (): BattleResult => run('X', cfg([ss()])); // 无光锥字段·对照
const runY = (): BattleResult => run('Y', cfg([ss(5)])); // R5 装备·开秘技
const runZ = (): BattleResult => run('Z', cfg([ss(1)], false)); // R1·无秘技
const runV = (): BattleResult => run('V', cfg([ss()], false)); // 无字段·无秘技

/** 水砂技能附带欢愉段（code=shuisha.skill）会先于举杯结算且不走专武钩子，
 * 潮流断言一律取 code=shuisha.elation 的段 */
const degreeAt = (r: BattleResult, time: number): number => {
  const h = r.hits.find(
    (x) =>
      Math.abs(x.time - time) < 0.05 &&
      x.skillCode === 'shuisha.elation' &&
      x.kind === 'elation',
  );
  if (!h) return Number.NaN;
  return h.factors.find((f) => f.key === 'elationDegree')?.value ?? Number.NaN;
};

const secondActionTime = (r: BattleResult): number => {
  const ts = r.events
    .filter((e) => e.kind === 'action' && e.unitId === 'shuisha' && e.time > 0)
    .map((e) => e.time);
  return ts[1] ?? Number.NaN;
};

const spAfterAt = (r: BattleResult, time: number, skillCode: string): number =>
  r.events.find((e) => Math.abs(e.time - time) < 0.05 && e.skillCode === skillCode)?.spAfter ??
  Number.NaN;

describe('专武23064 浪行（水砂）', () => {
  it('波次开始回1SP：开战 sp=4（无专武=3）', { timeout: 60_000 }, () => {
    // 开秘技：首事件=秘技不耗SP → spAfter 即开战初值
    expect(runW().events[0].spAfter).toBe(4);
    expect(runX().events[0].spAfter).toBe(3);
    // 无秘技：首动=战技耗1 → 隐含初值 4/3
    const zFirst = runZ().events.find((e) => e.kind === 'action' && e.unitId === 'shuisha');
    const vFirst = runV().events.find((e) => e.kind === 'action' && e.unitId === 'shuisha');
    expect(zFirst?.spAfter).toBe(3);
    expect(vFirst?.spAfter).toBe(2);
  });

  it('风口：施放欢愉技后速度 +24%（R1）/ +40%（R5）', { timeout: 60_000 }, () => {
    // 锚点：首次欢愉技在 t≈98.62 阿哈时刻参演（93.46 首动后 av 被风口缩至 169.83）；
    // 无专武对照=186.92（=2×93.46）；R5=161.69
    expect(secondActionTime(runW())).toBeCloseTo(169.83, 1);
    expect(secondActionTime(runX())).toBeCloseTo(186.92, 1);
    expect(secondActionTime(runY())).toBeCloseTo(161.69, 1);
  });

  it('潮流：首施触发、同技不刷新而掉、异技刷新（持续到下一次施放）', { timeout: 60_000 }, () => {
    // 首施 151320（阿哈时刻）：1+欢愉度0.1+潮流0.4=1.5；无专武=1.1
    expect(degreeAt(runW(), 98.62)).toBeCloseTo(1.5, 6);
    expect(degreeAt(runX(), 98.62)).toBeCloseTo(1.1, 6);
    // 举杯 151320 与上次同技 → 潮流掉（该时点无终招速度、point06=0 → 1.1）
    expect(degreeAt(runW(), 169.83)).toBeCloseTo(1.1, 6);
    // 阿哈时刻 All in 151321 异技 → 潮流回（2.12=1.1+0.4+point06 0.62[终招速×风口下实时速]）
    expect(degreeAt(runW(), 190.91)).toBeCloseTo(2.12, 5);
    // 再次 151320 同技 → 掉（1.72=1.1+point06 0.62，锚点 dump 实读勿推理改写）
    expect(degreeAt(runW(), 343.76)).toBeCloseTo(1.72, 5);
  });

  it('每施放3次欢愉技回1SP（举杯+阿哈时刻参演合计计数）', { timeout: 60_000 }, () => {
    const w = runW();
    // 第1次（阿哈时刻 151320）不回：4-1战技=3 → 3
    expect(spAfterAt(w, 98.62, 'aha.moment')).toBe(3);
    // 第2次（举杯 151320）不回：3-1战技=2 → 2
    expect(spAfterAt(w, 169.83, 'shuisha.elation')).toBe(2);
    // 第3次（阿哈时刻 All in）+1：2 → 3
    expect(spAfterAt(w, 190.91, 'aha.moment')).toBe(3);
  });

  it('叠影5：speedPct 0.4 / degreePct 1.0，SP 规则不变', { timeout: 60_000 }, () => {
    const y = runY();
    // 1+0.1+1.0+point06 0.39（R5 速149.8 下 point06 取整超速，锚点实读）
    expect(degreeAt(y, 98.62)).toBeCloseTo(2.49, 5);
    // 第3次欢愉技 +1：2 → 3（spEvery 恒 3 不随叠影变）
    expect(spAfterAt(y, 187.46, 'aha.moment')).toBe(3);
  });

  it('无光锥字段零回归：总伤与 shuisha 基线一致', { timeout: 60_000 }, () => {
    // = shuisha.test.ts runA 锚点 2118471.2（无 lightconeId → 专武全程不激活）
    expect(runX().report.totalDamage).toBeCloseTo(2118471.1808062755, 4);
  });
});
