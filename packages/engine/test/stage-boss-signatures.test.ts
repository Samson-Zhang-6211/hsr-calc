import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  mechanicIdsFor,
  simulateBattle,
  STAGE_PACKS,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 关卡包「BOSS 机制签名」端到端回归（2026-10-30 第二十八轮）──
// `stage-packs-smoke.test.ts` 只保证 17 个段「能跑完、有伤害」；本文件进一步锁住
// **每个 BOSS 段的招牌机制确实触发了**（数据 → 波次 → 引擎机制 → note 全链路）。
// 锚点全部来自 zz-boss-notes-dump 实测（10 轮 / maxTime 4000 / 固定队伍）。
// 改怪物技能表或 AI 候选池会移动随机序列 → 这些 note 若消失，先确认不是回归再改锚。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 200000,
    attack: 6000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(160) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
];

/** 跑一个段位，返回 note 集合 + 结果概要。
 * `noMechanics` = 屏蔽包级关卡机制（只测 BOSS 自身签名时用；P44 的「物竞天择」会插阿哈额外回合、
 * 把随机序列与节奏整体右移，导致印记链在窗口内走不完 —— 机制本体由 `stage-ns-aha.test.ts` 锁定）。 */
function runSection(
  packId: string,
  stageIndex: number,
  half?: '上半' | '下半',
  maxTime = 4000,
  rounds = 10,
  noMechanics = false,
) {
  const pack = STAGE_PACKS.find((p) => p.id === packId)!;
  const waves = buildPackStageWaves(packId, stageIndex, half).map((w) =>
    w.map((c) => ({ ...c, hp: Math.min(c.hp, 3_000_000) })),
  );
  const mechanics = noMechanics ? [] : mechanicIdsFor((pack.modeMechanics ?? []).map((m) => m.name));
  const r = simulateBattle({
    members: members(),
    monsterWaves: waves,
    techniques: false,
    rounds,
    maxTime,
    roundMode: pack.roundMode,
    mechanics: mechanics.length > 0 ? mechanics : undefined,
  });
  const notes = new Set<string>();
  for (const e of r.events) for (const n of e.note ?? []) notes.add(n);
  return { notes, victory: r.victory, hpLeft: r.monsterHpLeft, events: r.events };
}

describe('关卡包 · BOSS 机制签名', () => {
  it('混沌 P43 其十二上半 火花大会：连麦PK（隔离 + 好感度）+ 记忆紊流尾句', () => {
    const { notes, victory } = runSection('moc-p43', 12, '上半');
    for (const n of ['pkOpen', 'pkIsolate', 'pkTick', 'stageMiasma', 'stageMiasmaAha']) {
      expect(notes.has(n), `缺 note ${n}`).toBe(true);
    }
    expect(victory).toBe(true); // 该段在压血配置下能打到胜利（完整链路含结算）
  });

  it('混沌 P43 其十二下半 赞达尔：蓄力 → 形态切换 + 阿哈被动', () => {
    const { notes } = runSection('moc-p43', 12, '下半');
    for (const n of ['monsterCharge', 'monsterChargeRelease', 'enemyFormSwitch', 'monsterAhaPassive']) {
      expect(notes.has(n), `缺 note ${n}`).toBe(true);
    }
  });

  it('混沌 P43 星启：敌方力场 + 召唤物入场', () => {
    // 5 槽后每波多 2 只怪 → 随机序列右移，给更长时间保证召唤物入场链走完
    const { notes } = runSection('moc-p43', 0, undefined, 9000, 20);
    expect(notes.has('enemyForceField')).toBe(true);
    // ⚠️ 2026-11-02：5 槽重构后 `enemySummon` 未再出现（力场正常）。判定为随机序列右移导致的
    // 召唤链未复现，非断言删除——重锚前先用 zz-boss-notes-dump 重跑该段确认，再决定恢复断言，
    // 见 docs/HANDOFF-pf4-2026-11-02.md「留口」第 7 条。
    // 2026-11-06 破韧窗口改造后随机序列重新对齐，召唤链恢复出现（旧留口 #7 自动消解）
  expect(notes.has('enemySummon')).toBe(true);
  });

  it('混沌 P44 其十二下半：印记 → 释放/吞噬 + 屏障', () => {
    // ⚠️ 2026-11-06：P44 补入包级机制「物竞天择」后，每轮多 1 次阿哈额外回合（固定 20 笑点），
    // 随机序列右移 → 原 10 轮窗口内印记释放链走不完。此处按「只测 BOSS 自身签名」屏蔽关卡机制；
    // 机制本体由 `stage-ns-aha.test.ts` 单独锁定。
    const { notes } = runSection('moc-p44', 12, '下半', 4000, 10, true);
    for (const n of ['enemyMark', 'enemyMarkRelease', 'enemyBarrierBreak', 'enemyDecay']) {
      expect(notes.has(n), `缺 note ${n}`).toBe(true);
    }
  });

  it('末日 P21 难度04 下半 金血忆灵：分裂假死 + 转阶段 + 末法余烬', () => {
    const { notes } = runSection('apo-p21', 4, '下半');
    for (const n of [
      'karmaFeignDeathSkip', // 【化整为零】本体假死跳过
      'enemyHardenedDefenceBreak', // 【皮糙肉厚】被弱点击破解除
      'enemyPhaseUp', // 统一转阶段
      'stageEmber', // 末法余烬：解控 + 拉条
      'stageEmberAha', // 末法余烬：阿哈额外回合
    ]) {
      expect(notes.has(n), `缺 note ${n}`).toBe(true);
    }
  });

  it('末日 P21 难度04 上半：【心理暗示】→【揭晓】', () => {
    const { notes } = runSection('apo-p21', 4, '上半');
    for (const n of ['allySuggest', 'enemySuggestSchedule', 'allySuggestReveal']) {
      expect(notes.has(n), `缺 note ${n}`).toBe(true);
    }
  });

  it('虚构 P27 其四：蓄力技能与召唤物上限', () => {
    const { notes } = runSection('pure-p27', 4, '下半');
    expect(notes.has('monsterCharge')).toBe(true);
    expect(notes.has('monsterChargeRelease')).toBe(true);
    expect(notes.has('enemySummon')).toBe(true);
  });

  it('异相仲裁 P10 王棋：【弱点无效】+ 印记', () => {
    const { notes, victory } = runSection('arb-p10', 1);
    expect(notes.has('enemyWeaknessInvalid')).toBe(true);
    expect(notes.has('enemyMark')).toBe(true);
    expect(victory).toBe(true);
  });
});
