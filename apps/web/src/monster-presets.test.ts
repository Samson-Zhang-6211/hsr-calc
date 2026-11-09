import { describe, expect, it } from 'vitest';
import { STAGE_PACKS, simulateBattle, type CombatMember, type MemberPanel } from '@hsr-calc/engine';
import {
  packSections,
  presetArtId,
  stageModeViews,
  stagePackViews,
  stagePreset,
  stagePresets,
} from './monster-presets';

// ── 关卡选择：包/段结构 + 端到端闭环（2026-10-30 第三十九轮重建）──
// 这条链是 web 侧的真实入口：**模式 → 期数 → 关卡/半 → 段预设 → BattleConfig → 战斗**。
//
// ⚠ 说明：本文件在第三十九轮被误**整文件覆盖**（原为并行会话写的 11 例，git 未跟踪、
// 无 checkpoint、会话日志无痕迹 → 不可恢复）。现按 `docs/AGENTS-stages.md` 记录的覆盖点
// （包/段计数、三级顺序、四模式数值锚、仲裁 5 关、星启单段、pure 波次展开数）重建，
// 数值锚全部来自本轮实跑 dump，并补上「17 段逐个跑通」的端到端用例。
//
// 数值锚（dump 定锚）：
//   包 5：moc-p43 / moc-p44 / pure-p27 / apo-p21 / arb-p10
//   数据层关卡 13（moc×2 + pure×2 + apo×2 + arb×5），可选段 17（boss 拆上下半 + 每包 1 个星启）
//   roundMode：moc/pure = forgotten、apo = phantom、arb = arbiter
//   arb 5 关 level = 100/120/95/95/95；totalHp = 2366503/9466011/3735988/2182237/2042574
//   pure 波次展开 = 30/41/41（小怪潮 count 13~20 展开，见文末已知限制）

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 200_000,
    attack: 3000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(160) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
];

const pack = (id: string) => STAGE_PACKS.find((p) => p.id === id)!;

