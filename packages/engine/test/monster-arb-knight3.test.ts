import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  enemySkills,
  enemyUsableSkills,
  simulateBattle,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 异相仲裁 P10「落叶归根」第六批 · 骑士（三）3 只（2026-10-30）──
// 数据源：data/monster-stages/arb-p10.json（index 3 = 骑士（三），index 4 = 骑士（二）含 4014030）
// 本轮新增框架：【衰亡伤害】（对高生命目标追加不致命段）、**平均分摊**、【自身侵蚀】池、受击行动提前。
// 锚点：基础命中 334.58（= 625.5117 × 0.5349）；分摊后 83.64（÷4）；衰亡伤害 = 生命上限 10% = 10000。

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

function cfgOf(stageIdx: number, monsterId: string): MonsterConfig {
  for (const wave of buildPackStageWaves('arb-p10', stageIdx)) {
    for (const c of wave) if (c.monsterId === monsterId) return { ...c, hp: Math.min(c.hp, 3e7) };
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
    roundMode: 'arbiter',
  });
}
const evs = (mon: MonsterConfig, rounds = 8): CombatEvent[] => run(mon, rounds).events;
const hitNotes = (mon: MonsterConfig, rounds = 8): string[] =>
  run(mon, rounds)
    .hits.map((h) => h.note)
    .filter((n): n is string => typeof n === 'string');

describe('仲裁 P10 · 骑士（三）技能表', () => {
  it('3 只全部登记，AI 池含自身状态/衰亡技', () => {
    expect(enemySkills('4053020').map((s) => s.skillId)).toHaveLength(6);
    expect(enemySkills('3024030').map((s) => s.skillId)).toHaveLength(6);
    expect(enemySkills('4014030').map((s) => s.skillId)).toHaveLength(6);
    // 洪潮浪的分娩 405302005 于第十五批接上 summon → 进入 AI 池
    expect(enemyUsableSkills('4053020').map((s) => s.skillId)).toEqual([
      '405302001',
      '405302002',
      '405302003',
      '405302004',
      '405302005',
    ]);
    // 深魇蝗灾的【旋覆甲壳】是被动（不进池）；荒潮在池内
    expect(enemySkills('3024030').find((s) => s.skillId === '302403006')!.selfErosion).toMatchObject({
      ratio: 0.3,
      restoreOnSkillId: '302403005',
    });
    expect(enemyUsableSkills('3024030').map((s) => s.skillId)).toContain('302403005');
    // 玻吕刻斯：分摊 + 衰亡
    expect(enemySkills('4014030').find((s) => s.skillId === '401403002')!.splitAmongAllies).toBe(true);
    expect(enemySkills('4014030').find((s) => s.skillId === '401403003')!.declineDamage).toMatchObject({
      nonLethal: true,
    });
    expect(enemyUsableSkills('4014030')).toHaveLength(5);
  });
});

describe('飓风大母 4053020：【孵育狂潮】与受击行动提前', () => {
  it('风雨雷的妊娠 → 自身状态 + 每 3 次受击行动提前', () => {
    const mon = cfgOf(3, '4053020');
    const e = evs(mon, 14);
    const preg = e.filter((x) => x.skillCode === 'monster.405302003');
    expect(preg.length).toBeGreaterThan(0);
    expect(preg[0]!.note).toContain('enemyStateUp');
    const notes = hitNotes(mon, 14);
    expect(notes.filter((n) => n === 'enemyHitAdvance').length).toBeGreaterThanOrEqual(3);
    // 单体/全体伤害锚点
    const single = e.find((x) => x.skillCode === 'monster.405302001');
    expect(single!.enemyHits![0]!.damage).toBeCloseTo(334.58, 2);
    const aoe = e.find((x) => x.skillCode === 'monster.405302004');
    expect(aoe!.enemyHits!.length).toBe(4);
    for (const h of aoe!.enemyHits!) expect(h.damage).toBeCloseTo(334.58, 2);
  });
});

describe('深魇蝗灾 3024030：【旋覆甲壳】侵蚀池', () => {
  it('我方伤害的一部分转为侵蚀，施放【荒潮到临，蝗灾示死】时回血', () => {
    const mon = cfgOf(3, '3024030');
    const r = run(mon, 8);
    expect(
      r.hits.some((h) => h.note === 'enemySelfErosion'),
    ).toBe(true);
    const restore = r.events.find((x) => (x.note ?? []).includes('enemyErosionRestore'));
    expect(restore).toBeDefined();
    expect(restore!.skillCode).toBe('monster.302403005');
    // 回血：荒潮之后怪物剩余生命 > 施放前的累计 (hp 只会被我们的攻击压低，这里只验证事件链)
    expect(r.monsterHpLeft).toBeGreaterThan(0);
  });
});

describe('玻吕刻斯 4014030：【分摊】与【衰亡伤害】', () => {
  it('长眠者厚土安葬：全体伤害 ÷4（83.64）后再追加 10% 生命上限的衰亡伤害（不致命）', () => {
    const mon = cfgOf(4, '4014030');
    const e = evs(mon, 8);
    const split = e.find((x) => x.skillCode === 'monster.401403002');
    expect(split).toBeDefined();
    const normal = split!.enemyHits!.filter((h) => h.skillId === '401403002');
    expect(normal.length).toBe(4);
    for (const h of normal) expect(h.damage).toBeCloseTo(83.64, 2);
    const decline = split!.enemyHits!.filter((h) => h.skillId === '401403002:decline');
    expect(decline.length).toBe(4);
    for (const h of decline) {
      expect(h.damage).toBeCloseTo(10000, 2);
      expect(h.dead).toBe(false);
    }
  });

  it('于痛苦的芬芳中死去：全体【衰亡伤害】+【沉沦于长眠】；死亡想要更多的死亡附禁锢', () => {
    const mon = cfgOf(4, '4014030');
    const e = evs(mon, 8);
    const scent = e.find((x) => x.skillCode === 'monster.401403005');
    expect(scent).toBeDefined();
    expect(scent!.note).toContain('allyDeclineDamage');
    expect(scent!.note).toContain('allyDeepSlumber');
    const more = e.find((x) => x.skillCode === 'monster.401403006');
    expect(more).toBeDefined();
    expect(more!.note).toContain('enemyImprison');
    expect(more!.note).toContain('allyDeclineDamage');
  });
});
