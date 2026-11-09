import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  lcParams,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CharId,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

const ALL_ELEMENTS: Element[] = [
  'Physical',
  'Fire',
  'Ice',
  'Wind',
  'Thunder',
  'Quantum',
  'Imaginary',
];

function mp(speed: number, extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Fire',
    level: 80,
    hp: 10000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0,
    ...extra,
  };
}

function mon(hp = 1e9, toughness = 9999): MonsterConfig {
  return {
    level: 90,
    hp,
    resistance: {},
    weaknesses: ALL_ELEMENTS,
    maxToughness: toughness,
    speed: 100,
    enemyClass: 'elite',
  };
}

function cfg(members: CombatMember[], overrides: Partial<BattleConfig> = {}): BattleConfig {
  return { members, monster: mon(), rounds: 8, maxTime: 1500, techniques: false, ...overrides };
}

const skillPolicy = () => 'skill' as const;

function tenghuang(lc?: string, ref?: number): CombatMember {
  return {
    id: 'tenghuang' as CharId,
    panel: mp(134),
    ...(lc ? { lightconeId: lc, refinement: ref } : {}),
  };
}
function yaoguang(lc?: string, ref?: number): CombatMember {
  return {
    id: 'yaoguang' as CharId,
    panel: mp(100),
    ...(lc ? { lightconeId: lc, refinement: ref } : {}),
  };
}
function sunday(lc?: string, ref?: number): CombatMember {
  return {
    id: 'sunday' as CharId,
    panel: mp(134),
    ...(lc ? { lightconeId: lc, refinement: ref } : {}),
  };
}
function aglaea(lc?: string, ref?: number): CombatMember {
  return {
    id: 'aglaea' as CharId,
    panel: mp(159),
    ...(lc ? { lightconeId: lc, refinement: ref } : {}),
  };
}
function jingyuan(): CombatMember {
  return { id: 'jingyuan' as CharId, panel: mp(135) };
}

function factorOf(hit: BattleResult['hits'][number], key: string): number {
  const f = hit.factors.find((x) => x.key === key);
  if (!f) throw new Error(`factors 缺少 ${key}：${hit.skillCode}`);
  return f.value as number;
}

function skillEvents(r: BattleResult, unitId: string): CombatEvent[] {
  return r.events.filter((e) => e.kind === 'action' && e.unitId === unitId && e.action === 'skill');
}

function ultEvents(r: BattleResult, unitId: string): CombatEvent[] {
  return r.events.filter((e) => e.kind === 'ult' && e.unitId === unitId);
}

let cache: Record<string, BattleResult> | undefined;
function runs(): Record<string, BattleResult> {
  if (!cache) {
    cache = {
      // 23065：腾荒恒战技（CD 轮转可观测）与对照
      th65: simulateBattle(cfg([tenghuang('23065', 1)], { policy: skillPolicy })),
      th0: simulateBattle(cfg([tenghuang()], { policy: skillPolicy })),
      // 23054：爻光与对照（默认策略）
      yg54: simulateBattle(cfg([yaoguang('23054', 1)])),
      yg0: simulateBattle(cfg([yaoguang()])),
      // 23054 大招刷新白名单：周日（+景元避免单人 resolveAlly 越界）、阿雅（不刷新）
      su54: simulateBattle(cfg([sunday('23054', 1), jingyuan()], { policy: skillPolicy })),
      ag54: simulateBattle(cfg([aglaea('23054', 1)], { policy: skillPolicy })),
    };
  }
  return cache;
}

