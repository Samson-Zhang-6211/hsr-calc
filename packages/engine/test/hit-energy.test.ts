import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  simulateBattle,
  type BattleConfig,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 受击回能 + 召唤物随主人死亡退场（2026-10-09，四项裁定见 AGENTS）──
// ①单体10/扩散5/全体5 ②×充能效率 ③仅敌方攻击技能（DoT跳伤不回）④主人死亡=召唤物直接退场清状态。
// 锚点由 hit-energy-dump 临时测试实跑写 %TEMP%/opencode/hit-energy-dump.txt 后据实定锚。

const ALL: Element[] = ['Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary'];

function panel(element: Element, speed: number, energyRegen: number, hp: number): MemberPanel {
  return {
    element,
    level: 80,
    hp,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen,
  };
}
function mon(attack: number): MonsterConfig {
  return {
    level: 90,
    hp: 1e9,
    resistance: {},
    weaknesses: ALL,
    maxToughness: 9999,
    speed: 100,
    enemyClass: 'elite',
    attack,
    monsterId: '1004011',
  };
}
function mk(members: CombatMember[], attack: number, extra?: Partial<BattleConfig>): BattleConfig {
  return { members, monster: mon(attack), techniques: false, rounds: 12, maxTime: 2500, ...extra };
}
const allBasic = (): NonNullable<BattleConfig['policy']> => () => 'basic';

const enemyEvents = (events: CombatEvent[]): CombatEvent[] => events.filter((e) => e.enemyHits);
const actsOf = (events: CombatEvent[], ...unitIds: string[]): CombatEvent[] =>
  events.filter((e) => e.kind === 'action' && unitIds.includes(e.unitId));
/** 首个致死 hit 的时间（受击方死亡锚） */
function deathTime(events: CombatEvent[], id: string): number {
  for (const e of events) {
    if (e.enemyHits?.some((h) => h.dead && h.targetId === id)) return e.time;
  }
  return -1;
}
/** 敌方单技能基数（裁定①）：单体10、扩散/全体5 */
const baseOf = (skillId: string | undefined): number => {
  const tail = (skillId ?? '').slice(-3);
  return tail === '101' || tail === '104' ? 10 : 5;
};

describe('受击回能（单体10/扩散5/全体5 × 充能效率）', () => {
  it('独景元 err0.194：首动能量锚（65+15绸缪+20×1.194）与逐段回能基数×1.194', () => {
    const r = simulateBattle(
      mk([{ id: 'jingyuan', panel: panel('Thunder', 135, 0.194, 10000) }], 2000, { policy: allBasic() }),
    );
    const first = actsOf(r.events, 'jingyuan')[0];
    expect(first.energyAfter).toBeCloseTo(103.88, 2); // 初始65+绸缪15(raw)+普攻20×1.194
    const evs = enemyEvents(r.events);
    expect(evs.length).toBe(3);
    // 首三段（固定种子）：扩散06 / 单体01 / 全体03 —— e = 基数×err
    expect(evs[0].skillCode).toBe('monster.100401106');
    expect(evs[0].enemyHits![0].energy).toBeCloseTo(5 * 1.194, 6);
    expect(evs[1].skillCode).toBe('monster.100401101');
    expect(evs[1].enemyHits![0].energy).toBeCloseTo(10 * 1.194, 6);
    expect(evs[2].skillCode).toBe('monster.100401103');
    expect(evs[2].enemyHits![0].energy).toBeCloseTo(5 * 1.194, 6);
    // 全量：每段 e 恒 = 基数×1.194
    for (const e of evs) {
      for (const h of e.enemyHits!) expect(h.energy).toBeCloseTo(baseOf(h.skillId) * 1.194, 6);
    }
  });

  it('双人 err0/err0.194：回能按目标充能效率区分；能量链锚（入账/触顶135/开大扣减/葳蕤）', () => {
    const r = simulateBattle(
      mk(
        [
          { id: 'jingyuan', panel: panel('Thunder', 135, 0, 10000) },
          { id: 'tenghuang', panel: panel('Physical', 134, 0.194, 10000) },
        ],
        2000,
        { policy: allBasic() },
      ),
    );
    for (const e of enemyEvents(r.events)) {
      for (const h of e.enemyHits!) {
        const err = h.targetId === 'tenghuang' ? 1.194 : 1;
        expect(h.energy).toBeCloseTo(baseOf(h.skillId) * err, 6);
      }
    }
    const tb = actsOf(r.events, 'tenghuang').filter((e) => e.skillCode === 'tenghuang.basic');
    expect(tb[0].energyAfter).toBeCloseTo(91.38, 3); // 67.5+20×1.194
    expect(tb[1].energyAfter).toBeCloseTo(122.424, 3); // +20×err(自身) + 葳蕤6×err×2
    const tu = r.events.find((e) => e.kind === 'ult' && e.unitId === 'tenghuang')!;
    expect(tu.energyAfter).toBeCloseTo(5.97, 3);
    expect(tb[2].energyAfter).toBeCloseTo(50.148, 3); // 触顶135→开大5.97→受击11.94→…→+20×1.194
    const jb = actsOf(r.events, 'jingyuan').filter((e) => e.skillCode === 'jingyuan.basic');
    expect(jb[0].energyAfter).toBe(100); // 80+20（err0）
    expect(jb[1].energyAfter).toBe(130); // +受击10(5+5)+普攻20
  });

  it('破韧 DoT 跳伤不回能：能量链锚 + 含跳伤的怪方回合仅计攻击回能', () => {
    const r = simulateBattle({
      members: [{ id: 'jingyuan', panel: panel('Thunder', 135, 0, 50000) }],
      monster: { ...mon(1000), maxToughness: 60 },
      techniques: false,
      rounds: 8,
      maxTime: 1500,
      policy: () => 'skill',
    });
    // 成员带能量的全部事件（action+ult；actsOf 只收 action 会漏开大行）
    const mine = r.events.filter((e) => e.unitId === 'jingyuan' && e.energyAfter !== undefined);
    // 前 8 次带能量事件链（据实锚）：110→受击20→开大5→…→50→受击15→95
    expect(mine.slice(0, 8).map((e) => Math.round(e.energyAfter!))).toEqual([110, 5, 35, 95, 125, 5, 50, 95]);
    // t=400 回合：怪物事件含 DoT 跳伤段（kind breakDot），其能量仅来自三段受击（5+5+5=15）——50+15=65→444 战技 95
    const m1 = r.events.find((e) => e.unitId === 'monster1' && Math.abs(e.time - 400) < 0.05)!;
    expect(m1.hitSeqs!.length).toBeGreaterThan(0);
    expect(r.hits[m1.hitSeqs![0]].kind).toBe('breakDot');
    expect(mine.find((e) => Math.abs(e.time - 444.44) < 0.05)!.energyAfter).toBe(95);
  });
});

