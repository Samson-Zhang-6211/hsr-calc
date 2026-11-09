import type { DamageKind, Element } from '@hsr-calc/shared';
import type { CritMode } from '../zones.js';
import type { MonsterDebuffResist } from './monster-resist-data.js';

/** 队伍角色标识（与 team-axis 一致；队伍为 1-4 人自由编成） */
export type CharId =
  | 'qingge'
  | 'sunday'
  | 'jingyuan'
  | 'himeko'
  | 'rappa'
  | 'himekoNova'
  | 'herta'
  | 'tenghuang'
  | 'aglaea'
  | 'aha'
  | 'yaoguang'
  | 'huohua'
  | 'langzun'
  | 'feiying'
  | 'shuisha'
  | 'zhenzhu'
  | 'tibao'
  | 'huahuo'
  | 'tails'
  | 'trailblazer'
  | 'trailblazer2'
  | 'trailblazerMem'
  | 'trailblazerMem2'
  | 'xiedie'
  | 'fengjin'
  | 'changyeyue'
  | 'xilian'
  | 'luocha'
  | 'lingsha'
  | 'natasha'
  | 'lynx'
  | 'bailu'
  | 'gallagher'
  | 'cerdra'
  | 'robin'
  | 'ruanmei'
  | 'trailblazerShaman'
  | 'trailblazerShaman2'
  | 'hysilens'
  | 'blackswan'
  | 'kafka'
  | 'yinlang'
  | 'jiaoqiu'
  | 'huangquan'
  | 'qianye'
  | 'welt'
  | 'pela'
  | 'sampo'
  | 'luka'
  | 'guinaifen'
  | 'saifeir'
  | 'dahlia'
  | 'fugue'
  | 'asta'
  | 'bronya'
  | 'tingyun'
  | 'yukong'
  | 'hanya'
  | 'sanyueqi'
  | 'gepard'
  | 'aventurine'
  | 'fuxuan'
  | 'trailblazerKnight'
  | 'trailblazerKnight2'
  | 'herta4'
  | 'serval'
  | 'anaxa'
  | 'jade'
  | 'argenti'
  | 'qingque'
  | 'rin'
  | 'blade'
  | 'jingliu'
  | 'mydei'
  | 'saber'
  | 'gilgamesh'
  | 'misha'
  | 'firefly'
  | 'clara'
  | 'xueyi'
  | 'yunli'
  | 'arlan'
  | 'hook'
  | 'trailblazerDestroy'
  | 'trailblazerDestroy2'
  | 'danhengIL'
  | 'phainon'
  | 'ratio'
  | 'topaz'
  | 'sushang'
  | 'yanqing'
  | 'danheng'
  | 'seele'
  | 'archer'
  | 'boothill'
  | 'feixiao'
  | 'moze'
  | 'sanyueqi2'
  | 'ashveil';

/** 我方实体（含召唤物） */
export type AllyUnitId =
  | CharId
  | 'shenjun'
  | 'memo'
  | 'longling'
  | 'yijiang'
  | 'mimi'
  | 'silong'
  | 'xiaoyika'
  | 'changye'
  | 'demiurge'
  | 'fuyuan'
  | 'qyCountdown';

/** 敌方木桩（最多 5 个：monster1..5；monster3=中间默认主目标，2/4 为相邻，1/5 为最外侧） */
export type MonsterId = 'monster1' | 'monster2' | 'monster3' | 'monster4' | 'monster5';

/** 敌方召唤物单位（独立实体：可上行动条、独立 HP/速度/技能表；与三个木桩不同槽） */
export type EnemyUnitId = 'enemy1' | 'enemy2' | 'enemy3' | 'enemy4';

/** 我方攻击可命中的敌方目标（木桩槽 + 敌方召唤物；2026-10-23 用户裁定：召唤物进入目标池） */
export type CombatTarget = MonsterId | EnemyUnitId;

/** 战斗内全部时间轴实体（三个木桩参与行动用于 DoT 跳伤；countdown=晴歌倒计时，
 * countdown2=阿格莱雅至高之姿倒计时，两者可并存故用独立 id；
 * ahaMoment=阿哈时刻行动条独立实体（任一欢愉角色在队时生成）；
 * robinCountdown=知更鸟协奏倒计时（与晴歌 countdown 并存需独立 id）；
 * enemy1~4=敌方召唤物实体） */
