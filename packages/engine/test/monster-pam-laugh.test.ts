import { describe, expect, it } from 'vitest';
import {
  enemySkills,
  simulateBattleReplay,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 帕姆王「笑点获取」（2026-10-30 第二十六轮）──
// 文案：无死角洗涤 / 强效肥皂泡 / 饱和式大扫除 施放后我方获得笑点；洗地机之乱开局召唤合金保姆。
// 本实现：`EnemySkillDef.laughGain` → monsterTurn 施放后 `gainLaugh`（与欢愉角色同一账本，note `enemyLaughGain`）。
// 实测锚点（dump 定锚）：501402303 施放后笑点 +5（13 → 18）。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 3000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  } as MemberPanel;
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(150) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
];

describe('怪物技能 · 帕姆王【笑点获取】', () => {
  it('数据：三条给笑点的技能 + 洗地机之乱带笑点充能', () => {
    const table = (id: string) => Object.fromEntries(enemySkills(id).map((s) => [s.skillId, s]));
    const p20 = table('5014020');
    expect(p20['501402003']?.laughGain).toBe(5); // 无死角洗涤
    expect(p20['501402004']?.laughGain).toBe(5); // 强效肥皂泡
    expect(p20['501402006']?.laughGain).toBe(10); // 饱和式大扫除
    const p23 = table('5014023');
    expect(p23['501402303']?.laughGain).toBe(5);
    expect(p23['501402306']?.laughGain).toBe(10);
    expect(p23['501402307']?.laughGain).toBe(3); // 洗地机之乱（同时 startSummon）
    expect(p23['501402307']?.startSummon?.monsterId).toBe('5012120');
    // 合金保姆的死亡钩子仍在（线路故障）
    expect(enemySkills('5012120').find((s) => s.onDeath)?.onDeath?.laughPoints).toBe(10);
  });

  it('实战：施放带 laughGain 的技能 → 笑点按数值增加（note enemyLaughGain）', () => {
    const { steps } = simulateBattleReplay({
      members: members(),
      monsters: [
        {
          monsterId: '5014023',
          level: 95,
          hp: 3_000_000,
          attack: 800,
          speed: 130,
          maxToughness: 720,
          weaknesses: ['Fire', 'Quantum'],
          resistance: {},
        },
      ],
      techniques: false,
      rounds: 6,
      maxTime: 2500,
      roundMode: 'forgotten',
    });
    const hit = steps.findIndex((s) => (s.event.note ?? []).includes('enemyLaughGain'));
    expect(hit).toBeGreaterThan(0);
    const skillId = (steps[hit]!.event.skillCode ?? '').replace('monster.', '');
    const gain = enemySkills('5014023').find((s) => s.skillId === skillId)?.laughGain;
    expect(gain).toBeGreaterThan(0);
    const before = steps[hit - 1]!.status.laughPoints;
    const after = steps[hit]!.status.laughPoints;
    expect(after! - before!).toBe(gain);
  });
});
