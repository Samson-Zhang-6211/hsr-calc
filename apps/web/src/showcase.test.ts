import { describe, expect, it } from 'vitest';
import {
  mainAffixTable,
  subAffixTable,
  type CharacterDetail,
} from './game-data.js';
import {
  mapRelic,
  normalizePointId,
  parseShowcase,
  relicPiecesFromShowcase,
  relicRarityFromTid,
  relicSetIdFromTid,
  resolveSkillLevels,
  resolveTraceChecked,
  setsFromShowcase,
  type AffixTables,
  type EnkaRelic,
  type EnkaShowcase,
} from './showcase.js';

/**
 * 展示柜映射单测。数值锚点来自 2026-10-26 对真实 Enka 响应的实测核对：
 * - 5 星头 61021 + 主词条 1 → HPDelta 705.6（本地 main 表 base+step×15）
 * - 副词条换算 **cnt×base + step×stepField**（103/103 实测吻合）
 * 词条表直接用 `data/relic-affixes`（数据漂移时这里会红）。
 */

const TABLES: AffixTables = { main: mainAffixTable(), sub: subAffixTable() };

function mainValue(rarity: number, slot: number, affixId: number, level: number): number {
  const row = TABLES.main[`${rarity}${slot}`][String(affixId)];
  expect(row, `main 表缺少 ${rarity}星${slot}号位 affix ${affixId}`).toBeTruthy();
  return row.base + row.step * level;
}

function headMain5(level = 15): number {
  return mainValue(5, 1, 1, level);
}

describe('showcase · id 换算', () => {
  it('pointId 归一化：8 位内部 id 去掉首位（11004001 → 1004001）', () => {
    expect(normalizePointId(11004001)).toBe(1004001);
    expect(normalizePointId(11205001)).toBe(1205001);
    expect(normalizePointId(1213001)).toBe(1213001);
    expect(normalizePointId(1303201)).toBe(1303201);
  });

  it('稀有度：tid 前缀 6=5星 … 3=2星，未知前缀返回 null', () => {
    expect(relicRarityFromTid(61021)).toBe(5);
    expect(relicRarityFromTid(51021)).toBe(4);
    expect(relicRarityFromTid(41021)).toBe(3);
    expect(relicRarityFromTid(31021)).toBe(2);
    expect(relicRarityFromTid(91021)).toBe(null);
  });

  it('套装 id：tid = 60000 + setID×10 + 部位', () => {
    expect(relicSetIdFromTid(61021)).toBe('102');
    expect(relicSetIdFromTid(63095)).toBe('309');
    expect(relicSetIdFromTid(61261)).toBe('126');
  });
});

