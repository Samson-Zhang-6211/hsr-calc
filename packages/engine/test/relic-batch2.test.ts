import type { Element } from '@hsr-calc/shared';
import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BuffSnapshot,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
  type PolicyFn,
} from '../src/index.js';

// 遗器套装批2（109/110/111/112/114/117 四件套，2026-10 批2裁定）。
// 锚点全部由 relic-batch2-dump.test.ts 实跑定锚（%TEMP%/临时目录/relic-batch2-dump.txt），勿凭推理改数。
// 关键口径：HitLog 的 crit 因子 = 1+critRate×critDmg（期望值暴击、非随机掷骰），
// 因此暴率/暴伤改动=确定性 crit 因子差值（112: +0.5×0.10=0.05；117: +0.04×0.5=0.02，
// ≥2负面 tier 后 +0.08×2 暴伤 → 总差 0.0824=0.39×0.66−0.35×0.5）。

const ALL_ELEMENTS: Element[] = [
  'Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary',
];

function panel(element: Element, speed: number): MemberPanel {
  return {
    element, level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed, energyRegen: 0,
  };
}
function monster(): MonsterConfig {
  return {
    level: 90, hp: 1e9, resistance: {}, weaknesses: ALL_ELEMENTS,
    maxToughness: 9999, speed: 100, enemyClass: 'elite',
  };
}
const monsterBreakable = (): MonsterConfig => ({ ...monster(), maxToughness: 30 });

const jy = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'jingyuan', panel: panel('Thunder', 135), ...extra,
});
const th = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'tenghuang', panel: panel('Physical', 134), ...extra,
});
const su = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'sunday', panel: panel('Imaginary', 135), ...extra,
});
const fy = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'feiying', panel: panel('Physical', 135), ...extra,
});

function run(
  members: CombatMember[],
  opts: { maxTime?: number; monster?: MonsterConfig; policy?: PolicyFn } = {},
) {
  const cfg: BattleConfig = {
    members,
    monster: opts.monster ?? monster(),
    rounds: 10,
    maxTime: opts.maxTime ?? 600,
    techniques: false,
    policy: opts.policy,
  };
  return simulateBattle(cfg);
}
const basicOnly: PolicyFn = () => 'basic';
const skillOnly: PolicyFn = () => 'skill';

type R = ReturnType<typeof simulateBattle>;

function actionTimes(r: R, uid: string): number[] {
  return r.events
    .filter((e) => e.kind === 'action' && e.unitId === uid)
    .map((e) => e.time);
}
function firstUltTime(r: R, uid: string): number | undefined {
  return r.events.find((e) => e.kind === 'ult' && e.unitId === uid)?.time;
}
/** 时刻 t 的 buff 快照（同刻可能有多事件——动作与终招先后；返回首个含该 label 的，找不到=该时刻确无） */
function buffAt(r: R, uid: string, label: string, t: number): BuffSnapshot | undefined {
  return r.events
    .filter((e) => Math.abs(e.time - t) < 1e-6)
    .map((e) => e.buffs?.[uid]?.find((b) => b.labelKey === label))
    .find((b) => b !== undefined);
}
function hasBuffLabel(r: R, uid: string, label: string): boolean {
  return r.events.some((e) => e.buffs?.[uid]?.some((b) => b.labelKey === label));
}
function critOf(h: R['hits'][number] | undefined): number | null {
  return h?.factors.find((f) => f.key === 'crit')?.value ?? null;
}
/** 逐 hit crit 因子差异（base→set）；无 crit 因子（如击破）的 hit 自动跳过 */
function critDiffs(b: R, s: R): { seq: number; time: number; d: number }[] {
  const out: { seq: number; time: number; d: number }[] = [];
  for (let i = 0; i < Math.min(b.hits.length, s.hits.length); i++) {
    const cb = critOf(b.hits[i]);
    const cs = critOf(s.hits[i]);
    if (cb === null && cs === null) continue;
    if (cb === cs) continue;
    out.push({ seq: s.hits[i].seq, time: s.hits[i].time, d: (cs ?? 0) - (cb ?? 0) });
  }
  return out;
}
function energyChain(r: R, uid: string): number[] {
  return r.events
    .filter((e) => e.kind === 'action' && e.unitId === uid)
    .map((e) => e.energyAfter ?? -1);
}

