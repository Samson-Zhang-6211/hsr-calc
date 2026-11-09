import { describe, expect, it } from 'vitest';
import { parseMihomo, type MihomoResponse } from './showcase-mihomo.js';

/**
 * mihomo 解析单测（真实字段来自 2026-10-27 对 `api.mihomo.me/sr_info_parsed` 的实测：
 * `relics[].main_affix/sub_affix` 直接给属性名与数值、`skills[].type+level`、
 * `skill_trees[].anchor`、`player.is_display`）。
 */

const ROSTER = new Set(['1213', '1004']);

const FIXTURE: MihomoResponse = {
  player: {
    uid: '110000000',
    nickname: '测试员',
    level: 70,
    signature: '签名',
    is_display: true,
  },
  characters: [
    {
      id: '1213',
      level: 80,
      promotion: 6,
      rank: 2,
      pos: [1],
      light_cone: { id: '23015', rank: 1, level: 80, promotion: 6 },
      skills: [
        { id: '121301', type: 'Normal', level: 6 },
        { id: '121302', type: 'BPSkill', level: 10 },
        { id: '121303', type: 'Ultra', level: 10 },
        { id: '121304', type: 'Talent', level: 10 },
        { id: '121307', type: 'Maze', level: 1 },
        // 强化形态会再出现一条 level=0，不能覆盖真实等级
        { id: '121308', type: 'Normal', level: 0 },
      ],
      skill_trees: [
        { id: '1213001', level: 6, anchor: 'Point01' },
        { id: '1213002', level: 10, anchor: 'Point02' },
        { id: '1213201', level: 1, anchor: 'Point09' },
        { id: '1213202', level: 1, anchor: 'Point10' },
        { id: '1213210', level: 0, anchor: 'Point18' },
      ],
      relics: [
        {
          id: '61021',
          type: 1,
          set_id: '102',
          rarity: 5,
          level: 15,
          main_affix: { type: 'HPDelta', value: 705.6 },
          sub_affix: [
            { type: 'HPAddedRatio', value: 0.11664, count: 3, step: 3 },
            { type: 'CriticalDamageBase', value: 0.05184, count: 1, step: 0 },
          ],
        },
        // 缺主词条的脏数据应被丢弃
        { id: '61022', type: 2, set_id: '102', rarity: 5, level: 15 },
      ],
    },
    {
      id: '1004',
      level: 80,
      promotion: 6,
      pos: [0],
      light_cone: null,
      skills: [],
      skill_trees: [],
      relics: [],
    },
    // 本地名册里没有的角色
    {
      id: '9999',
      level: 1,
      pos: [2],
      relics: [],
    },
  ],
};

describe('showcase-mihomo · 玩家与角色', () => {
  it('玩家信息、是否公开展柜', () => {
    const out = parseMihomo(FIXTURE, ROSTER);
    expect(out.uid).toBe('110000000');
    expect(out.nickname).toBe('测试员');
    expect(out.level).toBe(70);
    expect(out.signature).toBe('签名');
    expect(out.isDisplay).toBe(true);
    expect(out.ttl).toBe(60);
  });

  it('按 pos 排序、未知角色 rosterId=null、缺字段按 0/空处理', () => {
    const out = parseMihomo(FIXTURE, ROSTER);
    expect(out.chars.map((c) => c.avatarId)).toEqual(['1004', '1213', '9999']);
    const unknown = out.chars[2];
    expect(unknown.rosterId).toBe(null);
    expect(unknown.eidolon).toBe(0);
    expect(unknown.lightcone).toBe(null);
    expect(unknown.points).toEqual([]);
    expect(unknown.skillLevels).toEqual({});
    expect(unknown.anchors).toEqual([]);
  });

  it('角色字段：星魂/光锥/展示柜位次', () => {
    const out = parseMihomo(FIXTURE, ROSTER);
    const c = out.chars.find((x) => x.avatarId === '1213')!;
    expect(c.rosterId).toBe('1213');
    expect(c.eidolon).toBe(2);
    expect(c.pos).toBe(1);
    expect(c.lightcone).toEqual({ id: '23015', refinement: 1, level: 80, promotion: 6 });
  });

  it('技能等级取同类型最大值（强化形态 level=0 不覆盖）', () => {
    const out = parseMihomo(FIXTURE, ROSTER);
    const c = out.chars.find((x) => x.avatarId === '1213')!;
    expect(c.skillLevels).toEqual({ basic: 6, skill: 10, ult: 10, talent: 10 });
  });

  it('行迹锚点：小写化且只取已解锁（level>0）', () => {
    const out = parseMihomo(FIXTURE, ROSTER);
    const c = out.chars.find((x) => x.avatarId === '1213')!;
    expect(c.anchors).toEqual(['point01', 'point02', 'point09', 'point10']);
    expect(c.points).toContainEqual({ pointId: 1213201, level: 1 });
  });
});

describe('showcase-mihomo · 遗器', () => {
  it('主副词条数值直接取用，稀有度可信、不缺近似', () => {
    const out = parseMihomo(FIXTURE, ROSTER);
    const c = out.chars.find((x) => x.avatarId === '1213')!;
    expect(c.relics).toHaveLength(1); // 第二条缺 main_affix 被丢弃
    const relic = c.relics[0];
    expect(relic).toMatchObject({
      slot: 1,
      setId: '102',
      rarity: 5,
      level: 15,
      mainProperty: 'HPDelta',
      mainValue: 705.6,
      rarityVerified: true,
      approximate: false,
    });
    expect(relic.subs).toEqual([
      { property: 'HPAddedRatio', value: 0.11664, rolls: 3 },
      { property: 'CriticalDamageBase', value: 0.05184, rolls: 1 },
    ]);
  });

  it('is_display=false 时透出未公开标记', () => {
    const out = parseMihomo({ ...FIXTURE, player: { ...FIXTURE.player, is_display: false } }, ROSTER);
    expect(out.isDisplay).toBe(false);
  });
});
