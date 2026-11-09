import { describe, expect, it } from 'vitest';
import {
  ENEMY_SKILLS,
  summonMonsterProfile,
  summonStats,
  simulateBattle,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 召唤物档案（2026-10-30 第十五批）──
// 12 个独立档案型召唤物入表（气泡锂犬 / 泡影稚子 / 银鬃近卫·射手 / 千星戍卫 / 天谴斗士 /
// 狈影 / 授勋·枪尖·盾 / 残破容器 / 吞神子嗣），并给 8 条「召唤」技能补上 `summon` 字段。

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

const mk = (id: string): MonsterConfig => ({
  monsterId: id,
  level: 95,
  hp: 400000,
  attack: 800,
  speed: 120,
  maxToughness: 300,
  weaknesses: ['Fire', 'Wind', 'Quantum'],
  resistance: {},
});

const run = (id: string, rounds = 8) =>
  simulateBattle({
    members: members(),
    monsters: [mk(id)],
    techniques: false,
    rounds,
    maxTime: 4000,
    roundMode: 'forgotten',
  });

/** 该场出现的敌方召唤物槽（enemy1..enemy4） */
const summonUnits = (r: ReturnType<typeof run>): string[] => {
  const units = new Set<string>();
  for (const e of r.events) {
    const u = String(e.unitId);
    if (u.startsWith('enemy')) units.add(u);
  }
  return [...units].sort();
};

describe('召唤物档案', () => {
  it('技能表引用的每个召唤物 id 都有档案（防漏登记）', () => {
    const referenced = new Set<string>();
    for (const skills of Object.values(ENEMY_SKILLS)) {
      for (const sk of skills) {
        // 主动召唤 + 开局召唤（`startSummon`，第十七批）都要有档案
        for (const spec of [sk.summon, sk.startSummon]) {
          if (!spec) continue;
          const ids = Array.isArray(spec.monsterId) ? spec.monsterId : [spec.monsterId];
          for (const id of ids) referenced.add(id);
        }
      }
    }
    expect(referenced.size).toBeGreaterThanOrEqual(14);
    for (const id of referenced) {
      expect(summonMonsterProfile(id), `缺档案：${id}`).toBeTruthy();
    }
  });

  it('档案按等级换算（hp/atk/速度/韧性都为正，难度乘区生效）', () => {
    const p = summonMonsterProfile('3002030')!;
    const s = summonStats(p, 95);
    expect(s.hp).toBeGreaterThan(p.hp);
    expect(s.atk).toBeGreaterThan(p.atk);
    // 韧性乘区 95 级恰为 1（STAGE_SCALES 只有 12 档，取不高于 95 的最近一档）→ 不为 0 即可
    expect(s.maxToughness).toBeGreaterThan(0);
    expect(s.speed).toBeGreaterThan(0);
  });

  it('甜猿泰山 3003020【苏乐达派对】：召唤 2 只气泡锂犬', () => {
    const r = run('3003020');
    expect(summonUnits(r).length).toBeGreaterThanOrEqual(2);
    expect(r.events.some((e) => (e.note ?? []).some((n) => n.startsWith('summon')))).toBe(true);
  });

  it('银鬃尉官 1003010【增援】/ 天谴先锋 4013010【快从坟墓中苏生】：各召唤 1 只', () => {
    expect(summonUnits(run('1003010')).length).toBeGreaterThanOrEqual(1);
    expect(summonUnits(run('4013010')).length).toBeGreaterThanOrEqual(1);
  });

  it('盗火行者 4034014【残破容器】：召唤物上限内不重复堆叠', () => {
    const r = run('4034014');
    expect(summonUnits(r).length).toBeGreaterThanOrEqual(1);
    // `maxAlive: 2` → 满额后只报 summonLimit
    expect((r.events.flatMap((e) => e.note ?? []).filter((n) => n === 'summonLimit').length)).toBeGreaterThan(0);
  });

  it('开局召唤 `startSummon`：巴姆王【洗地机之乱】开局召 2 只合金保姆', () => {
    // 5014023 合金机铠•帕姆王：首动之前就已入场（无需等 AI 抽到技能）
    expect(summonUnits(run('5014023')).length).toBeGreaterThanOrEqual(2);
  });
});
