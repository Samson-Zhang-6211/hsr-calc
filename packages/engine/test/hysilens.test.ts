import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 海瑟音 1410 接入回归（2026-10-17；dump 锚点法：锚点全部来自 hysilens-dump1/2/3/B 实测，勿纯推理改写） */

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

const HY_PANEL = {
  level: 80,
  hp: 3000,
  attack: 2500,
  defence: 800,
  speed: 102,
  critRate: 0.05,
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

/** 诗篇 P 专用高血面板：hp3000 会在 t≈400 全灭提前结束（dump3 实测） */
const HY_TANK = { ...HY_PANEL, hp: 50000 };
const XL_PANEL = {
  level: 80,
  hp: 50000,
  attack: 3000,
  defence: 1000,
  speed: 250,
  critRate: 0.8,
  critDmg: 1.5,
  element: 'Ice' as const,
  energyRegen: 0,
  damageBonus: 0.5,
  breakEffect: 0,
};

function mkCfg(over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    members: [
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
      { id: 'hysilens', panel: HY_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 6,
    maxTime: 400,
    techniques: false,
    seed: 20261017,
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
/** 海瑟音全部行动事件（含终招/秘技，按事件时序） */
const hyActs = (r: BattleResult): Ev[] =>
  evsOf(r, (e) => e.unitId === 'hysilens' && (e.kind === 'action' || e.kind === 'ult'));
const monEv = (r: BattleResult, unit: string, t: number): Ev =>
  evsOf(r, (e) => e.unitId === unit && Math.abs(e.time - t) < 0.01)[0];
const hitOf = (r: BattleResult, seq: number) => r.hits.find((h) => h.seq === seq)!;
const noteCounts = (r: BattleResult): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const e of r.events)
    for (const n of e.note ?? [])
      if (n.startsWith('hy') || n === 'technique' || n.startsWith('poemOcean')) c[n] = (c[n] ?? 0) + 1;
  return c;
};
const buffOf = (e: Ev, unit: string, label: string) =>
  e.buffs?.[unit]?.find((b) => b.labelKey === label);

describe('海瑟音1410（基础机制）', () => {
  it('A 行动链/能量链/战技普攻终招伤害/结界/引爆', () => {
    const r = run('A', () => mkCfg());
    const acts = hyActs(r); // 战技98 → 普攻196 → 终招196 → 战技294
    expect(acts.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([85, 110, 5, 50]);
    const skill = acts[0];
    close(skill.time, 98.03921568627452, 0.01);
    expect(skill.action).toBe('skill');
    expect(skill.skillCode).toBe('hysilens.skill');
    expect(skill.targetId).toBe('monster2');
    expect(skill.note).toEqual(['hySkill']);
    expect(skill.hitSeqs).toEqual([3, 4, 5]);
    for (const s of skill.hitSeqs!) close(hitOf(r, s).total, 1769.1780821917805);
    // 普攻 t196.08（同刻先手终招前）：seq48 单段
    const basic = acts.find((e) => e.action === 'basic')!;
    close(basic.time, 196.07843137254903, 0.01);
    expect(basic.note ?? []).toEqual([]);
    close(hitOf(r, basic.hitSeqs![0]).total, 1516.4383561643835);
    // 终招 t196.08：23 段 = AoE3 + 引爆16 + field4
    const ult = acts.find((e) => e.kind === 'ult')!;
    close(ult.time, 196.07843137254903, 0.01);
    expect(ult.note).toEqual(['hyField', 'hyDetonate', 'hyUlt']);
    expect(ult.hitSeqs).toHaveLength(23);
    for (const s of [49, 50, 51]) close(hitOf(r, s).total, 3032.876712328767);
    // 引爆段：m1 windShear 双倍（2层）、bleed 单层
    expect(hitOf(r, 52).skillCode).toBe('hysilens.trace07.windShear');
    expect(hitOf(r, 52).target).toBe('monster1');
    close(hitOf(r, 52).total, 1232.8767123287669);
    close(hitOf(r, 53).total, 616.4383561643834);
    // 结界 t100：每怪 skilldot windShear/bleed + field 段
    const m1 = monEv(r, 'monster1', 100);
    close(hitOf(r, 6).total, 410.958904109589);
    close(hitOf(r, 8).total, 1315.0684931506848);
    expect(m1.hitSeqs).toContain(6);
    // t200 四种 DoT（引爆后 windShear 层数翻倍）
    const t200 = evsOf(r, (e) => e.unitId === 'monster1' && Math.abs(e.time - 200) < 0.01)[0];
    close(hitOf(r, t200.hitSeqs![0]).total, 1232.8767123287669);
    // hyTrace08 常驻 buff（无 effectHit → v=0 但实例在）
    const ev74 = evsOf(r, (e) => Math.abs(e.time - 74.07) < 0.01)[0];
    const t08 = buffOf(ev74, 'hysilens', 'hyTrace08');
    expect(t08).toBeDefined();
    close(t08!.value, 0);
    expect(t08!.duration).toBe(-1);
    // 2 战技 + 1 终招 + 1 结界 note
    const nc = noteCounts(r);
    expect(nc.hySkill).toBe(2);
    expect(nc.hyUlt).toBe(1);
    expect(nc.hyField).toBe(1);
    expect(nc.hyDetonate).toBe(1);
    expect(r.events).toHaveLength(21);
    close(r.report.totalDamage, 458889.2050007678, 0.5);
  });

  it('B 秘技进战挂 DoT（无伤害段）', () => {
    const r = run('B', () => mkCfg({ techniques: true }));
    const tech = evsOf(r, (e) => e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.unitId).toBe('hysilens');
    expect(tech.note).toEqual(['technique', 'hyTech']);
    expect(Math.round(tech.energyAfter ?? 0)).toBe(55);
    expect(tech.hitSeqs ?? []).toHaveLength(0);
    // 行动链：秘技后 t100 怪回合即有结界段
    const acts = hyActs(r);
    expect(acts.map((e) => Math.round(e.energyAfter ?? 0))).toEqual([55, 85, 110, 5, 45]);
    close(acts[1].time, 98.03921568627452, 0.01);
    expect(acts[1].note).toEqual(['hySkill']);
    // 终招（vuln 叠加后战技段更高）
    const ult = acts.find((e) => e.kind === 'ult')!;
    expect(ult.note).toEqual(['hyField', 'hyDetonate', 'hyUlt']);
    // 总伤锚
    close(r.report.totalDamage, 667460.529672341, 0.5);
    expect(r.events).toHaveLength(29);
  });

  it('P 诗篇·暖流（昔涟终招触发，普攻消费引爆+回能）', () => {
    const r = run('P', () =>
      mkCfg({
        members: [
          { id: 'xilian', panel: XL_PANEL, eidolonLevel: 0 },
          { id: 'hysilens', panel: HY_TANK, eidolonLevel: 0 },
        ],
        rounds: 5,
        maxTime: 520,
      }),
    );
    // 昔涟终招 t400 → poemOceanDmg buff 挂海瑟音
    const xlUlt = evsOf(
      r,
      (e) => e.unitId === 'xilian' && e.kind === 'ult' && Math.abs(e.time - 400) < 0.01,
    )[0];
    expect(xlUlt.note).toContain('poemOceanDmg');
    const after400 = evsOf(r, (e) => e.time >= 400 && e.time < 490);
    const dmg = after400.map((e) => buffOf(e, 'hysilens', 'poemOceanDmg')).find(Boolean);
    expect(dmg).toBeDefined();
    close(dmg!.value, 0.6);
    expect(dmg!.duration).toBe(-1);
    // 海瑟音普攻 t490.20 消费暖流（note + 回能105=45+20+60-20? 按实锚 ens105）
    const poemBasic = evsOf(
      r,
      (e) => e.unitId === 'hysilens' && e.action === 'basic' && Math.abs(e.time - 490.2) < 0.01,
    )[0];
    expect(poemBasic.note).toEqual(['poemOcean']);
    // 2026-11-02 重锚：真我故事阈值改为 1141526 #2 实读（3，原来硬编码 2）→ 花与箭/诗篇触发次数变少
    // 2026-11-02 二次重锚：昔涟 point07「岁月的旅人」落地（队友黄金裔/记忆 1/2/3 名 → 开战 +2/3/6 追忆），
    // 开局多 3 点追忆 → 真我弹射多攒 3 段 → 海瑟音普攻时场上诗篇/回能基准位移 → 105
    expect(Math.round(poemBasic.energyAfter ?? 0)).toBe(105);
    // 总伤锚
    // 2026-11-02 重锚：昔涟 1415 行迹 point08 的「冰属性抗性穿透」半句接入后，
    // 本队昔涟 speed=250（XL_PANEL）→ 超出 180 共 60 点 = 上限 → 穿透 +120%，
    // 抗性区因子 1.0 → 2.2，昔涟与德谬歌的冰伤各 ×2.2。
    // 增量实测 = 1255824.002465758（旧锚 1241149.02 + 增量 = 2496973.022465758）。
    // 判据另见 test/memory-e1-p08.test.ts D/E（240 与 300 速抗性区因子同为 2.2）。
    // 2026-11-02 重锚：真我（1141526）弹射接入后，花与箭每次额外打 pending 段（84% 德谬歌生命上限冰伤）
    // → 总伤从 2496973.02 抬到 3652509.35（增量 1155536.32，实测 diff）。
    // 2026-11-02 二次重锚：昔涟 point07 落地（本队除昔涟外还有海瑟音=黄金裔/虚无 → 1 名 → 开战 +2 追忆，
    // 另外德谬歌召唤的昔涟自身不计）→ 真我弹射多攒段 → 实测 3242998.20（比旧锚低，因故事阈值改动叠加）。
    // 2026-11-02 二次重锚：昔涟 point07 落地（本队除昔涟外只有海瑟音 = 黄金裔 1 名 → 开战 +2 追忆）；
    // 追忆同时是真我弹射（1141526）的段数来源，+2 段在整场里被花与箭反复复用 → 总伤 3652509.35 → 6895507.55。
    close(r.report.totalDamage, 6895507.545205492, 0.5);
  });
});

describe('海瑟音1410（星魂与行迹）', () => {
  const eidRun = (key: string, eid: number): BattleResult =>
    run(key, () =>
      mkCfg({
        rounds: 8,
        maxTime: 500,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'hysilens', panel: HY_PANEL, eidolonLevel: eid },
        ],
      }),
    );
  /** 首 t100 skilldot.windShear / field 段（走 m1 seq6-9 同 A 序，按各档实测取首段） */
  const firstDot = (r: BattleResult): number => {
    const t100 = evsOf(r, (e) => e.unitId === 'monster1' && Math.abs(e.time - 100) < 0.01)[0];
    const dots = (t100.hitSeqs ?? []).filter((s) => hitOf(r, s).skillCode.startsWith('skilldot'));
    return hitOf(r, dots[0]).total;
  };
  const firstField = (r: BattleResult): number => {
    const t100 = evsOf(r, (e) => e.unitId === 'monster1' && Math.abs(e.time - 100) < 0.01)[0];
    const fs = (t100.hitSeqs ?? []).filter((s) => hitOf(r, s).skillCode === 'hysilens.field');
    return hitOf(r, fs[0]).total;
  };

  it('E1 DoT 倍率×1.16', () => {
    const r = eidRun('E1', 1);
    close(r.report.totalDamage, 459504.7806246576, 0.5);
    close(firstDot(r), 953.4246575342464);
    close(firstField(r), 1525.4794520547946);
  });
  it('E2 结界中全队增伤（无 effectHit → value=0，与 E1 同值）', () => {
    const r = eidRun('E2', 2);
    close(r.report.totalDamage, 459504.7806246576, 0.5);
    close(firstDot(r), 953.4246575342464);
    // hyE2 挂景元 holder（value=0 实例仍在快照）
    const ev = evsOf(r, (e) => e.time > 196.09)[0];
    const b = buffOf(ev, 'jingyuan', 'hyE2');
    expect(b).toBeDefined();
    close(b!.value, 0);
  });
  it('E4 结界敌全抗-20%（伤害比断言）', () => {
    const r = eidRun('E4', 4);
    close(r.report.totalDamage, 519945.1827236207, 0.5);
    close(firstDot(r), 1158.069883527454);
    close(firstField(r), 2038.2029950083192);
  });
  it('E6 结界引爆上限提高', () => {
    const r = eidRun('E6', 6);
    close(r.report.totalDamage, 549824.9204332405, 0.5);
    close(firstDot(r), 1295.1081530782028);
    close(firstField(r), 2486.607653910149);
  });
  it('T 行迹08：效果命中转增伤', () => {
    const r = run('T', () =>
      mkCfg({
        rounds: 8,
        maxTime: 500,
        members: [
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'hysilens', panel: { ...HY_PANEL, effectHit: 0.75 }, eidolonLevel: 0 },
        ],
      }),
    );
    const ev74 = evsOf(r, (e) => Math.abs(e.time - 74.07) < 0.01)[0];
    const t08 = buffOf(ev74, 'hysilens', 'hyTrace08');
    expect(t08).toBeDefined();
    close(t08!.value, 0.22500000000000003, 1e-9);
    close(r.report.totalDamage, 474242.4960966581, 0.5);
    const skill = hyActs(r)[0];
    close(skill.time, 98.03921568627452, 0.01);
    for (const s of skill.hitSeqs!) close(hitOf(r, s).total, 2167.243150684931);
  });
});
