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

/** 驭空 1207 接入回归（2026-10-24；锚点来自 zz-harmony-dump 实测） */

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
  simulateBattle(cfg([['yukong', 'Imaginary', 107, eo], ['jingyuan', 'Thunder', 135, 0]], maxTime, techniques));

const actsOf = (r: BattleResult, id: string) =>
  r.events.filter((e) => e.unitId === id && (e.kind === 'action' || e.kind === 'ult'));

const buff = (e: Ev, unit: string, label: string) =>
  (e.buffs?.[unit] ?? []).find((b) => b.labelKey === label);

const countHits = (r: BattleResult, code: string) => r.hits.filter((h) => h.skillCode === code).length;

describe('驭空 1207（基础机制）', () => {
  it('A 战技【鸣弦号令】2 层 → 全队攻击 +88%', () => {
    const r = mk(6);
    const skill = actsOf(r, 'yukong').find((e) => e.skillCode === 'yukong.skill')!;
    expect(skill.time).toBeCloseTo(84.96, 2);
    expect(skill.spAfter).toBe(1);
    expect(skill.energyAfter).toBe(95);
    expect(skill.note ?? []).toContain('yukongSkill');
    expect(buff(skill, 'yukong', 'ykStacks')?.value).toBeCloseTo(0.88, 5);
    expect(buff(skill, 'jingyuan', 'ykStacks')?.value).toBeCloseTo(0.88, 5);
  });

  it('B 号令按队友回合结束递减：2 层耗完即移除全队攻击 buff', () => {
    const r = mk(6);
    const basic = actsOf(r, 'yukong').find((e) => e.skillCode === 'yukong.basic')!;
    // 景元已行动 1 次消耗 1 层，驭空普攻当回合自身不消耗 → 仍有 1 层
    expect(buff(basic, 'jingyuan', 'ykStacks')).toBeDefined();
    // 驭空行动结束再消耗最后 1 层 → 下一次事件（怪物行动）已无 buff
    const after = r.events.find((e) => e.unitId === 'monster1' && e.time >= 200)!;
    expect(buff(after, 'jingyuan', 'ykStacks')).toBeUndefined();
    expect(buff(after, 'yukong', 'ykE4')).toBeUndefined();
  });

  it('C 终结技：单体虚数伤害 + 持号令时全队暴率/暴伤', () => {
    const r = mk(6);
    const ult = actsOf(r, 'yukong').find((e) => e.kind === 'ult')!;
    expect(ult.time).toBeCloseTo(263.38, 2);
    expect(ult.note ?? []).toContain('yukongUlt');
    expect((ult.hitSeqs ?? []).length).toBe(1);
    expect(buff(ult, 'jingyuan', 'yukongUltCr')?.value).toBeCloseTo(0.294, 5);
    expect(buff(ult, 'jingyuan', 'yukongUltCd')?.value).toBeCloseTo(0.702, 5);
    expect(buff(ult, 'jingyuan', 'yukongUltCr')?.duration).toBe(2);
  });

  it('D 天赋箭彻七札：普攻附加虚数伤害', () => {
    const r = mk(6);
    expect(countHits(r, 'yukong.talent')).toBe(3);
  });
});

describe('驭空 1207（星魂/秘技）', () => {
  it('E E1 进战全队速度 +10% 2 回合（景元首动 74.07→67.34）', () => {
    const r = mk(1, 200);
    const first = actsOf(r, 'jingyuan')[0];
    expect(first.time).toBeCloseTo(67.34, 2);
  });

  it('F 非攻击类秘技：进战获得 2 层鸣弦号令', () => {
    const r = mk(0, 260, true);
    const tech = r.events.find((e) => e.action === 'technique')!;
    expect(tech.note ?? []).toEqual(['technique', 'yukongTech']);
    expect((tech.hitSeqs ?? []).length).toBe(0);
    expect(buff(tech, 'jingyuan', 'ykStacks')?.value).toBeCloseTo(0.8, 5);
  });
});
