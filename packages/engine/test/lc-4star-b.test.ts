import { describe, expect, it } from 'vitest';
import { simulateBattle, type BattleConfig, type BattleResult, type CombatMember } from '../src/index.js';

/**
 * 4★ B 批（巡猎 9 + 同谐 10）。
 *
 * 用户 2026-10-29 裁定：①敌数**含敌方召唤物**；⑥21031 每次攻击按**基础概率**直接判定（不乘暴击率）；
 * 其余按推荐：21010 首段 1 层、21018 只推成员、21024 速度与增伤都归引擎、21025 只认其他成员、
 * 21032 排除上次、21036 认装备者最新类型、21037 按暴击率累层、21046 按命途分组、21047 进战即触发。
 *
 * 锚点来自 2026-10-29 dump（seed 17，1000 攻 / 0.5 暴率 / 1.0 暴伤）。
 * 未定锚：21018（行动提前同刻难观测）、22002（5 回合内未开大）、21031（木桩无增益可解）。
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

const enemy = (name: string) => ({
  monsterId: '5013010',
  name,
  level: 90,
  hp: 300_000,
  maxToughness: 60,
  speed: 100,
  attack: 300,
  enemyClass: 'elite' as const,
  resistance: {},
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as const,
});

const cfg = (members: CombatMember[], enemies = 3): BattleConfig => ({
  members,
  monsters: Array.from({ length: enemies }, (_, i) => enemy(`r${i + 1}`)) as unknown as BattleConfig['monsters'],
  rounds: 5,
  maxTime: 900,
  seed: 17,
});

const cache = new Map<string, BattleResult>();
const run = (key: string, members: CombatMember[], enemies = 3): BattleResult => {
  let r = cache.get(key);
  if (!r) {
    r = simulateBattle(cfg(members, enemies));
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

const factor = (r: BattleResult, source: string, key: string): number | undefined =>
  r.hits.find((h) => h.source === source && h.kind === 'direct')?.factors.find((f) => f.key === key)?.value;

describe('4★ B 批（巡猎 / 同谐）', () => {
  it('21003 唯有沉默：3 敌全活时不触发暴击率加成（对照 1.5）', () => {
    const three = run('21003three', [mk('danheng', '21003'), mk('natasha')], 3);
    expect(factor(three, 'danheng', 'crit')).toBeCloseTo(1.5, 6);
  });

  it('21010 论剑：首段即 1 层（+8% 增伤）', () => {
    const r = run('21010', [mk('sushang', '21010'), mk('natasha')]);
    expect(factor(r, 'sushang', 'damageBonus')).toBeCloseTo(1.38, 6);
  });

  it('21011 与行星相会：同属性伤害 +12%（同队物理）', () => {
    const r = run('21011', [mk('asta', '21011'), mk('danheng')]);
    expect(factor(r, 'asta', 'damageBonus')).toBeCloseTo(1.42, 6);
  });

  it('21017 点个关注吧！：普攻/战技伤害 +24%', () => {
    const r = run('21017', [mk('danheng', '21017'), mk('natasha')]);
    expect(factor(r, 'danheng', 'damageBonus')).toBeCloseTo(1.54, 6);
  });

  it('21024 春水初生：进战速度 +8%（首动 92.6）+ 增伤 +12%', () => {
    const r = run('21024', [mk('danheng', '21024'), mk('natasha')]);
    const first = r.events.find((e) => e.action === 'skill' && e.unitId === 'danheng');
    expect(first!.time).toBeCloseTo(10000 / 108, 3);
    expect(factor(r, 'danheng', 'damageBonus')).toBeCloseTo(1.42, 6);
  });

  it('21025 过往未来：战技后下一位其他成员获得 +16%（1 回合）', () => {
    const r = run('21025', [mk('asta', '21025'), mk('danheng')]);
    const rows = buffRows(r, 'lc21025');
    expect(rows.some((b) => b.key === 'damageBonus' && b.value === 0.16 && b.duration === 1)).toBe(true);
  });

  it('21032 镂月裁云：随机效果在攻击/暴伤/能量恢复三选一，且不与上次重复', () => {
    const r = run('21032', [mk('asta', '21032'), mk('danheng')]);
    const rows = buffRows(r, 'lc21032');
    expect(rows.length).toBeGreaterThan(0);
    const keys = new Set(rows.map((b) => b.key));
    for (const k of keys) expect(['atkPct', 'critDmg', 'energyRegen']).toContain(k);
    const values = rows.map((b) => b.value);
    for (const v of values) expect([0.1, 0.12, 0.06]).toContain(v);
  });

  it('21046 芳华待灼：同命途 ≥2 → 这些角色暴伤 +16%', () => {
    const r = run('21046', [mk('asta', '21046'), mk('tingyun')]);
    expect(buffRows(r, 'lc21046').some((b) => b.key === 'critDmg' && b.value === 0.16)).toBe(true);
    // 暴击因子 1 + 0.5×(1+0.16) = 1.58
    expect(factor(r, 'asta', 'crit')).toBeCloseTo(1.58, 6);
  });

  it('21047 黑夜如影随行：进战速度 +8%（首动 92.6）', () => {
    const r = run('21047', [mk('danheng', '21047'), mk('natasha')]);
    const first = r.events.find((e) => e.action === 'skill' && e.unitId === 'danheng');
    expect(first!.time).toBeCloseTo(10000 / 108, 3);
  });

  it('21056 追逐风的时候：全队击破伤害 +16%', () => {
    const base = run('base2', [mk('asta'), mk('danheng')]);
    const r = run('21056', [mk('asta', '21056'), mk('danheng')]);
    expect(buffRows(r, 'lc21056').some((b) => b.key === 'breakDmgBoost' && b.value === 0.16)).toBe(true);
    const br = (x: BattleResult) => x.hits.find((h) => h.kind === 'breakTrigger')?.total ?? Number.NaN;
    expect(br(r) / br(base)).toBeCloseTo(1.16, 3);
  });

  it('21062 于那终点再见：战技/追加攻击 +24%', () => {
    const r = run('21062', [mk('danheng', '21062'), mk('natasha')]);
    expect(factor(r, 'danheng', 'damageBonus')).toBeCloseTo(1.54, 6);
  });

  it('22005 永远的迷境饭：战技后攻击力叠层（最多 3 层）', () => {
    const r = run('22005', [mk('asta', '22005'), mk('danheng')]);
    const rows = buffRows(r, 'lc22005');
    const maxStacks = Math.max(0, ...rows.map((b) => (b.stacks as number) ?? 0));
    expect(rows.some((b) => b.key === 'atkPct' && b.value === 0.08)).toBe(true);
    expect(maxStacks).toBeGreaterThanOrEqual(2);
    expect(maxStacks).toBeLessThanOrEqual(3);
  });

  it('22008 向着地平线的终点：追加攻击后暴伤叠层', () => {
    const r = run('22008', [mk('ratio', '22008'), mk('natasha')]);
    const rows = buffRows(r, 'lc22008');
    expect(rows.some((b) => b.key === 'critDmg' && b.value === 0.03 && (b.stacks as number) >= 1)).toBe(true);
  });

  it('21037 最后的赢家：暴击期望叠【好运】→ 暴伤 buff', () => {
    const r = run('21037', [mk('danheng', '21037'), mk('natasha')]);
    const rows = buffRows(r, 'lc21037');
    expect(rows.length).toBeGreaterThan(0);
    // 每段按暴击率 0.5 累加 → 层数 0.5、0.1×0.5 = 0.04（每层 0.08）
    expect(rows.some((b) => b.key === 'critDmg' && (b.value as number) > 0)).toBe(true);
  });
});
