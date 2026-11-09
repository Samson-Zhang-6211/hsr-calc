/**
 * 行动轴（timeline）引擎：速度 / 行动值 / 拉条推条 / 轮次 / 插队的事件循环。
 *
 * 跑道模型（多源确认，BWIKI/米游社/游民星空，对应游戏 4.6 口径）：
 * - 所有单位在总路程 10000 的跑道上跑；行动值 av = 到达终点的剩余时间。
 * - 初始 av = 10000 ÷ 速度（同起点出发，速度决定先手；同刻按编队 order）。
 * - 时间推进 dt：所有单位 av −= dt（等价于 路程 −= 速度×dt）。
 * - 行动结束：av 重置为 10000 ÷ 当前速度。
 * - 行动提前（拉条）：av −= 10000 ÷ 速度 × 比例，clamp ≥ 0（不越过终点）。
 *   改版后口径：「行动提前100%」按公式计算，不等同「立即行动」——被推条过的目标
 *   100% 提前可能无法归 0（米游社 2026 与 TapTap 讨论确认）。
 * - 立即行动：强制 av = 0（独立效果，非拉条公式）。
 * - 行动延后（推条）：av += 10000 ÷ 速度 × 比例；可超过初始行动值（2026 口径，见方法注释）。
 * - 提速/减速：av ×= 旧速 ÷ 新速（路程/位置不变）；av=0 时对当前圈无影响。
 * - 终结技插队：直接插入一次行动，不改变 av 与行动序列，时间不推进。
 * - 额外回合（2026-11 用户裁定）：与跑道**完全无关**的插入回合——不改 av、不重置 av、不推进时间，
 *   不算新回合（buff/护盾/行动计数等回合结算全跳过）；优先级最高（压过已插入的终结技，
 *   见 `extraQueue` 先于 `queue` 出队），多个额外回合同级按入队顺序 FIFO。调用方用
 *   `insertExtraTurn` 入队，出队事件 `type:'extraTurn'` **不需要** `finishAction`。
 * - 轮次（忘却之庭）：独立计时器，首轮 150 行动值、之后每轮 100，不受任何效果影响。
 * - 同刻归 0 的多个单位：后拉先动（更晚归 0 者先行动），其次按编队顺序。
 * - 冻结：v1 暂不建模（解除后行动值 = 原值一半，后续再加）。
 */

export type UnitSide = 'ally' | 'enemy';

export interface TimelineUnitConfig {
  id: string;
  side: UnitSide;
  speed: number;
  /** 编队顺序（同刻 tie-break），缺省按加入顺序 */
  order?: number;
  /** 自定义初始行动值，缺省 10000 / speed（同起点） */
  initialAv?: number;
}

export interface TimelineUnitView {
  id: string;
  side: UnitSide;
  speed: number;
  av: number;
  order: number;
}

export type TimelineEvent =
  | { type: 'unitAction'; time: number; round: number; unitId: string }
  | { type: 'roundBoundary'; time: number; round: number }
  | { type: 'insertAction'; time: number; round: number; unitId: string }
  /** 定时行动序列条目（【月狂倒计时】【稳态失衡】等）：在该绝对时刻触发，不占用跑道 */
  | { type: 'scheduledAction'; time: number; round: number; unitId: string; tag: string }
  /**
   * 额外回合（2026-11 用户裁定）：与跑道无关的插入回合。
   * 出队即行动，**不需要 finishAction**；不改 av、不推进时间、不算新回合。
   * 优先级高于 `insertAction`（终结技插队）与跑道行动，同级按入队顺序。
   */
  | { type: 'extraTurn'; time: number; round: number; unitId: string; tag?: string };

export interface TimelineOptions {
  /** 是否启用轮次计时器（忘却之庭），默认 true */
  rounds?: boolean;
  /** 首轮轮次边界的行动值，默认 FIRST_ROUND_AV=150（忘却式）；异相仲裁式=300 */
  firstRoundAv?: number;
}

export const TRACK_LENGTH = 10000;
export const FIRST_ROUND_AV = 150;
export const LATER_ROUND_AV = 100;

interface UnitState {
  id: string;
  side: UnitSide;
  speed: number;
  order: number;
  /** 当前时刻的剩余行动值（剩余时间） */
  av: number;
  /** 行动值归 0 的顺序号（后拉先动判据；自然到达为 0） */
  readySeq: number;
}

const EPS = 1e-9;

