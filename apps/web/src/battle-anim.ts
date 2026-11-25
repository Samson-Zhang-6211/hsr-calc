/**
 * 战场攻击动画编排（2026-10-25 新增）
 *
 * 分工：本模块**只管把「引擎事件 + 命中段」翻译成动画帧**（纯函数，无 DOM、无 React 渲染），
 * 具体怎么画由 `battle-stage.tsx` 决定，时长与 keyframes 在 `styles.css`。
 *
 * 数据流：
 *   引擎事件批次（一个「回合组」，如 1 个 action + 若干跟放 ult）
 *     → planFrames(events, hits, { speed, elementOf, labelOf })
 *     → AnimFrame[]（每帧 = 一次出手 + 该次出手的逐段飘字）
 *     → useBattleAnim().play(frames) 逐帧吐给 battle-stage 播放
 *
 * 口径（2026-10-25 用户裁定）：
 *  - 动画时长 = 基础时长 ÷ 输出倍速（与 FullSimPage 的 BASE_GROUP_DELAY ÷ speed 同一条倍速），
 *    但设下限，避免 5× 时短到看不见；
 *  - 伤害飘字 = 引擎实际 total 取整（floor）+ 颜色：直伤/持续伤害按出手者属性色，
 *    击破系用金黄，**欢愉走彩虹渐变**，并在暴击/击破时于数字上方跳「暴击」/「击破」两个小字；
 *    真伤口径待用户给样例后再细化；
 *  - 敌方攻击我方也出帧（受击方抖动 + 护盾提示），否则数值代理页会出现「莫名掉血」。
 */

import type { DamageKind } from '@hsr-calc/shared';
import { SUMMON_OWNERS } from '@hsr-calc/engine';
import type { CombatEvent, HitLog } from '@hsr-calc/engine';

/**
 * 伤害飘字配色（2026-10-25 用户校正 + 实战录屏 BV1BBHx6ZEDJ 复核）。
 *
 * 口径：
 *  - **直伤 / 持续伤害 = 按属性上色**（`meta.element`）：物理=白、风=绿、火=橙红、冰=浅蓝、雷=紫、量子=靛紫、虚数=金黄。
 *    （此前「直伤一律白」是把「物理=白」错当成通用规则，已废。）
 *  - **击破 / 击破 DoT / 超击破 = 金黄系**，不吃属性色（录屏 t≈10.6s 的 30740 / 13946 实测金黄）。
 *  - **欢愉 = 彩虹渐变**（每个数字不同色相，录屏 t≈249s 实测；见 `isRainbowKind`）。
 *  - **真伤 = 近白**（待用户给样例再细化）。
 *
 * 这里的色值比 `theme.ts` 的 UI 元素色更亮：飘字要压在白/亮的爆炸背景上。
 */
export const POP_ELEMENT_COLORS: Readonly<Record<string, string>> = {
  physical: '#ffffff',
  fire: '#ff8a4d',
  ice: '#8fd6ff',
  thunder: '#c07bf0',
  wind: '#57e0a0',
  quantum: '#8b7bff',
  imaginary: '#f7e05c',
};

/**
 * 无生命/不进 `SUMMON_OWNERS` 的行动条召唤物 → 主人。
 * 引擎的 `SUMMON_OWNERS` 只登记有 HP 的召唤物（BattleStatus.summons 用），
 * 账账（topazNumby）只是独立行动条实体，前端配色/立绘仍要归主人。
 */
export const EXTRA_SUMMON_OWNERS: Readonly<Record<string, string>> = {
  topazNumby: 'topaz',
};

/** 出手者 → 装备/属性归属者（召唤物一律归主人；非召唤物原样返回） */
export function ownerOfSource(source: string): string {
  return (
    SUMMON_OWNERS.find((s) => s.id === source)?.owner ??
    EXTRA_SUMMON_OWNERS[source] ??
    source
  );
}

