import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
} from '../src/index.js';

/** 水砂1513（砂金•戏浪）接入回归测试——全部锚点取自 2026-10-09 dump
 * （%TEMP%/opencode/shuisha-dump.txt 第4批，seed=20261009 单机复现）。
 * 钩子裁定：阿哈时刻事件含 source≠水砂 的伤害段才触发天赋/point07（2026-10-09 用户原话「有队友段才触发」）。 */

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

const ss = (eidolon: number): CombatMember => ({
  id: 'shuisha',
  eidolonLevel: eidolon,
  panel: mkPanel(),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const aha = (eidolon = 0): CombatMember => ({
  id: 'aha',
  eidolonLevel: eidolon,
  panel: mkPanel({ speed: 94, element: 'Fire', elementDmg: { Fire: 0.3 } }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const cfg = (members: CombatMember[], techniques = true): BattleConfig => ({
  members,
  monster: MON,
  techniques,
  rounds: 60,
  maxTime: 3000,
  seed: 20261009,
});

/** 每场景只跑一次（战斗 ~2s），跨用例复用 */
const runCache = new Map<string, BattleResult>();
const run = (key: string, c: BattleConfig): BattleResult => {
  let r = runCache.get(key);
  if (!r) {
    r = simulateBattle(c);
    runCache.set(key, r);
  }
  return r;
};
const runA = (): BattleResult => run('A', cfg([ss(0)]));
const runB = (): BattleResult => run('B', cfg([ss(6)]));
const runC = (): BattleResult => run('C', cfg([ss(0), aha(0)]));
const runD = (): BattleResult => run('D', cfg([ss(1)]));
const runE = (): BattleResult => run('E', cfg([ss(4)], false));
const runF = (): BattleResult => run('F', cfg([ss(0)], false));

const noteArr = (n: unknown): string[] =>
  Array.isArray(n) ? (n as string[]) : n ? [String(n)] : [];

const hasNote = (e: { note?: unknown }, k: string): boolean => noteArr(e.note).includes(k);

const factorOf = (h: { factors: { key: string; value: number }[] }, k: string): number =>
  h.factors.find((f) => f.key === k)?.value ?? Number.NaN;

describe('水砂1513接入', () => {
  it('秘技：全体100%一段 + 热意2 + 事件结构（裁定⑨入口）', () => {
    const r = runA();
    const tech = r.events[0];
    expect(tech.action).toBe('technique');
    expect(tech.unitId).toBe('shuisha');
    expect(tech.time).toBe(0);
    expect(tech.energyAfter).toBe(65); // 初始 65，秘技不回能
    expect(hasNote(tech, 'technique')).toBe(true);
    expect(hasNote(tech, 'shHeat@2')).toBe(true); // 热意 0→2
    expect(tech.hitSeqs?.length).toBe(3); // 三木桩各一段
    const h = r.hits[tech.hitSeqs![0]];
    expect(h.skillCode).toBe('shuisha.skill');
    expect(h.kind).toBe('direct');
    expect(factorOf(h, 'base')).toBeCloseTo(2000, 6); // 2000×1.0
    expect(factorOf(h, 'defense')).toBeCloseTo(0.4762, 4);
  });

  it('战技：AoE 240% + 4笑点 + 4热意 + 持好活天赋欢愉段（3014.04=7535.107×0.4）', () => {
    const r = runA();
    const skill = r.events.find((e) => e.action === 'skill' && e.unitId === 'shuisha')!;
    expect(skill.time).toBeCloseTo(93.46, 2); // 10000/107 无升格
    expect(skill.energyAfter).toBe(95); // 65+30（充能0）
    expect(hasNote(skill, 'shHeat@6')).toBe(true); // 秘技2 + 战技4
    expect(hasNote(skill, 'shTalentSkill')).toBe(true); // 好活>0 → 天赋附带段
    expect(skill.hitSeqs?.length).toBe(6); // 3 直伤 + 3 天赋欢愉段
    const hits = skill.hitSeqs!.map((s) => r.hits[s]);
    const direct = hits.filter((h) => h.kind === 'direct');
    const elation = hits.filter((h) => h.kind === 'elation');
    expect(direct.length).toBe(3);
    expect(elation.length).toBe(3);
    expect(factorOf(direct[0], 'base')).toBeCloseTo(4800, 6); // 2000×2.4（lv10）
    expect(factorOf(elation[0], 'base')).toBeCloseTo(3014.0428, 4);
    expect(factorOf(elation[0], 'elationDegree')).toBeCloseTo(1.1, 6); // 欢愉度节点 0.1
    expect(factorOf(elation[0], 'laugh')).toBeCloseTo(1.7143, 4); // x=好活40（进战20+秘技20）
  });

  it('举杯插队（裁定⑤⑥⑧）：战技达阈值10 → 同刻 toast 事件、固定笑点20、热意不消耗', () => {
    const r = runA();
    const skillIdx = r.events.findIndex(
      (e) => e.action === 'skill' && hasNote(e, 'shHeatToast'),
    );
    expect(skillIdx).toBeGreaterThanOrEqual(0);
    const skill = r.events[skillIdx];
    expect(hasNote(skill, 'shHeat@10')).toBe(true); // 6→10 跨阈值
    // 同刻紧随的 toast 插队事件（行动结算完后施放，裁定⑤）
    const toast = r.events[skillIdx + 1];
    expect(toast.action).toBe('toast');
    expect(toast.unitId).toBe('shuisha');
    expect(toast.skillCode).toBe('shuisha.elation');
    expect(toast.time).toBe(skill.time);
    expect(hasNote(toast, 'shToast')).toBe(true);
    expect(toast.hitSeqs?.length).toBe(13); // 举杯 151320：3 全体 + 10 随机单体
    // 固定计入笑点 20（裁定⑥）：笑点区 1+5×20/260=1.3846
    const aoe = r.hits[toast.hitSeqs![0]];
    expect(factorOf(aoe, 'base')).toBeCloseTo(4521.0642, 4); // 7535.107×0.6
    expect(factorOf(aoe, 'laugh')).toBeCloseTo(1.3846, 4);
    // 举杯不消耗热意（裁定⑧）→ 紧随终结技热意 10+8=18
    const ult = r.events[skillIdx + 2];
    expect(ult.kind).toBe('ult');
    expect(hasNote(ult, 'shHeat@18')).toBe(true);
    expect(hasNote(ult, 'shUlt')).toBe(true);
  });

  it('天赋③All in 一次一用：举杯后下次阿哈时刻欢愉技强化 + 消耗全部热意', () => {
    const r = runA();
    // 举杯@186.92 设 shAllInNext → 下一次阿哈时刻@196.62 用 151321 All in
    const am = r.events.find((e) => e.unitId === 'ahaMoment' && e.time > 190 && e.time < 200)!;
    expect(am.hitSeqs?.length).toBe(31); // 3 全体 + 10 随机 + 18 热意段
    // 热意被消耗清零 → 后续战技热意从 0 重新累计（4）
    const nextSkill = r.events.find(
      (e) => e.action === 'skill' && e.unitId === 'shuisha' && e.time > am.time,
    )!;
    expect(hasNote(nextSkill, 'shHeat@4')).toBe(true);
  });

  it('钩子裁定回归：单人队阿哈时刻事件不自触发（note 仅 [ahaMoment]）', () => {
    const r = runA();
    const moments = r.events.filter((e) => e.unitId === 'ahaMoment');
    expect(moments.length).toBeGreaterThan(3);
    for (const e of moments) {
      expect(noteArr(e.note)).toEqual(['ahaMoment']); // 无 shTalent/shTrace07/shHeat@N
    }
    // 非阿哈时刻的钩子仍正常（单人队无队友 → 不出现 shTalent）
    expect(r.events.some((e) => hasNote(e, 'shTalent'))).toBe(false);
    // F（无秘技）同规则
    const rF = runF();
    expect(rF.events.some((e) => hasNote(e, 'shTalent'))).toBe(false);
  });

  it('组队钩子：队友阿哈时刻段触发天赋+point07+升格（有队友段才触发）', () => {
    const r = runC();
    // 啊哈攻击类秘技事件（队友攻击）：热意 2+1天赋+1升格=4
    const ahaTech = r.events.find((e) => e.action === 'technique' && e.unitId === 'aha')!;
    expect(hasNote(ahaTech, 'shTalent')).toBe(true);
    expect(hasNote(ahaTech, 'shTrace07')).toBe(true);
    expect(hasNote(ahaTech, 'shSg')).toBe(true);
    expect(hasNote(ahaTech, 'shHeat@4')).toBe(true);
    // 阿哈时刻事件含队友段 → 触发一次（合并也只 +1）
    const moment = r.events.find((e) => e.unitId === 'ahaMoment')!;
    expect(hasNote(moment, 'shTalent')).toBe(true);
    expect(hasNote(moment, 'shTrace07')).toBe(true);
    expect(hasNote(moment, 'shSg')).toBe(true);
  });

  it('升格151329（欢愉队友仅阿哈）：全队速度+15% 常驻（81.27/92.51）', () => {
    const r = runC();
    const ssSkill = r.events.find((e) => e.action === 'skill' && e.unitId === 'shuisha')!;
    expect(ssSkill.time).toBeCloseTo(10000 / (107 * 1.15), 2); // ≈81.27
    const ahaSkill = r.events.find((e) => e.action === 'skill' && e.unitId === 'aha')!;
    expect(ahaSkill.time).toBeCloseTo(10000 / (94 * 1.15), 2); // ≈92.51
    // 对照单人无升格：首战技 = 10000/107 ≈ 93.46（runA 断言）
  });

  it('point08 同台加注：队友战技后全队暴伤+48% 3回合 + 水砂+2热意', () => {
    const r = runC();
    const ahaSkill = r.events.find((e) => e.action === 'skill' && e.unitId === 'aha')!;
    expect(hasNote(ahaSkill, 'shTrace08Hit')).toBe(true);
    expect(hasNote(ahaSkill, 'shHeat@14')).toBe(true); // …+2热意累计（含钩子+1/升格+1链）
    // buff 快照：水砂与啊哈双双挂 48% 暴伤、剩余 3 回合
    const snap = ahaSkill.buffs ?? {};
    const ssBuffs = (snap['shuisha'] ?? []).find((b) => b.labelKey === 'shTrace08');
    const ahaBuffs = (snap['aha'] ?? []).find((b) => b.labelKey === 'shTrace08');
    expect(ssBuffs?.value).toBeCloseTo(0.48, 6);
    expect(ssBuffs?.duration).toBe(3);
    expect(ahaBuffs?.value).toBeCloseTo(0.48, 6);
    expect(ahaBuffs?.duration).toBe(3);
    // 水砂自身 point08 常驻暴伤（进战初始化）
    expect(
      (r.events[0].buffs?.['shuisha'] ?? []).find((b) => b.labelKey === 'shTrace08')?.duration,
    ).toBe(-1);
  });

  it('星魂1：全属性抗穿+24%（resist=1.24 常驻）', () => {
    const rD = runD();
    const tech = rD.events[0];
    const h = rD.hits[tech.hitSeqs![0]];
    expect(factorOf(h, 'resist')).toBeCloseTo(1.24, 6);
    expect(
      (tech.buffs?.['shuisha'] ?? []).find((b) => b.labelKey === 'shE1')?.duration,
    ).toBe(-1);
    // E0 对照 resist=1（runA 秘技 hit，见秘技用例 defense 同断言处——此断言锁 E1 增量）
    const hA = runA().hits[runA().events[0].hitSeqs![0]];
    expect(factorOf(hA, 'resist')).toBeCloseTo(1, 6);
  });

  it('星魂4：战技→全队无视防御18% 3回合（本次战技自身段不吃，后续段吃 0.5258）', () => {
    const rE = runE();
    const skill = rE.events.find((e) => e.action === 'skill' && e.unitId === 'shuisha')!;
    expect(hasNote(skill, 'shE4')).toBe(true);
    const e4 = (skill.buffs?.['shuisha'] ?? []).find((b) => b.labelKey === 'shE4');
    expect(e4?.value).toBeCloseTo(0.18, 6);
    expect(e4?.duration).toBe(3);
    // 挂点在伤害结算后 → 本次战技直伤段仍 0.4762
    const own = rE.hits[skill.hitSeqs![0]];
    expect(factorOf(own, 'defense')).toBeCloseTo(0.4762, 4);
    // 后续阿哈时刻欢愉段吃无视防御：100/(100+110×0.82)=0.5258
    const moment = rE.events.find((e) => e.unitId === 'ahaMoment' && e.time > 90)!;
    const mh = rE.hits[moment.hitSeqs![0]];
    expect(factorOf(mh, 'defense')).toBeCloseTo(0.5258, 4);
    // E0 对照：战技无 shE4 note、base=4800
    const rF = runF();
    const fSkill = rF.events.find((e) => e.action === 'skill' && e.unitId === 'shuisha')!;
    expect(hasNote(fSkill, 'shE4')).toBe(false);
    expect(factorOf(rF.hits[fSkill.hitSeqs![0]], 'base')).toBeCloseTo(4800, 6);
    // E3 连带：E4 星魂等级含 E3 战技+2 → lv12 倍率 2.64 → 5280
    expect(factorOf(own, 'base')).toBeCloseTo(5280, 6);
  });

  it('星魂6：欢愉技 2 次后全为 All in；阿哈时刻外不消耗热意', () => {
    const r = runB();
    const toasts = r.events.filter((e) => e.action === 'toast');
    expect(toasts.length).toBeGreaterThanOrEqual(3);
    // 第1次举杯（施放计数=2 未过2）：3+10=13 段，E2 热意+4 → 10→14（E2 静默）
    expect(toasts[0].hitSeqs?.length).toBe(13);
    expect(hasNote(toasts[0], 'shHeat@14')).toBe(true);
    // 第2次（计数>2 → All in，时刻外 E6 不消耗热意）：3+10+26热意=39，E2 后 30
    expect(toasts[1].hitSeqs?.length).toBe(39);
    expect(hasNote(toasts[1], 'shHeat@30')).toBe(true);
    // 阿哈时刻内 All in 恒消耗热意：@196.56 事件 3+10+30=43 段
    const am = r.events.find((e) => e.unitId === 'ahaMoment' && e.time > 190 && e.time < 200)!;
    expect(am.hitSeqs?.length).toBe(43);
    // 第3次举杯（消耗后热意从 4 起）：3+10+4=17，E2 后 8
    expect(toasts[2].hitSeqs?.length).toBe(17);
    expect(hasNote(toasts[2], 'shHeat@8')).toBe(true);
  });
});
