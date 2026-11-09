/**
 * 四人队行动轴（team axis）：速度 / 行动值 / 战技点 / 能量回转的简单决策模拟。
 *
 * 范围（2026-01 与用户逐条确认）：
 * - 只关注速度、行动值、战技点与能量；不计算伤害与伤害类 buff，敌人按木桩处理
 *   （不出手 → 无受击/击杀回能）。
 * - 终结技按「能量满→开大」在行动间隙自动释放（时间不推进）。
 * - 战技点：初始 3（米游社/游民双源；「过客4件套+1」为额外来源），上限 5；
 *   普攻 +1、战技 −1（各角色招式数据 bp_add/bp_need 口径）。
 * - 能量：初始 = 能量上限的 50%（2026-01 用户确认口径）；普攻 +20 / 战技 +30 /
 *   自身开大 +5，均 ×(1+能量恢复效率)；标注「固定恢复」的不吃充能效率。
 *   受击/击杀回能不建模。
 * - 开局秘技（默认开，可关）：晴歌自身行动提前 20% + 立即 6 气氛值；景元神君首回合
 *   +3 段；腾荒自动施放 1 次战技（不耗战技点，+30 能量、同袍护盾、召唤龙灵）。
 * - 晴歌忆灵：贝茜（战技召唤）/ 啾米（气氛≥6）/ 派丁（气氛≥12，均需贝茜在场），
 *   速度 = 晴歌面板速度 × 180%（米游社：吃局外面板，与战斗中速度加成无关）。
 * - 气氛值：秘技 +6、我方每次行动 +1（统一简化口径，含召唤物）、腾荒秘技战技 +1、
 *   晴歌战技再次施放（有忆灵在场）+6，上限 50。
 * - 开战回能：初始=上限50% + 行迹「绸缪」景元15、「崇高拂尘」星期日25（与 combat 一致，2026-10 同步）。
 * - 决策规则（v1 简单决策，后续训练自动战斗时可整体替换 Policy）：
 *   晴歌：能量满→大招（景元行动提前100% + 固定12%能量）；贝茜不在场且SP≥1→战技；
 *     否则普攻。
 *   星期日：能量满→大招（【蒙福者】=景元，恢复目标20%能量，不足40→补至40·行迹主日渴慕）；SP≥1→战技（立即行动
 *     景元+神君；目标为蒙福者时返还1点→净0）；否则普攻。
 *   景元：能量满→大招（神君+3段）；SP≥1且段数<10→战技（神君+2段）；否则普攻。
 *   腾荒：能量满→大招；同袍护盾剩余0且SP≥1→战技（护盾3回合、召唤龙灵）；否则普攻。
 * - 回合计数：【蒙福者】按星期日自身行动计 3 回合（行动结算后 −1）；护盾按
 *   受益者各自行动计 3 回合（2026-10 用户裁定，见下方简化标记①）。
 *
 * 简化标记（待游戏内复核）：
 * ①护盾回合计数 2026-10 已改按受益者各自行动递减（取代旧「统一按景元回合计」口径）；
 *   秘技自动战技与手动战技共用同一护盾计时、施放时全队计满（叠加上限#4待核）。
 * ②星期日大招 20% 能量按目标充能效率放大（2026-01 用户确认口径；游戏文本未写
 *   「固定恢复」，对比晴歌的「固定恢复12%」）。
 * ③晴歌战技「+6气氛」仅在施放时已有忆灵在场时生效（首次召唤没有）；v1 规则下她
 *   召唤后不再放战技，该分支实际只在首次召唤的同一次施放中不触发。
 * ④所有我方行动统一 +1 气氛（游戏原义为「施放攻击/首次提供治疗或护盾」的细分判定）。
 * ⑤行迹「葳蕤」按同袍=景元本体触发（普攻/战技/终结技）；景元的召唤物【神君】攻击
 *   是否算「同袍施放攻击」待核，v1 暂不触发。行迹 +6 能量未标「固定」→ ×充能效率。
 */

import { Timeline, TRACK_LENGTH, type TimelineEvent } from './timeline.js';

export type CharId = 'qingge' | 'sunday' | 'jingyuan' | 'tenghuang' | 'aglaea';
export type SummonId = 'shenjun' | 'memo' | 'longling' | 'yijiang';
export type AxisUnitId = CharId | SummonId | 'countdown';

