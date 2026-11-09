import { describe, expect, it } from 'vitest';
import { simulateBattle, type BattleConfig, type BattleResult, type CombatMember } from '../src/index.js';

/**
 * 4★ C 批（毁灭 10 + 智识 8）。用户 2026-10-29 裁定：⑥寒��冷却按装备者自身回合；
 * ⑨22003「回复生命（含所有治疗）」必须接入 —— 实现为**事件边界 HP 对比**（record 顶部）。
 *
 * 锚点来自 2026-10-29 dump。未定锚：21006/21040（需要追加/多段场景）/21019/21020/21027/21033
 * （需低血木桩击杀）/21038/21042/21045（需终结技）/22003（本轮未出现 buff，待复核）。
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
const enemy = (name: string, hp = 4000) => ({
  monsterId: '5013010',
  name,
  level: 90,
  hp,
  maxToughness: 60,
  speed: 100,
  attack: 300,
  enemyClass: 'elite' as const,
  resistance: {},
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as const,
});
const cfg = (members: CombatMember[], hp = 4000): BattleConfig => ({
  members,
  monsters: [enemy('r1', hp), enemy('r2', hp), enemy('r3', hp)] as unknown as BattleConfig['monsters'],
  rounds: 5,
  maxTime: 900,
  seed: 23,
});
const cache = new Map<string, BattleResult>();
const run = (key: string, members: CombatMember[], hp = 4000): BattleResult => {
  let r = cache.get(key);
  if (!r) {
    r = simulateBattle(cfg(members, hp));
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
const srcFactor = (r: BattleResult, source: string, key: string): number | undefined =>
  r.hits.find((h) => h.source === source && h.kind === 'direct')?.factors.find((f) => f.key === key)?.value;

describe('4★ C 批（毁灭 / 智识）', () => {
  it('21005 鼹鼠党欢迎你：普攻/战技/终结技各叠 1 层攻击（+12%/层，最多 3 层）', () => {
    const r = run('21005', [mk('trailblazerDestroy', '21005'), mk('serval')]);
    const rows = buffRows(r, 'lc21005');
    expect(rows.some((b) => b.key === 'atkPct' && b.value === 0.12)).toBe(true);
    expect(Math.max(...rows.map((b) => (b.stacks as number) ?? 0))).toBeLessThanOrEqual(3);
  });

  it('21026 汪！散步时间！：对灼烧目标 +16%（hook 战技命中）', () => {
    const r = run('21026', [mk('hook', '21026'), mk('serval')]);
    const hit = r.hits.find((h) => h.skillCode === 'hook.skill');
    expect(hit?.factors.find((f) => f.key === 'damageBonus')?.value).toBeCloseTo(1.46, 6);
  });

  it('21034 今日亦是和平的一日：按能量上限增伤（serval 上限 100 → +20%）', () => {
    const r = run('21034', [mk('trailblazerDestroy'), mk('serval', '21034')]);
    expect(srcFactor(r, 'serval', 'damageBonus')).toBeCloseTo(1.2, 6);
  });

  it('22004 宇宙大生意：7 弱点 → +28% 增伤', () => {
    const r = run('22004', [mk('trailblazerDestroy'), mk('serval', '22004')]);
    expect(srcFactor(r, 'serval', 'damageBonus')).toBeCloseTo(1.28, 6);
  });

  it('21012 秘密誓心：无条件 +20% 增伤', () => {
    const r = run('21012', [mk('trailblazerDestroy', '21012'), mk('serval')]);
    expect(srcFactor(r, 'trailblazerDestroy', 'damageBonus')).toBeGreaterThanOrEqual(1.5);
  });

  it('21013 别让世界静下来：进战立即回 20 能', () => {
    const base = run('base', [mk('trailblazerDestroy'), mk('serval')]);
    const lc = run('21013', [mk('trailblazerDestroy'), mk('serval', '21013')]);
    const firstEnergy = (r: BattleResult, id: string): number => {
      for (const e of r.events) {
        const ea = (e as { energyAfter?: number }).energyAfter;
        if (typeof ea === 'number' && e.unitId === id) return ea;
      }
      return Number.NaN;
    };
    expect(firstEnergy(lc, 'serval')).toBeCloseTo(firstEnergy(base, 'serval') + 20, 5);
  });
});
