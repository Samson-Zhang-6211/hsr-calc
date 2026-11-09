import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 黑天鹅 1307 接入回归（2026-10-17；dump 锚点法：锚点全部来自 bs-dump 实测 seed=20261017，勿纯推理改写） */

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

const BS_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 98,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Wind' as const,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

const JY_PANEL = {
  level: 80,
  hp: 3000,
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
      { id: 'blackswan', panel: BS_PANEL, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 4,
    maxTime: 350,
    techniques: false,
    seed: 20261017,
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

describe('黑天鹅1307（基础机制）', () => {
  it('A 战技/奥迹跳伤/天赋挂层/总伤锚', () => {
    const r = run('A', () => mkCfg());
    // 总伤锚
    close(r.report.totalDamage, 203051.34, 0.5);
    // 首动=战技 t=102.04：3 段 blast base=0.9×2500=2250 total=1190.41、note bsSkill、ens=110（60+受击20+30）
    const skill = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'blackswan' && e.action === 'skill')[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.skillCode).toBe('blackswan.skill');
    expect(skill.hitSeqs).toHaveLength(3);
    expect(skill.note).toContain('bsSkill');
    close(skill.energyAfter ?? 0, 110, 0.01);
    for (const s of skill.hitSeqs!) {
      const h = r.hits.find((x) => x.seq === s)!;
      close(h.factors.find((f) => f.key === 'base')!.value, 2250, 0.01);
      close(h.total, 1190.41, 0.01);
    }
    // 奥迹跳伤 t=100（init point07 挂层→怪回合主段 6720=2500×2.4×(1+0.12×1)、相邻 4500=2500×1.8）
    const arcana = r.hits.filter((h) => h.skillCode === 'blackswan.arcana' && Math.abs(h.time - 100) < 0.01);
    const m1Main = arcana.find((h) => h.target === 'monster1' && Math.abs(h.factors.find((f) => f.key === 'base')!.value - 6720) < 0.01)!;
    close(m1Main.factors.find((f) => f.key === 'base')!.value, 6720, 0.01);
    close(m1Main.total, 4069.77, 0.01);
    const adj = arcana.filter((h) => Math.abs(h.factors.find((f) => f.key === 'base')!.value - 4500) < 0.01);
    expect(adj.length).toBeGreaterThanOrEqual(3);
    close(adj[0].total, 2725.29, 0.01);
    // 天赋：怪回合 DoT/奥迹跳伤后 bsStack note 出现在怪事件上
    const monEv = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'monster1' && Math.abs(e.time - 100) < 0.01)[0];
    expect(monEv.note).toContain('bsStack');
  });

  it('B 秘技/终招揭露/揭示中不减半', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 311758.03, 0.5);
    // 秘技 t=0：note [technique,bsTech,bsStack]、ens=60（初战半值）
    const tech = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'blackswan' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toContain('technique');
    expect(tech.note).toContain('bsTech');
    expect(tech.note).toContain('bsStack');
    close(tech.energyAfter ?? 0, 60, 0.01);
    // 秘技后奥迹更高：m1 主段 base=8160（多层）
    const m1 = r.hits.find((h) => h.skillCode === 'blackswan.arcana' && h.target === 'monster1' && Math.abs(h.factors.find((f) => f.key === 'base')!.value - 8160) < 0.01)!;
    close(m1.factors.find((f) => f.key === 'base')!.value, 8160, 0.01);
    // 终招 t=200：3 段 AoE base=1.2×2500=3000 total=1984.02、note bsUlt、ens=5
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'blackswan')[0];
    close(ult.time, 200, 0.01);
    expect(ult.note).toContain('bsUlt');
    close(ult.energyAfter ?? 0, 5, 0.01);
    expect(ult.hitSeqs).toHaveLength(3);
    for (const s of ult.hitSeqs!) {
      const h = r.hits.find((x) => x.seq === s)!;
      close(h.factors.find((f) => f.key === 'base')!.value, 3000, 0.01);
      close(h.total, 1984.02, 0.01);
    }
    // 揭露生效：终招后相邻段 total 3406.61 = 2725.29×1.25（受伤+25%）
    const postAdj = r.hits.find((h) => h.skillCode === 'blackswan.arcana' && Math.abs(h.time - 200) < 0.01 && Math.abs(h.total - 3406.61) < 0.01)!;
    close(postAdj.total, 3406.61, 0.01);
    // 揭露中不减半：终招后 m3 主段 base=15360（层未砍）
    const m3 = r.hits.find((h) => h.skillCode === 'blackswan.arcana' && h.target === 'monster3' && Math.abs(h.factors.find((f) => f.key === 'base')!.value - 15360) < 0.01)!;
    close(m3.factors.find((f) => f.key === 'base')!.value, 15360, 0.01);
  });

  it('C E2 进战30层', () => {
    const r = run('C', () => mkCfg({}, 2));
    close(r.report.totalDamage, 319221.15, 0.5);
    // E2：m1 首跳主段 base=28320 = 2500×2.4×(1+0.12×31)（30 层 E2 + 1 层 point07）
    const m1 = r.hits.find((h) => h.skillCode === 'blackswan.arcana' && h.target === 'monster1' && Math.abs(h.time - 100) < 0.01)!;
    close(m1.factors.find((f) => f.key === 'base')!.value, 28320, 0.01);
    // eid2 含 E1：奥迹>0 → 全属性抗-25% → 战技 total 1488.02 = 1190.41×1.25
    const skill = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'blackswan' && e.action === 'skill')[0];
    const h0 = r.hits.find((x) => x.seq === skill.hitSeqs![0])!;
    close(h0.total, 1488.02, 0.01);
  });

  it('D E1 抗性下调', () => {
    const r = run('D', () => mkCfg({}, 1));
    close(r.report.totalDamage, 253814.17, 0.5);
    // E1：base 同 A（6720）但 total 5087.21 = 4069.77×1.25（风抗-25%）
    const m1 = r.hits.find((h) => h.skillCode === 'blackswan.arcana' && h.target === 'monster1' && Math.abs(h.factors.find((f) => f.key === 'base')!.value - 6720) < 0.01)!;
    close(m1.total, 5087.21, 0.01);
    // 相邻段同样 ×1.25
    const adj = r.hits.find((h) => h.skillCode === 'blackswan.arcana' && Math.abs(h.total - 3406.61) < 0.01)!;
    close(adj.total, 3406.61, 0.01);
  });

  it('E E3 技能升级（E4 含在 eid4 内）', () => {
    const r = run('E', () => mkCfg({}, 4));
    close(r.report.totalDamage, 341512.05, 0.5);
    // E3 战技+2 → lv12 base=2475（0.99×2500）
    const skill = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'blackswan' && e.action === 'skill')[0];
    const h0 = r.hits.find((x) => x.seq === skill.hitSeqs![0])!;
    close(h0.factors.find((f) => f.key === 'base')!.value, 2475, 0.01);
    close(h0.total, 1648.45, 0.01);
  });

  it('F E6 上限+30/队友挂层/技能升级/普攻', () => {
    const r = run('F', () => mkCfg({}, 6));
    close(r.report.totalDamage, 929259.8, 0.5);
    // E6：m1 首跳主段 base=62356.80（E2 30 层×2=E6 双倍 + cap80 内高塔）
    const m1 = r.hits.find((h) => h.skillCode === 'blackswan.arcana' && h.target === 'monster1' && Math.abs(h.time - 100) < 0.01)!;
    close(m1.factors.find((f) => f.key === 'base')!.value, 62356.8, 0.01);
    // E6 队友攻击挂层：景元 t=222.22 事件 note 含 bsStack
    const jy = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'jingyuan' && Math.abs(e.time - 222.22) < 0.01)[0];
    expect(jy.note).toContain('bsStack');
    // E5 终招 lv12 base=3240（1.296×2500）
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'blackswan')[0];
    const uh = r.hits.find((x) => x.seq === ult.hitSeqs![0])!;
    close(uh.factors.find((f) => f.key === 'base')!.value, 3240, 0.01);
    close(uh.total, 3172.21, 0.01);
    // 普攻 t=204.08：base=3500 total=3426.77（E1 全抗-25% 期）ens=43
    const basic = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'blackswan' && e.action === 'basic')[0];
    close(basic.time, 204.08, 0.01);
    close(basic.energyAfter ?? 0, 43, 0.01);
    const bh = r.hits.find((x) => x.seq === basic.hitSeqs![0])!;
    close(bh.factors.find((f) => f.key === 'base')!.value, 2750, 0.01);
    close(bh.total, 2692.46, 0.01);
  });
});
