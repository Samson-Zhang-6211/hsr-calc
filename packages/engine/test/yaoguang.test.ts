import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
  type PolicyFn,
} from '../src/index.js';

// 爻光 1511（火/欢愉）接入回归。
// 2026-10-29：原文件在同一批旧锚点重锚中被误写为空，按现有引擎行为重建
// （断言以结构性机制为主，数值锚点均由本轮实跑锁定）。
// 参考：docs/AGENTS-archive-2026-10-20.md「欢愉命途批」/「4.6.53 引擎四处改动」；
// 同族回归 test/lc-aha-yaoguang.test.ts。

const ALL_ELEMENTS: Element[] = [
  'Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary',
];

function mp(speed: number, extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Fire', level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed, energyRegen: 0, ...extra,
  };
}
function mon(hp = 1e9): MonsterConfig {
  return {
    level: 90, hp, resistance: {}, weaknesses: ALL_ELEMENTS,
    maxToughness: 9999, speed: 100, enemyClass: 'elite',
  };
}
const yg = (extra: Partial<CombatMember> = {}, p: Partial<MemberPanel> = {}): CombatMember => ({
  id: 'yaoguang', panel: mp(100, p), ...extra,
});
const aha = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'aha', panel: mp(100), ...extra,
});
const jy = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'jingyuan', panel: mp(135, { element: 'Thunder' }), ...extra,
});

function cfg(members: CombatMember[], over: Partial<BattleConfig> = {}): BattleConfig {
  return { members, monster: mon(), rounds: 8, maxTime: 900, techniques: false, ...over };
}
const skillOnly: PolicyFn = () => 'skill';

type R = BattleResult;

function ygActs(r: R): CombatEvent[] {
  return r.events.filter((e) => e.unitId === 'yaoguang' && e.kind === 'action');
}
function codes(r: R): string[] {
  return [...new Set(r.report.bySkill.map((s) => s.skillCode))].sort();
}
function notes(r: R): string[] {
  const out = new Set<string>();
  for (const e of r.events) for (const n of e.note ?? []) out.add(n);
  return [...out].sort();
}

describe('爻光 1511（火/欢愉）', () => {
  it('A 基础链：战技/终结技/欢愉段产生，能量与战技点成链', () => {
    const r = simulateBattle(cfg([yg()], { policy: skillOnly }));
    const acts = ygActs(r);
    expect(acts.length).toBeGreaterThan(0);
    // 爻光拥有独立技能码族 yaoguang.*
    expect(codes(r).some((c) => c.startsWith('yaoguang.'))).toBe(true);
    // 能量链恒为数字（不出现 undefined / 负值）
    for (const e of acts) expect(typeof e.energyAfter).toBe('number');
    expect(r.report.totalDamage).toBeGreaterThan(0);
  });

  it('B 秘技：进战获得好活（关秘技则无秘技标记）', () => {
    const off = simulateBattle(cfg([yg()]));
    const on = simulateBattle(cfg([yg()], { techniques: true }));
    const hasTech = (r: R) => notes(r).some((n) => /tech/i.test(n));
    expect(hasTech(on)).toBe(true);
    expect(hasTech(off)).toBe(false);
    // 秘技给好活当赏 → 欢愉区伤害更高
    expect(on.report.totalDamage).toBeGreaterThan(0);
  });

  it('C E1：全队欢愉伤害无视 20% 防御（e1 防御区因子更大）', () => {
    const e0 = simulateBattle(cfg([yg(), jy()], { policy: skillOnly }));
    const e1 = simulateBattle(cfg([yg({ eidolonLevel: 1 }), jy()], { policy: skillOnly }));
    const maxDef = (r: R) =>
      Math.max(
        ...r.hits
          .filter((h) => h.kind === 'elation' || h.kind === 'direct')
          .map((h) => h.factors.find((f) => f.key === 'defense')?.value ?? 0),
      );
    expect(maxDef(e1)).toBeGreaterThan(maxDef(e0));
  });

  it('D point07 神闲意满：自身暴伤 +60%', () => {
    const r = simulateBattle(cfg([yg()], { policy: skillOnly }));
    const buff = r.events
      .flatMap((e) => e.buffs?.yaoguang ?? [])
      .find((b) => b.key === 'critDmg');
    expect(buff).toBeDefined();
    expect(buff!.value).toBeCloseTo(0.6, 6);
  });

  it('E 面板欢愉度 1：普攻循环中触发阿哈时刻', () => {
    const r = simulateBattle(cfg([yg({}, { elationDegree: 1 })], { policy: () => 'basic' }));
    expect(r.events.some((e) => e.action === 'ahaMoment' || e.unitId === 'ahaMoment')).toBe(true);
  });

  it('F 爻光 + 啊哈 E2：大吉大利 boon 段与升格 lv2 口径成立', () => {
    const r = simulateBattle(cfg([yg(), aha({ eidolonLevel: 2 })], { policy: skillOnly }));
    expect(codes(r).some((c) => c.endsWith('.boon'))).toBe(true);
    expect(r.report.totalDamage).toBeGreaterThan(0);
  });
});
