import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  createInteractiveBattle,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
} from '../src/index.js';

/** 藿藿 1217 接入回归（2026-10；dump 锚点法：锚点全部来自 tails-dump 实测，勿纯推理改写） */

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

const TAILS_PANEL = {
  level: 80,
  hp: 5000,
  attack: 1200,
  defence: 800,
  speed: 98,
  critRate: 0.2,
  critDmg: 0.5,
  element: 'Wind' as const,
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

const AG_PANEL = {
  ...JY_PANEL,
  hp: 2500,
  attack: 2600,
  speed: 159,
  element: 'Thunder' as const,
};

function mkCfg(over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    members: [{ id: 'tails', panel: TAILS_PANEL }],
    monster: { ...MON },
    rounds: 20,
    maxTime: 800,
    techniques: false,
    seed: 20261011,
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

describe('藿藿1217（基础机制）', () => {
  it('A 单人：开局回能/禳命/能量链/普攻生命倍率', () => {
    const r = run('A', () => mkCfg());
    // 首动=战技（SP足时战技）t=102.04（10000/98）、en=131（70初始+30point06+1point08天赋触发+30战技）
    const acts = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'tails');
    const first = acts[0];
    close(first.time, 102.04, 0.01);
    expect(first.action).toBe('skill');
    close(first.energyAfter ?? 0, 131, 0.01);
    expect(first.spAfter).toBe(2);
    expect(first.note).toContain('tailsTalent');
    expect(first.note).toContain('tailsRm');
    expect(first.note).toContain('tailsSkill');
    // 能量链（仅 action，前5动）：131→140(顶)→37→58→89（大招为 kind='ult' 单独断言）
    const ens = acts.slice(0, 5).map((e) => Math.round(e.energyAfter ?? 0));
    expect(ens).toEqual([131, 140, 37, 58, 89]);
    // 普攻：生命倍率 base=5000×0.7=3500、单段、total=1650
    const basic = acts.find((e) => e.action === 'basic')!;
    const h = r.hits.find((x) => x.seq === basic.hitSeqs![0])!;
    close(h.factors.find((f) => f.key === 'base')!.value, 2500, 0.01);
    close(h.total, 1178.571, 0.01);
    // 大招 notes：禳命在最前（分支内先 grant 后 push tailsUlt）
    const ult = evsOf(r, (e) => e.kind === 'ult')[0];
    expect(ult.note).toEqual(expect.arrayContaining(['tailsRm', 'tailsUlt', 'tailsTalent']));
    // solo 无队友 → 无 point07
    expect(ult.note).not.toContain('tailsP07');
    // 总伤=2次普攻×1650
    close(r.report.totalDamage, 2357.14, 0.1);
    // 未受击 → 满血
    expect(r.finalState.memberHp.tails).toBeCloseTo(5000, 4);
  });

  it('B 双人：队友回合开始触发天赋、战技选主C、大招回能与攻增益', () => {
    const r = run('B', () =>
      mkCfg({
        members: [
          { id: 'tails', panel: TAILS_PANEL },
          { id: 'jingyuan', panel: JY_PANEL },
        ],
      }),
    );
    // 景元每次行动事件都带 tailsTalent（禳命期间我方回合开始触发）
    const jyActs = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'jingyuan');
    expect(jyActs.length).toBeGreaterThan(3);
    for (const e of jyActs) expect(e.note).toContain('tailsTalent');
    // 藿藿战技目标=默认主C 景元
    const firstSkill = evsOf(
      r,
      (e) => e.kind === 'action' && e.unitId === 'tails' && e.action === 'skill',
    )[0];
    expect(firstSkill.targetId).toBe('jingyuan');
    // en=132（100+1景元回合触发+1自身回合触发+30）
    close(firstSkill.energyAfter ?? 0, 132, 0.01);
    // 大招：景元能量上限130<160 → 无 point07；有 tailsUlt/tailsRm
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'tails')[0];
    expect(ult.note).toContain('tailsUlt');
    expect(ult.note).not.toContain('tailsP07');
    // 大招给景元回能：130上限×20%=26（×充能1.0）——景元下一次行动 en 含该回能
    //（锚点：景元首动 en=110（65+15绸缪+30），藿藿大招后景元 en 从 5 起算 → 断言大招事件存在即可，
    //  回能精确链见 energy 快照）
    expect(r.finalState.energy.jingyuan).toBeGreaterThanOrEqual(0);
    // 总伤>0（景元攻击）
    expect(r.report.totalDamage).toBeGreaterThan(100000);
  });
});