describe('关卡选择 · 结构与计数', () => {
  it('5 个包 / 13 个数据层关卡 / 17 个可选段', () => {
    expect(STAGE_PACKS.map((p) => p.id)).toEqual(['moc-p43', 'moc-p44', 'pure-p27', 'apo-p21', 'arb-p10']);
    expect(STAGE_PACKS.reduce((n, p) => n + p.stages.length, 0)).toBe(13);
    expect(stagePresets().length).toBe(17);
    expect(stagePackViews().length).toBe(5);
    // 段 = boss 关拆上下半（2）+ 星启 1；仲裁单段关 5
    expect(packSections('moc-p43').length).toBe(3);
    expect(packSections('moc-p44').length).toBe(3);
    expect(packSections('pure-p27').length).toBe(3);
    expect(packSections('apo-p21').length).toBe(3);
    expect(packSections('arb-p10').length).toBe(5);
    // 每个包至少 1 段，且按包能取回同样的段（顺序一致）
    for (const view of stagePackViews()) {
      expect(view.sections.length, `${view.pack.id} 没有可选项`).toBeGreaterThan(0);
      expect(packSections(view.pack.id).map((s) => s.key)).toEqual(view.sections.map((s) => s.key));
    }
  });

  it('三级顺序：模式 moc → pure → apo → arb，各自包数 2/1/1/1', () => {
    const modes = stageModeViews();
    expect(modes.map((m) => m.mode)).toEqual(['moc', 'pure', 'apo', 'arb']);
    expect(modes.map((m) => m.packs.length)).toEqual([2, 1, 1, 1]);
    expect(modes.flatMap((m) => m.packs.map((v) => v.pack.id))).toEqual([
      'moc-p43',
      'moc-p44',
      'pure-p27',
      'apo-p21',
      'arb-p10',
    ]);
  });

  it('四模式轮次锚：forgotten / forgotten / phantom / arbiter，期数 43/44/27/21/10', () => {
    expect(pack('moc-p43').roundMode).toBe('forgotten');
    expect(pack('moc-p44').roundMode).toBe('forgotten');
    expect(pack('pure-p27').roundMode).toBe('forgotten');
    expect(pack('apo-p21').roundMode).toBe('phantom');
    expect(pack('arb-p10').roundMode).toBe('arbiter');
    expect(STAGE_PACKS.map((p) => p.period)).toEqual([43, 44, 27, 21, 10]);
    // 段预设必须原样带上所在包的 roundMode（两页据此设战斗模式）
    for (const s of stagePresets()) expect(s.roundMode).toBe(pack(s.packId).roundMode);
  });

  it('仲裁 5 关：序号 1~5、等级 100/120/95/95/95、血量锚一致', () => {
    const arb = stagePresets().filter((s) => s.packId === 'arb-p10');
    expect(arb.map((s) => s.stage.index)).toEqual([1, 2, 3, 4, 5]);
    expect(arb.map((s) => s.level)).toEqual([100, 120, 95, 95, 95]);
    expect(arb.map((s) => s.hp)).toEqual([2366503, 9466011, 3735988, 2182237, 2042574]);
    // 单段关：没有 half，key 以 `|` 结尾
    for (const s of arb) {
      expect(s.half).toBeUndefined();
      expect(s.key.endsWith('|')).toBe(true);
      expect(s.stage.kind).toBe('single');
    }
  });

  it('星启单段：4 个含星启的包各 1 段、kind=star、无弱点标签（仲裁没有星启）', () => {
    const stars = stagePresets().filter((s) => s.stage.index === 0);
    expect(stars.length).toBe(4);
    expect(stars.map((s) => s.packId)).toEqual(['moc-p43', 'moc-p44', 'pure-p27', 'apo-p21']);
    expect(pack('arb-p10').stages.some((s) => s.index === 0), '仲裁不该有星启关').toBe(false);
    for (const s of stars) {
      expect(s.stage.kind).toBe('star');
      expect(s.half).toBeUndefined();
      expect(Array.isArray(s.tags)).toBe(true);
      expect(packSections(s.packId).filter((x) => x.stage.index === 0).length).toBe(1);
    }
    // 星启等级：moc 95 / pure 85 / apo 90
    expect(stars.find((s) => s.packId === 'moc-p43')!.level).toBe(95);
    expect(stars.find((s) => s.packId === 'pure-p27')!.level).toBe(85);
    expect(stars.find((s) => s.packId === 'apo-p21')!.level).toBe(90);
  });

  it('pure 波次展开数：小怪潮按 count 展开成 30/41/41', () => {
    for (const s of stagePresets().filter((x) => x.packId === 'pure-p27')) {
      expect(s.waves.map((w) => w.length), `${s.key} 波次展开数不符`).toEqual([30, 41, 41]);
    }
  });

  it('虚构段预设带波次规则（裁定 56；其余模式不带）', () => {
    for (const s of stagePresets()) {
      if (s.mode === 'pure') {
        expect(s.waveClearRule, `${s.key} 缺 waveClearRule`).toBe('pure');
        expect(s.pureKillTarget, `${s.key} 缺 pureKillTarget`).toBe(20);
      } else {
        expect(s.waveClearRule, `${s.key} 不该带 waveClearRule`).toBeUndefined();
        expect(s.pureKillTarget, `${s.key} 不该带 pureKillTarget`).toBeUndefined();
      }
    }
  });
});

