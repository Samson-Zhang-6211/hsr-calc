import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  MONSTER_STAGES,
  STAGE_MONSTERS,
  STAGE_SCALES,
  buildStageMonsterConfigs,
  enemySkills,
  enemyStatusDef,
  enemyStatusMaxStacks,
  enemyStatusShared,
  monsterStage,
  simulateBattle,
  type BattleConfig,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 物竞天择其十二（挑战关卡 第 44 期）接入锚点 ──
// 数据源：data/monster-stages/moc-p44.json（appfeng 页面解析）→ scripts/gen-monster-stages.mjs
//   → packages/engine/src/combat/monster-stages.ts（生成物）
// 技能倍率源：Dimbreath/turnbasedgamedata ExcelOutput/MonsterSkillConfig.json（ParamList[0]）。
// 血量口径：基础值 × 该怪子变体倍率 × 难度乘区（HardLevelGroup=3）。
// 锚点由 monster-stage-dump 临时测试实跑后据实定锚（本文件内公式化断言 + 实测值断言）。

const ALL: Element[] = ['Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary'];
/** 怪物 lv95 打我方 lv80 的防御区：(95+20)/[(95+20)+(80+20)] = 115/215 */
const DEF_ZONE = 115 / 215;

function panel(element: Element, speed: number, attack = 2000): MemberPanel {
  return {
    element,
    level: 80,
    hp: 100000,
    attack,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}
function members(speed = 156): CombatMember[] {
  return [
    { id: 'qingge', panel: panel('Wind', speed) },
    { id: 'sunday', panel: panel('Imaginary', speed - 22) },
    { id: 'jingyuan', panel: panel('Thunder', speed - 21) },
    { id: 'tenghuang', panel: panel('Physical', speed - 22) },
  ];
}
const ORDER = ['qingge', 'sunday', 'jingyuan', 'tenghuang'];

const enemyEvents = (events: CombatEvent[]): CombatEvent[] => events.filter((e) => e.enemyHits);

/** 敌方伤害 = 敌攻 × 倍率 × 防御区（不吃暴击/抗性/韧性区） */
const expected = (atk: number, mult: number): number => atk * mult * DEF_ZONE;

describe('关卡预设表（monster-stages）', () => {
  it('12 关；其十二 = 上半 火/风 + 下半 量子/虚数，总血 4,085,146', () => {
    expect(MONSTER_STAGES.length).toBe(12);
    const s12 = monsterStage(12);
    expect(s12).toBeDefined();
    expect(s12!.name).toBe('物竞天择其十二');
    expect(s12!.f).toBe(12);
    expect(s12!.totalHp).toBe(4085146);

    const up = s12!.halves.find((h) => h.half === '上半')!;
    expect(up.tags).toEqual(['Fire', 'Wind']);
    expect(up.level).toBe(95);
    expect(up.hp).toBe(2112405);
    expect(up.waves.map((w) => w.foes.map((f) => f.monsterId))).toEqual([
      ['5013010', '8003040'],
      ['2034010'],
    ]);
    expect(up.waves[0].foes[0]).toMatchObject({
      monsterId: '5013010',
      hp: 628484,
      count: 1,
      name: '摇滚狂徒',
      rank: '精英',
    });
    expect(up.waves[0].foes[1].hp).toBe(523737);
    expect(up.waves[1].foes[0].hp).toBe(960184);

    const down = s12!.halves.find((h) => h.half === '下半')!;
    expect(down.tags).toEqual(['Quantum', 'Imaginary']);
    expect(down.hp).toBe(1972741);
    expect(down.waves.map((w) => w.foes.map((f) => f.monsterId))).toEqual([
      ['4023010', '4023020'],
      ['5034010'],
    ]);
    expect(down.waves[0].foes[0].hp).toBe(628484);
    expect(down.waves[0].foes[1].hp).toBe(558652);
    expect(down.waves[1].foes[0].hp).toBe(785605);

    // 半边合计 = 该半血量；两半合计 = 全关血量
    const sum = (h: typeof up): number =>
      h.waves.reduce((s, w) => s + w.foes.reduce((x, f) => x + f.hp * f.count, 0), 0);
    expect(sum(up)).toBe(2112405);
    expect(sum(down)).toBe(1972741);
    expect(sum(up) + sum(down)).toBe(4085146);
  });

  it('难度乘区取 HardLevelGroup=3（Lv95）', () => {
    expect(STAGE_SCALES[95].hp).toBeCloseTo(375.438496, 6);
    expect(STAGE_SCALES[95].atk).toBeCloseTo(34.75065, 5);
    expect(STAGE_SCALES[95].spd).toBeCloseTo(1.32, 6);
    expect(STAGE_SCALES[95].stance).toBeCloseTo(1, 6);
    expect(STAGE_SCALES[95].statusHit).toBeCloseTo(0.36, 6);
  });

  it('怪物档案：子变体反推 + 弱点/抗性', () => {
    const rock = STAGE_MONSTERS['5013010'];
    expect(rock.name).toBe('摇滚狂徒');
    expect(rock.enemyClass).toBe('elite');
    expect(rock.childId).toBe(5013010);
    expect(rock.child.hp).toBeCloseTo(1, 6);
    expect(rock.weaknesses).toEqual(['Physical', 'Fire', 'Wind']);
    expect(rock.resistance).toEqual({ Ice: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 });
    // 特殊子变体（血量倍率 ≠ 1）
    expect(STAGE_MONSTERS['8003040'].child.hp).toBeCloseTo(1.5, 6);
    expect(STAGE_MONSTERS['4023010'].child.hp).toBeCloseTo(1.384615, 6);
    expect(STAGE_MONSTERS['4023020'].child.hp).toBeCloseTo(1.454545, 6);
  });
});

describe('关卡 → 引擎配置（buildStageMonsterConfigs）', () => {
  it('上半 2 波：摇滚狂徒 / 蚕食者之影 → 步离战首•呼雷', () => {
    const waves = buildStageMonsterConfigs(12, '上半');
    expect(waves.length).toBe(2);
    expect(waves[0].length).toBe(2);
    expect(waves[1].length).toBe(1);

    const rock = waves[0][0]!;
    expect(rock.monsterId).toBe('5013010');
    expect(rock.name).toBe('摇滚狂徒');
    expect(rock.hp).toBe(628484);
    expect(rock.level).toBe(95);
    expect(rock.attack).toBeCloseTo(625.5117, 4);
    expect(rock.speed).toBeCloseTo(174.24, 4);
    expect(rock.maxToughness).toBe(360);
    expect(rock.weaknesses).toEqual(['Physical', 'Fire', 'Wind']);
    expect(rock.resistance).toEqual({ Ice: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 });
    expect(rock.enemyClass).toBe('elite');

    const shadow = waves[0][1]!;
    expect(shadow.monsterId).toBe('8003040');
    expect(shadow.hp).toBe(523737);
    expect(shadow.speed).toBeCloseTo(227.04, 4);
    expect(shadow.maxToughness).toBe(300);

    const hoolay = waves[1][0]!;
    expect(hoolay.monsterId).toBe('2034010');
    expect(hoolay.hp).toBe(960184);
    expect(hoolay.speed).toBeCloseTo(264, 4);
    expect(hoolay.maxToughness).toBe(720);
  });

  it('下半 2 波：正阳狮鹫 / 月夜天马 → 堕神之血•亚婆离', () => {
    const waves = buildStageMonsterConfigs(12, '下半');
    expect(waves.length).toBe(2);
    expect(waves[0].map((c) => c.monsterId)).toEqual(['4023010', '4023020']);
    expect(waves[1].map((c) => c.monsterId)).toEqual(['5034010']);
    expect(waves[0][0]!.hp).toBe(628484);
    expect(waves[0][0]!.speed).toBeCloseTo(158.4, 4);
    expect(waves[0][0]!.maxToughness).toBe(480);
    expect(waves[0][1]!.hp).toBe(558652);
    expect(waves[0][1]!.speed).toBeCloseTo(132, 4);
    expect(waves[1][0]!.hp).toBe(785605);
    expect(waves[1][0]!.speed).toBeCloseTo(237.6, 4);
    expect(waves[1][0]!.maxToughness).toBe(1080);
  });
});

describe('6 怪技能脚本（倍率取 Dimbreath ParamList[0]）', () => {
  const byId = (id: string): Map<string, ReturnType<typeof enemySkills>[number]> =>
    new Map(enemySkills(id).map((s) => [s.skillId, s]));

  it('摇滚狂徒：扫弦×2.8 / 摇滚时刻×5 / 演出彩排→蓄力', () => {
    const m = byId('5013010');
    expect(m.get('501301001')).toMatchObject({
      target: 'sweep',
      sweep: { from: 'left', count: 3 },
      multiplier: 2.8,
      damageType: 'Imaginary',
    });
    expect(m.get('501301002')).toMatchObject({ target: 'sweep', sweep: { from: 'right' }, multiplier: 2.8 });
    expect(m.get('501301003')).toMatchObject({ target: 'self', charge: { nextSkillId: '501301004' } });
    expect(m.get('501301004')).toMatchObject({ target: 'aoe', multiplier: 5, requiresCharge: true });
    expect(m.get('501301006')!.passive).toBe(true);
  });

  it('蚕食者之影：流年金刺×3 / 谴罚×5 / 绸缪→解放（9 层刻度多段）/ 盾纱减伤 10%', () => {
    const m = byId('8003040');
    expect(m.get('800304002')).toMatchObject({ target: 'single', multiplier: 3 });
    expect(m.get('800304003')).toMatchObject({ target: 'single', multiplier: 5 });
    expect(m.get('800304004')).toMatchObject({
      target: 'self',
      charge: { nextSkillId: '800304005' },
      selfStacks: { kind: 'scaleMarks', value: 9 },
    });
    expect(m.get('800304005')).toMatchObject({
      target: 'random',
      multiplier: 2.25,
      multiHit: { countFrom: 'scaleMarks' },
      requiresCharge: true,
    });
    expect(m.get('800304006')).toMatchObject({ passive: true, selfDamageReduction: 0.1 });
  });

  it('步离战首•呼雷：碎剑×2 / 斩铁×1.8 / 雷动风咆×2 全体 / 贪狼逐驰×5 + 恐惧', () => {
    const m = byId('2034010');
    expect(m.get('203401001')).toMatchObject({ target: 'single', multiplier: 2, damageType: 'Thunder' });
    expect(m.get('203401002')).toMatchObject({ target: 'blast', multiplier: 1.8 });
    expect(m.get('203401003')).toMatchObject({ target: 'aoe', multiplier: 0.2, delayAllies: 0.3 });
    expect(m.get('203401004')).toMatchObject({ target: 'aoe', multiplier: 2 });
    expect(m.get('203401005')).toMatchObject({
      target: 'single',
      multiplier: 5,
      debuff: { kind: 'fear', baseChance: 1, duration: 2 },
    });
    expect(m.get('203401008')!.passive).toBe(true);
  });

  it('正阳狮鹫：穿透黑暗×3 / 降示黎明×2.6 横扫+艾格勒印记 / 点亮未来锁 1 → 赞美艾格勒×4', () => {
    const m = byId('4023010');
    expect(m.get('402301001')).toMatchObject({ target: 'single', multiplier: 3 });
    expect(m.get('402301002')).toMatchObject({
      target: 'sweep',
      multiplier: 2.6,
      mark: { kind: 'aquila', maxStacks: 2 },
    });
    expect(m.get('402301003')).toMatchObject({ charge: { nextSkillId: '402301004' }, lock: 1 });
    expect(m.get('402301004')).toMatchObject({
      target: 'locked',
      multiplier: 4,
      lockedAdjacent: true,
      requiresCharge: true,
      mark: { kind: 'aquila', maxStacks: 2 },
    });
  });

  it('月夜天马：创造月光×3 / 三倍下弦月×2.6 横扫+欧洛尼斯印记 / 两倍上弦月锁 2 → 六倍满月×4.5', () => {
    const m = byId('4023020');
    expect(m.get('402302001')).toMatchObject({ target: 'single', multiplier: 3 });
    expect(m.get('402302002')).toMatchObject({
      target: 'sweep',
      sweep: { from: 'right' },
      multiplier: 2.6,
      mark: { kind: 'olonisi', maxStacks: 2 },
    });
    expect(m.get('402302003')).toMatchObject({ charge: { nextSkillId: '402302004' }, lock: 2 });
    expect(m.get('402302004')).toMatchObject({
      target: 'locked',
      multiplier: 4.5,
      requiresCharge: true,
      mark: { kind: 'olonisi', maxStacks: 2 },
    });
  });

  it('堕神之血•亚婆离：猎食标记×5 + 衰腐 / 饥饿鸣响×1.8 全体 / 万物于我之中×5 全体 + 吞噬', () => {
    const m = byId('5034010');
    expect(m.get('503401001')).toMatchObject({
      target: 'single',
      multiplier: 5,
      debuff: { kind: 'decay', baseChance: 1, duration: 3 },
    });
    expect(m.get('503401002')).toMatchObject({ target: 'aoe', multiplier: 1.8 });
    expect(m.get('503401004')).toMatchObject({
      target: 'aoe',
      multiplier: 5,
      debuff: { kind: 'devour', baseChance: 1, duration: 3 },
    });
    expect(m.get('503401008')!.passive).toBe(true);
  });
});

describe('统一状态框架（monster-status-data）', () => {
  it('定义表：追忆刻度 stack 上限 9；狂奏/月狂/血脑屏障/幻身为 flag', () => {
    expect(enemyStatusDef('scaleMarks')).toMatchObject({ kind: 'stack', maxStacks: 9 });
    expect(enemyStatusMaxStacks('scaleMarks')).toBe(9);
    expect(enemyStatusDef('berserk')?.kind).toBe('flag');
    expect(enemyStatusDef('moonRage')?.kind).toBe('flag');
    expect(enemyStatusDef('bloodBrainBarrier')?.kind).toBe('flag');
    expect(enemyStatusDef('illusion')?.kind).toBe('flag');
  });

  it('共享池：嗜血 shared=true 且不截断（未声明上限 = 不截断）', () => {
    expect(enemyStatusShared('bloodRage')).toBe(true);
    expect(enemyStatusMaxStacks('bloodRage')).toBeUndefined();
    expect(enemyStatusShared('scaleMarks')).toBe(false);
  });

  it('未知状态 id 兜底', () => {
    expect(enemyStatusDef('nope')).toBeUndefined();
    expect(enemyStatusMaxStacks('nope')).toBeUndefined();
    expect(enemyStatusShared('nope')).toBe(false);
  });
});

describe('敌方出手实战锚点', () => {
  const atk = 625.51;
  function cfg(monsterId: string | undefined, over: Partial<MonsterConfig> = {}): BattleConfig {
    const monster: MonsterConfig = {
      level: 95,
      hp: 1e9,
      resistance: {},
      weaknesses: ALL,
      maxToughness: 9999,
      speed: 227,
      enemyClass: 'elite',
      attack: atk,
      ...(monsterId ? { monsterId } : {}),
      ...over,
    };
    return { members: members(), monster, techniques: false, rounds: 6, maxTime: 900 };
  }

  it('月夜天马：创造月光×3 → 1003.73（625.51×3×115/215）', () => {
    const r = simulateBattle(cfg('4023020'));
    const evs = enemyEvents(r.events).filter((e) => e.skillCode === 'monster.402302001');
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) {
      expect(e.enemyHits!.length).toBe(1);
      expect(e.enemyHits![0]!.damage).toBeCloseTo(expected(atk, 3), 4);
    }
  });

  it('摇滚狂徒：扫弦命中 3 个连续目标（×2.8）/ 摇滚时刻全体（×5）', () => {
    const r = simulateBattle(cfg('5013010', { speed: 174.24 }));
    const evs = enemyEvents(r.events);
    const sweep = evs.filter((e) => e.skillCode === 'monster.501301001' || e.skillCode === 'monster.501301002');
    const rock = evs.filter((e) => e.skillCode === 'monster.501301004');
    expect(sweep.length).toBeGreaterThan(0);
    expect(rock.length).toBeGreaterThan(0);
    for (const e of sweep) {
      expect(e.enemyHits!.length).toBe(3);
      for (const h of e.enemyHits!) expect(h.damage).toBeCloseTo(expected(atk, 2.8), 4);
    }
    for (const e of rock) {
      expect(e.enemyHits!.length).toBe(5); // 全体 = 4 成员 + 晴空乐手（memo 进受击池）
      for (const h of e.enemyHits!) expect(h.damage).toBeCloseTo(expected(atk, 5), 4);
    }
    // 横扫方向：从左起 = 编队前 3 人；从右起 = 后 3 人
    const left = sweep.find((e) => e.skillCode === 'monster.501301001');
    if (left) expect(left!.enemyHits!.map((h) => h.targetId)).toEqual(ORDER.slice(0, 3));
    const right = sweep.find((e) => e.skillCode === 'monster.501301002');
    if (right) expect(right!.enemyHits!.map((h) => h.targetId)).toEqual(ORDER.slice(-3));
  });

  it('蓄力锁定：点亮未来锁 1 → 赞美艾格勒只打锁定目标（×4）+ 相邻', () => {
    const r = simulateBattle(cfg('4023010', { speed: 158.4 }));
    const evs = enemyEvents(r.events);
    const charge = evs.find((e) => e.skillCode === 'monster.402301003');
    expect(charge).toBeDefined();
    expect(charge!.note).toContain('monsterCharge');
    expect(charge!.enemyHits!.length).toBe(0);
    const release = evs.find((e) => e.skillCode === 'monster.402301004');
    expect(release).toBeDefined();
    expect(release!.note).toContain('monsterChargeRelease');
    // 锁定 1 人 + 编队相邻（最多 3 人）
    expect(release!.enemyHits!.length).toBeGreaterThanOrEqual(1);
    expect(release!.enemyHits!.length).toBeLessThanOrEqual(3);
    for (const h of release!.enemyHits!) expect(h.damage).toBeCloseTo(expected(atk, 4), 4);
  });

  it('多段：黄金年代的解放 = 剩余【追忆刻度】段数（9 段×752.79）', () => {
    // 慢速队伍：蓄力与释放之间我方几乎不攻击 → 刻度保持 9 层
    const slow: CombatMember[] = [
      { id: 'qingge', panel: panel('Wind', 50) },
      { id: 'sunday', panel: panel('Imaginary', 50) },
    ];
    const r = simulateBattle({
      members: slow,
      monster: {
        level: 95,
        hp: 1e9,
        resistance: {},
        weaknesses: ALL,
        maxToughness: 9999,
        speed: 227,
        enemyClass: 'elite',
        attack: atk,
        monsterId: '8003040',
      },
      techniques: false,
      rounds: 3,
      maxTime: 600,
    });
    const evs = enemyEvents(r.events);
    const release = evs.find((e) => e.skillCode === 'monster.800304005');
    expect(release).toBeDefined();
    expect(release!.note).toContain('monsterChargeRelease');
    expect(release!.enemyHits!.length).toBe(9);
    for (const h of release!.enemyHits!) expect(h.damage).toBeCloseTo(expected(atk, 2.25), 4);
  });

  it('刻度被受击消耗：追忆刻度每受 1 次攻击 -1（释放段数 = 剩余层数 < 9）', () => {
    const r = simulateBattle(cfg('8003040'));
    const evs = enemyEvents(r.events);
    const charge = evs.find((e) => e.skillCode === 'monster.800304004');
    expect(charge).toBeDefined();
    const release = evs.find((e) => e.skillCode === 'monster.800304005');
    expect(release).toBeDefined();
    // 我方高频输出 → 刻度在释放前被消耗 → 释放段数少于 9（文案：无刻度则施放失败）
    expect(release!.enemyHits!.length).toBeLessThan(9);
    expect(release!.enemyHits!.length).toBeGreaterThan(0);
  });

  it('行动延后：裂地三舍使我方全体延后（note monsterDelayAllies）', () => {
    const r = simulateBattle(cfg('2034010', { speed: 264 }));
    const evs = enemyEvents(r.events);
    const delay = evs.find((e) => e.skillCode === 'monster.203401003');
    expect(delay).toBeDefined();
    expect(delay!.note).toContain('monsterDelayAllies');
    for (const h of delay!.enemyHits!) expect(h.damage).toBeCloseTo(expected(atk, 0.2), 4);
  });

  it('怪侧减伤：流年盾纱使我方对其伤害 ×0.9（DoT 通道不适用）', () => {
    const base: MonsterConfig = {
      level: 95,
      hp: 1e9,
      resistance: {},
      weaknesses: ALL,
      maxToughness: 9999,
      speed: 100,
      enemyClass: 'elite',
      attack: 0,
    };
    const plain = simulateBattle({ members: members(), monster: base, techniques: false, rounds: 3, maxTime: 600 });
    const veiled = simulateBattle({
      members: members(),
      monster: { ...base, monsterId: '8003040' },
      techniques: false,
      rounds: 3,
      maxTime: 600,
    });
    const dmgPlain = 3e9 - plain.finalState.monsterHp;
    const dmgVeiled = 3e9 - veiled.finalState.monsterHp;
    expect(dmgPlain).toBeGreaterThan(0);
    expect(dmgVeiled / dmgPlain).toBeCloseTo(0.9, 6);
  });
});

