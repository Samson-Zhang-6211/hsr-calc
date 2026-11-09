import { describe, expect, it } from 'vitest';
import {
  ENEMY_SKILLS,
  enemySkills,
  simulateBattle,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 死亡钩子：声明层全量校验（2026-10-30 第三十七轮）──
// `monster-death-hooks` / `-hooks2` 覆盖了**每一条钩子的行为**；本文件补的是**声明本身**：
//   · `onDeath` / `onAllyDeath` 是否挂在 passive 技上（挂错地方会被 AI 当主动技放出来）
//   · 每只怪是否最多声明 1 条 `onAllyDeath`（引擎用 `find` 取第一条，第二条是死代码）
//   · `onAllyDeath.skillId` 是否真的在同表里（否则「立即行动」会放空）
//   · `onDeath` 的效果对象是否非空（空对象 = 白写）
//   · 运行时：**同 id 三只怪各死一次，钩子只各触发一次**（`deathHooksDone` 去重）

const HOOK_SKILLS = Object.entries(ENEMY_SKILLS).flatMap(([mon, list]) =>
  list.filter((s) => s.onDeath || s.onAllyDeath).map((s) => ({ mon, s, list })),
);

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 200_000,
    attack: 3000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(160) },
  { id: 'feixiao', panel: panel(150) },
  { id: 'sunday', panel: panel(156) },
  { id: 'aventurine', panel: panel(134) },
];

const mk = (id: string, hp = 120_000): MonsterConfig => ({
  monsterId: id,
  level: 95,
  hp,
  attack: 600,
  speed: 100,
  maxToughness: 200,
  weaknesses: ['Fire', 'Quantum', 'Imaginary'],
  resistance: {},
});

describe('死亡钩子 · 声明层', () => {
  it('8 条钩子：onDeath × 7 + onAllyDeath × 1，都挂在 passive 技上', () => {
    expect(HOOK_SKILLS.length).toBe(8);
    const onDeath = HOOK_SKILLS.filter((h) => h.s.onDeath);
    const onAllyDeath = HOOK_SKILLS.filter((h) => h.s.onAllyDeath);
    expect(onDeath.length).toBe(7);
    expect(onAllyDeath.length).toBe(1);
    for (const { mon, s } of HOOK_SKILLS) {
      expect(s.passive, `${mon}/${s.skillId} 的死亡钩子必须挂在 passive 技上`).toBe(true);
    }
  });

  it('每只怪最多一条 onAllyDeath（引擎取第一条，多余的会是死代码）', () => {
    const perMon = new Map<string, number>();
    for (const { mon, s } of HOOK_SKILLS) {
      if (!s.onAllyDeath) continue;
      perMon.set(mon, (perMon.get(mon) ?? 0) + 1);
    }
    for (const [mon, n] of perMon) {
      expect(n, `${mon} 声明了 ${n} 条 onAllyDeath，只能有 1 条`).toBe(1);
    }
  });

  it('onAllyDeath.skillId 必须指向同一只怪技能表里的技能', () => {
    for (const { mon, s, list } of HOOK_SKILLS) {
      const allyDeath = s.onAllyDeath;
      if (!allyDeath) continue;
      const forcedId = String(allyDeath.skillId);
      const ids = list.map((x) => x.skillId);
      expect(ids, `${mon} 的 onAllyDeath.skillId=${forcedId} 不在技能表里`).toContain(forcedId);
      // 被强放的那个技能必须是主动技（有倍率），否则「立即行动」等于空放
      const forced = list.find((x) => String(x.skillId) === forcedId);
      expect(forced, `${mon} 找不到 ${forcedId}`).toBeTruthy();
      expect(forced!.passive, `${mon} 的强放技 ${forced!.skillId} 不该是 passive`).not.toBe(true);
    }
  });

  it('onDeath 效果对象非空，且字段都是已知字段（防拼错）', () => {
    const KNOWN = new Set([
      'adjacentAdvance',
      'vulnKiller',
      'shieldKiller',
      'ownerStatusDown',
      'laughPoints',
      'elationDegree',
      'alliesDamage',
      'alliesVulnerable',
    ]);
    for (const { mon, s } of HOOK_SKILLS) {
      const eff = s.onDeath;
      if (!eff) continue;
      const keys = Object.keys(eff);
      expect(keys.length, `${mon}/${s.skillId} 的 onDeath 是空对象`).toBeGreaterThan(0);
      for (const k of keys) {
        expect(KNOWN, `${mon}/${s.skillId} 的 onDeath 字段 ${k} 不认识（拼错就静默失效）`).toContain(k);
      }
    }
  });

  it('声明钩子的怪都能被 enemySkills 取到（表键与 monsterId 对得上）', () => {
    for (const { mon } of HOOK_SKILLS) {
      expect(enemySkills(mon).length, `${mon} 取不到技能表`).toBeGreaterThan(0);
    }
  });

  it('运行时：同 id 三只怪各阵亡一次 → 笑点钩子恰好触发 3 次（不重复）', () => {
    // 5012110「丑照特写」致命受击给我方笑点；三只同时在场，逐只被打死
    const r = simulateBattle({
      members: members(),
      monsters: [mk('5012110', 60_000), mk('5012110', 60_000), mk('5012110', 60_000)],
      techniques: false,
      rounds: 12,
      maxTime: 5000,
      roundMode: 'forgotten',
    });
    const deaths = r.events.filter((e) => (e.note ?? []).includes('enemyDeathLaugh')).length;
    // 三只各触发一次 = 3；若 `deathHooksDone` 去重失效会变成 6（每次扫描重放）
    expect(deaths, `笑点钩子触发 ${deaths} 次（三只怪应各 1 次）`).toBe(3);
  });
});
