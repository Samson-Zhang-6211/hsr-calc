import { describe, expect, it } from 'vitest';
import {
  FIRST_ROUND_AV,
  LATER_ROUND_AV,
  Timeline,
  TRACK_LENGTH,
  type TimelineEvent,
} from '../src/timeline.js';

/** 连续推进 n 个事件（unitAction 自动结算） */
function pump(tl: Timeline, count: number): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const ev = tl.advance();
    if (!ev) break;
    if (ev.type === 'unitAction') tl.finishAction(ev.unitId);
    events.push(ev);
  }
  return events;
}

describe('Timeline 基本排序', () => {
  it('初始行动值 = 10000/速度，速度快者先动', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'slow', side: 'ally', speed: 100 });
    tl.addUnit({ id: 'fast', side: 'ally', speed: 200 });
    expect(tl.getUnit('slow').av).toBeCloseTo(100, 9);
    expect(tl.getUnit('fast').av).toBeCloseTo(50, 9);
    const ev = tl.advance();
    expect(ev).toMatchObject({ type: 'unitAction', unitId: 'fast', time: 50 });
  });

  it('行动后重置为 10000/速度并按序推进', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    tl.addUnit({ id: 'b', side: 'ally', speed: 125 });
    // a=100, b=80 → b 在 80 行动，a 剩 20 → a 在 100 行动
    const ev1 = tl.advance();
    expect(ev1).toMatchObject({ unitId: 'b', time: 80 });
    tl.finishAction('b');
    const ev2 = tl.advance();
    expect(ev2).toMatchObject({ unitId: 'a', time: 100 });
    tl.finishAction('a');
    // b 重置后 av=80（t=80 时 10000/125=80，t=100 时剩 60）→ b 在 160；a 在 200
    const ev3 = tl.advance();
    expect(ev3).toMatchObject({ unitId: 'b', time: 160 });
  });

  it('同刻按编队 order 决出', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'second', side: 'ally', speed: 100, order: 1 });
    tl.addUnit({ id: 'first', side: 'ally', speed: 100, order: 0 });
    const ev = tl.advance();
    expect(ev).toMatchObject({ unitId: 'first' });
  });
});

describe('轮次', () => {
  it('首轮 150 行动值，之后每轮 100', () => {
    const tl = new Timeline();
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    const times: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const ev = tl.advance();
      if (!ev) break;
      if (ev.type === 'unitAction') {
        times.push(ev.time);
        tl.finishAction(ev.unitId);
      } else if (ev.type === 'roundBoundary') {
        times.push(ev.time);
      }
    }
    expect(times).toContain(FIRST_ROUND_AV); // 150
    expect(times.filter((t) => t === 150).length).toBe(1);
    // 边界序列 150 / 250 / 350…
    const boundaries = times.filter((t) => t >= 150 && t % 50 === 0).sort((x, y) => x - y);
    expect(boundaries.slice(0, 4)).toEqual([150, 200, 250, 300].filter((t) => times.includes(t)));
    expect(tl.round).toBeGreaterThanOrEqual(2);
    expect(LATER_ROUND_AV).toBe(100);
  });

  it('134 速首轮 2 动（阈值验算），第 3 动在第二轮', () => {
    const tl = new Timeline();
    tl.addUnit({ id: 'c', side: 'ally', speed: 134 });
    const actions: { time: number; round: number }[] = [];
    for (let i = 0; i < 6; i += 1) {
      const ev = tl.advance();
      if (!ev) break;
      if (ev.type === 'unitAction') {
        actions.push({ time: ev.time, round: ev.round });
        tl.finishAction(ev.unitId);
      }
    }
    expect(actions.filter((a) => a.round === 0)).toHaveLength(2);
    expect(actions[2].round).toBeGreaterThanOrEqual(1);
  });

  it('200 速首轮 3 动：第 3 动恰在 t=150 计入第 0 轮（边界先行动后切轮）', () => {
    const tl = new Timeline();
    tl.addUnit({ id: 'c', side: 'ally', speed: 200 });
    const actions: { time: number; round: number }[] = [];
    for (let i = 0; i < 5; i += 1) {
      const ev = tl.advance();
      if (!ev) break;
      if (ev.type === 'unitAction') {
        actions.push({ time: ev.time, round: ev.round });
        tl.finishAction(ev.unitId);
      }
    }
    expect(actions.slice(0, 3).map((a) => a.time)).toEqual([50, 100, 150]);
    expect(actions[2].round).toBe(0);
  });
});

