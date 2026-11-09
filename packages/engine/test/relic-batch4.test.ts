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

// 遗器套装批4（301/302/304/305/306/307/308/309/310/311/319/320/322/328/329/330 位面）。
// 锚点全部由 relic-batch4-dump.test.ts 实跑定锚（%TEMP%/临时目录/relic-batch4-dump.txt），勿凭推理改数。
// 关键口径（2026-10-13 批4裁定）：速度门槛=进战一次判定；306/309 当前暴率逐 hit 实时；
// 322 攻击力实时；330 跨佩戴者单实例；329 挂秘技段后判欢愉度；308 拉条在 init 块。
// 声明 planarsetId 会清 GEAR DEFAULT 字段（jingyuan bananaCritDmg 等）→ 干扰组用绝对值锚；
// 干净比值用无 DEFAULT 角色（huohua/trailblazer/feiying/qingge+双人队）。
// DamageKind 无 'break'：击破 hit kind=breakTrigger/breakDot/superBreak。

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
const monsterBreakable = (t: number): MonsterConfig => ({ ...monster(), maxToughness: t });

function run(
  members: CombatMember[],
  opts: { maxTime?: number; monster?: MonsterConfig; policy?: PolicyFn } = {},
) {
  const cfg: BattleConfig = {
    members,
    monster: opts.monster ?? monster(),
    rounds: 5,
    maxTime: opts.maxTime ?? 400,
    techniques: false,
    policy: opts.policy,
  };
  return simulateBattle(cfg);
}
const skillOnly: PolicyFn = () => 'skill';

type R = ReturnType<typeof simulateBattle>;

function firstHit(r: R, code?: string, kind?: string): R['hits'][number] | undefined {
  return r.hits.find(
    (h) => (code === undefined || h.skillCode === code) && (kind === undefined || h.kind === kind),
  );
}
function actionTimes(r: R, uid: string): number[] {
  return r.events
    .filter((e) => e.kind === 'action' && e.unitId === uid)
    .map((e) => e.time);
}
function hasBuffLabel(r: R, uid: string, label: string): boolean {
  return r.events.some((e) => e.buffs?.[uid]?.some((b) => b.labelKey === label));
}
function critOf(h: R['hits'][number] | undefined): number | undefined {
  return h?.factors.find((f) => f.key === 'crit')?.value;
}
function factorOf(h: R['hits'][number] | undefined, key: string): number | undefined {
  return h?.factors.find((f) => f.key === key)?.value;
}

