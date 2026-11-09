import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 瓦尔特 1004 接入回归（2026-10-19；dump 锚点法：锚点全部来自 x-dump23 实测 seed=20261018，勿纯推理改写） */

type Ev = BattleResult['events'][number];

const MON = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 3000,
  speed: 100,
  monsterId: '1004011',
  // 可可利亚天生【禁锢抵抗 100%】（Dimbreath DebuffResist）→ 本用例显式清空，
  // 以便继续覆盖瓦尔特「终招/秘技挂禁锢标记」的机制本身（见用例 H：抵抗生效的表现）
  debuffResist: {} as Record<string, number>,
  attack: 400,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
  enemyClass: 'normal' as const,
};

const WELT_PANEL = {
  level: 80,
  hp: 30000,
  attack: 2500,
  defence: 800,
  speed: 102,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Imaginary' as const,
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
      { id: 'welt', panel: WELT_PANEL, eidolonLevel: eidolon },
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
const noteCountOf = (r: BattleResult): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const e of r.events) for (const n of e.note ?? []) c[n] = (c[n] ?? 0) + 1;
  return c;
};

describe('瓦尔特1004（基础机制）', () => {
  it('A 战技弹射减速/天赋附加/普攻/终招禁锢+点06', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 323436.75, 0.5);
    // 战技 t=98.04：主段 + 2 次随机弹射，每段 75% 概率挂减速 → 触发天赋附加（主段各自配对）
    const skill = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'skill')[0];
    close(skill.time, 98.04, 0.01);
    expect(skill.note).toContain('weltSkill');
    expect(skill.note!.filter((n) => n === 'weltSlow')).toHaveLength(3);
    expect(skill.note!.filter((n) => n === 'weltTalent')).toHaveLength(3);
    close(skill.energyAfter ?? 0, 70, 0.01);
    expect(skill.spAfter).toBe(1);
    expect(skill.hitSeqs).toHaveLength(6);
    const skills = skill.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'welt.skill');
    expect(skills).toHaveLength(3);
    for (const h of skills) {
      close(baseOf(r, h.seq), 1800, 0.01);
      close(h.total, 848.57, 0.01);
    }
    const talents = skill.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'welt.talent');
    expect(talents).toHaveLength(3);
    for (const h of talents) {
      close(baseOf(r, h.seq), 1500, 0.01);
      close(h.total, 707.14, 0.01);
    }
    // 普攻 t=196.08（击中已减速目标 → 天赋附加）
    const basic = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'basic')[0];
    close(basic.time, 196.08, 0.01);
    close(basic.energyAfter ?? 0, 115, 0.01);
    expect(basic.hitSeqs).toHaveLength(2);
    close(hitOf(r, basic.hitSeqs![0]).total, 1178.57, 0.01);
    expect(hitOf(r, basic.hitSeqs![1]).skillCode).toBe('welt.talent');
    expect(basic.note).toContain('weltTalent');
    // 终招 t=211.33：AoE 3 段 + 禁锢标记×3 + 点06 主目标受伤+12% + 逐目标天赋附加
    // （战技减速 10% → 怪物首动 100 → 100.22，受击回能推迟 → 终招不再是 t=200）
    const ult = evsOf(r, (e) => e.unitId === 'welt' && e.kind === 'ult')[0];
    close(ult.time, 211.33, 0.01);
    expect(ult.note).toEqual(
      expect.arrayContaining(['weltUlt', 'weltP06', 'weltImprison', 'weltTalent']),
    );
    expect(ult.note!.filter((n) => n === 'weltImprison')).toHaveLength(3);
    expect(ult.note!.filter((n) => n === 'weltTalent')).toHaveLength(3);
    close(ult.energyAfter ?? 0, 15, 0.01);
    expect(ult.hitSeqs).toHaveLength(6);
    const ultMain = ult.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.target === 'monster2')!;
    close(ultMain.total, 1980, 0.01); // 点06 受伤+12%
    const ultSides = ult.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.target !== 'monster2' && h.skillCode === 'welt.ult');
    for (const h of ultSides) close(h.total, 1767.86, 0.01);
    const ultTalent = ult.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'welt.talent' && h.target === 'monster2')!;
    close(ultTalent.total, 792, 0.01); // 2026-11-06 破韧窗口改造：目标在恢复回合后不再吃破韧区加成
    // 点07 回 10 + 通用 5：70+120 capped 后终招能量链 ens=15
    const nc = noteCountOf(r);
    expect(nc.weltSkill).toBe(1);
    expect(nc.weltUlt).toBe(1);
    expect(nc.weltSlow).toBe(3); // 技能段 3 次施加（终招不挂减速，附加不再挂）
    expect(nc.weltTalent).toBe(8); // 战技 3 + 普攻（两次普攻各 1）2 + 终招 3
  });

  it('B 秘技进战禁锢全体', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    close(r.report.totalDamage, 446025.66, 0.5);
    const tech = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toEqual(expect.arrayContaining(['technique', 'weltTech', 'weltImprison']));
    expect(tech.note!.filter((n) => n === 'weltImprison')).toHaveLength(3);
    close(tech.energyAfter ?? 0, 60, 0.01);
    expect(tech.spAfter).toBe(3);
    expect(tech.hitSeqs ?? []).toHaveLength(0); // 非攻击秘技，无伤害段
    // 100407 #2 行动延后 20% + #3 降速 10% → 怪物首动由 100 推迟到 137.75
    const monAct = evsOf(r, (e) => e.unitId === 'monster2' && e.action === 'monster')[0];
    close(monAct.time, 137.75, 0.01);
    // 终招仍 ens=15（点07+通用回能同 A）
    const ult = evsOf(r, (e) => e.unitId === 'welt' && e.kind === 'ult')[0];
    close(ult.energyAfter ?? 0, 15, 0.01);
  });

  it('H 怪物负面抵抗（DebuffResist）：可可利亚禁锢抵抗 100% → 禁锢标记不生效', () => {
    // 不覆盖 debuffResist → 回落怪档表（可可利亚 禁锢 1）→ 我方对其施加的禁锢被完全抵抗
    const r = run('H', () => mkCfg({ monster: { ...MON, debuffResist: undefined } }));
    const ult = evsOf(r, (e) => e.unitId === 'welt' && e.kind === 'ult')[0];
    expect(ult).toBeDefined();
    expect(ult.note ?? []).not.toContain('weltImprison');
    // 减速标记不在 DebuffResist 键集内 → 不受影响（天赋附加仍触发）
    expect(ult.note ?? []).toContain('weltTalent');
  });

  it('C E2 天赋触发回能3 + E1 附加段', () => {
    const r = run('C', () => mkCfg({}, 2));
    close(r.report.totalDamage, 324096.75, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'skill')[0];
    close(skill.energyAfter ?? 0, 79, 0.01); // 70 + 3×3（天赋 3 段各 +3）
    // 普攻+终招同刻 t=196.08；直接施加 E2 回能
    const basic = evsOf(
      r,
      (e) => e.unitId === 'welt' && e.action === 'basic' && Math.abs(e.time - 196.08) < 0.01,
    )[0];
    close(basic.energyAfter ?? 0, 120, 0.01);
    const ult = evsOf(
      r,
      (e) => e.unitId === 'welt' && e.kind === 'ult' && Math.abs(e.time - 196.08) < 0.01,
    )[0];
    close(ult.energyAfter ?? 0, 24, 0.01); // 115(m20+15+5+3×3)…以 dump 实测为准
    // 第二普攻 t=294.12 附带 E1 附加段（0.5×0.7×… → base=1750）
    const basic2 = evsOf(
      r,
      (e) => e.unitId === 'welt' && e.action === 'basic' && Math.abs(e.time - 294.12) < 0.01,
    )[0];
    expect(basic2.note).toEqual(expect.arrayContaining(['weltTalent', 'weltE1']));
    const e1 = basic2.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'welt.eidolon1Basic')!;
    close(baseOf(r, e1.seq), 1250, 0.01);
    close(e1.total, 660, 0.01);
  });

  it('D E1 星魂附加段：普攻×0.5 / 战技×0.8', () => {
    const r = run('D', () => mkCfg({ rounds: 8, maxTime: 760 }, 1));
    close(r.report.totalDamage, 669847.57, 1);
    // 终招充能 2 次附加
    const ult1 = evsOf(r, (e) => e.unitId === 'welt' && e.kind === 'ult')[0];
    close(ult1.energyAfter ?? 0, 15, 0.01);
    const basic2 = evsOf(
      r,
      (e) => e.unitId === 'welt' && e.action === 'basic' && Math.abs(e.time - 294.12) < 0.01,
    )[0];
    expect(basic2.note).toContain('weltE1');
    const e1b = basic2.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'welt.eidolon1Basic')!;
    close(e1b.total, 660, 0.01);
    // 战技附加段（0.8 ratio）
    const skill2 = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'skill' && Math.abs(e.time - 392.16) < 0.01)[0];
    expect(skill2.note).toContain('weltE1');
    expect(skill2.hitSeqs).toHaveLength(7);
    const e1s = skill2.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'welt.eidolon1Skill')!;
    close(baseOf(r, e1s.seq), 1440, 0.01); // 0.72×0.8×2500
    close(e1s.total, 760.32, 0.01);
    // E1 用尽：第 3 次战技无 weltE1
    const skill3 = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'skill' && Math.abs(e.time - 490.2) < 0.01)[0];
    expect(skill3.note ?? []).not.toContain('weltE1');
    expect(skill3.hitSeqs).toHaveLength(6);
  });

  it('E E3战技升级（lv12 0.792×）胜利后', () => {
    const r = run('E', () => mkCfg({}, 4));
    close(r.report.totalDamage, 324667.18, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'skill')[0];
    const skills = skill.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'welt.skill');
    for (const h of skills) close(baseOf(r, h.seq), 1980, 0.01);
  });

  it('F E6 额外弹射 + E5 终招升级', () => {
    const r = run('F', () => mkCfg({}, 6));
    close(r.report.totalDamage, 327402.4, 0.5);
    const skill = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'skill')[0];
    expect(skill.hitSeqs).toHaveLength(8); // 主段 3 + E6 额外弹射 1 → 4 段伤害 + 4 天赋
    const talents = skill.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'welt.talent');
    expect(talents).toHaveLength(4);
    for (const h of talents) close(baseOf(r, h.seq), 1650, 0.01); // E5 天赋+2 lv12 0.66×
    const ult = evsOf(r, (e) => e.unitId === 'welt' && e.kind === 'ult')[0];
    const ultMain = ult.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'welt.ult')!;
    close(baseOf(r, ultMain.seq), 4050, 0.01); // E5 终招+2 lv12 1.62×2500
  });

  it('G 行迹点08 对破韧目标伤害+20%（wP 场景）', () => {
    const r = run('G', () => mkCfg({ monster: { ...MON, maxToughness: 30 }, maxTime: 300 }));
    close(r.report.totalDamage, 388830.7500005712, 1);
    // 战技即破 m2 韧 → 全局韧性减伤 0.9 消失 ×点08 1.2 = 1.3333
    const skill = evsOf(r, (e) => e.unitId === 'welt' && e.action === 'skill')[0];
    close(hitOf(r, skill.hitSeqs![0]).total, 1131.43, 0.01);
    // 普攻 t=196.08：2200（×1.3333）
    const basic = evsOf(
      r,
      (e) => e.unitId === 'welt' && e.action === 'basic' && Math.abs(e.time - 196.08) < 0.01,
    )[0];
    close(hitOf(r, basic.hitSeqs![0]).total, 1571.43, 0.01);
    // 终招：m2 在新窗口模型下已到恢复回合、不再是破韧态 → 点08 的 +20% 不再计入（2640 → 1980）
    const ult = evsOf(r, (e) => e.unitId === 'welt' && e.kind === 'ult')[0];
    const ultHits = ult.hitSeqs!.map((s) => hitOf(r, s));
    close(ultHits.find((h) => h.target === 'monster2' && h.kind === 'direct')!.total, 1980, 0.01);
    close(ultHits.find((h) => h.target === 'monster1')!.total, 1767.857142857143, 0.01);
    // 天赋附加也吃全局韧性区消失 + 点08/点06
    close(ultHits.find((h) => h.skillCode === 'welt.talent' && h.target === 'monster1')!.total, 942.86, 0.01);
    close(ultHits.find((h) => h.skillCode === 'welt.talent' && h.target === 'monster2')!.total, 1056, 0.01);
  });
});