describe('同场多怪与波次推进', () => {
  it('同场两只怪：独立 HP、独立出手', () => {
    const waves = buildStageMonsterConfigs(12, '上半');
    const r = simulateBattle({
      members: members(),
      monsters: waves[0]!,
      techniques: false,
      rounds: 6,
      maxTime: 900,
    });
    const evs = enemyEvents(r.events);
    expect(evs.some((e) => (e.skillCode ?? '').startsWith('monster.5013010'))).toBe(true);
    expect(evs.some((e) => (e.skillCode ?? '').startsWith('monster.8003040'))).toBe(true);
    expect(r.finalState.monsters.length).toBe(3);
    // 第三槽未配置 = 空位（hp 0、不出手）
    expect(r.finalState.monsters[2]!.hp).toBe(0);
    expect(evs.every((e) => e.unitId !== 'monster3')).toBe(true);
  });

  it('波次：上半第一波清空后换到第二波（呼雷），全清才胜利', () => {
    const waves = buildStageMonsterConfigs(12, '上半');
    // 慢速队（speed 100 < 怪 174/227/264）→ 怪能先出手再被清；中等输出 → 波次推进可观测
    const mid: CombatMember[] = [
      { id: 'qingge', panel: panel('Wind', 100, 3e4) },
      { id: 'sunday', panel: panel('Imaginary', 99, 3e4) },
      { id: 'jingyuan', panel: panel('Thunder', 98, 3e4) },
      { id: 'tenghuang', panel: panel('Physical', 97, 3e4) },
    ];
    const r = simulateBattle({
      members: mid,
      monsterWaves: waves,
      techniques: false,
      rounds: 40,
      maxTime: 6000,
    });
    const evs = enemyEvents(r.events);
    // 第一波：摇滚狂徒 + 蚕食者之影；第二波：呼雷
    const iRock = evs.findIndex((e) => (e.skillCode ?? '').startsWith('monster.5013010'));
    const iShadow = evs.findIndex((e) => (e.skillCode ?? '').startsWith('monster.8003040'));
    const iHoolay = evs.findIndex((e) => (e.skillCode ?? '').startsWith('monster.2034010'));
    expect(iRock).toBeGreaterThanOrEqual(0);
    expect(iShadow).toBeGreaterThanOrEqual(0);
    expect(iHoolay).toBeGreaterThanOrEqual(0);
    // 第二波怪必须晚于第一波全部出手（= 第一波已清空才换波）
    const lastWave1 = Math.max(iRock, iShadow);
    expect(iHoolay).toBeGreaterThan(lastWave1);
    expect(r.victory).toBe(true);
    // 未战败：我方仍有存活成员
    expect(Object.values(r.finalState.memberHp).some((v) => v > 0)).toBe(true);
  });

  it('本波最后一只怪在自己回合被击破 DoT 打死 → 立即换波（不等我方下一次行动）', () => {
    // 弱攻队（attack 1）：只负责破韧，本波怪靠击破 DoT（基数 3767）死在自己回合
    // 关键：用真弱点集合（非弱点削韧 ×0.2）→ 破韧晚 → 怪在自己回合才被 DoT 打死
    const weak: CombatMember[] = [
      { id: 'jingyuan', panel: panel('Thunder', 60, 1) },
      { id: 'sunday', panel: panel('Imaginary', 59, 1) },
    ];
    const wave1: MonsterConfig = {
      level: 95,
      hp: 3000,
      resistance: {},
      weaknesses: ['Physical', 'Fire', 'Wind'],
      maxToughness: 30,
      speed: 174,
      enemyClass: 'elite',
      attack: 625,
      monsterId: '5013010',
      name: '摇滚狂徒',
    };
    const wave2: MonsterConfig = {
      level: 95,
      hp: 1e6,
      resistance: {},
      weaknesses: ['Physical', 'Fire', 'Wind'],
      maxToughness: 720,
      speed: 264,
      enemyClass: 'elite',
      attack: 625,
      monsterId: '2034010',
      name: '步离战首•呼雷',
    };
    const r = simulateBattle({
      members: weak,
      monsterWaves: [[wave1], [wave2]],
      techniques: false,
      rounds: 10,
      maxTime: 4000,
    });
    const evs = r.events;
    // 死亡回合：本波怪自己的行动事件，无技能（DoT 打死 → 不出手），命中 = 击破 DoT 跳伤
    const iDeath = evs.findIndex((e) => e.unitId === 'monster1' && e.skillCode === undefined);
    expect(iDeath).toBeGreaterThanOrEqual(0);
    // 死亡回合之前本波怪已行动过（AI 等概率：可能是蓄力/扫弦/燥起来吧）
    expect(
      evs.slice(0, iDeath).some((e) => (e.skillCode ?? '').startsWith('monster.5013010')),
    ).toBe(true);
    const death = evs[iDeath]!;
    expect(death.hitSeqs?.length ?? 0).toBe(1);
    expect(death.enemyHits?.length ?? 0).toBe(0);
    // 换波立即发生：新怪入跑道后首次行动 = 死亡回合 + 10000/264（行动值重置）
    const iWave2 = evs.findIndex((e) => (e.skillCode ?? '').startsWith('monster.2034010'));
    expect(iWave2).toBeGreaterThan(iDeath);
    expect(evs[iWave2]!.time - death.time).toBeCloseTo(10000 / 264, 1);
    // 死亡回合与新怪首动之间没有我方行动（不浪费一次行动在尸体上）
    const between = evs.slice(iDeath + 1, iWave2).filter((e) => e.action && e.action !== 'monster');
    expect(between.length).toBe(0);
  });

  it('多怪模式：死亡怪不再跳 DoT（旧口径「死亡怪仍跳」保持不变）', () => {
    const mem: CombatMember[] = [
      { id: 'jingyuan', panel: panel('Quantum', 120, 2000) },
      { id: 'sunday', panel: panel('Fire', 119, 2000) },
    ];
    const dead: MonsterConfig = {
      level: 95,
      hp: 30000,
      resistance: {},
      weaknesses: ['Physical', 'Fire', 'Wind'],
      maxToughness: 30,
      speed: 227,
      enemyClass: 'elite',
      attack: 100,
      monsterId: '5013010',
    };
    const alive: MonsterConfig = { ...dead, hp: 5e6, maxToughness: 9999, speed: 174 };
    const multi = simulateBattle({
      members: mem,
      monsters: [alive, dead],
      techniques: false,
      rounds: 10,
      maxTime: 2000,
    });
    const legacy = simulateBattle({
      members: mem,
      monster: dead,
      techniques: false,
      rounds: 10,
      maxTime: 2000,
    });
    const src = (r: typeof legacy): string[] => r.report.bySource.map((s) => s.source);
    // 旧口径（config.monster 复制三份）：死亡怪仍跳 DoT → bySource 出现 monster1/2/3
    expect(src(legacy)).toContain('monster1');
    expect(src(legacy)).toContain('monster2');
    expect(src(legacy)).toContain('monster3');
    // 多怪口径：死亡怪（monster2）已破韧（DoT 已注册）但不再跳 DoT → 无 monster* 来源
    expect(src(multi).filter((s) => s.startsWith('monster'))).toEqual([]);
    const deadMon = multi.finalState.monsters[1]!;
    expect(deadMon.hp).toBeLessThan(0);
    // 2026-11-06 裁定③：破韧窗口在敌方恢复回合结束 → 死亡瞬间不一定仍处破韧态
  expect(deadMon.hp).toBeLessThan(0);
  });
});

