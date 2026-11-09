import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { Element } from '@hsr-calc/shared';
import {
  allocateEffectiveRelicSubs,
  generateRelicSubstats,
  mainAffixValue,
  type CritCap,
  type RelicTier,
} from '@hsr-calc/engine';
import { relicSubTierValues, relicSubValue } from '../relic-pieces.js';
import { critBudget } from '../crit-budget.js';
import { CHARACTER_ROSTER } from '../data/character-roster.js';
import { CharPickerModal } from '../char-picker.js';
import { EquipmentPick, LightconePickerModal, RelicSetPickerModal } from '../equipment-picker.js';
import { assetUrl } from '../asset-url.js';
import { characterMainStat, type MainStatKind } from '../data/main-stats.js';
import { LIGHTCONE_ROSTER } from '../data/lightcone-roster.js';
import { RELICSET_ROSTER } from '../data/relicset-roster.js';
import { SIGNATURE_LIGHTCONES } from '../data/signature-lightcones.js';
import { orderLightcones } from '../lightcone-order.js';
import {
  fetchCharacterDetail,
  fetchAllocConfig,
  fetchEffectiveSubstats,
  fetchLightconeDetail,
  fetchRelicSetDetail,
  formatSkillDesc,
  mainAffixesFor,
  subAffixesFor,
  type CharacterDetail,
  type LightconeDetail,
  type RelicSetDetail,
} from '../game-data.js';
import { buildLoadout, lightconePathMatches } from '../loadout-panel.js';
import { OcrPanel } from '../ocr-panel.js';
import type { OcrBuildPatch, OcrFormPatch } from '../ocr/index.js';
import { BATTLE_ROSTER_ID } from './FullSimPage.js';
import { HintCard } from '../hint-card.js';
import {
  storage,
  newId,
  parseSnapshot,
  serializeSnapshot,
  SNAPSHOT_VERSION,
  type RelicPieceState,
  type RelicSubState,
  type SaveSnapshot,
  type StoredCharacter,
} from '../storage.js';

/** 战斗引擎已接入的名册 id 集合（战斗槽位白名单，与 FullSim/Timeline 同源）——
 * 用于星魂子句显示口径：已接入角色的星魂 unknown 子句改标「战斗模拟已接入」 */
const BATTLE_ROSTER_IDS: ReadonlySet<string> = new Set(Object.values(BATTLE_ROSTER_ID));

