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

// 彦卿 1209（冰/巡猎）接入回归（2026-10-29 接入；裁定见 docs/AGENTS-rogue.md §5）。
// 锚点全部来自 test/yanqing-dump.test.ts 实跑（%TEMP%/临时目录/yanqing-dump.txt）。
// 关键口径：【智剑连心】= 暴率+20%/暴伤+30%/受击概率降低（嘲讽 −25）/效果抵抗+20%，受击立即消失；
// 天赋追击 60% 固定概率（50% 攻击力冰伤）+ 65% 固定概率冻结；冻结每回合开始受 50% 攻击力冰附加伤害。
// ⚠ 木桩必须用「冻结抗性 < 100%」的怪：可可利亚 1004011 冻结抵抗 = 1（本测试用 1012010）。

function mp(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Ice', level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed: 110, energyRegen: 0, ...extra,
  };
}
function mon(hp = 5e8, toughness = 9999): MonsterConfig {
  return {
    level: 90, hp, maxToughness: toughness, speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Ice', 'Physical'], enemyClass: 'normal', monsterId: '1012010', attack: 0,
  } as MonsterConfig;
}
const yq = (eidolonLevel = 0): CombatMember => ({ id: 'yanqing', panel: mp(), eidolonLevel });
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
function allHits(r: R, code: string) {
  return r.hits.filter((h) => h.skillCode === code);
}
function factor(h: R['hits'][number] | undefined, key: string): number | undefined {
  return h?.factors.find((f) => f.key === key)?.value;
}
function notesOf(r: R): Set<string> {
  const s = new Set<string>();
  for (const e of r.events) for (const n of e.note ?? []) s.add(n);
  return s;
}
function buffsOf(r: R, uid: string) {
  return r.events.flatMap((e) => e.buffs?.[uid] ?? []);
}

