import type { Element } from '@hsr-calc/shared';

/**
 * 敌方技能数据表。
 *
 * 2026-10-09：可可利亚（1004011 完整形态）技能脚本（用户裁定③「数据表+战斗挂点」）。
 * 2026-10-22：物竞天择其十二 6 怪（摇滚狂徒/蚕食者之影/步离战首•呼雷/正阳狮鹫/月夜天马/堕神之血•亚婆离）。
 *
 * 倍率来源：Dimbreath/turnbasedgamedata（GitLab project 62701613）`ExcelOutput/MonsterSkillConfig.json`
 * （ref=main，2026-10-09 / 2026-10-22 抓取），字段 ParamList[].Value = 伤害倍率（比值口径，2.25 = 225%）。
 * 本地 data/monsters/{id}.json 的 skill_list 无倍率、仅有文案（skill_name/skill_desc）。
 * 本地文案中英名（data/monsters/{id}.json zh/en .child[].skill_list[i].skill_name）同步录入 i18n enemySkills。
 *
 * 目标模式（target）：
 * - single：随机 1 名存活成员；blast：主目标 + 编队链相邻；aoe：全体存活成员；
 * - sweep：横扫（从左/右起连续 count 个目标，取 sweep.from / sweep.count）；
 * - locked：蓄力时锁定的目标（lockedAdjacent=true 时附带相邻目标）；
 * - random：连续多段随机单体（段数取 multiHit.countFrom）；
 * - self：非伤害技能（蓄力 / 自身增益 / 被动）。
 *
 * 裁定：AI = 伤害技能等概率随机（走种子 PRNG）；单体目标 = 随机存活成员；
 * PhaseList 全部可用（阶段阈值查不到，原值记录在此、不消费，待游戏内复核）。
 * 召唤物（狼群/狂兽的胚芽/流星铁鹰/冰锋）与被动状态机（月狂/血脑屏障/幻身/狂奏）留口。
 */
export type EnemyTargetMode = 'single' | 'blast' | 'aoe' | 'sweep' | 'locked' | 'random' | 'self';

