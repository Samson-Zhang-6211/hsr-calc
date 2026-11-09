import { describe, it } from 'vitest';
import fs from 'node:fs';
import { simulateBattle, type BattleConfig, type CombatMember } from '../src/index.js';

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 107,
  attack: 2000,
  hp: 3000,
  defence: 800,
  element: 'Quantum' as const,
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
  elementDmg: { Quantum: 0.3 },
  ...over,
});

const mk = (id: CombatMember['id'], lc?: string, over: Record<string, unknown> = {}): CombatMember => ({
  id,
  eidolonLevel: 0,
  ...(lc ? { lightconeId: lc, refinement: 1 } : {}),
  panel: mkPanel(over),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10, elationSkill: 10 },
});

const cfg = (members: CombatMember[]): BattleConfig => ({
  members,
  monster: {
    level: 90,
    hp: 50_000_000,
    maxToughness: 99999,
    speed: 100,
    enemyClass: 'elite',
    resistance: {},
    weaknesses: [],
  },
  techniques: true,
  rounds: 80,
  maxTime: 4000,
  seed: 20261009,
});

describe('carrier probe', () => {
  it('dump', () => {
    const out: string[] = [];
    for (const id of ['trailblazer', 'kafka', 'pela', 'blackswan'] as const) {
      const r = simulateBattle(cfg([mk(id, '23006'), mk('jingyuan')]));
      const first = r.hits.find((h) => h.source === id);
      const acts = r.events.filter((e) => e.kind === 'action' && e.unitId === id).slice(0, 4);
      out.push(
        `${id}: total=${r.report.totalDamage.toFixed(2)} hits=${r.hits.length} first=${first?.time.toFixed(2)} kind=${first?.kind} skill=${first?.skillCode} base=${first?.factors.find((f) => f.key === 'base')?.value?.toFixed(2)}`,
      );
      out.push(
        `  acts: ${acts.map((e) => `${e.time.toFixed(2)}:${e.action}:${e.skillCode ?? '-'}`).join(' | ')}`,
      );
    }
    fs.writeFileSync(`${process.env.TEMP}/carrier-probe.txt`, out.join('\n'), 'utf8');
  });
});