describe('波次事件（kind:wave · 与轮次/回合并列的第三层）', () => {
  const wave1: MonsterConfig = {
    level: 95,
    hp: 3000,
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Wind'],
    maxToughness: 9999,
    speed: 174,
    enemyClass: 'elite',
    attack: 100,
    monsterId: '5013010',
    name: '摇滚狂徒',
  };
  const wave2: MonsterConfig = {
    level: 95,
    hp: 1e6,
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Wind'],
    maxToughness: 9999,
    speed: 100,
    enemyClass: 'elite',
    attack: 100,
    monsterId: '2034010',
    name: '步离战首•呼雷',
  };
  /** 弱攻队：靠慢成员（speed 60 → av 166.7）在自己行动里打死波次 1 触发换波 */
  const team: CombatMember[] = [
    { id: 'sunday', panel: panel('Imaginary', 200, 1) },
    { id: 'qingge', panel: panel('Wind', 60, 5e4) },
  ];

  it('开战即发第 1 波事件（带新怪名单），且所有事件都带 wave 号', () => {
    const r = simulateBattle({
      members: team,
      monsterWaves: [[wave1], [wave2]],
      techniques: false,
      rounds: 10,
      maxTime: 2000,
    });
    const waves = r.events.filter((e) => e.kind === 'wave');
    expect(waves.length).toBeGreaterThanOrEqual(1);
    expect(r.events[0]!.kind).toBe('wave');
    expect(waves[0]!.wave).toBe(1);
    expect(waves[0]!.waveMonsters?.map((m) => m.monsterId)).toEqual(['5013010']);
    expect(waves[0]!.waveMonsters?.[0]!.name).toBe('摇滚狂徒');
    expect(waves[0]!.waveMonsters?.[0]!.hp).toBe(3000);
    // 所有事件都带当前波次号
    expect(r.events.every((e) => e.wave !== undefined)).toBe(true);
    expect(r.events.every((e) => e.wave === 1 || e.wave === 2)).toBe(true);
  });

  it('换波时发第 2 波事件（新怪名单 = 第二波怪）', () => {
    const r = simulateBattle({
      members: team,
      monsterWaves: [[wave1], [wave2]],
      techniques: false,
      rounds: 10,
      maxTime: 2000,
    });
    const waves = r.events.filter((e) => e.kind === 'wave');
    expect(waves.length).toBe(2);
    expect(waves[1]!.wave).toBe(2);
    expect(waves[1]!.waveMonsters?.map((m) => m.monsterId)).toEqual(['2034010']);
    // 换波事件之前的所有事件都还是 wave 1
    const iWave2 = r.events.findIndex((e) => e.kind === 'wave' && e.wave === 2);
    expect(r.events.slice(0, iWave2).every((e) => e.wave === 1)).toBe(true);
  });

  it('旧口径（单怪 / 同场多怪）无 wave 事件、事件不带 wave 字段（零回归）', () => {
    const legacy = simulateBattle({
      members: team,
      monster: { ...wave1, hp: 1e6 },
      techniques: false,
      rounds: 5,
      maxTime: 1000,
    });
    expect(legacy.events.some((e) => e.kind === 'wave')).toBe(false);
    expect(legacy.events.every((e) => e.wave === undefined)).toBe(true);
    const multi = simulateBattle({
      members: team,
      monsters: [{ ...wave1, hp: 1e6 }, { ...wave2, hp: 1e6 }],
      techniques: false,
      rounds: 5,
      maxTime: 1000,
    });
    expect(multi.events.some((e) => e.kind === 'wave')).toBe(false);
    expect(multi.events.every((e) => e.wave === undefined)).toBe(true);
  });

  it('换波行动值：忘却式刷新全场跑道（轮次计数不动），异相仲裁不刷新', () => {
    const run = (roundMode: 'forgotten' | 'arbiter') => {
      const r = simulateBattle({
        members: team,
        monsterWaves: [[wave1], [wave2]],
        techniques: false,
        rounds: 10,
        maxTime: 2000,
        roundMode,
      });
      const iWave = r.events.findIndex((e) => e.kind === 'wave' && e.wave === 2);
      expect(iWave).toBeGreaterThan(0);
      const waveTime = r.events[iWave]!.time;
      // 换波后第一个行动事件（我方快成员 speed 200 → av 50）
      const next = r.events
        .slice(iWave + 1)
        .find((e) => e.action !== undefined && e.action !== 'monster');
      expect(next).toBeDefined();
      return { waveTime, delta: next!.time - waveTime };
    };
    // 忘却式：刷新全场跑道 → 快成员 av 重置 10000/200 = 50（与换波时刻无关）
    const forgotten = run('forgotten');
    expect(forgotten.delta).toBeCloseTo(50, 1);
    // 异相仲裁：不刷新 → 快成员沿用剩余 av（< 50）→ 更早出手
    const arbiter = run('arbiter');
    expect(arbiter.delta).toBeLessThan(forgotten.delta);
    expect(Math.abs(arbiter.delta - 50)).toBeGreaterThan(0.5);
  });
});

