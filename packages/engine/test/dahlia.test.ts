import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type BattleResult } from '../src/index.js';

/** 大丽花 1321 接入回归（2026-10-20 收官批；锚点全部来自 x-dump41 实测 seed=20261020，勿纯推理改写） */

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

const DAHLIA_PANEL = {
  level: 80,
  hp: 30000,
  attack: 2500,
  defence: 800,
  speed: 96,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Fire' as const,
  energyRegen: 0,
  damageBonus: 0,
  breakEffect: 0,
};

const JY_PANEL = {
  level: 80,
  hp: 30000,
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

function mkCfg(eidolon = 0, over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    members: [
      { id: 'dahlia', panel: DAHLIA_PANEL, eidolonLevel: eidolon },
      { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
    ],
    monster: { ...MON },
    rounds: 6,
    maxTime: 600,
    techniques: false,
    seed: 20261020,
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
const baseOf = (r: BattleResult, seq: number): number =>
  r.hits.find((h) => h.seq === seq)!.factors.find((f) => f.key === 'base')!.value;
const hitOf = (r: BattleResult, seq: number): BattleResult['hits'][number] => r.hits.find((h) => h.seq === seq)!;

describe('大丽花1321（基础机制）', () => {
  it('A 战技开结界 / 随击 talnet 段 / 普攻超击破', () => {
    const r = run('A', () => mkCfg());
    close(r.report.totalDamage, 882817.7025671944, 0.5);
    // 进战 init= talent 初始能量 35 → 终招 t=0 即满（3 hits 直伤、结界未开无超击破）
    const ult0 = evsOf(r, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && e.time < 0.01)[0];
    expect(ult0.note).toEqual(expect.arrayContaining(['dhUlt']));
    close(ult0.energyAfter ?? 0, 5, 0.01);
    const ult0Hits = ult0.hitSeqs!.map((s) => hitOf(r, s));
    expect(ult0Hits).toHaveLength(3);
    for (const h of ult0Hits) {
      expect(h.skillCode).toBe('dahlia.ult');
      close(h.total, 1301.261829652997, 0.01); // fp=2500（E0 lv10）
    }
    // 首战技 t=104.17：Blast ×3 段（结界已开 def0.5258，无随击附加段）
    const skill = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'skill')[0];
    close(skill.time, 104.16666666666667, 0.01);
    expect(skill.note).toEqual(expect.arrayContaining(['dhSkill']));
    expect(skill.note!.filter((n) => n === 'dhSkill')).toHaveLength(1);
    close(skill.energyAfter ?? 0, 50, 0.01);
    const skillHits = skill.hitSeqs!.map((s) => hitOf(r, s));
    expect(skillHits).toHaveLength(3);
    for (const h of skillHits) {
      expect(h.skillCode).toBe('dahlia.skill');
      // 2026-11-06：三目标里可能有一个已破韧（×1.0），其余未破韧（×0.9）
      expect([2082.0189274447953, 2313.35436382755].some((v) => Math.abs(h.total - v) < 0.01)).toBe(true);
    }
    // 第二战技 t=208.33：2082.02×3 + 结界未破韧转超击破 2971.25×3（cut=30、ratio1.0）
    const skill2 = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'skill')[1];
    close(skill2.time, 208.33333333333334, 0.01);
    expect(skill2.hitSeqs).toHaveLength(6);
    for (const s of skill2.hitSeqs!) {
      const h = hitOf(r, s);
      if (h.skillCode === 'dahlia.skill') expect([2082.0189274447953, 2313.35436382755].some((v) => Math.abs(h.total - v) < 0.01)).toBe(true);
      else {
        expect(h.skillCode).toBe('dahlia.skill.dh.sb');
        expect(h.note).toContain('dhTalSB');
        close(h.total, 2971.2539432176663, 0.01);
      }
    }
    // 共舞者随击：jingyuan 普攻 t=222.22 hitSeqs 尾部 = talent 390.38 + talent.dh.sb 891.38
    const jyBasic = evsOf(
      r,
      (e) => e.unitId === 'jingyuan' && e.action === 'basic' && Math.abs(e.time - 222.22) < 0.01,
    )[0];
    const jyBasicHits = jyBasic.hitSeqs!.map((s) => hitOf(r, s));
    const talent = jyBasicHits.find((h) => h.skillCode === 'dahlia.talent');
    expect(talent).toBeDefined();
    close(talent!.total, 390.37854889589914, 0.01); // fp=750（0.5×atk 快照）
    const talentSb = jyBasicHits.find((h) => h.skillCode === 'dahlia.talent.dh.sb');
    expect(talentSb).toBeDefined();
    close(talentSb!.total, 891.3761829652998, 0.01);
    // 普攻 t=312.50：1821.77 + 2971.25（结界超击破随普攻）
    const basic = evsOf(
      r,
      (e) => e.unitId === 'dahlia' && e.action === 'basic' && Math.abs(e.time - 312.5) < 0.01,
    )[0];
    expect(basic.hitSeqs).toHaveLength(2);
    close(baseOf(r, basic.hitSeqs![0]), 2500, 0.01);
    close(hitOf(r, basic.hitSeqs![0]).total, 1301.261829652997, 0.01);
    close(hitOf(r, basic.hitSeqs![1]).total, 2971.2539432176663, 0.01);
    // 终招 t=312.50：直伤 1301.26×3 + 未破韧转化超击破 5942.51×3（cut=60）
    const ult = evsOf(r, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && Math.abs(e.time - 312.5) < 0.01)[0];
    expect(ult.note).toEqual(expect.arrayContaining(['dhUlt']));
    const ultHits = ult.hitSeqs!.map((s) => hitOf(r, s));
    for (const h of ultHits.filter((x) => x.skillCode === 'dahlia.ult')) close(h.total, 1301.261829652997, 0.01);
    for (const h of ultHits.filter((x) => x.skillCode === 'dahlia.ult.dh.sb')) close(h.total, 5942.507886435333, 0.01);
  });

  it('B 秘技：开局开结界+超击破 pocket → 首段主动攻击后消费', () => {
    const r = run('B', () => mkCfg(0, { techniques: true }));
    close(r.report.totalDamage, 1047672.8923552076, 0.5);
    const tech = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'technique')[0];
    close(tech.time, 0, 0.01);
    expect(tech.note).toEqual(expect.arrayContaining(['technique', 'dhTech', 'dhTech']));
    close(tech.energyAfter ?? 0, 130, 0.01);
    expect(tech.spAfter).toBe(3);
    expect(tech.hitSeqs).toBeUndefined();
    // 终招同刻 t=0（能量已满）：直伤+结界超击破
    const ult = evsOf(r, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && Math.abs(e.time - 0) < 0.01)[0];
    expect(ult.note).toEqual(expect.arrayContaining(['dhUlt']));
    const ultSb = ult.hitSeqs!.map((s) => hitOf(r, s)).filter((h) => h.skillCode === 'dahlia.ult.dh.sb');
    expect(ultSb).toHaveLength(3);
    for (const h of ultSb) close(h.total, 5942.507886435333, 0.01);
    // 首段主动攻击（战技 t=104.17）：pocket 超击破 0.6×30 → total=1782.75 单发
    const skill = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'skill')[0];
    expect(skill.note).toEqual(expect.arrayContaining(['dhTechSB', 'dhSkill']));
    expect(skill.note!.filter((n) => n === 'dhTechSB')).toHaveLength(1);
    const techSb = skill.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode === 'dahlia.tech.sb');
    expect(techSb).toBeDefined();
    close(techSb!.total, 1782.7523659305996, 0.01);
  });

  it('C E2：全抗-20%+入场败谢（resist=1.2 / defense=0.5258）', () => {
    const r = run('C', () => mkCfg(2));
    close(r.report.totalDamage, 1059381.2430806297, 0.5);
    // dh note flush 到 dahlia 终招 t=0 事件（note=[dhE2,dhUlt]）
    const ult0 = evsOf(r, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && e.time < 0.01)[0];
    expect(ult0.note).toEqual(expect.arrayContaining(['dhE2']));
    // t=0 终招直伤 resist=1.2（全抗-20%）、defense=0.5258（败谢 defRed）
    const h0 = hitOf(r, ult0.hitSeqs![0]);
    close(h0.factors.find((f) => f.key === 'resist')!.value, 1.2, 0.001);
    close(h0.factors.find((f) => f.key === 'defense')!.value, 0.5257623554153523, 0.001);
    close(h0.total, 1561.5141955835963, 0.01);
    // 战技 t=104.17：2498.42（resist1.2 def0.5258）
    const skill = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'skill')[0];
    const h = hitOf(r, skill.hitSeqs![0]);
    close(h.total, 2498.422712933754, 0.01);
    // 第二战技 sb 3565.50（E2 修正后的未破韧转化超击破）
    const skill2 = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'skill')[1];
    const sb = hitOf(r, skill2.hitSeqs!.find((s) => hitOf(r, s).skillCode === 'dahlia.skill.dh.sb')!);
    close(sb.total, 3565.5047318611996, 0.01);
    // 普攻 2186.12 + basic.sb 3565.50；终招 t=312.50 1561.51×3 + 7131.01×3
    const basic = evsOf(
      r,
      (e) => e.unitId === 'dahlia' && e.action === 'basic' && Math.abs(e.time - 312.5) < 0.01,
    )[0];
    close(hitOf(r, basic.hitSeqs![0]).total, 1561.5141955835963, 0.01);
    close(hitOf(r, basic.hitSeqs![1]).total, 3565.5047318611996, 0.01);
    const ult = evsOf(r, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && Math.abs(e.time - 312.5) < 0.01)[0];
    const ultHits = ult.hitSeqs!.map((s) => hitOf(r, s));
    for (const x of ultHits.filter((y) => y.skillCode === 'dahlia.ult')) close(x.total, 1561.5141955835963, 0.01);
    for (const x of ultHits.filter((y) => y.skillCode === 'dahlia.ult.dh.sb')) close(x.total, 7131.009463722399, 0.01);
  });

  it('D E4：E2+E4 defense 0.5319 / lv12 终招 base 2700 / 随击 talent 段', () => {
    const r = run('D', () => mkCfg(4));
    close(r.report.totalDamage, 1243462.538945322, 0.5);
    // t=0 终招（lv12 参数 base2700；E2+E4 → def0.5319 resist1.2）
    const ult0 = evsOf(r, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && e.time < 0.01)[0];
    expect(ult0.note).toEqual(expect.arrayContaining(['dhE2', 'dhUlt']));
    const h0 = hitOf(r, ult0.hitSeqs![0]);
    close(baseOf(r, ult0.hitSeqs![0]), 2700, 0.01);
    close(h0.factors.find((f) => f.key === 'defense')!.value, 0.5319148936170213, 0.001);
    close(h0.total, 1706.1702127659576, 0.01);
    // 战技 t=104.17：2830.98（def0.5319）
    const skill = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'skill')[0];
    close(hitOf(r, skill.hitSeqs![0]).total, 2830.9787234042556, 0.01);
    // 随击（dahlia.talent 段）在 E4 场景真实存在：t=222.22 jy basic 530.81+1212.03
    const jyBasic = evsOf(
      r,
      (e) => e.unitId === 'jingyuan' && e.action === 'basic' && Math.abs(e.time - 222.22) < 0.01,
    )[0];
    const jyBasicHits = jyBasic.hitSeqs!.map((s) => hitOf(r, s));
    close(jyBasicHits.find((x) => x.skillCode === 'dahlia.talent')!.total, 530.808510638298, 0.01);
    close(jyBasicHits.find((x) => x.skillCode === 'dahlia.talent.dh.sb')!.total, 1212.0288510638297, 0.01);
    // 终招 t=312.50：1910.91×3 + 8080.19×3
    const ult = evsOf(r, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && Math.abs(e.time - 312.5) < 0.01)[0];
    const ultHits = ult.hitSeqs!.map((s) => hitOf(r, s));
    for (const x of ultHits.filter((y) => y.skillCode === 'dahlia.ult')) close(x.total, 1910.9106382978728, 0.01);
    for (const x of ultHits.filter((y) => y.skillCode === 'dahlia.ult.dh.sb')) close(x.total, 8080.192340425533, 0.01);
  });

  it('E 破韧场景（maxToughness 60）：击破/超击破/DoT 基数直测', () => {
    const r = run('E', () =>
      mkCfg(0, { monster: { ...MON, maxToughness: 60, hp: 50_000_000 } }),
    );
    close(r.report.totalDamage, 952359.8735663173, 0.5);
    // 进战终招 t=0：直伤 1301.26 + 立刻破韧 → dahlia.ult.break 3961.67（击破基数 3767.55，按实际破韧者击破特攻）
    const ult0 = evsOf(r, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && e.time < 0.01)[0];
    const ult0Hits = ult0.hitSeqs!.map((s) => hitOf(r, s));
    close(ult0Hits.find((x) => x.skillCode === 'dahlia.ult')!.total, 1301.261829652997, 0.01);
    close(ult0Hits.find((x) => x.skillCode === 'dahlia.ult.break')!.total, 3961.6719242902213, 0.01);
    // 战技 t=104.17：并入事件 2313.35/1188.50(skill.sb)/2971.25(skill.break base 3767.55)
    // 2026-11-06 破韧窗口改造：动作序列随破韧窗口变化，取「第一个含 dh.sb 的战技事件」
    const skill = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'skill').find((e) =>
      e.hitSeqs!.map((s) => hitOf(r, s)).some((h) => h.skillCode === 'dahlia.skill.dh.sb'),
    )!;
    expect(skill).toBeDefined();
    expect(skill.note).toEqual(expect.arrayContaining(['dhSkill']));
    const skillHits = skill.hitSeqs!.map((s) => hitOf(r, s));
    close(skillHits.find((x) => x.skillCode === 'dahlia.skill')!.total, 2082.0189274447953, 0.01);
    // 2026-11-06 破韧窗口改造：结界转化改按「实际削韧段」，值随破韧窗口重锚为 2971.25
    close(skillHits.find((x) => x.skillCode === 'dahlia.skill.dh.sb')!.total, 2971.2539432176663, 0.01);
    // 2026-11-06 裁定③：破韧窗口内不再重复击破 → 本场只有开场那一次 dahlia.ult.break（上一行已锁），
    // 原来「战技再破一次」的 skill.break 断言随旧口径删除。
    // 随击破韧段（talent 触发时目标已破韧）：talent.break 与击破同值
    const talentBreak = r.hits.find((x) => x.skillCode === 'dahlia.talent.break');
    // 新窗口模型下随击段不一定再触发击破；若触发则与击破同值
    if (talentBreak) close(talentBreak.total, 3961.6719242902213, 0.01);
    // DoT：破韧后统一按实际破韧者击破特攻，dot.burn=1980.84；dot.shock=3961.67
    const dots = r.hits.filter((h) => h.skillCode === 'dot.burn' || h.skillCode === 'dot.shock');
    const burn = dots.filter((h) => h.skillCode === 'dot.burn');
    for (const h of burn) close(h.total, 1980.8359621451107, 0.01);
    close(dots.find((h) => h.skillCode === 'dot.shock')!.total, 3961.6719242902213, 0.01);
  });

  it('F E1 破韧场景：E1 全部 dh.sb ×1.4（1663.90/2495.85/4991.71）', () => {
    const r = run('F', () =>
      mkCfg(1, { monster: { ...MON, maxToughness: 60, hp: 50_000_000 } }),
    );
    close(r.report.totalDamage, 1044973.8595022118, 0.5);
    // 战技.sb=1663.90（E0 1188.50×1.4）；break/dot 与 E0 全同值
    // 2026-11-06 破韧窗口改造：同样取「第一个含 dh.sb 的战技事件」
    const skill = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'skill').find((e) =>
      e.hitSeqs!.map((s) => hitOf(r, s)).some((h) => h.skillCode === 'dahlia.skill.dh.sb'),
    )!;
    expect(skill).toBeDefined();
    const skillHits = skill.hitSeqs!.map((s) => hitOf(r, s));
    // 结界转化（未破韧段，ratio 1.0）不吃 E1 → 与 E0 同值
    close(skillHits.find((x) => x.skillCode === 'dahlia.skill.dh.sb')!.total, 2971.2539432176663, 0.01);
    // E1 的 ×1.4 只作用在共舞者（0.6→0.84）分支：随击段 499.2 = 356.57×1.4
    const talentSb = r.hits.find((x) => x.skillCode === 'dahlia.talent.dh.sb')!;
    expect(talentSb).toBeDefined();
    close(talentSb.total, 1188.5015772870665, 0.01);
    // 2026-11-06 裁定③：破韧窗口内不再重复击破 → 无 dahlia.skill.break（已由开场 ult 破韧）
    // jingyuan 终招 sb 4991.71（3565.50×1.4）
    const jyUlt = evsOf(r, (e) => e.unitId === 'jingyuan' && e.kind === 'ult')[0];
    const jyUltSb = jyUlt.hitSeqs!.map((s) => hitOf(r, s)).find((x) => x.skillCode === 'jingyuan.ult.dh.sb');
    expect(jyUltSb).toBeDefined();
    close(jyUltSb!.total, 4991.706624605679, 0.01);
    // 普攻的结界转化段（新窗口模型下按「实际削韧段」重锚）
    const basic = evsOf(r, (e) => e.unitId === 'dahlia' && e.action === 'basic')[0];
    const basicSb = basic.hitSeqs!.map((s) => hitOf(r, s)).find((h) => h.skillCode.endsWith('.dh.sb'));
    expect(basicSb).toBeDefined();
    close(basicSb!.total, 2971.2539432176663, 0.01);
  });

  it('G point08：新弱点触发速度/固定削韧/回能', () => {
    const short = run('G-short', () =>
      mkCfg(0, {
        monster: { ...MON, weaknesses: ['Physical'] as Element[] },
        rounds: 1,
        maxTime: 1,
      }),
    );
    close(short.report.totalDamage, 3903.7854889589908, 0.5);
    const ult0 = evsOf(short, (e) => e.unitId === 'dahlia' && e.kind === 'ult' && e.time < 0.01)[0];
    close(ult0.energyAfter ?? 0, 18, 0.01); // 5 + 130×10%
    expect(ult0.hitSeqs).toHaveLength(3);
    // 终招 60 削韧 + point08 固定 20
    for (const mon of short.finalState.monsters!) close(mon.toughness, 2920, 0.01);

    const full = run('G-full', () =>
      mkCfg(0, { monster: { ...MON, weaknesses: ['Physical'] as Element[] } }),
    );
    close(full.report.totalDamage, 834339.8858895913, 0.5);
    const skills = evsOf(full, (e) => e.unitId === 'dahlia' && e.action === 'skill');
    close(skills[0].time, 80.12820512820512, 0.01); // spd 96→124.8
    close(skills[0].energyAfter ?? 0, 48, 0.01);
    close(skills[1].time, 160.25641025641025, 0.01);
    close(skills[1].energyAfter ?? 0, 93, 0.01);
  });

  it('H point08 固定削韧可触发击破', () => {
    const r = run('H', () =>
      mkCfg(0, {
        monster: { ...MON, weaknesses: ['Physical'] as Element[], maxToughness: 70, hp: 50_000_000 },
        rounds: 1,
        maxTime: 1,
      }),
    );
    close(r.report.totalDamage, 16779.219242902214, 0.5);
    const breaks = r.hits.filter((h) => h.skillCode === 'dahlia.point08.break');
    expect(breaks).toHaveLength(3);
    for (const h of breaks) {
      expect(h.kind).toBe('breakTrigger');
      close(h.total, 4291.811251314407, 0.01);
    }
    expect(new Set(breaks.map((h) => h.target))).toEqual(new Set(['monster1', 'monster2', 'monster3']));
    for (const mon of r.finalState.monsters!) {
      expect(mon.broken).toBe(true);
      // 2026-11-06 裁定③：破韧不再瞬间回满韧条（敌方恢复回合才回满）→ 终态 0
      close(mon.toughness, 0, 0.01);
    }
  });

  it('I point06：队友护盾刷新为 3 回合', () => {
    const r = run('I', () =>
      mkCfg(0, {
        techniques: true,
        rounds: 1,
        maxTime: 1,
        members: [
          { id: 'dahlia', panel: DAHLIA_PANEL, eidolonLevel: 0 },
          { id: 'tenghuang', panel: JY_PANEL, eidolonLevel: 0 },
          { id: 'jingyuan', panel: JY_PANEL, eidolonLevel: 0 },
        ],
      }),
    );
    const techs = evsOf(r, (e) => e.action === 'technique');
    const p06Of = (e: Ev) =>
      e.buffs?.['jingyuan']?.find((b) => b.labelKey === 'dahliaP06');
    const before = p06Of(techs.find((e) => e.unitId === 'dahlia')!);
    expect(before?.duration).toBe(1);
    const after = p06Of(techs.find((e) => e.unitId === 'tenghuang')!);
    expect(after).toBeDefined();
    expect(after!.key).toBe('breakEffect');
    expect(after!.source).toBe('dahlia');
    close(after!.value, 0.5, 1e-9);
    expect(after!.duration).toBe(3);
  });
});
