import type { Element } from '@hsr-calc/shared';
import { describe, expect, it } from 'vitest';
import {
  createInteractiveBattle,
  simulateBattle,
  type BattleConfig,
  type BuffSnapshot,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
  type PolicyFn,
} from '../src/index.js';

// 遗器套装批1（101~106 四件套，2026-10 批1裁定）。
// 锚点全部由 *-dump.test.ts 实跑定锚（%TEMP%/临时目录/relic-batch1-dump.txt），勿凭推理改数。

const ALL_ELEMENTS: Element[] = [
  'Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary',
];

function panel(element: Element, speed: number): MemberPanel {
  return {
    element, level: 80, hp: 10000, attack: 2000, defence: 1000,
    critRate: 0.05, critDmg: 0.5, breakEffect: 0, damageBonus: 0,
    speed, energyRegen: 0,
  };
}

function monster(): MonsterConfig {
  return {
    level: 90, hp: 1e9, resistance: {}, weaknesses: ALL_ELEMENTS,
    maxToughness: 9999, speed: 100, enemyClass: 'elite',
  };
}
function monsterHit(attack: number, speed = 100): MonsterConfig {
  return { ...monster(), monsterId: '1004011', attack, speed };
}

const jy = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'jingyuan', panel: panel('Thunder', 135), ...extra,
});
const th = (extra: Partial<CombatMember> = {}): CombatMember => ({
  id: 'tenghuang', panel: panel('Physical', 134), ...extra,
});

function run(
  members: CombatMember[],
  opts: { maxTime?: number; monster?: MonsterConfig; policy?: PolicyFn } = {},
) {
  const cfg: BattleConfig = {
    members,
    monster: opts.monster ?? monster(),
    rounds: 10,
    maxTime: opts.maxTime ?? 600,
    techniques: false,
    policy: opts.policy,
  };
  return simulateBattle(cfg);
}

const basicOnly: PolicyFn = () => 'basic';

function factorOfSeq(
  r: ReturnType<typeof simulateBattle>,
  seq: number,
  key: string,
): number | null {
  const h = r.hits.find((x) => x.seq === seq);
  return h?.factors.find((f) => f.key === key)?.value ?? null;
}

function buffList(
  r: ReturnType<typeof simulateBattle>,
  holder: string,
): { t: number; list: BuffSnapshot[] }[] {
  return r.events
    .filter((e) => e.buffs?.[holder])
    .map((e) => ({ t: e.time, list: e.buffs![holder]! }));
}

/** 推进到首个决策点（开局可能先吐事件步） */
function firstDecision(
  b: ReturnType<typeof createInteractiveBattle>,
): { type: string; status?: { sp: number } } | null {
  for (let i = 0; i < 50; i++) {
    const s = b.advance();
    if (!s) return null;
    if (s.type === 'decision') return s as never;
  }
  return null;
}

