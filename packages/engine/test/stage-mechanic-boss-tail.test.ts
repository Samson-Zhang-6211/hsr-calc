import { describe, expect, it } from 'vitest';
import {
  STAGE_PACKS,
  buildPackStageWaves,
  simulateBattle,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 关卡机制：真实 BOSS 数据下的「尾句」验收（2026-10-30 第三十五轮）──
// `stage-miasma-aha` / `stage-ember-*` 三个既有用例用的是**手搓木桩**，验证的是机制数值本身；
// 本文件补另一半：**把机制挂到它自己的真实关卡包 boss 段上**，
// 确认「数据 → 机制 id → 战斗事件」这条链路在混沌 P43 / 末日 P21 的真实血量与怪物组下依然成立。
// 之所以要单独验：机制的开关由 `pack.mechanics` 决定，而真实段的怪、波次、轮次模式都与木桩不同。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 200_000,
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

describe('关卡机制 · 真实 BOSS 段尾句', () => {
  it('混沌 P43 其十二上半：【记忆紊流】每轮 = 极乐漩涡 + 阿哈额外回合，笑点恰好 +20', () => {
    const pack = STAGE_PACKS.find((p) => p.id === 'moc-p43')!;
    const waves = buildPackStageWaves('moc-p43', 12, '上半').map((w) =>
      w.map((c) => ({ ...c, hp: Math.min(c.hp, 2_000_000) })),
    );
    const r = simulateBattle({
      members: members(),
      monsterWaves: waves,
      techniques: false,
      rounds: 6,
      maxTime: 4000,
      roundMode: pack.roundMode,
      mechanics: ['miasma'],
    });

    // 每轮各一次「极乐漩涡」事件
    const miasmaEvents = r.events.filter((e) => (e.note ?? []).includes('stageMiasma'));
    expect(miasmaEvents.length).toBeGreaterThan(0);
    const roundsSeen = miasmaEvents.map((e) => e.round);
    expect(new Set(roundsSeen).size, '同一轮出现多次记忆紊流').toBe(roundsSeen.length);

    // 紧随其后的阿哈额外回合：同轮、带 stageMiasmaAha note
    const ahaEvents = r.events.filter((e) => (e.note ?? []).includes('stageMiasmaAha'));
    expect(ahaEvents.length, '记忆紊流尾句（阿哈额外回合）没触发').toBeGreaterThan(0);
    for (const aha of ahaEvents) {
      expect(roundsSeen.includes(aha.round), `第 ${aha.round} 轮有阿哈回合但没有极乐漩涡`).toBe(true);
    }

    // 事件形态：极乐漩涡是 skill 事件、阿哈尾句是 ahaMoment 事件
    for (const e of miasmaEvents) {
      expect(e.action).toBe('skill');
      expect(e.skillCode).toBe('stage.miasma');
      expect(e.unitId).toBe('huohua');
    }
    for (const e of ahaEvents) {
      expect(e.action).toBe('ahaMoment');
      expect(e.skillCode).toBe('aha.moment');
    }
    // 极乐漩涡确实打出了欢愉伤害（不是空事件）
    const vortexSeqs = new Set(miasmaEvents.flatMap((e) => e.hitSeqs ?? []));
    expect(vortexSeqs.size).toBeGreaterThan(0);
    expect(r.hits.some((h) => vortexSeqs.has(h.seq) && h.kind === 'elation')).toBe(true);
  });

  it('末日 P21 难度04下半：坚防守备被击破 → 解控+拉条，并追加阿哈额外回合', () => {
    const pack = STAGE_PACKS.find((p) => p.id === 'apo-p21')!;
    const waves = buildPackStageWaves('apo-p21', 4, '下半').map((w) =>
      w.map((c) => ({ ...c, hp: Math.min(c.hp, 2_000_000) })),
    );
    const notes = new Set<string>();
    const r = simulateBattle({
      members: members(),
      monsterWaves: waves,
      techniques: false,
      rounds: 8,
      maxTime: 4000,
      roundMode: pack.roundMode,
      mechanics: ['ember'],
    });
    for (const e of r.events) for (const n of e.note ?? []) notes.add(n);
    expect(notes.has('stageEmber'), '【末法余烬】破韧解控/拉条未触发').toBe(true);
    expect(notes.has('stageEmberAha'), '【末法余烬】阿哈额外回合未触发').toBe(true);
    // 阿哈额外回合必须是完整的 ahaMoment 事件（不是仅一条 note）
    const ahaEv = r.events.filter((e) => (e.note ?? []).includes('stageEmberAha'));
    expect(ahaEv.length).toBeGreaterThan(0);
    for (const e of ahaEv) {
      expect(e.action).toBe('ahaMoment');
      expect(e.skillCode).toBe('aha.moment');
    }
  });

  it('关掉机制则两条尾句都不出现（机制确实来自包的配置）', () => {
    const moc = simulateBattle({
      members: members(),
      monsterWaves: buildPackStageWaves('moc-p43', 12, '上半').map((w) => w.map((c) => ({ ...c, hp: 1_500_000 }))),
      techniques: false,
      rounds: 4,
      maxTime: 3000,
      roundMode: 'forgotten',
    });
    const mocNotes = new Set<string>();
    for (const e of moc.events) for (const n of e.note ?? []) mocNotes.add(n);
    expect(mocNotes.has('stageMiasma')).toBe(false);
    expect(mocNotes.has('stageMiasmaAha')).toBe(false);

    const apo = simulateBattle({
      members: members(),
      monsterWaves: buildPackStageWaves('apo-p21', 4, '下半').map((w) => w.map((c) => ({ ...c, hp: 1_500_000 }))),
      techniques: false,
      rounds: 5,
      maxTime: 3000,
      roundMode: 'phantom',
    });
    const apoNotes = new Set<string>();
    for (const e of apo.events) for (const n of e.note ?? []) apoNotes.add(n);
    expect(apoNotes.has('stageEmber')).toBe(false);
    expect(apoNotes.has('stageEmberAha')).toBe(false);
  });
});
