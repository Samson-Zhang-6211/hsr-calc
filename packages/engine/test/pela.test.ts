import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 佩拉 1106 接入回归（2026-10-19；dump 锚点法：锚点全部来自 x-dump23 实测 seed=20261018，勿纯推理改写） */

type Ev = BattleResult['events'][number];

const MON = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 3000,
  speed: 100,
  monsterId: '1004011',
  attack: 400,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
  enemyClass: 'normal' as const,
};

const PELA_PANEL = {
  level: 80,
  hp: 30000,
  attack: 2500,
  defence: 800,
  speed: 105,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Ice' as const,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

const JY_PANEL = {
  level: 80,
  hp: 30000,
  attack: 3000,
  defence: 1000,
  speed: 135,
  critRate: 0.8,
  critDmg: 1.5,
  element: 'Thunder' as const,
  energyRegen: 0,
  damageBonus: 0.5,
  breakEffect: 0,
};

const WEAK_JY = {
  ...JY_PANEL,
  attack: 1,
  critRate: 0,
  critDmg: 0,
  damageBonus: 0,
};

function mkCfg(over: Partial<BattleConfig> = {}, eidolon = 0, jy = JY_PANEL): BattleConfig {
  return {
    members: [
      { id: 'pela', panel: PELA_PANEL, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: jy, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 4,
    maxTime: 350,
    techniques: false,
    seed: 20261018,
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

const evsOf = (r: BattleResult, pred: (e: Ev) => boolean): Ev[] => r.events.filter(pred);
const close = (a: number, b: number, eps = 0.01): void => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};
const baseOf = (r: BattleResult, seq: number): number =>
  r.hits.find((h) => h.seq === seq)!.factors.find((f) => f.key === 'base')!.value;
const hitOf = (r: BattleResult, seq: number): BattleResult['hits'][number] => r.hits.find((h) => h.seq === seq)!;

describe('佩拉1106（基础机制）', () => {
  it('A 战技/普攻/终招降防40%/天赋回能', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 347385.4, 0.5);
    // 战技 t=95.24：2.1× 单体（此时无负面 → 不回能）
    const skill = evsOf(r, (e) => e.unitId === 'pela' && e.action === 'skill')[0];
    close(skill.time, 95.24, 0.01);
    expect(skill.note).toContain('plSkill');
    expect(skill.note ?? []).not.toContain('pelaData'); // 无负面不触发天赋
    close(skill.energyAfter ?? 0, 85, 0.01);
    expect(skill.spAfter).toBe(1);
    expect(skill.hitSeqs).toHaveLength(1);
    close(hitOf(r, skill.hitSeqs![0]).total, 2475, 0.01);
    // 普攻 t=190.48 已入满 → 终招同刻：AoE 1× + 全体通解防-40% 2回合 + 目标负面回能10
    const basic = evsOf(
      r,
      (e) => e.unitId === 'pela' && e.action === 'basic' && Math.abs(e.time - 190.48) < 0.01,
    )[0];
    close(basic.energyAfter ?? 0, 110, 0.01);
    const ult = evsOf(
      r,
      (e) => e.unitId === 'pela' && e.kind === 'ult' && Math.abs(e.time - 190.48) < 0.01,
    )[0];
    expect(ult.note).toEqual(expect.arrayContaining(['plUlt', 'pelaDef', 'pelaData']));
    expect(ult.note!.filter((n) => n === 'pelaDef')).toHaveLength(3);
    close(ult.energyAfter ?? 0, 15, 0.01);
    expect(ult.hitSeqs).toHaveLength(3);
    for (const s of ult.hitSeqs!) close(hitOf(r, s).total, 1178.57, 0.01);
  });

  it('B 秘技先发制人：0.8×单体 + 全体防-20% → 战技×1.34', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 550724.92, 1);
    const tech = evsOf(r, (e) => e.unitId === 'pela' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toEqual(expect.arrayContaining(['technique', 'plTech', 'pelaDef']));
    expect(tech.note!.filter((n) => n === 'pelaDef')).toHaveLength(3);
    close(tech.energyAfter ?? 0, 55, 0.01);
    expect(tech.spAfter).toBe(3);
    expect(tech.hitSeqs).toHaveLength(1);
    close(hitOf(r, tech.hitSeqs![0]).total, 942.86, 0.01);
    // 战技后已挂 defRed（有负面）→ 天赋回能 + 点06 痛击 ×1.2 与 defRed 40%（m2 主目标）
    const skill = evsOf(r, (e) => e.unitId === 'pela' && e.action === 'skill')[0];
    expect(skill.note).toEqual(expect.arrayContaining(['plSkill', 'pelaData']));
    close(skill.energyAfter ?? 0, 95, 0.01);
    close(hitOf(r, skill.hitSeqs![0]).total, 3317.55, 0.01);
    // 终招 slug 同刻 t=100（owner 已满能量由秘技回填）
    const ult = evsOf(r, (e) => e.unitId === 'pela' && e.kind === 'ult' && Math.abs(e.time - 100) < 0.01)[0];
    close(ult.energyAfter ?? 0, 15, 0.01);
    for (const s of ult.hitSeqs!) close(hitOf(r, s).total, 1579.79, 0.01);
  });

  it('D E4 冰抗-12% 怪侧直改+定时还原（战略场景）', () => {
    const r = run('D', () => mkCfg({}, 4));
    close(r.report.totalDamage, 348226.68, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'pela' && e.action === 'skill')[0];
    expect(skill.note).toEqual(expect.arrayContaining(['plSkill', 'pelaE4']));
    // E3 战技+2 lv12：base=5775
    close(baseOf(r, skill.hitSeqs![0]), 5775, 0.01);
    // E4 后冰抗-12%：战技 total=2722.5
    close(hitOf(r, skill.hitSeqs![0]).total, 2722.5, 0.01);
    // 终招同刻 t=190.48：m2 收益最多（E4 冰抗 + defRed 40% 双重）
    const ult = evsOf(
      r,
      (e) => e.unitId === 'pela' && e.kind === 'ult' && Math.abs(e.time - 190.48) < 0.01,
    )[0];
    const hits = ult.hitSeqs!.map((s) => hitOf(r, s));
    close(hits.find((h) => h.target === 'monster2')!.total, 1320, 0.01);
    close(hits.find((h) => h.target === 'monster1')!.total, 1178.57, 0.01);
  });

  it('E E6 负面目标附加 0.4×atk 冰伤', () => {
    const r = run('E', () => mkCfg({}, 6));
    close(r.report.totalDamage, 353679.05, 0.5);
    // E5 终招 lv12 base=2700；终招 hits=6（3×ult + 3×E6 附加）
    const ult = evsOf(r, (e) => e.unitId === 'pela' && e.kind === 'ult')[0];
    expect(ult.hitSeqs).toHaveLength(6);
    const ultHits = ult.hitSeqs!.map((s) => hitOf(r, s));
    const e6s = ultHits.filter((h) => h.skillCode === 'pela.eidolon6');
    expect(e6s).toHaveLength(3);
    for (const h of e6s) close(baseOf(r, h.seq), 1000, 0.01);
    close(e6s[0].total, 725.27, 0.01); // m1/m3 无 defRed
    const e6m2 = e6s.find((h) => h.target === 'monster2')!;
    close(e6m2.total, 812.31, 0.01); // m2 吃 defRed 40%
    close(ult.energyAfter ?? 0, 16, 0.01);
    // 普攻 t=285.71 附加同样触发（目标持有通用 debuff）
    const basic = evsOf(
      r,
      (e) => e.unitId === 'pela' && e.action === 'basic' && Math.abs(e.time - 285.71) < 0.01,
    )[0];
    expect(basic.note).toEqual(expect.arrayContaining(['pelaData', 'pelaE6']));
    close(baseOf(r, basic.hitSeqs![1]), 1000, 0.01);
  });

  it('F E1 击杀回能5（弱景元+低血怪杀 m2）', () => {
    // 2026-10-29 等级口径修正后佩拉普攻 1650→1178.57，木桩血量随之下调以保住「普攻击杀 m2」前提
    const r = run('F', () =>
      mkCfg({ monster: { ...MON, hp: 3600, maxToughness: 3000 } }, 1, WEAK_JY),
    );
    close(r.report.totalDamage, 7825.75, 0.5);
    const basic = evsOf(
      r,
      (e) => e.unitId === 'pela' && e.action === 'basic' && Math.abs(e.time - 190.48) < 0.01,
    )[0];
    // 2475+1178.57 > 3600 → m2 死；E1 回 5 能
    close(basic.energyAfter ?? 0, 110, 0.01);
    const ult = evsOf(
      r,
      (e) => e.unitId === 'pela' && e.kind === 'ult' && Math.abs(e.time - 190.48) < 0.01,
    )[0];
    expect(ult.hitSeqs).toHaveLength(2); // m2 已死，AoE 只打存活怪
    for (const s of ult.hitSeqs!) close(hitOf(r, s).total, 1178.57, 0.01);
  });

  it('G point07 秘策：佩拉在场全队效果命中 +10%（进战常驻 effectHit buff）', () => {
    const r = run('G', () => mkCfg());
    const first = evsOf(r, (e) => e.buffs !== undefined)[0];
    for (const id of ['pela', 'jingyuan']) {
      const b = (first.buffs?.[id] ?? []).find((x) => x.labelKey === 'pelaP07');
      expect(b?.key).toBe('effectHit');
      close(b!.value, 0.1, 1e-9);
      expect(b?.duration).toBe(-1);
    }
    // 无佩拉时不存在该 buff
    const noPela = run('G2', () =>
      mkCfg({ members: [
        { id: 'sampo', panel: PELA_PANEL, eidolonLevel: 0 },
        { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
      ] } as Partial<BattleConfig>),
    );
    const first2 = evsOf(noPela, (e) => e.buffs !== undefined)[0];
    expect(Object.values(first2.buffs ?? {}).some((arr) => (arr ?? []).some((x) => x.labelKey === 'pelaP07'))).toBe(false);
  });
});
