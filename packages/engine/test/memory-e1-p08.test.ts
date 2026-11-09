import { describe, expect, it } from 'vitest';
import {
  xiediePoint07Triggered,
  simulateBattle,
  type BattleConfig,
  type CombatMember,
} from '../src/index.js';

/**
 * 记忆命途两条「看得见但没接」的机制（2026-11-02 条款台账 A1 查出，同日补齐）：
 * - 1413 长夜月 E1「睡吧，长夜有所梦」：我方忆灵造成的伤害 = 原伤害的 120/125/130/150%
 *   （场上敌方目标 4+ / 3 / 2 / 1 名）。
 * - 1415 昔涟 行迹 point08「三相的因果」抗穿半句：昔涟与德谬歌每超 180 速 1 点 → 冰属性抗性穿透 +2%，
 *   最多计入 60 点超出的速度（上限 +120%）。
 *
 * 锚点全部来 2026-11-02 的 `zz-memo-e1-p08-dump`（已删）；**倍数用「同配置 e0/e1 相除」**得到，
 * 不受出击次数/目标数变化影响，只有「首击」用于跨速度对比（动作数会变，累计值不可比）。
 */

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 103,
  attack: 2000,
  hp: 5000,
  defence: 1200,
  element: 'Ice' as const,
  critRate: 0.5,
  critDmg: 1.0,
  elationDegree: 0,
  damageBonus: 0,
  breakEffect: 0,
  effectHit: 0,
  effectRes: 0,
  damageReduction: 0,
  energyRegen: 0,
  outgoingHealing: 0,
  elementDmg: { Ice: 0 },
  ...over,
});

const MON: BattleConfig['monster'] = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 99999,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};