describe('彦卿 1209（冰/巡猎）', () => {
  it('A 普攻：Lv6 基准 100% 攻击力；point06 对冰弱点目标追加 30%', () => {
    const r = simulateBattle(cfg([yq()], { policy: basicOnly }));
    const first = actsOf(r, 'yanqing')[0];
    expect(first.time).toBeCloseTo(90.91, 2);
    expect(first.spAfter).toBe(4);
    expect(first.energyAfter).toBeCloseTo(90, 2); // 初战 70 + 20
    const hit = hitsOf(r, first, 'yanqing.basic')[0];
    expect(factor(hit, 'base')).toBeCloseTo(2000, 6);
    expect(hit.total).toBeCloseTo(878.57, 1);
    // point06 颁冰：冰弱点 → 30% 攻击力冰附加伤害（base 600）
    const p06 = hitsOf(r, first, 'yanqing.p06')[0];
    expect(factor(p06, 'base')).toBeCloseTo(600, 6);
    expect(p06.total).toBeCloseTo(263.57, 1);
    expect(first.note ?? []).toContain('yanqingP06');
  });

  it('B 战技：220% 主段 + 获得【智剑连心】（暴率+20%/暴伤+30%/效果抵抗+20%）', () => {
    const r = simulateBattle(cfg([yq()], { policy: skillOnly }));
    const first = actsOf(r, 'yanqing')[0];
    const main = hitsOf(r, first, 'yanqing.skill')[0];
    expect(factor(main, 'base')).toBeCloseTo(4400, 6); // 2000 × 2.2
    expect(first.note ?? []).toContain('yanqingWisdom');
    const wis = buffsOf(r, 'yanqing').filter((b) => b.labelKey === 'yanqingWisdom');
    const byKey = new Map(wis.map((b) => [b.key, b.value]));
    expect(byKey.get('critRate')).toBeCloseTo(0.2, 6);
    expect(byKey.get('critDmg')).toBeCloseTo(0.3, 6);
    expect(byKey.get('effectRes')).toBeCloseTo(0.2, 6); // point07 凌霜
    // 智剑连心生效后暴击期望：1 + 0.25 × 0.8 = 1.2
    const second = actsOf(r, 'yanqing')[1];
    const main2 = hitsOf(r, second, 'yanqing.skill')[0];
    expect(factor(main2, 'crit')).toBeCloseTo(1.2, 6);
  });

  it('C 天赋：60% 追击（50% 攻击力）+ 65% 冻结 + 冻结每回合 50% 冰附加伤害', () => {
    const r = simulateBattle(cfg([yq()], { policy: skillOnly }));
    const notes = notesOf(r);
    expect(notes.has('yanqingTalent')).toBe(true);
    const talent = allHits(r, 'yanqing.talent')[0];
    expect(factor(talent, 'base')).toBeCloseTo(1000, 6); // 2000 × 0.5
    expect(talent.kind).toBe('direct');
    // 冻结（seed 1 命中）：marker + 每回合附加伤害
    expect(notes.has('enemyBreakFreeze')).toBe(true);
    expect(notes.has('yanqingFreezeDmg')).toBe(true);
    const freeze = allHits(r, 'yanqing.freeze')[0];
    expect(factor(freeze, 'base')).toBeCloseTo(1000, 6); // 2000 × 0.5
    // 冻结附加伤害不吃暴击
    expect(factor(freeze, 'crit')).toBeCloseTo(1, 6);
  });

  it('D 终结技：350% 单体 + 暴率 +60%（智剑连心中额外暴伤 +50%）', () => {
    const r = simulateBattle(cfg([yq()], { policy: skillOnly }));
    const ult = r.events.find((e) => e.skillCode === 'yanqing.ult');
    expect(ult).toBeDefined();
    const hit = (ult!.hitSeqs ?? []).map((s) => r.hits[s])[0];
    expect(factor(hit, 'base')).toBeCloseTo(7000, 6); // 2000 × 3.5
    expect(hit.total).toBeCloseTo(3600, 1);
    const ultBuffs = (ult!.buffs?.yanqing ?? []).filter((b) => b.labelKey === 'yanqingUlt');
    const keys = new Map(ultBuffs.map((b) => [b.key, b.value]));
    expect(keys.get('critRate')).toBeCloseTo(0.6, 6);
    expect(keys.get('critDmg')).toBeCloseTo(0.5, 6); // 智剑连心中额外暴伤
    // 无智剑连心时只给暴率
    const r2 = simulateBattle(cfg([yq()], { policy: basicOnly }));
    const ult2 = r2.events.find((e) => e.skillCode === 'yanqing.ult');
    const ult2Buffs = (ult2!.buffs?.yanqing ?? []).filter((b) => b.labelKey === 'yanqingUlt');
    expect(ult2Buffs.map((b) => b.key)).toEqual(['critRate']);
  });

  it('E 星魂1：攻击冻结目标追加 60% 攻击力冰伤', () => {
    const r = simulateBattle(cfg([yq(1)], { policy: skillOnly, maxTime: 512 }));
    const e1 = allHits(r, 'yanqing.e1');
    expect(e1.length).toBeGreaterThan(0);
    expect(factor(e1[0], 'base')).toBeCloseTo(1200, 6); // 2000 × 0.6
    expect(notesOf(r).has('yanqingE1')).toBe(true);
    // E0 不产生该段
    const r0 = simulateBattle(cfg([yq(0)], { policy: skillOnly, maxTime: 512 }));
    expect(allHits(r0, 'yanqing.e1')).toHaveLength(0);
  });

  it('F 星魂4：生命 ≥80% → 冰抗性穿透 +12%（终结技总伤 3600 → 4032）', () => {
    const e0 = simulateBattle(cfg([yq(0)], { policy: skillOnly }));
    const e4 = simulateBattle(cfg([yq(4)], { policy: skillOnly }));
    const ultTotal = (r: R) => {
      const ult = r.events.find((e) => e.skillCode === 'yanqing.ult');
      return (ult!.hitSeqs ?? []).map((s) => r.hits[s])[0].total;
    };
    expect(ultTotal(e0)).toBeCloseTo(3600, 1);
    expect(ultTotal(e4)).toBeCloseTo(4032, 1); // ×(1+0.12) 抗穿
  });

  it('G 星魂6：天赋/终结技等级 +2（冻结伤害 1000→1100、终结技 7000→7560）', () => {
    const e6 = simulateBattle(cfg([yq(6)], { policy: skillOnly, maxTime: 512 }));
    const freeze = allHits(e6, 'yanqing.freeze')[0];
    expect(factor(freeze, 'base')).toBeCloseTo(1100, 6); // 天赋 Lv12 → 0.55
    const ult = e6.events.find((e) => e.skillCode === 'yanqing.ult');
    const ultHit = (ult!.hitSeqs ?? []).map((s) => e6.hits[s])[0];
    expect(factor(ultHit, 'base')).toBeCloseTo(7560, 6); // 终结技 Lv12 → 3.78
  });

  it('H 秘技 120907：进战 2 回合内对生命 ≥50% 敌方伤害 +30%', () => {
    const off = simulateBattle(cfg([yq()], { policy: skillOnly }));
    const on = simulateBattle(cfg([yq()], { techniques: true, policy: skillOnly }));
    const firstOff = hitsOf(off, actsOf(off, 'yanqing')[0], 'yanqing.skill')[0];
    const firstOn = hitsOf(on, actsOf(on, 'yanqing')[0], 'yanqing.skill')[0];
    expect(firstOn.total / firstOff.total).toBeCloseTo(1.3, 3);
    // 第 3 次行动已过期（2 回合）
    const thirdOff = hitsOf(off, actsOf(off, 'yanqing')[2], 'yanqing.skill')[0];
    const thirdOn = hitsOf(on, actsOf(on, 'yanqing')[2], 'yanqing.skill')[0];
    expect(thirdOn.total / thirdOff.total).toBeCloseTo(1, 3);
  });

  it('I point08 轻吕：攻击触发暴击 → 速度 +10%（2 回合，行动间隔 90.91 → 82.64）', () => {
    const r = simulateBattle(cfg([yq()], { policy: basicOnly }));
    const acts = actsOf(r, 'yanqing');
    expect(acts[1].time - acts[0].time).toBeCloseTo(82.64, 1); // 速度 121
    expect(acts[2].time - acts[1].time).toBeCloseTo(90.91, 1); // 到期还原（速度 110）
  });
});
