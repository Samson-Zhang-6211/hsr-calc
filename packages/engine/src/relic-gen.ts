import { createRng } from './rng.js';

/**
 * 新版遗器方案：5星 +15 成品遗器副词条随机生成（2026-10-08 与用户逐条确认）。
 *
 * - 只做 5 星 +15；主词条不变（手选 + mainAffixValue 固定值），本模块只生成副词条。
 * - 副词条池 = 12 词条 − 主词条（调用方传入，要求 ≥4 条且 property 互异）。
 * - 3 词条遗器：初始 3 条（各从三档等概率取初始值）→ 随机补第 4 条（同样随机档）
 *   → 强化 4 次；4 词条遗器：初始 4 条 → 强化 5 次。
 *   （只模拟 +15 成品，故二者区别 = 强化 4 次 vs 5 次。）
 * - 每次强化：4 条中等概率抽 1 条，从该词条三档等概率抽一档累加。
 * - 三档 = base / base+step / base+2×step（data/relic-affixes/sub.json rarity 5，
 *   即用户表格局部第一列的精确值；表格显示值为四舍五入）。
 * - 全部随机选择等概率（用户裁定，游戏内档位权重待核）。
 * - 种子化：同 seed 同参数 → 同结果（web 侧按部位派生 seed，可复现整套）。
 */
export interface RelicAffix {
  property: string;
  base: number;
  step: number;
}

export interface GeneratedRelicSub {
  property: string;
  /** 初始 + 各次强化命中的档位（0/1/2；值 = base + step × 档），长度 = rolls */
  tiers: number[];
  /** 精确总值 = Σ(base + step × 档)，不取整 */
  value: number;
  /** roll 次数 = 初始 1 + 强化命中次数（1..6） */
  rolls: number;
}

export interface RelicGenOptions {
  /** 可选副词条池（已排除主词条），至少 4 条且 property 互异 */
  subPool: readonly RelicAffix[];
  /** 初始词条数：3（补第 4 条后强化 4 次）或 4（强化 5 次） */
  subCount: 3 | 4;
  /** 随机种子（uint32；同种子同结果） */
  seed: number;
}

export interface RelicGenResult {
  /** 成品副词条，恒 4 条（顺序 = 初始顺序，补的第 4 条在末尾） */
  subs: GeneratedRelicSub[];
  /** 强化次数（3 词条 → 4，4 词条 → 5） */
  enhancementHits: number;
  /** 总 roll 数（3 词条 → 8，4 词条 → 9） */
  totalRolls: number;
}

const TIER_COUNT = 3;

export function generateRelicSubstats(opts: RelicGenOptions): RelicGenResult {
  const { subCount, seed } = opts;
  if (subCount !== 3 && subCount !== 4) {
    throw new Error(`subCount 必须为 3 或 4，收到 ${String(subCount)}`);
  }
  const distinct = new Set(opts.subPool.map((a) => a.property));
  if (distinct.size < 4) {
    throw new Error(`subPool 需至少 4 条互异词条，收到 ${distinct.size} 条`);
  }

  const rand = createRng(seed);
  const pick = (n: number): number => Math.floor(rand() * n);
  const rollTier = (): number => pick(TIER_COUNT);

  // 等概率取一条未用词条（拒绝采样；池小、期望次数 <2）
  const pool = [...opts.subPool];
  const used = new Set<string>();
  const takeOne = (): RelicAffix => {
    for (;;) {
      const affix = pool[pick(pool.length)];
      if (!used.has(affix.property)) {
        used.add(affix.property);
        return affix;
      }
    }
  };

  interface Work {
    affix: RelicAffix;
    tiers: number[];
  }

  const work: Work[] = [];
  for (let i = 0; i < subCount; i++) {
    work.push({ affix: takeOne(), tiers: [rollTier()] });
  }
  if (subCount === 3) {
    // 3 词条遗器 +3 时随机补第 4 条（初始档同样随机），之后才开始强化
    work.push({ affix: takeOne(), tiers: [rollTier()] });
  }

  const enhancementHits = subCount === 3 ? 4 : 5;
  for (let i = 0; i < enhancementHits; i++) {
    const target = work[pick(work.length)];
    target.tiers.push(rollTier());
  }

  const subs: GeneratedRelicSub[] = work.map((w) => ({
    property: w.affix.property,
    tiers: w.tiers,
    rolls: w.tiers.length,
    value: w.tiers.reduce((sum, tier) => sum + w.affix.base + w.affix.step * tier, 0),
  }));

  return {
    subs,
    enhancementHits,
    totalRolls: subs.reduce((sum, s) => sum + s.rolls, 0),
  };
}

