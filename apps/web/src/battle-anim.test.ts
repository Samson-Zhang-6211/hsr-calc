import { describe, expect, it } from 'vitest';
import {
  BASE_ATTACK_MS,
  BASE_ENEMY_MS,
  BASE_HIT_GAP_MS,
  BASE_ULT_MS,
  MAX_POPS_PER_TARGET,
  MIN_FRAME_MS,
  POP_ELEMENT_COLORS,
  STACK_STEP_PX,
  damageColor,
  framesDuration,
  isRainbowKind,
  planFrames,
  scaleMs,
} from './battle-anim.js';
import type { CombatEvent, HitLog } from '@hsr-calc/engine';

/**
 * 攻击动画编排（battle-anim.ts）的纯函数契约。
 *
 * 口径来源（2026-10-25 用户裁定 + 实战录屏校准）：
 *  - 动画时长 = 基础时长 ÷ 输出倍速，带下限；
 *  - 伤害飘字 = total 取整（floor）+ 直伤/DoT 按属性色、击破系金黄、欢愉彩虹渐变；
 *  - 暴击跳「暴击」、击破跳「击破」；
 *  - 我方直伤/DoT/击破/超击破/召唤物/敌方攻击我方 各自出帧。
 */

function hit(seq: number, over: Partial<HitLog> = {}): HitLog {
  return {
    seq,
    time: 0,
    round: 1,
    source: 'jingyuan',
    skillCode: 'jingyuan.skill',
    kind: 'direct',
    total: 1234.5678,
    target: 'monster2',
    factors: [],
    ...over,
  } as HitLog;
}

function event(over: Partial<CombatEvent> = {}): CombatEvent {
  return { time: 0, round: 1, kind: 'action', unitId: 'jingyuan', ...over } as CombatEvent;
}

const elementOf = (source: string): string | undefined =>
  source === 'jingyuan' ? 'Thunder' : undefined;

describe('battle-anim：倍速缩放', () => {
  it('时长 = 基础 ÷ 倍速，并夹下限', () => {
    // 2026-10-26 节奏放缓：MIN_FRAME_MS 提到 320，因此 400/2=200 会被夹到 320
    expect(scaleMs(400, 1)).toBe(400);
    expect(scaleMs(400, 2)).toBe(MIN_FRAME_MS);
    expect(scaleMs(400, 0.5)).toBe(800);
    expect(scaleMs(2000, 2)).toBe(1000);
    // 5× 时低于下限 → 取下限（否则肉眼看不见）
    expect(scaleMs(BASE_ATTACK_MS, 5)).toBe(MIN_FRAME_MS);
    // 非法倍速回落 1×
    expect(scaleMs(400, 0)).toBe(400);
    expect(scaleMs(400, Number.NaN)).toBe(400);
  });
});

