import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CharId,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

/** 布洛妮娅 1101 接入回归（2026-10-24；锚点来自 zz-harmony-dump 实测） */

type Ev = BattleResult['events'][number];

const MON = (): MonsterConfig => ({
  level: 85,
  hp: 1_000_000_000,
  resistance: {},
  weaknesses: ['Wind', 'Physical', 'Ice', 'Imaginary', 'Thunder', 'Fire', 'Quantum'],
  maxToughness: 300,
  speed: 100,
  enemyClass: 'elite',
});

const P = (element: string, speed: number): MemberPanel =>
  ({
    element,
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    speed,
    energyRegen: 0,
    damageBonus: 0,
    breakEffect: 1,
  }) as MemberPanel;

const cfg = (
  ids: [string, string, number, number][],
  maxTime: number,
  techniques = false,
): BattleConfig => ({
  members: ids.map(([id, el, spd, eo]) => ({
    id: id as CharId,
    panel: P(el, spd),
    eidolonLevel: eo,
  })) as CombatMember[],
  monster: MON(),
  rounds: 20,
  maxTime,
  techniques,
});

const mk = (eo = 0, maxTime = 500, techniques = false) =>
  simulateBattle(cfg([['bronya', 'Wind', 99, eo], ['jingyuan', 'Thunder', 135, 0]], maxTime, techniques));

const actsOf = (r: BattleResult, id: string) =>
  r.events.filter((e) => e.unitId === id && (e.kind === 'action' || e.kind === 'ult'));

const buff = (e: Ev, unit: string, label: string) =>
  (e.buffs?.[unit] ?? []).find((b) => b.labelKey === label);

const countHits = (r: BattleResult, code: string) => r.hits.filter((h) => h.skillCode === code).length;

describe('布洛妮娅 1101（基础机制）', () => {
  it('A 战技：解控增伤 + 目标立即行动（instantAction）', () => {
    const r = mk(2);
    const acts = actsOf(r, 'bronya');
    const skill = acts.find((e) => e.skillCode === 'bronya.skill')!;
    expect(skill.time).toBeCloseTo(101.01, 2);
    expect(skill.spAfter).toBe(1);
    expect(skill.energyAfter).toBe(90);
    expect(buff(skill, 'jingyuan', 'bronyaSkill')?.value).toBeCloseTo(0.66, 5);
    expect(buff(skill, 'jingyuan', 'bronyaSkill')?.duration).toBe(1);
    // 景元被战技推进后在同一个 101.01 立即行动
    const jyAtSkill = r.events.filter((e) => e.unitId === 'jingyuan' && e.kind === 'action' && e.time === skill.time);
    expect(jyAtSkill.length).toBeGreaterThan(0);
  });

  it('B 行迹：进战全队防御 +20%（2 回合）+ 全队增伤 +10%', () => {
    const r = mk(2);
    const skill = actsOf(r, 'bronya').find((e) => e.skillCode === 'bronya.skill')!;
    expect(buff(skill, 'jingyuan', 'bronyaP07')?.value).toBeCloseTo(0.2, 5);
    expect(buff(skill, 'jingyuan', 'bronyaP08')?.value).toBeCloseTo(0.1, 5);
    expect(buff(skill, 'bronya', 'bronyaP07')?.duration).toBe(2);
  });

  it('C 终结技：全队攻击 +55% / 暴伤 +44%（2 回合）', () => {
    const r = mk(2);
    const ult = actsOf(r, 'bronya').find((e) => e.kind === 'ult')!;
    expect(ult.time).toBeCloseTo(202.02, 2);
    expect(ult.note ?? []).toContain('bronyaUlt');
    expect(ult.energyAfter).toBe(5);
    expect(buff(ult, 'jingyuan', 'bronyaUltAtk')?.value).toBeCloseTo(0.55, 5);
    expect(buff(ult, 'jingyuan', 'bronyaUltCd')?.value).toBeCloseTo(0.44, 5);
    expect(buff(ult, 'jingyuan', 'bronyaUltAtk')?.duration).toBe(2);
    expect(buff(ult, 'bronya', 'bronyaUltAtk')?.value).toBeCloseTo(0.55, 5);
  });
});

describe('布洛妮娅 1101（星魂）', () => {
  it('D E1 战技 50% 固定概率回 1 战技点（实测第二动触发）', () => {
    const r = mk(2);
    const skills = actsOf(r, 'bronya').filter((e) => e.skillCode === 'bronya.skill');
    const e1 = skills.find((e) => (e.note ?? []).includes('bronyaE1'));
    expect(e1).toBeDefined();
    expect(e1!.spAfter).toBe(1);
  });

  it('E E4 队友普攻风弱点敌人时触发追击（实测 3 次）', () => {
    const r = mk(4, 400);
    expect(countHits(r, 'bronya.e4')).toBe(3);
    const ult = actsOf(r, 'bronya').find((e) => e.kind === 'ult')!;
    expect(buff(ult, 'jingyuan', 'bronyaUltAtk')?.value).toBeCloseTo(0.594, 5);
    expect(buff(ult, 'jingyuan', 'bronyaUltCd')?.value).toBeCloseTo(0.468, 5);
  });
});

describe('布洛妮娅 1101（秘技）', () => {
  it('F 非攻击类秘技：进战全队攻击 +15%（2 回合）', () => {
    const r = mk(0, 260, true);
    const tech = r.events.find((e) => e.action === 'technique')!;
    expect(tech.note ?? []).toEqual(['technique', 'bronyaTech']);
    expect((tech.hitSeqs ?? []).length).toBe(0);
    expect(buff(tech, 'jingyuan', 'bronyaTech')?.value).toBeCloseTo(0.15, 5);
    expect(buff(tech, 'jingyuan', 'bronyaTech')?.duration).toBe(2);
  });
});
