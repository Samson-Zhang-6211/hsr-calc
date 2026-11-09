import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type {
  BattleConfig,
  CombatMember,
  MemberPanel,
  MonsterConfig,
} from '../src/index.js';

function panel(): MemberPanel {
  return {
    element: 'Wind',
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

function monster(): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 3000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack: 800,
  } as MonsterConfig;
}

function config(
  e: number,
  opts: { count?: number; maxTime?: number; techniques?: boolean } = {},
): BattleConfig {
  return {
    members: [{ id: 'blade', panel: panel(), eidolonLevel: e } as CombatMember],
    monsters: Array.from({ length: opts.count ?? 1 }, () => monster()),
    maxTime: opts.maxTime ?? 400,
    techniques: opts.techniques ?? false,
  };
}

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const factor = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value ?? 1;

const hitAt = (r: ReturnType<typeof simulateBattle>, seq: number) => {
  const h = r.hits.find((x) => x.seq === seq);
  if (!h) throw new Error(`missing hit ${seq}`);
  return h;
};

describe('刃 1205', () => {
  it('初始能量 65；秘技 40% 上限伤害并消耗 20% 上限生命', () => {
    const r = simulateBattle(config(0, { count: 3, maxTime: 1, techniques: true }));
    expect(r.finalState.energy.blade).toBe(65);
    expect(r.finalState.memberHp.blade).toBeCloseTo(8000);
    const tech = r.events.find((e) => e.skillCode === 'blade.tech');
    expect(tech?.note).toContain('bladeTech');
    expect(tech?.hitSeqs).toHaveLength(3);
    for (const h of hitsOf(r, 'blade.tech')) {
      expect(factor(h, 'base')).toBeCloseTo(4000);
      expect(h.total).toBeCloseTo(3000);
    }
  });

  it('战技进入地狱变并立即打出强化普攻', () => {
    const r = simulateBattle(config(0, { maxTime: 60 }));
    const skill = r.events.find((e) => e.skillCode === 'blade.skill');
    const enhanced = r.events.find((e) => e.skillCode === 'blade.enhanced');
    expect(skill?.note).toContain('bladeHell');
    expect(enhanced?.note).toContain('bladeEnhanced');
    expect(skill?.spAfter).toBe(3);
    expect(enhanced?.spAfter).toBe(3);
    expect(enhanced?.energyAfter).toBe(85);
    expect(r.finalState.memberHp.blade).toBeCloseTo(6000);
    const h = hitsOf(r, 'blade.enhanced')[0];
    expect(factor(h, 'base')).toBeCloseTo(18200);
    expect(factor(h, 'damageBonus')).toBeCloseTo(1.4);
    expect(h.total).toBeCloseTo(19110);
  });

  it('E6 充能满触发天赋追击（1.8×上限），E0 为 1.3×', () => {
    const e6 = simulateBattle(config(6, { count: 3, maxTime: 110 }));
    expect(e6.events.some((e) => (e.note ?? []).includes('bladeChargeFull'))).toBe(true);
    const talent = e6.events.find((e) => e.skillCode === 'blade.talent');
    expect(talent?.note).toContain('bladeTalent');
    expect(talent?.hitSeqs).toHaveLength(3);
    const e6Hits = hitsOf(e6, 'blade.talent');
    expect(e6Hits).toHaveLength(3);
    for (const h of e6Hits) {
      expect(factor(h, 'base')).toBeCloseTo(18000);
      expect(factor(h, 'damageBonus')).toBeCloseTo(1.6);
    }

    const e0 = simulateBattle(config(0, { count: 3, maxTime: 100, techniques: true }));
    const e0Hits = hitsOf(e0, 'blade.talent');
    expect(e0Hits).toHaveLength(3);
    expect(factor(e0Hits[0], 'base')).toBeCloseTo(13000);
  });

  it('E1 强化普攻追加 150% 累计损失生命，E6 每次 4 段', () => {
    const r = simulateBattle(config(6, { count: 3, maxTime: 60 }));
    const enhanced = r.events.find((e) => e.skillCode === 'blade.enhanced');
    expect(enhanced?.hitSeqs).toHaveLength(4);
    const seqs = enhanced!.hitSeqs!;
    expect(factor(hitAt(r, seqs[0]), 'base')).toBeCloseTo(18200);
    expect(factor(hitAt(r, seqs[1]), 'base')).toBeCloseTo(7280);
    expect(factor(hitAt(r, seqs[2]), 'base')).toBeCloseTo(7280);
    expect(factor(hitAt(r, seqs[3]), 'base')).toBeCloseTo(6000);
  });

  it('E4 上限提升与低血量叠层参与终结技/后续普攻', () => {
    const r = simulateBattle(config(6, { count: 3, maxTime: 160 }));
    const ult = r.events.find((e) => e.skillCode === 'blade.ult');
    expect(ult?.note).toContain('bladeUlt');
    expect(ult?.note).toContain('bladeE4');
    expect(ult?.hitSeqs).toHaveLength(4);
    const seqs = ult!.hitSeqs!;
    expect(factor(hitAt(r, seqs[0]), 'base')).toBeCloseTo(27300);
    expect(factor(hitAt(r, seqs[1]), 'base')).toBeCloseTo(11850);
    expect(factor(hitAt(r, seqs[3]), 'base')).toBeCloseTo(11625);

    const later = r.events.filter((e) => e.skillCode === 'blade.enhanced').at(-1)!;
    expect(factor(hitAt(r, later.hitSeqs![0]), 'base')).toBeCloseTo(21840);
  });

  it('E6 暴击期望高于 E0', () => {
    const e0 = simulateBattle(config(0, { maxTime: 60 }));
    const e6 = simulateBattle(config(6, { maxTime: 60 }));
    expect(factor(hitsOf(e6, 'blade.enhanced')[0], 'crit')).toBeCloseTo(1.975);
    expect(factor(hitsOf(e0, 'blade.enhanced')[0], 'crit')).toBeCloseTo(1.75);
  });
});
