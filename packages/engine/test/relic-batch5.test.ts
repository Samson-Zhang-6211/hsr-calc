import type { Element } from '@hsr-calc/shared';
import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
  type PolicyFn,
} from '../src/index.js';

// 遗器套装批5（303/312/313/314/315/316/317/318/321/323/324/325/326/327 位面）。
// 锚点全部由 relic-batch5-dump.test.ts 实跑定锚（%TEMP%/临时目录/relic-batch5-dump.txt，已删），
// 勿凭推理改数。至此 64 套遗器四件套+位面全部接入。
// 关键口径（2026-10-13 批5裁定）：303 效果命中换算进战一次；312 逐佩戴者叠加；
// 313/326 击杀钩子（任意敌方消灭）；314 进战同命途判定；315 功勋=追击独立乘区；
// 316 火弱点逐 hit；317 members[0]；318 召唤在场逐 hit；321 只算存活编队成员（isDead）；
// 323 忆灵在场全队速度跨佩戴者单实例；324 回合 SP≥3 dur3；325 实时首达 40%/80%；
// 326 追击 atk dur2 + 击杀全队暴伤单实例；327 另一 trailblazer* 队友。
// 声明 planarsetId 会清 GEAR DEFAULT（jingyuan banana 等，318 除外=gate 特判保留）→ 干扰组绝对锚。

const ALL_ELEMENTS: Element[] = [
  'Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary',
];

function panel(element: Element, speed: number, extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element, level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed, energyRegen: 0,
    ...extra,
  };
}
function monster(): MonsterConfig {
  return {
    level: 90, hp: 1e9, resistance: {}, weaknesses: ALL_ELEMENTS,
    maxToughness: 9999, speed: 100, enemyClass: 'elite',
  };
}

function run(
  members: CombatMember[],
  opts: { maxTime?: number; monster?: MonsterConfig } = {},
) {
  const cfg: BattleConfig = {
    members,
    monster: opts.monster ?? monster(),
    rounds: 5,
    maxTime: opts.maxTime ?? 400,
    techniques: false,
    policy,
  };
  return simulateBattle(cfg);
}
const policy: PolicyFn = () => 'skill';

type R = ReturnType<typeof simulateBattle>;

function firstHit(r: R, code?: string, kind?: string): R['hits'][number] | undefined {
  return r.hits.find(
    (h) => (code === undefined || h.skillCode === code) && (kind === undefined || h.kind === kind),
  );
}
function critOf(h: R['hits'][number] | undefined): number | undefined {
  return h?.factors.find((f) => f.key === 'crit')?.value;
}
function factorOf(h: R['hits'][number] | undefined, key: string): number | undefined {
  return h?.factors.find((f) => f.key === key)?.value;
}
function buffOf(
  r: R, uid: string, label: string,
): { t: number; value: number; stacks: number } | null {
  for (const e of r.events) {
    const b = e.buffs?.[uid]?.find((x) => x.labelKey === label);
    if (b) return { t: e.time, value: b.value, stacks: b.stacks };
  }
  return null;
}
function actionTimes(r: R, uid: string): number[] {
  return r.events
    .filter((e) => e.kind === 'action' && e.unitId === uid)
    .map((e) => e.time);
}