describe('遗器套装批4（16 套位面门槛类）', () => {
  it('301 封印站：速度≥120 → 自身攻击力+12%（景元绝对锚，DEFAULT banana 干扰组）', () => {
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 120) }], { policy: skillOnly, maxTime: 200 });
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 120), planarsetId: '301' }], { policy: skillOnly, maxTime: 200 });
    expect(firstHit(b, 'jingyuan.skill')?.total).toBeCloseTo(1305.6, 1);
    expect(firstHit(s, 'jingyuan.skill')?.total).toBeCloseTo(1409.9, 1);
  });

  it('302 仙舟：速度≥120 → 全队攻击力+8%（逐佩戴者叠加；DEFAULT rucaca 干扰组）', () => {
    const b = run([
      { id: 'qingge', panel: panel('Wind', 120) },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 200 });
    const s = run([
      { id: 'qingge', panel: panel('Wind', 120), planarsetId: '302' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 200 });
    // base 侧晴歌 DEFAULT rucacaAtk 给景元+12% > set 侧 302 全队+8% → set<base 属预期
    expect(firstHit(b, 'jingyuan.skill')?.total).toBeCloseTo(1780.47, 1);
    expect(firstHit(s, 'jingyuan.skill')?.total).toBeCloseTo(1704.54, 1);
  });

  it('304 贝洛伯格：effectHit≥50% → 挂 defPct buff（无消费点，只断言存在）', () => {
    const s = run(
      [{ id: 'jingyuan', panel: panel('Thunder', 100, { effectHit: 0.55 }), planarsetId: '304' }],
      { policy: skillOnly, maxTime: 100 },
    );
    expect(hasBuffLabel(s, 'jingyuan', 'relic304')).toBe(true);
  });

  it('305 差分机：暴伤≥120% → 暴率+60%（crit 因子 1.081→1.845，首伤后移除）', () => {
    const b = run(
      [{ id: 'jingyuan', panel: panel('Thunder', 100, { critDmg: 1.3 }) }],
      { policy: skillOnly, maxTime: 200 },
    );
    const s = run(
      [{ id: 'jingyuan', panel: panel('Thunder', 100, { critDmg: 1.3 }), planarsetId: '305' }],
      { policy: skillOnly, maxTime: 200 },
    );
    const bh = firstHit(b, 'jingyuan.skill');
    const sh = firstHit(s, 'jingyuan.skill');
    // base crit=1+0.05×(1.3+DEFAULT banana 0.32)=1.081；set=1+(0.05+0.6)×1.3=1.845
    expect(critOf(bh)).toBeCloseTo(1.081, 4);
    expect(critOf(sh)).toBeCloseTo(1.845, 4);
    expect(bh?.total).toBeCloseTo(1355.8, 1);
    expect(sh?.total).toBeCloseTo(2313.9, 1);
  });

  it('306 萨尔索图：当前暴率≥50% → 终招/追加+15%（火花干净比值 877.3/762.9=1.15）', () => {
    const b = run([{ id: 'huohua', panel: panel('Fire', 100, { critRate: 0.6 }) }], { policy: skillOnly, maxTime: 400 });
    const s = run([{ id: 'huohua', panel: panel('Fire', 100, { critRate: 0.6 }), planarsetId: '306' }], { policy: skillOnly, maxTime: 400 });
    const bu = b.hits.find((h) => h.skillCode?.startsWith('huohua.ult'));
    const su = s.hits.find((h) => h.skillCode?.startsWith('huohua.ult'));
    expect(bu?.total).toBeCloseTo(762.9, 1);
    expect(su?.total).toBeCloseTo(877.3, 1);
    expect((su?.total ?? 0) / (bu?.total ?? 1)).toBeCloseTo(1.15, 2);
  });

  it('307 塔利亚：速度≥145 → 击破伤害+20%（breakTrigger/breakDot 均 ×1.20）', () => {
    const mb = monsterBreakable(60);
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 145) }], { policy: skillOnly, maxTime: 300, monster: mb });
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 145), planarsetId: '307' }], { policy: skillOnly, maxTime: 300, monster: mb });
    const bbt = firstHit(b, undefined, 'breakTrigger');
    const sbt = firstHit(s, undefined, 'breakTrigger');
    expect(bbt?.total).toBeCloseTo(1794.0714285714287, 1);
    expect(sbt?.total).toBeCloseTo(2152.885714285714, 1);
    expect((sbt?.total ?? 0) / (bbt?.total ?? 1)).toBeCloseTo(1.2, 2);
    const bbd = firstHit(b, undefined, 'breakDot');
    const sbd = firstHit(s, undefined, 'breakDot');
    expect(bbd?.total).toBeCloseTo(3588.1, 1);
    expect(sbd?.total).toBeCloseTo(4305.8, 1);
    expect((sbd?.total ?? 0) / (bbd?.total ?? 1)).toBeCloseTo(1.2, 2);
  });

  it('308 翁瓦克（泛化）：速度≥120 → 进战行动提前40%（首动 83.33→50.00）', () => {
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 120) }], { policy: skillOnly, maxTime: 200 });
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 120), planarsetId: '308' }], { policy: skillOnly, maxTime: 200 });
    const bt = actionTimes(b, 'jingyuan').slice(0, 2);
    const st = actionTimes(s, 'jingyuan').slice(0, 2);
    expect(bt[0]).toBeCloseTo(83.33, 2);
    expect(bt[1]).toBeCloseTo(166.67, 2);
    expect(st[0]).toBeCloseTo(50.0, 2);
    expect(st[1]).toBeCloseTo(133.33, 2);
  });

  it('309 繁星：当前暴率≥70% → 普攻/战技+20%（开拓者干净比值 894.9/745.7=1.20）', () => {
    const b = run([{ id: 'trailblazer', panel: panel('Fire', 100, { critRate: 0.75 }) }], { policy: skillOnly, maxTime: 400 });
    const s = run([{ id: 'trailblazer', panel: panel('Fire', 100, { critRate: 0.75 }), planarsetId: '309' }], { policy: skillOnly, maxTime: 400 });
    const bh = firstHit(b, 'trailblazer.skill');
    const sh = firstHit(s, 'trailblazer.skill');
    expect(bh?.total).toBeCloseTo(745.7, 1);
    expect(sh?.total).toBeCloseTo(894.9, 1);
    expect((sh?.total ?? 0) / (bh?.total ?? 1)).toBeCloseTo(1.2, 2);
  });

  it('310 龙骨：effectRes≥30% → 全队暴伤+10%（逐佩戴者叠加；DEFAULT banana 干扰组）', () => {
    const b = run(
      [{ id: 'jingyuan', panel: panel('Thunder', 100, { effectRes: 0.35 }) }],
      { policy: skillOnly, maxTime: 200 },
    );
    const s = run(
      [{ id: 'jingyuan', panel: panel('Thunder', 100, { effectRes: 0.35 }), planarsetId: '310' }],
      { policy: skillOnly, maxTime: 200 },
    );
    expect(firstHit(b, 'jingyuan.skill')?.total).toBeCloseTo(1305.6, 1);
    expect(firstHit(s, 'jingyuan.skill')?.total).toBeCloseTo(1291.8, 1);
  });

  it('311 格拉默：速度≥135/160 双档 → 增伤+12%/+18%（进战定档；DEFAULT 干扰组绝对锚）', () => {
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 135) }], { policy: skillOnly, maxTime: 200 });
    const s1 = run([{ id: 'jingyuan', panel: panel('Thunder', 135), planarsetId: '311' }], { policy: skillOnly, maxTime: 200 });
    const s2 = run([{ id: 'jingyuan', panel: panel('Thunder', 160), planarsetId: '311' }], { policy: skillOnly, maxTime: 200 });
    expect(firstHit(b, 'jingyuan.skill')?.total).toBeCloseTo(1305.6, 1);
    expect(firstHit(s1, 'jingyuan.skill')?.total).toBeCloseTo(1416.3, 1);
    expect(firstHit(s2, 'jingyuan.skill')?.total).toBeCloseTo(1481.6, 1);
    // 双档差异存在（160 档 > 135 档）
    expect((firstHit(s2, 'jingyuan.skill')?.total ?? 0)).toBeGreaterThan(firstHit(s1, 'jingyuan.skill')?.total ?? 0);
  });

  it('319 谧宁：生命≥5000 → 自身暴伤+28%（DEFAULT banana 干扰组绝对锚）', () => {
    const b = run([{ id: 'jingyuan', panel: panel('Thunder', 100, { hp: 5200 }) }], { policy: skillOnly, maxTime: 200 });
    const s = run([{ id: 'jingyuan', panel: panel('Thunder', 100, { hp: 5200 }), planarsetId: '319' }], { policy: skillOnly, maxTime: 200 });
    expect(firstHit(b, 'jingyuan.skill')?.total).toBeCloseTo(1305.6, 1);
    expect(firstHit(s, 'jingyuan.skill')?.total).toBeCloseTo(1303.1, 1);
  });

  it('320 巨树：速度≥135 → 挂 healBonus buff（healBonusMult 统一乘区入口）', () => {
    const s = run([
      { id: 'tails', panel: panel('Wind', 135), planarsetId: '320' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 300 });
    expect(hasBuffLabel(s, 'tails', 'relic320')).toBe(true);
    // base 无该 buff
    const b = run([
      { id: 'tails', panel: panel('Wind', 135) },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 300 });
    expect(hasBuffLabel(b, 'tails', 'relic320')).toBe(false);
  });

  it('322 海隅：攻击力≥2400 → DoT 独立乘区 1.12（击破 DoT 因子 independent=1.12）', () => {
    const mb = monsterBreakable(30);
    const b = run([
      { id: 'qingge', panel: panel('Wind', 100, { attack: 2500 }) },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 300, monster: mb });
    const s = run([
      { id: 'qingge', panel: panel('Wind', 100, { attack: 2500 }), planarsetId: '322' },
      { id: 'jingyuan', panel: panel('Thunder', 100), planarsetId: '322' },
    ], { policy: skillOnly, maxTime: 300, monster: mb });
    const bd = b.hits.filter((h) => h.kind === 'breakDot');
    const sd = s.hits.filter((h) => h.kind === 'breakDot');
    expect(bd.length).toBeGreaterThan(0);
    expect(bd[0]?.total).toBeCloseTo(3875.19, 1);
    expect(sd[0]?.total).toBeCloseTo(4340.22, 1);
    // independent 因子：base=1、set=1.12（可破木桩二次破韧也挂了 322 → source 归属稳定）
    expect(factorOf(bd[0], 'independent')).toBe(1);
    expect(factorOf(sd[0], 'independent')).toBe(1.12);
  });

  it('328 生研院：能量≥200 → 每点0.2%增伤封顶32%（绯英 480 能量 ×1.32 干净比值）', () => {
    const b = run([
      { id: 'feiying', panel: panel('Fire', 100) },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 200 });
    const s = run([
      { id: 'feiying', panel: panel('Fire', 100), planarsetId: '328' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 200 });
    const bh = b.hits.find((h) => h.skillCode?.startsWith('feiying'));
    const sh = s.hits.find((h) => h.skillCode?.startsWith('feiying'));
    expect(bh?.total).toBeCloseTo(3021.43, 1);
    expect(sh?.total).toBeCloseTo(3988.29, 1);
    expect((sh?.total ?? 0) / (bh?.total ?? 1)).toBeCloseTo(1.32, 2);
  });

  it('329 神的瞬息：欢愉度≥0.4 → 行动提前40%（开拓者 elationDegree=0.5，挂秘技段后判定）', () => {
    const b = run([
      { id: 'trailblazer', panel: panel('Fire', 100, { elationDegree: 0.5 }) },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 200 });
    const s = run([
      { id: 'trailblazer', panel: panel('Fire', 100, { elationDegree: 0.5 }), planarsetId: '329' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 200 });
    const bt = actionTimes(b, 'trailblazer').slice(0, 2);
    const st = actionTimes(s, 'trailblazer').slice(0, 2);
    expect(bt[0]).toBeCloseTo(100.0, 2);
    expect(bt[1]).toBeCloseTo(200.0, 2);
    expect(st[0]).toBeCloseTo(60.0, 2);
    expect(st[1]).toBeCloseTo(160.0, 2);
  });

  it('330 亚空：速度≥145 → 全队击破+18%（跨佩戴者单实例，×1.18 干净比值）', () => {
    const mb = monsterBreakable(30);
    const b = run([
      { id: 'qingge', panel: panel('Wind', 145) },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 200, monster: mb });
    const s = run([
      { id: 'qingge', panel: panel('Wind', 145), planarsetId: '330' },
      { id: 'jingyuan', panel: panel('Thunder', 100) },
    ], { policy: skillOnly, maxTime: 200, monster: mb });
    const bbt = firstHit(b, undefined, 'breakTrigger');
    const sbt = firstHit(s, undefined, 'breakTrigger');
    expect(bbt?.total).toBeCloseTo(1453.2, 1);
    // 4.6.54 数据 require_num.2 param#3 = 0.18（原 0.15）；锚点按 2026-11-02 实跑 dump 重锚
    expect(sbt?.total).toBeCloseTo(1714.77, 1);
    expect((sbt?.total ?? 0) / (bbt?.total ?? 1)).toBeCloseTo(1.18, 2);
  });
});