// ---------------------------------------------------------------------------
// 按档分配（A/S/SS/SSS 有效词条套装，2026-10-08 用户裁定）
//
// 口径（五项裁定）：
// - 目标 = 全套 6 件「落在有效词条上的 roll 总次数」（初始每条 1、3 词条补的
//   第 4 条 1、每次强化命中 1），floor(满配 × 档位比例)。
// - 满配（6 件口径）：2/3/4 有效 = 40/46/52；有效数 5+ 按 4 算、<2 抛错。
// - 档位比例：A=0.6 / S=0.7 / SS=0.8 / SSS=0.9，非整数向下取整。
// - 每件初始词条数 3/4 随机决定；若随机后可行性不足（Σ件上限 < 目标）则
//   逐件把 3 翻成 4（随机顺序）直到凑得齐。
// - 件间随机拆分（总和精确 = 目标、每件 ≤ 上限）；逐件构造有效词条并用
//   强化命中凑够件目标；主词条占用有效词条的部位自然少 1 条可用。
// - 全部随机选择走种子化 PRNG（同 seed 同参数 → 同结果）。
// - subPools 恒 6 件（头+手+球+绳+衣+鞋，各自已排除主词条、≥4 条互异）。
// */

export type RelicTier = 'A' | 'S' | 'SS' | 'SSS';

const TIER_RATIO: Record<RelicTier, number> = { A: 0.6, S: 0.7, SS: 0.8, SSS: 0.9 };
/** 满配有效 roll 数（6 件口径）：2/3/4 有效 = 40/46/52（5+ 有效按 4 算） */
const FULL_ROLLS: Record<2 | 3 | 4, number> = { 2: 40, 3: 46, 4: 52 };

/** 目标有效 roll 数 = floor(满配 × 档位比例)；有效数 <2 抛错、5+ 按 4 算 */
export function effectiveRollTarget(effectiveCount: number, tier: RelicTier): number {
  const n = Math.min(effectiveCount, 4);
  if (n < 2) throw new Error(`有效词条数至少为 2，收到 ${effectiveCount}`);
  return Math.floor(FULL_ROLLS[n as 2 | 3 | 4] * TIER_RATIO[tier]);
}

export interface CritCap {
  /** 受限词条 property（通常是 CriticalChanceBase） */
  property: string;
  /** 全套 6 件该词条 roll 总数上限（调用方 = floor(爆率预算/最坏档 0.0324)，可为 0） */
  maxRolls: number;
  /** 60% 检查阈值 = 0.6 × maxRolls × 0.0324（实际 crit 值低于它 → 换种子从头重 roll） */
  minValue: number;
}

export interface AllocateEffectiveOptions {
  /** 逐件副词条池（恒 6 件，各自已排除主词条、≥4 条互异） */
  subPools: readonly (readonly RelicAffix[])[];
  /** 有效词条 property 列表（≥2；满配按 min(长度,4) 取表） */
  effective: readonly string[];
  tier: RelicTier;
  /** 随机种子（uint32；同种子同结果） */
  seed: number;
  /**
   * 逐词条权重（1/3/5，2026-10-08 用户逐批批准）：三处加权——
   * 件间拆分（按件内有效权重和偏置）、件内选词条（加权无放回）、强化押注（加权）。
   * 缺省 = 不加权（原等概率，行为零回归）；未列出的 property 权重按 1。
   */
  weights?: Readonly<Record<string, number>>;
  /**
   * 爆率上限（可选，方案B 2026-10-08 裁定）：该词条作普通词条按权重参与抽选，
   * 全局 roll 额度只截断不保底（额度耗尽后出局让位）；分配后 crit 实际总值
   * < minValue → 用 seed+尝试次数 从头重 roll（≤50 次，仍不达标取最后一次标 warning）。
   */
  critCap?: CritCap;
}

