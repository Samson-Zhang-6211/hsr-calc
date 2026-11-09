import { useEffect, useState, type ReactNode } from 'react';
import { baseAttackOf } from '../base-attack.js';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { DamageKind, Element } from '@hsr-calc/shared';
import {
  ENERGY_MAX,
  simulateBattleReplay,
  simulateTeamAxis,
  TEAM_ROSTER_ID,
  Timeline,
  monsterElementResistance,
  type AxisResult,
  type BattleConfig,
  type BattleReplayStep,
  type BattleResult,
  type BuffSnapshot,
  type CharId,
  type CombatMember,
  type HitLog,
  type MonsterConfig,
  type RoundMode,
  type TimelineEvent,
  type UnitSide,
  mechanicIdsFor,
} from '@hsr-calc/engine';
import { storage, newId, type StoredBattleEntry, type StoredCharacter } from '../storage.js';
import { CHARACTER_ROSTER } from '../data/character-roster.js';
import { CharPickerModal } from '../char-picker.js';
import { MONSTER_ROSTER } from '../data/monster-roster.js';
import { fillMonsterFields } from '../monster-fill.js';
import {
  presetArtId,
  sanitizeStagePresetKey,
  stageMetaOf,
  stageModeViews,
  stagePreset,
  type StagePackMode,
  type StageSectionPreset,
} from '../monster-presets.js';
import { StageMechanicsRow, StageNavRow } from '../stage-mechanics.js';
import { isEmptyMonsterTurn } from '../stage-events.js';
import { summonIconUrl } from '../summon-art.js';
import {
  BattleStage,
  DEFAULT_MONSTER_ART_ID,
  MONSTER_IDS,
  type StageAlly,
  type StageEnemy,
} from '../battle-stage.js';
import { ownerOfSource, planFrames } from '../battle-anim.js';
import { useBattleAnim } from '../use-battle-anim.js';
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

/**
 * 2026-10 用户裁定：隐藏「四人队行动轴」区块（标题、运行按钮、轴表格，战斗模拟明细表不受影响）。
 * false = 隐藏（轴相关代码与运行逻辑完整保留，改回 true 即恢复）。
 * 四人存档选择与截止行动值被战斗模拟复用，保留在界面上（区块标题改为「我方四人」）。
 */
const SHOW_TEAM_AXIS = false;

/**
 * 战斗回放播放器（2026-10-25 攻击动画批）：组间基础延迟与倍速档位与全真模拟同口径
 * （全真模拟 `BASE_GROUP_DELAY = 3000` / `SPEED_OPTIONS = 0.5…5`）——用户要求两页观感一致。
 */
const REPLAY_BASE_DELAY = 3000;
const REPLAY_SPEEDS = [0.5, 1, 1.5, 2, 3, 5] as const;

/**
 * 回放分组：一个「回合组」= 前导非 action 事件（轮次/波次）+ 一个 action + 其后的
 * ult/追击事件。与全真模拟 `advanceBatch` 的分组语义一致（ult 并入前一 #，不单开组）。
 */
function replayGroupEnd(steps: readonly BattleReplayStep[], from: number): number {
  let i = from;
  while (i < steps.length && steps[i]!.event.kind !== 'action') i += 1;
  if (i >= steps.length) return steps.length;
  i += 1;
  while (i < steps.length && steps[i]!.event.kind !== 'action') i += 1;
  return i;
}

interface UnitRow {
  key: string;
  side: UnitSide;
  speed: string;
  name: string;
}

let nextKey = 1;

function defaultUnits(): UnitRow[] {
  const rows: UnitRow[] = ['134', '150', '90', '120'].map((speed) => ({
    key: `u${nextKey++}`,
    side: 'ally' as const,
    speed,
    name: '',
  }));
  rows.push({ key: `u${nextKey++}`, side: 'enemy', speed: '100', name: '' });
  return rows;
}

/** 手动默认值 = 四人毕业面板（速度 / 充能绳 19.4%） */
const MANUAL_DEFAULTS: Record<CharId, { speed: string; energyRegen: string }> = {
  sanyueqi: { speed: '134', energyRegen: '0.194' },
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
  fuxuan: { speed: '134', energyRegen: '0.194' },
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
];

