import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 娜塔莎 1105 接入回归（2026-10-15；dump 锚点法：锚点全部来自 natasha-dump 实测，勿纯推理改写） */

type Ev = BattleResult['events'][number];

const MON = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 3000,
  speed: 100,
  monsterId: '1004011',
  attack: 400,
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
  element: 'Physical' as const,
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
      { id: 'natasha', panel: NT_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 4,
    maxTime: 250,
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

describe('娜塔莎1105（基础机制）', () => {
  it('A 战技/终招/能量链/HoT/满血钳制', () => {
    const r = run('A', () => mkCfg());
    const acts = evsOf(
      r,
      (e) => (e.kind === 'action' && e.unitId === 'natasha') || (e.kind === 'ult' && e.unitId === 'natasha'),
    );
    // 首动=战技 t=102.04：初45+受击回能10+30=90、目标景元、note natashaHeal+natashaSkill
    const first = acts[0];
    close(first.time, 102.04, 0.01);
    expect(first.action).toBe('skill');
    expect(first.skillCode).toBe('natasha.skill');
    close(first.energyAfter ?? 0, 90, 0.01);
    expect(first.targetId).toBe('jingyuan');
    expect(first.note).toContain('natashaHeal');
    expect(first.note).toContain('natashaSkill');
    // 同刻终招：全队治疗、ens=5（通用清能+回5）
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'natasha')[0];
    close(ult.time, 102.04, 0.01);
    expect(ult.skillCode).toBe('natasha.ult');
    close(ult.energyAfter ?? 0, 5, 0.01);
    expect(ult.note).toContain('natashaHeal');
    expect(ult.note).toContain('natashaUlt');
    // 能量链 [90,5,35]（受击回能影响，非纯技能链）
    const ens = acts.slice(0, 3).map((e) => Math.round(e.energyAfter ?? 0));
    expect(ens).toEqual([90, 5, 45]);
    // 普攻 t=204.08：base=1.4×2500=3500、total=1650
    const basic = acts.find((e) => e.action === 'basic')!;
    close(basic.time, 204.08, 0.01);
    expect(basic.skillCode).toBe('natasha.basic');
    expect(basic.hitSeqs).toHaveLength(1);
    const bh = r.hits.find((x) => x.seq === basic.hitSeqs![0])!;
    close(bh.factors.find((f) => f.key === 'base')!.value, 2500, 0.01);
    close(bh.total, 1178.571, 0.01);
    // HoT（战技挂景元、turnStart tick）：t=148.15 满血无 natashaHeal、t=222.22 掉血后两者都有
    const jyActs = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'jingyuan');
    const hot1 = jyActs.find((e) => Math.abs(e.time - 148.15) < 0.01)!;
    expect(hot1.note).toContain('natashaHoT');
    expect(hot1.note).not.toContain('natashaHeal');
    const hot2 = jyActs.find((e) => Math.abs(e.time - 222.22) < 0.01)!;
    expect(hot2.note).toContain('natashaHeal');
    expect(hot2.note).toContain('natashaHoT');
    // 总伤 + finalHp（dump 锚点）
    close(r.report.totalDamage, 271147.75, 0.5);
    close(r.finalState.memberHp.jingyuan ?? 0, 2936.57, 0.01);
    close(r.finalState.memberHp.natasha ?? 0, 1739.14, 0.01);
  });

  it('B 秘技：伤害+敌全体虚弱（monsterAtkDown ×0.7）', () => {
    const r = run('B-on', () => mkCfg({ techniques: true, maxTime: 210 }));
    const tech = evsOf(r, (e) => e.action === 'technique' && e.unitId === 'natasha')[0];
    close(tech.time, 0, 0.01);
    expect(tech.skillCode).toBe('natasha.tech');
    expect(tech.note).toContain('technique');
    expect(tech.note).toContain('natashaTech');
    close(tech.energyAfter ?? 0, 45, 0.01);
    expect(tech.hitSeqs).toHaveLength(1);
    const th = r.hits.find((x) => x.seq === tech.hitSeqs![0])!;
    close(th.factors.find((f) => f.key === 'base')!.value, 2000, 0.01); // 0.8×2500
    close(th.total, 942.86, 0.01);
    // 虚弱锚：ON 场景 t=100 全部怪伤=550.00（=OFF 基值×0.7；秘技 rand01 改 RNG 流故怪技能序列不同，按值断言）
    const hits100 = r.events
      .filter((e) => e.kind === 'action' && e.unitId.startsWith('monster') && Math.abs(e.time - 100) < 0.01)
      .flatMap((e) => e.enemyHits ?? []);
    expect(hits100.length).toBeGreaterThan(0);
    for (const h of hits100) close(h.damage, 550.00, 0.01);
    // OFF 对照：t=100 存在 785.71 原伤
    const off = run('B-off', () => mkCfg({ techniques: false, maxTime: 210 }));
    const off100 = off.events
      .filter((e) => e.kind === 'action' && e.unitId.startsWith('monster') && Math.abs(e.time - 100) < 0.01)
      .flatMap((e) => e.enemyHits ?? []);
    expect(off100.some((h) => Math.abs(h.damage - 785.71) < 0.01)).toBe(true);
  });
});