describe('摇滚狂徒 5013010：阿哈时刻联动 / 燥起来吧两分支 / 陶醉', () => {
  const atk = 625;
  /** 怪 lv95 打我方 lv80 的防御区 */
  const rockZone = 115 / 215;
  const rock = (): MonsterConfig => ({
    level: 95,
    hp: 1e6,
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Wind'],
    maxToughness: 9999,
    speed: 174,
    enemyClass: 'elite',
    attack: atk,
    monsterId: '5013010',
    name: '摇滚狂徒',
  });
  const run = (): ReturnType<typeof simulateBattle> =>
    simulateBattle({
      members: [
        { id: 'langzun', panel: panel('Quantum', 100, 2000) },
        { id: 'sunday', panel: panel('Imaginary', 99, 2000) },
      ],
      monster: rock(),
      elationAha: { present: true, panelSpeed: 100 },
      techniques: false,
      rounds: 30,
      maxTime: 3000,
    });

  it('阿哈时刻：授予狂奏 + 解除演出彩排蓄力 + 我方获得笑点 + 怪物自身易伤', () => {
    const r = run();
    const aha = r.events.filter((e) => e.action === 'ahaMoment');
    expect(aha.length).toBeGreaterThan(0);
    // 被动【我为乐狂】→ 阿哈时刻给予狂奏
    expect(aha.some((e) => (e.note ?? []).includes('monsterAhaPassive'))).toBe(true);
    // 演出彩排蓄力被解除 → 我方获得笑点 + 怪物自身易伤
    const cancelled = aha.find((e) => (e.note ?? []).includes('monsterAhaCancel'));
    expect(cancelled).toBeDefined();
    expect(cancelled!.note ?? []).toContain('monsterLaugh');
    expect(cancelled!.note ?? []).toContain('monsterSelfVuln');
  });

  it('燥起来吧两分支：非狂奏 = 我方速度提高（无伤害）；狂奏 = 全体虚数伤害 + 笑点', () => {
    const r = run();
    const hype = r.events.filter((e) => e.skillCode === 'monster.501301005');
    expect(hype.length).toBeGreaterThan(0);
    const plain = hype.find((e) => (e.note ?? []).includes('allySpeedUp'));
    expect(plain).toBeDefined();
    expect(plain!.enemyHits?.length ?? 0).toBe(0);
    const berserk = hype.find((e) => (e.enemyHits?.length ?? 0) > 0);
    expect(berserk).toBeDefined();
    expect(berserk!.enemyHits!.length).toBe(2);
    for (const h of berserk!.enemyHits!) expect(h.damage).toBeCloseTo(atk * 0.5 * rockZone, 4);
    expect(berserk!.note ?? []).toContain('monsterLaugh');
  });

  it('陶醉：狂奏分支概率使我方无法行动（action=skip）', () => {
    const r = run();
    const skipped = r.events.filter((e) => e.action === 'skip');
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped[0]!.note ?? []).toContain('allyDrunk');
    expect(skipped[0]!.skillCode).toBeUndefined();
  });
});