function num(v: string): number {
  const n = Number(v.replace(/[％%]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function pct(v: string): number {
  return num(v) / 100;
}

function toPctInput(value: number): string {
  return String(+(value * 100).toFixed(4));
}

const RELIC_SLOTS = [1, 2, 3, 4, 5, 6];
const SUB_AFFIX_ROWS = 4;

function defaultRelicPieces(): RelicPieceState[] {
  return RELIC_SLOTS.map(() => ({
    rarity: 5,
    enhance: 15,
    mainProperty: '',
    subs: Array.from({ length: SUB_AFFIX_ROWS }, () => ({ property: '', rolls: 1 })),
  }));
}

/** 词条数值展示：Delta 固定值原样，百分比词条 ×100 */
function formatAffixValue(property: string, value: number): string {
  if (property.endsWith('Delta')) return String(+value.toFixed(2));
  return `${+(value * 100).toFixed(2)}%`;
}

/** 主属性 → i18n 键（列表「主属性」列显示名称：生命/攻击/防御/特殊） */
const STAT_LABEL_KEYS: Record<MainStatKind, string> = {
  hp: 'chars.statHp',
  atk: 'chars.statAtk',
  def: 'chars.statDef',
  special: 'chars.statSpecial',
};

const ELEMENT_KEYS = [
  'Physical',
  'Fire',
  'Ice',
  'Thunder',
  'Wind',
  'Quantum',
  'Imaginary',
] as const;

const emptyForm = {
  rosterId: '',
  level: '80',
  atk: '2000',
  hp: '10000',
  def: '1000',
  critRate: '5',
  critDmg: '50',
  breakEffect: '0',
  commonBonus: '0',
  elementDmg: {
    Physical: '0',
    Fire: '0',
    Ice: '0',
    Thunder: '0',
    Wind: '0',
    Quantum: '0',
    Imaginary: '0',
  },
  speed: '100',
  energyRegen: '0',
  elationDegree: '0',
  effectHit: '0',
  effectRes: '0',
  healBonus: '0',
  basicLevel: '6',
  skillLevel: '10',
  ultLevel: '10',
  talentLevel: '10',
};

/** 回填：elementDmg 缺省时旧 damageBonus 按「该角色属性」解释（旧档零迁移） */
function elementDmgFormOf(
  c: { damageBonus: number; elementDmg?: Partial<Record<Element, number>> },
  selfElement: string | undefined,
): Record<(typeof ELEMENT_KEYS)[number], string> {
  const out = {} as Record<(typeof ELEMENT_KEYS)[number], string>;
  for (const k of ELEMENT_KEYS) {
    const v = c.elementDmg?.[k] ?? (k === selfElement ? c.damageBonus : 0);
    out[k] = toPctInput(v);
  }
  return out;
}

export default function CharactersPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState<StoredCharacter[]>(storage.getCharacters());
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState<'manual' | 'equipment'>('manual');

  /** 存档导入：校验通过、等待用户确认覆盖的快照（null = 没有待确认项） */
  const [snapPending, setSnapPending] = useState<SaveSnapshot | null>(null);
  const [snapError, setSnapError] = useState<{ reason: string; found?: string } | null>(null);
  const snapFileRef = useRef<HTMLInputElement>(null);

  const [gameDetail, setGameDetail] = useState<CharacterDetail | null>(null);
  const [gameLoading, setGameLoading] = useState(false);
  const [gameError, setGameError] = useState(false);
  const [panelCharLevel, setPanelCharLevel] = useState('80');
  const [panelCharPromotion, setPanelCharPromotion] = useState(6);
  const [lightconeId, setLightconeId] = useState('');
  const [lcPickerOpen, setLcPickerOpen] = useState(false);
  const [relicPicker, setRelicPicker] = useState<null | { kind: 'four' | 'planar'; target: 'main' | 'second' | 'planar' }>(null);
  const [lightcone, setLightcone] = useState<LightconeDetail | null>(null);
  const [lightconeLoading, setLightconeLoading] = useState(false);
  const [lightconeError, setLightconeError] = useState(false);
  const [refinement, setRefinement] = useState(1);
  const [lcLevel, setLcLevel] = useState('80');
  const [lcPromotion, setLcPromotion] = useState(6);
  const [relicsetId, setRelicsetId] = useState('');
  const [relicsetId2, setRelicsetId2] = useState('');
  const [planarsetId, setPlanarsetId] = useState('');
  const [eidolonLevel, setEidolonLevel] = useState(0);
  const [pickOpen, setPickOpen] = useState(false);
  const [relicsetDetails, setRelicsetDetails] = useState<Record<string, RelicSetDetail>>({});
  const [relicsetLoading, setRelicsetLoading] = useState(false);
  const [relicsetError, setRelicsetError] = useState(false);
  const [traceChecked, setTraceChecked] = useState<Record<string, boolean>>({});
  const [relicPieces, setRelicPieces] = useState<RelicPieceState[]>(defaultRelicPieces);
  /** 新版遗器方案：每部位生成时的初始词条数（3 → 补词条后强化 4 次 / 4 → 强化 5 次） */
  const [genCounts, setGenCounts] = useState<(3 | 4)[]>(() =>
    RELIC_SLOTS.map(() => 4),
  );
  /** 新版遗器方案：随机种子（留空 = 随机并回填；同种子同部位同主词条同结果） */
  const [genSeed, setGenSeed] = useState('');
  /** 按档分配：套装档位（A/S/SS/SSS）与最近一次分配的有效 roll 结果（显示用） */
  const [genTier, setGenTier] = useState<RelicTier>('S');
  const [allocInfo, setAllocInfo] = useState<{
    actual: number;
    target: number;
    maxRolls?: number;
    critWarning?: boolean;
  } | null>(null);
  /** 分配失败原因（i18n 键 calc.panel.*：allocNeedChar/allocNoEff/allocFail） */
  const [allocError, setAllocError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);

  const rosterById = new Map(CHARACTER_ROSTER.map((c) => [c.id, c]));
  const displayName = (c: StoredCharacter): string => {
    const r = rosterById.get(c.rosterId ?? '');
    if (!r) return c.name;
    return i18n.language === 'en' ? r.en : r.zh;
  };
  const lang = i18n.language === 'en' ? 'en' : 'zh';
  const charRoster = form.rosterId ? rosterById.get(form.rosterId) : undefined;
  const orderedLightcones = orderLightcones(LIGHTCONE_ROSTER, {
    path: charRoster?.path,
    // 2026-10-29 用户裁定：专武置顶只对 5★ 角色生效，开拓者（80xx）除外
    rarity: charRoster?.rarity,
    isTrailblazer: !!charRoster?.id.startsWith('80'),
    signatureId: charRoster ? SIGNATURE_LIGHTCONES[charRoster.id] : undefined,
    lang,
  });

  function persist(next: StoredCharacter[]) {
    storage.saveCharacters(next);
    setList(next);
  }

  /** 导入 JSON 数组（与现有 id 同则覆盖）；名册内角色的名称/属性以名册为准 */
  function importJson() {
    try {
      const parsed: unknown = JSON.parse(importText);
      if (!Array.isArray(parsed)) throw new Error('not array');
      const byId = new Map(list.map((c) => [c.id, c]));
      for (const raw of parsed) {
        const c = raw as StoredCharacter;
        if (!c || typeof c !== 'object' || !c.id || !c.name) throw new Error('bad record');
        const r = rosterById.get(c.rosterId ?? '');
        byId.set(c.id, r ? { ...c, name: r.zh, element: r.element } : c);
      }
      persist([...byId.values()]);
      setImportOpen(false);
      setImportText('');
      setImportError(false);
    } catch {
      setImportError(true);
    }
  }

  /**
   * 导出存档（2026-11-08）：四类 localStorage 数据打包成一个 JSON 文件下载。
   * 面板、计算历史、战报与上次选中的关卡段都在里面；不含任何图片/资源。
   */
  function exportSnapshot() {
    const snap = storage.exportSnapshot();
    const blob = new Blob([serializeSnapshot(snap)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = url;
    a.download = `hsr-save-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** 选中存档文件 → 只做解析校验，**不立刻写库**（等用户在确认条里点覆盖） */
  async function pickSnapshotFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 清空 value：否则连续选同一个文件不会再触发 change
    e.target.value = '';
    if (!file) return;
    setSnapError(null);
    const res = parseSnapshot(await file.text());
    if (!res.ok) {
      setSnapPending(null);
      setSnapError({ reason: res.reason, found: res.found });
      return;
    }
    setSnapPending(res.snapshot);
  }

  /** 确认覆盖：写回 localStorage 并同步页面列表状态 */
  function applyPendingSnapshot() {
    if (!snapPending) return;
    if (!storage.applySnapshot(snapPending)) {
      setSnapError({ reason: 'storage' });
      return;
    }
    setList(snapPending.characters);
    setSnapPending(null);
    setSnapError(null);
  }

  /** 失败原因 → 文案（固定映射，避免拼 i18n key 绕过中英对称检查） */
  function snapshotErrorText(e: { reason: string; found?: string }): string {
    if (e.reason === 'invalid-json') return t('chars.snapshot.errJson');
    if (e.reason === 'version') {
      return t('chars.snapshot.errVersion', { found: e.found ?? '?', current: SNAPSHOT_VERSION });
    }
    if (e.reason === 'shape') return t('chars.snapshot.errShape');
    if (e.reason === 'storage') return t('chars.snapshot.errStorage');
    return t('chars.snapshot.errNotSnapshot');
  }

  /**
   * 截图识别结果 → 手填表单。铁律（2026-10-28）：识别到的是游戏内**最终面板**，
   * 所有非条件子句已计入；这里只写 manual 字段，build 仍由「纯登记」选择器维护，
   * 绝不在这里重算装备/行迹（否则会双计）。
   */
  function applyOcr(rosterId: string, patch: OcrFormPatch, _draft?: unknown, build?: OcrBuildPatch) {
    const isNew = editing === null;
    const skillForm = build?.skillLevels
      ? {
          basicLevel: String(build.skillLevels.basic ?? 6),
          skillLevel: String(build.skillLevels.skill ?? 10),
          ultLevel: String(build.skillLevels.ult ?? 10),
          talentLevel: String(build.skillLevels.talent ?? 10),
        }
      : {};
    if (isNew) {
      setEditing('new');
      resetEquipment();
      setForm({
        ...emptyForm,
        ...patch,
        ...skillForm,
        rosterId,
        elementDmg: { ...emptyForm.elementDmg, ...(patch.elementDmg ?? {}) },
      });
    } else {
      setForm((prev) => ({
        ...prev,
        ...patch,
        ...skillForm,
        rosterId,
        elementDmg: { ...prev.elementDmg, ...(patch.elementDmg ?? {}) },
      }));
    }
    if (build?.lightconeId !== undefined) setLightconeId(build.lightconeId);
    if (build?.refinement !== undefined) setRefinement(build.refinement);
    if (build?.relicsetId !== undefined) setRelicsetId(build.relicsetId);
    if (build?.relicsetId2 !== undefined) setRelicsetId2(build.relicsetId2);
    if (build?.planarsetId !== undefined) setPlanarsetId(build.planarsetId);
    if (build?.eidolonLevel !== undefined) setEidolonLevel(build.eidolonLevel);
    setMode('manual');
    setOcrOpen(false);
  }

  function resetEquipment() {
    setGameDetail(null);
    setGameLoading(false);
    setGameError(false);
    setPanelCharLevel('80');
    setPanelCharPromotion(6);
    setLightconeId('');
    setLightcone(null);
    setLightconeLoading(false);
    setLightconeError(false);
    setRefinement(1);
    setLcLevel('80');
    setLcPromotion(6);
    setRelicsetId('');
    setRelicsetId2('');
    setPlanarsetId('');
    setEidolonLevel(0);
    setRelicsetDetails({});
    setRelicsetLoading(false);
    setRelicsetError(false);
    setTraceChecked({});
    setRelicPieces(defaultRelicPieces());
  }

  async function loadCharDetail(rosterId: string) {
    if (!rosterId) {
      setGameDetail(null);
      return;
    }
    setGameLoading(true);
    setGameError(false);
    try {
      setGameDetail(await fetchCharacterDetail(rosterId, lang));
    } catch {
      setGameError(true);
    } finally {
      setGameLoading(false);
    }
  }

  async function onLightconeChange(id: string) {
    setLightconeId(id);
    setLightcone(null);
    setLightconeError(false);
    if (!id) return;
    setLightconeLoading(true);
    try {
      setLightcone(await fetchLightconeDetail(id, lang));
    } catch {
      setLightconeError(true);
    } finally {
      setLightconeLoading(false);
    }
  }

  async function loadRelicset(id: string) {
    if (!id || relicsetDetails[id]) return;
    setRelicsetLoading(true);
    setRelicsetError(false);
    try {
      const detail = await fetchRelicSetDetail(id, lang);
      setRelicsetDetails((prev) => ({ ...prev, [id]: detail }));
    } catch {
      setRelicsetError(true);
    } finally {
      setRelicsetLoading(false);
    }
  }

  async function onRosterChange(id: string) {
    setForm({ ...form, rosterId: id });
    if (mode === 'equipment') await loadCharDetail(id);
  }

  function onModeChange(next: 'manual' | 'equipment') {
    setMode(next);
    if (next === 'equipment' && form.rosterId && !gameDetail) {
      void loadCharDetail(form.rosterId);
    }
  }

  function startAdd() {
    setEditing('new');
    setForm(emptyForm);
    resetEquipment();
    setMode('manual');
  }

  async function startEdit(c: StoredCharacter) {
    setEditing(c.id);
    setForm({
      rosterId: c.rosterId ?? '',
      level: String(c.level),
      atk: String(c.atk),
      hp: String(c.hp),
      def: String(c.def),
      critRate: toPctInput(c.critRate),
      critDmg: toPctInput(c.critDmg),
      breakEffect: toPctInput(c.breakEffect),
      commonBonus: toPctInput(c.commonBonus ?? 0),
      elementDmg: elementDmgFormOf(c, rosterById.get(c.rosterId ?? '')?.element),
      speed: String(c.speed ?? 100),
      energyRegen: toPctInput(c.energyRegen ?? 0),
      elationDegree: toPctInput(c.elationDegree ?? 0),
      effectHit: toPctInput(c.effectHit ?? 0),
      effectRes: toPctInput(c.effectRes ?? 0),
      healBonus: toPctInput(c.healBonus ?? 0),
      basicLevel: String(c.skillLevels?.basic ?? 6),
      skillLevel: String(c.skillLevels?.skill ?? 10),
      ultLevel: String(c.skillLevels?.ult ?? 10),
      talentLevel: String(c.skillLevels?.talent ?? 10),
    });
    resetEquipment();
    const eq = c.equipment;
    setMode(c.mode === 'equipment' && eq ? 'equipment' : 'manual');
    // 手动模式恢复星魂（战斗页读 build.eidolonLevel；resetEquipment 已置 0）
    if (!(c.mode === 'equipment' && eq)) {
      setEidolonLevel(eq?.eidolonLevel ?? c.build?.eidolonLevel ?? 0);
      // 手动模式「纯登记」选择器初值：光锥/叠影/遗器来自 build（纯登记，不加载详情；
      // startAdd 走 resetEquipment 清空 → 新档为未登记）
      setLightconeId(c.build?.lightconeId ?? '');
      setRefinement(c.build?.refinement ?? 1);
      setRelicsetId(c.build?.relicsetId ?? '');
      setRelicsetId2(c.build?.relicsetId2 ?? '');
      setPlanarsetId(c.build?.planarsetId ?? '');
    }
    if (c.mode === 'equipment' && eq) {
      setPanelCharLevel(String(eq.charLevel));
      setPanelCharPromotion(eq.charPromotion);
      setLcLevel(String(eq.lcLevel));
      setLcPromotion(eq.lcPromotion);
      setRefinement(eq.refinement);
      setTraceChecked(eq.traceChecked ?? {});
      setRelicPieces(eq.relicPieces?.length ? eq.relicPieces : defaultRelicPieces());
      // 旧存档兼容：位面套曾存在 relicsetId 里，迁移到 planarsetId
      let cavernId = eq.relicsetId;
      let planarId = eq.planarsetId ?? '';
      if (!planarId && cavernId) {
        const old = RELICSET_ROSTER.find((s) => s.id === cavernId);
        if (old && !old.fourPiece) {
          planarId = cavernId;
          cavernId = '';
        }
      }
      setRelicsetId(cavernId);
      setRelicsetId2(eq.relicsetId2 ?? '');
      setPlanarsetId(planarId);
      setEidolonLevel(eq.eidolonLevel ?? c.build?.eidolonLevel ?? 0);
      await Promise.all([
        loadCharDetail(c.rosterId ?? ''),
        eq.lightconeId ? onLightconeChange(eq.lightconeId) : Promise.resolve(),
        loadRelicset(cavernId),
        loadRelicset(eq.relicsetId2 ?? ''),
        loadRelicset(planarId),
      ]);
    }
  }

  const setA = relicsetId ? (relicsetDetails[relicsetId] ?? null) : null;
  const setB = relicsetId2 ? (relicsetDetails[relicsetId2] ?? null) : null;
  const planarSet = planarsetId ? (relicsetDetails[planarsetId] ?? null) : null;

  // 面板烘焙统一走 loadout-panel（展示柜导入共用同一份实现）
  const {
    charWhite,
    lcWhite,
    clauses: equipmentClauses,
    panel: panelStats,
  } = buildLoadout(
    {
      rosterId: form.rosterId,
      charLevel: num(panelCharLevel),
      charPromotion: panelCharPromotion,
      lcLevel: num(lcLevel),
      lcPromotion,
      lightconeId,
      refinement,
      relicsetId,
      relicsetId2,
      planarsetId,
      eidolonLevel,
      traceChecked,
      relicPieces,
    },
    {
      charDetail: gameDetail,
      lightcone,
      relicSets: relicsetDetails,
      battleRosterIds: BATTLE_ROSTER_IDS,
    },
  );

  const updatePiece = (index: number, patch: Partial<RelicPieceState>) => {
    setRelicPieces((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const updateSub = (pieceIndex: number, subIndex: number, patch: Partial<RelicSubState>) => {
    setRelicPieces((prev) =>
      prev.map((p, i) =>
        i === pieceIndex
          ? {
              ...p,
              subs: p.subs.map((s, j) => (j === subIndex ? { ...s, ...patch } : s)),
            }
          : p,
      ),
    );
  };

  /** 新版遗器方案：随机生成该部位 5星 +15 副词条（主词条保持手选，缺省取首项）。
   * 种子输入框留空 → 随机取种并回填；同种子按部位派生，整套各部位互不相同且可复现。 */
  function randomizePiece(index: number) {
    const slot = index + 1;
    const mains = mainAffixesFor(5, slot);
    const mainProperty = relicPieces[index].mainProperty || mains[0]?.property || '';
    if (!mainProperty) return;
    const pool = subAffixesFor(5).filter((a) => a.property !== mainProperty);
    const input = genSeed.trim();
    const parsed = Number(input);
    const explicit = input !== '' && Number.isFinite(parsed);
    const baseSeed = explicit ? parsed >>> 0 : (Math.random() * 4294967296) >>> 0;
    if (!explicit) setGenSeed(String(baseSeed));
    const seed = (baseSeed + slot * 0x9e3779b9) >>> 0;
    const result = generateRelicSubstats({
      subPool: pool,
      subCount: genCounts[index],
      seed,
    });
    setRelicPieces((prev) =>
      prev.map((p, i) =>
        i === index
          ? {
              ...p,
              rarity: 5,
              enhance: 15,
              mainProperty,
              subs: result.subs.map((s) => ({
                property: s.property,
                rolls: s.rolls,
                value: s.value,
                tiers: s.tiers,
              })),
            }
          : p,
      ),
    );
  }

  /** 按档分配整套：读当前编辑角色的有效词条（meta.effectiveSubstats），按档位算套装目标
   *（floor(满配×比例)），随机决定每件 3/4 词条数并把目标随机拆到 6 件。
   * 强制 5星+15；主词条保持手选；种子留空随机并回填（同种子同结果）。 */
  async function allocateSet() {
    setAllocInfo(null);
    setAllocError(null);
    const rid = form.rosterId;
    if (!rid) {
      setAllocError('allocNeedChar');
      return;
    }
    const effective = await fetchEffectiveSubstats(rid);
    if (!effective || effective.length < 2) {
      setAllocError('allocNoEff');
      return;
    }
    const cfg = await fetchAllocConfig(rid);
    const pools: ReturnType<typeof subAffixesFor>[] = [];
    for (let i = 0; i < RELIC_SLOTS.length; i++) {
      const mains = mainAffixesFor(5, RELIC_SLOTS[i]);
      const mainProperty = relicPieces[i].mainProperty || mains[0]?.property || '';
      if (!mainProperty) {
        setAllocError('allocFail');
        return;
      }
      pools.push(subAffixesFor(5).filter((a) => a.property !== mainProperty));
    }
    // 爆率额度：预算 = 角色爆率上限(缺省95%) − 面板来源(基础5%+行迹+光锥/套装子句+遗器主词条，
    // 不含副词条；manual 模式手填值按“不含副词条”语义)。仅当有效词条含爆率才设额度。
    let critCap: CritCap | undefined;
    if (effective.includes('CriticalChanceBase')) {
      const crAffix = subAffixesFor(5).find((a) => a.property === 'CriticalChanceBase');
      const critSubTotal = relicPieces.reduce((sum, p) => {
        const subs = subAffixesFor(p.rarity || 5);
        for (const sub of p.subs) {
          if (sub.property !== 'CriticalChanceBase') continue;
          const affix = subs.find((s) => s.property === sub.property);
          if (affix) sum += relicSubValue(sub, affix);
        }
        return sum;
      }, 0);
      const source =
        mode === 'equipment' && panelStats
          ? panelStats.critRate - critSubTotal
          : pct(form.critRate);
      const { maxRolls, minValue } = critBudget({
        source,
        target: cfg?.critRateTarget ?? 0.95,
        base: crAffix?.base ?? 0.02592,
        step: crAffix?.step ?? 0.00324,
      });
      critCap = { property: 'CriticalChanceBase', maxRolls, minValue };
    }
    const input = genSeed.trim();
    const parsed = Number(input);
    const explicit = input !== '' && Number.isFinite(parsed);
    const baseSeed = explicit ? parsed >>> 0 : (Math.random() * 4294967296) >>> 0;
    if (!explicit) setGenSeed(String(baseSeed));
    try {
      const result = allocateEffectiveRelicSubs({
        subPools: pools,
        effective,
        tier: genTier,
        seed: baseSeed,
        weights: cfg?.weights,
        critCap,
      });
      setGenCounts(result.subCounts);
      setRelicPieces((prev) =>
        prev.map((p, i) => {
          const mains = mainAffixesFor(5, RELIC_SLOTS[i]);
          const mainProperty = p.mainProperty || mains[0]?.property || '';
          return {
            ...p,
            rarity: 5,
            enhance: 15,
            mainProperty,
            subs: result.pieces[i].map((s) => ({
              property: s.property,
              rolls: s.rolls,
              value: s.value,
              tiers: s.tiers,
            })),
          };
        }),
      );
      setAllocInfo({
        actual: result.actual,
        target: result.target,
        maxRolls: critCap?.maxRolls,
        critWarning: result.critWarning,
      });
    } catch {
      setAllocError('allocFail');
    }
  }

  function save() {
    const r = rosterById.get(form.rosterId);
    const element = (r?.element ?? 'Physical') as Element;
    const usePanel = mode === 'equipment' && panelStats !== null;
    const formElementDmg = Object.fromEntries(
      ELEMENT_KEYS.map((k) => [k, pct(form.elementDmg[k])]),
    ) as Partial<Record<Element, number>>;
    // 非条件通用增伤子句（配装模式）并入通用增伤面板值
    const equipCommonBonus = equipmentClauses
      .filter((c) => c.zone === 'damageBonus' && !c.conditional)
      .reduce((a, c) => a + c.value, 0);
    // 配装模式欢愉度子句：与 CalculatorPage equipmentAdds 同规则，跳过条件子句
    // （如水砂23064潮流「施放异类欢愉技时+40%」由引擎 LC23064 战斗内处理，烘焙进
    // 存档会双计；原「全量计入」注释系旧口径——计算器早已有条件勾选门控）
    const equipElationDegree = equipmentClauses
      .filter((c) => c.zone === 'elationDegree' && !c.conditional)
      .reduce((a, c) => a + c.value, 0);
    const equipElementDmg = Object.fromEntries(
      ELEMENT_KEYS.map((k) => [k, usePanel && panelStats ? (panelStats.elementDmg[k] ?? 0) : 0]),
    ) as Partial<Record<Element, number>>;
    const record: StoredCharacter = {
      id: editing === 'new' ? newId() : editing!,
      rosterId: form.rosterId,
      name: r?.zh ?? 'Unnamed',
      element,
      level: usePanel ? num(panelCharLevel) : num(form.level),
      atk: usePanel && panelStats ? panelStats.atk : num(form.atk),
      hp: usePanel && panelStats ? panelStats.hp : num(form.hp),
      def: usePanel && panelStats ? panelStats.def : num(form.def),
      critRate: usePanel && panelStats ? panelStats.critRate : pct(form.critRate),
      critDmg: usePanel && panelStats ? panelStats.critDmg : pct(form.critDmg),
      breakEffect: usePanel && panelStats ? panelStats.breakEffect : pct(form.breakEffect),
      damageBonus:
        usePanel && panelStats ? (panelStats.elementDmg[element] ?? 0) : (formElementDmg[element] ?? 0),
      commonBonus: usePanel ? equipCommonBonus : pct(form.commonBonus),
      elementDmg: usePanel ? equipElementDmg : formElementDmg,
      speed: usePanel && panelStats ? panelStats.speed : num(form.speed),
      energyRegen: usePanel && panelStats ? panelStats.energyRegen : pct(form.energyRegen),
      elationDegree: usePanel ? equipElationDegree : pct(form.elationDegree),
      effectHit: usePanel && panelStats ? panelStats.effectHit : pct(form.effectHit),
      effectRes: usePanel && panelStats ? panelStats.effectRes : pct(form.effectRes),
      healBonus: usePanel && panelStats ? panelStats.healBonus : pct(form.healBonus),
      mode,
      skillLevels: {
        basic: num(form.basicLevel),
        skill: num(form.skillLevel),
        ult: num(form.ultLevel),
        talent: num(form.talentLevel),
      },
      // build：战斗页只读 build.eidolonLevel（2026-10 修复——原 save 不写 build，
      // 导入 JSON 带的星魂在角色管理改面板保存后被整个丢掉 → 战斗中星魂恒 0）。
      build:
        mode === 'equipment'
          ? {
              lightconeId,
              refinement,
              relicsetId,
              relicsetId2,
              planarsetId,
              eidolonLevel,
            }
          : {
              // 手动模式「纯登记」：光锥/叠影/遗器取选择器当前值（startEdit 自 build 初始化、
              // startAdd 经 resetEquipment 清空）——数值面板与登记互不影响
              lightconeId,
              refinement,
              relicsetId,
              relicsetId2,
              planarsetId,
              eidolonLevel,
            },
      equipment:
        mode === 'equipment'
          ? {
              lightconeId,
              refinement,
              relicsetId,
              relicsetId2,
              planarsetId,
              eidolonLevel,
              charLevel: num(panelCharLevel),
              charPromotion: panelCharPromotion,
              lcLevel: num(lcLevel),
              lcPromotion,
              traceChecked,
              relicPieces,
              effectClauses: equipmentClauses,
            }
          : undefined,
    };
    const next =
      editing === 'new' ? [...list, record] : list.map((c) => (c.id === record.id ? record : c));
    persist(next);
    setEditing(null);
  }

  function remove(id: string) {
    persist(list.filter((c) => c.id !== id));
    if (editing === id) setEditing(null);
  }

  const selected = rosterById.get(form.rosterId);
  const lcNameOf = (id: string): string => {
    const c0 = LIGHTCONE_ROSTER.find((x) => x.id === id);
    if (!c0) return '';
    return i18n.language === 'en' ? c0.en : c0.zh;
  };
  const relicNameOf = (id: string): string => {
    const s0 = RELICSET_ROSTER.find((x) => x.id === id);
    if (!s0) return '';
    return i18n.language === 'en' ? s0.en : s0.zh;
  };

  return (
    <div>
      <section className="panel">
        <h2>{t('chars.title')}</h2>
        <HintCard id="characters" />
        {/*
          去开战（2026-11-08）：面板存好之后的下一步是这两个模拟页，别让用户自己回顶栏找。
          放在动作区而不是每行操作列里 —— 一份面板开不了战，行内入口只会把人带到空队页面。
        */}
        <p className="chars-next">
          <span className="muted">{t('chars.goBattle')}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => void navigate('/timeline')}
            disabled={list.length === 0}
          >
            {t('nav.timeline')}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void navigate('/fullsim')}
            disabled={list.length === 0}
          >
            {t('nav.fullSim')}
          </button>
          {list.length === 0 && (
            <span className="muted">{t('chars.goBattleEmpty')}</span>
          )}
        </p>
        <p>
          <button type="button" className="primary" onClick={startAdd}>
            {t('chars.add')}
          </button>{' '}
          <button type="button" onClick={() => setImportOpen((v) => !v)}>
            {t('chars.import')}
          </button>{' '}
          <button type="button" onClick={() => setOcrOpen(true)}>
            {t('chars.ocr.open')}
          </button>{' '}
          {/*
            存档导出/导入（2026-11-08）：面板与战报只存在 localStorage，清缓存/换设备即全丢，
            这个文件是用户唯一可搬运的备份，所以入口直接放在动作区，不藏进设置面板。
          */}
          <button type="button" onClick={exportSnapshot}>
            {t('chars.snapshot.export')}
          </button>{' '}
          <button type="button" onClick={() => snapFileRef.current?.click()}>
            {t('chars.snapshot.importBtn')}
          </button>
          <input
            ref={snapFileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => void pickSnapshotFile(e)}
          />
        </p>
        {snapPending && (
          <div style={{ marginBottom: 16 }}>
            <p className="muted">
              {t('chars.snapshot.confirmTitle', {
                chars: snapPending.characters.length,
                history: snapPending.history.length,
                battles: snapPending.battleHistory.length,
              })}
            </p>
            <p>
              <button type="button" className="primary" onClick={applyPendingSnapshot}>
                {t('chars.snapshot.confirm')}
              </button>{' '}
              <button type="button" onClick={() => setSnapPending(null)}>
                {t('chars.snapshot.cancel')}
              </button>
            </p>
          </div>
        )}
        {snapError && <p className="muted">{snapshotErrorText(snapError)}</p>}
        {importOpen && (
          <div style={{ marginBottom: 16 }}>
            <p className="muted">{t('chars.importHint')}</p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
            <p>
              <button type="button" className="primary" onClick={importJson}>
                {t('chars.importConfirm')}
              </button>{' '}
              <button type="button" onClick={() => { setImportOpen(false); setImportError(false); }}>
                {t('chars.importCancel')}
              </button>
            </p>
            {importError && <p className="muted">{t('chars.importError')}</p>}
          </div>
        )}
        <OcrPanel
          open={ocrOpen}
          initialRosterId={form.rosterId}
          initialBuild={{
            lightconeId,
            refinement,
            relicsetId,
            relicsetId2,
            planarsetId,
            skillLevels: {
              basic: num(form.basicLevel),
              skill: num(form.skillLevel),
              ult: num(form.ultLevel),
              talent: num(form.talentLevel),
            },
            eidolonLevel,
          }}
          onClose={() => setOcrOpen(false)}
          onApply={applyOcr}
        />
        {editing !== null && (
          <div className="grid" style={{ marginBottom: 16 }}>            <label className="field">
              {t('chars.name')}
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setPickOpen(true)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'left',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    padding: 8,
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    borderRadius: 'var(--input-radius)',
                    color: 'var(--input-fg)',
                    fontSize: 'var(--input-fs)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {selected
                    ? (i18n.language === 'en' ? selected.en : selected.zh)
                    : form.rosterId || t('calc.none')}
                </button>
                {form.rosterId && (
                  <button
                    type="button"
                    title={t('picker.clear')}
                    onClick={() => void onRosterChange('')}
                    style={{
                      padding: '8px 10px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      borderRadius: 'var(--input-radius)',
                      color: 'var(--input-fg)',
                      fontSize: 'var(--input-fs)',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                )}
              </span>
            </label>
            <CharPickerModal
              open={pickOpen}
              candidateIds={CHARACTER_ROSTER.map((c) => c.id)}
              onClose={() => setPickOpen(false)}
              onSelect={(id) => {
                setPickOpen(false);
                void onRosterChange(id);
              }}
            />
            <label className="field">
              {t('chars.element')}
              <input
                value={selected ? t(`elements.${selected.element}`) : ''}
                readOnly
                placeholder="—"
              />
            </label>
            <label className="field">
              {t('chars.mode')}
              <select
                value={mode}
                onChange={(e) => onModeChange(e.target.value as 'manual' | 'equipment')}
              >
                <option value="manual">{t('chars.modeManual')}</option>
                <option value="equipment">{t('chars.modeEquipment')}</option>
              </select>
            </label>

            {mode === 'manual' &&
              (
                [
                  ['level', 'chars.level'],
                  ['atk', 'chars.atk'],
                  ['hp', 'chars.hp'],
                  ['def', 'chars.def'],
                  ['critRate', 'chars.critRate'],
                  ['critDmg', 'chars.critDmg'],
                  ['breakEffect', 'chars.breakEffect'],
                  ['commonBonus', 'chars.commonBonus'],
                  ['speed', 'chars.speed'],
                  ['energyRegen', 'chars.energyRegen'],
                  ['elationDegree', 'chars.elationDegree'],
                ] as const
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  {t(label)}
                  <input
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}

            {mode === 'manual' &&
              ELEMENT_KEYS.map((k) => (
                <label className="field" key={k}>
                  {`${t('chars.damageBonus')}·${t(`elements.${k}`)}`}
                  <input
                    value={form.elementDmg[k]}
                    onChange={(e) =>
                      setForm({ ...form, elementDmg: { ...form.elementDmg, [k]: e.target.value } })
                    }
                  />
                </label>
              ))}

            {mode === 'manual' && (
              <label className="field">
                {t('chars.eidolon')}
                <select
                  value={eidolonLevel}
                  onChange={(e) => setEidolonLevel(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {mode === 'manual' && (
              <>
                <label className="field">
                  {t('chars.basicLevel')}
                  <select
                    value={form.basicLevel}
                    onChange={(e) => setForm({ ...form, basicLevel: e.target.value })}
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {(['skillLevel', 'ultLevel', 'talentLevel'] as const).map((key) => (
                  <label className="field" key={key}>
                    {t(`chars.${key}`)}
                    <select
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </>
            )}

            {/* 手动模式「纯登记」（2026-10-13 用户裁定）：光锥/遗器只登记给战斗模拟做
                效果门控与记录，不加载详情、不参与手填面板数值 */}
            {mode === 'manual' && (
              <>
                <label className="field">
                  {t('calc.lightcone')}
                  <EquipmentPick
                    src={lightconeId ? assetUrl(`lightcones/${lightconeId}.webp`) : undefined}
                    name={lightconeId ? lcNameOf(lightconeId) : t('calc.none')}
                    label={t('picker.change')}
                    onOpen={() => setLcPickerOpen(true)}
                  />
                </label>
                <label className="field">
                  {t('calc.refinement')}
                  <select
                    value={refinement}
                    disabled={!lightconeId}
                    onChange={(e) => setRefinement(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {t('calc.relicSet')}
                  <EquipmentPick
                    src={relicsetId ? assetUrl(`relicsets/${relicsetId}.webp`) : undefined}
                    name={relicsetId ? relicNameOf(relicsetId) : t('calc.none')}
                    label={t('picker.change')}
                    onOpen={() => setRelicPicker({ kind: 'four', target: 'main' })}
                  />
                </label>
                <label className="field">
                  {t('calc.relicSet2')}
                  <EquipmentPick
                    src={relicsetId2 ? assetUrl(`relicsets/${relicsetId2}.webp`) : undefined}
                    name={relicsetId2 ? relicNameOf(relicsetId2) : t('calc.none')}
                    label={t('picker.change')}
                    onOpen={() => setRelicPicker({ kind: 'four', target: 'second' })}
                  />
                </label>
                <label className="field">
                  {t('calc.planarSetLabel')}
                  <EquipmentPick
                    src={planarsetId ? assetUrl(`relicsets/${planarsetId}.webp`) : undefined}
                    name={planarsetId ? relicNameOf(planarsetId) : t('calc.none')}
                    label={t('picker.change')}
                    onOpen={() => setRelicPicker({ kind: 'planar', target: 'planar' })}
                  />
                </label>

              </>
            )}

            {mode === 'equipment' && (
              <div style={{ gridColumn: '1 / -1' }}>
                {gameLoading && <p className="muted">{t('calc.loading')}</p>}
                {gameError && <p className="muted">{t('calc.loadFailed')}</p>}
                {!form.rosterId ? (
                  <p className="muted">{t('calc.panel.needChar')}</p>
                ) : (
                  <>
                    <div className="grid">
                      <label className="field">
                        {t('calc.panel.charLevel')}
                        <input
                          inputMode="numeric"
                          value={panelCharLevel}
                          onChange={(e) => setPanelCharLevel(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        {t('calc.panel.promotion')}
                        <select
                          value={panelCharPromotion}
                          onChange={(e) => setPanelCharPromotion(Number(e.target.value))}
                        >
                          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        {t('calc.lightcone')}
                        <EquipmentPick
                          src={lightconeId ? assetUrl(`lightcones/${lightconeId}.webp`) : undefined}
                          name={lightconeId ? lcNameOf(lightconeId) : t('calc.none')}
                          label={t('picker.change')}
                          onOpen={() => setLcPickerOpen(true)}
                        />
                      </label>
                      <label className="field">
                        {t('calc.panel.lcLevel')}
                        <input
                          inputMode="numeric"
                          value={lcLevel}
                          disabled={!lcWhite}
                          onChange={(e) => setLcLevel(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        {t('calc.panel.promotion')}
                        <select
                          value={lcPromotion}
                          disabled={!lcWhite}
                          onChange={(e) => setLcPromotion(Number(e.target.value))}
                        >
                          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        {t('calc.relicSet')}
                        <EquipmentPick
                          src={relicsetId ? assetUrl(`relicsets/${relicsetId}.webp`) : undefined}
                          name={relicsetId ? relicNameOf(relicsetId) : t('calc.none')}
                          label={t('picker.change')}
                          onOpen={() => setRelicPicker({ kind: 'four', target: 'main' })}
                        />
                      </label>
                      <label className="field">
                        {t('calc.relicSet2')}
                        <EquipmentPick
                          src={relicsetId2 ? assetUrl(`relicsets/${relicsetId2}.webp`) : undefined}
                          name={relicsetId2 ? relicNameOf(relicsetId2) : t('calc.none')}
                          label={t('picker.change')}
                          onOpen={() => setRelicPicker({ kind: 'four', target: 'second' })}
                        />
                      </label>
                      <label className="field">
                        {t('calc.planarSetLabel')}
                        <EquipmentPick
                          src={planarsetId ? assetUrl(`relicsets/${planarsetId}.webp`) : undefined}
                          name={planarsetId ? relicNameOf(planarsetId) : t('calc.none')}
                          label={t('picker.change')}
                          onOpen={() => setRelicPicker({ kind: 'planar', target: 'planar' })}
                        />
                      </label>
                    </div>
                    {lightconeLoading && <p className="muted">{t('calc.loading')}</p>}
                    {lightconeError && <p className="muted">{t('calc.loadFailed')}</p>}
                    {lightcone && (
                      <div style={{ marginTop: 12 }}>
                        <p>
                          <strong>{lightcone.name}</strong>
                          {lightcone.skillName ? ` · ${lightcone.skillName}` : ''}
                          {' · '}
                          {lightcone.rarity.replace(/.*(\d)$/, '$1')}★
                        </p>
                        {lightconeId && !lightconePathMatches(form.rosterId, lightconeId) && (
                          <p className="muted">{t('calc.lcPathMismatch')}</p>
                        )}
                        {lightcone.skillDesc && (
                          <>
                            <p>
                              {t('calc.refinement')}：
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  className={refinement === n ? 'primary' : 'secondary'}
                                  style={{ marginRight: 6 }}
                                  onClick={() => setRefinement(n)}
                                >
                                  {n}
                                </button>
                              ))}
                            </p>
                            <p style={{ whiteSpace: 'pre-wrap' }}>
                              {formatSkillDesc(
                                lightcone.skillDesc,
                                lightcone.refinementLevels[String(refinement)] ?? [],
                              )}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    {relicsetLoading && <p className="muted">{t('calc.loading')}</p>}
                    {relicsetError && <p className="muted">{t('calc.loadFailed')}</p>}
                    {[
                      {
                        id: relicsetId,
                        set: setA,
                        showFour: !relicsetId2,
                        tag: relicsetId2 ? t('calc.relicSet2Tag') : '',
                      },
                      { id: relicsetId2, set: setB, showFour: false, tag: t('calc.relicSet2Tag') },
                      { id: planarsetId, set: planarSet, showFour: false, tag: t('calc.planarSet') },
                    ].map(({ id, set, showFour, tag }) =>
                      id && set ? (
                        <div key={id} style={{ marginTop: 12 }}>
                          <p>
                            <strong>{set.name}</strong>
                            {tag ? <span className="muted"> ({tag})</span> : null}
                          </p>
                          {set.twoPiece?.desc && (
                            <p>
                              {t('calc.twoPiece')}：
                              {formatSkillDesc(set.twoPiece.desc, set.twoPiece.paramList)}
                            </p>
                          )}
                          {showFour && set.fourPiece?.desc && (
                            <p>
                              {t('calc.fourPiece')}：
                              {formatSkillDesc(set.fourPiece.desc, set.fourPiece.paramList)}
                            </p>
                          )}
                          {set.parts.length > 0 && (
                            <p className="muted">
                              {t('calc.pieces')}：{set.parts.map((p) => p.name).join(' / ')}
                            </p>
                          )}
                        </div>
                      ) : null,
                    )}
                    {charWhite && (
                      <p className="muted" style={{ marginTop: 12 }}>
                        {t('calc.panel.whiteValues')}：
                        {t('calc.panel.hp')} {Math.floor(charWhite.hp + (lcWhite?.hp ?? 0))} /{' '}
                        {t('calc.panel.atk')} {Math.floor(charWhite.atk + (lcWhite?.atk ?? 0))} /{' '}
                        {t('calc.panel.def')} {Math.floor(charWhite.def + (lcWhite?.def ?? 0))} /{' '}
                        {t('calc.panel.spd')} {Math.floor(charWhite.speed)}
                      </p>
                    )}
                    {gameDetail && (
                      <>
                        <p>
                          <strong>{t('chars.eidolon')}</strong>
                        </p>
                        <p>
                          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                            <button
                              key={n}
                              type="button"
                              className={eidolonLevel === n ? 'primary' : 'secondary'}
                              style={{ marginRight: 6 }}
                              onClick={() => setEidolonLevel(n)}
                            >
                              {n}
                            </button>
                          ))}
                        </p>
                        {gameDetail.eidolons.map((e) => (
                          <p
                            key={e.level}
                            className={e.level <= eidolonLevel ? undefined : 'muted'}
                            style={{ whiteSpace: 'pre-wrap' }}
                          >
                            <strong>
                              E{e.level} · {e.name}
                            </strong>{' '}
                            {formatSkillDesc(e.desc, e.paramList)}
                          </p>
                        ))}
                      </>
                    )}
                    <p>
                      <strong>{t('calc.panel.tracePoints')}</strong>
                    </p>
                    {!gameDetail || gameDetail.tracePoints.length === 0 ? (
                      <p className="muted">{t('calc.panel.noTrace')}</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                        {gameDetail.tracePoints.map((point) => (
                          <label
                            key={point.key}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(traceChecked[point.key])}
                              onChange={(e) =>
                                setTraceChecked((prev) => ({
                                  ...prev,
                                  [point.key]: e.target.checked,
                                }))
                              }
                            />
                            <span>
                              {point.name ??
                                t(`calc.statProps.${point.property}`, {
                                  defaultValue: point.property,
                                })}
                            </span>
                            <span className="muted">
                              {formatAffixValue(point.property, point.value)}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    <p
                      style={{
                        marginTop: 12,
                        display: 'flex',
                        gap: 16,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <strong>{t('calc.panel.relics')}</strong>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {t('calc.panel.seed')}
                        <input
                          style={{ width: 140 }}
                          value={genSeed}
                          placeholder={t('calc.panel.seedPlaceholder')}
                          onChange={(e) => setGenSeed(e.target.value)}
                        />
                      </label>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {t('calc.panel.allocTier')}
                        <select
                          value={genTier}
                          onChange={(e) => setGenTier(e.target.value as RelicTier)}
                        >
                          {(['A', 'S', 'SS', 'SSS'] as const).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!form.rosterId}
                        onClick={() => void allocateSet()}
                      >
                        {t('calc.panel.allocSet')}
                      </button>
                      {allocInfo && (
                        <span>
                          {t('calc.panel.allocResult', {
                            actual: allocInfo.actual,
                            target: allocInfo.target,
                          })}
                          {allocInfo.maxRolls !== undefined && (
                            <> · {t('calc.panel.allocRolls', { n: allocInfo.maxRolls })}</>
                          )}
                          {allocInfo.critWarning && (
                            <span style={{ color: '#c0392b' }}>
                              {' '}
                              {t('calc.panel.allocCritWarn')}
                            </span>
                          )}
                        </span>
                      )}
                      {allocError && (
                        <span style={{ color: '#c0392b' }}>{t(`calc.panel.${allocError}`)}</span>
                      )}
                    </p>
                    {relicPieces.map((piece, index) => {
                      const slot = index + 1;
                      const mains = mainAffixesFor(piece.rarity, slot);
                      const subs = subAffixesFor(piece.rarity);
                      const mainShown = piece.mainProperty || mains[0]?.property || '';
                      const mainSel = mains.find((m) => m.property === mainShown);
                      return (
                        <div
                          key={slot}
                          style={{
                            border: '1px solid rgba(128, 128, 128, 0.35)',
                            borderRadius: 6,
                            padding: 8,
                            marginBottom: 8,
                          }}
                        >
                          <p
                            style={{
                              display: 'flex',
                              gap: 16,
                              flexWrap: 'wrap',
                              alignItems: 'center',
                            }}
                          >
                            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {(() => {
                                const setId = slot <= 4 ? relicsetId : planarsetId;
                                return setId ? (
                                  <img
                                    src={assetUrl(`relicsets/${setId}.webp`)}
                                    alt=""
                                    width={22}
                                    height={22}
                                    loading="lazy"
                                    style={{ objectFit: 'contain' }}
                                  />
                                ) : null;
                              })()}
                              {t(`calc.panel.slot${slot}`)}
                            </strong>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {t('calc.panel.rarity')}
                              <select
                                value={piece.rarity}
                                onChange={(e) =>
                                  updatePiece(index, {
                                    rarity: Number(e.target.value),
                                    mainProperty: '',
                                    subs: piece.subs.map((s) => ({ ...s, property: '' })),
                                  })
                                }
                              >
                                {[2, 3, 4, 5].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {t('calc.panel.enhance')}
                              <select
                                value={piece.enhance}
                                onChange={(e) =>
                                  updatePiece(index, { enhance: Number(e.target.value) })
                                }
                              >
                                {Array.from({ length: 16 }, (_, n) => n).map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {t('calc.panel.subCount')}
                              <select
                                value={genCounts[index]}
                                onChange={(e) =>
                                  setGenCounts((prev) =>
                                    prev.map((n, i) =>
                                      i === index ? ((Number(e.target.value) === 3 ? 3 : 4) as 3 | 4) : n,
                                    ),
                                  )
                                }
                              >
                                <option value={3}>3</option>
                                <option value={4}>4</option>
                              </select>
                            </label>
                            <button type="button" onClick={() => randomizePiece(index)}>
                              {t('calc.panel.randomSubs')}
                            </button>
                          </p>
                          <label className="field">
                            {t('calc.panel.mainAffix')}
                            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <select
                                value={mainShown}
                                onChange={(e) => updatePiece(index, { mainProperty: e.target.value })}
                              >
                                {mains.map((m) => (
                                  <option key={m.property} value={m.property}>
                                    {t(`calc.statProps.${m.property}`, { defaultValue: m.property })}
                                  </option>
                                ))}
                              </select>
                              {mainSel && (
                                <span className="muted">
                                  {formatAffixValue(
                                    mainSel.property,
                                    mainAffixValue(mainSel, piece.enhance),
                                  )}
                                </span>
                              )}
                            </span>
                          </label>
                          {piece.subs.map((sub, subIndex) => {
                            const affix = subs.find((s) => s.property === sub.property);
                            return (
                              <label
                                key={subIndex}
                                className="field"
                                style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                              >
                                {t('calc.panel.subAffix')} {subIndex + 1}
                                <select
                                  value={sub.property}
                                  onChange={(e) =>
                                    updateSub(index, subIndex, {
                                      property: e.target.value,
                                      // 换词条即脱离新版生成值，回退旧版 rolls 语义
                                      value: undefined,
                                      tiers: undefined,
                                    })
                                  }
                                >
                                  <option value="">{t('calc.none')}</option>
                                  {subs.map((s) => (
                                    <option key={s.property} value={s.property}>
                                      {t(`calc.statProps.${s.property}`, { defaultValue: s.property })}
                                    </option>
                                  ))}
                                </select>
                                {affix && sub.value !== undefined ? (
                                  <span className="muted">
                                    {relicSubTierValues(sub, affix)
                                      ?.map((v) => formatAffixValue(sub.property, v))
                                      .join(' + ')}{' '}
                                    = {formatAffixValue(sub.property, sub.value)}
                                  </span>
                                ) : (
                                  <>
                                    <select
                                      value={sub.rolls}
                                      onChange={(e) =>
                                        updateSub(index, subIndex, {
                                          rolls: Number(e.target.value),
                                          value: undefined,
                                          tiers: undefined,
                                        })
                                      }
                                    >
                                      {[1, 2, 3, 4, 5, 6].map((n) => (
                                        <option key={n} value={n}>
                                          {n}
                                        </option>
                                      ))}
                                    </select>
                                    {affix && (
                                      <span className="muted">
                                        {formatAffixValue(
                                          affix.property,
                                          relicSubValue(sub, affix),
                                        )}
                                      </span>
                                    )}
                                  </>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}
                    {panelStats && (
                      <div style={{ marginTop: 12 }}>
                        <p>
                          <strong>{t('calc.panel.result')}</strong>
                        </p>
                        <p>
                          {t('calc.panel.hp')} {Math.floor(panelStats.hp)} /{' '}
                          {t('calc.panel.atk')} {Math.floor(panelStats.atk)} /{' '}
                          {t('calc.panel.def')} {Math.floor(panelStats.def)} /{' '}
                          {t('calc.panel.spd')} {Math.floor(panelStats.speed)}
                        </p>
                        <p className="muted">
                          {t('calc.panel.critRate')} {+(panelStats.critRate * 100).toFixed(2)}% ·{' '}
                          {t('calc.panel.critDmg')} {+(panelStats.critDmg * 100).toFixed(2)}% ·{' '}
                          {t('calc.panel.breakEffect')} {+(panelStats.breakEffect * 100).toFixed(2)}
                          % · {t('calc.panel.effectHit')}{' '}
                          {+(panelStats.effectHit * 100).toFixed(2)}% ·{' '}
                          {t('calc.panel.effectRes')} {+(panelStats.effectRes * 100).toFixed(2)}% ·{' '}
                          {t('calc.panel.healBonus')} {+(panelStats.healBonus * 100).toFixed(2)}% ·{' '}
                          {t('calc.panel.energyRegen')}{' '}
                          {+(panelStats.energyRegen * 100).toFixed(2)}% ·{' '}
                          {t('calc.panel.breakDmgBoost')}{' '}
                          {+(panelStats.breakDmgBoost * 100).toFixed(2)}%
                        </p>
                        {Object.keys(panelStats.elementDmg).length > 0 && (
                          <p className="muted">
                            {t('calc.panel.elementDmg')}：
                            {Object.entries(panelStats.elementDmg)
                              .map(([el, v]) => `${t(`elements.${el}`)} ${+(v * 100).toFixed(2)}%`)
                              .join(' · ')}
                          </p>
                        )}
                        {panelStats.unrecognized.length > 0 && (
                          <p className="muted">
                            {t('calc.panel.unrecognized')}：
                            {panelStats.unrecognized.map((u) => u.property).join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                    {equipmentClauses.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <p>
                          <strong>{t('calc.effects.title')}</strong>
                        </p>
                        {equipmentClauses.map((c) =>
                          c.zone === 'engine' ? (
                            <p key={c.id}>
                              {c.raw}{' '}
                              <span className="muted">（{t('calc.effects.engine')}）</span>
                            </p>
                          ) : c.zone === 'unknown' ? (
                            <p key={c.id} className="muted">
                              {c.raw}（{t('calc.effects.unknown')}）
                            </p>
                          ) : c.conditional ? (
                            <p key={c.id}>
                              {c.raw}{' '}
                              <span className="muted">
                                （{t('calc.effects.conditional')}）
                              </span>
                            </p>
                          ) : (
                            <p key={c.id}>
                              {c.raw} <span className="muted">（{t('calc.effects.auto')}）</span>
                            </p>
                          ),
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <button
                type="button"
                className="primary"
                onClick={save}
                disabled={
                  !form.rosterId ||
                  (mode === 'equipment' && (!gameDetail || !panelStats))
                }
              >
                {t('chars.save')}
              </button>
              <button type="button" className="secondary" onClick={() => setEditing(null)}>
                {t('chars.cancel')}
              </button>
            </div>
          </div>
        )}
        {list.length === 0 ? (
          <p className="muted">{t('chars.empty')}</p>
        ) : (
          <div className="log-scroll">
            <table className="log-table" style={{ minWidth: 640 }}>
              <thead>
              <tr>
                <th>{t('chars.name')}</th>
                <th>{t('chars.element')}</th>
                <th>{t('chars.level')}</th>
                <th>{t('chars.mainStat')}</th>
                <th>{t('chars.critRate')}</th>
                <th>{t('chars.critDmg')}</th>
                <th>{t('chars.breakEffect')}</th>
                <th>{t('chars.damageBonus')}</th>
                <th>{t('chars.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    {displayName(c)}
                    {c.mode === 'equipment' ? ' ⚙' : ''}
                  </td>
                  <td>{t(`elements.${c.element}`)}</td>
                  <td>{c.level}</td>
                  <td>{t(STAT_LABEL_KEYS[characterMainStat(c.rosterId)])}</td>
                  <td>{toPctInput(c.critRate)}</td>
                  <td>{toPctInput(c.critDmg)}</td>
                  <td>{toPctInput(c.breakEffect)}</td>
                  <td>{toPctInput(c.damageBonus)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="secondary" onClick={() => void startEdit(c)}>
                      {t('chars.edit')}
                    </button>
                    <button type="button" className="danger" onClick={() => remove(c.id)}>
                      {t('chars.del')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      <LightconePickerModal
        open={lcPickerOpen}
        value={lightconeId}
        candidateIds={orderedLightcones.map((c) => c.id)}
        onSelect={(id) => {
          if (mode === 'equipment') void onLightconeChange(id);
          else setLightconeId(id);
          setLcPickerOpen(false);
        }}
        onClose={() => setLcPickerOpen(false)}
      />
      <RelicSetPickerModal
        open={relicPicker !== null}
        kind={relicPicker?.kind ?? 'four'}
        value={
          relicPicker?.target === 'planar'
            ? planarsetId
            : relicPicker?.target === 'second'
              ? relicsetId2
              : relicsetId
        }
        onSelect={(id) => {
          if (relicPicker?.target === 'main') setRelicsetId(id);
          else if (relicPicker?.target === 'second') setRelicsetId2(id);
          else if (relicPicker?.target === 'planar') setPlanarsetId(id);
          if (mode === 'equipment') void loadRelicset(id);
          setRelicPicker(null);
        }}
        onClose={() => setRelicPicker(null)}
      />
      </section>
    </div>
  );
}

