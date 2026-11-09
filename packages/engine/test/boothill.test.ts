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

// 波提欧 1315（物理/巡猎）接入回归（2026-10-29 接入；裁定见 docs/AGENTS-rogue.md §1）。
// 锚点来自 test/boothill-dump.test.ts 实跑（%TEMP%/opencode/boothill-dump.txt）。
// 关键口径：战技**不造成伤害/不回能/本回合不结束**，与目标进入【绝命对峙】；对峙目标承伤 +30%（E4 再 +12%）；
// 对峙期间普攻变强化普攻（不回 SP、回 30 能）；敌方攻击主目标被强制为波提欧（嘲讽原语）；
// point06 按击破特攻动态换算双暴（暴率 10%/≤30%、暴伤 50%/≤150%）。

function mp(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Physical', level: 80, hp: 20000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed: 110, energyRegen: 0, ...extra,
  };
}
function mon(hp = 5e8, toughness = 9999, attack = 0, monsterId = '1012010'): MonsterConfig {
  return {
    level: 90, hp, maxToughness: toughness, speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Quantum', 'Ice'], enemyClass: 'normal', monsterId, attack,
  } as MonsterConfig;
}
const bh = (eidolonLevel = 0, extra: Partial<MemberPanel> = {}): CombatMember => ({
  id: 'boothill', panel: mp(extra), eidolonLevel,
});
const syq = (): CombatMember => ({ id: 'sanyueqi', panel: mp({ element: 'Ice', speed: 101 }) });
function cfg(
  members: CombatMember[],
  opts: { techniques?: boolean; maxTime?: number; policy?: PolicyFn; monster?: MonsterConfig; seed?: number } = {},
): BattleConfig {
  return {
    members,
    monster: opts.monster ?? mon(),
    maxTime: opts.maxTime ?? 400,
    initialSp: 3,
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

describe('波提欧 1315（物理/巡猎）', () => {
  it('A 普攻：Lv6 基准 100% 攻击力；+1 SP / +20 能', () => {
    const r = simulateBattle(cfg([bh()], { policy: basicOnly }));
    const first = actsOf(r, 'boothill')[0];
    expect(first.spAfter).toBe(4);
    expect(first.energyAfter).toBeCloseTo(77.5, 2); // 初战 57.5 + 20
    const hit = hitsOf(r, first, 'boothill.basic')[0];
    expect(factor(hit, 'base')).toBeCloseTo(2000, 6);
    expect(hit.total).toBeCloseTo(878.57, 1);
  });

  it('B 战技：进入【绝命对峙】、不造成伤害、不回能、本回合不结束', () => {
    const r = simulateBattle(cfg([bh()], { policy: skillOnly }));
    const acts = actsOf(r, 'boothill');
    const skill = acts[0];
    expect(skill.skillCode).toBe('boothill.skill');
    expect(skill.hitSeqs ?? []).toHaveLength(0); // 无伤害段
    expect(skill.energyAfter).toBeCloseTo(57.5, 2); // 不回能
    expect(notesOf(r).has('boothillStandoff')).toBe(true);
    // 不结束回合：同刻立即接一次强化普攻
    expect(acts[1].time).toBeCloseTo(acts[0].time, 2);
    expect(acts[1].skillCode).toBe('boothill.enhanced');
  });

  it('C 强化普攻：308%（强化普攻表 Lv6=220%）+ 对峙目标承伤 +30% + 回 30 能、不回 SP', () => {
    const r = simulateBattle(cfg([bh()], { policy: skillOnly }));
    const enhanced = actsOf(r, 'boothill')[1];
    const hit = hitsOf(r, enhanced, 'boothill.enhanced')[0];
    expect(factor(hit, 'base')).toBeCloseTo(4400, 6); // 2000 × 2.2
    expect(factor(hit, 'vuln')).toBeCloseTo(1.3, 6); // 对峙 +30%
    expect(hit.total).toBeCloseTo(2512.71, 1);
    // SP 不回（战技已花 1 点：3→2），能量 +30（57.5 → 87.5）
    expect(enhanced.spAfter).toBe(2);
    expect(enhanced.energyAfter).toBeCloseTo(87.5, 2);
  });

  it('D 终结技：400% 单体 + 植入物理弱点（不降抗）+ 行动延后 40%', () => {
    const r = simulateBattle(cfg([bh()], { policy: skillOnly, maxTime: 900 }));
    const ult = r.events.find((e) => e.skillCode === 'boothill.ult');
    expect(ult).toBeDefined();
    const hit = (ult!.hitSeqs ?? []).map((s) => r.hits[s])[0];
    expect(factor(hit, 'base')).toBeCloseTo(8000, 6); // 2000 × 4
    expect(ult!.note ?? []).toContain('boothillUlt');
  });

  it('E 星魂1：进战 1 层【优势口袋】+ 16% 无视防御', () => {
    const e0 = simulateBattle(cfg([bh(0)], { policy: skillOnly }));
    const e1 = simulateBattle(cfg([bh(1)], { policy: skillOnly }));
    const defOf = (r: R) =>
      factor(hitsOf(r, actsOf(r, 'boothill')[1], 'boothill.enhanced')[0], 'defense')!;
    expect(defOf(e1)).toBeGreaterThan(defOf(e0));
    expect(defOf(e1)).toBeCloseTo(0.5198, 3);
  });

  it('F 星魂4：对峙目标受到波提欧伤害额外 +12%（vuln 1.3 → 1.42）', () => {
    const r = simulateBattle(cfg([bh(4)], { policy: skillOnly }));
    const hit = hitsOf(r, actsOf(r, 'boothill')[1], 'boothill.enhanced')[0];
    expect(factor(hit, 'vuln')).toBeCloseTo(1.42, 6);
  });

  it('G point06 幽灵装填：击破特攻 200% → 暴率 +20% / 暴伤 +100%', () => {
    const r = simulateBattle(cfg([bh(0, { breakEffect: 2 })], { policy: skillOnly }));
    const hit = hitsOf(r, actsOf(r, 'boothill')[1], 'boothill.enhanced')[0];
    // 1 + (0.05 + 0.2) × (0.5 + 1.0) = 1.375
    expect(factor(hit, 'crit')).toBeCloseTo(1.375, 6);
  });

  it('H 嘲讽原语：对峙期间敌方攻击的主目标被强制为波提欧', () => {
    const enemyTargets = (r: R) =>
      r.events
        .filter((e) => e.unitId === 'monster1' && (e.enemyHits ?? []).length > 0)
        .map((e) => (e.enemyHits ?? []).map((h) => (h as { targetId?: string }).targetId ?? ''));
    const taunt = simulateBattle(
      cfg([bh(), syq()], {
        policy: skillOnly,
        maxTime: 600,
        monster: mon(5e8, 9999, 800, '1004011'),
      }),
    );
    const withStandoff = enemyTargets(taunt);
    expect(withStandoff.length).toBeGreaterThan(0);
    // 对峙期间（波提欧 2 个自身回合内）每次攻击都必须打到波提欧（主目标强制）
    for (const targets of withStandoff) expect(targets).toContain('boothill');
    // 对照：不开对峙时敌方主目标随机，至少有一次没打到波提欧
    const plain = simulateBattle(
      cfg([bh(), syq()], {
        policy: basicOnly,
        maxTime: 600,
        monster: mon(5e8, 9999, 800, '1004011'),
      }),
    );
    const noStandoff = enemyTargets(plain);
    expect(noStandoff.some((targets) => !targets.includes('boothill'))).toBe(true);
  });

  it('I 秘技 131507：本场首次战技为对峙目标附加物理弱点', () => {
    const r = simulateBattle(cfg([bh()], { techniques: true, policy: skillOnly }));
    expect(notesOf(r).has('boothillTechWeak')).toBe(true);
    const off = simulateBattle(cfg([bh()], { policy: skillOnly }));
    expect(notesOf(off).has('boothillTechWeak')).toBe(false);
  });
});
