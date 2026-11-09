import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 风堇 1409：小伊卡受击/被动治疗/冻结抵抗/解控/消失拉条的确定性锚点。
 * 锚点来自 %TEMP%/opencode/fj-freeze-dump.txt 实测（2026-10），勿纯推理改写。 */

type Ev = BattleResult['events'][number];

const MON = {
  monsterId: '1004011',
  level: 90,
  hp: 5_000_000,
  maxHp: 5_000_000,
  toughness: 99999,
  maxToughness: 99999,
  broken: false,
  attack: 1000,
  speed: 100,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'imaginary'] as Element[],
};

function soloConfig(): BattleConfig {
  return {
    rounds: 6,
    maxTime: 500,
    techniques: false,
    members: [
      {
        id: 'fengjin',
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
        eidolonLevel: 0,
      },
    ],
    monster: { ...MON },
    seed: 20261011,
  } as BattleConfig;
}

describe('风堇 1409（小伊卡 + 效果抵抗）', () => {
  it('A 召唤/回能/冻结抵抗/解控/消失拉条（可可利亚 100401104）', () => {
    const r = simulateBattle(soloConfig());
    const skill0 = r.events.find((e: Ev) => e.skillCode === 'fengjin.skill')!;
    expect(skill0.time).toBeCloseTo(90.909, 3);
    expect(skill0.note).toEqual(['fjSummon', 'fjHeal', 'fjSkill']);
    expect(skill0.energyAfter).toBe(140); // 70 + 战技30 + 首召15+30，封顶140

    // point07 效果抵抗 +50% → 100401104 基础100%冻结在首个随机流失败
    const resist = r.events.find((e: Ev) => (e.note ?? []).includes('freezeResist'))!;
    expect(resist.time).toBe(100);
    expect(resist.skillCode).toBe('monster.100401104');

    // 同一场后续命中成功冻结
    const frozen = r.events.find((e: Ev) => (e.note ?? []).includes('freeze'))!;
    expect(frozen.time).toBe(200);
    expect(frozen.skillCode).toBe('monster.100401104');

    // 风堇 point07：战技解除冻结
    const cleanse = r.events.find((e: Ev) => (e.note ?? []).includes('fjCleanse'))!;
    expect(cleanse.time).toBeCloseTo(245.4545, 3);
    expect(cleanse.skillCode).toBe('fengjin.skill');

    // 1140903 连续消耗小伊卡生命 → 消失时风堇行动提前 30%
    const fall = r.events.find((e: Ev) => (e.note ?? []).includes('fjFall'))!;
    expect(fall.time).toBe(200);
    expect(fall.note).toContain('fjFall');
  }, 120_000);

  it('B 1140903 被动治疗与雨过天晴额外全队治疗', () => {
    const r = simulateBattle(soloConfig());
    const passive = r.events.find((e: Ev) => (e.note ?? []).includes('fjPassive'))!;
    expect(passive).toBeDefined();
    expect(passive.note).toContain('fjHeal');
    expect(passive.note).toContain('fjRainyHeal');
    // 被动在目标回合开始/行动后触发，不在怪侧事件上
    expect(passive.skillCode).toBe('fengjin.skill');
    expect(r.finalState.fjHealAccum ?? 0).toBeGreaterThan(0);
  }, 120_000);

  it('C point06 暴击/E4 暴伤/point08 生命上限/天赋增伤', () => {
    const cfg = soloConfig();
    (cfg.members![0] as { eidolonLevel: number }).eidolonLevel = 6;
    (cfg.members![0].panel as { speed: number }).speed = 210;
    (cfg.monster as { attack: number }).attack = 0;
    const r = simulateBattle(cfg);
    // 首战技召唤即挂 E6 抗穿
    const skill0 = r.events.find((e: Ev) => e.skillCode === 'fengjin.skill')!;
    expect(skill0.note).toEqual(['fjE6', 'fjSummon', 'fjHeal', 'fjSkill']);
    // point06 +100% 暴击封顶 + E4 210速（10×2%暴伤）→ 暴击因子 1+1×0.7
    const memo = r.hits.find((h) => h.skillCode === 'fengjin.memo')!;
    expect(memo.factors.find((f) => f.key === 'crit')?.value).toBeCloseTo(1.7, 6);
    // 天赋 3 层 ×0.8 → 增伤因子 3.4（1+2.4）
    expect(memo.factors.find((f) => f.key === 'damageBonus')?.value).toBeCloseTo(3.4, 6);
    // point08：速度>200，风堇生命上限 +20%；普攻 base=7000×1.2×0.7
    const basic = r.hits.find((h) => h.skillCode === 'fengjin.basic')!;
    expect(basic.factors.find((f) => f.key === 'base')?.value).toBeCloseTo(4620, 6);
    expect(basic.factors.find((f) => f.key === 'crit')?.value).toBeCloseTo(1.7, 6);
  }, 120_000);
});
