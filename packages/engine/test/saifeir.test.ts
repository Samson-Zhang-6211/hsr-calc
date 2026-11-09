import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 赛飞儿 1406 接入回归（2026-10-20；dump 锚点法：锚点全部来自 lgs-dump 实测 seed=20261018，勿纯推理改写） */

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

const SF_PANEL = {
  level: 80,
  hp: 30000,
  attack: 2500,
  defence: 800,
  speed: 106,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Quantum' as const,
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

function mkCfg(over: Partial<BattleConfig> = {}, eidolon = 0): BattleConfig {
  return {
    members: [
      { id: 'saifeir', panel: SF_PANEL, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
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

describe('赛飞儿1406（基础机制）', () => {
  it('A 战技老主顾+虚弱+天赋追击+终招记录真伤', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 461851.5768038397, 0.5);
    // 战技 t=94.34：主 2× + 相邻 1×；主目标=老主顾（sfCustomer）；全命中挂虚弱（怪攻-10%）+ 自身攻+30%
    const skill = evsOf(r, (e) => e.unitId === 'saifeir' && e.action === 'skill')[0];
    close(skill.time, 94.33962264150944, 0.01);
    expect(skill.note).toEqual(expect.arrayContaining(['sfSkill', 'sfCustomer', 'sfWeak']));
    close(skill.energyAfter ?? 0, 95, 0.01);
    expect(skill.spAfter).toBe(1);
    close(baseOf(r, 3), 5000, 0.01);
    close(hitOf(r, 3).total, 3299.9999999999995, 0.01);
    for (const s of [4, 5]) {
      close(baseOf(r, s), 2500, 0.01);
      close(hitOf(r, s).total, 1649.9999999999998, 0.01);
    }
    // 天赋追击（老主顾被神君击中 → 1.5×atk×(1+虚弱30%攻)）：base=4875（=3250×1.5）
    const talent = hitOf(r, 21);
    expect(talent.skillCode).toBe('saifeir.talent');
    close(baseOf(r, talent.seq), 4875, 0.01);
    close(talent.total, 3802.499999999999, 0.01);
    // 普攻 t=188.68：1.4× 弱态攻击 3250 → 4550；50%记录 ·
    const basic = evsOf(r, (e) => e.unitId === 'saifeir' && e.action === 'basic')[0];
    expect(basic.hitSeqs).toEqual([28]);
close(baseOf(r, 28), 3250, 0.01);
    close(hitOf(r, 28).total, 2145, 0.01);
    // 终结技 t=188.68：1.2× → 附加记录真伤 25% + 溅射 3×0.4× + 各 25% 
    const ult = evsOf(r, (e) => e.unitId === 'saifeir' && e.kind === 'ult')[0];
    expect(ult.note).toContain('sfUlt');
    expect(ult.hitSeqs).toHaveLength(8);
close(baseOf(r, 29), 3900, 0.01);
    close(hitOf(r, 29).total, 2573.9999999999995, 0.01);
    const ts = ult.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'saifeir.ultTrue');
    expect(ts).toHaveLength(4);
    for (const h of ts) close(h.total, 4981.354008959998, 0.01);
    for (const s of [31, 32, 33]) {
      expect(hitOf(r, s).skillCode).toBe('saifeir.ultBlast');
      close(baseOf(r, s), 1300, 0.01);
      close(hitOf(r, s).total, 858.0000000000001, 0.01);
    }
  });

  it('B 秘技先发制人：炮台 AoE 1××3目标 + 追击加成记录', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 656810.1100001273, 0.5);
    const tech = evsOf(r, (e) => e.unitId === 'saifeir' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toEqual(['technique', 'sfTech']);
    close(tech.energyAfter ?? 0, 65, 0.01);
    expect(tech.spAfter).toBe(3);
    expect(tech.hitSeqs).toEqual([0, 1, 2]);
    for (const s of [0, 1, 2]) {
      close(baseOf(r, s), 2500, 0.01);
      close(hitOf(r, s).total, 1649.9999999999998, 0.01);
    }
    // 首天赋追击（2026-11-02 重锚：景元秘技让神君首轮多 3 段 → 命中下标整体后移，
    // 改为按 skillCode 定位而不是写死下标）
    const firstTalent = r.hits.find((h) => h.skillCode === 'saifeir.talent')!;
    expect(firstTalent).toBeDefined();
    close(baseOf(r, firstTalent.seq), 4875, 0.01);
    // 终结技 t=188.68：记录 ×3 系数 → ultTrue base=6974.49
    const ts = r.hits.filter((h) => h.skillCode === 'saifeir.ultTrue');
    expect(ts).toHaveLength(4);
    for (const h of ts) close(h.total, 8112.462575231996, 0.01);
  });

  it('D E2 老主顾本身命中→vuln（+30%）3× on 技能打击', () => {
    const r = run('D', () => mkCfg({}, 2));
    close(r.report.totalDamage, 569219.3941711541, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'saifeir' && e.action === 'skill')[0];
    expect(skill.note!.filter((n) => n === 'sfR2Vuln')).toHaveLength(3);
  });

  it('E E4 追击 0.5× + 终招加成（6× ×3E4）', () => {
    const r = run('E', () => mkCfg({}, 4));
    close(r.report.totalDamage, 574018.7491711542, 0.5);
    // R1 攻击 +80%（8775 = 1.5×4500）；伤害加成 + E1 特有 statValue
    expect(hitOf(r, 21).skillCode).toBe('saifeir.talent');
close(baseOf(r, 21), 8775, 0.01);
    close(hitOf(r, 21).total, 8311.17857142857, 0.01);
    // E4 附加 0.5×：base=1625（0.5×3250）
    const r4 = hitOf(r, 22);
    expect(r4.skillCode).toBe('saifeir.r4');
    close(baseOf(r, r4.seq), 1625, 0.01);
    close(r4.total, 1302.3214285714287, 0.01);
    // E4 终招 lv12 base=4290（3900×1.1）
close(baseOf(r, 30), 4290, 0.01);
    close(hitOf(r, 30).total, 3438.128571428571, 0.01);
    // 记录真伤 4× 7471.94572107
    const ts = r.hits.filter((h) => h.skillCode === 'saifeir.ultTrue');
    expect(ts).toHaveLength(4);
    for (const h of ts) close(h.total, 7436.783042502856, 0.01);
  });

  it('F E6 追击倍率 +3.5×（6×总倍率6.75）+ 记录 16% 额外记录', () => {
    const r = run('F', () => mkCfg({}, 6));
    close(r.report.totalDamage, 672258.5097425824, 0.5);
    // E6 天赋追击：base=43436.25（=4875×8.91 倍率）
    expect(hitOf(r, 21).skillCode).toBe('saifeir.talent');
close(baseOf(r, 21), 43436.25, 0.01);
    close(hitOf(r, 21).total, 41140.333928571425, 0.01);
    // E4 附加 base=1625
close(baseOf(r, 22), 1625, 0.01);
    close(hitOf(r, 22).total, 1302.3214285714287, 0.01);
    // E6 终招：3900 失败 lv12 → 4290；blast 1430 → 记录真伤 4× 9139.01
close(baseOf(r, 30), 4290, 0.01);
    const ts = r.hits.filter((h) => h.skillCode === 'saifeir.ultTrue');
    expect(ts).toHaveLength(4);
    for (const h of ts) close(h.total, 9103.846399645714, 0.01);
    // 二发天赋追击 lv12 base=33412.5（6.75×4950）
    expect(hitOf(r, 77).skillCode).toBe('saifeir.talent');
close(baseOf(r, 77), 33412.5, 0.01);
    close(hitOf(r, 77).total, 31646.41071428571, 0.01);
  });
});
