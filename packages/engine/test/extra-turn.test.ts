import { describe, expect, it } from 'vitest';
import { createInteractiveBattle, simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  CombatEvent,
  CombatMember,
  MemberPanel,
  MonsterConfig,
} from '../src/index.js';
import { Timeline } from '../src/timeline.js';

/**
 * 额外回合新口径（2026-11 用户裁定）回归：
 * 额外回合 = 与跑道无关的**插入回合**——
 * ① 不改 av、不推进时间、不算新回合（buff/护盾/行动计数等回合结算全跳过）；
 * ② 优先级最高（压过已插入的终结技插队），多个额外回合同级 FIFO；
 * ③ 事件带 `extraTurn: true`，与触发它的行动同刻。
 *
 * 场景锚点全部来自 dump（%TEMP%/临时目录/blade-extra-v2.txt、huohua-laugh.txt，已删）。
 */

describe('Timeline · 额外回合原语', () => {
  it('优先于终结技插队、同刻、不推进时间、不改 av', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    tl.addUnit({ id: 'b', side: 'ally', speed: 100 });
    // 让 b 先动一轮，制造「剩余 av 各不相同」的现场
    const first = tl.advance();
    expect(first).toMatchObject({ type: 'unitAction', unitId: 'a' });
    tl.finishAction('a');
    const avBefore = { a: tl.getUnit('a').av, b: tl.getUnit('b').av };

    tl.insertAction('b'); // 终结技插队（FIFO 队列，低优先）
    tl.insertExtraTurn('a'); // 额外回合（最高优先）
    const ev = tl.advance();
    expect(ev).toMatchObject({ type: 'extraTurn', unitId: 'a' });
    // 与当前时刻同刻、轮次不变
    expect(ev).toMatchObject({ time: tl.time, round: tl.round });
    // 不改任何人的 av（与跑道无关）
    expect(tl.getUnit('a').av).toBeCloseTo(avBefore.a, 9);
    expect(tl.getUnit('b').av).toBeCloseTo(avBefore.b, 9);

    // 额外回合不需要 finishAction → 直接继续；下一条才是终结技插队
    const insert = tl.advance();
    expect(insert).toMatchObject({ type: 'insertAction', unitId: 'b' });
  });

  it('多个额外回合同级 FIFO', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    tl.addUnit({ id: 'b', side: 'ally', speed: 50 });
    tl.insertExtraTurn('a');
    tl.insertExtraTurn('b');
    tl.insertExtraTurn('a');
    expect(tl.hasExtraTurnPending()).toBe(true);
    expect(tl.advance()).toMatchObject({ type: 'extraTurn', unitId: 'a' });
    expect(tl.advance()).toMatchObject({ type: 'extraTurn', unitId: 'b' });
    expect(tl.advance()).toMatchObject({ type: 'extraTurn', unitId: 'a' });
    expect(tl.hasExtraTurnPending()).toBe(false);
    // 队列空后回到跑道：a 速度 100 → 100 时刻先动
    expect(tl.advance()).toMatchObject({ type: 'unitAction', unitId: 'a', time: 100 });
  });

  it('移除单位时清掉其待执行额外回合', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    tl.insertExtraTurn('a');
    tl.removeUnit('a');
    expect(tl.hasExtraTurnPending()).toBe(false);
  });
});

/* ===== 战斗层 ===== */

function mp(extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Wind',
    level: 80,
    hp: 20000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed: 110,
    energyRegen: 0,
    ...extra,
  };
}
function mon(hp = 5e8): MonsterConfig {
  return {
    level: 90,
    hp,
    maxToughness: 9999,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire'],
    enemyClass: 'normal',
    monsterId: '1012010',
    attack: 0,
  } as MonsterConfig;
}
const actsOf = (events: CombatEvent[], uid: string) =>
  events.filter((e) => e.kind === 'action' && e.unitId === uid);