describe('showcase · 遗器映射', () => {
  it('5 星头：主词条按本地表复算，副词条取 props 精确值', () => {
    const relic: EnkaRelic = {
      tid: 61021,
      type: 1,
      level: 15,
      mainAffixId: 1,
      subAffixList: [
        { affixId: 4, cnt: 3, step: 3 },
        { affixId: 5, cnt: 2, step: 4 },
        { affixId: 6, cnt: 2, step: 3 },
        { affixId: 9, cnt: 1 },
      ],
      _flat: {
        setID: 102,
        props: [
          { type: 'HPDelta', value: 705.6 },
          { type: 'HPAddedRatio', value: 0.11664 },
          { type: 'AttackAddedRatio', value: 0.0864 },
          { type: 'DefenceAddedRatio', value: 0.1026 },
          { type: 'CriticalDamageBase', value: 0.05184 },
        ],
      },
    };
    const out = mapRelic(relic, TABLES);
    expect(out).toBeTruthy();
    expect(out!.slot).toBe(1);
    expect(out!.setId).toBe('102');
    expect(out!.rarity).toBe(5);
    expect(out!.rarityVerified).toBe(true);
    expect(out!.approximate).toBe(false);
    expect(out!.mainProperty).toBe('HPDelta');
    expect(out!.mainValue).toBeCloseTo(705.6, 6);
    expect(out!.mainValue).toBeCloseTo(headMain5(), 6);
    expect(out!.subs).toEqual([
      { property: 'HPAddedRatio', value: 0.11664, rolls: 3 },
      { property: 'AttackAddedRatio', value: 0.0864, rolls: 2 },
      { property: 'DefenceAddedRatio', value: 0.1026, rolls: 2 },
      { property: 'CriticalDamageBase', value: 0.05184, rolls: 1 },
    ]);
  });

  it('4 星：按 tid 前缀取 4 星主词条表并用 props 校验', () => {
    const level = 12;
    const value = mainValue(4, 1, 1, level);
    const out = mapRelic(
      {
        tid: 51021,
        type: 1,
        level,
        mainAffixId: 1,
        subAffixList: [{ affixId: 7, cnt: 1 }],
        _flat: {
          setID: 102,
          props: [
            { type: 'HPDelta', value },
            { type: 'SpeedDelta', value: 2 },
          ],
        },
      },
      TABLES,
    );
    expect(out!.rarity).toBe(4);
    expect(out!.rarityVerified).toBe(true);
    expect(out!.mainValue).toBeCloseTo(value, 6);
    expect(out!.subs[0]).toEqual({ property: 'SpeedDelta', value: 2, rolls: 1 });
  });

  it('主副词条同属性被合并时：主词条取表值，剩余部分给副词条', () => {
    const main = mainValue(5, 3, 1, 15); // 躯干 生命%
    const sub = TABLES.sub['5']['4'].base; // 副词条 生命% 初始档
    const merged = main + sub;
    const out = mapRelic(
      {
        tid: 61103,
        type: 3,
        level: 15,
        mainAffixId: 1,
        subAffixList: [{ affixId: 4, cnt: 1 }],
        _flat: {
          setID: 110,
          props: [{ type: 'HPAddedRatio', value: merged }],
        },
      },
      TABLES,
    );
    expect(out!.mainProperty).toBe('HPAddedRatio');
    expect(out!.mainValue).toBeCloseTo(main, 9);
    expect(out!.subs).toHaveLength(1);
    expect(out!.subs[0].property).toBe('HPAddedRatio');
    expect(out!.subs[0].value).toBeCloseTo(sub, 9);
  });

  it('缺 _flat.props 时用 cnt×base+step×stepField 近似，并标 approximate', () => {
    const row = TABLES.sub['5']['4'];
    const out = mapRelic(
      { tid: 61023, type: 3, level: 15, mainAffixId: 1, subAffixList: [{ affixId: 4, cnt: 2, step: 3 }] },
      TABLES,
    );
    expect(out!.approximate).toBe(true);
    expect(out!.rarityVerified).toBe(false);
    expect(out!.subs[0].value).toBeCloseTo(2 * row.base + row.step * 3, 9);
  });

  it('位面球元素主词条：affix 10 = 虚数伤害', () => {
    const out = mapRelic(
      {
        tid: 63095,
        type: 5,
        level: 15,
        mainAffixId: 10,
        subAffixList: [],
        _flat: {
          setID: 309,
          props: [{ type: 'ImaginaryAddedRatio', value: mainValue(5, 5, 10, 15) }],
        },
      },
      TABLES,
    );
    expect(out!.mainProperty).toBe('ImaginaryAddedRatio');
    expect(out!.subs).toEqual([]);
  });
});

describe('showcase · 响应解析', () => {
  const JSON_FIXTURE: EnkaShowcase = {
    uid: '100000001',
    ttl: 60,
    region: 'CN',
    detailInfo: {
      nickname: '测试员',
      level: 70,
      signature: '签名',
      avatarDetailList: [
        {
          avatarId: 1213,
          level: 80,
          promotion: 6,
          rank: 2,
          pos: 1,
          skillTreeList: [
            { pointId: 1213001, level: 6 },
            { pointId: 1213201, level: 1 },
          ],
          equipment: { tid: 23015, rank: 1, level: 80, promotion: 6 },
          relicList: [
            {
              tid: 61021,
              type: 1,
              level: 15,
              mainAffixId: 1,
              subAffixList: [],
              _flat: { setID: 102, props: [{ type: 'HPDelta', value: headMain5() }] },
            },
          ],
        },
        // 0 星魂 / +0 遗器：rank 与 level 字段整个缺失
        {
          avatarId: 9999,
          level: 70,
          skillTreeList: [],
          relicList: [{ tid: 61102, type: 2, mainAffixId: 1 }],
        },
      ],
    },
  };

  it('玩家信息与角色顺序、未知角色名册判定', () => {
    const player = parseShowcase(JSON_FIXTURE, TABLES, new Set(['1213']));
    expect(player.uid).toBe('100000001');
    expect(player.nickname).toBe('测试员');
    expect(player.level).toBe(70);
    expect(player.region).toBe('CN');
    expect(player.ttl).toBe(60);
    expect(player.chars).toHaveLength(2);
    const first = player.chars[0];
    expect(first.rosterId).toBe('1213');
    expect(first.eidolon).toBe(2);
    expect(first.lightcone).toEqual({ id: '23015', refinement: 1, level: 80, promotion: 6 });
    expect(first.relics).toHaveLength(1);
    expect(first.points).toEqual([
      { pointId: 1213001, level: 6 },
      { pointId: 1213201, level: 1 },
    ]);
    const second = player.chars[1];
    expect(second.rosterId).toBe(null);
    expect(second.eidolon).toBe(0);
    expect(second.lightcone).toBe(null);
    expect(second.relics[0].level).toBe(0);
  });

  it('detailInfo 缺失时返回空展示柜（不抛）', () => {
    const player = parseShowcase({ uid: '1' }, TABLES, new Set());
    expect(player.chars).toEqual([]);
    expect(player.nickname).toBe('');
  });
});