describe('battle-anim：帧规划', () => {
  it('我方直伤 → ally 帧、飘字取整且按属性上色', () => {
    const ev = { ...event({ hitSeqs: [1, 2] }), note: [] } as CombatEvent;
    const frames = planFrames([ev], [hit(1), hit(2, { target: 'monster1' })], {
      speed: 1,
      elementOf,
    });
    expect(frames).toHaveLength(1);
    const f = frames[0]!;
    expect(f.kind).toBe('ally');
    expect(f.actor).toBe('jingyuan');
    expect(f.targets).toEqual(['monster2', 'monster1']);
    expect(f.numbers).toHaveLength(2);
    // floor 取整（不是 round）
    expect(f.numbers[0]!.value).toBe(1234);
    // 2026-10-25 用户校正：直伤按属性上色（雷=紫；物理才是白）
    expect(f.numbers[0]!.color).toBe(POP_ELEMENT_COLORS.thunder);
    expect(damageColor('direct', 'Thunder')).toBe(POP_ELEMENT_COLORS.thunder);
    expect(damageColor('direct', 'Physical')).toBe('#ffffff');
    expect(damageColor('direct', 'Wind')).toBe(POP_ELEMENT_COLORS.wind);
    expect(f.durationMs).toBe(BASE_ATTACK_MS);
  });

  it('飘字排版：同目标纵向排开 + 逐段错开，首个目标首段走 main', () => {
    // 同一目标 3 段：第 1 段 main，其余 sub，纵向每段 -26px、时间每段 +160ms
    const ev = { ...event({ hitSeqs: [1, 2, 3] }), note: [] } as CombatEvent;
    const frames = planFrames([ev], [hit(1), hit(2), hit(3)], { speed: 1, elementOf });
    const nums = frames[0]!.numbers;
    expect(nums.map((n) => n.tier)).toEqual(['main', 'sub', 'sub']);
    expect(nums.map((n) => n.offsetY)).toEqual([0, -STACK_STEP_PX, -STACK_STEP_PX * 2]);
    expect(nums.map((n) => n.delayMs)).toEqual([0, BASE_HIT_GAP_MS, BASE_HIT_GAP_MS * 2]);
    for (const n of nums) expect(Math.abs(n.angleDeg)).toBeLessThanOrEqual(8);
    // 不同目标各自从 0 起算延迟（跨目标互不等待）
    const multi = planFrames(
      [ev],
      [hit(1), hit(2, { target: 'monster1' }), hit(3, { target: 'monster3' })],
      { speed: 1, elementOf },
    );
    expect(multi[0]!.numbers.map((n) => n.delayMs)).toEqual([0, 0, 0]);
    // 角度确定性（重播不抖）
    const again = planFrames([ev], [hit(1), hit(2), hit(3)], { speed: 1, elementOf });
    expect(again[0]!.numbers[0]!.angleDeg).toBe(nums[0]!.angleDeg);
  });

  it('同目标超过 4 段时合并成一条并标 ×N', () => {
    const ev = { ...event({ hitSeqs: [1, 2, 3, 4, 5, 6] }), note: [] } as CombatEvent;
    const frames = planFrames([ev], [1, 2, 3, 4, 5, 6].map((i) => hit(i, { total: 100 })), {
      speed: 1,
      elementOf,
    });
    const nums = frames[0]!.numbers;
    // 只保留 4 条；第 4 条吸收后两段 → 值 300、multi=3
    expect(nums).toHaveLength(MAX_POPS_PER_TARGET);
    expect(nums[3]!.value).toBe(300);
    expect(nums[3]!.multi).toBe(3);
    // 动作总伤仍是全部 6 段的合计（不被合并影响）
    expect(frames[0]!.totalDamage).toBe(600);
  });

  it('阿哈时刻按欢愉技拆分：每个施放者一帧，并各带技能名', () => {
    const ev = {
      ...event({ unitId: 'ahaMoment', action: 'ahaMoment', hitSeqs: [1, 2, 3] }),
      note: [],
    } as CombatEvent;
    const frames = planFrames(
      [ev],
      [
        hit(1, { source: 'aha', skillCode: 'aha.elation', kind: 'elation' }),
        hit(2, { source: 'feiying', skillCode: 'feiying.elation', kind: 'elation' }),
        hit(3, { source: 'feiying', skillCode: 'feiying.elation', kind: 'elation' }),
      ],
      {
        speed: 1,
        elementOf,
        labelOf: (e) => (e.skillCode ? `L:${e.skillCode}` : undefined),
      },
    );
    expect(frames.map((f) => f.actor)).toEqual(['aha', 'feiying']);
    expect(frames.map((f) => f.label)).toEqual(['L:aha.elation', 'L:feiying.elation']);
    expect(frames[1]!.numbers).toHaveLength(2);
    // 欢愉命中走彩虹渐变
    expect(frames[0]!.numbers[0]!.rainbow).toBe(true);
  });

  it('非终结技行动也带技能名与行动总伤', () => {
    const frames = planFrames([{ ...event({ skillCode: 'jingyuan.skill', hitSeqs: [1] }), note: [] } as CombatEvent], [hit(1, { total: 555.9 })], {
      speed: 1,
      elementOf,
      labelOf: (e) => (e.skillCode ? '神君·太虚一炁' : undefined),
    });
    expect(frames[0]!.kind).toBe('ally');
    expect(frames[0]!.label).toBe('神君·太虚一炁');
    expect(frames[0]!.totalDamage).toBe(555);
  });

  it('暴击跳「暴击」、击破跳「击破」文字标签', () => {
    const critHit = hit(1, {
      factors: [
        { key: 'base', value: 1000 },
        { key: 'crit', value: 1.968 },
      ],
    });
    const plainHit = hit(2, {
      factors: [
        { key: 'base', value: 1000 },
        { key: 'crit', value: 1 },
      ],
    });
    const breakHit = hit(3, { kind: 'breakTrigger' });
    const frames = planFrames(
      [{ ...event({ hitSeqs: [1, 2, 3] }), note: [] } as CombatEvent],
      [critHit, plainHit, breakHit],
      { speed: 1, elementOf },
    );
    expect(frames[0]!.numbers[0]!.tag).toBe('crit');
    expect(frames[0]!.numbers[1]!.tag).toBeUndefined();
    expect(frames[0]!.numbers[2]!.tag).toBe('break');
  });

  it('终结技事件 → ult 帧并带标题', () => {
    const ev = { ...event({ kind: 'ult', hitSeqs: [1] }), note: [] } as CombatEvent;
    const frames = planFrames([ev], [hit(1)], {
      speed: 1,
      elementOf,
      labelOf: () => '神君·太虚一炁',
    });
    expect(frames[0]!.kind).toBe('ult');
    expect(frames[0]!.label).toBe('神君·太虚一炁');
    expect(frames[0]!.durationMs).toBe(BASE_ULT_MS);
  });

  it('DoT 走属性色、击破系走金黄、欢愉走彩虹渐变', () => {
    const kinds = ['dot', 'breakTrigger', 'superBreak', 'elation'] as const;
    const hits = kinds.map((k, i) => hit(i + 1, { kind: k }));
    const ev = { ...event({ hitSeqs: [1, 2, 3, 4] }), note: [] } as CombatEvent;
    const frames = planFrames([ev], hits, { speed: 1, elementOf });
    const nums = frames[0]!.numbers;
    // DoT 吃属性色（雷）
    expect(nums[0]!.color).toBe(POP_ELEMENT_COLORS.thunder);
    // 击破系金黄（录屏 t≈10.6s 取色）/ 超击破更橙
    expect(nums[1]!.color).toBe('#ffd24a');
    expect(nums[2]!.color).toBe('#ff9f43');
    // 欢愉 = 彩虹渐变（组件按 rainbow 渲染渐变而不是单色）
    expect(nums[3]!.rainbow).toBe(true);
    expect(nums.slice(0, 3).every((n) => !n.rainbow)).toBe(true);
    expect(isRainbowKind('elation')).toBe(true);
    expect(isRainbowKind('direct')).toBe(false);
  });

  it('敌方出手 → enemy 帧，飘字是我方掉血（红）', () => {
    const ev = {
      ...event({
        action: 'monster',
        unitId: 'monster2',
        skillCode: 'monster.100401101',
        enemyHits: [{ targetId: 'jingyuan', skillId: '100401101', damage: 999.9, blocked: 0, hpLoss: 999.9, dead: false }],
      }),
      note: [],
    } as CombatEvent;
    const frames = planFrames([ev], [], { speed: 1, elementOf });
    expect(frames).toHaveLength(1);
    expect(frames[0]!.kind).toBe('enemy');
    expect(frames[0]!.actor).toBe('monster2');
    expect(frames[0]!.targets).toEqual(['jingyuan']);
    expect(frames[0]!.numbers[0]!.value).toBe(999);
    expect(frames[0]!.durationMs).toBe(BASE_ENEMY_MS);
  });

  it('无命中段/轮次/胜利事件不出帧', () => {
    const frames = planFrames(
      [
        { ...event({ kind: 'round', unitId: '' }), note: [] } as CombatEvent,
        { ...event({ kind: 'victory' }), note: [] } as CombatEvent,
        { ...event({ hitSeqs: [] }), note: [] } as CombatEvent,
      ],
      [],
      { speed: 1, elementOf },
    );
    expect(frames).toHaveLength(0);
  });

  it('帧号跨批次单调递增（否则 React 复用 DOM、CSS 动画不重播）', () => {
    const a = planFrames([{ ...event({ hitSeqs: [1] }), note: [] } as CombatEvent], [hit(1)], {
      speed: 1,
      elementOf,
    });
    const b = planFrames([{ ...event({ hitSeqs: [2] }), note: [] } as CombatEvent], [hit(2)], {
      speed: 1,
      elementOf,
    });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(b[0]!.id).toBeGreaterThan(a[0]!.id);
  });

  it('framesDuration 累加各帧时长', () => {
    const ev = { ...event({ hitSeqs: [1] }), note: [] } as CombatEvent;
    const frames = planFrames([ev], [hit(1)], { speed: 1, elementOf });
    expect(framesDuration(frames)).toBe(frames.reduce((s, f) => s + f.durationMs, 0));
  });

  it('多段命中按倍速错开（第 n 段延迟 ≥ 前一段）', () => {
    const seqs = [1, 2, 3];
    const ev = { ...event({ hitSeqs: seqs }), note: [] } as CombatEvent;
    const frames = planFrames([ev], seqs.map((s) => hit(s)), { speed: 1, elementOf });
    const delays = frames[0]!.numbers.map((n) => n.delayMs);
    expect(delays[0]).toBe(0);
    for (let i = 1; i < delays.length; i += 1) expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
  });
});