const hellOf = (e: CombatEvent) =>
  (e.buffs?.blade ?? []).find((b) => b.labelKey === 'bladeHell');

describe('额外回合 · 刃【地狱变】', () => {
  it('标记为 extraTurn、与战技同刻；且额外回合不递减 holderEnd buff（3 回合仍是 3）', () => {
    let n = 0;
    const r = simulateBattle({
      members: [{ id: 'blade', panel: mp(), eidolonLevel: 0 }] as CombatMember[],
      monster: mon(),
      maxTime: 420,
      initialSp: 3,
      seed: 1,
      techniques: false,
      // 首动战技（→ 额外回合），之后普攻
      policy: (() => (n++ === 0 ? 'skill' : 'basic')) as BattleConfig['policy'],
    } as BattleConfig);
    const acts = actsOf(r.events, 'blade');
    expect(acts[0]!.skillCode).toBe('blade.skill');
    // 战技给自己挂 damageBonus/taunt（duration 3）
    expect(hellOf(acts[0]!)?.duration).toBe(3);

    const extra = acts[1]!;
    // ② 额外回合：同刻、带 extraTurn 标记
    expect(extra.extraTurn).toBe(true);
    expect(extra.time).toBeCloseTo(acts[0]!.time, 9);
    // ① 不算新回合 → 额外回合的 buff 快照仍是 3（未递减）
    expect(hellOf(extra)?.duration).toBe(3);

    // 对照：下一条**事件**（怪行动）已经能看到额外回合结束后仍是 3（若额外回合会 tick，
    // 这里会是 2）——这是本次裁定的核心断言
    const afterExtra = r.events.find((e) => e.time >= extra.time && e !== extra)!;
    expect(hellOf(afterExtra)?.duration).toBe(3);

    // 后续常规行动才开始递减：第 3 次行动后变 2
    expect(hellOf(acts[2]!)?.duration).toBe(3);
    expect(hellOf(acts[3]!)?.duration).toBe(2);
  });

  it('额外回合不占用跑道：下一次常规行动仍按原周期到来', () => {
    let n = 0;
    const r = simulateBattle({
      members: [{ id: 'blade', panel: mp({ speed: 100 }), eidolonLevel: 0 }] as CombatMember[],
      monster: mon(),
      maxTime: 500,
      initialSp: 3,
      seed: 1,
      techniques: false,
      policy: (() => (n++ === 0 ? 'skill' : 'basic')) as BattleConfig['policy'],
    } as BattleConfig);
    const acts = actsOf(r.events, 'blade');
    // 速度 100 → 周期 100：首动 100.00，额外回合同刻，再一次常规行动 200.00（不被额外回合改写）
    expect(acts[0]!.time).toBeCloseTo(100, 6);
    expect(acts[1]!.extraTurn).toBe(true);
    expect(acts[1]!.time).toBeCloseTo(100, 6);
    expect(acts[2]!.time).toBeCloseTo(200, 6);
  });
});

