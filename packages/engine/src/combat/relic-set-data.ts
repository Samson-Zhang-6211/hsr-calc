/**
 * 遗器套装效果表（本地 data/relicsets 4.6.51 提取：zh.require_num.2/4）。
 * desc 保留原始参数化文本（含 <unbreak>#N[i]%</unbreak>），param_list 为比值口径（0.1=10%）。
 * 由 scripts/gen-relic-set-data.mjs 生成，勿手改；data 重爬后重跑本脚本。
 */

export interface RelicSetEffect {
  id: string;
  name: string;
  /** 洞窟 4 件套（位面套为 null） */
  fourPiece: boolean;
  twoPiece?: { desc: string; params: number[] };
  fourPieceDesc?: string;
  fourPieceParams?: number[];
}

export const RELIC_SETS: Record<string, RelicSetEffect> = {
  101: {
    id: '101',
    name: '云无留迹的过客',
    fourPiece: true,
    twoPiece: {
      desc: '治疗量提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '在战斗开始时，立即为我方恢复1个战技点。',
    fourPieceParams: []
  },
  102: {
    id: '102',
    name: '野穗伴行的快枪手',
    fourPiece: true,
    twoPiece: {
      desc: '攻击力提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.12
      ]
    },
    fourPieceDesc: '使装备者的速度提高<unbreak>#1[i]%</unbreak>，普攻造成的伤害提高<unbreak>#2[i]%</unbreak>。',
    fourPieceParams: [
      0.06,
      0.1
    ]
  },
  103: {
    id: '103',
    name: '净庭教宗的圣骑士',
    fourPiece: true,
    twoPiece: {
      desc: '防御力提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.15
      ]
    },
    fourPieceDesc: '使装备者提供的护盾量提高<unbreak>#1[i]%</unbreak>。',
    fourPieceParams: [
      0.2
    ]
  },
  104: {
    id: '104',
    name: '密林卧雪的猎人',
    fourPiece: true,
    twoPiece: {
      desc: '冰属性伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '当装备者施放终结技时，暴击伤害提高<unbreak>#1[i]%</unbreak>，持续<unbreak>#2[i]</unbreak>回合。',
    fourPieceParams: [
      0.25,
      2
    ]
  },
  105: {
    id: '105',
    name: '街头出身的拳王',
    fourPiece: true,
    twoPiece: {
      desc: '物理属性伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '当装备者施放攻击或受到攻击后，其在本场战斗中攻击力提高<unbreak>#1[i]%</unbreak>，最多叠加<unbreak>#2[i]</unbreak>层。',
    fourPieceParams: [
      0.05,
      5
    ]
  },
  106: {
    id: '106',
    name: '戍卫风雪的铁卫',
    fourPiece: true,
    twoPiece: {
      desc: '受到伤害降低<unbreak>#1[i]%</unbreak>。',
      params: [
        0.08
      ]
    },
    fourPieceDesc: '回合开始时，如果装备者当前生命值百分比小于等于<unbreak>#1[i]%</unbreak>，则回复等同于自身生命上限<unbreak>#2[i]%</unbreak>的生命值，并恢复<unbreak>#3[i]</unbreak>点能量。',
    fourPieceParams: [
      0.5,
      0.08,
      5
    ]
  },
  107: {
    id: '107',
    name: '熔岩锻铸的火匠',
    fourPiece: true,
    twoPiece: {
      desc: '火属性伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '使装备者战技造成的伤害提高<unbreak>#1[i]%</unbreak>，并使施放终结技后的下一次攻击造成的火属性伤害提高<unbreak>#2[i]%</unbreak>。',
    fourPieceParams: [
      0.12,
      0.12
    ]
  },
  108: {
    id: '108',
    name: '繁星璀璨的天才',
    fourPiece: true,
    twoPiece: {
      desc: '量子属性伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '当装备者对敌方目标造成伤害时，无视其<unbreak>#1[i]%</unbreak>的防御力。若目标拥有量子属性弱点，额外无视其<unbreak>#2[i]%</unbreak>的防御力。',
    fourPieceParams: [
      0.1,
      0.1
    ]
  },
  109: {
    id: '109',
    name: '激奏雷电的乐队',
    fourPiece: true,
    twoPiece: {
      desc: '雷属性伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '当装备者施放战技时，使装备者的攻击力提高<unbreak>#1[i]%</unbreak>，持续<unbreak>#2[i]</unbreak>回合。',
    fourPieceParams: [
      0.2,
      1
    ]
  },
  110: {
    id: '110',
    name: '晨昏交界的翔鹰',
    fourPiece: true,
    twoPiece: {
      desc: '风属性伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '当装备者施放终结技后，使其行动提前<unbreak>#1[i]%</unbreak>。',
    fourPieceParams: [
      0.25
    ]
  },
  111: {
    id: '111',
    name: '流星追迹的怪盗',
    fourPiece: true,
    twoPiece: {
      desc: '击破特攻提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.16
      ]
    },
    fourPieceDesc: '使装备者的击破特攻提高<unbreak>#1[i]%</unbreak>。当装备者击破敌方目标弱点后，恢复<unbreak>#2[i]</unbreak>点能量。',
    fourPieceParams: [
      0.16,
      3
    ]
  },
  112: {
    id: '112',
    name: '盗匪荒漠的废土客',
    fourPiece: true,
    twoPiece: {
      desc: '虚数属性伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '装备者对陷入负面效果的敌方目标造成伤害时暴击率提高<unbreak>#1[i]%</unbreak>，对陷入禁锢状态的敌方目标造成伤害时暴击伤害提高<unbreak>#2[i]%</unbreak>。',
    fourPieceParams: [
      0.1,
      0.2
    ]
  },
  113: {
    id: '113',
    name: '宝命长存的莳者',
    fourPiece: true,
    twoPiece: {
      desc: '生命上限提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.12
      ]
    },
    fourPieceDesc: '当装备者受到攻击或被我方目标消耗生命值后，暴击率提高<unbreak>#1[i]%</unbreak>，持续<unbreak>#2[i]</unbreak>回合，该效果最多叠加<unbreak>#3[i]</unbreak>层。',
    fourPieceParams: [
      0.08,
      2,
      2
    ]
  },
  114: {
    id: '114',
    name: '骇域漫游的信使',
    fourPiece: true,
    twoPiece: {
      desc: '速度提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.06
      ]
    },
    fourPieceDesc: '当装备者对我方目标施放终结技时，我方全体速度提高<unbreak>#1[i]%</unbreak>，持续<unbreak>#2[i]</unbreak>回合，该效果无法叠加。',
    fourPieceParams: [
      0.12,
      1
    ]
  },
  115: {
    id: '115',
    name: '毁烬焚骨的大公',
    fourPiece: true,
    twoPiece: {
      desc: '追加攻击造成的伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.2
      ]
    },
    fourPieceDesc: '装备者施放追加攻击时，根据追加攻击造成伤害的次数，每次造成伤害时使装备者的攻击力提高<unbreak>#1[i]%</unbreak>，最多叠加<unbreak>#2[i]</unbreak>次，持续<unbreak>#3[i]</unbreak>回合。该效果在装备者下一次施放追加攻击时移除。',
    fourPieceParams: [
      0.06,
      8,
      3
    ]
  },
  116: {
    id: '116',
    name: '幽锁深牢的系囚',
    fourPiece: true,
    twoPiece: {
      desc: '攻击力提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.12
      ]
    },
    fourPieceDesc: '敌方目标每承受1个持续伤害效果，装备者对其造成伤害时就无视其<unbreak>#1[i]%</unbreak>的防御力，最多计入<unbreak>#2[i]</unbreak>个持续伤害效果。',
    fourPieceParams: [
      0.06,
      3
    ]
  },
  117: {
    id: '117',
    name: '死水深潜的先驱',
    fourPiece: true,
    twoPiece: {
      desc: '对受负面状态影响的敌人造成的伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.12
      ]
    },
    fourPieceDesc: '暴击率提高<unbreak>#1[i]%</unbreak>，装备者对陷入不少于<unbreak>#4[i]</unbreak>/<unbreak>#5[i]</unbreak>个负面效果的敌方目标造成的暴击伤害提高<unbreak>#2[i]%</unbreak>/<unbreak>#3[i]%</unbreak>。装备者对敌方目标施加负面效果后，上述效果提高<unbreak>100%</unbreak>，持续<unbreak>#6[i]</unbreak>回合。',
    fourPieceParams: [
      0.04,
      0.08,
      0.12,
      2,
      3,
      1
    ]
  },
  118: {
    id: '118',
    name: '机心戏梦的钟表匠',
    fourPiece: true,
    twoPiece: {
      desc: '击破特攻提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.16
      ]
    },
    fourPieceDesc: '当装备者对我方目标施放终结技时，我方全体击破特攻提高<unbreak>#1[i]%</unbreak>，持续<unbreak>#2[i]</unbreak>回合，该效果无法叠加。',
    fourPieceParams: [
      0.3,
      2
    ]
  },
  119: {
    id: '119',
    name: '荡除蠹灾的铁骑',
    fourPiece: true,
    twoPiece: {
      desc: '击破特攻提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.16
      ]
    },
    fourPieceDesc: '当装备者的击破特攻大于等于<unbreak>#1[i]%</unbreak>时，对敌方目标造成的击破伤害无视其<unbreak>#3[i]%</unbreak>的防御力。当装备者的击破特攻大于等于<unbreak>#2[i]%</unbreak>时，对敌方目标造成的超击破伤害额外无视其<unbreak>#4[i]%</unbreak>的防御力。',
    fourPieceParams: [
      1.5,
      2.5,
      0.1,
      0.15
    ]
  },
  120: {
    id: '120',
    name: '风举云飞的勇烈',
    fourPiece: true,
    twoPiece: {
      desc: '攻击力提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.12
      ]
    },
    fourPieceDesc: '使装备者的暴击率提高<unbreak>#1[i]%</unbreak>，装备者施放追加攻击时，使终结技造成的伤害提高<unbreak>#2[i]%</unbreak>，持续<unbreak>#3[i]</unbreak>回合。',
    fourPieceParams: [
      0.06,
      0.36,
      1
    ]
  },
  121: {
    id: '121',
    name: '重循苦旅的司铎',
    fourPiece: true,
    twoPiece: {
      desc: '速度提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.06
      ]
    },
    fourPieceDesc: '对我方单体目标施放战技或终结技时，使技能目标的暴击伤害提高<unbreak>#1[i]%</unbreak>，持续<unbreak>#2[i]</unbreak>回合，该效果最多叠加<unbreak>#3[i]</unbreak>次。',
    fourPieceParams: [
      0.18,
      2,
      2
    ]
  },
  122: {
    id: '122',
    name: '识海迷坠的学者',
    fourPiece: true,
    twoPiece: {
      desc: '暴击率提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.08
      ]
    },
    fourPieceDesc: '战技和终结技造成的伤害提高<unbreak>#1[i]%</unbreak>，施放终结技后，下一次施放战技时造成的伤害额外提高<unbreak>#2[i]%</unbreak>。',
    fourPieceParams: [
      0.2,
      0.25
    ]
  },
  123: {
    id: '123',
    name: '凯歌祝捷的英豪',
    fourPiece: true,
    twoPiece: {
      desc: '攻击力提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.12
      ]
    },
    fourPieceDesc: '装备者的忆灵在场时，装备者的速度提高<unbreak>#1[i]%</unbreak>，装备者的忆灵攻击时，装备者和忆灵的暴击伤害提高<unbreak>#2[i]%</unbreak>，持续<unbreak>#3[i]</unbreak>回合。',
    fourPieceParams: [
      0.06,
      0.3,
      2
    ]
  },
  124: {
    id: '124',
    name: '哀歌覆国的诗人',
    fourPiece: true,
    twoPiece: {
      desc: '量子属性伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '使装备者的速度降低<unbreak>#6[i]%</unbreak>。进入战斗前，若装备者的速度小于<unbreak>#2[i]</unbreak>/<unbreak>#3[i]</unbreak>，使装备者的暴击率提高<unbreak>#4[i]%</unbreak>/<unbreak>#5[i]%</unbreak>。该效果同时对装备者的忆灵生效。',
    fourPieceParams: [
      -0.08,
      110,
      95,
      0.2,
      0.32,
      0.08
    ]
  },
  125: {
    id: '125',
    name: '烈阳惊雷的女武神',
    fourPiece: true,
    twoPiece: {
      desc: '速度提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.06
      ]
    },
    fourPieceDesc: '当装备者及其忆灵为装备者及其忆灵以外的我方目标提供治疗后，使装备者获得【甘霖】，每回合最多触发1次，持续<unbreak>#3[i]</unbreak>回合。装备者持有【甘霖】时，速度提高<unbreak>#1[i]%</unbreak>，我方全体暴击伤害提高<unbreak>#2[i]%</unbreak>，该效果无法叠加。',
    fourPieceParams: [
      0.06,
      0.15,
      2
    ]
  },
  126: {
    id: '126',
    name: '恶海逐波的船长',
    fourPiece: true,
    twoPiece: {
      desc: '暴击伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.16
      ]
    },
    fourPieceDesc: '装备者成为其他我方目标的技能目标时，获得1层【助力】，最多叠加<unbreak>#1[i]</unbreak>层。施放终结技时，若持有<unbreak>#1[i]</unbreak>层【助力】，消耗所有【助力】，使装备者攻击力提高<unbreak>#2[i]%</unbreak>，持续<unbreak>#3[i]</unbreak>回合。',
    fourPieceParams: [
      2,
      0.48,
      1
    ]
  },
  127: {
    id: '127',
    name: '再创天地的救世主',
    fourPiece: true,
    twoPiece: {
      desc: '暴击率提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.08
      ]
    },
    fourPieceDesc: '装备者施放普攻或战技后，若装备者的忆灵在场，使装备者及其忆灵生命上限提高<unbreak>#1[i]%</unbreak>，我方全体造成的伤害提高<unbreak>#2[i]%</unbreak>，持续至装备者下次施放普攻或战技后。',
    fourPieceParams: [
      0.24,
      0.15
    ]
  },
  128: {
    id: '128',
    name: '自匿星芒的隐士',
    fourPiece: true,
    twoPiece: {
      desc: '提供的护盾量提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.1
      ]
    },
    fourPieceDesc: '使装备者提供的护盾量提高<unbreak>#1[i]%</unbreak>，我方目标持有装备者提供的护盾时，暴击伤害提高<unbreak>#2[i]%</unbreak>。',
    fourPieceParams: [
      0.12,
      0.15
    ]
  },
  129: {
    id: '129',
    name: '闪耀功勋的魔法少女',
    fourPiece: true,
    twoPiece: {
      desc: '暴击伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.16
      ]
    },
    fourPieceDesc: '装备者及其忆灵造成的欢愉伤害无视目标<unbreak>#1[i]%</unbreak>的防御力，我方每累计获得<unbreak>#2[i]</unbreak>点笑点，造成的欢愉伤害额外无视目标<unbreak>#3[i]%</unbreak>的防御力，最多叠加<unbreak>#4[i]</unbreak>层。',
    fourPieceParams: [
      0.1,
      5,
      0.01,
      10
    ]
  },
  130: {
    id: '130',
    name: '应天涉远的卜者',
    fourPiece: true,
    twoPiece: {
      desc: '速度提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.06
      ]
    },
    fourPieceDesc: '进入战斗前，若装备者的速度大于等于<unbreak>#1[i]</unbreak>/<unbreak>#2[i]</unbreak>，使装备者的暴击率提高<unbreak>#3[i]%</unbreak>/<unbreak>#4[i]%</unbreak>。装备者每场战斗首次施放欢愉技时，使我方全体欢愉度提高<unbreak>#5[i]%</unbreak>，该效果无法叠加。',
    fourPieceParams: [
      120,
      160,
      0.1,
      0.18,
      0.1
    ]
  },
  131: {
    id: '131',
    name: '星如我见的领航员',
    fourPiece: true,
    twoPiece: {
      desc: '攻击力提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.12
      ]
    },
    fourPieceDesc: '装备者进入战斗时/施放战技时，使战技和终结技造成的伤害提高<unbreak>#1[i]%</unbreak>，最多叠加<unbreak>#2[i]</unbreak>层，装备者回合开始时/施放终结技后，移除<unbreak>#3[i]</unbreak>层该效果。',
    fourPieceParams: [
      0.18,
      3,
      1
    ]
  },
  132: {
    id: '132',
    name: '叩问天工的名冶',
    fourPiece: true,
    twoPiece: {
      desc: '生命上限提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.12
      ]
    },
    fourPieceDesc: '装备者对防御力降低状态的敌方目标造成的暴击伤害提高<unbreak>#1[i]%</unbreak>。装备者对敌方目标施加防御力降低状态后，使我方全体获得【助燃】，持续<unbreak>#2[i]</unbreak>回合，该效果无法叠加，持有【助燃】的我方目标造成的伤害提高<unbreak>#3[i]%</unbreak>。该效果在装备者施放攻击后可再次触发。',
    fourPieceParams: [
      0.28,
      2,
      0.15
    ]
  },
  133: {
    id: '133',
    name: '戏梦点星的伶人',
    fourPiece: true,
    twoPiece: {
      desc: '速度提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.06
      ]
    },
    fourPieceDesc: '当装备者对我方其他单体目标施放战技或终结技时，使技能目标的欢愉度提高<unbreak>#1[i]%</unbreak>，持续<unbreak>#2[i]</unbreak>回合，若装备者持有的好活当赏大于等于<unbreak>#3[i]</unbreak>点，则额外使我方全体目标的暴击伤害提高<unbreak>#4[i]%</unbreak>，持续<unbreak>#5[i]</unbreak>回合。',
    fourPieceParams: [
      0.16,
      3,
      10,
      0.12,
      3
    ]
  },
  134: {
    id: '134',
    name: '贪噬禁果的异端',
    fourPiece: true,
    twoPiece: {
      desc: '暴击伤害提高<unbreak>#1[i]%</unbreak>。',
      params: [
        0.16
      ]
    },
    fourPieceDesc: '使装备者普攻造成的伤害提高<unbreak>#1[i]%</unbreak>。当装备者施放普攻时，使装备者的攻击力提高<unbreak>#2[i]%</unbreak>，持续<unbreak>#3[i]</unbreak>回合。',
    fourPieceParams: [
      0.36,
      0.2,
      2
    ]
  },
  301: {
    id: '301',
    name: '太空封印站',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的攻击力提高<unbreak>#1[i]%</unbreak>。当装备者的速度大于等于<unbreak>#2[i]</unbreak>时，攻击力额外提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.12,
        120,
        0.12
      ]
    }
  },
  302: {
    id: '302',
    name: '不老者的仙舟',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的生命上限提高<unbreak>#1[i]%</unbreak>。当装备者的速度大于等于<unbreak>#2[i]</unbreak>时，我方全体攻击力提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.12,
        120,
        0.08
      ]
    }
  },
  303: {
    id: '303',
    name: '泛银河商业公司',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的效果命中提高<unbreak>#1[i]%</unbreak>。同时提高装备者等同于当前效果命中<unbreak>#2[i]%</unbreak>的攻击力，最多提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.1,
        0.25,
        0.25
      ]
    }
  },
  304: {
    id: '304',
    name: '筑城者的贝洛伯格',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的防御力提高<unbreak>#1[i]%</unbreak>。当装备者的效果命中大于等于<unbreak>#2[i]%</unbreak>时，防御力额外提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.15,
        0.5,
        0.15
      ]
    }
  },
  305: {
    id: '305',
    name: '星体差分机',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的暴击伤害提高<unbreak>#1[i]%</unbreak>。当装备者的暴击伤害大于等于<unbreak>#2[i]%</unbreak>时，进入战斗后装备者的暴击率提高<unbreak>#3[i]%</unbreak>，持续到施放首次攻击后结束。',
      params: [
        0.16,
        1.2,
        0.6
      ]
    }
  },
  306: {
    id: '306',
    name: '停转的萨尔索图',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的暴击率提高<unbreak>#1[i]%</unbreak>。当装备者当前暴击率大于等于<unbreak>#2[i]%</unbreak>时，终结技和追加攻击造成的伤害提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.08,
        0.5,
        0.15
      ]
    }
  },
  307: {
    id: '307',
    name: '盗贼公国塔利亚',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的击破特攻提高<unbreak>#1[i]%</unbreak>。当装备者的速度大于等于<unbreak>#2[i]</unbreak>时，击破特攻额外提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.16,
        145,
        0.2
      ]
    }
  },
  308: {
    id: '308',
    name: '生命的翁瓦克',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的能量恢复效率提高<unbreak>#1[i]%</unbreak>。当装备者的速度大于等于<unbreak>#2[i]</unbreak>时，进入战斗时立刻使行动提前<unbreak>#3[i]%</unbreak>。',
      params: [
        0.05,
        120,
        0.4
      ]
    }
  },
  309: {
    id: '309',
    name: '繁星竞技场',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的暴击率提高<unbreak>#1[i]%</unbreak>。当装备者的当前暴击率大于等于<unbreak>#2[i]%</unbreak>时，普攻和战技造成的伤害提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.08,
        0.7,
        0.2
      ]
    }
  },
  310: {
    id: '310',
    name: '折断的龙骨',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的效果抵抗提高<unbreak>#1[i]%</unbreak>。当装备者的效果抵抗大于等于<unbreak>#2[i]%</unbreak>时，我方全体暴击伤害提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.1,
        0.3,
        0.1
      ]
    }
  },
  311: {
    id: '311',
    name: '苍穹战线格拉默',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的攻击力提高<unbreak>#1[i]%</unbreak>。当装备者的速度大于等于<unbreak>#2[i]</unbreak>/<unbreak>#3[i]</unbreak>时，使装备者造成的伤害提高<unbreak>#4[i]%</unbreak>/<unbreak>#5[i]%</unbreak>。',
      params: [
        0.12,
        135,
        160,
        0.12,
        0.18
      ]
    }
  },
  312: {
    id: '312',
    name: '梦想之地匹诺康尼',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的能量恢复效率提高<unbreak>#1[i]%</unbreak>。使队伍中与装备者属性相同的我方其他角色造成的伤害提高<unbreak>#2[i]%</unbreak>。',
      params: [
        0.05,
        0.1
      ]
    }
  },
  313: {
    id: '313',
    name: '无主荒星茨冈尼亚',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的暴击率提高<unbreak>#3[i]%</unbreak>。当敌方目标被消灭时，装备者暴击伤害提高<unbreak>#1[i]%</unbreak>，最多叠加<unbreak>#2[i]</unbreak>层。',
      params: [
        0.04,
        10,
        0.04
      ]
    }
  },
  314: {
    id: '314',
    name: '出云显世与高天神国',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的攻击力提高<unbreak>#1[i]%</unbreak>。进入战斗时，若至少存在一名与装备者命途相同的队友，装备者的暴击率提高<unbreak>#2[i]%</unbreak>。',
      params: [
        0.12,
        0.12
      ]
    }
  },
  315: {
    id: '315',
    name: '奔狼的都蓝王朝',
    fourPiece: false,
    twoPiece: {
      desc: '我方角色施放追加攻击时，装备者获得一层【功勋】，最多叠加<unbreak>#1[i]</unbreak>层，每层【功勋】使装备者追加攻击造成的伤害提高<unbreak>#2[i]%</unbreak>，叠满<unbreak>#1[i]</unbreak>层时，额外使装备者的暴击伤害提高<unbreak>#3[i]%</unbreak>。',
      params: [
        5,
        0.05,
        0.25
      ]
    }
  },
  316: {
    id: '316',
    name: '劫火莲灯铸炼宫',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的速度提高<unbreak>#1[i]%</unbreak>。当装备者击中拥有火属性弱点的敌方目标时，击破特攻提高<unbreak>#2[i]%</unbreak>，持续<unbreak>#3[i]</unbreak>回合。',
      params: [
        0.06,
        0.4,
        1
      ]
    }
  },
  317: {
    id: '317',
    name: '沉陆海域露莎卡',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的能量恢复效率提高<unbreak>#1[i]%</unbreak>，如果装备者不是编队中的第一位角色，使编队中的第一位角色攻击力提高<unbreak>#2[i]%</unbreak>。',
      params: [
        0.05,
        0.12
      ]
    }
  },
  318: {
    id: '318',
    name: '奇想蕉乐园',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的暴击伤害提高<unbreak>#1[i]%</unbreak>，当存在装备者召唤的目标时，暴击伤害额外提高<unbreak>#2[i]%</unbreak>。',
      params: [
        0.16,
        0.32
      ]
    }
  },
  319: {
    id: '319',
    name: '谧宁拾骨地',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的生命上限提高<unbreak>#1[i]%</unbreak>。当装备者的生命上限大于等于<unbreak>#2[i]</unbreak>点时，使装备者及其忆灵的暴击伤害提高<unbreak>#3[i]%</unbreak>。',
      params: [
        0.12,
        5000,
        0.28
      ]
    }
  },
  320: {
    id: '320',
    name: '渊思寂虑的巨树',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的速度提高<unbreak>#1[i]%</unbreak>。当装备者的速度大于等于<unbreak>#2[i]</unbreak>/<unbreak>#3[i]</unbreak>时，使装备者及其忆灵的治疗量提高<unbreak>#4[i]%</unbreak>/<unbreak>#5[i]%</unbreak>。',
      params: [
        0.06,
        135,
        180,
        0.12,
        0.2
      ]
    }
  },
  321: {
    id: '321',
    name: '妖精织梦的乐园',
    fourPiece: false,
    twoPiece: {
      desc: '队伍中当前在场的我方目标数量不等于4时，每多/少1名我方目标，使装备者及其忆灵造成的伤害提高<unbreak>#1[i]%</unbreak>/<unbreak>#2[i]%</unbreak>，最多叠加<unbreak>#3[i]</unbreak>/<unbreak>#4[i]</unbreak>层。',
      params: [
        0.09,
        0.12,
        4,
        3
      ]
    }
  },
  322: {
    id: '322',
    name: '沉欢醉饮的海隅',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的攻击力提高<unbreak>#1[i]%</unbreak>。当装备者的攻击力大于等于<unbreak>#2[i]</unbreak>/<unbreak>#3[i]</unbreak>时，使造成的持续伤害额外提高<unbreak>#4[i]%</unbreak>/<unbreak>#5[i]%</unbreak>。',
      params: [
        0.12,
        2400,
        3600,
        0.12,
        0.24
      ]
    }
  },
  323: {
    id: '323',
    name: '永恒之地翁法罗斯',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的暴击率提高<unbreak>#1[i]%</unbreak>。装备者的忆灵在场时，我方全体速度提高<unbreak>#2[i]%</unbreak>，该效果无法叠加。',
      params: [
        0.08,
        0.08
      ]
    }
  },
  324: {
    id: '324',
    name: '天国@直播间',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的暴击伤害提高<unbreak>#1[i]%</unbreak>，若在同一回合内消耗大于等于<unbreak>#2[i]</unbreak>点战技点，额外使装备者暴击伤害提高<unbreak>#3[i]%</unbreak>，持续<unbreak>#4[i]</unbreak>回合。',
      params: [
        0.16,
        3,
        0.32,
        3
      ]
    }
  },
  325: {
    id: '325',
    name: '零号关卡朋克洛德',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的欢愉度提高<unbreak>#1[i]%</unbreak>。战斗中欢愉度首次达到<unbreak>#2[i]%</unbreak>/<unbreak>#3[i]%</unbreak>时，使装备者暴击伤害提高<unbreak>#4[i]%</unbreak>/<unbreak>#5[i]%</unbreak>。',
      params: [
        0.08,
        0.4,
        0.8,
        0.2,
        0.32
      ]
    }
  },
  326: {
    id: '326',
    name: '千星荟萃之城',
    fourPiece: false,
    twoPiece: {
      desc: '装备者施放追加攻击时，攻击力提高<unbreak>#1[i]%</unbreak>，持续<unbreak>#2[i]</unbreak>回合。当敌方目标被消灭时，我方全体在本场战斗中暴击伤害提高<unbreak>#3[i]%</unbreak>，该效果无法叠加。',
      params: [
        0.24,
        2,
        0.12
      ]
    }
  },
  327: {
    id: '327',
    name: '坠星启航地',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的暴击率提高<unbreak>#1[i]%</unbreak>。进入战斗时，若装备者与另一名队友均为开拓同行角色，使装备者的暴击伤害提高<unbreak>#2[i]%</unbreak>。',
      params: [
        0.08,
        0.32
      ]
    }
  },
  328: {
    id: '328',
    name: '寰宇生研院',
    fourPiece: false,
    twoPiece: {
      desc: '进入战斗时，若装备者能量上限大于等于<unbreak>#1[i]</unbreak>点，每超过1点使装备者造成的伤害提高<unbreak>#2[f1]%</unbreak>，最多提高<unbreak>#3[i]%</unbreak>。',
      params: [
        200,
        0.002,
        0.32
      ]
    }
  },
  329: {
    id: '329',
    name: '神的瞬息欢愉',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的速度提高<unbreak>#1[i]%</unbreak>。当装备者的欢愉度大于等于<unbreak>#2[i]%</unbreak>时，进入战斗时立刻使行动提前<unbreak>#3[i]%</unbreak>。',
      params: [
        0.06,
        0.4,
        0.4
      ]
    }
  },
  330: {
    id: '330',
    name: '亚空异容所',
    fourPiece: false,
    twoPiece: {
      desc: '使装备者的速度提高<unbreak>#1[i]%</unbreak>，当装备者的速度大于等于<unbreak>#2[i]</unbreak>时，进入战斗后使我方全体击破特攻提高<unbreak>#3[i]%</unbreak>，该效果无法叠加。',
      params: [
        0.06,
        145,
        0.18
      ]
    }
  }
};

/** 取套装效果；未知 id 返回 null */
export function relicSetEffect(id: string | null | undefined): RelicSetEffect | null {
  if (!id) return null;
  return RELIC_SETS[id] ?? null;
}
