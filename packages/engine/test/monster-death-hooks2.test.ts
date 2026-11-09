import { describe, expect, it } from 'vitest';
import { simulateBattle, type CombatMember, type MemberPanel, type MonsterConfig } from '../src/index.js';

// ── 敌方死亡钩子第二批（2026-10-30 第十六批）──
// 新框架能力：击杀者上下文（`lastHitter`）+ `onDeath.vulnKiller` / `onDeath.shieldKiller`
// + `onAllyDeath`（队友阵亡 → 本怪立即行动施放指定技能）。
// 实测锚点：飞逝欲念摹本给击杀者 100000×10% = **10000** 护盾；仇隙触发时 monster1 的首个行动即
// `monster.403203002` 且带 `monsterChargeRelease`（强放路径）。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

function members(): CombatMember[] {
  return [
    { id: 'sunday', panel: panel(156) },
    { id: 'jingyuan', panel: panel(134) },
    { id: 'aventurine', panel: panel(134) },
    { id: 'tenghuang', panel: panel(135) },
  ];
}

const mk = (id: string, hp: number): MonsterConfig => ({
  monsterId: id,
  level: 95,
  hp,
  attack: 800,
  speed: 120,
  maxToughness: 300,
  weaknesses: ['Fire', 'Wind', 'Quantum'],
  resistance: {},
});

const run = (monsters: MonsterConfig[], rounds = 8) =>
  simulateBattle({
    members: members(),
    monsters,
    techniques: false,
    rounds,
    maxTime: 4000,
    roundMode: 'forgotten',
  });

const notesOf = (r: ReturnType<typeof run>) => r.events.flatMap((e) => e.note ?? []);

describe('敌方死亡钩子 · 第二批', () => {
  it('颠仆的星花阶石 3021020：致命受击给击杀者叠「受到伤害提高」', () => {
    expect(notesOf(run([mk('3021020', 200000)]))).toContain('enemyDeathVulnKiller');
  });

  it('飞速欲念摹本 3021040：致命受击给击杀者挂屏障（生命上限 10%）', () => {
    const r = run([mk('3021040', 200000)]);
    expect(notesOf(r)).toContain('enemyDeathShieldKiller');
    const shieldSum = Object.values(r.finalState.memberShield).reduce((a, b) => a + b, 0);
    expect(shieldSum).toBeGreaterThanOrEqual(10000);
  });

  it('仇隙 4032030：队友阵亡后自身立即行动并强放【仇心忿火】', () => {
    // 4032024 只有 1000 血 → 首个我方攻击即阵亡
    const r = run([mk('4032030', 3_000_000), mk('4032024', 1000)]);
    const firstMonsterAct = r.events.find(
      (e) => e.unitId === 'monster1' && (e.skillCode ?? '').startsWith('monster.'),
    );
    expect(firstMonsterAct).toBeTruthy();
    expect(firstMonsterAct!.skillCode).toBe('monster.403203002');
    expect(firstMonsterAct!.note).toContain('monsterChargeRelease');
    // 对照组：单怪时没有被强放的痕迹
    const solo = run([mk('4032030', 3_000_000)]);
    expect(notesOf(solo)).not.toContain('monsterChargeRelease');
  });
});
