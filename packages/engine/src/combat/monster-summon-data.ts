import type { Element } from '@hsr-calc/shared';
import { STAGE_SCALES } from './monster-stages.js';

/**
 * 敌方召唤物档案（手写表，非生成物）。
 *
 * 数据源：本地 `data/monsters/{父 id}.json` 的 child 列表（hp/atk/spd/stance 倍率 + 弱点/抗性）
 *        + Dimbreath `MonsterConfig.SummonIDList`（各怪实际召唤的变体 id）。
 *
 * 口径：召唤物 stat = 基础值 × 子变体倍率 × 难度乘区（HardLevelGroup=3，与关卡怪同口径）。
 *      难度乘区取 `STAGE_SCALES[level]`（只含关卡表用到的 12 个等级；缺省取不高于该级的最近一档）。
 *      **所有数值都是可调参数**。
 */
export interface SummonMonsterProfile {
  /** 召唤物 id（= Dimbreath SummonIDList 里的变体 id） */
  monsterId: string;
  /** 技能表键（父档案 id；变体与其父共用技能表） */
  skillKey: string;
  /** 中文名 */
  name: string;
  /** 英文名 */
  nameEn: string;
  /** 基础生命值（已含子变体 hp 倍率） */
  hp: number;
  /** 基础攻击力（已含子变体 atk 倍率） */
  atk: number;
  /** 基础速度（已含子变体速度倍率） */
  spd: number;
  /** 基础韧性 */
  stance: number;
  /** 弱点 */
  weaknesses: Element[];
  /** 分属性抗性 */
  resistance: Partial<Record<Element, number>>;
  /** 效果抵抗（status_resistance_base） */
  statusRes: number;
  /** 说明（数据来源 / 待核项） */
  note?: string;
}

