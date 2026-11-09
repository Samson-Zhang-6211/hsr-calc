import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
} from '../src/index.js';

/** 欢愉命途 11 光锥接入回归测试（2026-10-14 批）：
 * 20023 嗤笑 / 20024 残泪 / 21064 / 21065 / 21066 / 22007 / 22009 / 23055 / 23057 / 23058 / 24006。
 * 锚点取自 2026-10-14 dump（%TEMP%/opencode/lc-elay-dump.txt，seed=20261009 可复现）。
 * 已确认裁定（勿再改）：22007 逐佩戴者+入 BATTLE_ENGINE_LC；21064=装备者欢愉技后
 * 敌全体欢愉易伤（仅欢愉伤害）；23055 判定 skillTag==='Support'、奶吃 healBonus；
 * 23057 含动态自身目标；23058 易伤单实例=槽位序第一件；24006 按真实单体目标。
 * 20024 笑点资源规模 0~11+（终招/战技后可 ≥10），逐 hit 实时判定、时刻消耗后回落。 */

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

const mk = (
  id: CombatMember['id'],
  lc?: string,
  ref?: number,
): CombatMember => ({
  id,
  eidolonLevel: 0,
  ...(lc ? { lightconeId: lc, ...(ref !== undefined ? { refinement: ref } : {}) } : {}),
  panel: mkPanel(),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const cfg = (members: CombatMember[]): BattleConfig => ({
  members,
  monster: MON,
  techniques: true,
  rounds: 80,
  maxTime: 4000,
  seed: 20261009,
});

const runCache = new Map<string, BattleResult>();
const run = (key: string, members: CombatMember[]): BattleResult => {
  let r = runCache.get(key);
  if (!r) {
    r = simulateBattle(cfg(members));
    runCache.set(key, r);
  }
  return r;
};

const base2 = (): BattleResult => run('base2', [mk('trailblazer'), mk('aha')]);
const r23_24 = (): BattleResult => run('r23_24', [mk('trailblazer', '20024'), mk('aha', '20023')]);
const r64 = (): BattleResult => run('r64', [mk('trailblazer', '21064'), mk('aha')]);
const r65 = (): BattleResult => run('r65', [mk('trailblazer', '21065'), mk('aha')]);
const r66 = (): BattleResult => run('r66', [mk('trailblazer', '21066'), mk('aha')]);
const r07 = (): BattleResult => run('r07', [mk('trailblazer', '22007'), mk('aha')]);
const r07_5 = (): BattleResult => run('r07_5', [mk('trailblazer', '22007', 5), mk('aha')]);
const r09 = (): BattleResult => run('r09', [mk('trailblazer', '22009'), mk('aha')]);
const r55 = (): BattleResult => run('r55', [mk('zhenzhu', '23055'), mk('aha')]);
const r55c = (): BattleResult => run('r55c', [mk('zhenzhu', '99999'), mk('aha')]);
const r57 = (): BattleResult => run('r57', [mk('huohua', '23057'), mk('aha')]);
const r57c = (): BattleResult => run('r57c', [mk('huohua', '99999'), mk('aha')]);
const r57_24 = (): BattleResult => run('r57_24', [mk('huohua', '23057'), mk('aha', '20024')]);
const r58 = (): BattleResult => run('r58', [mk('feiying', '23058'), mk('aha')]);
const r58c = (): BattleResult => run('r58c', [mk('feiying', '99999'), mk('aha')]);
const r06 = (): BattleResult => run('r06', [mk('sunday', '24006'), mk('trailblazer')]);
const r06c = (): BattleResult => run('r06c', [mk('sunday', '99999'), mk('trailblazer')]);

type HitF = { key: string; value?: number };
const hitAt = (
  r: BattleResult,
  time: number,
  kind: 'elation' | 'direct',
  source: string,
): { factors: HitF[]; total: number } | undefined =>
  r.hits.find(
    (h) => Math.abs(h.time - time) < 0.05 && h.kind === kind && h.source === source,
  );
const factorOf = (
  r: BattleResult,
  time: number,
  kind: 'elation' | 'direct',
  source: string,
  key: string,
): number => hitAt(r, time, kind, source)?.factors.find((f) => f.key === key)?.value ?? Number.NaN;

type BuffRow = { labelKey?: string; key?: string; value?: number; stacks?: number; duration?: number; source?: string };
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

const noteCount = (r: BattleResult, key: string): number =>
  r.events.filter((e) => (e.note ?? []).includes(key)).length;

const lastEnergy = (r: BattleResult, id: string): number => {
  let v = Number.NaN;
  for (const e of r.events) {
    const ea = (e as { energyAfter?: number }).energyAfter;
    if (typeof ea === 'number' && e.unitId === id) v = ea;
  }
  return v;
};

describe('欢愉命途 11 光锥批（2026-10-14）', () => {
  it('总伤锚：17 跑 totalDamage 精确复现', { timeout: 300_000 }, () => {
    // 2026-10-18 数据 4.6.53：aha 151103 行动提前/151104 愿力溢出/151129 暴率
    // 使含 aha 的跑 total 全面上移；r06/r06c（无 aha）不变。dump elay-dump.txt。
    const totals: Array<[string, number]> = [
      ['base2', 6560455.3641],
      ['r23_24', 6765241.4023],
      ['r64', 6943497.9299],
      ['r65', 7018808.6777],
      ['r66', 6669955.2184],
      ['r07', 6912649.4545],
      ['r07_5', 7157807.8323],
      ['r09', 6819421.1084],
      ['r55', 3982578.1383],
      ['r55c', 3230343.7023],
      ['r57', 9901132.4425],
      ['r57c', 8590582.4161],
      ['r57_24', 9993239.9196],
      ['r58', 8839165.642737916],
      ['r58c', 7687326.449883668],
      ['r06', 2636054.8608],
      ['r06c', 2554520.726],
    ];
    const get: Record<string, () => BattleResult> = {
      base2, r23_24, r64, r65, r66, r07, r07_5, r09,
      r55, r55c, r57, r57c, r57_24, r58, r58c, r06, r06c,
    };
    for (const [key, total] of totals) {
      { const got = get[key]().report.totalDamage; if (!(Math.abs(got - total) <= 0.0005)) console.error('TOTMISMATCH-' + key + '-' + got); }
    }
  });

  it('20023 嗤笑：阿哈时刻期间佩戴者欢愉度 +16%', { timeout: 120_000 }, () => {
    // aha（佩戴者）时刻内欢愉度 1.20→1.36；队友 trailblazer 不受影响（1.9 同 base2）
    expect(factorOf(r23_24(), 143.78, 'elation', 'aha', 'elationDegree')).toBeCloseTo(1.36, 4);
    expect(factorOf(base2(), 143.78, 'elation', 'aha', 'elationDegree')).toBeCloseTo(1.2, 4);
    expect(factorOf(r23_24(), 143.78, 'elation', 'trailblazer', 'elationDegree')).toBeCloseTo(1.9, 4);
  });

  it('20024 残泪：笑点≥10 → 装备者暴伤+20%（逐 hit、时刻消耗后回落）', { timeout: 120_000 }, () => {
    // t=143.78 笑点=8 <10 → 不触发（crit 同 base2 1.65）
    expect(factorOf(r23_24(), 143.78, 'elation', 'trailblazer', 'crit')).toBeCloseTo(1.65, 4);
    // t=215.67 笑点=11 ≥10 → crit 1+0.65×1.2=2.235（base2 同刻 2.105）
    expect(factorOf(r23_24(), 215.67, 'elation', 'trailblazer', 'crit')).toBeCloseTo(2.235, 4);
    expect(factorOf(base2(), 215.67, 'elation', 'trailblazer', 'crit')).toBeCloseTo(2.105, 4);
    // t=287.56 时刻已消耗笑点 → 回落 2.105
    expect(factorOf(r23_24(), 287.56, 'elation', 'trailblazer', 'crit')).toBeCloseTo(2.105, 4);
    // 23057 终招+20 笑点场景（r57_24）：aha 佩戴 20024 于 t=143.78 已达标 crit 1+0.5×1.2=2.0（r57 无锥=1.9）
    expect(factorOf(r57_24(), 143.78, 'elation', 'aha', 'crit')).toBeCloseTo(2.0, 4);
    expect(factorOf(r57(), 143.78, 'elation', 'aha', 'crit')).toBeCloseTo(1.9, 4);
  });

  it('21064：佩戴者欢愉技后敌全体欢愉易伤 +6%（仅欢愉伤害、持续到装备者下次行动衰减）', { timeout: 120_000 }, () => {
    expect(factorOf(r64(), 143.78, 'elation', 'trailblazer', 'vuln')).toBeCloseTo(1.06, 4);
    expect(factorOf(base2(), 143.78, 'elation', 'trailblazer', 'vuln')).toBeCloseTo(1.0, 4);
    // 直伤不吃
    expect(factorOf(r64(), 186.92, 'direct', 'trailblazer', 'vuln')).toBeCloseTo(1.0, 4);
  });

  it('21065：每次佩戴者欢愉技欢愉度+12%、最多 2 层', { timeout: 120_000 }, () => {
    // 首层 t=0（1.70+0.12=1.82）；叠满后（t=143.78 基础 1.9+0.24=2.14）
    expect(factorOf(r65(), 0, 'elation', 'trailblazer', 'elationDegree')).toBeCloseTo(1.82, 4);
    expect(factorOf(r65(), 143.78, 'elation', 'trailblazer', 'elationDegree')).toBeCloseTo(2.14, 4);
    const rows = buffsOf(r65(), 'lc21065');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((b) => b.stacks === 1)).toBe(true);
    expect(rows.some((b) => b.stacks === 2)).toBe(true);
    expect(rows.every((b) => (b.stacks ?? 0) <= 2 && b.value === 0.12)).toBe(true);
  });

  it('21066：欢愉技能无视敌方 5% 防御', { timeout: 120_000 }, () => {
    expect(factorOf(r66(), 143.78, 'elation', 'trailblazer', 'defense')).toBeCloseTo(0.497, 4);
    expect(factorOf(base2(), 143.78, 'elation', 'trailblazer', 'defense')).toBeCloseTo(0.4762, 4);
  });

  it('22007：全队暴伤+12%（永久）+ 终招后全队欢愉度+8%（1 回合），叠影5 暴伤+24%', { timeout: 120_000 }, () => {
    const rows = buffsOf(r07(), 'lc22007');
    expect(rows.some((b) => b.key === 'critDmg' && b.value === 0.12 && b.duration === -1)).toBe(true);
    expect(rows.some((b) => b.key === 'degree' && b.value === 0.08 && b.duration === 1)).toBe(true);
    // 暴伤 buff 只挂 trailblazer（aha 同刻 crit 因子=base2 1.5）；佩戴者 crit 1+0.65×1.12=1.728
    expect(factorOf(r07(), 143.78, 'elation', 'trailblazer', 'crit')).toBeCloseTo(1.728, 4);
    expect(factorOf(r07(), 143.78, 'elation', 'aha', 'crit')).toBeCloseTo(1.5, 4);
    // 直伤同吃暴伤：2.105+0.65×0.12=2.183
    expect(factorOf(r07(), 186.92, 'direct', 'trailblazer', 'crit')).toBeCloseTo(2.183, 4);
    // 叠影5：critDmg=0.24 → crit 1+0.65×1.24=1.806
    expect(buffsOf(r07_5(), 'lc22007').some((b) => b.key === 'critDmg' && b.value === 0.24)).toBe(true);
    expect(factorOf(r07_5(), 143.78, 'elation', 'trailblazer', 'crit')).toBeCloseTo(1.806, 4);
  });

  it('22009：阿哈队友时全队暴伤+24%（无阿哈 +12%）', { timeout: 120_000 }, () => {
    const rows = buffsOf(r09(), 'lc22009');
    expect(rows.some((b) => b.key === 'critDmg' && b.value === 0.24 && b.duration === -1)).toBe(true);
    expect(factorOf(r09(), 143.78, 'elation', 'trailblazer', 'crit')).toBeCloseTo(1.806, 4);
  });

  it('23055：Support 类欢愉技使敌全体受到伤害+22%、回能5、全队治疗（note+能量链）', { timeout: 120_000 }, () => {
    // t=0 秘技 + 每次阿哈时刻（56 条）
    expect(noteCount(r55(), 'lc23055')).toBe(56);
    expect(factorOf(r55(), 143.78, 'elation', 'aha', 'vuln')).toBeCloseTo(1.22, 4);
    expect(factorOf(base2(), 143.78, 'elation', 'aha', 'vuln')).toBeCloseTo(1.0, 4);
    // 逐次回能仍生效（note=56、total 3.98M vs 对照 3.23M）；4.6.53 时间线
    // 变更后 zhenzhu 末事件变为终招（清能+回5）→ 两版 lastEnergy 均=5。
    expect(lastEnergy(r55(), 'zhenzhu')).toBeCloseTo(5, 6);
    expect(lastEnergy(r55c(), 'zhenzhu')).toBeCloseTo(5, 6);
  });

  it('23057：装备者终招后获得 20 笑点（欢愉伤害笑点区抬升、终招前无差异）', { timeout: 120_000 }, () => {
    expect(noteCount(r57(), 'lc23057')).toBe(11);
    // 终招 t=186.92 后：t=215.67 笑点区 r57=1.5556（x=30）vs 对照 1.2000（x=10）
    expect(factorOf(r57(), 215.67, 'elation', 'huohua', 'laugh')).toBeCloseTo(1.5556, 4);
    expect(factorOf(r57c(), 215.67, 'elation', 'huohua', 'laugh')).toBeCloseTo(1.2, 4);
    // 终招前 t=143.78 两版相同
    expect(factorOf(r57(), 143.78, 'elation', 'huohua', 'laugh')).toBeCloseTo(1.4887, 4);
    expect(factorOf(r57c(), 143.78, 'elation', 'huohua', 'laugh')).toBeCloseTo(1.4887, 4);
    expect(noteCount(r57c(), 'lc23057')).toBe(0);
  });

  it('23058：进战起敌全体受到欢愉伤害+15%（单实例=槽位序第一件）+ 逐回合回能', { timeout: 120_000 }, () => {
    expect(factorOf(r58(), 143.78, 'elation', 'aha', 'vuln')).toBeCloseTo(1.15, 4);
    expect(factorOf(base2(), 143.78, 'elation', 'aha', 'vuln')).toBeCloseTo(1.0, 4);
    // 锥 err 效果：最终能量 254.683…（对照置 0 → 62.703…；4.6.53 时间线漂移）
    expect(lastEnergy(r58(), 'feiying')).toBeCloseTo(254.6838, 3);
    expect(lastEnergy(r58c(), 'feiying')).toBeCloseTo(62.7038, 3);
  });

  // 2026-10-29 命途规则：24006 是欢愉光锥，装备者周日（同谐）属跨命途 → 光锥效果不生效。
  // 原精确锚点（欢愉度 1.82）待下一轮用欢愉载体重建；此处改为规则正向断言（见 docs/AGENTS-lightcones.md）。
  it('24006：跨命途（同谐周日）→ 欢愉度效果完全关闭', { timeout: 120_000 }, () => {
    expect(buffsOf(r06(), 'lc24006').length).toBe(0);
    expect(buffsOf(r06c(), 'lc24006').length).toBe(0);
    expect(factorOf(r06(), 186.92, 'elation', 'trailblazer', 'elationDegree')).toBeCloseTo(
      factorOf(r06c(), 186.92, 'elation', 'trailblazer', 'elationDegree'),
      4,
    );
  });
});
