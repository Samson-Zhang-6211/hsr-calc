import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
  type PolicyFn,
} from '../src/index.js';

// 希儿 1102（量子/巡猎）接入回归（2026-10-29 接入；裁定见 docs/AGENTS-rogue.md §7）。
// 锚点来自 test/seele-dump.test.ts 实跑（%TEMP%/临时目录/seele-dump.txt）。
// 关键口径：战技加速 +25%/2 回合（E2 叠 2 层）真改行动轴；【增幅】+80% 增伤；
// point07 增幅中量子抗穿 +20%；point08 普攻后下一次行动提前 20%（finishAction 后消费）。

function mp(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Quantum', level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed: 110, energyRegen: 0, ...extra,
  };
}
function mon(hp = 5e8, toughness = 9999): MonsterConfig {
  return {
    level: 90, hp, maxToughness: toughness, speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Quantum', 'Physical'], enemyClass: 'normal', monsterId: '1012010', attack: 0,
  } as MonsterConfig;
}
const sl = (eidolonLevel = 0): CombatMember => ({ id: 'seele', panel: mp(), eidolonLevel });
function cfg(
  members: CombatMember[],
  opts: { techniques?: boolean; maxTime?: number; policy?: PolicyFn; monster?: MonsterConfig; seed?: number; initialSp?: number } = {},
): BattleConfig {
  return {
    members,
    monster: opts.monster ?? mon(),
    maxTime: opts.maxTime ?? 400,
    initialSp: opts.initialSp ?? 3,
    seed: opts.seed ?? 1,
    techniques: opts.techniques ?? false,
    policy: opts.policy,
  };
}
type R = BattleResult;
const basicOnly: PolicyFn = () => 'basic';
const skillOnly: PolicyFn = () => 'skill';

function actsOf(r: R, uid: string): CombatEvent[] {
  return r.events.filter((e) => e.kind === 'action' && e.unitId === uid);
}
function hitsOf(r: R, ev: CombatEvent, code: string) {
  return (ev.hitSeqs ?? []).map((s) => r.hits[s]).filter((h) => h.skillCode === code);
}
function factor(h: R['hits'][number] | undefined, key: string): number | undefined {
  return h?.factors.find((f) => f.key === key)?.value;
}
function notesOf(r: R): Set<string> {
  const s = new Set<string>();
  for (const e of r.events) for (const n of e.note ?? []) s.add(n);
  return s;
}
function ultHit(r: R) {
  const ult = r.events.find((e) => e.skillCode === 'seele.ult');
  return ult ? { ev: ult, hit: (ult.hitSeqs ?? []).map((s) => r.hits[s])[0] } : undefined;
}