export type CombatUnitId =
  | AllyUnitId
  | MonsterId
  | EnemyUnitId
  | 'countdown'
  | 'countdown2'
  | 'ahaMoment'
  | 'robinCountdown'
  | 'fireflyCountdown'
  | 'phainonExtra'
  | 'topazNumby';

/** 我方单位面板（由角色管理 composePanel 组装后传入） */
export interface MemberPanel {
  element: Element;
  /** 攻击者等级（默认 80） */
  level: number;
  hp: number;
  attack: number;
  /**
   * 基础攻击力（角色基础 + 光锥基础，不含遗器/行迹的百分比与固定值）。
   * 2026-11-07 用户裁定 A：攻击力% buff 只作用于**基础攻击力**，不再放大面板 attack 里的遗器%；
   * 未填时退化为旧口径（= attack），保持向后兼容。
   */
  baseAttack?: number;
  defence: number;
  critRate: number;
  critDmg: number;
  breakEffect: number;
  /** 该角色属性的增伤（旧字段，兼容单一数值面板） */
  damageBonus: number;
  /** 通用增伤（全属性共享，缺省 0）：增伤区 = commonBonus + elementDmg[伤害属性] */
  commonBonus?: number;
  /** 7 属性增伤（各属性独立）；缺省时 damageBonus 按「该角色属性」回退 */
  elementDmg?: Partial<Record<Element, number>>;
  speed: number;
  /** 充能效率加成比例（0.194 = 19.4%） */
  energyRegen: number;
  /** 欢愉度基础值（欢愉伤害乘区 1+欢愉度 的基础；令使/速度行迹由引擎自动加算） */
  elationDegree?: number;
  /** 我方受击减伤比例（0.2=20%；敌方伤害公式减伤区用，2026-10 裁定留字段，本轮可填 0） */
  damageReduction?: number;
  /** 效果命中比例（0.5=50%；遗器304贝洛伯格门槛判定用，战斗内无 buff 键=静态） */
  effectHit?: number;
  /** 效果抵抗比例（0.3=30%；遗器310龙骨门槛判定用，静态） */
  effectRes?: number;
  /** 治疗量加成比例（0.12=12%；web 面板烘焙值，引擎 fjHeal/tailsHeal/zzHeal 统一乘区） */
  healBonus?: number;
}

/** 技能等级（1~15，缺省 10）；按等级取本地 4.6 参数表 */
export interface SkillLevels {
  basic: number;
  skill: number;
  ult: number;
  talent: number;
  /** 忆灵技（晴歌 1151201），缺省 10 */
  memoSkill: number;
  /** 忆灵天赋（晴歌 1151203 / 衣匠 1140203），缺省 10（星魂 E3/E5 的「忆灵天赋等级+1」用此键） */
  memoTalent: number;
  /** 欢愉技（啊哈 151120），缺省 10（星魂 E3/E5 的「欢愉技等级+1」用此键） */
  elationSkill: number;
}

export interface CombatMember {
  id: CharId;
  panel: MemberPanel;
  /** 基础生命（角色白值 + 光锥白值；缺省 = panel.hp）。
   *  风堇秘技「生命上限提高 20%」等按**基础生命**结算的条款用它做基数（2026-11-01 视频实测）。 */
  baseHp?: number;
  skillLevels?: Partial<SkillLevels>;
  /** 星魂 0-6（缺省 0；如阿格莱雅 1魂「飘曳金星的行列」——易伤+攻线回能） */
  eidolonLevel?: number;
  /** 光锥 id（缺省/空串 = 旧档 → 引擎回退约定专武叠影值；非专武 = 该光锥效果禁用） */
  lightconeId?: string;
  /** 光锥叠影 1-5（缺省 = 约定值：晴歌5、其余1） */
  refinement?: number;
  /** 洞窟 4 件套（或 2 件套主位）id（缺省/空 = 旧档 → 引擎回退约定 DEFAULT_GEAR） */
  relicsetId?: string;
  /** 散件 2+2 第二套洞窟套 id（存在 → 四件套不激活，两套各按 2 件套生效） */
  relicsetId2?: string;
  /** 位面套 id */
  planarsetId?: string;
}