/** 命中后施加的我方负面（控制类数值半句按既定裁定只挂标记，不接减速/禁锢模型） */
export type EnemyDebuffKind = 'freeze' | 'imprison' | 'fear' | 'decay' | 'devour';
export interface EnemySkillDef {
  /** 技能 id（事件 skillCode = `monster.${skillId}`，i18n 键 enemySkills.${skillId}） */
  skillId: string;
  /** 目标类型（见文件头说明） */
  target: EnemyTargetMode;
  /** 伤害倍率（比值口径）；缺省 = 非伤害技能 */
  multiplier?: number;
  /** 伤害属性（仅文档价值；敌方对我方结算抗性区恒 1，见 enemy-damage.ts） */
  damageType?: Element;
  /** 原始阶段限制（当前不消费，2026-10 裁定「全部可用」，待核） */
  phaseList: number[];
  /** 毒条/削减相关原始值（不消费，仅记录） */
  spHit: number;
  /** 蓄力：本次施放无伤害，下次行动强制改施放 nextSkillId */
  charge?: { nextSkillId: string };
  /** 蓄力时锁定我方目标数（点亮未来=1 / 两倍上弦月=2） */
  lock?: number;
  /** 横扫起点与连续目标数 */
  sweep?: { from: 'left' | 'right'; count: number };
  /** 连续多段随机单体：段数来源（scaleMarks = 【追忆刻度】层数） */
  multiHit?: { countFrom: 'scaleMarks' | 'fixed'; count?: number };
  /** 仅在【蓄力】释放窗口可选（黄金年代的解放：需【追忆刻度】层数 > 0） */
  requiresCharge?: boolean;
  /** 命中后施加的我方负面 */
  debuff?: {
    kind: EnemyDebuffKind;
    /** 基础概率 0~1（Dimbreath ParamList 实读；未标注者按文案「大概率/小概率」取 1，待核） */
    baseChance: number;
    /** 持续的行动次数 */
    duration: number;
    /** 层数阈值（【堕神衰腐】达该层数 → 该我方角色陷入【幻身】；缺省 = 不触发） */
    threshold?: number;
  };
  /** 命中后给我方目标叠加的印记（艾格勒/欧洛尼斯；达上限解除并附加伤害/减能量/纠缠——数值可调、待核） */
  mark?: {
    kind: 'aquila' | 'olonisi';
    maxStacks: number;
    /** 本种印记达上限时：属性伤害倍率（施加者攻击力 × 倍率 × 防御区；缺省 = 无伤害） */
    damageMultiplier?: number;
    /** 本种印记达上限时：减少的能量 */
    energyLoss?: number;
    /** 本种印记达上限时：陷入【纠缠】概率（纠缠 = 无法行动；速度降低半句留口） */
    entangleChance?: number;
    /** 同时持有另一种印记时：基于自身生命上限的真实伤害比例 */
    bothTrueDamageRatio?: number;
    /** 同时持有另一种印记时：减少的能量 */
    bothEnergyLoss?: number;
    /** 同时持有另一种印记时：陷入【纠缠】概率 */
    bothEntangleChance?: number;
  };
  /** 自身获得的状态（追忆刻度层数） */
  selfStacks?: { kind: 'scaleMarks'; value: number };
  /** 分支条件：怪物自身需处于某状态才走「分支形态」（燥起来吧的【狂奏】分支） */
  branchStatus?: { status: string };
  /** 分支形态对我方全体造成的伤害（走 computeEnemyDamage：敌攻×倍率×防御区，不吃抗性区） */
  allyDamage?: { multiplier: number; damageType?: Element };
  /** 命中后给我方目标施加的负面（陶醉 = 无法行动） */
  allyStatus?: { kind: 'drunk'; baseChance: number; duration: number };
  /** 非分支形态：使我方目标速度提高（比例 0~1，duration = 我方行动次数） */
  allySpeedUp?: { pct: number; duration: number };
  /** 使我方获得笑点（数量；走战斗既有 gainLaugh，队伍共享） */
  mirthGain?: number;
  /** 自身受到的伤害提高（演出彩排；比例 0~1） */
  selfVulnerable?: { pct: number; duration: number };
  /** 阿哈时刻发动时取消本次蓄力（演出彩排） */
  cancelChargeOnAha?: boolean;
  /** 被动授予的状态（我为乐狂 → 狂奏） */
  passiveGrantStatus?: { status: string; stacks: number };
  /**
   * 被动：每次行动后自身叠层（兽瞳百相 503401006 → 贪饕之眼）；
   * 回合结束时层数达 threshold → 立刻施放 castSkillId（万物于我之中）。
   */
  selfStackOnTurn?: {
    /** 叠层状态 id（gluttonyEye = 【贪饕之眼】） */
    status: string;
    /** 每次行动叠加层数 */
    stacks: number;
    /** 触发阈值（层数） */
    threshold: number;
    /** 达阈值立刻施放的技能 id */
    castSkillId: string;
  };
  /**
   * 被动：自身生命值比例低于 hpRatio 时获得状态（血脑屏障 503401008）；
   * 状态期间受到的伤害按 damageReduction 降低（走 zoneSnapshot.damageReductions 怪侧减伤乘区）。
   */
  selfStatusOnHp?: {
    /** 状态 id（bloodBrainBarrier = 【血脑屏障】） */
    status: string;
    /** 生命比例阈值（0~1；低于即触发） */
    hpRatio: number;
    /** 状态期间的伤害降低比例（0~1，0.8 = 只吃 20% 伤害） */
    damageReduction: number;
    /** 解除时自身受到的伤害比例（按自身生命上限；0.98 待核） */
    selfDamageRatio?: number;
    /** 【稳态失衡】行动序列条目延迟（回合数；缺省 = 不插入） */
    steadyRounds?: number;
    /** 屏障期间【欢愉】伤害的削韧效率倍率（「欢愉伤害破除效率大幅提高」；缺省 = 不可削韧） */
    elationBreakMultiplier?: number;
  };
  /**
   * 宏观生态系统（亚婆离 503401003）：吞噬指定敌方召唤物 → 自身伤害提高 + 回复生命。
   * 有存活召唤物时才进入 AI 候选池。
   */
  consumeSummon?: {
    /** 被吞噬的召唤物档案 id（狂兽的胚芽 = 503201002） */
    monsterId: string;
    /** 吞噬后自身造成的伤害提高（atkPct，0.1 = 10%） */
    atkPct: number;
    /** 吞噬后回复生命比例（按自身生命上限；0.04 待核） */
    healRatio: number;
  };
  /**
   * 被动：召唤物被击杀时的联动（胎儿之梦 503401007）——
   * 「胚芽被击杀使【堕神之血】生命值降低 / 击杀胚芽增加充能」（数值待核）。
   */
  summonDeathEffect?: {
    /** 召唤者生命值降低比例（按召唤者生命上限；0.02 = 2%） */
    hpRatio?: number;
    /** 击杀时给召唤者叠加的状态（贪饕之眼充能） */
    statusOnOwner?: { status: string; stacks: number };
  };
  /**
   * 我方施放攻击后 → 敌方单位共享层数（战首月狂 203401006 / 狼吞 203201002）
   * 「敌方施放攻击后为可进入【月狂】的敌方单位附加 1 层【嗜血】；达到指定层数进入【月狂】」
   */
  allyAttackStatus?: {
    /** 共享层数状态 id（bloodRage = 【嗜血】，战斗级共享池） */
    status: string;
    /** 每次我方攻击追加的层数 */
    stacks: number;
    /** 达到该层数 → 可月狂单位进入 thresholdStatus */
    threshold: number;
    /** 达阈值进入的状态（moonRage = 【月狂】） */
    thresholdStatus: string;
    /** 进入 thresholdStatus 时的速度提高比例（0~1；0.8 待核） */
    speedPct?: number;
    /**
     * 【月狂】额外技能（2026-10-23 用户裁定：加入 AI 候选池 → 该技能被选中的频率提高）。
     * 数据驱动、待核：呼雷 = 203401005【贪狼逐驰】，狼卒 = 各自攻击技能。
     */
    extraSkillId?: string;
    /**
     * 【月狂倒计时】回合数（进入【月狂】时在行动序列插入倒计时条目；到点全体解除月狂）。
     * 推测 = ParamList[2]=6，待核。
     */
    countdownRounds?: number;
    /**
     * 进入 thresholdStatus 时自身受到的伤害降低（2034014【噬月】= 减伤但不再提速；并入减伤乘区）。
     */
    dmgReduction?: number;
    /**
     * 进入 thresholdStatus 时**立即施放**的技能（2034014【噬月】→ 施放【孤战】）：
     * 设置蓄力窗 + 插入一次行动，保证下一动必放该技能。
     */
    onEnterSkillId?: string;
    /**
     * 【怒意】按「我方回合结束 −1」口径衰减（2034014 狼啸八方），归零退出 thresholdStatus。
     * 2034010 的怒意走 `furyOnEnemyAttack`（敌方攻击叠加）另一套口径。
     */
    furyDecayOnAllyTurnEnd?: boolean;
  };
  /**
   * 【血鸣狂噬】（2034014 被动）：进入【噬月】前**韧性无法被削减**（噬月期间才可削韧）。
   * 与 `allyAttackStatus` 配合：只有该被动 + 未进入 thresholdStatus 时生效。
   */
  untouchableToughness?: boolean;
  /**
   * 【孤战】（2034014 203401409）：选定 1 名我方（及其召唤物）进入 1v1，其余我方/敌方**离场**；
   * 自身按我方全体的生命上限/攻击力提高血量与攻击，我方回复战技点；【血涌】层数转【战血激昂】。
   */
  duel?: {
    /** 进入孤战时我方回复的战技点 */
    spRestore: number;
    /** 自身生命上限提高比例（占位） */
    selfHpRatio: number;
    /** 自身攻击力提高比例（占位） */
    selfAtkRatio: number;
    /** 每层【血涌】给自身额外攻击力提高比例（【战血激昂】） */
    bloodSurgeAtk: number;
  };
  /**
   * 【怒意】（呼雷 203401007 啸月之狼）：
   * - 仅在自身处于【月狂】时生效；
   * - 敌方单位施放攻击后叠加层数（自身攻击额外 +1 层）；
   * - 我方施放攻击后层数 −1（归零时削减自身韧性并重置层数）；
   * - 达到阈值 → 释放指定技能并清空层数。
   * 数值全部可调、待核（ParamList[0]=8 阈值 / [2]=180 韧性削减）。
   */
  furyOnEnemyAttack?: {
    /** 状态 id（fury = 怒意） */
    status: string;
    /** 每次敌方攻击叠加层数 */
    stacks: number;
    /** 自身攻击时额外叠加层数 */
    selfExtra: number;
    /** 达到该层数释放技能并清空 */
    releaseThreshold: number;
    /** 释放的技能 id */
    castSkillId: string;
    /** 我方攻击使层数归零时的韧性削减量 */
    toughnessCut: number;
  };
  /** 召唤敌方召唤物（听我孤嚎 → 玄爪狼卒/蚀月狼卒；降示黎明 → 流星铁鹰） */
  summon?: {
    /** 召唤物 id（见 monster-summon-data.ts 的 SUMMON_MONSTERS）；数组 = 随机选其一 */
    monsterId: string | string[];
    /** 每次施放召唤数量 */
    count: number;
    /** 同时存在上限（超过则不再召唤） */
    maxAlive: number;
  };
  /** 自身受到的伤害降低（流年盾纱被动；并入 zoneSnapshot.damageReductions） */
  selfDamageReduction?: number;
  /**
   * 命中后给我方目标施加【触电】（末日 2004014；rulings 3「我方 DoT 框架」2026-10-30）：
   * 每回合（持有者行动开始）结算 1 次雷属性伤害 = 敌攻 × multiplier × 防御区；
   * 可被「处于触电状态」条件句消费（亡者切齿呢喃的全体追伤 / 颤慄的立即结算）。
   */
  shock?: {
    /** 每跳倍率（占位 1，见 rulings 1A） */
    multiplier: number;
    /** 基础概率（吃效果抵抗） */
    baseChance: number;
    /** 持续回合 = 结算次数 */
    duration: number;
    /** 扩散：仅当**主目标命中前**已处于触电时，副目标（扩散/全体）也触电（月光摩挲连绵） */
    spreadFromMain?: boolean;
  };
  /** 命中后使主目标陷入【支配】（行动提前到当前 + 强制攻击我方随机 1 人，随后解除） */
  dominate?: {
    /** 基础概率（吃效果抵抗；【支配】按控制类口径，符玄 point08 可抵） */
    baseChance: number;
    /** 保留：支配持续（当前实现 = 立即结算后解除，留档） */
    duration?: number;
  };
  /**
   * 【心理暗示】+【揭晓】（2004014）：随机多名我方目标进入【心理暗示】，
   * 并在行动序列插入【揭晓】定时条目；到点时被暗示者陷入【支配】。
   */
  suggest?: {
    /** 施加目标数 */
    count: number;
    baseChance: number;
    /** 【揭晓】延迟（轮次；与月狂倒计时同口径 = ROUND_AV × n） */
    revealDelayRounds: number;
  };
  /** 被动：自身攻击命中已处于【触电】的目标时，立即结算 1 次触电伤害（颤慄） */
  shockDetonate?: boolean;
  /** 被动：被【支配】的我方目标攻击已触电的我方目标时，追加 1 次雷击（残酷） */
  dominateDetonate?: boolean;
  /**
   * 命中后把目标「已损失生命」的一部分转化为【侵蚀】（4064012 罪血锯刑/罪血钳刑）：
   * 降低可回复生命上限（复用源质吞噬先例，2026-10-30 rulings 6）。
   */
  erosion?: { ratio: number };
  /**
   * 命中「持有护盾」的目标 → 触发【壁垒反震】：自身叠 1 层防御力降低（4064012）。
   * 文案只有一句「触发时自身获得 1 层防御力降低」，层数/数值按占位参数。
   */
  shieldCounter?: boolean;
  /**
   * 【罪血眈视】（406401203）：锁定 1 名我方 + 自身加速 + 施放后再行动 1 次；
   * 锁定窗口内只施放【罪血嚼齿】/【罪血锯刑】且主目标恒为锁定目标。
   */
  judge?: { turns: number; speedPct: number; extraAction?: boolean };
  /** 被点名蓄力目标承受的倍率倍数（罪血枭首的「大量伤害」；占位 ×2） */
  designatedMultiplier?: number;
  /** 命中后按「未被护盾抵消的伤害 × ratio」施加【罪血腐蚀】（罪血枭首；同样降低可回复上限） */
  corrode?: { ratio: number };
  /** 被动【强化防御】（皮糙肉厚 406401208）：战斗开始时自身获得大幅防御提高（= 减伤乘区），被弱点击破解除 */
  hardenedDefence?: { dmgReduction: number };
  /**
   * 施放该技能时**我方获得笑点**（帕姆王 5014020/5014023 的「笑点获取」：无死角洗涤 /
   * 强效肥皂泡 / 饱和式大扫除 / 洗地机之乱）。走 `gainLaugh`，与欢愉角色同一账本。
   */
  laughGain?: number;
  /**
   * 命中后给我方挂**通用持续伤害**（2023030 承露天人「风化」/ 5014030 绘世「灼烧」）：
   * 复用触电的同一套框架（持有者行动开始时结算，伤害快照 = 敌攻 × 倍率 × 防御区）。
   */
  allyDot?: {
    /** 种类（wind = 风化 / burn = 灼烧 / bleed = 裂伤） */
    kind: 'wind' | 'burn' | 'bleed';
    multiplier: number;
    baseChance: number;
    duration: number;
    /**
     * 【怨火灼身】（5014030 绘世，2026-11-02 用户裁定）：该 DoT 带「行动前二选一」——
     * 【忍耐灼烧】(回 1 SP / 跳过本回合 / 解除 / 【忍耐】减伤 1 回合)
     * 或【扑灭火焰】(耗 1 SP / 33%→66%→100% 判定 / 成功解除并清零计数 / 失败吃一次火伤、本回合照常行动)。
     */
    emberChoice?: boolean;
  };
  /** 【掩护支援】（银鬃炮手 1002030）：其他敌方攻击我方后，本怪对同一目标施放 1 次追加攻击 */
  supportFollowUp?: { multiplier: number };
  /**
   * 【震荡】两段式（幽府武弁 2002030 锯恶）：先挂【震荡】标记；该目标**再次被敌方命中**时
   * 转为【强烈震荡】= 跳过下一次行动（复用禁锢的跳过口径）。
   */
  stagger?: { baseChance: number; skipTurns: number };
  /** 支援友方怪（授勋/盾 3021020/3021040）：给指定怪挂可叠加的增益 */
  supportBuff?: {
    targetMonsterId: string;
    key: 'atkPct' | 'dmgReduction';
    value: number;
    labelKey: string;
  };
  /** 命中后给我方挂状态标记（3003050【荒宴醉】/【欢宴罪】等；只挂标记与文案） */
  allyMark?: {
    kind: string;
    baseChance: number;
    duration: number;
    /** 只作用于主目标（单体） */
    mainOnly?: boolean;
  };
  /** 【冰点】（8003010 汲取霜晶）：施放后自身进入冰点状态（可施放永冬之雨） */
  frostPoint?: boolean;
  /** 只有处于【冰点】状态时才可选（永冬之雨）：AI 选招过滤 */
  requiresFrostPoint?: boolean;
  /**
   * 【破晓力场】（5013060/5013040 破晓意志）：韧性不可削 + 免疫控制 + 受击计数达上限后施放【破晓退散】。
   * `onElement` = 受该属性攻击时立即行动。
   */
  forceField?: {
    /** 受到该属性攻击时立即行动 */
    element?: string;
    /** 受到多少次攻击后施放退散 */
    attacks: number;
    /** 力场期间受到的伤害降低（可选） */
    dmgReduction?: number;
  };
  /** 力场期间的固定攻击技（破晓剑影舞）：力场激活时 AI 只选它 */
  forceFieldSkill?: boolean;
  /** 【失意】（破晓退散）：受到的伤害提高 + 自身该属性抗性降低（释放时一次性挂上） */
  dispirited?: { vulnerability: number; resDown: number; turns: number };
  /** 【盾反】（1003010 银鬃尉官）：进入反击状态，受到我方单体攻击后行动提前并立即施放指定技能 */
  counterStance?: { skillId: string; rounds: number };
  /** 命中后立即结算并清除我方**全部**持续伤害（3003050 为你洗去一切罪） */
  dotDetonateAll?: boolean;
  /**
   * 我方每次攻击命中 → 自身该状态 −delta（异相仲裁：灯塔【众愿】、长右【元气】、帕姆王【长效抗菌】）。
   * 归零时的收束效果用 `counterZero` 表达。
   */
  allyAttackCounter?: { status: string; delta: number };
  /** 敌方单位对我方施放攻击后 → 自身该状态 +delta（灯塔【众愿】+1） */
  enemyAttackCounter?: { status: string; delta: number };
  /** 施放时给自身叠加通用状态（长右【元气】+3 / 灯塔【众愿】/ 帕姆王【长效抗菌】） */
  selfState?: { status: string; value: number };
  /**
   * 形态切换（赞达尔 4044010）：施放时把 from 状态清 0、to 状态置 1。
   * 【化形公式】的「每次切形态自身受伤提高」用同一条上的 `selfVulnerable` 表达。
   */
  formSwitch?: { from: string; to: string };
  /**
   * 强化次数放大（赞达尔 求解：第一因之果）：倍率 ×(1 + perStack × 当前层数)，
   * 并按层数使我方 `entanglePerStack × 层数` 名角色陷入【纠缠】；`clear` 为 true 时清空层数。
   */
  enhanceStacks?: { status: string; perStack: number; entanglePerStack: number; clear: boolean };
  /**
   * 让友方敌方单位立即行动并挂 buff（赞达尔 潜能实现猜想）：
   * 选一只存活的其他怪 → `tl.instantAction` + 挂 `buff`（key/value/labelKey）。
   */
  allyAdvance?: { pct: number; buff?: { key: string; value: number; labelKey: string } };
  /** 给除自身外的全部敌方单位挂 buff（赞达尔 DEFRAG 生命优化【风行】/【「律法」的惩戒】） */
  sideBuff?: { key: string; value: number; labelKey: string };
  /** 命中后使目标行动提前 + 解除该目标的控制状态 + 挂印记（赞达尔 二律背反） */
  allyCleanseAdvance?: { advancePct: number; mark: string; markLabel: string };
  /** 施放时消耗自身状态层数（长右【猱击】消耗 1 层【元气】） */
  consumeSelf?: { status: string; delta: number };
  /** 怒啸（长右）：叠加状态 + 把随机我方标记为【监视目标】，我方施放战技后改标最新施放者 */
  retargetMark?: { status: string; stacks: number };
  /** 计数状态归零 / 或状态退出时的一次性收束（灯塔：解除控制与【除恶】+ 行动延后 + 我方全体【失堕】+ 移除【鼓舞】） */
  counterZero?: {
    /** 归零时清除的 flag 状态（例如【除恶】） */
    clearFlag?: string;
    /** 自身行动延后比例 */
    delaySelf?: number;
    /** 我方全体挂上的标记（失堕） */
    markAllies?: string;
    /** 移除敌方全体身上由该来源挂上的受伤降低（鼓舞） */
    removeSideBuff?: string;
    /** 自身受到的生命上限比例伤害（占位） */
    selfDamageRatio?: number;
  };
  /** 命中后消耗我方标记（乐变化天人·极乐螺旋：移除【极乐】→ 行动延后 + 少 1 战技点） */
  consumeMark?: { kind: string; delayAllies: number; spLoss: number };
  /** 【弱点无效】（灯塔【不屈正义】/ 帕姆王【值日准备中】）：挂着时自身韧性不可削 */
  weaknessInvalid?: boolean;
  /** 为敌方全体（含自身与召唤物）按某状态层数挂受伤降低（灯塔【鼓舞】：每层 −perStack） */
  sideInspire?: { perStackStatus: string; perStack: number };
  /** 伤害由我方全体**平均分摊**（玻吕刻斯 长眠者厚土安葬：倍率 ÷ 存活人数） */
  splitAmongAllies?: boolean;
  /**
   * 【衰亡伤害】（玻吕刻斯）：对生命值百分比**高于** hpRatio 的目标追加一段
   * 「目标生命上限 × hpPct」的伤害，且 `nonLethal` 时不致命（至少留 1 点生命）。
   */
  declineDamage?: { hpRatio: number; hpPct: number; nonLethal: boolean };
  /** 自身受到的伤害一部分转化为【侵蚀】（深魇蝗灾 旋覆甲壳）；施放 restoreOnSkillId 时回血并清空 */
  selfErosion?: { ratio: number; restoreOnSkillId: string };
  /** 受到 N 次我方攻击后行动提前（飓风大母 请泊舟暂歇：默认 3 次 / +20%） */
  advanceOnHits?: { hits: number; advancePct: number };
  /**
   * 【战甲】（天谴斗士 4012010 / 天谴先锋 4013010）：
   * 受击 −1 层；归零 → 破坏（自身受上限比例伤害 + 行动延后 + 破坏者回能）；
   * 破坏后受击额外受伤；自身回合结束恢复满层。
   */
  armor?: {
    stacks: number;
    dmgReduction: number;
    breakDamageRatio: number;
    breakEnergy: number;
    delaySelf: number;
  };
  /** 施放时立即回复**敌方全体**生命（自动机兵•战犬 自愈模块：按生命上限比例） */
  healSide?: { hpRatio: number };
  /**
   * 死亡钩子（2026-10-30 第十四批）：该敌方单位被消灭时触发（每只怪只跑一次）。
   * 由引擎的 `processEnemyDeaths()` 统一扫描，不必逐伤害点挂载。
   */
  onDeath?: {
    /** 我方获得笑点（丑照特写 / 线路故障） */
    laughPoints?: number;
    /** 我方获得欢愉度（0.05 = +5%，丑照特写） */
    elationDegree?: number;
    /** 相邻敌方单位行动提前比例（嗥吠：0.2 = 20%） */
    adjacentAdvance?: number;
    /** 对**我方全体**造成的属性伤害（蛰亡语：倍率占位 1） */
    alliesDamage?: { multiplier: number; damageType?: Element };
    /** 让我方全体获得的「受到伤害提高」（蛰亡语：pct 比例） */
    alliesVulnerable?: { pct: number };
    /** 使指定敌方单位失去层数（为我设奠 → 盗火行者【灾难之力】-1） */
    ownerStatusDown?: { monsterId: string; status: string; delta: number };
    /** 给**击杀者**叠「受到伤害提高」层数（颠仆的星花阶石：可叠加） */
    vulnKiller?: { pct: number; stacks: number };
    /** 给**击杀者**施加护盾（飞速欲念摹本：按击杀者生命上限比例） */
    shieldKiller?: { hpRatio: number };
  };
  /**
   * 我方敌方单位被消灭时，**本怪**立即行动并施放指定技能（仇隙 403203003 →
   * 「当其他敌方单位被消灭时，自身立即行动，施放一次【仇心忿火】」）。
   * 同一次阵亡只允许 1 只怪触发（按「场上存在多个时同时最多只能触发 1 个」）。
   */
  onAllyDeath?: { skillId: string };
  /**
   * 开局召唤（2026-10-30 第十七批）：战斗开始（延到首个我方回合开始前）自动召唤。
   * 巴姆王【洗地机之乱】→ 合金保姆；金血忆灵【化整为零】→ 雉形/犬形/翼蛇形。
   */
  startSummon?: { monsterId: string | string[]; count: number; maxAlive: number };
  /**
   * 【化整为零】开局分裂（金血忆灵 4064012，2026-10-30 第二十三轮）：
   * 本体分裂为若干【金血忆灵】（获得【合而为一】），本体进入【假死】并获得【血脉衰弱】。
   */
  splitOnStart?: { monsterIds: string[]; bloodWeak: number };
  /**
   * 【连麦PK】开启（火花大会 501401006 抬你上麦）：把 1 名我方角色隔离到**副战场**，
   * 并召唤副战场敌方单位（一阶段 3 只攻击性阅读物 / 二阶段 4 只 + 直播小助手）。
   * 倒计时用 `tl.scheduleAction` 挂 200 行动值（占位 2 回合，裁定 55）。
   */
  openPk?: {
    /** [一阶段数量, 二阶段数量] */
    phaseCounts: [number, number];
    /** 每只副战场小怪的档案 id（副战场敌方目标） */
    subMonsterId: string;
    /** 二阶段额外单位（直播小助手） */
    helperId?: string;
    /** 倒计时行动值（占位 200） */
    countdown: number;
  };
  /** PK 解除分支（全灭 = 成功；未全灭 = 失败）；两套由不同技能分别声明 */
  pkResolve?: {
    /** 'success' 副战场敌方全灭；'fail' 仍有存活 */
    branch: 'success' | 'fail';
    /** success：敌方全体受到的伤害提高（比例） */
    enemyVulnerability?: number;
    /** success：敌方全体行动延后（比例） */
    enemyDelay?: number;
    /** success：恢复战技点 */
    recoverSp?: number;
    /** success：阿哈额外回合（固定计入的笑点） */
    ahaExtraLaugh?: number;
    /** fail：对副战场角色的量子伤害倍率（占位） */
    subDamageMultiplier?: number;
    /** fail：使副战场角色陷入【纠缠】 */
    entangle?: boolean;
  };
  /** 【好感度调整】：对 1 号输出端攻击 → 我方人气值 +1；对 2 号输出端攻击 → 对方人气值 −1 */
  favorGauge?: { mineGain: number; foeLoss: number; advancePct: number };
  /** 【粉丝的狂欢】：PK 期间主战场敌方减伤（免疫控制为口径内附带） */
  fansParty?: { reduction: number };
  /** 【推流】：副战场敌方行动提前 + 暴击率提高（暴击不进敌方公式，仅记录） */
  pushTraffic?: { advancePct: number; critRateUp: number };
  /** 为敌方单位（含自身）附加【风行】：其回合结束时立即行动（流星铁鹰 如流星闪耀） */
  windWalk?: { turns: number };
  /** 命中后对所有处于【触电】的我方目标追加雷伤（亡者切齿呢喃） */
  shockSplash?: { multiplier: number };
  /** 命中锁定目标时附带其相邻目标（赞美艾格勒） */
  lockedAdjacent?: boolean;
  /** 使我方全体行动延后（比例 0~1；裂地三舍） */
  delayAllies?: number;
  /** AI 权重（缺省 = 等概率） */
  weight?: number;
  /** Dimbreath 原始 ParamList（留档不消费） */
  params?: number[];
  /** 被动：不参与 AI 选择 */
  passive?: boolean;
  /** 留口说明（未实现的半句与待核数值） */
  note?: string;
}

