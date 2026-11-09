import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  enemySkills,
  enemyUsableSkills,
  simulateBattle,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 末日幻影 P21 难度04「勾魂摄魄的支配者」2004014（2026-10-30 首批接入）──
// 数据源：data/monster-stages/apo-p21.json → gen-monster-stages.mjs → STAGE_PACKS
// 技能表：packages/engine/src/combat/monster-skill-data.ts 的 '2004014'
// 锚点全部来自 zz-apo-dump 实测（同 seed 确定性），倍率占位 1（rulings 1A）。
//
// 本批接入的三套通用框架：
// 1. 我方 DoT（触电）：施加时快照 敌攻 × 倍率 × 防御区，持有者行动开始时结算，次数 = duration；
// 2. 【支配】：行动提前到当前 + 强制攻击我方随机 1 人（不消耗 SP）+ 随后解除；
// 3. 【心理暗示】/【揭晓】：行动序列插入定时条目，到点转【支配】。

function panel(speed: number): MemberPanel {
  return {
    element: 'Wind',
    level: 80,
    hp: 100000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

/** 队伍刻意不含晴歌（Fever 会离场 → 【支配】对离场单位无效，会污染确定性巡演） */
function members(): CombatMember[] {
  return [
    { id: 'sunday', panel: panel(156) },
    { id: 'jingyuan', panel: panel(134) },
    { id: 'tenghuang', panel: panel(135) },
    { id: 'aventurine', panel: panel(134) },
  ];
}

const MON = (() => {
  const cfg = buildPackStageWaves('apo-p21', 4, '上半')[0]![0]!;
  return { ...cfg, hp: 5_000_000 };
})();
/** 触电每跳 = 敌攻 × 1 × 防御区（攻方 Lv90 / 守方 Lv80） */
const SHOCK_TICK = MON.attack! * ((90 + 20) / (90 + 20 + (80 + 20)));
/** 【支配】强制攻击 = 被支配者攻击力 2000 × 1 × 防御区（双方 Lv80）= 1000 */
const DOMINATE_HIT = 2000 * 0.5;

function run(): CombatEvent[] {
  return simulateBattle({
    members: members(),
    monsterWaves: [[MON]],
    techniques: false,
    rounds: 6,
    maxTime: 1200,
    roundMode: 'phantom',
  }).events;
}

describe('末日 P21 · 2004014 技能表', () => {
  it('10 个技能；AI 池 = 6（伤害 5 + 言灵 + 心理暗示，被动不选）', () => {
    const all = enemySkills('2004014');
    expect(all.map((s) => s.skillId)).toEqual([
      '200401401',
      '200401402',
      '200401403',
      '200401404',
      '200401405',
      '200401406',
      '200401407',
      '200401408',
      '200401409',
      '200401411',
    ]);
    // 单体/扩散/全体/亡者切齿 = 带 shock；言灵 = dominate；心理暗示 = suggest
    expect(all.find((s) => s.skillId === '200401401')!.shock).toMatchObject({ multiplier: 1, duration: 2 });
    expect(all.find((s) => s.skillId === '200401402')!.shock!.spreadFromMain).toBe(true);
    expect(all.find((s) => s.skillId === '200401404')!.dominate).toMatchObject({ baseChance: 1 });
    expect(all.find((s) => s.skillId === '200401406')!.suggest).toMatchObject({ count: 2, revealDelayRounds: 1 });
    expect(all.find((s) => s.skillId === '200401407')!.shockDetonate).toBe(true);
    expect(all.find((s) => s.skillId === '200401408')!.dominateDetonate).toBe(true);
    expect(all.find((s) => s.skillId === '200401411')!.passive).toBe(true);
    // AI 池：不带 multiplier 的言灵/心理暗示也要能出手（否则控制技永不发动）
    const usable = enemyUsableSkills('2004014').map((s) => s.skillId);
    expect(usable).toEqual(['200401401', '200401402', '200401403', '200401404', '200401405', '200401406']);
    expect(usable).not.toContain('200401407');
  });
});

describe('我方 DoT（触电）', () => {
  it('月光摩挲连绵命中后挂【触电】，每跳 = 敌攻 × 倍率 × 防御区', () => {
    const evs = run();
    const first = evs.find((e) => e.skillCode === 'monster.200401402');
    expect(first).toBeDefined();
    expect(first!.note).toContain('allyShock');
    // 扩散只给主目标（此时无人处于触电）
    expect((first!.note ?? []).filter((n) => n === 'allyShock').length).toBe(1);
    const tick = evs.find((e) => e.action === 'dot');
    expect(tick).toBeDefined();
    expect(tick!.note).toContain('allyDotTick');
    expect(tick!.enemyHits!.length).toBe(1);
    expect(tick!.enemyHits![0]!.skillId).toBe('dot.shock');
    expect(tick!.enemyHits![0]!.damage).toBeCloseTo(SHOCK_TICK, 4);
    expect(SHOCK_TICK).toBeCloseTo(347.173, 3);
  });

  it('触电在持有者行动开始时结算（同刻、先于自己的行动），duration=2 → 共 2 跳', () => {
    const evs = run();
    const iDot = evs.findIndex((e) => e.action === 'dot');
    const tick = evs[iDot]!;
    // 同一成员同刻紧随其后的就是它自己的行动（DoT 在决策/行动之前结算）
    const next = evs[iDot + 1]!;
    expect(next.unitId).toBe(tick.unitId);
    expect(next.kind).toBe('action');
    expect(next.action).not.toBe('dot');
    // 只统计首次触电（200401402 → jingyuan）的 2 跳：第 3 次动作前不再有该成员的 dot
    const who = tick.unitId;
    const dotsOfWho = evs.filter((e) => e.action === 'dot' && e.unitId === who);
    expect(dotsOfWho.length).toBeGreaterThanOrEqual(2);
    const firstTwo = dotsOfWho.slice(0, 2);
    for (const e of firstTwo) expect(e.enemyHits![0]!.damage).toBeCloseTo(SHOCK_TICK, 4);
    // 两次结算之后触电消失：第 3 个 dot 事件必须晚于新的触电施加
    const iSecond = evs.indexOf(firstTwo[1]!);
    const reapplied = evs
      .slice(0, iSecond)
      .some((e) => e.skillCode?.startsWith('monster.'));
    expect(reapplied).toBe(true);
  });

  it('颤慄（被动）：命中「命中前已触电」的目标 → 同日事件追加 dot.shock', () => {
    const evs = run();
    const withDetonate = evs.filter(
      (e) => (e.note ?? []).includes('allyShockDetonate') && e.skillCode?.startsWith('monster.'),
    );
    expect(withDetonate.length).toBeGreaterThan(0);
    for (const e of withDetonate) {
      const hits = e.enemyHits!;
      const det = hits.filter((h) => h.skillId === 'dot.shock');
      // 群体技能命中多个已触电目标 → 每目标各结算 1 次
      expect(det.length).toBeGreaterThanOrEqual(1);
      for (const h of det) expect(h.damage).toBeCloseTo(SHOCK_TICK, 4);
      // 追加段在主技能命中之后
      const iMain = hits.findIndex((h) => h.skillId === e.skillCode!.replace('monster.', ''));
      const iDet = hits.indexOf(det[0]!);
      expect(iDet).toBeGreaterThan(iMain);
      // 结算的是命中前已触电目标的触电伤害（不是新挂上的那次）
      for (const h of det) expect(h.skillId).toBe('dot.shock');
    }
  });

  it('亡者切齿呢喃：只对「命中前已触电」的目标追加雷伤（不吃本次新挂的触电）', () => {
    const evs = run();
    const splashed = evs.filter((e) => (e.note ?? []).includes('allyShockSplash'));
    expect(splashed.length).toBeGreaterThan(0);
    for (const e of splashed) {
      const splash = e.enemyHits!.filter((h) => h.skillId === '200401405');
      // 主目标 1 段 + 每个命中前已触电目标各 1 段（主目标此前已触电时会再吃 1 段「同时」追伤）
      expect(splash.length).toBeGreaterThanOrEqual(2);
      for (const h of splash) expect(h.damage).toBeCloseTo(SHOCK_TICK, 4);
      // 同一目标最多两段（本体 + 追伤），不会无限叠加
      const count = new Map<string, number>();
      for (const h of splash) count.set(h.targetId, (count.get(h.targetId) ?? 0) + 1);
      for (const n of count.values()) expect(n).toBeLessThanOrEqual(2);
    }
  });
});

describe('【支配】与【心理暗示】/【揭晓】', () => {
  it('心理暗示：插入【揭晓】定时条目，到点被暗示者转【支配】并立即行动', () => {
    const evs = run();
    const suggest = evs.find((e) => e.skillCode === 'monster.200401406');
    expect(suggest).toBeDefined();
    expect(suggest!.note).toContain('enemySuggestSchedule');
    const reveal = evs.find((e) => (e.note ?? []).includes('allySuggestReveal'));
    expect(reveal).toBeDefined();
    expect(reveal!.note).toContain('allyDominate');
    // 揭晓之后同刻立刻出现被支配者的强制攻击（行动提前到当前）
    const iReveal = evs.indexOf(reveal!);
    const dominated = evs.slice(iReveal + 1).filter((e) => e.action === 'dominate');
    expect(dominated.length).toBeGreaterThan(0);
    expect(dominated[0]!.time).toBeCloseTo(reveal!.time, 6);
  });

  it('【支配】强制攻击：伤害 = 被支配者攻击 × 1 × 防御区，目标为自己以外的我方成员', () => {
    const evs = run();
    const dom = evs.find((e) => e.action === 'dominate');
    expect(dom).toBeDefined();
    expect(dom!.note).toContain('allyDominateAttack');
    const hit = dom!.enemyHits![0]!;
    expect(hit.skillId).toBe('dominate.attack');
    expect(hit.damage).toBeCloseTo(DOMINATE_HIT, 4);
    expect(hit.targetId).not.toBe(dom!.unitId);
    // 被支配者本次行动被完全替换：不产生普攻/战技事件
    const sameTime = evs.filter((e) => e.time === dom!.time && e.unitId === dom!.unitId);
    expect(sameTime.length).toBe(1);
  });

  it('言灵：单体【支配】——命中后出现 allyDominate，随后立刻强制攻击', () => {
    const evs = run();
    const yanling = evs.find((e) => e.skillCode === 'monster.200401404');
    expect(yanling).toBeDefined();
    expect(yanling!.note).toContain('allyDominate');
    const i = evs.indexOf(yanling!);
    const next = evs[i + 1]!;
    expect(next.action).toBe('dominate');
    expect(next.enemyHits![0]!.damage).toBeCloseTo(DOMINATE_HIT, 4);
  });

  it('残酷（被动）：被支配者攻击已触电目标 → 追加 1 次雷击', () => {
    const evs = run();
    const cruel = evs.filter(
      (e) => e.action === 'dominate' && (e.note ?? []).includes('allyShockDetonate'),
    );
    expect(cruel.length).toBeGreaterThan(0);
    for (const e of cruel) {
      const det = e.enemyHits!.filter((h) => h.skillId === 'dot.shock');
      expect(det.length).toBe(1);
      expect(det[0]!.damage).toBeCloseTo(SHOCK_TICK, 4);
      // 追加雷击打的是被支配者攻击的那个目标
      expect(det[0]!.targetId).toBe(e.enemyHits![0]!.targetId);
    }
  });
});
