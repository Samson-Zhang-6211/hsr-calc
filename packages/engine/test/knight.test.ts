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

/** 存护批（2026-10-24）：三月七 1001 / 杰帕德 1104 / 砂金 1304
 *  锚点全部来自 zz-knight-dump 实测（可可利亚 1004011 会反击，用于触发受击钩子），勿纯推理改写。 */

type Ev = BattleResult['events'][number];

const MON = (): MonsterConfig =>
  ({
    monsterId: '1004011',
    level: 85,
    hp: 1_000_000_000,
    attack: 1000,
    resistance: {},
    weaknesses: ['Ice', 'Imaginary', 'Wind'],
    maxToughness: 300,
    speed: 100,
    enemyClass: 'elite',
  }) as MonsterConfig;

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

const cfg = (ids: [string, string, number, number][], maxTime = 400, techniques = false): BattleConfig => ({
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

const mkA = (techniques = true) =>
  simulateBattle(cfg([['sanyueqi', 'Ice', 120, 0], ['gepard', 'Ice', 100, 0]], 400, techniques));

const mkB = () =>
  simulateBattle(cfg([['aventurine', 'Imaginary', 120, 6], ['gepard', 'Ice', 100, 0]], 400, true));

const buff = (e: Ev, unit: string, label: string) =>
  ((e.buffs?.[unit] ?? []) as { labelKey: string; value: number }[]).find((b) => b.labelKey === label);

const notesOf = (r: BattleResult, key: string) =>
  r.events.filter((e) => (e.note ?? []).includes(key));

describe('三月七 1001（存护·冰）', () => {
  it('A1 战技护盾 = 防御×57% + 760（1000 防御 → 1330）', () => {
    const r = mkA();
    const skill = r.events.find((e) => e.skillCode === 'sanyueqi.skill')!;
    expect(skill.note ?? []).toContain('syqSkill');
    expect(buff(skill, 'sanyueqi', 'shield')?.value).toBeCloseTo(1330, 5);
  });

  it('A2 嘲讽 = 命途基础 150 + 行迹 point06 25 = 175', () => {
    const r = mkA();
    expect(r.finalState.taunt?.gepard).toBeCloseTo(175, 5);
  });

  it('A3 杰帕德 point08：攻击力 + 当前防御×35%（1000 → 350）', () => {
    const r = mkA();
    const gp = r.events.find((e) => e.skillCode === 'gepard.basic')!;
    expect(buff(gp, 'gepard', 'gepardP08')?.value).toBeCloseTo(350, 5);
    expect(buff(gp, 'gepard', 'gepardP06')?.value).toBeCloseTo(25, 5);
  });

  it('A4 杰帕德终结技：全队护盾 = 防御×45% + 600（1050）', () => {
    const r = mkA();
    const ult = r.events.find((e) => e.skillCode === 'gepard.ult')!;
    expect(ult.note ?? []).toContain('gepardUlt');
    expect(buff(ult, 'gepard', 'shield')?.value).toBeCloseTo(1050, 5);
    expect(buff(ult, 'sanyueqi', 'shield')?.value).toBeCloseTo(1050, 5);
  });

  it('A5 天赋免死：单场只触发 1 次（note gepardRevive 恰 1 条）', () => {
    const r = mkA();
    expect(notesOf(r, 'gepardRevive').length).toBe(1);
  });

  it('A6 天赋反击：syqCounter 挂在怪物行动事件上，并产出 sanyueqi.talent 段', () => {
    const r = mkA();
    const counters = notesOf(r, 'syqCounter');
    expect(counters.length).toBeGreaterThan(0);
    for (const e of counters) expect(e.action).toBe('monster');
    expect(r.hits.filter((h) => h.skillCode === 'sanyueqi.talent').length).toBeGreaterThan(0);
  });
});

describe('砂金 1304（存护·虚数，E6）', () => {
  it('B1 E1/E6 与秘技：持盾队友暴伤 +20%、每持盾队友 +50%（两人 → +100%）', () => {
    const r = mkB();
    const first = r.events.find((e) => e.skillCode === 'aventurine.basic')!;
    expect(buff(first, 'gepard', 'avenE1')?.value).toBeCloseTo(0.2, 5);
    expect(buff(first, 'aventurine', 'avenE1')?.value).toBeCloseTo(0.2, 5);
    expect(buff(first, 'aventurine', 'avenE6')?.value).toBeCloseTo(1, 5);
  });

  it('B2 E2：普攻挂全抗降低并输出 avenE2', () => {
    const r = mkB();
    const basic = r.events.find((e) => e.skillCode === 'aventurine.basic')!;
    expect(basic.note ?? []).toContain('avenE2');
  });

  it('B3 终结技：随机盲注 + 惊惶（avenUlt）', () => {
    const r = mkB();
    const ult = r.events.find((e) => e.skillCode === 'aventurine.ult')!;
    expect(ult.kind).toBe('ult');
    expect(ult.note ?? []).toContain('avenUlt');
  });

  it('B4 盲注满 7 → 追加攻击：E4 时 10 段（skillCode aventurine.talent）', () => {
    const r = mkB();
    expect(notesOf(r, 'avenFollowup').length).toBeGreaterThan(0);
    const segs = r.hits.filter((h) => h.skillCode === 'aventurine.talent').length;
    expect(segs).toBeGreaterThanOrEqual(10);
  });
});
