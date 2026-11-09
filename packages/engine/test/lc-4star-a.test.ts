import { describe, expect, it } from 'vitest';
import { simulateBattle, type BattleConfig, type BattleResult, type CombatMember } from '../src/index.js';

/**
 * 4★ A 批（丰饶/存护/记忆 23 件）—— 已定锚部分。
 *
 * 口径（用户 2026-10-29 裁定）：
 * - 非对应命途 → 光锥文案效果不生效（本文件全部同命途载体）。
 * - 21002 全属性抗性**真接乘区**（敌方伤害 ×(1−抗性)）。
 * - 21009 受击概率「提高」= 嘲讽权重 +25（「大幅提高」才是 +50）。
 *
 * 锚点来自 2026-10-29 dump（monsterId=5013010 会出手，attack 400）。
 * 其余件（21007/21016/21021/21028/21030/21035/21048/21051/21052/21053/21054/21055/21057）
 * 已实现，精确锚点待下一轮补 dump（见 docs/AGENTS-lightcones.md 待办）。
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

const mk = (id: CombatMember['id'], lc?: string, over: Record<string, unknown> = {}): CombatMember => ({
  id,
  eidolonLevel: 0,
  ...(lc ? { lightconeId: lc, refinement: 1 } : {}),
  panel: panel(over),
  skillLevels: { basic: 6, skill: 10, ult: 10, talent: 10 },
});

const cfg = (members: CombatMember[]): BattleConfig => ({
  members,
  monster: {
    monsterId: '5013010',
    name: 'rock',
    level: 90,
    hp: 400_000,
    maxToughness: 60,
    speed: 100,
    attack: 400,
    enemyClass: 'elite',
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
  },
  rounds: 4,
  maxTime: 900,
  seed: 13,
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

const firstEnemyDamage = (r: BattleResult): number => r.events.flatMap((e) => e.enemyHits ?? [])[0]?.damage ?? Number.NaN;

describe('4★ A 批（丰饶/存护/记忆）', () => {
  it('21002 余生的第一天：进战全队全属性抗性 +8%，敌方伤害 ×0.92', () => {
    const base = run('base', [mk('gepard'), mk('natasha')]);
    const lc = run('21002', [mk('gepard', '21002'), mk('natasha')]);
    const rows = buffRows(lc, 'lc21002');
    expect(rows.some((b) => b.key === 'resAll' && b.value === 0.08)).toBe(true);
    expect(firstEnemyDamage(lc)).toBeCloseTo(firstEnemyDamage(base) * 0.92, 4);
    // 同类不叠：两件同队仍只挂一份
    const dup = run('21002dup', [mk('gepard', '21002'), mk('natasha', '21002')]);
    expect(buffRows(dup, 'lc21002').length).toBe(buffRows(lc, 'lc21002').length);
    // 跨命途不生效（毁灭载体）
    const mism = run('21002mism', [mk('trailblazerDestroy', '21002'), mk('natasha')]);
    expect(buffRows(mism, 'lc21002').length).toBe(0);
  });

  it('21009 朗道的选择：嘲讽权重 +25 + 受伤降低 16%（敌方伤害 ×0.84）', () => {
    const base = run('base', [mk('gepard'), mk('natasha')]);
    const lc = run('21009', [mk('gepard', '21009'), mk('natasha')]);
    expect(buffRows(lc, 'lc21009taunt').some((b) => b.key === 'taunt' && b.value === 25)).toBe(true);
    expect(buffRows(lc, 'lc21009').some((b) => b.key === 'dmgReduction' && b.value === 0.16)).toBe(true);
    expect(firstEnemyDamage(lc)).toBeCloseTo(firstEnemyDamage(base) * 0.84, 4);
  });

  it('21023 我们是地火：进战全队受伤降低 8%（5 回合递减）', () => {
    const lc = run('21023', [mk('gepard', '21023'), mk('natasha')]);
    const rows = buffRows(lc, 'lc21023');
    expect(rows.some((b) => b.key === 'dmgReduction' && b.value === 0.08 && b.duration === 5)).toBe(true);
    // 递减：至少出现 4/3/2 三档（乱序，按集合判）
    const durs = new Set(rows.map((b) => b.duration));
    expect([4, 3, 2].every((d) => durs.has(d))).toBe(true);
  });

  it('21014 此时恰好：治疗量 = 效果抵抗×33%，上限 15%（effRes 0.5 → 0.15）', () => {
    const lc = run('21014', [mk('gepard'), mk('natasha', '21014', { effectRes: 0.5 })]);
    expect(buffRows(lc, 'lc21014').some((b) => b.key === 'healBonus' && b.value === 0.15)).toBe(true);
  });

  it('22001 嘿，我在这儿：战技后治疗量 +16%（2 回合）', () => {
    const lc = run('22001', [mk('gepard'), mk('natasha', '22001')]);
    const rows = buffRows(lc, 'lc22001');
    expect(rows.some((b) => b.key === 'healBonus' && b.value === 0.16 && b.duration === 2)).toBe(true);
  });

  it('22006 飞向粉色的明天：记忆开拓者装备 → 全队增伤 +8%', () => {
    const lc = run('22006', [mk('trailblazerMem', '22006'), mk('natasha')]);
    const rows = buffRows(lc, 'lc22006');
    expect(rows.some((b) => b.key === 'damageBonus' && b.value === 0.08)).toBe(true);
    // 非记忆开拓者装备 → 不生效
    const other = run('22006other', [mk('gepard', '22006'), mk('natasha')]);
    expect(buffRows(other, 'lc22006').length).toBe(0);
  });
});
