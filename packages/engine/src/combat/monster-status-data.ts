/**
 * 敌方状态定义表（统一状态框架 · 2026-10-22 落地）
 *
 * 设计目标：新增敌方状态**只写数据**，不在 battle.ts 里散落逻辑。
 *   - 定义表（本文件）= 状态语义：层数上限、是否共享、阈值、参数、钩子说明。
 *   - 运行时实例 = `MonsterState.states`（id → 层数，0/缺失 = 不在场）
 *     + 战斗级共享池 `enemyStatusPool`（id → 层数，跨怪共享，如【嗜血】）。
 *   - 钩子位（battle.ts 统一调度）：回合开始 / 回合结束 / 受伤 / 死亡 / 破韧。
 *
 * 数据来源：本地 `data/monsters/*.json` 的技能文案与 extra 效果说明（主）
 *   + Dimbreath `MonsterSkillConfig.json` 的 ParamList（倍率/参数留档）
 *   + Dimbreath `MonsterStatusConfig.json` 的 ModifierName/ReadParamList（语义键）。
 *
 * 口径提醒：多数阈值（层数上限、概率、时长）**待核** → 一律写成可调参数（params），
 * 不写死；未接的半句写进 note，避免后人误以为是 bug。
 */

/** 状态类型：stack = 叠层；flag = 布尔开关；threshold = 达到阈值触发一次 */
export type EnemyStatusKind = 'stack' | 'flag' | 'threshold';

/** 钩子时机 */
export type EnemyStatusHook =
  | 'onApply'
  | 'onTurnStart'
  | 'onTurnEnd'
  | 'onDamaged'
  | 'onDeath'
  | 'onBreak';

export interface EnemyStatusDef {
  /** 状态 id（运行时 `states` 的键） */
  id: string;
  /** 中文名（备注用） */
  name: string;
  kind: EnemyStatusKind;
  /** 层数上限（stack 默认 1；超出则清零或截断，见 note） */
  maxStacks?: number;
  /** 共享池：层数在全场怪之间共享（【嗜血】：所有可月狂单位共享） */
  shared?: boolean;
  /** 达到该层数时触发一次效果（threshold 型） */
  threshold?: number;
  /** 可调参数（倍率/概率/时长/数量等；口径待核处写 note） */
  params?: Record<string, number>;
  /** 参与的钩子时机 */
  hooks?: EnemyStatusHook[];
  /** 留口/待核说明 */
  note?: string;
}

export const ENEMY_STATUS: Record<string, EnemyStatusDef> = {
  // ── 蚕食者之影 8003040 ──
  scaleMarks: {
    id: 'scaleMarks',
    name: '追忆刻度',
    kind: 'stack',
    maxStacks: 9,
    hooks: ['onDamaged'],
    note:
      '黄金年代的绸缪（800304004）蓄力给 9 层；每次受到我方攻击 -1 层（direct/elation/breakTrigger）；' +
      '黄金年代的解放（800304005）段数 = 剩余层数；层数耗尽 = 施放失败（0 段伤害）。',
  },
  // ── 摇滚狂徒 5013010 ──
  berserk: {
    id: 'berserk',
    name: '狂奏',
    kind: 'flag',
    maxStacks: 1,
    note: '阿哈时刻发动时给予（我为乐狂 501301006 被动）——阿哈时刻联动未接，暂由剧本/测试直调挂载。',
  },
  // ── 步离战首•呼雷 2034010 ──
  bloodRage: {
    id: 'bloodRage',
    name: '嗜血',
    kind: 'stack',
    shared: true,
    note:
      'Dimbreath 220340114 BloodRageMark（MDF_Layer = 共享层）；我方施放攻击后为可月狂单位各 +1；' +
      '回合结束时若场上所有可月狂单位均被击败则清零。层数阈值待核。',
  },
  fury: {
    id: 'fury',
    name: '怒意',
    kind: 'stack',
    maxStacks: 8,
    note:
      'Dimbreath 220340115/116 RageStatusEnhance/EnhanceSelf（MDF_SpeedAddRatioPerLayer = 每层加速）；' +
      '月狂时我方施放攻击后 +1（呼雷攻击额外 +1），我方施放攻击后 -1；叠到一定值释放【贪狼逐驰】并清空。' +
      '阈值待核（8 为 Dimbreath ParamList[0] 口径，需核）。',
  },
  moonRage: {
    id: 'moonRage',
    name: '月狂',
    kind: 'flag',
    maxStacks: 1,
    hooks: ['onTurnStart', 'onBreak'],
    note:
      'Dimbreath 220340112/113 RageStatus（MDF_SpeedUpRatio + MDF_SpeedUpRatioPerWolf）+ 220340101 extra；' +
      '嗜血达到指定层数进入；呼雷被弱点击破时解除。',
  },
  // ── 堕神之血•亚婆离 5034010 ──
  bloodBrainBarrier: {
    id: 'bloodBrainBarrier',
    name: '血脑屏障',
    kind: 'flag',
    maxStacks: 1,
    params: { hpRatio: 0.3, damageReduction: 0.8 },
    note:
      '生命值降低到一定值时获得（阈值比例/减伤幅度写在技能 503401008 的 selfStatusOnHp）：' +
      '韧性无法被削减、受到所有伤害大幅降低、欢愉伤害破除效率大幅提高；' +
      '获得时行动序列添加【稳态失衡】（行动序列未建模）；解除时自身受大量伤害（未接）。',
  },
  steadyImbalance: {
    id: 'steadyImbalance',
    name: '稳态失衡',
    kind: 'flag',
    maxStacks: 1,
    note: '血脑屏障获得时加入行动序列，行动时对屏障造成伤害（伤害比例待核）。',
  },
  gluttonyEye: {
    id: 'gluttonyEye',
    name: '贪饕之眼',
    kind: 'stack',
    note:
      '兽瞳百相（503401006 被动）：每次行动后 +1；回合结束时达到一定数量立刻施放【万物于我之中】。' +
      '计数不截断（阈值由技能数据的 selfStackOnTurn.threshold 给，ParamList[9]=40 待核）。',
  },
  illusion: {
    id: 'illusion',
    name: '幻身',
    kind: 'flag',
    maxStacks: 1,
    note:
      '堕神衰腐达一定层数陷入；幻身状态下我方角色及其召唤物离场，同时召唤【狂兽的胚芽】代替继续战斗' +
      '（胚芽视为我方角色）——我方离场/替身机制未建模。',
  },
};

/** 取状态定义（未知 id 返回 undefined；调用方自行兜底） */
export function enemyStatusDef(id: string): EnemyStatusDef | undefined {
  return ENEMY_STATUS[id];
}

/** 状态层数上限（stack 默认 1；未声明 = 不截断） */
export function enemyStatusMaxStacks(id: string): number | undefined {
  return ENEMY_STATUS[id]?.maxStacks;
}

/** 该状态是否走战斗级共享池（【嗜血】） */
export function enemyStatusShared(id: string): boolean {
  return ENEMY_STATUS[id]?.shared === true;
}