/** 非属性类伤害的固定色（键 = DamageKind） */
export const DAMAGE_KIND_COLORS: Readonly<Record<string, string>> = {
  breakTrigger: '#ffd24a',
  breakDot: '#ffd24a',
  superBreak: '#ff9f43',
  trueDamage: '#f4f0ff',
};

/** 欢愉伤害走彩虹渐变（不是单色） */
export function isRainbowKind(kind: DamageKind): boolean {
  return kind === 'elation';
}

/** 飘字颜色：击破系/真伤用固定色，欢愉给白做渐变兜底，其余按属性色 */
export function damageColor(kind: DamageKind, element: string | undefined): string {
  if (isRainbowKind(kind)) return '#ffffff';
  const fixed = DAMAGE_KIND_COLORS[kind];
  if (fixed) return fixed;
  return POP_ELEMENT_COLORS[String(element ?? '').toLowerCase()] ?? '#ffffff';
}

/** 飘字层级：主伤害（大号）/ 散射·次级（小号）——实测主伤害字号约为次级的 2.5 倍 */
export type PopTier = 'main' | 'sub';

/** 飘字上方的文字标签：暴击 / 击破（游戏里就是两个字，白字小号） */
export type PopTag = 'crit' | 'break';

/** 一个飘字 */
export interface AnimNumber {
  /** 受击目标（monster1..3 / enemy1..4 / 我方成员 id） */
  target: string;
  /** 显示值（已取整） */
  value: number;
  color: string;
  /** 同一次出手内多段命中的错开延迟（ms，已含「先挨打再冒字」的冲击延迟） */
  delayMs: number;
  /** 字号档位：主伤害 / 次级（再乘 sizeScale 才是最终字号） */
  tier: PopTier;
  /**
   * 字号倍率（2026-11-07 飙字批）：按本帧最大伤害连续分级，暴击/击破/末段另加成。
   * 组件把它注入 `--pop-scale`，CSS 用 `calc(30px * var(--pop-scale))` 落到字号上。
   */
  sizeScale: number;
  /** 自身旋转角度（出生时的倾斜，动画里会回正；-9°~+9°） */
  angleDeg: number;
  /** 横向错开（px，同目标多段左右交替散开） */
  offsetX: number;
  /** 纵向错开（px，多段时依次往上摊开） */
  offsetY: number;
  /** 本条飘字的存活时长（ms；段数多时缩短，避免压到下一个动作） */
  lifetimeMs: number;
  /** 上方文字标签（暴击/击破）；undefined = 不显示 */
  tag?: PopTag;
  /** 彩虹渐变字（欢愉伤害） */
  rainbow: boolean;
  /** 合并段数（>1 时显示「×N」；同目标超出 MAX_POPS_PER_TARGET 的部分合并成一条） */
  multi?: number;
}

/** 一帧动画 = 一次出手 */
export interface AnimFrame {
  /** 自增 id：作为 React key 强制重播同一条 keyframes */
  id: number;
  /** ally=我方（含召唤物）出手 / enemy=敌方出手 / ult=我方终结技（额外演出） */
  kind: 'ally' | 'enemy' | 'ult';
  /** 出手者 id（我方 CharId / 召唤物 id / monster1..3）；null = 未知 */
  actor: string | null;
  /** 受击目标 id 列表 */
  targets: string[];
  numbers: AnimNumber[];
  /** 本帧总时长（ms，已按倍速缩放） */
  durationMs: number;
  /** 本动作伤害合计（飘字之和；中心面板「本行动伤害」用） */
  totalDamage: number;
  /** 技能名（所有行动都有；由调用方用 i18n 取名）。ult 帧走全屏演出，其余走顶部小条 */
  label?: string;
  /** 终结技立绘用的 rosterId（左侧切立绘） */
  portrait?: string;
}

/**
 * 基础时长（ms @1×）——2026-10-26 用户裁定「固定节奏」：
 * 普攻/战技 1.0s、终结技 2.4s，再整体除以输出倍速。
 */