/** 自定义标准怪物（木桩）：不反击，仅挨打 + 按速度行动用于 DoT 跳伤 */
export interface MonsterConfig {
  level: number;
  hp: number;
  /** 各属性抗性（0.2 = 20%）；未列出属性默认 0 */
  resistance: Partial<Record<Element, number>>;
  /** 分属性抗性（appfeng `dk`；与 `resistance` 合并，后者优先；缺省不影响旧档） */
  elementResistance?: Partial<Record<Element, number>>;
  /** 通用效果抵抗（抵抗所有负面；与元素抗性 `resistance` 严格区分） */
  effectRes?: number;
  /** 效果命中（怪物施加负面时使用；Web 透传，暂不参与战斗） */
  effectHit?: number;
  /** 普攻弱点属性（非弱点削韧 ×0.2 的常规口径） */
  weaknesses: Element[];
  maxToughness: number;
  /**
   * 局内显示的韧性上限（2026-11-06 用户裁定）：击破伤害的韧性系数吃这个值。
   * 关卡怪由 `buildStageMonster` 填 `maxToughness / 3`（游戏 stance_base = 显示值 ×3：
   * 录像 4063010 韧条 160 ↔ 480、2013020 100 ↔ 300）；木桩/fixture 不填 = 直接吃 `maxToughness`。
   */
  toughnessUiMax?: number;
  /** 木桩速度（默认 100） */
  speed?: number;
  /**
   * 跳过【化整为零】开局分裂（金血忆灵 4064012）：仅供单测直接验证本体技能用；
   * 正常关卡不传 = 按文案分裂。
   */
  noSplit?: boolean;
  enemyClass?: 'normal' | 'elite';
  /** 敌方攻击力（2026-10 裁定：怪物库+换算公式自动填充） */
  attack?: number;
  /** 怪物 id（下拉所选，如 '1004011' 可可利亚）——命中 ENEMY_SKILLS 技能表才反击；缺省不反击（零回归口径） */
  monsterId?: string;
  /** 显示名（关卡预设用；缺省取怪物 id） */
  name?: string;
  /** 负面抵抗（冻结/禁锢/纠缠/控制总抗性；缺省 = 查 monster-resist-data.ts 的怪档表）
   *  口径（2026-10-22 用户裁定）：**该怪抵抗我方施加的同类负面**（游戏标准语义） */
  debuffResist?: MonsterDebuffResist;
  /** 附加口径（默认关）：**该怪的负面命中我方时**乘 (1−抗性)；缺省 = 不衰减 */
  debuffApplyResist?: MonsterDebuffResist;
}

/** 决策钩子（训练自动战斗预留）：返回该角色本回合用普攻还是战技 */
export type PolicyFn = (ctx: {
  id: CharId;
  sp: number;
  energyFull: boolean;
  /** 景元神君段数（其他角色为 undefined） */
  stacks?: number;
  /** 盾剩余回合（按受益者各自行动计，2026-10 裁定；策略取腾荒自身，其他角色 undefined） */
  shieldTurns?: number;
  /** 晴歌贝茜是否在场 */
  beisiPresent?: boolean;
  /** 阿格莱雅衣匠是否在场 */
  yijiangPresent?: boolean;
  /** 阿格莱雅是否处于【至高之姿】（该状态禁战技，策略应选普攻） */
  supreme?: boolean;
  /** 【愿力】是否满 8（啊哈终结技激活条件；策略用） */
  willPowerFull?: boolean;
  /** 火花【直播连线】是否已开启（开启期间普攻=强化普攻，策略应选普攻结算） */
  linkOn?: boolean;
  /** 狼尊是否处于【无敌玩家】状态（状态内普攻=强化普攻，策略应选普攻） */
  lzState?: boolean;
  /** 真珠【深度学习】是否可施放强化普攻（策略应选普攻结算） */
  deepLearning?: boolean;
  /** 缇宝【神启】剩余回合（战技挂的全队抗穿状态；≤1 时策略补战技续期） */
  tibaoShenqi?: number;
  /** 开拓者·记忆迷迷是否在场（未召时策略选战技召唤） */
  mimiPresent?: boolean;
  /** 长夜月忆灵「长夜」是否在场（未召时策略选战技召唤） */
  changyePresent?: boolean;
  /** 千冶•刃是否处于【无量忿怒】（结界中战技免费且解锁；结界外战技非法） */
  qianyeFury?: boolean;
  /** 艾丝妲【蓄能】层数（策略用） */
  astaStacks?: number;
  /** 停云【赐福】是否仍有存活目标（无则补战技） */
  tingyunBlessedActive?: boolean;
  /** 驭空【鸣弦号令】层数（0=无号令） */
  yukongStacks?: number;
  /** 寒鸦【承负】是否在场（无则补战技） */
  hanyaBurdenActive?: boolean;
}) => 'basic' | 'skill';