describe('蚕食者之影 8003040：流年盾纱禁锢', () => {
  const atk = 625.51;
  const pair: CombatMember[] = [
    { id: 'qingge', panel: panel('Wind', 120) },
    { id: 'sunday', panel: panel('Imaginary', 119) },
  ];
  it('被攻击目标概率陷入禁锢 → 无法行动（action=skip / note allyImprison）', () => {
    const r = simulateBattle({
      members: pair,
      monster: {
        level: 95,
        hp: 1e9,
        resistance: {},
        weaknesses: ['Physical', 'Fire', 'Wind'],
        maxToughness: 9999,
        speed: 227,
        enemyClass: 'elite',
        attack: atk,
        monsterId: '8003040',
      },
      techniques: false,
      rounds: 6,
      maxTime: 900,
      seed: 1,
    });
    const skips = r.events.filter((e) => e.action === 'skip');
    expect(skips.length).toBeGreaterThan(0);
    expect(skips[0]!.note ?? []).toContain('allyImprison');
    expect(skips[0]!.skillCode).toBeUndefined();
    // 施加点：怪的攻击事件带 enemyImprison 备注（禁锢来自流年盾纱被动，ParamList[1]=0.2）
    expect(r.events.some((e) => (e.note ?? []).includes('enemyImprison'))).toBe(true);
  });
});