describe('关卡选择 · 端到端', () => {
  it('每段的 key 格式 / 等级 / 血量 / 阵容字段合法', () => {
    for (const s of stagePresets()) {
      const expectKey = s.half ? `${s.packId}|${s.stage.index}|${s.half}` : `${s.packId}|${s.stage.index}|`;
      expect(s.key, `${s.key} 的 key 格式不对`).toBe(expectKey);
      expect(s.level, `${s.key} 等级非正`).toBeGreaterThanOrEqual(1);
      expect(s.hp, `${s.key} 血量非正`).toBeGreaterThan(0);
      expect(s.waves.length, `${s.key} 没有波次`).toBeGreaterThan(0);
      if (s.stage.index !== 0) expect(s.tags.length, `${s.key} 没有属性标签`).toBeGreaterThan(0);
      for (const wave of s.waves) {
        expect(wave.length, `${s.key} 有空波次`).toBeGreaterThan(0);
        // 已知模型限制：虚构 P27 是小怪潮（单波 30~41 只），引擎只有 3 槽 → 只打前 3 只。
        // 用户裁定（第三十九轮）：第一波按「击败一定个数」推进，第二/三波按「击败 boss」结束。
        const tide = s.packId === 'pure-p27';
        if (!tide) expect(wave.length, `${s.key} 单波超过 3 只`).toBeLessThanOrEqual(3);
        for (const foe of wave) {
          expect(foe.monsterId, `${s.key} 怪物 id 非法: ${foe.monsterId}`).toMatch(/^\d+$/);
          expect(foe.level, `${s.key}/${foe.monsterId} 等级非正`).toBeGreaterThanOrEqual(1);
          expect(foe.hp, `${s.key}/${foe.monsterId} 血量非正`).toBeGreaterThan(0);
          expect(foe.speed, `${s.key}/${foe.monsterId} 速度非正`).toBeGreaterThan(0);
          // 8003060「虚构集合体」数据里就是 `weak: []`（不可击破的计分体）
          if (foe.monsterId !== '8003060') {
            expect(foe.weaknesses.length, `${s.key}/${foe.monsterId} 无弱点`).toBeGreaterThan(0);
          }
        }
      }
      expect(presetArtId(s), `${s.key} 取不到美术 id`).toBe(s.waves[0]![0]!.monsterId);
      expect(stagePreset(s.key)?.key).toBe(s.key);
    }
    expect(stagePreset('')).toBeUndefined();
    expect(stagePreset('not-a-key')).toBeUndefined();
  });

  it('17 个可选项逐个跑完整条链：段预设 → 战斗 → 非空战报', () => {
    const seen: string[] = [];
    for (const s of stagePresets()) {
      const waves = s.waves.map((w) => w.map((c) => ({ ...c, hp: Math.min(c.hp, 1_500_000) })));
      const r = simulateBattle({
        members: members(),
        monsterWaves: waves,
        techniques: false,
        rounds: 6,
        maxTime: 4000,
        roundMode: s.roundMode,
        mechanics: s.mechanics.length > 0 ? s.mechanics.map((m) => m.name) : undefined,
      });
      expect(r.events.length, `${s.key} 跑不出事件`).toBeGreaterThan(0);
      expect(r.hits.length, `${s.key} 没有任何命中`).toBeGreaterThan(0);
      expect(Number.isFinite(r.finalState.monsterHp), `${s.key} 敌方剩血不是有限数`).toBe(true);
      expect(Object.values(r.finalState.memberHp).every((v) => Number.isFinite(v)), `${s.key} 我方血量不是有限数`).toBe(
        true,
      );
      seen.push(s.key);
    }
    expect(seen.length).toBe(17);
  });

  it('机制随段下发：包级机制能到段，且随段进战斗', () => {
    const withMech = stagePresets().filter((s) => s.mechanics.length > 0);
    expect(withMech.length, '没有任何可选项带机制，说明解析断了').toBeGreaterThan(0);
    for (const s of withMech) {
      expect(s.mechanics.every((m) => m.name.length > 0 && m.desc.length > 0)).toBe(true);
    }
    for (const s of stagePresets().filter((x) => x.packId === 'moc-p43')) {
      expect(s.mechanics.map((m) => m.name)).toContain('记忆紊流');
    }
    for (const s of stagePresets().filter((x) => x.packId === 'apo-p21')) {
      expect(s.mechanics.map((m) => m.name)).toContain('末法余烬');
    }
  });
});