describe('遗器套装批2（109/110/111/112/114/117 四件套）', () => {
  it('109 乐队的四：任意成员战技后施加乐队4（腾荒通用路径）', () => {
    const base = run([th()], { policy: skillOnly });
    const set = run([th({ relicsetId: '109' })], { policy: skillOnly });
    const evB = base.events.find((e) => e.kind === 'action' && e.unitId === 'tenghuang');
    const evS = set.events.find((e) => e.kind === 'action' && e.unitId === 'tenghuang');
    expect(evB?.skillCode).toBe('tenghuang.skill');
    expect(evS?.skillCode).toBe('tenghuang.skill');
    // base：无 band4 note、无 band4 buff（零回归）
    expect((evB?.note ?? []).includes('band4')).toBe(false);
    expect(hasBuffLabel(base, 'tenghuang', 'band4')).toBe(false);
    // set109：note + buff（值 0.2、单层、持续1回合——dump t=44.78 锚点）
    expect((evS?.note ?? []).includes('band4')).toBe(true);
    const b4 = buffAt(set, 'tenghuang', 'band4', evS!.time);
    expect(b4?.value).toBeCloseTo(0.2, 10);
    expect(b4?.stacks).toBe(1);
    expect(b4?.duration).toBe(1);
  });

  it('109 景元旧路径零回归；声明109 后经通用钩子且 band4 note 恰1条（防双计）', () => {
    for (const extra of [{}, { relicsetId: '109' }] as const) {
      const r = run([jy(extra as Partial<CombatMember>)], { policy: skillOnly });
      const ev = r.events.find((e) => e.kind === 'action' && e.unitId === 'jingyuan');
      const band4Notes = (ev?.note ?? []).filter((n) => n === 'band4').length;
      expect(band4Notes).toBe(1);
      const b4 = buffAt(r, 'jingyuan', 'band4', ev!.time);
      expect(b4?.value).toBeCloseTo(0.2, 10);
      expect(b4?.duration).toBe(1);
    }
  });

  it('110 翔鹰的四：装备者终招后其下一次行动提前至原时长75%，之后恢复', () => {
    const base = run([jy(), su()], { policy: basicOnly, maxTime: 1200 });
    const set = run([jy(), su({ relicsetId: '110' })], { policy: basicOnly, maxTime: 1200 });
    const bT = actionTimes(base, 'sunday');
    const sT = actionTimes(set, 'sunday');
    // 终招本身不提速：firstUlt 两侧同刻（dump 锚 148.15）
    expect(firstUltTime(base, 'sunday')).toBeCloseTo(148.15, 1);
    expect(firstUltTime(set, 'sunday')).toBeCloseTo(148.15, 1);
    expect(bT[2]).toBeCloseTo(222.22, 1);
    expect(sT[2]).toBeCloseTo(203.7, 1);
    const natural = bT[2] - bT[1];
    expect(natural).toBeCloseTo(74.07, 1);
    // 终招后首个 gap = 原 gap×0.75（一次性推进）
    expect(sT[2] - sT[1]).toBeCloseTo(natural * 0.75, 1);
    expect(sT[3] - sT[2]).toBeCloseTo(natural, 1);
  });

  it('111 怪盗的四：击破后恢复3点能量（能量链确定性锚点）', () => {
    const base = run([jy()], { policy: basicOnly, monster: monsterBreakable() });
    const set = run([jy({ relicsetId: '111' })], { policy: basicOnly, monster: monsterBreakable() });
    expect(energyChain(base, 'jingyuan')).toEqual([100, 120, 130, 25, 45, 65, 85, 105]);
    expect(energyChain(set, 'jingyuan')).toEqual([103, 126, 28, 54, 77, 100, 129, 130]);
    // 关系锚：首次击破+3；两次击破累计+6
    expect(energyChain(set, 'jingyuan')[0] - energyChain(base, 'jingyuan')[0]).toBe(3);
    expect(energyChain(set, 'jingyuan')[1] - energyChain(base, 'jingyuan')[1]).toBe(6);
  });

  it('112 废土客的四：目标持有负面时暴率+10%（fyPoint07 首挂后 crit +0.05）', () => {
    const base = run([fy()], { policy: basicOnly, maxTime: 1200 });
    const set = run([fy({ relicsetId: '112' })], { policy: basicOnly, maxTime: 1200 });
    expect(base.hits.length).toBe(71);
    expect(set.hits.length).toBe(71);
    // 绯英第9动 fyPoint07 才给目标挂上首个负面 → 首个差异 hit seq=32（t≈592.59）
    const diffs = critDiffs(base, set);
    expect(diffs.length).toBe(31);
    expect(diffs[0]?.seq).toBe(32);
    expect(diffs[0]?.time).toBeCloseTo(592.59, 1);
    for (const d of diffs) expect(d.d).toBeCloseTo(0.05, 4);
    // 挂负面之前的 hit 零差异（含首普攻）
    expect(critOf(base.hits[0])).toBeCloseTo(1.175, 10);
    expect(critOf(set.hits[0])).toBe(critOf(base.hits[0]));
    expect(base.report.totalDamage).toBeCloseTo(277075.59, 0);
    expect(set.report.totalDamage).toBeCloseTo(282542.6, 0);
  });

  it('114 信使的四：任一成员终招后全队提速12%（覆盖装备者后两次行动，justApplied 首跳）', () => {
    const base = run([jy(), su()], { policy: basicOnly, maxTime: 1600 });
    const set = run([jy(), su({ relicsetId: '114' })], { policy: basicOnly, maxTime: 1600 });
    expect(hasBuffLabel(base, 'sunday', 'relic114')).toBe(false);
    const bT = actionTimes(base, 'sunday');
    const sT = actionTimes(set, 'sunday');
    const natural = bT[2] - bT[1];
    expect(natural).toBeCloseTo(74.07, 1);
    // 加速两跳（dump 锚 214.29/280.42）：gap = 原 gap/1.12
    expect(sT[2]).toBeCloseTo(214.29, 1);
    expect(sT[3]).toBeCloseTo(280.42, 1);
    expect(sT[2] - sT[1]).toBeCloseTo(natural / 1.12, 1);
    expect(sT[3] - sT[2]).toBeCloseTo(natural / 1.12, 1);
    // 第三跳恢复原速（dump 锚 354.50）
    expect(sT[4]).toBeCloseTo(354.5, 1);
    expect(sT[4] - sT[3]).toBeCloseTo(natural, 1);
    // buff 生命周期：终招时刻在场 → 加速末跳在场 → 恢复后离场
    const ultT = firstUltTime(set, 'sunday')!;
    expect(buffAt(set, 'sunday', 'relic114', ultT)?.duration).toBe(1);
    expect(buffAt(set, 'sunday', 'relic114', sT[3])?.duration).toBe(1);
    expect(buffAt(set, 'sunday', 'relic114', sT[4])).toBeUndefined();
  });

  it('117 先驱的四：施加负面后自增益（+4%暴率；≥2负面再+8%暴伤且增强翻倍）', () => {
    const opts = { policy: basicOnly, monster: monsterBreakable(), maxTime: 1200 } as const;
    const base = run([fy()], { ...opts });
    const set = run([fy({ relicsetId: '117' })], { ...opts });
    // 2026-11-06 破韧窗口改造：同窗口不再重复击破 → 总 hit 数 156→134
  expect(base.hits.length).toBe(134);
    expect(set.hits.length).toBe(134);
    // 首动击破 applyBreak 即施加负面 → 增强 buff 自 t=74.07 起（base 零回归）
    expect(hasBuffLabel(base, 'feiying', 'relic117')).toBe(false);
    expect(buffAt(set, 'feiying', 'relic117', actionTimes(set, 'feiying')[0])?.duration).toBe(1);
    // 增强期（仅1个负面：break DoT）：crit +0.04×0.5=0.02（dump 31 个 hit）
    const seq2b = critOf(base.hits[2]);
    const seq2s = critOf(set.hits[2]);
    expect(seq2b).toBeCloseTo(1.175, 10);
    expect(seq2s).toBeCloseTo(1.195, 10);
    const diffs = critDiffs(base, set);
    const enhanceOnly = diffs.filter((d) => Math.abs(d.d - 0.02) < 1e-6);
    const tiered = diffs.filter((d) => Math.abs(d.d - 0.0824) < 1e-6);
    expect(enhanceOnly.length).toBe(39);
    expect(tiered.length).toBe(31);
    // tier 门槛=第9动 fyPoint07 挂易伤后（vuln+dot≥2）：暴伤+0.08 经增强×2=0.16
    // 差值=0.39×0.66−0.35×0.5=0.0824（增强暴率不随 tier 翻倍）
    expect(tiered[0]?.time).toBeCloseTo(592.59, 1);
    // 击破 hit 无 crit 因子（不吃暴击，117 不影响）
    expect(critOf(base.hits[1])).toBeNull();
    expect(critOf(set.hits[1])).toBeNull();
    expect(base.report.totalDamage).toBeCloseTo(467921.7944916479, 0);
    expect(set.report.totalDamage).toBeCloseTo(480188.5194204744, 0);
  });
});