export const BASE_ATTACK_MS = 1000;
export const BASE_ENEMY_MS = 1000;
export const BASE_ULT_MS = 2400;
/**
 * 段间错开（ms @1×）——2026-11-07 飙字批改成「连段节奏」：
 * 第 1 段 0、第 2 段 110、第 3 段 220，之后每段再 ×0.92（越打越快，像连击而不是节拍器）。
 * `BASE_HIT_GAP_MS` 保留为「首段的段间间隔」，外部只读这一个数时行为不变。
 */
export const BASE_HIT_GAP_MS = 110;
/** 匀速段的段数（前 2 段）：第 index 段 = BASE_HIT_GAP_MS × index */
export const HIT_GAP_LINEAR_UNTIL = 2;
/** 第 3 段起的递减系数 */
export const HIT_GAP_DECAY = 0.92;
/** 倍速下限：再快也要看得见一眼（ms） */
export const MIN_FRAME_MS = 320;

/** 同一目标最多同时几条飘字；超出合并成一条「×N」 */
export const MAX_POPS_PER_TARGET = 4;
/** 同一目标内多条飘字的纵向排开步长（px） */
export const STACK_STEP_PX = 22;
/** 同目标多段飘字的横向交替散开：基础 10px + 每段 4px（左右交替） */
export const SPREAD_BASE_PX = 10;
export const SPREAD_STEP_PX = 4;
/** 「先挨打、再冒字」：数字比受击闪光晚 45ms 出现（打击感先后） */
export const IMPACT_DELAY_MS = 45;

/** 按倍速缩放并夹下限（只用于「帧时长」，不要用于段间错开） */
export function scaleMs(base: number, speed: number): number {
  const s = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return Math.max(MIN_FRAME_MS, Math.round(base / s));
}

/**
 * 同一次出手内第 index 段的错开延迟（不夹下限，否则前几段会挤成 0）。
 * 前 3 段等距 110ms，之后每段 ×0.92 —— 多段技能的飘字是「越打越快」。
 */
export function hitGapMs(index: number, speed: number): number {
  const s = Number.isFinite(speed) && speed > 0 ? speed : 1;
  let acc = 0;
  let step = BASE_HIT_GAP_MS;
  for (let i = 1; i <= index; i += 1) {
    if (i > HIT_GAP_LINEAR_UNTIL) step *= HIT_GAP_DECAY;
    acc += step;
  }
  return Math.round(acc / s);
}

/** 出手者 id → 元素（用于直伤飘字配色）；未知返回 undefined */
export type ElementOf = (source: string) => string | undefined;
/** 事件 → 技能名（i18n 由调用方处理）；所有行动都会显示，返回 undefined 则不显示 */
export type LabelOf = (event: CombatEvent) => string | undefined;
/** 出手者 id → 立绘 rosterId（终结技左侧切立绘用）；未知返回 undefined */
export type PortraitOf = (actor: string) => string | undefined;

export interface PlanOptions {
  /** 输出倍速（0.5 … 5） */
  speed: number;
  elementOf: ElementOf;
  labelOf?: LabelOf;
  portraitOf?: PortraitOf;
  /** 起始 id（多批次连播时保证 key 单调） */
  fromId?: number;
}

const isEnemyUnit = (id: string): boolean => /^enemy\d$/.test(id);
const isMonsterSlot = (id: string): boolean => /^monster[123]$/.test(id);

/** 飘字存活时长（ms @1×）——单段动作留久一点；多段动作缩短，避免压到下一个动作 */
export const POP_LIFETIME_MS = 1400;
/** 4 段以上动作的存活时长（ms） */
export const POP_LIFETIME_DENSE_MS = 1150;

/** 按本次出手的段数取存活时长 */
export function popLifetimeMs(segments: number): number {
  return segments >= 4 ? POP_LIFETIME_DENSE_MS : POP_LIFETIME_MS;
}

