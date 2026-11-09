import { describe, expect, it } from 'vitest';
import { simulateTeamAxis, type TeamAxisConfig } from '../src/team-axis.js';

const BASE: TeamAxisConfig = {
  members: [
    { id: 'qingge', speed: 156, energyRegen: 0.194 },
    { id: 'sunday', speed: 134, energyRegen: 0.194 },
    { id: 'jingyuan', speed: 135, energyRegen: 0 },
    { id: 'tenghuang', speed: 134, energyRegen: 0.194 },
  ],
};

describe('四人队行动轴', () => {
  it('开局序列：秘技 → 晴歌召唤 → 龙灵 → 景元 → 周日拉条（含 SP/能量/段数）', () => {
    const { events } = simulateTeamAxis(BASE);
    expect(events.length).toBeGreaterThan(8);

    const e0 = events[0];
    expect(e0).toMatchObject({
      time: 0,
      round: 0,
      kind: 'action',
      unitId: 'tenghuang',
      action: 'skill',
      spAfter: 3,
      note: ['technique', 'shield', 'summonLongling'],
    });
    // 初始能量 = 上限 50%：腾荒 67.5、晴歌 70、景元 65、周日 65
    expect(e0.energyAfter).toBeCloseTo(103.32, 6);

    const e1 = events[1];
    expect(e1.unitId).toBe('qingge');
    expect(e1.action).toBe('skill');
    expect(e1.spAfter).toBe(2);
    expect(e1.time).toBeCloseTo((10000 / 156) * 0.8, 6);
    expect(e1.note).toEqual(['summonBeisi', 'summonQiumi']);
    // 70 + 战技30×1.194 + 召唤20×1.194（1151205 被召唤回能）+ 律动两次消耗×3固定
    expect(e1.energyAfter).toBeCloseTo(135.7, 6);

    const e2 = events[2];
    expect(e2.unitId).toBe('longling');
    expect(e2.action).toBe('longling');
    expect(e2.time).toBeCloseTo(10000 / 165, 6);

    const e3 = events[3];
    expect(e3.unitId).toBe('jingyuan');
    expect(e3.action).toBe('skill');
    expect(e3.spAfter).toBe(1);
    expect(e3.stacks).toBe(8);
    // 初始80（=65+行迹绸缪15）+战技30×1.0；景元本体攻击触发行迹葳蕤（给腾荒回能、龙灵拉条，景元自身不变）
    expect(e3.energyAfter).toBeCloseTo(110, 6);
    expect(e3.note).toContain('traceWeiRui');
    expect(e3.time).toBeCloseTo(10000 / 135, 6);

    const e4 = events[4];
    // 晴歌召唤+忆灵回能后能量涨快 → 晴歌大招提前插队（景元首动同刻）
    expect(e4.kind).toBe('ult');
    expect(e4.unitId).toBe('qingge');
    expect(e4.note).toEqual(['pullJingyuan']);
    expect(e4.energyAfter).toBeCloseTo(5.97, 6);
    expect(e4.time).toBeCloseTo(74.07, 2);

    // 被拉的景元同刻第2动：战技+30、晴歌大招+16.8 → 触顶130；三忆灵齐进 Fever
    const e5 = events[5];
    expect(e5.unitId).toBe('jingyuan');
    expect(e5.action).toBe('skill');
    expect(e5.spAfter).toBe(0);
    expect(e5.energyAfter).toBeCloseTo(130, 6);
    expect(e5.note).toEqual(['summonPaiding', 'enterFever', 'traceWeiRui']);
    expect(e5.time).toBe(e4.time);

    // 景元终结技（大招插队，自开大+5）
    const e6 = events[6];
    expect(e6.kind).toBe('ult');
    expect(e6.unitId).toBe('jingyuan');
    expect(e6.energyAfter).toBeCloseTo(5, 6);
    expect(e6.time).toBe(e4.time);

    const e7 = events[7];
    expect(e7.unitId).toBe('sunday');
    expect(e7.action).toBe('basic');
    expect(e7.spAfter).toBe(1);
    // 90 起手（=65+行迹崇高拂尘25）+ 普攻20×1.194
    expect(e7.energyAfter).toBeCloseTo(90 + 20 * 1.194, 6);
    expect(e7.time).toBeCloseTo(74.63, 2);

    const e8 = events[8];
    expect(e8.unitId).toBe('tenghuang');
    expect(e8.action).toBe('basic');
    expect(e8.spAfter).toBe(2);
    // 行迹葳蕤：景元两次本体攻击 +6×1.194×2 → 103.32+14.328+23.88 触顶 135
    expect(e8.energyAfter).toBeCloseTo(135, 6);
    expect(e8.time).toBe(e7.time);
  });

  it('战技点始终在 [0,5]，事件不超过截止行动值', () => {
    const { events, summary } = simulateTeamAxis(BASE);
    for (const e of events) {
      expect(e.spAfter).toBeGreaterThanOrEqual(0);
      expect(e.spAfter).toBeLessThanOrEqual(5);
      expect(e.time).toBeLessThanOrEqual(350 + 1e-6);
      expect(e.moodAfter).toBeGreaterThanOrEqual(0);
      expect(e.moodAfter).toBeLessThanOrEqual(50);
      // 气氛值为整数（倒计时扣除后向下取整）
      expect(Number.isInteger(e.moodAfter)).toBe(true);
    }
    // moodAfter 逐事件记录，末事件值 = 汇总
    expect(events[events.length - 1].moodAfter).toBe(summary.mood);
    expect(summary.spFinal).toBeLessThanOrEqual(5);
    expect(summary.actionCounts.jingyuan).toBeGreaterThan(0);
    expect(summary.actionCounts.shenjun).toBeGreaterThan(0);
    expect(summary.actionCounts.memo).toBeGreaterThan(0);
  });

  it('轮次边界事件按 150/250/… 生成（第0轮起）', () => {
    const { events } = simulateTeamAxis(BASE);
    const rounds = events.filter((e) => e.kind === 'round');
    expect(rounds.length).toBeGreaterThanOrEqual(2);
    expect(rounds[0].time).toBe(150);
    expect(rounds[1].time).toBe(250);
    for (const r of rounds) expect(r.round).toBeGreaterThanOrEqual(1);
  });

  it('忆灵回能：召唤回 20（1151205）+ 每次行动回 20（1151201 sp_base，×充能效率）', () => {
    const { events } = simulateTeamAxis(BASE);
    // 下界守恒：忆灵每动至少 +20×1.194（期间即兴蓝调/特邀嘉宾穿插只会更多；
    // 晴歌事件更新基准，含 ult 开大清零；上限140）
    let last = 0;
    let memoCount = 0;
    for (const e of events) {
      if (e.unitId === 'qingge') {
        if (e.energyAfter !== undefined) last = e.energyAfter;
      } else if (e.unitId === 'memo' && e.kind === 'action') {
        expect(e.energyAfter, `memo t=${e.time}`).toBeGreaterThanOrEqual(
          Math.min(140, last + 20 * 1.194) - 1e-6,
        );
        expect(e.energyAfter!, `memo t=${e.time} 上限`).toBeLessThanOrEqual(140);
        last = e.energyAfter!;
        memoCount += 1;
      }
    }
    expect(memoCount).toBeGreaterThan(0);
    // 召唤回能已计入开局断言（e1 = 135.7 含 1151205 的 20×1.194）
  });

  it('星期日大招后3次行动内的战技为净0（蒙福者返还1点）', () => {
    const { events } = simulateTeamAxis({ ...BASE, maxTime: 700 });
    const ults = events.filter((e) => e.kind === 'ult' && e.unitId === 'sunday');
    expect(ults.length).toBeGreaterThan(0);
    let checked = 0;
    for (const u of ults) {
      const next3 = events
        .filter((e) => e.index > u.index && e.kind === 'action' && e.unitId === 'sunday')
        .slice(0, 3);
      for (const a of next3) {
        if (a.action !== 'skill') continue;
        const delta = a.spAfter - events[a.index - 1].spAfter;
        expect(delta).toBe(0);
        checked += 1;
      }
      break;
    }
    expect(checked).toBeGreaterThan(0);

    // 首次（未开大前）战技必须净耗1点，验证 delta 口径
    const firstSkill = events.find(
      (e) => e.kind === 'action' && e.unitId === 'sunday' && e.action === 'skill',
    )!;
    const delta = firstSkill.spAfter - events[firstSkill.index - 1].spAfter;
    expect(delta).toBe(-1);
  });

  it('晴歌终结技使景元同刻行动（行动提前100%）', () => {
    const { events } = simulateTeamAxis({ ...BASE, maxTime: 700 });
    const ult = events.find((e) => e.kind === 'ult' && e.unitId === 'qingge');
    expect(ult).toBeDefined();
    expect(ult!.note).toContain('pullJingyuan');
    let i = ult!.index + 1;
    while (i < events.length && events[i].kind !== 'action') i++;
    const next = events[i];
    expect(next).toBeDefined();
    expect(next.unitId).toBe('jingyuan');
    expect(next.time).toBe(ult!.time);
  });

  it('特邀嘉宾：晴歌大招后景元及其召唤物攻击额外+2气氛，持续景元2次行动', () => {
    const { events, finalState } = simulateTeamAxis({ ...BASE, maxTime: 700 });
    const ult = events.find((e) => e.kind === 'ult' && e.unitId === 'qingge');
    expect(ult).toBeDefined();
    const delta = (idx: number) =>
      events[idx].moodAfter! - events[idx - 1].moodAfter!;

    // 被拉的景元同刻行动：+1 基础 +2 特邀 = Δ3
    const pulled = events[ult!.index + 1];
    expect(pulled.unitId).toBe('jingyuan');
    expect(delta(pulled.index)).toBe(3);

    // 景元行动逐次递减：第1、2次 Δ3，第3次起回到 Δ1（每回合开始递减，共2回合）
    const jActs = events.filter(
      (e) => e.kind === 'action' && e.unitId === 'jingyuan' && e.index > ult!.index,
    );
    expect(delta(jActs[0].index)).toBe(3);
    expect(delta(jActs[1].index)).toBe(3);
    expect(delta(jActs[2].index)).toBe(1);
    // 神君（景元召唤物）若在特邀窗口内行动，同样 Δ3
    const sjInWindow = events.filter(
      (e) =>
        e.kind === 'action' &&
        e.unitId === 'shenjun' &&
        e.index > ult!.index &&
        e.index <= jActs[1].index,
    );
    for (const sj of sjInWindow) expect(delta(sj.index)).toBe(3);
    expect(finalState.invitedTurns).toBe(0);
  });

  it('景元终结技：神君+3段（≤10）', () => {
    const { events } = simulateTeamAxis({ ...BASE, maxTime: 700 });
    const ult = events.find((e) => e.kind === 'ult' && e.unitId === 'jingyuan');
    expect(ult).toBeDefined();
    expect(ult!.stacks).toBeGreaterThanOrEqual(4);
    expect(ult!.stacks).toBeLessThanOrEqual(10);
  });

  it('龙灵强化次数：腾荒大招后剩余2，随龙灵行动递减 2→1→0', () => {
    const { events } = simulateTeamAxis({ ...BASE, maxTime: 700 });
    const ult = events.find((e) => e.kind === 'ult' && e.unitId === 'tenghuang')!;
    expect(ult).toBeDefined();
    expect(ult.enhanceAfter).toBe(2);
    const boosts = events
      .filter((e) => e.index > ult.index && e.kind === 'action' && e.unitId === 'longling')
      .map((e) => e.enhanceAfter);
    expect(boosts.slice(0, 3)).toEqual([2, 1, 0]);
  });

  it('Fever：全员登台进入→倒计时扣气氛；期间晴歌不行动；退出时气氛必归 0', () => {
    const { events, finalState } = simulateTeamAxis({ ...BASE, maxTime: 700 });
    const enter = events.find((e) => e.note?.includes('enterFever'));
    expect(enter).toBeDefined();
    // 忆灵气氛改按同一单位 +1（2026-10 用户裁定）后，长跑中倒计时可将气氛扣归 0 退出
    // Fever（原 +3 聚合下高频队永续；实际气氛收入待游戏内复核）——退出时气氛必为 0
    const exit = events.find((e) => e.note?.includes('exitFever'));
    if (exit) expect(exit.moodAfter).toBe(0);

    const ticks = events.filter((e) => e.kind === 'action' && e.unitId === 'countdown');
    expect(ticks.length).toBeGreaterThan(0);
    // 倒计时回合开始扣除 ≥12 点气氛值
    const firstTick = ticks[0];
    const prevMood = events[firstTick.index - 1].moodAfter!;
    expect(prevMood - (firstTick.moodAfter ?? 0)).toBeGreaterThanOrEqual(12);

    // Fever 期间（进入起至退出止）晴歌不进入自己的回合
    const untilExit = exit ? exit.index : events[events.length - 1].index;
    const duringFever = events.filter(
      (e) => e.index > enter!.index && e.index < untilExit,
    );
    expect(duringFever.some((e) => e.kind === 'action' && e.unitId === 'qingge')).toBe(false);
    // 行迹「即兴蓝调」层数在 [0,12]
    expect(finalState.rhythm).toBeGreaterThanOrEqual(0);
    expect(finalState.rhythm).toBeLessThanOrEqual(12);
  });

  it('关秘技：行迹葳蕤使腾荒首动提前40%、晴歌首动为战技召唤贝茜', () => {
    const { events } = simulateTeamAxis({ ...BASE, techniques: false });
    expect(events[0].time).toBeGreaterThan(0);
    expect(events[0].unitId).toBe('tenghuang');
    expect(events[0].action).toBe('skill');
    expect(events[0].time).toBeCloseTo((10000 / 134) * 0.6, 6);
    expect(events[0].note).toContain('summonLongling');

    expect(events[1].unitId).toBe('qingge');
    expect(events[1].action).toBe('skill');
    expect(events[1].time).toBeCloseTo(10000 / 156, 6);
    expect(events[1].note).toEqual(['summonBeisi']);

    const t0 = events.find((e) => e.kind === 'action' && e.unitId === 'tenghuang')!;
    expect(t0.action).toBe('skill');
    expect(t0.note).toContain('summonLongling');

    const ll = events.find((e) => e.kind === 'action' && e.unitId === 'longling')!;
    expect(ll.time).toBeGreaterThan(0);
  });

  it('可配置：关轮次 / 初始战技点 / 截止行动值', () => {
    const noRounds = simulateTeamAxis({ ...BASE, rounds: false, maxEvents: 30 });
    expect(noRounds.events.some((e) => e.kind === 'round')).toBe(false);

    const sp5 = simulateTeamAxis({ ...BASE, initialSp: 5 });
    expect(sp5.events[0].spAfter).toBe(5);

    const short = simulateTeamAxis({ ...BASE, maxTime: 100 });
    for (const e of short.events) expect(e.time).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('配置校验：人数/缺人/速度', () => {
    expect(() => simulateTeamAxis({ members: BASE.members.slice(0, 3) })).toThrow();
    expect(() =>
      simulateTeamAxis({ members: [BASE.members[0], BASE.members[1], BASE.members[2], BASE.members[2]] }),
    ).toThrow();
    expect(() =>
      simulateTeamAxis({
        members: BASE.members.map((m) => (m.id === 'qingge' ? { ...m, speed: 0 } : m)),
      }),
    ).toThrow();
  });
});
