import { describe, expect, it } from 'vitest';
import { simulateBattle, type BattleConfig, type CombatMember } from '../src/index.js';

/**
 * L1 合成测试：**忆灵 / 召唤物 × 「我方目标」语义** 的覆盖矩阵（2026-11-02）。
 *
 * 与 L3（dump 快照锚）的区别：这里只验「**存在性**」——某条「我方全体/我方目标」条款
 * 到底有没有落到该单位身上、以及「我方忆灵」条款有没有把它错算进非忆灵。
 * 断言全部是结构/差分，不抄任何 dump 数字，所以**机制被整体漏掉时会红**（L3 不会）。
 *
 * 覆盖的两类判定：
 * - A 组（inclusive）：`allHolders()` 必须覆盖 `SUMMON_OWNERS` 的**全部 10 个**召唤物
 *   （含非忆灵的神君/龙灵/浮元）。用晴歌 1512 E2「我方目标的全属性抗性穿透 +18%」当探针——
 *   它在进战初始化时挂到 allHolders，明细快照里能直接看到落点。
 * - B 组（exclusive）：「我方忆灵」条款（1413 E1）只作用于 7 只忆灵，**神君不吃**。
 */

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 103,
  attack: 2000,
  hp: 5000,
  defence: 1200,
  element: 'Ice' as const,
  critRate: 0.5,
  critDmg: 1.0,
  elationDegree: 0,
  damageBonus: 0,
  breakEffect: 0,
  effectHit: 0,
  effectRes: 0,
  damageReduction: 0,
  energyRegen: 0,
  outgoingHealing: 0,
  elementDmg: { Ice: 0 },
  ...over,
});

const MON: BattleConfig['monster'] = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 99999,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};