export class Timeline {
  private readonly units = new Map<string, UnitState>();
  private readonly queue: TimelineEvent[] = [];
  /** 额外回合队列（2026-11 裁定：最高优先、同级 FIFO、与跑道无关） */
  private readonly extraQueue: { unitId: string; tag?: string }[] = [];
  /** 定时行动序列条目（绝对时刻触发；不占跑道、不需 finishAction） */
  private readonly scheduled: { unitId: string; atTime: number; tag: string }[] = [];
  private readonly roundsEnabled: boolean;
  private readonly firstRoundAv: number;
  private counter = 0;
  private t = 0;
  private currentRound = 0;
  private pendingFinish: string | null = null;

  constructor(options: TimelineOptions = {}) {
    this.roundsEnabled = options.rounds ?? true;
    this.firstRoundAv = options.firstRoundAv ?? FIRST_ROUND_AV;
    if (!(this.firstRoundAv > 0)) {
      throw new Error('首轮轮次边界必须为正数');
    }
  }

  addUnit(config: TimelineUnitConfig): void {
    if (!(config.speed > 0)) {
      throw new Error(`速度必须为正数：${config.id}`);
    }
    if (this.units.has(config.id)) {
      throw new Error(`单位已存在：${config.id}`);
    }
    const order = config.order ?? this.units.size;
    this.units.set(config.id, {
      id: config.id,
      side: config.side,
      speed: config.speed,
      order,
      av: config.initialAv ?? TRACK_LENGTH / config.speed,
      readySeq: 0,
    });
  }

  get time(): number {
    return this.t;
  }

  get round(): number {
    return this.currentRound;
  }

  /** 单位当前是否在跑道上（Fever 等会移除/恢复单位） */
  has(unitId: string): boolean {
    return this.units.has(unitId);
  }

  getUnit(unitId: string): TimelineUnitView {
    const u = this.require(unitId);
    return { id: u.id, side: u.side, speed: u.speed, av: u.av, order: u.order };
  }

  /** 当前已从跑道取出、待 finishAction 的单位（无则 null） */
  pendingId(): string | null {
    return this.pendingFinish;
  }

  snapshot(): TimelineUnitView[] {
    return [...this.units.values()]
      .map((u) => ({ id: u.id, side: u.side, speed: u.speed, av: u.av, order: u.order }))
      .sort((a, b) => a.av - b.av || a.order - b.order);
  }

  /** 下一事件的绝对时刻；无单位时为 Infinity */
  nextEventTime(): number {
    let next = Infinity;
    for (const u of this.units.values()) {
      next = Math.min(next, this.t + u.av);
    }
    for (const s of this.scheduled) {
      if (s.atTime < next) next = s.atTime;
    }
    if (this.roundsEnabled) {
      next = Math.min(next, this.nextBoundary());
    }
    return next;
  }

  /**
   * 推进到下一事件并返回：
   * - 额外回合队列优先（最高优先，FIFO）
   * - 队列中的插队事件次之（当前时刻，FIFO）
   * - 否则取最早就绪单位（同刻：readySeq 降序=后拉先动 → order 升序=编队顺序）
   * - 轮次边界与单位行动同刻时，行动先（阈值口径：恰好落在边界上的行动计入本轮）
   *
   * 契约：返回 unitAction 后必须先调用 finishAction(unitId) 才能再次 advance。
   * insertAction / extraTurn 不需要 finishAction（都不占用跑道）。
   */
  advance(): TimelineEvent | null {
    if (this.pendingFinish) {
      throw new Error(`行动 ${this.pendingFinish} 尚未结算（需先调用 finishAction）`);
    }
    // 额外回合优先（2026-11 裁定）：压过插队终结技，与跑道、av、时间全无关
    if (this.extraQueue.length > 0) {
      const e = this.extraQueue.shift()!;
      return { type: 'extraTurn', time: this.t, round: this.currentRound, unitId: e.unitId, tag: e.tag };
    }
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    if (this.units.size === 0) {
      return null;
    }
    let unitNext = Infinity;
    for (const u of this.units.values()) {
      unitNext = Math.min(unitNext, this.t + u.av);
    }
    const boundary = this.roundsEnabled ? this.nextBoundary() : Infinity;
    // 定时条目：早于最早单位行动与轮次边界时先触发（时间推进 → 全体 av 同步递减）
    let schedIdx = -1;
    let schedTime = Infinity;
    for (let i = 0; i < this.scheduled.length; i += 1) {
      const s = this.scheduled[i]!;
      if (s.atTime < schedTime - EPS) {
        schedTime = s.atTime;
        schedIdx = i;
      }
    }
    if (schedIdx >= 0 && schedTime < unitNext - EPS && schedTime < boundary - EPS) {
      const dt = Math.max(0, schedTime - this.t);
      this.t = Math.max(this.t, schedTime);
      for (const u of this.units.values()) u.av -= dt;
      const [entry] = this.scheduled.splice(schedIdx, 1);
      return {
        type: 'scheduledAction',
        time: this.t,
        round: this.currentRound,
        unitId: entry!.unitId,
        tag: entry!.tag,
      };
    }
    if (boundary < unitNext - EPS) {
      // 绝对时刻边界（150/250/350…）；防御浮点：已越过时不回拨时间
      const dt = Math.max(0, boundary - this.t);
      this.t = Math.max(this.t, boundary);
      for (const u of this.units.values()) {
        u.av -= dt;
      }
      this.currentRound += 1;
      return { type: 'roundBoundary', time: this.t, round: this.currentRound };
    }
    if (!Number.isFinite(unitNext)) {
      return null;
    }
    const prev = this.t;
    this.t = Math.max(this.t, unitNext);
    const dt = this.t - prev;
    const ready: UnitState[] = [];
    for (const u of this.units.values()) {
      const wasReady = u.av <= EPS;
      u.av -= dt;
      if (u.av <= EPS) {
        u.av = 0;
        // 自然到达：readySeq 保持 0（同刻按编队顺序）；被拉/立即行动的单位 readySeq 更大（后拉先动）
        if (!wasReady) u.readySeq = 0;
        ready.push(u);
      }
    }
    if (ready.length === 0) {
      throw new Error('内部错误：时间已推进但无就绪单位');
    }
    ready.sort((a, b) => b.readySeq - a.readySeq || a.order - b.order);
    const picked = ready[0];
    this.pendingFinish = picked.id;
    return { type: 'unitAction', time: this.t, round: this.currentRound, unitId: picked.id };
  }

