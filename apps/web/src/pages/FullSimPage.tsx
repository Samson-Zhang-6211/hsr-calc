import { useEffect, useRef, useState, type ReactNode } from 'react';
import { baseAttackOf } from '../base-attack.js';
import { useTranslation } from 'react-i18next';
import type { DamageKind, Element } from '@hsr-calc/shared';
import {
  createInteractiveBattle,
  ALLY_TARGET_KINDS,
  ENERGY_MAX,
  TEAM_ROSTER_ID,
  monsterElementResistance,
  type AllyTargetKind,
  type BattleConfig,
  type BattleResult,
  type BattleStatus,
  type BattleStep,
  type BuffSnapshot,
  type CharId,
  type CombatEvent,
  type CombatMember,
  type DecisionInput,
  type HitLog,
  type InteractiveBattle,
  type MonsterConfig,
  type MonsterId,
  type RoundMode,
  type SummonStatus,
  type TargetPicks,
  mechanicIdsFor,
} from '@hsr-calc/engine';
import { newId, storage, type StoredBattleEntry, type StoredCharacter } from '../storage.js';
import { assetUrl } from '../asset-url.js';
import { BattleStage, skillIcon, type StageAlly, type StageEnemy } from '../battle-stage.js';
import {
  ActionRail,
  CommandBar,
  SimHud,
  shortcutAction,
  type CommandTarget,
  type PendingView,
  type RailEntry,
  type SimTone,
} from '../fullsim-console.js';
import { ownerOfSource, planFrames } from '../battle-anim.js';
import { useBattleAnim } from '../use-battle-anim.js';
import { CHARACTER_ROSTER } from '../data/character-roster.js';
import { CharPickerModal } from '../char-picker.js';
import { MONSTER_ROSTER } from '../data/monster-roster.js';
import { fillMonsterFields } from '../monster-fill.js';
import {
  sanitizeStagePresetKey,
  presetArtId,
  stageMetaOf,
  stageModeViews,
  stagePreset,
  type StagePackMode,
  type StageSectionPreset,
} from '../monster-presets.js';
import { StageMechanicsRow, StageNavRow } from '../stage-mechanics.js';
import { summonIconUrl } from '../summon-art.js';
import { isEmptyMonsterTurn } from '../stage-events.js';
import { HintCard } from '../hint-card.js';

const ALL_ELEMENTS: Element[] = [
  'Physical',
  'Fire',
  'Ice',
  'Wind',
  'Thunder',
  'Quantum',
  'Imaginary',
];

/** 手配木桩（未选怪物）时的默认美术 = 无想面具 8001030，名字仍显示「木桩」 */
const DEFAULT_MONSTER_ART_ID = '8001030';

const MONSTER_IDS = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5'] as const;

/** 手动默认值 = 四人毕业面板（速度 / 充能绳 19.4%） */
const MANUAL_DEFAULTS: Record<CharId, { speed: string; energyRegen: string }> = {
  sanyueqi: { speed: '134', energyRegen: '0.194' },
  fuxuan: { speed: '134', energyRegen: '0.194' },
  archer: { speed: '134', energyRegen: '0.194' },
  boothill: { speed: '134', energyRegen: '0.194' },
  ashveil: { speed: '134', energyRegen: '0.194' },
  sanyueqi2: { speed: '134', energyRegen: '0.194' },
  moze: { speed: '134', energyRegen: '0.194' },
  feixiao: { speed: '134', energyRegen: '0.194' },
  seele: { speed: '134', energyRegen: '0.194' },
  danheng: { speed: '134', energyRegen: '0.194' },
  yanqing: { speed: '134', energyRegen: '0.194' },
  sushang: { speed: '134', energyRegen: '0.194' },
  trailblazerKnight: { speed: '134', energyRegen: '0.194' },
  trailblazerKnight2: { speed: '134', energyRegen: '0.194' },
  gepard: { speed: '134', energyRegen: '0.194' },
  aventurine: { speed: '134', energyRegen: '0.194' },
  qingge: { speed: '156', energyRegen: '0.194' },
  sunday: { speed: '134', energyRegen: '0.194' },
  jingyuan: { speed: '135', energyRegen: '0' },
  himeko: { speed: '96', energyRegen: '0.194' },
  rappa: { speed: '96', energyRegen: '0' },
  herta: { speed: '99', energyRegen: '0.194' },
  himekoNova: { speed: '98', energyRegen: '0.194' },
  herta4: { speed: '99', energyRegen: '0.194' },
  serval: { speed: '104', energyRegen: '0.194' },
  anaxa: { speed: '97', energyRegen: '0.194' },
  jade: { speed: '103', energyRegen: '0.194' },
  argenti: { speed: '103', energyRegen: '0.194' },
  qingque: { speed: '102', energyRegen: '0.194' },
  rin: { speed: '107', energyRegen: '0.194' },
  tenghuang: { speed: '134', energyRegen: '0.194' },
  aglaea: { speed: '159', energyRegen: '0' },
  aha: { speed: '94', energyRegen: '0' },
  yaoguang: { speed: '101', energyRegen: '0' },
  huohua: { speed: '107', energyRegen: '0' },
  langzun: { speed: '110', energyRegen: '0' },
  feiying: { speed: '104', energyRegen: '0' },
  shuisha: { speed: '107', energyRegen: '0' },
  zhenzhu: { speed: '99', energyRegen: '0' },
  trailblazer: { speed: '106', energyRegen: '0' },
  trailblazer2: { speed: '106', energyRegen: '0' },
  trailblazerMem: { speed: '103', energyRegen: '0' },
  trailblazerMem2: { speed: '103', energyRegen: '0' },
  tibao: { speed: '96', energyRegen: '0' },
  huahuo: { speed: '101', energyRegen: '0' },
  tails: { speed: '98', energyRegen: '0' },
  xiedie: { speed: '95', energyRegen: '0' },
  fengjin: { speed: '110', energyRegen: '0' },
  changyeyue: { speed: '99', energyRegen: '0' },
  xilian: { speed: '101', energyRegen: '0' },
  luocha: { speed: '101', energyRegen: '0' },
  lingsha: { speed: '98', energyRegen: '0' },
  natasha: { speed: '98', energyRegen: '0' },
  lynx: { speed: '100', energyRegen: '0' },
  bailu: { speed: '98', energyRegen: '0' },
  gallagher: { speed: '98', energyRegen: '0' },
  hysilens: { speed: '102', energyRegen: '0' },
  blackswan: { speed: '102', energyRegen: '0' },
  kafka: { speed: '104', energyRegen: '0' },
  welt: { speed: '102', energyRegen: '0' },
  pela: { speed: '105', energyRegen: '0' },
  sampo: { speed: '102', energyRegen: '0' },
  yinlang: { speed: '107', energyRegen: '0' },
  jiaoqiu: { speed: '98', energyRegen: '0' },
  huangquan: { speed: '101', energyRegen: '0' },
  qianye: { speed: '107', energyRegen: '0' },
  luka: { speed: '103', energyRegen: '0' },
  guinaifen: { speed: '106', energyRegen: '0' },
  saifeir: { speed: '106', energyRegen: '0' },
  dahlia: { speed: '96', energyRegen: '0' },
  fugue: { speed: '102', energyRegen: '0' },
  cerdra: { speed: '99', energyRegen: '0' },
  robin: { speed: '102', energyRegen: '0' },
  ruanmei: { speed: '104', energyRegen: '0' },
  trailblazerShaman: { speed: '105', energyRegen: '0' },
  trailblazerShaman2: { speed: '105', energyRegen: '0' },
  asta: { speed: '106', energyRegen: '0' },
  bronya: { speed: '99', energyRegen: '0' },
  tingyun: { speed: '112', energyRegen: '0' },
  yukong: { speed: '107', energyRegen: '0' },
  hanya: { speed: '110', energyRegen: '0' },
  blade: { speed: '134', energyRegen: '0.194' },
  jingliu: { speed: '134', energyRegen: '0.194' },
  mydei: { speed: '134', energyRegen: '0' },
  saber: { speed: '101', energyRegen: '0' },
  gilgamesh: { speed: '97', energyRegen: '0' },
  misha: { speed: '96', energyRegen: '0' },
  firefly: { speed: '145', energyRegen: '0' },
  clara: { speed: '135', energyRegen: '0' },
  xueyi: { speed: '134', energyRegen: '0' },
  yunli: { speed: '99', energyRegen: '0' },
  arlan: { speed: '102', energyRegen: '0.194' },
  hook: { speed: '94', energyRegen: '0.194' },
  trailblazerDestroy: { speed: '100', energyRegen: '0' },
  trailblazerDestroy2: { speed: '100', energyRegen: '0' },
  danhengIL: { speed: '102', energyRegen: '0.194' },
  phainon: { speed: '94', energyRegen: '0.194' },
  ratio: { speed: '102', energyRegen: '0.194' },
  topaz: { speed: '110', energyRegen: '0.194' },
};

/** 战斗支持的全部角色（引擎 SUPPORTED_IDS 白名单；槽位可从这里添加） */
const BATTLE_CHAR_IDS: CharId[] = [
  'qingge',
  'sunday',
  'jingyuan',
  'himeko',
  'rappa',
  'herta',
  'himekoNova',
  'herta4',
  'serval',
  'anaxa',
  'jade',
  'argenti',
  'qingque',
  'rin',
  'tenghuang',
  'aglaea',
  'aha',
  'yaoguang',
  'huohua',
  'langzun',
  'feiying',
  'shuisha',
  'zhenzhu',
  'trailblazer',
  'trailblazer2',
  'trailblazerMem',
  'trailblazerMem2',
  'tibao',
  'huahuo',
  'tails',
  'xiedie',
  'fengjin',
  'changyeyue',
  'xilian',
  'luocha',
  'lingsha',
  'natasha',
  'lynx',
  'bailu',
  'gallagher',
  'hysilens',
  'blackswan',
  'kafka',
  'welt',
  'pela',
  'sampo',
  'yinlang',
  'jiaoqiu',
  'huangquan',
  'qianye',
  'luka',
  'guinaifen',
  'saifeir',
  'dahlia',
  'fugue',
  'cerdra',
  'robin',
  'ruanmei',
  'trailblazerShaman',
  'trailblazerShaman2',
  'asta',
  'bronya',
  'tingyun',
  'yukong',
  'hanya',
  'sanyueqi',
  'blade',
  'jingliu',
  'mydei',
  'saber',
  'gilgamesh',
  'misha',
  'firefly',
  'xueyi',
  'yunli',
  'clara',
  'arlan',
  'hook',
  'trailblazerDestroy',
  'trailblazerDestroy2',
  'danhengIL',
  'phainon',
  'ratio',
  'topaz',
  'archer',
  'boothill',
  'ashveil',
  'sanyueqi2',
  'moze',
  'feixiao',
  'seele',
  'danheng',
  'yanqing',
  'sushang',
  'fuxuan',
  'trailblazerKnight',
  'trailblazerKnight2',
  'gepard',
  'aventurine',
];

/** 战斗槽位角色 → 名册 id：轴 TEAM_ROSTER_ID（5 人固定阵容）+ 啊哈 1511 + 爻光 1502 + 火花 1501（轴不接后三者）。
 *  导出供 CharactersPage 星魂显示口径判定（引擎已接入角色）使用，改名单时两页+此处同步。 */
export const BATTLE_ROSTER_ID: Record<CharId, string> = {
  sanyueqi: '1001',
  fuxuan: '1208',
  archer: '1015',
  boothill: '1315',
  ashveil: '1504',
  sanyueqi2: '1224',
  moze: '1223',
  feixiao: '1220',
  seele: '1102',
  danheng: '1002',
  yanqing: '1209',
  sushang: '1206',
  trailblazerKnight: '8003',
  trailblazerKnight2: '8004',
  gepard: '1104',
  aventurine: '1304',
  blade: '1205',
  jingliu: '1212',
  mydei: '1404',
  saber: '1014',
  gilgamesh: '1509',
  misha: '1312',
  ...TEAM_ROSTER_ID,
  aha: '1511',
  yaoguang: '1502',
  huohua: '1501',
  langzun: '1506',
  feiying: '1505',
  shuisha: '1513',
  zhenzhu: '1503',
  trailblazer: '8009',
  trailblazer2: '8010',
  trailblazerMem: '8007',
  trailblazerMem2: '8008',
  tibao: '1403',
  huahuo: '1306',
  tails: '1217',
  xiedie: '1407',
  fengjin: '1409',
  changyeyue: '1413',
  xilian: '1415',
  luocha: '1203',
  lingsha: '1222',
  natasha: '1105',
  lynx: '1110',
  bailu: '1211',
  gallagher: '1301',
  hysilens: '1410',
  blackswan: '1307',
  kafka: '1005',
  welt: '1004',
  pela: '1106',
  sampo: '1108',
  yinlang: '1006',
  jiaoqiu: '1218',
  huangquan: '1308',
  qianye: '1507',
  luka: '1111',
  guinaifen: '1210',
  saifeir: '1406',
  dahlia: '1321',
  fugue: '1225',
  cerdra: '1412',
  robin: '1309',
  ruanmei: '1303',
  trailblazerShaman: '8005',
  trailblazerShaman2: '8006',
  himeko: '1003',
  rappa: '1317',
  herta: '1401',
  himekoNova: '1510',
  herta4: '1013',
  serval: '1103',
  anaxa: '1405',
  jade: '1314',
  argenti: '1302',
  qingque: '1201',
  rin: '1508',
  asta: '1009',
  bronya: '1101',
  tingyun: '1202',
  yukong: '1207',
  hanya: '1215',
  firefly: '1310',
  clara: '1107',
  xueyi: '1214',
  yunli: '1221',
  arlan: '1008',
  hook: '1109',
  trailblazerDestroy: '8001',
  trailblazerDestroy2: '8002',
  danhengIL: '1213',
  phainon: '1408',
  ratio: '1305',
  topaz: '1112',
};

