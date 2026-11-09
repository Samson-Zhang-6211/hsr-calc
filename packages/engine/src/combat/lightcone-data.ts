/**
 * 光锥叠影参数表 + 命途表（本地 data/lightcones 4.6.51 提取：refinements.level → param_list；
 * meta.path → 命途）。百分比参数为比值口径（0.18 = 18%），与伤害引擎一致。
 * 由 scripts/gen-lightcone-data.mjs 生成，勿手改；data 更新后重跑脚本。
 */

export interface LightconeSkill {
  name: string;
  skillName: string;
  desc: string;
  /** 命途（Rogue/Warlock/...；非对应命途角色装备时只有白值生效） */
  path: string;
  /** 叠影 1-5 → param_list（#1..#n 顺序） */
  levels: Record<string, number[]>;
}

export const LIGHTCONE_SKILLS: Record<string, LightconeSkill> = {
  20000: {
    name: '锋镝',
    skillName: '危机',
    desc: '战斗开始时，使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，持续<unbreak>#2[i]</unbreak>回合。',
    path: 'Rogue',
    levels: {
      1: [
        0.12,
        3
      ],
      2: [
        0.15,
        3
      ],
      3: [
        0.18,
        3
      ],
      4: [
        0.21,
        3
      ],
      5: [
        0.24,
        3
      ]
    }
  },
  20001: {
    name: '物穰',
    skillName: '繁盛',
    desc: '装备者施放战技和终结技时，治疗量提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Priest',
    levels: {
      1: [
        0.12
      ],
      2: [
        0.15
      ],
      3: [
        0.18
      ],
      4: [
        0.21
      ],
      5: [
        0.24
      ]
    }
  },
  20002: {
    name: '天倾',
    skillName: '破灭',
    desc: '使装备者普攻和战技造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Warrior',
    levels: {
      1: [
        0.2
      ],
      2: [
        0.25
      ],
      3: [
        0.3
      ],
      4: [
        0.35
      ],
      5: [
        0.4
      ]
    }
  },
  20003: {
    name: '琥珀',
    skillName: '静滞',
    desc: '使装备者的防御力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者当前生命值百分比小于<unbreak>#2[i]%</unbreak>时，其防御力额外提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Knight',
    levels: {
      1: [
        0.16,
        0.5,
        0.16
      ],
      2: [
        0.2,
        0.5,
        0.2
      ],
      3: [
        0.24,
        0.5,
        0.24
      ],
      4: [
        0.28,
        0.5,
        0.28
      ],
      5: [
        0.32,
        0.5,
        0.32
      ]
    }
  },
  20004: {
    name: '幽邃',
    skillName: '沉沦',
    desc: '战斗开始时，使装备者的效果命中提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，持续<unbreak>#2[i]</unbreak>回合。',
    path: 'Warlock',
    levels: {
      1: [
        0.2,
        3
      ],
      2: [
        0.25,
        3
      ],
      3: [
        0.3,
        3
      ],
      4: [
        0.35,
        3
      ],
      5: [
        0.4,
        3
      ]
    }
  },
  20005: {
    name: '齐颂',
    skillName: '协力',
    desc: '进入战斗后，使我方全体的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。同类技能无法重复生效。',
    path: 'Shaman',
    levels: {
      1: [
        0.08
      ],
      2: [
        0.09
      ],
      3: [
        0.1
      ],
      4: [
        0.11
      ],
      5: [
        0.12
      ]
    }
  },
  20006: {
    name: '智库',
    skillName: '博识',
    desc: '使装备者终结技造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Mage',
    levels: {
      1: [
        0.28
      ],
      2: [
        0.35
      ],
      3: [
        0.42
      ],
      4: [
        0.49
      ],
      5: [
        0.56
      ]
    }
  },
  20007: {
    name: '离弦',
    skillName: '鸣角',
    desc: '使装备者消灭敌方目标后，攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，持续<unbreak>#2[i]</unbreak>回合。',
    path: 'Rogue',
    levels: {
      1: [
        0.24,
        3
      ],
      2: [
        0.3,
        3
      ],
      3: [
        0.36,
        3
      ],
      4: [
        0.42,
        3
      ],
      5: [
        0.48,
        3
      ]
    }
  },
  20008: {
    name: '嘉果',
    skillName: '甘美',
    desc: '战斗开始时，立即为我方全体恢复<color=#f29e38ff><unbreak>#1[i]</unbreak></color>点能量。',
    path: 'Priest',
    levels: {
      1: [
        6
      ],
      2: [
        7.5
      ],
      3: [
        9
      ],
      4: [
        10.5
      ],
      5: [
        12
      ]
    }
  },
  20009: {
    name: '乐圮',
    skillName: '诛讨',
    desc: '使装备者对当前生命值百分比大于<unbreak>#1[i]%</unbreak>的敌方目标造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Warrior',
    levels: {
      1: [
        0.5,
        0.2
      ],
      2: [
        0.5,
        0.25
      ],
      3: [
        0.5,
        0.3
      ],
      4: [
        0.5,
        0.35
      ],
      5: [
        0.5,
        0.4
      ]
    }
  },
  20010: {
    name: '戍御',
    skillName: '兴复',
    desc: '使装备者施放终结技时，回复等同于自身生命上限<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>的生命值。',
    path: 'Knight',
    levels: {
      1: [
        0.18
      ],
      2: [
        0.21
      ],
      3: [
        0.24
      ],
      4: [
        0.27
      ],
      5: [
        0.3
      ]
    }
  },
  20011: {
    name: '渊环',
    skillName: '追逼',
    desc: '使装备者对减速状态下的敌方目标造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Warlock',
    levels: {
      1: [
        0.24
      ],
      2: [
        0.3
      ],
      3: [
        0.36
      ],
      4: [
        0.42
      ],
      5: [
        0.48
      ]
    }
  },
  20012: {
    name: '轮契',
    skillName: '速决',
    desc: '使装备者施放攻击或受到攻击后，额外恢复<color=#f29e38ff><unbreak>#1[i]</unbreak></color>点能量，该效果单个回合内不可重复触发。',
    path: 'Shaman',
    levels: {
      1: [
        4
      ],
      2: [
        5
      ],
      3: [
        6
      ],
      4: [
        7
      ],
      5: [
        8
      ]
    }
  },
  20013: {
    name: '灵钥',
    skillName: '顿悟',
    desc: '使装备者施放战技后额外恢复<color=#f29e38ff><unbreak>#1[i]</unbreak></color>点能量，该效果单个回合内不可重复触发。',
    path: 'Mage',
    levels: {
      1: [
        8
      ],
      2: [
        9
      ],
      3: [
        10
      ],
      4: [
        11
      ],
      5: [
        12
      ]
    }
  },
  20014: {
    name: '相抗',
    skillName: '联盟',
    desc: '使装备者在消灭敌方目标后，速度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，持续<unbreak>#2[i]</unbreak>回合。',
    path: 'Rogue',
    levels: {
      1: [
        0.1,
        2
      ],
      2: [
        0.12,
        2
      ],
      3: [
        0.14,
        2
      ],
      4: [
        0.16,
        2
      ],
      5: [
        0.18,
        2
      ]
    }
  },
  20015: {
    name: '蕃息',
    skillName: '丰饶民',
    desc: '当装备者施放普攻后，使下一次行动提前<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Priest',
    levels: {
      1: [
        0.12
      ],
      2: [
        0.14
      ],
      3: [
        0.16
      ],
      4: [
        0.18
      ],
      5: [
        0.2
      ]
    }
  },
  20016: {
    name: '俱殁',
    skillName: '军团',
    desc: '装备者当前生命值百分比小于<unbreak>#1[i]%</unbreak>时，暴击率提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Warrior',
    levels: {
      1: [
        0.8,
        0.12
      ],
      2: [
        0.8,
        0.15
      ],
      3: [
        0.8,
        0.18
      ],
      4: [
        0.8,
        0.21
      ],
      5: [
        0.8,
        0.24
      ]
    }
  },
  20017: {
    name: '开疆',
    skillName: '公司',
    desc: '当装备者击破敌方目标的弱点时，回复等同于自身生命上限<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>的生命值。',
    path: 'Knight',
    levels: {
      1: [
        0.12
      ],
      2: [
        0.14
      ],
      3: [
        0.16
      ],
      4: [
        0.18
      ],
      5: [
        0.2
      ]
    }
  },
  20018: {
    name: '匿影',
    skillName: '机关',
    desc: '施放战技后，使装备者的下一次普攻对敌方目标造成等同于自身<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>攻击力的附加伤害。',
    path: 'Warlock',
    levels: {
      1: [
        0.6
      ],
      2: [
        0.75
      ],
      3: [
        0.9
      ],
      4: [
        1.05
      ],
      5: [
        1.2
      ]
    }
  },
  20019: {
    name: '调和',
    skillName: '家族',
    desc: '进入战斗时，我方全体速度提高<color=#f29e38ff><unbreak>#1[i]</unbreak></color>点，持续<unbreak>#2[i]</unbreak>回合。',
    path: 'Shaman',
    levels: {
      1: [
        12,
        1
      ],
      2: [
        14,
        1
      ],
      3: [
        16,
        1
      ],
      4: [
        18,
        1
      ],
      5: [
        20,
        1
      ]
    }
  },
  20020: {
    name: '睿见',
    skillName: '天才',
    desc: '当装备者施放终结技时，攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，持续<unbreak>#2[i]</unbreak>回合。',
    path: 'Mage',
    levels: {
      1: [
        0.24,
        2
      ],
      2: [
        0.3,
        2
      ],
      3: [
        0.36,
        2
      ],
      4: [
        0.42,
        2
      ],
      5: [
        0.48,
        2
      ]
    }
  },
  20021: {
    name: '焚影',
    skillName: '美化',
    desc: '装备者首次召唤忆灵时，恢复<unbreak>#1[i]</unbreak>点战技点，并恢复自身<color=#f29e38ff><unbreak>#2[i]</unbreak></color>点能量。',
    path: 'Memory',
    levels: {
      1: [
        1,
        12
      ],
      2: [
        1,
        14
      ],
      3: [
        1,
        16
      ],
      4: [
        1,
        18
      ],
      5: [
        1,
        20
      ]
    }
  },
  20022: {
    name: '溯忆',
    skillName: '入寐',
    desc: '忆灵的回合开始时，使装备者和忆灵分别获得1层【缅怀】，每层使造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，最多叠加<unbreak>#2[i]</unbreak>层。忆灵消失时移除装备者和忆灵的【缅怀】。',
    path: 'Memory',
    levels: {
      1: [
        0.08,
        4
      ],
      2: [
        0.09,
        4
      ],
      3: [
        0.1,
        4
      ],
      4: [
        0.11,
        4
      ],
      5: [
        0.12,
        4
      ]
    }
  },
  20023: {
    name: '嗤笑',
    skillName: '纵欢',
    desc: '阿哈时刻发动时，使装备者的欢愉度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，持续到阿哈时刻结束。',
    path: 'Elation',
    levels: {
      1: [
        0.16
      ],
      2: [
        0.2
      ],
      3: [
        0.24
      ],
      4: [
        0.28
      ],
      5: [
        0.32
      ]
    }
  },
  20024: {
    name: '残泪',
    skillName: '悼念',
    desc: '当拥有的笑点大于等于<unbreak>#1[i]</unbreak>时，装备者的暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Elation',
    levels: {
      1: [
        10,
        0.2
      ],
      2: [
        10,
        0.25
      ],
      3: [
        10,
        0.3
      ],
      4: [
        10,
        0.35
      ],
      5: [
        10,
        0.4
      ]
    }
  },
  21000: {
    name: '一场术后对话',
    skillName: '互相治愈',
    desc: '使装备者的能量恢复效率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，并在施放终结技时治疗量提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Priest',
    levels: {
      1: [
        0.08,
        0.12
      ],
      2: [
        0.1,
        0.15
      ],
      3: [
        0.12,
        0.18
      ],
      4: [
        0.14,
        0.21
      ],
      5: [
        0.16,
        0.24
      ]
    }
  },
  21001: {
    name: '晚安与睡颜',
    skillName: '劳碌者',
    desc: '敌方目标每承受1个负面效果，装备者对其造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，最多叠加<unbreak>#2[i]</unbreak>层。该效果对持续伤害也会生效。',
    path: 'Warlock',
    levels: {
      1: [
        0.12,
        3
      ],
      2: [
        0.15,
        3
      ],
      3: [
        0.18,
        3
      ],
      4: [
        0.21,
        3
      ],
      5: [
        0.24,
        3
      ]
    }
  },
  21002: {
    name: '余生的第一天',
    skillName: '此刻定格',
    desc: '使装备者的防御力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。进入战斗后，使我方全体的全属性抗性提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。同类技能无法重复生效。',
    path: 'Knight',
    levels: {
      1: [
        0.16,
        0.08
      ],
      2: [
        0.18,
        0.09
      ],
      3: [
        0.2,
        0.1
      ],
      4: [
        0.22,
        0.11
      ],
      5: [
        0.24,
        0.12
      ]
    }
  },
  21003: {
    name: '唯有沉默',
    skillName: '记录',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当场上的敌方目标数量小于等于2时，装备者的暴击率提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Rogue',
    levels: {
      1: [
        0.16,
        0.12
      ],
      2: [
        0.2,
        0.15
      ],
      3: [
        0.24,
        0.18
      ],
      4: [
        0.28,
        0.21
      ],
      5: [
        0.32,
        0.24
      ]
    }
  },
  21004: {
    name: '记忆中的模样',
    skillName: '老相片',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放攻击后，额外恢复<color=#f29e38ff><unbreak>#2[i]</unbreak></color>点能量，该效果单个回合内不可重复触发。',
    path: 'Shaman',
    levels: {
      1: [
        0.28,
        4
      ],
      2: [
        0.35,
        5
      ],
      3: [
        0.42,
        6
      ],
      4: [
        0.49,
        7
      ],
      5: [
        0.56,
        8
      ]
    }
  },
  21005: {
    name: '鼹鼠党欢迎你',
    skillName: '奇妙冒险',
    desc: '装备者施放普攻、战技或终结技攻击敌方目标后，分别获取一层【淘气值】。每层使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Warrior',
    levels: {
      1: [
        0.12
      ],
      2: [
        0.15
      ],
      3: [
        0.18
      ],
      4: [
        0.21
      ],
      5: [
        0.24
      ]
    }
  },
  21006: {
    name: '「我」的诞生',
    skillName: '画像少女',
    desc: '使装备者追加攻击造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。若该敌方目标当前生命值百分比小于等于<unbreak>#2[i]%</unbreak>，则追加攻击造成的伤害额外提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Mage',
    levels: {
      1: [
        0.24,
        0.5,
        0.24
      ],
      2: [
        0.3,
        0.5,
        0.3
      ],
      3: [
        0.36,
        0.5,
        0.36
      ],
      4: [
        0.42,
        0.5,
        0.42
      ],
      5: [
        0.48,
        0.5,
        0.48
      ]
    }
  },
  21007: {
    name: '同一种心情',
    skillName: '救治与维修',
    desc: '使装备者的治疗量提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，并在施放战技时为我方全体恢复<color=#f29e38ff><unbreak>#2[f1]</unbreak></color>点能量。',
    path: 'Priest',
    levels: {
      1: [
        0.1,
        2
      ],
      2: [
        0.125,
        2.5
      ],
      3: [
        0.15,
        3
      ],
      4: [
        0.175,
        3.5
      ],
      5: [
        0.2,
        4
      ]
    }
  },
  21008: {
    name: '猎物的视线',
    skillName: '自信',
    desc: '使装备者的效果命中提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，同时造成的持续伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Warlock',
    levels: {
      1: [
        0.2,
        0.24
      ],
      2: [
        0.25,
        0.3
      ],
      3: [
        0.3,
        0.36
      ],
      4: [
        0.35,
        0.42
      ],
      5: [
        0.4,
        0.48
      ]
    }
  },
  21009: {
    name: '朗道的选择',
    skillName: '时光如梭',
    desc: '使装备者受到攻击的概率提高，同时受到的伤害降低<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Knight',
    levels: {
      1: [
        2,
        0.16
      ],
      2: [
        2,
        0.18
      ],
      3: [
        2,
        0.2
      ],
      4: [
        2,
        0.22
      ],
      5: [
        2,
        0.24
      ]
    }
  },
  21010: {
    name: '论剑',
    skillName: '各自的答案',
    desc: '当装备者多次击中同一敌方目标时，每次造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，该效果最多叠加<unbreak>#2[i]</unbreak>层。若攻击目标发生变化，立即解除当前的增益效果。',
    path: 'Rogue',
    levels: {
      1: [
        0.08,
        5
      ],
      2: [
        0.1,
        5
      ],
      3: [
        0.12,
        5
      ],
      4: [
        0.14,
        5
      ],
      5: [
        0.16,
        5
      ]
    }
  },
  21011: {
    name: '与行星相会',
    skillName: '启程',
    desc: '进入战斗后，当我方目标造成与装备者相同属性的伤害时，造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Shaman',
    levels: {
      1: [
        0.12
      ],
      2: [
        0.15
      ],
      3: [
        0.18
      ],
      4: [
        0.21
      ],
      5: [
        0.24
      ]
    }
  },
  21012: {
    name: '秘密誓心',
    skillName: '竭力而为',
    desc: '使装备者造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，同时对当前生命值百分比大于等于装备者自身当前生命值百分比的敌方目标造成的伤害额外提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Warrior',
    levels: {
      1: [
        0.2,
        0.2
      ],
      2: [
        0.25,
        0.25
      ],
      3: [
        0.3,
        0.3
      ],
      4: [
        0.35,
        0.35
      ],
      5: [
        0.4,
        0.4
      ]
    }
  },
  21013: {
    name: '别让世界静下来',
    skillName: '声音的力量',
    desc: '使装备者进入战斗时立即恢复<color=#f29e38ff><unbreak>#2[i]</unbreak></color>点能量，同时使其终结技造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Mage',
    levels: {
      1: [
        0.32,
        20
      ],
      2: [
        0.4,
        23
      ],
      3: [
        0.48,
        26
      ],
      4: [
        0.56,
        29
      ],
      5: [
        0.64,
        32
      ]
    }
  },
  21014: {
    name: '此时恰好',
    skillName: '折射的视线',
    desc: '使装备者的效果抵抗提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，并使装备者的治疗量提高，提高数值等同于效果抵抗的<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，最多使治疗量提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Priest',
    levels: {
      1: [
        0.16,
        0.33,
        0.15
      ],
      2: [
        0.2,
        0.36,
        0.18
      ],
      3: [
        0.24,
        0.39,
        0.21
      ],
      4: [
        0.28,
        0.42,
        0.24
      ],
      5: [
        0.32,
        0.45,
        0.27
      ]
    }
  },
  21015: {
    name: '决心如汗珠般闪耀',
    skillName: '回眸',
    desc: '当装备者击中敌方目标时，如果该目标不处于【攻陷】状态，则有<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>的基础概率使其陷入【攻陷】状态。【攻陷】状态下的敌方目标防御力降低<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Warlock',
    levels: {
      1: [
        0.6,
        0.12,
        1
      ],
      2: [
        0.7,
        0.13,
        1
      ],
      3: [
        0.8,
        0.14,
        1
      ],
      4: [
        0.9,
        0.15,
        1
      ],
      5: [
        1,
        0.16,
        1
      ]
    }
  },
  21016: {
    name: '宇宙市场趋势',
    skillName: '新一轮洗牌',
    desc: '使装备者的防御力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者受到攻击后，有<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的基础概率使敌方目标陷入灼烧状态，每回合造成等同于装备者<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>防御力的持续伤害，持续<unbreak>#4[i]</unbreak>回合。',
    path: 'Knight',
    levels: {
      1: [
        0.16,
        1,
        0.4,
        2
      ],
      2: [
        0.2,
        1.05,
        0.5,
        2
      ],
      3: [
        0.24,
        1.1,
        0.6,
        2
      ],
      4: [
        0.28,
        1.15,
        0.7,
        2
      ],
      5: [
        0.32,
        1.2,
        0.8,
        2
      ]
    }
  },
  21017: {
    name: '点个关注吧！',
    skillName: '不赞不许走！',
    desc: '使装备者普攻和战技造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，当装备者的当前能量值等于其能量上限时，该效果额外提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Rogue',
    levels: {
      1: [
        0.24,
        0.24
      ],
      2: [
        0.3,
        0.3
      ],
      3: [
        0.36,
        0.36
      ],
      4: [
        0.42,
        0.42
      ],
      5: [
        0.48,
        0.48
      ]
    }
  },
  21018: {
    name: '舞！舞！舞！',
    skillName: '停不下来啦！',
    desc: '当装备者施放终结技后，我方全体行动提前<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。',
    path: 'Shaman',
    levels: {
      1: [
        0.16
      ],
      2: [
        0.18
      ],
      3: [
        0.2
      ],
      4: [
        0.22
      ],
      5: [
        0.24
      ]
    }
  },
  21019: {
    name: '在蓝天下',
    skillName: '暖阳麦浪',
    desc: '使装备者攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，当装备者消灭敌方目标后，暴击率提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Warrior',
    levels: {
      1: [
        0.16,
        0.12,
        3
      ],
      2: [
        0.2,
        0.15,
        3
      ],
      3: [
        0.24,
        0.18,
        3
      ],
      4: [
        0.28,
        0.21,
        3
      ],
      5: [
        0.32,
        0.24,
        3
      ]
    }
  },
  21020: {
    name: '天才们的休憩',
    skillName: '各得其所',
    desc: '使装备者攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，当装备者消灭敌方目标后，暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Mage',
    levels: {
      1: [
        0.16,
        0.24,
        3
      ],
      2: [
        0.2,
        0.3,
        3
      ],
      3: [
        0.24,
        0.36,
        3
      ],
      4: [
        0.28,
        0.42,
        3
      ],
      5: [
        0.32,
        0.48,
        3
      ]
    }
  },
  21021: {
    name: '等价交换',
    skillName: '酣适',
    desc: '当装备者的回合开始时，随机为1个当前能量百分比小于<unbreak>#1[i]%</unbreak>的我方其他目标恢复<color=#f29e38ff><unbreak>#2[i]</unbreak></color>点能量。',
    path: 'Priest',
    levels: {
      1: [
        0.5,
        8
      ],
      2: [
        0.5,
        10
      ],
      3: [
        0.5,
        12
      ],
      4: [
        0.5,
        14
      ],
      5: [
        0.5,
        16
      ]
    }
  },
  21022: {
    name: '延长记号',
    skillName: '休止符',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，对处于触电或风化状态的敌方目标造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，该效果对持续伤害也会生效。',
    path: 'Warlock',
    levels: {
      1: [
        0.16,
        0.16
      ],
      2: [
        0.2,
        0.2
      ],
      3: [
        0.24,
        0.24
      ],
      4: [
        0.28,
        0.28
      ],
      5: [
        0.32,
        0.32
      ]
    }
  },
  21023: {
    name: '我们是地火',
    skillName: '泪中人',
    desc: '战斗开始时，使我方全体受到的伤害降低<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。同时立即为我方全体回复等同于各自已损失生命值<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>的生命值。',
    path: 'Knight',
    levels: {
      1: [
        0.3,
        0.08,
        5
      ],
      2: [
        0.35,
        0.1,
        5
      ],
      3: [
        0.4,
        0.12,
        5
      ],
      4: [
        0.45,
        0.14,
        5
      ],
      5: [
        0.5,
        0.16,
        5
      ]
    }
  },
  21024: {
    name: '春水初生',
    skillName: '驱散余寒',
    desc: '进入战斗后，使装备者速度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。当装备者受到伤害后该效果失效，下个回合结束时该效果恢复。',
    path: 'Rogue',
    levels: {
      1: [
        0.08,
        0.12
      ],
      2: [
        0.09,
        0.15
      ],
      3: [
        0.1,
        0.18
      ],
      4: [
        0.11,
        0.21
      ],
      5: [
        0.12,
        0.24
      ]
    }
  },
  21025: {
    name: '过往未来',
    skillName: '旧日纸鸢',
    desc: '当装备者施放战技后，使下一个行动的我方其他目标造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，持续<unbreak>#2[i]</unbreak>回合。',
    path: 'Shaman',
    levels: {
      1: [
        0.16,
        1
      ],
      2: [
        0.2,
        1
      ],
      3: [
        0.24,
        1
      ],
      4: [
        0.28,
        1
      ],
      5: [
        0.32,
        1
      ]
    }
  },
  21026: {
    name: '汪！散步时间！',
    skillName: '快溜',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，对处于灼烧或裂伤状态的敌方目标造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，该效果对持续伤害也会生效。',
    path: 'Warrior',
    levels: {
      1: [
        0.1,
        0.16
      ],
      2: [
        0.125,
        0.2
      ],
      3: [
        0.15,
        0.24
      ],
      4: [
        0.175,
        0.28
      ],
      5: [
        0.2,
        0.32
      ]
    }
  },
  21027: {
    name: '早餐的仪式感',
    skillName: '各就其位',
    desc: '使装备者造成伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。每消灭1个敌方目标，装备者的攻击力提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，该效果最多叠加<unbreak>#3[i]</unbreak>层。',
    path: 'Mage',
    levels: {
      1: [
        0.12,
        0.04,
        3
      ],
      2: [
        0.15,
        0.05,
        3
      ],
      3: [
        0.18,
        0.06,
        3
      ],
      4: [
        0.21,
        0.07,
        3
      ],
      5: [
        0.24,
        0.08,
        3
      ]
    }
  },
  21028: {
    name: '暖夜不会漫长',
    skillName: '小小灯火',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。施放普攻或战技后，为我方全体回复等同于各自生命上限<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>的生命值。',
    path: 'Priest',
    levels: {
      1: [
        0.16,
        0.02
      ],
      2: [
        0.2,
        0.025
      ],
      3: [
        0.24,
        0.03
      ],
      4: [
        0.28,
        0.035
      ],
      5: [
        0.32,
        0.04
      ]
    }
  },
  21029: {
    name: '后会有期',
    skillName: '交手如交谈',
    desc: '装备者施放普攻或战技后，对随机1个受到攻击的敌方目标造成等同于自身<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>攻击力的附加伤害。',
    path: 'Warlock',
    levels: {
      1: [
        0.48
      ],
      2: [
        0.6
      ],
      3: [
        0.72
      ],
      4: [
        0.84
      ],
      5: [
        0.96
      ]
    }
  },
  21030: {
    name: '这就是我啦！',
    skillName: '新篇章',
    desc: '使装备者防御力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。使装备者施放终结技时造成的伤害值提高，提高数值等同于装备者防御力的<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，该效果每次施放终结技时对每个敌方目标仅生效1次。',
    path: 'Knight',
    levels: {
      1: [
        0.16,
        0.6
      ],
      2: [
        0.2,
        0.75
      ],
      3: [
        0.24,
        0.9
      ],
      4: [
        0.28,
        1.05
      ],
      5: [
        0.32,
        1.2
      ]
    }
  },
  21031: {
    name: '重返幽冥',
    skillName: '汹涌',
    desc: '使装备者暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。暴击后有<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的固定概率解除被攻击敌方目标所持有的1个增益效果，该效果每次攻击只可触发1次。',
    path: 'Rogue',
    levels: {
      1: [
        0.12,
        0.16
      ],
      2: [
        0.15,
        0.2
      ],
      3: [
        0.18,
        0.24
      ],
      4: [
        0.21,
        0.28
      ],
      5: [
        0.24,
        0.32
      ]
    }
  },
  21032: {
    name: '镂月裁云之意',
    skillName: '秘密',
    desc: '在战斗开始时以及当装备者回合开始时，随机生效1个效果。该效果生效时，替换上次的效果且本次不会与上次重复。效果包含：使我方全体攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>；使我方全体暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>；使我方全体能量恢复效率提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。同类效果无法叠加，在装备者陷入无法战斗状态时解除。',
    path: 'Shaman',
    levels: {
      1: [
        0.1,
        0.12,
        0.06
      ],
      2: [
        0.125,
        0.15,
        0.075
      ],
      3: [
        0.15,
        0.18,
        0.09
      ],
      4: [
        0.175,
        0.21,
        0.105
      ],
      5: [
        0.2,
        0.24,
        0.12
      ]
    }
  },
  21033: {
    name: '无处可逃',
    skillName: '绝境',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者消灭敌方目标时，回复等同于自身<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>攻击力的生命值。',
    path: 'Warrior',
    levels: {
      1: [
        0.24,
        0.12
      ],
      2: [
        0.3,
        0.15
      ],
      3: [
        0.36,
        0.18
      ],
      4: [
        0.42,
        0.21
      ],
      5: [
        0.48,
        0.24
      ]
    }
  },
  21034: {
    name: '今日亦是和平的一日',
    skillName: '风雨将至',
    desc: '进入战斗后，根据装备者的能量上限，提高装备者造成的伤害：每点能量提高<color=#f29e38ff><unbreak>#1[f2]%</unbreak></color>，最多计入<unbreak>#2[i]</unbreak>点。',
    path: 'Mage',
    levels: {
      1: [
        0.002,
        160
      ],
      2: [
        0.0025,
        160
      ],
      3: [
        0.003,
        160
      ],
      4: [
        0.0035,
        160
      ],
      5: [
        0.004,
        160
      ]
    }
  },
  21035: {
    name: '何物为真',
    skillName: '假设',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。施放普攻后，装备者回复等同于<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>生命上限+<unbreak>#3[i]</unbreak>点的生命值。',
    path: 'Priest',
    levels: {
      1: [
        0.24,
        0.02,
        800
      ],
      2: [
        0.3,
        0.025,
        800
      ],
      3: [
        0.36,
        0.03,
        800
      ],
      4: [
        0.42,
        0.035,
        800
      ],
      5: [
        0.48,
        0.04,
        800
      ]
    }
  },
  21036: {
    name: '美梦小镇大冒险',
    skillName: '团结',
    desc: '装备者施放普攻、战技、终结技中某一类型的技能后，为我方全体附加【童心】，【童心】可以使我方目标对应类型的技能所造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。【童心】仅对装备者最新使用的技能类型生效，且不可叠加。',
    path: 'Shaman',
    levels: {
      1: [
        0.12
      ],
      2: [
        0.14
      ],
      3: [
        0.16
      ],
      4: [
        0.18
      ],
      5: [
        0.2
      ]
    }
  },
  21037: {
    name: '最后的赢家',
    skillName: '下注',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者对敌方目标造成暴击后获得一层【好运】，最多叠加<unbreak>#3[i]</unbreak>层。每层【好运】使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，【好运】在装备者的回合结束时移除。',
    path: 'Rogue',
    levels: {
      1: [
        0.12,
        0.08,
        4
      ],
      2: [
        0.14,
        0.09,
        4
      ],
      3: [
        0.16,
        0.1,
        4
      ],
      4: [
        0.18,
        0.11,
        4
      ],
      5: [
        0.2,
        0.12,
        4
      ]
    }
  },
  21038: {
    name: '在火的远处',
    skillName: '爆燃',
    desc: '当装备者在单次受到攻击中累计损失的生命值超过最大生命值的<unbreak>#1[i]%</unbreak>，或单次消耗自身生命值超过最大生命值的<unbreak>#1[i]%</unbreak>，则立即回复等同于装备者生命上限<unbreak>#3[i]%</unbreak>的生命值，同时使装备者造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合。该效果每<unbreak>#5[i]</unbreak>回合只能触发1次。',
    path: 'Warrior',
    levels: {
      1: [
        0.25,
        0.25,
        0.15,
        2,
        3
      ],
      2: [
        0.25,
        0.3125,
        0.15,
        2,
        3
      ],
      3: [
        0.25,
        0.375,
        0.15,
        2,
        3
      ],
      4: [
        0.25,
        0.4375,
        0.15,
        2,
        3
      ],
      5: [
        0.25,
        0.5,
        0.15,
        2,
        3
      ]
    }
  },
  21039: {
    name: '织造命运之线',
    skillName: '洞见',
    desc: '使装备者的效果抵抗提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者每有<unbreak>#2[i]</unbreak>点防御力，使装备者造成的伤害提高<color=#f29e38ff><unbreak>#3[f1]%</unbreak></color>，最多使造成的伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>。',
    path: 'Knight',
    levels: {
      1: [
        0.12,
        100,
        0.008,
        0.32
      ],
      2: [
        0.14,
        100,
        0.009,
        0.36
      ],
      3: [
        0.16,
        100,
        0.01,
        0.4
      ],
      4: [
        0.18,
        100,
        0.011,
        0.44
      ],
      5: [
        0.2,
        100,
        0.012,
        0.48
      ]
    }
  },
  21040: {
    name: '银河沦陷日',
    skillName: '攻略',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放攻击后，若有不少于2个被攻击的敌方目标具有对应属性弱点，装备者的暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Mage',
    levels: {
      1: [
        0.16,
        0.2,
        2
      ],
      2: [
        0.18,
        0.25,
        2
      ],
      3: [
        0.2,
        0.3,
        2
      ],
      4: [
        0.22,
        0.35,
        2
      ],
      5: [
        0.24,
        0.4,
        2
      ]
    }
  },
  21041: {
    name: '好戏开演',
    skillName: '自娱自乐',
    desc: '装备者对敌方目标施加负面状态后，获得一层【戏法】，每层【戏法】使装备者造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，最多叠加<unbreak>#2[i]</unbreak>层，持续<unbreak>#3[i]</unbreak>回合。当装备者的效果命中大于等于<unbreak>#4[i]%</unbreak>时，攻击力提高<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>。',
    path: 'Warlock',
    levels: {
      1: [
        0.06,
        3,
        1,
        0.8,
        0.2
      ],
      2: [
        0.07,
        3,
        1,
        0.8,
        0.24
      ],
      3: [
        0.08,
        3,
        1,
        0.8,
        0.28
      ],
      4: [
        0.09,
        3,
        1,
        0.8,
        0.32
      ],
      5: [
        0.1,
        3,
        1,
        0.8,
        0.36
      ]
    }
  },
  21042: {
    name: '铭记于心的约定',
    skillName: '传承',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者施放终结技时，暴击率提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Warrior',
    levels: {
      1: [
        0.28,
        0.15,
        2
      ],
      2: [
        0.35,
        0.1875,
        2
      ],
      3: [
        0.42,
        0.225,
        2
      ],
      4: [
        0.49,
        0.2625,
        2
      ],
      5: [
        0.56,
        0.3,
        2
      ]
    }
  },
  21043: {
    name: '两个人的演唱会',
    skillName: '鼓舞',
    desc: '使装备者的防御力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。场上每有一名持有护盾的角色，装备者造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Knight',
    levels: {
      1: [
        0.16,
        0.04
      ],
      2: [
        0.2,
        0.05
      ],
      3: [
        0.24,
        0.06
      ],
      4: [
        0.28,
        0.07
      ],
      5: [
        0.32,
        0.08
      ]
    }
  },
  21044: {
    name: '无边曼舞',
    skillName: '试探',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者对处于防御降低或减速状态下的敌人造成的暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Warlock',
    levels: {
      1: [
        0.08,
        0.24
      ],
      2: [
        0.1,
        0.3
      ],
      3: [
        0.12,
        0.36
      ],
      4: [
        0.14,
        0.42
      ],
      5: [
        0.16,
        0.48
      ]
    }
  },
  21045: {
    name: '谐乐静默之后',
    skillName: '沉寂',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放终结技后，速度提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Mage',
    levels: {
      1: [
        0.28,
        0.08,
        2
      ],
      2: [
        0.35,
        0.1,
        2
      ],
      3: [
        0.42,
        0.12,
        2
      ],
      4: [
        0.49,
        0.14,
        2
      ],
      5: [
        0.56,
        0.16,
        2
      ]
    }
  },
  21046: {
    name: '芳华待灼',
    skillName: '莫失莫忘',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。进入战斗时，若有两名及以上我方角色拥有任意相同命途，使这些角色的暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。同类技能无法重复生效。',
    path: 'Shaman',
    levels: {
      1: [
        0.16,
        0.16
      ],
      2: [
        0.2,
        0.2
      ],
      3: [
        0.24,
        0.24
      ],
      4: [
        0.28,
        0.28
      ],
      5: [
        0.32,
        0.32
      ]
    }
  },
  21047: {
    name: '黑夜如影随行',
    skillName: '隐匿',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。进入战斗时或造成击破伤害后，速度提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合，该效果每回合只可触发1次。',
    path: 'Rogue',
    levels: {
      1: [
        0.28,
        0.08,
        2
      ],
      2: [
        0.35,
        0.09,
        2
      ],
      3: [
        0.42,
        0.1,
        2
      ],
      4: [
        0.49,
        0.11,
        2
      ],
      5: [
        0.56,
        0.12,
        2
      ]
    }
  },
  21048: {
    name: '梦的蒙太奇',
    skillName: '学院式剪接',
    desc: '使装备者的速度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，攻击处于弱点击破状态下的敌方目标后，恢复<color=#f29e38ff><unbreak>#2[f1]</unbreak></color>点能量，该效果每回合最多触发<unbreak>#3[i]</unbreak>次。',
    path: 'Priest',
    levels: {
      1: [
        0.08,
        3,
        2
      ],
      2: [
        0.09,
        3.5,
        2
      ],
      3: [
        0.1,
        4,
        2
      ],
      4: [
        0.11,
        4.5,
        2
      ],
      5: [
        0.12,
        5,
        2
      ]
    }
  },
  21050: {
    name: '胜利只在朝夕间',
    skillName: '最后一击',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，当装备者的忆灵对我方目标施放技能时，使我方全体目标造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Memory',
    levels: {
      1: [
        0.12,
        0.08,
        3
      ],
      2: [
        0.15,
        0.1,
        3
      ],
      3: [
        0.18,
        0.12,
        3
      ],
      4: [
        0.21,
        0.14,
        3
      ],
      5: [
        0.24,
        0.16,
        3
      ]
    }
  },
  21051: {
    name: '天才们的问候',
    skillName: '恭喜',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，装备者施放终结技后，使装备者与忆灵造成的普攻伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Memory',
    levels: {
      1: [
        0.16,
        0.2,
        3
      ],
      2: [
        0.2,
        0.25,
        3
      ],
      3: [
        0.24,
        0.3,
        3
      ],
      4: [
        0.28,
        0.35,
        3
      ],
      5: [
        0.32,
        0.4,
        3
      ]
    }
  },
  21052: {
    name: '多流汗，少流泪',
    skillName: '来练！',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，装备者的忆灵在场上时，装备者与忆灵造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Memory',
    levels: {
      1: [
        0.12,
        0.24
      ],
      2: [
        0.14,
        0.27
      ],
      3: [
        0.16,
        0.3
      ],
      4: [
        0.18,
        0.33
      ],
      5: [
        0.2,
        0.36
      ]
    }
  },
  21053: {
    name: '愿旅途永远坦然',
    skillName: '甜梦',
    desc: '使装备者提供的护盾量提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，我方目标持有护盾时，造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Knight',
    levels: {
      1: [
        0.12,
        0.12
      ],
      2: [
        0.15,
        0.14
      ],
      3: [
        0.18,
        0.16
      ],
      4: [
        0.21,
        0.18
      ],
      5: [
        0.24,
        0.2
      ]
    }
  },
  21054: {
    name: '故事的下一页',
    skillName: '书写',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者的忆灵攻击后，使装备者与忆灵的治疗量提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Memory',
    levels: {
      1: [
        0.16,
        0.12,
        1
      ],
      2: [
        0.2,
        0.15,
        1
      ],
      3: [
        0.24,
        0.18,
        1
      ],
      4: [
        0.28,
        0.21,
        1
      ],
      5: [
        0.32,
        0.24,
        1
      ]
    }
  },
  21055: {
    name: '直到明天的明天',
    skillName: '离别',
    desc: '使装备者的治疗量提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。我方目标当前生命值百分比大于等于<unbreak>#2[i]%</unbreak>时，造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Priest',
    levels: {
      1: [
        0.12,
        0.5,
        0.12
      ],
      2: [
        0.15,
        0.5,
        0.14
      ],
      3: [
        0.18,
        0.5,
        0.16
      ],
      4: [
        0.21,
        0.5,
        0.18
      ],
      5: [
        0.24,
        0.5,
        0.2
      ]
    }
  },
  21056: {
    name: '追逐风的时候',
    skillName: '慌张',
    desc: '进入战斗后，使我方全体造成的击破伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。同类技能无法重复生效。',
    path: 'Shaman',
    levels: {
      1: [
        0.16
      ],
      2: [
        0.18
      ],
      3: [
        0.2
      ],
      4: [
        0.22
      ],
      5: [
        0.24
      ]
    }
  },
  21057: {
    name: '花儿不会忘记',
    skillName: '相依为命',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者忆灵造成的暴击伤害额外提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Memory',
    levels: {
      1: [
        0.24,
        0.24
      ],
      2: [
        0.28,
        0.3
      ],
      3: [
        0.32,
        0.36
      ],
      4: [
        0.36,
        0.42
      ],
      5: [
        0.4,
        0.48
      ]
    }
  },
  21058: {
    name: '一行往日的血',
    skillName: '厮杀',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者造成的战技和终结技伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Warrior',
    levels: {
      1: [
        0.12,
        0.24
      ],
      2: [
        0.14,
        0.28
      ],
      3: [
        0.16,
        0.32
      ],
      4: [
        0.18,
        0.36
      ],
      5: [
        0.2,
        0.4
      ]
    }
  },
  21060: {
    name: '氤氲麦香的梦',
    skillName: '憧憬',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者造成的终结技和追加攻击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Mage',
    levels: {
      1: [
        0.12,
        0.24
      ],
      2: [
        0.14,
        0.28
      ],
      3: [
        0.16,
        0.32
      ],
      4: [
        0.18,
        0.36
      ],
      5: [
        0.2,
        0.4
      ]
    }
  },
  21061: {
    name: '假日浴场大冒险',
    skillName: '冷静一下',
    desc: '使装备者造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者攻击后，有<unbreak>#2[i]%</unbreak>基础概率使受到攻击的目标陷入易伤状态，受到的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合。同类效果无法叠加。',
    path: 'Warlock',
    levels: {
      1: [
        0.16,
        1,
        0.1,
        2
      ],
      2: [
        0.2,
        1,
        0.115,
        2
      ],
      3: [
        0.24,
        1,
        0.13,
        2
      ],
      4: [
        0.28,
        1,
        0.145,
        2
      ],
      5: [
        0.32,
        1,
        0.16,
        2
      ]
    }
  },
  21062: {
    name: '于那终点再见',
    skillName: '执着',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者造成的战技和追加攻击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Rogue',
    levels: {
      1: [
        0.24,
        0.24
      ],
      2: [
        0.28,
        0.28
      ],
      3: [
        0.32,
        0.32
      ],
      4: [
        0.36,
        0.36
      ],
      5: [
        0.4,
        0.4
      ]
    }
  },
  21064: {
    name: '菇菇嘎嘎历险记',
    skillName: '乱斗',
    desc: '使装备者的欢愉度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放欢愉技时，使敌方全体受到的欢愉伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Elation',
    levels: {
      1: [
        0.12,
        0.06,
        2
      ],
      2: [
        0.14,
        0.07,
        2
      ],
      3: [
        0.16,
        0.08,
        2
      ],
      4: [
        0.18,
        0.09,
        2
      ],
      5: [
        0.2,
        0.1,
        2
      ]
    }
  },
  21065: {
    name: '今日好手气',
    skillName: '抉择',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放欢愉技时，欢愉度提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，该效果最多叠加<unbreak>#3[i]</unbreak>次。',
    path: 'Elation',
    levels: {
      1: [
        0.12,
        0.12,
        2
      ],
      2: [
        0.14,
        0.14,
        2
      ],
      3: [
        0.16,
        0.16,
        2
      ],
      4: [
        0.18,
        0.18,
        2
      ],
      5: [
        0.2,
        0.2,
        2
      ]
    }
  },
  21066: {
    name: '放个短假',
    skillName: '秘语',
    desc: '使装备者的欢愉度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放欢愉技期间无视目标<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的防御力。',
    path: 'Elation',
    levels: {
      1: [
        0.2,
        0.08
      ],
      2: [
        0.25,
        0.1
      ],
      3: [
        0.3,
        0.12
      ],
      4: [
        0.35,
        0.14
      ],
      5: [
        0.4,
        0.16
      ]
    }
  },
  22000: {
    name: '新手任务开始前',
    skillName: '眼疾手快',
    desc: '使装备者的效果命中提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者攻击防御力被降低的敌方目标后，恢复<color=#f29e38ff><unbreak>#2[i]</unbreak></color>点能量。',
    path: 'Warlock',
    levels: {
      1: [
        0.2,
        4
      ],
      2: [
        0.25,
        5
      ],
      3: [
        0.3,
        6
      ],
      4: [
        0.35,
        7
      ],
      5: [
        0.4,
        8
      ]
    }
  },
  22001: {
    name: '嘿，我在这儿',
    skillName: '不怕不怕啦',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者施放战技时，治疗量提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Priest',
    levels: {
      1: [
        0.08,
        0.16,
        2
      ],
      2: [
        0.09,
        0.19,
        2
      ],
      3: [
        0.1,
        0.22,
        2
      ],
      4: [
        0.11,
        0.25,
        2
      ],
      5: [
        0.12,
        0.28,
        2
      ]
    }
  },
  22002: {
    name: '为了明日的旅途',
    skillName: '联结',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放终结技后，造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Shaman',
    levels: {
      1: [
        0.16,
        0.18,
        1
      ],
      2: [
        0.2,
        0.21,
        1
      ],
      3: [
        0.24,
        0.24,
        1
      ],
      4: [
        0.28,
        0.27,
        1
      ],
      5: [
        0.32,
        0.3,
        1
      ]
    }
  },
  22003: {
    name: '忍事录•音律狩猎',
    skillName: '开演！',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，损失或回复自身生命值后，暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合，该效果每回合只可触发1次。',
    path: 'Warrior',
    levels: {
      1: [
        0.12,
        0.18,
        2
      ],
      2: [
        0.15,
        0.225,
        2
      ],
      3: [
        0.18,
        0.27,
        2
      ],
      4: [
        0.21,
        0.315,
        2
      ],
      5: [
        0.24,
        0.36,
        2
      ]
    }
  },
  22004: {
    name: '宇宙大生意',
    skillName: '互惠',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。敌方目标每拥有1个不同属性的弱点，装备者对其造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，最多计入7个。',
    path: 'Mage',
    levels: {
      1: [
        0.08,
        0.04
      ],
      2: [
        0.1,
        0.05
      ],
      3: [
        0.12,
        0.06
      ],
      4: [
        0.14,
        0.07
      ],
      5: [
        0.16,
        0.08
      ]
    }
  },
  22005: {
    name: '永远的迷境饭',
    skillName: '真香',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放战技后，攻击力提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，该效果最多叠加<unbreak>#3[i]</unbreak>层。',
    path: 'Shaman',
    levels: {
      1: [
        0.16,
        0.08,
        3
      ],
      2: [
        0.2,
        0.1,
        3
      ],
      3: [
        0.24,
        0.12,
        3
      ],
      4: [
        0.28,
        0.14,
        3
      ],
      5: [
        0.32,
        0.16,
        3
      ]
    }
  },
  22006: {
    name: '飞向粉色的明天',
    skillName: '凝望',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。开拓者•记忆装备时，使我方全体目标造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，强化普攻【明天，一同写下！】造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Memory',
    levels: {
      1: [
        0.12,
        0.08,
        0.6
      ],
      2: [
        0.15,
        0.1,
        0.7
      ],
      3: [
        0.18,
        0.12,
        0.8
      ],
      4: [
        0.21,
        0.14,
        0.9
      ],
      5: [
        0.24,
        0.16,
        1
      ]
    }
  },
  22007: {
    name: '未来，有我们一起',
    skillName: '同行',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放终结技后，使我方全体欢愉度提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Elation',
    levels: {
      1: [
        0.12,
        0.08,
        1
      ],
      2: [
        0.15,
        0.09,
        1
      ],
      3: [
        0.18,
        0.1,
        1
      ],
      4: [
        0.21,
        0.11,
        1
      ],
      5: [
        0.24,
        0.12,
        1
      ]
    }
  },
  22008: {
    name: '向着地平线的终点',
    skillName: '超越',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放追加攻击后，使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合，该效果最多叠加<unbreak>#4[i]</unbreak>层。',
    path: 'Rogue',
    levels: {
      1: [
        0.12,
        0.03,
        2,
        10
      ],
      2: [
        0.15,
        0.035,
        2,
        10
      ],
      3: [
        0.18,
        0.04,
        2,
        10
      ],
      4: [
        0.21,
        0.045,
        2,
        10
      ],
      5: [
        0.24,
        0.05,
        2,
        10
      ]
    }
  },
  22009: {
    name: '在世界尽头相会吧！',
    skillName: '同谋',
    desc: '队伍中每有1名「欢愉」命途的角色，使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，星神★阿哈在场时，装备者的暴击伤害额外提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。',
    path: 'Elation',
    levels: {
      1: [
        0.06,
        0.12
      ],
      2: [
        0.07,
        0.14
      ],
      3: [
        0.08,
        0.16
      ],
      4: [
        0.09,
        0.18
      ],
      5: [
        0.1,
        0.2
      ]
    }
  },
  23000: {
    name: '银河铁道之夜',
    skillName: '流星群',
    desc: '场上每有1个敌方目标，使装备者的攻击力提高<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>，该效果最多叠加5层。当有敌方目标的弱点被击破时，装备者造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，持续1回合。',
    path: 'Mage',
    levels: {
      1: [
        0.3,
        0.09
      ],
      2: [
        0.35,
        0.105
      ],
      3: [
        0.4,
        0.12
      ],
      4: [
        0.45,
        0.135
      ],
      5: [
        0.5,
        0.15
      ]
    }
  },
  23001: {
    name: '于夜色中',
    skillName: '花与蝶',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者在战斗中速度大于<unbreak>100</unbreak>时，每超过<unbreak>#2[i]</unbreak>点，普攻和战技造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，同时终结技的暴击伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，该效果可叠加<unbreak>#5[i]</unbreak>层。',
    path: 'Rogue',
    levels: {
      1: [
        0.18,
        10,
        0.06,
        0.12,
        6
      ],
      2: [
        0.21,
        10,
        0.07,
        0.14,
        6
      ],
      3: [
        0.24,
        10,
        0.08,
        0.16,
        6
      ],
      4: [
        0.27,
        10,
        0.09,
        0.18,
        6
      ],
      5: [
        0.3,
        10,
        0.1,
        0.2,
        6
      ]
    }
  },
  23002: {
    name: '无可取代的东西',
    skillName: '家人',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者消灭敌方目标或受到攻击后，立即回复等同于装备者攻击力<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的生命值，同时造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续到自身下个回合结束。该效果不可叠加，每回合只可触发1次。',
    path: 'Warrior',
    levels: {
      1: [
        0.24,
        0.08,
        0.24
      ],
      2: [
        0.28,
        0.09,
        0.28
      ],
      3: [
        0.32,
        0.1,
        0.32
      ],
      4: [
        0.36,
        0.11,
        0.36
      ],
      5: [
        0.4,
        0.12,
        0.4
      ]
    }
  },
  23003: {
    name: '但战斗还未结束',
    skillName: '继承人',
    desc: '使装备者的能量恢复效率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，并在对我方目标施放终结技时恢复1个战技点。该效果每施放2次终结技可触发1次。当装备者施放战技后，使下一个行动的我方其他目标造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Shaman',
    levels: {
      1: [
        0.1,
        0.3,
        1
      ],
      2: [
        0.12,
        0.35,
        1
      ],
      3: [
        0.14,
        0.4,
        1
      ],
      4: [
        0.16,
        0.45,
        1
      ],
      5: [
        0.18,
        0.5,
        1
      ]
    }
  },
  23004: {
    name: '以世界之名',
    skillName: '传承者',
    desc: '使装备者对陷入负面效果的敌方目标造成的伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者施放战技时，装备者此次攻击的效果命中提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，攻击力提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Warlock',
    levels: {
      1: [
        0.24,
        0.18,
        0.24
      ],
      2: [
        0.28,
        0.21,
        0.28
      ],
      3: [
        0.32,
        0.24,
        0.32
      ],
      4: [
        0.36,
        0.27,
        0.36
      ],
      5: [
        0.4,
        0.3,
        0.4
      ]
    }
  },
  23005: {
    name: '制胜的瞬间',
    skillName: '决断',
    desc: '使装备者的防御力提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，效果命中提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，同时使自身受到攻击的概率提高。当装备者受到攻击后，防御力额外提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续到自身回合结束。',
    path: 'Knight',
    levels: {
      1: [
        2,
        0.24,
        0.24,
        0.24
      ],
      2: [
        2,
        0.28,
        0.28,
        0.28
      ],
      3: [
        2,
        0.32,
        0.32,
        0.32
      ],
      4: [
        2,
        0.36,
        0.36,
        0.36
      ],
      5: [
        2,
        0.4,
        0.4,
        0.4
      ]
    }
  },
  23006: {
    name: '只需等待',
    skillName: '蜘蛛的网',
    desc: '使装备者造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。装备者每次施放攻击后，速度提高<color=#f29e38ff><unbreak>#3[f1]%</unbreak></color>，最多叠加<unbreak>#4[i]</unbreak>层。\\n当装备者击中敌方目标时，如果该目标不处于【游丝】状态，则有<unbreak>100%</unbreak>的基础概率使其陷入【游丝】状态。当敌方目标处于【游丝】状态时，也会被视为陷入了触电状态。【游丝】状态下，敌方目标每回合开始时受到等同于装备者<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>攻击力的雷属性持续伤害，持续<unbreak>#5[i]</unbreak>回合。',
    path: 'Warlock',
    levels: {
      1: [
        0.6,
        0.24,
        0.048,
        3,
        1
      ],
      2: [
        0.7,
        0.28,
        0.056,
        3,
        1
      ],
      3: [
        0.8,
        0.32,
        0.064,
        3,
        1
      ],
      4: [
        0.9,
        0.36,
        0.072,
        3,
        1
      ],
      5: [
        1,
        0.4,
        0.08,
        3,
        1
      ]
    }
  },
  23007: {
    name: '雨一直下',
    skillName: '幻影现实',
    desc: '使装备者的效果命中提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者对同时处于大于等于<unbreak>#4[i]</unbreak>个负面效果的敌方目标造成伤害时，暴击率提高<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>。装备者施放普攻、战技、终结技后，有<unbreak>#2[i]%</unbreak>的基础概率对随机1个未持有【以太编码】的受击目标施加【以太编码】。持有【以太编码】的目标受到的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续1回合。',
    path: 'Warlock',
    levels: {
      1: [
        0.24,
        1,
        0.12,
        3,
        0.12
      ],
      2: [
        0.28,
        1,
        0.14,
        3,
        0.14
      ],
      3: [
        0.32,
        1,
        0.16,
        3,
        0.16
      ],
      4: [
        0.36,
        1,
        0.18,
        3,
        0.18
      ],
      5: [
        0.4,
        1,
        0.2,
        3,
        0.2
      ]
    }
  },
  23008: {
    name: '棺的回响',
    skillName: '荆棘',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者施放攻击后，每击中1名不同的敌方目标，恢复<color=#f29e38ff><unbreak>#3[f1]</unbreak></color>点能量，每次攻击最多通过该方式恢复<unbreak>#4[i]</unbreak>次能量。当装备者施放终结技后，使我方全体速度提高<color=#f29e38ff><unbreak>#2[i]</unbreak></color>点，持续1回合。',
    path: 'Priest',
    levels: {
      1: [
        0.24,
        12,
        3,
        3
      ],
      2: [
        0.28,
        14,
        3.5,
        3
      ],
      3: [
        0.32,
        16,
        4,
        3
      ],
      4: [
        0.36,
        18,
        4.5,
        3
      ],
      5: [
        0.4,
        20,
        5,
        3
      ]
    }
  },
  23009: {
    name: '到不了的彼岸',
    skillName: '不得',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，生命上限提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。当装备者受到攻击或装备者消耗自身生命值后，造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，该效果在装备者施放攻击后解除。',
    path: 'Warrior',
    levels: {
      1: [
        0.18,
        0.18,
        0.24
      ],
      2: [
        0.21,
        0.21,
        0.28
      ],
      3: [
        0.24,
        0.24,
        0.32
      ],
      4: [
        0.27,
        0.27,
        0.36
      ],
      5: [
        0.3,
        0.3,
        0.4
      ]
    }
  },
  23010: {
    name: '拂晓之前',
    skillName: '长夜',
    desc: '使装备者暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。使装备者战技和终结技造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。当装备者施放战技或终结技后，获得【梦身】效果。触发追加攻击时，消耗【梦身】，使追加攻击造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Mage',
    levels: {
      1: [
        0.36,
        0.18,
        0.48
      ],
      2: [
        0.42,
        0.21,
        0.56
      ],
      3: [
        0.48,
        0.24,
        0.64
      ],
      4: [
        0.54,
        0.27,
        0.72
      ],
      5: [
        0.6,
        0.3,
        0.8
      ]
    }
  },
  23011: {
    name: '她已闭上双眼',
    skillName: '视界',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，能量恢复效率提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>。当装备者的生命值降低时，使我方全体造成的伤害提高<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>，持续<unbreak>#5[i]</unbreak>回合。\\n每个波次开始时，为我方全体回复等同于各自已损失生命值<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>的生命值。',
    path: 'Knight',
    levels: {
      1: [
        0.24,
        0.09,
        0.8,
        0.12,
        2
      ],
      2: [
        0.28,
        0.105,
        0.85,
        0.14,
        2
      ],
      3: [
        0.32,
        0.12,
        0.9,
        0.16,
        2
      ],
      4: [
        0.36,
        0.135,
        0.95,
        0.18,
        2
      ],
      5: [
        0.4,
        0.15,
        1,
        0.2,
        2
      ]
    }
  },
  23012: {
    name: '如泥酣眠',
    skillName: '美梦',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者的普攻或战技伤害未造成暴击时，使自身暴击率提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。该效果每<unbreak>#4[i]</unbreak>回合可以触发1次。',
    path: 'Rogue',
    levels: {
      1: [
        0.3,
        0.36,
        1,
        3
      ],
      2: [
        0.35,
        0.42,
        1,
        3
      ],
      3: [
        0.4,
        0.48,
        1,
        3
      ],
      4: [
        0.45,
        0.54,
        1,
        3
      ],
      5: [
        0.5,
        0.6,
        1,
        3
      ]
    }
  },
  23013: {
    name: '时节不居',
    skillName: '日有四时',
    desc: '使装备者生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，治疗量提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。当装备者对我方目标提供治疗时，记录治疗量。当任意我方目标施放攻击后，根据记录治疗量的<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，对随机1个受到攻击的敌方目标造成基于装备者属性的附加伤害。该伤害不受加成影响，每回合最多结算1次。',
    path: 'Priest',
    levels: {
      1: [
        0.18,
        0.12,
        0.36
      ],
      2: [
        0.21,
        0.14,
        0.42
      ],
      3: [
        0.24,
        0.16,
        0.48
      ],
      4: [
        0.27,
        0.18,
        0.54
      ],
      5: [
        0.3,
        0.2,
        0.6
      ]
    }
  },
  23014: {
    name: '此身为剑',
    skillName: '执此宵玉',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当队友受到攻击或消耗生命值后，装备者获得1层【月蚀】，最多叠加<unbreak>#2[i]</unbreak>层。每层【月蚀】使装备者下一次攻击造成的伤害提高<color=#f29e38ff><unbreak>#3[f1]%</unbreak></color>。叠满<unbreak>#2[i]</unbreak>层时，额外使该次攻击无视目标<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>的防御力。该效果在装备者施放攻击后解除。',
    path: 'Warrior',
    levels: {
      1: [
        0.2,
        3,
        0.14,
        0.12
      ],
      2: [
        0.23,
        3,
        0.165,
        0.14
      ],
      3: [
        0.26,
        3,
        0.19,
        0.16
      ],
      4: [
        0.29,
        3,
        0.215,
        0.18
      ],
      5: [
        0.32,
        3,
        0.24,
        0.2
      ]
    }
  },
  23015: {
    name: '比阳光更明亮的',
    skillName: '抵死',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者施放普攻时，获得1层【龙吟】，持续<unbreak>#2[i]</unbreak>回合。每层【龙吟】使装备者的攻击力提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，能量恢复效率提高<color=#f29e38ff><unbreak>#5[f1]%</unbreak></color>。【龙吟】最多叠加<unbreak>#3[i]</unbreak>层。',
    path: 'Warrior',
    levels: {
      1: [
        0.18,
        2,
        2,
        0.18,
        0.06
      ],
      2: [
        0.21,
        2,
        2,
        0.21,
        0.07
      ],
      3: [
        0.24,
        2,
        2,
        0.24,
        0.08
      ],
      4: [
        0.27,
        2,
        2,
        0.27,
        0.09
      ],
      5: [
        0.3,
        2,
        2,
        0.3,
        0.1
      ]
    }
  },
  23016: {
    name: '烦恼着，幸福着',
    skillName: '一个一个来',
    desc: '使装备者暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，追加攻击造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。装备者施放追加攻击后，使目标陷入【温驯】状态，该效果最多叠加<unbreak>#4[i]</unbreak>层。我方目标击中【温驯】状态下的敌方目标时，每层【温驯】使造成的暴击伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Rogue',
    levels: {
      1: [
        0.18,
        0.3,
        0.12,
        2
      ],
      2: [
        0.21,
        0.35,
        0.14,
        2
      ],
      3: [
        0.24,
        0.4,
        0.16,
        2
      ],
      4: [
        0.27,
        0.45,
        0.18,
        2
      ],
      5: [
        0.3,
        0.5,
        0.2,
        2
      ]
    }
  },
  23017: {
    name: '惊魂夜',
    skillName: '深度深呼吸',
    desc: '使装备者的能量恢复效率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。我方目标施放终结技时，装备者为当前生命值百分比最低的我方目标回复等同于其<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>生命上限的生命值。当装备者为我方目标提供治疗时，使该目标的攻击力提高<color=#f29e38ff><unbreak>#3[f1]%</unbreak></color>，该效果最多叠加<unbreak>#4[i]</unbreak>层，持续<unbreak>#5[i]</unbreak>回合。',
    path: 'Priest',
    levels: {
      1: [
        0.12,
        0.1,
        0.024,
        5,
        2
      ],
      2: [
        0.14,
        0.11,
        0.028,
        5,
        2
      ],
      3: [
        0.16,
        0.12,
        0.032,
        5,
        2
      ],
      4: [
        0.18,
        0.13,
        0.036,
        5,
        2
      ],
      5: [
        0.2,
        0.14,
        0.04,
        5,
        2
      ]
    }
  },
  23018: {
    name: '片刻，留在眼底',
    skillName: '骑士巡礼',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者施放终结技时，根据装备者的能量上限，提高装备者终结技造成的伤害：每点能量提高<color=#f29e38ff><unbreak>#2[f2]%</unbreak></color>，最多计入<unbreak>#3[i]</unbreak>点。',
    path: 'Mage',
    levels: {
      1: [
        0.36,
        0.0036,
        180
      ],
      2: [
        0.42,
        0.0042,
        180
      ],
      3: [
        0.48,
        0.0048,
        180
      ],
      4: [
        0.54,
        0.0054,
        180
      ],
      5: [
        0.6,
        0.006,
        180
      ]
    }
  },
  23019: {
    name: '镜中故我',
    skillName: '彻骨梅香',
    desc: '使装备者击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放终结技后，使我方全体造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合，并且若装备者击破特攻大于等于<unbreak>#4[i]%</unbreak>，则恢复1个战技点。\\n每个波次开始时，我方全体立即恢复<color=#f29e38ff><unbreak>#5[f1]</unbreak></color>点能量，同类技能无法重复生效。',
    path: 'Shaman',
    levels: {
      1: [
        0.6,
        0.24,
        3,
        1.5,
        10
      ],
      2: [
        0.7,
        0.28,
        3,
        1.5,
        12.5
      ],
      3: [
        0.8,
        0.32,
        3,
        1.5,
        15
      ],
      4: [
        0.9,
        0.36,
        3,
        1.5,
        17.5
      ],
      5: [
        1,
        0.4,
        3,
        1.5,
        20
      ]
    }
  },
  23020: {
    name: '纯粹思维的洗礼',
    skillName: '思想训练',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。敌方目标每承受1个负面效果，装备者对其造成的暴击伤害额外提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，最多叠加<unbreak>#3[i]</unbreak>层。施放终结技攻击敌方目标时，使装备者获得【论辩】效果，造成的伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，追加攻击无视目标<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>的防御力，该效果持续<unbreak>#6[i]</unbreak>回合。',
    path: 'Rogue',
    levels: {
      1: [
        0.2,
        0.08,
        3,
        0.36,
        0.24,
        2
      ],
      2: [
        0.23,
        0.09,
        3,
        0.42,
        0.28,
        2
      ],
      3: [
        0.26,
        0.1,
        3,
        0.48,
        0.32,
        2
      ],
      4: [
        0.29,
        0.11,
        3,
        0.54,
        0.36,
        2
      ],
      5: [
        0.32,
        0.12,
        3,
        0.6,
        0.4,
        2
      ]
    }
  },
  23021: {
    name: '游戏尘寰',
    skillName: '善变',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。战斗开始时，使装备者获得【假面】，持续<unbreak>#6[i]</unbreak>回合。当装备者持有【假面】时，装备者的队友暴击率提高<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>，暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。装备者每恢复1个战技点，获得1层【彩焰】，恢复时溢出的战技点也会被计算在内。当【彩焰】达到<unbreak>#4[i]</unbreak>层后，移除所有【彩焰】并获得【假面】，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Shaman',
    levels: {
      1: [
        0.32,
        0.28,
        4,
        4,
        0.1,
        3
      ],
      2: [
        0.39,
        0.35,
        4,
        4,
        0.11,
        3
      ],
      3: [
        0.46,
        0.42,
        4,
        4,
        0.12,
        3
      ],
      4: [
        0.53,
        0.49,
        4,
        4,
        0.13,
        3
      ],
      5: [
        0.6,
        0.56,
        4,
        4,
        0.14,
        3
      ]
    }
  },
  23022: {
    name: '重塑时光之忆',
    skillName: '结晶',
    desc: '使装备者的效果命中提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者对陷入风化、灼烧、触电、裂伤状态的敌方目标造成伤害时，分别获得1层【先知】，最多叠加<unbreak>#4[i]</unbreak>层。单场战斗中，每种持续伤害状态类型仅可叠加1次【先知】效果。每层【先知】使装备者的攻击力提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，造成的持续伤害无视目标<color=#f29e38ff><unbreak>#3[f1]%</unbreak></color>的防御力。',
    path: 'Warlock',
    levels: {
      1: [
        0.4,
        0.05,
        0.072,
        4
      ],
      2: [
        0.45,
        0.06,
        0.079,
        4
      ],
      3: [
        0.5,
        0.07,
        0.086,
        4
      ],
      4: [
        0.55,
        0.08,
        0.093,
        4
      ],
      5: [
        0.6,
        0.09,
        0.1,
        4
      ]
    }
  },
  23023: {
    name: '命运从未公平',
    skillName: '全下',
    desc: '使装备者的防御力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，当装备者为我方目标提供护盾时，使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。当装备者发动追加攻击击中敌方目标时，有<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>的基础概率使受到攻击的敌方目标受到的伤害提高<color=#f29e38ff><unbreak>#5[f1]%</unbreak></color>，持续<unbreak>#6[i]</unbreak>回合。',
    path: 'Knight',
    levels: {
      1: [
        0.4,
        0.4,
        2,
        1,
        0.1,
        2
      ],
      2: [
        0.46,
        0.46,
        2,
        1.15,
        0.115,
        2
      ],
      3: [
        0.52,
        0.52,
        2,
        1.3,
        0.13,
        2
      ],
      4: [
        0.58,
        0.58,
        2,
        1.45,
        0.145,
        2
      ],
      5: [
        0.64,
        0.64,
        2,
        1.6,
        0.16,
        2
      ]
    }
  },
  23024: {
    name: '行于流逝的岸',
    skillName: '司渡',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者击中敌方目标时，使敌方陷入【泡影】状态，持续1回合。装备者每次攻击时，对每个目标只可触发1次。装备者对陷入【泡影】状态的目标造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，终结技造成的伤害额外提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Warlock',
    levels: {
      1: [
        0.36,
        0.24,
        0.24
      ],
      2: [
        0.42,
        0.28,
        0.28
      ],
      3: [
        0.48,
        0.32,
        0.32
      ],
      4: [
        0.54,
        0.36,
        0.36
      ],
      5: [
        0.6,
        0.4,
        0.4
      ]
    }
  },
  23025: {
    name: '梦应归于何处',
    skillName: '蜕变',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者对敌方目标造成击破伤害时，使敌方陷入【溃败】状态，持续<unbreak>#4[i]</unbreak>回合。【溃败】状态下目标受到装备者造成的击破伤害提高<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>，速度降低<unbreak>#3[i]%</unbreak>，同类效果无法叠加。',
    path: 'Warrior',
    levels: {
      1: [
        0.6,
        0.24,
        0.2,
        2
      ],
      2: [
        0.7,
        0.28,
        0.2,
        2
      ],
      3: [
        0.8,
        0.32,
        0.2,
        2
      ],
      4: [
        0.9,
        0.36,
        0.2,
        2
      ],
      5: [
        1,
        0.4,
        0.2,
        2
      ]
    }
  },
  23026: {
    name: '夜色流光溢彩',
    skillName: '抚慰',
    desc: '我方角色每次攻击时，使装备者获得1层【歌咏】，每层【歌咏】使装备者的能量恢复效率提高<color=#f29e38ff><unbreak>#1[f1]%</unbreak></color>，最多叠加<unbreak>#2[i]</unbreak>层。装备者施放终结技时，移除【歌咏】并获得【华彩】，【华彩】使装备者的攻击力提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，使我方全体造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续<unbreak>#5[i]</unbreak>回合。',
    path: 'Shaman',
    levels: {
      1: [
        0.03,
        5,
        0.24,
        0.48,
        1
      ],
      2: [
        0.035,
        5,
        0.28,
        0.6,
        1
      ],
      3: [
        0.04,
        5,
        0.32,
        0.72,
        1
      ],
      4: [
        0.045,
        5,
        0.36,
        0.84,
        1
      ],
      5: [
        0.05,
        5,
        0.4,
        0.96,
        1
      ]
    }
  },
  23027: {
    name: '驶向第二次生命',
    skillName: '苦航',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，造成的击破伤害无视目标<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>的防御力。当装备者在战斗中击破特攻大于等于<unbreak>#2[i]%</unbreak>时，速度提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>。',
    path: 'Rogue',
    levels: {
      1: [
        0.6,
        1.5,
        0.2,
        0.12
      ],
      2: [
        0.7,
        1.5,
        0.23,
        0.14
      ],
      3: [
        0.8,
        1.5,
        0.26,
        0.16
      ],
      4: [
        0.9,
        1.5,
        0.29,
        0.18
      ],
      5: [
        1,
        1.5,
        0.32,
        0.2
      ]
    }
  },
  23028: {
    name: '偏偏希望无价',
    skillName: '承诺',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者在战斗中暴击伤害大于<unbreak>#2[i]%</unbreak>时，每超过<unbreak>#3[i]%</unbreak>，追加攻击造成的伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，该效果可叠加<unbreak>#5[i]</unbreak>层。战斗开始时和装备者施放普攻后，使终结技或追加攻击造成的伤害无视目标<color=#f29e38ff><unbreak>#6[i]%</unbreak></color>的防御，持续<unbreak>#7[i]</unbreak>回合。',
    path: 'Mage',
    levels: {
      1: [
        0.16,
        1.2,
        0.2,
        0.12,
        4,
        0.2,
        2
      ],
      2: [
        0.19,
        1.2,
        0.2,
        0.14,
        4,
        0.24,
        2
      ],
      3: [
        0.22,
        1.2,
        0.2,
        0.16,
        4,
        0.28,
        2
      ],
      4: [
        0.25,
        1.2,
        0.2,
        0.18,
        4,
        0.32,
        2
      ],
      5: [
        0.28,
        1.2,
        0.2,
        0.2,
        4,
        0.36,
        2
      ]
    }
  },
  23029: {
    name: '那无数个春天',
    skillName: '世事无痕',
    desc: '使装备者的效果命中提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，装备者施放普攻、战技、终结技攻击敌方目标后，有<unbreak>#2[i]%</unbreak>的基础概率使其陷入【卸甲】状态。【卸甲】状态下，敌方目标受到的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合。若目标处于装备者施加的持续伤害状态，则有<unbreak>#5[i]%</unbreak>的基础概率将装备者施加的【卸甲】状态升级成【穷寇】状态，使敌方目标受到的伤害额外提高<color=#f29e38ff><unbreak>#6[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合，期间装备者无法对其施加【卸甲】。',
    path: 'Warlock',
    levels: {
      1: [
        0.6,
        0.6,
        0.1,
        2,
        0.6,
        0.14
      ],
      2: [
        0.7,
        0.6,
        0.12,
        2,
        0.6,
        0.16
      ],
      3: [
        0.8,
        0.6,
        0.14,
        2,
        0.6,
        0.18
      ],
      4: [
        0.9,
        0.6,
        0.16,
        2,
        0.6,
        0.2
      ],
      5: [
        1,
        0.6,
        0.18,
        2,
        0.6,
        0.22
      ]
    }
  },
  23030: {
    name: '落日时起舞',
    skillName: '沉酣',
    desc: '使装备者受到攻击的概率大幅提高，暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者施放终结技后，获得1层【火舞】，持续2回合，最多叠加<unbreak>#2[i]</unbreak>层。每层【火舞】使装备者追加攻击造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Warrior',
    levels: {
      1: [
        0.36,
        2,
        0.36,
        5
      ],
      2: [
        0.42,
        2,
        0.42,
        5
      ],
      3: [
        0.48,
        2,
        0.48,
        5
      ],
      4: [
        0.54,
        2,
        0.54,
        5
      ],
      5: [
        0.6,
        2,
        0.6,
        5
      ]
    }
  },
  23031: {
    name: '我将，巡征追猎',
    skillName: '震慑',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[f1]%</unbreak></color>。装备者施放追加攻击时，获得1层【流光】，最多叠加<unbreak>#3[i]</unbreak>层。每层【流光】使装备者造成的终结技伤害无视目标<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的防御力。装备者回合结束时，移除1层【流光】。',
    path: 'Rogue',
    levels: {
      1: [
        0.15,
        0.27,
        2
      ],
      2: [
        0.175,
        0.3,
        2
      ],
      3: [
        0.2,
        0.33,
        2
      ],
      4: [
        0.225,
        0.36,
        2
      ],
      5: [
        0.25,
        0.39,
        2
      ]
    }
  },
  23032: {
    name: '唯有香如故',
    skillName: '安心',
    desc: '使装备者击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放终结技攻击敌方目标后，使其陷入【忘忧】状态，持续<unbreak>#5[i]</unbreak>回合，【忘忧】状态下的敌方目标受到的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，若装备者当前击破特攻大于等于<unbreak>#3[i]%</unbreak>，受到的伤害提高效果额外提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>。',
    path: 'Priest',
    levels: {
      1: [
        0.6,
        0.1,
        1.5,
        0.08,
        2
      ],
      2: [
        0.7,
        0.12,
        1.5,
        0.1,
        2
      ],
      3: [
        0.8,
        0.14,
        1.5,
        0.12,
        2
      ],
      4: [
        0.9,
        0.16,
        1.5,
        0.14,
        2
      ],
      5: [
        1,
        0.18,
        1.5,
        0.16,
        2
      ]
    }
  },
  23033: {
    name: '忍法帖•缭乱破魔',
    skillName: '除邪',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。进入战斗时立即恢复<color=#f29e38ff><unbreak>#2[f1]</unbreak></color>点能量，且装备者施放终结技后获得【雷遁】，施放2次普攻后，装备者行动提前<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，并移除【雷遁】。装备者施放终结技后会重置【雷遁】。',
    path: 'Mage',
    levels: {
      1: [
        0.6,
        30,
        0.5
      ],
      2: [
        0.7,
        32.5,
        0.55
      ],
      3: [
        0.8,
        35,
        0.6
      ],
      4: [
        0.9,
        37.5,
        0.65
      ],
      5: [
        1,
        40,
        0.7
      ]
    }
  },
  23034: {
    name: '回到大地的飞行',
    skillName: '再启程',
    desc: '当装备者对我方单体角色施放战技或终结技后，装备者恢复<color=#f29e38ff><unbreak>#1[f1]</unbreak></color>点能量，同时使技能目标获得1层【圣咏】，持续<unbreak>#4[i]</unbreak>回合，最多叠加<unbreak>#3[i]</unbreak>层，每层【圣咏】使持有者造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。装备者每对我方单体角色施放<unbreak>#5[i]</unbreak>次战技或终结技后，恢复1个战技点。',
    path: 'Shaman',
    levels: {
      1: [
        6,
        0.15,
        3,
        3,
        2
      ],
      2: [
        6.5,
        0.1725,
        3,
        3,
        2
      ],
      3: [
        7,
        0.195,
        3,
        3,
        2
      ],
      4: [
        7.5,
        0.2175,
        3,
        3,
        2
      ],
      5: [
        8,
        0.24,
        3,
        3,
        2
      ]
    }
  },
  23035: {
    name: '长路终有归途',
    skillName: '新生',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当有敌方目标的弱点被击破时，有<unbreak>#2[i]%</unbreak>的基础概率使其陷入【焚灼】状态，受到的击破伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合，此效果可叠加<unbreak>#5[i]</unbreak>层。',
    path: 'Warlock',
    levels: {
      1: [
        0.6,
        1,
        0.18,
        2,
        2
      ],
      2: [
        0.7,
        1,
        0.21,
        2,
        2
      ],
      3: [
        0.8,
        1,
        0.24,
        2,
        2
      ],
      4: [
        0.9,
        1,
        0.27,
        2,
        2
      ],
      5: [
        1,
        1,
        0.3,
        2,
        2
      ]
    }
  },
  23036: {
    name: '将光阴织成黄金',
    skillName: '创设',
    desc: '使装备者的基础速度提高<color=#f29e38ff><unbreak>#1[i]</unbreak></color>，装备者和装备者的忆灵在攻击后使装备者获得1层【织锦】，每层【织锦】使装备者和装备者的忆灵暴击伤害提高<color=#f29e38ff><unbreak>#4[f1]%</unbreak></color>，最多叠加<unbreak>#2[i]</unbreak>层。叠加至上限时，每层【织锦】额外使造成的普攻伤害提高<color=#f29e38ff><unbreak>#3[f1]%</unbreak></color>。',
    path: 'Memory',
    levels: {
      1: [
        12,
        6,
        0.09,
        0.09
      ],
      2: [
        14,
        6,
        0.105,
        0.105
      ],
      3: [
        16,
        6,
        0.12,
        0.12
      ],
      4: [
        18,
        6,
        0.135,
        0.135
      ],
      5: [
        20,
        6,
        0.15,
        0.15
      ]
    }
  },
  23037: {
    name: '向着不可追问处',
    skillName: '思维游戏',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放终结技时，使装备者造成的战技和终结技伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，持续<unbreak>#5[i]</unbreak>回合。装备者施放终结技后，若本次终结技消耗的能量大于等于<unbreak>#3[i]</unbreak>点，恢复1个战技点。',
    path: 'Mage',
    levels: {
      1: [
        0.12,
        2,
        140,
        0.6,
        3
      ],
      2: [
        0.14,
        2,
        140,
        0.7,
        3
      ],
      3: [
        0.16,
        2,
        140,
        0.8,
        3
      ],
      4: [
        0.18,
        2,
        140,
        0.9,
        3
      ],
      5: [
        0.2,
        2,
        140,
        1,
        3
      ]
    }
  },
  23038: {
    name: '如果时间是一朵花',
    skillName: '希冀',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放追加攻击后额外恢复<unbreak>#2[i]</unbreak>点能量，并获得【谕示】，持续<unbreak>#3[i]</unbreak>回合。当装备者持有【谕示】时，我方全体目标的暴击伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>。进入战斗时，装备者恢复<unbreak>#5[i]</unbreak>点能量，并获得【谕示】，持续<unbreak>#6[i]</unbreak>回合。',
    path: 'Shaman',
    levels: {
      1: [
        0.36,
        12,
        2,
        0.48,
        21,
        2
      ],
      2: [
        0.42,
        12,
        2,
        0.6,
        21,
        2
      ],
      3: [
        0.48,
        12,
        2,
        0.72,
        21,
        2
      ],
      4: [
        0.54,
        12,
        2,
        0.84,
        21,
        2
      ],
      5: [
        0.6,
        12,
        2,
        0.96,
        21,
        2
      ]
    }
  },
  23039: {
    name: '血火啊，燃烧前路',
    skillName: '远望',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，受到的治疗量提高<color=#f29e38ff><unbreak>#6[i]%</unbreak></color>，施放战技或终结技时消耗等同于自身<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>生命上限的生命值，并使本次攻击造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，若该效果消耗的生命值高于<unbreak>#4[i]</unbreak>点，可使伤害额外提高<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>。\\n若当前生命值不足，该效果最多使装备者的当前生命值降低至1点。',
    path: 'Warrior',
    levels: {
      1: [
        0.18,
        0.06,
        0.3,
        500,
        0.3,
        0.2
      ],
      2: [
        0.21,
        0.065,
        0.35,
        500,
        0.35,
        0.25
      ],
      3: [
        0.24,
        0.07,
        0.4,
        500,
        0.4,
        0.3
      ],
      4: [
        0.27,
        0.075,
        0.45,
        500,
        0.45,
        0.35
      ],
      5: [
        0.3,
        0.08,
        0.5,
        500,
        0.5,
        0.4
      ]
    }
  },
  23040: {
    name: '让告别，更美一些',
    skillName: '铭刻',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，装备者或装备者的忆灵在自身回合内损失生命值时，装备者获得【冥花】，【冥花】可以使装备者和装备者的忆灵造成伤害时，无视目标<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的防御力，持续<unbreak>#3[i]</unbreak>回合。\\n当装备者的忆灵消失时，使装备者行动提前<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>。该效果最多触发1次，装备者每次施放终结技时重置触发次数。',
    path: 'Memory',
    levels: {
      1: [
        0.3,
        0.3,
        2,
        0.12
      ],
      2: [
        0.375,
        0.35,
        2,
        0.15
      ],
      3: [
        0.45,
        0.4,
        2,
        0.18
      ],
      4: [
        0.525,
        0.45,
        2,
        0.21
      ],
      5: [
        0.6,
        0.5,
        2,
        0.24
      ]
    }
  },
  23041: {
    name: '生命当付之一炬',
    skillName: '熔炼',
    desc: '装备者回合开始时恢复<unbreak>#5[i]</unbreak>点能量。若敌方目标拥有装备者添加的弱点，装备者对其造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。\\n当敌方目标受到装备者攻击时，装备者使其防御力降低<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合。同类效果无法叠加。',
    path: 'Mage',
    levels: {
      1: [
        0,
        0.12,
        0.6,
        2,
        10
      ],
      2: [
        0,
        0.15,
        0.7,
        2,
        10
      ],
      3: [
        0,
        0.18,
        0.8,
        2,
        10
      ],
      4: [
        0,
        0.21,
        0.9,
        2,
        10
      ],
      5: [
        0,
        0.24,
        1,
        2,
        10
      ]
    }
  },
  23042: {
    name: '愿虹光永驻天空',
    skillName: '包容',
    desc: '使装备者的速度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放普攻、战技和终结技时消耗我方全体等同于当前生命值<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>的生命值并使装备者的忆灵下一次攻击后额外对攻击目标造成1次等同于<color=#f29e38ff><unbreak>#6[f1]%</unbreak></color>生命值消耗总量的基于装备者的忆灵属性的附加伤害，随后清空生命值消耗总量。装备者的忆灵施放忆灵技时，使敌方全体受到的伤害提高<color=#f29e38ff><unbreak>#4[f1]%</unbreak></color>，持续<unbreak>#5[i]</unbreak>回合。同类效果无法叠加。',
    path: 'Memory',
    levels: {
      1: [
        0.18,
        0.01,
        0,
        0.18,
        2,
        2.5
      ],
      2: [
        0.21,
        0.0125,
        0,
        0.225,
        2,
        3.125
      ],
      3: [
        0.24,
        0.015,
        0,
        0.27,
        2,
        3.75
      ],
      4: [
        0.27,
        0.0175,
        0,
        0.315,
        2,
        4.375
      ],
      5: [
        0.3,
        0.02,
        0,
        0.36,
        2,
        5
      ]
    }
  },
  23043: {
    name: '谎言在风中飘扬',
    skillName: '欺瞒',
    desc: '使装备者的速度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放攻击后，有<unbreak>#2[i]%</unbreak>的基础概率使敌方每个单体目标陷入【茫然】状态，【茫然】状态下的敌方目标防御力降低<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合，若装备者的速度大于等于<unbreak>#7[i]</unbreak>，有<unbreak>#5[i]%</unbreak>的基础概率使敌方每个单体目标陷入【失窃】状态，【失窃】状态下的敌方目标防御力降低<color=#f29e38ff><unbreak>#6[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合。【茫然】或【失窃】被重复施加时，仅最新施加的生效。',
    path: 'Warlock',
    levels: {
      1: [
        0.18,
        1.2,
        0.16,
        2,
        1.2,
        0.08,
        170
      ],
      2: [
        0.21,
        1.2,
        0.18,
        2,
        1.2,
        0.09,
        170
      ],
      3: [
        0.24,
        1.2,
        0.2,
        2,
        1.2,
        0.1,
        170
      ],
      4: [
        0.27,
        1.2,
        0.22,
        2,
        1.2,
        0.11,
        170
      ],
      5: [
        0.3,
        1.2,
        0.24,
        2,
        1.2,
        0.12,
        170
      ]
    }
  },
  23044: {
    name: '黎明恰如此燃烧',
    skillName: '失却',
    desc: '使装备者的基础速度提高<color=#f29e38ff><unbreak>#1[i]</unbreak></color>，造成伤害时无视目标<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的防御力。装备者施放终结技后，获得【烈阳】，回合开始时移除。持有【烈阳】时，装备者造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Warrior',
    levels: {
      1: [
        12,
        0.18,
        0.6
      ],
      2: [
        14,
        0.225,
        0.78
      ],
      3: [
        16,
        0.27,
        0.96
      ],
      4: [
        18,
        0.315,
        1.14
      ],
      5: [
        20,
        0.36,
        1.32
      ]
    }
  },
  23045: {
    name: '没有回报的加冕',
    skillName: '骑士之王',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。施放终结技时，使装备者的攻击力提高<color=#f29e38ff><unbreak>#6[i]%</unbreak></color>，若装备者的能量上限大于等于<unbreak>#3[i]</unbreak>点，为装备者固定恢复等同于装备者能量上限<unbreak>#5[i]%</unbreak>的能量，并再次使装备者的攻击力提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合。',
    path: 'Warrior',
    levels: {
      1: [
        0.36,
        0.4,
        300,
        2,
        0.1,
        0.4
      ],
      2: [
        0.45,
        0.5,
        300,
        2,
        0.1,
        0.5
      ],
      3: [
        0.54,
        0.6,
        300,
        2,
        0.1,
        0.6
      ],
      4: [
        0.63,
        0.7,
        300,
        2,
        0.1,
        0.7
      ],
      5: [
        0.72,
        0.8,
        300,
        2,
        0.1,
        0.8
      ]
    }
  },
  23046: {
    name: '理想燃烧的地狱',
    skillName: '赤原猎兵',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。进入战斗时，若我方的战技点上限大于等于<unbreak>#2[i]</unbreak>点，使装备者的攻击力提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。装备者每次施放战技后，使装备者的攻击力提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，最多叠加<unbreak>#5[i]</unbreak>次。',
    path: 'Rogue',
    levels: {
      1: [
        0.16,
        6,
        0.4,
        0.1,
        4
      ],
      2: [
        0.2,
        6,
        0.5,
        0.125,
        4
      ],
      3: [
        0.24,
        6,
        0.6,
        0.15,
        4
      ],
      4: [
        0.28,
        6,
        0.7,
        0.175,
        4
      ],
      5: [
        0.32,
        6,
        0.8,
        0.2,
        4
      ]
    }
  },
  23047: {
    name: '海洋为何而歌',
    skillName: '独奏',
    desc: '使装备者的效果命中提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，当有敌方目标陷入装备者施加的负面效果时，有<unbreak>#2[i]%</unbreak>的基础概率使其陷入【魂迷】状态，持续<unbreak>#3[i]</unbreak>回合，同类效果无法叠加。【魂迷】状态下，每有1个装备者施加的负面效果，受到的持续伤害提高<color=#f29e38ff><unbreak>#4[f1]%</unbreak></color>，该效果最多叠加<unbreak>#5[i]</unbreak>层，受到我方目标攻击时，使攻击者速度提高<color=#f29e38ff><unbreak>#6[f1]%</unbreak></color>，持续<unbreak>#7[i]</unbreak>回合。当装备者陷入无法战斗状态时，移除所有【魂迷】。',
    path: 'Warlock',
    levels: {
      1: [
        0.4,
        0.8,
        3,
        0.05,
        6,
        0.1,
        3
      ],
      2: [
        0.45,
        0.8,
        3,
        0.0625,
        6,
        0.125,
        3
      ],
      3: [
        0.5,
        0.8,
        3,
        0.075,
        6,
        0.15,
        3
      ],
      4: [
        0.55,
        0.8,
        3,
        0.0875,
        6,
        0.175,
        3
      ],
      5: [
        0.6,
        0.8,
        3,
        0.1,
        6,
        0.2,
        3
      ]
    }
  },
  23048: {
    name: '金血铭刻的时代',
    skillName: '征服',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。施放终结技攻击后恢复<unbreak>#3[i]</unbreak>个战技点，装备者对我方单体角色施放战技后，使目标造成的战技伤害提高<color=#f29e38ff><unbreak>#4[f1]%</unbreak></color>，持续<unbreak>#5[i]</unbreak>回合。',
    path: 'Shaman',
    levels: {
      1: [
        0.64,
        1,
        1,
        0.54,
        3
      ],
      2: [
        0.8,
        1,
        1,
        0.675,
        3
      ],
      3: [
        0.96,
        1,
        1,
        0.81,
        3
      ],
      4: [
        1.12,
        1,
        1,
        0.945,
        3
      ],
      5: [
        1.28,
        1,
        1,
        1.08,
        3
      ]
    }
  },
  23049: {
    name: '致长夜的星光',
    skillName: '未眠',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者的忆灵施放技能时，使装备者获得【夜色】。装备者持有【夜色】时，我方全体忆灵造成的伤害无视目标<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的防御力，装备者和装备者忆灵造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，装备者的忆灵消失时为装备者恢复<color=#f29e38ff><unbreak>#4[i]</unbreak></color>点能量，同类效果无法叠加。',
    path: 'Memory',
    levels: {
      1: [
        0.3,
        0.2,
        0.3,
        8
      ],
      2: [
        0.375,
        0.225,
        0.375,
        10
      ],
      3: [
        0.45,
        0.25,
        0.45,
        12
      ],
      4: [
        0.525,
        0.275,
        0.525,
        14
      ],
      5: [
        0.6,
        0.3,
        0.6,
        16
      ]
    }
  },
  23050: {
    name: '勿忘她的火焰',
    skillName: '焚身',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。进入战斗时，使装备者和另一位开战的队友造成的击破伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，若不存在开战的队友则对装备者和击破特攻最高的队友生效，同类效果无法叠加。装备者为敌方目标添加弱点时，恢复1个战技点，该效果最多触发1次，施放终结技时重置可触发次数。',
    path: 'Warlock',
    levels: {
      1: [
        0.6,
        0.32
      ],
      2: [
        0.75,
        0.42
      ],
      3: [
        0.9,
        0.52
      ],
      4: [
        1.05,
        0.62
      ],
      5: [
        1.2,
        0.72
      ]
    }
  },
  23051: {
    name: '纵然山河万程',
    skillName: '新鳞',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放终结技时，为我方全体回复等同于装备者攻击力<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>的生命值，额外为当前生命值最低的角色回复等同于装备者攻击力<color=#f29e38ff><unbreak>#6[i]%</unbreak></color>的生命值，并使我方全体获得【卫戍】，【卫戍】持续<unbreak>#4[i]</unbreak>回合。获得【卫戍】的目标，造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，若目标拥有召唤物则造成的伤害额外提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Knight',
    levels: {
      1: [
        0.64,
        0.24,
        0.12,
        3,
        0.1,
        0.1
      ],
      2: [
        0.8,
        0.3,
        0.15,
        3,
        0.125,
        0.125
      ],
      3: [
        0.96,
        0.36,
        0.18,
        3,
        0.15,
        0.15
      ],
      4: [
        1.12,
        0.42,
        0.21,
        3,
        0.175,
        0.175
      ],
      5: [
        1.28,
        0.48,
        0.24,
        3,
        0.2,
        0.2
      ]
    }
  },
  23052: {
    name: '爱如此刻永恒',
    skillName: '约定',
    desc: '使装备者的速度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者的忆灵对我方单体施放忆灵技时获得【空白】：敌方全体受到的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。装备者的忆灵对敌方施放忆灵技时获得【诗行】：我方全体的暴击伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。装备者的忆灵同时持有【空白】和【诗行】时，【空白】和【诗行】的效果提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>。',
    path: 'Memory',
    levels: {
      1: [
        0.18,
        0.16,
        0.1,
        0.6
      ],
      2: [
        0.21,
        0.19,
        0.12,
        0.65
      ],
      3: [
        0.24,
        0.22,
        0.14,
        0.7
      ],
      4: [
        0.27,
        0.25,
        0.16,
        0.75
      ],
      5: [
        0.3,
        0.28,
        0.18,
        0.8
      ]
    }
  },
  23053: {
    name: '花花世界迷人眼',
    skillName: '瞩目',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者在场时，队伍中每有1名「欢愉」命途的角色，战技点上限提高<unbreak>#2[i]</unbreak>点，最多提高<unbreak>#3[i]</unbreak>点；装备者每消耗1个战技点使自身造成的欢愉伤害无视敌方目标<color=#f29e38ff><unbreak>#6[f1]%</unbreak></color>的防御力，最多叠加<unbreak>#5[i]</unbreak>层，若在同一回合内消耗大于等于<unbreak>#7[i]</unbreak>个战技点则使装备者获得【推流】。装备者持有【推流】时，我方全体欢愉度提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>。同类光锥效果无法叠加。',
    path: 'Elation',
    levels: {
      1: [
        0.48,
        1,
        3,
        0.2,
        4,
        0.05,
        4
      ],
      2: [
        0.56,
        1,
        3,
        0.24,
        4,
        0.06,
        4
      ],
      3: [
        0.64,
        1,
        3,
        0.28,
        4,
        0.07,
        4
      ],
      4: [
        0.72,
        1,
        3,
        0.32,
        4,
        0.08,
        4
      ],
      5: [
        0.8,
        1,
        3,
        0.36,
        4,
        0.09,
        4
      ]
    }
  },
  23054: {
    name: '当她决定看见',
    skillName: '破局',
    desc: '使装备者的速度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者进入战斗或对我方目标施放终结技时，使装备者获得【上上签】，持续<unbreak>#4[i]</unbreak>回合。当装备者持有【上上签】时，我方全体暴击率提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，暴击伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，装备者自身能量恢复效率提高<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>。\\n每个波次开始时，装备者固定恢复<unbreak>#6[i]</unbreak>点能量。',
    path: 'Elation',
    levels: {
      1: [
        0.18,
        0.1,
        0.3,
        3,
        0.12,
        15
      ],
      2: [
        0.21,
        0.11,
        0.375,
        3,
        0.14,
        15
      ],
      3: [
        0.24,
        0.12,
        0.45,
        3,
        0.16,
        15
      ],
      4: [
        0.27,
        0.13,
        0.525,
        3,
        0.18,
        15
      ],
      5: [
        0.3,
        0.14,
        0.6,
        3,
        0.2,
        15
      ]
    }
  },
  23055: {
    name: '献给明日的色彩',
    skillName: '挥墨',
    desc: '使装备者的防御力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者对我方全体施放欢愉技时，使敌方全体受到的伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合，为装备者固定恢复<unbreak>#2[i]</unbreak>点能量，并为我方全体回复等同于装备者防御力<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>的生命值。',
    path: 'Elation',
    levels: {
      1: [
        0.48,
        10,
        3,
        0.22,
        0.1
      ],
      2: [
        0.6,
        10,
        3,
        0.275,
        0.125
      ],
      3: [
        0.72,
        10,
        3,
        0.33,
        0.15
      ],
      4: [
        0.84,
        10,
        3,
        0.385,
        0.175
      ],
      5: [
        0.96,
        10,
        3,
        0.44,
        0.2
      ]
    }
  },
  23056: {
    name: '一场谎言的终幕',
    skillName: '吞没',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。战斗开始时或装备者每累计施放<unbreak>#2[i]</unbreak>次追加攻击，使装备者获得【影噬】，持续<unbreak>#3[i]</unbreak>回合。当装备者持有【影噬】时，攻击力提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，并使敌方全体受到的伤害提高<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>，同类效果无法叠加。',
    path: 'Rogue',
    levels: {
      1: [
        0.18,
        4,
        3,
        0.4,
        0.2
      ],
      2: [
        0.21,
        4,
        3,
        0.5,
        0.225
      ],
      3: [
        0.24,
        4,
        3,
        0.6,
        0.25
      ],
      4: [
        0.27,
        4,
        3,
        0.7,
        0.275
      ],
      5: [
        0.3,
        4,
        3,
        0.8,
        0.3
      ]
    }
  },
  23057: {
    name: '欢迎来到银河城',
    skillName: '稳赢',
    desc: '使装备者的速度提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，造成的欢愉伤害无视目标<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>的防御力。当装备者对自身单体施放终结技时，获得<color=#f29e38ff><unbreak>#3[i]</unbreak></color>点【笑点】。该效果最多触发1次，施放<unbreak>#4[i]</unbreak>次普攻后重置可触发次数。',
    path: 'Elation',
    levels: {
      1: [
        0.18,
        0.2,
        20,
        3
      ],
      2: [
        0.21,
        0.24,
        25,
        3
      ],
      3: [
        0.24,
        0.28,
        30,
        3
      ],
      4: [
        0.27,
        0.32,
        35,
        3
      ],
      5: [
        0.3,
        0.36,
        40,
        3
      ]
    }
  },
  23058: {
    name: '邂逅于下一个花季',
    skillName: '遐想',
    desc: '使装备者的暴击伤害提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，能量恢复效率提高<color=#f29e38ff><unbreak>#4[f1]%</unbreak></color>。装备者的能量上限大于<unbreak>#5[i]</unbreak>时，每超出<unbreak>10</unbreak>点能量上限额外使能量恢复效率提高<unbreak>#6[f1]%</unbreak>，最多计入<unbreak>#7[i]</unbreak>点超出的能量上限。装备者施放欢愉技时，使敌方全体受到的伤害提高<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合，同类效果无法叠加。',
    path: 'Elation',
    levels: {
      1: [
        0.6,
        0.15,
        2,
        0.1,
        120,
        0.003,
        360
      ],
      2: [
        0.75,
        0.1875,
        2,
        0.115,
        120,
        0.003,
        360
      ],
      3: [
        0.9,
        0.225,
        2,
        0.13,
        120,
        0.003,
        360
      ],
      4: [
        1.05,
        0.2625,
        2,
        0.145,
        120,
        0.003,
        360
      ],
      5: [
        1.2,
        0.3,
        2,
        0.16,
        120,
        0.003,
        360
      ]
    }
  },
  23059: {
    name: '灼尽炼狱的新骸',
    skillName: '淬炼',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，装备者回合开始时，固定恢复<unbreak>#2[i]</unbreak>点能量，该效果每个波次可触发1次。装备者施放战技攻击后，使目标陷入【炼狱】状态，持续<unbreak>#3[i]</unbreak>回合，【炼狱】状态下目标受到的暴击伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，受到来自装备者的暴击伤害额外提高<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>。',
    path: 'Warlock',
    levels: {
      1: [
        0.3,
        20,
        2,
        0.3,
        0.3
      ],
      2: [
        0.375,
        20,
        2,
        0.375,
        0.375
      ],
      3: [
        0.45,
        20,
        2,
        0.45,
        0.45
      ],
      4: [
        0.525,
        20,
        2,
        0.525,
        0.525
      ],
      5: [
        0.6,
        20,
        2,
        0.6,
        0.6
      ]
    }
  },
  23060: {
    name: '当一颗星照亮夜空',
    skillName: '初愿',
    desc: '使装备者造成伤害时无视目标<color=#f29e38ff><unbreak>#7[i]%</unbreak></color>的防御力。当装备者施放助战技时，恢复<unbreak>#2[i]</unbreak>点能量并获得【启航】，持续2回合，最多叠加<unbreak>#3[i]</unbreak>层。每层【启航】使助战技伤害提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，【启航】达到<unbreak>#5[i]</unbreak>层时，每层【启航】使终结技伤害提高<color=#f29e38ff><unbreak>#6[i]%</unbreak></color>。',
    path: 'Mage',
    levels: {
      1: [
        0,
        6,
        3,
        0.2,
        3,
        0.2,
        0.32
      ],
      2: [
        0,
        6,
        3,
        0.25,
        3,
        0.25,
        0.36
      ],
      3: [
        0,
        6,
        3,
        0.3,
        3,
        0.3,
        0.4
      ],
      4: [
        0,
        6,
        3,
        0.35,
        3,
        0.35,
        0.44
      ],
      5: [
        0,
        6,
        3,
        0.4,
        3,
        0.4,
        0.48
      ]
    }
  },
  23061: {
    name: '星火悄然闪耀',
    skillName: '萌芽',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。我方任意角色在自身同一回合内累计消耗大于等于<unbreak>#3[i]</unbreak>点战技点时，装备者获得【闪耀王冠】，持续<unbreak>#4[i]</unbreak>回合。装备者持有【闪耀王冠】时，我方全体造成的伤害无视目标<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>的防御力，装备者造成的战技伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，同类效果无法叠加。',
    path: 'Mage',
    levels: {
      1: [
        0.18,
        0.72,
        4,
        3,
        0.2
      ],
      2: [
        0.21,
        0.84,
        4,
        3,
        0.24
      ],
      3: [
        0.24,
        0.96,
        4,
        3,
        0.28
      ],
      4: [
        0.27,
        1.08,
        4,
        3,
        0.32
      ],
      5: [
        0.3,
        1.2,
        4,
        3,
        0.36
      ]
    }
  },
  23062: {
    name: '所见即我',
    skillName: '随心',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，能量恢复效率提高<color=#f29e38ff><unbreak>#2[f1]%</unbreak></color>。装备者施放终结技时，每消耗1点能量值，使本次造成的终结技伤害提高<color=#f29e38ff><unbreak>#3[f2]%</unbreak></color>，最多提高<color=#f29e38ff><unbreak>#6[i]%</unbreak></color>。装备者进入战斗或施放终结技时，使装备者获得【王之娱乐】，持续<unbreak>#4[i]</unbreak>回合。当装备者持有【王之娱乐】时，我方全体暴击伤害提高<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>，同类效果无法叠加。',
    path: 'Warrior',
    levels: {
      1: [
        0.18,
        0.1,
        0.002,
        3,
        0.24,
        0.72
      ],
      2: [
        0.21,
        0.125,
        0.0025,
        3,
        0.3,
        0.9
      ],
      3: [
        0.24,
        0.15,
        0.003,
        3,
        0.36,
        1.08
      ],
      4: [
        0.27,
        0.175,
        0.0035,
        3,
        0.42,
        1.26
      ],
      5: [
        0.3,
        0.2,
        0.004,
        3,
        0.48,
        1.44
      ]
    }
  },
  23063: {
    name: '你将起身歌唱',
    skillName: '即兴',
    desc: '使装备者的生命上限提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，装备者施放终结技后，为我方恢复1点战技点。进入战斗时，使装备者的行动提前<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，并使装备者获得【新声】，持续<unbreak>#4[i]</unbreak>回合。装备者持有【新声】时，我方全体速度提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。',
    path: 'Memory',
    levels: {
      1: [
        0.3,
        0.3,
        0.2,
        2
      ],
      2: [
        0.375,
        0.325,
        0.25,
        2
      ],
      3: [
        0.45,
        0.35,
        0.3,
        2
      ],
      4: [
        0.525,
        0.375,
        0.35,
        2
      ],
      5: [
        0.6,
        0.4,
        0.4,
        2
      ]
    }
  },
  23064: {
    name: '向浪花掷下盛夏',
    skillName: '浪行',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。装备者施放欢愉技时，获得【风口】，【风口】使装备者的速度提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>。若施放的欢愉技与上一次施放的欢愉技不同，则额外获得【潮流】，【潮流】使装备者的欢愉度提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。\\n每个波次开始时或装备者每施放<unbreak>#4[i]</unbreak>次欢愉技后，恢复1个战技点。',
    path: 'Elation',
    levels: {
      1: [
        0.18,
        0.24,
        0.4,
        3
      ],
      2: [
        0.21,
        0.28,
        0.55,
        3
      ],
      3: [
        0.24,
        0.32,
        0.7,
        3
      ],
      4: [
        0.27,
        0.36,
        0.85,
        3
      ],
      5: [
        0.3,
        0.4,
        1,
        3
      ]
    }
  },
  23065: {
    name: '当第一声「阿哈」响起',
    skillName: '即兴巡演',
    desc: '使装备者的基础速度提高<color=#f29e38ff><unbreak>#1[i]</unbreak></color>点。对我方其他单体施放战技时，获得<color=#f29e38ff><unbreak>#2[i]</unbreak></color>个笑点，该效果每间隔<unbreak>#3[i]</unbreak>回合最多触发1次，随后使我方全体在本场战斗中造成伤害时无视敌方目标<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>的防御力，该效果无法叠加。',
    path: 'Elation',
    levels: {
      1: [
        12,
        10,
        1,
        0.16
      ],
      2: [
        14,
        12,
        1,
        0.18
      ],
      3: [
        16,
        14,
        1,
        0.2
      ],
      4: [
        18,
        16,
        1,
        0.22
      ],
      5: [
        20,
        18,
        1,
        0.24
      ]
    }
  },
  24000: {
    name: '记一位星神的陨落',
    skillName: '扑火',
    desc: '当装备者施放攻击时，使装备者本场战斗中的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，该效果最多叠加<unbreak>#2[i]</unbreak>层。当装备者击破敌方目标弱点后，造成的伤害提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>，持续<unbreak>#4[i]</unbreak>回合。',
    path: 'Warrior',
    levels: {
      1: [
        0.08,
        4,
        0.12,
        2
      ],
      2: [
        0.1,
        4,
        0.15,
        2
      ],
      3: [
        0.12,
        4,
        0.18,
        2
      ],
      4: [
        0.14,
        4,
        0.21,
        2
      ],
      5: [
        0.16,
        4,
        0.24,
        2
      ]
    }
  },
  24001: {
    name: '星海巡航',
    skillName: '猎逐',
    desc: '使装备者的暴击率提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，装备者对生命值百分比小于等于<unbreak>#2[i]%</unbreak>的敌方目标暴击率额外提高<color=#f29e38ff><unbreak>#3[i]%</unbreak></color>。当装备者消灭敌方目标后，攻击力提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，持续<unbreak>#5[i]</unbreak>回合。',
    path: 'Rogue',
    levels: {
      1: [
        0.08,
        0.5,
        0.08,
        0.2,
        2
      ],
      2: [
        0.1,
        0.5,
        0.1,
        0.25,
        2
      ],
      3: [
        0.12,
        0.5,
        0.12,
        0.3,
        2
      ],
      4: [
        0.14,
        0.5,
        0.14,
        0.35,
        2
      ],
      5: [
        0.16,
        0.5,
        0.16,
        0.4,
        2
      ]
    }
  },
  24002: {
    name: '记忆的质料',
    skillName: '珍存',
    desc: '使装备者的效果抵抗提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>，当装备者受到攻击后，如果自身未持有护盾，则获得1个等同于装备者<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>生命上限的护盾，持续<unbreak>#3[i]</unbreak>回合。该效果每<unbreak>#4[i]</unbreak>回合只能触发1次。如果装备者持有护盾，则使自身受到的伤害降低<color=#f29e38ff><unbreak>#5[i]%</unbreak></color>。',
    path: 'Knight',
    levels: {
      1: [
        0.08,
        0.16,
        2,
        3,
        0.12
      ],
      2: [
        0.1,
        0.2,
        2,
        3,
        0.15
      ],
      3: [
        0.12,
        0.24,
        2,
        3,
        0.18
      ],
      4: [
        0.14,
        0.28,
        2,
        3,
        0.21
      ],
      5: [
        0.16,
        0.32,
        2,
        3,
        0.24
      ]
    }
  },
  24003: {
    name: '孤独的疗愈',
    skillName: '混沌灵药',
    desc: '使装备者的击破特攻提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者施放终结技时，使装备者造成的持续伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。陷入装备者施加的持续伤害效果的敌方目标被消灭时，装备者恢复<color=#f29e38ff><unbreak>#4[f1]</unbreak></color>点能量。',
    path: 'Warlock',
    levels: {
      1: [
        0.2,
        0.24,
        2,
        4
      ],
      2: [
        0.25,
        0.3,
        2,
        4.5
      ],
      3: [
        0.3,
        0.36,
        2,
        5
      ],
      4: [
        0.35,
        0.42,
        2,
        5.5
      ],
      5: [
        0.4,
        0.48,
        2,
        6
      ]
    }
  },
  24004: {
    name: '不息的演算',
    skillName: '无界之思',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。施放攻击后，每击中一名敌方目标，使攻击力额外提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，该效果最多叠加5次，持续至下次攻击后，若击中大于等于<unbreak>#3[i]</unbreak>名敌方目标，使自身速度提高<color=#f29e38ff><unbreak>#4[i]%</unbreak></color>，持续<unbreak>#5[i]</unbreak>回合。',
    path: 'Mage',
    levels: {
      1: [
        0.08,
        0.04,
        3,
        0.08,
        1
      ],
      2: [
        0.09,
        0.05,
        3,
        0.1,
        1
      ],
      3: [
        0.1,
        0.06,
        3,
        0.12,
        1
      ],
      4: [
        0.11,
        0.07,
        3,
        0.14,
        1
      ],
      5: [
        0.12,
        0.08,
        3,
        0.16,
        1
      ]
    }
  },
  24005: {
    name: '记忆永不落幕',
    skillName: '收取',
    desc: '使装备者的速度提高<color=#f29e38ff><unbreak>#1[f1]%</unbreak></color>。装备者施放战技后，使我方全体造成的伤害提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Memory',
    levels: {
      1: [
        0.06,
        0.08,
        3
      ],
      2: [
        0.075,
        0.1,
        3
      ],
      3: [
        0.09,
        0.12,
        3
      ],
      4: [
        0.105,
        0.14,
        3
      ],
      5: [
        0.12,
        0.16,
        3
      ]
    }
  },
  24006: {
    name: '欢愉满溢祝福',
    skillName: '开场',
    desc: '使装备者的攻击力提高<color=#f29e38ff><unbreak>#1[i]%</unbreak></color>。当装备者对我方单体角色施放战技或终结技后，使目标欢愉度提高<color=#f29e38ff><unbreak>#2[i]%</unbreak></color>，持续<unbreak>#3[i]</unbreak>回合。',
    path: 'Elation',
    levels: {
      1: [
        0.2,
        0.12,
        2
      ],
      2: [
        0.25,
        0.15,
        2
      ],
      3: [
        0.3,
        0.18,
        2
      ],
      4: [
        0.35,
        0.21,
        2
      ],
      5: [
        0.4,
        0.24,
        2
      ]
    }
  }
};

/** 取叠影参数（refinement clamp 1~5；未知光锥返回 null） */
export function lcParams(id: string, refinement: number): number[] | null {
  const lc = LIGHTCONE_SKILLS[id];
  if (!lc) return null;
  const r = Math.min(5, Math.max(1, Math.round(refinement)));
  return lc.levels[String(r)] ?? lc.levels['1'] ?? null;
}

/** 取光锥命途（未知光锥返回 undefined） */
export function lcPath(id: string): string | undefined {
  return LIGHTCONE_SKILLS[id]?.path;
}