/** 怪物 id → 技能表（含蓄力/被动；倍率缺省者 AI 不选） */
export const ENEMY_SKILLS: Record<string, EnemySkillDef[]> = {
  // 可可利亚（1004011 完整形态，LittleBoss，弱火雷量子）——7 技能全录，4 伤害可选
  '1004011': [
    { skillId: '100401101', target: 'single', multiplier: 2.25, damageType: 'Ice', phaseList: [1, 2, 3], spHit: 10 },
    // 召唤冰锋：无伤害（裁定④跳过，记待核）
    { skillId: '100401102', target: 'single', phaseList: [1, 2, 3], spHit: 0 },
    { skillId: '100401103', target: 'aoe', multiplier: 3.75, damageType: 'Ice', phaseList: [2, 3], spHit: 20 },
    // 主倍率 1.5；ParamList[1]=1 作冻结基础概率（文案“大概率”；2026-10 效果抵抗接入）
    {
      skillId: '100401104',
      target: 'single',
      multiplier: 1.5,
      damageType: 'Ice',
      phaseList: [1, 2, 3],
      spHit: 10,
      debuff: { kind: 'freeze', baseChance: 1, duration: 1 },
    },
    // 蓄力（Monster_APShow_OneTurn）：无当次伤害（裁定④跳过，记待核）
    { skillId: '100401105', target: 'single', phaseList: [2, 3], spHit: 0 },
    // 主倍率 3.75；第二参数 1.5 = 对冻结目标提高（冻结未实现 → 不消费，记待核）
    { skillId: '100401106', target: 'blast', multiplier: 3.75, damageType: 'Ice', phaseList: [2, 3], spHit: 10 },
    // 被动「愈寒愈烈」增伤：无伤害（裁定④跳过，记待核）
    { skillId: '100401107', target: 'single', phaseList: [1, 2, 3], spHit: 0 },
  ],

  // ===== 物竞天择其十二 6 怪（2026-10-22；倍率取 Dimbreath ParamList[0]）=====
  // 摇滚狂徒 Rocking Rebel（5013010，Elite，弱 物理/火/风）
  '5013010': [
    {
      skillId: '501301001',
      target: 'sweep',
      sweep: { from: 'left', count: 3 },
      multiplier: 2.8,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
    },
    {
      skillId: '501301002',
      target: 'sweep',
      sweep: { from: 'right', count: 3 },
      multiplier: 2.8,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
    },
    {
      // 演出彩排：进入蓄力，下次行动施放【摇滚时刻！】；阿哈时刻发动时解除蓄力 + 我方获得笑点 + 自身易伤
      skillId: '501301003',
      target: 'self',
      charge: { nextSkillId: '501301004' },
      phaseList: [1],
      spHit: 0,
      params: [6, 10, 0.4, 2],
      cancelChargeOnAha: true,
      mirthGain: 2,
      selfVulnerable: { pct: 0.4, duration: 1 },
      note: '演出彩排：蓄力 → 摇滚时刻；阿哈时刻发动时解除蓄力 + 我方获得笑点（ParamList[3]=2 推测）+ 自身易伤 40%（ParamList[2]=0.4 推测），数值待核',
    },
    {
      skillId: '501301004',
      target: 'aoe',
      multiplier: 5,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 20,
      requiresCharge: true,
      note: '摇滚时刻！：演出彩排蓄力后释放（下次行动施放），全体大量虚数伤害',
    },
    {
      // 燥起来吧：非【狂奏】分支 = 使我方（自身以外的敌方目标）速度提高；【狂奏】分支 = 虚数伤害 + 概率【陶醉】+ 我方获得笑点
      skillId: '501301005',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      params: [0.5, 0.5, 2, 1, 1, 0.1, 120, 10],
      branchStatus: { status: 'berserk' },
      allyDamage: { multiplier: 0.5, damageType: 'Imaginary' },
      allyStatus: { kind: 'drunk', baseChance: 0.5, duration: 1 },
      mirthGain: 2,
      allySpeedUp: { pct: 0.1, duration: 1 },
      note: '燥起来吧：狂奏分支 = 虚数伤害 ×0.5（ParamList[0]）+ 概率陶醉 0.5（[1]）+ 笑点 2（[2]）；非狂奏分支 = 速度提高 10%（[5]）；ParamList[6][7] 含义待核',
    },
    {
      skillId: '501301006',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      passiveGrantStatus: { status: 'berserk', stacks: 1 },
      note: '我为乐狂（被动）：阿哈时刻发动时自身获得【狂奏】——由 ahaMoment 行动瞬间统一派发',
    },
  ],

  // 蚕食者之影 Decaying Shadow（8003040，Elite，弱 火/雷/风）
  '8003040': [
    {
      skillId: '800304002',
      target: 'single',
      multiplier: 3,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
      debuff: { kind: 'imprison', baseChance: 0.2, duration: 1 },
      note: '流年金刺：禁锢概率 0.2 来自【流年盾纱】被动（ParamList[1]），数值半句留口',
    },
    {
      skillId: '800304003',
      target: 'single',
      multiplier: 5,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 15,
      debuff: { kind: 'imprison', baseChance: 0.2, duration: 1 },
    },
    {
      // 黄金年代的绸缪：进入蓄力并获得 9 层【追忆刻度】（层数取本地文案），下次行动施放【黄金年代的解放】
      skillId: '800304004',
      target: 'self',
      charge: { nextSkillId: '800304005' },
      phaseList: [1],
      spHit: 0,
      selfStacks: { kind: 'scaleMarks', value: 9 },
      note: '黄金年代的绸缪：ModifierList=Monster_APShow_OneTurn、DelayRatio=2（蓄力 2 拍）',
    },
    {
      // 黄金年代的解放：连续对我方随机单体造成少量虚数伤害，次数 = 剩余【追忆刻度】层数；无刻度则施放失败
      skillId: '800304005',
      target: 'random',
      multiplier: 2.25,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 5,
      multiHit: { countFrom: 'scaleMarks' },
      requiresCharge: true,
    },
    {
      skillId: '800304006',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      selfDamageReduction: 0.1,
      params: [0.1, 0.2, 0.5],
      note: '流年盾纱（被动）：自身受到的普攻/战技/终结技/追加攻击伤害 -10%（ParamList[0]）；禁锢 0.2（ParamList[1]）；ParamList[2]=0.5 含义待核',
    },
  ],

  // 步离战首•呼雷 Borisin Warhead: Hoolay（2034010，LittleBoss，弱 物理/火/风）
  '2034010': [
    {
      skillId: '203401001',
      target: 'single',
      multiplier: 2,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
    },
    {
      skillId: '203401002',
      target: 'blast',
      multiplier: 1.8,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 15,
      params: [1.8, 1.5],
      note: '斩铁成爪：单体及相邻目标雷伤害；ParamList[1]=1.5 含义待核（相邻倍率？削韧？）',
    },
    {
      // 裂地三舍：使除自身外的所有目标行动延后，并造成少量雷属性伤害
      skillId: '203401003',
      target: 'aoe',
      multiplier: 0.2,
      damageType: 'Thunder',
      phaseList: [2],
      spHit: 0,
      delayAllies: 0.3,
      params: [0.2, 0.3, 0.5, 1000],
      note: '裂地三舍：Dimbreath DamageType 缺失（文案为雷）；延后比例待核，暂取 ParamList[1]=0.3',
    },
    {
      skillId: '203401004',
      target: 'aoe',
      multiplier: 2,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 15,
    },
    {
      skillId: '203401005',
      target: 'single',
      multiplier: 5,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 15,
      debuff: { kind: 'fear', baseChance: 1, duration: 2 },
      params: [5, 1, 60],
      note: '贪狼逐驰：单体大量雷伤害 + 大概率【恐惧萦绕】（ParamList[1]=1 取必定，待核）；恐惧数值半句留口',
    },
    {
      skillId: '203401006',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      params: [0.4, 4, 6, 0.8],
      allyAttackStatus: {
        status: 'bloodRage',
        stacks: 1,
        threshold: 4,
        thresholdStatus: 'moonRage',
        speedPct: 0.8,
        extraSkillId: '203401005',
        countdownRounds: 6,
      },
      note: '战首月狂（被动）：我方施放攻击后为可月狂单位叠加 1 层共享【嗜血】（ParamList[1]=4 层阈值），达阈值进入【月狂】（速度提高 80%，ParamList[3]=0.8，待核）；【月狂】额外技能与倒计时留口',
    },
    {
      skillId: '203401007',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 10,
      params: [8, 3, 180, 4, 0.25],
      furyOnEnemyAttack: {
        status: 'fury',
        stacks: 1,
        selfExtra: 1,
        releaseThreshold: 8,
        castSkillId: '203401005',
        toughnessCut: 180,
      },
      note: '啸月之狼（被动）：【怒意】层数与【贪狼逐驰】联动留口',
    },
    {
      skillId: '203401008',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      params: [0, 0.15, 0.33],
      summon: { monsterId: ['203201003', '203202004'], count: 1, maxAlive: 2 },
      note: '听我孤嚎，群狼追从（被动）：每次行动召唤【玄爪狼卒】/【蚀月狼卒】（ParamList[1]/[2] 含义待核）',
    },
  ],

  // 2034014 雷奔云谲的恶狼主 Hoolay, Thunderous Wolf Sovereign（末日 P21 星启，LittleBoss）
  // 与 2034010 呼雷同源（技能名一致），差异 = 【噬月】（韧性锁 + 减伤，非提速）+【孤战】1v1 +【血涌】/【战血激昂】。
  // 状态槽复用：`moonRage` = 【噬月】、`bloodRage` = 【嗜血】、`fury` = 【怒意】（见 docs/AGENTS-stages.md）。
  // 倍率/概率/层数全部占位 1（rulings「1 A」），TODO(实机)。
  '2034014': [
    {
      skillId: '203401401',
      target: 'single',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
      note: '碎剑为牙：单体雷伤',
    },
    {
      skillId: '203401402',
      target: 'blast',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
      note: '斩铁成爪：单体 + 相邻雷伤',
    },
    {
      skillId: '203401403',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
      delayAllies: 0.3,
      note: '裂地三舍，寸草不留：全体雷伤 + 我方行动延后 30%（文案「除自身外的所有目标」= 全体）',
    },
    {
      skillId: '203401404',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
      note: '雷动风咆，摧枯灭朽：全体雷伤',
    },
    {
      skillId: '203401405',
      target: 'single',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 15,
      note: '贪狼逐驰，血色临照：单体大量雷伤',
    },
    {
      skillId: '203401406',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      untouchableToughness: true,
      allyAttackStatus: {
        status: 'bloodRage',
        stacks: 1,
        threshold: 4,
        thresholdStatus: 'moonRage',
        dmgReduction: 0.4,
        onEnterSkillId: '203401409',
        furyDecayOnAllyTurnEnd: true,
      },
      note: '血鸣狂噬（被动）：进【噬月】前韧性不可削；我方施放攻击后为可噬月单位 +1 层【嗜血】，满 4 层进入【噬月】并立即施放【孤战】',
    },
    {
      skillId: '203401407',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 10,
      furyOnEnemyAttack: {
        status: 'fury',
        stacks: 1,
        selfExtra: 1,
        releaseThreshold: 8,
        castSkillId: '203401405',
        toughnessCut: 180,
      },
      note: '狼啸八方（被动）：【噬月】期间减伤 + 可削韧 + 获得【怒意】；我方回合结束 -1，归零退出【噬月】',
    },
    {
      skillId: '203401408',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: ['203201003', '203202004'], count: 1, maxAlive: 2 },
      note: '狼群敕令，唤雷奔袭（被动）：召唤狼卒；「我方击杀其他敌方目标 → 对呼雷伤害+削韧+全队【血涌】」半句待接（需击杀钩子）',
    },
    {
      skillId: '203401409',
      target: 'single',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 0,
      requiresCharge: true,
      duel: { spRestore: 4, selfHpRatio: 0.5, selfAtkRatio: 0.3, bloodSurgeAtk: 0.1 },
      note: '孤战：1v1 离场（其余我方/敌方不可行动不可选中）+ 自身按我方全体上限/攻击提高属性 + 我方回 4 战技点 + 【血涌】→【战血激昂】；怒意耗尽退出',
    },
  ],

  // ===== 混沌回忆 P43「来生泅渡」其十二 + 星启（2026-10-30 第四批；倍率全部占位 1）=====
  // 破晓战队•曙光（5013060，Elite，虚数，弱 物理/火/量子）
  // 【破晓力场】：韧性不可削 + 免疫控制 + 受击计数达上限后【破晓退散】（解除力场 + 【失意】受伤提高/抗性降低）。
  // 留口：力场期间「持续施放【破晓剑影舞】」按 AI 优先原则实现为**候选池只剩剑影舞**（非逐回合强制）。
  '5013060': [
    {
      skillId: '501306001',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
      note: '破晓战刃：单体虚数伤害',
    },
    {
      skillId: '501306002',
      target: 'blast',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 5,
      note: '破晓飞轮：单体 + 相邻虚数伤害',
    },
    {
      skillId: '501306003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      forceField: { element: 'Imaginary', attacks: 3, dmgReduction: 0.3 },
      note: '破晓意志：附加【破晓力场】（免疫控制 + 韧性不可削 + 受虚数攻击立即行动 + 受击 3 次后放退散）',
    },
    {
      skillId: '501306004',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
      forceFieldSkill: true,
      note: '破晓剑影舞：单体大量虚数伤害（力场期间的唯一候选）',
    },
    {
      skillId: '501306005',
      target: 'aoe',
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
      dispirited: { vulnerability: 0.3, resDown: 0.3, turns: 3 },
      note: '破晓退散：解除【破晓力场】+ 附加【失意】（受伤提高 30% / 虚数抗性降低 30%，3 回合）；由力场受击计数触发，不进随机池',
    },
  ],

  // 破晓战队•苍翼（5013040，星启；与曙光同构，仅属性=量子、抗性表不同）
  '5013040': [
    {
      skillId: '501304001',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '破晓战刃：单体量子伤害',
    },
    {
      skillId: '501304002',
      target: 'blast',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 5,
      note: '破晓飞轮：单体 + 相邻量子伤害',
    },
    {
      skillId: '501304003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      forceField: { element: 'Quantum', attacks: 3, dmgReduction: 0.3 },
      note: '破晓意志：附加【破晓力场】（受量子攻击立即行动 + 受击 3 次后放退散）',
    },
    {
      skillId: '501304004',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      forceFieldSkill: true,
      note: '破晓剑影舞：单体大量量子伤害（力场期间的唯一候选）',
    },
    {
      skillId: '501304005',
      target: 'aoe',
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      dispirited: { vulnerability: 0.3, resDown: 0.3, turns: 3 },
      note: '破晓退散：解除力场 + 附加【失意】（受伤提高 / 量子抗性降低）；由力场受击计数触发，不进随机池',
    },
  ],

  // 外宇宙之冰（8003010，Elite，冰，弱 火/风/量子）
  // 【冰点】：汲取霜晶后进入冰点 → 永冬之雨（全体冰伤 + 概率冻结）才可选。
  '8003010': [
    {
      skillId: '800301001',
      target: 'single',
      multiplier: 1,
      damageType: 'Ice',
      phaseList: [1],
      spHit: 10,
      debuff: { kind: 'freeze', baseChance: 1, duration: 1 },
      note: '叹息之寒：单体冰伤；冰点状态下概率冻结（这里直接按 debuff 冻结）',
    },
    {
      skillId: '800301002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      frostPoint: true,
      note: '汲取霜晶：进入【冰点】状态（之后可施放永冬之雨）',
    },
    {
      skillId: '800301003',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Ice',
      phaseList: [1],
      spHit: 15,
      requiresFrostPoint: true,
      debuff: { kind: 'freeze', baseChance: 1, duration: 1 },
      note: '永冬之雨：仅在【冰点】下施放；全体冰伤 + 概率冻结',
    },
  ],

  // 承露天人（2023030，Elite，风，弱 物理/冰/雷）
  // 风化 = 通用我方 DoT（allyDot kind='wind'）；【噬命】语义未知 → 只挂标记留口。
  '2023030': [
    {
      skillId: '202303001',
      target: 'random',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 5,
      multiHit: { countFrom: 'fixed', count: 3 },
      allyDot: { kind: 'wind', multiplier: 1, baseChance: 1, duration: 3 },
      note: '若木化生仪祷：连续 3 段随机单体风伤 + 大概率领入【风化】',
    },
    {
      skillId: '202303002',
      target: 'blast',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 10,
      allyDot: { kind: 'wind', multiplier: 1, baseChance: 1, duration: 3 },
      note: '导引巽风：单体 + 相邻风伤 + 大概率领入【风化】',
    },
    {
      skillId: '202303003',
      target: 'single',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 15,
      allyDot: { kind: 'wind', multiplier: 1, baseChance: 1, duration: 3 },
      note: '若木棘：单体风伤 + 大概率领入【风化】',
    },
    {
      skillId: '202303004',
      target: 'self',
      phaseList: [1],
      spHit: 10,
      charge: { nextSkillId: '202303005' },
      note: '玄气咒厌法：进入【持咒】，下次行动对全体施放【玄气噬身】',
    },
    {
      skillId: '202303005',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 15,
      requiresCharge: true,
      allyMark: { kind: 'soulEat', baseChance: 1, duration: 2 },
      note: '玄气噬身：全体风伤 + 大概率【噬命】（效果未知，只挂标记留口）',
    },
  ],

  // 银鬃尉官（1003010，Elite，物理，弱 物理/冰/量子）
  // 【盾反】：进入反击状态 → 受到我方单体攻击后行动提前并立即施放【穿刺】；【增援】召唤留口（无召唤物档案）。
  '1003010': [
    {
      skillId: '100301001',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      note: '突击：单体物理伤害',
    },
    {
      skillId: '100301002',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 20,
      note: '穿刺：单体大量物理伤害（盾反反击时也用它）',
    },
    {
      skillId: '100301003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      counterStance: { skillId: '100301002', rounds: 2 },
      note: '盾反：进入反击状态（受到我方单体攻击后行动提前 + 立即【穿刺】）',
    },
    {
      skillId: '100301004',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: ['1002040', '1002050'], count: 1, maxAlive: 2 },
      note: '增援：随机召唤【银鬃近卫】或【银鬃射手】（场上最多 2 只）',
    },
  ],

  // 「醉于盛会的此刻」（3003050，星启，Elite，风）
  // 【荒宴醉】/【欢宴罪】语义未知 → 只挂标记；【为你洗去一切罪】= 立即结算并清除我方全部持续伤害。
  '3003050': [
    {
      skillId: '300305001',
      target: 'single',
      damageType: 'Wind',
      phaseList: [1],
      spHit: 5,
      allyMark: { kind: 'feastDrunk', baseChance: 1, duration: 3, mainOnly: true },
      note: '为你倾流宝血：大概率使单体陷入【荒宴醉】或【欢宴罪】（只挂标记）',
    },
    {
      skillId: '300305002',
      target: 'aoe',
      damageType: 'Wind',
      phaseList: [1],
      spHit: 10,
      allyMark: { kind: 'feastSin', baseChance: 1, duration: 3 },
      note: '为你摆设筵席：全体概率【荒宴醉】/【欢宴罪】',
    },
    {
      skillId: '300305003',
      target: 'self',
      phaseList: [1],
      spHit: 10,
      charge: { nextSkillId: '300305004' },
      allyMark: { kind: 'feastSin', baseChance: 1, duration: 3 },
      note: '使你福杯满溢：蓄力 + 全体【荒宴醉】【欢宴罪】，下次行动施放【为你洗去一切罪】',
    },
    {
      skillId: '300305004',
      target: 'aoe',
      damageType: 'Wind',
      phaseList: [1],
      spHit: 15,
      requiresCharge: true,
      dotDetonateAll: true,
      note: '为你洗去一切罪：我方全体身上的持续伤害立即结算一次并清除',
    },
  ],

  // 始作画者，无量塔绘世（5014030，星启，LittleBoss，火）
  // 【怨火灼身】= 通用我方 DoT（allyDot kind='burn'）；【空想异魔画】的召唤与人外魔境留口。

  // 攻击性阅读物（5012030，火花大会副战场小怪，MinionLv2）
  // 官方文本在 data/monsters/5012030.json（skill_list = 读或死！/ 知识的诅咒），但**只有定性描述**
  // （「造成量子属性伤害」），没有百分比 → 倍率只能占位 1，等外部数据。技能名取「读或死！」。
  '5012030': [
    {
      skillId: '501203001',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '读或死！（占位）：对一名我方目标造成量子伤害',
    },
  ],

  // 直播小助手（5014011，火花大会二阶段副战场单位，LittleBoss）
  '5014011': [
    {
      skillId: '501401101',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '网络对线！（占位）：对一名我方目标造成量子伤害',
    },
  ],

  // 金血忆灵（分裂体：雉形 4062010 / 犬形 4062020 / 翼蛇形 4063010，裁定者 4064012 的【化整为零】）
  // 官方文本在 data/monsters/4062*.json、4063*.json（罪血啄食 / 罪血啃噬 / 罪血鞭笞 等），
  // 但**只有定性描述**、无百分比 → 倍率占位 1（虚数单体）。技能名已按官方名对齐。
  '4062010': [
    {
      skillId: '406201001',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 10,
      note: '罪血攻击（占位）：对一名我方目标造成虚数伤害',
    },
  ],

  '4062020': [
    {
      skillId: '406202001',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 10,
      note: '罪血攻击（占位）：对一名我方目标造成虚数伤害',
    },
  ],

  '4063010': [
    {
      skillId: '406301001',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 10,
      note: '罪血攻击（占位）：对一名我方目标造成虚数伤害',
    },
  ],

  // 火花大会@Official（5014010，混沌 P43 其十二 小BOSS，量子）
  // 【连麦PK】= 双战场（裁定 51）：副战场敌方 = 攻击性阅读物 5012030（一阶段 3 只 / 二阶段 4 只 + 直播小助手 5014011）。
  // 目标隔离（同阵营不限 / 跨阵营分主副）与前端「副战场」标注留到下一轮；本轮做状态机 + 计数 + 减伤。
  '5014010': [
    {
      skillId: '501401001',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 10,
      pkResolve: { branch: 'success', enemyVulnerability: 0.3, enemyDelay: 0.2, recoverSp: 2, ahaExtraLaugh: 10 },
      note: '开始控评！（带削韧）：量子群伤；PK 解除且副战场敌方全灭 → 敌方全体易伤 + 行动延后 + 回 SP + 阿哈额外回合（数值占位）',
    },
    {
      skillId: '501401002',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 0,
      pkResolve: { branch: 'success', enemyVulnerability: 0.3, enemyDelay: 0.2, recoverSp: 2, ahaExtraLaugh: 10 },
      note: '开始控评！（无削韧版本）：同上，spHit 0',
    },
    {
      skillId: '501401003',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 10,
      pkResolve: { branch: 'fail', subDamageMultiplier: 1, entangle: true },
      note: '弹幕满载！：PK 解除且副战场敌方仍有存活 → 我方全体量子伤害 + 概率弹幕惩罚（惩罚种类留口）+ 副战场角色【纠缠】',
    },
    {
      skillId: '501401004',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 10,
      note: '网络对线！：单体量子伤害',
    },
    {
      skillId: '501401005',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 10,
      note: '节奏带起来！：全体量子伤害',
    },
    {
      skillId: '501401006',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      openPk: { phaseCounts: [3, 4], subMonsterId: '5012030', helperId: '5014011', countdown: 200 },
      note: '抬你上麦！：开启【连麦PK】→ 隔离 1 名我方角色进副战场 + 召唤副战场敌方（一阶段 3 只 / 二阶段 4 只 + 助手）+ 倒计时 200',
    },
    {
      skillId: '501401007',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      pushTraffic: { advancePct: 0.2, critRateUp: 0.2 },
      note: '推流：副战场敌方获得【观众涌入】→ 行动提前 20% + 暴击率 +20%（暴击不进敌方公式，仅记录）',
    },
    {
      skillId: '501401008',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      favorGauge: { mineGain: 1, foeLoss: 1, advancePct: 0.1 },
      note: '好感度调整：攻击 1 号输出端 → 我方人气值 +1；攻击 2 号输出端 → 对方人气值 −1；人气提升使对应输出端行动提前（占位 10%）',
    },
    {
      skillId: '501401009',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      passive: true,
      fansParty: { reduction: 0.3 },
      note: '粉丝的狂欢（被动）：PK 期间主战场敌方受到的伤害降低 30% + 免疫控制；解除时副战场全灭则移除，否则按剩余生命比例保留',
    },
  ],

  '5014030': [
    {
      skillId: '501403001',
      target: 'single',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      note: '余烬赤绘：单体火伤',
    },
    {
      skillId: '501403002',
      target: 'single',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 15,
      allyDot: { kind: 'burn', multiplier: 1, baseChance: 1, duration: 3, emberChoice: true },
      note: '炼狱无惨绘：单体火伤 + 大概率【怨火灼身】（灼烧 DoT）',
    },
    {
      skillId: '501403003',
      target: 'blast',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 15,
      allyDot: { kind: 'burn', multiplier: 1, baseChance: 1, duration: 3, emberChoice: true },
      note: '炼狱无惨绘•艳墨：单体 + 相邻火伤 + 大概率【怨火灼身】',
    },
    {
      skillId: '501403004',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: '5023020', count: 1, maxAlive: 2 },
      note: '空想异魔画：召唤【吞神子嗣】（【人外魔境】对召唤物的施加留口）',
    },
    {
      skillId: '501403005',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 15,
      allyDot: { kind: 'burn', multiplier: 1, baseChance: 1, duration: 3, emberChoice: true },
      note: '绝景•吞天无量塔：全体火伤 + 大概率领入【怨火灼身】',
    },
  ],

  // ===== 异相仲裁 P10「落叶归根」第五批（2026-10-30；倍率全部占位 1）=====
  // 破晓战队三形态（曙光 P43 / 苍翼 = 量子 / 赤焰 = 火 / 灰烬 = 物理）：
  // 与 5013060/5013040 同构，差异只在属性与抗性表。
  '5013050': [
    {
      skillId: '501305001',
      target: 'single',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      note: '破晓战刃：单体火伤',
    },
    {
      skillId: '501305002',
      target: 'blast',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 5,
      note: '破晓飞轮：单体 + 相邻火伤',
    },
    {
      skillId: '501305003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      forceField: { element: 'Fire', attacks: 3, dmgReduction: 0.3 },
      note: '破晓意志：附加【破晓力场】（受火属性攻击立即行动 + 受击 3 次后放退散）',
    },
    {
      skillId: '501305004',
      target: 'single',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      forceFieldSkill: true,
      note: '破晓剑影舞：单体大量火伤（力场期间唯一候选）',
    },
    {
      skillId: '501305005',
      target: 'aoe',
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      dispirited: { vulnerability: 0.3, resDown: 0.3, turns: 3 },
      note: '破晓退散：解除力场 + 附加【失意】（受伤提高 / 火抗降低）；由力场受击计数触发',
    },
  ],

  '5013070': [
    {
      skillId: '501307001',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      note: '破晓战刃：单体物理伤害',
    },
    {
      skillId: '501307002',
      target: 'blast',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 5,
      note: '破晓飞轮：单体 + 相邻物理伤害',
    },
    {
      skillId: '501307003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      forceField: { element: 'Physical', attacks: 3, dmgReduction: 0.3 },
      note: '破晓意志：附加【破晓力场】（受物理攻击立即行动 + 受击 3 次后放退散）',
    },
    {
      skillId: '501307004',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      forceFieldSkill: true,
      note: '破晓剑影舞：单体大量物理伤害（力场期间唯一候选）',
    },
    {
      skillId: '501307005',
      target: 'aoe',
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      dispirited: { vulnerability: 0.3, resDown: 0.3, turns: 3 },
      note: '破晓退散：解除力场 + 【失意】（受伤提高 / 物理抗性降低）',
    },
  ],

  // 丰饶灵兽•长右（2023020，Elite，量子，弱 火/冰/风）
  // 【元气】：怒啸 +3 层；【猱击】消耗 1 层打监视目标；【奋威】叠自身增伤；
  // 我方施放战技 → 监视目标切换为最新施放者（`allySkillRetarget`）。
  '2023020': [
    {
      skillId: '202302001',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 15,
      consumeSelf: { status: 'vitality', delta: 1 },
      note: '猱击：消耗 1 层【元气】，对【监视目标】造成量子伤害',
    },
    {
      skillId: '202302002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      selfState: { status: 'fierce', value: 1 },
      note: '奋威：自身造成的伤害提高（可叠加；`fierce` 层数已记，增伤倍率占位未接）',
    },
    {
      skillId: '202302003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      retargetMark: { status: 'vitality', stacks: 3 },
      note: '怒啸：获得 3 层【元气】并把随机我方标记为【监视目标】；此后我方施放战技改为标记最新施放者',
    },
  ],

  // 乐变化天人（5023010，Elite，风，弱 火/雷/虚数）
  // 【极乐】标记 + 极乐螺旋消耗（行动延后 + 少 1 战技点）；【邪愿裂变】分裂留口（需击杀钩子）。
  '5023010': [
    {
      skillId: '502301001',
      target: 'single',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 10,
      note: '狂喜吐息：单体风伤',
    },
    {
      skillId: '502301002',
      target: 'random',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 5,
      multiHit: { countFrom: 'fixed', count: 3 },
      allyMark: { kind: 'elysium', baseChance: 1, duration: 3 },
      note: '微笑：连续 3 段随机单体风伤，每段概率【极乐】（同场多只乐变化天人会一起施放——留口）',
    },
    {
      skillId: '502301003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      charge: { nextSkillId: '502301004' },
      note: '笑蕾：进入【含苞】，下次行动施放【极乐螺旋】',
    },
    {
      skillId: '502301004',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 10,
      requiresCharge: true,
      consumeMark: { kind: 'elysium', delayAllies: 0.2, spLoss: 1 },
      note: '极乐螺旋：全体风伤 + 移除【极乐】→ 目标行动延后 20% 并少 1 战技点',
    },
  ],

  // 「灯塔」（8033020，Elite，物理，弱 火/风/量子）
  // 【众愿】：我方攻击 −1 层、敌方攻击 +1 层；<除害> 期间敌方全体按层数获得【鼓舞】（受伤降低）。
  // 层数归零 → 解除控制与【除恶】、自身行动延后、我方全体【失堕】、移除【鼓舞】。召唤【千星戍卫】留口。
  '8033020': [
    {
      skillId: '803302001',
      target: 'blast',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      note: '光辉扫击：单体 + 相邻物理伤害',
    },
    {
      skillId: '803302002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      selfState: { status: 'wish', value: 3 },
      weaknessInvalid: true,
      charge: { nextSkillId: '803302003' },
      sideInspire: { perStackStatus: 'wish', perStack: 0.05 },
      enemyAttackCounter: { status: 'wish', delta: 1 },
      allyAttackCounter: { status: 'wish', delta: 1 },
      counterZero: {
        clearFlag: 'wish',
        delaySelf: 0.5,
        markAllies: 'despair',
        removeSideBuff: 'inspire',
      },
      note: '不屈正义：进入【除恶】+ 3 层【众愿】+ 敌方全体【弱点无效】+【鼓舞】（每层 −5% 受伤），下次行动【除恶务尽】；层数归零 → 收束（失堕）',
    },
    {
      skillId: '803302003',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      requiresCharge: true,
      delayAllies: 0.3,
      note: '除恶务尽：全体物理伤害（每层【众愿】+倍率——占位未接）+ 行动延后',
    },
    {
      skillId: '803302004',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: '8032040', count: 1, maxAlive: 2 },
      note: '正道战线：召唤【千星戍卫】',
    },
  ],

  // 合金机铠•帕姆王（5014020，LittleBoss，量子，弱 火/雷/虚数）
  // 【蒸汽洗涤】+【长效抗菌】层数（我方攻击 −1）；归零 → 退出洗涤并受大量伤害。笑点/洗地机留口。
  '5014020': [
    {
      skillId: '501402001',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '灵魂修正剪：单体量子伤害',
    },
    {
      skillId: '501402002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      selfState: { status: 'antibacterial', value: 3 },
      allyAttackCounter: { status: 'antibacterial', delta: 1 },
      counterZero: { clearFlag: 'antibacterial', selfDamageRatio: 0.2 },
      note: '高温消毒模式：进入【蒸汽洗涤】+ 3 层【长效抗菌】（我方攻击 −1）；层数清空 → 退出并受 20% 上限伤害',
    },
    {
      skillId: '501402003',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      laughGain: 5,
      note: '无死角洗涤：全体量子伤害 + 我方获得笑点（我方获得 5 笑点）',
    },
    {
      skillId: '501402004',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      allyMark: { kind: 'laborJoy', baseChance: 1, duration: 2 },
      laughGain: 5,
      note: '强效肥皂泡：全体量子伤害 + 【劳动最快乐！】（我方获得 5 笑点）',
    },
    {
      skillId: '501402005',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      weaknessInvalid: true,
      charge: { nextSkillId: '501402006' },
      note: '值日准备中…：进入【摩拳擦掌】+【弱点无效】，下次行动【饱和式大扫除！】',
    },
    {
      skillId: '501402006',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 15,
      requiresCharge: true,
      laughGain: 10,
      note: '饱和式大扫除！：全体大量量子伤害（我方获得 10 笑点）',
    },
  ],

  // ===== 异相仲裁 P10「落叶归根」第六批 · 骑士（三）3 只（2026-10-30；倍率全部占位 1）=====
  // 飓风大母（4053020，Elite，量子，弱 火/冰/雷）
  // 【孵育狂潮】/【孵化】定时与【泡影稚子】召唤：召唤物档案未接 → 留口（`advanceOnHits` 已接）。
  '4053020': [
    {
      skillId: '405302001',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '唾弃深渊的黑：单体量子伤害',
    },
    {
      skillId: '405302002',
      target: 'blast',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '啼哭落在岸上：单体 + 相邻量子伤害',
    },
    {
      skillId: '405302003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      selfState: { status: 'hatchTide', value: 1 },
      advanceOnHits: { hits: 3, advancePct: 0.2 },
      note: '风雨雷的妊娠：附加【孵育狂潮】+ 行动序列添加【孵化】；受到 3 次攻击后行动提前 20%（【孵化】定时与【洪潮浪的分娩】召唤留口）',
    },
    {
      skillId: '405302004',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '雨自初生便落坠：全体量子伤害',
    },
    {
      skillId: '405302005',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: '4052020', count: 1, maxAlive: 2 },
      note: '洪潮浪的分娩：召唤【泡影稚子】（【风眼巢】无独立档案，留口）',
    },
    {
      skillId: '405302006',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      note: '请泊舟暂歇（被动描述）：受击提前口径挂在 405302003 的 advanceOnHits 上',
      passive: true,
    },
  ],

  // 示死祸源：深魇蝗灾（3024030，LittleBoss，火，弱 物理/火/风）
  // 【基因复制】+【幼蛰虫】召唤 +【死灭本能】：召唤物档案未接 → 留口；
  // 【侵蚀】（旋覆甲壳）已接：我方伤害的一部分累积为侵蚀池，施放荒潮时回血。
  '3024030': [
    {
      skillId: '302403001',
      target: 'single',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      note: '恶变鞘翅：单体火伤',
    },
    {
      skillId: '302403002',
      target: 'blast',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      note: '饕虐外肢：单体 + 相邻火伤',
    },
    {
      skillId: '302403003',
      target: 'single',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      note: '侵掠，撕碎，进食：单体火伤',
    },
    {
      skillId: '302403004',
      target: 'self',
      phaseList: [1],
      spHit: 10,
      selfState: { status: 'geneCopy', value: 1 },
      note: '分裂，腐化，吞吃：进入【基因复制】+ 速度提高 + 召唤【幼蛰虫】/【天敌】——召唤与新机制留口',
    },
    {
      skillId: '302403005',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      note: '荒潮到临，蝗灾示死：全体大量火伤（并把侵蚀池回血，见旋覆甲壳）',
    },
    {
      skillId: '302403006',
      target: 'self',
      phaseList: [1],
      spHit: 10,
      passive: true,
      selfErosion: { ratio: 0.3, restoreOnSkillId: '302403005' },
      note: '旋覆甲壳（被动）：受到的伤害 30% 转为【侵蚀】，施放【荒潮到临，蝗灾示死】时回复该部分生命',
    },
  ],

  // 冥魂渡者，死龙残躯，玻吕刻斯（4014030，LittleBoss，量子，弱 风/量子/虚数）
  // 【衰亡伤害】= 对生命百分比高于阈值的追加段（不致命）；【沉沦于长眠】标记；
  // 【哀悯长臂】召唤 / 【濒死梦泡】留口。
  '4014030': [
    {
      skillId: '401403001',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 5,
      declineDamage: { hpRatio: 0.5, hpPct: 0.1, nonLethal: true },
      note: '沦殁者攫手挽留：单体量子伤害；目标生命百分比 > 50% 时追加 10% 上限的【衰亡伤害】（不致命）',
    },
    {
      skillId: '401403002',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 5,
      splitAmongAllies: true,
      declineDamage: { hpRatio: 0.5, hpPct: 0.1, nonLethal: true },
      note: '长眠者厚土安葬：全体量子伤害（**平均分摊**）+ 高于 50% 生命的【衰亡伤害】',
    },
    {
      skillId: '401403003',
      target: 'random',
      multiplier: 0,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 5,
      multiHit: { countFrom: 'fixed', count: 3 },
      declineDamage: { hpRatio: 0, hpPct: 0.08, nonLethal: true },
      note: '辞世者临别哀悼：随机 3 个目标的【衰亡伤害】（占位 8% 生命上限）',
    },
    {
      skillId: '401403004',
      target: 'self',
      phaseList: [1],
      spHit: 5,
      note: '苦涩送来迟到的死讯：强化【哀悯长臂】并使其行动提前——召唤物未接，留口',
    },
    {
      skillId: '401403005',
      target: 'aoe',
      multiplier: 0,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 5,
      declineDamage: { hpRatio: 0, hpPct: 0.12, nonLethal: true },
      allyMark: { kind: 'deepSlumber', baseChance: 1, duration: 3 },
      note: '于痛苦的芬芳中死去：对全体造成【衰亡伤害】（不致命）+ 全体【沉沦于长眠】',
    },
    {
      skillId: '401403006',
      target: 'aoe',
      multiplier: 0,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 5,
      declineDamage: { hpRatio: 0, hpPct: 0.1, nonLethal: true },
      debuff: { kind: 'imprison', baseChance: 1, duration: 1 },
      note: '死亡想要更多的死亡：全体【衰亡伤害】+ 禁锢 1 回合（【沉沦于长眠】额外段留口）',
    },
  ],

  // ===== 混沌 P43 其十二 收官 2 只（2026-10-30 第十批；倍率全部占位 1）=====
  // 第一位天才，隐德来希，赞达尔（4044010，LittleBoss，量子；速 160 / 韧性 600）
  // 形态：SET 论证方法=黑潮 切【论证形态】（zandarArgu）→ 逻各斯ALG 场上生成黑潮造物；
  //       求解：第一因之果 切【演化形态】（zandarEvo）→ 秘所思公理 生成【神话生命演化系统】并召唤泰坦眷属。
  // 简化（留口）：CALL_毁灭论证法 / 神话生命演化系统 的定时行动序列条目用「每回合叠层到阈值即施放」近似；
  //   黑潮造物 / 泰坦眷属 归档 id 未定 → 暂不召唤；二律背反 只做「行动提前 + 解控 + 印记」。
  '4044010': [
    {
      skillId: '404401001',
      target: 'blast',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 10,
      note: '天球偏移论：单体 + 相邻少量量子伤害',
    },
    {
      skillId: '404401002',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      allyAdvance: { pct: 1, buff: { key: 'damageBonus', value: 0.3, labelKey: 'zandarPotential' } },
      note: '潜能实现猜想：指定敌方单体获得【潜能实现】（+30% 增伤占位）并立即行动',
    },
    {
      skillId: '404401003',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 10,
      allyCleanseAdvance: { advancePct: 0.25, mark: 'zandarAnti', markLabel: 'zandarAnti' },
      note: '智识的二律背反：少量量子伤害 + 目标行动提前 + 解除控制 + 施加【二律背反】印记',
    },
    {
      skillId: '404401004',
      target: 'random',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 5,
      multiHit: { countFrom: 'fixed', count: 4 },
      note: '虚数几何演绎法：连续 4 次随机单体少量量子伤害',
    },
    {
      skillId: '404401005',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      selfState: { status: 'zandarArgu', value: 1 },
      selfVulnerable: { pct: 0.2, duration: 999 },
      formSwitch: { from: 'zandarEvo', to: 'zandarArgu' },
      note:
        'SET 论证方法=黑潮：切换为【论证形态】（zandarArgu）并清掉演化形态计数；' +
        '【化形公式】每次切形态自身受伤 +20%（可叠加，占位）',
    },
    {
      skillId: '404401006',
      target: 'blast',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: 'DEL 入侵变量：单体 + 相邻少量量子伤害',
    },
    {
      skillId: '404401007',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      sideBuff: { key: 'damageBonus', value: 0.15, labelKey: 'zandarLaw' },
      note: 'DEFRAG 生命优化：论证形态下除自身外敌方全体永久获得【风行】【「律法」的惩戒】（+15% 增伤占位）',
    },
    {
      skillId: '404401008',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [2],
      spHit: 10,
      allyCleanseAdvance: { advancePct: 0.25, mark: 'zandarAnti', markLabel: 'zandarAnti' },
      note: '创生&&毁灭：2 个目标少量量子伤害 + 行动提前 + 解控 + 【二律背反】（按全体近似）',
    },
    {
      skillId: '404401009',
      target: 'random',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [2],
      spHit: 5,
      multiHit: { countFrom: 'fixed', count: 4 },
      note: 'FORMAT 故障空间：连续 4 次随机单体少量量子伤害',
    },
    {
      skillId: '404401010',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1, 2],
      spHit: 15,
      splitAmongAllies: true,
      enhanceStacks: { status: 'zandarBoost', perStack: 0.25, entanglePerStack: 1, clear: true },
      selfState: { status: 'zandarEvo', value: 1 },
      formSwitch: { from: 'zandarArgu', to: 'zandarEvo' },
      note:
        '求解：第一因之果：全体大量量子伤害 + 平均分摊 + 每层强化 +25%（【CALL_毁灭论证法】叠层，占位）+ ' +
        '按强化层数使我方陷入【纠缠】；施放后切换为【演化形态】（zandarEvo）',
    },
    {
      skillId: '404401011',
      target: 'self',
      passive: true,
      phaseList: [2],
      spHit: 0,
      passiveGrantStatus: { status: 'zandarEvo', stacks: 1 },
      note:
        '秘所思公理（被动）：处于【演化形态】；行动序列上的【神话生命演化系统】每次行动生成【泰坦眷属】' +
        '——简化：演化形态只做标记（叠层由论证形态的 404401012 负责）；泰坦眷属/黑潮造物 归档 id 未定留口，' +
        '当前用 404401005 的每 4 层施放近似「生成 → 回到论证形态」',
    },
    {
      skillId: '404401012',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      passiveGrantStatus: { status: 'zandarArgu', stacks: 1 },
      selfStackOnTurn: {
        status: 'zandarBoost',
        stacks: 1,
        threshold: 4,
        castSkillId: '404401010',
      },
      note:
        '逻各斯ALG（被动）：处于【论证形态】；场上生成【黑潮造物】、行动序列上的【CALL_毁灭论证法】' +
        '每次行动使【求解：第一因之果】强化——简化：每回合叠 1 层，累计 4 层立即施放求解（并清层）',
    },
    {
      skillId: '404401013',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      note: '化形公式（被动）：每次切换形态使自身受到的伤害提高（由 SET/求解 上的 selfVulnerable 实现，留口：无上限叠层）',
    },
  ],

  // ===== 虚构叙事 P27 其四 收官 2 只（2026-10-30 第九批；倍率全部占位 1）=====
  // 至黑之剑，盗火行者（4034014，LittleBoss，物理）
  // 【灾难之力】用 selfState 记层数；【残破容器】共祭/召唤/苦痛缠绕与【永别的决绝】层数留口。
  '4034014': [
    {
      skillId: '403401401',
      target: 'blast',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      note: '亡死的黑云：单体 + 相邻物理伤害（召唤【残破容器】的分离的哀痛留口）',
    },
    {
      skillId: '403401402',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      erosion: { ratio: 0.2 },
      note: '将尽的命数：全体物理伤害 + 掉血部分转化为【侵蚀】（降低可回复上限）',
    },
    {
      skillId: '403401403',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      selfState: { status: 'calamity', value: 1 },
      charge: { nextSkillId: '403401407' },
      note: '沉默的悲叹：获得 1 层【灾难之力】+ 蓄力，下次行动施放【莫因舍弃而哭泣】',
    },
    {
      skillId: '403401404',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      consumeSelf: { status: 'calamity', delta: 99 },
      note: '却是必要的苦难：消耗全部【灾难之力】→ 全体数次少量伤害 + 末尾 1 次（多段数按层数留口，当前 1 段）',
    },
    {
      skillId: '403401405',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      consumeSelf: { status: 'calamity', delta: 99 },
      note: '莫因舍弃而哭泣：全体物理伤害 + 消耗全部【灾难之力】追加数次少量伤害（追加段数留口）',
    },
    {
      skillId: '403401406',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      hardenedDefence: { dmgReduction: 0.2 },
      note: '永别的决绝（被动）：开局获得减伤 20%（每消灭 1 个【残破容器】掉 1 层——容器留口）',
    },
    {
      skillId: '403401407',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      requiresCharge: true,
      consumeSelf: { status: 'calamity', delta: 99 },
      note: '莫因舍弃而哭泣（蓄力释放）：全体物理伤害 + 消耗【灾难之力】追加段（留口）',
    },
    {
      skillId: '403401408',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      summon: { monsterId: '4032020', count: 1, maxAlive: 2 },
      note: '相混的道途 / 幽冥的悼念 / 分离的哀痛 / 迷失的共祭（被动族）：召唤【残破容器】（共祭/吸收回血/【苦痛缠绕】留口）',
    },
  ],

  // 惊梦剧团的甜猿泰山（3003020，Elite，冰）
  '3003020': [
    {
      skillId: '300302001',
      target: 'single',
      multiplier: 1,
      damageType: 'Ice',
      phaseList: [1],
      spHit: 10,
      shieldCounter: true,
      note: '限量赠饮：单体冰伤；命中带盾目标 → 自身叠 1 层防御降低',
    },
    {
      skillId: '300302002',
      target: 'random',
      multiplier: 1,
      damageType: 'Ice',
      phaseList: [1],
      spHit: 10,
      multiHit: { countFrom: 'fixed', count: 4 },
      shieldCounter: true,
      note: '无限畅饮：随机单体 4 次冰伤；命中带盾目标 → 自身防御降低',
    },
    {
      skillId: '300302003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: '3002030', count: 2, maxAlive: 2 },
      note: '苏乐达派对：召唤 2 只【气泡锂犬】',
    },
    {
      skillId: '300302004',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      untouchableToughness: true,
      charge: { nextSkillId: '300302002' },
      note: '酬宾喷泉：蓄力（韧性保护），下次行动【无限畅饮】',
    },
  ],

  // ===== 虚构叙事 P27「取象为文」星启 + 合金保姆 第八批（2026-10-30；倍率全部占位 1）=====
  // 合金保姆（5012120，MinionLv2，量子）
  '5012120': [
    {
      skillId: '501212001',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '扫除：单体量子伤害',
    },
    {
      skillId: '501212002',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      allyMark: { kind: 'defDown', baseChance: 1, duration: 2 },
      note: '泼脏水：单体量子伤害 + 防御降低（只挂标记，数值待核）',
    },
    {
      skillId: '501212003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      onDeath: { laughPoints: 10 },
      note: '线路故障（被动）：致命受击时我方获得笑点（占位 +10）',
    },
  ],

  // 银鬃炮手（1002030，MinionLv2，物理）+【掩护支援】
  '1002030': [
    {
      skillId: '100203001',
      target: 'blast',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      note: '炮击：单体 + 相邻物理伤害',
    },
    {
      skillId: '100203002',
      target: 'self',
      phaseList: [1],
      spHit: 12,
      supportFollowUp: { multiplier: 1 },
      note: '掩护支援：其他敌方攻击我方后，对同一目标追加 1 次物理攻击',
    },
  ],

  // 银鬃射手（1002050，MinionLv2，物理）
  '1002050': [
    {
      skillId: '100205001',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      allyDot: { kind: 'bleed', multiplier: 1, baseChance: 0.8, duration: 2 },
      note: '破甲榴弹：单体物理伤害 + 大概率【裂伤】',
    },
  ],

  // 幽府武弁（2002030，MinionLv2，物理）
  '2002030': [
    {
      skillId: '200203001',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      stagger: { baseChance: 0.8, skipTurns: 1 },
      note: '锯恶：单体物理伤害 + 概率【震荡】（再次被击中 →【强烈震荡】跳过行动）',
    },
  ],

  // 银枝（3024010，LittleBoss，物理）
  '3024010': [
    {
      skillId: '302401001',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      note: '虔诚：单体物理伤害',
    },
    {
      skillId: '302401002',
      target: 'blast',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      note: '渐臻虔诚：单体 + 相邻物理伤害',
    },
    {
      skillId: '302401003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: ['3021030', '3021040', '3021020'], count: 1, maxAlive: 3 },
      note: '枪与盾：随机召唤【枪尖】/【盾】/【授勋】之一（场上最多 3 只）',
    },
    {
      skillId: '302401004',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      note: '坚韧灵魂：释放雕塑灵魂强化其技能——留口',
    },
    {
      skillId: '302401005',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      note: '纯美的勇气赞歌：全体物理伤害',
    },
  ],

  // 「授勋」（3021020，Minion，物理）：给银枝叠增伤
  '3021020': [
    {
      skillId: '302102001',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      supportBuff: { targetMonsterId: '3024010', key: 'atkPct', value: 0.1, labelKey: 'award' },
      note: '血色女皇授勋：为银枝叠加可叠层增伤（+10%/层，占位）',
    },
    {
      skillId: '302102002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      onDeath: { vulnKiller: { pct: 0.1, stacks: 1 } },
      note: '颠仆的星花阶石（被动）：致命受击时对击杀者叠 1 层「受到伤害提高 10%」（可叠加；【灵魂释放】层数增加留口）',
    },
  ],

  // 「盾」（3021040，Minion，物理）：给银枝挂屏障
  '3021040': [
    {
      skillId: '302104001',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      supportBuff: { targetMonsterId: '3024010', key: 'dmgReduction', value: 0.15, labelKey: 'barrier' },
      note: '捍卫的冕旒：为银枝挂屏障（受伤 −15%，占位）',
    },
    {
      skillId: '302104002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      onDeath: { shieldKiller: { hpRatio: 0.1 } },
      note: '飞速欲念摹本（被动）：致命受击时给击杀者挂屏障（按击杀者生命上限 10% 占位；【灵魂释放】全体化留口）',
    },
  ],

  // ===== 虚构叙事 P27「取象为文」其四 + 星启 第七批（2026-10-30；倍率全部占位 1）=====
  // 天谴斗士（4012010，MinionLv2，物理）+ 【战甲】
  '4012010': [
    {
      skillId: '401201001',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      note: '第三轨道的冲撞：单体物理伤害（【震荡】判定留口）',
    },
    {
      skillId: '401201002',
      target: 'self',
      phaseList: [1],
      spHit: 15,
      passive: true,
      armor: { stacks: 3, dmgReduction: 0.3, breakDamageRatio: 0.01, breakEnergy: 5, delaySelf: 0.3 },
      note: '城邦守护者（被动）：【战甲】3 层（受伤降低 30%）；受击 −1 层，破坏时自身受 1% 上限伤害（占位） + 行动延后 + 破坏者回 5 能；回合结束恢复',
    },
  ],

  // 天谴先锋（4013010，Elite，虚数）+ 【战甲】+ 蓄力【在滔滔血海中沉溺】
  '4013010': [
    {
      skillId: '401301001',
      target: 'sweep',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
      sweep: { count: 3, from: 'left' },
      note: '从天帷斩向黎明：从队伍左侧横扫 3 个连续目标',
    },
    {
      skillId: '401301002',
      target: 'sweep',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
      sweep: { count: 3, from: 'right' },
      note: '从黎明杀往天帷：从队伍右侧横扫 3 个连续目标',
    },
    {
      skillId: '401301003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      charge: { nextSkillId: '401301004' },
      note: '像威猛暴怒的雄狮：蓄力，下回合施放【在滔滔血海中沉溺】',
    },
    {
      skillId: '401301004',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 20,
      requiresCharge: true,
      splitAmongAllies: true,
      note: '在滔滔血海中沉溺：吸收【天谴斗士】后全体大量虚数伤害（平均分摊）+【易伤】；吸收数量加伤留口',
    },
    {
      skillId: '401301005',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: '4012010', count: 1, maxAlive: 2 },
      note: '快从坟墓中苏生：召唤【天谴斗士】（场上最多 2 只）',
    },
    {
      skillId: '401301006',
      target: 'self',
      phaseList: [1],
      spHit: 15,
      passive: true,
      armor: { stacks: 5, dmgReduction: 0.3, breakDamageRatio: 0.01, breakEnergy: 5, delaySelf: 0.3 },
      note: '城邦守护者（被动）：【战甲】5 层，破坏时自身受 1% 上限伤害（占位）+ 破坏者回能',
    },
  ],

  // 狸猫记者（5012110，MinionLv2，虚数）
  '5012110': [
    {
      skillId: '501211001',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1],
      spHit: 10,
      note: '抓拍：单体虚数伤害',
    },
    {
      skillId: '501211002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      onDeath: { laughPoints: 10, elationDegree: 0.05 },
      note: '丑照特写（被动）：致命受击时按致命伤害给欢愉度 + 我方笑点（数值占位：欢愉度 +5%、笑点 +10）',
    },
  ],

  // 虚构集合体（8003060，Elite，火）：数据只有 1 条无名火伤技
  '8003060': [
    {
      skillId: '800306001',
      target: 'single',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      note: '（文档只有 1 条无名火伤技）单体火伤',
    },
  ],

  // 丰饶灵兽•娄金（2022040，MinionLv2，风）
  '2022040': [
    {
      skillId: '202204001',
      target: 'single',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 10,
      note: '角牴：单体风伤',
    },
    {
      skillId: '202204002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      onDeath: { adjacentAdvance: 0.2 },
      note: '嗥吠（被动）：致命受击时相邻敌方单位行动提前 20%',
    },
  ],

  // 自动机兵•战犬（1012010，MinionLv2，物理）
  '1012010': [
    {
      skillId: '101201001',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 15,
      note: '垂直打击：单体物理伤害',
    },
    {
      skillId: '101201002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      healSide: { hpRatio: 0.15 },
      note: '自愈模块：立即回复敌方全体 15% 生命上限（占位）',
    },
  ],

  // 黑潮蚀斧（4032030，MinionLv2，火）
  '4032030': [
    {
      skillId: '403203001',
      target: 'single',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      note: '怒潮炽斧：单体火伤',
    },
    {
      skillId: '403203002',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      splitAmongAllies: true,
      note: '仇心忿火：全体火伤（平均分摊）',
    },
    {
      skillId: '403203003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      onAllyDeath: { skillId: '403203002' },
      note: '仇隙（被动）：当其他敌方单位被消灭时，自身立即行动并施放一次【仇心忿火】（一次阵亡最多 1 只怪触发）',
    },
  ],

  // 残破容器（4032024，MinionLv2，物理）
  '4032024': [
    {
      skillId: '403202401',
      target: 'blast',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 5,
      note: '共祭•亡死的黑云：单体 + 相邻物理伤害',
    },
    {
      skillId: '403202402',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 5,
      erosion: { ratio: 0.2 },
      note: '共祭•将尽的命数：全体物理伤害 + 掉血部分转化为【侵蚀】',
    },
    {
      skillId: '403202403',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      onDeath: { ownerStatusDown: { monsterId: '4034014', status: 'calamity', delta: 1 } },
      note: '为我设奠（被动；官方另有「为我祷咏」）：致命受击后若【至黑之剑，盗火行者】的【灾难之力】不为 0 则立即 -1 层',
    },
  ],

  // 丰饶灵兽•奎木（2022050，MinionLv2，雷）
  '2022050': [
    {
      skillId: '202205001',
      target: 'single',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
      shock: { multiplier: 1, baseChance: 1, duration: 2 },
      note: '狼餐：单体雷伤 + 大概率【触电】',
    },
    {
      skillId: '202205002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      summon: { monsterId: '2022051', count: 1, maxAlive: 1 },
      note: '啸聚：召唤 1 只【狈影】（等血量口径按档案基础值，留口）',
    },
  ],

  // 幼蛰虫（8022010，MinionLv2，风）
  '8022010': [
    {
      skillId: '802201001',
      target: 'single',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 10,
      allyDot: { kind: 'wind', multiplier: 1, baseChance: 1, duration: 3 },
      note: '振翅：单体风伤 + 大概率【风化】',
    },
    {
      skillId: '802201002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      note: '次分裂：繁殖自身（2 回合后可再触发）——召唤物档案未接，留口',
    },
    {
      skillId: '802201003',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      onDeath: {
        alliesDamage: { multiplier: 1, damageType: 'Wind' },
        alliesVulnerable: { pct: 0.1 },
      },
      note: '蛰亡语（被动）：致命受击时对我方全体造成风属性伤害（倍率占位 1）+ 我方受伤提高 10%（占位）',
    },
  ],

  // 云骑巡防士卒（2002010，MinionLv2，风）
  '2002010': [
    {
      skillId: '200201001',
      target: 'single',
      multiplier: 1,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 15,
      allyMark: { kind: 'markedVuln', baseChance: 1, duration: 2 },
      note: '云刃：单体风伤 + 大概率使目标受到的伤害提高（只挂标记，数值待核）',
    },
  ],

  // 合金机铠•帕姆王（5014023，LittleBoss 异档；与 5014020 同构）
  '5014023': [
    {
      skillId: '501402301',
      target: 'single',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      note: '灵魂修正剪：单体量子伤害',
    },
    {
      skillId: '501402302',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      selfState: { status: 'antibacterial', value: 3 },
      allyAttackCounter: { status: 'antibacterial', delta: 1 },
      counterZero: { clearFlag: 'antibacterial', selfDamageRatio: 0.2 },
      note: '高温消毒模式：3 层【长效抗菌】，我方攻击递减；清空 → 退出并受 20% 上限伤害',
    },
    {
      skillId: '501402303',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      laughGain: 5,
      note: '无死角洗涤：全体量子伤害（我方获得 5 笑点）',
    },
    {
      skillId: '501402304',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      allyMark: { kind: 'laborJoy', baseChance: 1, duration: 2 },
      laughGain: 5,
      note: '强效肥皂泡：全体量子伤害 +【劳动最快乐！】',
    },
    {
      skillId: '501402305',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      weaknessInvalid: true,
      charge: { nextSkillId: '501402306' },
      note: '值日准备中…：【弱点无效】+ 下次行动【饱和式大扫除！】',
    },
    {
      skillId: '501402306',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 15,
      requiresCharge: true,
      laughGain: 10,
      note: '饱和式大扫除！：全体大量量子伤害',
    },
    {
      skillId: '501402307',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      passive: true,
      startSummon: { monsterId: '5012120', count: 2, maxAlive: 3 },
      laughGain: 3,
      note: '洗地机之乱（被动）：开局召唤 2 只「合金保姆」5012120（我方获得 3 笑点）',
    },
  ],

  // 正阳狮鹫 Noontide Gryphon（4023010，Elite，弱 物理/量子/虚数）
  '4023010': [    {
      skillId: '402301001',
      target: 'single',
      multiplier: 3,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 5,
    },
    {
      skillId: '402301002',
      target: 'sweep',
      sweep: { from: 'left', count: 3 },
      multiplier: 2.6,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 10,
      mark: {
        kind: 'aquila',
        maxStacks: 2,
        damageMultiplier: 1,
        energyLoss: 20,
        entangleChance: 0,
        bothTrueDamageRatio: 0.1,
        bothEnergyLoss: 20,
        bothEntangleChance: 0.8,
      },
      summon: { monsterId: '4022010', count: 1, maxAlive: 4 },
      params: [2.6, 0.5, 0.8, 1.1, 1.5],
      note: '降示黎明：从左起横扫 3 连续目标并施加【艾格勒印记】并召唤【流星铁鹰】；ParamList[1..4] 含义待核',
    },
    {
      // 点亮未来：锁定 1 个我方目标并进入蓄力，下次行动施放【赞美艾格勒】
      skillId: '402301003',
      target: 'self',
      charge: { nextSkillId: '402301004' },
      lock: 1,
      phaseList: [1],
      spHit: 0,
    },
    {
      skillId: '402301004',
      target: 'locked',
      multiplier: 4,
      damageType: 'Fire',
      phaseList: [1],
      spHit: 20,
      mark: {
        kind: 'aquila',
        maxStacks: 2,
        damageMultiplier: 1,
        energyLoss: 20,
        entangleChance: 0,
        bothTrueDamageRatio: 0.1,
        bothEnergyLoss: 20,
        bothEntangleChance: 0.8,
      },
      lockedAdjacent: true,
      requiresCharge: true,
      params: [4, 3],
      note: '赞美艾格勒：对锁定目标及其相邻目标造成火伤害并附加【艾格勒印记】（点亮未来蓄力后释放）',
    },
  ],

  // 月夜天马 Moonlit Pegasus（4023020，Elite，弱 火/量子/虚数）
  '4023020': [
    {
      skillId: '402302001',
      target: 'single',
      multiplier: 3,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 5,
    },
    {
      skillId: '402302002',
      target: 'sweep',
      sweep: { from: 'right', count: 3 },
      multiplier: 2.6,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      mark: {
        kind: 'olonisi',
        maxStacks: 2,
        damageMultiplier: 1,
        energyLoss: 0,
        entangleChance: 0.8,
        bothTrueDamageRatio: 0.1,
        bothEnergyLoss: 20,
        bothEntangleChance: 0.8,
      },
      note: '三倍下弦月：从右起横扫 3 连续目标并施加【欧洛尼斯印记】',
    },
    {
      // 两倍上弦月：锁定 2 个我方目标并进入蓄力，下次行动施放【六倍满月】
      skillId: '402302003',
      target: 'self',
      charge: { nextSkillId: '402302004' },
      lock: 2,
      phaseList: [1],
      spHit: 0,
    },
    {
      skillId: '402302004',
      target: 'locked',
      multiplier: 4.5,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 20,
      mark: {
        kind: 'olonisi',
        maxStacks: 2,
        damageMultiplier: 1,
        energyLoss: 0,
        entangleChance: 0.8,
        bothTrueDamageRatio: 0.1,
        bothEnergyLoss: 20,
        bothEntangleChance: 0.8,
      },
      requiresCharge: true,
      note: '六倍满月：对锁定目标造成量子伤害并附加【欧洛尼斯印记】（两倍上弦月蓄力后释放）',
    },
    {
      skillId: '402302005',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      params: [40, 1.5, 0.25],
      note: '被动（ParamList 含义待核）',
    },
  ],

  // 堕神之血•亚婆离 Blood of the Fallen God: Yabuli（5034010，LittleBoss，弱 冰/量子/虚数）
  '5034010': [
    {
      skillId: '503401001',
      target: 'single',
      multiplier: 5,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      debuff: { kind: 'decay', baseChance: 1, duration: 3, threshold: 3 },
      note:
        '猎食标记：单体少量量子伤害 + 1 层【堕神衰腐】；达 threshold=3 层 → 该我方角色陷入【幻身】' +
        '（2026-10-23 用户裁定：分层简化版）——阈值待核',
    },
    {
      skillId: '503401002',
      target: 'aoe',
      multiplier: 1.8,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
    },
    {
      skillId: '503401003',
      target: 'self',
      phaseList: [2],
      spHit: 0,
      params: [0.1, 2, 0.04, 5],
      consumeSummon: { monsterId: '503201002', atkPct: 0.1, healRatio: 0.04 },
      note:
        '宏观生态系统：吞噬【狂兽的胚芽】→ 自身造成的伤害提高 + 回复生命' +
        '（ParamList[0]=0.1 增伤 / [2]=0.04 回血，均待核）；有存活胚芽时才进入 AI 候选池',
    },
    {
      skillId: '503401004',
      target: 'aoe',
      multiplier: 5,
      damageType: 'Quantum',
      phaseList: [2],
      spHit: 20,
      debuff: { kind: 'devour', baseChance: 1, duration: 3 },
      params: [5, 0.1],
      note: '万物于我之中：全体大量量子伤害 + 大概率全体【源质吞噬】（概率未建模，按必定，待核）',
    },
    {
      skillId: '503401005',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      params: [0.08, 0.7, 0.65, 0.75, 0.35, 2, 0.3, 0.1, 0.05, 66],
      note: '集群连带应激（被动）：胚芽行动提前联动留口',
    },
    {
      skillId: '503401006',
      target: 'self',
      passive: true,
      phaseList: [2],
      spHit: 0,
      params: [0.7, 0.65, 0.75, 0.35, 1, 0.5, 0.3, 0.05, 0.025, 40],
      note:
        '兽瞳百相（被动）：每次行动后叠 1 层【贪饕之眼】；回合结束时达 40 层立刻施放【万物于我之中】' +
        '（ParamList[9]=40 阈值，待核）；施放后计数清零',
      selfStackOnTurn: {
        status: 'gluttonyEye',
        stacks: 1,
        threshold: 40,
        castSkillId: '503401004',
      },
    },
    {
      skillId: '503401007',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      params: [3, 2, 3, 0.02],
      summon: { monsterId: '503201002', count: 1, maxAlive: 1 },
      summonDeathEffect: { hpRatio: 0.02, statusOnOwner: { status: 'gluttonyEye', stacks: 1 } },
      note: '胎儿之梦（被动）：每次行动召唤【狂兽的胚芽】（胚芽攻击附【堕神衰腐】【源质吞噬】半句留口）',
    },
    {
      skillId: '503401008',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      params: [0.3, 0.2, 0.98, 1],
      note:
        '血脑屏障（被动）：生命值低于 30% 时获得【血脑屏障】→ 韧性无法被削减（欢愉伤害除外）+ 受到所有伤害降低 80%' +
        '（ParamList[0]=0.3 阈值、ParamList[1]=0.2 剩余伤害比例，均待核）；' +
        '【稳态失衡】1 回合后行动 → 屏障解除 + 自身受 98% 生命上限伤害（ParamList[2]=0.98，待核）',
      selfStatusOnHp: {
        status: 'bloodBrainBarrier',
        hpRatio: 0.3,
        damageReduction: 0.8,
        selfDamageRatio: 0.98,
        steadyRounds: 1,
        elationBreakMultiplier: 2,
      },
    },
  ],

  // ===== 敌方召唤物（2026-10-22；倍率取 Dimbreath ParamList[0]）=====
  // 2032010 玄爪狼卒 Sableclaw Wolftrooper（呼雷【召集狼群】）
  '2032010': [
    {
      skillId: '203201001',
      target: 'blast',
      multiplier: 1.8,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      params: [1.8],
      note: '厮杀：单体及相邻少量物理伤害（【月狂】附加【裂伤】半句留口）',
    },
    {
      skillId: '203201002',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      params: [0.3, 1, 2, 6, 0.3, 3],
      allyAttackStatus: {
        status: 'bloodRage',
        stacks: 1,
        threshold: 6,
        thresholdStatus: 'moonRage',
        speedPct: 0.3,
        extraSkillId: '203201001',
        countdownRounds: 6,
      },
      note: '狼吞（被动）：我方施放攻击后为可月狂单位叠加 1 层共享【嗜血】；达 6 层进入【月狂】（ParamList[3]=6 阈值、ParamList[0]=0.3 速度提高，均待核）；【月狂】附加【裂伤】与倒计时留口',
    },
  ],

  // 2032020 蚀月狼卒 Eclipse Wolftrooper（呼雷【召集狼群】）
  '2032020': [
    {
      skillId: '203202001',
      target: 'single',
      multiplier: 2.8,
      damageType: 'Physical',
      phaseList: [1],
      spHit: 10,
      params: [2.8],
      note: '啃噬：单体物理伤害（【月狂】攻击后回血半句留口）',
    },
    {
      skillId: '203202002',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      params: [0.3, 0.4, 6, 3],
      allyAttackStatus: {
        status: 'bloodRage',
        stacks: 1,
        threshold: 6,
        thresholdStatus: 'moonRage',
        speedPct: 0.3,
        extraSkillId: '203202001',
        countdownRounds: 6,
      },
      note: '狼吞（被动）：我方施放攻击后为可月狂单位叠加 1 层共享【嗜血】；达 6 层进入【月狂】（ParamList[2]=6 阈值、ParamList[0]=0.3 速度提高，均待核）；【月狂】回血与倒计时留口',
    },
  ],

  // 4022010 流星铁鹰 Meteoric Eagle（正阳狮鹫【降示黎明】）
  '4022010': [
    {
      skillId: '402201001',
      target: 'single',
      multiplier: 2,
      damageType: 'Wind',
      phaseList: [1],
      spHit: 5,
      params: [2],
      note: '划破夜空：单体少量风伤害',
    },
    {
      skillId: '402201002',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      params: [],
      windWalk: { turns: 1 },
      note: '如流星闪耀：为敌方单位附加【风行】（回合结束时立即行动）—— 当前只作用于自身，待核',
    },
  ],

  // 5032010 狂兽的胚芽 Frenzied Beast's Seed Germ（亚婆离【胎儿之梦】）
  '5032010': [
    {
      skillId: '503201001',
      target: 'single',
      multiplier: 2.2,
      damageType: 'Quantum',
      phaseList: [1],
      spHit: 10,
      params: [2.2, 3, 2, 3, 0.1, 0.1, 3, 5],
      note: '拔芽击仔：单体少量量子伤害 + 使其陷入【衰腐】（数值待核）',
    },
    {
      skillId: '503201002',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      params: [0.02, 0.1, 2, 5],
      note: '前馈控制操纵（被动）：回血 + 伤害提高——留口',
    },
  ],

  // ===== 末日幻影 P21「支配遗忘」难度04 三位小BOSS（2026-10-30 接入；倍率全部占位 1）=====
  // 勾魂摄魄的支配者 Dominator（2004014，LittleBoss，雷，弱 物理/火/风/虚数）
  // 我方 DoT（触电）+【支配】+【心理暗示】/【揭晓】为首批接入的通用框架；
  // 召唤（唤声灵形）与【诱狂】/【残酷】的「敌方除自身外的目标」半句留口（见 docs/AGENTS-stages.md）。
  '2004014': [
    {
      skillId: '200401401',
      target: 'single',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
      shock: { multiplier: 1, baseChance: 1, duration: 2 },
      note: '夜间喧嚣不止：单体雷伤 + 概率【触电】（倍率占位 1 /* TODO(实机) */；触电每跳倍率同为占位 1）',
    },
    {
      skillId: '200401402',
      target: 'blast',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
      shock: { multiplier: 1, baseChance: 1, duration: 2, spreadFromMain: true },
      note: '月光摩挲连绵：主目标 + 相邻雷伤；主目标本次命中前已触电 → 副目标也触电',
    },
    {
      skillId: '200401403',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 15,
      note: '缄默厉声嘲笑：全体雷伤',
    },
    {
      skillId: '200401404',
      target: 'self',
      phaseList: [1],
      spHit: 15,
      dominate: { baseChance: 1, duration: 1 },
      note: '言灵：大概率【支配】单体（行动提前到当前 + 立即攻击我方随机 1 人后解除）',
    },
    {
      skillId: '200401405',
      target: 'single',
      multiplier: 1,
      damageType: 'Thunder',
      phaseList: [1],
      spHit: 10,
      shock: { multiplier: 1, baseChance: 1, duration: 2 },
      shockSplash: { multiplier: 1 },
      note: '亡者切齿呢喃：单体雷伤 + 触电；随后对所有已触电的我方目标追加雷伤',
    },
    {
      skillId: '200401406',
      target: 'self',
      phaseList: [1],
      spHit: 0,
      suggest: { count: 2, baseChance: 1, revealDelayRounds: 1 },
      note: '心理暗示：多名我方进入【心理暗示】+ 行动序列插入【揭晓】（1 轮后到点转【支配】）',
    },
    {
      skillId: '200401407',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      shockDetonate: true,
      note: '颤慄（被动）：自身攻击命中已触电目标 → 立即结算 1 次触电伤害',
    },
    {
      skillId: '200401408',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      dominateDetonate: true,
      note: '残酷（被动）：被【支配】的我方目标攻击已触电目标 → 追加 1 次雷击；「敌方除自身外的目标」半句留口',
    },
    {
      skillId: '200401409',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 10,
      note: '傀儡候场：对召唤物附加【诱狂】——召唤物未建模，留口',
    },
    {
      skillId: '200401411',
      target: 'self',
      passive: true,
      phaseList: [1],
      spHit: 0,
      note: '唤声灵形：召唤 2 精英（与本体共享生命 / 破韧行动延后 / 弱点转移）——召唤物未建模，留口',
    },
  ],

  // 4064012 迷惘之渊的裁定者 Adjudicator（末日 P21 难度04 下半，虚数，LittleBoss）
  // 本批接入：伤害三连 + 【侵蚀】/【壁垒反震】/【强化防御】/【罪血眈视】锁定窗口 + 【指名祸首】蓄力→【罪血枭首】；
  // 留口：【化整为零】分裂/合体（【假死】/【合而为一】/【血脉衰弱】）、【执刑就位】召唤金血忆灵、【劣化残躯】
  //（需「我方施加负面」中央钩）。倍率与概率全部占位 1（rulings「1 A」+ 默认口径），TODO(实机)。
  '4064012': [
    {
      skillId: '406401201',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 10,
      shieldCounter: true,
      note: '罪血嚼齿：单体虚数伤害；目标持盾 → 触发【壁垒反震】（自身 +1 层防御降低）',
    },
    {
      skillId: '406401202',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      summon: { monsterId: '4062010', count: 2, maxAlive: 4 },
      note: '执刑就位：召唤 2 只【金血忆灵•雉形】（壁垒反震未接）',
    },
    {
      skillId: '406401203',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      judge: { turns: 3, speedPct: 0.2, extraAction: true },
      note: '罪血眈视：锁定 1 名我方 + 自身速度提高（3 回合内只对其施放嚼齿/锯刑）+ 施放后再行动 1 次',
    },
    {
      skillId: '406401204',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 15,
      shieldCounter: true,
      erosion: { ratio: 0.5 },
      note: '罪血锯刑：单体大量虚数伤害 + 已损失生命的 50% 转【侵蚀】；持盾触发【壁垒反震】',
    },
    {
      skillId: '406401205',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 10,
      erosion: { ratio: 0.5 },
      note: '罪血钳刑：全体虚数伤害 + 已损失生命的 50% 转【侵蚀】',
    },
    {
      skillId: '406401206',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      charge: { nextSkillId: '406401207' },
      lock: 1,
      note: '指名祸首：蓄力（点名 1 名我方承受【罪血枭首】最高伤害与【罪血腐蚀】）',
    },
    {
      skillId: '406401207',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 15,
      requiresCharge: true,
      designatedMultiplier: 2,
      corrode: { ratio: 1 },
      note: '罪血枭首：全体虚数伤害；被点名者 ×2 并按其未被护盾抵消的伤害施加【罪血腐蚀】',
    },
    {
      skillId: '406401208',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      hardenedDefence: { dmgReduction: 0.4 },
      note: '皮糙肉厚（被动）：战斗开始/转阶段【强化防御】防御力大幅提高（这里折算为 40% 减伤），被弱点击破解除',
    },
    {
      skillId: '406401209',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      note: '壁垒反震（被动）：触发时自身获得 1 层防御力降低（由检盾逻辑直接施加 defReduction）',
    },
    {
      skillId: '406401210',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      note: '劣化残躯（被动）：我方对其施加负面 → 少量削韧 + 真实伤害——需「我方施加负面」中央钩，留口',
    },
    {
      skillId: '406401211',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      splitOnStart: { monsterIds: ['4062010', '4062020', '4063010'], bloodWeak: 3 },
      note: '化整为零（被动）：开局分裂为雉形 4062010 / 犬形 4062020 / 翼蛇形 4063010（合而为一）＋本体【假死】与【血脉衰弱】3 层；分裂体行动各 −1 层，全部假死 → 合体并按剩余层数削韧（转阶段重分裂留口）',
    },
  ],

  // 金血忆灵•裁定忘却之形（4064010，混沌 P44 星启，虚数，LittleBoss）——第五十一轮补表
  // 它与末日 P21 的 4064012「迷惘之渊的裁定者」是**同族同模板**（官方 skill_list 名称一一对应），
  // 因此直接沿用 4064012 已实现的机制与占位数值（倍率 1 / 判定 3 回合 / 侵蚀 50%），全部 TODO(实机)。
  // 差异只有【决狱从速】：未破韧减伤、被击破后行动延后＋自身受伤提高（当前只记 note，数值留口）。
  '4064010': [
    {
      skillId: '406401001',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 10,
      shieldCounter: true,
      note: '罪血嚼齿：单体虚数伤害；目标持盾 → 触发【壁垒反震】（自身 +1 层防御降低）',
    },
    {
      skillId: '406401002',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      summon: { monsterId: '4062010', count: 2, maxAlive: 4 },
      note: '执刑就位：召唤 2 只【金血忆灵•雉形】（壁垒反震未接）',
    },
    {
      skillId: '406401003',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      judge: { turns: 3, speedPct: 0.2, extraAction: true },
      note: '罪血眈视：锁定 1 名我方 + 自身速度提高（3 回合内只对其施放嚼齿/锯刑）+ 施放后再行动 1 次',
    },
    {
      skillId: '406401004',
      target: 'single',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 15,
      shieldCounter: true,
      erosion: { ratio: 0.5 },
      note: '罪血锯刑：单体大量虚数伤害 + 已损失生命的 50% 转【侵蚀】；持盾触发【壁垒反震】',
    },
    {
      skillId: '406401005',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 10,
      erosion: { ratio: 0.5 },
      note: '罪血钳刑：全体虚数伤害 + 已损失生命的 50% 转【侵蚀】',
    },
    {
      skillId: '406401006',
      target: 'self',
      phaseList: [1, 2],
      spHit: 0,
      charge: { nextSkillId: '406401007' },
      lock: 1,
      note: '指名祸首：蓄力（点名 1 名我方承受【罪血枭首】最高伤害与【罪血腐蚀】）',
    },
    {
      skillId: '406401007',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Imaginary',
      phaseList: [1, 2],
      spHit: 15,
      requiresCharge: true,
      designatedMultiplier: 2,
      corrode: { ratio: 1 },
      note: '罪血枭首：全体虚数伤害；被点名者 ×2 并按其未被护盾抵消的伤害施加【罪血腐蚀】',
    },
    {
      skillId: '406401008',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      note: '决狱从速（被动）：未被弱点击破时受到的伤害降低；被击破时行动额外延后、对自身造成大量虚数伤害、被击破后受到的伤害提高——三半句留口（数值待实机）',
    },
  ],

  // 金人勾魂使（2013020，混沌 P44 星启，物理，Elite）——第五十一轮补表
  // 官方 skill_list：剖判 / 镇魂 / 转阴阳 / 天坠 / 拘魂令。四处伤害技能按文案给目标类型，
  // 倍率全部占位 1（TODO 实机）；【震荡】/【强烈震荡】是它独有的控制链（无法行动 + 天坠追加），
  //  **不是现有 EnemyDebuffKind（freeze/imprison/fear/decay/devour）中的任何一种**，故只记 note 留口，
  //  没有自造机制（需要时先按「机制裁定」流程问用户）。
  '2013020': [
    {
      skillId: '201302001',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1, 2],
      spHit: 10,
      note: '剖判：单体物理伤害（倍率占位 1）',
    },
    {
      skillId: '201302002',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1, 2],
      spHit: 10,
      note: '镇魂：单体物理伤害 + 大概率【震荡】（震荡链留口：非现行 debuff 类型）',
    },
    {
      skillId: '201302003',
      target: 'aoe',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1, 2],
      spHit: 15,
      note: '转阴阳：全体物理伤害 + 概率【震荡】（震荡链留口）',
    },
    {
      skillId: '201302004',
      target: 'single',
      multiplier: 1,
      damageType: 'Physical',
      phaseList: [1, 2],
      spHit: 15,
      note: '天坠：单体大量物理伤害；目标处于【强烈震荡】时追加一段并解除（追加段留口）',
    },
    {
      skillId: '201302005',
      target: 'self',
      passive: true,
      phaseList: [1, 2],
      spHit: 0,
      note: '拘魂令（被动）：场上有我方陷入【强烈震荡】时锁定该目标，下次行动对其施放【天坠】——震荡链留口',
    },
  ],
};

