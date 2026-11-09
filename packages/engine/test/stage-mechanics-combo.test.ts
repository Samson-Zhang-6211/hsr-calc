import { describe, expect, it } from 'vitest';
import { buildPackStageWaves, simulateBattle, type CombatMember, type MemberPanel } from '../src/index.js';

// ── 关卡机制「组合叠加」验收（2026-10-30 第四十三轮）──
// `stage-mechanics.test.ts` 是逐项数值、`stage-mechanic-runtime.test.ts` 是逐关生效；
// 本文件验的是**多项同时挂在一段上**（异相仲裁第 1 关真实数据，5 项全开：
// 血嗜 + 洞穿 + 狂喜之夜 + 领航誓言 + 胞吞作用）会不会互相干扰。
//
// 关键特性：这 5 项机制**都不消耗随机数**（只改生命/倍率/增笑/抗穿），
// 所以开与不开的行动序列、命中段号完全一致 → 可以逐段对比因子。
// 实测锚（dump 定锚，仲裁第 1 关，敌方血量压到 40 万，4 轮）：
//   不开机制：欢愉首段 total=4182，因子 mirthBonus=1.000 / resist=1.000，直伤 5577
//   全开：    欢愉首段 total=9409，因子 mirthBonus=1.500 / resist=1.500，直伤 8365
//   → 直伤 ×1.5（抗穿）、欢愉 ×2.25（1.5 增笑 × 1.5 抗穿），两者**互不吞并**。

function panel(speed: number, elationDegree = 0.5): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 400_000,
    attack: 4000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
    elationDegree,
  };
}

/** 第一位 = 欢愉角色（狂喜之夜/领航誓言只作用于编队第一位） */
const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(160) },
  { id: 'feixiao', panel: panel(150) },
];

const waves = () =>
  buildPackStageWaves('arb-p10', 1).map((w) => w.map((c) => ({ ...c, hp: Math.min(c.hp, 400_000) })));

const ALL5 = ['bloodthirst', 'pierce', 'ecstasyNight', 'pilotVow', 'cytosis'];

function run(mech?: string[]) {
  return simulateBattle({
    members: members(),
    monsterWaves: waves(),
    techniques: false,
    rounds: 4,
    maxTime: 3000,
    roundMode: 'arbiter',
    ...(mech ? { mechanics: mech } : {}),
  });
}

/** 取某个命中的某个因子值 */
const factor = (h: { factors?: { key: string; value: number }[] }, key: string): number =>
  h.factors?.find((f) => f.key === key)?.value ?? Number.NaN;

describe('关卡机制 · 组合叠加（仲裁第 1 关 5 项全开）', () => {
  it('机制不消耗随机数：开与不开的行动序列 / 命中段号一致', () => {
    const none = run();
    const all = run(ALL5);
    const sig = (r: ReturnType<typeof run>) => r.hits.slice(0, 8).map((h) => `${h.kind}|${h.skillCode}`);
    expect(sig(all)).toEqual(sig(none));
    // 每一次命中都落在同一段号上（前 20 段足以说明序列没漂）
    expect(all.hits.slice(0, 20).map((h) => h.seq)).toEqual(none.hits.slice(0, 20).map((h) => h.seq));
  });

  it('狂喜之夜：只给编队第一位 +50% 增笑（mirthBonus 1.000 → 1.500）', () => {
    const none = run();
    const all = run(ALL5);
    const firstElationNone = none.hits.find((h) => h.kind === 'elation' && h.source === 'huohua')!;
    const firstElationAll = all.hits.find((h) => h.kind === 'elation' && h.source === 'huohua')!;
    expect(factor(firstElationNone, 'mirthBonus')).toBeCloseTo(1, 5);
    expect(factor(firstElationAll, 'mirthBonus')).toBeCloseTo(1.5, 5);
    // 第二位成员（非欢愉角色）不该吃到增笑：直伤段本来就不带 mirthBonus 因子，
    // 带了的话必须仍是 1.000
    const second = all.hits.find((h) => h.source === 'feixiao' && h.kind === 'direct');
    if (second) {
      const mb = second.factors?.find((f) => f.key === 'mirthBonus');
      expect(mb === undefined || mb.value === 1, '第二位不该吃到狂喜之夜').toBe(true);
    }
  });

  it('领航誓言：只给编队第一位 +50% 抗穿（resist 1.000 → 1.500），第二位不受影响', () => {
    const none = run();
    const all = run(ALL5);
    const firstNone = none.hits.find((h) => h.source === 'huohua' && h.kind === 'direct')!;
    const firstAll = all.hits.find((h) => h.source === 'huohua' && h.kind === 'direct')!;
    expect(factor(firstNone, 'resist'), '不开机制时不该有抗穿').toBeCloseTo(1, 5);
    expect(factor(firstAll, 'resist')).toBeCloseTo(1.5, 5);
    const secondAll = all.hits.find((h) => h.source === 'feixiao' && h.kind === 'direct');
    if (secondAll) expect(factor(secondAll, 'resist'), '第二位不该吃到领航誓言').toBeCloseTo(1, 5);
  });

  it('两项同时生效时乘算叠加：直伤 ×1.5、欢愉 ×2.25（1.5 增笑 × 1.5 抗穿）', () => {
    const none = run();
    const all = run(ALL5);
    const directNone = none.hits.find((h) => h.kind === 'direct' && h.source === 'huohua')!.total;
    const directAll = all.hits.find((h) => h.kind === 'direct' && h.source === 'huohua')!.total;
    expect(directAll / directNone).toBeCloseTo(1.5, 2);
    const elNone = none.hits.find((h) => h.kind === 'elation' && h.source === 'huohua')!.total;
    const elAll = all.hits.find((h) => h.kind === 'elation' && h.source === 'huohua')!.total;
    expect(elAll / elNone, `欢愉 ${elAll}/${elNone}`).toBeCloseTo(2.25, 2);
  });

  it('血嗜仍是每回合固定扣血：组合里不会被其它机制放大（次数与单独开血嗜相当）', () => {
    const only = run(['bloodthirst']);
    const all = run(ALL5);
    const count = (r: ReturnType<typeof run>) =>
      r.events.flatMap((e) => e.note ?? []).filter((n) => n === 'stageBloodthirst').length;
    expect(count(only)).toBeGreaterThan(0);
    expect(count(all)).toBeGreaterThan(0);
    // 次数取决于我方行动回合数（有人被洞穿打死会少几次），不应出现成倍放大
    expect(Math.abs(count(all) - count(only))).toBeLessThanOrEqual(4);
  });
});
