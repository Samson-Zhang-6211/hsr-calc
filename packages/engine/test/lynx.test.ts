import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 玲可 1110 接入回归（2026-10-15；dump 锚点法：锚点全部来自 lynx-dump 实测，勿纯推理改写） */

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

const NT_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 98,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Quantum' as const,
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
      { id: 'lynx', panel: NT_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 8,
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

describe('玲可1110（基础机制）', () => {
  it('A 战技求生反应/直疗/HoT分档/能量链/普攻/终招', () => {
    const r = run('A', () => mkCfg());
    const acts = evsOf(
      r,
      (e) => (e.kind === 'action' && e.unitId === 'lynx') || (e.kind === 'ult' && e.unitId === 'lynx'),
    );
    // 首动=战技 t=102.04：ens 50+30=80、求生反应+直疗 note、sp 花1
    const first = acts[0];
    close(first.time, 102.04, 0.01);
    expect(first.action).toBe('skill');
    close(first.energyAfter ?? 0, 80, 0.01);
    expect(first.note).toContain('lynxSurvival');
    expect(first.note).toContain('lynxHeal');
    expect(first.note).toContain('lynxSkill');
    expect(first.hitSeqs ?? []).toHaveLength(0);
    // 能量链（maxTime400 内 4 次行动）：80(战技+30)→100(普攻+20)→5(终招清能+回5)→35(战技+30)
    const ens = acts.map((e) => Math.round(e.energyAfter ?? 0));
    expect(ens).toEqual([80, 100, 5, 35]);
    // 普攻 t=204.08：base=0.7×2500=1750、total=825
    const basic = acts.find((e) => e.action === 'basic')!;
    close(basic.time, 204.08, 0.01);
    const bh = r.hits.find((x) => x.seq === basic.hitSeqs![0])!;
    close(bh.factors.find((f) => f.key === 'base')!.value, 1250, 0.01);
    close(bh.total, 589.29, 0.01);
    // 终招 t=204.08（紧随普攻同刻）：无伤害、全队治疗+全队HoT、ens=5
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'lynx')[0];
    close(ult.time, 204.08, 0.01);
    expect(ult.skillCode).toBe('lynx.ult');
    close(ult.energyAfter ?? 0, 5, 0.01);
    expect(ult.note).toContain('lynxUlt');
    // 景元回合 HoT tick：t=148.15 / 222.22 / 296.30 / 370.37 note 含 lynxHoT
    for (const t of [148.15, 222.22, 296.3, 370.37]) {
      const jy = evsOf(
        r,
        (e) => e.kind === 'action' && e.unitId === 'jingyuan' && Math.abs(e.time - t) < 0.01,
      )[0];
      expect(jy.note).toContain('lynxHoT');
    }
    close(r.report.totalDamage, 285356.08, 0.5);
  });

  it('B 秘技：进战全队基础档 HoT（无伤害、无虚弱类攻击）', () => {
    const r = run('B', () => mkCfg({ techniques: true, rounds: 6, maxTime: 300 }));
    const tech = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'lynx' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toContain('technique');
    expect(tech.note).toContain('lynxTech');
    expect(tech.hitSeqs ?? []).toHaveLength(0);
    close(tech.energyAfter ?? 0, 50, 0.01);
    // 景元首动 t=74.07 即有 lynxHoT（秘技已挂全队）
    const jy = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'jingyuan')[0];
    expect(jy.note).toContain('lynxHoT');
    close(r.report.totalDamage, 332551.58, 0.5);
  });
});

describe('玲可1110（星魂）', () => {
  it('C E1+E4：E4 atkFlat 使景元 skill base +3%（3000→3090），E1 治疗加成进 finalHp', () => {
    const r = run('C', () =>
      mkCfg({
        rounds: 10,
        maxTime: 500,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'lynx', panel: NT_PANEL, eidolonLevel: 4 },
        ],
      }),
    );
    // E4：战技后景元 skill base 4320→4449.6（+3% atk = 3000→3090；4320×1.03=4449.6）
    const skillHit = r.hits.find((h) => h.skillCode === 'jingyuan.skill' && Math.abs(h.time - 148.15) < 0.01)!;
    close(skillHit.factors.find((f) => f.key === 'base')!.value, 4449.6, 0.01);
    // E1：≤50% 目标治疗 ×1.2 → finalHp 景元 3462.5（vs E0 3425）
    close(r.finalState.memberHp.jingyuan ?? 0, 3462.5, 0.01);
    close(r.report.totalDamage, 319776.56, 0.5);
  });

  it('D E6：求生反应 maxHp 提升 13.5%+200 → 景元 finalHp 3642.5', () => {
    const r = run('D', () =>
      mkCfg({
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'lynx', panel: NT_PANEL, eidolonLevel: 6 },
        ],
      }),
    );
    // E6：maxHp = 3000 + 0.135×3000 + 200 = 3605（cap）；HoT 直至 cap 后 final=3642.5（含 over-heal 修正）
    close(r.finalState.memberHp.jingyuan ?? 0, 3642.5, 0.01);
    close(r.report.totalDamage, 290010.36, 0.5);
  });
});