/** 战斗槽位角色 → 名册 id：轴 TEAM_ROSTER_ID（5 人固定阵容）+ 啊哈 1511 + 爻光 1502 + 火花 1501（轴不接后三者） */
const BATTLE_ROSTER_ID: Record<CharId, string> = {
  sanyueqi: '1001',
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
  fuxuan: '1208',
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

/** 欢愉角色（点运行前弹啊哈对话框，裁定：两页配置区 slots 含任一欢愉角色时触发） */
const ELATION_CHAR_IDS = new Set<CharId>(['aha', 'yaoguang', 'huohua', 'feiying', 'shuisha', 'zhenzhu', 'trailblazer', 'trailblazer2']);

/** 战斗明细的一行：按伤害类型分组后的合计（isTotal = 多类型时的「总伤」行，明细在其中折叠） */
interface BattleDetailRow {
  kind: DamageKind | null;
  isTotal: boolean;
  skills: string;
  damage: number | null;
  hits: HitLog[];
}

/** 行动轴表格行（两套数据源统一 # 规则；战斗源附带明细分组，供战斗明细表逐行对应） */
interface AxisRow {
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
  /** 战斗源：事件时点各单位 buff 快照（明细表折叠展示） */
  buffs?: Partial<Record<string, BuffSnapshot[]>>;
}

export default function TimelinePage() {
  const { t, i18n } = useTranslation();
  const [units, setUnits] = useState<UnitRow[]>(defaultUnits);
  const [rounds, setRounds] = useState(true);
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
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);

  // 每次渲染实时读存档（不用 useState 快照）：角色管理修改后立即生效（2026-10）
  const chars: StoredCharacter[] = storage.getCharacters();
  const [teamPick, setTeamPick] = useState<Record<CharId, string>>({
    sanyueqi: '',
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
    fuxuan: '',
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
  const [teamManual, setTeamManual] = useState(MANUAL_DEFAULTS);
  // 队伍自由化（2026-10 裁定）：槽位可增删（1-4人）+ 调序 + 主C 勾选
  const [slots, setSlots] = useState<CharId[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [mainC, setMainC] = useState<CharId>('jingyuan');
  const [techniques, setTechniques] = useState(true);
  const [teamResult, setTeamResult] = useState<AxisResult | null>(null);
  const [teamError, setTeamError] = useState(false);

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
  const [battle, setBattle] = useState<BattleResult | null>(null);
  const [battleErr, setBattleErr] = useState(false);
  const [battleSaved, setBattleSaved] = useState(false);
  const [searchParams] = useSearchParams();

  // ── 立绘战场区 + 攻击动画回放（2026-10-25） ─────────────────────────
  /** 逐事件战斗状态快照（与 battle 同一次模拟产出，供战场区回放） */
  const [replaySteps, setReplaySteps] = useState<BattleReplayStep[]>([]);
  /** 已回放到第几步（游标；0 = 尚未开始） */
  const [revealed, setRevealed] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const stageAnim = useBattleAnim();
  /** play 是 useCallback 稳定引用：放进 effect 依赖不会每帧重排定时器 */
  const playFrames = stageAnim.play;
  /** 敌方美术加载失败标记（nanoka 怪物图覆盖不全 → 退回序号徽章） */
  const [artFail, setArtFail] = useState<Record<string, boolean>>({});

  // 从历史记录载入（/timeline?battle=<id>，历史页「查看」跳转）
  useEffect(() => {
    const id = searchParams.get('battle');
    if (!id) return;
    const found = storage.getBattleHistory().find((b) => b.id === id);
    if (found) {
      setBattle(found.result);
      setBattleErr(false);
    }
  }, [searchParams]);

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
  const sideLabel = (side: UnitSide, n: number): string =>
    `${t(side === 'ally' ? 'timeline.sideAlly' : 'timeline.sideEnemy')}${n}`;
  const slotLabel = (id: CharId, idx: number): string =>
    `${t('timeline.sideAlly')}${idx + 1}${bracket(rosterName(BATTLE_ROSTER_ID[id]))}`;
  const unitName = (unitId: string): string => t(`timeline.team.unitNames.${unitId}`);

  const nameByKey = new Map<string, string>();
  const counters: Record<UnitSide, number> = { ally: 0, enemy: 0 };
  for (const u of units) {
    const n = counters[u.side]++;
    const base = sideLabel(u.side, n + 1);
    const nm = u.name.trim();
    nameByKey.set(u.key, nm ? base + bracket(nm) : base);
  }

  function patch(key: string, next: Partial<UnitRow>) {
    setUnits((prev) => prev.map((u) => (u.key === key ? { ...u, ...next } : u)));
  }

  function addUnit(side: UnitSide) {
    setUnits((prev) => [
      ...prev,
      { key: `u${nextKey++}`, side, speed: side === 'ally' ? '134' : '100', name: '' },
    ]);
  }

  function run() {
    const horizon = Number(maxTime) > 0 ? Number(maxTime) : 350;
    const valid = units.filter((u) => Number(u.speed) > 0);
    if (valid.length === 0) {
      setEvents([]);
      return;
    }
    const tl = new Timeline({ rounds });
    valid.forEach((u, i) =>
      tl.addUnit({ id: u.key, side: u.side, speed: Number(u.speed), order: i }),
    );
    const out: TimelineEvent[] = [];
    while (out.length < 800) {
      const ev = tl.advance();
      if (!ev || ev.time > horizon) break;
      out.push(ev);
      if (ev.type !== 'roundBoundary') tl.finishAction(ev.unitId);
    }
    setEvents(out);
  }

  function runTeam() {
    const horizon = Number(maxTime) > 0 ? Number(maxTime) : 350;
    // 数值代理轴为 5 人固定阵容（team-axis CharId 独立）：其余角色不进轴，先剔除
    const members = slots
      .filter(
        (id) =>
          id !== 'aha' &&
          id !== 'yaoguang' &&
          id !== 'huohua' &&
          id !== 'langzun' &&
          id !== 'feiying' &&
          id !== 'shuisha' &&
          id !== 'zhenzhu' &&
          id !== 'trailblazer' &&
          id !== 'trailblazer2' &&
          id !== 'trailblazerMem' &&
          id !== 'trailblazerMem2' &&
          id !== 'tibao' &&
          id !== 'huahuo' &&
          id !== 'tails' &&
          id !== 'xiedie' &&
          id !== 'fengjin' &&
          id !== 'changyeyue' &&
          id !== 'xilian' &&
          id !== 'luocha' &&
          id !== 'lingsha' &&
          id !== 'natasha' &&
          id !== 'lynx' &&
          id !== 'bailu' &&
          id !== 'gallagher' &&
          id !== 'hysilens' &&
          id !== 'blackswan' &&
          id !== 'kafka' &&
          id !== 'welt' &&
          id !== 'pela' &&
          id !== 'sampo' &&
          id !== 'yinlang' &&
          id !== 'jiaoqiu' &&
          id !== 'huangquan' &&
          id !== 'qianye' &&
          id !== 'luka' &&
          id !== 'guinaifen' &&
          id !== 'saifeir' &&
          id !== 'dahlia' &&
          id !== 'fugue' &&
          id !== 'cerdra' &&
          id !== 'robin' &&
          id !== 'ruanmei' &&
          id !== 'trailblazerShaman' &&
          id !== 'trailblazerShaman2' &&
          id !== 'asta' &&
          id !== 'bronya' &&
          id !== 'tingyun' &&
          id !== 'yukong' &&
          id !== 'hanya' &&
          id !== 'himeko' &&
          id !== 'rappa' &&
          id !== 'herta' &&
          id !== 'himekoNova' &&
          id !== 'herta4' &&
          id !== 'serval' &&
          id !== 'anaxa' &&
          id !== 'jade' &&
          id !== 'argenti' &&
          id !== 'qingque' &&
          id !== 'rin' &&
          id !== 'blade' &&
          id !== 'jingliu' &&
          id !== 'mydei' &&
          id !== 'saber' &&
          id !== 'gilgamesh' &&
          id !== 'misha' &&
          id !== 'firefly' &&
          id !== 'clara' &&
          id !== 'xueyi' &&
          id !== 'yunli' &&
          id !== 'arlan' &&
          id !== 'hook' &&
          id !== 'trailblazerDestroy' &&
          id !== 'trailblazerDestroy2' &&
          id !== 'danhengIL' &&
          id !== 'phainon' &&
          id !== 'ratio' &&
          id !== 'topaz' &&
          id !== 'archer' &&
          id !== 'boothill' &&
          id !== 'seele' &&
          id !== 'danheng' &&
          id !== 'yanqing' &&
          id !== 'sushang' &&
          id !== 'feixiao' &&
          id !== 'moze' &&
          id !== 'sanyueqi2' &&
          id !== 'ashveil',
      )
      .map((id) => {
        const saved = teamPick[id] ? chars.find((c) => c.id === teamPick[id]) : undefined;
        const m = teamManual[id];
        return {
          id: id as Exclude<
            CharId,
            | 'aha'
            | 'yaoguang'
            | 'huohua'
            | 'huahuo'
            | 'langzun'
            | 'feiying'
            | 'shuisha'
            | 'zhenzhu'
            | 'trailblazer'
            | 'trailblazer2'
            | 'trailblazerMem'
            | 'trailblazerMem2'
            | 'tibao'
            | 'huahuo'
            | 'tails'
            | 'xiedie'
            | 'fengjin'
            | 'changyeyue'
            | 'xilian'
            | 'luocha'
            | 'lingsha'
            | 'natasha'
            | 'lynx'
            | 'bailu'
            | 'gallagher'
            | 'hysilens'
            | 'blackswan'
            | 'kafka'
            | 'welt'
            | 'pela'
            | 'sampo'
            | 'yinlang'
            | 'jiaoqiu'
            | 'huangquan'
            | 'qianye'
            | 'luka'
            | 'guinaifen'
            | 'saifeir'
            | 'dahlia'
            | 'fugue'
            | 'cerdra'
            | 'robin'
            | 'ruanmei'
            | 'trailblazerShaman'
            | 'trailblazerShaman2'
            | 'asta'
            | 'bronya'
            | 'tingyun'
            | 'yukong'
            | 'hanya'
            | 'himeko'
            | 'rappa'
            | 'herta'
            | 'himekoNova'
            | 'herta4'
            | 'serval'
            | 'anaxa'
            | 'jade'
            | 'argenti'
            | 'qingque'
            | 'rin'
            | 'sanyueqi'
            | 'fuxuan'
            | 'trailblazerKnight'
            | 'trailblazerKnight2'
            | 'gepard'
            | 'aventurine'
            | 'blade'
            | 'jingliu'
            | 'mydei'
            | 'saber'
            | 'gilgamesh'
            | 'misha'
            | 'firefly'
            | 'clara'
            | 'xueyi'
            | 'yunli'
            | 'arlan'
            | 'hook'
            | 'trailblazerDestroy'
            | 'trailblazerDestroy2'
            | 'danhengIL'
            | 'phainon'
            | 'archer'
            | 'boothill'
            | 'seele'
            | 'danheng'
            | 'yanqing'
            | 'sushang'
            | 'ratio'
            | 'topaz'
            | 'feixiao'
            | 'moze'
            | 'sanyueqi2'
            | 'ashveil'
          >,
          speed: Number(saved?.speed ?? m.speed) || 0,
          energyRegen: Number(saved?.energyRegen ?? m.energyRegen) || 0,
        };
      });
    if (members.some((m) => m.speed <= 0)) {
      setTeamResult(null);
      setTeamError(true);
      setBattle(null);
      return;
    }
    setTeamError(false);
    setBattle(null);
    setTeamResult(simulateTeamAxis({ members, rounds, maxTime: horizon, techniques }));
  }

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

  function runBattle() {
    if (slots.length === 0) {
      setBattle(null);
      setBattleErr(true);
      return;
    }
    const horizon = Number(maxTime) > 0 ? Number(maxTime) : 350;
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
    const built: CombatMember[] = [];
    for (const id of slots) {
      const saved = teamPick[id] ? chars.find((c) => c.id === teamPick[id]) : undefined;
      if (!saved) {
        setBattle(null);
        setBattleErr(true);
        return;
      }
      const fallback = MANUAL_DEFAULTS[id];
      built.push({
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
    const monsterCfg: MonsterConfig = {
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
    setBattleErr(false);
    // 关卡预设 → 波次阵容（每波最多 3 只，对应 monster1/2/3 槽）；否则走手配单怪
    const stageWaves = preset ? preset.waves : undefined;
    // 关卡级机制（2026-10-30 rulings 15~19 = A）：站点中文名 → 引擎 id
    const stageMechanics = preset
      ? mechanicIdsFor(preset.mechanics.map((m) => m.name))
      : [];
    try {
      // 2026-10-25 攻击动画批：改用「带逐事件状态」的入口——报告与 simulateBattle 完全一致，
      // 额外拿到 steps 供立绘战场区逐组回放（每步 = 事件 + 该时刻的 HP/韧性/能量/SP 快照）
      const replay = simulateBattleReplay({
        members: built,
        monster: stageWaves ? undefined : monsterCfg,
        monsterWaves: stageWaves,
        mechanics: stageMechanics.length > 0 ? stageMechanics : undefined,
        // 【虚构叙事】波次推进（裁定 56）：只在 pure 段预设上出现，其余模式 undefined
        waveClearRule: preset?.waveClearRule,
        pureKillTarget: preset?.pureKillTarget,
        rounds: 10,
        maxTime: horizon,
        roundMode,
        mainC: slots.includes(mainC) ? mainC : slots[0],
        elationAha,
        huangquanEx: slots.includes('huangquan') ? hqEx : undefined,
        jingyuanEx: slots.includes('jingyuan') ? jyEx : undefined,
        danhengILEx: slots.includes('danhengIL') ? dnEx : undefined,
      });
      setBattle(replay.result);
      setReplaySteps(replay.steps);
      // 出结果即自动回放（用户按倍速控制；「全显」可一次看到终态）
      setRevealed(0);
      setReplaySpeed(1);
      setReplayPlaying(replay.steps.length > 0);
      stageAnim.stop();
    } catch {
      setBattle(null);
      setReplaySteps([]);
      setRevealed(0);
      setReplayPlaying(false);
      stageAnim.stop();
      setBattleErr(true);
    }
  }

  /** 保存完整战斗结果到历史记录（历史页「战斗模拟」区可回看整表） */
  function saveBattleToHistory() {
    if (!battle) return;
    const entry: StoredBattleEntry = {
      id: newId(),
      time: Date.now(),
      total: battle.report.totalDamage,
      summary: [
        `${t('battle.finalRound')} ${battle.summary.rounds}`,
        `${t('timeline.team.totalTime')} ${battle.summary.totalTime.toFixed(2)}`,
        `${t('battle.totalDamage')} ${fmt(battle.report.totalDamage)}`,
      ].join(' · '),
      // 关卡上下文（第四十六轮）：选了关卡段才有；历史页据此回看「打的哪一段、有哪些机制」
      stage: stageMetaOf(preset),
      result: battle,
    };
    storage.saveBattleHistory([entry, ...storage.getBattleHistory()]);
    setBattleSaved(true);
    setTimeout(() => setBattleSaved(false), 1500);
  }

  const counts = new Map<string, number>();
  if (events) {
    for (const ev of events) {
      if (ev.type !== 'roundBoundary') {
        counts.set(ev.unitId, (counts.get(ev.unitId) ?? 0) + 1);
      }
    }
  }

  /**
   * 行动轴数据源：战斗优先（点「运行战斗」后，轴表改用同一次战斗的事件流渲染，
   * 保证与战斗明细表逐行对应）；独立「运行」按钮保留原样，且会清空战斗结果。
   */
  const axisEvents = battle ? battle.events : (teamResult?.events ?? []);
  const axisCounts: Record<string, number> =
    (battle ? battle.summary.actionCounts : teamResult?.summary.actionCounts) ?? {};

  /** 我方编号：四人固定 1~4（编队顺序），召唤物/倒计时按事件流首次行动追加；木桩不编号 */
  const teamIndex = new Map<string, number>();
  slots.forEach((id, i) => teamIndex.set(id, i + 1));
  for (const ev of axisEvents) {
    if (ev.kind === 'action' && ev.unitId && !ev.unitId.startsWith('monster') && !teamIndex.has(ev.unitId)) {
      teamIndex.set(ev.unitId, teamIndex.size + 1);
    }
  }

  const teamUnitLabel = (unitId: string): string => {
    const n = teamIndex.get(unitId);
    const name = unitName(unitId);
    return n ? `${t('timeline.sideAlly')}${n}${bracket(name)}` : name;
  };
  const battleUnitLabel = (unitId: string): string =>
    t(`timeline.team.unitNames.${unitId}`, { defaultValue: unitId });
  const fmt = (v: number): string => Math.round(v).toLocaleString();

  /**
   * 忆灵在场状态：三忆灵合并为一个单位「我方N」的三种状态
   * （我方N（贝茜）/（贝茜，啾米）/（贝茜，啾米，派丁））。
   * 按事件流 notes 累推；渲染某行标签时用该事件**之前**的状态，渲染后再应用本事件 notes。
   */
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
  /** 轴表单位标签：三木桩走「敌方1/2/3（木桩）」，其余「我方N（名）」（名 = 忆灵实时状态名） */
  const axisUnitLabel = (unitId: string): string => {
    if (!unitId) return '—';
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

  /** skillCode（jingyuan.skill / qingge.memo / dot.burn / x.skill.break）→ 本地化技能名 */
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

  /** 战斗源：事件 hitSeqs → 每 # 组一行（单 kind 显示类型名；多 kind 视为一次完整攻击只显示「总伤」行，逐段折叠） */
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

  /**
   * 行动轴行（# 只记独立回合：action 各占新 #；终结技并入前一 #；轮次边界/胜利不占）。
   * 战斗源跳过 break 事件（其 hitSeqs 与同刻 action 重复），两表行集因此完全一致。
   * 气氛列含 Δ。
   */
  const axisRows: AxisRow[] = [];
  let counter = 0;
  let prevMood = 0;
  const moodTextOf = (moodAfter: number | undefined): string => {
    const mood = moodAfter ?? prevMood;
    const delta = mood - prevMood;
    prevMood = mood;
    return delta !== 0 ? `${mood} (${delta > 0 ? '+' : ''}${delta})` : `${mood}`;
  };
  /** AxisEvent / CombatEvent 的公共字段（两套数据源共用同一渲染） */
  type AxisEventLike = {
    time: number;
    round: number;
    kind: string;
    unitId: string;
    action?: string;
    spAfter?: number;
    energyAfter?: number;
    stacks?: number;
    enhanceAfter?: number;
    /** 波次号（波次模式；与轮次/回合并列的第三层） */
    wave?: number;
    /** 换波事件携带的新一波怪名单 */
    waveMonsters?: { monsterId?: string; name?: string; hp: number }[];
  };
  const baseRow = (
    key: string,
    ev: AxisEventLike,
    num: number | null,
  ): Omit<AxisRow, 'moodText' | 'noteText' | 'details'> => ({
    key,
    num,
    time: ev.time,
    round: ev.round,
    evLabel: eventLabel(ev),
    unitLabel: ev.kind === 'wave' ? waveMonsterLabel(ev) : axisUnitLabel(ev.unitId),
    spText: ev.spAfter !== undefined ? String(ev.spAfter) : '—',
    energyText: ev.energyAfter !== undefined ? ev.energyAfter.toFixed(1) : '—',
    stacksText: ev.stacks !== undefined ? String(ev.stacks) : '—',
    enhanceText: ev.enhanceAfter !== undefined ? String(ev.enhanceAfter) : '—',
  });

  /**
   * 已回放到的事件数（2026-10-25 攻击动画批）：明细表与战场区一起按回放进度裁剪。
   * 没有快照时（历史记录载入的旧战报）视为全部已显示，保持旧行为。
   */
  const revealedCount = replaySteps.length > 0 ? revealed : (battle?.events.length ?? 0);

  if (battle) {
    const hitBySeq = new Map(battle.hits.map((h) => [h.seq, h] as const));
    for (const ev of battle.events.slice(0, revealedCount)) {
      if (ev.kind === 'break') continue;
      // 空敌方行动（怪已死 / 无技能可放）：引擎照记事件（公开契约），明细表不显示这行
      if (isEmptyMonsterTurn(ev)) continue;
      let num: number | null = null;
      if (ev.kind === 'action') num = ++counter;
      else if (ev.kind === 'ult') num = counter > 0 ? counter : ++counter;
      const hits = (ev.hitSeqs ?? [])
        .map((s) => hitBySeq.get(s))
        .filter((h): h is HitLog => h !== undefined);
      axisRows.push({
        ...baseRow(`b${axisRows.length}`, ev, num),
        moodText: moodTextOf(ev.moodAfter),
        noteText: [
          ...(ev.note?.map(noteLabel) ?? []),
          ...(ev.enemyHits ?? []).map((h) => {
            const name = rosterName(BATTLE_ROSTER_ID[h.targetId as CharId] ?? h.targetId);
            return `${name} -${fmt(h.damage)}${h.blocked > 0 ? `（${t('battle.shieldShort')}${fmt(h.blocked)}）` : ''}${h.dead ? ` ${t('battle.down')}` : ''}`;
          }),
        ].join('、'),
        details: buildDetails(ev.skillCode, hits),
        buffs: ev.buffs,
      });
      applyNotes(ev.note);
    }
  } else if (teamResult) {
    for (const ev of teamResult.events) {
      if (isEmptyMonsterTurn(ev)) continue;
      let num: number | null = null;
      if (ev.kind === 'action') num = ++counter;
      else if (ev.kind === 'ult') num = counter > 0 ? counter : ++counter;
      axisRows.push({
        ...baseRow(`t${ev.index}`, ev, num),
        moodText: moodTextOf(ev.moodAfter),
        noteText: ev.note?.map(noteLabel).join('、') ?? '',
        details: [],
      });
      applyNotes(ev.note);
    }
  }

  // ── 立绘战场区数据（2026-10-25 攻击动画批） ────────────────────────
  /** 出手者 id → 元素（召唤物归主人）：直伤飘字配色用 */
  const elementOfSource = (source: string): string | undefined => {
    const owner = ownerOfSource(source);
    const pick = teamPick[owner as CharId];
    const saved = pick ? chars.find((c) => c.id === pick) : undefined;
    return saved?.element;
  };

  /** 出手者 id → 立绘 rosterId（召唤物归主人）：终结技左侧立绘切镜用（2026-10-26） */
  const portraitOfSource = (source: string): string | undefined => {
    const owner = ownerOfSource(source);
    const pick = teamPick[owner as CharId];
    return pick ? chars.find((c) => c.id === pick)?.id ?? pick : undefined;
  };
  /** 战场区当前状态：末个已回放步的快照；0 步时退化为「尚未开局」（血流条按 0 显示） */
  const stageStatus =
    replaySteps.length > 0
      ? (replaySteps[Math.max(0, Math.min(revealed, replaySteps.length) - 1)]?.status ?? null)
      : null;
  /** 回放累计伤害 = 已回放事件的命中段之和（与全真模拟「累计已造成伤害」同口径） */
  const stageDamage = (() => {
    if (!battle) return 0;
    const seqs = new Set<number>();
    for (const ev of battle.events.slice(0, revealedCount)) {
      for (const s of ev.hitSeqs ?? []) seqs.add(s);
    }
    let sum = 0;
    for (const h of battle.hits) if (seqs.has(h.seq)) sum += h.total;
    return sum;
  })();
  const presetWave0 = preset?.waves?.[0];
  /** 敌方美术：关卡预设取第一只怪；手配木桩回退无想面具（与全真模拟同口径） */
  const stageArtId = presetArtId(preset) ?? mMonsterId ?? DEFAULT_MONSTER_ART_ID;
  const stageEnemies: StageEnemy[] = MONSTER_IDS.map((mid, i) => {
    const st = stageStatus?.monsters[i];
    const nm = presetWave0?.[i]?.name;
    return {
      id: mid,
      name: `${t('timeline.sideEnemy')}${i + 1}${nm ? bracket(nm) : ''}`,
      hp: st?.hp ?? 0,
      maxHp: presetWave0?.[i]?.hp ?? (Number(mHp) || 1),
      toughness: st?.toughness ?? 0,
      maxToughness: Number(mTough) || 1,
      broken: st?.broken ?? false,
      artId: stageArtId,
      artOk: !artFail[stageArtId],
    };
  });
  const stageAllies: StageAlly[] = slots.map((id) => {
    const saved = teamPick[id] ? chars.find((c) => c.id === teamPick[id]) : undefined;
    const roster = rosterById.get(BATTLE_ROSTER_ID[id]);
    const hp = stageStatus?.hp[id] ?? 0;
    return {
      id,
      rosterId: BATTLE_ROSTER_ID[id],
      name: rosterName(BATTLE_ROSTER_ID[id]),
      ...(roster?.element ? { element: roster.element } : {}),
      ...(roster?.path ? { path: roster.path } : {}),
      hp,
      maxHp: saved?.hp ?? 0,
      shield: stageStatus?.shield[id] ?? 0,
      energy: stageStatus?.energy[id] ?? 0,
      energyMax: ENERGY_MAX[id] ?? 1,
      dead: hp <= 0,
      ultReady: (stageStatus?.ultReady ?? []).includes(id),
      summons: (stageStatus?.summons ?? [])
        .filter((s) => s.owner === id)
        .map((s) => ({ ...s, iconSrc: summonIconUrl(s.id) })),
      // 【连麦PK】被隔离到副战场的角色（火花大会 5014010，裁定 51：页面要标出）
      subField: (stageStatus?.pk?.subMembers ?? []).includes(id),
    };
  });

  // ── 回放播放循环：组间延迟 ÷ 倍速；每组吐一组攻击动画（与全真模拟 pump 同观感） ──
  useEffect(() => {
    if (!replayPlaying || replaySteps.length === 0) return;
    if (revealed >= replaySteps.length) {
      setReplayPlaying(false);
      return;
    }
    const delay = revealed === 0 ? 0 : REPLAY_BASE_DELAY / replaySpeed;
    const timer = setTimeout(() => {
      const end = replayGroupEnd(replaySteps, revealed);
      const group = replaySteps.slice(revealed, end);
      setRevealed(end);
      const frames = planFrames(
        group.map((s) => s.event),
        battle?.hits ?? [],
        {
          speed: replaySpeed,
          elementOf: elementOfSource,
          labelOf: (ev) => (ev.skillCode ? skillLabel(ev.skillCode) : undefined),
          portraitOf: portraitOfSource,
        },
      );
      if (frames.length > 0) playFrames(frames);
    }, delay);
    return () => clearTimeout(timer);
    // elementOfSource / skillLabel 是每次渲染重建的内联闭包：故意不进依赖（只吃倍速与游标），
    // 否则每次渲染都会清掉并重排定时器，回放永远推进不了。
  }, [replayPlaying, revealed, replaySteps, replaySpeed, battle, playFrames]);

  /** 明细行的折叠内容：逐段 = #seq 目标 总伤（段注）· 乘区；总伤行按伤害类型分组 */
  const hitLine = (h: HitLog): string =>
    `#${h.seq}${h.target ? ` ${axisUnitLabel(h.target)}` : ''} ${fmt(h.total)}${h.note ? bracket(h.note) : ''} · ${h.factors
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

  /** 事件时点各单位 buff 快照的折叠展示（明细表每行一份，按单位分组） */
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

  return (
    <div>
      <section className="panel">
        <h2>{SHOW_TEAM_AXIS ? t('timeline.team.title') : t('battle.pickTeam')}</h2>
        <HintCard id="timeline" />
        {SHOW_TEAM_AXIS && <p className="muted">{t('timeline.team.desc')}</p>}
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
                  name="timeline-mainc"
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
        {SHOW_TEAM_AXIS && (
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
        )}
        {SHOW_TEAM_AXIS && (
          <p>
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={rounds}
                onChange={(e) => setRounds(e.target.checked)}
              />
              {t('timeline.rounds')}
            </label>
          </p>
        )}
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
        {SHOW_TEAM_AXIS && (
          <>
            <button type="button" className="primary" onClick={runTeam}>
              {t('timeline.run')}
            </button>
            {teamError && <p className="muted">{t('timeline.team.needChars')}</p>}
          </>
        )}
      </section>

      {SHOW_TEAM_AXIS && (battle || teamResult) && (
        <section className="panel">
          <h3>{t('timeline.team.title')}</h3>
          <table>
            <thead>
              <tr>
                <th>{t('timeline.index')}</th>
                <th>{t('timeline.time')}</th>
                <th>{t('timeline.round')}</th>
                <th>{t('timeline.event')}</th>
                <th>{t('timeline.unit')}</th>
                <th>{t('timeline.team.sp')}</th>
                <th>{t('timeline.team.energy')}</th>
                <th>{t('timeline.team.mood')}</th>
                <th>{t('timeline.team.stacks')}</th>
                <th>{t('timeline.team.enhance')}</th>
                <th>{t('timeline.team.note')}</th>
              </tr>
            </thead>
            <tbody>
              {axisRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.num ?? '—'}</td>
                  <td>{row.time.toFixed(2)}</td>
                  <td>{row.round}</td>
                  <td>{row.evLabel}</td>
                  <td>{row.unitLabel}</td>
                  <td>{row.spText}</td>
                  <td>{row.energyText}</td>
                  <td>{row.moodText}</td>
                  <td>{row.stacksText}</td>
                  <td>{row.enhanceText}</td>
                  <td className="muted">{row.noteText}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>{t('timeline.units')}</h3>
          <table>
            <thead>
              <tr>
                <th>{t('timeline.index')}</th>
                <th>{t('timeline.unit')}</th>
                <th>{t('timeline.count')}</th>
              </tr>
            </thead>
            <tbody>
              {[...teamIndex.entries()]
                .sort((a, b) => a[1] - b[1])
                .map(([unitId, idx]) => (
                  <tr key={unitId}>
                    <td>{idx}</td>
                    <td>{teamUnitLabel(unitId)}</td>
                    <td>{axisCounts[unitId] ?? 0}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!battle && teamResult && (
            <p className="muted">
              {t('timeline.team.ultCount')}: {teamResult.summary.ultCount} ·{' '}
              {t('timeline.team.spFinal')}: {teamResult.summary.spFinal} ·{' '}
              {t('timeline.team.mood')}: {teamResult.summary.mood} ·{' '}
              {t('timeline.team.totalTime')}: {teamResult.summary.totalTime.toFixed(2)} ·{' '}
              {t('timeline.team.finalRound')}: {teamResult.summary.rounds} ·{' '}
              {t('timeline.team.finalStacks')}: {teamResult.finalState.stacks} ·{' '}
              {t('timeline.team.finalShield')}: {teamResult.finalState.shieldTurns} ·{' '}
              {t('timeline.team.finalBlessed')}: {teamResult.finalState.blessedTurns} ·{' '}
              {t('timeline.team.finalFever')}: {teamResult.finalState.fever ? '✓' : '—'}
            </p>
          )}
        </section>
      )}
      {SHOW_TEAM_AXIS && !battle && !teamResult && teamError === false && (
        <section className="panel">
          <p className="muted">{t('timeline.team.needRun')}</p>
        </section>
      )}

      <section className="panel">
        <h3>{t('battle.title')}</h3>
        <p className="muted">{t('battle.desc')}</p>
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
          onClick={runBattle}
          disabled={slots.length === 0}
        >
          {t('battle.run')}
        </button>
        {slots.length === 0 && <p className="muted">{t('battle.needMember')}</p>}
        {slots.length > 0 && battleErr && <p className="muted">{t('battle.needSaved')}</p>}
        <p className="muted" style={{ fontSize: 12 }}>
          {t('battle.historyTip')}
        </p>
        <p className="muted">{t('battle.skillLevels')}</p>
        {slots.map((id, idx) => {
          const saved = teamPick[id] ? chars.find((c) => c.id === teamPick[id]) : undefined;
          const lv = {
            basic: 10,
            skill: 10,
            ult: 10,
            talent: 10,
            memoSkill: 10,
            ...saved?.skillLevels,
          };
          const parts = [
            `${t('battle.skillShort.basic')}${lv.basic}`,
            `${t('battle.skillShort.skill')}${lv.skill}`,
            `${t('battle.skillShort.ult')}${lv.ult}`,
            `${t('battle.skillShort.talent')}${lv.talent}`,
          ];
          if (id === 'qingge') parts.push(`${t('battle.skillShort.memo')}${lv.memoSkill}`);
          return (
            <span key={id} style={{ display: 'block' }}>
              {slotLabel(id, idx)}：{parts.join(' · ')}
            </span>
          );
        })}
      </section>

      {/* ── 立绘战场区（2026-10-25 攻击动画批）：与全真模拟同一组件，此处只做回放 ── */}
      {battle && replaySteps.length > 0 && (
        <BattleStage
          allies={stageAllies}
          enemies={stageEnemies}
          sp={stageStatus?.sp ?? 0}
          center={{
            round: stageStatus?.round ?? 0,
            time: stageStatus?.time ?? 0,
            totalDamage: stageDamage,
            enemyHpLeft: (stageStatus?.monsters ?? []).reduce((s, m) => s + m.hp, 0),
            allyHpLeft: slots.reduce((s, id) => s + (stageStatus?.hp[id] ?? 0), 0),
            actionDamage: stageAnim.frame?.totalDamage ?? 0,
          }}
          frame={stageAnim.frame}
          onEnemyArtError={(id) => setArtFail((s) => ({ ...s, [id]: true }))}
          extraCenter={
            <div
              className="muted"
              style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11 }}
              title={t('fullsim.replayProgress')}
            >
              <span>{t('fullsim.replayProgress')}</span>
              <span>
                {revealed}/{replaySteps.length}
              </span>
            </div>
          }
          footer={
            <>
              <span className="muted" style={{ fontSize: 12 }}>
                {t('fullsim.speed')}
              </span>
              {REPLAY_SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={replaySpeed === s ? 'primary' : ''}
                  onClick={() => setReplaySpeed(s)}
                >
                  {s}×
                </button>
              ))}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="primary"
                onClick={() => setReplayPlaying((p) => !p)}
                disabled={!replayPlaying && revealed >= replaySteps.length}
              >
                {replayPlaying ? t('fullsim.pause') : t('fullsim.resume')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevealed(0);
                  stageAnim.stop();
                  setReplayPlaying(true);
                }}
              >
                {t('fullsim.replay')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevealed(replaySteps.length);
                  stageAnim.stop();
                  setReplayPlaying(false);
                }}
              >
                {t('fullsim.showAll')}
              </button>
            </>
          }
        />
      )}

      {battle && (
        <section className="panel">
          <h3>
            {t('battle.title')}
            <button
              type="button"
              onClick={saveBattleToHistory}
              style={{ marginLeft: 12, fontSize: '0.85em' }}
            >
              {battleSaved ? t('battle.saved') : t('battle.saveToHistory')}
            </button>
          </h3>
          <p>
            {battle.victory ? t('battle.victory') : t('battle.defeat')} ·{' '}
            {t('battle.totalDamage')}: {fmt(battle.report.totalDamage)} ·{' '}
                {t('battle.totalDamageExpected')}: {fmt(battle.report.expectedTotalDamage)} ·{' '}
            {t('timeline.team.totalTime')}: {battle.summary.totalTime.toFixed(2)} ·{' '}
            {t('battle.finalRound')}: {battle.summary.rounds} ·{' '}
            {t('timeline.team.spFinal')}: {battle.summary.spFinal} ·{' '}
            {t('timeline.team.mood')}: {battle.summary.mood} ·{' '}
            {t('timeline.team.finalFever')}: {battle.finalState.fever ? '✓' : '—'}
            {slots.includes('aha') && (
              <>
                {' · '}
                {t('battle.willPower')}: {battle.finalState.willPower} ·{' '}
                {t('battle.laughPoints')}: {battle.finalState.laughPoints}
              </>
            )}
          </p>
          <p className="muted">
            {t('battle.allyHp')}:{' '}
            {slots.map((id, i) => {
              const saved = teamPick[id] ? chars.find((c) => c.id === teamPick[id]) : undefined;
              const hp = battle.finalState.memberHp[id] ?? 0;
              const shield = battle.finalState.memberShield[id] ?? 0;
              return (
                <span key={id} style={{ marginRight: 10 }}>
                  {i > 0 && ' · '}
                  {rosterName(BATTLE_ROSTER_ID[id])} {fmt(hp)}/{fmt(saved?.hp ?? 0)}
                  {shield > 0 && `（${t('battle.shieldShort')} ${fmt(shield)}）`}
                </span>
              );
            })}
          </p>
          <h4>{t('battle.byKind')}</h4>
          <table>
            <thead>
              <tr>
                <th>{t('calc.damageKind')}</th>
                <th>{t('battle.damage')}</th>
              </tr>
            </thead>
            <tbody>
              {(
                Object.entries(battle.report.byKind) as [string, number | undefined][]
              ).map(([k, v]) => (
                <tr key={k}>
                  <td>{t(`calc.kinds.${k}`)}</td>
                  <td>{fmt(v ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>{t('battle.bySource')}</h4>
          <table>
            <thead>
              <tr>
                <th>{t('battle.source')}</th>
                <th>{t('battle.damage')}</th>
                <th>{t('battle.hits')}</th>
              </tr>
            </thead>
            <tbody>
              {battle.report.bySource.map((s) => (
                <tr key={s.source}>
                  <td>{battleUnitLabel(s.source)}</td>
                  <td>{fmt(s.damage)}</td>
                  <td>{s.hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>{t('battle.bySkill')}</h4>
          <table>
            <thead>
              <tr>
                <th>{t('battle.source')}</th>
                <th>{t('battle.skill')}</th>
                <th>{t('battle.damage')}</th>
                <th>{t('battle.hits')}</th>
              </tr>
            </thead>
            <tbody>
              {battle.report.bySkill.map((s) => (
                <tr key={`${s.source}.${s.skillCode}`}>
                  <td>{battleUnitLabel(s.source)}</td>
                  <td>{skillLabel(s.skillCode)}</td>
                  <td>{fmt(s.damage)}</td>
                  <td>{s.hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>
            {t('battle.log')} ({battle.hits.length})
          </h4>
          <div className="log-scroll">
            <table className="log-table">
              <thead>
                <tr>
                  <th className="log-sticky-l">{t('timeline.index')}</th>
                  <th>{t('timeline.time')}</th>
                  <th>{t('timeline.round')}</th>
                  <th>{t('timeline.event')}</th>
                  <th>{t('timeline.unit')}</th>
                  <th>{t('timeline.team.sp')}</th>
                  <th>{t('timeline.team.energy')}</th>
                  <th>{t('timeline.team.mood')}</th>
                  {(slots.includes('jingyuan') || slots.includes('aglaea') || slots.includes('trailblazerMem') || slots.includes('trailblazerMem2')) && (
                    <th>{t('timeline.team.stacks')}</th>
                  )}
                  <th>{t('timeline.team.enhance')}</th>
                  <th>{t('battle.skill')}</th>
                  <th>{t('calc.damageKind')}</th>
                  <th className="log-sticky-r">{t('battle.damage')}</th>
                  <th>{t('battle.buffs')}</th>
                  <th>{t('battle.factors')}</th>
                  <th>{t('timeline.team.note')}</th>
                </tr>
              </thead>
              <tbody>
                {axisRows.flatMap((g) =>
                  g.details.map((row, j) => (
                    <tr key={`${g.key}-${j}`}>
                      <td className="log-sticky-l">{g.num ?? '—'}</td>
                      <td>{g.time.toFixed(2)}</td>
                      <td>{g.round}</td>
                      <td>{g.evLabel}</td>
                      <td>{g.unitLabel}</td>
                      <td>{g.spText}</td>
                      <td>{g.energyText}</td>
                      <td>{g.moodText}</td>
                      {(slots.includes('jingyuan') || slots.includes('aglaea') || slots.includes('trailblazerMem') || slots.includes('trailblazerMem2')) && (
                        <td>{g.stacksText}</td>
                      )}
                      <td>{g.enhanceText}</td>
                      <td>{row.skills}</td>
                      <td>
                        {row.kind
                          ? t(`calc.kinds.${row.kind}`)
                          : row.isTotal
                            ? t('battle.totalRow')
                            : '—'}
                      </td>
                      <td className="log-sticky-r">{row.damage === null ? '—' : fmt(row.damage)}</td>
                      <td className="muted">{renderBuffDetails(g.buffs)}</td>
                      <td className="muted">{renderHitDetails(row)}</td>
                      <td className="muted">{g.noteText}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h3>{t('timeline.title')}</h3>
        <p className="muted">{t('timeline.desc')}</p>
        <h4>{t('timeline.units')}</h4>
        {units.map((u) => (
          <div
            key={u.key}
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
          >
            <span style={{ minWidth: 64 }}>{nameByKey.get(u.key)}</span>
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('chars.name')}
              <input
                type="text"
                value={u.name}
                onChange={(e) => patch(u.key, { name: e.target.value })}
                style={{ width: 100 }}
              />
            </label>
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {t('timeline.speed')}
              <input
                type="number"
                min={1}
                value={u.speed}
                onChange={(e) => patch(u.key, { speed: e.target.value })}
                style={{ width: 90 }}
              />
            </label>
            <button
              type="button"
              onClick={() => patch(u.key, { side: u.side === 'ally' ? 'enemy' : 'ally' })}
            >
              {u.side === 'ally' ? t('timeline.sideAlly') : t('timeline.sideEnemy')}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => setUnits((prev) => prev.filter((x) => x.key !== u.key))}
            >
              {t('timeline.remove')}
            </button>
          </div>
        ))}
        <p>
          <button type="button" onClick={() => addUnit('ally')}>
            {t('timeline.addAlly')}
          </button>{' '}
          <button type="button" onClick={() => addUnit('enemy')}>
            {t('timeline.addEnemy')}
          </button>
        </p>
        <button type="button" className="primary" onClick={run}>
          {t('timeline.run')}
        </button>
      </section>

      <section className="panel">
        <h4>{t('timeline.title')}</h4>
        {events === null ? (
          <p className="muted">{t('timeline.empty')}</p>
        ) : events.length === 0 ? (
          <p className="muted">{t('timeline.needUnits')}</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>{t('timeline.index')}</th>
                  <th>{t('timeline.time')}</th>
                  <th>{t('timeline.round')}</th>
                  <th>{t('timeline.event')}</th>
                  <th>{t('timeline.unit')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{ev.time.toFixed(2)}</td>
                    <td>{ev.round}</td>
                    <td>
                      {ev.type === 'roundBoundary' ? t('timeline.evRound') : t('timeline.evAction')}
                    </td>
                    <td>{ev.type === 'roundBoundary' ? '—' : nameByKey.get(ev.unitId) ?? ev.unitId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h4>{t('timeline.summary')}</h4>
            <table>
              <thead>
                <tr>
                  <th>{t('timeline.unit')}</th>
                  <th>{t('timeline.count')}</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.key}>
                    <td>{nameByKey.get(u.key)}</td>
                    <td>{counts.get(u.key) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