export const SUMMON_MONSTERS: Record<string, SummonMonsterProfile> = {
  // 2032010 玄爪狼卒（父档案 hp186/atk18/spd120/stance90/sres0.1）→ 变体 203201003：atk×0.666667
  '203201003': {
    monsterId: '203201003',
    skillKey: '2032010',
    name: '玄爪狼卒',
    nameEn: 'Sableclaw Wolftrooper',
    hp: 186,
    atk: 12,
    spd: 120,
    stance: 90,
    weaknesses: ['Fire', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2 },
    statusRes: 0.1,
    note: '呼雷【召集狼群】召唤物之一；atk = 18×0.666667 ≈ 12（子变体倍率）',
  },
  // 2032020 蚀月狼卒（同上）→ 变体 203202004：atk×0.666667
  '203202004': {
    monsterId: '203202004',
    skillKey: '2032020',
    name: '蚀月狼卒',
    nameEn: 'Eclipse Wolftrooper',
    hp: 186,
    atk: 12,
    spd: 120,
    stance: 90,
    weaknesses: ['Physical', 'Wind'],
    resistance: { Fire: 0.2, Ice: 0.2, Thunder: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.1,
    note: '呼雷【召集狼群】召唤物之二；atk = 18×0.666667 ≈ 12（子变体倍率）',
  },
  // 4022010 流星铁鹰（父档案 hp279/atk18/spd100/stance90/sres0.2）→ 狮鹫召唤 4022010 本体
  '4022010': {
    monsterId: '4022010',
    skillKey: '4022010',
    name: '流星铁鹰',
    nameEn: 'Meteoric Eagle',
    hp: 279,
    atk: 18,
    spd: 100,
    stance: 90,
    weaknesses: ['Wind', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2 },
    statusRes: 0.2,
    note: '正阳狮鹫【降示黎明】召唤（SummonIDList = 4 个 4022010）',
  },
  // 5032010 狂兽的胚芽（父档案 hp279/atk18/spd132/stance90/sres0.1）→ 变体 503201002：hp×2
  '503201002': {
    monsterId: '503201002',
    skillKey: '5032010',
    name: '狂兽的胚芽',
    nameEn: "Frenzied Beast's Seed Germ",
    hp: 558,
    atk: 18,
    spd: 132,
    stance: 90,
    weaknesses: ['Fire', 'Wind', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Quantum: 0.2 },
    statusRes: 0.1,
    note: '亚婆离【狂兽的胚芽】召唤物；hp = 279×2（子变体倍率）',
  },

  // ===== 第二十批（2026-10-30 第十五轮）：独立档案型召唤物 =====
  // 口径：这些召唤物是**独立怪种**（不是父档案的变体），故 profile = 自身 `data/monsters/{id}.json`
  //       的 child[0]（倍率 1）+ 自身弱点/抗性；stat 仍按关卡难度乘区换算（summonStats）。
  '3002030': {
    monsterId: '3002030',
    skillKey: '3002030',
    name: '惊梦剧团的气泡锂犬',
    nameEn: "Dreamjolt Troupe's Bubble Hound",
    hp: 209.25,
    atk: 18,
    spd: 100,
    stance: 90,
    weaknesses: ['Physical', 'Thunder', 'Wind'],
    resistance: { Fire: 0.2, Ice: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.1,
    note: '甜猿泰山【苏乐达派对】召唤 2 只',
  },
  '4052020': {
    monsterId: '4052020',
    skillKey: '4052020',
    name: '泡影稚子',
    nameEn: 'Mirage Fizzle Kid',
    hp: 302.25,
    atk: 18,
    spd: 120,
    stance: 120,
    weaknesses: ['Fire', 'Thunder'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.1,
    note: '飓风大母【洪潮浪的分娩】召唤（【风眼巢】无独立档案，留口）',
  },
  '1002040': {
    monsterId: '1002040',
    skillKey: '1002040',
    name: '银鬃近卫',
    nameEn: 'Silvermane Soldier',
    hp: 120.9,
    atk: 18,
    spd: 83,
    stance: 60,
    weaknesses: ['Wind', 'Quantum'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2, Imaginary: 0.2 },
    statusRes: 0.1,
    note: '银鬃尉官【增援】召唤（与银鬃射手随机二选一）',
  },
  '1002050': {
    monsterId: '1002050',
    skillKey: '1002050',
    name: '银鬃射手',
    nameEn: 'Silvermane Gunner',
    hp: 102.3,
    atk: 18,
    spd: 100,
    stance: 60,
    weaknesses: ['Physical', 'Ice'],
    resistance: { Fire: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.1,
    note: '银鬃尉官【增援】召唤',
  },
  '8032040': {
    monsterId: '8032040',
    skillKey: '8032040',
    name: '千星戍卫',
    nameEn: 'Astropolis Sentinel',
    hp: 139.5,
    atk: 18,
    spd: 110,
    stance: 90,
    weaknesses: ['Wind', 'Quantum'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Thunder: 0.2, Imaginary: 0.2 },
    statusRes: 0.1,
    note: '【正道战线】召唤',
  },
  '4012010': {
    monsterId: '4012010',
    skillKey: '4012010',
    name: '天谴斗士',
    nameEn: 'Furiae Warrior',
    hp: 241.8,
    atk: 18,
    spd: 100,
    stance: 90,
    weaknesses: ['Thunder', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Wind: 0.2 },
    statusRes: 0.2,
    note: '天谴先锋【快从坟墓中苏生】召唤',
  },
  '2022051': {
    monsterId: '2022051',
    skillKey: '2022051',
    name: '狈影',
    nameEn: 'Shadow Jackhyena',
    hp: 186,
    atk: 18,
    spd: 100,
    stance: 60,
    weaknesses: ['Fire', 'Wind', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Quantum: 0.2 },
    statusRes: 0.1,
    note: '奎木【啸聚】召唤（等血量）',
  },
  '3021020': {
    monsterId: '3021020',
    skillKey: '3021020',
    name: '「授勋」',
    nameEn: '"The Honored"',
    hp: 255.75,
    atk: 18,
    spd: 100,
    stance: 90,
    weaknesses: ['Physical', 'Ice'],
    resistance: { Fire: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.3,
    note: '银枝【枪与盾】随机召唤；死亡钩子见 302102002（颠仆的星花阶石）',
  },
  '3021030': {
    monsterId: '3021030',
    skillKey: '3021030',
    name: '「枪尖」',
    nameEn: '"Speartip"',
    hp: 148.8,
    atk: 18,
    spd: 100,
    stance: 90,
    weaknesses: ['Physical', 'Fire'],
    resistance: { Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.3,
    note: '银枝【枪与盾】随机召唤',
  },
  '3021040': {
    monsterId: '3021040',
    skillKey: '3021040',
    name: '「盾」',
    nameEn: '"The Shield"',
    hp: 176.7,
    atk: 18,
    spd: 100,
    stance: 90,
    weaknesses: ['Physical', 'Thunder'],
    resistance: { Fire: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.3,
    note: '银枝【枪与盾】随机召唤；死亡钩子见 302104002（飞速欲念摹本）',
  },
  '4032020': {
    monsterId: '4032020',
    skillKey: '4032020',
    name: '残破容器',
    nameEn: 'Long-Shattered Vessel',
    hp: 465,
    atk: 18,
    // 该怪 speed_base 为空（数据缺失）→ 按同类 MinionLv2 取 100（可调）
    spd: 100,
    stance: 180,
    weaknesses: ['Ice', 'Thunder', 'Quantum'],
    resistance: { Physical: 0.2, Fire: 0.2, Wind: 0.2, Imaginary: 0.2 },
    statusRes: 0.3,
    note: '盗火行者【亡死的黑云】【相混的道途】共祭族；speed_base 缺失按 100 占位',
  },
  '5023020': {
    monsterId: '5023020',
    skillKey: '5023020',
    name: '吞神子嗣',
    nameEn: 'God-Devourer Offspring',
    hp: 1488,
    atk: 18,
    spd: 120,
    stance: 540,
    weaknesses: ['Fire', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
    statusRes: 0.2,
    note: '绘世【空想异魔画】召唤',
  },
  '4062010': {
    monsterId: '4062010',
    skillKey: '4062010',
    name: '金血忆灵•雉形',
    nameEn: 'Ichor Memosprite: Pheasant',
    hp: 232.5,
    atk: 18,
    spd: 100,
    stance: 90,
    weaknesses: ['Physical', 'Fire'],
    resistance: { Ice: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.1,
    note: '金血忆灵【化整为零】分裂 / 【执刑就位】召唤的雉形',
  },
  '4062020': {
    monsterId: '4062020',
    skillKey: '4062020',
    name: '金血忆灵•犬形',
    nameEn: 'Ichor Memosprite: Canine',
    hp: 279,
    atk: 18,
    spd: 120,
    stance: 90,
    weaknesses: ['Ice', 'Imaginary'],
    resistance: { Physical: 0.2, Fire: 0.2, Thunder: 0.2, Wind: 0.2, Quantum: 0.2 },
    statusRes: 0.1,
    note: '金血忆灵【化整为零】分裂的犬形',
  },
  '4063010': {
    monsterId: '4063010',
    skillKey: '4063010',
    name: '金血忆灵•翼蛇形',
    nameEn: 'Ichor Memosprite: Winged Serpent',
    hp: 1488,
    atk: 18,
    spd: 120,
    stance: 480,
    weaknesses: ['Physical', 'Fire', 'Ice'],
    resistance: { Thunder: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.2,
    note: '金血忆灵【化整为零】分裂的翼蛇形（Elite 档）',
  },
  '5012120': {
    monsterId: '5012120',
    skillKey: '5012120',
    name: '「合金保姆」',
    nameEn: '"Alloy Pommy"',
    hp: 279,
    atk: 18,
    spd: 160,
    stance: 180,
    weaknesses: ['Fire', 'Thunder', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Wind: 0.2, Quantum: 0.2 },
    statusRes: 0.2,
    note: '合金机铠•帕姆王【洗地机之乱】召唤',
  },
  '5012030': {
    monsterId: '5012030',
    skillKey: '5012030',
    name: '攻击性阅读物',
    nameEn: 'Hostile Reading Material',
    hp: 232.5,
    atk: 18,
    spd: 100,
    stance: 90,
    weaknesses: ['Physical', 'Fire', 'Thunder'],
    resistance: { Ice: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
    statusRes: 0.1,
    note: '火花大会【抬你上麦】副战场敌方：一阶段 3 只 / 二阶段 4 只',
  },
  '5014011': {
    monsterId: '5014011',
    skillKey: '5014011',
    name: '直播小助手',
    nameEn: 'Livestream Assistant',
    hp: 837,
    atk: 18,
    spd: 144,
    stance: 450,
    weaknesses: ['Fire', 'Quantum', 'Imaginary'],
    resistance: { Physical: 0.2, Ice: 0.2, Thunder: 0.2, Wind: 0.2 },
    statusRes: 0.3,
    note: '火花大会二阶段副战场额外单位',
  },
};

/** 取召唤物档案（未知 id → undefined） */
export function summonMonsterProfile(monsterId: string): SummonMonsterProfile | undefined {
  return SUMMON_MONSTERS[monsterId];
}

/** 取不高于 level 的最近一档难度乘区（关卡表只有 12 档） */
function scaleOf(level: number): { hp: number; atk: number; spd: number; stance: number } {
  const levels = Object.keys(STAGE_SCALES)
    .map((k) => Number(k))
    .sort((a, b) => a - b);
  let pick = levels[0]!;
  for (const l of levels) {
    if (l <= level) pick = l;
  }
  const s = STAGE_SCALES[pick]!;
  return { hp: s.hp, atk: s.atk, spd: s.spd, stance: s.stance };
}

/** 召唤物按等级换算后的最终面板 */
export function summonStats(
  profile: SummonMonsterProfile,
  level: number,
): { hp: number; atk: number; speed: number; maxToughness: number } {
  const s = scaleOf(level);
  return {
    hp: profile.hp * s.hp,
    atk: profile.atk * s.atk,
    speed: profile.spd * s.spd,
    maxToughness: profile.stance * s.stance,
  };
}