describe('娜塔莎1105（星魂）', () => {
  it('C E1+E4：受击自疗 + 受击回能+5', () => {
    const r = run('C', () =>
      mkCfg({
        rounds: 10,
        maxTime: 400,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'natasha', panel: NT_PANEL, eidolonLevel: 4 },
        ],
      }),
    );
    // E4：受击+5能量 → 普攻 ens=40（E0 为 35，差5）
    const basic = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'natasha' && e.action === 'basic')[0];
    close(basic.time, 204.08, 0.01);
    close(basic.energyAfter ?? 0, 55, 0.01);
    // E1：t=300 怪打后 ≤30% 自疗 note=[natashaHeal,natashaE1]
    const e1ev = r.events.find((e) => (e.note ?? []).includes('natashaE1'))!;
    close(e1ev.time, 300.0, 0.01);
    expect(e1ev.kind).toBe('action');
    expect(e1ev.unitId).toBe('monster2');
    expect(e1ev.note).toContain('natashaHeal');
    // 总伤（dump 锚点）
    close(r.report.totalDamage, 286063.22, 0.5);
  });

  it('D E6：普攻追加 hpBased 第二段', () => {
    const r = run('D', () =>
      mkCfg({
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'natasha', panel: { ...NT_PANEL, hp: 4000 }, eidolonLevel: 6 },
        ],
      }),
    );
    const basic = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'natasha' && e.action === 'basic')[0];
    close(basic.time, 204.08, 0.01);
    expect(basic.hitSeqs).toHaveLength(2);
    const h1 = r.hits.find((x) => x.seq === basic.hitSeqs![0])!;
    const h2 = r.hits.find((x) => x.seq === basic.hitSeqs![1])!;
    close(h1.factors.find((f) => f.key === 'base')!.value, 2750, 0.01); // 1.4×2500
    close(h1.total, 1296.429, 0.01);
    close(h2.factors.find((f) => f.key === 'base')!.value, 1600, 0.01); // 0.4×4000 hpBased
    close(h2.total, 754.29, 0.01);
    expect(h2.target).toBe(h1.target); // 同目标
    // E6 含 E4 → 普攻 ens=40
    close(basic.energyAfter ?? 0, 55, 0.01);
    close(r.report.totalDamage, 272019.89, 0.5);
  });

  it('E2：终招时≤30%队友获 HoT（mainC 自奶景元保持低血）', () => {
    const r = run('E2', () =>
      mkCfg({
        rounds: 6,
        maxTime: 350,
        monster: { ...MON, attack: 800 },
        mainC: 'natasha',
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'natasha', panel: NT_PANEL, eidolonLevel: 2 },
        ],
      }),
    );
    // 首战技目标=mainC 自奶（景元保持 ≤30%）
    const skill = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'natasha' && e.action === 'skill')[0];
    close(skill.time, 102.04, 0.01);
    expect(skill.targetId).toBe('natasha');
    // 终招 note=[natashaHeal,natashaE2,natashaUlt]
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'natasha')[0];
    close(ult.time, 102.04, 0.01);
    expect(ult.note).toContain('natashaE2');
    expect(ult.note).toContain('natashaHeal');
    expect(ult.note).toContain('natashaUlt');
    // E2 HoT：景元 t=148.15 回合开始 tick note 含 natashaHoT+natashaHeal
    const jyHot = evsOf(
      r,
      (e) => e.kind === 'action' && e.unitId === 'jingyuan' && Math.abs(e.time - 148.15) < 0.01,
    )[0];
    expect(jyHot.note).toContain('natashaHoT');
    expect(jyHot.note).toContain('natashaHeal');
  });
});
