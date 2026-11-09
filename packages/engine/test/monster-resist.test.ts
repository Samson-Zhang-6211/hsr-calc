import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  debuffResistValue,
  monsterDebuffResist,
  monsterElementResistance,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type MonsterConfig,
} from '../src/index.js';

/**
 * 效果抵抗全接（2026-10-23 用户裁定）：
 * - 击破控制 = 冰冻结 / 量子纠缠 / 虚数禁锢，基础概率 100% ×(1−怪的效果抵抗)，
 *   只做「抵抗判定 + 标记/note」，不改变怪物行动。
 * - 分属性抗性（appfeng `dk`）通过 `MonsterConfig.elementResistance` 并入 resistZone。
 * - 数据源：`data/monster-resist/pure-2027.json` → `monster-resist-table.ts`。
 * 数值断言来自本文件实跑（dump 定锚），改动机制须重跑确认。
 */

const ALL: Element[] = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];

const PANEL = {
  level: 80,
  hp: 30000,
  attack: 2000,
  defence: 800,
  speed: 120,
  critRate: 0,
  critDmg: 0,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

function mon(over: Partial<MonsterConfig> = {}): MonsterConfig {
  return {
    level: 90,
    hp: 10_000_000,
    resistance: {},
    weaknesses: [...ALL],
    maxToughness: 1,
    speed: 10,
    attack: 0,
    enemyClass: 'normal',
    ...over,
  };
}

function cfg(
  id: 'pela' | 'yinlang' | 'welt',
  monster: MonsterConfig,
  seed = 1,
  rounds = 1,
  maxTime = 200,
): BattleConfig {
  return {
    members: [{ id, panel: { ...PANEL, element: id === 'pela' ? 'Ice' : id === 'yinlang' ? 'Quantum' : 'Imaginary' } }],
    monster,
    rounds,
    maxTime,
    techniques: false,
    seed,
  } as BattleConfig;
}

const breakNotes = (r: BattleResult): string[] =>
  r.events.filter((e) => e.kind === 'break').flatMap((e) => e.note ?? []);

const firstHitTotal = (r: BattleResult): number => {
  const act = r.events.find((e) => e.action === 'basic' || e.action === 'skill')!;
  const seq = act.hitSeqs?.[0];
  const hit = r.hits.find((h) => h.seq === seq);
  return hit?.total ?? 0;
};

describe('效果抵抗数据表', () => {
  it('A 生成表与手写表合并（fm）', () => {
    expect(monsterDebuffResist('8003010')).toEqual({ freeze: 1 });
    expect(monsterDebuffResist('4034010')).toEqual({ freeze: 0.75, imprison: 0.75, entangle: 0.75 });
    expect(monsterDebuffResist('5014020')).toEqual({ control: 0.5 });
    expect(monsterDebuffResist('2032010')).toEqual({});
    // 手写表仍在（未进入本期表的怪）
    expect(monsterDebuffResist('5034010')).toEqual({ control: 1 });
  });

  it('B 分属性抗性表（dk）', () => {
    expect(monsterElementResistance('4023010')).toEqual({
      Fire: 0.2,
      Ice: 0.2,
      Thunder: 0.2,
      Wind: 0.2,
    });
    expect(monsterElementResistance('5013040').Quantum).toBe(0.8);
    expect(monsterElementResistance('2023030').Wind).toBe(0.4);
    expect(monsterElementResistance('9999999')).toEqual({});
  });

  it('B2 分项抵抗：control 只回落控制类，不污染降防/DoT', () => {
    expect(debuffResistValue({ control: 0.5 }, 'freeze')).toBe(0.5);
    expect(debuffResistValue({ control: 0.5 }, 'defReduction')).toBe(0);
    expect(debuffResistValue({ defReduction: 0.3 }, 'defReduction')).toBe(0.3);
  });
});

describe('击破控制通道', () => {
  it('C 冰击破 → 冻结标记（无抵抗怪 100% 命中）', () => {
    const r = simulateBattle(cfg('pela', mon({ monsterId: '2032010' })));
    expect(breakNotes(r)).toContain('enemyBreakFreeze');
    expect(breakNotes(r)).not.toContain('enemyBreakControlResist');
  });

  it('D 冰击破 → 外宇宙之冰冻结抵抗 1（必定挡下）', () => {
    const r = simulateBattle(cfg('pela', mon({ monsterId: '8003010' })));
    expect(breakNotes(r)).toContain('enemyBreakControlResist');
    expect(breakNotes(r)).not.toContain('enemyBreakFreeze');
  });

  it('E 量子击破 → 纠缠标记；虚数击破 → 禁锢标记', () => {
    const q = simulateBattle(cfg('yinlang', mon()));
    expect(breakNotes(q)).toContain('enemyBreakEntangle');
    const i = simulateBattle(cfg('welt', mon()));
    expect(breakNotes(i)).toContain('enemyBreakImprison');
  });

  it('J 通用 effectRes 1 → 冰击破控制免疫', () => {
    const r = simulateBattle(cfg('pela', mon({ effectRes: 1 })));
    expect(breakNotes(r)).toContain('enemyBreakControlResist');
    expect(breakNotes(r)).not.toContain('enemyBreakFreeze');
  });

  it('F 4034010 三类抵抗 0.75：固定 seed 下命中与抵抗都出现', () => {
    const r = simulateBattle(cfg('pela', mon({ monsterId: '4034010', hp: 1e9 }), 7, 40, 5000));
    const notes = breakNotes(r);
    const hits = notes.filter((n) => n === 'enemyBreakFreeze').length;
    const resists = notes.filter((n) => n === 'enemyBreakControlResist').length;
    expect(hits).toBeGreaterThan(0);
    expect(resists).toBeGreaterThan(0);
    expect(hits + resists).toBe(notes.length);
  });
});

describe('分属性抗性进战斗（dk）', () => {
  function totalWith(over: Partial<MonsterConfig>): number {
    return firstHitTotal(
      simulateBattle(cfg('pela', mon({ maxToughness: 10000, hp: 10_000_000, ...over }))),
    );
  }

  it('G elementResistance 20% → 伤害 ×0.8', () => {
    const base = totalWith({});
    const resisted = totalWith({ elementResistance: { Ice: 0.2 } });
    expect(resisted / base).toBeCloseTo(0.8, 6);
  });

  it('H elementResistance 覆盖 resistance 的同属性值', () => {
    const base = totalWith({});
    const resisted = totalWith({ resistance: { Ice: 0.5 }, elementResistance: { Ice: 0.2 } });
    expect(resisted / base).toBeCloseTo(0.8, 6);
  });

  it('I 只影响所列属性（Ice 抗性不影响物理段）', () => {
    const base = totalWith({});
    const same = totalWith({ elementResistance: { Physical: 0.5 } });
    expect(same).toBeCloseTo(base, 6);
  });
});
