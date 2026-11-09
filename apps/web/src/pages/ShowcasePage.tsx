import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PanelStats, SkillLevels } from '@hsr-calc/engine';
import type { Element } from '@hsr-calc/shared';
import { assetUrl } from '../asset-url.js';
import { CHARACTER_ROSTER, type RosterCharacter } from '../data/character-roster.js';
import { LIGHTCONE_ROSTER } from '../data/lightcone-roster.js';
import { RELICSET_ROSTER } from '../data/relicset-roster.js';
import {
  fetchCharacterDetail,
  fetchLightconeDetail,
  fetchRelicSetDetail,
  mainAffixTable,
  subAffixTable,
  type CharacterDetail,
  type DataLang,
  type LightconeDetail,
  type RelicSetDetail,
} from '../game-data.js';
import { buildLoadout, type LoadoutResult } from '../loadout-panel.js';
import { storage, newId, type RelicPieceState, type StoredCharacter } from '../storage.js';
import {
  parseShowcase,
  relicPiecesFromShowcase,
  resolveSkillLevels,
  resolveTraceChecked,
  setsFromShowcase,
  type EnkaShowcase,
  type ShowcaseChar,
  type ShowcasePlayer,
  type ShowcaseSets,
} from '../showcase.js';
import {
  ShowcaseError,
  fetchShowcase,
  normalizeUid,
  type ShowcaseErrorKind,
  type ShowcaseSnapshot,
  type ShowcaseSource,
} from '../showcase-api.js';
import { parseMihomo, type MihomoResponse } from '../showcase-mihomo.js';
import { BATTLE_ROSTER_ID } from './FullSimPage.js';
import { HintCard } from '../hint-card.js';

const ROSTER_BY_ID = new Map(CHARACTER_ROSTER.map((c) => [c.id, c]));
const ROSTER_IDS: ReadonlySet<string> = new Set(CHARACTER_ROSTER.map((c) => c.id));
const LC_BY_ID = new Map(LIGHTCONE_ROSTER.map((c) => [c.id, c]));
const RELIC_BY_ID = new Map(RELICSET_ROSTER.map((c) => [c.id, c]));
const BATTLE_ROSTER_IDS: ReadonlySet<string> = new Set(Object.values(BATTLE_ROSTER_ID));

const AFFIX_TABLES = { main: mainAffixTable(), sub: subAffixTable() };

const ELEMENT_KEYS = [
  'Physical',
  'Fire',
  'Ice',
  'Thunder',
  'Wind',
  'Quantum',
  'Imaginary',
] as const;

/** Enka 代理前缀（可留空直连；线上必须填，详见 showcase-api.ts 注释） */
const UID_STORAGE_KEY = 'hsr-sim.showcase.uid';
const PROXY_STORAGE_KEY = 'hsr-sim.showcase.proxy';
const SOURCE_STORAGE_KEY = 'hsr-sim.showcase.source';
const DEFAULT_PROXY = (import.meta.env.VITE_SHOWCASE_PROXY as string | undefined) ?? '';

const ERROR_KEY: Record<ShowcaseErrorKind, string> = {
  'invalid-uid': 'showcase.errInvalidUid',
  'not-found': 'showcase.errNotFound',
  'private-showcase': 'showcase.errPrivateShowcase',
  'rate-limited': 'showcase.errRateLimited',
  maintenance: 'showcase.errMaintenance',
  upstream: 'showcase.errUpstream',
  cors: 'showcase.errCors',
  network: 'showcase.errNetwork',
  server: 'showcase.errServer',
  'bad-payload': 'showcase.errBadPayload',
};

interface CardModel extends LoadoutResult {
  char: ShowcaseChar;
  roster: RosterCharacter | null;
  detail: CharacterDetail | null;
  lightconeDetail: LightconeDetail | null;
  relicSets: Record<string, RelicSetDetail | undefined>;
  pieces: RelicPieceState[];
  sets: ShowcaseSets;
  traceChecked: Record<string, boolean>;
  skillLevels: Partial<SkillLevels>;
}

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 忽略配额失败 */
  }
}

const fmtPct = (value: number, digits = 2): string => `${+((value ?? 0) * 100).toFixed(digits)}%`;

function fmtAffix(property: string, value: number): string {
  return property.endsWith('Delta') ? String(+value.toFixed(2)) : fmtPct(value);
}

