/**
 * ⚠️ 生成物 —— 请勿手改。由 `node scripts/gen-monster-stages.mjs` 生成。
 *
 * 高难本关卡包预设表（混沌回忆 / 虚构叙事 / 末日幻影 / 异相仲裁）。
 *
 * 数据源：
 * - `data/monster-stages/*.json`（关卡逐怪数据；schema v2，血量 = 该包难度乘区下的页面值）
 * - `data/monsters/{id}.json`（模板基础值 / 子变体倍率 / 弱点 / 分属性抗性）
 * - `data/monster-growth/HardLevelGroup.json`（难度乘区，每包自己的 HardLevelGroup）
 *
 * 难度乘区分组：混沌回忆 / 异相仲裁 = 第 3 组；虚构叙事 / 末日幻影 = 第 1 组（页面提示语原文）。
 * 虚构叙事的每波还带独立血量增幅（×5 / ×10 / ×46 …），页面已乘进逐怪血量，本表不再二次乘。
 *
 * `MONSTER_STAGES` 是历史兼容的「物竞天择 12 关」表（= moc-p44），
 * 新的三级选择请用 `STAGE_PACKS`（按用户 2026-10-30 裁定只暴露各模式最难关 + 星启）。
 */

import type { Element } from '@hsr-calc/shared';
import type { MonsterConfig, RoundMode } from './types.js';

/** 难度乘区（一个 HardLevelGroup × 一个关卡等级） */
export interface StageScale {
  /** 血量乘区 */
  hp: number;
  /** 攻击力乘区 */
  atk: number;
  /** 防御力乘区（引擎未建模，留档） */
  def: number;
  /** 速度乘区 */
  spd: number;
  /** 韧性乘区 */
  stance: number;
  /** 效果命中 */
  statusHit: number;
  /** 效果抵抗加值（叠加在怪物模板 status_resistance_base 上） */
  statusResAdd: number;
}

/** HardLevelGroup → 关卡等级 → 难度乘区 */
export const STAGE_SCALES_BY_GROUP: Record<number, Record<number, StageScale>> = {
  1: {
    85: { hp: 188.263594, atk: 33.752937, def: 5, spd: 1.2, stance: 1, statusHit: 0.28, statusResAdd: 0.1 },
    90: { hp: 236.534716, atk: 36.821386, def: 5.238095, spd: 1.32, stance: 1, statusHit: 0.32, statusResAdd: 0.1 },
  },
  3: {
    68: { hp: 86.534563, atk: 23.128032, def: 4.190476, spd: 1.1, stance: 1, statusHit: 0.144, statusResAdd: 0.072 },
    70: { hp: 94.987167, atk: 24.211388, def: 4.285714, spd: 1.1, stance: 1, statusHit: 0.16, statusResAdd: 0.08 },
    73: { hp: 117.55482, atk: 26.153318, def: 4.428571, spd: 1.1, stance: 1, statusHit: 0.184, statusResAdd: 0.092 },
    75: { hp: 132.599922, atk: 27.447938, def: 4.52381, spd: 1.1, stance: 1, statusHit: 0.2, statusResAdd: 0.1 },
    78: { hp: 155.167576, atk: 29.389868, def: 4.666667, spd: 1.2, stance: 1, statusHit: 0.224, statusResAdd: 0.1 },
    80: { hp: 170.212678, atk: 30.684488, def: 4.761905, spd: 1.2, stance: 1, statusHit: 0.24, statusResAdd: 0.1 },
    82: { hp: 189.709477, atk: 31.301247, def: 4.857143, spd: 1.2, stance: 1, statusHit: 0.256, statusResAdd: 0.1 },
    85: { hp: 222.764934, atk: 32.249706, def: 5, spd: 1.2, stance: 1, statusHit: 0.28, statusResAdd: 0.1 },
    88: { hp: 261.030757, atk: 33.226904, def: 5.142857, spd: 1.32, stance: 1, statusHit: 0.304, statusResAdd: 0.1 },
    90: { hp: 289.836409, atk: 33.894765, def: 5.238095, spd: 1.32, stance: 1, statusHit: 0.32, statusResAdd: 0.1 },
    92: { hp: 321.594641, atk: 34.23456, def: 5.333333, spd: 1.32, stance: 1, statusHit: 0.336, statusResAdd: 0.1 },
    95: { hp: 375.438496, atk: 34.75065, def: 5.47619, spd: 1.32, stance: 1, statusHit: 0.36, statusResAdd: 0.1 },
    100: { hp: 484.690862, atk: 35.628147, def: 5.714286, spd: 1.32, stance: 1, statusHit: 0.4, statusResAdd: 0.1 },
    120: { hp: 1938.763448, atk: 49.879406, def: 5.714286, spd: 1.5, stance: 1, statusHit: 0.5, statusResAdd: 0.2 },
  },
};

/** 兼容旧口径：混沌回忆 / 异相仲裁 = HardLevelGroup 3 */
export const STAGE_SCALES: Record<number, StageScale> = STAGE_SCALES_BY_GROUP[3]!;

/** 取某难度组某等级的乘区（缺省 undefined） */
export function stageScale(group: number, level: number): StageScale | undefined {
  return STAGE_SCALES_BY_GROUP[group]?.[level];
}

/** 怪物档案（模板基础值 + 子变体倍率 + 弱点/抗性） */
export interface StageMonsterProfile {
  /** 中文名（关卡页） */
  name: string;
  /** 关卡页标记：精英 / 小BOSS / 小怪Lv2 */
  rank: string;
  /** 引擎 enemyClass（精英与小BOSS 均为 elite） */
  enemyClass: 'normal' | 'elite';
  /** 怪物模板基础值 */
  base: { atk: number; def: number; hp: number; spd: number; stance: number; statusRes: number };
  /** 命中的子变体 id */
  childId: number;
  /** 子变体倍率（spd = 速度相对基础值的比值） */
  child: { hp: number; atk: number; spd: number; stance: number };
  /** 弱点（只影响削韧，引擎无弱点伤害乘区） */
  weaknesses: Element[];
  /** 分属性抗性 */
  resistance: Partial<Record<Element, number>>;
}

