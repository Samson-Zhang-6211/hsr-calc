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

/** 停云 1202 接入回归（2026-10-24；锚点来自 zz-harmony-dump 实测） */

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
  simulateBattle(cfg([['tingyun', 'Thunder', 112, eo], ['jingyuan', 'Thunder', 135, 0]], maxTime, techniques));

const actsOf = (r: BattleResult, id: string) =>
  r.events.filter((e) => e.unitId === id && (e.kind === 'action' || e.kind === 'ult'));

const buff = (e: Ev, unit: string, label: string) =>
  (e.buffs?.[unit] ?? []).find((b) => b.labelKey === label);

const countHits = (r: BattleResult, code: string) => r.hits.filter((h) => h.skillCode === code).length;

describe('停云 1202（基础机制）', () => {
  it('A 战技【赐福】：目标攻击加成（受停云攻击 30% 上限约束）+ 3 回合', () => {
    const r = mk(6);
    const skill = actsOf(r, 'tingyun').find((e) => e.skillCode === 'tingyun.skill')!;
    expect(skill.time).toBeCloseTo(89.29, 2);
    expect(skill.spAfter).toBe(1);
    expect(skill.energyAfter).toBe(100);
    expect(skill.note ?? []).toContain('tingyunSkill');
    expect(buff(skill, 'jingyuan', 'tyBlessAtk')?.value).toBeCloseTo(0.27, 5);
    expect(buff(skill, 'jingyuan', 'tyBlessAtk')?.duration).toBe(3);
  });

  it('B 战技后目标攻击附加雷伤（3 段战技 → 4 段命中）', () => {
    const r = mk(6);
    const jySkill = actsOf(r, 'jingyuan').find((e) => e.skillCode === 'jingyuan.skill' && e.time > 100)!;
    expect((jySkill.hitSeqs ?? []).length).toBe(4);
    expect(countHits(r, 'tingyun.bless')).toBe(5);
  });

  it('C 天赋紫电扶摇：停云攻击命中后赐福者追加雷伤', () => {
    const r = mk(6);
    expect(countHits(r, 'tingyun.talent')).toBe(3);
  });

  it('D 终结技：目标回能 50（E6 +10）+ 增伤 56% 2 回合', () => {
    const r = mk(6);
    const ult = actsOf(r, 'tingyun').find((e) => e.kind === 'ult')!;
    expect(ult.time).toBeCloseTo(267.86, 2);
    expect(ult.note ?? []).toContain('tingyunUlt');
    expect(ult.energyAfter).toBe(5);
    expect(buff(ult, 'jingyuan', 'tingyunUlt')?.value).toBeCloseTo(0.56, 5);
    expect(buff(ult, 'jingyuan', 'tingyunUlt')?.duration).toBe(2);
  });
});

describe('停云 1202（秘技）', () => {
  it('E 非攻击类秘技：进战自身回 50 能量（65→115）', () => {
    const r = mk(6, 260, true);
    const tech = r.events.find((e) => e.action === 'technique')!;
    expect(tech.note ?? []).toEqual(['technique', 'tingyunTech']);
    expect(tech.energyAfter).toBe(115);
    expect((tech.hitSeqs ?? []).length).toBe(0);
  });
});
