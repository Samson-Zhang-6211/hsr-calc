import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(element: MemberPanel['element'] = 'Imaginary'): MemberPanel {
  return {
    element,
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1,
    damageBonus: 0,
    speed: 102,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 1000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack: 0,
  } as MonsterConfig;
}

function cfg(
  eid: number,
  opts: {
    slots?: number;
    techniques?: boolean;
    maxTime?: number;
    initialSp?: number;
    ally?: boolean;
    ex?: boolean;
  } = {},
): BattleConfig {
  const members: CombatMember[] = [
    { id: 'danhengIL', panel: panel(), eidolonLevel: eid } as CombatMember,
  ];
  if (opts.ally) {
    members.push({ id: 'trailblazerDestroy', panel: panel('Physical'), eidolonLevel: 0 } as CombatMember);
  }
  return {
    members,
    monsters: Array.from({ length: opts.slots ?? 3 }, () => monster()),
    maxTime: opts.maxTime ?? 500,
    initialSp: opts.initialSp ?? 3,
    seed: 1,
    techniques: opts.techniques ?? false,
    danhengILEx: opts.ex,
  };
}

const base = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'base')!.value;

describe('丹恒•饮月 1213', () => {
  it('首次行动自动强化到 3 档：7 段主目标 + 第 4 段起相邻', () => {
    const r = simulateBattle(cfg(0));
    const e = r.events.find((x) => x.skillCode === 'danhengIL.enhanced')!;
    expect(e.time).toBeLessThan(100);
    expect(e.spAfter).toBe(0);
    expect(e.energyAfter).toBe(125);
    expect(e.note).toContain('dnEnhanced3');
    expect(e.note).toContain('dnChicha');
    expect(e.hitSeqs!.length).toBe(15);

    const all = e.hitSeqs!.map((s) => r.hits[s]);
    const mainTarget = all[0].target;
    const main = all.filter((h) => h.target === mainTarget);
    const adj = all.filter((h) => h.target !== mainTarget);
    expect(main.length).toBe(7);
    expect(main.map((h) => Math.round(h.total * 1e6) / 1e6)).toEqual([
      2404.285714, 2644.714286, 2885.142857, 3225.857143, 3582, 3953.571429, 4340.571429,
    ]);
    expect(adj.length).toBe(8);
    expect(adj[0].total).toBeCloseTo(8129.16, 9);
    expect(adj[adj.length - 1].total).toBeCloseTo(10938.24, 9);
    expect(base(adj[0])).toBeCloseTo(7560);
  });

  it('SP 归零后下一动降级普通普攻；随后终结技 3 段主 + 相邻', () => {
    const r = simulateBattle(cfg(0));
    const b = r.events.find((x) => x.skillCode === 'danhengIL.basic')!;
    expect(b.spAfter).toBe(1);
    expect(b.energyAfter).toBe(140);
    expect(b.hitSeqs!.length).toBe(2);
    expect(r.hits[b.hitSeqs![0]].total).toBeCloseTo(1683);
    expect(r.hits[b.hitSeqs![1]].total).toBeCloseTo(1851.3);

    const u = r.events.find((x) => x.skillCode === 'danhengIL.ult')!;
    expect(u.note).toContain('dnUlt');
    expect(u.energyAfter).toBe(5);
    expect(u.hitSeqs!.length).toBe(9);
    const uAll = u.hitSeqs!.map((s) => r.hits[s]);
    const uMainTarget = uAll[0].target;
    const uMain = uAll.filter((h) => h.target === uMainTarget);
    const uAdj = uAll.filter((h) => h.target !== uMainTarget);
    expect(uMain[0].total).toBeCloseTo(2404.285714);
    expect(uMain[1].total).toBeCloseTo(2644.714286);
    expect(uMain[2].total).toBeCloseTo(2885.142857);
    expect(uAdj[0].total).toBeCloseTo(3366);
    expect(uAdj[4].total).toBeCloseTo(4039.2);
  });

  it('E1：每段亢心额外 +1 层，第二击明显更高', () => {
    const e0 = simulateBattle(cfg(0));
    const e1 = simulateBattle(cfg(1));
    const a0 = e0.events.find((x) => x.skillCode === 'danhengIL.enhanced')!;
    const a1 = e1.events.find((x) => x.skillCode === 'danhengIL.enhanced')!;
    const m0 = a0.hitSeqs!.map((s) => e0.hits[s]).filter((h) => h.target === e0.hits[a0.hitSeqs![0]].target);
    const m1 = a1.hitSeqs!.map((s) => e1.hits[s]).filter((h) => h.target === e1.hits[a1.hitSeqs![0]].target);
    expect(m0[1].total).toBeCloseTo(2644.714286);
    expect(m1[0].total).toBeCloseTo(2404.285714);
    expect(m1[1].total).toBeCloseTo(2885.142857);
  });

  it('E2：终结技后行动提前 100%，同一时刻立即再动', () => {
    const r = simulateBattle(cfg(2));
    const u = r.events.find((x) => x.skillCode === 'danhengIL.ult')!;
    expect(u.note).toContain('dnE2');
    const ui = r.events.findIndex((x) => x.skillCode === 'danhengIL.ult');
    const again = r.events.slice(ui + 1).find((x) => x.skillCode === 'danhengIL.enhanced')!;
    expect(again.time).toBeCloseTo(u.time, 3);
    expect(again.note).toContain('dnEnhanced3');
  });

  it('E4：叱咤暴伤延续到下一自身回合结束，普攻伤害高于 E0', () => {
    const e0 = simulateBattle(cfg(0));
    const e4 = simulateBattle(cfg(4));
    const b0 = e0.events.find((x) => x.skillCode === 'danhengIL.basic')!;
    const b4 = e4.events.find((x) => x.skillCode === 'danhengIL.basic')!;
    expect(e4.hits[b4.hitSeqs![0]].total).toBeGreaterThan(e0.hits[b0.hitSeqs![0]].total * 1.1);
    const later = e4.events.find(
      (x) => x.skillCode === 'danhengIL.enhanced' && x.time > b4.time,
    )!;
    expect(later).toBeTruthy();
  });

  it('E6：队友终结技后叠层，下一次 3 档强化获得 20% 虚数穿透', () => {
    const e5 = simulateBattle(cfg(5, { ally: true, maxTime: 500, initialSp: 0 }));
    const e6 = simulateBattle(cfg(6, { ally: true, maxTime: 500, initialSp: 0 }));
    const ally5 = e5.events.find((x) => x.skillCode === 'trailblazerDestroy.ult')!;
    const ally6 = e6.events.find((x) => x.skillCode === 'trailblazerDestroy.ult')!;
    expect(ally5.note ?? []).not.toContain('dnE6');
    expect(ally6.note).toContain('dnE6');
    const a5 = e5.events.find((x) => x.time >= ally5.time && x.skillCode === 'danhengIL.enhanced')!;
    const a6 = e6.events.find((x) => x.skillCode === 'danhengIL.enhanced' && (x.note ?? []).includes('dnE6'))!;
    expect(a5).toBeTruthy();
    expect(a6).toBeTruthy();
    expect(a6.note).toContain('dnEnhanced3');
    expect(e6.hits[a6.hitSeqs![0]].total).toBeCloseTo(4616.228571);
    expect(e6.hits[a6.hitSeqs![0]].total / e5.hits[a5.hitSeqs![0]].total).toBeCloseTo(1.2);
  });

  it('E0 队友终结技不叠 E6', () => {
    const r = simulateBattle(cfg(0, { ally: true, maxTime: 700, initialSp: 5 }));
    const allyUlt = r.events.find((x) => x.skillCode === 'trailblazerDestroy.ult')!;
    expect(allyUlt.note ?? []).not.toContain('dnE6');
    expect(r.events.some((x) => (x.note ?? []).includes('dnE6'))).toBe(false);
  });

  it('秘技 121307：全体 1.2 倍虚数伤害 + 1 逆鳞，不叠亢心', () => {
    const r = simulateBattle(cfg(0, { techniques: true, maxTime: 500 }));
    const t = r.events.find((x) => x.skillCode === 'danhengIL.tech')!;
    expect(t.note).toContain('dnTech');
    expect(t.spAfter).toBe(3);
    expect(t.energyAfter).toBe(85);
    expect(t.hitSeqs!.length).toBe(3);
    expect(base(r.hits[t.hitSeqs![0]])).toBeCloseTo(3600);
    expect(r.hits[t.hitSeqs![0]].total).toBeCloseTo(2885.142857);
  });

  it('秘技逆鳞让 1 SP 也能打出 2 档', () => {
    const r = simulateBattle(cfg(0, { techniques: true, initialSp: 1, maxTime: 500 }));
    const e = r.events.find((x) => x.skillCode === 'danhengIL.enhanced')!;
    expect(e.note).toContain('dnEnhanced2');
    expect(e.spAfter).toBe(0);
    // 5 段主目标 + 第 4~5 段各 2 个相邻 = 9
    expect(e.hitSeqs!.length).toBe(9);
  });

  it('EX 关闭时不触发追加攻击', () => {
    const r = simulateBattle(
      cfg(0, { initialSp: 5, techniques: true, maxTime: 1500 }),
    );
    expect(r.events.some((x) => (x.note ?? []).includes('dnEx'))).toBe(false);
    expect(r.hits.some((h) => h.skillCode === 'danhengIL.exFollow')).toBe(false);
  });

  it('EX 全队每累计 5 点 SP：500% 全体虚数追击 + 240% 增伤 + 1 逆鳞', () => {
    const r = simulateBattle(
      cfg(0, { initialSp: 5, techniques: true, maxTime: 1500, ex: true }),
    );
    const e = r.events.find((x) => (x.note ?? []).includes('dnEx'))!;
    expect(e.skillCode).toBe('danhengIL.enhanced');
    expect(e.spAfter).toBe(0);
    // 饮月自身两次强化战技分别消耗 2 + 3 = 5 点（含自身）
    expect(e.hitSeqs!.length).toBe(18);
    const exHits = e.hitSeqs!.map((s) => r.hits[s]).filter((h) => h.skillCode === 'danhengIL.exFollow');
    expect(exHits).toHaveLength(3);
    expect(new Set(exHits.map((h) => h.target)).size).toBe(3);
    for (const h of exHits) {
      expect(base(h)).toBeCloseTo(15000);
      expect(h.total).toBeCloseTo(54257.142857, 5);
    }
    // 当前强化战技本身不吃本次 +240%（追击在事件记录后追加）
    const skillHit = r.hits[e.hitSeqs![0]];
    expect(skillHit.total).toBeCloseTo(2404.285714, 5);
  });

  it('EX 的 240% 增伤延续到饮月后续行动', () => {
    const r = simulateBattle(
      cfg(0, { initialSp: 5, techniques: true, maxTime: 1500, ex: true }),
    );
    const trigger = r.events.find((x) => (x.note ?? []).includes('dnEx'))!;
    const next = r.events.find(
      (x) => x.skillCode === 'danhengIL.enhanced' && x.time > trigger.time,
    )!;
    expect(next.note).toContain('dnEnhanced3');
    expect(r.hits[next.hitSeqs![0]].total).toBeCloseTo(8895.857143, 4);
  });
});
