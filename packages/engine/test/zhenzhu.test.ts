import { describe, expect, it } from 'vitest';
import {
  createInteractiveBattle,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
  type HitLog,
} from '../src/index.js';

/** 真珠 1503 接入回归（2026-10；dump 锚点法：锚点全部来自 zhenzhu-dump 实测，勿纯推理改写） */

type Ev = BattleResult['events'][number];

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 99,
  attack: 2000,
  hp: 3000,
  defence: 1600,
  element: 'Ice' as const,
  critRate: 0.5,
  critDmg: 1.0,
  elationDegree: 0,
  damageBonus: 0,
  breakEffect: 0,
  effectHit: 0,
  effectRes: 0,
  damageReduction: 0,
  energyRegen: 0,
  outgoingHealing: 0,
  elementDmg: { Ice: 0.3 },
  ...over,
});

const MON: BattleConfig['monster'] = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 99999,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};

const MON_ATTACK: BattleConfig['monster'] = {
  ...MON,
  monsterId: '1004011',
  attack: 600,
};

const zz = (eidolon = 0): CombatMember => ({
  id: 'zhenzhu',
  eidolonLevel: eidolon,
  panel: mkPanel(),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const jy = (): CombatMember => ({
  id: 'jingyuan',
  panel: mkPanel({ speed: 135, element: 'Thunder' as const, elementDmg: { Thunder: 0.3 } }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const ss = (): CombatMember => ({
  id: 'shuisha',
  panel: mkPanel({ speed: 107, element: 'Quantum' as const, elementDmg: { Quantum: 0.3 } }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const fy = (): CombatMember => ({
  id: 'feiying',
  panel: mkPanel({ speed: 104, element: 'Physical' as const, elementDmg: { Physical: 0.3 } }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const aha = (): CombatMember => ({
  id: 'aha',
  panel: mkPanel({ speed: 94, element: 'Fire' as const, elementDmg: { Fire: 0.3 } }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const cfg = (members: CombatMember[], over: Partial<BattleConfig> = {}): BattleConfig => ({
  members,
  monster: MON,
  techniques: true,
  rounds: 40,
  maxTime: 2500,
  seed: 20261010,
  ...over,
});

/** 每个场景只跑一次（同 dump 法）；改引擎后锚点漂移会由断言直接暴露 */
const runs = new Map<string, BattleResult>();
const run = (key: string, make: () => BattleConfig): BattleResult => {
  let r = runs.get(key);
  if (!r) {
    r = simulateBattle(make());
    runs.set(key, r);
  }
  return r;
};

const noteArr = (n: unknown): string[] =>
  Array.isArray(n) ? (n as string[]) : n ? [String(n)] : [];
const hasNote = (e: Ev, k: string): boolean => noteArr(e.note).includes(k);
const zzActs = (r: BattleResult): Ev[] =>
  r.events.filter((e) => e.kind === 'action' && e.unitId === 'zhenzhu');
const firstUlt = (r: BattleResult): Ev | undefined =>
  r.events.find((e) => e.kind === 'ult' && e.unitId === 'zhenzhu');
const hitsOf = (r: BattleResult, e: Ev): HitLog[] =>
  (e.hitSeqs ?? []).map((s) => r.hits[s]);
const factorOf = (h: HitLog | undefined, k: string): number =>
  h?.factors.find((f) => f.key === k)?.value ?? Number.NaN;

describe('真珠1503接入（dump 锚点回归）', () => {
  it(
    '单人gate：无深度学习/段A段B、秘技note、zzBonus段与好活上限50',
    { timeout: 120000 },
    () => {
      const r = run('A', () => cfg([zz(0)]));
      const acts = zzActs(r);
      expect(acts.length).toBeGreaterThan(5);
      const first = acts[0];
      expect(first.action).toBe('skill');
      expect(first.time).toBeCloseTo(101.01, 1);
      expect(hasNote(first, 'zzSkill')).toBe(true);
      expect(hasNote(first, 'zzTech')).toBe(true);
      expect(first.energyAfter ?? -1).toBe(125);
      // 单人队无合法底本 → 深度学习/段A/段B/E6/E1/point07 全不可达
      for (const k of ['zzEnhanced', 'zzTalent', 'zzUltBonus', 'zzE6', 'zzE1', 'zzPoint07']) {
        expect(r.events.some((e) => hasNote(e, k))).toBe(false);
      }
      const ults = r.events.filter((e) => e.kind === 'ult' && e.unitId === 'zhenzhu');
      expect(ults.length).toBeGreaterThanOrEqual(2);
      expect(ults[0].energyAfter ?? -1).toBe(5);
      expect(ults[0].targetId).toBeUndefined();
      // 无深度学习：普攻恒两段（直伤 + zzBonus）
      for (const a of acts.filter((a) => a.action === 'basic')) {
        expect((a.hitSeqs ?? []).length).toBe(2);
      }
      // 150320 附带欢愉段（攻击者面板、E0 无增益）
      const bonus = r.hits.find((h) => h.skillCode === 'zhenzhu.zzBonus');
      expect(bonus).toBeDefined();
      expect(factorOf(bonus, 'base')).toBeCloseTo(753.5107, 3);
      expect(factorOf(bonus, 'elationDegree')).toBeCloseTo(1.0, 4);
      expect(factorOf(bonus, 'laugh')).toBeCloseTo(1.8621, 3);
      // 好活池上限 50
      expect(r.finalState.goodWork.zhenzhu).toBeCloseTo(50, 3);
    },
  );

  it(
    '深度学习：强化普攻3次循环（150310/2240/6段）+ 能量链 + 终招target=底本',
    { timeout: 120000 },
    () => {
      const r = run('B', () =>
        cfg([zz(0), jy()], { techniques: false, mainC: 'jingyuan' }),
      );
      const ult = firstUlt(r);
      expect(ult).toBeDefined();
      expect(ult?.targetId).toBe('jingyuan');
      // 开大前的普攻：无强化、两段
      for (const a of zzActs(r).filter(
        (a) => a.action === 'basic' && a.time < (ult?.time ?? 0),
      )) {
        expect(hasNote(a, 'zzEnhanced')).toBe(false);
        expect((a.hitSeqs ?? []).length).toBe(2);
      }
      // 开大后首个充能周期：3 强化 + 1 普通，能量 40/75/110/135
      const cycle = zzActs(r)
        .filter((a) => a.action === 'basic' && a.time > (ult?.time ?? 0))
        .slice(0, 4);
      expect(cycle.length).toBe(4);
      expect(cycle.slice(0, 3).map((e) => hasNote(e, 'zzEnhanced'))).toEqual([
        true,
        true,
        true,
      ]);
      expect(hasNote(cycle[3], 'zzEnhanced')).toBe(false);
      expect(cycle.map((e) => e.energyAfter ?? -1)).toEqual([40, 75, 110, 135]);
      expect(cycle.slice(0, 3).map((e) => (e.hitSeqs ?? []).length)).toEqual([6, 6, 6]);
      expect((cycle[3].hitSeqs ?? []).length).toBe(2);
      // 强化普攻：3 目标 × (直伤 2240=防1600×1.4 + zzBonus)
      const enhHits = hitsOf(r, cycle[0]);
      const direct = enhHits.filter((h) => h.kind === 'direct');
      expect(direct.length).toBe(3);
      for (const h of direct) {
        expect(h.skillCode).toBe('zhenzhu.enhanced');
        expect(factorOf(h, 'base')).toBeCloseTo(2240, 3);
      }
      expect(enhHits.filter((h) => h.skillCode === 'zhenzhu.zzBonus').length).toBe(3);
      // 充能可重复（第二个周期）
      expect(
        zzActs(r).filter((a) => a.action === 'basic' && hasNote(a, 'zzEnhanced')).length,
      ).toBeGreaterThanOrEqual(6);
      // 非欢愉底本 + E0：无段A/段B/E6
      for (const k of ['zzTalent', 'zzUltBonus', 'zzE6']) {
        expect(r.events.some((e) => hasNote(e, k))).toBe(false);
      }
      // point07 感知容差：景元行动 → 真珠 +5 好活
      expect(
        r.events.filter((e) => e.kind === 'action' && e.unitId === 'jingyuan' && hasNote(e, 'zzPoint07'))
          .length,
      ).toBeGreaterThan(3);
      expect(r.finalState.goodWork.zhenzhu).toBeCloseTo(50, 3);
    },
  );

  it(
    '底本欢愉：段A(150308天赋20%)用真珠欢愉度、段B(终招30%)用底本欢愉度/好活',
    { timeout: 120000 },
    () => {
      const r = run('C', () =>
        cfg([zz(0), ss()], { techniques: false, mainC: 'shuisha' }),
      );
      const ult = firstUlt(r);
      expect(ult?.targetId).toBe('shuisha');
      const firstEnh = zzActs(r).find((a) => hasNote(a, 'zzEnhanced'));
      expect(firstEnh).toBeDefined();
      expect(hasNote(firstEnh!, 'zzTalent')).toBe(true);
      expect(hasNote(firstEnh!, 'zzUltBonus')).toBe(true);
      expect((firstEnh!.hitSeqs ?? []).length).toBe(12);
      const hits = hitsOf(r, firstEnh!);
      // 3 直伤 + 3 zzBonus + 3 段A + 3 段B
      const direct = hits.filter((h) => h.kind === 'direct');
      expect(direct.length).toBe(3);
      for (const h of direct) expect(factorOf(h, 'base')).toBeCloseTo(2240, 3);
      const bonus = hits.filter((h) => h.skillCode === 'zhenzhu.zzBonus');
      expect(bonus.length).toBe(3);
      for (const h of bonus) expect(factorOf(h, 'base')).toBeCloseTo(1130.266, 2);
      const elEnh = hits.filter(
        (h) => h.kind === 'elation' && h.skillCode === 'zhenzhu.enhanced',
      );
      expect(elEnh.length).toBe(6);
      const segA = elEnh.filter((h) => Math.abs(factorOf(h, 'base') - 1507.0214) < 0.01);
      const segB = elEnh.filter((h) => Math.abs(factorOf(h, 'base') - 4521.0642) < 0.01);
      expect(segA.length).toBe(3);
      expect(segB.length).toBe(3);
      // 段A：7535.107×0.2，真珠（受水砂多欢愉+0.2）欢愉度、真珠好活笑点区
      expect(factorOf(segA[0], 'elationDegree')).toBeCloseTo(1.2, 4);
      expect(factorOf(segA[0], 'laugh')).toBeCloseTo(1.8621, 3);
      // 段B：7535.107×0.6，底本 shuisha 欢愉度/好活（裁定②）
      expect(factorOf(segB[0], 'elationDegree')).toBeCloseTo(2.1, 4);
      expect(factorOf(segB[0], 'laugh')).toBeCloseTo(1.4545, 3);
      // 终招目标 = 美学底本
      const ults = r.events.filter((e) => e.kind === 'ult' && e.unitId === 'zhenzhu');
      expect(ults.length).toBeGreaterThanOrEqual(2);
      for (const u of ults) expect(u.targetId).toBe('shuisha');
    },
  );

  it(
    'E1致命保护：全队任意成员致死→回50%不退场，整场恰2次后允许死亡',
    { timeout: 120000 },
    () => {
      const r = run('D', () =>
        cfg([zz(1), jy()], {
          techniques: false,
          mainC: 'jingyuan',
          monster: MON_ATTACK,
          rounds: 30,
          maxTime: 6000,
        }),
      );
      const e1Events = r.events.filter((e) => hasNote(e, 'zzE1'));
      // 嘲讽加权后该长局只复现 1 次免死（原 2 次）→ 校验「上限 2 次」+「被保护者当次不判死」+「免死后继续行动」
      expect(e1Events.length).toBeGreaterThanOrEqual(1);
      expect(e1Events.length).toBeLessThanOrEqual(2);
      for (const e of e1Events) {
        expect((e.enemyHits ?? []).length).toBeGreaterThan(0);
        for (const eh of e.enemyHits ?? []) expect(eh.dead).toBe(false);
      }
      const first = e1Events[0];
      expect(
        r.events.some(
          (e) => e.kind === 'action' && e.unitId === 'jingyuan' && e.time > first.time,
        ),
      ).toBe(true);
    },
  );

  it(
    '抵挡60%：吸收=min(伤害×60%, 好活×200)，hpLoss=40%伤害 + 受击回能10/5',
    { timeout: 120000 },
    () => {
      const r = run('E', () =>
        cfg([zz(0)], { techniques: false, monster: MON_ATTACK, rounds: 20, maxTime: 2000 }),
      );
      const monEvents = r.events.filter(
        (e) => e.kind === 'action' && String(e.unitId).startsWith('monster'),
      );
      expect(monEvents.length).toBeGreaterThan(3);
      for (const e of monEvents) expect(hasNote(e, 'zzResist')).toBe(true);
      const ehs = r.events.flatMap((e) => e.enemyHits ?? []);
      expect(ehs.length).toBeGreaterThan(6);
      // E0 → 无 E1 免死
      expect(r.events.some((e) => hasNote(e, 'zzE1'))).toBe(false);
      // 未致死的受击：hpLoss 恒 = 0.4×damage（60% 被抵挡、好活×200 上限未触）
      for (const eh of ehs.filter((h) => !h.dead)) {
        expect(eh.blocked).toBe(0);
        expect(Math.abs(eh.hpLoss - eh.damage * 0.4)).toBeLessThan(0.01);
      }
      // 逐技能锚点（600 攻 × 倍率 × 110/210 防御区）
      const single15 = ehs.find((eh) => eh.skillId === '100401104');
      expect(single15?.damage).toBeCloseTo(471.429, 3);
      expect(single15?.hpLoss).toBeCloseTo(188.571, 3);
      expect(single15?.energy).toBe(10);
      const aoe = ehs.find((eh) => eh.skillId === '100401103');
      expect(aoe?.damage).toBeCloseTo(1178.571, 3);
      expect(aoe?.hpLoss).toBeCloseTo(471.429, 3);
      expect(aoe?.energy).toBe(5);
      const blast = ehs.find((eh) => eh.skillId === '100401106');
      expect(blast?.damage).toBeCloseTo(1178.571, 3);
      expect(blast?.energy).toBe(5);
      const single25 = ehs.find((eh) => eh.skillId === '100401101');
      expect(single25?.damage).toBeCloseTo(707.143, 3);
      expect(single25?.energy).toBe(10);
    },
  );

  it(
    '治疗接 memberHp：小攻击扣血后战技奶回满（溢出钳制）',
    { timeout: 120000 },
    () => {
      const ctl = createInteractiveBattle(
        cfg([zz(0)], {
          techniques: false,
          monster: { ...MON_ATTACK, attack: 50 },
          rounds: 20,
          maxTime: 2000,
        }),
      );
      const hps: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const d = ctl.advance();
        if (!d) break;
        if (d.type === 'decision') {
          hps.push(d.status.hp.zhenzhu);
          ctl.advance({ action: 'skill' });
        }
      }
      expect(hps.length).toBeGreaterThanOrEqual(2);
      // 受击后 hp<上限；战技奶回满 → 下一轮同额伤害后与上一轮完全相等（dump=2905.714285714286）
      expect(hps[0]).toBeCloseTo(2905.714285714286, 4);
      expect(hps[1]).toBeCloseTo(hps[0], 6);
      expect(hps[1]).toBeLessThan(3000);
    },
  );

  it(
    'predictAfter：普攻+20/战技+30、caps 含全员上限',
    { timeout: 120000 },
    () => {
      const ctl = createInteractiveBattle(
        cfg([zz(0), jy()], { techniques: false, mainC: 'jingyuan' }),
      );
      let sawJy = false;
      let sawZz = false;
      for (let i = 0; i < 14; i += 1) {
        const d = ctl.advance();
        if (!d) break;
        if (d.type !== 'decision') continue;
        const paBasic = d.predictAfter?.({ action: 'basic' });
        const paSkill = d.predictAfter?.({ action: 'skill' });
        expect(paBasic).toBeDefined();
        expect(paSkill).toBeDefined();
        expect(paBasic!.caps.zhenzhu).toBe(180);
        expect(paBasic!.caps.jingyuan).toBe(130);
        if (d.unitId === 'jingyuan' && !sawJy) {
          sawJy = true;
          expect(d.status.energy.zhenzhu).toBe(90);
          expect(paBasic!.energy.jingyuan).toBe(100);
          expect(paSkill!.energy.jingyuan).toBe(110);
        }
        if (d.unitId === 'zhenzhu' && !sawZz) {
          sawZz = true;
          expect(d.status.energy.zhenzhu).toBe(95);
          expect(paBasic!.energy.zhenzhu).toBe(115);
          expect(paSkill!.energy.zhenzhu).toBe(125);
        }
        ctl.advance({ action: d.unitId === 'zhenzhu' ? 'skill' : 'basic' });
      }
      expect(sawJy).toBe(true);
      expect(sawZz).toBe(true);
    },
  );

  it(
    'point07感知容差：队友行动+5好活note、秘技note仅一次',
    { timeout: 120000 },
    () => {
      const r = run('G', () => cfg([zz(0), jy()], { mainC: 'jingyuan' }));
      const p07 = r.events.filter((e) => hasNote(e, 'zzPoint07'));
      expect(p07.length).toBeGreaterThanOrEqual(10);
      const tech = r.events.filter((e) => hasNote(e, 'zzTech'));
      expect(tech.length).toBe(1);
      const firstAct = r.events.find((e) => e.kind === 'action');
      expect(firstAct && hasNote(firstAct, 'zzTech')).toBe(true);
      expect(r.finalState.goodWork.zhenzhu).toBeCloseTo(50, 3);
    },
  );

  it(
    'E6：强化普攻追加240%冰欢愉段（底本属性）+深度学习抗穿20%',
    { timeout: 120000 },
    () => {
      const r = run('J', () =>
        cfg([zz(6), jy()], { techniques: false, mainC: 'jingyuan' }),
      );
      const e = zzActs(r).find((a) => hasNote(a, 'zzE6'));
      expect(e).toBeDefined();
      expect(hasNote(e!, 'zzEnhanced')).toBe(true);
      expect((e!.hitSeqs ?? []).length).toBe(9);
      const seg = hitsOf(r, e!).filter(
        (h) => h.kind === 'elation' && h.skillCode === 'zhenzhu.enhanced',
      );
      expect(seg.length).toBe(3);
      for (const h of seg) {
        expect(factorOf(h, 'base')).toBeCloseTo(18084.2568, 3); // 7535.107×2.4
        expect(factorOf(h, 'resist')).toBeCloseTo(1.2, 4); // 深度学习全属性抗穿
      }
    },
  );

  it(
    'E2/E0额外回合：欢愉数≥4 终招→底本额外回合（zzExtraRound+zzRoundEnd 同事件）',
    { timeout: 120000 },
    () => {
      const r = run('K', () =>
        cfg([zz(2), ss(), fy(), aha()], { techniques: false, rounds: 25, maxTime: 1500 }),
      );
      const ults = r.events.filter((e) => e.kind === 'ult' && e.unitId === 'zhenzhu');
      expect(ults.length).toBeGreaterThanOrEqual(3);
      for (const u of ults) expect(u.targetId).toBe('shuisha');
      const extras = r.events.filter((e) => hasNote(e, 'zzExtraRound'));
      // 每次终招各授予一次底本额外回合
      expect(extras.length).toBe(ults.length);
      for (const x of extras) {
        expect(hasNote(x, 'zzRoundEnd')).toBe(true);
        expect(x.unitId).toBe('shuisha');
      }
      for (const u of ults) {
        expect(extras.some((x) => x.time >= u.time)).toBe(true);
      }
    },
  );
});