/** 展示柜单卡：拉本地角色/光锥/套装数据并烘焙面板 */
async function buildCard(char: ShowcaseChar, lang: DataLang): Promise<CardModel> {
  const roster = char.rosterId ? (ROSTER_BY_ID.get(char.rosterId) ?? null) : null;
  let detail: CharacterDetail | null = null;
  if (char.rosterId) {
    try {
      detail = await fetchCharacterDetail(char.rosterId, lang);
    } catch {
      detail = null;
    }
  }
  let lightconeDetail: LightconeDetail | null = null;
  if (char.lightcone) {
    try {
      lightconeDetail = await fetchLightconeDetail(char.lightcone.id, lang);
    } catch {
      lightconeDetail = null;
    }
  }
  const sets = setsFromShowcase(char.relics);
  const relicSets: Record<string, RelicSetDetail | undefined> = {};
  for (const id of [sets.relicsetId, sets.relicsetId2, sets.planarsetId]) {
    if (!id || relicSets[id]) continue;
    try {
      relicSets[id] = await fetchRelicSetDetail(id, lang);
    } catch {
      relicSets[id] = undefined;
    }
  }
  const pieces = relicPiecesFromShowcase(char.relics);
  const traceChecked = resolveTraceChecked(detail, char.points, char.anchors);
  const skillLevels = resolveSkillLevels(detail, char.points, char.skillLevels);
  const loadout = buildLoadout(
    {
      rosterId: char.rosterId ?? '',
      charLevel: char.level,
      charPromotion: char.promotion,
      lcLevel: char.lightcone?.level ?? 0,
      lcPromotion: char.lightcone?.promotion ?? 0,
      lightconeId: char.lightcone?.id ?? '',
      refinement: char.lightcone?.refinement ?? 1,
      relicsetId: sets.relicsetId,
      relicsetId2: sets.relicsetId2,
      planarsetId: sets.planarsetId,
      eidolonLevel: char.eidolon,
      traceChecked,
      relicPieces: pieces,
    },
    { charDetail: detail, lightcone: lightconeDetail, relicSets, battleRosterIds: BATTLE_ROSTER_IDS },
  );
  return {
    ...loadout,
    char,
    roster,
    detail,
    lightconeDetail,
    relicSets,
    pieces,
    sets,
    traceChecked,
    skillLevels,
  };
}

/** 展示柜单卡 → 角色管理存档（mode='equipment'，与手动配装同一套字段） */
function toStoredCharacter(card: CardModel, id: string): StoredCharacter | null {
  const roster = card.roster;
  const rosterId = card.char.rosterId;
  const panel: PanelStats | null = card.panel;
  if (!roster || !rosterId || !panel) return null;
  const element = (roster.element ?? 'Physical') as Element;
  const commonBonus = card.clauses
    .filter((c) => c.zone === 'damageBonus' && !c.conditional)
    .reduce((a, c) => a + c.value, 0);
  const elationDegree = card.clauses
    .filter((c) => c.zone === 'elationDegree' && !c.conditional)
    .reduce((a, c) => a + c.value, 0);
  const elementDmg = Object.fromEntries(
    ELEMENT_KEYS.map((k) => [k, panel.elementDmg[k] ?? 0]),
  ) as Partial<Record<Element, number>>;
  const lc = card.char.lightcone;
  const build = {
    lightconeId: lc?.id ?? '',
    refinement: lc?.refinement ?? 1,
    relicsetId: card.sets.relicsetId,
    relicsetId2: card.sets.relicsetId2,
    planarsetId: card.sets.planarsetId,
    eidolonLevel: card.char.eidolon,
  };
  return {
    id,
    rosterId,
    name: roster.zh,
    element,
    level: card.char.level,
    atk: panel.atk,
    hp: panel.hp,
    def: panel.def,
    critRate: panel.critRate,
    critDmg: panel.critDmg,
    breakEffect: panel.breakEffect,
    damageBonus: panel.elementDmg[element] ?? 0,
    commonBonus,
    elementDmg,
    speed: panel.speed,
    energyRegen: panel.energyRegen,
    elationDegree,
    effectHit: panel.effectHit,
    effectRes: panel.effectRes,
    healBonus: panel.healBonus,
    mode: 'equipment',
    skillLevels: card.skillLevels,
    build,
    equipment: {
      ...build,
      charLevel: card.char.level,
      charPromotion: card.char.promotion,
      lcLevel: lc?.level ?? 0,
      lcPromotion: lc?.promotion ?? 0,
      traceChecked: card.traceChecked,
      relicPieces: card.pieces,
      effectClauses: card.clauses,
    },
  };
}

