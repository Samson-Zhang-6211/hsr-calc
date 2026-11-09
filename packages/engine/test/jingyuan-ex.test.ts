import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  BattleResult,
  CombatMember,
  MemberPanel,
  MonsterConfig,
} from '../src/index.js';

/** 景元 EX 星魂「万钧入盏，风静灯明」2026-10；锚点来自 jy-ex-dump 实测。 */

type Ev = BattleResult['events'][number];
type Hit = BattleResult['hits'][number];

function panel(speed = 300): MemberPanel {
  return {
    element: 'Thunder',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1.0,
    damageBonus: 0,
    speed,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(): MonsterConfig {
  return {
    level: 85,
    hp: 1e9,
    resistance: {},
    weaknesses: [],
    maxToughness: 300,
    speed: 100,
    enemyClass: 'elite',
  } as MonsterConfig;
}

function config(ex: boolean, over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    members: [{ id: 'jingyuan', panel: panel(), eidolonLevel: 0 } as CombatMember],
    monsters: [monster()],
    maxTime: 400,
    techniques: true,
    initialSp: 5,
    jingyuanEx: ex,
    ...over,
  } as BattleConfig;
}

const actionsOf = (r: BattleResult, id: string) =>
  r.events.filter((e) => e.kind === 'action' && e.unitId === id);
const firstHit = (r: BattleResult, code: string): Hit =>
  r.hits.find((h) => h.skillCode === code)!;
const factor = (h: Hit, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;
const notesOf = (e: Ev) => e.note ?? [];

describe('景元 EX 星魂', () => {
  it('EX 关闭：段数上限 10，无 EX 事件/增伤', () => {
    const r = simulateBattle(config(false));
    const skills = actionsOf(r, 'jingyuan').filter((e) => e.action === 'skill');
    expect(skills[0]!.stacks).toBe(8);
    expect(skills[1]!.stacks).toBe(10);
    expect(actionsOf(r, 'jingyuan').every((e) => !notesOf(e).includes('jingyuanEx'))).toBe(true);
    expect(factor(firstHit(r, 'jingyuan.skill'), 'damageBonus')).toBeCloseTo(1.18, 6);
    expect(factor(firstHit(r, 'jingyuan.shenjun'), 'damageBonus')).toBeCloseTo(1.48, 6);
  });

  it('EX 开启：战斗开始即强化，战技额外 +6 段，景元增伤 +240%', () => {
    const r = simulateBattle(config(true));
    const skill = actionsOf(r, 'jingyuan').find((e) => e.action === 'skill')!;
    expect(skill.stacks).toBe(14);
    expect(notesOf(skill)).toContain('jingyuanEx');
    expect(factor(firstHit(r, 'jingyuan.skill'), 'damageBonus')).toBeCloseTo(3.58, 6);
    // 神君不吃 240% 增伤
    expect(factor(firstHit(r, 'jingyuan.shenjun'), 'damageBonus')).toBeCloseTo(1.48, 6);
  });

  it('EX 开启：终结技额外 +12 段，满 30 段立即行动并重置为 3', () => {
    const r = simulateBattle(config(true));
    const ult = r.events.find((e) => e.kind === 'ult' && e.skillCode === 'jingyuan.ult')!;
    expect(ult.stacks).toBe(30);
    expect(notesOf(ult)).toContain('jingyuanExFull');

    const shenjun = actionsOf(r, 'shenjun')[0]!;
    expect(shenjun.time).toBeCloseTo(ult.time, 6);
    expect(shenjun.stacks).toBe(33); // 30 层 + 秘技 120407 首轮 +3 段
    expect(notesOf(shenjun)).toContain('jingyuanEx');

    const next = actionsOf(r, 'jingyuan').find((e) => e.time > ult.time)!;
    expect(next.stacks).toBe(11);
  });

  it('EX 开启：神君行动后刷新强化，景元普攻也吃 240%', () => {
    const r = simulateBattle(config(true));
    const basics = actionsOf(r, 'jingyuan').filter((e) => e.action === 'basic');
    expect(basics.length).toBeGreaterThan(0);
    const activeBasic = basics.find((e) => e.time >= 200)!;
    expect(factor(firstHit(r, 'jingyuan.basic'), 'damageBonus')).toBeCloseTo(3.4, 6);
    expect(activeBasic).toBeDefined();
    const later = r.hits.filter(
      (h) => h.skillCode === 'jingyuan.basic' && h.time >= activeBasic.time,
    )[0]!;
    expect(factor(later, 'damageBonus')).toBeCloseTo(3.4, 6);
  });

  it('EX 开启：神君伤害与关闭时逐段一致', () => {
    const off = simulateBattle(config(false));
    const on = simulateBattle(config(true));
    const offHit = firstHit(off, 'jingyuan.shenjun');
    const onHit = firstHit(on, 'jingyuan.shenjun');
    expect(onHit.total).toBeCloseTo(offHit.total, 8);
    expect(factor(onHit, 'damageBonus')).toBeCloseTo(factor(offHit, 'damageBonus'), 8);
  });

  it('EX 开启：第二次终结技从 11 段 +15 到 26 段', () => {
    const r = simulateBattle(config(true));
    const ults = r.events.filter((e) => e.kind === 'ult' && e.skillCode === 'jingyuan.ult');
    expect(ults).toHaveLength(2);
    expect(ults[1]!.stacks).toBe(26);
    expect(notesOf(ults[1]!)).toContain('jingyuanEx');
  });

  it('EX 开启：满层神君行动后战技从 3 段 +8 到 11 段', () => {
    const r = simulateBattle(config(true));
    const ult = r.events.find((e) => e.kind === 'ult' && e.skillCode === 'jingyuan.ult')!;
    const after = actionsOf(r, 'jingyuan').find(
      (e) => e.action === 'skill' && e.time > ult.time,
    )!;
    expect(after.stacks).toBe(11);
    expect(notesOf(after)).toContain('jingyuanEx');
  });
});
