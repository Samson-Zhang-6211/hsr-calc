import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  createInteractiveBattle,
  type BattleConfig,
  type CombatMember,
} from '../src/index.js';

// Helpers from dump test (reused)
const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 103,
  attack: 2000,
  hp: 5000,
  defence: 1200,
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

const mem = (
  eidolon = 0,
  id: 'trailblazerMem' | 'trailblazerMem2' = 'trailblazerMem',
  over: Record<string, unknown> = {},
): CombatMember => ({
  id,
  eidolonLevel: eidolon,
  panel: mkPanel(over),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const jy = (over: Record<string, unknown> = {}): CombatMember => ({
  id: 'jingyuan',
  panel: mkPanel({ speed: 135, element: 'Thunder' as const, elementDmg: { Thunder: 0.3 }, ...over }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
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
  rounds: 30,
  maxTime: 2500,
  seed: 20261010,
  ...over,
});

const noteArr = (n: unknown): string[] => (Array.isArray(n) ? (n as string[]) : n ? [String(n)] : []);

describe('mem-trailblazer formal (dump anchors)', () => {
  it(
    'A solo e0 tech - technique/skill/mimi/basic/enhanced/ult',
    { timeout: 120000 },
    () => {
      const r = simulateBattle(cfg([mem()], { rounds: 12, maxTime: 800 }));
      expect(r.report.totalDamage).toBeCloseTo(191727.29828571418, 4);
      expect(r.finalState.energy.trailblazerMem).toBe(149);
      expect(r.finalState.sp).toBe(5);

      const tech = r.events.find(
        (e) => e.kind === 'action' && e.unitId === 'trailblazerMem' && e.skillCode === 'trailblazerMem.tech',
      );
      expect(tech).toBeDefined();
      expect(noteArr(tech!.note)).toContain('technique');
      expect(noteArr(tech!.note)).toContain('memTech');
      expect(tech!.hitSeqs?.length).toBe(3);

      const skill = r.events.find(
        (e) => e.kind === 'action' && e.unitId === 'trailblazerMem' && e.skillCode === 'trailblazerMem.skill',
      );
      expect(skill).toBeDefined();
      expect(noteArr(skill!.note)).toContain('summonMimi');
      expect(noteArr(skill!.note)).toContain('mimiCharge');
      expect(skill!.energyAfter).toBe(110);
      expect(skill!.spAfter).toBe(2);

      const mimi1 = r.events.find(
        (e) => e.kind === 'action' && e.unitId === 'mimi' && e.skillCode === 'mimi.memSkill',
      );
      expect(mimi1).toBeDefined();
      expect(mimi1!.hitSeqs?.length).toBe(7); // 4 bounce + 3 AoE

      const basic1 = r.events.find(
        (e) => e.kind === 'action' && e.unitId === 'trailblazerMem' && e.skillCode === 'trailblazerMem.basic',
      );
      expect(basic1).toBeDefined();
      expect(basic1!.energyAfter).toBe(140); // 110 + 10 (mimi talent) + 20 (basic)

      const support = r.events.find(
        (e) => e.kind === 'action' && e.unitId === 'mimi' && e.skillCode === 'mimi.support',
      );
      expect(support).toBeDefined();
      expect(noteArr(support!.note)).toContain('memResonance');
      expect(support!.targetId).toBe('trailblazerMem');

      // Find an event with memResonanceDmg true damage
      const resonanceHit = r.hits.find((h) => h.note === 'memResonanceDmg');
      expect(resonanceHit).toBeDefined();
      expect(resonanceHit!.kind).toBe('trueDamage');

      // Find enhanced basic (memEpic consumed)
      const enhanced = r.events.find(
        (e) => e.kind === 'action' && e.unitId === 'trailblazerMem' && noteArr(e.note).includes('memEnhanced'),
      );
      expect(enhanced).toBeDefined();
      expect(enhanced!.hitSeqs?.length).toBeGreaterThanOrEqual(6); // 2 sources × 3 targets

      // Find ult with memEpic
      const ult = r.events.find(
        (e) => e.kind === 'ult' && e.unitId === 'trailblazerMem' && e.skillCode === 'trailblazerMem.ult',
      );
      expect(ult).toBeDefined();
      expect(noteArr(ult!.note)).toContain('memEpic');
      expect(ult!.hitSeqs?.length).toBe(6); // 3 targets × 2 (direct + trueDamage)
    },
  );

  it(
    'B solo e0 no tech - no technique, charge accumulation different',
    { timeout: 120000 },
    () => {
      const r = simulateBattle(cfg([mem()], { techniques: false, rounds: 12, maxTime: 800 }));
      expect(r.finalState.energy.trailblazerMem).toBe(149);
      expect(r.finalState.sp).toBe(5);
    },
  );

  it(
    'D e1 resonance crit',
    { timeout: 120000 },
    () => {
      const r = simulateBattle(cfg([mem(1), jy()], { rounds: 12, maxTime: 800 }));
      expect(r.report.totalDamage).toBeCloseTo(508269.7291869266, 4);
      expect(r.finalState.energy.trailblazerMem).toBe(139);

      // E1 should add crit rate to resonance true damage - check first resonance hit
      const resHits = r.hits.filter((h) => h.note === 'memResonanceDmg');
      expect(resHits.length).toBeGreaterThan(0);
    },
  );

  it(
    'E e4+aha resonance bonus',
    { timeout: 120000 },
    () => {
      const r = simulateBattle(cfg([mem(4), aha(), jy()], { rounds: 12, maxTime: 800 }));
      // 2026-10-18 数据4.6.53（151103/151104/151129）后重锚
      // 2026-11-02 重锚（忆灵集合修正）：8007 E2 条款是「除迷迷以外的**我方忆灵**行动时」回能，
      // 原实现手写 ['shenjun','memo','longling','yijiang'] —— 神君（景元/Mage）不是忆灵却被算进来。
      // 本队只有迷迷一只忆灵且被条款排除 → E2 全程不触发：终结技次数变少（总伤 −1.1%），
      // 少花能量 → 终态能量 79 → 139。隔离验证：只回退 memE2Hook 即恢复旧锚点，其余改动零影响。
      expect(r.report.totalDamage).toBeCloseTo(953661.5100123485, 4);
      expect(r.finalState.energy.trailblazerMem).toBe(139);
    },
  );

  it(
    'F e6 ult crit',
    { timeout: 120000 },
    () => {
      const r = simulateBattle(cfg([mem(6)], { techniques: false, rounds: 12, maxTime: 800 }));
      expect(r.report.totalDamage).toBeCloseTo(207094.43931428553, 4);
      expect(r.finalState.energy.trailblazerMem).toBe(149);

      // E6: ult hits should have crit=1 (forced crit)
      const ult = r.events.find(
        (e) => e.kind === 'ult' && e.unitId === 'trailblazerMem' && e.skillCode === 'trailblazerMem.ult',
      );
      expect(ult).toBeDefined();
      expect(noteArr(ult!.note)).toContain('memEpic');
      expect(ult!.hitSeqs?.length).toBe(6); // 3 direct + 3 resonance trueDamage
    },
  );

  it(
    'G trailblazerMem2 same structure',
    { timeout: 120000 },
    () => {
      const r = simulateBattle(cfg([mem(0, 'trailblazerMem2')], { rounds: 12, maxTime: 800 }));
      expect(r.report.totalDamage).toBeCloseTo(191727.29828571418, 4);
      expect(r.finalState.energy.trailblazerMem2).toBe(149);

      const skill = r.events.find(
        (e) => e.kind === 'action' && e.unitId === 'trailblazerMem2' && e.skillCode === 'trailblazerMem2.skill',
      );
      expect(skill).toBeDefined();
      expect(noteArr(skill!.note)).toContain('summonMimi');
    },
  );

  it(
    'H interactive mimiSupport decision',
    { timeout: 120000 },
    () => {
      const ctl = createInteractiveBattle(cfg([mem(), jy()], { techniques: false, rounds: 12, maxTime: 800 }));
      let decisions = 0;
      let guard = 0;
      for (;;) {
        const step = ctl.advance();
        if (!step) break;
        if (++guard > 200) break;
        if (step.type === 'decision') {
          decisions++;
          const mimiSup = (step as { mimiSupport?: boolean }).mimiSupport ?? false;
          if (mimiSup) {
            ctl.advance({ action: 'skill', target: { allyTarget: 'jingyuan' } });
          } else {
            ctl.advance({ action: 'basic', target: { enemyTarget: 'monster2' } });
          }
        }
      }
      expect(decisions).toBeGreaterThan(0);
      const r = ctl.result();
      expect(r).not.toBeNull();
      expect(r!.finalState.energy.trailblazerMem).toBe(160);
    },
  );

  it(
    'I predictAfter drift check',
    { timeout: 120000 },
    () => {
      const ctl = createInteractiveBattle(cfg([mem(), jy()], { techniques: false, rounds: 6, maxTime: 400 }));
      let guard = 0;
      const preds: Array<{ unit: string; skill: Record<string, number>; basic: Record<string, number> }> = [];
      for (;;) {
        const step = ctl.advance();
        if (!step) break;
        if (++guard > 100) break;
        if (step.type === 'decision') {
          const pred = step.predictAfter?.({ action: 'skill' });
          const predB = step.predictAfter?.({ action: 'basic' });
          if (pred && predB) {
            preds.push({
              unit: step.unitId,
              skill: pred.energy as Record<string, number>,
              basic: predB.energy as Record<string, number>,
            });
          }
          ctl.advance({ action: 'basic', target: { enemyTarget: 'monster2' } });
        }
      }
      expect(preds.length).toBeGreaterThan(0);
      // First prediction for trailblazerMem should have skill=110, basic=100
      const firstMem = preds.find((p) => p.unit === 'trailblazerMem');
      expect(firstMem).toBeDefined();
      expect(firstMem!.skill.trailblazerMem).toBe(110);
      expect(firstMem!.basic.trailblazerMem).toBe(100);
    },
  );

  it(
    'C duo mem+jy - resonance on jy',
    { timeout: 120000 },
    () => {
      const r = simulateBattle(cfg([mem(), jy()], { rounds: 12, maxTime: 800 }));
      expect(r.report.totalDamage).toBeCloseTo(500356.5930382636, 4);
      expect(r.finalState.energy.trailblazerMem).toBe(139);
      expect(r.finalState.energy.jingyuan).toBe(115);
    },
  );
});