describe('遗器套装批1（101~106 四件套）', () => {
  it('101 过客：开战每名佩戴者恢复1点战技点', () => {
    const mk = (extra: Partial<CombatMember>) =>
      createInteractiveBattle({
        members: [jy(extra)],
        monster: monster(),
        rounds: 1,
        maxTime: 100,
        techniques: false,
      });
    const d0 = firstDecision(mk({}));
    const d1 = firstDecision(mk({ relicsetId: '101' }));
    expect(d0?.type).toBe('decision');
    expect(d1?.type).toBe('decision');
    expect(d0?.status?.sp).toBe(3);
    expect(d1?.status?.sp).toBe(4);
  });

  it('102 快枪手：普攻伤害+10%（damageBonus 因子 1 → 1.1）', () => {
    for (const [extra, expectFactor] of [
      [{}, 1],
      [{ relicsetId: '102' }, 1.1],
    ] as const) {
      const r = run([jy(extra as Partial<CombatMember>)], { policy: basicOnly });
      const ev = r.events.find((e) => e.kind === 'action' && e.hitSeqs?.length);
      expect(ev?.skillCode).toBe('jingyuan.basic');
      expect(ev?.hitSeqs?.[0]).toBe(0);
      expect(factorOfSeq(r, 0, 'damageBonus')).toBeCloseTo(expectFactor, 10);
    }
  });

  it('103 圣骑士：护盾量+20%（800 → 960）', () => {
    for (const [extra, expectShield] of [
      [{}, 800],
      [{ relicsetId: '103' }, 960],
    ] as const) {
      const r = run([th(extra as Partial<CombatMember>)]);
      const ev = r.events.find((e) => e.kind === 'action' && e.unitId === 'tenghuang');
      expect(ev?.skillCode).toBe('tenghuang.skill');
      const shield = ev?.buffs?.['tenghuang']?.find((x) => x.key === 'shield');
      expect(shield?.value).toBe(expectShield);
      expect(shield?.duration).toBe(3);
    }
  });

  it('104 猎人：施放终结技后暴伤+25%/2回合（终招自身事件不含该buff）', () => {
    const base = run([jy()]);
    const set = run([jy({ relicsetId: '104' })]);
    const count = (r: ReturnType<typeof simulateBattle>) =>
      buffList(r, 'jingyuan').filter(({ list }) =>
        list.some((x) => x.labelKey === 'relic104'),
      ).length;
    expect(count(base)).toBe(0);
    expect(count(set)).toBeGreaterThanOrEqual(1);
    const snap = buffList(set, 'jingyuan')
      .flatMap(({ t, list }) => list.map((x) => ({ t, x })))
      .find(({ x }) => x.labelKey === 'relic104');
    expect(snap?.x.value).toBeCloseTo(0.25, 10);
    expect(snap?.x.stacks).toBe(1);
    expect(snap?.x.duration).toBe(2);
    const firstUlt = set.events.find((e) => e.kind === 'ult' && e.unitId === 'jingyuan');
    expect(firstUlt).toBeTruthy();
    expect(
      firstUlt?.buffs?.['jingyuan']?.some((x) => x.labelKey === 'relic104'),
    ).toBe(false);
  });

  it('105 拳王：攻击/受击后+1层（≤5、本场永久；终招攻击也叠层）', () => {
    const base = run([jy()]);
    const set = run([jy({ relicsetId: '105' })]);
    const notesOf = (r: ReturnType<typeof simulateBattle>) =>
      r.events.filter((e) => e.note?.includes('relic105')).length;
    expect(notesOf(base)).toBe(0);
    expect(
      buffList(base, 'jingyuan').some(({ list }) => list.some((x) => x.labelKey === 'relic105')),
    ).toBe(false);
    // 叠层轨迹 1→2（普攻）→3（148.15 普攻后插队终招）→4→5 封顶；note 只来自常规行动
    // （终招走 castUltFor 钩子叠层但不产 note；5 层封顶后不再叠也不产 note → 恰 4 条）
    const seq: number[] = [];
    for (const { list } of buffList(set, 'jingyuan')) {
      const rb = list.find((x) => x.labelKey === 'relic105');
      if (rb && (seq.length === 0 || seq[seq.length - 1] !== rb.stacks)) seq.push(rb.stacks);
      if (rb) expect(rb.value).toBeCloseTo(0.05, 10);
    }
    expect(seq).toEqual([1, 2, 3, 4, 5]);
    expect(notesOf(set)).toBe(4);
    // 受击叠层：敌方攻击行动也产 note（锚点 monsterNote≥1；速度50首轮 t=200）
    const hit = run([jy({ relicsetId: '105' })], { monster: monsterHit(1500, 50) });
    const monNotes = hit.events.filter(
      (e) => e.action === 'monster' && e.note?.includes('relic105'),
    ).length;
    expect(monNotes).toBeGreaterThanOrEqual(1);
    const hitSeq: number[] = [];
    for (const { list } of buffList(hit, 'jingyuan')) {
      const rb = list.find((x) => x.labelKey === 'relic105');
      if (rb && (hitSeq.length === 0 || hitSeq[hitSeq.length - 1] !== rb.stacks)) hitSeq.push(rb.stacks);
    }
    expect(hitSeq[hitSeq.length - 1]).toBe(5);
  });

  it('106 铁卫：回合开始生命%≤50% → 回8%MaxHP + 恢复5能量（含充能前基础5）', () => {
    const energyChain = (r: ReturnType<typeof simulateBattle>) =>
      r.events
        .filter((e) => e.kind === 'action' && e.unitId === 'jingyuan')
        .map((e) => e.energyAfter);
    const relicNotes = (r: ReturnType<typeof simulateBattle>) => {
      const out: string[] = [];
      for (const e of r.events)
        for (const n of e.note ?? []) if (n.startsWith('relic')) out.push(`${e.time.toFixed(1)}:${n}`);
      return out;
    };
    // 负控：attack=100 永不过半 → 无回血回能、能量链与基线完全一致
    const lightBase = run([jy()], { monster: monsterHit(100, 50) });
    const lightSet = run([jy({ relicsetId: '106' })], { monster: monsterHit(100, 50) });
    expect(relicNotes(lightBase)).toEqual([]);
    expect(relicNotes(lightSet)).toEqual([]);
    expect(energyChain(lightSet)).toEqual(energyChain(lightBase));
    expect(lightBase.finalState.memberHp['jingyuan']).toBeGreaterThan(0);
    // 锚点：attack=1500 首轮 t=200 打到过半 → t=222 回合开始触发；
    // 能量链 [110,130,55,75,105] → [110,130,60,85,120]（触发回合 +5，其余事件同基线）
    const base = run([jy()], { monster: monsterHit(1500, 50) });
    const set = run([jy({ relicsetId: '106' })], { monster: monsterHit(1500, 50) });
    expect(energyChain(base)).toEqual([110, 130, 55, 75, 105]);
    expect(energyChain(set)).toEqual([110, 130, 60, 85, 120]);
    expect(relicNotes(base)).toEqual([]);
    expect(relicNotes(set)).toEqual(['222.2:relic106', '296.3:relic106', '370.4:relic106']);
    // 过半前的回合（74.1/148.1）绝不触发 → 首条 note 必在首个敌方行动（t=200）之后
    expect(set.events.find((e) => e.time.toFixed(1) === '74.1')?.note?.includes('relic106')).toBeFalsy();
  });
});
