import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 记忆命途四人（1407 遐蝶/1409 风堇/1413 长夜月/1415 昔涟）接入回归
 * （2026-10；dump 锚点法：锚点全部来自 %TEMP%/opencode/mem4-dump.txt 实测，勿纯推理改写） */

type Ev = BattleResult['events'][number];

const MON = {
  level: 90,
  hp: 500_000_000,
  maxHp: 500_000_000,
  toughness: 99999,
  maxToughness: 99999,
  broken: false,
  attack: 0,
  speed: 100,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'imaginary'] as Element[],
};

function baseConfig(over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    rounds: 8,
    maxTime: 400,
    techniques: false,
    members: [
      {
        id: 'xiedie',
        panel: {
          level: 80,
          hp: 8000,
          attack: 2000,
          defence: 1000,
          speed: 95,
          critRate: 0.05,
          critDmg: 0.5,
          energyRegen: 0,
          element: 'Ice',
          damageBonus: 0,
          breakEffect: 0,
        },
        energyRegen: 0,
        eidolonLevel: 0,
      },
    ],
    monster: { ...MON },
    seed: 20261011,
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

function memberOf(id: string): NonNullable<BattleConfig['members']>[number] {
  return {
    id: id as 'xiedie',
    panel: {
      level: 80,
      hp: 7000,
      attack: 1200,
      defence: 900,
      speed: 110,
      critRate: 0.05,
      critDmg: 0.5,
      energyRegen: 0,
      element: 'Wind',
      damageBonus: 0,
      breakEffect: 0,
    },
    energyRegen: 0,
    eidolonLevel: 0,
  } as NonNullable<BattleConfig['members']>[number];
}

const baseOf = (r: BattleResult, seq: number): number =>
  r.hits[seq].factors.find((f) => f.key === 'base')?.value ?? -1;

describe('记忆四人（1407/1409/1413/1415，2026-10）', () => {
  it('A 遐蝶单人：战技免SP、Blast 三段、能量列显示新蕊', () => {
    const r = run('A', () => baseConfig());
    // 3 次战技（每105.26 一动，满 400 截止）
    const skills = r.events.filter((e: Ev) => e.skillCode === 'xiedie.skill');
    expect(skills.length).toBe(3);
    const s0 = skills[0];
    expect(s0.time).toBeCloseTo(105.26, 2);
    expect(s0.spAfter).toBe(3); // bp=-1 免消耗战技点（裁定③）
    expect(s0.note).toContain('xiedieSkill');
    expect(s0.hitSeqs).toEqual([0, 1, 2]);
    // 能量列 = 新蕊（裁定②：每损失HP+1 → 2400/4080/5256 实测链）
    expect(s0.energyAfter).toBe(2400);
    expect(skills[1].energyAfter).toBe(4080);
    expect(skills[2].energyAfter).toBe(5256);
    // Blast：主目标 2400（8000×0.3）、相邻 4000（8000×0.5）
    expect(baseOf(r, 0)).toBe(2400);
    expect(baseOf(r, 1)).toBe(4000);
    expect(baseOf(r, 2)).toBe(4000);
    expect(r.hits[0].target).toBe('monster2');
    expect(r.hits[1].target).toBe('monster1');
    expect(r.hits[2].target).toBe('monster3');
    // 首组伤害锚点
    expect(r.hits[0].total).toBeCloseTo(1265.1428571428569, 6);
    expect(r.hits[1].total).toBeCloseTo(2108.5714285714284, 6);
    expect(r.report.totalDamage).toBe(19188);
    expect(r.events.length).toBe(18);
  }, 120_000);

  it('B 风堇单人：战技治疗链、终招回能、累计治疗量进终态', () => {
    const r = run('B', () => {
      const cfg = baseConfig();
      (cfg.members as unknown[])[0] = memberOf('fengjin');
      (cfg.members![0].panel as { hp: number }).hp = 7000;
      (cfg.members![0].panel as { speed: number }).speed = 110;
      (cfg.members![0].panel as { element: string }).element = 'Wind';
      return cfg;
    });
    const acts = r.events.filter((e: Ev) => e.kind === 'action' || e.kind === 'ult');
    const s0 = acts.find((e) => e.skillCode === 'fengjin.skill')!;
    expect(s0.time).toBeCloseTo(90.91, 2); // 10000/110
    expect(s0.spAfter).toBe(2); // 战技 bp1 耗 1
    expect(s0.note).toEqual(['fjSummon', 'fjHeal', 'fjSkill']);
    expect(s0.energyAfter).toBe(140); // 初始70 + 战技30 + 首召15+额外30，封顶140
    // 能量链 140 → 开大归5 → 35 → 65 → 85
    const enChain = acts.filter((e) => e.skillCode?.startsWith('fengjin.')).map((e) => e.energyAfter);
    expect(enChain).toEqual([140, 5, 35, 65, 85]);
    // 普攻 7000×0.7=4900（乌云先占 seq0-8 → 按 skillCode 找；乌云见用例E）
    const basic = r.hits.find((h) => h.skillCode === 'fengjin.basic')!;
    expect(baseOf(r, basic.seq)).toBe(3500);
    expect(basic.total).toBeCloseTo(2250, 6);
    expect(r.report.totalDamage).toBeCloseTo(17416.6714286, 6);
    // 累计治疗量含溢出（裁定⑦）进 finalState；乌云三触发各清空 50% → 2029.5
    expect(r.finalState.fjHealAccum).toBe(2029.5);
  }, 120_000);

  /** 风堇雨过天晴配置（与B同参，E0/E6 各一份） */
  function fjCfg(eidolonLevel: number): BattleConfig {
    const cfg = baseConfig();
    const m = memberOf('fengjin');
    (m.panel as { hp: number }).hp = 7000;
    (m.panel as { speed: number }).speed = 110;
    (cfg.members as unknown[])[0] = m;
    (cfg.members![0] as { eidolonLevel: number }).eidolonLevel = eidolonLevel;
    return cfg;
  }

  it('E 雨过天晴：终招与战技后小伊卡界外立即放乌云，普攻不触发（2026-10 裁定）', () => {
    const r = run('E', () => fjCfg(0));
    const acts = r.events.filter((e: Ev) => e.kind === 'action' || e.kind === 'ult');
    // 终招置雨过天晴 → 立即触发（hitSeqs 进终招事件；fjE6 无）
    const ult = acts.find((e) => e.skillCode === 'fengjin.ult')!;
    expect(ult.time).toBeCloseTo(90.91, 2);
    expect(ult.note).toEqual(['fjHeal', 'fjUlt', 'fjRain']);
    expect(ult.hitSeqs).toEqual([0, 1, 2]);
    // 终招后的战技（回合入口雨过天晴 3→2）再触发；终招前的战技不触发
    const rainSkill = acts.find((e) => e.skillCode === 'fengjin.skill' && e.hitSeqs)!;
    expect(rainSkill.time).toBeCloseTo(181.82, 2);
    expect(rainSkill.hitSeqs).toEqual([3, 4, 5]);
    expect(rainSkill.note).toEqual(['fjHeal', 'fjSkill', 'fjRain']);
    // 普攻不触发（裁定：仅战技+终结技）
    const basic = acts.find((e) => e.skillCode === 'fengjin.basic')!;
    expect(basic.hitSeqs).toEqual([9]);
    expect(basic.note ?? []).not.toContain('fjRain');
    // 乌云 9 段：基数=累计治疗×0.28（3600→1008、3906→1093.68、4059→1136.52），AoE 三桩
    const memoHits = r.hits.filter((h) => h.skillCode === 'fengjin.memo');
    expect(memoHits).toHaveLength(9);
    expect(memoHits.map((h) => h.source)).toEqual(Array(9).fill('xiaoyika'));
    expect(memoHits.map((h) => h.target)).toEqual([
      'monster1', 'monster2', 'monster3', 'monster1', 'monster2', 'monster3',
      'monster1', 'monster2', 'monster3',
    ]);
    for (const seq of [0, 1, 2]) expect(baseOf(r, seq)).toBeCloseTo(720, 6);
    for (const seq of [3, 4, 5]) expect(baseOf(r, seq)).toBeCloseTo(781.2, 6);
    for (const seq of [6, 7, 8]) expect(baseOf(r, seq)).toBeCloseTo(811.8, 6);
    expect(r.report.totalDamage).toBeCloseTo(17416.6714286, 6);
    // 清空比例 50%：3600→1800→(+2106)3906→1953→(+2106)4059→2029.5
    expect(r.finalState.fjHealAccum).toBe(2029.5);
  }, 120_000);

  it('E6 乌云清空改12%：召唤即挂 fjE6、终招不再重复、累计治疗残留更高（1409 rank6 实读）', () => {
    const r = run('E6', () => fjCfg(6));
    const acts = r.events.filter((e: Ev) => e.kind === 'action' || e.kind === 'ult');
    const summon = acts.find((e) => e.skillCode === 'fengjin.skill')!;
    expect(summon.note).toEqual(['fjE6', 'fjSummon', 'fjHeal', 'fjSkill']);
    const ult = acts.find((e) => e.skillCode === 'fengjin.ult')!;
    expect(ult.note).toEqual(['fjHeal', 'fjUlt', 'fjRain']); // E6 抗穿已在召唤时挂，终招不重复
    const rainSkill = acts.find((e) => e.skillCode === 'fengjin.skill' && e.hitSeqs)!;
    expect(rainSkill.time).toBeCloseTo(181.82, 2);
    expect(rainSkill.note).toEqual(['fjHeal', 'fjSkill', 'fjRain']);
    // E3/E5 技能+2 → lv12 治疗参数变化 → 累计基数不同（dump 实测锚）
    expect(baseOf(r, 0)).toBeCloseTo(873.4, 6);
    expect(baseOf(r, 3)).toBeCloseTo(1443.7819, 6);
    expect(baseOf(r, 6)).toBeCloseTo(1945.717972, 6);
    expect(r.report.totalDamage).toBeCloseTo(36512.9321357, 6);
    // E6 清空 12%：累计残留（dump 实测锚）
    expect(r.finalState.fjHealAccum).toBeCloseTo(7782.871888, 6);
  }, 120_000);

  it('C 长夜月单人：战技召长夜+免SP、忆灵同步行动、忆质成长', () => {
    const r = run('C', () => {
      const cfg = baseConfig();
      const m = memberOf('changyeyue');
      (m.panel as { hp: number }).hp = 6500;
      (m.panel as { speed: number }).speed = 99;
      (m.panel as { element: string }).element = 'Ice';
      (cfg.members as unknown[])[0] = m;
      return cfg;
    });
    const acts = r.events.filter((e: Ev) => e.kind === 'action');
    const s0 = acts.find((e) => e.skillCode === 'changyeyue.skill')!;
    expect(s0.time).toBeCloseTo(101.01, 2); // 10000/99
    expect(s0.spAfter).toBe(3); // 战技免SP（裁定③）
    expect(s0.note).toEqual(['cySummon', 'cySkill']);
    expect(s0.energyAfter).toBe(155); // 初始120 + 30 + point07 5（实测锚）
    // 召长夜：同刻忆灵追加行动（99速 vs 忆灵更高速 → 同刻紧随）
    const memo0 = acts.find((e) => e.unitId === 'changye' && e.skillCode === 'changyeyue.memo')!;
    expect(memo0.time).toBeCloseTo(101.01, 2);
    expect(memo0.energyAfter).toBe(160);
    expect(memo0.note).toContain('cyMemoAtk');
    // 忆质成长：忆灵伤害基数 2730 → 3185 → 3640
    const memoHits = r.hits.filter((h) => h.source === 'changye');
    expect(baseOf(r, memoHits[0].seq)).toBeCloseTo(4550, 4);
    expect(baseOf(r, memoHits[2].seq)).toBeCloseTo(8580, 4);
    expect(baseOf(r, memoHits[4].seq)).toBeCloseTo(4290, 4);
    // 长夜月普攻（141301）：6500×0.7=4550
    const basic = r.hits.find((h) => h.skillCode === 'changyeyue.basic')!;
    expect(baseOf(r, basic.seq)).toBe(3250);
    expect(r.report.totalDamage).toBeCloseTo(37677.32094047999, 4);
  }, 120_000);

  it('D 昔涟单人：战技获追忆显示、普攻结界真伤 24%', () => {
    const r = run('D', () => {
      const cfg = baseConfig();
      const m = memberOf('xilian');
      (m.panel as { hp: number }).hp = 7500;
      (m.panel as { speed: number }).speed = 101;
      (cfg.members as unknown[])[0] = m;
      return cfg;
    });
    const acts = r.events.filter((e: Ev) => e.kind === 'action');
    const skills = acts.filter((e) => e.skillCode === 'xilian.skill');
    expect(skills.length).toBe(3);
    expect(skills[0].time).toBeCloseTo(99.01, 2); // 10000/101
    expect(skills[0].spAfter).toBe(2); // 战技 bp1 耗 1 SP
    expect(skills[0].note).toContain('xilianSkill');
    // 能量列 = 追忆（裁定②：每战技+3 → 3/6/9 实测链）
    expect(skills.map((e) => e.energyAfter)).toEqual([3, 6, 9]);
    // 普攻 7500×0.7=5250 直伤 + 结界真伤 = 原伤×0.24
    const direct = r.hits.find((h) => h.kind === 'direct')!;
    expect(baseOf(r, direct.seq)).toBe(3750);
    expect(direct.total).toBeCloseTo(1976.785714285714, 6);
    const trueHit = r.hits.find((h) => h.kind === 'trueDamage')!;
    expect(trueHit.target).toBe(direct.target);
    expect(trueHit.total).toBeCloseTo(474.4285714285714, 6);
    expect(trueHit.total / direct.total).toBeCloseTo(0.24, 10);
    // 昔涟 E0 + 战技结界（141502 lv10 #1 = 0.24）：真伤占总伤比例恒 = 0.24/1.24 = 19.3548%
    // （2026-11-02 crosscheck：跨关卡通用的判据，单次行动稳定命中即可比）
    expect(trueHit.total / (direct.total + trueHit.total)).toBeCloseTo(0.193548387096774, 9);
    expect(r.report.totalDamage).toBeCloseTo(2451.2142857142853, 6);
  }, 120_000);
});