describe('额外回合 · 优先级压过已插入的终结技', () => {
  it('跟放终结技让位：额外回合先出事件，终结技随后补放', () => {
    const ctl = createInteractiveBattle({
      members: [
        { id: 'blade', panel: mp({ speed: 110 }), eidolonLevel: 0 },
        { id: 'seele', panel: mp({ speed: 115 }), eidolonLevel: 0 },
      ] as CombatMember[],
      monster: mon(),
      maxTime: 900,
      initialSp: 3,
      seed: 1,
      techniques: false,
    } as BattleConfig);
    /** 事件顺序：{kind, unitId, extra, afterSkill} */
    const order: { kind: string; unit: string; extra: boolean; afterSkill: boolean }[] = [];
    let step = ctl.advance();
    let submitted = false;
    for (let guard = 0; step && guard < 4000; guard += 1) {
      if (step.type === 'decision') {
        // 找到「刃放战技（会挣得额外回合）且队友终结技已满」的决策点，提交跟放
        const ready = step.status.ultReady.filter((id) => id !== 'blade');
        if (!submitted && step.unitId === 'blade' && ready.length > 0) {
          submitted = true;
          step = ctl.advance({ action: 'skill', afterUlts: [{ id: ready[0]! }] });
          continue;
        }
        step = ctl.advance({ action: 'basic' });
        continue;
      }
      order.push({
        kind: step.event.kind,
        unit: step.event.unitId,
        extra: step.event.extraTurn === true,
        afterSkill: step.event.afterSkill === true,
      });
      step = ctl.advance();
    }
    expect(submitted, '没等到「刃战技 + 队友能量满」的决策点').toBe(true);
    const extraIdx = order.findIndex((x) => x.extra);
    expect(extraIdx).toBeGreaterThanOrEqual(0);
    // 额外回合之后紧接着就是被延后的跟放终结技（同刻、带 afterSkill 标记）
    const after = order[extraIdx + 1];
    expect(after?.kind).toBe('ult');
    expect(after?.afterSkill).toBe(true);
  });
});

describe('额外回合 · 「回合开始」结算整体跳过', () => {
  it('血嗜（我方每回合开始 -500 生命）不在额外回合触发', () => {
    let n = 0;
    const r = simulateBattle({
      members: [{ id: 'blade', panel: mp({ speed: 100 }), eidolonLevel: 0 }] as CombatMember[],
      monster: mon(),
      maxTime: 250,
      initialSp: 3,
      seed: 1,
      techniques: false,
      mechanics: ['bloodthirst'],
      policy: (() => (n++ === 0 ? 'skill' : 'basic')) as BattleConfig['policy'],
    } as BattleConfig);
    // 100 战技 → 100 额外回合 → 200 常规普攻（血嗜自身也记 kind:'action'/unitId=blade，
    // 所以这里按 extraTurn / skillCode 取真实行动，不按 action 条数）
    const extras = r.events.filter((e) => e.extraTurn === true);
    expect(extras).toHaveLength(1);
    expect(Math.round(extras[0]!.time)).toBe(100);
    const swings = actsOf(r.events, 'blade').filter((e) => (e.skillCode ?? '').startsWith('blade.'));
    expect(swings.map((e) => Math.round(e.time))).toEqual([100, 100, 200]);
    const thirst = r.events.filter((e) => (e.note ?? []).includes('stageBloodthirst'));
    // 只有两次常规行动各扣一次；额外回合不触发（否则会出现第三条 100 时刻）
    expect(thirst.map((e) => Math.round(e.time))).toEqual([100, 200]);
  });
});

describe('额外回合 · 火花 E2（阿哈时刻结束触发，非紧跟自身行动）', () => {
  it('额外回合发生在回合中段也不重置行动值：下一次常规行动仍按原周期', () => {
    const fire = (e: number): CombatMember => ({
      id: 'huohua' as never,
      panel: mp({ element: 'Fire' as MemberPanel['element'], speed: 107 }),
      eidolonLevel: e,
    });
    const r = simulateBattle({
      members: [fire(4)],
      monster: mon(),
      maxTime: 400,
      rounds: 8,
      techniques: false,
    } as BattleConfig);
    const acts = actsOf(r.events, 'huohua');
    // 速度 107 → 周期 93.46：常规 93.46 → E2 额外回合 98.62 → 下一次常规 186.92（= 2×周期）
    expect(acts[0]!.time).toBeCloseTo(93.46, 2);
    expect(acts[0]!.extraTurn).toBeUndefined();
    expect(acts[1]!.extraTurn).toBe(true);
    expect(acts[1]!.time).toBeCloseTo(98.62, 2);
    // 若额外回合会重置行动值，这里会是 98.62 + 93.46 = 192.08
    expect(acts[2]!.time).toBeCloseTo(186.92, 2);
    expect(acts[2]!.extraTurn).toBeUndefined();
  });
});