/** 轮次模式（2026-10 用户裁定）：
 * forgotten=忘却式（首轮边界150、之后每100）；
 * arbiter=异相仲裁式（首轮边界300、之后每100，同机制两种参数）；
 * phantom=末日幻影式（无轮次边界，战斗仅在行动值上限结束，事件轮次恒 0） */
export type RoundMode = 'forgotten' | 'arbiter' | 'phantom';

export interface BattleConfig {
  /** 编队顺序 = 数组顺序 */
  members: CombatMember[];
  /** 敌方木桩（旧口径：一套配置复制三份）。
   * 缺省时须给 monsters / monsterWaves 之一，否则没有敌人 */
  monster?: MonsterConfig;
  /** 同场多怪（2026-10-22 用户裁定③）：最多 3 只，与三个木桩槽位一一对应；
   * 缺省 = 旧口径（config.monster 复制三份）。给出时按数组顺序占槽 monster1/monster2/monster3，
   * 多余槽位视为空（HP=0、不上行动条） */
  monsters?: MonsterConfig[];
  /** 波次序列（2026-10-22）：每波一组怪（最多 3 只），前一波全灭后自动换上下一波；
   * 最后一波全灭才算胜利。缺省 = 单波（用 monsters 或 monster） */
  monsterWaves?: MonsterConfig[][];
  /**
   * 波次清场规则（2026-10-30 用户裁定 56）：
   * - 缺省 / `'all'`：本波三槽全灭才换波（旧口径，与 `monsterWaves` 引入时一致）
   * - `'pure'`：**虚构叙事** —— 第 1 波是小怪潮（每波只加载前 3 只，槽内怪死亡后从本波
   *   剩余池补位），累计击杀达 `pureKillTarget` 换波；第 2 波起 **boss（槽 1）死亡即换波**，
   *   最后一波 boss 死亡直接胜利（小怪是否清完不影响）。
   */
  waveClearRule?: 'all' | 'pure';
  /** `waveClearRule: 'pure'` 时第 1 波换波所需击杀数，默认 20（用户裁定 56 口头给值） */
  pureKillTarget?: number;
  /** 轮次上限（轮次编号从 0 起），默认 5；phantom 模式忽略（无轮次边界） */
  rounds?: number;
  /** 行动值上限；默认按 roundMode（forgotten=150+100×rounds、arbiter=300+100×rounds、phantom=2000） */
  maxTime?: number;
  /** 轮次模式，默认 forgotten */
  roundMode?: RoundMode;
  /**
   * 关卡级机制（2026-10-30 rulings 15~19 全部 = A）：传机制 id 数组，引擎按 id 施加效果。
   * 现支持：`bloodthirst` 血嗜（每回合开始 −500 生命，可致命）/ `bloodthirst2` 血嗜+（−1000）/
   * `pierce` 洞穿（敌方攻击持盾目标时伤害 +200%）/ `pierce2` 洞穿+（+400%）/
   * `ecstasyNight` 狂喜之夜（编队第一位欢愉伤害增笑 +50%）/ `pilotVow` 领航誓言（第一位战技/终结技抗穿 +50%）/
   * `shackle` 桎梏（初始 2 层，每层自身伤害 −20%，每次终结技移除 1 层）/ `shackle2` 桎梏+（同，2 层）/
   * `enrage` 激怒（我方每次终结技 → 敌方全体速度 +30%/层，最多 4 层，敌方回合开始清空）/
   * `lockdown` 闭锁（我方每次攻击叠 1 层，6 层 → 禁锢 1 回合 + 降低 30% 能量，触发后清空）。
   * `unyielding` 不屈（敌方受击获得 1% 生命上限护盾，先抵扣伤害；池上限 30%）、`ember` 末法余烬
   * （坚防守备被弱点击破 → 我方全体解控 + 行动提前 25%）。
   * 未实现（留口）：`miasma` 记忆紊流、`cytosis` 胞吞作用；末法余烬的阿哈额外回合与终结技/欢愉加伤。
   */
  mechanics?: string[];
  /** 默认开局秘技 */
  techniques?: boolean;
  /** 初始战技点，默认 3 */
  initialSp?: number;
  /** 报告伤害口径，默认期望伤害 expected */
  critMode?: CritMode;
  /** 覆盖默认规则策略（不填用内置 RulePolicy） */
  policy?: PolicyFn;
  /** 真实伤害挂点（机制字段，UI 无配置入口）：>0 时全场每次伤害计算后
   * 追加等比真伤 hit（如昔涟结界 0.24；结界条件句段待昔涟接入时实现，届时可改战斗内动态状态） */
  trueConversion?: number;
  /** 主C（2026-10 用户裁定）：增益类默认目标优先给主C；不配 = 景元在队优先，否则编队第一人 */
  mainC?: CharId;
  /**
   * 玩家指定的敌方主目标（2026-10-23 召唤物可被击杀）：木桩槽或敌方召唤物 id。
   * 「召唤物进入敌方目标池」——单体攻击打该目标；AoE/扩散不自动波及召唤物。
   */
  enemyTarget?: CombatTarget;
  /**
   * **测试/演示专用**（2026-11-02 用户裁定「加测试专用导出」）：强制敌方主目标。
   * 只有该单位在受击池里时才生效，AoE 仍按技能形态打全体（这条不是免伤开关）。
   *
   * 存在理由：忆灵（迷迷/晴空乐手/小伊卡）的 HP 按主人生命上限比例缩放，实战里
   * 「正好打死忆灵、主人还活着」的窗口极窄，测试无法稳定命中退场链；靠调大 attack /
   * 拉长回合已验证无效。生产路径不传该字段 = 行为完全不变。
   */
  forceEnemyMain?: CombatTarget;
  /** 欢愉对话框（2026-10 裁定：slots 含任一欢愉角色时 UI 必填）：
   * present=是否有啊哈入队、panelSpeed=啊哈局外面板速度（阿哈时刻速度公式基础值；无啊哈回退 80） */
  elationAha?: { present: boolean; panelSpeed: number };
  /** 黄泉 EX星魂「虚隙一顾··枯骨眠霜」开关（入队询问；仅本场战斗） */
  huangquanEx?: boolean;
  /** 景元 EX星魂「万钧入盏，风静灯明」开关（入队询问；仅本场战斗） */
  jingyuanEx?: boolean;
  /** 丹恒•饮月 EX星魂「沧溟间，月落潮平」开关（入队询问；仅本场战斗） */
  danhengILEx?: boolean;
  /** 随机数种子（弹射等随机目标统一 PRNG；缺省固定值保证默认确定性，撤回重放同 seed 同结果） */
  seed?: number;
}

