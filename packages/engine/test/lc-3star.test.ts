import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
} from '../src/index.js';

/**
 * 3★ 光锥批（2026-10-29，20 件）。
 *
 * 口径（用户裁定）：
 * - 非对应命途 → 光锥文案效果不生效、只有白值生效（本文件全部用同命途载体）。
 * - 20012/20013「单个回合内不可重复触发」= 按装备者正常回合计（终结技/额外回合不重置）。
 * - 回能吃充能效率；速度类走真实速度（tl.speedChange）。
 *
 * 锚点来自 2026-10-29 dump（同文件顶部参数 = R1）。
 */
const panel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 100,
  attack: 1000,
  hp: 3000,
  defence: 800,
  element: 'Physical' as const,
  critRate: 0.5,
  critDmg: 1.0,
  breakEffect: 0,
  damageBonus: 0,
  commonBonus: 0,
  elementDmg: { Physical: 0.3 },
  energyRegen: 0,
  effectHit: 0,
  effectRes: 0,
  healBonus: 0,
  damageReduction: 0,
  ...over,
});

const mk = (
  id: CombatMember['id'],
  lc?: string,
  over: Record<string, unknown> = {},
): CombatMember => ({
  id,
  eidolonLevel: 0,
  ...(lc ? { lightconeId: lc, refinement: 1 } : {}),
  panel: panel(over),
  skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
});

const cfg = (members: CombatMember[], monsterOver: Record<string, unknown> = {}): BattleConfig => ({
  members,
  monster: {
    level: 90,
    hp: 500_000,
    maxToughness: 60,
    speed: 100,
    enemyClass: 'elite',
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    ...monsterOver,
  },
  rounds: 3,
  maxTime: 600,
  seed: 11,
});

const cache = new Map<string, BattleResult>();
const run = (key: string, members: CombatMember[], mon: Record<string, unknown> = {}): BattleResult => {
  let r = cache.get(key);
  if (!r) {
    r = simulateBattle(cfg(members, mon));
    cache.set(key, r);
  }
  return r;
};

/** 标签对应的 buff 行（事件快照里出现的全部实例） */
const buffRows = (r: BattleResult, label: string): Array<Record<string, number | string | undefined>> => {
  const out: Array<Record<string, number | string | undefined>> = [];
  for (const e of r.events) {
    for (const arr of Object.values(e.buffs ?? {})) {
      for (const b of arr as unknown as Array<Record<string, number | string | undefined>>) {
        if (b && typeof b === 'object' && b.labelKey === label) out.push(b);
      }
    }
  }
  return out;
};

const firstEnergyOf = (r: BattleResult, id: string): number => {
  for (const e of r.events) {
    const ea = (e as { energyAfter?: number }).energyAfter;
    if (typeof ea === 'number' && e.unitId === id) return ea;
  }
  return Number.NaN;
};

const factorOf = (r: BattleResult, time: number, source: string, key: string): number | undefined =>
  r.hits.find((h) => Math.abs(h.time - time) < 0.05 && h.source === source)?.factors.find((f) => f.key === key)?.value;

