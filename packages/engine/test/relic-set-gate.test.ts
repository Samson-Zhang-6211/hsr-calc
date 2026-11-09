import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  relicSetEffect,
  simulateBattle,
  type BattleConfig,
  type BuffSnapshot,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

/**
 * 遗器套装门控框架（2026-10）：
 * - CombatMember 带 relicsetId/relicsetId2/planarsetId（存档 build 三字段透传）
 * - battle.ts GEAR 遗器字段：声明套装 id 的成员按 id 门控（匹配保留、不匹配置 0）；
 *   未声明任何 id 的成员维持 DEFAULT_GEAR（旧档/混编零回归）
 * - relicsetId2 存在 → 四件套不激活（2+2 散件语义）
 * - 面板类条件子句（web 侧 conditional panel）不进 panelStats，引擎进战时按
 *   实际状态判定（如蕉乐园暴伤挂载见 init，本框架只管字段门控）
 */

const ALL_ELEMENTS: Element[] = [
  'Physical',
  'Fire',
  'Ice',
  'Wind',
  'Thunder',
  'Quantum',
  'Imaginary',
];

function panel(element: Element, speed: number): MemberPanel {
  return {
    element,
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
  };
}

function monster(): MonsterConfig {
  return {
    level: 90,
    hp: 1e9,
    resistance: {},
    weaknesses: ALL_ELEMENTS,
    maxToughness: 9999,
    speed: 100,
    enemyClass: 'elite',
  };
}

const jy = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'jingyuan',
  panel: panel('Thunder', 135),
  ...extra,
});
const th = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'tenghuang',
  panel: panel('Physical', 134),
  ...extra,
});

function run(members: CombatMember[], maxTime = 100) {
  const cfg: BattleConfig = { members, monster: monster(), rounds: 1, maxTime };
  return simulateBattle(cfg);
}

/** 首个行动事件上某持有者的指定 buff 值；无该 buff 返回 null */
function buffVal(
  r: ReturnType<typeof simulateBattle>,
  holder: string,
  labelKey: string,
): number | null {
  const ev = r.events.find((e) => e.kind === 'action' && e.buffs?.[holder]);
  const list: BuffSnapshot[] | undefined = ev?.buffs?.[holder];
  const b = list?.find((x) => x.labelKey === labelKey);
  return b ? b.value : null;
}

describe('relicSetEffect 数据表', () => {
  it('已知 id 返回条目；未知/空 id 返回 null', () => {
    const s109 = relicSetEffect('109');
    expect(s109).not.toBeNull();
    expect(s109!.fourPiece).toBe(true);
    expect(relicSetEffect('99999')).toBeNull();
    expect(relicSetEffect(null)).toBeNull();
    expect(relicSetEffect(undefined)).toBeNull();
  });
});

describe('遗器套装门控（GEAR 字段三态）', () => {
  it('零回归：全员未声明套装 id → DEFAULT 生效（蕉乐园0.32/露莎卡0.12×2）', () => {
    const r = run([jy()], 300);
    expect(buffVal(r, 'jingyuan', 'banana')).toBeCloseTo(0.32, 10);
    const rucaca = r.events
      .find((e) => e.kind === 'action' && e.buffs?.['jingyuan'])
      ?.buffs?.['jingyuan']?.filter((b) => b.labelKey === 'rucaca') ?? [];
    expect(rucaca.length).toBe(2);
    expect(rucaca[0]!.value).toBeCloseTo(0.12, 10);
  });

  it('planar=318 匹配 → 蕉乐园保留；relicsetId 缺失 → 乐队4 门控置 0', () => {
    const r = run([jy({ planarsetId: '318' })], 300);
    expect(buffVal(r, 'jingyuan', 'banana')).toBeCloseTo(0.32, 10);
    // 声明了套装 id（anySet 路径）→ 遗器字段全部按 id 门控；bandAtk 未声明 → 置 0
    expect(buffVal(r, 'jingyuan', 'band4')).toBe(0);
  });

  it('planar=999 不匹配 → 蕉乐园置 0；planar=317 不匹配 → 同置 0', () => {
    const r999 = run([jy({ planarsetId: '999' })], 300);
    expect(buffVal(r999, 'jingyuan', 'banana')).toBe(0);
    const r317 = run([jy({ planarsetId: '317' })], 300);
    expect(buffVal(r317, 'jingyuan', 'banana')).toBe(0);
  });

  it('隐士：tenghuang relicset=128 保留；999 置 0；128+id2=109 四件套不激活', () => {
    const keep = run([th({ relicsetId: '128' }), jy()]);
    expect(buffVal(keep, 'tenghuang', 'hermit')).toBeCloseTo(0.15, 10);
    const drop = run([th({ relicsetId: '999' }), jy()]);
    expect(buffVal(drop, 'tenghuang', 'hermit')).toBe(0);
    const twoTwo = run([th({ relicsetId: '128', relicsetId2: '109' }), jy()]);
    expect(buffVal(twoTwo, 'tenghuang', 'hermit')).toBe(0);
  });

  it('per-member：tenghuang 未声明 → 隐士维持 DEFAULT；jingyuan 声明 999 → 仅蕉乐园置 0', () => {
    const r = run([th(), jy({ planarsetId: '999' })]);
    expect(buffVal(r, 'tenghuang', 'hermit')).toBeCloseTo(0.15, 10); // th 未声明
    expect(buffVal(r, 'jingyuan', 'banana')).toBe(0); // jy 声明 999 不匹配
  });
});