describe('遗器套装批5（14 套位面）', () => {
  it('303 泛银河：效果命中×25% 换算攻封顶25%（进战一次，buff=0.225）', () => {
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 100, { effectHit: 0.9 }) }], { maxTime: 120 });
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 100, { effectHit: 0.9 }), planarsetId: '303' }], { maxTime: 120 });
    expect(firstHit(b, 'jingyuan.skill')?.total).toBeCloseTo(1305.6, 1);
    expect(firstHit(s, 'jingyuan.skill')?.total).toBeCloseTo(1518.8, 1);
    expect(buffOf(s, 'jingyuan', 'relic303')).toMatchObject({ value: 0.225, stacks: 1 });
    expect(buffOf(b, 'jingyuan', 'relic303')).toBeNull();
  });

  it('312 匹诺康尼：同属性队友伤害+10%（逐佩戴者叠加，绯英×1.10 干净比值）', () => {
    const b = run([
      { id: 'huohua', panel: panel('Fire', 100) },
      { id: 'feiying', panel: panel('Fire', 100) },
    ], { maxTime: 200 });
    const s = run([
      { id: 'huohua', panel: panel('Fire', 100), planarsetId: '312' },
      { id: 'feiying', panel: panel('Fire', 100) },
    ], { maxTime: 200 });
    const bf = firstHit(b, 'feiying.skill');
    const sf = firstHit(s, 'feiying.skill');
    expect(bf?.total).toBeCloseTo(3381.43, 1);
    expect(sf?.total).toBeCloseTo(3719.57, 1);
    expect((sf?.total ?? 0) / (bf?.total ?? 1)).toBeCloseTo(1.1, 2);
    expect(buffOf(s, 'feiying', 'relic312')).not.toBeNull();
    expect(buffOf(s, 'huohua', 'relic312')).toBeNull(); // 自己不被自己 buff
  });

  it('313 茨冈尼亚：敌方消灭→暴伤+4%层≤10（小血量木桩 2 击杀=2 层）', () => {
    const low = { ...monster(), hp: 3000 };
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 100), planarsetId: '313' }], { maxTime: 300, monster: low });
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 100) }], { maxTime: 300, monster: low });
    expect(buffOf(s, 'jingyuan', 'relic313')).toMatchObject({ value: 0.04, stacks: 2 });
    expect(buffOf(b, 'jingyuan', 'relic313')).toBeNull();
  });

  it('314 出云高天：同命途队友→装备者暴率+12%（绯英 crit 1.175→1.235）', () => {
    const b = run([
      { id: 'huohua', panel: panel('Fire', 100) },
      { id: 'feiying', panel: panel('Fire', 100) },
    ], { maxTime: 200 });
    const s = run([
      { id: 'huohua', panel: panel('Fire', 100) },
      { id: 'feiying', panel: panel('Fire', 100), planarsetId: '314' },
    ], { maxTime: 200 });
    const bf = b.hits.find((h) => h.source === 'feiying');
    const sf = s.hits.find((h) => h.source === 'feiying');
    expect(critOf(bf)).toBeCloseTo(1.175, 4);
    expect(critOf(sf)).toBeCloseTo(1.235, 4);
    expect(buffOf(s, 'feiying', 'relic314')).toMatchObject({ value: 0.12, stacks: 1 });
    expect(buffOf(b, 'feiying', 'relic314')).toBeNull();
  });

  it('315 都兰：追加攻击→功勋+1≤5、每层追伤+5% 独立乘区（神君 ind 1→1.05）', () => {
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 100) }], { maxTime: 300 });
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 100), planarsetId: '315' }], { maxTime: 300 });
    const bsh = b.hits.find((h) => h.skillCode === 'jingyuan.shenjun');
    const ssh = s.hits.find((h) => h.skillCode === 'jingyuan.shenjun');
    expect(bsh?.total).toBeCloseTo(1353.9, 1);
    expect(ssh?.total).toBeCloseTo(1171.9, 1); // set 清 banana DEFAULT → 绝对锚
    expect(factorOf(bsh, 'independent')).toBe(1);
    expect(factorOf(ssh, 'independent')).toBe(1.05); // 1 层 ×5%
    expect(buffOf(s, 'jingyuan', 'relic315')).toMatchObject({ value: 0.05, stacks: 1 });
    expect(buffOf(b, 'jingyuan', 'relic315')).toBeNull();
  });

  it('316 劫火：击中火弱点目标→击破特攻+40% dur1（label 存在性）', () => {
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 100), planarsetId: '316' }], { maxTime: 200 });
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 100) }], { maxTime: 200 });
    expect(buffOf(s, 'jingyuan', 'relic316')).toMatchObject({ value: 0.4, stacks: 1 });
    expect(buffOf(b, 'jingyuan', 'relic316')).toBeNull();
  });

  it('317 露莎卡：佩戴者非首位→第一位攻+12%（含反例：首位佩戴不触发）', () => {
    const b = run([
      { id: 'jingyuan', panel: panel('Thunder', 100) },
      { id: 'huohua', panel: panel('Fire', 100) },
    ], { maxTime: 200 });
    const s = run([
      { id: 'jingyuan', panel: panel('Thunder', 100) },
      { id: 'huohua', panel: panel('Fire', 100), planarsetId: '317' },
    ], { maxTime: 200 });
    const neg = run([
      { id: 'huohua', panel: panel('Fire', 100), planarsetId: '317' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { maxTime: 200 });
    expect(firstHit(b, 'jingyuan.skill')?.total).toBeCloseTo(1305.6, 1);
    expect(firstHit(s, 'jingyuan.skill')?.total).toBeCloseTo(1431.9, 1); // DEFAULT 干扰组绝对锚
    expect(buffOf(s, 'jingyuan', 'relic317')).toMatchObject({ value: 0.12, stacks: 1 });
    expect(buffOf(neg, 'jingyuan', 'relic317')).toBeNull(); // 首位自己佩戴不触发
  });

  it('318 蕉乐园：召唤目标在场→暴伤额外+32%（神君进战即在场，crit 1.041→1.057）', () => {
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 100) }], { maxTime: 300 });
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 100), planarsetId: '318' }], { maxTime: 300 });
    const bh = firstHit(b, 'jingyuan.skill');
    const sh = firstHit(s, 'jingyuan.skill');
    // 318=gate 特判保留 banana DEFAULT → crit 差 = 0.05×0.32 = 0.016 干净比值
    expect(critOf(bh)).toBeCloseTo(1.041, 4);
    expect(critOf(sh)).toBeCloseTo(1.057, 4);
    const bsj = b.hits.find((h) => h.skillCode === 'jingyuan.shenjun');
    const ssj = s.hits.find((h) => h.skillCode === 'jingyuan.shenjun');
    expect(critOf(bsj)).toBeCloseTo(1.123, 4);
    expect(critOf(ssj)).toBeCloseTo(1.171, 4);
  });

  it('321 织梦：少于4名存活每少1名+9%伤≤3层（solo=3层×1.27、双人=2层）', () => {
    const b = run([{ id: 'trailblazer', panel: panel('Fire', 100) }], { maxTime: 150 });
    const s = run([{ id: 'trailblazer', panel: panel('Fire', 100), planarsetId: '321' }], { maxTime: 150 });
    const s2 = run([
      { id: 'trailblazer', panel: panel('Fire', 100), planarsetId: '321' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { maxTime: 150 });
    const bh = firstHit(b, 'trailblazer.skill');
    const sh = firstHit(s, 'trailblazer.skill');
    expect(bh?.total).toBeCloseTo(565.7, 1);
    expect(sh?.total).toBeCloseTo(718.5, 1);
    expect((sh?.total ?? 0) / (bh?.total ?? 1)).toBeCloseTo(1.27, 2);
    expect(buffOf(s, 'trailblazer', 'relic321')).toMatchObject({ value: 0.09, stacks: 3 });
    expect(buffOf(s2, 'trailblazer', 'relic321')).toMatchObject({ value: 0.09, stacks: 2 });
    expect(buffOf(b, 'trailblazer', 'relic321')).toBeNull();
  });

  it('323 翁法罗斯：佩戴者忆灵在场→全队速度+8%（行动时刻 255.56→248.15）', () => {
    const b = run([
      { id: 'qingge', panel: panel('Wind', 100) },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { maxTime: 300 });
    const s = run([
      { id: 'qingge', panel: panel('Wind', 100), planarsetId: '323' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { maxTime: 300 });
    const bj = actionTimes(b, 'jingyuan');
    const sj = actionTimes(s, 'jingyuan');
    expect(bj[2]).toBeCloseTo(255.56, 2);
    expect(sj[2]).toBeCloseTo(248.15, 2); // 贝茜召唤后 gap ÷1.08
    const bq = actionTimes(b, 'qingge');
    const sq = actionTimes(s, 'qingge');
    expect(bq[1]).toBeCloseTo(200.0, 2);
    expect(sq[1]).toBeCloseTo(192.59, 2);
  });

  it('324 直播间：同一回合累计耗 SP≥3→佩戴者暴伤+32% dur3（3人队第1回合触发）', () => {
    const s = run([
      { id: 'trailblazer', panel: panel('Fire', 100), planarsetId: '324' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
      { id: 'feiying', panel: panel('Fire', 100) },
    ], { maxTime: 300 });
    expect(buffOf(s, 'trailblazer', 'relic324')).toMatchObject({ value: 0.32, stacks: 1 });
    expect(buffOf(s, 'jingyuan', 'relic324')).toBeNull(); // 只挂佩戴者
    const b = run([
      { id: 'trailblazer', panel: panel('Fire', 100) },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
      { id: 'feiying', panel: panel('Fire', 100) },
    ], { maxTime: 300 });
    expect(buffOf(b, 'trailblazer', 'relic324')).toBeNull();
  });

  it('325 朋克洛德：实时欢愉度首达 40%/80%→暴伤+20%/+32% 各一次（分层隔离）', () => {
    // 景元无欢愉度行迹 → 0.45 只触发 a 档、0.85 触发 a+b 档
    const j1 = run([{ id: 'jingyuan', panel: panel('Thunder', 100, { elationDegree: 0.45 }), planarsetId: '325' }], { maxTime: 150 });
    const j2 = run([{ id: 'jingyuan', panel: panel('Thunder', 100, { elationDegree: 0.85 }), planarsetId: '325' }], { maxTime: 150 });
    expect(buffOf(j1, 'jingyuan', 'relic325a')).toMatchObject({ value: 0.2, stacks: 1 });
    expect(buffOf(j1, 'jingyuan', 'relic325b')).toBeNull();
    expect(buffOf(j2, 'jingyuan', 'relic325a')).toMatchObject({ value: 0.2, stacks: 1 });
    expect(buffOf(j2, 'jingyuan', 'relic325b')).toMatchObject({ value: 0.32, stacks: 1 });
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 100, { elationDegree: 0.85 }) }], { maxTime: 150 });
    expect(buffOf(b, 'jingyuan', 'relic325a')).toBeNull();
  });

  it('326 千星荟萃：追击→佩戴者攻+24% dur2、击杀→全队暴伤+12% 单实例', () => {
    const low = { ...monster(), hp: 5000 };
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 100), planarsetId: '326' }], { maxTime: 300, monster: low });
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 100) }], { maxTime: 300, monster: low });
    // 追击钩子：神君出手时 atk buff 已挂（t=150）；set 清 banana → 绝对锚
    expect(buffOf(s, 'jingyuan', 'relic326')).toMatchObject({ value: 0.24, stacks: 1 });
    expect(buffOf(b, 'jingyuan', 'relic326')).toBeNull();
    const ssh = s.hits.find((h) => h.skillCode === 'jingyuan.shenjun');
    const bsh = b.hits.find((h) => h.skillCode === 'jingyuan.shenjun');
    expect(bsh?.total).toBeCloseTo(1353.9, 1);
    expect(ssh?.total).toBeCloseTo(1332.1, 1);
    // 击杀全队暴伤（labelKey 与 atk 同名但 key 不同=critDmg 实例，value 0.12）
    const killBuff = s.events
      .flatMap((e) => e.buffs?.jingyuan ?? [])
      .find((x) => x.labelKey === 'relic326' && x.value === 0.12);
    expect(killBuff).toBeTruthy();
  });

  it('327 坠星：进战存在另一名 trailblazer* 队友→装备者暴伤+32%', () => {
    const s = run([
      { id: 'trailblazer', panel: panel('Fire', 100), planarsetId: '327' },
      { id: 'trailblazerMem', panel: panel('Ice', 100) },
    ], { maxTime: 200 });
    const solo = run([{ id: 'trailblazer', panel: panel('Fire', 100), planarsetId: '327' }], { maxTime: 200 });
    expect(buffOf(s, 'trailblazer', 'relic327')).toMatchObject({ value: 0.32, stacks: 1 });
    expect(buffOf(solo, 'trailblazer', 'relic327')).toBeNull();
  });
});
