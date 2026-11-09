/**
 * 存护·角色模块试点（2026-10-24，用户裁定「按命途做角色专属块，支持多会话并行」）。
 *
 * 目的：把「角色专属逻辑」从 battle.ts 的巨型闭包里抽出来，按命途落到独立文件，
 * 不同会话各写各的文件 → 不再争同一份 battle.ts 的版本锁。
 *
 * 约定（试点边界）：
 * - 模块**不 import battle.ts**（避免循环依赖）；所需状态由 battle.ts 组装成 `CharModuleCtx` 传入。
 * - 模块只负责自己的数值与状态；伤害流水线、行动条、buff tick、敌方回合等共享机制仍留在 battle.ts。
 * - 本试点只迁「不产生伤害、不读伤害流水线」的部分：进战初始化 / 自己回合开始 / 我方致命受击 / 进战秘技。
 *   普攻·战技·终结技仍走 battle.ts 的 charAction / 终结技分支（试点第二步再迁）。
 * - 模块保持**无战斗级状态**（escalation：单场次数等留在 battle.ts 的 let，由调用方守卫），
 *   这样同一份模块对象可以被多场战斗复用而不会串味。
 */

/** battle.ts 需要交给角色模块的上下文（只列试点用到的字段，后续按需扩） */
export interface CharModuleCtx {
  /** 已入队角色 id 集合（守卫用：模块函数可能被中央钩子无条件调用） */
  ids: ReadonlySet<string>;
  members: readonly {
    id: string;
    panel: { hp: number; defence: number; attack: number };
    eidolonLevel?: number;
  }[];
  /** 战斗内当前生命（成员 + 可受击忆灵共用一张表） */
  memberHp: Record<string, number>;
  shieldValues: Record<string, number>;
  shieldTurns: Record<string, number>;
  energy: Record<string, number>;
  isDead(id: string): boolean;
  panelOf(id: string): { hp: number; defence: number; attack: number };
  /** 能量上限（ENERGY_MAX） */
  energyMaxOf(id: string): number;
  /** 技能参数表（skillParams(id, level)） */
  skillParams(skillId: string, level: number): number[];
  /** 嘲讽值修正（加算点数；实例标识 = key+source+labelKey） */
  addTaunt(id: string, value: number, labelKey: string, source: string): void;
  /** 固定攻击力加成 */
  addAtkFlat(id: string, value: number, labelKey: string, source: string): void;
  /** 效果抵抗加成（比例） */
  addEffectRes(id: string, value: number, labelKey: string, source: string): void;
  /** 全队护盾（覆盖式；护盾量 = 防御×defPct + flat） */
  applyTeamShield(defPct: number, flat: number, turns: number, source: string): void;
  instantAction(id: string): void;
  /** 本次行动事件的 note 收集器 */
  notes: string[];
}

/** 角色模块（谁实现谁负责；battle.ts 只按 id 查表调用） */
export interface CharModule {
  readonly id: string;
  /** 战斗初始化（面板 / 生命 / 能量已就绪、行动条已建好） */
  onInit?(ctx: CharModuleCtx): void;
  /** 该角色自己的回合开始（行动值已推进、决策之前） */
  onTurnStart?(ctx: CharModuleCtx): void;
  /** 我方单位受到致命伤害；返回 true = 模块接管了免死 */
  onAllyLethal?(ctx: CharModuleCtx, targetId: string): boolean;
  /** 进战秘技（仅 config.techniques 为真时调用） */
  onTechnique?(ctx: CharModuleCtx): void;
}

/**
 * 杰帕德 1104（存护·冰）
 * 已裁定口径（2026-10-24 用户）：
 * - 行迹 point06「刚正」：被攻击概率提高 → 嘲讽 **+25**（参数不可读，按 25 落，待核）
 * - 行迹 point08「战意」：攻击力 = 当前防御力×35%，**每回合开始重算**
 * - 天赋 110404「不屈之身」：致命伤不死，回复生命上限 50%（E6 再 +50%）、**保留护盾**、
 *   单场 1 次、行迹 point07 能量回满、E6 立即行动
 * - E4「同仇敌忾」：在场时我方全体效果抵抗 +20%
 * - 秘技 110407「有情之证」：进战全队护盾 = 防御×#1 + #3，持续 #2 回合
 */
export const gepardModule: CharModule = {
  id: 'gepard',

  onInit(ctx) {
    ctx.addTaunt('gepard', 25, 'gepardP06', 'gepard');
    const e = ctx.members.find((m) => m.id === 'gepard')?.eidolonLevel ?? 0;
    if (e >= 4) {
      for (const m of ctx.members) {
        if (!ctx.isDead(m.id)) ctx.addEffectRes(m.id, 0.2, 'gepardE4', 'gepard');
      }
    }
  },

  onTurnStart(ctx) {
    ctx.addAtkFlat('gepard', ctx.panelOf('gepard').defence * 0.35, 'gepardP08', 'gepard');
  },

  onAllyLethal(ctx, targetId) {
    if (targetId !== 'gepard') return false;
    const e = ctx.members.find((m) => m.id === 'gepard')?.eidolonLevel ?? 0;
    const cap = Math.max(1, ctx.panelOf('gepard').hp);
    ctx.memberHp['gepard'] = cap * (0.5 + (e >= 6 ? 0.5 : 0));
    ctx.energy['gepard'] = ctx.energyMaxOf('gepard');
    if (e >= 6) ctx.instantAction('gepard');
    ctx.notes.push('gepardRevive');
    return true;
  },

  onTechnique(ctx) {
    const p = ctx.skillParams('110407', 1);
    ctx.applyTeamShield(p[0] ?? 0, p[2] ?? 0, Math.round(p[1] ?? 3), 'gepard');
  },
};
