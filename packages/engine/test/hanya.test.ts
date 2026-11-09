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

/** 寒鸦 1215 接入回归（2026-10-24；锚点来自 zz-harmony-dump 实测） */

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

const mk = (eo = 0, maxTime = 600, techniques = false) =>
  simulateBattle(cfg([['hanya', 'Physical', 110, eo], ['jingyuan', 'Thunder', 135, 0]], maxTime, techniques));

const actsOf = (r: BattleResult, id: string) =>
  r.events.filter((e) => e.unitId === id && (e.kind === 'action' || e.kind === 'ult'));

const buff = (e: Ev, unit: string, label: string) =>
  (e.buffs?.[unit] ?? []).find((b) => b.labelKey === label);

describe('寒鸦 1215（基础机制）', () => {
  it('A 战技：单体物伤 + 施加承负（3 战技点 → 2）', () => {
    const r = mk(4);
    const skill = actsOf(r, 'hanya').find((e) => e.skillCode === 'hanya.skill')!;
    expect(skill.time).toBeCloseTo(90.91, 2);
    expect(skill.note ?? []).toContain('hanyaSkill');
    expect(skill.spAfter).toBe(1);
    expect((skill.hitSeqs ?? []).length).toBe(1);
    const dmg = (skill.hitSeqs ?? []).reduce((a, s) => a + (r.hits.find((h) => h.seq === s)?.total ?? 0), 0);
    expect(dmg).toBeCloseTo(6084.9, 1);
  });

  it('B 承负：全队命中每 2 次回 1 战技点 + point06 攻击加成', () => {
    const r = mk(4);
    const jySkill = actsOf(r, 'jingyuan').find((e) => e.skillCode === 'jingyuan.skill' && e.time > 100)!;
    // 景元 3 段命中承负目标：回 1 SP（1→1，因消耗与回复相抵）
    expect(buff(jySkill, 'jingyuan', 'hanyaP06')?.value).toBeCloseTo(0.1, 5);
    expect(buff(jySkill, 'jingyuan', 'hanyaP06')?.duration).toBe(1);
    expect(jySkill.spAfter).toBe(1);
  });

  it('C 战技点轨迹：普攻回 1 + 承负回复 1（sp 1→3）', () => {
    const r = mk(4);
    const basic = actsOf(r, 'hanya').find((e) => e.skillCode === 'hanya.basic' && e.action === 'basic')!;
    expect(basic.spAfter).toBe(3);
  });

  it('D 终结技：目标攻击 +60%、速度按寒鸦速度加成，E4 多 1 回合', () => {
    const r = mk(4);
    const ult = actsOf(r, 'hanya').find((e) => e.kind === 'ult')!;
    expect(ult.time).toBeCloseTo(272.73, 2);
    expect(ult.note ?? []).toContain('hanyaUlt');
    expect(buff(ult, 'jingyuan', 'hanyaUltAtk')?.value).toBeCloseTo(0.6, 5);
    expect(buff(ult, 'jingyuan', 'hanyaUltAtk')?.duration).toBe(3);
  });
});

describe('寒鸦 1215（秘技）', () => {
  it('E 攻击类秘技：进战对随机敌人施加承负（无伤害）', () => {
    const r = mk(0, 260, true);
    const tech = r.events.find((e) => e.action === 'technique')!;
    expect(tech.note ?? []).toEqual(['technique', 'hanyaTech']);
    expect((tech.hitSeqs ?? []).length).toBe(0);
  });
});