export const TEAM_CHAR_IDS = ['qingge', 'sunday', 'jingyuan', 'tenghuang'] as const;

/** 队伍槽位 → 角色名册 id（名册见 apps/web character-roster） */
export const TEAM_ROSTER_ID: Record<CharId, string> = {
  qingge: '1512',
  sunday: '1313',
  jingyuan: '1204',
  tenghuang: '1414',
  aglaea: '1402',
};

export interface TeamMemberConfig {
  id: CharId;
  /** 面板速度 */
  speed: number;
  /** 能量恢复效率（比例，0.194 = 充能绳 19.4%），缺省 0 */
  energyRegen?: number;
}

export interface TeamAxisConfig {
  /** 四人齐全（顺序 = 开局同刻的编队顺序） */
  members: TeamMemberConfig[];
  /** 忘却之庭轮次（第0轮 [0,150) 起），默认 true */
  rounds?: boolean;
  /** 模拟截止行动值，默认 350 */
  maxTime?: number;
  /** 事件数上限（防死循环），默认 600 */
  maxEvents?: number;
  /** 开局计入四人秘技，默认 true */
  techniques?: boolean;
  /** 初始战技点，默认 3（上限固定 5） */
  initialSp?: number;
}

export type AxisEventKind = 'action' | 'round' | 'ult';
export type AxisActionType = 'basic' | 'skill' | 'shenjun' | 'memo' | 'longling';
export type AxisNote =
  | 'technique'
  | 'summonBeisi'
  | 'summonQiumi'
  | 'summonPaiding'
  | 'summonLongling'
  | 'pullBoth'
  | 'pullJingyuan'
  | 'resetStacks'
  | 'blessed'
  | 'shield'
  | 'enhance'
  | 'enhanceAct'
  | 'enterFever'
  | 'exitFever'
  | 'traceWeiRui';

export interface AxisEvent {
  index: number;
  time: number;
  round: number;
  kind: AxisEventKind;
  /** 轮次边界为空串 */
  unitId: AxisUnitId | '';
  action?: AxisActionType;
  /** 事件结算后的战技点 */
  spAfter: number;
  /** 角色行动/大招结算后的能量 */
  energyAfter?: number;
  /** 神君段数快照（景元/神君相关事件） */
  stacks?: number;
  /** 事件结算后的气氛值 */
  moodAfter?: number;
  /** 事件结算后剩余的龙灵强化次数 */
  enhanceAfter?: number;
  note?: AxisNote[];
}

export interface AxisFinalState {
  sp: number;
  mood: number;
  stacks: number;
  /** 盾剩余回合（最终态取腾荒自身；按受益者各自行动计，2026-10 裁定） */
  shieldTurns: number;
  blessedTurns: number;
  fever: boolean;
  rhythm: number;
  invitedTurns: number;
  energy: Record<CharId, number>;
  present: { beisi: boolean; qiumi: boolean; paiding: boolean; longling: boolean };
}

export interface AxisResult {
  events: AxisEvent[];
  summary: {
    /** 各单位行动次数（kind=action） */
    actionCounts: Record<string, number>;
    /** 释放的终结技次数 */
    ultCount: number;
    totalTime: number;
    rounds: number;
    spFinal: number;
    mood: number;
  };
  finalState: AxisFinalState;
}

const MAX_SP = 5;
const ENERGY_MAX: Record<CharId, number> = {
  qingge: 140,
  sunday: 130,
  jingyuan: 130,
  tenghuang: 135,
  aglaea: 350,
};