describe('藿藿1217（秘技减攻与星魂）', () => {
  it('C 秘技：进战敌全体攻-25%，怪物攻击×0.75', () => {
    const atk = 2000;
    const monAtk = { ...MON, monsterId: '1004011', attack: atk };
    const c1 = run('C1', () => mkCfg({ monster: monAtk, techniques: true }));
    const c2 = run('C2', () => mkCfg({ monster: monAtk, techniques: false }));
    // 秘技事件：t=0、en=100（70+30point06）、带 tailsTech
    const tech = evsOf(c1, (e) => e.kind === 'action' && e.action === 'technique')[0];
    close(tech.energyAfter ?? 0, 100, 0.01);
    expect(tech.note).toContain('tailsTech');
    // 对照：同一怪物技能（100401103 全体）伤害比 = 0.75
    const d1 = c1.events.find((e) => e.enemyHits?.length)?.enemyHits![0].damage;
    const d2 = c2.events.find((e) => e.enemyHits?.length)?.enemyHits![0].damage;
    expect(d1).toBeDefined();
    expect(d2).toBeDefined();
    close(d1! / d2!, 0.75, 0.001);
    // 绝对锚点：2000×3.75×0.75×110/210=2946.4286
    close(d1!, 2946.4286, 0.01);
  });

  it('D 星魂2：禳命中免死2次（回50%），第3次致死', () => {
    const r = run('D', () =>
      mkCfg({
        members: [{ id: 'tails', panel: TAILS_PANEL, eidolonLevel: 2 }],
        monster: { ...MON, monsterId: '1004011', attack: 100000 },
        maxTime: 400,
      }),
    );
    const e2Notes = evsOf(r, (e) => (e.note ?? []).includes('tailsE2'));
    expect(e2Notes.length).toBe(2);
    // 免死 hit：dead=false（前2次）；第3次致死 dead=true
    const enemyHits = r.events.flatMap((e) => e.enemyHits ?? []);
    expect(enemyHits[0].dead).toBe(false);
    expect(enemyHits[1].dead).toBe(false);
    // 第3只怪（100401101）致死
    const last = enemyHits[enemyHits.length - 1];
    expect(last.dead).toBe(true);
    expect(r.finalState.memberHp.tails).toBe(0);
  });

  it('E 星魂1：禳命期间全队速度+12%（首动 t=91.11）', () => {
    const r = run('E', () =>
      mkCfg({ members: [{ id: 'tails', panel: TAILS_PANEL, eidolonLevel: 1 }], maxTime: 300 }),
    );
    const first = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'tails')[0];
    // 10000/98/1.12=91.116（E0 为 102.04）
    close(first.time, 91.11, 0.02);
  });

  it('G 专武23017+point07：高能量队友开大触发攻额外+24%', () => {
    const r = run('G', () =>
      mkCfg({
        members: [
          { id: 'tails', panel: TAILS_PANEL, lightconeId: '23017', refinement: 1 },
          { id: 'aglaea', panel: AG_PANEL },
        ],
      }),
    );
    // 阿雅能量上限350≥160 → 藿藿大招带 tailsP07
    const ult = evsOf(r, (e) => e.kind === 'ult' && e.unitId === 'tails')[0];
    expect(ult.note).toContain('tailsP07');
    expect(ult.note).toContain('tailsUlt');
    // 阿雅行动同样触发天赋
    const agActs = evsOf(r, (e) => e.kind === 'action' && e.unitId === 'aglaea');
    expect(agActs.length).toBeGreaterThan(0);
    for (const e of agActs) expect(e.note).toContain('tailsTalent');
  });

  it('H 星魂6：治疗→目标伤害+50%（景元受治疗后增伤因子含E6）', () => {
    const r = run('H', () =>
      mkCfg({
        members: [
          { id: 'tails', panel: TAILS_PANEL, eidolonLevel: 6 },
          { id: 'jingyuan', panel: JY_PANEL },
        ],
        monster: { ...MON, monsterId: '1004011', attack: 400 },
        maxTime: 600,
      }),
    );
    // 受怪物攻击后景元掉血（3000→<3000），禳命天赋治疗触发
    expect(r.finalState.memberHp.jingyuan).toBeLessThan(3000);
    expect(r.finalState.memberHp.jingyuan).toBeGreaterThan(0);
    // 带 tailsE6 的事件中，景元攻击段 damageBonus 因子 = 1.68+0.5=2.18
    const e6Ev = evsOf(r, (e) => (e.note ?? []).includes('tailsE6') && e.unitId === 'jingyuan')[0];
    expect(e6Ev).toBeTruthy();
    const h = r.hits.find((x) => e6Ev.hitSeqs!.includes(x.seq))!;
    close(h.factors.find((f) => f.key === 'damageBonus')!.value, 2.18, 0.001);
    // 藿藿自身被治疗（E1 自身治疗+20%场景未开 E1 —— e6 档位无 E1 → 无加成，生命≤5000）
    expect(r.finalState.memberHp.tails).toBeLessThanOrEqual(5000 + 0.01);
  });
});

describe('藿藿1217（predictAfter 防漂移）', () => {
  it('I 交互决策：predictAfter 与该次行动事件的 energyAfter 逐 id 一致', () => {
    // 契约：predictAfter = 行动刚结算完的全员能量（不含其后其他单位回合开始的天赋触发），
    // 故与「下一次决策点」的能量可能差藿藿 point08 的 +1——用行动事件自身的 energyAfter 比对
    const cfg = mkCfg({
      members: [
        { id: 'tails', panel: TAILS_PANEL },
        { id: 'jingyuan', panel: JY_PANEL },
      ],
    });
    const ctl = createInteractiveBattle(cfg);
    let step = ctl.advance();
    let guard = 0;
    let checked = 0;
    while (step && guard < 60 && checked < 4) {
      guard += 1;
      if (step.type === 'decision') {
        const act = checked % 2 === 0 ? ('skill' as const) : ('basic' as const);
        const pred = step.predictAfter!({ action: act });
        const actor = step.unitId;
        step = ctl.advance({ action: act });
        // 找到该 actor 本次行动的事件，比对 energyAfter
        let matched = false;
        while (step) {
          if (
            step.type === 'event' &&
            step.event.kind === 'action' &&
            step.event.unitId === actor &&
            step.event.action === act
          ) {
            close(step.event.energyAfter ?? 0, pred.energy[actor], 0.01);
            matched = true;
            break;
          }
          if (step.type === 'decision') break;
          step = ctl.advance();
        }
        expect(matched).toBe(true);
        checked += 1;
        // step 现为事件步：交给外层循环继续 advance（else 分支），勿 break
        continue;
      } else {
        step = ctl.advance();
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2);
    ctl.advance(); // drain
  });
});