describe('拉条 / 推条 / 提速（BWIKI 小测试口径）', () => {
  it('速度100 剩余50 行动值，行动提前20% → 30', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100, initialAv: 50 });
    tl.actionAdvance('a', 0.2);
    expect(tl.getUnit('a').av).toBeCloseTo(30, 9);
  });

  it('速度100 剩余50，提速到120 → 行动值 41.67（路程不变）', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100, initialAv: 50 });
    tl.speedChange('a', 120);
    expect(tl.getUnit('a').av).toBeCloseTo((50 * 100) / 120, 9);
    expect(tl.getUnit('a').av).toBeCloseTo(41.6667, 3);
  });

  it('行动提前 clamp 到 0（不越过终点）', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100, initialAv: 50 });
    tl.actionAdvance('a', 0.9);
    expect(tl.getUnit('a').av).toBe(0);
  });

  it('被推条后行动提前100%不归0（2026 口径：推条可超过初始行动值）', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    // 初始 av=100；推条20% → 120（超过初始100）
    tl.actionDelay('a', 0.2);
    expect(tl.getUnit('a').av).toBeCloseTo(120, 9);
    // 行动提前100% → 120-100=20 > 0，不归0（与「立即行动」不同）
    tl.actionAdvance('a', 1);
    expect(tl.getUnit('a').av).toBeCloseTo(20, 9);
    // 立即行动强制归0
    tl.instantAction('a');
    expect(tl.getUnit('a').av).toBe(0);
  });

  it('提速发生在行动中（av=0）不影响当前圈', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100, initialAv: 0 });
    const ev = tl.advance();
    expect(ev).toMatchObject({ type: 'unitAction', unitId: 'a' });
    tl.speedChange('a', 150);
    expect(tl.getUnit('a').av).toBe(0);
    tl.finishAction('a');
    expect(tl.getUnit('a').av).toBeCloseTo(TRACK_LENGTH / 150, 9);
  });
});

describe('后拉先动与插队', () => {
  it('多个立即行动同刻：更晚归0者先动（E→C→B）', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    tl.addUnit({ id: 'b', side: 'ally', speed: 100, order: 1 });
    tl.addUnit({ id: 'c', side: 'ally', speed: 100, order: 2 });
    tl.addUnit({ id: 'e', side: 'ally', speed: 100, order: 3 });
    const first = tl.advance();
    expect(first).toMatchObject({ type: 'unitAction', unitId: 'a' });
    // a 行动期间：B 立即行动 → C 立即行动 → E 立即行动（后拉先动）
    tl.instantAction('b');
    tl.instantAction('c');
    tl.instantAction('e');
    tl.finishAction('a');
    const seq = pump(tl, 3).map((ev) => (ev.type === 'unitAction' ? ev.unitId : ''));
    expect(seq).toEqual(['e', 'c', 'b']);
  });

  it('插队事件不改变行动值与时间', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    tl.addUnit({ id: 'b', side: 'ally', speed: 150 });
    const beforeA = tl.getUnit('a').av;
    const beforeB = tl.getUnit('b').av;
    tl.insertAction('b'); // b 终结技插队（b 正在跑道中）
    const ev = tl.advance();
    expect(ev).toMatchObject({ type: 'insertAction', unitId: 'b', time: 0 });
    expect(tl.getUnit('a').av).toBeCloseTo(beforeA, 9);
    expect(tl.getUnit('b').av).toBeCloseTo(beforeB, 9); // av 未动
    // 插队不需要结算，直接继续推进
    const next = tl.advance();
    expect(next).toMatchObject({ type: 'unitAction', unitId: 'b' });
  });

  it('unitAction 后未 finishAction 再 advance 报错（契约）', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    tl.advance();
    expect(() => tl.advance()).toThrow('finishAction');
  });

  it('finishAction 需按当前待结算单位调用', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'a', side: 'ally', speed: 100 });
    tl.addUnit({ id: 'b', side: 'ally', speed: 100 });
    tl.advance();
    expect(() => tl.finishAction('b')).toThrow();
  });
});