export default function ShowcasePage() {
  const { t, i18n } = useTranslation();
  const lang: DataLang = i18n.language === 'en' ? 'en' : 'zh';

  const [uidInput, setUidInput] = useState(() => readStored(UID_STORAGE_KEY));
  const [proxyInput, setProxyInput] = useState(() => readStored(PROXY_STORAGE_KEY) || DEFAULT_PROXY);
  const [source, setSource] = useState<ShowcaseSource>(() =>
    readStored(SOURCE_STORAGE_KEY) === 'enka' ? 'enka' : 'mihomo',
  );
  const [snapshot, setSnapshot] = useState<ShowcaseSnapshot | null>(null);
  const [view, setView] = useState<{ player: ShowcasePlayer; cards: CardModel[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<{ kind: ShowcaseErrorKind; status: number | null } | null>(null);
  const [pending, setPending] = useState<CardModel | null>(null);
  const [imported, setImported] = useState<Record<string, boolean>>({});

  const query = useCallback(
    async (force: boolean) => {
      const uid = normalizeUid(uidInput);
      if (!uid) {
        setError({ kind: 'invalid-uid', status: null });
        setSnapshot(null);
        return;
      }
      setLoading(true);
      setError(null);
      setPending(null);
      setImported({});
      try {
        const snap = await fetchShowcase(uid, { source, proxyBase: proxyInput, force });
        writeStored(UID_STORAGE_KEY, uid);
        writeStored(SOURCE_STORAGE_KEY, source);
        setSnapshot(snap);
      } catch (err) {
        setSnapshot(null);
        if (err instanceof ShowcaseError) setError({ kind: err.kind, status: err.status });
        else setError({ kind: 'network', status: null });
      } finally {
        setLoading(false);
      }
    },
    [uidInput, proxyInput, source],
  );

  // 快照/语言变化时重算卡片（语言切换只重读本地数据，不发网络请求）
  useEffect(() => {
    if (!snapshot) {
      setView(null);
      return;
    }
    let alive = true;
    setBuilding(true);
    const player =
      snapshot.source === 'mihomo'
        ? parseMihomo(snapshot.json as MihomoResponse, ROSTER_IDS)
        : parseShowcase(snapshot.json as EnkaShowcase, AFFIX_TABLES, ROSTER_IDS);
    void (async () => {
      const cards = await Promise.all(player.chars.map((c) => buildCard(c, lang)));
      if (!alive) return;
      setView({ player, cards });
      setBuilding(false);
    })();
    return () => {
      alive = false;
      setBuilding(false);
    };
  }, [snapshot, lang]);

  const persistProxy = (value: string) => {
    setProxyInput(value);
    writeStored(PROXY_STORAGE_KEY, value);
  };

  const commitImport = useCallback(
    (card: CardModel) => {
      const rosterId = card.char.rosterId;
      if (!rosterId) return;
      const list = storage.getCharacters();
      const existing = list.find((c) => c.rosterId === rosterId);
      const record = toStoredCharacter(card, existing?.id ?? newId());
      if (!record) return;
      const next = existing ? list.map((c) => (c.id === record.id ? record : c)) : [...list, record];
      storage.saveCharacters(next);
      setImported((prev) => ({ ...prev, [rosterId]: true }));
      setPending(null);
    },
    [],
  );

  const requestImport = (card: CardModel) => {
    const rosterId = card.char.rosterId;
    if (!rosterId) return;
    if (!card.panel) return;
    const existing = storage.getCharacters().find((c) => c.rosterId === rosterId);
    if (existing) {
      setPending(card);
      return;
    }
    commitImport(card);
  };

  const errorText = error ? t(ERROR_KEY[error.kind]) : '';
  const showProxyHint = error !== null && (error.kind === 'cors' || error.kind === 'network');

  return (
    <section className="panel">
      <h2>{t('showcase.title')}</h2>
      <p className="muted">{t('showcase.hint')}</p>
      <HintCard id="showcase" />

      <form
        className="showcase-form"
        onSubmit={(e) => {
          e.preventDefault();
          void query(false);
        }}
      >
        <select
          value={source}
          onChange={(e) => {
            const next: ShowcaseSource = e.target.value === 'enka' ? 'enka' : 'mihomo';
            setSource(next);
            writeStored(SOURCE_STORAGE_KEY, next);
            setSnapshot(null);
          }}
          aria-label={t('showcase.sourceLabel')}
          title={t('showcase.sourceHint')}
        >
          <option value="mihomo">{t('showcase.sourceMihomo')}</option>
          <option value="enka">{t('showcase.sourceEnka')}</option>
        </select>
        <input
          className="showcase-uid"
          value={uidInput}
          onChange={(e) => setUidInput(e.target.value)}
          placeholder={t('showcase.uidPlaceholder')}
          inputMode="numeric"
          maxLength={12}
          aria-label={t('showcase.uidPlaceholder')}
        />
        <button type="submit" className="primary" disabled={loading}>
          {loading ? t('showcase.loading') : t('showcase.query')}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={loading || !snapshot}
          onClick={() => void query(true)}
        >
          {t('showcase.refresh')}
        </button>
      </form>

      <details className="showcase-proxy">
        <summary>{t('showcase.proxyLabel')}</summary>
        <div className="showcase-proxy-body">
          <input
            value={proxyInput}
            onChange={(e) => persistProxy(e.target.value)}
            placeholder={t('showcase.proxyPlaceholder')}
            aria-label={t('showcase.proxyLabel')}
          />
          <p className="muted">{t('showcase.proxyHint')}</p>
        </div>
      </details>

      {error && (
        <div className="showcase-error">
          <strong>{t('showcase.errorTitle')}</strong>
          <p>{errorText}</p>
          {error.status !== null && <p className="muted">HTTP {error.status}</p>}
          {showProxyHint && <p className="muted">{t('showcase.errProxyHint')}</p>}
        </div>
      )}

      {view && (
        <>
          <div className="showcase-meta">
            <strong>{view.player.nickname || t('showcase.noNickname')}</strong>
            <span className="muted">
              UID {view.player.uid} · Lv.{view.player.level}
              {view.player.region ? ` · ${view.player.region}` : ''}
            </span>
            {snapshot?.cached && <span className="muted">· {t('showcase.fromCache')}</span>}
          </div>
          {view.player.signature && <p className="muted showcase-sign">{view.player.signature}</p>}
          {(view.player as { isDisplay?: boolean }).isDisplay === false && (
            <p className="muted">{t('showcase.privateHint')}</p>
          )}

          {view.cards.length === 0 && <p className="muted">{t('showcase.empty')}</p>}

          <div className="showcase-grid">
            {view.cards.map((card) => {
              const rosterId = card.char.rosterId;
              const unknown = rosterId === null || card.roster === null;
              // 光锥/套装任一在本地缺失 → 面板会少一截，宁可禁止导入也不用残缺数据覆盖存档
              const setsMissing = [
                card.sets.relicsetId,
                card.sets.relicsetId2,
                card.sets.planarsetId,
              ].some((id) => Boolean(id) && !card.relicSets[id as string]);
              const missingData =
                !unknown &&
                (!card.detail ||
                  !card.panel ||
                  Boolean(card.char.lightcone && !card.lightconeDetail) ||
                  setsMissing);
              const name = card.roster
                ? i18n.language === 'en'
                  ? card.roster.en
                  : card.roster.zh
                : `${t('showcase.unknownChar')} (${card.char.avatarId})`;
              const lcName = card.char.lightcone
                ? (() => {
                    const row = LC_BY_ID.get(card.char.lightcone.id);
                    return row ? (i18n.language === 'en' ? row.en : row.zh) : card.char.lightcone.id;
                  })()
                : null;
              const setLabel = (id: string | undefined): string => {
                if (!id) return '';
                const row = RELIC_BY_ID.get(id);
                return row ? (i18n.language === 'en' ? row.en : row.zh) : id;
              };
              const isImported = rosterId !== null && imported[rosterId] === true;
              return (
                <article className="showcase-card" key={card.char.avatarId}>
                  <header className="showcase-card-head">
                    {rosterId && (
                      <img
                        className="showcase-portrait"
                        src={assetUrl(`portraits/${rosterId}.webp`)}
                        alt={name}
                        loading="lazy"
                      />
                    )}
                    <div className="showcase-card-title">
                      <strong>{name}</strong>
                      <div className="muted">
                        Lv.{card.char.level} · E{card.char.eidolon}
                        {card.roster ? ` · ${card.roster.path}` : ''}
                        {card.char.assist ? ` · ${t('showcase.assist')}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="primary showcase-import"
                      disabled={unknown || missingData || isImported}
                      onClick={() => requestImport(card)}
                    >
                      {isImported ? t('showcase.imported') : t('showcase.import')}
                    </button>
                  </header>

                  {unknown && <p className="muted">{t('showcase.unknownChatHint')}</p>}
                  {!unknown && missingData && <p className="muted">{t('showcase.noLocalData')}</p>}

                  <div className="showcase-lc">
                    {card.char.lightcone ? (
                      <>
                        <span className="showcase-lc-name">{lcName}</span>
                        <span className="muted">
                          {' '}
                          · {t('showcase.superimpose')} {card.char.lightcone.refinement} · Lv.
                          {card.char.lightcone.level}
                        </span>
                      </>
                    ) : (
                      <span className="muted">{t('showcase.noLightcone')}</span>
                    )}
                  </div>

                  <ul className="showcase-relics">
                    {[1, 2, 3, 4, 5, 6].map((slot) => {
                      const relic = card.char.relics.find((r) => r.slot === slot);
                      if (!relic) {
                        return (
                          <li className="muted" key={slot}>
                            {t(`calc.panel.slot${slot}`)} · {t('showcase.noRelic')}
                          </li>
                        );
                      }
                      return (
                        <li key={slot}>
                          <span className="showcase-relic-slot">
                            {t(`calc.panel.slot${slot}`)}
                          </span>
                          <span className="showcase-relic-set">
                            {setLabel(relic.setId)}
                            <span className="muted"> +{relic.level}</span>
                          </span>
                          <span className="showcase-relic-main">
                            {t(`calc.statProps.${relic.mainProperty}`)}{' '}
                            {fmtAffix(relic.mainProperty, relic.mainValue)}
                          </span>
                          <span className="showcase-relic-subs muted">
                            {relic.subs
                              .map(
                                (s) =>
                                  `${t(`calc.statProps.${s.property}`)} ${fmtAffix(
                                    s.property,
                                    s.value ?? 0,
                                  )}`,
                              )
                              .join(' / ')}
                          </span>
                          {!relic.rarityVerified && (
                            <span className="showcase-warn">{t('showcase.rarityGuess')}</span>
                          )}
                          {relic.approximate && (
                            <span className="showcase-warn">{t('showcase.approx')}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="showcase-skills muted">
                    {t('showcase.skillLevels')}：
                    {(['basic', 'skill', 'ult', 'talent'] as const)
                      .map((k) => `${t(`battle.skillShort.${k}`)}${card.skillLevels[k] ?? '-'}`)
                      .join(' · ')}
                  </div>

                  {card.panel && (
                    <div className="showcase-panel">
                      <div className="showcase-panel-title">
                        {t('showcase.panelTitle')}
                        <span className="muted"> · {t('showcase.panelHint')}</span>
                      </div>
                      <div className="showcase-panel-grid">
                        <span>
                          {t('calc.panel.hp')} {Math.floor(card.panel.hp)}
                        </span>
                        <span>
                          {t('calc.panel.atk')} {Math.floor(card.panel.atk)}
                        </span>
                        <span>
                          {t('calc.panel.def')} {Math.floor(card.panel.def)}
                        </span>
                        <span>
                          {t('calc.panel.spd')} {Math.floor(card.panel.speed)}
                        </span>
                        <span>
                          {t('calc.panel.critRate')} {fmtPct(card.panel.critRate)}
                        </span>
                        <span>
                          {t('calc.panel.critDmg')} {fmtPct(card.panel.critDmg)}
                        </span>
                        <span>
                          {t('calc.panel.breakEffect')} {fmtPct(card.panel.breakEffect)}
                        </span>
                        <span>
                          {t('calc.panel.effectHit')} {fmtPct(card.panel.effectHit)}
                        </span>
                        <span>
                          {t('calc.panel.effectRes')} {fmtPct(card.panel.effectRes)}
                        </span>
                        <span>
                          {t('calc.panel.healBonus')} {fmtPct(card.panel.healBonus)}
                        </span>
                        <span>
                          {t('calc.panel.energyRegen')} {fmtPct(card.panel.energyRegen)}
                        </span>
                        {ELEMENT_KEYS.map((el) => {
                          const v = card.panel?.elementDmg[el] ?? 0;
                          if (!v) return null;
                          return (
                            <span key={el}>
                              {t(`calc.statProps.${el}AddedRatio`)} {fmtPct(v)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {pending?.char.avatarId === card.char.avatarId && (
                    <div className="showcase-overwrite">
                      <p>{t('showcase.overwriteBody')}</p>
                      <div className="showcase-overwrite-actions">
                        <button type="button" className="primary" onClick={() => commitImport(card)}>
                          {t('showcase.overwriteConfirm')}
                        </button>
                        <button type="button" className="secondary" onClick={() => setPending(null)}>
                          {t('showcase.overwriteCancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {building && <p className="muted">{t('showcase.building')}</p>}
    </section>
  );
}
