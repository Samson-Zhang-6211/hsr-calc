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
  /** 同一次出手内多段命中的错开延迟（ms） */
  delayMs: number;
  /** 字号档位（实测：主伤害大、散射小） */
  tier: PopTier;
  /** 自身旋转角度（实测每个数字都带轻微倾斜，-8°~+8°） */
  angleDeg: number;
  /** 横向错开（px，避免多个数字叠在同一像素；实测同帧数字是「一簇」错开的） */
  offsetX: number;
  /** 纵向错开（px，多段时依次往上摊开） */
  offsetY: number;
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
 * 普攻/战技 1.0s、终结技 2.4s、每段命中 +160ms，再整体除以输出倍速。
 */
export const BASE_ATTACK_MS = 1000;
export const BASE_ENEMY_MS = 1000;
export const BASE_ULT_MS = 2400;
/** 多段命中的错开间隔（ms @1×） */
export const BASE_HIT_GAP_MS = 160;
/** 倍速下限：再快也要看得见一眼（ms） */
export const MIN_FRAME_MS = 320;

/** 同一目标最多同时几条飘字；超出合并成一条「×N」 */
export const MAX_POPS_PER_TARGET = 4;
/** 同一目标内多条飘字的纵向排开步长（px） */
export const STACK_STEP_PX = 26;

/** 按倍速缩放并夹下限（只用于「帧时长」，不要用于段间错开） */
export function scaleMs(base: number, speed: number): number {
  const s = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return Math.max(MIN_FRAME_MS, Math.round(base / s));
}

/** 同一次出手内第 index 段的错开延迟（不夹下限，否则前几段会挤成 0） */
export function hitGapMs(index: number, speed: number): number {
  const s = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return Math.round((BASE_HIT_GAP_MS * index) / s);
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

/** 飘字存活时长（ms @1×）——2026-10-26 用户裁定「太快」：从 1000 提到 1600 */
export const POP_LIFETIME_MS = 1600;

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
 * 命中段 → 飘字（纵向排开 + 时间错开 + 超量合并）。
 *
 * 2026-10-26 用户裁定（原「同帧成簇」被打回：一跳一大片根本看不清）：
 *  - 同一目标的多条伤害**纵向排开**（每段间隔 STACK_STEP_PX），不再挤在同一像素；
 *  - 段间用 BASE_HIT_GAP_MS（160ms）**依次弹出**，而不是齐刷刷同时出现；
 *  - 同一目标超过 MAX_POPS_PER_TARGET 条时，超出的部分**合并进最后一条**并标 `multi`（显示 ×N）；
 *  - `tier`：该目标第一条走大号（main），其余小号（sub）。
 */
function numbersOf(
  hits: readonly HitLog[],
  elementOf: ElementOf,
  speed: number,
): AnimNumber[] {
  const out: AnimNumber[] = [];
  const slotByTarget = new Map<string, number>();
  const overflow = new Map<string, { value: number; count: number }>();
  for (const h of hits) {
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
    out.push({
      target,
      value: Math.floor(h.total),
      color: damageColor(h.kind, elementOf(h.source)),
      delayMs: hitGapMs(slot, speed),
      tier: slot === 0 ? 'main' : 'sub',
      angleDeg: Math.round((hash01(seed + 11) - 0.5) * 16),
      offsetX: Math.round((hash01(seed) - 0.5) * 16),
      offsetY: slot === 0 ? 0 : -slot * STACK_STEP_PX,
      tag: tagOf(h),
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
      push({
        kind: 'enemy',
        actor,
        targets: enemyHits.map((h) => h.targetId),
        numbers: enemyHits.map((h, i) => ({
          target: h.targetId,
          value: Math.floor(h.damage),
          // 我方受击：警示红
          color: '#ff5b5b',
          delayMs: hitGapMs(i, speed),
          tier: i === 0 ? 'main' : 'sub',
          angleDeg: Math.round((hash01(h.targetId.length + i * 13.7) - 0.5) * 14),
          offsetX: Math.round((hash01(i * 3.1 + 5) - 0.5) * 16),
          offsetY: i === 0 ? 0 : -i * STACK_STEP_PX,
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