describe('希儿 1102（量子/巡猎）', () => {
  it('A 普攻：Lv6 基准 100% 攻击力；point08 下一次行动提前 20%', () => {
    const r = simulateBattle(cfg([sl()], { policy: basicOnly }));
    const acts = actsOf(r, 'seele');
    const first = acts[0];
    expect(first.spAfter).toBe(4);
    expect(first.energyAfter).toBeCloseTo(80, 2); // 初战 60 + 20
    const hit = hitsOf(r, first, 'seele.basic')[0];
    expect(factor(hit, 'base')).toBeCloseTo(2000, 6);
    expect(hit.total).toBeCloseTo(878.57, 1);
    expect(first.note ?? []).toContain('seeleP08');
    // 基础间隔 90.91 → 提前 20%（18.18）→ 72.73
    expect(acts[1].time - acts[0].time).toBeCloseTo(72.73, 1);
  });

  it('B 战技：220% 单体 + 自身速度 +25%（真实行动轴）', () => {
    const r = simulateBattle(cfg([sl()], { policy: skillOnly }));
    const acts = actsOf(r, 'seele');
    const hit = hitsOf(r, acts[0], 'seele.skill')[0];
    expect(factor(hit, 'base')).toBeCloseTo(4400, 6); // 2000 × 2.2
    expect(hit.total).toBeCloseTo(1932.86, 1);
    // 速度 110 → 137.5：间隔 90.91 → 72.73
    expect(acts[1].time - acts[0].time).toBeCloseTo(72.73, 1);
  });

  it('C 终结技：425% + 立即进入【增幅】（伤害 +80%，1 回合）', () => {
    const r = simulateBattle(cfg([sl()], { policy: skillOnly, maxTime: 527 }));
    const u = ultHit(r);
    expect(u).toBeDefined();
    expect(factor(u!.hit, 'base')).toBeCloseTo(8500, 6); // 2000 × 4.25
    expect(u!.hit.total).toBeCloseTo(3733.93, 1);
    expect(u!.ev.note ?? []).toContain('seeleAmplify');
    const amp = (u!.ev.buffs?.seele ?? []).find((b) => b.labelKey === 'seeleAmplify');
    expect(amp).toBeDefined();
    expect(amp!.key).toBe('damageBonus');
    expect(amp!.value).toBeCloseTo(0.8, 6);
    // 增幅后战技增伤 ×1.8
    const later = actsOf(r, 'seele').find(
      (e) => factor(hitsOf(r, e, 'seele.skill')[0], 'damageBonus') === 1.8,
    );
    expect(later, '终结技后应出现 1.8 增伤的战技段').toBeDefined();
  });

  it('D point07 割裂：增幅中量子抗穿 +20%（1932.86 → 4174.97）', () => {
    const r = simulateBattle(cfg([sl()], { policy: skillOnly, maxTime: 527 }));
    const boosted = actsOf(r, 'seele')
      .map((e) => hitsOf(r, e, 'seele.skill')[0])
      .find((h) => h && factor(h, 'damageBonus') === 1.8);
    expect(boosted).toBeDefined();
    // 基础 1932.86 × 1.8（增幅）× 1.2（抗穿）= 4174.97
    expect(boosted!.total).toBeCloseTo(4174.97, 1);
  });

  it('E 星魂1：目标当前 HP ≤80% → 暴率 +15%', () => {
    const r = simulateBattle(cfg([sl(1)], { policy: skillOnly, maxTime: 400, monster: mon(4000) }));
    const crit = factor(hitsOf(r, actsOf(r, 'seele')[1], 'seele.skill')[0], 'crit');
    // 1 + (0.05 + 0.15) × 0.5 = 1.1
    expect(crit).toBeCloseTo(1.1, 6);
  });

  it('F 星魂2：战技加速可叠 2 层（间隔 90.91 → 60.61）', () => {
    const e2 = simulateBattle(cfg([sl(2)], { policy: skillOnly, maxTime: 527 }));
    const acts = actsOf(e2, 'seele');
    expect(acts[2].time - acts[1].time).toBeCloseTo(60.61, 1); // 速度 110 → 165
  });

  it('G 星魂6：【乱蝶】标记 + 受击追加「终结技倍率 ×15%」量子附加伤害', () => {
    const r = simulateBattle(cfg([sl(6)], { policy: skillOnly, maxTime: 527 }));
    expect(notesOf(r).has('seeleButterfly')).toBe(true);
    const butterfly = r.report.bySkill.filter((s) => s.skillCode === 'seele.butterfly');
    expect(butterfly.length).toBeGreaterThan(0);
    const dmg = butterfly.reduce((a, b) => a + b.damage, 0);
    expect(dmg).toBeGreaterThan(0);
    // E0 不产生该段
    const e0 = simulateBattle(cfg([sl(0)], { policy: skillOnly, maxTime: 527 }));
    expect(e0.report.bySkill.some((s) => s.skillCode === 'seele.butterfly')).toBe(false);
  });

  it('H 秘技 110207：进战立即进入【增幅】（首击即 1.8 增伤）', () => {
    const on = simulateBattle(cfg([sl()], { techniques: true, policy: () => 'basic', maxTime: 300 }));
    const first = hitsOf(on, actsOf(on, 'seele')[0], 'seele.basic')[0];
    expect(factor(first, 'damageBonus')).toBeCloseTo(1.8, 6);
    const off = simulateBattle(cfg([sl()], { policy: () => 'basic', maxTime: 300 }));
    expect(factor(hitsOf(off, actsOf(off, 'seele')[0], 'seele.basic')[0], 'damageBonus')).toBeCloseTo(1, 6);
  });

  it('I 天赋再现 / 星魂4：击杀 → 额外回合 + 回能 15', () => {
    const r = simulateBattle(cfg([sl(4)], { policy: skillOnly, maxTime: 600, monster: mon(4000) }));
    const acts = actsOf(r, 'seele');
    // 同一时刻连续行动 = 额外回合
    const sameTime = acts.filter((e) => Math.abs(e.time - acts[1].time) < 0.02);
    expect(sameTime.length).toBeGreaterThanOrEqual(2);
    const energyGain = acts.some((e, i) => i > 0 && (e.energyAfter ?? 0) > (acts[i - 1].energyAfter ?? 0) + 25);
    expect(energyGain, '击杀应额外回 15 能').toBe(true);
    expect(notesOf(r).has('seeleAmplify')).toBe(true);
  });
});