/**
 * 字号连续分级（2026-11-07 用户裁定「按伤害大小连续分级」）：
 * 以本帧最大伤害为 1.0，用 √ 曲线拉开差距——0.1 倍伤害 ≈ 0.86、1 倍 = 1.0；
 * 暴击 ×1.08、击破 ×1.12、本帧最后一段 ×1.10，夹在 [0.72, 1.55]。
 */
export function popSizeScale(
  value: number,
  max: number,
  opts: { crit?: boolean; break?: boolean; final?: boolean } = {},
): number {
  const ratio = max > 0 ? Math.min(1, Math.max(value, 1) / max) : 1;
  let s = 0.8 + 0.2 * Math.sqrt(ratio);
  if (opts.crit) s *= 1.08;
  if (opts.break) s *= 1.12;
  if (opts.final) s *= 1.1;
  return Math.round(Math.min(1.55, Math.max(0.72, s)) * 1000) / 1000;
}

/** 确定性伪随机（0~1）：同一个 seq 永远得到同一个角度/偏移，重播时不会抖动 */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 命中段是否吃暴击：crit 因子 = 1 + 暴率×暴伤（期望值口径） */
function isCrit(h: HitLog): boolean {
  const f = h.factors.find((x) => x.key === 'crit');
  return !!f && f.value > 1.0001;
}

/** 击破系伤害（游戏里会跳「击破」两个字） */
const BREAK_KINDS = new Set<string>(['breakTrigger', 'breakDot', 'superBreak']);

/** 命中段 → 上方文字标签：击破优先于暴击（击破不吃双暴，两者不会同时出现） */
function tagOf(h: HitLog): PopTag | undefined {
  if (BREAK_KINDS.has(h.kind)) return 'break';
  if (isCrit(h)) return 'crit';
  return undefined;
}

/**
 * 命中段 → 飘字（散开 + 连段错开 + 超量合并 + 字号分级）。
 *
 * 2026-10-26 用户裁定：同一目标的多条伤害不能挤成一坨 → 纵向排开 + 依次弹出。
 * 2026-11-07 飙字批（用户裁定「按伤害大小连续分级 / 左右交替散开」）在此基础上：
 *  - **横向左右交替**散开（±(10 + slot×4)px），配合纵向 22px 步长，读起来像连击而不是列表；
 *  - **字号连续分级**：本帧最大伤害 = 1.0，暴击/击破/末段另加成（`popSizeScale`）；
 *  - **连段节奏**：前 3 段 110ms 等距，之后每段 ×0.92（越打越快，见 `hitGapMs`）；
 *  - **先挨打再冒字**：统一 +`IMPACT_DELAY_MS`；
 *  - **角度回正**：出生时 ±9° 倾斜，动画里 14% 处回正；
 *  - **存活按时长收缩**：段数 ≥4 时 1150ms（`popLifetimeMs`），不再压到下一动作。
 * 同一目标超过 MAX_POPS_PER_TARGET 条时，超出的部分合并进最后一条并标 `multi`（×N）。
 */