describe('啊哈/爻光专武 23065·23054（步骤8，2026-10）', () => {
  // 数据口径锁：23065 的 #3（笑点获取间隔）在 4.6.54 由 2 → 1（desc 同步改为「每间隔#3回合」）。
  // 引擎读 lcParams 覆盖 LC23065.cdTurns，故这里直接锁数据表，防上游再次改动时静默漂移。
  it('23065 数据：#3 间隔 = 1（各叠影一致）', () => {
    for (const ref of [1, 2, 3, 4, 5]) {
      const p = lcParams('23065', ref);
      expect(p).not.toBeNull();
      expect(p![2]).toBe(1);
    }
  });
  // 2026-10-29 命途规则：23065 是欢愉光锥，存护腾荒属跨命途 → 效果不生效（原精确锚点待用
  // 欢愉载体重建，见 docs/AGENTS-lightcones.md）。
  it('23065：跨命途（存护腾荒）→ 笑点/无视防御全部关闭', () => {
    const { th65, th0 } = runs();
    const skills65 = skillEvents(th65, 'tenghuang');
    expect(skills65.some((e) => (e.note ?? []).includes('lc65Laugh'))).toBe(false);
    expect(th65.finalState.laughPoints).toBe(0);
    expect(th0.finalState.laughPoints).toBe(0);
    const ult65 = th65.hits.find((h) => h.skillCode === 'tenghuang.ult');
    const ult0 = th0.hits.find((h) => h.skillCode === 'tenghuang.ult');
    expect(ult65).toBeDefined();
    expect(ult0).toBeDefined();
    expect(factorOf(ult65!, 'defense')).toBeCloseTo(factorOf(ult0!, 'defense'), 10);
    expect(th65.report.totalDamage).toBeCloseTo(th0.report.totalDamage, 3);
  });

  it('23054 进战：速度+18%/上上签全队双暴/固定回15+能量恢复效率12%', () => {
    const { yg54, yg0 } = runs();
    // 速度 100→118：首行动 10000/118=84.75 vs 100.00
    const ev54 = yg54.events.find((e) => e.unitId === 'yaoguang');
    const ev0 = yg0.events.find((e) => e.unitId === 'yaoguang');
    expect(ev54!.time).toBeCloseTo(84.75, 2);
    expect(ev0!.time).toBeCloseTo(100.0, 2);
    // 进战上上签：我方全体暴率+0.10/暴伤+0.30（首个欢愉 hit crit 因子）
    const hit54 = yg54.hits[0];
    const hit0 = yg0.hits[0];
    expect(factorOf(hit54, 'crit')).toBeCloseTo(1.21, 5);
    expect(factorOf(hit0, 'crit')).toBeCloseTo(1.055, 5);
    // 每波次固定回15（进战视为第1波）+ 能量恢复效率：首战技 en = 90+15+30×1.12 = 138.6 vs 90+30 = 120
    const sk54 = skillEvents(yg54, 'yaoguang')[0];
    const sk0 = skillEvents(yg0, 'yaoguang')[0];
    expect(sk54.energyAfter).toBeCloseTo(138.6, 5);
    expect(sk0.energyAfter).toBeCloseTo(120, 5);
    // 2026-10-18 数据 4.6.53（150229/1511xx 变更）后 dump 锚；
    // 2026-11-05 爻光升格需啊哈在队（本例无啊哈 → 无升格回能/笑点）→ 重锚
    expect(yg54.report.totalDamage).toBeCloseTo(233716.98, 1);
    expect(yg0.report.totalDamage).toBeCloseTo(207365.66, 1);
  });

  // 2026-10-29 命途规则：23054 是欢愉光锥 → 只有爻光（欢愉）触发刷新；
  // 周日（同谐）/阿雅（记忆）属跨命途，效果关闭（原白名单锚点待用欢愉载体重建）。
  it('23054 大招刷新：爻光（同命途）触发；周日/阿雅（跨命途）不触发', () => {
    const { yg54, su54, ag54 } = runs();
    const ygUlts = ultEvents(yg54, 'yaoguang');
    expect(ygUlts.length).toBeGreaterThanOrEqual(1);
    for (const ev of ygUlts) expect(ev.note ?? []).toContain('lc54Sign');
    for (const ev of ultEvents(su54, 'sunday')) expect(ev.note ?? []).not.toContain('lc54Sign');
    for (const ev of ultEvents(ag54, 'aglaea')) expect(ev.note ?? []).not.toContain('lc54Sign');
  });
});
