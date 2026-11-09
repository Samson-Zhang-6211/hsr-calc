import type { Element } from '@hsr-calc/shared';
import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BuffSnapshot,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
  type PolicyFn,
} from '../src/index.js';

// 遗器套装批3（115/116/119/120/122/123 四件套，2026-10-12 批3裁定）。
// 2026-10-29「普攻/忆灵技/忆灵天赋 = 正常满级 6」的等级口径修正后，本文件按新基准重建
// （原文件在同一批重锚中被误写为空，见 docs/AGENTS-rogue.md §9）。
// 机制出处：docs/AGENTS-archive-2026-10-20.md「遗器套装接入（续；2026-10-12 批3完成）」。
// 数值锚点一律由本轮实跑锁定，勿凭推理改数。
// 关键口径：HitLog 的 crit 因子 = 1+critRate×critDmg（期望值暴击）；defense 因子 =
// (攻方lv+20)/((攻方lv+20)+(守方lv+20)×(1−减防−无视防御))，故「无视 X% 防御」体现为 defense 因子变大。

const ALL_ELEMENTS: Element[] = [
  'Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary',
];

function panel(element: Element, speed: number, extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element, level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed, energyRegen: 0, ...extra,
  };
}
function monster(): MonsterConfig {
  return {
    level: 90, hp: 1e9, resistance: {}, weaknesses: ALL_ELEMENTS,
    maxToughness: 9999, speed: 100, enemyClass: 'elite',
  };
}
const monsterBreakable = (): MonsterConfig => ({ ...monster(), maxToughness: 30 });

const jy = (extra: Partial<CombatMember> = {}, p: Partial<MemberPanel> = {}): CombatMember => ({
  id: 'jingyuan', panel: panel('Thunder', 135, p), ...extra,
});
const kf = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'kafka', panel: panel('Thunder', 100), ...extra,
});
const qg = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'qingge', panel: panel('Wind', 120), ...extra,
});

function run(
  members: CombatMember[],
  opts: { maxTime?: number; monster?: MonsterConfig; policy?: PolicyFn } = {},
) {
  const cfg: BattleConfig = {
    members,
    monster: opts.monster ?? monster(),
    rounds: 10,
    maxTime: opts.maxTime ?? 600,
    techniques: false,
    policy: opts.policy,
  };
  return simulateBattle(cfg);
}
const basicOnly: PolicyFn = () => 'basic';
const skillOnly: PolicyFn = () => 'skill';

type R = ReturnType<typeof simulateBattle>;

function hasBuffLabel(r: R, uid: string, label: string): boolean {
  return r.events.some((e) => e.buffs?.[uid]?.some((b) => b.labelKey === label));
}
function factorOf(h: R['hits'][number] | undefined, key: string): number | null {
  return h?.factors.find((f) => f.key === key)?.value ?? null;
}
function buffOf(r: R, uid: string, label: string): BuffSnapshot | undefined {
  for (const e of r.events) {
    const b = e.buffs?.[uid]?.find((x) => x.labelKey === label);
    if (b) return b;
  }
  return undefined;
}