describe('阈值验算与多人序列', () => {
  it('四人队列按速度排出的行动序（134/150/90/120）', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 's134', side: 'ally', speed: 134, order: 0 });
    tl.addUnit({ id: 's150', side: 'ally', speed: 150, order: 1 });
    tl.addUnit({ id: 's90', side: 'ally', speed: 90, order: 2 });
    tl.addUnit({ id: 's120', side: 'ally', speed: 120, order: 3 });
    const seq = pump(tl, 6).map((ev) =>
      ev.type === 'unitAction' ? ev.unitId : `round@${ev.time}`,
    );
    // 初始：150→66.67, 134→74.63, 120→83.33, 90→111.11
    expect(seq[0]).toBe('s150');
    expect(seq[1]).toBe('s134');
    expect(seq[2]).toBe('s120');
    expect(seq[3]).toBe('s90');
  });

  it('m 轮 n 动阈值公式：350 行动值内 142.9 速恰好 5 动（150+100+100=350）', () => {
    const tl = new Timeline();
    tl.addUnit({ id: 'c', side: 'ally', speed: 50000 / 350 }); // 142.857
    let actions = 0;
    let lastAction = 0;
    for (;;) {
      const ev = tl.advance();
      if (!ev || ev.time > 350 + 1e-6) break;
      if (ev.type === 'unitAction') {
        actions += 1;
        lastAction = ev.time;
        tl.finishAction(ev.unitId);
      }
    }
    expect(lastAction).toBeLessThanOrEqual(350 + 1e-6);
    expect(actions).toBe(5);
  });
});

describe('predict 纯速度跑道推演（全真模拟未来 8 条）', () => {
  it('按当前速度取最小 av，行动后重置，不修改原实例', () => {
    const tl = new Timeline({ rounds: true });
    tl.addUnit({ id: 'a', side: 'ally', speed: 156, order: 0 });
    tl.addUnit({ id: 'b', side: 'ally', speed: 134, order: 1 });
    tl.addUnit({ id: 'monster', side: 'enemy', speed: 100, order: 4 });
    const before = tl.snapshot();
    const rows = tl.predict(8);
    expect(rows).toHaveLength(8);
    // 首动 = 最快单位 a（10000/156 ≈ 64.10）
    expect(rows[0].unitId).toBe('a');
    expect(rows[0].time).toBeCloseTo(TRACK_LENGTH / 156, 6);
    expect(rows[0].av).toBeCloseTo(TRACK_LENGTH / 156, 6);
    // 第二动 = b（74.63），第三动 = monster（100）
    expect(rows[1].unitId).toBe('b');
    expect(rows[1].time).toBeCloseTo(TRACK_LENGTH / 134, 6);
    expect(rows[2].unitId).toBe('monster');
    expect(rows[2].time).toBeCloseTo(TRACK_LENGTH / 100, 6);
    // a 第二圈 = 64.10×2
    expect(rows[3].unitId).toBe('a');
    expect(rows[3].time).toBeCloseTo((TRACK_LENGTH / 156) * 2, 6);
    // 只读：原实例状态不变
    const after = tl.snapshot();
    expect(after).toEqual(before);
  });

  it('时间为累计绝对时刻（从当前时刻起算）', () => {
    const tl = new Timeline({ rounds: false });
    tl.addUnit({ id: 'x', side: 'ally', speed: 100, order: 0 });
    const rows = tl.predict(3);
    expect(rows.map((r) => Math.round(r.time))).toEqual([100, 200, 300]);
  });
});
