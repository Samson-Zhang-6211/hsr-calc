import { formatSkillDesc } from './game-data.js';

export type EquipmentZone =
  | 'panel'
  | 'damageBonus'
  | 'damageReduction'
  | 'breakDmgBoost'
  | 'vulnerability'
  | 'defIgnore'
  | 'defReduction'
  | 'elationDegree'
  /** 战斗引擎已整体接入的专武效果（不进面板/计算器，仅展示口径） */
  | 'engine'
  | 'unknown';

/**
 * 战斗引擎已整体实现的专武（battle.ts 按 lightconeId 激活、叠影参数化）。
 * 这些光锥的全部子句解析为 zone='engine'——不进面板（防与引擎机制双计，
 * 如 23054 速度%已被引擎 L1674 进战乘算）、不进计算器乘区，仅展示
 * 「战斗模拟已接入」。范围外的专武子句维持原分类（勿 blanket 纳入——
 * 会误伤计算器可切换的 damage 区子句）。
 * - 23054 爻光「当她决定看见」：进战速度%+上上签双暴+err+每波次固定回15
 *   （2026-10-10 用户报告显示未接入而引擎已接，裁定修显示口径+防双计）。
 */
export const BATTLE_ENGINE_LC: ReadonlySet<string> = new Set(['23054', '22007', '21024']);

/**
 * 「引擎接管增伤」光锥（2026-10-29 用户裁定）：这些光锥的**无条件增伤句**由引擎按
 * lightconeId 在战斗内挂 damageBonus（`lcWearersParams`），web 若再烘进存档 commonBonus
 * 会双计（实测 23006：面板 commonBonus 0.18 + 引擎 buff 0.18 → 增伤因子 1.42）。
 * 命中集合 → 只把 `damageBonus` 子句改标 engine（其余面板句照旧烘焙，计算器照旧列）。
 * 新增引擎接了无条件增伤的光锥时在这里追加 id。
 */
export const ENGINE_DMG_LC: ReadonlySet<string> = new Set([
  '23006', '21008', '21061', '21017', '21062',
  // 4★ C 批：typed/条件增伤由引擎按技能类型 / 目标状态算，不烘通用增伤
  '21006', '21012', '21027', '21058', '21060',
]);

export interface EffectClause {
  id: string;
  /** 清洗后的子句原文（参数已代入） */
  raw: string;
  zone: EquipmentZone;
  /** panel 类子句对应的 composePanel property；其他 zone 为 null */
  property: string | null;
  /** 引擎小数（0.3 = 30%）；无百分数时为 0 */
  value: number;
  /** 带触发条件，需勾选后才参与计算 */
  conditional: boolean;
}

const PANEL_KW: Array<[RegExp, string]> = [
  [/攻击力(?:额外)?(?:提高|增加)/, 'AttackAddedRatio'],
  [/生命上限(?:额外)?(?:提高|增加)/, 'HPAddedRatio'],
  [/防御力(?:额外)?(?:提高|增加)/, 'DefenceAddedRatio'],
  [/暴击伤害(?:额外)?(?:提高|增加)/, 'CriticalDamageBase'],
  [/暴击率(?:额外)?(?:提高|增加)/, 'CriticalChanceBase'],
  [/击破特攻(?:额外)?(?:提高|增加)/, 'BreakDamageAddedRatioBase'],
  [/效果命中(?:额外)?(?:提高|增加)/, 'StatusProbabilityBase'],
  [/效果抵抗(?:额外)?(?:提高|增加)/, 'StatusResistanceBase'],
  [/治疗量(?:额外)?(?:提高|增加)/, 'HealRatioBase'],
  [/能量恢复效率(?:额外)?(?:提高|增加)/, 'SPRatioBase'],
];

const EFFECT_VERB = /提高|降低|无视|增加|减少|免疫|恢复|提前/;

function extractPct(clause: string): number | null {
  const m = /([\d.]+)\s*%/.exec(clause);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n / 100 : null;
}