export function simulateTeamAxis(config: TeamAxisConfig): AxisResult {
  const members = [...config.members];
  if (members.length !== 4) {
    throw new Error('四人队需要 4 名角色');
  }
  const ids = new Set(members.map((m) => m.id));
  for (const id of TEAM_CHAR_IDS) {
    if (!ids.has(id)) throw new Error(`缺少角色：${id}`);
  }
  for (const m of members) {
    if (!(m.speed > 0)) throw new Error(`速度必须为正数：${m.id}`);
  }
  const memberOf = (id: CharId) => members.find((m) => m.id === id)!;
  const errMul = (id: CharId) => 1 + (memberOf(id).energyRegen ?? 0);

  const techniques = config.techniques ?? true;
  const roundsEnabled = config.rounds ?? true;
  const maxTime = config.maxTime ?? 350;
  const maxEvents = config.maxEvents ?? 600;

  const tl = new Timeline({ rounds: roundsEnabled });
  let sp = Math.min(MAX_SP, Math.max(0, config.initialSp ?? 3));
  // 初始能量：能量上限的 50%（2026-01 用户确认口径）+ 开战行迹：
  // 景元「绸缪」1204102 +15、星期日「崇高拂尘」1313102 +25
  const energy: Record<CharId, number> = {
    qingge: ENERGY_MAX.qingge / 2,
    sunday: ENERGY_MAX.sunday / 2 + 25,
    jingyuan: ENERGY_MAX.jingyuan / 2 + 15,
    tenghuang: ENERGY_MAX.tenghuang / 2,
    // 阿格莱雅：飞驰之阳（<50%→50%）初始即 50% 不触发；轴不支持阿格莱雅行动，仅满足类型
    aglaea: ENERGY_MAX.aglaea / 2,
  };
  let stacks = techniques ? 6 : 3;
  let mood = 0;
  /** 各成员护盾剩余回合（2026-10 裁定按受益者各自行动递减；键=我方成员） */
  const shieldTurns: Record<string, number> = {};
  /** 施放护盾：全队成员盾回合计满（简化：直接覆盖，叠加上限#4待核） */
  const castShieldTurns = (turns: number): void => {
    for (const id of TEAM_CHAR_IDS) shieldTurns[id] = turns;
  };
  let blessedTurns = 0;
  let longlingEnhance = 0;
  let fever = false;
  /** 行迹「即兴蓝调」1512102：受治疗/护盾+12层（上限12），每次行动首次获气氛消耗1层固定回3能量 */
  let rhythm = 0;
  /** 【特邀嘉宾】（晴歌终结技目标=景元）剩余回合：其及召唤物（神君）攻击时晴歌额外+2气氛 */
  let invitedTurns = 0;
  const present = { beisi: false, qiumi: false, paiding: false, longling: false };

  const shenjunSpeed = () => 30 + 10 * stacks;
  const memoSpeed = () => 1.8 * memberOf('qingge').speed;

  members.forEach((m, i) => {
    const initialAv =
      m.id === 'qingge' && techniques ? (TRACK_LENGTH / m.speed) * 0.8 : undefined;
    tl.addUnit({
      id: m.id,
      side: 'ally',
      speed: m.speed,
      order: i,
      ...(initialAv !== undefined ? { initialAv } : {}),
    });
  });
  // 行迹「葳蕤」：战斗开始时腾荒行动提前 40%。开秘技时腾荒 t=0 立即行动
  // （av 等效重置），该提前被立即行动消耗 → 仅关秘技时体现为首动提前
  if (!techniques) tl.actionAdvance('tenghuang', 0.4);
  tl.addUnit({ id: 'shenjun', side: 'ally', speed: shenjunSpeed(), order: 4 });

  const events: AxisEvent[] = [];
  const actionCounts: Record<string, number> = {};
  let ultCount = 0;
  let nextOrder = 5;

  /**
   * 完整 Fever（2026-01 用户确认）：全员登台→进入 Fever——晴歌不进入自己的回合
   * （移出行动序列），倒计时（忆灵天赋 1151203，初始速度 140）加入行动序列；
   * 倒计时回合开始扣除 max(12, 50%当前气氛值)；气氛归零→「晴空乐手」消失、
   * 晴歌退出 Fever（重新入轨 + 行动提前 50%，忆灵天赋 1151206）。
   */
  const enterFever = (): void => {
    fever = true;
    tl.removeUnit('qingge');
    tl.addUnit({ id: 'countdown', side: 'ally', speed: 140, order: nextOrder++ });
  };

  const exitFever = (): void => {
    fever = false;
    tl.removeUnit('countdown');
    tl.removeUnit('memo');
    present.beisi = false;
    present.qiumi = false;
    present.paiding = false;
    tl.addUnit({
      id: 'qingge',
      side: 'ally',
      speed: memberOf('qingge').speed,
      order: nextOrder++,
    });
    tl.actionAdvance('qingge', 0.5);
  };

  /** 三忆灵全员登台→进入 Fever（在召唤点后调用） */
  const checkFever = (): AxisNote[] => {
    if (!fever && present.beisi && present.qiumi && present.paiding) {
      enterFever();
      return ['enterFever'];
    }
    return [];
  };

  const record = (e: Omit<AxisEvent, 'index'>): void => {
    events.push({ index: events.length, ...e, moodAfter: mood, enhanceAfter: longlingEnhance });
  };

  const addMood = (n: number): AxisNote[] => {
    // 晴歌在该回合内第一次获得气氛值时消耗1层【律动】，固定恢复3点能量（不吃充能效率）
    if (rhythm > 0) {
      rhythm -= 1;
      energy.qingge = Math.min(ENERGY_MAX.qingge, energy.qingge + 3);
    }
    mood = Math.min(50, mood + n);
    const notes: AxisNote[] = [];
    if (present.beisi) {
      if (!present.qiumi && mood >= 6) {
        present.qiumi = true;
        notes.push('summonQiumi');
      }
      if (!present.paiding && mood >= 12) {
        present.paiding = true;
        notes.push('summonPaiding');
      }
    }
    notes.push(...checkFever());
    return notes;
  };

  const summonBeisi = (): AxisNote[] => {
    present.beisi = true;
    tl.addUnit({ id: 'memo', side: 'ally', speed: memoSpeed(), order: nextOrder++ });
    // 忆灵召唤 1151205「贴近海的心跳」：被召唤时晴歌恢复 20 点能量（×充能效率）
    gainEnergy('qingge', 20);
    return ['summonBeisi', ...checkFever()];
  };

  const gainEnergy = (id: CharId, base: number): void => {
    energy[id] = Math.min(ENERGY_MAX[id], energy[id] + base * errMul(id));
  };

  /** 行迹「即兴蓝调」：晴歌或「晴空乐手」受到队友护盾/治疗 → +12 层【律动】（上限12） */
  const gainRhythm = (): void => {
    rhythm = Math.min(12, rhythm + 12);
  };

  /** 景元本体/神君（景元召唤物）攻击的【特邀嘉宾】加成：额外 +2 气氛值 */
  const guestBonus = (): number => (invitedTurns > 0 ? 2 : 0);

  /** 行迹「葳蕤」：同袍（v1=景元本体）施放攻击 → 腾荒 +6 能量（×充能效率）+ 龙灵行动提前 15% */
  const traceWeirui = (): void => {
    gainEnergy('tenghuang', 6);
    if (present.longling) tl.actionAdvance('longling', 0.15);
  };

  /** 能量满→开大（按队伍顺序）；返回本次是否开过大招 */
  const tryCastUlts = (): boolean => {
    for (const m of members) {
      if (energy[m.id] < ENERGY_MAX[m.id]) continue;
      energy[m.id] = 0;
      gainEnergy(m.id, 5);
      const notes: AxisNote[] = [];
      if (m.id === 'qingge') {
        tl.actionAdvance('jingyuan', 1);
        energy.jingyuan = Math.min(
          ENERGY_MAX.jingyuan,
          energy.jingyuan + 0.12 * ENERGY_MAX.qingge,
        );
        invitedTurns = 2;
        notes.push('pullJingyuan');
      } else if (m.id === 'sunday') {
        blessedTurns = 3;
        // 目标回能 = 20% 上限按目标充能效率放大（2026-01 口径）；
        // 行迹「主日渴慕」1313101：基础恢复不足 40 点时提高至 40（×目标充能效率，2026-10 用户裁定）
        const raw = 0.2 * ENERGY_MAX.sunday;
        const gain = (raw < 40 ? 40 : raw) * errMul('jingyuan');
        energy.jingyuan = Math.min(ENERGY_MAX.jingyuan, energy.jingyuan + gain);
        notes.push('blessed');
      } else if (m.id === 'jingyuan') {
        stacks = Math.min(10, stacks + 3);
        tl.speedChange('shenjun', shenjunSpeed());
        traceWeirui();
        notes.push('traceWeiRui', ...addMood(1 + guestBonus()));
      } else {
        longlingEnhance = 2;
        gainRhythm(); // 腾荒终结技全队护盾
        notes.push(...addMood(1), 'enhance');
      }
      ultCount += 1;
      record({
        time: tl.time,
        round: tl.round,
        kind: 'ult',
        unitId: m.id,
        spAfter: sp,
        energyAfter: energy[m.id],
        stacks: m.id === 'jingyuan' ? stacks : undefined,
        note: notes.length > 0 ? notes : undefined,
      });
      return true;
    }
    return false;
  };

  /** 角色行动决策（副作用：SP/能量/召唤/拉条） */
  const charAction = (
    id: CharId,
  ): { type: 'basic' | 'skill'; notes: AxisNote[]; stacks?: number } => {
    const notes: AxisNote[] = [];
    switch (id) {
      case 'qingge': {
        if (!present.beisi && sp >= 1) {
          sp -= 1;
          gainEnergy(id, 30);
          notes.push(...summonBeisi());
          notes.push(...addMood(1));
          return { type: 'skill', notes };
        }
        sp = Math.min(MAX_SP, sp + 1);
        gainEnergy(id, 20);
        notes.push(...addMood(1));
        return { type: 'basic', notes };
      }
      case 'sunday': {
        if (sp >= 1) {
          sp -= 1;
          if (blessedTurns > 0) sp = Math.min(MAX_SP, sp + 1);
          gainEnergy(id, 30);
          // 先神君后景元 → 归0顺序上景元先行动（后拉先动）
          tl.instantAction('shenjun');
          tl.instantAction('jingyuan');
          notes.push('pullBoth', ...addMood(1));
          return { type: 'skill', notes };
        }
        sp = Math.min(MAX_SP, sp + 1);
        gainEnergy(id, 20);
        notes.push(...addMood(1));
        return { type: 'basic', notes };
      }
      case 'jingyuan': {
        if (stacks < 10 && sp >= 1) {
          sp -= 1;
          gainEnergy(id, 30);
          stacks = Math.min(10, stacks + 2);
          tl.speedChange('shenjun', shenjunSpeed());
          notes.push(...addMood(1 + guestBonus()));
          return { type: 'skill', notes, stacks };
        }
        sp = Math.min(MAX_SP, sp + 1);
        gainEnergy(id, 20);
        notes.push(...addMood(1 + guestBonus()));
        return { type: 'basic', notes, stacks };
      }
      case 'tenghuang': {
        if ((shieldTurns['tenghuang'] ?? 0) === 0 && sp >= 1) {
          sp -= 1;
          gainEnergy(id, 30);
          castShieldTurns(3);
          gainRhythm();
          notes.push('shield');
          if (!present.longling) {
            present.longling = true;
            tl.addUnit({ id: 'longling', side: 'ally', speed: 165, order: nextOrder++ });
            notes.push('summonLongling');
          }
          notes.push(...addMood(1));
          return { type: 'skill', notes };
        }
        sp = Math.min(MAX_SP, sp + 1);
        gainEnergy(id, 20);
        notes.push(...addMood(1));
        return { type: 'basic', notes };
      }
      // 行动轴队伍固定四人（轴已隐藏）；阿格莱雅等新角色不在此模拟
      default:
        throw new Error(`行动轴不支持的角色：${id}`);
    }
  };

  /** 开局秘技 */
  if (techniques) {
    mood += 6;
    // 腾荒秘技：自动施放 1 次战技（不耗战技点）→ 同袍/护盾/龙灵/能量
    gainEnergy('tenghuang', 30);
    castShieldTurns(3);
    gainRhythm();
    present.longling = true;
    tl.addUnit({ id: 'longling', side: 'ally', speed: 165, order: nextOrder++ });
    const notes: AxisNote[] = ['technique', 'shield', 'summonLongling', ...addMood(1)];
    record({
      time: 0,
      round: 0,
      kind: 'action',
      unitId: 'tenghuang',
      action: 'skill',
      spAfter: sp,
      energyAfter: energy.tenghuang,
      note: notes,
    });
    actionCounts.tenghuang = (actionCounts.tenghuang ?? 0) + 1;
  }

  /** 行动结算后：回合类 buff 递减（蒙福者按星期日、护盾按受益者各自行动、特邀嘉宾按景元） */
  const tickBuffs = (id: CharId): void => {
    if (id === 'sunday' && blessedTurns > 0) blessedTurns -= 1;
    // 护盾：按受益者各自行动递减（2026-10 用户裁定）
    const st = shieldTurns[id] ?? 0;
    if (st > 0) shieldTurns[id] = st - 1;
    if (id === 'jingyuan' && invitedTurns > 0) invitedTurns -= 1;
  };

  let guard = 0;
  while (events.length < maxEvents && guard < maxEvents * 2) {
    guard += 1;
    if (tryCastUlts()) continue;
    const ev: TimelineEvent | null = tl.advance();
    if (!ev) break;
    if (ev.time > maxTime) break;

    if (ev.type === 'roundBoundary') {
      record({ time: ev.time, round: ev.round, kind: 'round', unitId: '', spAfter: sp });
      continue;
    }

    const id = ev.unitId as AxisUnitId;
    if (id === 'countdown') {
      // 忆灵天赋 1151203：倒计时回合开始扣除 max(12, 50%当前气氛值)；
      // 气氛值为整数，扣除后向下取整（2026-10 用户确认）
      mood = Math.max(0, Math.floor(mood - Math.max(12, mood * 0.5)));
      const notes: AxisNote[] = [];
      if (mood === 0) {
        exitFever();
        notes.push('exitFever');
      }
      record({
        time: ev.time,
        round: ev.round,
        kind: 'action',
        unitId: 'countdown',
        spAfter: sp,
        note: notes.length > 0 ? notes : undefined,
      });
      tl.finishAction('countdown');
      continue;
    }
    if (id === 'shenjun') {
      const snapshot = stacks;
      const moodNotes = addMood(1 + guestBonus());
      record({
        time: ev.time,
        round: ev.round,
        kind: 'action',
        unitId: id,
        action: 'shenjun',
        spAfter: sp,
        stacks: snapshot,
        note: ['resetStacks', ...moodNotes],
      });
      actionCounts[id] = (actionCounts[id] ?? 0) + 1;
      stacks = 3;
      tl.speedChange('shenjun', shenjunSpeed());
      tl.finishAction(id);
      continue;
    }
    // 忆灵三只 = 同一单位「晴空乐手」（2026-10 用户裁定）：合并为一个单位 'memo'，
    // 一次行动气氛 +1（同一单位施放攻击，不再按在场只数聚合）
    if (id === 'memo') {
      // 忆灵技 1151201 sp_base=20：忆灵行动给晴歌回能（×充能效率）
      gainEnergy('qingge', 20);
      const moodNotes = addMood(1);
      record({
        time: ev.time,
        round: ev.round,
        kind: 'action',
        unitId: id,
        action: 'memo',
        spAfter: sp,
        energyAfter: energy.qingge,
        note: moodNotes.length > 0 ? moodNotes : undefined,
      });
      actionCounts[id] = (actionCounts[id] ?? 0) + 1;
      tl.finishAction(id);
      continue;
    }
    if (id === 'longling') {
      gainRhythm(); // 天赋141404：龙灵行动时补盾 → 晴歌/忆灵受盾
      const moodNotes = addMood(1);
      const notes: AxisNote[] = [
        ...(longlingEnhance > 0 ? (['enhanceAct'] as AxisNote[]) : []),
        ...moodNotes,
      ];
      record({
        time: ev.time,
        round: ev.round,
        kind: 'action',
        unitId: id,
        action: 'longling',
        spAfter: sp,
        note: notes.length > 0 ? notes : undefined,
      });
      actionCounts[id] = (actionCounts[id] ?? 0) + 1;
      if (longlingEnhance > 0) longlingEnhance -= 1;
      tl.finishAction(id);
      continue;
    }

    // 四名角色
    const result = charAction(id as CharId);
    const allNotes: AxisNote[] = [...result.notes];
    if (id === 'jingyuan') {
      traceWeirui();
      allNotes.push('traceWeiRui');
    }
    record({
      time: ev.time,
      round: ev.round,
      kind: 'action',
      unitId: id,
      action: result.type,
      spAfter: sp,
      energyAfter: energy[id as CharId],
      stacks: id === 'jingyuan' ? result.stacks : undefined,
      note: allNotes.length > 0 ? allNotes : undefined,
    });
    actionCounts[id] = (actionCounts[id] ?? 0) + 1;
    tl.finishAction(id);
    tickBuffs(id as CharId);
  }

  const last = events[events.length - 1];
  return {
    events,
    summary: {
      actionCounts,
      ultCount,
      totalTime: last ? last.time : 0,
      rounds: last ? last.round : 0,
      spFinal: sp,
      mood,
    },
    finalState: {
      sp,
      mood,
      stacks,
      // 护盾回合按受益者各自计数后，最终态取腾荒自身剩余回合（缺省 0）
      shieldTurns: shieldTurns['tenghuang'] ?? 0,
      blessedTurns,
      fever,
      rhythm,
      invitedTurns,
      energy,
      present: { ...present },
    },
  };
}