  /** 行动结算：位置归 0，av 重置为 10000 ÷ 当前速度 */
  finishAction(unitId: string): void {
    if (!this.units.has(unitId)) {
      // 单位可能在行动结算前被移除（如 Fever 中晴歌退出行动序列）→ 视为已完成
      if (this.pendingFinish === unitId) this.pendingFinish = null;
      return;
    }
    const u = this.require(unitId);
    if (this.pendingFinish !== unitId) {
      throw new Error(`当前待结算的行动是 ${this.pendingFinish ?? '（无）'}，不是 ${unitId}`);
    }
    u.av = TRACK_LENGTH / u.speed;
    u.readySeq = 0;
    this.pendingFinish = null;
  }

  /** 移除单位（如 Fever 期间晴歌不进入自己的回合）；其待结算行动视为已完成 */
  removeUnit(unitId: string): void {
    this.units.delete(unitId);
    if (this.pendingFinish === unitId) this.pendingFinish = null;
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      const e = this.queue[i];
      if (e.type === 'unitAction' && e.unitId === unitId) this.queue.splice(i, 1);
    }
    for (let i = this.extraQueue.length - 1; i >= 0; i -= 1) {
      if (this.extraQueue[i]!.unitId === unitId) this.extraQueue.splice(i, 1);
    }
    for (let i = this.scheduled.length - 1; i >= 0; i -= 1) {
      if (this.scheduled[i]!.unitId === unitId) this.scheduled.splice(i, 1);
    }
  }

  /** 行动提前 pct（0-1]：av −= 10000/速度×pct，clamp ≥ 0；归 0 记 readySeq（后拉先动） */
  actionAdvance(unitId: string, pct: number): void {
    const u = this.require(unitId);
    u.av = Math.max(0, u.av - (TRACK_LENGTH / u.speed) * pct);
    if (u.av <= EPS) {
      u.av = 0;
      u.readySeq = ++this.counter;
    }
  }

  /**
   * 行动延后 pct（0-1]：av += 10000/速度×pct。
   * 无上限钳制——多源确认（米游社 2026「被行动延迟到超过初始行动值，行动提前100%
   * 将无法使行动值归0」、TapTap「被推条20%需提前120%才立即行动」），推条可超过
   * 初始行动值；与 BWIKI「不越过起点」一句冲突，已按 2026 口径实现，待游戏内复核。
   */
  actionDelay(unitId: string, pct: number): void {
    const u = this.require(unitId);
    u.av = u.av + (TRACK_LENGTH / u.speed) * pct;
  }

  /** 立即行动：强制 av = 0（独立于行动提前公式） */
  instantAction(unitId: string): void {
    const u = this.require(unitId);
    u.av = 0;
    u.readySeq = ++this.counter;
  }

  /** 提速/减速：新速度必须为正；av 按旧/新速度换算（路程不变），0 值保持 0 */
  speedChange(unitId: string, newSpeed: number): void {
    const u = this.require(unitId);
    if (!(newSpeed > 0)) {
      throw new Error(`速度必须为正数：${unitId}`);
    }
    u.av = u.av === 0 ? 0 : (u.av * u.speed) / newSpeed;
    u.speed = newSpeed;
  }

  /** 终结技/额外回合插队：入队一个不占用跑道的行动事件（时间不推进）。
   *  注意：额外回合请用 `insertExtraTurn`（优先级更高，且不作回合结算）。 */
  insertAction(unitId: string): void {
    this.require(unitId);
    this.queue.push({ type: 'insertAction', time: this.t, round: this.currentRound, unitId });
  }

  /**
   * 额外回合入队（2026-11 用户裁定）：与跑道无关、不改 av、不推进时间、不算新回合。
   * - 优先级最高：出队早于 `insertAction`（终结技插队）与跑道行动；
   * - 同级 FIFO：多个额外回合按入队顺序依次执行；
   * - 可在别的单位行动结算**之前**入队（如火花 E2 在阿哈时刻内触发），出队在 finishAction 之后。
   */
  insertExtraTurn(unitId: string, tag?: string): void {
    this.require(unitId);
    this.extraQueue.push({ unitId, tag });
  }

  /** 是否有待执行的额外回合（主循环据此让额外回合压过终结技插队） */
  hasExtraTurnPending(): boolean {
    return this.extraQueue.length > 0;
  }

  /**
   * 插入一条定时行动序列条目：在该绝对时刻触发（早于该时刻的单位行动），
   * 不占用跑道、不推进别的单位行动值以外的东西（时间推进时全体 av 同步递减）。
   * 语义对应游戏「行动序列添加【月狂倒计时】/【稳态失衡】」。
   */
  scheduleAction(unitId: string, atTime: number, tag: string): void {
    this.require(unitId);
    this.scheduled.push({ unitId, atTime: Math.max(atTime, this.t), tag });
  }

  /** 取消某标签的全部定时条目（如全体解除【月狂】时清掉剩余倒计时） */
  clearScheduled(tag: string): void {
    for (let i = this.scheduled.length - 1; i >= 0; i -= 1) {
      if (this.scheduled[i]!.tag === tag) this.scheduled.splice(i, 1);
    }
  }

  /** 某标签尚未触发的定时代理数（供外部判断是否已排期） */
  scheduledCount(tag: string): number {
    return this.scheduled.filter((s) => s.tag === tag).length;
  }

  /**
   * 刷新全场跑道：所有单位行动值重置为 10000 ÷ 速度（轮次计数不变）。
   * 忘却式换波用（2026-10-22 用户裁定）：新一波的怪与场上全部单位一起按速度重新排队。
   */
  refreshAllAv(): void {
    for (const u of this.units.values()) {
      u.av = TRACK_LENGTH / u.speed;
      u.readySeq = 0;
    }
  }

  /**
   * 纯速度跑道推演未来 n 次行动（只读，不修改本实例状态）。
   * 口径（2026-10 用户裁定）：不考虑终结技、拉条/推条、追加攻击等动态效果，
   * 只按各单位当前行动值与速度依次取最小 av，行动后重置 10000÷速度。
   * 返回每步的单位 id、发生时刻、该单位行动值（10000÷速度）。
   */
  predict(n: number): { unitId: string; time: number; av: number }[] {
    const sim = [...this.units.values()].map((u) => ({ ...u }));
    const out: { unitId: string; time: number; av: number }[] = [];
    let t = this.t;
    for (let i = 0; i < n; i += 1) {
      let picked: (typeof sim)[number] | null = null;
      for (const u of sim) {
        if (
          !picked ||
          u.av < picked.av - EPS ||
          (Math.abs(u.av - picked.av) <= EPS && u.order < picked.order)
        ) {
          picked = u;
        }
      }
      if (!picked) break;
      const dt = Math.max(0, picked.av);
      t += dt;
      for (const u of sim) u.av -= dt;
      out.push({ unitId: picked.id, time: t, av: TRACK_LENGTH / picked.speed });
      picked.av = TRACK_LENGTH / picked.speed;
      picked.readySeq = 0;
    }
    return out;
  }

  /** 下一轮次边界的绝对时刻：第 1 轮在 firstRoundAv（忘却150/异相仲裁300），之后每轮 +100（不受行动推进影响） */
  private nextBoundary(): number {
    if (!this.roundsEnabled) return Infinity;
    // 轮次从 0 起：第 0 轮 [0,firstRoundAv)，之后每轮 +100，第 n 轮边界 = firstRoundAv+100×n
    return this.firstRoundAv + LATER_ROUND_AV * this.currentRound;
  }

  private require(unitId: string): UnitState {
    const u = this.units.get(unitId);
    if (!u) {
      throw new Error(`未知单位：${unitId}`);
    }
    return u;
  }
}