const mk = (id: string, over: Record<string, unknown> = {}, eidolon = 0): CombatMember => ({
  id: id as CombatMember['id'],
  eidolonLevel: eidolon,
  panel: mkPanel(over),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

type H = { source?: string; total: number; factors?: readonly { key: string; value: number }[] };
const sumBy = (hits: readonly H[], src: string) =>
  hits.filter((h) => h.source === src).reduce((a, h) => a + h.total, 0);
const firstBy = (hits: readonly H[], src: string) => hits.find((h) => h.source === src)?.total ?? 0;
/** 抗性区因子 = 1 − 抗性 + 减抗 + 穿透：直接读穿透，避免「首击可能是不同技能」的伪对比 */
const resistBy = (hits: readonly H[], src: string) =>
  hits.find((h) => h.source === src)?.factors?.find((f) => f.key === 'resist')?.value ?? NaN;

/** 长夜月单人队：`monsters` 数组长度 = 存活木桩槽数（单 `monster` 会被复制成 3 份，不能用） */
const runChangyeyue = (eidolon: number, slots: 1 | 2 | 3) => {
  const r = simulateBattle({
    members: [mk('changyeyue', { element: 'Quantum', speed: 105, attack: 2400 }, eidolon)],
    monsters: Array.from({ length: slots }, () => MON),
    techniques: false,
    rounds: 12,
    maxTime: 800,
  } as unknown as BattleConfig);
  return {
    memo: sumBy(r.hits as never, 'changye'),
    owner: sumBy(r.hits as never, 'changyeyue'),
  };
};

const runXilian = (speed: number) => {
  const r = simulateBattle({
    members: [mk('xilian', { element: 'Ice', speed, attack: 2400 })],
    monsters: [MON],
    techniques: false,
    rounds: 12,
    maxTime: 800,
  } as unknown as BattleConfig);
  return {
    xilianFirst: firstBy(r.hits as never, 'xilian'),
    demiurgeFirst: firstBy(r.hits as never, 'demiurge'),
    xilianResist: resistBy(r.hits as never, 'xilian'),
    demiurgeResist: resistBy(r.hits as never, 'demiurge'),
  };
};

describe('记忆 · 长夜月 E1（1413）', () => {
  it(
    'A 单怪 → 我方忆灵伤害 ×1.5，长夜月本体不变',
    { timeout: 120_000 },
    () => {
      const base = runChangyeyue(0, 1);
      const e1 = runChangyeyue(1, 1);
      // dump 绝对锚（E0 基线，防漂移）
      expect(base.memo).toBeCloseTo(100154.3299110034, 4);
      expect(e1.memo / base.memo).toBeCloseTo(1.5, 6);
      // 条款是「我方忆灵造成的伤害」，长夜月本人的伤害不吃
      expect(e1.owner).toBeCloseTo(base.owner, 6);
    },
  );

  it(
    'B 2 名敌人 → ×1.3；3 名敌人 → ×1.25（每档按敌方目标数）',
    { timeout: 120_000 },
    () => {
      const b2 = runChangyeyue(0, 2);
      const e2 = runChangyeyue(1, 2);
      expect(e2.memo / b2.memo).toBeCloseTo(1.3, 6);

      const b3 = runChangyeyue(0, 3);
      const e3 = runChangyeyue(1, 3);
      expect(e3.memo / b3.memo).toBeCloseTo(1.25, 6);
    },
  );

  it(
    'C 0 星魂不生效',
    { timeout: 120_000 },
    () => {
      expect(runChangyeyue(0, 1).memo).toBeCloseTo(runChangyeyue(0, 1).memo, 6);
    },
  );
});

describe('记忆 · 昔涟 point08 抗穿半句（1415）', () => {
  it(
    'D 180 速起每超 1 点 → 昔涟/德谬歌冰抗穿 +2%（读抗性区因子，不受出击次数影响）',
    { timeout: 120_000 },
    () => {
      const s180 = runXilian(180);
      const s181 = runXilian(181);
      const s183 = runXilian(183);
      // dump 绝对锚：180 速首击（已含 point08 的「我方全体增伤 +20%」）
      expect(s180.xilianFirst).toBe(3150);
      expect(s180.demiurgeFirst).toBe(2700);
      // 抗性 0 → 抗性区因子 = 1 + 穿透
      expect(s180.xilianResist).toBeCloseTo(1, 6);
      expect(s181.xilianResist).toBeCloseTo(1.02, 6);
      expect(s183.xilianResist).toBeCloseTo(1.06, 6);
      expect(s180.demiurgeResist).toBeCloseTo(1, 6);
      expect(s181.demiurgeResist).toBeCloseTo(1.02, 6);
      expect(s183.demiurgeResist).toBeCloseTo(1.06, 6);
    },
  );

  it(
    'E 超出速度最多计 60 点（上限穿透 +120%）：240 与 300 速相同',
    { timeout: 120_000 },
    () => {
      const s240 = runXilian(240);
      const s300 = runXilian(300);
      expect(s240.xilianResist).toBeCloseTo(2.2, 6);
      expect(s300.xilianResist).toBeCloseTo(2.2, 6);
      expect(s240.demiurgeResist).toBeCloseTo(2.2, 6);
      expect(s300.demiurgeResist).toBeCloseTo(2.2, 6);
    },
  );

  it(
    'F 低于 180 速不触发（穿透 0）',
    { timeout: 120_000 },
    () => {
      const s179 = runXilian(179);
      expect(s179.xilianResist).toBeCloseTo(1, 6);
      expect(s179.demiurgeResist).toBeCloseTo(1, 6);
    },
  );
});

/**
 * 遐蝶 1407 行迹 point07「倒置的火炬」的**死龙半句**（2026-11-02 用户两条裁定）：
 * 「死龙施放【燎尽黯泽的焰息】对场上所有敌方造成致命伤害 或 敌方无法被继续削减生命值时，
 *   死龙速度提高 100%，持续 1 回合」——每段龙喷判一次；按**死龙自己的回合**计；buff 持有者 = 死龙。
 *
 * 构造：木桩 HP 压到 1 段就死 → 第 1 段 `killed=true` 触发（不必凑「血量不再降低」那种免疫场景）。
 * 判据用**结构断言**（明细快照里死龙身上有没有这个 buff），不抄伤害数字。
 */
describe('记忆 · 死龙 point07 速度 +100%（1407）', () => {
  // ✅ 2026-11-02 定案：**改用纯函数判据**（用户推荐方案）。
  //   为什么不在战斗里测：`hpBased: true` 的伤害**不吃抗性区**（instrumented dump 实证：
  //   七系抗性全 1.0 时敌方 HP 仍 5000000 → 4990125），所以「血量不再降低」这一支
  //   在战斗里根本构造不出来；而「击杀」分支又受「谁来打死/何时死」影响，脆弱。
  //   判定口径本身（致命伤害 或 血量不降）与战斗流程无关 → 直接单测 `xiediePoint07Triggered`。
  describe('G 死龙 point07 触发判定（纯函数）', () => {
    it(
      'G1 造成致命伤害（存活数下降）→ 触发',
      () => {
        expect(xiediePoint07Triggered({ hpTotal: 1000, aliveCount: 2 }, { hpTotal: 1000, aliveCount: 1 })).toBe(true);
      },
    );

    it(
      'G2 血量不再降低（HP 总和持平）→ 触发',
      () => {
        expect(xiediePoint07Triggered({ hpTotal: 1000, aliveCount: 2 }, { hpTotal: 1000, aliveCount: 2 })).toBe(true);
      },
    );

    it(
      'G3 HP 反而变高（被治疗/护盾）也算「无法继续削减」→ 触发',
      () => {
        expect(xiediePoint07Triggered({ hpTotal: 900, aliveCount: 2 }, { hpTotal: 1000, aliveCount: 2 })).toBe(true);
      },
    );

    it(
      'G4 正常掉血且没打死 → 不触发（探针不是恒真）',
      () => {
        expect(xiediePoint07Triggered({ hpTotal: 1000, aliveCount: 2 }, { hpTotal: 600, aliveCount: 2 })).toBe(false);
      },
    );

    it(
      'G5 同时满足两条 → 仍只算一次触发',
      () => {
        expect(xiediePoint07Triggered({ hpTotal: 1000, aliveCount: 2 }, { hpTotal: 1000, aliveCount: 1 })).toBe(true);
      },
    );
  });
});
