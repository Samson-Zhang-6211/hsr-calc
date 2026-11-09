import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(): MemberPanel {
  return {
    element: 'Imaginary',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1,
    damageBonus: 0,
    speed: 100,
    energyRegen: 0.194,
  } as MemberPanel;
}

function monster(attack = 0): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 1000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack,
  } as MonsterConfig;
}

function config(
  ids: CharId[],
  eidolons: Partial<Record<CharId, number>> = {},
  opts: { techniques?: boolean; maxTime?: number } = {},
): BattleConfig {
  return {
    members: ids.map(
      (id) =>
        ({
          id,
          panel: panel(),
          eidolonLevel: eidolons[id] ?? 0,
        }) as CombatMember,
    ),
    monsters: [monster()],
    maxTime: opts.maxTime ?? 300,
    initialSp: 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

const base = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'base')!.value;
const crit = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'crit')!.value;

describe('真理医生 1305', () => {
  it('E0：战技先挂 point07 再叠归纳；本次追击吃旧层，终结技挂【智者的短见】', () => {
    const r = simulateBattle(config(['ratio']));
    const skill = r.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 100)!;
    expect(skill.note).toContain('ratioP07');
    expect(skill.note).toContain('ratioTalent');
    expect(skill.note).toContain('ratioSkill');
    expect(skill.spAfter).toBe(2);
    expect(skill.energyAfter).toBeCloseTo(105.82);
    expect(skill.hitSeqs!.length).toBe(2);
    expect(base(r.hits[skill.hitSeqs![0]])).toBeCloseTo(4500);
    expect(crit(r.hits[skill.hitSeqs![0]])).toBeCloseTo(1.75);
    expect(r.hits[skill.hitSeqs![0]].total).toBeCloseTo(3375);
    expect(base(r.hits[skill.hitSeqs![1]])).toBeCloseTo(8100);
    expect(r.hits[skill.hitSeqs![1]].total).toBeCloseTo(6925.93392857143);

    const second = r.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 200)!;
    expect(second.note ?? []).not.toContain('ratioTalent');
    expect(second.energyAfter).toBe(140);
    expect(base(r.hits[second.hitSeqs![0]])).toBeCloseTo(4500);
    expect(r.hits[second.hitSeqs![0]].total).toBeCloseTo(3847.741071428572);

    const ult = r.events.find((e) => e.skillCode === 'ratio.ult' && e.time === 200)!;
    expect(ult.note).toContain('ratioUlt');
    expect(ult.energyAfter).toBeCloseTo(5.97);
    expect(base(r.hits[ult.hitSeqs![0]])).toBeCloseTo(7200);
    expect(r.hits[ult.hitSeqs![0]].total).toBeCloseTo(6381.257142857144);
  });

  it('E1：开战 4 层归纳；战技后第 5 层才作用于随后追击', () => {
    const r = simulateBattle(config(['ratio'], { ratio: 1 }));
    const skill = r.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 100)!;
    expect(crit(r.hits[skill.hitSeqs![0]])).toBeCloseTo(2.02);
    expect(crit(r.hits[skill.hitSeqs![1]])).toBeCloseTo(2.09375);
    const second = r.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 200)!;
    expect(crit(r.hits[second.hitSeqs![0]])).toBeCloseTo(2.09375);
  });

  it('E2：天赋后按负面数追加 0.2× 独立段，可暴击且不削韧', () => {
    const r = simulateBattle(config(['ratio'], { ratio: 2 }));
    const skill = r.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 100)!;
    expect(skill.note).toContain('ratioE2');
    expect(skill.hitSeqs!.length).toBe(3);
    const e2 = r.hits[skill.hitSeqs![2]];
    expect(e2.skillCode).toBe('ratio.e2');
    expect(base(e2)).toBeCloseTo(600);
    expect(crit(e2)).toBeCloseTo(2.09375);
    expect(e2.total).toBeCloseTo(592.2321428571429);
  });

  it('E4：天赋触发额外回 15 能（吃充能效率）', () => {
    const r = simulateBattle(config(['ratio'], { ratio: 4 }));
    const skill = r.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 100)!;
    expect(skill.energyAfter).toBeCloseTo(123.73);
  });

  it('E6：短见 +1 次、天赋追击 +50%', () => {
    const r = simulateBattle(config(['ratio'], { ratio: 6 }));
    const skill = r.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 100)!;
    expect(skill.energyAfter).toBeCloseTo(123.73);
    const talent = r.hits[skill.hitSeqs![1]];
    expect(talent.skillCode).toBe('ratio.talent');
    expect(base(talent)).toBeCloseTo(13365);
    expect(crit(talent)).toBeCloseTo(2.09375);
    const e2 = r.hits[skill.hitSeqs![2]];
    expect(base(e2)).toBeCloseTo(600);
  });

  it('【智者的短见】：队友每次攻击行动最多触发一次；2 次耗尽后不再追击', () => {
    const r = simulateBattle(config(['ratio', 'arlan'], {}, { maxTime: 500 }));
    const wisdom = r.events.filter((e) => (e.note ?? []).includes('ratioWisdom'));
    expect(wisdom.length).toBe(2);
    for (const e of wisdom) {
      expect(e.unitId).toBe('arlan');
      expect(e.hitSeqs!.some((s) => r.hits[s].source === 'ratio' && r.hits[s].skillCode === 'ratio.talent')).toBe(true);
    }
    const later = r.events.filter((e) => e.unitId === 'arlan' && e.time > 200);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((e) => !(e.note ?? []).includes('ratioWisdom'))).toBe(true);
  });

  it('秘技：敌方速度 -15% / 2 回合，且速度下降计入 point07/point08 负面数', () => {
    const e0 = simulateBattle(config(['ratio'], {}, { maxTime: 300 }));
    const tech = simulateBattle(config(['ratio'], {}, { techniques: true, maxTime: 300 }));
    const techEv = tech.events.find((e) => e.skillCode === 'ratio.tech')!;
    expect(techEv.time).toBe(0);
    expect(techEv.note).toContain('ratioTech');
    const firstMonster0 = e0.events.find((e) => e.unitId === 'monster1')!;
    const firstMonster1 = tech.events.find((e) => e.unitId === 'monster1')!;
    expect(firstMonster0.time).toBe(100);
    expect(firstMonster1.time).toBeCloseTo(117.6470588235294);

    const s1 = tech.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 200)!;
    expect(crit(tech.hits[s1.hitSeqs![0]])).toBeCloseTo(1.88);

    const third0 = e0.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 300)!;
    const third1 = tech.events.find((e) => e.skillCode === 'ratio.skill' && e.time === 300)!;
    expect(e0.hits[third0.hitSeqs![0]].total).toBeCloseTo(3988.2857142857147);
    expect(tech.hits[third1.hitSeqs![0]].total).toBeCloseTo(5570.871428571429);
  });
});
