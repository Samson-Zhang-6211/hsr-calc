import { describe, expect, it } from 'vitest';
import { simulateBattle, type BattleConfig, type BattleResult, type CombatMember } from '../src/index.js';

/**
 * 5★ A 批（毁灭 11 + 存护 4 + 丰饶 3）。用户裁定：⑤B 23013 只记录**装备者本人提供的治疗**；
 * 其余按推荐（23002 持续 2 回合、23005 嘲讽 +25、23030 +50、23045/23062 用能量上限、23039 自耗 6% 等）。
 *
 * 锚点来自 2026-10-29 dump。未定锚：23008/23009/23011/23013/23014/23015/23023/23025/23030/
 * 23032/23039/23044/23045（需终结技/护盾/击破/治疗场景）——下一轮补 dump。
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
const enemy = (name: string, hp = 200_000) => ({
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
  seed: 29,
  techniques: true,
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

describe('5★ A 批（毁灭 / 存护 / 丰饶）', () => {
  it('23005 制胜的瞬间：嘲讽 +25（“提高”）+ 受击后防御 +24%（1 回合）', () => {
    const r = run('23005', [mk('gepard', '23005'), mk('natasha')]);
    expect(buffRows(r, 'lc23005taunt').some((b) => b.key === 'taunt' && b.value === 25)).toBe(true);
    expect(buffRows(r, 'lc23005').some((b) => b.key === 'defPct' && b.value === 0.24 && b.duration === 1)).toBe(true);
  });

  it('23002 无可取代的东西：受击后 +24% 增伤（2 回合）', () => {
    const r = run('23002', [mk('blade', '23002'), mk('natasha')]);
    expect(buffRows(r, 'lc23002').some((b) => b.key === 'damageBonus' && b.value === 0.24 && b.duration === 2)).toBe(true);
  });

  it('24000 记一位星神的陨落：施放攻击叠攻击（最多 4 层）+ 击破后增伤 12%', () => {
    const r = run('24000', [mk('trailblazerDestroy', '24000'), mk('natasha')]);
    const rows = buffRows(r, 'lc24000');
    expect(rows.some((b) => b.key === 'atkPct' && b.value === 0.08 && b.stacks === 4)).toBe(true);
    expect(rows.some((b) => b.key === 'damageBonus' && b.value === 0.12 && b.duration === 2)).toBe(true);
  });

  it('23062 所见即我：进战【王之娱乐】→ 全队暴伤 +24%（3 回合，同类不叠）', () => {
    const r = run('23062', [mk('blade', '23062'), mk('natasha')]);
    const rows = buffRows(r, 'lc23062');
    expect(rows.some((b) => b.key === 'critDmg' && b.value === 0.24 && b.duration === 3)).toBe(true);
  });

  it('23051 纵然山河万程：终结技后全队【卫戍】增伤 +24%（3 回合）', () => {
    const r = run('23051', [mk('sanyueqi', '23051'), mk('natasha')]);
    const rows = buffRows(r, 'lc23051');
    expect(rows.some((b) => b.key === 'damageBonus' && b.value === 0.24 && b.duration === 3)).toBe(true);
  });
});
