import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  ENERGY_MAX,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CharId,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// 同构双形态覆盖（2026-10-29 补充）：8003/8004 存护开拓者、8005/8006 同谐开拓者共用一套参数表，
// 但两个 CharId 都进了 SUPPORTED_IDS / 两页可选列表 → 需要至少各有一条直跑用例证明「换 id 也能正常出伤/上盾」。
// （knight2.test.ts 只覆盖 8003，shaman.test.ts 只覆盖 8005。）

function panel(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Fire', level: 80, hp: 12000, attack: 3000, defence: 1000,
    critRate: 0.2, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed: 100, energyRegen: 0, ...extra,
  } as MemberPanel;
}
const MON: MonsterConfig = {
  level: 90, hp: 5e8, maxToughness: 3000, speed: 100,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
  enemyClass: 'normal', monsterId: '1012010', attack: 0,
} as MonsterConfig;

function run(id: CharId, action: 'basic' | 'skill'): BattleResult {
  const cfg: BattleConfig = {
    members: [{ id, panel: panel() }],
    monster: MON,
    maxTime: 400,
    initialSp: 3,
    seed: 7,
    techniques: false,
    policy: () => action,
  } as BattleConfig;
  return simulateBattle(cfg);
}

function firstAct(r: BattleResult, id: CharId) {
  const ev = r.events.find((e) => e.kind === 'action' && e.unitId === id);
  expect(ev).toBeDefined();
  return ev!;
}

describe('同构双形态 8004 / 8006', () => {
  it('8004 存护开拓者 2：普攻按自身 id 出伤 + 能量上限 120', () => {
    const r = run('trailblazerKnight2', 'basic');
    const act = firstAct(r, 'trailblazerKnight2');
    expect(act.skillCode).toBe('trailblazerKnight2.basic');
    const hits = (act.hitSeqs ?? []).map((s) => r.hits[s]);
    expect(hits.length).toBeGreaterThan(0);
    const base = hits[0].factors.find((f) => f.key === 'base')?.value ?? 0;
    expect(base).toBeGreaterThan(0);
    expect(hits[0].total).toBeGreaterThan(0);
    expect(act.energyAfter).toBeLessThanOrEqual(ENERGY_MAX.trailblazerKnight2);
  });

  it('8004 存护开拓者 2：战技按 8003 参数给全队上盾（盾值 > 0）', () => {
    const r = run('trailblazerKnight2', 'skill');
    const skill = r.events.find((e) => e.skillCode === 'trailblazerKnight2.skill');
    expect(skill).toBeDefined();
    const shields = (skill!.buffs?.trailblazerKnight2 ?? []) as { labelKey: string; value: number }[];
    const shield = shields.find((b) => b.labelKey === 'shield');
    expect(shield).toBeDefined();
    expect(shield!.value).toBeGreaterThan(0);
  });

  it('8006 同谐开拓者 2：战技弹射按自身 id 出伤 + 能量上限 140', () => {
    const r = run('trailblazerShaman2', 'skill');
    const act = firstAct(r, 'trailblazerShaman2');
    expect(act.skillCode).toBe('trailblazerShaman2.skill');
    const hits = (act.hitSeqs ?? []).map((s) => r.hits[s]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.skillCode === 'trailblazerShaman2.skill')).toBe(true);
    const base = hits[0].factors.find((f) => f.key === 'base')?.value ?? 0;
    expect(base).toBeGreaterThan(0);
    expect(act.energyAfter).toBeLessThanOrEqual(ENERGY_MAX.trailblazerShaman2);
  });
});