// ── 敌方召唤物（M1 独立敌方实体，2026-10-22）──
// 召唤物 = 另一个怪档案，独立 HP/速度/韧性/技能表，可上行动条（side:'enemy'），
// 行动事件 unitId = enemy1..enemy4（与三个木桩不同槽）。
// 难度乘区取 STAGE_SCALES[95]（HardLevelGroup=3）：狼卒 atk = 12×34.75065 = 417.0078；铁鹰 atk = 18×34.75065 = 625.51。
describe('敌方召唤物（M1：独立敌方实体）', () => {
  const summonTeam = (): CombatMember[] => [
    { id: 'qingge', panel: panel('Wind', 120, 100) },
    { id: 'sunday', panel: panel('Imaginary', 119, 100) },
  ];
  const wolfAtk = 12 * STAGE_SCALES[95]!.atk;
  const eagleAtk = 18 * STAGE_SCALES[95]!.atk;

  it('呼雷【召集狼群】：召唤狼卒并上行动条出手（厮杀×1.8 / 啃噬×2.8）', () => {
    const r = simulateBattle({
      members: summonTeam(),
      monster: {
        level: 95,
        hp: 1e9,
        resistance: {},
        weaknesses: ['Physical', 'Fire', 'Wind'],
        maxToughness: 9999,
        speed: 264,
        enemyClass: 'elite',
        attack: 625.51,
        monsterId: '2034010',
      },
      techniques: false,
      rounds: 8,
      maxTime: 1200,
      seed: 7,
    });
    // 召唤发生：召唤者行动带 note enemySummon
    expect(r.events.some((e) => (e.note ?? []).includes('enemySummon'))).toBe(true);
    // 召唤物独立行动：unitId = enemy1..enemy4
    const unitActs = r.events.filter((e) => (e.unitId ?? '').startsWith('enemy'));
    expect(unitActs.length).toBeGreaterThan(0);
    for (const e of unitActs) {
      expect(e.action).toBe('monster');
      expect(e.skillCode).toMatch(/^monster\.(203201001|203202001)$/);
      expect(e.enemyHits!.length).toBeGreaterThan(0);
      for (const h of e.enemyHits!) {
        const mult = h.skillId === '203201001' ? 1.8 : 2.8;
        expect(h.damage).toBeCloseTo(expected(wolfAtk, mult), 2);
      }
    }
    // 召唤上限（maxAlive=2/召唤者）→ 满额时记 summonLimit
    expect(r.events.some((e) => (e.note ?? []).includes('summonLimit'))).toBe(true);
  });

  it('正阳狮鹫【降示黎明】：召唤流星铁鹰（划破夜空×2）', () => {
    const r = simulateBattle({
      members: summonTeam(),
      monster: {
        level: 95,
        hp: 1e9,
        resistance: {},
        weaknesses: ['Physical', 'Fire', 'Wind'],
        maxToughness: 9999,
        speed: 158.4,
        enemyClass: 'elite',
        attack: 625.51,
        monsterId: '4023010',
      },
      techniques: false,
      rounds: 8,
      maxTime: 1200,
      seed: 7,
    });
    const unitActs = r.events.filter((e) => (e.unitId ?? '').startsWith('enemy'));
    expect(unitActs.length).toBeGreaterThan(0);
    for (const e of unitActs) {
      expect(e.skillCode).toBe('monster.402201001');
      expect(e.enemyHits!.length).toBe(1);
      for (const h of e.enemyHits!) expect(h.damage).toBeCloseTo(expected(eagleAtk, 2), 2);
    }
  });
});

// 步离战首•呼雷 2034010：恐惧萦绕时序（延迟发作 + 施加者可解除）/ 嗜血·月狂（共享层数 + 速度提高）
describe('步离战首•呼雷 2034010：恐惧萦绕 / 嗜血·月狂', () => {
  const hulei: MonsterConfig = {
    level: 95,
    hp: 1e9,
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Wind'],
    maxToughness: 720,
    speed: 264,
    enemyClass: 'elite',
    attack: 625.51,
    monsterId: '2034010',
  };
  /** 无技能的陪衬（无 monsterId → 不出手）；我方默认打 monster1 → 不会打到施加恐惧的 monster2 */
  const dummy: MonsterConfig = {
    level: 95,
    hp: 1e9,
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Wind'],
    maxToughness: 720,
    speed: 1,
    enemyClass: 'elite',
    attack: 0,
  };

  it('恐惧萦绕：延迟到第 2 轮发作 → 我方成员无法行动（skip + allyFear）', () => {
    // 治疗二人组（不攻击）→ 不会被「发作前攻击施加者可解除」打断
    const r = simulateBattle({
      members: [
        { id: 'sunday', panel: panel('Imaginary', 60, 0) },
        { id: 'natasha', panel: panel('Quantum', 59, 0) },
      ],
      monsters: [dummy, hulei],
      rounds: 12,
      maxTime: 4000,
      seed: 1,
    });
    // 施加了恐惧萦绕
    expect(r.events.some((e) => (e.note ?? []).includes('enemyFear'))).toBe(true);
    // 发作 → 我方成员行动被跳过
    const skips = r.events.filter((e) => e.action === 'skip' && (e.note ?? []).includes('allyFear'));
    expect(skips.length).toBeGreaterThan(0);
    // 发作轮次 ≥ 施加轮次 + 2（「第二个回合开始时陷入【恐惧】」）
    for (const s of skips) {
      const appliedRounds = r.events
        .filter((e) => (e.note ?? []).includes('enemyFear') && e.round < s.round)
        .map((e) => e.round);
      expect(appliedRounds.length).toBeGreaterThan(0);
      expect(s.round - Math.min(...appliedRounds)).toBeGreaterThanOrEqual(2);
    }
  });

  it('嗜血·月狂：我方攻击累积共享层数 → 进入月狂（速度提高 80%）', () => {
    const r = simulateBattle({
      members: [
        { id: 'jingyuan', panel: panel('Thunder', 200, 2000) },
        { id: 'sunday', panel: panel('Imaginary', 199, 2000) },
      ],
      monsters: [dummy, hulei],
      rounds: 10,
      maxTime: 3000,
      seed: 3,
    });
    const monActs = r.events.filter((e) => e.unitId === 'monster2' && e.action === 'monster');
    expect(monActs.length).toBeGreaterThan(3);
    // 首次行动 = 10000/264（尚未进入月狂）
    expect(monActs[0]!.time).toBeCloseTo(10000 / 264, 1);
    // 进入月狂后行动间隔 = 10000/(264×1.8) ≈ 21.05
    const gaps: number[] = [];
    for (let i = 1; i < monActs.length; i += 1) gaps.push(monActs[i]!.time - monActs[i - 1]!.time);
    expect(gaps.some((g) => Math.abs(g - 10000 / (264 * 1.8)) < 0.5)).toBe(true);
  });
});