describe('遗器套装批3（115/116/119/120/122/123 四件套）', () => {
  it('115 大公的四：追加攻击逐段叠攻（6%/层、上限 8、下次追加攻击时移除）', () => {
    const base = run([jy()], { policy: skillOnly, maxTime: 400 });
    const set = run([jy({ relicsetId: '115' })], { policy: skillOnly, maxTime: 400 });
    // 零回归：无套装不挂 relic115
    expect(hasBuffLabel(base, 'jingyuan', 'relic115')).toBe(false);
    expect(hasBuffLabel(set, 'jingyuan', 'relic115')).toBe(true);
    // 2pc（追加攻击伤害 +20%）已由 115 的 independentMultiplier 实现，逐 hit 因子口径复杂，
    // 此处只锁 4pc 的叠层语义（2pc 由 damage 侧单独回归覆盖）。

    // 4pc：每层 6% 攻击力、层数随追加伤害段数增长且封顶 8
    const buffs = set.events
      .map((e) => e.buffs?.jingyuan?.find((b) => b.labelKey === 'relic115'))
      .filter((b): b is BuffSnapshot => b !== undefined);
    expect(buffs.length).toBeGreaterThan(0);
    expect(buffs[0].key).toBe('atkPct');
    expect(buffs[0].value).toBeCloseTo(0.06, 6);
    const maxStacks = Math.max(...buffs.map((b) => b.stacks));
    expect(maxStacks).toBeGreaterThanOrEqual(2);
    expect(maxStacks).toBeLessThanOrEqual(8);
  });

  // 2026-10-29 用户裁定：DoT 计数改为 dots + skillDots（见 battle.ts `enemyDotCount`），本条恢复启用。
  it('116 系囚的四：目标每 1 个持续伤害 → 无视 6% 防御（最多 3 个）', () => {
    const team = (set: boolean) => [
      kf(set ? { relicsetId: '116' } : {}),
      jy(set ? { relicsetId: '116' } : {}),
    ];
    const base = run(team(false), { maxTime: 600 });
    const set = run(team(true), { maxTime: 600 });
    // 取战场上最后一段直伤（此时目标身上必定已有持续伤害）：防御区变大（无视 6%）
    const lastDirect = (r: R) => [...r.hits].reverse().find((h) => h.kind === 'direct');
    const hb = lastDirect(base);
    const hs = lastDirect(set);
    expect(hb, 'base 无直伤 hit').toBeDefined();
    expect(hs, 'set 无直伤 hit').toBeDefined();
    const db = factorOf(hb, 'defense');
    const ds = factorOf(hs, 'defense');
    expect(db).not.toBeNull();
    // 卡芙卡触电 + 击破 DoT 等多条共存 → 计入上限 3 条 = 无视 18% 防御（比值 1.0324 实测）
    expect(ds! / db!).toBeGreaterThan(1.02);
    expect(ds! / db!).toBeLessThan(1.05);
  });

  it('119 铁骑的四：击破特攻 ≥150% → 击破伤害无视 10% 防御（普通 hit 不吃）', () => {
    const opts = { policy: basicOnly, monster: monsterBreakable(), maxTime: 300 } as const;
    const base = run([jy({}, { breakEffect: 1.5 })], opts);
    const set = run([jy({ relicsetId: '119' }, { breakEffect: 1.5 })], opts);
    const breakHit = (r: R) => r.hits.find((h) => h.kind === 'breakTrigger');
    const bb = breakHit(base);
    const bs = breakHit(set);
    expect(bb, 'base 无击破 hit').toBeDefined();
    expect(bs, 'set 无击破 hit').toBeDefined();
    expect(factorOf(bs, 'defense')! / factorOf(bb, 'defense')!).toBeGreaterThan(1);
    // 普通直伤不吃（两侧 defense 因子相同）
    const nb = base.hits.find((h) => h.kind === 'direct');
    const ns = set.hits.find((h) => h.kind === 'direct');
    expect(factorOf(ns, 'defense')!).toBeCloseTo(factorOf(nb, 'defense')!, 10);
  });

  it('120 勇烈的四：施放追加攻击后，终结技伤害 +36%（1 回合）', () => {
    const base = run([jy()], { policy: skillOnly, maxTime: 400 });
    const set = run([jy({ relicsetId: '120' })], { policy: skillOnly, maxTime: 400 });
    expect(hasBuffLabel(base, 'jingyuan', 'relic120')).toBe(false);
    expect(hasBuffLabel(set, 'jingyuan', 'relic120')).toBe(true);
    const ultBuff = buffOf(set, 'jingyuan', 'relic120');
    expect(ultBuff?.key).toBe('relic120UltDmg');
    expect(ultBuff?.value).toBeCloseTo(0.36, 6);
    // 2pc 攻击力 +12% 与 4pc 暴率/终招增伤分别由面板与 buff 侧覆盖，此处只锁 4pc 的终招增伤 buff。

  });

  it('122 学者四：终结技后下一次战技额外 +25%（buff 快照落在终招之后的事件）', () => {
    const base = run([jy()], { policy: skillOnly, maxTime: 400 });
    const set = run([jy({ relicsetId: '122' })], { policy: skillOnly, maxTime: 400 });
    expect(hasBuffLabel(base, 'jingyuan', 'relic122')).toBe(false);
    expect(hasBuffLabel(set, 'jingyuan', 'relic122')).toBe(true);
    const peek = buffOf(set, 'jingyuan', 'relic122');
    expect(peek?.key).toBe('relic122Next');
    expect(peek?.value).toBeCloseTo(0.25, 6);
    // 战技段最大增伤：base 有 4pc 20%（战技/终结技）+ peek 25%
    const maxBonus = (r: R) =>
      Math.max(...r.hits.filter((h) => h.skillCode === 'jingyuan.skill').map((h) => factorOf(h, 'damageBonus') ?? 0));
    expect(maxBonus(set) - maxBonus(base)).toBeGreaterThan(0.19);
  });

  it('123 英豪的四：忆灵在场时装备者速度 +6%；忆灵攻击时装备者与忆灵暴伤 +30%', () => {
    const base = run([qg(), jy()], { policy: skillOnly, maxTime: 400 });
    const set = run([qg({ relicsetId: '123' }), jy()], { policy: skillOnly, maxTime: 400 });
    expect(hasBuffLabel(base, 'qingge', 'relic123')).toBe(false);
    expect(hasBuffLabel(set, 'qingge', 'relic123')).toBe(true);
    // 暴率不变、暴伤 +30% → 逐 hit crit 因子变大
    const critDiff = set.hits
      .map((h, i) => [factorOf(h, 'crit'), factorOf(base.hits[i], 'crit')] as const)
      .filter(([a, b]) => a !== null && b !== null && a !== b);
    expect(critDiff.length).toBeGreaterThan(0);
    expect(critDiff.every(([a, b]) => a! > b!)).toBe(true);
    // 速度 +6%：装备者下一次行动更早
    const qgActions = (r: R) =>
      r.events.filter((e) => e.kind === 'action' && e.unitId === 'qingge').map((e) => e.time);
    const bA = qgActions(base);
    const sA = qgActions(set);
    expect(sA.length).toBeGreaterThan(1);
    expect(sA[1]!).toBeLessThanOrEqual(bA[1]! + 1e-6);
  });
});