export interface AllocatedRelicSet {
  /** 逐件成品副词条（结构同 RelicGenResult.subs，恒 4 条） */
  pieces: GeneratedRelicSub[][];
  /** 逐件初始词条数（随机决定 + 可行性修正后，恒 6 项） */
  subCounts: (3 | 4)[];
  /** 目标有效 roll 总数 */
  target: number;
  /** 实际有效 roll 总数（正常恒 = target；爆率额度极端截断时可能更小） */
  actual: number;
  /** crit 属性实际总值 = Σ(roll 值)（仅传 critCap 时给出） */
  critValue?: number;
  /** 达标所用尝试次数 1..50（仅传 critCap 时给出） */
  attempts?: number;
  /** 60% 检查 50 次仍未达标（仅传 critCap 时可能） */
  critWarning?: boolean;
}

/** 60% 贡献值检查的最大重 roll 次数 */
const CRIT_MAX_ATTEMPTS = 50;

const PIECE_COUNT = 6;

function shuffled<T>(arr: readonly T[], rand: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/** 分配上下文：权重加权 + 爆率额度（二者皆无时 ctx=undefined，走原等概率路径） */
interface AllocCtx {
  weightOf(p: string): number;
  weighted: boolean;
  /** 词条当前可否被选/押（爆率额度耗尽后 crit 出局） */
  available(p: string): boolean;
  /** 选中/押注一次记账（仅 gated 时扣额度） */
  consume(p: string): void;
}

/** 加权单选（P ∝ weight；权重全相等时同分布于均匀） */
function weightedPickOne<T>(items: readonly T[], wOf: (t: T) => number, rand: () => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, wOf(it));
  let x = rand() * total;
  for (const it of items) {
    x -= Math.max(0, wOf(it));
    if (x < 0) return it;
  }
  return items[items.length - 1];
}

/** 加权无放回取 n 条 */
function weightedSample<T>(
  items: readonly T[],
  n: number,
  wOf: (t: T) => number,
  rand: () => number,
): T[] {
  const rest = [...items];
  const out: T[] = [];
  for (let i = 0; i < n && rest.length > 0; i++) {
    const chosen = weightedPickOne(rest, wOf, rand);
    out.push(chosen);
    rest.splice(rest.indexOf(chosen), 1);
  }
  return out;
}

export function allocateEffectiveRelicSubs(opts: AllocateEffectiveOptions): AllocatedRelicSet {
  const crit = opts.critCap;
  if (!crit) return allocateOnce(opts);
  if (!Number.isFinite(crit.maxRolls) || crit.maxRolls < 0) {
    throw new Error(`critCap.maxRolls 需为有限非负数，收到 ${crit.maxRolls}`);
  }
  if (!Number.isFinite(crit.minValue) || crit.minValue < 0) {
    throw new Error(`critCap.minValue 需为有限非负数，收到 ${crit.minValue}`);
  }
  let last = allocateOnce({ ...opts, seed: opts.seed });
  if ((last.critValue ?? 0) >= crit.minValue) {
    return { ...last, attempts: 1, critWarning: false };
  }
  for (let attempt = 1; attempt < CRIT_MAX_ATTEMPTS; attempt++) {
    last = allocateOnce({ ...opts, seed: opts.seed + attempt });
    if ((last.critValue ?? 0) >= crit.minValue) {
      return { ...last, attempts: attempt + 1, critWarning: false };
    }
  }
  return { ...last, attempts: CRIT_MAX_ATTEMPTS, critWarning: true };
}