export type CombatActionType =
  | 'basic'
  | 'skill'
  | 'ult'
  | 'shenjun'
  | 'memo'
  | 'longling'
  /** 灵砂天赋召唤物【浮元】追加攻击（122204，独立行动轴单位） */
  | 'fuyuan'
  | 'monster'
  | 'technique'
  | 'ahaMoment'
  /** 绯英天赋【狐狸老师】追加攻击（150504，不占行动条的即时结算事件） */
  | 'fox'
  /** 水砂天赋【抛注】热意达阈值【举杯！敬炽烈一夏】（151320，行动结算后插队施放的即时事件） */
  | 'toast'
  /** 缇宝天赋【好忙好忙的缇宝】追加攻击（140304，我方其他角色开大后的即时结算事件） */
  | 'talent'
  /** 我方持续伤害结算（触电等；末日 2004014 接入，结算在持有者行动开始时） */
  | 'dot'
  /** 被【支配】的我方成员强制攻击我方其他目标（末日 2004014 言灵/揭晓） */
  | 'dominate'
  /** 行动被跳过（陶醉：无法行动，摇滚狂徒 501301005 狂奏分支施加） */
  | 'skip';

/** 事件时点的单位 buff 快照（战斗明细表折叠展示用） */
export interface BuffSnapshot {
  key: string;
  /** i18n 标签键（timeline.team.noteLabels） */
  labelKey?: string;
  /** 来源单位 id */
  source: string;
  /** 每层数值 */
  value: number;
  stacks: number;
  /** 剩余持续回合（-1 = 永久） */
  duration: number;
}

