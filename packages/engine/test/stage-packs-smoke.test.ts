import { describe, expect, it } from 'vitest';
import {
  STAGE_PACKS,
  buildPackStageWaves,
  mechanicIdsFor,
  simulateBattle,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 关卡包全量冒烟（2026-10-30 第二十轮）──
// 目的：把「5 包 / 24 关 / 17 个可选段」每条数据的**完整链路**跑一遍
//   data → gen-monster-stages → STAGE_PACKS → buildPackStageWaves → simulateBattle，
// 断言不抛错、有事件、并有伤害产出；同时校验 `modeMechanics` → `mechanicIdsFor` 的接线。
// 这是关卡包接入的回归护栏（新增关卡数据/改波次组装时不必再手点页面）。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 2000,
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
  { id: 'sunday', panel: panel(156) },
  { id: 'jingyuan', panel: panel(134) },
  { id: 'aventurine', panel: panel(134) },
  { id: 'tenghuang', panel: panel(135) },
];

/** 把波次血量压到可以快速打完的量级（保留只数/弱点/等级，不动结构） */
function capped(waves: ReturnType<typeof buildPackStageWaves>) {
  return waves.map((wave) => wave.map((c) => ({ ...c, hp: Math.min(c.hp, 400_000) })));
}

interface Section {
  packId: string;
  stageIndex: number;
  half?: '上半' | '下半';
  label: string;
}

function sections(): Section[] {
  const list: Section[] = [];
  for (const pack of STAGE_PACKS) {
    for (const st of pack.stages) {
      if (st.kind === 'boss') {
        for (const h of st.halves) {
          list.push({ packId: pack.id, stageIndex: st.index, half: h.half as '上半' | '下半', label: `${pack.id}#${st.index}/${h.half}` });
        }
        continue;
      }
      list.push({ packId: pack.id, stageIndex: st.index, label: `${pack.id}#${st.index}` });
    }
  }
  return list;
}

describe('关卡包全量冒烟', () => {
  it('每种模式都有数据；域内共 17 个可选段', () => {
    const modes = new Set(STAGE_PACKS.map((p) => p.mode));
    expect([...modes].sort()).toEqual(['apo', 'arb', 'moc', 'pure']);
    expect(sections().length).toBe(17);
  });

  it('每个段位都能跑完一场（不抛错 + 有事件 + 有伤害）', () => {
    const packById = new Map(STAGE_PACKS.map((p) => [p.id, p]));
    for (const sec of sections()) {
      const pack = packById.get(sec.packId)!;
      const waves = capped(buildPackStageWaves(sec.packId, sec.stageIndex, sec.half));
      expect(waves.length, `${sec.label} 无波次`).toBeGreaterThan(0);
      const mechanics = mechanicIdsFor((pack.modeMechanics ?? []).map((m) => m.name));
      const r = simulateBattle({
        members: members(),
        monsterWaves: waves,
        techniques: false,
        rounds: 3,
        maxTime: 3000,
        roundMode: pack.roundMode,
        mechanics: mechanics.length > 0 ? mechanics : undefined,
      });
      expect(r.events.length, `${sec.label} 无事件`).toBeGreaterThan(0);
      expect(r.hits.length, `${sec.label} 无命中`).toBeGreaterThan(0);
      expect(Number.isFinite(r.monsterHpLeft), `${sec.label} 血量非数值`).toBe(true);
    }
  });

  it('关卡机制文案 → 引擎 id 接线（记忆紊流 / 末法余烬）', () => {
    const byId = new Map(STAGE_PACKS.map((p) => [p.id, p]));
    expect(mechanicIdsFor((byId.get('moc-p43')!.modeMechanics ?? []).map((m) => m.name))).toEqual(['miasma']);
    expect(mechanicIdsFor((byId.get('apo-p21')!.modeMechanics ?? []).map((m) => m.name))).toEqual(['ember']);
    // 无机制的两包返回空数组（前端据此不下发 mechanics）
    expect(mechanicIdsFor((byId.get('pure-p27')!.modeMechanics ?? []).map((m) => m.name))).toEqual([]);
    expect(mechanicIdsFor((byId.get('arb-p10')!.modeMechanics ?? []).map((m) => m.name))).toEqual([]);
  });
});
