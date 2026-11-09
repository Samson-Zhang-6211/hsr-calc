import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  simulateBattle,
  STAGE_PACKS,
  mechanicIdsFor,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
  type MemberPanel,
  type RoundMode,
} from '../src/index.js';

// ── 机制 note 在真实关卡里「可见」（2026-10-30 第五十轮）──
// 已有测试验的是**数值与效果**（因子、掉血、禁锢），但没锁「明细表里能不能看到这条机制」。
// 一旦某机制的 note 被上游 note 抢先写掉（HitLog.note 是单字符串、first-wins），
// 效果还在、备注消失 —— 数值测试全绿也发现不了。本文件按真实关卡锁 note 可见性。
//
// 锚点来自第五十轮 dump（HP 压到 25 万、10 轮、四人队）：
//   arb-p10|1  血嗜 11 / 洞穿 3        arb-p10|2  血嗜 37 / 洞穿 4
//   arb-p10|3  闭锁 3 + allyImprison 2  arb-p10|4  桎梏 6 / 激怒 6 / 激怒清 5
//   arb-p10|5  血嗜 19                 moc-p43|12 记忆紊流 5 + 阿哈额外回合 5

const panel = (speed: number): MemberPanel => ({
  element: 'Quantum',
  level: 80,
  hp: 400_000,
  attack: 5000,
  defence: 1000,
  critRate: 0.05,
  critDmg: 0.5,
  breakEffect: 0,
  damageBonus: 0,
  speed,
  energyRegen: 0.194,
});

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(160) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'fuxuan', panel: panel(140) },
  { id: 'aventurine', panel: panel(130) },
];

const HP_CAP = 250_000;

function run(key: { packId: string; index: number; half?: '上半' | '下半' }, rounds = 10): BattleResult {
  const pack = STAGE_PACKS.find((p) => p.id === key.packId)!;
  const stage = pack.stages.find((s) => s.index === key.index)!;
  const mech =
    (key.half ? stage.halves.find((h) => h.half === key.half)?.mechanics : undefined) ??
    stage.mechanics ??
    pack.modeMechanics ??
    [];
  const ids = mechanicIdsFor(mech.map((m) => m.name));
  const waves = buildPackStageWaves(key.packId, key.index).map((w) =>
    w.map((c) => ({ ...c, hp: Math.min(c.hp, HP_CAP) })),
  );
  const cfg: BattleConfig = {
    members: members(),
    monsterWaves: waves,
    techniques: false,
    rounds,
    maxTime: 5000,
    roundMode: pack.roundMode as RoundMode,
    ...(ids.length > 0 ? { mechanics: ids } : {}),
  };
  return simulateBattle(cfg);
}

/** 事件 note + 命中 note 的直方图 */
function noteCounts(r: BattleResult): Map<string, number> {
  const m = new Map<string, number>();
  const bump = (k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const e of r.events) for (const n of e.note ?? []) bump(n);
  for (const h of r.hits) if (h.note) bump(String(h.note));
  return m;
}

function expectNotes(r: BattleResult, required: string[], label: string) {
  const notes = noteCounts(r);
  const missing = required.filter((n) => (notes.get(n) ?? 0) === 0);
  const snapshot = [...notes]
    .filter(([k]) => k.startsWith('stage') || k.startsWith('ally'))
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  expect(missing, `${label} 缺少 note：${missing.join(',')}；实际 ${snapshot}`).toEqual([]);
}

describe('机制 note 在真实关卡里可见（first-wins 不吞）', () => {
  it('仲裁第 1 关：血嗜 + 洞穿 都有 note', () => {
    const r = run({ packId: 'arb-p10', index: 1 });
    expectNotes(r, ['stageBloodthirst', 'stagePierce'], 'arb#1');
  });

  it('仲裁第 2 关：血嗜+ / 洞穿+ 都有 note', () => {
    const r = run({ packId: 'arb-p10', index: 2 });
    expectNotes(r, ['stageBloodthirst', 'stagePierce'], 'arb#2');
  });

  it('仲裁第 3 关：闭锁的 note 与禁锢效果同时可见（不被 allyImprison 吞掉）', () => {
    const r = run({ packId: 'arb-p10', index: 3 });
    // 关键：两者都在 —— 曾经的 first-wins 现场就是这里
    expectNotes(r, ['stageLockdown', 'allyImprison'], 'arb#3');
  });

  it('仲裁第 4 关：桎梏 / 激怒 / 激怒清除 三条 note 都在', () => {
    const r = run({ packId: 'arb-p10', index: 4 });
    expectNotes(r, ['stageShackleDown', 'stageEnrage', 'stageEnrageClear'], 'arb#4');
  });

  it('仲裁第 5 关：血嗜 note 在', () => {
    const r = run({ packId: 'arb-p10', index: 5 });
    expectNotes(r, ['stageBloodthirst'], 'arb#5');
  });

  it('混沌其十二（上下半）：记忆紊流 + 阿哈额外回合 都有 note', () => {
    for (const half of ['上半', '下半'] as const) {
      const r = run({ packId: 'moc-p43', index: 12, half });
      expectNotes(r, ['stageMiasma', 'stageMiasmaAha'], `moc#12 ${half}`);
    }
  });

  it('末法余烬：需要「坚防守备被击破」才出 note（条件不满足时安静，不是漏写）', () => {
    // 末日 P21 其四假设：普通击破不触发（没有 hardenedDefence 的怪）
    const r = run({ packId: 'apo-p21', index: 4 });
    const notes = noteCounts(r);
    // 这条锁的是「别把 ember note 无条件刷出来」——它的条件是 406401208【强化防御】被击破
    expect((notes.get('stageEmber') ?? 0) === 0 || r.events.some((e) => (e.note ?? []).includes('enemyHardenedDefenceBreak'))).toBe(
      true,
    );
  });
});
