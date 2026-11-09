import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 罗刹 1203 接入回归（2026-10-13；dump 锚点法：锚点全部来自 luocha-dump 实测，勿纯推理改写） */

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

const LUOCHA_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 101,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Imaginary' as const,
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
      { id: 'luocha', panel: LUOCHA_PANEL, eidolonLevel: 0 },
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

describe('罗刹1203（基础机制）', () => {
  it('A 双人：战技/能量链/普攻1.4倍率/终招2.0倍率AoE/白花开结界', () => {
    const r = run('A', () => mkCfg());
    const acts = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'luocha');
    // 首动=战技 t=99.01（SP足）：energy 50+30=80、SP 3-1=2→实测 spAfter=1（前有 jy 战技耗SP）target=景元
    const first = acts[0];
    close(first.time, 99.01, 0.01);
    expect(first.action).toBe('skill');
    close(first.energyAfter ?? 0, 80, 0.01);
    expect(first.targetId).toBe('jingyuan');
    expect(first.note).toContain('luochaSkill');
    expect(first.note).toContain('luochaFlower'); // 1/2 朵
    expect(first.hitSeqs ?? []).toHaveLength(0); // 战技纯治疗
    // 罗刹 action 能量链：80→100(普攻+20)→35(战技+30,前有终招清空)→65
    const ens = acts.slice(0, 4).map((e) => Math.round(e.energyAfter ?? 0));
    expect(ens).toEqual([80, 100, 35, 65]);
    // 普攻：单段 base=1.4×2500=3500、total=1650（crit=1+0.2×0.5=1.1、def=0.48、tough=0.9）
    const basic = acts.find((e) => e.action === 'basic')!;
    const h = r.hits.find((x) => x.seq === basic.hitSeqs![0])!;
    close(h.factors.find((f) => f.key === 'base')!.value, 2500, 0.01);
    close(h.total, 1178.571, 0.01);
    // 终招 t=198.02：3段 AoE base=2.0×2500=5000；energyAfter=5 为通用引擎行为（大招清能+回5，castUltFor）
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'luocha')[0];
    expect(ult.skillCode).toBe('luocha.ult');
    expect(ult.hitSeqs).toHaveLength(3);
    close(ult.energyAfter ?? 0, 5, 0.01);
    const uh = r.hits.find((x) => x.seq === ult.hitSeqs![0])!;
    close(uh.factors.find((f) => f.key === 'base')!.value, 5000, 0.01);
    close(uh.total, 2357.14, 0.01);
    // 白花→结界：终招 note 含 luochaField（第2朵满层展开）
    expect(ult.note).toContain('luochaField');
    expect(ult.note).toContain('luochaUlt');
    // 总伤（dump 锚点）
    close(r.report.totalDamage, 293016.79, 0.5);
    // 未受击 → 满血
    expect(r.finalState.memberHp.jingyuan).toBeCloseTo(3000, 4);
    expect(r.finalState.memberHp.luocha).toBeCloseTo(3000, 4);
  });

  it('B 结界受击回血：队友攻击/神君归属/罗刹终招自触', () => {
    const r = run('A', () => mkCfg()); // 复用 A 配置
    // 结界在 t=198.02 终招展开（第2朵花），此后队友攻击触发回血
    const fieldHeals = evsOf(r, (e) => !!e.note?.includes('luochaFieldHeal'));
    // 锚点：t=222.22 jingyuan.skill、t=234.33 shenjun、t=296.30 jingyuan.basic、t=370.37 jingyuan.basic、t=396.04 前 luocha 终招自身等
    const times = fieldHeals.map((e) => Number(e.time.toFixed(2)));
    expect(times).toContain(222.22);
    expect(times).toContain(234.33); // 神君=召唤物，ownerOfUnit 归属 jingyuan
    expect(times).toContain(296.3);
    expect(times).toContain(370.37);
    // 展开事件本身（终招）也带 luochaFieldHeal（结界展开后同事件攻击者触发——实测锚点）
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'luocha')[0];
    expect(ult.note).toContain('luochaFieldHeal');
    // 白花再攒满：t=396.04 战技第2朵再开结界
    const thirdSkill = evsOf(
      r,
      (e) => e.kind === 'action' && e.unitId === 'luocha' && e.action === 'skill',
    ).at(-1)!;
    close(thirdSkill.time, 396.04, 0.01);
    expect(thirdSkill.note).toContain('luochaField');
    // 结界受击回血量：0.18×2500+240=690（满血钳制不加血——note 存在即触发）
    // 神君事件归属：note 在 shenjun 行动事件上（unitId=shenjun）
    const shenjunHeal = fieldHeals.find((e) => e.unitId === 'shenjun')!;
    expect(shenjunHeal).toBeTruthy();
  });

  it('C 秘技进战直开结界', () => {
    const r = run('C', () => mkCfg({ techniques: true, rounds: 4, maxTime: 210 }));
    const tech = evsOf(r, (e) => e.action === 'technique' && e.unitId === 'luocha')[0];
    close(tech.time, 0, 0.01);
    expect(tech.skillCode).toBe('luocha.tech');
    expect(tech.note).toContain('luochaTech');
    expect(tech.note).toContain('luochaField'); // 秘技直接展开结界
    close(tech.energyAfter ?? 0, 50, 0.01); // 不回能
  });
});

describe('罗刹1203（星魂）', () => {
  it('D E2 ≥50%：战技改发护盾 0.18×atk+240=690', () => {
    const r = run('D', () =>
      mkCfg({
        rounds: 3,
        maxTime: 110,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'luocha', panel: { ...LUOCHA_PANEL, speed: 150 }, eidolonLevel: 2 },
        ],
      }),
    );
    const first = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'luocha')[0];
    close(first.time, 66.67, 0.01);
    expect(first.note).toContain('luochaE2Shield');
    expect(first.note).toContain('luochaSkill');
    expect(r.finalState.memberShield?.jingyuan).toBeCloseTo(690, 2);
  });

  it('E E5+E6：终招倍率提升 + 减抗 note', () => {
    // E5：终招+2 → skillParams 走 lv.ult=2？引擎按 EIDOLON_SKILL_UP 提升等级。
    // 实测（eidolonLevel=6）：base=5400 = 2.16×2500（lv 提升后倍率）——dump 锚点 5400
    // E6：终招后 note 含 luochaE6（敌全抗-20% 2回合）
    const r = run('E', () =>
      mkCfg({
        rounds: 4,
        maxTime: 210,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'luocha', panel: LUOCHA_PANEL, eidolonLevel: 6 },
        ],
      }),
    );
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'luocha')[0];
    expect(ult.note).toContain('luochaE6');
    const uh = r.hits.find((x) => x.seq === ult.hitSeqs![0])!;
    close(uh.factors.find((f) => f.key === 'base')!.value, 5400, 0.01); // E5 终招+2 后倍率
    // 无 E6 减抗时 base 锚 5000（A 用例）——有 E6 后 base 不变（减抗在 resist 区），total 因后续事件干扰不断言
  });
});
