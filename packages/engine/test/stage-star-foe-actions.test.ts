import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  simulateBattle,
  type BattleResult,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 星启关的敌人真的会还手 + 空行动不记事件（2026-10-30 第五十二轮）──
// 第五十一轮给 2013020 / 4064010 补了技能表；本文件锁「补表之后它们在真实关卡里确实出手」。
// 同时锁住另一条：**没有任何可观测内容（无技能/无伤害/无 note）的敌方行动不许记事件**
// —— 旧口径里先死的怪会留下几条「没有技能名、没有伤害」的空 monster 事件，明细表上是脏行。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 400_000,
    attack: 5000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(160) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'fuxuan', panel: panel(140) },
  { id: 'aventurine', panel: panel(130) },
];

/** 混沌 P44 星启关（wave1 = 4063010 + 2013020，wave2 = 4064010） */
function runStar(cap = 1_000_000): BattleResult {
  const waves = buildPackStageWaves('moc-p44', 0).map((w) =>
    w.map((c) => ({ ...c, hp: Math.min(c.hp, cap) })),
  );
  return simulateBattle({
    members: members(),
    monsterWaves: waves,
    techniques: false,
    rounds: 12,
    maxTime: 6000,
    roundMode: 'forgotten',
  });
}

const monsterActions = (r: BattleResult) =>
  r.events.filter((e) => e.kind === 'action' && e.action === 'monster');

describe('星启关 · 敌人真的会还手', () => {
  it('两只补表精英都出手且造成伤害（不再是木桩）', () => {
    const acts = monsterActions(runStar());
    for (const [id, label] of [
      ['2013020', '金人勾魂使'],
      ['4064010', '裁定忘却之形'],
    ] as const) {
      const mine = acts.filter((e) => String(e.skillCode).startsWith(`monster.${id}`));
      expect(mine.length, `${label}(${id}) 一次都没出手`).toBeGreaterThan(0);
      const hits = mine.reduce((n, e) => n + (e.enemyHits?.length ?? 0), 0);
      expect(hits, `${label} 出手了但没有造成伤害`).toBeGreaterThan(0);
    }
  });

  it('裁定忘却之形的蓄力链跑通：指名祸首 → 罪血枭首', () => {
    const codes = monsterActions(runStar()).map((e) => String(e.skillCode));
    expect(codes).toContain('monster.406401006'); // 指名祸首（蓄力）
    expect(codes).toContain('monster.406401007'); // 罪血枭首（蓄力释放）
    // 释放一定排在蓄力之后
    expect(codes.indexOf('monster.406401007')).toBeGreaterThan(codes.indexOf('monster.406401006'));
  });

  it('空行动「照样记事件」是契约（前端负责过滤）：星启关里确实会出现几条', () => {
    // 引擎侧口径：enemy 为 null 时**仍然 record**（aha/gallagher/bailu/round-mode/ratio/mem4 等
    // 10 个既有用例按敌方行动条数定锚，改事件流会集体红）。这类事件的「无技能/无伤害/无 note」特征
    // 由前端 `isEmptyMonsterTurn` 判定后不渲染。本用例把这个契约与现象一起锁住。
    const acts = monsterActions(runStar());
    const emptyish = acts.filter(
      (e) => !e.skillCode && (e.enemyHits?.length ?? 0) === 0 && (e.note ?? []).length === 0,
    );
    expect(emptyish.length, '星启关应至少出现一条空行动（怪先死/无技能可放）').toBeGreaterThan(0);
    // 但它们绝不带任何可观测内容
    for (const e of emptyish) {
      expect(e.hitSeqs ?? []).toEqual([]);
      expect(e.enemyHits ?? []).toEqual([]);
      expect(String(e.unitId).startsWith('monster')).toBe(true);
    }
  });
});