/** 怪物 id → 档案 */
export const STAGE_MONSTERS: Record<string, StageMonsterProfile> = {
  '1002030': {
    name: '银鬃炮手',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 195.3, spd: 100, stance: 90, statusRes: 0.1 },
    childId: 1002030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice', 'Imaginary'],
    resistance: { Fire: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '1002050': {
    name: '银鬃射手',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 102.3, spd: 100, stance: 60, statusRes: 0.1 },
    childId: 1002050,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice'],
    resistance: { Fire: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '1003010': {
    name: '银鬃尉官',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 930, spd: 120, stance: 240, statusRes: 0.2 },
    childId: 1003010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice', 'Quantum'],
    resistance: { Fire: 0.2, Thunder: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '1012010': {
    name: '自动机兵•战犬',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 130.2, spd: 100, stance: 60, statusRes: 0.1 },
    childId: 1012010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Thunder'],
    resistance: { Fire: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '1013020': {
    name: '自动机兵•齿狼',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1023, spd: 144, stance: 300, statusRes: 0.2 },
    childId: 1013020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '1023010': {
    name: '炽燃徘徊者',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1023, spd: 100, stance: 300, statusRes: 0.2 },
    childId: 1023010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.4, Wind: 0.2, Quantum: 0.2 },
  },
  '2002010': {
    name: '云骑巡防士卒',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 148.8, spd: 120, stance: 60, statusRes: 0.1 },
    childId: 2002010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Wind', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Quantum: 0.2 },
  },
  '2002030': {
    name: '幽府武弁',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 139.5, spd: 120, stance: 60, statusRes: 0.1 },
    childId: 2002030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice', 'Wind'],
    resistance: { Fire: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '2004014': {
    name: '勾魂摄魄的支配者',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 7207.5, spd: 150, stance: 900, statusRes: 0.2 },
    childId: 200401404,
    child: { hp: 1.096774, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Wind', 'Imaginary'],
    resistance: { Ice: 0.4, Thunder: 0.4, Quantum: 0.4 },
  },
  '2013020': {
    name: '金人勾魂使',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1116, spd: 120, stance: 300, statusRes: 0.2 },
    childId: 2013020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Thunder', 'Imaginary'],
    resistance: { Fire: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '2022040': {
    name: '丰饶灵兽•娄金',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 148.8, spd: 118, stance: 90, statusRes: 0.1 },
    childId: 2022040,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Thunder', 'Quantum'],
    resistance: { Physical: 0.2, Fire: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '2022050': {
    name: '丰饶灵兽•奎木',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 186, spd: 100, stance: 90, statusRes: 0.1 },
    childId: 2022050,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Wind', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Quantum: 0.2 },
  },
  '2023020': {
    name: '丰饶灵兽•长右',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1116, spd: 144, stance: 360, statusRes: 0.2 },
    childId: 2023020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Ice', 'Wind'],
    resistance: { Physical: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '2023030': {
    name: '承露天人',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1023, spd: 120, stance: 420, statusRes: 0.2 },
    childId: 2023030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice', 'Thunder'],
    resistance: { Fire: 0.2, Wind: 0.4, Quantum: 0.2, Imaginary: 0.2 },
  },
  '2032010': {
    name: '玄爪狼卒',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 186, spd: 120, stance: 90, statusRes: 0.1 },
    childId: 2032010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '2032020': {
    name: '蚀月狼卒',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 186, spd: 120, stance: 90, statusRes: 0.1 },
    childId: 2032020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Wind'],
    resistance: { Fire: 0.2, Ice: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '2033010': {
    name: '咆哮灵柩',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1116, spd: 120, stance: 360, statusRes: 0.2 },
    childId: 2033010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Thunder', 'Wind', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Quantum: 0.2 },
  },
  '2034010': {
    name: '步离战首•呼雷',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 2557.5, spd: 200, stance: 720, statusRes: 0.2 },
    childId: 2034010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Wind'],
    resistance: { Ice: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '2034014': {
    name: '雷奔云谲的恶狼主',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 10230, spd: 160, stance: 1140, statusRes: 0.2 },
    childId: 2034014,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Wind', 'Quantum'],
    resistance: { Ice: 0.4, Thunder: 0.4, Imaginary: 0.4 },
  },
  '3003020': {
    name: '惊梦剧团的甜猿泰山',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1674, spd: 144, stance: 300, statusRes: 0.2 },
    childId: 300302007,
    child: { hp: 4.583333, atk: 1, spd: 1, stance: 0.4 },
    weaknesses: ['Physical', 'Fire', 'Imaginary'],
    resistance: { Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '3003030': {
    name: '「身陷樊笼的往昔」',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1116, spd: 100, stance: 300, statusRes: 0.2 },
    childId: 3003030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '3003040': {
    name: '「同音共律的来日」',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1116, spd: 100, stance: 300, statusRes: 0.2 },
    childId: 3003040,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Thunder'],
    resistance: { Ice: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '3003050': {
    name: '「醉于盛会的此刻」',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1116, spd: 120, stance: 300, statusRes: 0.2 },
    childId: 3003050,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Imaginary'],
    resistance: { Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '3004020': {
    name: '奇想林中的蕉研组',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 3720, spd: 80, stance: 0, statusRes: 0.2 },
    childId: 3004020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Ice', 'Thunder', 'Imaginary'],
    resistance: {  },
  },
  '3013010': {
    name: '忆域迷因「狂怒褪去之壳」',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1302, spd: 110, stance: 360, statusRes: 0.2 },
    childId: 3013010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Thunder', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Wind: 0.2 },
  },
  '3021020': {
    name: '「授勋」',
    rank: '小怪',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 255.75, spd: 100, stance: 90, statusRes: 0.3 },
    childId: 3021020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice'],
    resistance: { Fire: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '3021040': {
    name: '「盾」',
    rank: '小怪',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 176.7, spd: 100, stance: 90, statusRes: 0.3 },
    childId: 3021040,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Thunder'],
    resistance: { Fire: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '3024010': {
    name: '银枝',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1395, spd: 144, stance: 480, statusRes: 0.3 },
    childId: 3024010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Ice'],
    resistance: { Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '3024030': {
    name: '示死祸源：深魇蝗灾',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 7440, spd: 144, stance: 600, statusRes: 0.3 },
    childId: 3024030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Wind'],
    resistance: { Ice: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '4012010': {
    name: '天谴斗士',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 241.8, spd: 100, stance: 90, statusRes: 0.2 },
    childId: 4012010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Thunder', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Wind: 0.2 },
  },
  '4013010': {
    name: '天谴先锋',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1674, spd: 132, stance: 480, statusRes: 0.2 },
    childId: 4013010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Thunder', 'Quantum'],
    resistance: { Physical: 0.2, Fire: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '4014030': {
    name: '冥魂渡者，死龙残躯，玻吕刻斯',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 3022.5, spd: 144, stance: 540, statusRes: 0.3 },
    childId: 4014030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Wind', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2 },
  },
  '4022010': {
    name: '流星铁鹰',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 279, spd: 100, stance: 90, statusRes: 0.2 },
    childId: 4022010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Wind', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2 },
  },
  '4023010': {
    name: '正阳狮鹫',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1209, spd: 120, stance: 480, statusRes: 0.2 },
    childId: 402301001,
    child: { hp: 1.384615, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Quantum', 'Imaginary'],
    resistance: { Fire: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
  },
  '4023020': {
    name: '月夜天马',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1023, spd: 100, stance: 480, statusRes: 0.2 },
    childId: 402302001,
    child: { hp: 1.454545, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
  },
  '4032024': {
    name: '残破容器',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 223.2, spd: 140, stance: 180, statusRes: 0.3 },
    childId: 4032024,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Thunder', 'Quantum'],
    resistance: { Physical: 0.2, Fire: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '4032030': {
    name: '黑潮蚀斧',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 316.2, spd: 100, stance: 120, statusRes: 0.2 },
    childId: 4032030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Thunder', 'Quantum'],
    resistance: { Fire: 0.2, Ice: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '4033030': {
    name: '黑日狮鹫',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1395, spd: 144, stance: 480, statusRes: 0.2 },
    childId: 4033030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Quantum'],
    resistance: { Ice: 0.2, Thunder: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '4034010': {
    name: '至黑之剑，盗火行者',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 3022.5, spd: 132, stance: 720, statusRes: 0.3 },
    childId: 4034010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Thunder', 'Quantum'],
    resistance: { Physical: 0.2, Fire: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '4034014': {
    name: '至黑之剑，盗火行者',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 7672.5, spd: 132, stance: 720, statusRes: 0.3 },
    childId: 4034014,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Thunder', 'Quantum'],
    resistance: { Physical: 0.2, Fire: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '4044010': {
    name: '第一位天才，隐德来希，赞达尔',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 11160, spd: 160, stance: 600, statusRes: 0.3 },
    childId: 4044010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice', 'Wind'],
    resistance: { Fire: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '4053010': {
    name: '波涛夫人',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1395, spd: 144, stance: 540, statusRes: 0.2 },
    childId: 4053010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Thunder'],
    resistance: { Ice: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '4053020': {
    name: '飓风大母',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1395, spd: 165, stance: 480, statusRes: 0.2 },
    childId: 4053020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Ice', 'Thunder'],
    resistance: { Physical: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '4063010': {
    name: '金血忆灵•翼蛇形',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1488, spd: 120, stance: 480, statusRes: 0.2 },
    childId: 4063010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Ice'],
    resistance: { Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '4064010': {
    name: '金血忆灵•裁定忘却之形',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 2511, spd: 150, stance: 360, statusRes: 0.3 },
    childId: 4064010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice', 'Imaginary'],
    resistance: { Fire: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '4064012': {
    name: '迷惘之渊的裁定者',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 27900, spd: 144, stance: 360, statusRes: 0.3 },
    childId: 406401203,
    child: { hp: 1.1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Thunder', 'Imaginary'],
    resistance: { Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '5012110': {
    name: '狸猫记者',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 372, spd: 100, stance: 90, statusRes: 0.2 },
    childId: 501211002,
    child: { hp: 1.5, atk: 1, spd: 1, stance: 0.333333 },
    weaknesses: ['Thunder', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Wind: 0.2 },
  },
  '5012120': {
    name: '「合金保姆」',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 279, spd: 160, stance: 180, statusRes: 0.2 },
    childId: 5012120,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '5013010': {
    name: '摇滚狂徒',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1674, spd: 132, stance: 360, statusRes: 0.2 },
    childId: 5013010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Wind'],
    resistance: { Ice: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '5013040': {
    name: '破晓战队•苍翼',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1395, spd: 120, stance: 480, statusRes: 0.2 },
    childId: 5013040,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Imaginary'],
    resistance: { Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.8 },
  },
  '5013050': {
    name: '破晓战队•赤焰',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1395, spd: 120, stance: 480, statusRes: 0.2 },
    childId: 5013050,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Quantum', 'Imaginary'],
    resistance: { Fire: 0.8, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
  },
  '5013060': {
    name: '破晓战队•曙光',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1395, spd: 120, stance: 480, statusRes: 0.2 },
    childId: 5013060,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Fire', 'Quantum'],
    resistance: { Ice: 0.2, Thunder: 0.2, Wind: 0.2, Imaginary: 0.8 },
  },
  '5013070': {
    name: '破晓战队•灰烬',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1395, spd: 120, stance: 480, statusRes: 0.2 },
    childId: 5013070,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.8, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
  },
  '5014010': {
    name: '火花大会@Official',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 3952.5, spd: 120, stance: 960, statusRes: 0.3 },
    childId: 5014010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
  },
  '5014020': {
    name: '合金机铠•帕姆王',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 3487.5, spd: 120, stance: 720, statusRes: 0.3 },
    childId: 5014020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '5014023': {
    name: '合金机铠•帕姆王',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 7672.5, spd: 120, stance: 600, statusRes: 0.3 },
    childId: 5014023,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '5014030': {
    name: '始作画者，无量塔绘世',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 3022.5, spd: 120, stance: 1080, statusRes: 0.3 },
    childId: 5014030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Thunder', 'Quantum'],
    resistance: { Physical: 0.4, Ice: 0.4, Wind: 0.4, Imaginary: 0.4 },
  },
  '5023010': {
    name: '乐变化天人',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 558, spd: 144, stance: 420, statusRes: 0.2 },
    childId: 5023010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '5023020': {
    name: '吞神子嗣',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1488, spd: 120, stance: 540, statusRes: 0.2 },
    childId: 5023020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
  },
  '5034010': {
    name: '堕神之血•亚婆离',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 2092.5, spd: 180, stance: 1080, statusRes: 0.3 },
    childId: 5034010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Thunder: 0.2, Wind: 0.2 },
  },
  '8003010': {
    name: '外宇宙之冰',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 930, spd: 100, stance: 300, statusRes: 0.2 },
    childId: 8003010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Wind', 'Quantum'],
    resistance: { Physical: 0.2, Ice: 0.4, Thunder: 0.2, Imaginary: 0.2 },
  },
  '8003020': {
    name: '外宇宙之炎',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 930, spd: 120, stance: 300, statusRes: 0.2 },
    childId: 8003020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Ice', 'Quantum'],
    resistance: { Fire: 0.4, Thunder: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '8003040': {
    name: '蚕食者之影',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 930, spd: 172, stance: 300, statusRes: 0.2 },
    childId: 800304016,
    child: { hp: 1.5, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Thunder', 'Wind'],
    resistance: { Physical: 0.2, Ice: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '8003060': {
    name: '虚构集合体',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 465, spd: 83, stance: 0, statusRes: 0 },
    childId: 8003060,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: [],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '8012010': {
    name: '虚卒•掠夺者',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 139.5, spd: 100, stance: 60, statusRes: 0.1 },
    childId: 8012010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Physical', 'Thunder'],
    resistance: { Fire: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  },
  '8012020': {
    name: '虚卒•篡改者',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 167.4, spd: 120, stance: 60, statusRes: 0.1 },
    childId: 8012020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Wind', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2, Quantum: 0.2 },
  },
  '8012030': {
    name: '虚卒•抹消者',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 195.3, spd: 100, stance: 90, statusRes: 0.1 },
    childId: 8012030,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Ice', 'Quantum'],
    resistance: { Physical: 0.2, Thunder: 0.2, Wind: 0.2, Imaginary: 0.2 },
  },
  '8022010': {
    name: '幼蛰虫',
    rank: '小怪Lv2',
    enemyClass: 'normal',
    base: { atk: 18, def: 210, hp: 209.25, spd: 144, stance: 90, statusRes: 0.2 },
    childId: 8022010,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
  },
  '8024011': {
    name: '虫群•真蛰虫',
    rank: '小BOSS',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1674, spd: 144, stance: 480, statusRes: 0.3 },
    childId: 802401106,
    child: { hp: 1.333333, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Ice', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Thunder: 0.2, Wind: 0.2 },
  },
  '8033020': {
    name: '「灯塔」',
    rank: '精英',
    enemyClass: 'elite',
    base: { atk: 18, def: 210, hp: 1302, spd: 144, stance: 480, statusRes: 0.2 },
    childId: 8033020,
    child: { hp: 1, atk: 1, spd: 1, stance: 1 },
    weaknesses: ['Fire', 'Wind', 'Quantum'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Imaginary: 0.2 },
  },
};

/** 关卡内的一只怪（count = 同波数量） */
export interface StageFoe {
  /** 怪物 id（同时是敌方技能表的键） */
  monsterId: string;
  /** 该关血量（关卡难度乘区下的值，虚构已含波次增幅） */
  hp: number;
  /** 同波数量 */
  count: number;
  /** 怪物中文名（页面对照用） */
  name: string;
  /** 页面上的稀有度标签（精英/小BOSS/小怪等） */
  rank: string;
  /** 页面标注的弱点（留档；引擎弱点取 STAGE_MONSTERS） */
  weak?: Element[];
}

/** 一个波次 */
export interface StageWave {
  wave: number;
  foes: StageFoe[];
  /** 虚构叙事波次血量增幅（已计入逐怪 hp，此处只留档） */
  mult?: string;
}

/** 关卡机制（页面原文：血嗜 / 洞穿 / 闭锁 / 桎梏+ …） */
export interface StageMechanic {
  /** 机制名 */
  name: string;
  /** 机制文案 */
  desc: string;
}

/** 上下半（挑战关卡的两段战斗） */
export interface StageHalf {
  half: '上半' | '下半';
  /** 该半所有怪弱点的交集（关卡页标签） */
  tags: Element[];
  level: number;
  hp: number;
  waves: StageWave[];
  /** 该段独有的关卡机制 */
  mechanics?: StageMechanic[];
}

/** 关卡类型：boss = 有上下半；star = 星启；single = 仲裁单段关 */
export type StageKind = 'boss' | 'star' | 'single';

/** 一个关卡 */
export interface StageDef {
  /** 关卡序号（boss = 页面 F 号；星启 = 0；仲裁单段关 = 1~5） */
  index: number;
  /** 关卡中文名 */
  name: string;
  /** 关卡英文名（官方名待核，desc 型占位） */
  nameEn: string;
  /** 关内序号（对应页面的 F 编号；星启 = 0） */
  f: number;
  kind: StageKind;
  /** 全关总血量 */
  totalHp: number;
  /** star / single 的关卡等级 */
  level?: number;
  /** star / single 的弱点交集 */
  tags?: Element[];
  /** boss：上半 / 下半（其余类型为空数组） */
  halves: StageHalf[];
  /** star / single：波次（其余类型为空数组） */
  waves: StageWave[];
  /** 关卡机制 */
  mechanics?: StageMechanic[];
  /** 站点原文关卡名（仲裁拆关用） */
  siteName?: string;
}

/** 一个关卡包（= 一期 + 模式） */
export interface StagePackDef {
  /** 包 id，如 moc-p44 */
  id: string;
  mode: 'moc' | 'pure' | 'apo' | 'arb';
  period: number;
  /** 期标题（中文） */
  title: string;
  /** 站点 p 编号 */
  p: number;
  /** 该模式默认轮次模式 */
  roundMode: RoundMode;
  /** 该包难度乘区组 */
  difficultyGroup: number;
  /** 本期模式机制（记忆紊流 / 末法余烬 …） */
  modeMechanics: StageMechanic[];
  /** 对外暴露的关卡（按裁定只含最难关 + 星启 / 仲裁 5 关） */
  stages: StageDef[];
}

/* ===== moc-p43：moc 第 43 期「来生泅渡」（HardLevelGroup 3） ===== */

const S_MOC_P43_12: StageDef = {
  index: 12,
  name: '来生泅渡其十二',
  nameEn: 'Stage 12',
  f: 12,
  kind: 'boss',
  totalHp: 7279941,
  halves: [
    {
      half: '上半',
      tags: ['Fire', 'Quantum'],
      level: 95,
      hp: 2356816,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '5013060', hp: 523737, count: 1, name: '破晓战队•曙光', rank: '精英' },
            { monsterId: '8003010', hp: 349158, count: 1, name: '外宇宙之冰', rank: '精英' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '5014010', hp: 1483921, count: 1, name: '火花大会@Official', rank: '小BOSS' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Physical', 'Ice'],
      level: 95,
      hp: 4923125,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2023030', hp: 384074, count: 1, name: '承露天人', rank: '精英' },
            { monsterId: '1003010', hp: 349158, count: 1, name: '银鬃尉官', rank: '精英' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '4044010', hp: 4189894, count: 1, name: '第一位天才，隐德来希，赞达尔', rank: '小BOSS' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P43_0: StageDef = {
  index: 0,
  name: '星启',
  nameEn: 'Tierce',
  f: 0,
  kind: 'star',
  totalHp: 2077489,
  level: 95,
  tags: [],
  halves: [],
  waves: [
    {
      wave: 1,
      foes: [
        { monsterId: '5013040', hp: 523737, count: 1, name: '破晓战队•苍翼', rank: '精英' },
        { monsterId: '3003050', hp: 418989, count: 1, name: '「醉于盛会的此刻」', rank: '精英' },
      ],
    },
    {
      wave: 2,
      foes: [
        { monsterId: '5014030', hp: 1134763, count: 1, name: '始作画者，无量塔绘世', rank: '小BOSS' },
      ],
    },
  ],
};

/* ===== moc-p44：moc 第 44 期「物竞天择」（HardLevelGroup 3） ===== */

const S_MOC_P44_1: StageDef = {
  index: 1,
  name: '物竞天择其一',
  nameEn: 'Stage 1',
  f: 1,
  kind: 'boss',
  totalHp: 709811,
  halves: [
    {
      half: '上半',
      tags: ['Quantum'],
      level: 68,
      hp: 395948,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '5013060', hp: 120716, count: 1, name: '破晓战队•曙光', rank: '精英' },
            { monsterId: '8012030', hp: 16900, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '5013060', hp: 120716, count: 1, name: '破晓战队•曙光', rank: '精英' },
            { monsterId: '5013070', hp: 120716, count: 1, name: '破晓战队•灰烬', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Physical', 'Imaginary'],
      level: 68,
      hp: 313863,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2013020', hp: 96573, count: 1, name: '金人勾魂使', rank: '精英' },
            { monsterId: '8012010', hp: 12072, count: 2, name: '虚卒•掠夺者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '2013020', hp: 96573, count: 2, name: '金人勾魂使', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_2: StageDef = {
  index: 2,
  name: '物竞天择其二',
  nameEn: 'Stage 2',
  f: 2,
  kind: 'boss',
  totalHp: 736741,
  halves: [
    {
      half: '上半',
      tags: ['Physical', 'Fire'],
      level: 70,
      hp: 381621,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '3003040', hp: 106006, count: 1, name: '「同音共律的来日」', rank: '精英' },
            { monsterId: '8012030', hp: 18551, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '4053010', hp: 132507, count: 1, name: '波涛夫人', rank: '精英' },
            { monsterId: '3003040', hp: 106006, count: 1, name: '「同音共律的来日」', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Ice', 'Wind'],
      level: 70,
      hp: 355120,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2023020', hp: 106006, count: 1, name: '丰饶灵兽•长右', rank: '精英' },
            { monsterId: '8012030', hp: 18551, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '2023020', hp: 106006, count: 2, name: '丰饶灵兽•长右', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_3: StageDef = {
  index: 3,
  name: '物竞天择其三',
  nameEn: 'Stage 3',
  f: 3,
  kind: 'boss',
  totalHp: 1150110,
  halves: [
    {
      half: '上半',
      tags: ['Fire', 'Ice'],
      level: 73,
      hp: 559749,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '4063010', hp: 174922, count: 1, name: '金血忆灵•翼蛇形', rank: '精英' },
            { monsterId: '8012030', hp: 22958, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '4063010', hp: 174922, count: 1, name: '金血忆灵•翼蛇形', rank: '精英' },
            { monsterId: '4053020', hp: 163989, count: 1, name: '飓风大母', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Fire'],
      level: 73,
      hp: 590361,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '5013010', hp: 196787, count: 1, name: '摇滚狂徒', rank: '精英' },
            { monsterId: '8012010', hp: 16399, count: 2, name: '虚卒•掠夺者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '5013010', hp: 196787, count: 1, name: '摇滚狂徒', rank: '精英' },
            { monsterId: '4053010', hp: 163989, count: 1, name: '波涛夫人', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_4: StageDef = {
  index: 4,
  name: '物竞天择其四',
  nameEn: 'Stage 4',
  f: 4,
  kind: 'boss',
  totalHp: 981609,
  halves: [
    {
      half: '上半',
      tags: ['Wind'],
      level: 75,
      hp: 468608,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2033010', hp: 147981, count: 1, name: '咆哮灵柩', rank: '精英' },
            { monsterId: '2032020', hp: 24664, count: 2, name: '蚀月狼卒', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '2033010', hp: 147981, count: 1, name: '咆哮灵柩', rank: '精英' },
            { monsterId: '8003010', hp: 123318, count: 1, name: '外宇宙之冰', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Thunder', 'Imaginary'],
      level: 75,
      hp: 513001,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2013020', hp: 147981, count: 1, name: '金人勾魂使', rank: '精英' },
            { monsterId: '8012020', hp: 22197, count: 2, name: '虚卒•篡改者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '3013010', hp: 172645, count: 1, name: '忆域迷因「狂怒褪去之壳」', rank: '精英' },
            { monsterId: '2013020', hp: 147981, count: 1, name: '金人勾魂使', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_5: StageDef = {
  index: 5,
  name: '物竞天择其五',
  nameEn: 'Stage 5',
  f: 5,
  kind: 'boss',
  totalHp: 1301637,
  halves: [
    {
      half: '上半',
      tags: ['Wind'],
      level: 78,
      hp: 548362,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2033010', hp: 173167, count: 1, name: '咆哮灵柩', rank: '精英' },
            { monsterId: '2032020', hp: 28861, count: 2, name: '蚀月狼卒', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '2033010', hp: 173167, count: 1, name: '咆哮灵柩', rank: '精英' },
            { monsterId: '8003010', hp: 144306, count: 1, name: '外宇宙之冰', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Physical', 'Ice'],
      level: 78,
      hp: 753275,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '4063010', hp: 230889, count: 1, name: '金血忆灵•翼蛇形', rank: '精英' },
            { monsterId: '8012030', hp: 30304, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '4063010', hp: 230889, count: 1, name: '金血忆灵•翼蛇形', rank: '精英' },
            { monsterId: '5023020', hp: 230889, count: 1, name: '吞神子嗣', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_6: StageDef = {
  index: 6,
  name: '物竞天择其六',
  nameEn: 'Stage 6',
  f: 6,
  kind: 'boss',
  totalHp: 1396188,
  halves: [
    {
      half: '上半',
      tags: ['Quantum'],
      level: 80,
      hp: 778827,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '5013060', hp: 237447, count: 1, name: '破晓战队•曙光', rank: '精英' },
            { monsterId: '8012030', hp: 33243, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '5013060', hp: 237447, count: 1, name: '破晓战队•曙光', rank: '精英' },
            { monsterId: '5013070', hp: 237447, count: 1, name: '破晓战队•灰烬', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Physical', 'Imaginary'],
      level: 80,
      hp: 617361,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2013020', hp: 189957, count: 1, name: '金人勾魂使', rank: '精英' },
            { monsterId: '8012010', hp: 23745, count: 2, name: '虚卒•掠夺者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '2013020', hp: 189957, count: 2, name: '金人勾魂使', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_7: StageDef = {
  index: 7,
  name: '物竞天择其七',
  nameEn: 'Stage 7',
  f: 7,
  kind: 'boss',
  totalHp: 1471425,
  halves: [
    {
      half: '上半',
      tags: ['Physical', 'Fire'],
      level: 82,
      hp: 762177,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '3003040', hp: 211716, count: 1, name: '「同音共律的来日」', rank: '精英' },
            { monsterId: '8012030', hp: 37050, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '4033030', hp: 264645, count: 1, name: '黑日狮鹫', rank: '精英' },
            { monsterId: '3003040', hp: 211716, count: 1, name: '「同音共律的来日」', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Ice', 'Wind'],
      level: 82,
      hp: 709248,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2023020', hp: 211716, count: 1, name: '丰饶灵兽•长右', rank: '精英' },
            { monsterId: '8012030', hp: 37050, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '2023020', hp: 211716, count: 2, name: '丰饶灵兽•长右', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_8: StageDef = {
  index: 8,
  name: '物竞天择其八',
  nameEn: 'Stage 8',
  f: 8,
  kind: 'boss',
  totalHp: 2179444,
  halves: [
    {
      half: '上半',
      tags: ['Fire', 'Ice'],
      level: 85,
      hp: 1060717,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '4063010', hp: 331474, count: 1, name: '金血忆灵•翼蛇形', rank: '精英' },
            { monsterId: '8012030', hp: 43506, count: 2, name: '虚卒•抹消者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '4063010', hp: 331474, count: 1, name: '金血忆灵•翼蛇形', rank: '精英' },
            { monsterId: '4053020', hp: 310757, count: 1, name: '飓风大母', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Fire'],
      level: 85,
      hp: 1118727,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '5013010', hp: 372909, count: 1, name: '摇滚狂徒', rank: '精英' },
            { monsterId: '8012010', hp: 31076, count: 2, name: '虚卒•掠夺者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '5013010', hp: 372909, count: 1, name: '摇滚狂徒', rank: '精英' },
            { monsterId: '4053010', hp: 310757, count: 1, name: '波涛夫人', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_9: StageDef = {
  index: 9,
  name: '物竞天择其九',
  nameEn: 'Stage 9',
  f: 9,
  kind: 'boss',
  totalHp: 2126565,
  halves: [
    {
      half: '上半',
      tags: ['Wind'],
      level: 88,
      hp: 1116689,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2033010', hp: 291310, count: 1, name: '咆哮灵柩', rank: '精英' },
            { monsterId: '2032020', hp: 48552, count: 2, name: '蚀月狼卒', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '5013010', hp: 436965, count: 1, name: '摇滚狂徒', rank: '精英' },
            { monsterId: '2033010', hp: 291310, count: 1, name: '咆哮灵柩', rank: '精英' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Thunder', 'Imaginary'],
      level: 88,
      hp: 1009876,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2013020', hp: 291310, count: 1, name: '金人勾魂使', rank: '精英' },
            { monsterId: '8012020', hp: 43697, count: 2, name: '虚卒•篡改者', rank: '小怪Lv2' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '3013010', hp: 339862, count: 1, name: '忆域迷因「狂怒褪去之壳」', rank: '精英' },
            { monsterId: '2013020', hp: 291310, count: 1, name: '金人勾魂使', rank: '精英' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_10: StageDef = {
  index: 10,
  name: '物竞天择其十',
  nameEn: 'Stage 10',
  f: 10,
  kind: 'boss',
  totalHp: 3194142,
  halves: [
    {
      half: '上半',
      tags: ['Fire', 'Imaginary'],
      level: 90,
      hp: 1725105,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '3003030', hp: 323457, count: 1, name: '「身陷樊笼的往昔」', rank: '精英' },
            { monsterId: '3003050', hp: 323457, count: 1, name: '「醉于盛会的此刻」', rank: '精英' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '3004020', hp: 1078191, count: 1, name: '奇想林中的蕉研组', rank: '小BOSS' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Ice', 'Thunder'],
      level: 90,
      hp: 1469037,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '1013020', hp: 296503, count: 1, name: '自动机兵•齿狼', rank: '精英' },
            { monsterId: '1023010', hp: 296503, count: 1, name: '炽燃徘徊者', rank: '精英' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '4034010', hp: 876031, count: 1, name: '至黑之剑，盗火行者', rank: '小BOSS' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_11: StageDef = {
  index: 11,
  name: '物竞天择其十一',
  nameEn: 'Stage 11',
  f: 11,
  kind: 'boss',
  totalHp: 4964777,
  halves: [
    {
      half: '上半',
      tags: ['Physical', 'Wind'],
      level: 92,
      hp: 3469362,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '5013010', hp: 538349, count: 2, name: '摇滚狂徒', rank: '精英' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '3024030', hp: 2392664, count: 1, name: '示死祸源：深魇蝗灾', rank: '小BOSS' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Ice', 'Quantum'],
      level: 92,
      hp: 1495415,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '5023020', hp: 478533, count: 1, name: '吞神子嗣', rank: '精英' },
            { monsterId: '8003020', hp: 299083, count: 1, name: '外宇宙之炎', rank: '精英' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '8024011', hp: 717799, count: 1, name: '虫群•真蛰虫', rank: '小BOSS' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_12: StageDef = {
  index: 12,
  name: '物竞天择其十二',
  nameEn: 'Stage 12',
  f: 12,
  kind: 'boss',
  totalHp: 4085146,
  halves: [
    {
      half: '上半',
      tags: ['Fire', 'Wind'],
      level: 95,
      hp: 2112405,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '5013010', hp: 628484, count: 1, name: '摇滚狂徒', rank: '精英' },
            { monsterId: '8003040', hp: 523737, count: 1, name: '蚕食者之影', rank: '精英' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '2034010', hp: 960184, count: 1, name: '步离战首•呼雷', rank: '小BOSS' },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Quantum', 'Imaginary'],
      level: 95,
      hp: 1972741,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '4023010', hp: 628484, count: 1, name: '正阳狮鹫', rank: '精英' },
            { monsterId: '4023020', hp: 558652, count: 1, name: '月夜天马', rank: '精英' },
          ],
        },
        {
          wave: 2,
          foes: [
            { monsterId: '5034010', hp: 785605, count: 1, name: '堕神之血•亚婆离', rank: '小BOSS' },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_MOC_P44_0: StageDef = {
  index: 0,
  name: '星启',
  nameEn: 'Tierce',
  f: 0,
  kind: 'star',
  totalHp: 1920367,
  level: 95,
  tags: ['Physical'],
  mechanics: [{ name: '物竞天择', desc: '我方目标施放终结技时获得5个笑点。每个轮开始时，使阿哈立即获得1个固定计入20笑点的额外回合，该回合不消耗笑点。' }, { name: '阿哈帮大忙了', desc: '我方全体攻击力提高300点，防御力提高240点，生命上限提高600点，速度提高12点，暴击伤害提高30%。' }],
  halves: [],
  waves: [
    {
      wave: 1,
      foes: [
        { monsterId: '4063010', hp: 558652, count: 1, name: '金血忆灵•翼蛇形', rank: '精英', weak: ['Physical', 'Fire', 'Ice'] },
        { monsterId: '2013020', hp: 418989, count: 1, name: '金人勾魂使', rank: '精英', weak: ['Physical', 'Thunder', 'Imaginary'] },
      ],
    },
    {
      wave: 2,
      foes: [
        { monsterId: '4064010', hp: 942726, count: 1, name: '金血忆灵•裁定忘却之形', rank: '小BOSS', weak: ['Physical', 'Ice', 'Imaginary'] },
      ],
    },
  ],
};

/* ===== pure-p27：pure 第 27 期「取象为文」（HardLevelGroup 1） ===== */

const S_PURE_P27_4: StageDef = {
  index: 4,
  name: '取象为文其四',
  nameEn: 'Stage 4',
  f: 4,
  kind: 'boss',
  totalHp: 374034395,
  halves: [
    {
      half: '上半',
      tags: ['Ice', 'Thunder'],
      level: 85,
      hp: 192908819,
      waves: [
        {
          wave: 1,
          mult: '×5',
          foes: [
            { monsterId: '4022010', hp: 262628, count: 13, name: '流星铁鹰', rank: '小怪Lv2', weak: ['Wind', 'Quantum', 'Imaginary'] },
            { monsterId: '4012010', hp: 227611, count: 14, name: '天谴斗士', rank: '小怪Lv2', weak: ['Thunder', 'Quantum', 'Imaginary'] },
            { monsterId: '5012110', hp: 525255, count: 2, name: '狸猫记者', rank: '小怪Lv2', weak: ['Thunder', 'Quantum', 'Imaginary'] },
            { monsterId: '8003060', hp: 437713, count: 1, name: '虚构集合体', rank: '精英' },
          ],
        },
        {
          wave: 2,
          mult: '×10',
          foes: [
            { monsterId: '4013010', hp: 14444524, count: 1, name: '天谴先锋', rank: '精英', weak: ['Ice', 'Thunder', 'Quantum'] },
            { monsterId: '2022040', hp: 280136, count: 20, name: '丰饶灵兽•娄金', rank: '小怪Lv2', weak: ['Ice', 'Thunder', 'Quantum'] },
            { monsterId: '1012010', hp: 245119, count: 20, name: '自动机兵•战犬', rank: '小怪Lv2', weak: ['Physical', 'Thunder'] },
          ],
        },
        {
          wave: 3,
          mult: '×46',
          foes: [
            { monsterId: '4034014', hp: 66444814, count: 1, name: '至黑之剑，盗火行者', rank: '小BOSS', weak: ['Ice', 'Thunder', 'Quantum'] },
            { monsterId: '4032030', hp: 2738332, count: 20, name: '黑潮蚀斧', rank: '小怪Lv2', weak: ['Physical', 'Thunder', 'Quantum'] },
            { monsterId: '4032024', hp: 1932940, count: 20, name: '残破容器', rank: '小怪Lv2', weak: ['Ice', 'Thunder', 'Quantum'] },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Fire', 'Imaginary'],
      level: 85,
      hp: 181125576,
      waves: [
        {
          wave: 1,
          mult: '×5',
          foes: [
            { monsterId: '2032010', hp: 175085, count: 14, name: '玄爪狼卒', rank: '小怪Lv2', weak: ['Fire', 'Imaginary'] },
            { monsterId: '2022050', hp: 175085, count: 13, name: '丰饶灵兽•奎木', rank: '小怪Lv2', weak: ['Fire', 'Wind', 'Imaginary'] },
            { monsterId: '5012110', hp: 525255, count: 2, name: '狸猫记者', rank: '小怪Lv2', weak: ['Thunder', 'Quantum', 'Imaginary'] },
            { monsterId: '8003060', hp: 437713, count: 1, name: '虚构集合体', rank: '精英' },
          ],
        },
        {
          wave: 2,
          mult: '×10',
          foes: [
            { monsterId: '3003020', hp: 14444524, count: 1, name: '惊梦剧团的甜猿泰山', rank: '精英', weak: ['Physical', 'Fire', 'Imaginary'] },
            { monsterId: '8022010', hp: 393942, count: 20, name: '幼蛰虫', rank: '小怪Lv2', weak: ['Quantum', 'Imaginary'] },
            { monsterId: '2002010', hp: 280136, count: 20, name: '云骑巡防士卒', rank: '小怪Lv2', weak: ['Fire', 'Wind', 'Imaginary'] },
          ],
        },
        {
          wave: 3,
          mult: '×46',
          foes: [
            { monsterId: '5014023', hp: 66444814, count: 1, name: '合金机铠•帕姆王', rank: '小BOSS', weak: ['Fire', 'Thunder', 'Imaginary'] },
            { monsterId: '5012120', hp: 2416175, count: 20, name: '「合金保姆」', rank: '小怪Lv2', weak: ['Fire', 'Thunder', 'Imaginary'] },
            { monsterId: '2022050', hp: 1610783, count: 20, name: '丰饶灵兽•奎木', rank: '小怪Lv2', weak: ['Fire', 'Wind', 'Imaginary'] },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_PURE_P27_0: StageDef = {
  index: 0,
  name: '星启',
  nameEn: 'Tierce',
  f: 0,
  kind: 'star',
  totalHp: 212629524,
  level: 85,
  tags: ['Physical', 'Ice'],
  halves: [],
  waves: [
    {
      wave: 1,
      mult: '×5.5',
      foes: [
        { monsterId: '1002030', hp: 202223, count: 14, name: '银鬃炮手', rank: '小怪Lv2', weak: ['Physical', 'Ice', 'Imaginary'] },
        { monsterId: '1002050', hp: 105927, count: 13, name: '银鬃射手', rank: '小怪Lv2', weak: ['Physical', 'Ice'] },
        { monsterId: '5012110', hp: 577781, count: 2, name: '狸猫记者', rank: '小怪Lv2', weak: ['Thunder', 'Quantum', 'Imaginary'] },
        { monsterId: '8003060', hp: 481484, count: 1, name: '虚构集合体', rank: '精英' },
      ],
    },
    {
      wave: 2,
      mult: '×13',
      foes: [
        { monsterId: '2023030', hp: 18777882, count: 1, name: '承露天人', rank: '精英', weak: ['Physical', 'Ice', 'Thunder'] },
        { monsterId: '2032020', hp: 455221, count: 20, name: '蚀月狼卒', rank: '小怪Lv2', weak: ['Physical', 'Wind'] },
        { monsterId: '2002030', hp: 341416, count: 20, name: '幽府武弁', rank: '小怪Lv2', weak: ['Physical', 'Ice', 'Wind'] },
      ],
    },
    {
      wave: 3,
      mult: '×56',
      foes: [
        { monsterId: '3024010', hp: 80889343, count: 1, name: '银枝', rank: '小BOSS', weak: ['Physical', 'Fire', 'Ice'] },
        { monsterId: '3021020', hp: 2696311, count: 20, name: '「授勋」', rank: '小怪', weak: ['Physical', 'Ice'] },
        { monsterId: '3021040', hp: 1862906, count: 20, name: '「盾」', rank: '小怪', weak: ['Physical', 'Thunder'] },
      ],
    },
  ],
};

/* ===== apo-p21：apo 第 21 期「支配遗忘」（HardLevelGroup 1） ===== */

const S_APO_P21_4: StageDef = {
  index: 4,
  name: '支配遗忘·难度04',
  nameEn: 'Stage 04',
  f: 4,
  kind: 'boss',
  totalHp: 9129057,
  halves: [
    {
      half: '上半',
      tags: ['Physical', 'Fire', 'Wind', 'Imaginary'],
      level: 90,
      hp: 1869807,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '2004014', hp: 1869807, count: 1, name: '勾魂摄魄的支配者', rank: '小BOSS', weak: ['Physical', 'Fire', 'Wind', 'Imaginary'] },
          ],
        },
      ],
    },
    {
      half: '下半',
      tags: ['Physical', 'Fire', 'Thunder', 'Imaginary'],
      level: 90,
      hp: 7259250,
      waves: [
        {
          wave: 1,
          foes: [
            { monsterId: '4064012', hp: 7259250, count: 1, name: '迷惘之渊的裁定者', rank: '小BOSS', weak: ['Physical', 'Fire', 'Thunder', 'Imaginary'] },
          ],
        },
      ],
    },
  ],
  waves: [],
};

const S_APO_P21_0: StageDef = {
  index: 0,
  name: '星启',
  nameEn: 'Tierce',
  f: 0,
  kind: 'star',
  totalHp: 2419750,
  level: 90,
  tags: ['Physical', 'Fire', 'Wind', 'Quantum'],
  halves: [],
  waves: [
    {
      wave: 1,
      foes: [
        { monsterId: '2034014', hp: 2419750, count: 1, name: '雷奔云谲的恶狼主', rank: '小BOSS', weak: ['Physical', 'Fire', 'Wind', 'Quantum'] },
      ],
    },
  ],
};

/* ===== arb-p10：arb 第 10 期「落叶归根」（HardLevelGroup 3） ===== */

const S_ARB_P10_1: StageDef = {
  index: 1,
  name: '王棋',
  nameEn: 'King',
  f: 4,
  kind: 'single',
  totalHp: 2366503,
  level: 100,
  tags: ['Quantum', 'Imaginary'],
  mechanics: [{ name: '血嗜', desc: '我方目标回合开始时损失500点生命值，该效果可致命。' }, { name: '洞穿', desc: '敌方目标施放攻击时，如果受到攻击的我方目标持有护盾，则使敌方目标造成的伤害提高200%。' }, { name: '狂喜之夜', desc: '我方编队中第一位角色造成的欢愉伤害增笑50%。' }, { name: '领航誓言', desc: '我方编队中第一位角色造成的战技和终结技伤害的全属性抗性穿透提高50%。' }, { name: '胞吞作用', desc: '【稳态失衡】对【血脑屏障】造成的伤害提高50%。' }],
  siteName: '将杀王棋·上半',
  halves: [],
  waves: [
    {
      wave: 1,
      foes: [
        { monsterId: '4023020', hp: 721220, count: 1, name: '月夜天马', rank: '精英', weak: ['Fire', 'Quantum', 'Imaginary'] },
        { monsterId: '8033020', hp: 631067, count: 1, name: '「灯塔」', rank: '精英', weak: ['Fire', 'Wind', 'Quantum'] },
      ],
    },
    {
      wave: 2,
      foes: [
        { monsterId: '5034010', hp: 1014216, count: 1, name: '堕神之血•亚婆离', rank: '小BOSS', weak: ['Ice', 'Quantum', 'Imaginary'] },
      ],
    },
  ],
};

const S_ARB_P10_2: StageDef = {
  index: 2,
  name: '绝境王棋',
  nameEn: 'Nightmare King',
  f: 4,
  kind: 'single',
  totalHp: 9466011,
  level: 120,
  tags: ['Quantum', 'Imaginary'],
  mechanics: [{ name: '血嗜+', desc: '我方目标回合开始时损失1000点生命值，该效果可致命。' }, { name: '洞穿+', desc: '敌方目标施放攻击时，如果受到攻击的我方目标持有护盾，则使敌方目标造成的伤害提高400%。' }, { name: '不屈', desc: '敌方目标受到攻击时，获得相当于自身1.0%生命上限的护盾。' }],
  siteName: '将杀王棋·苦难阶段',
  halves: [],
  waves: [
    {
      wave: 1,
      foes: [
        { monsterId: '4023020', hp: 2884879, count: 1, name: '月夜天马', rank: '精英', weak: ['Fire', 'Quantum', 'Imaginary'] },
        { monsterId: '8033020', hp: 2524270, count: 1, name: '「灯塔」', rank: '精英', weak: ['Fire', 'Wind', 'Quantum'] },
      ],
    },
    {
      wave: 2,
      foes: [
        { monsterId: '5034010', hp: 4056862, count: 1, name: '堕神之血•亚婆离', rank: '小BOSS', weak: ['Ice', 'Quantum', 'Imaginary'] },
      ],
    },
  ],
};

const S_ARB_P10_3: StageDef = {
  index: 3,
  name: '骑士（三）',
  nameEn: 'Knight III',
  f: 3,
  kind: 'single',
  totalHp: 3735988,
  level: 95,
  tags: ['Fire', 'Wind'],
  mechanics: [{ name: '闭锁', desc: '我方目标每次施放攻击后叠加1层该效果，达到6层后使该目标陷入持续1回合的【禁锢】状态，并固定降低30%能量。该效果的层数在目标回合开始时或负面效果触发后清空。' }],
  halves: [],
  waves: [
    {
      wave: 1,
      foes: [
        { monsterId: '4053020', hp: 523737, count: 1, name: '飓风大母', rank: '精英', weak: ['Fire', 'Ice', 'Thunder'] },
        { monsterId: '2023020', hp: 418989, count: 1, name: '丰饶灵兽•长右', rank: '精英', weak: ['Fire', 'Ice', 'Wind'] },
      ],
    },
    {
      wave: 2,
      foes: [
        { monsterId: '3024030', hp: 2793262, count: 1, name: '示死祸源：深魇蝗灾', rank: '小BOSS', weak: ['Physical', 'Fire', 'Wind'] },
      ],
    },
  ],
};

const S_ARB_P10_4: StageDef = {
  index: 4,
  name: '骑士（二）',
  nameEn: 'Knight II',
  f: 2,
  kind: 'single',
  totalHp: 2182237,
  level: 95,
  tags: ['Quantum'],
  mechanics: [{ name: '桎梏+', desc: '我方目标初始获得2层该效果，每层使自身造成的伤害降低20%，该效果不可解除，每次施放终结技后移除1层该效果。' }, { name: '激怒', desc: '我方目标每次施放终结技后使敌方全体目标叠加1层该效果，每层使敌方目标的速度提高30%，最多叠加4层。该效果的层数在敌方目标回合开始时清空。' }],
  halves: [],
  waves: [
    {
      wave: 1,
      foes: [
        { monsterId: '5013050', hp: 523737, count: 1, name: '破晓战队•赤焰', rank: '精英', weak: ['Physical', 'Quantum', 'Imaginary'] },
        { monsterId: '5013070', hp: 523737, count: 1, name: '破晓战队•灰烬', rank: '精英', weak: ['Fire', 'Quantum', 'Imaginary'] },
      ],
    },
    {
      wave: 2,
      foes: [
        { monsterId: '4014030', hp: 1134763, count: 1, name: '冥魂渡者，死龙残躯，玻吕刻斯', rank: '小BOSS', weak: ['Wind', 'Quantum', 'Imaginary'] },
      ],
    },
  ],
};

const S_ARB_P10_5: StageDef = {
  index: 5,
  name: '骑士（一）',
  nameEn: 'Knight I',
  f: 1,
  kind: 'single',
  totalHp: 2042574,
  level: 95,
  tags: ['Fire', 'Imaginary'],
  mechanics: [{ name: '血嗜', desc: '我方目标回合开始时损失500点生命值，该效果可致命。' }],
  halves: [],
  waves: [
    {
      wave: 1,
      foes: [
        { monsterId: '5013040', hp: 523737, count: 1, name: '破晓战队•苍翼', rank: '精英', weak: ['Physical', 'Fire', 'Imaginary'] },
        { monsterId: '5023010', hp: 209495, count: 1, name: '乐变化天人', rank: '精英', weak: ['Fire', 'Thunder', 'Imaginary'] },
      ],
    },
    {
      wave: 2,
      foes: [
        { monsterId: '5014020', hp: 1309342, count: 1, name: '合金机铠•帕姆王', rank: '小BOSS', weak: ['Fire', 'Thunder', 'Imaginary'] },
      ],
    },
  ],
};

/** 兼容旧口径：物竞天择（moc-p44）12 关（新 UI 请用 STAGE_PACKS） */
export const MONSTER_STAGES: StageDef[] = [
  S_MOC_P44_1,
  S_MOC_P44_2,
  S_MOC_P44_3,
  S_MOC_P44_4,
  S_MOC_P44_5,
  S_MOC_P44_6,
  S_MOC_P44_7,
  S_MOC_P44_8,
  S_MOC_P44_9,
  S_MOC_P44_10,
  S_MOC_P44_11,
  S_MOC_P44_12,
];

/** 按关卡序号取旧表关卡（moc-p44） */
export function monsterStage(index: number): StageDef | undefined {
  return MONSTER_STAGES.find((s) => s.index === index);
}

/** 全部关卡包（顺序 = 模式顺序：混沌 / 虚构 / 末日 / 仲裁） */
export const STAGE_PACKS: StagePackDef[] = [
  {
    id: 'moc-p43',
    mode: 'moc',
    period: 43,
    title: '来生泅渡',
    p: 1035,
    roundMode: 'forgotten',
    difficultyGroup: 3,
    modeMechanics: [{ name: '记忆紊流', desc: '我方编队中第一位角色获得欢愉技【极乐漩涡】，可对敌方全体造成100%的角色属性欢愉伤害。每个轮开始时，使阿哈立即获得1个固定计入20笑点的额外回合，该回合不消耗笑点。' }],
    stages: [
      S_MOC_P43_12,
      S_MOC_P43_0,
    ],
  },
  {
    id: 'moc-p44',
    mode: 'moc',
    period: 44,
    title: '物竞天择',
    p: 1036,
    roundMode: 'forgotten',
    difficultyGroup: 3,
    modeMechanics: [{ name: '物竞天择', desc: '我方目标施放终结技时获得5个笑点。每个轮开始时，使阿哈立即获得1个固定计入20笑点的额外回合，该回合不消耗笑点。' }],
    stages: [
      S_MOC_P44_12,
      S_MOC_P44_0,
    ],
  },
  {
    id: 'pure-p27',
    mode: 'pure',
    period: 27,
    title: '取象为文',
    p: 2027,
    roundMode: 'forgotten',
    difficultyGroup: 1,
    modeMechanics: [],
    stages: [
      S_PURE_P27_4,
      S_PURE_P27_0,
    ],
  },
  {
    id: 'apo-p21',
    mode: 'apo',
    period: 21,
    title: '支配遗忘',
    p: 3021,
    roundMode: 'phantom',
    difficultyGroup: 1,
    modeMechanics: [{ name: '末法余烬', desc: '拥有【坚防守备】的敌方目标被弱点击破时，使我方全体目标解除控制状态、行动提前并使阿哈立即获得一个额外回合（本回合固定计入10笑点）。敌方全体目标受到的终结技伤害提高25%，欢愉伤害提高15%。' }],
    stages: [
      S_APO_P21_4,
      S_APO_P21_0,
    ],
  },
  {
    id: 'arb-p10',
    mode: 'arb',
    period: 10,
    title: '落叶归根',
    p: 10,
    roundMode: 'arbiter',
    difficultyGroup: 3,
    modeMechanics: [],
    stages: [
      S_ARB_P10_1,
      S_ARB_P10_2,
      S_ARB_P10_3,
      S_ARB_P10_4,
      S_ARB_P10_5,
    ],
  },
];

/** 按 id 取关卡包 */
export function stagePack(id: string): StagePackDef | undefined {
  return STAGE_PACKS.find((p) => p.id === id);
}

/** 按 包 id + 关卡序号取关卡 */
export function packStage(packId: string, index: number): StageDef | undefined {
  return stagePack(packId)?.stages.find((s) => s.index === index);
}

/** 关卡 → 段列表（boss = 上/下半；star/single = 单段） */
export interface StageSection {
  half?: '上半' | '下半';
  level: number;
  hp: number;
  tags: Element[];
  waves: StageWave[];
}

/** 取关卡的段列表 */
export function stageSections(st: StageDef): StageSection[] {
  if (st.kind === 'boss') return st.halves.map((h) => ({ half: h.half, level: h.level, hp: h.hp, tags: h.tags, waves: h.waves }));
  return [{ level: st.level ?? 90, hp: st.totalHp, tags: st.tags ?? [], waves: st.waves }];
}

/** 关卡内单只怪的引擎配置（缺档案/缺乘区返回 undefined） */
export function buildStageMonster(foe: StageFoe, level: number, group = 3): MonsterConfig | undefined {
  const p = STAGE_MONSTERS[foe.monsterId];
  const sc = stageScale(group, level);
  if (!p || !sc) return undefined;
  return {
    name: p.name,
    monsterId: foe.monsterId,
    level,
    hp: foe.hp,
    attack: p.base.atk * p.child.atk * sc.atk,
    speed: p.base.spd * p.child.spd * sc.spd,
    maxToughness: p.base.stance * p.child.stance * sc.stance,
    toughnessUiMax: (p.base.stance * p.child.stance * sc.stance) / 3,
    enemyClass: p.enemyClass,
    weaknesses: p.weaknesses,
    resistance: p.resistance,
    effectRes: p.base.statusRes + sc.statusResAdd,
    effectHit: sc.statusHit,
  };
}

/** 段波次 → 引擎波次配置（每波最多 3 只，对应 monster1/2/3 槽） */
function buildWaves(sections: StageSection[], group: number, half?: '上半' | '下半'): MonsterConfig[][] {
  const use = half ? sections.filter((s) => s.half === half) : sections;
  const waves: MonsterConfig[][] = [];
  for (const sec of use) {
    for (const w of sec.waves) {
      const cfgs: MonsterConfig[] = [];
      for (const foe of w.foes) {
        for (let i = 0; i < foe.count; i++) {
          const cfg = buildStageMonster(foe, sec.level, group);
          if (cfg) cfgs.push(cfg);
        }
      }
      if (cfgs.length) waves.push(cfgs);
    }
  }
  return waves;
}

/**
 * 关卡 → 引擎波次配置（每个波次最多 3 只，对应 monster1/2/3 槽）。
 *
 * half 缺省 = 上下半波次顺接（近似：游戏中上下半是两段独立战斗）；
 * 指定 '上半' / '下半' 则只取该半。
 */
export function buildStageMonsterConfigs(
  index: number,
  half?: '上半' | '下半',
): MonsterConfig[][] {
  const st = monsterStage(index);
  if (!st) return [];
  return buildWaves(stageSections(st), 3, half);
}

/** 按 包 id + 关卡序号 → 引擎波次配置（half 只对 boss 关有意义） */
export function buildPackStageWaves(
  packId: string,
  index: number,
  half?: '上半' | '下半',
): MonsterConfig[][] {
  const pack = stagePack(packId);
  const st = pack?.stages.find((s) => s.index === index);
  if (!pack || !st) return [];
  return buildWaves(stageSections(st), pack.difficultyGroup, half);
}