function numbersOf(
  hits: readonly HitLog[],
  elementOf: ElementOf,
  speed: number,
): AnimNumber[] {
  const out: AnimNumber[] = [];
  const maxValue = Math.max(1, ...hits.map((h) => Math.floor(h.total)));
  const lifetimeMs = popLifetimeMs(hits.length);
  const lastIdx = hits.length - 1;
  const slotByTarget = new Map<string, number>();
  const overflow = new Map<string, { value: number; count: number }>();
  for (let i = 0; i < hits.length; i += 1) {
    const h = hits[i]!;
    const target = h.target ?? 'monster2';
    const slot = slotByTarget.get(target) ?? 0;
    slotByTarget.set(target, slot + 1);
    if (slot >= MAX_POPS_PER_TARGET) {
      const agg = overflow.get(target) ?? { value: 0, count: 0 };
      agg.value += h.total;
      agg.count += 1;
      overflow.set(target, agg);
      continue;
    }
    const seed = h.seq + slot * 7.3;
    const value = Math.floor(h.total);
    const tag = tagOf(h);
    // 左右交替：偶数段偏左、奇数段偏右，段数越多散得越开（外加 ±3px 抖动避免完全对称）
    const dir = slot % 2 === 0 ? -1 : 1;
    out.push({
      target,
      value,
      color: damageColor(h.kind, elementOf(h.source)),
      delayMs: IMPACT_DELAY_MS + hitGapMs(slot, speed),
      tier: slot === 0 ? 'main' : 'sub',
      sizeScale: popSizeScale(value, maxValue, {
        crit: tag === 'crit',
        break: tag === 'break',
        final: i === lastIdx,
      }),
      angleDeg: Math.round((hash01(seed + 11) - 0.5) * 18),
      offsetX: dir * (SPREAD_BASE_PX + slot * SPREAD_STEP_PX) + Math.round((hash01(seed) - 0.5) * 6),
      offsetY: slot === 0 ? 0 : -slot * STACK_STEP_PX,
      lifetimeMs,
      tag,
      rainbow: isRainbowKind(h.kind),
    });
  }
  // 超量合并进该目标的最后一条
  for (const [target, agg] of overflow) {
    let last = -1;
    for (let i = 0; i < out.length; i += 1) if (out[i]!.target === target) last = i;
    if (last < 0) continue;
    const base = out[last]!;
    out[last] = { ...base, value: base.value + Math.floor(agg.value), multi: (base.multi ?? 1) + agg.count };
  }
  return out;
}

/**
 * 全局帧号游标：跨批次单调递增。
 * 为什么不用「每次从 1 开始」：`AnimFrame.id` 同时是 React key 与动画重播开关
 * （`battle-stage.tsx` 按 id 奇偶在 `*-alt` 类之间切换），复用同一个 id 会让 React 复用 DOM、
 * CSS 动画不重启 → 第二组同样的攻击就不播了。
 */
let frameSeq = 1;

/**
 * 事件批次 → 动画帧序列。
 *
 * 帧来源（三类，顺序即播放顺序）：
 *  1. 我方出手事件（action/ult，带 hitSeqs）→ `ally`/`ult` 帧；
 *     **阿哈时刻（unitId='ahaMoment'）按欢愉技拆成多帧**（用户裁定：视作多个行动）；
 *  2. 敌方出手事件（action + action:'monster'）→ `enemy` 帧，飘字取 event.enemyHits（我方掉血）；
 *  3. 其余事件（round/victory/wave/break）不出帧。
 *
 * 每一帧都带 `totalDamage`（中心面板「本行动伤害」）与 `label`（技能名，所有行动都有）。
 * 同一批里「本次行动顺带触发的敌方受击」不单独出帧——它们已经在 hitSeqs 里。
 */