/** 战斗明细的一行：按伤害类型分组后的合计（isTotal = 多类型时的「总伤」行） */
interface BattleDetailRow {
  kind: DamageKind | null;
  isTotal: boolean;
  skills: string;
  damage: number | null;
  hits: HitLog[];
}

/** 滚动表格中一个「回合组」（同 # 的事件聚合：action 开新 #、ult 并入前一 #、轮次/胜利跟随） */
interface SimRow {
  key: string;
  num: number | null;
  time: number;
  round: number;
  evLabel: string;
  unitLabel: string;
  spText: string;
  energyText: string;
  moodText: string;
  stacksText: string;
  enhanceText: string;
  noteText: string;
  details: BattleDetailRow[];
  buffs?: Partial<Record<string, BuffSnapshot[]>>;
}

interface SimGroup {
  num: number | null;
  rows: SimRow[];
}

/** 基础组间输出延迟（ms）：按「回合」逐组吐字，暂停在组边界生效；实际延迟 = 基础 ÷ 倍速 */
const BASE_GROUP_DELAY = 3000;
/** 可选倍速（输出速度 = 基础的 N 倍 → 延迟 ÷ N） */
const SPEED_OPTIONS = [0.5, 1, 1.5, 2, 3, 5] as const;
/** 未来推演条数（纯速度跑道，仅行动值） */
const FUTURE_ROWS = 64;
/** 需要选择我方目标的技能（键 = `${unit}.${action}`） */
const ALLY_TARGET_SKILLS = new Set([
  'sunday.skill',
  'sunday.ult',
  'tenghuang.skill',
  'qingge.ult',
  'aha.skill',
  'trailblazer.ult',
  'trailblazer2.ult',
  'huahuo.skill',
  'tails.skill',
  'luocha.skill',
  'natasha.skill',
  'lynx.skill',
  'bailu.skill',
  'gallagher.skill',
]);
/** 欢愉角色（点运行/开始前弹啊哈对话框，裁定：两页配置区 slots 含任一欢愉角色时触发） */
const ELATION_CHAR_IDS = new Set<CharId>(['aha', 'yaoguang', 'huohua', 'feiying', 'shuisha', 'zhenzhu', 'trailblazer', 'trailblazer2']);
/** 我方目标技能的自身排除（蒙福者「除星期日自身外」、晴歌大招不拉自己） */
const ALLY_TARGET_EXCLUDE: Record<string, string> = {
  'qingge.ult': 'qingge',
  'sunday.ult': 'sunday',
};

/** 操作区一次待确认的选择（行动或终结技，随后选目标 → 确定） */
type PendingChoice =
  | { kind: 'action'; action: 'basic' | 'skill' }
  | { kind: 'ult'; unit: CharId }
  /** 迷迷1800707【我会！帮你！】：只选我方目标，无普攻/战技二选一 */
  | { kind: 'mimiSupport' };

/**
 * 玩家输入日志（撤回重放用）：顺序即语义——
 * `advance` = 第 k 次 advance 调用的输入；`ult` = 紧接在随后一次 advance 之前入队的终结技。
 * 引擎确定性（无随机），从头按日志重放即可完整恢复任意决策点状态。
 */
type LogOp =
  | { kind: 'advance'; input?: DecisionInput }
  | { kind: 'ult'; id: CharId; target?: TargetPicks };

/** 一次「等待玩家操作」的决策步（advanceBatch 与 fastForward 共用；predictAfter 为引擎透传的试算接口） */
interface DecisionStep {
  unitId: CharId;
  status: BattleStatus;
  mimiSupport?: boolean;
  predictAfter?: (input: DecisionInput) => {
    energy: Record<CharId, number>;
    caps: Record<CharId, number>;
  };
}

