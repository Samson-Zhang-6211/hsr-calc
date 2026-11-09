/**
 * 增益/减益实体。
 *
 * - value 为「每层」数值，总贡献 = value × stacks。
 * - duration 为剩余持续次数（-1 = 永久）；按 tick 规则在结算点递减，归 0 移除。
 * - tick 规则（2026-10 用户裁定）：
 *   - 'holderEnd'：持有者**常规行动**（普攻/战技）结束时递减；
 *     **终结技、追加攻击、额外回合不算回合**，其行动结束不递减。
 *     非忆灵类召唤物（神君/龙灵）结算读本体/相关方 holder（继承），自身 holder 不参与结算；
 *     忆灵为独立回合独立 buff（行动后递减自己 holder）。
 *   - 'permanent'：不递减
 *   - 持续时间按 buff 所在**目标**的回合数计算（如圣咏/蒙福者挂景元 → 按景元回合）。
 *   - 施加当次行动结束不递减（justApplied 标志），保证「行动后获得」的 buff
 *     覆盖到下一次自身行动结束。
 */

export type BuffKey =
  | 'atkFlat'
  | 'atkPct'
  | 'damageBonus'
  | 'critRate'
  | 'critDmg'
  | 'defReduction'
  | 'defIgnore'
  | 'resReduction'
  /** 分属性减抗（2026-10-29 新增）：只对指定属性生效的**怪侧**减抗，与通用 'resReduction' 求和后进抗性区。
   *  用途：Archer E2「量子抗性 −20%」等「某属性抗性降低」条款——用通用 resReduction 会误加其它属性。 */
  | 'resReductionPhysical'
  | 'resReductionFire'
  | 'resReductionIce'
  | 'resReductionWind'
  | 'resReductionThunder'
  | 'resReductionQuantum'
  | 'resReductionImaginary'
  | 'resPenetration'
  | 'vulnerability'
  | 'fireVulnerability'
  /** 大黑塔【解读】层数（value=1×stacks；上限 42，怪侧永久 buff） */
  | 'interpretation'
  | 'breakVulnerability'
  | 'breakDmgBoost'
  | 'breakEffect'
  /** 击破效率提高比例（阮•梅弦外音等；削韧结算与超击破公式两处消费） */
  | 'breakEfficiency'
  | 'energyRegen'
  | 'speedPct'
  | 'dmgReduction'
  /** 治疗量加成比例（遗器320巨树条件半句等；fjHeal/tailsHeal/zzHeal 统一乘区消费） */
  | 'healBonus'
  /** 效果抵抗提高比例（知更鸟E4 协奏中全队；引擎无 CC 判定，仅记录性） */
  | 'effectRes'
  /** 效果命中提高比例（光锥20004幽邃进战3回合；lcRoll 基础概率 = 基率×(1+面板+此键)） */
  | 'effectHit'
  /** 防御力提高比例（遗器304贝洛伯格条件半句记录用；当前引擎敌方伤害不吃我方防御，暂无消费点） */
  | 'defPct'
  /** 全属性抗性提高比例（光锥21002 余生的第一天：**我方承伤抗性乘区**，敌方伤害 ×(1−抗性)） */
  | 'resAll'
  /** 增笑（欢愉伤害专属乘区，1+增笑；啊哈星魂1 等来源） */
  | 'mirth'
  /** 欢愉度提高（开拓者秘技/终招E2 等；baseDegreeOf 经 buffSum 消费） */
  | 'degree'
  /** 光锥21064：敌方受到的欢愉伤害+（专用键，仅欢愉通道 elSnap 消费；通用 vulnerability 会误伤非欢愉伤害） */
  | 'elationVuln'
  /** 遗器114信使4：全队速度挂载标记（真实速度经 tl.speedChange，此键只记实例/持续时间） */
  | 'relic114'
  /** 遗器117先驱4：施加负面后增强态（×2 标记；读存在性不读数值） */
  | 'relic117Enhance'
  /** 遗器120勇烈4：施放追加攻击后终结技伤害+36%（仅 charAttack kind='ult' 消费） */
  | 'relic120UltDmg'
  /** 遗器122学者4：终结技后下一次战技额外+25%（一次性标记，战技出手时消费移除） */
  | 'relic122Next'
  /** 遗器315都兰4位面：功勋层数（每层=追加攻击伤害+5%；读 stacks 不读数值） */
  | 'relic315Merit'
  /** 玲可求生反应：生命上限提升数值（真改上限——maxHpOf 经 buffSum 消费） */
  | 'maxHpFlat'
  /** 生命上限提高比例（2026-11-02 新增）：maxHpOf 乘区 = base×(1+Σ)，遗器127 救世主4
   *  「装备者及其忆灵生命上限 +24%」等条款消费；忆灵的独立上限公式各自乘入。 */
  | 'maxHpPct'
  /** 白露生息：受击回血标记（value 不消费——剩余回合并经 buff duration、
   * 受击剩余次数独立存 bailuLifeTriggers、E1 到期钩子经 tickBuffsAfterAction 前后 diff） */
  | 'bailuShengxi'
  /** 光锥23059炼狱：目标受到的暴击伤害+（value=0.3；dealAttack 暴击区消费，
   * 来自装备者额外+0.3 由 source=佩戴者的第二实例提供） */
  | 'critDmgTaken'
  /** 虚无批标记键（value 不消费——纯状态标记；labelKey 区分泡影/魂迷/游丝/茫然/失窃/卸甲/穷寇/以太编码/焚灼；
   * 记入 mon.buffs → 计入 G2 负面数） */
  | 'lcMark'
  /** 卡芙卡E1：目标受到的持续伤害提高（怪侧；仅 DoT 结算通道消费，直伤不吃） */
  | 'dotTaken'
  /** 卡芙卡E2：我方全体造成的持续伤害提高（成员侧；仅 DoT 结算通道消费） */
  | 'dotBonus'
  /** 托帕【负债证明】（怪侧标记；仅追加攻击消费 value 作为易伤，且计入负面数） */
  | 'topazDebt'
  /** 托帕E1【被执行】（怪侧标记；仅追加攻击消费 value×stacks 作为暴伤易伤） */
  | 'topazExecuted'
  /** 貊泽【猎物】（怪侧标记；仅最新目标持有，充能归零即解除） */
  | 'mozePrey'
  /** 貊泽 point08：仅追加攻击消费 value 作为易伤 */
  | 'mozePreyVuln'
  /** 不死途【饲饵】（怪侧标记；仅最新目标持有；场上有饲饵 → 敌全体防御 −40%、E6 抗性 −20%） */
  | 'asBait'
  /** 不死途战技：饲饵存在时敌全体防御降低（value 为减防比例） */
  | 'asBaitDefDown'
  /** 不死途 E6：饲饵存在时敌全体全属性抗性降低（value 为降抗比例） */
  | 'asBaitResDown'
  /** 嘲讽值修正（**加算点数**，非比例；2026-10-24 用户裁定）：受击概率 = 本单位嘲讽值 ÷ 池内之和，
   * 「受击概率提高/降低」= +25/−25，「大幅提高」= +50。只被 tauntOf 消费。 */
  | 'taunt';

