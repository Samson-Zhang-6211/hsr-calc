import { describe, expect, it } from 'vitest';
import {
  createInteractiveBattle,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
  type HitLog,
} from '../src/index.js';

/** 开拓者欢愉形态 8009/8010 接入回归（2026-10-10；dump 锚点法，锚点来自 tb-dump 实测） */

type Ev = BattleResult['events'][number];

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 106,
  attack: 2000,
  hp: 5000,
  defence: 1200,
  element: 'Thunder' as const,
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
  elementDmg: { Thunder: 0.3 },
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

const tb = (
  eidolon = 0,
  id: 'trailblazer' | 'trailblazer2' = 'trailblazer',
): CombatMember => ({
  id,
  eidolonLevel: eidolon,
  panel: mkPanel(),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const aha = (eidolon = 0): CombatMember => ({
  id: 'aha',
  eidolonLevel: eidolon,
  panel: mkPanel({ speed: 94, element: 'Fire' as const, elementDmg: { Fire: 0.3 } }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const jy = (): CombatMember => ({
  id: 'jingyuan',
  panel: mkPanel({ speed: 135, element: 'Thunder' as const }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const cfg = (members: CombatMember[], over: Partial<BattleConfig> = {}): BattleConfig => ({
  members,
  monster: MON,
  techniques: true,
  rounds: 30,
  maxTime: 2500,
  seed: 20261010,
  ...over,
});

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
const tbActs = (r: BattleResult, id = 'trailblazer'): Ev[] =>
  r.events.filter((e) => e.kind === 'action' && e.unitId === id && e.action !== 'ahaMoment');
const tbUlt = (r: BattleResult, id = 'trailblazer'): Ev | undefined =>
  r.events.find((e) => e.kind === 'ult' && e.unitId === id);
const hitsOf = (r: BattleResult, e: Ev): HitLog[] =>
  (e.hitSeqs ?? []).map((s) => r.hits[s]);
const factorOf = (h: HitLog | undefined, k: string): number =>
  h?.factors.find((f) => f.key === k)?.value ?? Number.NaN;

describe('开拓者欢愉8009/8010接入（dump 锚点回归）', () => {
  it(
    'solo e0：战技/能量链/天赋欢愉段x=施放前好活/升格lv1全队暴伤/point08/秘技',
    { timeout: 120000 },
    () => {
      const r = run('A', () => cfg([tb(0)]));
      const acts = tbActs(r);
      expect(acts.length).toBeGreaterThan(5);
      const first = acts[0];
      expect(first.time).toBeCloseTo(94.34, 1);
      expect(first.action).toBe('skill');
      expect(first.energyAfter ?? -1).toBe(120); // 80+30战技+10天赋（Bug1回归）
      expect((first.hitSeqs ?? []).length).toBe(6);
      expect(hasNote(first, 'tbTalent')).toBe(true);
      expect(hasNote(first, 'tbTech')).toBe(true);
      expect(hasNote(first, 'traceWeiRui')).toBe(true);
      const fHits = hitsOf(r, first);
      const direct = fHits.filter((h) => h.kind === 'direct');
      expect(direct.length).toBe(3);
      for (const h of direct) expect(factorOf(h, 'base')).toBeCloseTo(1200, 3); // 2000×0.6
      const elHits = fHits.filter((h) => h.kind === 'elation');
      expect(elHits.length).toBe(3);
      for (const h of elHits) {
        expect(factorOf(h, 'base')).toBeCloseTo(2260.5321, 3); // 7535.107×0.3
        expect(factorOf(h, 'laugh')).toBeCloseTo(1.384615, 4); // x=20 施放前好活（Bug2回归）
        expect(factorOf(h, 'elationDegree')).toBeCloseTo(1.7, 4); // 1+point06 0.5+忍俊秘技0.2
      }
      // 能量链：skill120 → skill160(钳) → ult重置20(+天赋10+欢愉技sp5) → aha参演+15 → skill75 → skill130 → basic160
      expect(acts.slice(0, 5).map((e) => e.energyAfter ?? -1)).toEqual([120, 160, 75, 130, 160]);
      expect(hasNote(acts[1], 'tbP08')).toBe(true); // point08 第2次战技消费
      expect((acts[4].hitSeqs ?? []).length).toBe(1); // 普攻单段 base2800
      expect(factorOf(hitsOf(r, acts[4])[0], 'base')).toBeCloseTo(2800, 3);
      // 首次终结技：同刻自目标 + 升格lv1全队暴伤 crit=1+0.65×1.7=2.105
      const u = tbUlt(r);
      expect(u).toBeDefined();
      expect(u?.targetId).toBe('trailblazer');
      expect(u?.energyAfter ?? -1).toBe(20);
      expect((u?.hitSeqs ?? []).length).toBe(11); // 8弹射+3均分
      expect(hasNote(u!, 'tbUlt')).toBe(true);
      expect(hasNote(u!, 'tbUltElation')).toBe(true);
      expect(hasNote(u!, 'tbP07')).toBe(true);
      // crit = 1+0.65×1.5 = 1.975（目标自吃 +50%；啊哈不在队 → 无升格，不再 +20%、不转全队）
      expect(factorOf(hitsOf(r, u!)[0], 'crit')).toBeCloseTo(1.975, 4);
      expect(r.finalState.goodWork.trailblazer).toBeCloseTo(24, 3);
      expect(r.finalState.laughPoints).toBeCloseTo(0, 3);
    },
  );

  it(
    'mainC=tb与啊哈：终招自动目标=主C（欢愉）自目标、无tbSgAha',
    { timeout: 120000 },
    () => {
      const r = run('B', () =>
        cfg([tb(0), aha(0)], { mainC: 'trailblazer', techniques: false }),
      );
      const u = tbUlt(r);
      expect(u?.targetId).toBe('trailblazer');
      expect(hasNote(u!, 'tbUltElation')).toBe(true);
      expect(r.events.some((e) => hasNote(e, 'tbSgAha'))).toBe(false);
      // 啊哈在场能开大（升格链正常、无越界）
      expect(r.events.some((e) => e.kind === 'ult' && e.unitId === 'aha')).toBe(true);
      expect(r.finalState.goodWork.aha).toBeGreaterThan(0);
    },
  );

  it(
    'e6+aha：终招带tbE2、ahaMoment参演备注冲刷tbE4/tbE6（防狼尊式滞留）',
    { timeout: 120000 },
    () => {
      const r = run('C', () =>
        cfg([tb(6), aha(0)], { mainC: 'trailblazer', techniques: false, rounds: 25, maxTime: 4000 }),
      );
      const u = tbUlt(r);
      expect(hasNote(u!, 'tbE2')).toBe(true); // E2 degree buff 挂目标
      // 参演欢愉技触发 E4/E6 → 备注必须落在 ahaMoment 事件上（flush 修复回归）
      const moment = r.events.find((e) => e.kind === 'action' && e.unitId === 'ahaMoment');
      expect(moment).toBeDefined();
      expect(hasNote(moment!, 'tbE4')).toBe(true);
      expect(hasNote(moment!, 'tbE6')).toBe(true);
    },
  );

  it(
    'e1+jy：战技E1叠层note、终招消费、普攻无天赋段',
    { timeout: 120000 },
    () => {
      const r = run('D', () =>
        cfg([tb(1), jy()], { mainC: 'jingyuan', techniques: false }),
      );
      const acts = tbActs(r);
      const firstSkill = acts.find((a) => a.action === 'skill');
      expect(firstSkill).toBeDefined();
      expect(hasNote(firstSkill!, 'tbE1')).toBe(true);
      const basic = acts.find((a) => a.action === 'basic');
      expect(basic).toBeDefined();
      expect((basic!.hitSeqs ?? []).length).toBe(1); // 无天赋欢愉段（普攻不判hasGood）
      expect(basic!.energyAfter ?? -1).toBe(160); // 120+15(aha参演)+20普攻+10天赋 → 钳160
      // mainC=jy 非欢愉 → 自动目标=编队第一个欢愉=tb自己
      const u = tbUlt(r);
      expect(u?.targetId).toBe('trailblazer');
      expect(r.events.some((e) => hasNote(e, 'tbE1'))).toBe(true);
    },
  );

  it(
    '8010形态同构：trailblazer2 全链等价',
    { timeout: 120000 },
    () => {
      const r = run('E', () => cfg([tb(0, 'trailblazer2')], { techniques: false, rounds: 5, maxTime: 400 }));
      const acts = tbActs(r, 'trailblazer2');
      const first = acts[0];
      expect(first.action).toBe('skill');
      expect(first.energyAfter ?? -1).toBe(120);
      expect(hasNote(first, 'tbTalent')).toBe(true);
      const el = hitsOf(r, first).find((h) => h.kind === 'elation');
      expect(factorOf(el, 'base')).toBeCloseTo(2260.5321, 3);
      expect(factorOf(el, 'laugh')).toBeCloseTo(1.384615, 4);
      const u = tbUlt(r, 'trailblazer2');
      expect(u?.targetId).toBe('trailblazer2');
      expect(hasNote(u!, 'tbUltElation')).toBe(true);
    },
  );

  it(
    '升格目标=啊哈（ahaE2→lv2）：tbSgAha追加自身欢愉技×1.03、升格全队暴伤',
    { timeout: 120000 },
    () => {
      const r = run('G', () =>
        cfg([aha(2), tb(0)], { techniques: false, rounds: 10, maxTime: 800 }),
      );
      const u = tbUlt(r);
      expect(u?.targetId).toBe('aha'); // 编队第一人=aha→defaultAlly回落→首个欢愉=aha
      expect(hasNote(u!, 'tbUltElation')).toBe(true); // aha自己的欢愉技也施放
      expect(hasNote(u!, 'tbSgAha')).toBe(true); // 升格追加tb自身欢愉技
      expect(hasNote(u!, 'tbP07')).toBe(true);
      expect((u?.hitSeqs ?? []).length).toBe(17); // 3 aha欢愉 + 3 aha真伤 + 11 tb欢愉
      const hits = hitsOf(r, u!);
      // 升格lv2：tb自身欢愉技 base=1507.0214×1.03（sg[1]=3）
      const tbSeg = hits.filter((h) => h.source === 'trailblazer' && h.kind === 'elation');
      expect(tbSeg.length).toBe(11);
      for (const h of tbSeg) {
        expect(factorOf(h, 'base')).toBeCloseTo(1552.232042, 3);
      }
      // 升格全队暴伤生效：aha 在同事件的欢愉段 crit=1+0.5×1.8=1.9
      const ahaSeg = hits.filter((h) => h.source === 'aha' && h.kind === 'elation');
      expect(ahaSeg.length).toBeGreaterThan(0);
      expect(factorOf(ahaSeg[0], 'crit')).toBeCloseTo(1.9, 4);
      // tb 自身 crit=1+0.65×1.8=2.17（升格lv2 全队+0.3 且作用于自己）
      expect(factorOf(tbSeg[0], 'crit')).toBeCloseTo(2.17, 4);
    },
  );

  it(
    'predictAfter：普攻/战技含天赋+10、caps 全员上限',
    { timeout: 120000 },
    () => {
      const ctl = createInteractiveBattle(
        cfg([tb(0), jy()], { mainC: 'jingyuan', techniques: false }),
      );
      const decs: {
        unit: string;
        caps: Record<string, number>;
        basic: Record<string, number>;
        skill: Record<string, number>;
        enTb: number;
        enJy: number;
      }[] = [];
      for (let i = 0; i < 10; i += 1) {
        const d = ctl.advance();
        if (!d) break;
        if (d.type !== 'decision') continue;
        const paB = d.predictAfter?.({ action: 'basic' });
        const paS = d.predictAfter?.({ action: 'skill' });
        expect(paB).toBeDefined();
        expect(paS).toBeDefined();
        decs.push({
          unit: d.unitId,
          caps: paB!.caps,
          basic: paB!.energy,
          skill: paS!.energy,
          enTb: d.status.energy.trailblazer,
          enJy: d.status.energy.jingyuan,
        });
        ctl.advance({ action: d.unitId === 'trailblazer' ? 'skill' : 'basic' });
      }
      expect(decs.length).toBeGreaterThanOrEqual(2);
      // 景元首决策：初始80（65+15绸缪）；普攻+20/战技+30（不吃天赋）
      expect(decs[0].unit).toBe('jingyuan');
      expect(decs[0].enTb).toBe(80);
      expect(decs[0].enJy).toBe(80);
      expect(decs[0].caps.trailblazer).toBe(160);
      expect(decs[0].caps.jingyuan).toBe(130);
      expect(decs[0].basic.jingyuan).toBe(100);
      expect(decs[0].skill.jingyuan).toBe(110);
      // 开拓者首决策：普攻+20+天赋10=110、战技+30+天赋10=120（predictAfter ⑦天赋项）
      expect(decs[1].unit).toBe('trailblazer');
      expect(decs[1].enTb).toBe(80);
      expect(decs[1].basic.trailblazer).toBe(110);
      expect(decs[1].skill.trailblazer).toBe(120);
    },
  );
});