export default function FullSimPage() {
  const { t, i18n } = useTranslation();

  // ── 配置（与数值代理模拟同一套录入形态） ──────────────────────────
  // 每次渲染实时读存档（不用 useState 快照）：角色管理修改后立即生效，
  // 双标签页/跨页时序均不会拿到过期数据（2026-10 用户报告）
  const chars: StoredCharacter[] = storage.getCharacters();
  const [teamPick, setTeamPick] = useState<Record<CharId, string>>({
    sanyueqi: '',
    fuxuan: '',
    archer: '',
    boothill: '',
  ashveil: '',
  sanyueqi2: '',
  moze: '',
  feixiao: '',
    seele: '',
    danheng: '',
    yanqing: '',
    sushang: '',
    trailblazerKnight: '',
    trailblazerKnight2: '',
    gepard: '',
    aventurine: '',
    blade: '',
    jingliu: '',
    mydei: '',
    saber: '',
    gilgamesh: '',
    misha: '',
    qingge: '',
    sunday: '',
    jingyuan: '',
    himeko: '',
    rappa: '',
    herta: '',
    himekoNova: '',
    herta4: '',
    serval: '',
    anaxa: '',
    jade: '',
    argenti: '',
    qingque: '',
    rin: '',
    tenghuang: '',
    aglaea: '',
    aha: '',
    yaoguang: '',
    huohua: '',
    langzun: '',
    feiying: '',
    shuisha: '',
    zhenzhu: '',
    trailblazer: '',
    trailblazer2: '',
    trailblazerMem: '',
    trailblazerMem2: '',
    tibao: '',
    huahuo: '',
    tails: '',
    xiedie: '',
    fengjin: '',
    changyeyue: '',
    xilian: '',
    luocha: '',
    lingsha: '',
    natasha: '',
    lynx: '',
    bailu: '',
    gallagher: '',
    hysilens: '',
    blackswan: '',
    kafka: '',
    welt: '',
    pela: '',
    sampo: '',
    yinlang: '',
    jiaoqiu: '',
    huangquan: '',
    qianye: '',
    luka: '',
    guinaifen: '',
    saifeir: '',
    dahlia: '',
    fugue: '',
    cerdra: '',
    robin: '',
    ruanmei: '',
    trailblazerShaman: '',
    trailblazerShaman2: '',
    asta: '',
    bronya: '',
    tingyun: '',
    yukong: '',
    hanya: '',
    firefly: '',
    clara: '',
    xueyi: '',
    yunli: '',
    arlan: '',
    hook: '',
    trailblazerDestroy: '',
    trailblazerDestroy2: '',
    danhengIL: '',
    phainon: '',
    ratio: '',
    topaz: '',
  });
  // 队伍自由化（2026-10 裁定）：槽位可增删（1-4人）+ 调序 + 主C 勾选
  const [slots, setSlots] = useState<CharId[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [mainC, setMainC] = useState<CharId>('jingyuan');
  const [teamManual, setTeamManual] = useState(MANUAL_DEFAULTS);
  const [techniques, setTechniques] = useState(true);
  const [maxTime, setMaxTime] = useState('350');
  /** 轮次模式快捷键（2026-10 裁定）：三模式各有默认截止行动值，切换即重置输入框 */
  const [roundMode, setRoundMode] = useState<RoundMode>('forgotten');
  const [hqEx, setHqEx] = useState(false);
  const [jyEx, setJyEx] = useState(false);
  const [dnEx, setDnEx] = useState(false);
  const [ahaPresent, setAhaPresent] = useState(true);
  const [ahaSpeed, setAhaSpeed] = useState(MANUAL_DEFAULTS.aha.speed);
  const ROUND_MODE_DEFAULT: Record<RoundMode, string> = { forgotten: '350', arbiter: '500', phantom: '2000' };
  const pickRoundMode = (m: RoundMode): void => {
    setRoundMode(m);
    setMaxTime(ROUND_MODE_DEFAULT[m]);
  };
  const [mLevel, setMLevel] = useState('90');
  const [mHp, setMHp] = useState('2000000');
  const [mElementRes, setMElementRes] = useState('0');
  const [mEffectRes, setMEffectRes] = useState('0');
  const [mEffectHit, setMEffectHit] = useState('0');
  const [mTough, setMTough] = useState('300');
  const [mSpeed, setMSpeed] = useState('100');
  const [mClass, setMClass] = useState<'normal' | 'elite'>('normal');
  // 怪物选择（2026-10 裁定2）：选怪+等级 → 自动填充全套覆盖手配；'' = 手配模式
  const [mMonsterId, setMMonsterId] = useState('');
  const [mAttack, setMAttack] = useState('0');
  // 关卡包（高难本 5 包，2026-10-30 裁定）：key = `${包 id}|${关卡序号}|${半名}`；'' = 不用关卡包（走手配单怪）
  // 关卡段选择持久化（第四十七轮）：刷新后恢复上次选中的段；非法/过期 key 回落为「不用预设」
  const [mPreset, setMPreset] = useState(() => sanitizeStagePresetKey(storage.getStagePresetKey()));
  const [packOpen, setPackOpen] = useState(false);
  const preset = stagePreset(mPreset);
  /** 模式名（混沌回忆 / 虚构叙事 / 末日幻影 / 异相仲裁） */
  const modeLabel = (mode: StagePackMode): string =>
    t(`battle.mode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`);
  /** 段按钮文案：zh「物竞天择其十二上」/ en「Stage 12 Upper」；星启与仲裁单段关无后缀 */
  const sectionLabel = (sec: StageSectionPreset): string => {
    const name = i18n.language === 'en' ? sec.stage.nameEn : sec.stage.name;
    if (!sec.half) return name;
    const short = sec.half === '上半' ? t('battle.halfUpperShort') : t('battle.halfLowerShort');
    return i18n.language === 'en' ? `${name} ${short}` : `${name}${short}`;
  };

  // ── 运行时状态 ─────────────────────────────────────────────────
  const ctlRef = useRef<InteractiveBattle | null>(null);
  /** 下一组首事件（advanceBatch 收到「新 # 的 action」时暂存，归入下一批） */
  const carryRef = useRef<CombatEvent | null>(null);
  /** 决策提交的输入（下一 advanceBatch 的第一步消费） */
  const inputRef = useRef<DecisionInput | null>(null);
  const [started, setStarted] = useState(false);
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [decision, setDecision] = useState<DecisionStep | null>(null);
  const [status, setStatus] = useState<BattleStatus | null>(null);
  const [paused, setPaused] = useState(false);
  /** 输出倍速（0.5× … 5×），实际组间延迟 = BASE_GROUP_DELAY ÷ speed */
  const [speed, setSpeed] = useState(1);
  const [ended, setEnded] = useState(false);
  const [err, setErr] = useState(false);
  /** 战报是否刚存进历史（按钮闪「已保存」1.5s，与数值代理模拟页同一套交互） */
  const [battleSaved, setBattleSaved] = useState(false);
  /** 每输出一批 +1，驱动 pump 继续排下一批定时器 */
  const [version, setVersion] = useState(0);
  /** 战场攻击动画播放器（2026-10-25 攻击动画批）：每收满一个回合组播一组帧 */
  const stageAnim = useBattleAnim();
  const playFrames = stageAnim.play;
  /** 敌方美术加载失败标记（nanoka 怪物图覆盖不全，部分 id 无图 → 退回 CSS 徽章） */
  const [artFail, setArtFail] = useState<Record<string, boolean>>({});
  const [ultIconFail, setUltIconFail] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** 待确认的选择（行动/终结技）；null = 无选择流程 */
  const [pending, setPending] = useState<PendingChoice | null>(null);
  /** 已点选的目标（我方 CharId 或敌方 monster1-3），确定键提交 */
  const [selTarget, setSelTarget] = useState<string | null>(null);
  /** 技能后跟放的终结技（点选顺序，2026-10 用户需求）；afterPickTarget=正为其选我方目标的大招 */
  const [afterPicks, setAfterPicks] = useState<{ id: CharId; target?: TargetPicks }[]>([]);
  const [afterPickTarget, setAfterPickTarget] = useState<CharId | null>(null);
  // ── 撤回（重放）状态 ──────────────────────────────────────────
  /** 玩家输入日志（advance/ult 交错，按序重放） */
  const logRef = useRef<LogOp[]>([]);
  /** 每个「可操作回合」（决策点）对应的 log 长度（撤回目标） */
  const cpRef = useRef<number[]>([]);
  /** 供按钮渲染的 checkpoint 深度（cpRef 是 ref，渲染需 state 镜像） */
  const [undoDepth, setUndoDepth] = useState(0);
  /** 自上个 checkpoint 后是否确认过行动（区分同一决策点的终结技唤醒，不重复记点） */
  const actionSinceCpRef = useRef(false);
  /** 开战时的战斗配置（撤回重放需从头重建） */
  const configRef = useRef<BattleConfig | null>(null);
  /** 因选终结技而自动暂停（确认释放→继续；取消→恢复点击前状态） */
  const autoPauseRef = useRef(false);
  /** 点终结技按钮前的暂停状态（取消选择时恢复） */
  const prePickPausedRef = useRef(false);

  const rosterById = new Map(CHARACTER_ROSTER.map((c) => [c.id, c]));
  const rosterName = (rosterId: string): string => {
    const r = rosterById.get(rosterId);
    if (!r) return rosterId;
    const raw = i18n.language === 'en' ? r.en : r.zh;
    if (!raw.includes('{NICKNAME}')) return raw;
    const base = i18n.language === 'en' ? 'Trailblazer' : '开拓者';
    const path = t(`paths.${r.path}`);
    return i18n.language === 'en' ? `${base} · ${path}` : `${base}·${path}`;
  };
  const bracket = (s: string): string =>
    i18n.language === 'en' ? ` (${s})` : `（${s}）`;
  const slotLabel = (id: CharId, idx: number): string =>
    `${t('timeline.sideAlly')}${idx + 1}${bracket(rosterName(BATTLE_ROSTER_ID[id]))}`;
  const unitName = (unitId: string): string => t(`timeline.team.unitNames.${unitId}`);
  const fmt = (v: number): string => Math.round(v).toLocaleString();

  /**
   * 保存整场战报到历史记录（2026-11-08 首页批）。
   *
   * 此前**只有数值代理模拟页**能把战报存进历史 —— 全真模拟打完就丢了，
   * 于是首页承诺的「战果存进历史」对最常用的手动模拟是假的。这里补上：
   * 存的是 `ctl.result()` 的完整 BattleResult，历史页「查看」会在数值代理模拟页重放。
   * 结果从 ctl 现取而不是读渲染期的 `result`，避免依赖声明顺序。
   */
  function saveBattleToHistory() {
    const res = ctlRef.current?.result();
    if (!res) return;
    const entry: StoredBattleEntry = {
      id: newId(),
      time: Date.now(),
      total: res.report.totalDamage,
      summary: [
        `${t('battle.finalRound')} ${res.summary.rounds}`,
        `${t('timeline.team.totalTime')} ${res.summary.totalTime.toFixed(2)}`,
        `${t('battle.totalDamage')} ${fmt(res.report.totalDamage)}`,
      ].join(' · '),
      stage: stageMetaOf(preset),
      result: res,
    };
    storage.saveBattleHistory([entry, ...storage.getBattleHistory()]);
    setBattleSaved(true);
    setTimeout(() => setBattleSaved(false), 1500);
  }

  /** 出手者 id → 元素（召唤物归主人）：直伤飘字配色用（2026-10-25 攻击动画批） */
  const elementOfSource = (source: string): string | undefined => {
    const owner = ownerOfSource(source);
    return rosterById.get(BATTLE_ROSTER_ID[owner as CharId])?.element;
  };

  /** 出手者 id → 立绘 rosterId（召唤物归主人）：终结技左侧立绘切镜用（2026-10-26） */
  const portraitOfSource = (source: string): string | undefined => {
    const owner = ownerOfSource(source);
    return BATTLE_ROSTER_ID[owner as CharId];
  };

  // ── 配置 → 战斗 ────────────────────────────────────────────────
  /** 木桩「怪物+等级 → 自动填充全套」（2026-10 裁定2：覆盖手配，之后仍可手改；数据缺失保持手配值） */
  async function fillMonster(monsterId: string, levelStr: string) {
    const v = await fillMonsterFields(monsterId, Number(levelStr));
    if (!v) return;
    setMHp(v.hp);
    setMAttack(v.attack);
    setMSpeed(v.speed);
    setMTough(v.toughness);
    setMEffectRes(v.effectRes);
    setMEffectHit(v.effectHit);
  }

  function buildConfig():
    | {
        members: CombatMember[];
        monster: MonsterConfig;
        monsterWaves?: undefined;
        mechanics?: string[];
        waveClearRule?: 'pure';
        pureKillTarget?: number;
      }
    | {
        members: CombatMember[];
        monster?: undefined;
        monsterWaves: MonsterConfig[][];
        mechanics?: string[];
        waveClearRule?: 'pure';
        pureKillTarget?: number;
      }
    | null {
    const members: CombatMember[] = [];
    for (const id of slots) {
      const saved = teamPick[id] ? chars.find((c) => c.id === teamPick[id]) : undefined;
      if (!saved) return null;
      const fallback = MANUAL_DEFAULTS[id];
      members.push({
        id,
        skillLevels: saved.skillLevels,
        eidolonLevel: saved.build?.eidolonLevel ?? saved.equipment?.eidolonLevel,
        lightconeId: saved.build?.lightconeId ?? saved.equipment?.lightconeId,
        refinement: saved.build?.refinement ?? saved.equipment?.refinement,
        relicsetId: saved.build?.relicsetId,
        relicsetId2: saved.build?.relicsetId2,
        planarsetId: saved.build?.planarsetId,
        panel: {
          element: saved.element as Element,
          level: saved.level || 80,
          hp: saved.hp,
          attack: saved.atk,
          // 2026-11-07 裁定 A：攻击力% 只乘基础攻击力（角色 + 光锥）；无数据时 undefined → 引擎旧口径
          baseAttack: baseAttackOf(BATTLE_ROSTER_ID[id], saved.build?.lightconeId ?? saved.equipment?.lightconeId),
          defence: saved.def,
          critRate: saved.critRate,
          critDmg: saved.critDmg,
          breakEffect: saved.breakEffect,
          damageBonus: saved.damageBonus,
          commonBonus: saved.commonBonus ?? 0,
          elementDmg: saved.elementDmg,
          speed: saved.speed ?? (Number(fallback.speed) || 0),
          energyRegen: saved.energyRegen ?? Number(fallback.energyRegen),
          elationDegree: saved.elationDegree,
          effectHit: saved.effectHit,
          effectRes: saved.effectRes,
          healBonus: saved.healBonus,
        },
      });
    }
    const elementRes = Number(mElementRes) / 100;
    // 关卡预设 → 波次阵容（每波最多 3 只，对应 monster1/2/3 槽）
    if (preset) {
      // 关卡级机制（2026-10-30 rulings 15~19 = A）：站点中文名 → 引擎 id
      const mechanics = mechanicIdsFor(preset.mechanics.map((m) => m.name));
      return {
        members,
        monsterWaves: preset.waves,
        mechanics: mechanics.length > 0 ? mechanics : undefined,
        waveClearRule: preset.waveClearRule,
        pureKillTarget: preset.pureKillTarget,
      };
    }
    const monster: MonsterConfig = {
      level: Number(mLevel) || 90,
      hp: Number(mHp) || 1,
      resistance: Object.fromEntries(ALL_ELEMENTS.map((e) => [e, elementRes])),
      elementResistance: monsterElementResistance(mMonsterId),
      effectRes: Number(mEffectRes) / 100,
      effectHit: Number(mEffectHit) / 100,
      weaknesses: [...ALL_ELEMENTS],
      maxToughness: Number(mTough) || 1,
      speed: Number(mSpeed) || 100,
      enemyClass: mClass,
      attack: Number(mAttack) || 0,
      monsterId: mMonsterId || undefined,
    };
    return { members, monster };
  }

  function start(): void {
    if (slots.length === 0) {
      setErr(true);
      setStarted(false);
      return;
    }
    // 欢愉角色上阵 → 槽位下方「有啊哈」复选框 + 啊哈速度输入（2026-10-19 裁定：
    // window.prompt 改为槽位 UI；取消语义废除，纯本场战斗开关）
    let elationAha: BattleConfig['elationAha'];
    if (slots.some((id) => ELATION_CHAR_IDS.has(id))) {
      let panelSpeed = 80;
      if (ahaPresent) {
        const v = Number(ahaSpeed);
        if (!Number.isFinite(v) || v <= 0) return;
        panelSpeed = v;
      }
      elationAha = { present: ahaPresent, panelSpeed };
    }
    const cfg = buildConfig();
    if (!cfg) {
      setErr(true);
      setStarted(false);
      return;
    }
    const horizon = Number(maxTime) > 0 ? Number(maxTime) : 350;
    try {
      const battleCfg: BattleConfig = {
        members: cfg.members,
        monster: cfg.monster,
        monsterWaves: cfg.monsterWaves,
        mechanics: cfg.mechanics,
        waveClearRule: cfg.waveClearRule,
        pureKillTarget: cfg.pureKillTarget,
        rounds: 10,
        maxTime: horizon,
        roundMode,
        techniques,
        mainC: slots.includes(mainC) ? mainC : slots[0],
        elationAha,
        huangquanEx: slots.includes('huangquan') ? hqEx : undefined,
        jingyuanEx: slots.includes('jingyuan') ? jyEx : undefined,
        danhengILEx: slots.includes('danhengIL') ? dnEx : undefined,
      };
      const ctl = createInteractiveBattle(battleCfg);
      ctlRef.current = ctl;
      configRef.current = battleCfg;
      carryRef.current = null;
      inputRef.current = null;
      logRef.current = [];
      cpRef.current = [];
      setUndoDepth(0);
      actionSinceCpRef.current = false;
      autoPauseRef.current = false;
      setPending(null);
      setSelTarget(null);
      setEvents([]);
      setDecision(null);
      setStatus(null);
      setPaused(false);
      setEnded(false);
      setErr(false);
      setStarted(true);
      setVersion((v) => v + 1);
    } catch (e) {
      console.error('battle start failed', e);
      ctlRef.current = null;
      setErr(true);
      setStarted(false);
    }
  }

  function restart(): void {
    ctlRef.current = null;
    carryRef.current = null;
    inputRef.current = null;
    logRef.current = [];
    cpRef.current = [];
    setUndoDepth(0);
    actionSinceCpRef.current = false;
    autoPauseRef.current = false;
    configRef.current = null;
    setPending(null);
    setSelTarget(null);
    setStarted(false);
    setEvents([]);
    setDecision(null);
    setStatus(null);
    setPaused(false);
    setEnded(false);
    // 重开清掉还在播的攻击动画（否则残帧会挂在下一场的战场区上）
    stageAnim.stop();
  }

  // ── 推进：收满一个「回合组」（同步原子，暂停在组间生效） ───────────
  function advanceBatch(): {
    evs: CombatEvent[];
    dec: DecisionStep | null;
    /** 引擎已无后续事件（战斗结束 / 达到放弃阈值） */
    done: boolean;
  } {
    const ctl = ctlRef.current;
    if (!ctl) return { evs: [], dec: null, done: true };
    const evs: CombatEvent[] = [];
    if (carryRef.current) {
      evs.push(carryRef.current);
      carryRef.current = null;
    }
    let opened = evs.length > 0;
    let input = inputRef.current;
    inputRef.current = null;
    for (;;) {
      logRef.current.push({ kind: 'advance', input: input ?? undefined });
      if (input) actionSinceCpRef.current = true;
      const step = ctl.advance(input ?? undefined);
      input = null;
      if (!step) {
        setEnded(true);
        setDecision(null);
        return { evs, dec: null, done: true };
      }
      if (step.type === 'decision') {
        // 记录一个「可操作回合」检查点（首次决策必记；此后仅在确认过行动后的新决策记，
        // 同一决策点的终结技唤醒不重复记点）
        if (cpRef.current.length === 0 || actionSinceCpRef.current) {
          cpRef.current = [...cpRef.current, logRef.current.length];
          setUndoDepth(cpRef.current.length);
          actionSinceCpRef.current = false;
        }
        return {
          evs,
          dec: {
            unitId: step.unitId,
            status: step.status,
            mimiSupport: step.mimiSupport,
            predictAfter: step.predictAfter,
          },
          done: false,
        };
      }
      setStatus(step.status);
      const ev = step.event;
      if (ev.kind === 'break') continue;
      if (ev.kind === 'action' && opened) {
        carryRef.current = ev;
        return { evs, dec: null, done: false };
      }
      if (ev.kind === 'action') opened = true;
      evs.push(ev);
    }
  }

  /**
   * 「快进」（2026-11-07 用户裁定，替代原点了没反应的「跳过」）：
   * 连推事件直到下一次我方决策；不播攻击动画（一口气过掉几十组会把动画糊成一团），
   * 只把事件一次性并进战报并把决策/结束状态落地。
   */
  function fastForward(): void {
    if (!ctlRef.current || ended) return;
    stageAnim.stop();
    const collected: CombatEvent[] = [];
    let decided: DecisionStep | null = null;
    // 保险：异常配置下也不在同步循环里卡死
    for (let guard = 0; guard < 500; guard += 1) {
      const { evs, dec, done } = advanceBatch();
      collected.push(...evs);
      if (dec) {
        decided = dec;
        break;
      }
      if (done) break;
    }
    if (collected.length > 0) setEvents((prev) => [...prev, ...collected]);
    if (decided) {
      setDecision(decided);
      setStatus(decided.status);
      if (decided.mimiSupport) setPending({ kind: 'mimiSupport' });
    }
    setVersion((v) => v + 1);
  }

  // ── 播放循环：组间延迟；暂停/决策点/结束时停在组边界 ──────────────
  useEffect(() => {
    if (!started || paused || decision || ended) return;
    const delay = events.length === 0 ? 0 : BASE_GROUP_DELAY / speed;
    const timer = setTimeout(() => {
      const { evs, dec } = advanceBatch();
      if (evs.length > 0) {
        setEvents((prev) => [...prev, ...evs]);
        // 2026-10-25 攻击动画批：本组事件 → 攻击动画帧（时长 = 基础 ÷ 倍速，见 battle-anim.ts）
        const frames = planFrames(evs, ctlRef.current?.hits() ?? [], {
          speed,
          elementOf: elementOfSource,
          labelOf: (e) => (e.skillCode ? skillLabel(e.skillCode) : undefined),
          portraitOf: portraitOfSource,
        });
        if (frames.length > 0) playFrames(frames);
      }
      if (dec) {
        setDecision(dec);
        setStatus(dec.status);
        // 迷迷【我会！帮你！】：到达即自动弹我方目标选择（无普攻/战技二选一）
        if (dec.mimiSupport) setPending({ kind: 'mimiSupport' });
      }
      setVersion((v) => v + 1);
    }, delay);
    return () => clearTimeout(timer);
    // elementOfSource / skillLabel 是每次渲染重建的内联闭包：故意不进依赖（只吃倍速与批次）
  }, [started, paused, decision, ended, version, events.length, speed, playFrames]);

  // 新行出现时滚到底（保持最新回合可见）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length, version]);

  // ── 玩家操作：行动/终结技 → （选目标）→ 确定 ─────────────────────
  function pickAction(action: 'basic' | 'skill'): void {
    if (!decision) return;
    setPending({ kind: 'action', action });
    // 普攻 = 敌方单体主目标：三个木桩为选项并预选中间（不隐藏），仍需点确定
    setSelTarget(action === 'basic' ? 'monster3' : null);
    // 换行动 = 重新预测 → 清空跟放终结技点选
    setAfterPicks([]);
    setAfterPickTarget(null);
  }

  function pickUlt(id: CharId): void {
    if (ended) return;
    // 点击终结技 → 自动暂停（直到确定释放）
    if (!autoPauseRef.current) {
      prePickPausedRef.current = paused;
      autoPauseRef.current = true;
    }
    setPaused(true);
    setPending({ kind: 'ult', unit: id });
    setSelTarget(null);
  }

  /** 清除「选终结技自动暂停」：restore=true 恢复点击前状态（取消/撤回），false=继续运行（确认释放） */
  function releaseAutoPause(restore: boolean): void {
    if (!autoPauseRef.current) return;
    autoPauseRef.current = false;
    setPaused(restore ? prePickPausedRef.current : false);
  }

  function cancelPending(): void {
    releaseAutoPause(true);
    // 迷迷【我会！帮你！】无「取消回上一步」语义：引擎正等目标输入，
    // 取消=不选目标直接提交（引擎回落 defaultAlly，同自动模式口径）
    if (pending?.kind === 'mimiSupport' && decision) {
      inputRef.current = { action: 'skill', target: undefined };
      setPending(null);
      setSelTarget(null);
      setDecision(null);
      setVersion((v) => v + 1);
      return;
    }
    setPending(null);
    setSelTarget(null);
    setAfterPicks([]);
    setAfterPickTarget(null);
  }

  function pendingNeeds(): { ally: boolean; enemy: boolean } {
    if (!pending) return { ally: false, enemy: false };
    if (pending.kind === 'mimiSupport') return { ally: true, enemy: false };
    const key =
      pending.kind === 'ult'
        ? `${pending.unit}.ult`
        : `${decision?.unitId ?? ''}.${pending.action}`;
    if (pending.kind === 'ult') {
      // 终结技：有我方目标的（周日/晴歌大招等）走 ally；单体/扩散大招走敌方主目标选择
      if (ALLY_TARGET_SKILLS.has(key)) return { ally: true, enemy: false };
      const kind = ALLY_TARGET_KINDS[pending.unit]?.ult;
      return { ally: false, enemy: kind === 'single' || kind === 'blast' };
    }
    return {
      ally: ALLY_TARGET_SKILLS.has(key),
      enemy: pending.action === 'basic',
    };
  }

  function confirmPending(): void {
    if (!pending) return;
    if (pending.kind === 'mimiSupport') {
      // 引擎只判 `'action' in input`，action 值无意义（固定 skill）；目标=所选我方
      if (!decision) return;
      inputRef.current = {
        action: 'skill',
        target: selTarget ? { allyTarget: selTarget as CharId } : undefined,
      };
      setPending(null);
      setSelTarget(null);
      setDecision(null);
      setVersion((v) => v + 1);
      return;
    }
    const { ally, enemy } = pendingNeeds();
    if ((ally || enemy) && !selTarget) return;
    const target: DecisionInput['target'] = enemy
      ? { enemyTarget: (selTarget as string) ?? 'monster3' }
      : ally
        ? { allyTarget: selTarget as CharId }
        : undefined;
    if (pending.kind === 'action') {
      if (!decision) return;
      inputRef.current = {
        action: pending.action,
        target,
        // 技能后立即释放的终结技（点选顺序；空 = 不跟放）
        afterUlts: afterPicks.length > 0 ? afterPicks.map((p) => ({ id: p.id, target: p.target })) : undefined,
      };
      setPending(null);
      setSelTarget(null);
      setAfterPicks([]);
      setAfterPickTarget(null);
      setDecision(null);
      setVersion((v) => v + 1);
    } else {
      const ctl = ctlRef.current;
      if (!ctl || ended) return;
      // 我方目标优先（周日/晴歌大招），单体/扩散大招透传玩家所选敌方主目标
      const ultTarget: TargetPicks | undefined =
        target && target.allyTarget
          ? { allyTarget: target.allyTarget }
          : target && target.enemyTarget
            ? { enemyTarget: target.enemyTarget }
            : undefined;
      logRef.current.push({ kind: 'ult', id: pending.unit, target: ultTarget });
      ctl.requestUlt(pending.unit, ultTarget);
      setPending(null);
      setSelTarget(null);
      releaseAutoPause(false); // 终结技确定释放 → 继续输出
      if (decision) {
        // 决策等待中点终结技 = 立即插队：唤醒引擎（先出 ult 事件再回决策）
        setDecision(null);
        setVersion((v) => v + 1);
      }
      // 运行中点终结技 = 仅入队，引擎在当前回合输出完后的下一循环迭代释放
    }
  }

  // ── 跟放终结技点选（多选、点选顺序连放；需我方目标的先弹二级目标） ──
  function toggleAfterUlt(id: CharId): void {
    if (afterPicks.some((p) => p.id === id)) {
      // 已选中 → 再点 = 移除
      setAfterPicks(afterPicks.filter((p) => p.id !== id));
      return;
    }
    if (ALLY_TARGET_SKILLS.has(`${id}.ult`)) {
      // 裁定：需我方目标的大招（周日/晴歌）→ 弹目标选择，不走主C缺省
      setAfterPickTarget(id);
      return;
    }
    setAfterPicks([...afterPicks, { id }]);
  }

  function chooseAfterTarget(target: CharId): void {
    if (!afterPickTarget) return;
    setAfterPicks([...afterPicks, { id: afterPickTarget, target: { allyTarget: target } }]);
    setAfterPickTarget(null);
  }

  // ── 撤回：回退到上一个可操作回合（重建控制器并按输入日志重放） ─────
  function undo(): void {
    const cfg = configRef.current;
    if (!cfg) return;
    const cps = cpRef.current;
    // 停在决策点时当前点即最后一个 checkpoint → 回退到前一个；运行中 → 回到最后一个
    const targetIdx = decision !== null ? cps.length - 2 : cps.length - 1;
    if (targetIdx < 0 || cps[targetIdx] === undefined) return;
    const targetLen = cps[targetIdx];
    // 截断目标点之后的输入历史与检查点（撤回即放弃未来）
    logRef.current = logRef.current.slice(0, targetLen);
    cpRef.current = cps.slice(0, targetIdx + 1);
    setUndoDepth(cpRef.current.length);
    actionSinceCpRef.current = false;
    inputRef.current = null;
    carryRef.current = null;
    releaseAutoPause(true);
    setPending(null);
    setSelTarget(null);
    setAfterPicks([]);
    setAfterPickTarget(null);
    try {
      const ctl = createInteractiveBattle(cfg);
      const evs: CombatEvent[] = [];
      let step: BattleStep | null = null;
      for (const op of logRef.current) {
        if (op.kind === 'ult') {
          ctl.requestUlt(op.id, op.target);
          continue;
        }
        step = ctl.advance(op.input);
        if (step && step.type === 'event' && step.event.kind !== 'break') evs.push(step.event);
      }
      // 安全吸收：目标检查点末尾必为决策步，正常不会进入循环
      while (step && step.type === 'event') {
        step = ctl.advance();
        if (step && step.type === 'event' && step.event.kind !== 'break') evs.push(step.event);
      }
      ctlRef.current = ctl;
      setEvents(evs);
      setEnded(false);
      if (step && step.type === 'decision') {
        setDecision({ unitId: step.unitId, status: step.status, mimiSupport: step.mimiSupport, predictAfter: step.predictAfter });
        setStatus(step.status);
        if (step.mimiSupport) setPending({ kind: 'mimiSupport' });
      } else if (!step) {
        setDecision(null);
        setEnded(true);
      } else {
        setDecision(null);
      }
      setVersion((v) => v + 1);
    } catch {
      // 重放异常：保持现状（不应发生——输入日志与引擎同构）
    }
  }

  function togglePause(): void {
    setPaused((p) => !p);
  }

  // ── 事件流 → 分组行（# 规则与明细表同构：action 开新 #、ult 并入前 #） ──
  const teamIndex = new Map<string, number>();
  slots.forEach((id, i) => teamIndex.set(id, i + 1));
  for (const ev of events) {
    if (ev.kind === 'action' && ev.unitId && !ev.unitId.startsWith('monster') && !teamIndex.has(ev.unitId)) {
      teamIndex.set(ev.unitId, teamIndex.size + 1);
    }
  }

  const memoPresent = new Set<string>();
  const memoStateName = (): string => {
    const names = (['memo1', 'memo2', 'memo3'] as const)
      .filter((k) => memoPresent.has(k))
      .map((k) => unitName(k));
    return names.length > 0 ? names.join(i18n.language === 'en' ? ', ' : '，') : unitName('memo');
  };
  const applyNotes = (note?: readonly string[]): void => {
    for (const n of note ?? []) {
      if (n === 'summonBeisi') memoPresent.add('memo1');
      else if (n === 'summonQiumi') memoPresent.add('memo2');
      else if (n === 'summonPaiding') memoPresent.add('memo3');
      else if (n === 'exitFever') memoPresent.clear();
    }
  };
  /** note 键 → 本地化（`shHeat@N` 带值由 UI 解析，水砂裁定⑬：热意 N） */
  const noteLabel = (n: string): string =>
    n.startsWith('shHeat@')
      ? `${t('timeline.team.noteLabels.shHeat')} ${n.slice(7)}`
      : t(`timeline.team.noteLabels.${n}`);
  const unitLabelOf = (unitId: string): string => {
    if (!unitId) return '—';
    // 敌方木桩槽（2026-11-01：最多 5 个）
    if ((MONSTER_IDS as readonly string[]).includes(unitId)) {
      return `${t('timeline.sideEnemy')}${unitId.slice(-1)}${bracket(unitName('monster'))}`;
    }
    const n = teamIndex.get(unitId);
    const name = unitId === 'memo' ? memoStateName() : unitName(unitId);
    return n ? `${t('timeline.sideAlly')}${n}${bracket(name)}` : name;
  };

  /** 怪物名（按 id 查图鉴；波次事件显示新一波怪名单用） */
  const monsterName = (id: string | undefined): string => {
    if (!id) return '—';
    const m = MONSTER_ROSTER.find((x) => x.id === id);
    if (!m) return id;
    return i18n.language === 'en' ? m.en : m.zh;
  };
  /** 波次事件（kind:'wave'）的单位列 = 新一波怪名单 */
  const waveMonsterLabel = (ev: { waveMonsters?: { monsterId?: string; name?: string }[] }): string => {
    const list = (ev.waveMonsters ?? []).map((m) => monsterName(m.monsterId));
    return list.length ? list.join(' / ') : '—';
  };

  const eventLabel = (ev: { kind: string; action?: string; wave?: number }): string =>
    ev.kind === 'round'
      ? t('timeline.team.kinds.round')
      : ev.kind === 'victory'
        ? t('battle.victory')
        : ev.kind === 'wave'
          ? t('battle.waveStart', { n: ev.wave ?? 1 })
          : ev.kind === 'ult'
            ? t('timeline.team.kinds.ult')
            : ev.action
              ? t(`timeline.team.actions.${ev.action}`)
              : t('timeline.team.kinds.action');

  const skillLabel = (code: string): string => {
    if (code.startsWith('dot.')) return t(`dotTypes.${code.slice(4)}`);
    if (code.startsWith('monster.')) return t(`enemySkills.${code.slice(8)}`);
    const idx = code.lastIndexOf('.');
    const tail = idx >= 0 ? code.slice(idx + 1) : '';
    if (tail === 'break') return `${skillLabel(code.slice(0, idx))}·${t('battle.skillBreak')}`;
    const map: Record<string, string> = {
      basic: t('timeline.team.actions.basic'),
      skill: t('timeline.team.actions.skill'),
      enhanced: t('timeline.team.actions.enhanced'),
      ult: t('timeline.team.kinds.ult'),
      elation: t('calc.kinds.elation'),
      memo: t('timeline.team.actions.memo'),
      shenjun: t('timeline.team.actions.shenjun'),
      longling: t('timeline.team.actions.longling'),
      technique: t('timeline.team.actions.technique'),
      monster: t('timeline.team.actions.monster'),
      point06: t('noteLabels.ahaPoint06'),
      boon: t('timeline.team.actions.boon'),
      fox: t('timeline.team.actions.fox'),
      talent: t('timeline.team.actions.talent'),
      domain: t('noteLabels.tibaoDomain'),
      e1: t('noteLabels.tibaoE1'),
      tech: t('timeline.team.actions.technique'),
      memSkill: t('timeline.team.actions.memSkill'),
      support: t('timeline.team.actions.memSupport'),
    };
    // 真实技能名（i18n skillNames 收录的角色技能码 → 「通用名·真实名」；未收录码回退通用名）
    const realName = t(`skillNames.${code}`, { defaultValue: '' });
    if (realName) return `${map[tail] ?? code}·${realName}`;
    return map[tail] ?? code;
  };

  /** 每 # 组一行（单 kind 显示类型名；多 kind 视为一次完整攻击只显示「总伤」行，逐段折叠） */
  const buildDetails = (skillCode: string | undefined, hits: HitLog[]): BattleDetailRow[] => {
    if (hits.length === 0) {
      return [{ kind: null, isTotal: false, skills: skillCode ? skillLabel(skillCode) : '—', damage: null, hits: [] }];
    }
    const byKind = new Map<string, HitLog[]>();
    for (const h of hits) byKind.set(h.kind, [...(byKind.get(h.kind) ?? []), h]);
    const skills = (hs: HitLog[]): string =>
      [...new Set(hs.map((h) => h.skillCode))]
        .map(skillLabel)
        .join(i18n.language === 'en' ? ', ' : '、');
    const sum = (hs: HitLog[]): number => hs.reduce((a, h) => a + h.total, 0);
    if (byKind.size === 1) {
      const [kind, hs] = [...byKind.entries()][0];
      return [{ kind: kind as DamageKind, isTotal: false, skills: skills(hs), damage: sum(hs), hits: hs }];
    }
    // 多 kind（如神君击破：直伤+击破触发）：一次完整攻击不按类型拆行，只显示「总伤」一行
    return [{ kind: null, isTotal: true, skills: skills(hits), damage: sum(hits), hits }];
  };

  const hitLine = (h: HitLog): string =>
    `#${h.seq}${h.target ? ` ${unitLabelOf(h.target)}` : ''} ${fmt(h.total)}${h.note ? bracket(h.note) : ''} · ${h.factors
      .map((f) => `${f.key} ${f.value.toFixed(2)}`)
      .join(' × ')}`;
  const renderHitDetails = (row: BattleDetailRow): ReactNode => {
    if (row.hits.length === 0) return '—';
    let body: ReactNode;
    if (row.isTotal) {
      const byKind = new Map<string, HitLog[]>();
      for (const h of row.hits) byKind.set(h.kind, [...(byKind.get(h.kind) ?? []), h]);
      body = [...byKind.entries()].map(([k, hs]) => (
        <div key={k}>
          <strong>{t(`calc.kinds.${k}`)}</strong>
          {hs.map((h) => (
            <div key={h.seq}>{hitLine(h)}</div>
          ))}
        </div>
      ));
    } else {
      body = row.hits.map((h) => <div key={h.seq}>{hitLine(h)}</div>);
    }
    return (
      <details>
        <summary>{row.hits.length > 1 ? t('battle.segments', { n: row.hits.length }) : row.hits.length}</summary>
        {body}
      </details>
    );
  };

  const renderBuffDetails = (
    buffs: Partial<Record<string, BuffSnapshot[]>> | undefined,
  ): ReactNode => {
    if (!buffs) return '—';
    const entries = Object.entries(buffs).filter(
      (pair): pair is [string, BuffSnapshot[]] => pair[1] !== undefined,
    );
    if (entries.length === 0) return '—';
    const count = entries.reduce((a, [, bs]) => a + bs.length, 0);
    return (
      <details>
        <summary>{count}</summary>
        {entries.map(([unitId, bs]) => (
          <details key={unitId} style={{ paddingLeft: 8 }}>
            <summary>
              {unitName(unitId)}
              {bracket(String(bs.length))}
            </summary>
            {bs.map((b, i) => (
              <div
                key={`${b.key}-${b.source}-${i}`}
                style={{ paddingLeft: 8, whiteSpace: 'nowrap' }}
              >
                {b.labelKey ? t(`timeline.team.noteLabels.${b.labelKey}`) : b.key}
                {b.stacks > 1 ? ` ×${b.stacks}` : ''}
                {b.key === 'atkFlat' || b.key === 'shield'
                  ? ` ${Math.round(b.value)}`
                  : ` ${(b.value * 100).toFixed(1)}%`}
                {` · ${bracket(unitName(b.source))}`}
                {b.duration >= 0
                  ? ` · ${t('battle.buffLeft', { n: b.duration })}`
                  : ` · ${t('battle.buffPermanent')}`}
              </div>
            ))}
          </details>
        ))}
      </details>
    );
  };

  // 运行中的累积伤害段（明细表实时渲染；结束后即 result 的同一数组）
  const hitSeq = new Map((ctlRef.current?.hits() ?? []).map((h) => [h.seq, h] as const));

  const groups: SimGroup[] = [];
  let counter = 0;
  let prevMood = 0;
  for (const ev of events) {
    if (ev.kind === 'break') continue;
    // 空敌方行动（怪已死 / 无技能可放）：引擎照记事件（公开契约），明细表不显示这行
    if (isEmptyMonsterTurn(ev)) continue;
    let num: number | null = null;
    // 2026-10 用户裁定：插入的终结技算作目标回合（即将发生的下一 #）的第一行，
    // 而不是上一个回合的最后一行——ult 取 counter+1（不推进 counter），后续同号 action 归并同组。
    if (ev.kind === 'action') num = ++counter;
    // afterSkill：技能后跟放的终结技（同刻同轮次）→ 与该技能共用同一 #
    else if (ev.kind === 'ult') {
      if (ev.afterSkill) num = counter > 0 ? counter : ++counter;
      else num = counter > 0 ? counter + 1 : ++counter;
    }
    const mood = ev.moodAfter ?? prevMood;
    const delta = mood - prevMood;
    prevMood = mood;
    const hits = (ev.hitSeqs ?? [])
      .map((s) => hitSeq.get(s))
      .filter((h): h is HitLog => h !== undefined);
    const row: SimRow = {
      key: `e${groups.length}-${ev.time.toFixed(3)}`,
      num,
      time: ev.time,
      round: ev.round,
      evLabel: eventLabel(ev),
      unitLabel: ev.kind === 'wave' ? waveMonsterLabel(ev) : unitLabelOf(ev.unitId),
      spText: ev.spAfter !== undefined ? String(ev.spAfter) : '—',
      energyText: ev.energyAfter !== undefined ? ev.energyAfter.toFixed(1) : '—',
      moodText: delta !== 0 ? `${mood} (${delta > 0 ? '+' : ''}${delta})` : `${mood}`,
      stacksText: ev.stacks !== undefined ? String(ev.stacks) : '—',
      enhanceText: ev.enhanceAfter !== undefined ? String(ev.enhanceAfter) : '—',
      noteText: [
        ...(ev.note?.map(noteLabel) ?? []),
        ...(ev.enemyHits ?? []).map((h) => {
          const name = rosterName(BATTLE_ROSTER_ID[h.targetId as CharId] ?? h.targetId);
          return `${name} -${fmt(h.damage)}${h.blocked > 0 ? `（${t('battle.shieldShort')}${fmt(h.blocked)}）` : ''}${h.dead ? ` ${t('battle.down')}` : ''}`;
        }),
      ].join('、'),
      details: buildDetails(ev.skillCode, hits),
      buffs: ev.buffs,
    };
    const last = groups[groups.length - 1];
    // 波次事件（kind:'wave'）= 与轮次/回合并列的第三层，单独成组显示
    if (ev.kind === 'wave') groups.push({ num: null, rows: [row] });
    else if (last && (num === null || (last.num !== null && num === last.num))) last.rows.push(row);
    else groups.push({ num, rows: [row] });
    applyNotes(ev.note);
  }

  /** 已输出的全部回合组（用户裁定：所有回合可见，不做滑动窗口裁剪） */
  const visibleGroups = groups;

  /**
   * 未来推演（2026-10 用户裁定：按单位列表替换原 8 行时间线）：
   * 每个在场单位一行，显示其按当前速度预测的下一次行动的行动值；
   * 纯速度跑道推演（只读，不计终结技/追加攻击），预测一圈取各单位首次出现。
   */
  const predictRows =
    started && !ended && ctlRef.current ? ctlRef.current.predict(FUTURE_ROWS) : [];
  const seenUnits = new Set<string>();
  const future: { key: string; time: number; unitLabel: string }[] = [];
  for (const p of predictRows) {
    if (seenUnits.has(p.unitId)) continue;
    seenUnits.add(p.unitId);
    future.push({ key: p.unitId, time: p.time, unitLabel: unitLabelOf(p.unitId) });
  }

  const result: BattleResult | null = ended ? ctlRef.current?.result() ?? null : null;
  const statusText = ended
    ? t('fullsim.ended')
    : pending
      ? t('fullsim.chooseTarget')
      : decision
        ? t('fullsim.waiting')
        : paused
          ? t('fullsim.paused')
          : t('fullsim.running');
  const needs = pendingNeeds();
  const pendingCanConfirm = !!pending && (!(needs.ally || needs.enemy) || selTarget !== null);
  /** 撤回可用：停在决策点需有更早检查点（≥2），运行中/结束回最后检查点（≥1） */
  const canUndo = decision !== null ? undoDepth >= 2 : undoDepth >= 1;
  const pendingKey =
    pending && pending.kind === 'ult'
      ? `${pending.unit}.ult`
      : pending && pending.kind === 'action'
        ? `${decision?.unitId ?? ''}.${pending.action}`
        : '';
  const allyExclude = ALLY_TARGET_EXCLUDE[pendingKey];
  const pendingLabel = !pending
    ? ''
    : pending.kind === 'mimiSupport'
      ? `${unitLabelOf(decision?.unitId ?? '')} · ${t('skillNames.mimi.support')}`
      : pending.kind === 'ult'
        ? `${unitName(pending.unit)} · ${t('timeline.team.kinds.ult')}`
        : `${unitLabelOf(decision?.unitId ?? '')} · ${t(`timeline.team.actions.${pending.action}`)}`;

  // ── 战场可视化数据（图1 式布局） ─────────────────────────────────
  /** 进行中取最新 status；停在该角色决策点时取该步快照；结束后不再实时刷新（取终态） */
  const visStatus: BattleStatus | null = ended ? null : (decision?.status ?? status);
  const visHp: Record<CharId, number> | undefined = ended
    ? result?.finalState.memberHp
    : visStatus?.hp;
  const visShield: Record<CharId, number> | undefined = ended
    ? result?.finalState.memberShield
    : visStatus?.shield;
  const visMonsters: { hp: number; toughness: number; broken: boolean }[] | undefined = ended
    ? result?.finalState.monsters
    : visStatus?.monsters;
  const enemyMaxHp = Number(mHp) || 1;
  const enemyMaxTough = Number(mTough) || 1;
  /** 中间信息区用：累计已造成伤害（战斗结束前直接累加引擎累积的命中段，结束后取报告汇总） */
  const visTotalDamage = ended
    ? (result?.report.totalDamage ?? 0)
    : (ctlRef.current?.hits() ?? []).reduce((s, h) => s + h.total, 0);
  /**
   * 「本行动伤害」= 事件流里最近一次有伤害的行动合计。
   * 不能读动画帧（`stageAnim.frame.totalDamage`）：帧播完就置 null、某些帧本身就是 0，
   * 会导致刚打完就跳回 0，看着像这一下没打出伤害（2026-11-07 战场整备）。
   */
  const lastActionDamage = (() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i];
      if (ev.kind !== 'action' && ev.kind !== 'ult') continue;
      let sum = 0;
      for (const s of ev.hitSeqs ?? []) sum += hitSeq.get(s)?.total ?? 0;
      if (sum > 0) return sum;
    }
    return 0;
  })();
  /** 中间信息区用：双方剩余生命合计（我方含护盾外的当前 HP） */
  const enemyHpLeft = (visMonsters ?? []).reduce((s, m) => s + m.hp, 0);
  /** 召唤物实时状态（主人卡右侧窄卡）：战斗结束后 visStatus 为 null，回落到最后一次快照 */
  const summonRef = useRef<SummonStatus[]>([]);
  if (visStatus?.summons) summonRef.current = visStatus.summons;
  const visSummons: SummonStatus[] = visStatus?.summons ?? summonRef.current;

  // ── 敌方目标点选（2026-10-10）：场景里点 3 个敌方头像即可锁定主目标。
  // 主目标黄框加粗；技能为 blast（扩散）时被引擎 resolveAdjacent 波及的相邻目标只加粗。 ──
  const needsEnemyTarget = pendingNeeds().enemy;
  const needsAllyTarget = pendingNeeds().ally;
  /** 待确认技能的敌方目标类型（与引擎 charAttack 的 skillTag 展开同规则：aoe=全体 / blast=主+相邻 / single=主 / none=无敌方目标） */
  const pendingTargetKind: AllyTargetKind | null =
    pending?.kind === 'action' && decision
      ? (ALLY_TARGET_KINDS[decision.unitId]?.[pending.action] ?? null)
      : pending?.kind === 'ult'
        ? (ALLY_TARGET_KINDS[pending.unit]?.ult ?? null)
        : null;
  /** 群攻（aoe）待确认：黄框高亮给敌方全体，释放者自己不高亮（用户 2026-10-11 裁定） */
  const aoePending = !!pending && pendingTargetKind === 'aoe';
  const enemyKind: AllyTargetKind | null = needsEnemyTarget ? pendingTargetKind : null;
  /** 与引擎 resolveAdjacent 同规则：1↔2↔3↔4↔5 链式相邻（仅存活） */
  const adjacentOf = (id: MonsterId): MonsterId[] => {
    const idx = MONSTER_IDS.indexOf(id as (typeof MONSTER_IDS)[number]);
    const near = [MONSTER_IDS[idx - 1], MONSTER_IDS[idx + 1]].filter((x): x is MonsterId => !!x);
    return near.filter((n) => (visMonsters ?? [])[MONSTER_IDS.indexOf(n)]?.hp > 0);
  };
  const enemyHighlight = (id: MonsterId): 'main' | 'adjacent' | null => {
    // 群攻：存活敌方全体黄框加粗（点任一即确认释放）
    if (aoePending) return (visMonsters ?? [])[MONSTER_IDS.indexOf(id)]?.hp > 0 ? 'main' : null;
    if (!needsEnemyTarget || !selTarget) return null;
    if (selTarget === id) return 'main';
    if (enemyKind === 'blast' && adjacentOf(id).includes(selTarget as MonsterId)) return 'adjacent';
    return null;
  };
  const allyHpLeft = slots.reduce((s, id) => s + (visHp?.[id] ?? 0), 0);
  /** 敌方美术 id：关卡预设取第一只怪；手配木桩时回退无想面具；加载失败（部分怪物无图）时退回 CSS 徽章 */
  const enemyArtId = presetArtId(preset) ?? mMonsterId ?? DEFAULT_MONSTER_ART_ID;
  const enemyArtOk = !artFail[enemyArtId];
  /** 当前轮到的我方角色（场景底部普攻/战技按钮的可用条件） */
  const turnAllyId = !ended && !pending ? decision?.unitId : undefined;
  /** 当前行动者（含待确认阶段，pending 会置空 turnAllyId，此处不可复用） */
  const actingId = !ended ? decision?.unitId : undefined;
  /** 火花【直播连线】进行中（战技开场后同回合多步：战技按钮=互动陷阱、普攻按钮=强化普攻收尾） */
  const hhLinkOn = decision?.unitId === 'huohua' && decision.status.huohuaLink === true;

  // ── 预计算能量：按当前所选行动+目标预测行动后全员能量 → 回满者列为跟放候选 ──
  const afterTarget: TargetPicks | undefined =
    pending?.kind === 'action' && needs.enemy && selTarget
      ? { enemyTarget: selTarget }
      : pending?.kind === 'action' && needs.ally && selTarget
        ? { allyTarget: selTarget as CharId }
        : undefined;
  const afterCandidates: CharId[] =
    pending?.kind === 'action' && decision?.predictAfter
      ? (() => {
          const { energy, caps } = decision.predictAfter({
            action: pending.action,
            target: afterTarget,
          });
          return (Object.keys(energy) as CharId[]).filter((id) => energy[id] >= caps[id]);
        })()
      : [];
  /** 二级目标行的排除（与主目标行同规则：晴歌大招不拉晴歌、周日大招不选周日） */
  const afterPickExclude = afterPickTarget
    ? ALLY_TARGET_EXCLUDE[`${afterPickTarget}.ult`]
    : undefined;


  // ── 战场/命令区入参（2026-11-07 命令区一体化：内联战场改为共用 BattleStage） ──────────
  /** 卡底终结技槽：能量满＝立即插队释放；预估技能后满＝加入跟放；待确认＝点即释放 */
  const ultSlotFor = (id: CharId): ReactNode => {
    const ultOk = (visStatus?.ultReady ?? []).includes(id);
    const ultAfter = afterCandidates.includes(id);
    const ultQueued = afterPicks.some((p) => p.id === id);
    const ultPending = pending?.kind === 'ult' && pending.unit === id;
    const ultMarked = ultPending && ((!needs.ally && !needs.enemy) || selTarget !== null);
    const ultClickable = (ultOk || ultAfter || ultMarked) && !ended;
    const ultTitle = ultMarked
      ? t('fullsim.ultConfirm')
      : ultOk
        ? t('fullsim.ultReadyNow')
        : ultAfter
          ? t('fullsim.ultAfterSkill')
          : t('battle.skillShort.ult');
    const onClick = (): void =>
      ultMarked ? confirmPending() : ultOk ? pickUlt(id) : toggleAfterUlt(id);
    const border = ultMarked
      ? '2px solid #ffd76e'
      : ultOk || ultAfter
        ? '2px solid #ffffff'
        : '1px solid #2a2f45';
    if (ultIconFail[id]) {
      return (
        <button
          type="button"
          className={ultOk ? 'primary' : ''}
          onClick={onClick}
          disabled={!ultClickable}
          title={ultTitle}
          style={{ fontSize: 10, padding: '1px 5px', border }}
        >
          {t('battle.skillShort.ult')}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!ultClickable}
        title={ultTitle}
        style={{
          position: 'relative',
          width: 22,
          height: 22,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          border,
          background: ultMarked || ultOk ? 'rgba(255,215,110,0.2)' : 'rgba(255,255,255,0.03)',
          opacity: ultOk || ultAfter || ultMarked ? 1 : 0.45,
          cursor: ultClickable ? 'pointer' : 'not-allowed',
        }}
      >
        <img
          src={skillIcon(BATTLE_ROSTER_ID[id], 'Ultra')}
          alt={t('battle.skillShort.ult')}
          onError={() => setUltIconFail((s) => ({ ...s, [id]: true }))}
          style={{
            width: 18,
            height: 18,
            display: 'block',
            filter: ultOk ? 'none' : 'grayscale(1) brightness(0.9)',
          }}
        />
        {ultQueued && (
          <span
            style={{
              position: 'absolute',
              right: -1,
              top: -1,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ffd76e',
              border: '1px solid #0f1220',
            }}
          />
        )}
      </button>
    );
  };

  /** 我方卡（黄框=目标已选中/自身目标默认高亮；蓝框=正在行动） */
  const stageAllies: StageAlly[] = slots.map((id) => {
    const roster = rosterById.get(BATTLE_ROSTER_ID[id]);
    const saved = teamPick[id] ? chars.find((c) => c.id === teamPick[id]) : undefined;
    const maxHp = saved?.hp ?? 0;
    const hp = visHp?.[id] ?? 0;
    const dead = maxHp > 0 && hp <= 0;
    // 目标为自身的技能（晴歌/火花战技等）：行动者卡自动高亮并可点按确认；群攻例外（黄框给敌方全体）
    const selfPick = !needsAllyTarget && !needsEnemyTarget && !aoePending && !!pending && actingId === id;
    const pickable = !dead && (selfPick || (needsAllyTarget && id !== allyExclude));
    const marked = pickable && (selTarget === id || (selfPick && selTarget === null));
    return {
      id,
      rosterId: BATTLE_ROSTER_ID[id],
      name: rosterName(BATTLE_ROSTER_ID[id]),
      element: roster?.element,
      path: roster?.path,
      hp,
      maxHp,
      shield: visShield?.[id] ?? 0,
      energy: visStatus?.energy[id] ?? 0,
      energyMax: ENERGY_MAX[id] ?? 1,
      hidden: visStatus?.hiddenScore,
      dead,
      ultReady: (visStatus?.ultReady ?? []).includes(id),
      ultSlot: ultSlotFor(id),
      subField: (visStatus?.pk?.subMembers ?? []).includes(id),
      summons: visSummons
        .filter((s) => s.owner === id)
        .map((s) => ({ ...s, iconSrc: summonIconUrl(s.id) })),
      marked,
      pickable,
      acting: actingId === id,
      onPick: pickable
        ? () => {
            // 已黄框（已选中 / 自身目标默认高亮）→ 点击即确定释放；点其它卡 = 改选
            if (marked) confirmPending();
            else setSelTarget(id);
          }
        : undefined,
    };
  });

  /** 敌方槽（黄框=主目标可点，加粗=扩散波及，不可点） */
  const stageEnemies: StageEnemy[] = (visMonsters ?? []).map((m, i) => {
    const mid = MONSTER_IDS[i];
    const canPick = needsEnemyTarget || aoePending;
    return {
      id: mid,
      name: unitLabelOf(mid),
      hp: m.hp,
      maxHp: enemyMaxHp,
      toughness: m.toughness,
      maxToughness: enemyMaxTough,
      broken: m.broken,
      artId: enemyArtId,
      artOk: enemyArtOk,
      highlight: enemyHighlight(mid),
      pickable: canPick,
      onPick: canPick
        ? () => {
            // 群攻：全体已黄框 → 点任一即释放；单攻/扩散：再点已选中的黄框 = 确认，点其他 = 改选
            if (aoePending || selTarget === mid) confirmPending();
            else setSelTarget(mid);
          }
        : undefined,
    };
  });

  /**
   * 左侧竖排行动条：未来推演里每个单位取「首次出现」（= 下次行动），按行动值升序。
   * 2026-11-07 用户裁定：竖排在战场左侧，替代原来战报里的横向「跑道」。
   */
  const railEntries: RailEntry[] = future.map((f) => {
    const enemy = f.key.startsWith('monster');
    const owner = ownerOfSource(f.key) as CharId;
    const isSummon = owner !== f.key;
    // 召唤物/忆灵只用自己的头像；CDN 无图（神君/龙灵/浮元/晴空乐手）→ imgSrc 为空，
    // ActionRail 会退成「名字文字」，**不能拿主人头像顶上**（用户当场指出那不是神君）
    return {
      id: f.key,
      label: f.unitLabel,
      time: f.time,
      enemy,
      element: elementOfSource(f.key),
      imgSrc: enemy
        ? enemyArtOk
          ? assetUrl(`monster-art/${enemyArtId}.webp`)
          : undefined
        : isSummon
          ? summonIconUrl(f.key)
          : assetUrl(`portraits/${BATTLE_ROSTER_ID[owner]}.webp`),
    };
  });

  /** 待确认的目标按钮（敌方槽 + 敌方召唤物 / 我方成员；与「点场上头像」并存） */
  const pendingTargets: CommandTarget[] = needs.enemy
    ? [
        // 只列本场真实存在的敌方槽（手配/预设可能不足 5 个），避免出现点了没反应的幽灵按钮
        ...MONSTER_IDS.slice(0, (visMonsters ?? []).length).map((mid) => {
          const m = visMonsters?.[MONSTER_IDS.indexOf(mid)];
          const pct = m && enemyMaxHp > 0 ? Math.round((m.hp / enemyMaxHp) * 100) : 0;
          return { id: mid, label: unitLabelOf(mid), note: `${pct}%` };
        }),
        ...(visStatus?.enemyUnits ?? []).map((u) => ({ id: u.id, label: u.name || unitLabelOf(u.id) })),
      ]
    : needs.ally
      ? slots.filter((id) => id !== allyExclude).map((id) => ({ id, label: unitLabelOf(id) }))
      : [];

  /** 底栏当前的待确认视图（null = 无选择流程） */
  const commandPending: PendingView | null = pending
    ? {
        label: pendingLabel,
        hint: needs.enemy
          ? aoePending
            ? t('fullsim.aoeTargets')
            : t('fullsim.pickEnemyTarget')
          : needs.ally
            ? t('fullsim.pickAllyTarget')
            : '',
        targets: pendingTargets,
        selTarget,
        onPick: setSelTarget,
        canConfirm: pendingCanConfirm,
        onConfirm: confirmPending,
        onCancel: cancelPending,
        after:
          pending.kind === 'action'
            ? {
                candidates: afterCandidates.map((id) => ({
                  id,
                  label: t('fullsim.afterUlt', { name: unitLabelOf(id) }),
                  picked: afterPicks.some((p) => p.id === id),
                })),
                onToggle: (id) => toggleAfterUlt(id as CharId),
                picksText: afterPicks
                  .map(
                    (p) =>
                      `${unitLabelOf(p.id)}${p.target?.allyTarget ? `→${unitLabelOf(p.target.allyTarget)}` : ''}`,
                  )
                  .join('、'),
                pickLabel: afterPickTarget
                  ? `${t('fullsim.afterPickTarget', { name: unitLabelOf(afterPickTarget) })}:`
                  : undefined,
                pickOptions: afterPickTarget
                  ? slots
                      .filter((id) => id !== afterPickExclude)
                      .map((id) => ({ id, label: unitLabelOf(id) }))
                  : undefined,
                onChoose: (id) => chooseAfterTarget(id as CharId),
                onCancelPick: () => setAfterPickTarget(null),
              }
            : undefined,
      }
    : null;

  /** 战场 HUD 状态点语义色 */
  const hudTone: SimTone = ended ? 'end' : pending || decision ? 'wait' : paused ? 'pause' : 'run';
  /** 底栏行动者（仅「轮到该角色且未进目标选择」时显示普攻/战技） */
  const barActor = turnAllyId
    ? { name: rosterName(BATTLE_ROSTER_ID[turnAllyId]), rosterId: BATTLE_ROSTER_ID[turnAllyId], acting: true }
    : null;
  const basicLabel = hhLinkOn
    ? `${t('battle.skillShort.basic')}「${t('skillNames.huohua.enhanced')}」`
    : t('battle.skillShort.basic');
  const skillBtnLabel = hhLinkOn
    ? `${t('battle.skillShort.skill')}「${t('skillNames.huohua.trap')}」`
    : turnAllyId === 'huohua'
      ? `${t('battle.skillShort.skill')}「${t('skillNames.huohua.skill')}」`
      : t('battle.skillShort.skill');
  const skillDisabled =
    ((visStatus?.sp ?? 0) < 1 && visStatus?.spFree !== true) ||
    (visStatus?.supreme === true && turnAllyId === 'aglaea');

  /**
   * 中心数据区的「全队共享资源」行（2026-11-07 用户需求）：笑点放在本行动伤害**上方**。
   * 只有欢愉队伍（或已有笑点）才显示，免得非欢愉队伍多一行恒 0 的噪音。
   */
  const laughPoints = visStatus?.laughPoints ?? 0;
  const centerShared =
    slots.some((id) => ELATION_CHAR_IDS.has(id)) || laughPoints > 0
      ? [{ key: 'laugh', label: t('battle.laughPoints'), value: String(laughPoints) }]
      : [];

  /**
   * 键盘快捷键（2026-11-07 第二批）：1 普攻 / 2 战技 / Enter 确定 / Esc 取消 / 空格 暂停继续。
   * 键位映射是纯函数（`shortcutAction`，有单测），这里只管绑事件 + 输入框守卫。
   * 用 ref 转发最新的闭包，effect 只依赖 started，避免每次渲染重绑监听。
   */
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const tag = (el?.tagName ?? '').toUpperCase();
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el?.isContentEditable) return;
    const action = shortcutAction(e.key, {
      canAct: !!turnAllyId,
      pending: !!pending,
      canConfirm: pendingCanConfirm,
      ended,
    });
    if (!action) return;
    e.preventDefault();
    if (action === 'basic') pickAction('basic');
    else if (action === 'skill') pickAction('skill');
    else if (action === 'confirm') confirmPending();
    else if (action === 'cancel') cancelPending();
    else togglePause();
  };
  useEffect(() => {
    if (!started) return;
    const handler = (e: KeyboardEvent): void => shortcutRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [started]);

  /** 战报抽屉：折叠时只显示最近 3 个回合组（用户 2026-11-07 需求） */
  const [logOpen, setLogOpen] = useState(false);
  const recentRows = visibleGroups
    .slice(-3)
    .flatMap((g) => g.rows.flatMap((row) => row.details.map((d) => ({ row, d }))))
    .map((item, i) => ({ ...item, key: `recent-${i}` }));

  return (
    <div>
      {!started && (
        <section className="panel">
          <h2>{t('fullsim.title')}</h2>
          <p className="muted">{t('fullsim.desc')}</p>
          <HintCard id="fullsim" />
          {slots.map((id, idx) => {
            const options = chars.filter((c) => c.rosterId === BATTLE_ROSTER_ID[id]);
            const saved = teamPick[id] ? chars.find((c) => c.id === teamPick[id]) : undefined;
            return (
              <div
                key={id}
                style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
              >
                <span style={{ minWidth: 'var(--slot-min-w)' }}>{slotLabel(id, idx)}</span>
                {/* 主C 单选（2026-10 裁定：增益默认给主C） */}
                <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="fullsim-mainc"
                    checked={mainC === id}
                    onChange={() => setMainC(id)}
                  />
                  {t('fullsim.mainC')}
                </label>
                <select
                  value={teamPick[id]}
                  onChange={(e) => setTeamPick((prev) => ({ ...prev, [id]: e.target.value }))}
                >
                  <option value="">{t('timeline.team.manual')}</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {rosterName(c.rosterId ?? '')}
                    </option>
                  ))}
                </select>
                {id === 'huangquan' && (
                  <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={hqEx} onChange={(e) => setHqEx(e.target.checked)} />
                    {t('battle.hqExLabel')}
                  </label>
                )}
                {id === 'jingyuan' && (
                  <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={jyEx} onChange={(e) => setJyEx(e.target.checked)} />
                    {t('battle.hqExLabel')}
                  </label>
                )}
                {id === 'danhengIL' && (
                  <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={dnEx} onChange={(e) => setDnEx(e.target.checked)} />
                    {t('battle.hqExLabel')}
                  </label>
                )}
                {ELATION_CHAR_IDS.has(id) && (
                  <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={ahaPresent}
                      onChange={(e) => setAhaPresent(e.target.checked)}
                    />
                    {t('battle.ahaPresentLabel')}
                  </label>
                )}
                {ELATION_CHAR_IDS.has(id) && ahaPresent && (
                  <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    {t('battle.ahaSpeedLabel')}
                    <input
                      type="number"
                      min={1}
                      value={ahaSpeed}
                      onChange={(e) => setAhaSpeed(e.target.value)}
                      style={{ width: 80 }}
                    />
                  </label>
                )}
                {!saved && (
                  <>
                    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      {t('timeline.speed')}
                      <input
                        type="number"
                        min={1}
                        value={teamManual[id].speed}
                        onChange={(e) =>
                          setTeamManual((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], speed: e.target.value },
                          }))
                        }
                        style={{ width: 80 }}
                      />
                    </label>
                    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      {t('timeline.team.energyRegen')}
                      <input
                        type="number"
                        step={0.001}
                        min={0}
                        value={teamManual[id].energyRegen}
                        onChange={(e) =>
                          setTeamManual((prev) => ({
                            ...prev,
                            [id]: { ...prev[id], energyRegen: e.target.value },
                          }))
                        }
                        style={{ width: 90 }}
                      />
                    </label>
                  </>
                )}
                {saved && (
                  <span className="muted">
                    {t('timeline.speed')} {saved.speed ?? t('timeline.team.manual')} ·{' '}
                    {t('timeline.team.energyRegen')} {saved.energyRegen ?? 0}
                  </span>
                )}
                {/* 调序/移除（至少保留 1 人；移除主C 时自动转移给第一位） */}
                <button
                  type="button"
                  title="↑"
                  disabled={idx === 0}
                  onClick={() =>
                    setSlots((s) => {
                      const n = [...s];
                      [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                      return n;
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="↓"
                  disabled={idx === slots.length - 1}
                  onClick={() =>
                    setSlots((s) => {
                      const n = [...s];
                      [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]];
                      return n;
                    })
                  }
                >
                  ↓
                </button>
                {slots.length > 1 && (
                  <button
                    type="button"
                    title={t('fullsim.remove')}
                    onClick={() => {
                      setSlots((s) => {
                        const n = s.filter((x) => x !== id);
                        if (mainC === id) setMainC(n[0]);
                        return n;
                      });
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {slots.length < BATTLE_CHAR_IDS.length && (
            <p>
              <button type="button" onClick={() => setPickOpen(true)}>
                {t('fullsim.addChar')}…
              </button>
            </p>
          )}
          <CharPickerModal
            open={pickOpen}
            candidateIds={BATTLE_CHAR_IDS.filter((c) => !slots.includes(c)).map((c) => BATTLE_ROSTER_ID[c])}
            onClose={() => setPickOpen(false)}
            onSelect={(rid) => {
              const id = BATTLE_CHAR_IDS.find((c) => BATTLE_ROSTER_ID[c] === rid);
              if (id) setSlots((s) => (s.includes(id) ? s : [...s, id]));
              setPickOpen(false);
            }}
          />
          <p>
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={techniques}
                onChange={(e) => setTechniques(e.target.checked)}
              />
              {t('timeline.team.techniques')}
            </label>
          </p>
          <p>
            <span style={{ marginRight: 8 }}>{t('battle.roundMode')}</span>
            {(
              [
                ['forgotten', 'battle.roundForgotten'],
                ['arbiter', 'battle.roundArbiter'],
                ['phantom', 'battle.roundPhantom'],
              ] as const
            ).map(([m, key]) => (
              <button
                key={m}
                type="button"
                className={roundMode === m ? 'primary' : undefined}
                onClick={() => pickRoundMode(m)}
                style={{ marginRight: 6 }}
              >
                {t(key)}
              </button>
            ))}
          </p>
          <p>
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('timeline.maxTime')}
              <input
                type="number"
                min={1}
                value={maxTime}
                onChange={(e) => setMaxTime(e.target.value)}
                style={{ width: 90 }}
              />
            </label>
          </p>
          <p>
            <button
              type="button"
              onClick={() => setPackOpen((v) => !v)}
              title={t(packOpen ? 'battle.stagePackClose' : 'battle.stagePackOpen')}
            >
              {`${t('battle.stagePack')} ${packOpen ? '▾' : '▸'}`}
            </button>{' '}
            {preset ? (
              <span className="muted">
                {`${t('battle.stagePackCurrent')}: ${sectionLabel(preset)} · Lv${preset.level} · ${t(
                  'battle.stageTotalHp',
                )} ${fmt(preset.hp)} · ${t('battle.stageTag')} ${preset.tags.join('/')}` +
                (preset.hpBattle !== preset.hp
                  ? ` · ${t('battle.stageBattleHp')} ${fmt(preset.hpBattle)}`
                  : '')}
              </span>
            ) : (
              <span className="muted">{t('battle.stageNone')}</span>
            )}
            <StageMechanicsRow preset={preset} label={t('battle.stageMechanics')} />
          <StageNavRow
            preset={preset}
            onPick={(next) => {
              setMPreset(next.key);
              storage.saveStagePresetKey(next.key);
              pickRoundMode(next.roundMode);
            }}
            prevLabel={t('battle.stagePrev')}
            nextLabel={t('battle.stageNext')}
          />
            {preset && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => {
                    setMPreset('');
                    storage.saveStagePresetKey('');
                  }}
                >
                  {t('battle.stagePackClear')}
                </button>
              </>
            )}
          </p>
          {packOpen && (
            <div style={{ display: 'grid', gap: 6, margin: '4px 0' }}>
              {stageModeViews().map(({ mode, packs }) => (
                <div key={mode}>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {`${t('battle.stageMode')} · ${modeLabel(mode)}`}
                  </div>
                  {packs.map(({ pack, sections }) => (
                    <div
                      key={pack.id}
                      style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '2px 0' }}
                    >
                      <span
                        style={{ minWidth: 170 }}
                        title={
                          pack.modeMechanics.length
                            ? pack.modeMechanics.map((m) => `${m.name}：${m.desc}`).join('\n')
                            : undefined
                        }
                      >
                        {`${t('battle.periodShort', { n: pack.period })} ${pack.title}`}
                        {pack.modeMechanics.length
                          ? ` · ${pack.modeMechanics.map((m) => m.name).join('/')}`
                          : ''}
                      </span>
                      {sections.map((sec) => (
                        <button
                          key={sec.key}
                          type="button"
                          title={
                            sec.mechanics.length
                              ? `${t('battle.stageMechanic')}: ${sec.mechanics
                                  .map((m) => (m.desc ? `${m.name}（${m.desc}）` : m.name))
                                  .join(' / ')}`
                              : undefined
                          }
                          onClick={() => {
                            setMPreset(sec.key);
                            setPackOpen(false);
                            // 选包自动套该模式轮次模式（2026-10-30 裁定 47）
                            pickRoundMode(sec.roundMode);
                          }}
                          style={mPreset === sec.key ? { fontWeight: 700 } : undefined}
                        >
                          {sectionLabel(sec)}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {!preset && (
            <p>
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.monsterPick')}
              <select
                value={mMonsterId}
                onChange={(e) => {
                  setMMonsterId(e.target.value);
                  if (e.target.value) void fillMonster(e.target.value, mLevel);
                }}
              >
                <option value="">{t('battle.monsterManual')}</option>
                {MONSTER_ROSTER.map((m) => (
                  <option key={m.id} value={m.id}>
                    {i18n.language === 'en' ? m.en : m.zh}
                  </option>
                ))}
              </select>
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.level')}
              <input
                type="number"
                min={1}
                value={mLevel}
                onChange={(e) => {
                  setMLevel(e.target.value);
                  if (mMonsterId) void fillMonster(mMonsterId, e.target.value);
                }}
                style={{ width: 70 }}
              />
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.hp')}
              <input
                type="number"
                min={1}
                value={mHp}
                onChange={(e) => setMHp(e.target.value)}
                style={{ width: 110 }}
              />
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.attack')}
              <input
                type="number"
                min={0}
                value={mAttack}
                onChange={(e) => setMAttack(e.target.value)}
                style={{ width: 90 }}
              />
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.elementRes')} %
              <input
                type="number"
                step={0.1}
                value={mElementRes}
                onChange={(e) => setMElementRes(e.target.value)}
                style={{ width: 70 }}
              />
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.effectRes')} %
              <input
                type="number"
                step={0.1}
                value={mEffectRes}
                onChange={(e) => setMEffectRes(e.target.value)}
                style={{ width: 70 }}
              />
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.effectHit')} %
              <input
                type="number"
                step={0.1}
                value={mEffectHit}
                onChange={(e) => setMEffectHit(e.target.value)}
                style={{ width: 70 }}
              />
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.toughness')}
              <input
                type="number"
                min={1}
                value={mTough}
                onChange={(e) => setMTough(e.target.value)}
                style={{ width: 70 }}
              />
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.monsterSpeed')}
              <input
                type="number"
                min={1}
                value={mSpeed}
                onChange={(e) => setMSpeed(e.target.value)}
                style={{ width: 70 }}
              />
            </label>{' '}
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('battle.enemyClass')}
              <select
                value={mClass}
                onChange={(e) => setMClass(e.target.value === 'elite' ? 'elite' : 'normal')}
              >
                <option value="normal">{t('battle.normal')}</option>
                <option value="elite">{t('battle.elite')}</option>
              </select>
            </label>
          </p>
          )}
          {preset && (
            <p className="muted">
              {preset.waves.map((w, i) => (
                <span key={i} style={{ marginRight: 12 }}>
                  {`${t('battle.stageWave')} ${i + 1}: ${w
                    .map((c) => `${c.name ?? c.monsterId} ${fmt(c.hp)}`)
                    .join(' / ')}`}
                </span>
              ))}
            </p>
          )}
          <button
            type="button"
            className="primary"
            onClick={start}
            disabled={slots.length === 0}
          >
            {t('fullsim.start')}
          </button>
          {slots.length === 0 && <p className="muted">{t('fullsim.needMember')}</p>}
          {slots.length > 0 && err && <p className="muted">{t('fullsim.needSaved')}</p>}
          <p className="muted" style={{ fontSize: 12 }}>
            {t('battle.historyTip')}
          </p>
        </section>
      )}

      {started && (
        <>
          {/* ── 战场（2026-11-07 命令区一体化）：立绘区与数值代理页共用 BattleStage，
              命令收进底栏、控制收进顶部 HUD，页面不再是「战场 + 战报 + 操作台」三块 ── */}
          <BattleStage
            header={
              <SimHud
                statusText={statusText}
                tone={hudTone}
                paused={paused}
                ended={ended}
                canUndo={canUndo}
                canFastForward={!ended && !decision && !pending}
                onPause={togglePause}
                onUndo={undo}
                onRestart={restart}
                onFastForward={fastForward}
              />
            }
            allies={stageAllies}
            enemies={stageEnemies}
            rail={<ActionRail entries={railEntries} />}
            sp={visStatus?.sp ?? 0}
            center={{
              round: visStatus?.round ?? '-',
              time: visStatus?.time ?? 0,
              totalDamage: visTotalDamage,
              enemyHpLeft,
              allyHpLeft,
              shared: centerShared,
              actionDamage: lastActionDamage,
            }}
            frame={stageAnim.frame}
            onEnemyArtError={(artId) => setArtFail((s) => ({ ...s, [artId]: true }))}
            footer={
              <CommandBar
                running={!decision && !ended}
                ended={ended}
                paused={paused}
                actor={barActor}
                basicLabel={basicLabel}
                skillLabel={skillBtnLabel}
                skillDisabled={skillDisabled}
                canAct={!!turnAllyId}
                onBasic={() => pickAction('basic')}
                onSkill={() => pickAction('skill')}
                pending={commandPending}
                speed={speed}
                speeds={SPEED_OPTIONS}
                onSpeed={setSpeed}
              />
            }
          />

          {/* ── 战报（2026-11-07）：默认折叠成抽屉——行动跑道 + 最近 3 个回合组；
              完整表格按需展开，不再把操作区挤到首屏之外 ── */}
          <section className="panel">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {t('fullsim.title')}
              <button type="button" onClick={() => setLogOpen((v) => !v)} style={{ fontSize: '0.85em' }}>
                {logOpen ? t('fullsim.collapseLog') : t('fullsim.expandLog')}
              </button>
              <details style={{ fontWeight: 400 }}>
                <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>
                  {t('fullsim.help')}
                </summary>
                <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
                  {t('fullsim.hint')}
                </p>
              </details>
            </h3>
            {result && (
              <p>
                <strong>{result.victory ? t('battle.victory') : t('battle.defeat')}</strong> ·{' '}
                {t('battle.totalDamage')}: {fmt(result.report.totalDamage)} ·{' '}
                {t('battle.totalDamageExpected')}: {fmt(result.report.expectedTotalDamage)} ·{' '}
                {t('timeline.team.totalTime')}: {result.summary.totalTime.toFixed(2)} ·{' '}
                {t('battle.finalRound')}: {result.summary.rounds}
              </p>
            )}
            {result && (
              <p style={{ marginTop: 8 }}>
                <button type="button" className="primary" onClick={saveBattleToHistory}>
                  {battleSaved ? t('battle.saved') : t('battle.saveToHistory')}
                </button>
              </p>
            )}
            <div style={{ marginTop: 10 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                {t('fullsim.recent')}
              </div>
              <table className="log-table">
                <thead>
                  <tr>
                    <th>{t('timeline.index')}</th>
                    <th>{t('timeline.round')}</th>
                    <th>{t('timeline.unit')}</th>
                    <th>{t('battle.skill')}</th>
                    <th>{t('calc.damageKind')}</th>
                    <th>{t('battle.damage')}</th>
                    <th>{t('timeline.team.note')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted">
                        —
                      </td>
                    </tr>
                  )}
                  {recentRows.map(({ row, d, key }) => (
                    <tr key={key}>
                      <td>{row.num ?? '—'}</td>
                      <td>{row.round}</td>
                      <td>{row.unitLabel}</td>
                      <td>{d.skills}</td>
                      <td>
                        {d.kind ? t(`calc.kinds.${d.kind}`) : d.isTotal ? t('battle.totalRow') : '—'}
                      </td>
                      <td>{d.damage === null ? '—' : fmt(d.damage)}</td>
                      <td className="muted">{row.noteText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logOpen && (
              <div
                ref={scrollRef}
                className="log-scroll"
                style={{ maxHeight: 'var(--log-max-h)', marginTop: 10 }}
              >
                <table className="log-table">
                  <thead>
                    <tr>
                      <th className="log-sticky-l">{t('timeline.index')}</th>
                      <th>{t('timeline.time')}</th>
                      <th>{t('timeline.round')}</th>
                      <th>{t('timeline.event')}</th>
                      <th>{t('timeline.team.sp')}</th>
                      <th>{t('timeline.team.energy')}</th>
                      <th>{t('timeline.team.mood')}</th>
                      {(slots.includes('jingyuan') || slots.includes('aglaea') || slots.includes('trailblazerMem') || slots.includes('trailblazerMem2')) && (
                        <th>{t('timeline.team.stacks')}</th>
                      )}
                      <th>{t('timeline.team.enhance')}</th>
                      <th>{t('timeline.unit')}</th>
                      <th>{t('battle.skill')}</th>
                      <th>{t('calc.damageKind')}</th>
                      <th className="log-sticky-r">{t('battle.damage')}</th>
                      <th>{t('battle.buffs')}</th>
                      <th>{t('battle.factors')}</th>
                      <th>{t('timeline.team.note')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleGroups.flatMap((g) =>
                      g.rows.flatMap((row, j) =>
                        row.details.map((d, k) => (
                          <tr key={`${g.num}-${j}-${k}`}>
                            <td className="log-sticky-l">{row.num ?? '—'}</td>
                            <td>{row.time.toFixed(2)}</td>
                            <td>{row.round}</td>
                            <td>{row.evLabel}</td>
                            <td>{row.spText}</td>
                            <td>{row.energyText}</td>
                            <td>{row.moodText}</td>
                            {(slots.includes('jingyuan') || slots.includes('aglaea') || slots.includes('trailblazerMem') || slots.includes('trailblazerMem2')) && (
                              <td>{row.stacksText}</td>
                            )}
                            <td>{row.enhanceText}</td>
                            <td>{row.unitLabel}</td>
                            <td>{d.skills}</td>
                            <td>
                              {d.kind
                                ? t(`calc.kinds.${d.kind}`)
                                : d.isTotal
                                  ? t('battle.totalRow')
                                  : '—'}
                            </td>
                            <td className="log-sticky-r">{d.damage === null ? '—' : fmt(d.damage)}</td>
                            <td className="muted">{renderBuffDetails(row.buffs)}</td>
                            <td className="muted">{renderHitDetails(d)}</td>
                            <td className="muted">{row.noteText}</td>
                          </tr>
                        )),
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </>
      )}
    </div>
  );
}
