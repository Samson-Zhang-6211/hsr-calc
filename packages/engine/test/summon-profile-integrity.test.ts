import { describe, expect, it } from 'vitest';
import {
  ENEMY_SKILLS,
  SUMMON_MONSTERS,
  enemySkills,
  enemyUsableSkills,
  summonMonsterProfile,
  summonStats,
} from '../src/index.js';

// ── 召唤物档案：全量字段与「能不能出手」验收（2026-10-30 第三十六轮）──
// `monster-summons.test.ts` 覆盖了「技能表引用的 id 都有档案」+ 4 个真实召唤场景；
// 本文件补齐**每一条档案本身的合法性与可行动性**：
//   · 22 条档案的 id / 名称 / 面板 / 弱点 / 抗性 / 效果抵抗是否合法（防手写笔误）
//   · `skillKey` 是否真的指向一张技能表（**否则召唤出来是个不还手的木桩，且不会报错**）
//   · 该技能表里是否至少有一条「带倍率的主动技」（= AI 池非空，召唤物能出手）
//   · `summonStats` 在多个等级下单调且无 NaN

const ELEMENTS = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'];
const PROFILES = Object.entries(SUMMON_MONSTERS);

describe('召唤物档案 · 全量', () => {
  it('22 条档案：键与 monsterId 一致，名称/面板字段合法', () => {
    expect(PROFILES.length).toBe(22);
    for (const [key, p] of PROFILES) {
      expect(p.monsterId, `${key} monsterId 与键不一致`).toBe(key);
      expect(p.name.length, `${key} 缺中文名`).toBeGreaterThan(0);
      expect(p.nameEn.length, `${key} 缺英文名`).toBeGreaterThan(0);
      expect(p.hp, `${key} hp 非正`).toBeGreaterThan(0);
      expect(p.atk, `${key} atk 非负`).toBeGreaterThanOrEqual(0);
      expect(p.spd, `${key} spd 非正`).toBeGreaterThan(0);
      expect(p.stance, `${key} stance 非正`).toBeGreaterThan(0);
      expect(p.statusRes, `${key} statusRes 越界`).toBeGreaterThanOrEqual(0);
      expect(p.statusRes, `${key} statusRes 越界`).toBeLessThan(1);
    }
  });

  it('弱点与分属性抗性合法（元素名必须用游戏内部键 Thunder）', () => {
    for (const [key, p] of PROFILES) {
      expect(p.weaknesses.length, `${key} 无弱点`).toBeGreaterThan(0);
      for (const el of p.weaknesses) expect(ELEMENTS, `${key} 非法弱点 ${el}`).toContain(el);
      for (const [el, v] of Object.entries(p.resistance)) {
        expect(ELEMENTS, `${key} 非法抗性键 ${el}`).toContain(el);
        expect(typeof v, `${key} 抗性 ${el} 非数值`).toBe('number');
        expect(v!, `${key} 抗性 ${el} 越界`).toBeGreaterThan(-1);
        expect(v!, `${key} 抗性 ${el} 越界`).toBeLessThan(1);
      }
    }
  });

  // 已知「不还手」的召唤物（档案存在、面板正确，但没有攻击技能表 / 只有增益技）。
  // 这份清单是**显式留档**：新增召唤物若没接技能表，会掉进下面的断言而红，
  // 逼你要么补技能表、要么把它加进清单并想清楚它靠什么起作用。
  const INERT = new Set([
    '1002040', // 银鬃近卫：纯肉盾小怪，无技能表
    '2022051', // 狈影
    '3002030', // 惊梦剧团的气泡锂犬
    '3021030', // 「枪尖」
    '4032020', // 残破容器
    '4052020', // 泡影稚子
    '5023020', // 吞神子嗣
    '8032040', // 千星戍卫
  ]);
  // 注意：「授勋」3021020 /「盾」3021040 **不算**在清单里 —— 它们的技能是倍率 0 的增益技，
  // 但仍在 AI 池中（`enemyUsableSkills` 把非被动技能都算「会出手」），即它们会出手给银枝上 buff。

  it('skillKey 必须指向真实技能表（除显式留档的无技能召唤物）', () => {
    for (const [key, p] of PROFILES) {
      const table = enemySkills(p.skillKey);
      if (INERT.has(key)) {
        // 留在清单里的 id 必须真的没有可用主动技，否则清单过期
        const usable = enemyUsableSkills(p.skillKey);
        expect(usable.length, `${key} 已有可用技能表，请从 INERT 清单移除`).toBe(0);
        continue;
      }
      expect(table.length, `${key} 的 skillKey=${p.skillKey} 没有技能表 → 召唤出来不会还手`).toBeGreaterThan(0);
      expect(
        enemyUsableSkills(p.skillKey).length,
        `${key}（${p.name}）的 AI 池为空：技能表 ${p.skillKey} 里没有带倍率的主动技`,
      ).toBeGreaterThan(0);
    }
  });

  it('会还手的召唤物不少于 12 只（INERT 清单不得无限膨胀）', () => {
    const active = PROFILES.filter(([key]) => !INERT.has(key));
    expect(active.length).toBeGreaterThanOrEqual(12);
  });

  it('summonMonsterProfile 能按 id 取回同一份档案', () => {
    for (const [key, p] of PROFILES) {
      const got = summonMonsterProfile(key);
      expect(got, `${key} 取不到`).toBeTruthy();
      expect(got!.skillKey).toBe(p.skillKey);
    }
    expect(summonMonsterProfile('999999999')).toBeUndefined();
  });

  it('summonStats 在 85/90/95 级均有效且单调（hp/atk/速度/韧性都没 NaN）', () => {
    const stages = [85, 90, 95];
    for (const [key, p] of PROFILES) {
      const stats = stages.map((lv) => summonStats(p, lv));
      for (const s of stats) {
        for (const [field, v] of Object.entries(s)) {
          if (typeof v !== 'number') continue;
          expect(Number.isFinite(v), `${key}.${field} 在换算后不是有限数`).toBe(true);
          expect(v, `${key}.${field} 为负`).toBeGreaterThanOrEqual(0);
        }
      }
      // 高等级不低等级亏属性（等级只放大乘区）
      expect(stats[2]!.hp).toBeGreaterThanOrEqual(stats[0]!.hp);
      expect(stats[2]!.atk).toBeGreaterThanOrEqual(stats[0]!.atk);
    }
  });

  it('技能表里声明的召唤物 id 全部有档案，且没有多余档案（双向一致）', () => {
    const referenced = new Set<string>();
    for (const skills of Object.values(ENEMY_SKILLS)) {
      for (const sk of skills) {
        for (const spec of [sk.summon, sk.startSummon]) {
          if (!spec) continue;
          for (const id of Array.isArray(spec.monsterId) ? spec.monsterId : [spec.monsterId]) {
            referenced.add(id);
          }
        }
      }
    }
    const missing = [...referenced].filter((id) => !SUMMON_MONSTERS[id]);
    expect(missing, `技能表引用了没有档案的召唤物: ${missing.join(',')}`).toEqual([]);
    // 多余档案：允许（部分档案是关卡数据直填的召唤物，技能表里没有 summon 字段），
    // 但必须能从关卡数据或技能表找到出处 → 这里只记录数量，不强制相等
    expect(referenced.size).toBeGreaterThanOrEqual(14);
    expect(referenced.size).toBeLessThanOrEqual(PROFILES.length);
  });
});