describe('showcase · 套装与存档映射', () => {
  const relic = (slot: number, setId: string): Parameters<typeof setsFromShowcase>[0][number] => ({
    slot,
    setId,
    rarity: 5,
    level: 15,
    mainProperty: 'HPDelta',
    mainValue: 705.6,
    subs: [],
    rarityVerified: true,
    approximate: false,
  });

  it('4+2：四件套 / 位面套装', () => {
    const sets = setsFromShowcase([
      relic(1, '102'),
      relic(2, '102'),
      relic(3, '102'),
      relic(4, '102'),
      relic(5, '309'),
      relic(6, '309'),
    ]);
    expect(sets).toEqual({ relicsetId: '102', planarsetId: '309' });
  });

  it('2+2：第二套写入 relicsetId2', () => {
    const sets = setsFromShowcase([
      relic(1, '102'),
      relic(2, '102'),
      relic(3, '110'),
      relic(4, '110'),
      relic(5, '309'),
      relic(6, '309'),
    ]);
    expect(sets.relicsetId).toBe('102');
    expect(sets.relicsetId2).toBe('110');
    expect(sets.planarsetId).toBe('309');
  });

  it('6 件 → relicPieces，缺件槽位用 rarity 0 空件（不补任何词条）', () => {
    const pieces = relicPiecesFromShowcase([
      {
        slot: 1,
        setId: '102',
        rarity: 5,
        level: 15,
        mainProperty: 'HPDelta',
        mainValue: 705.6,
        subs: [{ property: 'CriticalChanceBase', value: 0.0324, rolls: 1 }],
        rarityVerified: true,
        approximate: false,
      },
    ]);
    expect(pieces).toHaveLength(6);
    expect(pieces[0]).toMatchObject({
      rarity: 5,
      enhance: 15,
      mainProperty: 'HPDelta',
      subs: [{ property: 'CriticalChanceBase', value: 0.0324, rolls: 1 }],
    });
    expect(pieces[1]).toEqual({ rarity: 0, enhance: 0, mainProperty: '', subs: [] });
  });
});

describe('showcase · 技能等级与行迹勾选', () => {
  const detail = {
    skills: {
      '121301': { id: '121301', type: 'Normal', level: { '1': {}, '6': {}, '10': {} } },
      '121302': { id: '121302', type: 'BPSkill', level: { '1': {}, '10': {}, '12': {} } },
      '121303': { id: '121303', type: 'Ultra', level: { '1': {}, '10': {} } },
      '121304': { id: '121304', type: 'Talent', level: { '1': {}, '10': {} } },
      // 秘技（Maze）不进 SkillLevels
      '121307': { id: '121307', type: 'Maze', level: { '1': {} } },
    },
    skillNodes: [
      { pointId: 1213001, skillId: '121301' },
      { pointId: 1213002, skillId: '121302' },
      { pointId: 1213003, skillId: '121303' },
      { pointId: 1213004, skillId: '121304' },
      { pointId: 1213007, skillId: '121307' },
      { pointId: 1213101, skillId: null },
    ],
    tracePoints: [
      { key: 'point09:1:0', pointId: 1213201, property: 'BreakDamageAddedRatioBase', value: 0.053, name: null },
      { key: 'point10:1:0', pointId: 1213202, property: 'DefenceAddedRatio', value: 0.05, name: null },
    ],
  } as unknown as CharacterDetail;

  it('point_id → 技能类型等级（clamp 到本地可用等级）', () => {
    const levels = resolveSkillLevels(detail, [
      { pointId: 1213001, level: 6 },
      { pointId: 1213002, level: 16 },
      { pointId: 1213003, level: 10 },
      { pointId: 1213004, level: 8 },
      { pointId: 1213007, level: 1 },
      { pointId: 1213101, level: 1 },
    ]);
    expect(levels).toEqual({ basic: 6, skill: 12, ult: 10, talent: 8 });
  });

  it('已解锁 point_id → traceChecked 键', () => {
    const checked = resolveTraceChecked(detail, [
      { pointId: 1213201, level: 1 },
      { pointId: 1213101, level: 1 },
    ]);
    expect(checked).toEqual({ 'point09:1:0': true });
    expect(resolveTraceChecked(detail, [])).toEqual({});
    expect(resolveTraceChecked(null, [{ pointId: 1213201, level: 1 }])).toEqual({});
  });

  it('Enka 8 位 pointId（部分角色内部 id）同样能命中本地行迹与技能等级', () => {
    // 真实样本：瓦尔特 1004 的 Enka pointId = 11004001/11004009…（本地是 1004001/1004009）
    const checked = resolveTraceChecked(detail, [
      { pointId: 11213201, level: 1 },
      { pointId: 11213202, level: 1 },
    ]);
    expect(checked).toEqual({ 'point09:1:0': true, 'point10:1:0': true });
    const levels = resolveSkillLevels(detail, [{ pointId: 11213001, level: 5 }]);
    expect(levels.basic).toBe(5);
  });
});