export interface CombatEvent {
  time: number;
  round: number;
  kind: 'action' | 'round' | 'ult' | 'break' | 'victory' | 'wave';
  unitId: string;
  action?: CombatActionType;
  /** 技能代码（i18n 键），如 'jingyuan.skill' */
  skillCode?: string;
  /** 波次号（1 起；仅 monsterWaves 波次模式有值——波次是与轮次/回合并列的第三层） */
  wave?: number;
  /** 换波事件（kind:'wave'）携带的新一波怪名单 */
  waveMonsters?: { monsterId?: string; name?: string; hp: number }[];
  spAfter?: number;
  energyAfter?: number;
  /** 行动时点的【愿力】（仅啊哈相关事件带） */
  willPowerAfter?: number;
  /** 行动时点的全队共享【笑点】（阿哈时刻相关事件带） */
  laughPointsAfter?: number;
  stacks?: number;
  /** 所选目标：敌方主目标 id（单体普攻等）或我方目标 id（周日战技/大招、腾荒战技、晴歌大招） */
  targetId?: string;
  moodAfter?: number;
  /** 行动时点的龙灵强化次数（>0 时才有值） */
  enhanceAfter?: number;
  note?: string[];
  /** 关联伤害明细的 seq */
  hitSeqs?: number[];
  /** 敌方对我方的攻击结算（2026-10 可可利亚接入；与 hitSeqs（我方对敌伤害）独立，不进报告汇总） */
  enemyHits?: EnemyHitLog[];
  /** 记录时点各单位持有的 buff 快照（仅有 buff 的单位；明细表折叠展示） */
  buffs?: Partial<Record<string, BuffSnapshot[]>>;
  /** 跟随前一技能事件释放的终结技（全真模拟「技能后立即释放」：与该技能同刻同轮次，
   * 明细表并入同一 # 编号紧跟技能行输出） */
  afterSkill?: true;
  /** 额外回合（2026-11 用户裁定）：与跑道无关的插入回合——不改 av、不推进时间、
   * 不算新回合（buff/护盾/行动计数等回合结算全部跳过）。事件与触发它的行动同刻。 */
  extraTurn?: true;
}

export interface HitLog {
  seq: number;
  time: number;
  round: number;
  source: CombatUnitId;
  skillCode: string;
  kind: DamageKind;
  total: number;
  /** 受击目标（木桩槽 id，或敌方召唤物 id） */
  target?: CombatTarget;
  /** 该段的**期望伤害**（critMode 为 random 时按 1+CR×CD 折算；= total 时省略） */
  expectedTotal?: number;
  /** 乘区明细（key × value） */
  factors: { key: string; value: number }[];
  /** 攻击类型（中央钩子区分普攻/战技/终结技/追加攻击；旧事件可缺省） */
  attackKind?: 'basic' | 'skill' | 'ult' | 'followup';
  note?: string;
}

/** 敌方对我方一次攻击的受击结算（2026-10 可可利亚技能脚本；只挂事件展示，不进 byKind 报告） */
export interface EnemyHitLog {
  /** 受击我方成员 id */
  targetId: string;
  /** 敌方技能 id（如 '100401101'） */
  skillId: string;
  /** 结算伤害（防御区后全额，含被盾吸收部分） */
  damage: number;
  /** 被护盾吸收量 */
  blocked: number;
  /** 实际生命流失 */
  hpLoss: number;
  /** 是否致死 */
  dead: boolean;
  /** 本次受击回能（2026-10 裁定：单体10/扩散5/全体5，×充能效率；仅敌方攻击技能触发，DoT跳伤不回） */
  energy?: number;
}

