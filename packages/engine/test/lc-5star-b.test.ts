import { describe, expect, it } from 'vitest';
import { simulateBattle, type BattleConfig, type BattleResult, type CombatMember } from '../src/index.js';

/**
 * 5★ B 批（智识 9 + 巡猎 9）—— **本轮已实现 8 件**：
 * 23001 / 23016 / 23018 / 23033 / 23037 / 23046 / 24001 / 24004。
 * 其余 10 件（23000/23012/23020/23027/23028/23031/23041/23056/23060/23061）已登记参数、效果待下一轮。
 *
 * 用户 2026-10-29 裁定：②23012 不用期望、局内实时条件结算；⑤「助战技」= 战技的一种（引擎已有 `himekoNova.assist`，
 * 23060 的分句只作用助战技）；⑥23028/23031 无视防御做逐技能精确；⑧战技点上限默认 5。
 *
 * 锚点来自 2026-10-29 dump（seed 31，速度 140）。
 */
const panel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 100,
  attack: 1000,
  hp: 4000,
  defence: 800,
  element: 'Physical' as const,
  critRate: 0.5,
  critDmg: 1.0,
  breakEffect: 0.5,
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
const mk = (id: CombatMember['id'], lc?: string, over: Record<string, unknown> = {}): CombatMember => ({
  id,
  eidolonLevel: 0,
  ...(lc ? { lightconeId: lc, refinement: 1 } : {}),
  panel: panel(over),
  skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
});
const enemy = (name: string, hp = 60_000) => ({
  monsterId: '5013010',
  name,
  level: 90,
  hp,
  maxToughness: 120,
  speed: 100,
  attack: 300,
  enemyClass: 'elite' as const,
  resistance: {},
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as const,
});
const cfg = (members: CombatMember[]): BattleConfig => ({
  members,
  monsters: [enemy('r1'), enemy('r2'), enemy('r3')] as unknown as BattleConfig['monsters'],
  rounds: 6,
  maxTime: 1200,
  seed: 31,
});
const cache = new Map<string, BattleResult>();
const run = (key: string, members: CombatMember[]): BattleResult => {
  let r = cache.get(key);
  if (!r) {
    r = simulateBattle(cfg(members));
    cache.set(key, r);
  }
  return r;
};
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
const firstEnergy = (r: BattleResult, id: string): number => {
  for (const e of r.events) {
    const ea = (e as { energyAfter?: number }).energyAfter;
    if (typeof ea === 'number' && e.unitId === id) return ea;
  }
  return Number.NaN;
};
const hitFactor = (r: BattleResult, code: string, key: string): number | undefined =>
  r.hits.find((h) => h.skillCode === code)?.factors.find((f) => f.key === key)?.value;

describe('5★ B 批（智识 / 巡猎）', () => {
  it('23001 于夜色中：速度 140 → 4 层，普攻/战技 +24%', () => {
    const r = run('23001', [mk('danheng', '23001', { speed: 140 }), mk('natasha')]);
    expect(hitFactor(r, 'danheng.skill', 'damageBonus')).toBeCloseTo(1.54, 6);
    // 终结技暴伤半句（+48%）本卡未定锚：终结技伤害段未走到该 typed 判定，留待下一轮补
  });

  it('23016 烦恼着，幸福着：追加攻击 +30%，【温驯】使暴伤随层数提高', () => {
    const r = run('23016', [mk('ratio', '23016'), mk('natasha')]);
    const talent = r.hits.filter((h) => h.skillCode === 'ratio.talent');
    expect(talent.length).toBeGreaterThan(1);
    const c0 = talent[0].factors.find((f) => f.key === 'crit')!.value;
    const c1 = talent[talent.length - 1].factors.find((f) => f.key === 'crit')!.value;
    expect(c1).toBeGreaterThan(c0); // 温驯叠层后暴伤提高
  });

  it('23033 忍法帖：进入战斗立即恢复 30 能', () => {
    const base = run('23033base', [mk('trailblazerDestroy'), mk('serval')]);
    const lc = run('23033', [mk('trailblazerDestroy'), mk('serval', '23033')]);
    expect(firstEnergy(lc, 'serval')).toBeCloseTo(firstEnergy(base, 'serval') + 30, 5);
  });

  it('23046 理想燃烧的地狱：战技点上限 5 < 6 → 进战不加攻；每次战技叠攻击（+10%/次）', () => {
    const r = run('23046', [mk('sushang', '23046'), mk('natasha')]);
    const rows = buffRows(r, 'lc23046');
    expect(rows.some((b) => b.key === 'atkPct' && b.value === 0.1 && b.stacks === 1)).toBe(true);
    expect(Math.max(...rows.map((b) => (b.stacks as number) ?? 0))).toBeGreaterThanOrEqual(2);
  });

  it('24004 不息的演算：攻击后按命中数叠攻击（+4%/个，最多 5 层）', () => {
    const r = run('24004', [mk('trailblazerDestroy'), mk('serval', '24004')]);
    const rows = buffRows(r, 'lc24004atk');
    expect(rows.some((b) => b.key === 'atkPct' && b.value === 0.04 && b.stacks === 3)).toBe(true);
  });
});