/** 平坦点数（如「基础速度提高12点」的 12）；无数字返回 null */
function extractFlat(clause: string): number | null {
  const m = /提高\s*([\d.]+)/.exec(clause);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function isConditionalShape(clause: string): boolean {
  // 批2修复（2026-10 用户裁定「修复并补测试」）：条件嵌在句中（112/117「装备者对陷入…
  // 造成伤害时暴击率提高」型）原只查句首触发词/句尾「时」/含「每」会漏判 → 无条件烘进面板。
  // 「同时提高」的「时」不构成条件（303 贸易航道 2pc 先例）→ 含「同时」豁免。
  // 批5（2026-10-13）：①补「如果」句首（317 露莎卡「如果装备者不是编队中的第一位角色，
  // 使第一位角色攻击力提高12%」原漏判 → 误烘进佩戴者面板）；②目标是「其他角色」的子句
  // （312 匹诺康尼「与装备者属性相同的我方其他角色伤害+10%」）不构成本人面板增益 → 标条件防误烘。
  return (
    /^(当|若|如果|每|每次|每层|对|处于|在)/.test(clause) ||
    /时$/.test(clause) ||
    clause.includes('每') ||
    (clause.includes('时') && !clause.includes('同时')) ||
    clause.includes('陷入') ||
    clause.includes('其他角色') ||
    // 2026-10-29：数值随另一条属性换算的子句（21014「提高数值等同于效果抵抗的33%」等）
    // 不能按固定值烘进面板 → 标条件，交给引擎按实时属性算。
    clause.includes('等同于') ||
    // 2026-10-29 4★ B 批：团队向 / 施放后 / 可叠加子句不能烘进佩戴者面板（否则只给佩戴者一人加、
    // 且与引擎团队效果双计）→ 统一标条件，引擎按实时状态处理。
    clause.includes('我方全体') ||
    clause.includes('我方目标') ||
    clause.includes('我方其他') ||
    /装备者施放.*后/.test(clause) ||
    clause.includes('可叠加') ||
    clause.includes('最多叠加')
  );
}

function classify(clause: string): { zone: EquipmentZone; property: string | null } {
  if (/受到的(?:击破)?伤害(?:额外)?提高/.test(clause)) return { zone: 'vulnerability', property: null };
  if (/受到的伤害(?:额外)?降低/.test(clause)) return { zone: 'damageReduction', property: null };
  if (/受到的治疗/.test(clause)) return { zone: 'unknown', property: null };
  // 「基础速度提高N点」=平坦速度点数（23065啊哈/23036织锦/23044黎明专武同文案，
  // 2026-10-09 用户裁定：非条件子句、计入面板基础速度，参与后续百分比速度提高）
  if (/基础速度(?:额外)?(?:提高|增加)/.test(clause)) return { zone: 'panel', property: 'SpeedDelta' };
  // 无「基础速度」字样的速度百分比 → 面板速度%（2026-10-10 用户裁定接入：
  // 遗器2件套「使装备者的速度提高6%」进面板；条件子句（光锥风口类）在
  // parseEquipmentEffect 内降级回 unknown，只接无条件句）
  if (/速度(?:额外)?(?:提高|增加)/.test(clause)) return { zone: 'panel', property: 'SpeedAddedRatio' };
  for (const [re, prop] of PANEL_KW) {
    if (re.test(clause)) return { zone: 'panel', property: prop };
  }
  if (/击破伤害(?:额外)?提高/.test(clause)) return { zone: 'breakDmgBoost', property: null };
  // {0,12}：23065「无视敌方目标16%的防御力」无视与防御间隔9字，原 {0,6} 漏匹配
  if (/无视.{0,12}防御/.test(clause)) return { zone: 'defIgnore', property: null };
  if (/伤害(?:额外)?提高/.test(clause)) return { zone: 'damageBonus', property: null };
  if (/防御力?降低|降低.{0,5}防御/.test(clause)) return { zone: 'defReduction', property: null };
  if (/欢愉度(?:提高|增加)/.test(clause)) return { zone: 'elationDegree', property: null };
  // 专武23053「战技点上限提高N点」：引擎 maxSp() 已按欢愉角色数实时计（battle.ts
  // maxSp，每名+1封顶+3）；classify 不认识原样落 unknown → 渲染「未接入计算」会误导
  // （23054/星魂同先例）→ 标 engine 仅改展示口径（engine 不进面板/计算器）。
  // 注意勿放宽到裸「提高N点」：23046「战技点上限大于等于6点」是条件引用不命中本规则。
  if (/战技点上限(?:额外)?(?:提高|增加)/.test(clause)) return { zone: 'engine', property: null };
  return { zone: 'unknown', property: null };
}

/**
 * 解析装备效果文案（光锥叠影技能 / 遗器套装效果）为乘区子句列表。
 * - 中文文本按「。；」分句、「，」分句内子句；句内子句继承条件态，句号重置。
 * - 分句以「当/若/每/对/处于/在」开头或以「时」结尾 → 标记 conditional。
 * - 分类只认已确认口径的模式，未识别的进 unknown（仅展示，不参与计算）。
 * - 非中文文本（英文界面）不做解析，整段作为单条 unknown 返回。
 */
export function parseEquipmentEffect(
  idPrefix: string,
  desc: string,
  params: readonly number[],
  opts?: { lightconeId?: string },
): EffectClause[] {
  const out = parseClauses(idPrefix, desc, params);
  if (opts?.lightconeId && BATTLE_ENGINE_LC.has(opts.lightconeId)) {
    return out.map((c) => ({ ...c, zone: 'engine' as const, property: null, conditional: false }));
  }
  // 引擎接管增伤：只把 damageBonus 子句改标 engine（防 commonBonus 双计；面板句仍烘焙）
  if (opts?.lightconeId && ENGINE_DMG_LC.has(opts.lightconeId)) {
    return out.map((c) =>
      c.zone === 'damageBonus'
        ? { ...c, zone: 'engine' as const, property: null, conditional: false }
        : c,
    );
  }
  return out;
}

function parseClauses(idPrefix: string, desc: string, params: readonly number[]): EffectClause[] {
  const text = formatSkillDesc(desc, params).replace(/\s+/g, ' ').trim();
  if (!text) return [];
  if (!/[\u4e00-\u9fff]/.test(text)) {
    return [
      { id: `${idPrefix}:0`, raw: text, zone: 'unknown', property: null, value: 0, conditional: false },
    ];
  }
  const out: EffectClause[] = [];
  let idx = 0;
  for (const sentence of text.split(/[。；;]/)) {
    let conditional = false;
    // 句内 engine 继承：23053「战技点上限提高1点，最多提高3点」拆逗号后第二件
    // 「最多提高3点」无关键词落 unknown → 承接同句前件 engine（与 conditional 句内累积同模式）。
    let sentenceEngine = false;
    for (const piece of sentence.split(/[，,]/)) {
      const raw = piece.trim();
      if (!raw) continue;
      if (isConditionalShape(raw)) conditional = true;
      const { zone: baseZone, property } = classify(raw);
      // 条件速度%（如水砂23064风口「施放欢愉技时…速度提高24%」）维持 unknown——
      // 面板速度%只接无条件句，条件速度%的战斗内效果由引擎侧机制处理
      let zone = property === 'SpeedAddedRatio' && conditional ? 'unknown' : baseZone;
      if (zone === 'unknown' && !EFFECT_VERB.test(raw)) continue;
      if (sentenceEngine && zone === 'unknown') zone = 'engine';
      if (zone === 'engine') sentenceEngine = true;
      out.push({
        id: `${idPrefix}:${idx++}`,
        raw,
        zone,
        property,
        // 百分比词条取 %；SpeedDelta 为平坦点数（无 %），回退「提高N」数字
        value: extractPct(raw) ?? (property === 'SpeedDelta' ? extractFlat(raw) : null) ?? 0,
        conditional,
      });
    }
  }
  return out;
}

/**
 * 引擎已接入角色的星魂子句标正（2026-10-11 用户裁定「星魂子句改标战斗模拟已接入」）：
 * classify 白名单不认识的子句（如绯英E1「全属性抗性穿透提高20%」——抗穿不在白名单）
 * 原为 unknown，渲染成「未接入计算，仅供参考」会误导——星魂在战斗模拟按 eidolonLevel
 * 走引擎、不经此解析器，战斗内实际已接入。就地改标 zone='engine'（渲染「战斗模拟已接入」）。
 * 仅展示口径变化：unknown 与 engine 都不进面板（panelAdditions 只收 panel）/计算器
 * （equipmentAdds 对 unknown continue、switch 无 engine 分支），计算零影响。
 * 调用方须自行判定角色已被战斗引擎接入（战斗槽位白名单）；只动 id 前缀 e1..e6 的子句，
 * 光锥/遗器子句维持原分类。已分类的星魂子句（damageBonus 等，确进计算器）不动。
 */
export function markEidolonClausesEngine(clauses: EffectClause[]): void {
  for (const c of clauses) {
    if (c.zone === 'unknown' && /^e[1-6]:/.test(c.id)) c.zone = 'engine';
  }
}