/** 单次分配（重 roll 循环的内层；不传 critCap/weights 时与原实现行为完全一致） */
function allocateOnce(opts: AllocateEffectiveOptions): AllocatedRelicSet {
  const { subPools, effective, tier, seed } = opts;
  if (subPools.length !== PIECE_COUNT) {
    throw new Error(`subPools 需 6 件（头+手+球+绳+衣+鞋），收到 ${subPools.length} 件`);
  }
  const target = effectiveRollTarget(effective.length, tier);
  const effSet = new Set(effective);

  const rand = createRng(seed);
  const pick = (n: number): number => Math.floor(rand() * n);

  // 权重/爆率上下文：两者皆未传 → ctx 为 undefined，选择路径与原实现逐点一致
  const weightOf = (p: string): number => opts.weights?.[p] ?? 1;
  const gated = opts.critCap !== undefined;
  const weighted = opts.weights !== undefined;
  const critProp = opts.critCap?.property;
  const critState = { rem: opts.critCap?.maxRolls ?? Number.POSITIVE_INFINITY };
  const ctx: AllocCtx | undefined =
    gated || weighted
      ? {
          weightOf,
          weighted,
          available: (p) => !gated || p !== critProp || critState.rem > 0,
          consume: (p) => {
            if (gated && p === critProp) critState.rem -= 1;
          },
        }
      : undefined;

  // 逐件校验池，并算「池中可用有效词条数」（主词条占用有效词条的部位自然 -1）；
  // critCap.maxRolls = 0 时 crit 恒不可用 → 可行性/拆分按扣除后的 cap 计（免回填兜底）
  const critDead = critProp !== undefined && critState.rem <= 0;
  const effInPool = subPools.map((pool, i) => {
    const distinct = new Set(pool.map((a) => a.property));
    if (distinct.size < 4) {
      throw new Error(`第 ${i + 1} 件 subPool 需至少 4 条互异词条，收到 ${distinct.size} 条`);
    }
    return pool.filter((a) => effSet.has(a.property) && !(critDead && a.property === critProp))
      .length;
  });

  const hitsOf = (c: 3 | 4): number => (c === 3 ? 4 : 5);

  // 1) 每件初始词条数 3/4 随机决定
  const subCounts: (3 | 4)[] = subPools.map(() => (pick(2) === 0 ? 3 : 4));

  /** 件有效 roll 上限 = min(池中有效数, 4) + 强化次数；池中无有效词条则无法承接 */
  const capOf = (i: number): number =>
    effInPool[i] === 0 ? 0 : Math.min(effInPool[i], 4) + hitsOf(subCounts[i]);

  // 2) 可行性修正：Σ上限 < 目标时随机把一件 3 翻成 4（cap +1），直到凑得齐
  let capSum = subPools.reduce((sum, _, i) => sum + capOf(i), 0);
  while (capSum < target) {
    const candidates = subCounts
      .map((c, i) => (c === 3 ? i : -1))
      .filter((i) => i >= 0);
    if (candidates.length === 0) {
      throw new Error(`目标 ${target} 超出可行上限 ${capSum}（全部翻成 4 词条仍不够）`);
    }
    const i = candidates[pick(candidates.length)];
    subCounts[i] = 4;
    capSum += 1;
  }

  // 3) 件间随机拆分：随机洗牌件序，逐件在 [lower, upper] 内取值——
  //    lower = max(0, remaining - 后续件上限和)（保证剩余能被消化）、
  //    upper = min(本件上限, remaining)（保证本件不超、总和精确）。
  //    传 weights 时按「件内有效权重和」偏置：区间内逐个额外 roll 以
  //    p = w本件/(w本件+后续件权和) 归本件（伯努利），权重和高 → 更靠 upper。
  const order = shuffled(subPools.map((_, i) => i), rand);
  const suffixCap = new Array<number>(order.length + 1).fill(0);
  for (let k = order.length - 1; k >= 0; k--) {
    suffixCap[k] = suffixCap[k + 1] + capOf(order[k]);
  }
  const pieceW: number[] | null = weighted
    ? subPools.map((pool, i) =>
        effInPool[i] === 0
          ? 0
          : pool
              .filter((a) => effSet.has(a.property))
              .reduce((sum, a) => sum + weightOf(a.property), 0),
      )
    : null;
  const suffixW = new Array<number>(order.length + 1).fill(0);
  if (pieceW) {
    for (let k = order.length - 1; k >= 0; k--) {
      suffixW[k] = suffixW[k + 1] + pieceW[order[k]];
    }
  }
  const pieceTargets = new Array<number>(subPools.length).fill(0);
  let remaining = target;
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const cap = capOf(i);
    const lower = Math.max(0, remaining - suffixCap[k + 1]);
    const upper = Math.min(cap, remaining);
    if (lower > upper) {
      throw new Error(`目标拆分失败：第 ${i + 1} 件区间 [${lower}, ${upper}] 为空`);
    }
    let t: number;
    if (pieceW) {
      const wSelf = pieceW[i];
      const wRest = suffixW[k + 1];
      const p = wSelf + wRest > 0 ? wSelf / (wSelf + wRest) : 0;
      let extra = 0;
      for (let r = 0; r < upper - lower; r++) {
        if (rand() < p) extra++;
      }
      t = lower + extra;
    } else {
      t = lower + (upper > lower ? pick(upper - lower + 1) : 0);
    }
    pieceTargets[i] = t;
    remaining -= t;
  }
  if (remaining !== 0) {
    throw new Error(`目标拆分残余 ${remaining}（内部错误）`);
  }

  // 4) 逐件构造成品
  const pieces = subPools.map((pool, i) =>
    buildAllocatedPiece(pool, effSet, subCounts[i], pieceTargets[i], rand, ctx),
  );

  const actualPieceAt = (i: number): number =>
    pieces[i].reduce((sum, s) => (effSet.has(s.property) ? sum + s.rolls : sum), 0);

  // 4b) 缺口回填：爆率额度耗尽时出局的 crit 份额（满押件 eff 位不足）按随机序
  //     转移给仍有余量的件重建（「出局让位其他词条」的兜底；Σ可用上限仍不足时
  //     残余缺口如实反映在 actual）。正常路径（含无 ctx）恒无缺口，不进此块。
  let short = target - pieces.reduce((sum, _, i) => sum + actualPieceAt(i), 0);
  if (short > 0 && ctx) {
    const c = ctx;
    const refillOrder = shuffled(subPools.map((_, i) => i), rand);
    for (const i of refillOrder) {
      if (short <= 0) break;
      const cur = actualPieceAt(i);
      const effAvailNow = subPools[i].filter(
        (a) => effSet.has(a.property) && c.available(a.property),
      ).length;
      const capNow = effAvailNow === 0 ? 0 : Math.min(effAvailNow, 4) + hitsOf(subCounts[i]);
      const room = capNow - cur;
      if (room <= 0) continue;
      const add = Math.min(room, short);
      pieces[i] = buildAllocatedPiece(subPools[i], effSet, subCounts[i], cur + add, rand, c);
      short -= actualPieceAt(i) - cur;
    }
  }

  // actual 按成品实算（正常恒 = ΣpieceTargets；爆率额度极端截断时可能更小）
  const flat = pieces.flat();
  const actual = flat.reduce((sum, s) => (effSet.has(s.property) ? sum + s.rolls : sum), 0);
  const critValue = opts.critCap
    ? flat
        .filter((s) => s.property === opts.critCap?.property)
        .reduce((sum, s) => sum + s.value, 0)
    : undefined;
  return { pieces, subCounts, target, actual, critValue };
}