export type BuffTick = 'holderEnd' | 'permanent';

export interface Buff {
  /** 实例标识 = key + source + labelKey（三元组，同组视为同一实例刷新覆盖） */
  key: BuffKey;
  /** 每层数值 */
  value: number;
  stacks: number;
  duration: number;
  tick: BuffTick;
  /** 来源单位 id */
  source: string;
  /** i18n 标签键（UI 用）；同时参与实例标识——同 key+source 不同 label 视为不同实例 */
  labelKey?: string;
  /** 施加当次行动结束跳过递减（tick 后清除） */
  justApplied?: boolean;
}

export interface BuffHolder {
  buffs: Buff[];
}

/** 实例匹配（同 key+source+labelKey 视为同一实例） */
function sameInstance(a: Buff, b: Buff): boolean {
  return a.key === b.key && a.source === b.source && a.labelKey === b.labelKey;
}

/** 添加/刷新增益（同 key+source+labelKey 覆盖；新实例标记 justApplied） */
export function addBuff(holder: BuffHolder, buff: Buff): void {
  const next: Buff = { ...buff, justApplied: true };
  const idx = holder.buffs.findIndex((b) => sameInstance(b, next));
  if (idx >= 0) holder.buffs[idx] = next;
  else holder.buffs.push(next);
}

/** 移除指定 key 的增益 */
export function removeBuff(holder: BuffHolder, key: BuffKey, source?: string): void {
  holder.buffs = holder.buffs.filter(
    (b) => !(b.key === key && (source === undefined || b.source === source)),
  );
}

/** 按实例三元组移除（labelKey 不同时只移除对应实例） */
export function removeBuffInstance(holder: BuffHolder, buff: Pick<Buff, 'key' | 'source' | 'labelKey'>): void {
  holder.buffs = holder.buffs.filter((b) => !sameInstance(b, buff as Buff));
}

/** 汇总某 key 的总贡献 Σ(value×stacks)（接受持有者或列表） */
export function buffSum(buffs: readonly Buff[] | BuffHolder, key: BuffKey): number {
  const list = 'buffs' in buffs ? buffs.buffs : buffs;
  let sum = 0;
  for (const b of list) if (b.key === key) sum += b.value * b.stacks;
  return sum;
}

/** 取实例（按 key+source+labelKey），无则 undefined */
export function findBuffInstance(
  holder: BuffHolder,
  buff: Pick<Buff, 'key' | 'source' | 'labelKey'>,
): Buff | undefined {
  return holder.buffs.find((b) => sameInstance(b, buff as Buff));
}

function tickOne(b: Buff): Buff | null {
  if (b.tick === 'permanent' || b.duration < 0) return { ...b, justApplied: false };
  if (b.justApplied) return { ...b, justApplied: false };
  const duration = b.duration - 1;
  return duration <= 0 ? null : { ...b, duration, justApplied: false };
}

/**
 * 常规行动（普攻/战技）结束：递减指定持有者的 holderEnd 类 buff。
 * 终结技/追加攻击/额外回合不调用此函数。
 */
export function tickHolderBuffs(holder: BuffHolder): void {
  holder.buffs = holder.buffs.map(tickOne).filter((b): b is Buff => b !== null);
}
