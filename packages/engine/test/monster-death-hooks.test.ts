import { describe, expect, it } from 'vitest';
import { simulateBattle, type CombatMember, type MemberPanel, type MonsterConfig } from '../src/index.js';

// ── 敌方死亡钩子（2026-10-30 第十四批）──
// 统一扫描挂在 `checkVictory()` 前（`processEnemyDeaths`）：三槽 + 召唤物 HP 归零各跑一次 `onDeath`。
// 实测锚点（dump 定锚）：5012110 → enemyDeathLaugh + enemyDeathElation；5012120 → enemyDeathLaugh；
// 2022040（3 怪）→ 每次阵亡一条 enemyDeathAdvance；8022010 → enemyDeathDamage + enemyDeathVuln；
// 4034014 + 4032024 → 4032024 阵亡时 4034014 的【灾难之力】-1（enemyDeathOwnerDown）。

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

function run(monsters: MonsterConfig[], rounds = 6) {
  return simulateBattle({
    members: members(),
    monsters,
    techniques: false,
    rounds,
    maxTime: 3000,
    roundMode: 'forgotten',
  });
}

const deathNotes = (r: ReturnType<typeof run>) =>
  r.events.flatMap((e) => e.note ?? []).filter((n) => n.startsWith('enemyDeath'));

describe('敌方死亡钩子', () => {
  it('丑照特写 5012110：致命受击给我方笑点 + 欢愉度（以增笑近似）', () => {
    const notes = deathNotes(run([mk('5012110', 200000)]));
    expect(notes).toContain('enemyDeathLaugh');
    expect(notes).toContain('enemyDeathElation');
  });

  it('线路故障 5012120：致命受击只给我方笑点', () => {
    const notes = deathNotes(run([mk('5012120', 200000)]));
    expect(notes).toContain('enemyDeathLaugh');
    expect(notes).not.toContain('enemyDeathElation');
  });

  it('嗥吠 2022040：相邻敌方行动提前（3 怪各阵亡一次，每只只触发一次）', () => {
    expect(deathNotes(run([mk('2022040', 200000), mk('2022040', 200000), mk('2022040', 200000)]))).toContain(
      'enemyDeathAdvance',
    );
    const once = run([mk('2022040', 1), mk('2022040', 1), mk('2022040', 1)], 3);
    const advances = once.events.filter((e) => (e.note ?? []).includes('enemyDeathAdvance'));
    // 每只怪最多一条死亡事件
    expect(advances.length).toBeLessThanOrEqual(3);
  });

  it('蛰亡语 8022010：致命受击对我方全体造成伤害 + 受伤提高', () => {
    const r = run([mk('8022010', 200000)]);
    const notes = deathNotes(r);
    expect(notes).toContain('enemyDeathDamage');
    expect(notes).toContain('enemyDeathVuln');
    // 我方确实掉了血（伤害通道走 applyDamageToMember + 盾同步）
    const totalHp = Object.values(r.finalState.memberHp).reduce((a, b) => a + b, 0);
    expect(totalHp).toBeLessThan(400000);
  });

  it('为我设奠 4032024：阵亡使 4034014 的【灾难之力】-1 层', () => {
    const notes = deathNotes(run([mk('4034014', 900000), mk('4032024', 150000)]));
    expect(notes).toContain('enemyDeathOwnerDown');
  });
});