/** 该怪的全部技能（含蓄力/被动；无表 = 该怪不反击） */
export function enemySkills(monsterId: string | undefined): EnemySkillDef[] {
  if (!monsterId) return [];
  return ENEMY_SKILLS[monsterId] ?? [];
}

/** 该怪 AI 可选的伤害技能（multiplier 存在才出手）——2026-10 旧口径，保持不变 */
export function enemyDamageSkills(monsterId: string | undefined): EnemySkillDef[] {
  if (!monsterId) return [];
  return (ENEMY_SKILLS[monsterId] ?? []).filter((s) => s.multiplier !== undefined);
}

/** AI 可选技能 = 伤害技能 + 蓄力技能 + 分支形态技能 + 控制/负面技能（被动/留口技能不选） */
export function enemyUsableSkills(monsterId: string | undefined): EnemySkillDef[] {
  return enemySkills(monsterId).filter(
    (s) =>
      !s.passive &&
      (s.multiplier !== undefined ||
        s.charge !== undefined ||
        s.branchStatus !== undefined ||
        s.consumeSummon !== undefined ||
        s.dominate !== undefined ||
        s.suggest !== undefined ||
        s.judge !== undefined ||
        // 自身增益类（2026-10-30 混沌 P43 / 异相仲裁 P10）：【冰点】/【盾反】/召唤/计数增益也可被 AI 选中
        // （【破晓力场】是阶段转换：不进随机池，由战斗逻辑在未开力场时首动强制开启）
        s.frostPoint !== undefined ||
        s.counterStance !== undefined ||
        s.selfState !== undefined ||
        s.retargetMark !== undefined ||
        s.weaknessInvalid !== undefined ||
        s.advanceOnHits !== undefined ||
        s.declineDamage !== undefined ||
        s.healSide !== undefined ||
        s.windWalk !== undefined ||
        s.supportFollowUp !== undefined ||
        s.supportBuff !== undefined ||
        s.stagger !== undefined ||
        s.summon !== undefined ||
        // 火花大会（5014010）【连麦PK】相关：开 PK / PK 解除分支 / 推流 / 好感度 都要能被 AI 选中
        s.openPk !== undefined ||
        s.pkResolve !== undefined ||
        s.pushTraffic !== undefined ||
        s.favorGauge !== undefined),
  );
}

