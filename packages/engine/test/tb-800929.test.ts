import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 欢愉开拓者升格 800929 #3（2026-11-02 round 35 实现）
 *
 * 原文：终结技触发星神★阿哈的欢愉技前，额外触发一次开拓者的欢愉技（倍率 +#2，x=我方最高【绝活共赏】）；
 * **随后触发的星神★阿哈欢愉技，其真实伤害改为按上述开拓者欢愉技造成伤害的 #3=20% 计算，由敌方全体均分**。
 *
 * 锚点：临时 `_tb-sg-dump`（2 人队 trailblazer+aha，`mainC:'aha'`，seed 20261011）
 *   → 开拓者终招 `note` 含 `tbSgAha`；随后 `ahaMoment` 事件的 3 条 `elationTrueSg` 命中，
 *     `base` = 该次开拓者欢愉技总伤（16079.87）、`trueDamage` = 0.2、`split` = 1/3、
 *     `total` = base×0.2/3 = 1072.0。
 */

const mon = {
  level: 90,
  hp: 5_000_000,
  maxHp: 5_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'imaginary'] as Element[],
};

const panel = (attack: number, speed: number) => ({
  level: 80,
  hp: 8000,
  attack,
  defence: 900,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: 0.3,
  element: 'Physical' as Element,
  damageBonus: 0,
  breakEffect: 0,
});

const cfg = (): BattleConfig =>
  ({
    rounds: 6,
    maxTime: 600,
    techniques: false,
    members: [
      { id: 'trailblazer', panel: panel(800, 130), eidolonLevel: 0 },
      { id: 'aha', panel: panel(3000, 120), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'aha',
    seed: 20261011,
  }) as unknown as BattleConfig;

type Hit = {
  seq: number;
  total: number;
  note?: string;
  kind?: string;
  factors?: { key: string; value: number }[];
};

describe('欢愉开拓者升格 800929 #3（阿哈欢愉技真伤改为开拓者欢愉技伤害的 20% 均分）', () => {
  it('开拓者终招带出 tbSgAha；随后阿哈时刻真伤按 20%×(开拓者欢愉技伤害)/敌数', () => {
    const rep = simulateBattleReplay(cfg());
    const hits = (rep.result as unknown as { hits?: Hit[] }).hits ?? [];
    // ① 开拓者终招（目标=阿哈）额外欢愉技的 note
    const tbUlts = rep.steps.map((s) => s.event).filter((e) => e.kind === 'ult' && e.unitId === 'trailblazer');
    expect(tbUlts.length).toBeGreaterThan(0);
    expect((tbUlts[0].note ?? []).join(',')).toContain('tbSgAha');

    // ② 阿哈时刻的真伤段走替换口径
    const sgTrue = hits.filter((h) => h.note === 'elationTrueSg');
    expect(sgTrue.length).toBeGreaterThan(0);
    const first = sgTrue[0];
    const get = (k: string) => first.factors?.find((f) => f.key === k)?.value ?? NaN;
    expect(get('trueDamage')).toBeCloseTo(0.2, 10); // #3=20%
    expect(get('split')).toBeCloseTo(1 / 3, 10); // 3 个存活敌方均分
    expect(first.total).toBeCloseTo((get('base') * 0.2) / 3, 6);
    // 每次阿哈时刻按存活敌数各出一段
    const perMoment = new Map<string, number>();
    for (const s of rep.steps) {
      if (s.event.unitId !== 'ahaMoment') continue;
      const n = sgTrue.filter((h) => (s.event.hitSeqs ?? []).includes(h.seq)).length;
      if (n > 0) perMoment.set(`t${s.event.time.toFixed(1)}`, n);
    }
    // 只有「开拓者终招武装之后」的阿哈时刻才走替换口径
    expect(perMoment.size).toBeGreaterThan(0);
    for (const [, n] of perMoment) expect(n).toBe(3);
  }, 120_000);
});