export interface BattleReport {
  totalDamage: number;
  /** 期望总伤害（2026-11-06 用户裁定：双口径，仅全局统计展示） */
  expectedTotalDamage: number;
  expectedByKind: Partial<Record<DamageKind, number>>;
  /** 期望伤害按来源（角色/召唤物）聚合，供面板对账 */
  expectedBySource: { source: string; damage: number; hits: number }[];
  byKind: Partial<Record<DamageKind, number>>;
  bySkill: { source: string; skillCode: string; damage: number; hits: number }[];
  bySource: { source: string; damage: number; hits: number }[];
}

export interface BattleSummary {
  totalTime: number;
  rounds: number;
  spFinal: number;
  mood: number;
  ultCount: number;
  actionCounts: Record<string, number>;
}

export interface BattleFinalState {
  sp: number;
  mood: number;
  stacks: number;
  shieldTurns: number;
  blessedTurns: number;
  fever: boolean;
  rhythm: number;
  invitedTurns: number;
  energy: Record<CharId, number>;
  present: { beisi: boolean; qiumi: boolean; paiding: boolean; longling: boolean; yijiang: boolean };
  /** 阿格莱雅是否处于【至高之姿】 */
  supreme: boolean;
  /** 衣匠忆灵天赋速度层数（0-6） */
  tailorStacks: number;
  /** 三木桩剩余 HP 合计 */
  monsterHp: number;
  monsterToughness: number;
  /** 【荒腔走板】战意值终态（0-100） */
  battleWill?: number;
  /** 逐木桩状态（1=左 2=中 3=右） */
  monsters: { hp: number; toughness: number; broken: boolean }[];
  /** 敌方召唤物终态（2026-10-23：可被我方击杀；胜利判定仍只看三个木桩槽） */
  enemyUnits?: { id: string; monsterId: string; name: string; hp: number; maxHp: number }[];
  /**
   * 【连麦PK】双战场状态（火花大会 5014010，2026-10-30 裁定 51）：
   * `subMembers` = 被隔离到副战场的我方角色（前端据此标「副战场」）；
   * `subEnemies` = 副战场敌方实体（攻击性阅读物等）；人气值是纯计数器（裁定 52）。
   */
  pk?: {
    active: boolean;
    turnsLeft: number;
    subMembers: CharId[];
    subEnemies: string[];
    favorMine: number;
    favorFoe: number;
    fansReduction: number;
  };
  /** 【幻身】已离场的我方成员（亚婆离 503401001 堕神衰腐达阈值） */
  illusioned?: CharId[];
  /** 【幻身】替身名单（狂兽的胚芽，简化：不占位、无星魂） */
  illusionStandIns?: { owner: string; name: string }[];
  /** 啊哈【愿力】（0-8；无啊哈恒 0） */
  willPower: number;
  /** 全队共享【笑点】（阿哈时刻结束消耗） */
  laughPoints: number;
  /** 各角色【好活当赏】（欢愉伤害 normal 模式笑点区 x；持续 2 回合按各自行动递减） */
  goodWork: Partial<Record<CharId, number>>;
  /** 我方各成员当前生命（2026-10 裁定1；死亡=0。本轮无木桩攻击挂点 → 恒为初值） */
  memberHp: Record<CharId, number>;
  /** 我方各成员当前护盾值（裁定5：汇总区生命+盾量显示的终态快照） */
  memberShield: Record<CharId, number>;
  /** 终态各可受击单位的嘲讽值（受击概率 = 本值 ÷ 池内之和；2026-10-24 嘲讽机制） */
  taunt?: Record<string, number>;
  /** 花火大招溢出记录 SP 池剩余（无花火恒 0） */
  hh2Overflow?: number;
  /** 风堇累计治疗量（含溢出部分——2026-10 用户裁定；无风堇恒 0） */
  fjHealAccum?: number;
}

export interface BattleResult {
  events: CombatEvent[];
  hits: HitLog[];
  report: BattleReport;
  victory: boolean;
  /** 战败（我方全员无法战斗 / 全体陷入【幻身】） */
  defeated: boolean;
  monsterHpLeft: number;
  summary: BattleSummary;
  finalState: BattleFinalState;
}
