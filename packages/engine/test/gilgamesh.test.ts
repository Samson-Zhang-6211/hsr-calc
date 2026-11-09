import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  CombatMember,
  MemberPanel,
  MonsterConfig,
} from '../src/index.js';

function panel(id: 'gilgamesh' | 'saber'): MemberPanel {
  return {
    element: id === 'gilgamesh' ? 'Thunder' : 'Wind',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1.0,
    damageBonus: 0,
    speed: 200,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(): MonsterConfig[] {
  return [{
    level: 90,
    hp: 5e8,
    maxToughness: 1e9,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: 'monster1',
    effectRes: 0,
    attack: 0,
  } as MonsterConfig];
}

function config(
  e: number,
  opts: { maxTime?: number; techniques?: boolean } = {},
): BattleConfig {
  return {
    members: [{ id: 'gilgamesh', panel: panel('gilgamesh'), eidolonLevel: e } as CombatMember],
    monsters: monster(),
    maxTime: opts.maxTime ?? 310,
    techniques: opts.techniques ?? false,
  };
}

function team(maxTime = 410): BattleConfig {
  return {
    members: [
      { id: 'saber', panel: panel('saber'), eidolonLevel: 0 } as CombatMember,
      { id: 'gilgamesh', panel: panel('gilgamesh'), eidolonLevel: 0 } as CombatMember,
    ],
    monsters: monster(),
    maxTime,
  };
}

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const hitAt = (r: ReturnType<typeof simulateBattle>, seq: number) => {
  const h = r.hits.find((x) => x.seq === seq);
  if (!h) throw new Error(`missing hit ${seq}`);
  return h;
};

describe('吉尔伽美什 1509', () => {
  it('E0 首回合自动普攻，战技获得无视防御', () => {
    const r = simulateBattle(config(0));
    const basic = r.events.find((e) => e.skillCode === 'gilgamesh.basic' && e.time === 50)!;
    expect(basic.note).toContain('gilgameshAutoBasic');
    expect(factor(hitAt(r, basic.hitSeqs![0]), 'base')).toBeCloseTo(6600);
    expect(factor(hitAt(r, basic.hitSeqs![0]), 'defense')).toBeCloseTo(0.47619047619047616);
    const skill = r.events.find((e) => e.skillCode === 'gilgamesh.skill' && e.time === 100)!;
    expect(skill.spAfter).toBe(3);
    expect(factor(hitAt(r, skill.hitSeqs![0]), 'base')).toBeCloseTo(18480);
    expect(factor(hitAt(r, skill.hitSeqs![0]), 'defense')).toBeCloseTo(0.5649717514124294);
  });

  it('E2 初始 5 兴致使速度 +50%，首次自动普攻提前', () => {
    const r = simulateBattle(config(2));
    const basic = r.events.find((e) => e.skillCode === 'gilgamesh.basic')!;
    expect(basic.time).toBeCloseTo(10000 / 300);
  });

  it('E6 战技吃 E1 攻击与 E2 倍率；终结技 11 段并结束王来模式', () => {
    const r = simulateBattle(config(6));
    const skill = r.events.find((e) => e.skillCode === 'gilgamesh.skill')!;
    expect(factor(hitAt(r, skill.hitSeqs![0]), 'base')).toBeCloseTo(31920);
    const ult = r.events.find((e) => e.skillCode === 'gilgamesh.ult')!;
    expect(ult.hitSeqs).toHaveLength(11);
    expect(factor(hitAt(r, ult.hitSeqs![0]), 'base')).toBeCloseTo(33600);
    expect(factor(hitAt(r, ult.hitSeqs![1]), 'base')).toBeCloseTo(15120);
    const moodEnd = r.events.find((e) => (e.note ?? []).includes('gilgameshMoodEnd'))!;
    expect(moodEnd.skillCode).toBe('gilgamesh.skill');
    expect(moodEnd.spAfter).toBe(0);
  });

  it('与 Saber 同队：第 8 次行动触发联合攻击，Saber 终结技翻倍', () => {
    const r = simulateBattle(team());
    const joint = r.events.find((e) => e.skillCode === 'gilgamesh.joint')!;
    expect(joint.time).toBe(175);
    const gil = r.hits.find((h) => h.skillCode === 'gilgamesh.joint')!;
    const saber = r.hits.find((h) => h.skillCode === 'saber.joint')!;
    expect(factor(gil, 'base')).toBeCloseTo(26400);
    expect(factor(saber, 'base')).toBeCloseTo(39600);
    const saberUlt = r.events.find((e) => e.skillCode === 'saber.ult')!;
    expect(factor(hitAt(r, saberUlt.hitSeqs![0]), 'base')).toBeCloseTo(36960);
  });

  it('E6 同队战技点耗尽时不会出现负 SP', () => {
    const c = team(400);
    for (const m of c.members) m.eidolonLevel = 6;
    const r = simulateBattle(c);
    for (const e of r.events) {
      if (e.spAfter !== undefined) expect(e.spAfter).toBeGreaterThanOrEqual(0);
    }
  });

  it('秘技 200% 雷伤：首段 13200', () => {
    const r = simulateBattle(config(0, { techniques: true, maxTime: 1 }));
    const tech = r.events.find((e) => e.skillCode === 'gilgamesh.tech')!;
    expect(tech.note).toContain('gilgameshTech');
    expect(tech.hitSeqs).toHaveLength(1);
    expect(factor(hitAt(r, tech.hitSeqs![0]), 'base')).toBeCloseTo(13200);
  });
});
