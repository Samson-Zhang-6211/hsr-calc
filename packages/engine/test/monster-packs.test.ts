import { describe, expect, it } from 'vitest';
import {
  STAGE_PACKS,
  STAGE_SCALES,
  STAGE_SCALES_BY_GROUP,
  buildPackStageWaves,
  buildStageMonster,
  packStage,
  stagePack,
  stageScale,
  stageSections,
  type StageFoe,
} from '../src/index.js';

// ── 关卡包（多包 STAGE_PACKS）接入锚点 ──
// 数据源：data/monster-stages/{moc-p43,moc-p44,pure-p27,apo-p21,arb-p10}.json
//   → scripts/gen-monster-stages.mjs → packages/engine/src/combat/monster-stages.ts
// 难度分组：混沌回忆 / 异相仲裁 = HardLevelGroup 3；虚构叙事 / 末日幻影 = 第 1 组（站点页面 tooltip 原文）。

describe('关卡包表（STAGE_PACKS）', () => {
  it('5 包，顺序 = 模式顺序 moc → pure → apo → arb', () => {
    expect(STAGE_PACKS.map((p) => p.id)).toEqual([
      'moc-p43',
      'moc-p44',
      'pure-p27',
      'apo-p21',
      'arb-p10',
    ]);
    expect(STAGE_PACKS.map((p) => p.mode)).toEqual(['moc', 'moc', 'pure', 'apo', 'arb']);
    expect(STAGE_PACKS.map((p) => p.period)).toEqual([43, 44, 27, 21, 10]);
    expect(STAGE_PACKS.map((p) => p.roundMode)).toEqual([
      'forgotten',
      'forgotten',
      'forgotten',
      'phantom',
      'arbiter',
    ]);
    expect(STAGE_PACKS.map((p) => p.difficultyGroup)).toEqual([3, 3, 1, 1, 3]);
  });

  it('每包只暴露裁定的关卡（最难关 + 星启 / 仲裁 5 关）', () => {
    const moc43 = stagePack('moc-p43')!;
    expect(moc43.title).toBe('来生泅渡');
    expect(moc43.stages.map((s) => s.name)).toEqual(['来生泅渡其十二', '星启']);
    expect(moc43.modeMechanics.map((m) => m.name)).toEqual(['记忆紊流']);

    const moc44 = stagePack('moc-p44')!;
    expect(moc44.title).toBe('物竞天择');
    expect(moc44.p).toBe(1036);
    expect(moc44.stages.map((s) => [s.name, s.kind, s.nameEn])).toEqual([
      ['物竞天择其十二', 'boss', 'Stage 12'],
      ['星启', 'star', 'Tierce'],
    ]);

    expect(stagePack('pure-p27')!.stages.map((s) => s.kind)).toEqual(['boss', 'star']);
    expect(stagePack('apo-p21')!.modeMechanics.map((m) => m.name)).toEqual(['末法余烬']);
    expect(stagePack('arb-p10')!.stages.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
    expect(packStage('moc-p44', 99)).toBeUndefined();
    expect(stagePack('moc-p99')).toBeUndefined();
  });

  it('星启 / 仲裁单段关没有 halves，waves 直接给出；boss 关反之', () => {
    const star = packStage('moc-p44', 0)!;
    expect(star.kind).toBe('star');
    expect(star.halves).toEqual([]);
    expect(star.level).toBe(95);
    expect(star.totalHp).toBe(1920367);
    const secs = stageSections(star);
    expect(secs.length).toBe(1);
    expect(secs[0]!.half).toBeUndefined();
    expect(secs[0]!.level).toBe(95);
    expect(secs[0]!.waves.map((w) => w.foes.map((f) => f.monsterId))).toEqual([
      ['4063010', '2013020'],
      ['4064010'],
    ]);

    const king = packStage('arb-p10', 2)!;
    expect(king.kind).toBe('single');
    expect(king.level).toBe(120);
    expect(king.mechanics!.map((m) => m.name)).toEqual(['血嗜+', '洞穿+', '不屈']);

    const boss = packStage('moc-p43', 12)!;
    expect(boss.halves.length).toBe(2);
    expect(boss.waves).toEqual([]);
    expect(stageSections(boss).map((s) => s.half)).toEqual(['上半', '下半']);
  });
});

describe('难度乘区（按组）', () => {
  it('第 1 组（虚构 / 末日）与第 3 组（混沌 / 仲裁）分开存', () => {
    expect(Object.keys(STAGE_SCALES_BY_GROUP).sort()).toEqual(['1', '3']);
    // 兼容别名仍是第 3 组
    expect(STAGE_SCALES).toBe(STAGE_SCALES_BY_GROUP[3]);
    // 同等级不同组数值不同（Lv95 只在第 3 组出现；Lv90 两组都有）
    expect(stageScale(3, 90)!.atk).toBeCloseTo(33.894765, 5);
    expect(stageScale(1, 90)!.atk).not.toBeCloseTo(33.894765, 3);
    expect(stageScale(1, 85)!.hp).toBeCloseTo(188.263594, 5);
    expect(stageScale(1, 999)).toBeUndefined();
    expect(stageScale(9, 95)).toBeUndefined();
  });

  it('仲裁绝境王棋 Lv120 有第 3 组乘区（旧表只到 95）', () => {
    const sc = stageScale(3, 120)!;
    expect(sc).toBeDefined();
    expect(sc.hp).toBeGreaterThan(stageScale(3, 100)!.hp);
  });
});

describe('buildPackStageWaves（逐包波次拼装）', () => {
  it('moc-p43 其十二上半：曙光 + 外宇宙之冰 → 火花大会@Official（Lv95 / 第 3 组）', () => {
    const waves = buildPackStageWaves('moc-p43', 12, '上半');
    expect(waves.map((w) => w.map((c) => c.monsterId))).toEqual([
      ['5013060', '8003010'],
      ['5014010'],
    ]);
    const first = waves[0]![0]!;
    expect(first.hp).toBe(523737);
    expect(first.level).toBe(95);
    expect(first.attack).toBeCloseTo(18 * 34.75065, 4);
    expect(first.speed).toBeCloseTo(120 * 1.32, 4);
    expect(first.maxToughness).toBe(480);
    expect(first.enemyClass).toBe('elite');
    // effectRes / effectHit 改为按等级乘区现算（base 0.2 + add 0.1 / 0.36）
    expect(first.effectRes).toBeCloseTo(0.3, 6);
    expect(first.effectHit).toBeCloseTo(0.36, 6);
  });

  it('apo 难度04：第 1 组 Lv90，上下半各 1 只', () => {
    const up = buildPackStageWaves('apo-p21', 4, '上半');
    const down = buildPackStageWaves('apo-p21', 4, '下半');
    expect(up.map((w) => w.map((c) => c.monsterId))).toEqual([['2004014']]);
    expect(down.map((w) => w.map((c) => c.monsterId))).toEqual([['4064012']]);
    expect(up[0]![0]!.attack).toBeCloseTo(18 * stageScale(1, 90)!.atk, 4);
    expect(down[0]![0]!.hp).toBe(7259250);
  });

  it('pure 其四上半：波 1 展开成 30 只（×13/×14/×2/×1），hp 取页面值（含波次增幅，不二次乘）', () => {
    const waves = buildPackStageWaves('pure-p27', 4, '上半');
    expect(waves.length).toBe(3);
    expect(waves[0]!.length).toBe(30);
    expect(waves[0]!.map((c) => c.monsterId).slice(0, 1)).toEqual(['4022010']);
    expect(waves[0]![0]!.hp).toBe(262628);
    expect(waves[0]![0]!.attack).toBeCloseTo(18 * stageScale(1, 85)!.atk, 4);
    // 每只怪都按 Lv85 / 第 1 组算
    for (const c of waves.flat()) expect(c.level).toBe(85);
  });

  it('arb 绝境王棋：Lv120 两波，亚婆离 4,056,862', () => {
    const waves = buildPackStageWaves('arb-p10', 2);
    expect(waves.map((w) => w.map((c) => c.monsterId))).toEqual([
      ['4023020', '8033020'],
      ['5034010'],
    ]);
    const hoolay = waves[1]![0]!;
    expect(hoolay.hp).toBe(4056862);
    expect(hoolay.level).toBe(120);
    expect(hoolay.attack).toBeCloseTo(18 * stageScale(3, 120)!.atk, 4);
  });

  it('星启单段关也能出波次；未知包 / 关卡 → 空数组', () => {
    const star = buildPackStageWaves('moc-p44', 0);
    expect(star.map((w) => w.map((c) => c.monsterId))).toEqual([['4063010', '2013020'], ['4064010']]);
    expect(buildPackStageWaves('moc-p99', 0)).toEqual([]);
    expect(buildPackStageWaves('moc-p44', 99)).toEqual([]);
    // boss 关忽略 half 时不筛选（上下半顺接）
    expect(buildPackStageWaves('moc-p44', 12).length).toBe(4);
  });
});

describe('buildStageMonster（逐怪配置）', () => {
  const foe: StageFoe = {
    monsterId: '5013010',
    hp: 628484,
    count: 1,
    name: '摇滚狂徒',
    rank: '精英',
  };

  it('第 3 组 Lv95：攻/速/韧走 模板 × 子变体 × 乘区，hp 用数据值', () => {
    const c = buildStageMonster(foe, 95, 3)!;
    expect(c.hp).toBe(628484);
    expect(c.attack).toBeCloseTo(625.5117, 4);
    expect(c.speed).toBeCloseTo(174.24, 4);
    expect(c.maxToughness).toBe(360);
    expect(c.weaknesses).toEqual(['Physical', 'Fire', 'Wind']);
    expect(c.resistance).toEqual({ Ice: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 });
    expect(c.effectRes).toBeCloseTo(0.3, 6);
    expect(c.effectHit).toBeCloseTo(0.36, 6);
  });

  it('缺乘区 / 缺档案 → undefined', () => {
    expect(buildStageMonster(foe, 999, 3)).toBeUndefined();
    expect(buildStageMonster({ ...foe, monsterId: '9999999' }, 95, 3)).toBeUndefined();
  });
});
