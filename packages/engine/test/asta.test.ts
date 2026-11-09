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

/** 艾丝妲 1009 接入回归（2026-10-24；锚点全部来自 zz-harmony-dump 实测，勿纯推理改写） */

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
  simulateBattle(cfg([['asta', 'Fire', 106, eo], ['jingyuan', 'Thunder', 135, 0]], maxTime, techniques));

const actsOf = (r: BattleResult, id: string) =>
  r.events.filter((e) => e.unitId === id && (e.kind === 'action' || e.kind === 'ult'));

const buff = (e: Ev, unit: string, label: string) =>
  (e.buffs?.[unit] ?? []).find((b) => b.labelKey === label);

const countHits = (r: BattleResult, code: string) => r.hits.filter((h) => h.skillCode === code).length;

describe('艾丝妲 1009（基础机制）', () => {
  it('A 战技弹射 5 段 + 蓄能叠满 5 层（全队攻击 70%、自身防御 30%）', () => {
    const r = mk();
    const skill = actsOf(r, 'asta').find((e) => e.skillCode === 'asta.skill')!;
    expect(skill.action).toBe('skill');
    expect(skill.note ?? []).toContain('astaSkill');
    expect((skill.hitSeqs ?? []).length).toBe(5);
    // 蓄能 5 层 × 0.14 = 0.700（同谐天赋 lv10）
    expect(buff(skill, 'asta', 'astaTalent')?.value).toBeCloseTo(0.7, 5);
    expect(buff(skill, 'jingyuan', 'astaTalent')?.value).toBeCloseTo(0.7, 5);
    // point08 星座：每层自身防御 +6%
    expect(buff(skill, 'asta', 'astaP08')?.value).toBeCloseTo(0.3, 5);
    // point07 点燃：仅火属性成员吃到 +18%
    expect(buff(skill, 'asta', 'astaP07')?.value).toBeCloseTo(0.18, 5);
    expect(buff(skill, 'jingyuan', 'astaP07')).toBeUndefined();
    expect(skill.spAfter).toBe(1);
  });

  it('B 第二回合起回合开始 -3 层（5→2），普攻再叠 2 层 = 4 层', () => {
    const r = mk();
    const acts = actsOf(r, 'asta');
    const basic = acts.find((e) => e.skillCode === 'asta.basic' && e.action === 'basic')!;
    // 衰减后 4 层 × 0.14 = 0.560
    expect(buff(basic, 'asta', 'astaTalent')?.value).toBeCloseTo(0.56, 5);
    expect(buff(basic, 'asta', 'astaP08')?.value).toBeCloseTo(0.24, 5);
    expect(basic.spAfter).toBe(1); // 战技花 1（3→2）→ 普攻回 1
  });

  it('C point06 火花：普攻挂灼烧（dot.burn / skilldot.burn 均出现）', () => {
    const r = mk();
    expect(countHits(r, 'dot.burn')).toBeGreaterThan(0);
    expect(countHits(r, 'skilldot.burn')).toBeGreaterThan(0);
  });
});

describe('艾丝妲 1009（星魂）', () => {
  it('D E1 战技额外 1 段弹射（5→6）', () => {
    const r = mk(1);
    const skill = actsOf(r, 'asta').find((e) => e.skillCode === 'asta.skill')!;
    expect((skill.hitSeqs ?? []).length).toBe(6);
  });

  it('E E4 蓄能 ≥2 层时自身回能效率 +15%', () => {
    const r = mk(4);
    const skill = actsOf(r, 'asta').find((e) => e.skillCode === 'asta.skill')!;
    expect(buff(skill, 'asta', 'astaE4')?.value).toBeCloseTo(0.15, 5);
  });

  it('F E2 终结技后下一次回合开始不衰减（层数保持 5）', () => {
    const r = mk(2, 600);
    const ult = actsOf(r, 'asta').find((e) => e.kind === 'ult')!;
    expect(ult.note ?? []).toContain('astaUlt');
    expect(ult.energyAfter).toBe(5);
    // 大招后第一动在 566.04，景元下一动 585.42（速度 +57 后仅 19.38s，平时 74.07s）
    const jy = actsOf(r, 'jingyuan').filter((e) => e.time > ult.time);
    expect(jy[0].time - ult.time).toBeLessThan(30);
  });
});

describe('艾丝妲 1009（秘技）', () => {
  it('G 攻击类秘技进战对全体造成 50% 攻击力火伤', () => {
    const r = mk(0, 60, true);
    const tech = r.events.find((e) => e.action === 'technique')!;
    expect(tech.note ?? []).toEqual(['technique', 'astaTech']);
    expect((tech.hitSeqs ?? []).length).toBe(3);
    const total = (tech.hitSeqs ?? []).reduce(
      (a, s) => a + (r.hits.find((h) => h.seq === s)?.total ?? 0),
      0,
    );
    expect(total).toBeCloseTo(4079.6, 1);
  });
});
