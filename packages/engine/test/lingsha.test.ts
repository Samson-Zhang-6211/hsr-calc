import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 灵砂 1222 接入回归（2026-10-13；dump 锚点法：锚点全部来自 lingsha-dump 实测，勿纯推理改写） */

type Ev = BattleResult['events'][number];

const MON = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 3000,
  speed: 100,
  resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
  weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as Element[],
  enemyClass: 'normal' as const,
};

const LS_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 98,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Fire' as const,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

const JY_PANEL = {
  level: 80,
  hp: 3000,
  attack: 3000,
  defence: 1000,
  speed: 135,
  critRate: 0.8,
  critDmg: 1.5,
  element: 'Thunder' as const,
  energyRegen: 0,
  damageBonus: 0.5,
  breakEffect: 0,
};

function mkCfg(over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    members: [
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
      { id: 'lingsha', panel: LS_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 10,
    maxTime: 400,
    techniques: false,
    seed: 20261013,
    ...over,
  } as BattleConfig;
}

const runCache = new Map<string, BattleResult>();
function run(key: string, cfg: () => BattleConfig): BattleResult {
  let r = runCache.get(key);
  if (!r) {
    r = simulateBattle(cfg());
    runCache.set(key, r);
  }
  return r;
}

const evsOf = (r: BattleResult, pred: (e: Ev) => boolean): Ev[] => r.events.filter(pred);
const close = (a: number, b: number, eps = 0.01): void => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};

describe('灵砂1222（基础机制）', () => {
  it('A 战技AoE/能量链/普攻/终招/浮元独立行动轴', () => {
    const r = run('A', () => mkCfg());
    const acts = evsOf(
      r,
      (e) => (e.kind === 'action' && e.unitId === 'lingsha') || (e.kind === 'ult' && e.unitId === 'lingsha'),
    );
    // 首动=战技 t=102.04：energy 55+30=85、AoE 3段 base=0.8×2500=2000、浮元首次召唤
    const first = acts[0];
    close(first.time, 102.04, 0.01);
    expect(first.action).toBe('skill');
    close(first.energyAfter ?? 0, 85, 0.01);
    expect(first.note).toContain('lingshaFuyuan');
    expect(first.note).toContain('lingshaSkill');
    expect(first.hitSeqs).toHaveLength(3);
    const fh = r.hits.find((x) => x.seq === first.hitSeqs![0])!;
    close(fh.factors.find((f) => f.key === 'base')!.value, 2000, 0.01);
    close(fh.total, 942.86, 0.01);
    // 能量链：85(战技+30)→105(普攻+20)→110(战技+30,封顶110)→5(终招清能+回5)
    const ens = acts.slice(0, 4).map((e) => Math.round(e.energyAfter ?? 0));
    expect(ens).toEqual([85, 105, 110, 5]);
    // 普攻 t=204.08：base=1.4×2500=3500、total=1650
    const basic = acts.find((e) => e.action === 'basic')!;
    close(basic.time, 204.08, 0.01);
    const bh = r.hits.find((x) => x.seq === basic.hitSeqs![0])!;
    close(bh.factors.find((f) => f.key === 'base')!.value, 2500, 0.01);
    close(bh.total, 1178.571, 0.01);
    // 终招 t=306.12：3段 AoE base=1.5×2500=3750、醇醉 note、energyAfter=5（通用清能+回5）
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'lingsha')[0];
    close(ult.time, 306.12, 0.01);
    expect(ult.skillCode).toBe('lingsha.ult');
    expect(ult.hitSeqs).toHaveLength(3);
    close(ult.energyAfter ?? 0, 5, 0.01);
    expect(ult.note).toContain('lingshaDrunken');
    expect(ult.note).toContain('lingshaUlt');
    const uh = r.hits.find((x) => x.seq === ult.hitSeqs![0])!;
    close(uh.factors.find((f) => f.key === 'base')!.value, 3750, 0.01);
    close(uh.total, 1767.86, 0.01);
    // 浮元独立行动轴：t=190.93→302.04→306.12，首动 4 段（全体3+随机1）base=0.75×2500=1875
    const fy = evsOf(r, (e) => e.unitId === 'fuyuan');
    expect(fy.map((e) => Number(e.time.toFixed(2)))).toEqual([190.93, 302.04, 306.12]);
    expect(fy[0].action).toBe('fuyuan');
    expect(fy[0].skillCode).toBe('lingsha.fuyuan');
    expect(fy[0].hitSeqs).toHaveLength(4);
    const yh = r.hits.find((x) => x.seq === fy[0].hitSeqs![0])!;
    close(yh.factors.find((f) => f.key === 'base')!.value, 1875, 0.01);
    close(yh.total, 883.93, 0.01);
    // 总伤（dump 锚点）
    close(r.report.totalDamage, 307513.22, 0.5);
    // 满血（未受击）
    expect(r.finalState.memberHp.jingyuan).toBeCloseTo(3000, 4);
    expect(r.finalState.memberHp.lingsha).toBeCloseTo(3000, 4);
  });

  it('B 秘技：进战召浮元+敌全体醇醉', () => {
    const r = run('B', () => mkCfg({ techniques: true, rounds: 4, maxTime: 210 }));
    const tech = evsOf(r, (e) => e.action === 'technique' && e.unitId === 'lingsha')[0];
    close(tech.time, 0, 0.01);
    expect(tech.skillCode).toBe('lingsha.tech');
    expect(tech.note).toContain('technique');
    expect(tech.note).toContain('lingshaTech');
    expect(tech.note).toContain('lingshaFuyuan'); // 秘技召浮元
    expect(tech.note).toContain('lingshaDrunken'); // 秘技敌全体醇醉2回合
    close(tech.energyAfter ?? 0, 55, 0.01); // 不回能
    // 浮元首动 t=102.04 hits=4
    const fy0 = evsOf(r, (e) => e.unitId === 'fuyuan')[0];
    close(fy0.time, 102.04, 0.01);
    expect(fy0.hitSeqs).toHaveLength(4);
  });
});