/**
 * 【连麦PK】副战场敌方召唤数量（火花大会 5014010，2026-10-30 裁定 51）：
 * 一阶段 3 只攻击性阅读物；二阶段 4 只 + 直播小助手。
 * 阶段由统一转阶段状态机给出（`MonsterState.phase`，按 HP 均分推进，裁定 39）。
 */
export function pkSubSummon(
  spec: NonNullable<EnemySkillDef["openPk"]>,
  phase: number,
): { count: number; helper: boolean } {
  const phase2 = phase >= 2;
  return {
    count: spec.phaseCounts[phase2 ? 1 : 0] ?? spec.phaseCounts[0],
    helper: phase2 && spec.helperId !== undefined,
  };
}

/**
 * 怪物阶段数（裁定 39：`phaseList` 的最大值；无表/单阶段 = 1）。
 * 统一转阶段状态机按 HP 均分推进（`MonsterState.phase`）。
 */
export function monsterPhaseCount(monsterId: string | undefined): number {
  let max = 1;
  for (const s of enemySkills(monsterId)) {
    for (const p of s.phaseList ?? []) if (p > max) max = p;
  }
  return max;
}

/** 按技能 id 取定义（蓄力释放窗口用） */
export function enemySkillById(
  monsterId: string | undefined,
  skillId: string,
): EnemySkillDef | undefined {
  return enemySkills(monsterId).find((s) => s.skillId === skillId);
}

/** 该怪被动提供的自身减伤合计（流年盾纱等；并入 zoneSnapshot.damageReductions） */
export function enemySelfDamageReduction(monsterId: string | undefined): number {
  return enemySkills(monsterId).reduce((sum, s) => sum + (s.selfDamageReduction ?? 0), 0);
}

/** 该怪被动是否带【颤慄】：自身攻击命中已触电目标 → 立即结算 1 次触电伤害（2004014） */
export function enemyShockDetonate(monsterId: string | undefined): boolean {
  return enemySkills(monsterId).some((s) => s.passive && s.shockDetonate);
}

/** 该怪被动是否带【残酷】：被支配者攻击已触电目标 → 追加 1 次雷击（2004014） */
export function enemyDominateDetonate(monsterId: string | undefined): boolean {
  return enemySkills(monsterId).some((s) => s.passive && s.dominateDetonate);
}