describe('正阳狮鹫 4023010 / 月夜天马 4023020：印记解除半句', () => {
  const griffin: MonsterConfig = {
    level: 95,
    hp: 1e9,
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Wind'],
    maxToughness: 480,
    speed: 158.4,
    enemyClass: 'elite',
    attack: 625.51,
    monsterId: '4023010',
  };
  const unicorn: MonsterConfig = {
    level: 95,
    hp: 1e9,
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Wind'],
    maxToughness: 480,
    speed: 132,
    enemyClass: 'elite',
    attack: 625.51,
    monsterId: '4023020',
  };
  /** 陪衬（无技能表 → 不出手） */
  const dummyMark: MonsterConfig = {
    level: 95,
    hp: 1e9,
    resistance: {},
    weaknesses: ['Physical', 'Fire', 'Wind'],
    maxToughness: 480,
    speed: 1,
    enemyClass: 'elite',
    attack: 0,
  };
  const team = (): CombatMember[] => [
    { id: 'jingyuan', panel: panel('Thunder', 100, 2000) },
    { id: 'sunday', panel: panel('Imaginary', 99, 2000) },
  ];

  it('艾格勒印记 2 层 → 解除 + 火属性伤害 + 减少能量', () => {
    const r = simulateBattle({
      members: team(),
      monsters: [griffin, dummyMark],
      rounds: 10,
      maxTime: 3000,
      seed: 1,
    });
    const rel = r.events.filter((e) => (e.note ?? []).includes('enemyMarkRelease'));
    expect(rel.length).toBeGreaterThan(0);
    expect((rel[0]!.note ?? []).includes('enemyMarkDamage')).toBe(true);
    expect((rel[0]!.note ?? []).includes('enemyEnergyLoss')).toBe(true);
  });

  it('欧洛尼斯印记 2 层 → 解除 + 量子伤害 + 纠缠（我方无法行动）', () => {
    const r = simulateBattle({
      members: team(),
      monsters: [unicorn, dummyMark],
      rounds: 10,
      maxTime: 3000,
      seed: 2,
    });
    const rel = r.events.filter((e) => (e.note ?? []).includes('enemyMarkRelease'));
    expect(rel.length).toBeGreaterThan(0);
    expect((rel[0]!.note ?? []).includes('enemyMarkDamage')).toBe(true);
    expect((rel[0]!.note ?? []).includes('allyEntangle')).toBe(true);
    const skip = r.events.find((e) => e.action === 'skip' && (e.note ?? []).includes('allyEntangle'));
    expect(skip).toBeDefined();
  });

  it('同时持有艾格勒与欧洛尼斯 → 解除所有印记 + 真实伤害 + 减少能量 + 纠缠', () => {
    const r = simulateBattle({
      members: team(),
      monsters: [griffin, unicorn],
      rounds: 10,
      maxTime: 3000,
      seed: 13,
    });
    const rel = r.events.filter(
      (e) => (e.note ?? []).includes('enemyMarkRelease') && (e.note ?? []).includes('allyEntangle'),
    );
    expect(rel.length).toBeGreaterThan(0);
    expect((rel[0]!.note ?? []).includes('enemyMarkDamage')).toBe(true);
    expect((rel[0]!.note ?? []).includes('enemyEnergyLoss')).toBe(true);
  });

  it('我方消灭敌方目标 → 解除艾格勒印记（解除后需重新叠满 2 层才再触发）', () => {
    const killable: MonsterConfig = { ...dummyMark, hp: 1 };
    const r = simulateBattle({
      members: team(),
      monsters: [griffin, killable],
      rounds: 10,
      maxTime: 3000,
      seed: 1,
    });
    // 我方首个攻击（t≈100）击杀陪衬 → 艾格勒印记被解除 → 之后需重新叠满 2 层才再次触发解除
    // （无解除时：首次解除前只有 2 个 enemyMark；有解除时：4 个）
    const relIdx = r.events.findIndex((e) => (e.note ?? []).includes('enemyMarkRelease'));
    expect(relIdx).toBeGreaterThan(0);
    const marksBefore = r.events
      .slice(0, relIdx)
      .reduce((acc, e) => acc + (e.note ?? []).filter((n) => n === 'enemyMark').length, 0);
    expect(marksBefore).toBe(4);
  });
});