describe('灵砂1222（星魂）', () => {
  it('C E1：击破效率常驻 buff + 破后降防伤害提升', () => {
    const mkLow = (eid: number): BattleConfig =>
      mkCfg({
        rounds: 4,
        maxTime: 210,
        monster: { ...MON, maxToughness: 60 },
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'lingsha', panel: LS_PANEL, eidolonLevel: eid },
        ],
      });
    const e0 = run('C0', () => mkLow(0));
    const e1 = run('C1', () => mkLow(1));
    // E1 首战技破3桩：note flush 3 条 lingshaE1
    const first = evsOf(e1, (e) => e.kind === 'action' && e.unitId === 'lingsha')[0];
    close(first.time, 102.04, 0.01);
    expect(first.note).toContain('lingshaFuyuan');
    expect(first.note).toContain('lingshaSkill');
    expect(first.note!.filter((n) => n === 'lingshaE1')).toHaveLength(3);
    // 自身 breakEfficiency buff 快照：0.5 永久
    const be = e1.events
      .flatMap((e) => e.buffs?.lingsha ?? [])
      .find((b) => b.key === 'breakEfficiency' && b.labelKey === 'lingshaE1');
    expect(be).toBeTruthy();
    close(be!.value, 0.5, 0.001);
    // 破后同 hit 伤害比（monster buffs 不进快照——E1 降防只能用伤害差断言）
    const pick = (r: BattleResult): Map<string, number> => {
      const m = new Map<string, number>();
      for (const h of r.hits) {
        if (
          h.target === 'monster1' &&
          h.kind !== 'breakTrigger' &&
          h.kind !== 'breakDot' &&
          h.kind !== 'superBreak'
        ) {
          m.set(`${h.time.toFixed(2)}:${h.source}:${h.skillCode}`, h.total);
        }
      }
      return m;
    };
    const m0 = pick(e0);
    const m1 = pick(e1);
    // 锚点：破前相同、破后 E1 更高（防御区因降防20%变大）
    close(m0.get('74.07:jingyuan:jingyuan.skill')!, 6578.15, 0.01);
    close(m1.get('74.07:jingyuan:jingyuan.skill')!, 6578.15, 0.01);
    close(m0.get('143.52:shenjun:jingyuan.shenjun')!, 1772.92, 0.01);
    close(m1.get('143.52:shenjun:jingyuan.shenjun')!, 1980.39, 0.01);
    // t=148.15 skill 与 ult 同刻——键必须含 skillCode 否则互相覆盖
    close(m0.get('148.15:jingyuan:jingyuan.skill')!, 9116.93, 0.01);
    close(m1.get('148.15:jingyuan:jingyuan.skill')!, 10183.8, 0.01);
    close(m0.get('148.15:jingyuan:jingyuan.ult')!, 18233.86, 0.01);
    close(m1.get('148.15:jingyuan:jingyuan.ult')!, 20367.61, 0.01);
  });

  it('D E6：技能/天赋等级提升 + 浮元追加2段', () => {
    const r = run('D', () =>
      mkCfg({
        rounds: 6,
        maxTime: 300,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'lingsha', panel: LS_PANEL, eidolonLevel: 6 },
        ],
      }),
    );
    // E5 战技+2 → base=0.88×2500=2200
    const first = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'lingsha')[0];
    const fh = r.hits.find((x) => x.seq === first.hitSeqs![0])!;
    close(fh.factors.find((f) => f.key === 'base')!.value, 2200, 0.01);
    close(fh.total, 1037.14, 0.01);
    // E6 浮元首动 hits=6（全体3+随机1+E6两段）、note 含 lingshaE6
    const fy0 = evsOf(r, (e) => e.unitId === 'fuyuan')[0];
    close(fy0.time, 190.93, 0.01);
    expect(fy0.hitSeqs).toHaveLength(6);
    expect(fy0.note).toContain('lingshaE6');
    // E3 天赋+2 → 全体段与随机段均 0.825×2500=2062.50（p[1]、p[7] 同随天赋等级提升）；E6 两段 0.5×2500=1250
    const bases = fy0
      .hitSeqs!.map((s) => r.hits.find((x) => x.seq === s)!)
      .map((h) => h.factors.find((f) => f.key === 'base')!.value);
    expect(bases.filter((b) => Math.abs(b - 2062.5) < 0.01)).toHaveLength(4);
    expect(bases.filter((b) => Math.abs(b - 1250) < 0.01)).toHaveLength(2);
    const e6h = fy0.hitSeqs!.map((s) => r.hits.find((x) => x.seq === s)!).at(-1)!;
    close(e6h.total, 707.14, 0.01);
  });

  it('F E2：终招后全队击破特攻 buff', () => {
    const r = run('F', () =>
      mkCfg({
        rounds: 6,
        maxTime: 340,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'lingsha', panel: LS_PANEL, eidolonLevel: 2 },
        ],
      }),
    );
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'lingsha')[0];
    close(ult.time, 306.12, 0.01);
    expect(ult.note).toContain('lingshaDrunken');
    expect(ult.note).toContain('lingshaE2');
    expect(ult.note).toContain('lingshaUlt');
    // 同事件快照：lingsha 与 jingyuan 都有 breakEffect=0.4 dur=3 src=lingsha
    for (const uid of ['lingsha', 'jingyuan'] as const) {
      const be = (ult.buffs?.[uid] ?? []).find((b) => b.labelKey === 'lingshaE2');
      expect(be, uid).toBeTruthy();
      close(be!.value, 0.4, 0.001);
      expect(be!.duration).toBe(3);
      expect(be!.source).toBe('lingsha');
    }
  });
});
