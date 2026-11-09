import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

type TbId = 'trailblazerDestroy' | 'trailblazerDestroy2';

function panel(): MemberPanel {
  return {
    element: 'Physical',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1,
    damageBonus: 0,
    speed: 100,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(opts: { attack?: number; hp?: number; toughness?: number; speed?: number } = {}): MonsterConfig {
  return {
    level: 90,
    hp: opts.hp ?? 5e8,
    maxToughness: opts.toughness ?? 1000,
    speed: opts.speed ?? 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack: opts.attack ?? 0,
  } as MonsterConfig;
}

function config(
  id: TbId,
  eidolonLevel: number,
  opts: {
    techniques?: boolean;
    slots?: number;
    maxTime?: number;
    hp?: number;
    toughness?: number;
    attack?: number;
    speed?: number;
  } = {},
): BattleConfig {
  return {
    members: [{ id, panel: panel(), eidolonLevel } as CombatMember],
    monsters: Array.from({ length: opts.slots ?? 1 }, () =>
      monster({ hp: opts.hp, toughness: opts.toughness, attack: opts.attack, speed: opts.speed }),
    ),
    maxTime: opts.maxTime ?? 400,
    initialSp: 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

const base = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'base')!.value;
const crit = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'crit')!.value;

describe('毁灭开拓者 8001/8002', () => {
  it('point06 初能 75；战技扩散 125%；终结技按存活数选单体/扩散', () => {
    const multi = simulateBattle(config('trailblazerDestroy', 0, { slots: 3 }));
    const skill = multi.events.find((e) => e.skillCode === 'trailblazerDestroy.skill' && e.time === 100)!;
    expect(skill.energyAfter).toBe(105);
    expect(skill.spAfter).toBe(2);
    expect(skill.note).toContain('tbdP08');
    expect(skill.hitSeqs!.length).toBe(3);
    expect(base(multi.hits[skill.hitSeqs![0]])).toBeCloseTo(3750);
    expect(multi.hits[skill.hitSeqs![0]].total).toBeCloseTo(3515.625);
    expect(multi.hits[skill.hitSeqs![1]].total).toBeCloseTo(2812.5);

    const ult = multi.events.find((e) => e.skillCode === 'trailblazerDestroy.ult')!;
    expect(ult.time).toBe(200);
    expect(ult.note).toContain('tbdUlt');
    expect(ult.note).toContain('tbdP08');
    expect(ult.energyAfter).toBe(5);
    expect(ult.hitSeqs!.length).toBe(3);
    expect(base(multi.hits[ult.hitSeqs![0]])).toBeCloseTo(8100);
    expect(multi.hits[ult.hitSeqs![0]].total).toBeCloseTo(7593.75);
    expect(multi.hits[ult.hitSeqs![1]].total).toBeCloseTo(3645);

    const basic = multi.events.find((e) => e.skillCode === 'trailblazerDestroy.basic')!;
    expect(basic.time).toBe(400);
    expect(basic.energyAfter).toBe(55);
    expect(base(multi.hits[basic.hitSeqs![0]])).toBeCloseTo(3000);
    expect(multi.hits[basic.hitSeqs![0]].total).toBeCloseTo(2250);

    const single = simulateBattle(config('trailblazerDestroy', 0, { slots: 1 }));
    const ultSingle = single.events.find((e) => e.skillCode === 'trailblazerDestroy.ult')!;
    expect(ultSingle.note).not.toContain('tbdP08');
    expect(base(single.hits[ultSingle.hitSeqs![0]])).toBeCloseTo(13500);
    expect(single.hits[ultSingle.hitSeqs![0]].total).toBeCloseTo(10125);
  });

  it('天赋：任意我方击破叠层 +20% 攻击，最多 2 层（低韧性连续击破）', () => {
    const r = simulateBattle(config('trailblazerDestroy', 0, { toughness: 10, maxTime: 300 }));
    const hits = r.events.filter(
      (e) => e.kind === 'action' && e.skillCode === 'trailblazerDestroy.skill' && e.hitSeqs?.length,
    );
    expect(base(r.hits[hits[0].hitSeqs![0]])).toBeCloseTo(3750);
    expect(base(r.hits[hits[1].hitSeqs![0]])).toBeCloseTo(4500);
    expect(base(r.hits[hits[2].hitSeqs![0]])).toBeCloseTo(5250);
    const talentNotes = r.events.filter((e) => (e.note ?? []).includes('tbdTalent'));
    expect(talentNotes.length).toBe(2);
  });

  it('E4：击中已弱点击破目标时逐目标暴击率 +25%', () => {
    // 2026-11-06 裁定③：破韧窗口在敌方【恢复回合】才结束 → 把怪速度压到 1，
    // 保证两次战技之间它不行动，第二次仍打在「已破韧」目标上（原先靠韧条瞬间回满维持破韧态）
    const slow = { toughness: 10, maxTime: 300, speed: 1 };
    const e0 = simulateBattle(config('trailblazerDestroy', 0, slow));
    const e4 = simulateBattle(config('trailblazerDestroy', 4, slow));
    const isSkill = (e: { kind: string; skillCode?: string; hitSeqs?: number[] }) =>
      e.kind === 'action' && e.skillCode === 'trailblazerDestroy.skill' && !!e.hitSeqs?.length;
    const s0 = e0.events.filter(isSkill);
    const s4 = e4.events.filter(isSkill);
    expect(crit(e0.hits[s0[1].hitSeqs![0]])).toBeCloseTo(1.75);
    expect(crit(e4.hits[s4[0].hitSeqs![0]])).toBeCloseTo(1.75);
    expect(crit(e4.hits[s4[1].hitSeqs![0]])).toBeCloseTo(2.125);
  });

  it('E1：终结技击杀额外回 10 能（每次攻击最多 1 次）', () => {
    const r = simulateBattle(config('trailblazerDestroy', 1, { hp: 8000, maxTime: 500 }));
    const ult = r.events.find((e) => e.skillCode === 'trailblazerDestroy.ult')!;
    expect(ult.time).toBe(200);
    expect(ult.energyAfter).toBe(15);
    expect(r.hits[ult.hitSeqs![0]].note).toBe('tbdE1');
  });

  it('E6：消灭目标也触发天赋', () => {
    const r = simulateBattle(
      config('trailblazerDestroy', 6, { slots: 3, hp: 7500, maxTime: 300 }),
    );
    const skill = r.events.find(
      (e) => e.skillCode === 'trailblazerDestroy.skill' && e.time === 200,
    )!;
    expect(skill.hitSeqs!.some((s) => r.hits[s].note === 'tbdE6')).toBe(true);
  });

  it('E2：每次攻击命中物理弱点目标回 5% 攻击力生命，多目标不重复', () => {
    const e0 = simulateBattle(
      config('trailblazerDestroy', 0, { slots: 3, attack: 1000, speed: 200, maxTime: 100 }),
    );
    const e2 = simulateBattle(
      config('trailblazerDestroy', 2, { slots: 3, attack: 1000, speed: 200, maxTime: 100 }),
    );
    expect(e0.finalState.memberHp.trailblazerDestroy).toBeCloseTo(1750);
    expect(e2.finalState.memberHp.trailblazerDestroy).toBeCloseTo(2050);
    const e2Notes = e2.events.filter((e) => (e.note ?? []).includes('tbdE2'));
    expect(e2Notes.length).toBe(2);
    expect(e2Notes[0].hitSeqs!.length).toBe(3);
  });

  it('秘技：全队回复各自生命上限 15%（满血仅记录）', () => {
    const r = simulateBattle(
      config('trailblazerDestroy', 0, { techniques: true, attack: 1, maxTime: 100 }),
    );
    const tech = r.events.find((e) => e.skillCode === '800107')!;
    expect(tech.time).toBe(0);
    expect(tech.action).toBe('technique');
    expect(tech.note).toEqual(['tbdTech', 'technique']);
    expect(tech.energyAfter).toBe(75);
  });

  it('8002 形态复用同构技能', () => {
    const r = simulateBattle(config('trailblazerDestroy2', 0, { slots: 3, maxTime: 200 }));
    const ult = r.events.find((e) => e.skillCode === 'trailblazerDestroy2.ult')!;
    expect(ult.note).toContain('tbdP08');
    expect(ult.hitSeqs!.length).toBe(3);
    expect(base(r.hits[ult.hitSeqs![0]])).toBeCloseTo(8100);
  });
});