const mk = (id: string, over: Record<string, unknown> = {}, eidolon = 0): CombatMember => ({
  id: id as CombatMember['id'],
  eidolonLevel: eidolon,
  panel: mkPanel(over),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

type BuffSnap = { labelKey?: string; source?: string; key?: string; value?: number };
type Ev = { buffs?: Partial<Record<string, readonly BuffSnap[]>> };

/** 取「任意一条事件里该单位快照」的 buff 列表。
 *  ⚠️ 2026-11-02 踩过：只看**第一个**带该单位快照的事件会漏掉**晚于首次快照**才施加的 buff
 *  （典型：秘技段、终结技后、行动后触发）。所以这里扫**全部事件**取并集（按 labelKey+key 去重）。 */
const buffsOf = (r: { events: readonly Ev[] }, unit: string): readonly BuffSnap[] => {
  const seen = new Map<string, BuffSnap>();
  for (const e of r.events) {
    for (const b of e.buffs?.[unit] ?? []) {
      const k = `${b.labelKey ?? ''}|${b.key ?? ''}`;
      if (!seen.has(k)) seen.set(k, b);
    }
  }
  return [...seen.values()];
};
const hasLabel = (r: { events: readonly Ev[] }, unit: string, label: string) =>
  buffsOf(r, unit).some((b) => b.labelKey === label);

/** 跑一场短战斗：只为了让 statusOf 吐出一条带 buff 快照的事件。
 *  ⚠️ maxTime 必须够某些单位走完 1 次行动（速度 110 时 av≈91），否则 events 为空、
 *  快照断言会假红（本矩阵第一版就踩了 maxTime=60）。 */
const runShort = (members: CombatMember[], monsters: 1 | 3 = 1) =>
  simulateBattle({
    members,
    monsters: Array.from({ length: monsters }, () => MON),
    techniques: false,
    rounds: 2,
    maxTime: 400,
  } as unknown as BattleConfig);

type HQ = { owner: string; summon: string; kind: '忆灵' | '非忆灵召唤物' };
const QINGGE_E2_TARGETS: readonly HQ[] = [
  { owner: 'qingge', summon: 'memo', kind: '忆灵' },
  { owner: 'aglaea', summon: 'yijiang', kind: '忆灵' },
  { owner: 'trailblazerMem', summon: 'mimi', kind: '忆灵' },
  { owner: 'xiedie', summon: 'silong', kind: '忆灵' },
  { owner: 'fengjin', summon: 'xiaoyika', kind: '忆灵' },
  { owner: 'changyeyue', summon: 'changye', kind: '忆灵' },
  { owner: 'xilian', summon: 'demiurge', kind: '忆灵' },
  { owner: 'jingyuan', summon: 'shenjun', kind: '非忆灵召唤物' },
  { owner: 'tenghuang', summon: 'longling', kind: '非忆灵召唤物' },
  { owner: 'lingsha', summon: 'fuyuan', kind: '非忆灵召唤物' },
];

describe('L1 · 「我方目标」必须覆盖全部召唤物（晴歌 1512 E2 抗穿当探针）', () => {
  for (const t of QINGGE_E2_TARGETS) {
    // 2026-11-02：小伊卡这条曾经红过——`summonXiaoyika` 里 `holderOf('xiaoyika').buffs = []`
    // 把进战挂上的全队常驻 buff 整批清掉。已统一成 resetSummonHolder（清瞬发/限时、留常驻），
    // 本矩阵即其回归判据；若有人再把某个召唤物的 holder 整批清空，这条会立刻转红。
    it(
      `A ${t.summon}（${t.kind}，主人 ${t.owner}）吃到我方目标抗穿`,
      { timeout: 60_000 },
      () => {
        // 晴歌自己那档要有 2 名成员（晴歌 solo 放终招会炸 resolveAlly，既有设计限制）
        const members =
          t.owner === 'qingge'
            ? [mk('qingge', { speed: 110 }, 2), mk('jingyuan', { speed: 120 })]
            : [mk('qingge', { speed: 110 }, 2), mk(t.owner, { speed: 120 })];
        const r = runShort(members);
        expect(hasLabel(r, t.summon, 'qinggeE2')).toBe(true);
      },
    );
  }

  it(
    'A0 反例：晴歌 0 星魂时该 buff 不存在（探针本身不是恒真）',
    { timeout: 60_000 },
    () => {
      const r = runShort([mk('qingge', { speed: 110 }, 0), mk('fengjin', { speed: 120 })]);
      expect(hasLabel(r, 'xiaoyika', 'qinggeE2')).toBe(false);
    },
  );
});

/**
 * 批次 1/2/3 转正清单的判据：这些条款文案是「我方全体」，已改成挂 `allHolders()`。
 * 探针用**不同 key 的 buff**（暴伤 / 击破特攻 / 击破伤害 / 攻击 / 增伤 / 抗性），
 * 覆盖 key 而不是只覆盖一个来源 —— 否则改成 `members` 也可能因别的 buff 巧合通过。
 */
describe('L1 · 「我方全体」条款必须落到召唤物（批次 1~3 转正清单）', () => {
  const CASES: readonly { label: string; owner: string; summon: string; labelKey: string }[] = [
    { label: '知更鸟天赋 我方全体暴伤 +27.5%', owner: 'robin', summon: 'changye', labelKey: 'robinTalent' },
    { label: '阮梅 point06 我方全体击破特攻 +20%', owner: 'ruanmei', summon: 'changye', labelKey: 'traceRmP06' },
    { label: '花火 point08 我方全体攻击力 +45%', owner: 'huahuo', summon: 'changye', labelKey: 'traceHhP08' },
    { label: '佩拉 point07 我方全体效果命中 +10%', owner: 'pela', summon: 'changye', labelKey: 'pelaP07' },
  ];

  for (const c of CASES) {
    it(
      `B ${c.label} → 长夜的 holder 上必须有该实例`,
      { timeout: 60_000 },
      () => {
        // 队伍里放长夜月（只为了让它成为「在队召唤物」，快照才会列 changye）
        const r = runShort([mk(c.owner, { speed: 110 }), mk('changyeyue', { speed: 120 })]);
        expect(hasLabel(r, c.summon, c.labelKey)).toBe(true);
      },
    );
  }
});

describe('L1 · 「我方忆灵」不含非忆灵召唤物（长夜月 1413 E1）', () => {
  const hitsOf = (r: { hits: readonly { source?: string; total: number }[] }, src: string) =>
    r.hits.filter((h) => h.source === src).reduce((a, h) => a + h.total, 0);

  it(
    'B 同队 3 名敌人：长夜的伤害 ×1.25，神君的伤害完全不变',
    { timeout: 120_000 },
    () => {
      const run = (eidolon: number) =>
        simulateBattle({
          members: [
            mk('changyeyue', { element: 'Quantum', speed: 105, attack: 2400 }, eidolon),
            mk('jingyuan', { element: 'Thunder', speed: 120, attack: 2400 }),
          ],
          monsters: [MON, MON, MON],
          techniques: false,
          rounds: 12,
          maxTime: 800,
        } as unknown as BattleConfig);

      const e0 = run(0);
      const e1 = run(1);
      // 神君是召唤物但**不是忆灵** → 不在「我方忆灵」范围内，伤害应逐位相同
      expect(hitsOf(e1, 'shenjun')).toBeCloseTo(hitsOf(e0, 'shenjun'), 6);
      // 长夜是忆灵 → 3 名敌人档 ×1.25
      expect(hitsOf(e1, 'changye') / hitsOf(e0, 'changye')).toBeCloseTo(1.25, 6);
    },
  );
});

/**
 * L1 扩表（2026-11-02 C3 batch 8~11 转正清单）。
 *
 * 上一组只覆盖 batch 1~3（4 条）。这里把 **进战初始化期就能确定落点**的「我方全体」条款补上，
 * 每个用例都断言「长夜（在队忆灵）身上出现该 labelKey」。
 * 探针覆盖**不同 buff key**（暴伤 / 攻击 / 抗穿 / 效果抵抗 / DoT / 欢愉增笑 / 防御），
 * 避免「只有某一个 key 恰好通过」。
 *
 * 不放进来的三类（会假红或需要额外条件）：
 * - 需要 `techniques: true` 的秘技类 → 单独一组 `runTech` 覆盖（aventurine/ruanmei/同谐主/布洛妮娅）；
 * - 需要战斗中条件触发的（23011 掉血、326 击杀、22007 终结技、艾丝妲蓄能层数）→ 属于 L3 快照锚范畴；
 * - 元素条件类（艾丝妲火伤/驭空虚数伤）→ 只在主人为该属性时才落点，用专门的 `element` 变体验证。
 */
describe('L1 · 「我方全体」条款落点扩表（batch 8~11）', () => {
  const CASES: readonly {
    label: string;
    owner: string;
    eidolon?: number;
    labelKey: string;
    key: string;
  }[] = [
    { label: '布洛妮娅 point07 我方全体防御力', owner: 'bronya', labelKey: 'bronyaP07', key: 'defPct' },
    { label: '布洛妮娅 point08 我方全体增伤', owner: 'bronya', labelKey: 'bronyaP08', key: 'damageBonus' },
    { label: '卡芙卡 E2 我方全体 DoT 增伤', owner: 'kafka', eidolon: 2, labelKey: 'kfE2', key: 'dotBonus' },
    { label: '吉尔伽美什 point08 我方全体攻击', owner: 'gilgamesh', labelKey: 'gilgameshP08Atk', key: 'atkPct' },
    { label: '吉尔伽美什 point08 我方全体暴伤', owner: 'gilgamesh', labelKey: 'gilgameshP08Crit', key: 'critDmg' },
    { label: '爻光 E6 我方全体欢愉增笑', owner: 'yaoguang', eidolon: 6, labelKey: 'yaoguangE6', key: 'mirth' },
  ];

  for (const c of CASES) {
    it(
      `C ${c.label} → 长夜的 holder 上有 ${c.labelKey}`,
      { timeout: 60_000 },
      () => {
        const r = runShort([mk(c.owner, { speed: 110 }, c.eidolon ?? 0), mk('changyeyue', { speed: 120 })]);
        const hit = buffsOf(r, 'changye').find((b) => b.labelKey === c.labelKey);
        expect(hit, `${c.labelKey} 未落到 changye`).toBeTruthy();
        // 顺带钉住 key：条款是「攻击/暴伤/抗穿…」，落错乘区也算错
        expect(hit?.key).toBe(c.key);
      },
    );
  }

  /** 秘技类：`techniques: true` 才会在进战施加 */
  const runTech = (members: CombatMember[]) =>
    simulateBattle({
      members,
      monsters: [MON],
      techniques: true,
      rounds: 2,
      maxTime: 400,
    } as unknown as BattleConfig);

  const TECH_CASES: readonly { label: string; owner: string; eidolon?: number; labelKey: string; key: string }[] = [
    { label: '砂金秘技 我方全体防御力提高', owner: 'aventurine', labelKey: 'avenTech', key: 'defPct' },
    { label: '阮•梅秘技 全队增伤', owner: 'ruanmei', labelKey: 'rmOvertone', key: 'damageBonus' },
    { label: '布洛妮娅秘技 全队攻击', owner: 'bronya', labelKey: 'bronyaTech', key: 'atkPct' },
    { label: '同谐主秘技 全队击破特攻', owner: 'trailblazerShaman', labelKey: 'tbsTech', key: 'breakEffect' },
    // 杰帕德 E4 的 patch 点在**秘技护盾段**里（非纯进战初始化），所以放这一组
    { label: '杰帕德 E4 我方全体效果抵抗', owner: 'gepard', eidolon: 4, labelKey: 'gepardE4', key: 'effectRes' },
    // 姬子•启行 E4 需要「秘技提供的抗穿」链路，同样进秘技组
    { label: '姬子•启行 E4 我方全体抗穿', owner: 'himekoNova', eidolon: 4, labelKey: 'hnE4ResPen', key: 'resPenetration' },
  ];

  for (const c of TECH_CASES) {
    it(
      `D ${c.label}（秘技）→ 长夜的 holder 上有 ${c.labelKey}`,
      { timeout: 60_000 },
      () => {
        const r = runTech([mk(c.owner, { speed: 110 }, c.eidolon ?? 0), mk('changyeyue', { speed: 120 })]);
        const hit = buffsOf(r, 'changye').find((b) => b.labelKey === c.labelKey);
        expect(hit, `${c.labelKey} 未落到 changye`).toBeTruthy();
        expect(hit?.key).toBe(c.key);
      },
    );
  }

  // ── 反例：证明上面的探针不是「只要挂 buff 就通过」──
  it(
    'E1 反例：杰帕德 0 星魂 → 长夜身上没有 gepardE4',
    { timeout: 60_000 },
    () => {
      const r = runTech([mk('gepard', { speed: 110 }, 0), mk('changyeyue', { speed: 120 })]);
      expect(buffsOf(r, 'changye').some((b) => b.labelKey === 'gepardE4')).toBe(false);
    },
  );

  it(
    'E2 反例：爻光 0 星魂 → 长夜身上没有 yaoguangE6（mirth 不被别处误挂）',
    { timeout: 60_000 },
    () => {
      const r = runShort([mk('yaoguang', { speed: 110 }, 0), mk('changyeyue', { speed: 120 })]);
      expect(buffsOf(r, 'changye').some((b) => b.labelKey === 'yaoguangE6')).toBe(false);
    },
  );
});

/**
 * L2 组合层（2026-11-02 补，此前完全空缺）。
 *
 * 单元机制各自正确 ≠ 组合正确：独立乘区被重复计入、被加成进别的乘区、或 buff 在叠加时丢失，
 * 单机制测试都发现不了。这里用**差分+比值**验一个强不变式：
 *
 *   长夜月 1413 E1 = 「我方忆灵造成的伤害 ×1.5（1 名敌人）」是**独立乘区**，
 *   因此在叠加**别的乘区**（暴伤 / 攻击 / 抗穿）之后，比值必须**仍然是 1.5**。
 *   若 E1 被实现成增伤加算、或被其他 buff 稀释/覆盖，这个比值就会偏离 1.5。
 */
describe('L2 · 组合层：E1 独立乘区在其它乘区叠加后仍为 ×1.5', () => {
  const dmgOf = (r: { hits: readonly { source?: string; total: number }[] }, src: string) =>
    r.hits.filter((h) => h.source === src).reduce((a, h) => a + h.total, 0);

  const runPair = (extra: readonly CombatMember[]) => {
    const base = [mk('changyeyue', { element: 'Quantum', speed: 105, attack: 2400 })];
    const run = (eidolon: number) =>
      simulateBattle({
        members: [mk('changyeyue', { element: 'Quantum', speed: 105, attack: 2400 }, eidolon), ...extra],
        monsters: [MON],
        techniques: false,
        rounds: 12,
        maxTime: 800,
      } as unknown as BattleConfig);
    void base;
    return { e0: dmgOf(run(0), 'changye'), e1: dmgOf(run(1), 'changye') };
  };

  it(
    'L2-1 单独 E1：比值 ×1.5（基线）',
    { timeout: 120_000 },
    () => {
      const { e0, e1 } = runPair([]);
      expect(e1 / e0).toBeCloseTo(1.5, 6);
    },
  );

  it(
    'L2-2 叠加知更鸟天赋（我方全体暴伤）后，比值仍 ×1.5',
    { timeout: 120_000 },
    () => {
      const { e0, e1 } = runPair([mk('robin', { speed: 120 })]);
      expect(e1 / e0).toBeCloseTo(1.5, 6);
    },
  );

  it(
    'L2-3 叠加花火 point08（我方全体攻击）后，比值仍 ×1.5',
    { timeout: 120_000 },
    () => {
      const { e0, e1 } = runPair([mk('huahuo', { speed: 120 })]);
      expect(e1 / e0).toBeCloseTo(1.5, 6);
    },
  );

  it(
    'L2-4 叠加昔涟 point08（冰抗穿，按伤害属性判定）后，比值仍 ×1.5',
    { timeout: 120_000 },
    () => {
      // 昔涟超 180 速才触发；长夜伤害属性取主人（Quantum）→ 用冰伤角色做对照，这里只验比值不变
      const { e0, e1 } = runPair([mk('xilian', { speed: 200, element: 'Ice' })]);
      expect(e1 / e0).toBeCloseTo(1.5, 6);
    },
  );
});

/**
 * L1 · **元素条件**类「我方全体」条款 ⇄ 召唤物的属性归属。
 *
 * 用户裁定：「召唤物的伤害属性取主人」。所以「我方全体**火属性**伤害提高」这种条款，
 * 落到召唤物身上必须看**主人的属性**，而不是召唤物自己写死的元素。
 * 艾丝妲 point07 的实现（`harmonyInit`）正是这么写的：
 * `SUMMON_OWNERS.filter((s) => panelOf(s.owner).element === 'Fire')`。
 *
 * 这一对用例把「按主人属性」钉死：同一召唤物，主人换成火属性后必须**从无到有**。
 */
describe('L1 · 元素条件条款：召唤物按**主人**属性判定（艾丝妲 point07）', () => {
  it(
    'E1 主人是量子 → 长夜身上没有 astaP07（火伤加成不该给非火属性召唤物）',
    { timeout: 60_000 },
    () => {
      const r = runShort([
        mk('asta', { speed: 110 }),
        mk('changyeyue', { speed: 120, element: 'Quantum' }),
      ]);
      expect(buffsOf(r, 'changye').some((b) => b.labelKey === 'astaP07')).toBe(false);
    },
  );

  it(
    'E2 主人切成火 → 长夜身上出现 astaP07（同一召唤物，只因主人属性改变）',
    { timeout: 60_000 },
    () => {
      const r = runShort([mk('asta', { speed: 110 }), mk('changyeyue', { speed: 120, element: 'Fire' })]);
      const hit = buffsOf(r, 'changye').find((b) => b.labelKey === 'astaP07');
      expect(hit, '火属性主人的忆灵应吃到 astaP07').toBeTruthy();
      expect(hit?.key).toBe('damageBonus');
    },
  );
});
