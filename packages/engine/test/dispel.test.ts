import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 解除敌方增益回归（2026-10-24；dump 锚点法：数值全部来自 zz-dispel-dump 实测 seed=20261018，勿纯推理改写）
 *  白名单 = 怪侧正值 atkPct/dmgReduction/speedPct（不碰我方施加的负面与 mon.states）；
 *  多个按挂载顺序取首个；佩拉先解除再结算伤害，point08 只落给下一次攻击。 */

type Ev = BattleResult['events'][number];

const MON = {
  level: 90,
  hp: 50_000_000,
  maxToughness: 3000,
  speed: 100,
  monsterId: '8003040',
  attack: 400,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
  enemyClass: 'normal' as const,
};

const PELA = {
  level: 80, hp: 30000, attack: 2500, defence: 800, speed: 105,
  critRate: 0, critDmg: 0, element: 'Ice' as const, energyRegen: 0, damageBonus: 0, breakEffect: 0,
};
const LUKA = {
  level: 80, hp: 30000, attack: 2500, defence: 800, speed: 105,
  critRate: 0, critDmg: 0, element: 'Physical' as const, energyRegen: 0, damageBonus: 0, breakEffect: 0,
};
const JY = {
  level: 80, hp: 30000, attack: 1, defence: 1000, speed: 90,
  critRate: 0, critDmg: 0, element: 'Thunder' as const, energyRegen: 0, damageBonus: 0, breakEffect: 0,
};

function mkCfg(over: Partial<BattleConfig>): BattleConfig {
  return {
    members: [
      { id: 'pela', panel: PELA, eidolonLevel: 0 },
      { id: 'jingyuan', panel: JY, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 4,
    maxTime: 350,
    techniques: false,
    seed: 20261018,
    ...over,
  } as BattleConfig;
}

function pelaActs(r: BattleResult): Ev[] {
  return r.events.filter((e) => e.unitId === 'pela' && (e.action === 'skill' || e.action === 'basic'));
}

function hitOf(r: BattleResult, e: Ev, idx = 0) {
  const seq = e.hitSeqs?.[idx];
  return r.hits.find((h) => h.seq === seq);
}

function factor(h: ReturnType<typeof hitOf>, key: string): number {
  return h?.factors.find((f) => f.key === key)?.value ?? Number.NaN;
}

describe('解除敌方增益（正数值白名单）', () => {
  it('佩拉战技先解除被动减伤，再结算伤害；point08 落给下一次攻击', () => {
    const r = simulateBattle(mkCfg({}));
    const acts = pelaActs(r);
    const first = acts[0];
    expect(first.time).toBeCloseTo(95.23809523809524, 10);
    expect(first.note ?? []).toContain('pelaDispel');
    // 被动 10% 减伤已在伤害结算前移除 → reduction = 1
    expect(factor(hitOf(r, first), 'reduction')).toBe(1);
    // point08：本次伤害不吃（dmgBonus=1），事件快照里已挂给下一次
    expect(factor(hitOf(r, first), 'damageBonus')).toBe(1);
    const p08 = (first.buffs?.pela ?? []).find((b) => b.labelKey === 'pelaP08');
    expect(p08).toMatchObject({ key: 'damageBonus', source: 'pela', value: 0.2, duration: -1 });

    // 第二次战技：目标已无增益可解（无 pelaDispel），但 point08 生效后消费
    const second = acts[1];
    expect(second.time).toBeCloseTo(190.47619047619048, 10);
    expect(second.note ?? []).not.toContain('pelaDispel');
    expect(factor(hitOf(r, second), 'damageBonus')).toBeCloseTo(1.2, 10);
    expect((second.buffs?.pela ?? []).some((b) => b.labelKey === 'pelaP08')).toBe(false);
  });

  it('对照（无增益怪）：不解增益、不挂 point08，第二次战技 dmgBonus=1', () => {
    const r = simulateBattle(mkCfg({ monster: { ...MON, monsterId: '1004011' } }));
    const acts = pelaActs(r);
    expect(acts[0].note ?? []).not.toContain('pelaDispel');
    expect((acts[0].buffs?.pela ?? []).some((b) => b.labelKey === 'pelaP08')).toBe(false);
    expect(factor(hitOf(r, acts[1]), 'damageBonus')).toBe(1);
  });

  it('佩拉 E2 解增益后自身速度 +10% 两回合，到期还原', () => {
    const r = simulateBattle(mkCfg({
      members: [
        { id: 'pela', panel: PELA, eidolonLevel: 2 },
        { id: 'jingyuan', panel: JY, eidolonLevel: 0 },
      ],
      rounds: 6,
      maxTime: 500,
    }));
    const times = pelaActs(r).map((e) => e.time);
    expect(times[0]).toBeCloseTo(95.23809523809524, 10);
    expect(times[1]).toBeCloseTo(181.8181818181818, 10);
    expect(times[2]).toBeCloseTo(268.3982683982684, 10);
    expect(times[3]).toBeCloseTo(458.87445887445887, 10);
  });

  it('卢卡 point06：战技先解除目标增益再结算伤害', () => {
    const r = simulateBattle(mkCfg({
      members: [
        { id: 'luka', panel: LUKA, eidolonLevel: 0 },
        { id: 'jingyuan', panel: JY, eidolonLevel: 0 },
      ],
    }));
    const first = r.events.find((e) => e.unitId === 'luka' && e.action === 'skill') as Ev;
    expect(first.note ?? []).toContain('lkDispel');
    expect(factor(hitOf(r, first), 'reduction')).toBe(1);
  });
});