describe('3★ 光锥批（2026-10-29）', () => {
  it('20000 锋镝：进战暴击率 +12%（3 回合）；同命途生效', () => {
    const r = run('20000', [mk('danheng', '20000'), mk('natasha')]);
    const rows = buffRows(r, 'lc20000');
    expect(rows.some((b) => b.key === 'critRate' && b.value === 0.12 && b.duration === 3)).toBe(true);
    // 暴击期望 1 + (0.5+0.12)×1.0 = 1.62（对照 1.50）
    expect(factorOf(r, 100, 'danheng', 'crit')).toBeCloseTo(1.62, 6);
    expect(factorOf(run('base', [mk('danheng'), mk('natasha')]), 100, 'danheng', 'crit')).toBeCloseTo(1.5, 6);
  });

  it('20002 天倾：普攻/战技增伤 +20%（步离/啊不，毁灭载体）；跨命途不生效', () => {
    const base = run('tbd', [mk('trailblazerDestroy'), mk('natasha')]);
    const lc = run('tbd20002', [mk('trailblazerDestroy', '20002'), mk('natasha')]);
    expect(factorOf(base, 100, 'trailblazerDestroy', 'damageBonus')).toBeCloseTo(1.55, 6);
    expect(factorOf(lc, 100, 'trailblazerDestroy', 'damageBonus')).toBeCloseTo(1.75, 6);
    // 巡猎角色戴毁灭光锥 → 效果关闭（total 与无光锥一致）
    const mism = run('mismatch20002', [mk('danheng', '20002'), mk('natasha')]);
    expect(mism.report.totalDamage).toBeCloseTo(run('base', [mk('danheng'), mk('natasha')]).report.totalDamage, 3);
  });

  it('20008 嘉果：进战全队回 6 点能量（吃充能效率，err=0 → +6）', () => {
    const base = run('base', [mk('danheng'), mk('natasha')]);
    const lc = run('20008', [mk('danheng'), mk('natasha', '20008')]);
    expect(firstEnergyOf(lc, 'natasha')).toBeCloseTo(firstEnergyOf(base, 'natasha') + 6, 6);
  });

  it('20019 调和：进战全队速度 +12 点（真实速度 → 首动 89.29 而非 100）', () => {
    const lc = run('20019', [mk('danheng'), mk('asta', '20019')]);
    const first = lc.events.find((e) => e.kind === 'action' && e.action === 'skill' && e.unitId === 'asta');
    expect(first!.time).toBeCloseTo(10000 / 112, 4);
  });

  it('20013 灵钥：战技后回 8 点能量（对照同角色无光锥；上限 100 截断）', () => {
    const base = run('servalBase', [mk('danheng'), mk('serval')]);
    const lc = run('20013', [mk('danheng'), mk('serval', '20013')]);
    const skillB = base.events.find((e) => e.action === 'skill' && e.unitId === 'serval');
    const skillL = lc.events.find((e) => e.action === 'skill' && e.unitId === 'serval');
    // serval 能量上限 100：95 + 8 → 截断 100
    expect(skillL!.energyAfter).toBeCloseTo(Math.min(100, skillB!.energyAfter! + 8), 6);
  });

  it('20012 轮契：施放攻击后回 4 点能量（对照同角色无光锥）', () => {
    const base = run('astaBase', [mk('danheng'), mk('asta')]);
    const lc = run('20012', [mk('danheng'), mk('asta', '20012')]);
    const skillB = base.events.find((e) => e.action === 'skill' && e.unitId === 'asta');
    const skillL = lc.events.find((e) => e.action === 'skill' && e.unitId === 'asta');
    expect(skillL!.energyAfter).toBeCloseTo(skillB!.energyAfter! + 4, 6);
  });

  it('20007 离弦：装备者击杀后攻击力 +24%（3 回合）', () => {
    const r = run('20007kill', [mk('danheng', '20007'), mk('natasha')], { hp: 4000 });
    const rows = buffRows(r, 'lc20007');
    expect(rows.some((b) => b.key === 'atkPct' && b.value === 0.24 && b.duration === 3)).toBe(true);
  });

  it('20022 溯忆：忆灵回合开始叠【缅怀】（每层 +8%，上限 4 层）', () => {
    const r = run('20022', [mk('danheng'), mk('qingge', '20022')]);
    const rows = buffRows(r, 'lc20022');
    expect(rows.some((b) => b.key === 'damageBonus' && b.value === 0.08 && b.stacks === 1)).toBe(true);
    expect(rows.some((b) => b.stacks === 4)).toBe(true);
    // 上限 4：不出现 5 层
    expect(rows.every((b) => (b.stacks as number) <= 4)).toBe(true);
  });

  it('20006 智库：终结技增伤只作用于终结技（同命途智识载体）', () => {
    const base = run('servalBase', [mk('danheng'), mk('serval')]);
    const lc = run('20006', [mk('danheng'), mk('serval', '20006')]);
    const ultB = base.hits.find((h) => h.skillCode === 'serval.ult');
    const ultL = lc.hits.find((h) => h.skillCode === 'serval.ult');
    expect(ultB).toBeDefined();
    expect(ultL).toBeDefined();
    expect(
      ultL!.factors.find((f) => f.key === 'damageBonus')!.value,
    ).toBeCloseTo(ultB!.factors.find((f) => f.key === 'damageBonus')!.value + 0.28, 6);
  });

  it('20009 乐圮：对 HP% > 50% 的目标增伤 +20%（满血木桩）', () => {
    const base = run('tbd', [mk('trailblazerDestroy'), mk('natasha')]);
    const lc = run('tbd20009', [mk('trailblazerDestroy', '20009'), mk('natasha')]);
    expect(factorOf(lc, 100, 'trailblazerDestroy', 'damageBonus')).toBeCloseTo(
      (factorOf(base, 100, 'trailblazerDestroy', 'damageBonus') ?? Number.NaN) + 0.2,
      6,
    );
  });

  // 20003 条件防御（HP%<50% → 防御+16%）在引擎里没有承伤消费点（敌方伤害只吃等级防御区），
  // 只影响护盾公式/展示 → 此处只锁「满血不挂 defPct」，低血分支留口待与护盾公式一并验收。
  it('20003 琥珀：满血不挂条件防御 defPct', () => {
    const r = run('20003full', [mk('danheng'), mk('gepard', '20003')]);
    expect(buffRows(r, 'lc20003').length).toBe(0);
  });

  it('20005 齐颂：进战全队攻击力 +8%（同类不叠）', () => {
    const r = run('20005', [mk('danheng'), mk('asta', '20005')]);
    const rows = buffRows(r, 'lc20005');
    expect(rows.some((b) => b.key === 'atkPct' && b.value === 0.08)).toBe(true);
  });
});