/** 单件构造：d = min(池中有效数, 4, 件目标) 条有效词条 + 强化按需押注凑够件目标 */
function buildAllocatedPiece(
  pool: readonly RelicAffix[],
  effSet: ReadonlySet<string>,
  subCount: 3 | 4,
  pieceTarget: number,
  rand: () => number,
  ctx?: AllocCtx,
): GeneratedRelicSub[] {
  const pick = (n: number): number => Math.floor(rand() * n);
  const hits = subCount === 3 ? 4 : 5;

  const effPool = pool.filter((a) => effSet.has(a.property));
  const nonPool = pool.filter((a) => !effSet.has(a.property));
  // 爆率额度耗尽后 crit 出局（gated 时才过滤；极端情况剔除后总条数 <4 则放弃剔除防崩）
  let effAvail = ctx ? effPool.filter((a) => ctx.available(a.property)) : effPool;
  let nonAvail = ctx ? nonPool.filter((a) => ctx.available(a.property)) : nonPool;
  if (effAvail.length + nonAvail.length < 4) {
    effAvail = effPool;
    nonAvail = nonPool;
  }
  // 有效 distinct 条数 d（基于可用池）：
  // - 可用池中无有效 → 0（cap 已保证 pieceTarget = 0；额度耗尽截断时可能产生缺口）
  // - 满押（pieceTarget = min(eff,4)+hits 且可用有效 ≥4）→ d=4（全 4 条有效、强化全押有效）
  // - 否则 d = min(可用有效数, 3, pieceTarget)：至少留 1 条非效条承接 kNon
  const cap = Math.min(effPool.length, 4) + hits;
  const d =
    effAvail.length === 0
      ? 0
      : pieceTarget === cap && effAvail.length >= 4
        ? 4
        : Math.min(effAvail.length, 3, pieceTarget);
  // kEff 需 ≤ hits；正常数学保证，爆率截断的极端缺口在此 clamp（actual 会如实反映）
  const kEff = Math.min(pieceTarget - d, hits);
  const kNon = hits - kEff;
  if (kEff < 0 || kNon < 0) {
    throw new Error(`件目标 ${pieceTarget} 超出构造上限（内部错误）`);
  }

  // 选 d 条有效 + (4-d) 条非有效，洗牌决定初始/补条位置
  //（subCount=3：前 3 条初始、第 4 条补条；subCount=4：4 条全初始）
  const take = (list: readonly RelicAffix[], n: number): RelicAffix[] => {
    const c = ctx;
    if (c?.weighted) {
      return weightedSample(list, n, (a) => c.weightOf(a.property), rand);
    }
    return shuffled(list, rand).slice(0, n);
  };
  const chosen = shuffled(
    [
      ...take(effAvail, d).map((a) => ({ affix: a, eff: true })),
      ...take(nonAvail, 4 - d).map((a) => ({ affix: a, eff: false })),
    ],
    rand,
  );
  const work = chosen.map((c) => ({ affix: c.affix, eff: c.eff, tiers: [pick(3)] }));
  if (ctx) {
    for (const w of work) ctx.consume(w.affix.property); // 初始/补条记账（额度扣减）
  }

  // 强化：kEff 次押有效、kNon 次押非有效（顺序洗牌；传 weights 时词条内加权）
  const enhancePlan = [
    ...new Array<boolean>(kEff).fill(true),
    ...new Array<boolean>(kNon).fill(false),
  ];
  const plan = shuffled(enhancePlan, rand);
  for (const isEff of plan) {
    const group = work.filter((w) => w.eff === isEff);
    const c = ctx;
    const candidates = c ? group.filter((w) => c.available(w.affix.property)) : group;
    if (candidates.length === 0) continue; // 额度耗尽兜底：跳过（actual 如实反映缺口）
    const target = c?.weighted
      ? weightedPickOne(candidates, (w) => c.weightOf(w.affix.property), rand)
      : candidates[pick(candidates.length)];
    target.tiers.push(pick(3));
    c?.consume(target.affix.property);
  }

  return work.map((w) => ({
    property: w.affix.property,
    tiers: w.tiers,
    rolls: w.tiers.length,
    value: w.tiers.reduce((sum, tier) => sum + w.affix.base + w.affix.step * tier, 0),
  }));
}