describe('召唤物随主人死亡退场（直接退场清状态）', () => {
  it('景元阵亡：神君立即退场（不再行动），腾荒龙灵继续', () => {
    const r = simulateBattle(
      mk(
        [
          { id: 'jingyuan', panel: panel('Thunder', 135, 0, 6000) },
          { id: 'tenghuang', panel: panel('Physical', 134, 0.194, 999999) },
        ],
        5000,
      ),
    );
    expect(deathTime(r.events, 'jingyuan')).toBe(100);
    expect(actsOf(r.events, 'shenjun')).toEqual([]); // 神君列在但未行动过即随人移除；未移除则会按跑道继续行动
    const ll = actsOf(r.events, 'longling');
    expect(ll.filter((e) => e.time > 100).length).toBeGreaterThan(3); // 对照：腾荒存活、龙灵持续行动
    expect(r.finalState.memberHp.tenghuang).toBeGreaterThan(0);
  });

  it('阿雅至高之姿中阵亡：衣匠与倒计时退场、死亡后不再行动/开大、周日继续', () => {
    // 无 castUltFor 死亡守卫时：周日大招持续给死人回能→能量回满→开大 throw「未知单位」（本用例即防回归）
    const r = simulateBattle(
      mk(
        [
          { id: 'aglaea', panel: panel('Thunder', 159, 1, 8000) },
          { id: 'sunday', panel: panel('Imaginary', 134, 0.194, 999999) },
        ],
        3000,
      ),
    );
    expect(deathTime(r.events, 'aglaea')).toBe(100);
    const yj = actsOf(r.events, 'yijiang');
    expect(yj.length).toBeGreaterThan(0);
    expect(yj.every((e) => e.time < 100)).toBe(true);
    expect(actsOf(r.events, 'countdown2')).toEqual([]); // 进入至高之姿但阵亡于倒计时首次行动前
    expect(actsOf(r.events, 'aglaea').every((e) => e.time <= 100)).toBe(true);
    expect(r.events.filter((e) => e.kind === 'ult' && e.unitId === 'aglaea').every((e) => e.time < 100)).toBe(true);
    expect(actsOf(r.events, 'sunday').some((e) => e.time > 100)).toBe(true);
    expect(r.finalState.memberHp.aglaea).toBe(0);
    expect(r.finalState.memberHp.sunday).toBeGreaterThan(0);
  });

  it('晴歌非Fever阵亡：忆灵退场，腾荒龙灵继续', () => {
    const r = simulateBattle(
      mk(
        [
          { id: 'qingge', panel: panel('Wind', 156, 0.194, 3000) },
          { id: 'tenghuang', panel: panel('Physical', 134, 0.194, 999999) },
        ],
        3000,
      ),
    );
    expect(deathTime(r.events, 'qingge')).toBe(100);
    const memo = actsOf(r.events, 'memo');
    expect(memo.length).toBeGreaterThan(0);
    expect(memo.every((e) => e.time < 100)).toBe(true);
    expect(actsOf(r.events, 'longling').some((e) => e.time > 100)).toBe(true);
  });

  it('晴歌Fever中阵亡：Fever倒计时与忆灵随人退场，景元神君继续（死亡不复活死人）', () => {
    const r = simulateBattle(
      mk(
        [
          { id: 'qingge', panel: panel('Wind', 156, 0.194, 16000) },
          { id: 'jingyuan', panel: panel('Thunder', 135, 0, 999999) },
        ],
        3000,
      ),
    );
    expect(deathTime(r.events, 'qingge')).toBe(300);
    const cd = actsOf(r.events, 'countdown');
    expect(cd.length).toBeGreaterThan(0); // 进过 Fever（t=199.63/271.06）
    expect(cd.every((e) => e.time < 300)).toBe(true);
    // 死亡后：晴歌/忆灵/Fever倒计时全部不再出现（无复活、无 exitFever 加回）
    for (const id of ['qingge', 'memo', 'countdown']) {
      expect(actsOf(r.events, id).filter((e) => e.time > 300)).toEqual([]);
    }
    expect(actsOf(r.events, 'jingyuan').some((e) => e.time > 300)).toBe(true);
    expect(actsOf(r.events, 'shenjun').some((e) => e.time > 300)).toBe(true);
    expect(r.finalState.memberHp.qingge).toBe(0);
    expect(r.finalState.memberHp.jingyuan).toBeGreaterThan(0);
  });
});
