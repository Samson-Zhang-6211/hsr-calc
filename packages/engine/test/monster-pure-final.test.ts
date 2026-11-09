import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  enemySkills,
  enemyUsableSkills,
  simulateBattle,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 虚构叙事 P27 其四 收官 2 只（2026-10-30 第九批）──
// 4034014 至黑之剑，盗火行者（11 技）+ 3003020 惊梦剧团的甜猿泰山（4 技）
// 锚点：基础命中 311.19（= 607.5529 × 0.5121，Lv85 打 Lv80）。

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
    { id: 'tenghuang', panel: panel(135) },
    { id: 'aventurine', panel: panel(134) },
  ];
}

function cfgOf(monsterId: string): MonsterConfig {
  for (const wave of buildPackStageWaves('pure-p27', 4)) {
    const hit = wave.find((c) => c.monsterId === monsterId);
    if (hit) return { ...hit, hp: Math.min(hit.hp, 3e7) };
  }
  throw new Error(`missing ${monsterId}`);
}

function run(mon: MonsterConfig, rounds = 8) {
  return simulateBattle({
    members: members(),
    monsterWaves: [[mon]],
    techniques: false,
    rounds,
    maxTime: 4000,
    roundMode: 'phantom',
  });
}

describe('P27 其四收官 · 技能表 2 只', () => {
  it('登记与 AI 池', () => {
    // 11 条里 5 条是被动/留口族（相混的道途等合并在 403401408）
    expect(enemySkills('4034014')).toHaveLength(8);
    expect(enemyUsableSkills('4034014').map((s) => s.skillId)).toEqual([
      '403401401',
      '403401402',
      '403401403',
      '403401404',
      '403401405',
      '403401407',
    ]);
    expect(enemySkills('3003020')).toHaveLength(4);
    // 苏乐达派对 300302003 于第十五批接上 summon → 进入 AI 池
    expect(enemyUsableSkills('3003020').map((s) => s.skillId)).toEqual([
      '300302001',
      '300302002',
      '300302003',
      '300302004',
    ]);
    expect(enemySkills('4034014').find((s) => s.skillId === '403401406')!.hardenedDefence).toMatchObject({
      dmgReduction: 0.2,
    });
    expect(enemySkills('3003020').find((s) => s.skillId === '300302002')!.multiHit).toMatchObject({
      count: 4,
    });
  });
});

describe('盗火行者 4034014：【灾难之力】与【侵蚀】', () => {
  it('沉默的悲叹叠【灾难之力】+ 蓄力；群体技消耗层数；【将尽的命数】转化侵蚀', () => {
    const mon = cfgOf('4034014');
    const r = run(mon, 8);
    const notes = r.events.flatMap((e) => e.note ?? []);
    expect(notes).toContain('enemyStateUp');
    expect(notes).toContain('enemyStateDown');
    // 蓄力链：沉默的悲叹 → 莫因舍弃而哭泣
    expect(r.events.some((e) => e.skillCode === 'monster.403401403')).toBe(true);
    expect(r.events.some((e) => e.skillCode === 'monster.403401407')).toBe(true);
    const charge = r.events.find((e) => e.skillCode === 'monster.403401403')!;
    expect(charge.note).toContain('monsterCharge');
    const release = r.events.find((e) => e.skillCode === 'monster.403401407')!;
    expect(release.note).toContain('monsterChargeRelease');
    // 侵蚀（降低可回复上限）
    expect(notes).toContain('allyErosion');
    // 伤害锚点
    const blast = r.events.find((e) => e.skillCode === 'monster.403401401')!;
    expect(blast.enemyHits!.length).toBeGreaterThanOrEqual(2);
    for (const h of blast.enemyHits!) expect(h.damage).toBeCloseTo(311.19, 2);
    const aoe = r.events.find((e) => e.skillCode === 'monster.403401402')!;
    expect(aoe.enemyHits!.length).toBe(4);
  });
});

describe('甜猿泰山 3003020：护盾反制与蓄力', () => {
  it('限量赠饮/无限畅饮命中带盾目标 → 自身防御降低；4 段随机 + 蓄力链', () => {
    const mon = cfgOf('3003020');
    const r = run(mon, 8);
    const notes = r.events.flatMap((e) => e.note ?? []);
    expect(notes).toContain('enemyShieldCounter');
    const drink = r.events.find((e) => e.skillCode === 'monster.300302001')!;
    expect(drink.enemyHits!.length).toBe(1);
    expect(drink.enemyHits![0]!.damage).toBeCloseTo(311.19, 2);
    const endless = r.events.find((e) => e.skillCode === 'monster.300302002')!;
    expect(endless.enemyHits!.length).toBe(4);
    for (const h of endless.enemyHits!) expect(h.damage).toBeCloseTo(311.19, 2);
    // 酬宾喷泉 → 下次行动无限畅饮
    const fountain = r.events.find((e) => e.skillCode === 'monster.300302004')!;
    expect(fountain.note).toContain('monsterCharge');
  });
});