describe('堕神之血•亚婆离 5034010：贪饕之眼 / 血脑屏障', () => {
  const yabuli = (over: Partial<MonsterConfig> = {}): MonsterConfig => ({
    level: 95,
    hp: 1e6,
    resistance: {},
    weaknesses: ['Ice', 'Quantum', 'Imaginary'],
    maxToughness: 1080,
    speed: 237.6,
    enemyClass: 'elite',
    attack: 625.51,
    monsterId: '5034010',
    ...over,
  });
  const dummyY: MonsterConfig = {
    level: 95,
    hp: 1e9,
    resistance: {},
    weaknesses: ['Ice', 'Quantum', 'Imaginary'],
    maxToughness: 1080,
    speed: 1,
    enemyClass: 'elite',
    attack: 0,
  };

  it('兽瞳百相：每次行动叠 1 层【贪饕之眼】，达 40 层立刻施放【万物于我之中】', () => {
    // 【幻身】（2026-10-23）接上后：成员行动太少会被堕神衰腐打到幻身 → 战斗提前结束。
    // 故成员速度拉到与亚婆离同量级（自己行动递减衰腐层数），保证能跑满 40 层。
    const members: CombatMember[] = [
      { id: 'sunday', panel: { ...panel('Imaginary', 999, 0), hp: 1e6 } },
      { id: 'natasha', panel: { ...panel('Quantum', 998, 0), hp: 1e6 } },
    ];
    const r = simulateBattle({
      members,
      monsters: [yabuli({ speed: 1000 }), dummyY],
      rounds: 80,
      maxTime: 3000,
      seed: 5,
    });
    const eyes = r.events.filter((e) => (e.note ?? []).includes('enemyGluttonyEye'));
    expect(eyes.length).toBeGreaterThanOrEqual(40);
    const castIdx = r.events.findIndex((e) => (e.note ?? []).includes('enemyGluttonyCast'));
    expect(castIdx).toBeGreaterThanOrEqual(0);
    // 达阈值的当次行动结束后立刻追加一次行动 → 施放【万物于我之中】
    const after = r.events.slice(castIdx + 1).find((e) => e.unitId === 'monster1');
    expect(after?.skillCode).toBe('monster.503401004');
    // 两次触发之间约 40 次行动（阈值 40）
    const castIdxs = r.events
      .map((e, i) => ((e.note ?? []).includes('enemyGluttonyCast') ? i : -1))
      .filter((i) => i >= 0);
    expect(castIdxs.length).toBeGreaterThanOrEqual(2);
    const eyesBetween = r.events
      .slice(castIdxs[0]!, castIdxs[1]!)
      .filter((e) => (e.note ?? []).includes('enemyGluttonyEye')).length;
    expect(eyesBetween).toBeGreaterThanOrEqual(38);
    expect(eyesBetween).toBeLessThanOrEqual(40);
  });

  it('血脑屏障：生命值低于 30% 获得 → 伤害降低 80% + 韧性无法被削减', () => {
    const members: CombatMember[] = [
      { id: 'jingyuan', panel: { ...panel('Thunder', 200, 3000), hp: 1e6 } },
      { id: 'sunday', panel: { ...panel('Imaginary', 199, 0), hp: 1e6 } },
    ];
    const r = simulateBattle({
      members,
      monsters: [yabuli({ hp: 1e6, maxToughness: 10000, speed: 100 }), dummyY],
      rounds: 30,
      maxTime: 8000,
      seed: 5,
    });
    // 屏障期间：hit 的 reduction 乘区 = 0.2（伤害降低 80%）
    const reduced = r.hits.filter((h) =>
      h.factors.some((f) => f.key === 'reduction' && Math.abs(f.value - 0.2) < 1e-6),
    );
    expect(reduced.length).toBeGreaterThan(0);
    // 韧性无法被削减：屏障获得后韧性不再下降（全程未破韧）
    const m = r.finalState.monsters[0]!;
    expect(m.broken).toBe(false);
    expect(m.toughness).toBeGreaterThan(8000);
  });
});
;

describe('堕神之血•亚婆离 5034010：召唤物可击杀 / 稳态失衡 / 幻身 / 源质吞噬', () => {
  const yabuli = (over: Partial<MonsterConfig> = {}): MonsterConfig => ({
    level: 95,
    hp: 1e6,
    resistance: {},
    weaknesses: ['Ice', 'Quantum', 'Imaginary'],
    maxToughness: 1080,
    speed: 237.6,
    enemyClass: 'elite',
    attack: 625.51,
    monsterId: '5034010',
    name: '亚婆离',
    ...over,
  });
  const dummyY = (over: Partial<MonsterConfig> = {}): MonsterConfig => ({
    ...yabuli(),
    hp: 1,
    speed: 1,
    attack: 0,
    maxToughness: 1,
    monsterId: undefined,
    name: 'dummy',
    ...over,
  });

  it('敌方召唤物进入目标池：指定 enemy1 → 单体攻击改打召唤物，击杀触发联动（亚婆离生命值降低）', () => {
    const members: CombatMember[] = [
      { id: 'jingyuan', panel: panel('Thunder', 200, 200000) },
      { id: 'sunday', panel: panel('Imaginary', 199, 0) },
    ];
    const bossMaxHp = 1e9;
    const r = simulateBattle({
      members,
      monsters: [yabuli({ hp: bossMaxHp }), dummyY({ hp: 1e9, maxToughness: 99999 })],
      enemyTarget: 'enemy1',
      rounds: 12,
      maxTime: 3000,
      seed: 1,
    });
    // 召唤发生（胎儿之梦：每次行动召唤 1 只狂兽的胚芽）
    expect(r.events.some((e) => (e.note ?? []).includes('enemySummon'))).toBe(true);
    // 我方命中确实落到召唤物槽位 enemy1，并被击杀
    const onSummon = r.hits.filter((h) => h.target === 'enemy1');
    expect(onSummon.length).toBeGreaterThan(0);
    expect(onSummon.some((h) => h.note === 'enemyKilled')).toBe(true);
    // 击杀联动（summonDeathEffect.hpRatio 0.02）：亚婆离生命值按上限 2% 递减（至少一次）
    expect(r.finalState.monsters[0]!.hp).toBeLessThanOrEqual(bossMaxHp - bossMaxHp * 0.02);
  });

  it('稳态失衡：血脑屏障获得后行动序列条目生效 → 屏障解除 + 自身受到大量伤害（98% 生命上限）', () => {
    const members: CombatMember[] = [
      { id: 'jingyuan', panel: panel('Thunder', 200, 30000) },
      { id: 'sunday', panel: panel('Imaginary', 199, 0) },
    ];
    const r = simulateBattle({
      members,
      monsters: [yabuli({ hp: 1e6, maxToughness: 10000, speed: 100 }), dummyY()],
      rounds: 30,
      maxTime: 8000,
      seed: 5,
    });
    const breakEv = r.events.find((e) => (e.note ?? []).includes('enemyBarrierBreak'));
    expect(breakEv).toBeTruthy();
    expect(breakEv!.note).toContain('enemyBarrierSelfDamage');
    // 自身受到 98% 生命上限伤害 → 1e6 血的亚婆离被打死（生命值 ≤ -8e5）
    expect(r.finalState.monsters[0]!.hp).toBeLessThanOrEqual(-800000);
    expect(r.victory).toBe(true);
  });

  it('幻身：堕神衰腐达阈值 → 角色离场 + 召唤替身；全体陷入幻身 → 战斗失败', () => {
    const members: CombatMember[] = [
      { id: 'sunday', panel: panel('Imaginary', 50, 0) },
      { id: 'natasha', panel: panel('Quantum', 49, 0) },
    ];
    const r = simulateBattle({
      members,
      monsters: [yabuli({ speed: 300 }), dummyY()],
      rounds: 30,
      maxTime: 8000,
      seed: 2,
    });
    const illusionNotes = r.events.filter((e) => (e.note ?? []).includes('allyIllusion'));
    expect(illusionNotes.length).toBeGreaterThanOrEqual(2);
    expect(illusionNotes[0]!.note).toContain('allyIllusionSummon');
    expect(r.finalState.illusioned?.sort()).toEqual(['natasha', 'sunday']);
    expect(r.finalState.illusionStandIns?.length).toBe(2);
    expect(r.defeated).toBe(true);
  });

  it('源质吞噬：可回复生命上限随层数降低（治疗被压在上限内）', () => {
    const members: CombatMember[] = [
      { id: 'sunday', panel: panel('Imaginary', 60, 0) },
      { id: 'natasha', panel: panel('Quantum', 59, 0) },
    ];
    const r = simulateBattle({
      members,
      monsters: [yabuli({ speed: 200 }), dummyY()],
      rounds: 20,
      maxTime: 6000,
      seed: 2,
    });
    const devourNotes = r.events.filter((e) => (e.note ?? []).includes('enemyDevour'));
    expect(devourNotes.length).toBeGreaterThanOrEqual(4);
    // 叠层后治疗上限降至 ≤60%（DEVOUR_HEAL_CUT_MAX）→ 治疗满血上限被压低
    for (const hp of Object.values(r.finalState.memberHp)) {
      expect(hp).toBeLessThan(100000 * 0.5);
    }
  });
});
