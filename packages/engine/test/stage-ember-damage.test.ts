import { describe, expect, it } from 'vitest';
import { simulateBattle, type CombatMember, type MemberPanel, type MonsterConfig } from '../src/index.js';

// ── 【末法余烬】数值半句（末日 P21 关卡机制，裁定 17 = A；2026-10-30 第十八轮）──
// 终结技伤害 +25%（直伤 damageBonus 加算）/ 欢愉伤害 +15%（走增笑乘区）。
// 实测锚点（dump 定锚，日/砂金/飞霄/腾荒队 vs 4023010）：
//   砂金终结技 damageBonus 1.15 → 1.40；飞霄 ultSeg「视为追击的终结技段」1.60 → 1.85；
//   花火欢愉段 3675.16 → 4226.44（×1.15）。

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

const mon: MonsterConfig = {
  monsterId: '4023010',
  level: 95,
  hp: 5_000_000,
  attack: 800,
  speed: 120,
  maxToughness: 300,
  weaknesses: ['Fire', 'Wind', 'Quantum'],
  resistance: {},
};

function run(members: CombatMember[], mechanics?: string[]) {
  return simulateBattle({
    members,
    monsters: [mon],
    techniques: false,
    rounds: 4,
    maxTime: 3000,
    roundMode: 'forgotten',
    mechanics,
  });
}

const ultTeam = (): CombatMember[] => [
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
  { id: 'feixiao', panel: panel(140) },
  { id: 'tenghuang', panel: panel(135) },
];

const elationTeam = (): CombatMember[] => [
  { id: 'huohua', panel: { ...panel(150), elationDegree: 0.5 } },
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
];

const bonusOf = (hits: { factors: readonly { key: string; value: number }[] }[], code: string) =>
  hits
    .filter((h) => (h as unknown as { skillCode: string }).skillCode === code)
    .map((h) => h.factors.find((f) => f.key === 'damageBonus')?.value ?? -1);

describe('关卡机制 · 末法余烬的数值半句', () => {
  it('终结技伤害 +25%（含「视为追击」的终结技段）', () => {
    const plain = run(ultTeam());
    const ember = run(ultTeam(), ['ember']);
    const plainUlt = bonusOf(plain.hits, 'aventurine.ult');
    const emberUlt = bonusOf(ember.hits, 'aventurine.ult');
    expect(plainUlt.length).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(plainUlt.length, emberUlt.length); i += 1) {
      expect(emberUlt[i]! - plainUlt[i]!).toBeCloseTo(0.25, 6);
    }
    // 飞霄终结技各段声明为追击 → 仍要吃 +25%
    const plainSeg = bonusOf(plain.hits, 'feixiao.ultSeg');
    const emberSeg = bonusOf(ember.hits, 'feixiao.ultSeg');
    expect(plainSeg.length).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(plainSeg.length, emberSeg.length); i += 1) {
      expect(emberSeg[i]! - plainSeg[i]!).toBeCloseTo(0.25, 6);
    }
    // 非终结技不吃：普攻段差值 0
    const plainBasic = bonusOf(plain.hits, 'aventurine.basic');
    const emberBasic = bonusOf(ember.hits, 'aventurine.basic');
    for (let i = 0; i < Math.min(plainBasic.length, emberBasic.length); i += 1) {
      expect(emberBasic[i]! - plainBasic[i]!).toBeCloseTo(0, 6);
    }
  });

  it('欢愉伤害 +15%（走增笑乘区）', () => {
    const plain = run(elationTeam());
    const ember = run(elationTeam(), ['ember']);
    const el = (r: ReturnType<typeof run>) => r.hits.filter((h) => h.kind === 'elation');
    const p0 = el(plain)[0];
    const e0 = el(ember)[0];
    expect(p0).toBeTruthy();
    expect(e0).toBeTruthy();
    expect(e0!.total / p0!.total).toBeCloseTo(1.15, 4);
  });
});