export function planFrames(
  events: readonly CombatEvent[],
  hits: readonly HitLog[],
  opts: PlanOptions,
): AnimFrame[] {
  const { speed, elementOf, labelOf, portraitOf, fromId } = opts;
  const hitBySeq = new Map(hits.map((h) => [h.seq, h] as const));
  const frames: AnimFrame[] = [];
  let id = fromId ?? frameSeq;

  const sumOf = (nums: readonly AnimNumber[]): number => nums.reduce((s, n) => s + n.value, 0);

  const push = (frame: Omit<AnimFrame, 'id' | 'totalDamage'>): void => {
    frames.push({ ...frame, id: id++, totalDamage: sumOf(frame.numbers) });
  };

  for (const ev of events) {
    // ── 敌方出手（怪物反击/召唤物攻击）/ 我方持续伤害结算 / 被支配强制攻击：我方受击 ──
    if (
      ev.kind === 'action' &&
      (ev.action === 'monster' || ev.action === 'dot' || ev.action === 'dominate')
    ) {
      const enemyHits = ev.enemyHits ?? [];
      if (enemyHits.length === 0) continue;
      // 只有敌方单位出手才让立绘前冲；DoT 跳伤与被支配者攻击我方都不前冲
      const actor =
        ev.action === 'monster' && (isMonsterSlot(ev.unitId) || isEnemyUnit(ev.unitId))
          ? ev.unitId
          : null;
      const label = labelOf?.(ev);
      const enemyMax = Math.max(1, ...enemyHits.map((h) => Math.floor(h.damage)));
      const enemyLife = popLifetimeMs(enemyHits.length);
      push({
        kind: 'enemy',
        actor,
        targets: enemyHits.map((h) => h.targetId),
        numbers: enemyHits.map((h, i) => ({
          target: h.targetId,
          value: Math.floor(h.damage),
          // 我方受击：警示红
          color: '#ff5b5b',
          delayMs: IMPACT_DELAY_MS + hitGapMs(i, speed),
          tier: i === 0 ? 'main' : 'sub',
          sizeScale: popSizeScale(Math.floor(h.damage), enemyMax, { final: i === enemyHits.length - 1 }),
          angleDeg: Math.round((hash01(h.targetId.length + i * 13.7) - 0.5) * 18),
          offsetX: (i % 2 === 0 ? -1 : 1) * (SPREAD_BASE_PX + i * SPREAD_STEP_PX),
          offsetY: i === 0 ? 0 : -i * STACK_STEP_PX,
          lifetimeMs: enemyLife,
          tag: undefined,
          rainbow: false,
        })),
        durationMs: scaleMs(BASE_ENEMY_MS, speed),
        ...(label ? { label } : {}),
      });
      continue;
    }

    // ── 我方出手：普攻/战技/终结技/追加攻击/DoT 跳伤/召唤物 ──
    if (ev.kind !== 'action' && ev.kind !== 'ult') continue;
    const seqs = ev.hitSeqs ?? [];
    if (seqs.length === 0) continue;
    const hs = seqs.map((s) => hitBySeq.get(s)).filter((h): h is HitLog => h !== undefined);
    if (hs.length === 0) continue;

    // ── 阿哈时刻：引擎把全队欢愉技合并进一个事件，这里按「施放者」拆成多帧 ──
    if (ev.unitId === 'ahaMoment') {
      const groups = new Map<string, HitLog[]>();
      for (const h of hs) {
        const key = h.source || ev.unitId;
        const list = groups.get(key);
        if (list) list.push(h);
        else groups.set(key, [h]);
      }
      for (const [source, group] of groups) {
        const code = group[0]?.skillCode;
        const pseudo = { ...ev, unitId: source, ...(code ? { skillCode: code } : {}) } as CombatEvent;
        const label = labelOf?.(pseudo);
        const portrait = portraitOf?.(source);
        push({
          kind: 'ally',
          actor: source,
          targets: [...new Set(group.map((h) => h.target ?? 'monster2'))],
          numbers: numbersOf(group, elementOf, speed),
          durationMs: scaleMs(BASE_ATTACK_MS, speed),
          ...(label ? { label } : {}),
          ...(portrait ? { portrait } : {}),
        });
      }
      continue;
    }

    const isUlt = ev.kind === 'ult';
    const label = labelOf?.(ev);
    const portrait = isUlt && ev.unitId ? portraitOf?.(ev.unitId) : undefined;
    push({
      kind: isUlt ? 'ult' : 'ally',
      actor: ev.unitId,
      targets: [...new Set(hs.map((h) => h.target ?? 'monster2'))],
      numbers: numbersOf(hs, elementOf, speed),
      durationMs: scaleMs(isUlt ? BASE_ULT_MS : BASE_ATTACK_MS, speed),
      ...(label ? { label } : {}),
      ...(portrait ? { portrait } : {}),
    });
  }

  // 推进全局游标：下个批次从下一个 id 开始（保证跨批次单调递增，见 frameSeq 注释）
  frameSeq = Math.max(frameSeq, id);
  return frames;
}

/** 帧序列总时长（ms）——调用方据此判断能否挤进组间隙 */
export function framesDuration(frames: readonly AnimFrame[]): number {
  return frames.reduce((s, f) => s + f.durationMs, 0);
}