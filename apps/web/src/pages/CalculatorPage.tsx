import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  computeBreakDot,
  computeBreakTrigger,
  computeDirectDamage,
  computeDotDamage,
  computeElation,
  computeSuperBreak,
  type CommonZonesInput,
  type DamageResult,
  type ElationMode,
} from '@hsr-calc/engine';
import type { BreakDotType, DamageKind, Element } from '@hsr-calc/shared';
import { CHARACTER_ROSTER } from '../data/character-roster.js';
import { MONSTER_ROSTER } from '../data/monster-roster.js';
import {
  defaultLevelFor,
  detectStatKind,
  fetchCharacterDetail,
  fetchMonsterDetail,
  formatSkillDesc,
  paramPlaceholders,
  type CharacterDetail,
  type StatKind,
} from '../game-data.js';
import type { EffectClause } from '../equipment-effects.js';
import { storage, newId, type HistoryEntry } from '../storage.js';
import { HintCard } from '../hint-card.js';

const KINDS: DamageKind[] = [
  'direct',
  'dot',
  'breakTrigger',
  'breakDot',
  'superBreak',
  'elation',
  'trueDamage',
];
const ELEMENTS: Element[] = [
  'Physical',
  'Fire',
  'Ice',
  'Thunder',
  'Wind',
  'Quantum',
  'Imaginary',
];
const DOT_TYPES: BreakDotType[] = [
  'burn',
  'windShear',
  'shock',
  'bleed',
  'entanglement',
  'freeze',
];

const CUSTOM_MONSTER_ID = '__custom';
const CUSTOM_MONSTER_KEY = 'hsr-sim.customMonster';

interface CustomMonsterState {
  toughness: string;
  weak: string[];
  maxHp: string;
}

const CUSTOM_MONSTER_DEFAULT: CustomMonsterState = {
  toughness: '500',
  weak: [],
  maxHp: '10000000',
};

function loadCustomMonster(): CustomMonsterState {
  try {
    const raw = localStorage.getItem(CUSTOM_MONSTER_KEY);
    if (!raw) return CUSTOM_MONSTER_DEFAULT;
    const parsed = JSON.parse(raw) as Partial<CustomMonsterState>;
    return {
      toughness:
        typeof parsed.toughness === 'string' && parsed.toughness.trim() !== ''
          ? parsed.toughness
          : CUSTOM_MONSTER_DEFAULT.toughness,
      weak: Array.isArray(parsed.weak)
        ? parsed.weak.filter((w): w is string => (ELEMENTS as string[]).includes(w))
        : [],
      maxHp:
        typeof parsed.maxHp === 'string' && parsed.maxHp.trim() !== ''
          ? parsed.maxHp
          : CUSTOM_MONSTER_DEFAULT.maxHp,
    };
  } catch {
    return CUSTOM_MONSTER_DEFAULT;
  }
}

function num(v: string): number {
  const n = Number(v.replace(/[％%]/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** 百分数输入 → 引擎小数（50 → 0.5） */
function pct(v: string): number {
  return num(v) / 100;
}

export default function CalculatorPage() {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<DamageKind>('direct');
  const [attackerLevel, setAttackerLevel] = useState('80');
  const [enemyLevel, setEnemyLevel] = useState('95');
  const [statValue, setStatValue] = useState('2000');
  const [multiplier, setMultiplier] = useState('100');
  const [damageBonus, setDamageBonus] = useState('0');
  const [independent, setIndependent] = useState('1');
  const [critRate, setCritRate] = useState('50');
  const [critDmg, setCritDmg] = useState('150');
  const [critMode, setCritMode] = useState<'expected' | 'crit' | 'normal'>('expected');
  const [defReduction, setDefReduction] = useState('0');
  const [defIgnore, setDefIgnore] = useState('0');
  const [resistance, setResistance] = useState('0');
  const [resReduction, setResReduction] = useState('0');
  const [resPenetration, setResPenetration] = useState('0');
  const [vulnerability, setVulnerability] = useState('0');
  const [damageReductions, setDamageReductions] = useState('');
  const [toughness, setToughness] = useState<'unbroken' | 'broken' | 'notApplied'>('unbroken');
  const [element, setElement] = useState<Element>('Physical');
  const [toughnessPoints, setToughnessPoints] = useState('60');
  const [breakEffect, setBreakEffect] = useState('0');
  const [breakDmgBoost, setBreakDmgBoost] = useState('0');
  const [breakVuln, setBreakVuln] = useState('0');
  const [breakBase, setBreakBase] = useState('3767.55');
  const [dotType, setDotType] = useState<BreakDotType>('burn');
  const [stacks, setStacks] = useState('1');
  const [enemyMaxHp, setEnemyMaxHp] = useState('10000');
  const [enemyClass, setEnemyClass] = useState<'normal' | 'elite'>('normal');
  const [skillToughnessPoints, setSkillToughnessPoints] = useState('30');
  const [toughnessBoost, setToughnessBoost] = useState('0');
  const [weaknessBreakEfficiency, setWeaknessBreakEfficiency] = useState('0');
  const [superBreakBonus, setSuperBreakBonus] = useState('0');
  const [elationBase, setElationBase] = useState('7535.107');
  const [elationMultiplier, setElationMultiplier] = useState('100');
  const [elationDegree, setElationDegree] = useState('0');
  const [mirthBonus, setMirthBonus] = useState('0');
  const [elationMode, setElationMode] = useState<ElationMode>('normal');
  const [goodWork, setGoodWork] = useState('0');
  const [laughPoints, setLaughPoints] = useState('0');
  const [savedFlag, setSavedFlag] = useState(false);
  const [statKind, setStatKind] = useState<StatKind>('atk');
  const [loadedCharId, setLoadedCharId] = useState('');
  const [gameCharId, setGameCharId] = useState('');
  const [gameSkillId, setGameSkillId] = useState('');
  const [gameLevel, setGameLevel] = useState('');
  const [gameDetail, setGameDetail] = useState<CharacterDetail | null>(null);
  const [gameLoading, setGameLoading] = useState(false);
  const [gameError, setGameError] = useState(false);
  const [paramIndex, setParamIndex] = useState(1);
  const [monsterId, setMonsterId] = useState('');
  const [monsterWeak, setMonsterWeak] = useState<string[]>([]);
  const [monsterLoading, setMonsterLoading] = useState(false);
  const [monsterRes, setMonsterRes] = useState<Record<string, number>>({});
  const [customMonster, setCustomMonster] = useState<CustomMonsterState>(loadCustomMonster);
  const [loadedClauses, setLoadedClauses] = useState<EffectClause[]>([]);
  const [effectToggles, setEffectToggles] = useState<Record<string, boolean>>({});

  const equipmentAdds = useMemo(() => {
    const adds = {
      damageBonus: 0,
      breakDmgBoost: 0,
      vulnerability: 0,
      defIgnore: 0,
      defReduction: 0,
      elationDegree: 0,
      damageReductions: [] as number[],
    };
    for (const c of loadedClauses) {
      if (c.zone === 'unknown') continue;
      if (c.conditional && !effectToggles[c.id]) continue;
      switch (c.zone) {
        case 'damageBonus':
          adds.damageBonus += c.value;
          break;
        case 'breakDmgBoost':
          adds.breakDmgBoost += c.value;
          break;
        case 'vulnerability':
          adds.vulnerability += c.value;
          break;
        case 'defIgnore':
          adds.defIgnore += c.value;
          break;
        case 'defReduction':
          adds.defReduction += c.value;
          break;
        case 'elationDegree':
          adds.elationDegree += c.value;
          break;
        case 'damageReduction':
          adds.damageReductions.push(c.value);
          break;
      }
    }
    return adds;
  }, [loadedClauses, effectToggles]);

  const characters = storage.getCharacters();
  const rosterById = new Map(CHARACTER_ROSTER.map((c) => [c.id, c]));
  const charLabel = (c: (typeof characters)[number]): string => {
    const r = rosterById.get(c.rosterId ?? '');
    return r ? (i18n.language === 'en' ? r.en : r.zh) : c.name;
  };

  const skillEntries = gameDetail ? Object.values(gameDetail.skills) : [];
  const currentSkill = gameSkillId ? gameDetail?.skills[gameSkillId] : undefined;
  const levelKeys = currentSkill
    ? Object.keys(currentSkill.level)
        .map(Number)
        .sort((a, b) => a - b)
    : [];
  const currentParams: number[] =
    currentSkill?.level[String(gameLevel)]?.param_list ?? [];
  const placeholders = currentSkill?.desc ? paramPlaceholders(currentSkill.desc) : [];
  const descText =
    currentSkill?.desc != null ? formatSkillDesc(currentSkill.desc, currentParams) : '';

  useEffect(() => {
    if (!currentSkill || currentParams.length === 0) return;
    const chosen = currentParams[paramIndex - 1] ?? currentParams[0];
    if (chosen !== undefined) {
      const ph = placeholders.find((p) => p.index === paramIndex);
      const fill = ph?.percent ? chosen * 100 : chosen;
      setMultiplier(String(+fill.toFixed(4)));
      setElationMultiplier(String(+fill.toFixed(4)));
    }
    const kind = currentSkill.desc ? detectStatKind(currentSkill.desc) : null;
    if (kind) {
      setStatKind(kind);
      const c = characters.find((x) => x.id === loadedCharId);
      if (c) setStatValue(String(kind === 'atk' ? c.atk : kind === 'hp' ? c.hp : c.def));
    }
  }, [gameDetail, gameSkillId, gameLevel, paramIndex]);

  async function onGameCharChange(id: string) {
    setGameCharId(id);
    setGameSkillId('');
    setGameLevel('');
    setGameDetail(null);
    setGameError(false);
    if (!id) return;
    setGameLoading(true);
    try {
      const detail = await fetchCharacterDetail(
        id,
        i18n.language === 'en' ? 'en' : 'zh',
      );
      setGameDetail(detail);
      const skills = Object.values(detail.skills).filter(
        (s) => (s.level['1']?.param_list.length ?? 0) > 0,
      );
      const first =
        skills.find((s) => s.form === 'normal' && s.type === 'Normal') ??
        skills.find((s) => s.form === 'normal') ??
        skills[0];
      if (first) {
        setGameSkillId(first.id);
        setGameLevel(String(defaultLevelFor(first)));
        setParamIndex(1);
      }
    } catch {
      setGameError(true);
    } finally {
      setGameLoading(false);
    }
  }

  function onGameSkillChange(id: string) {
    setGameSkillId(id);
    setParamIndex(1);
    const skill = gameDetail?.skills[id];
    if (skill) setGameLevel(String(defaultLevelFor(skill)));
  }

  function saveCustomMonster(next: CustomMonsterState) {
    setCustomMonster(next);
    try {
      localStorage.setItem(CUSTOM_MONSTER_KEY, JSON.stringify(next));
    } catch {
      /* 存储超配额则仅内存生效 */
    }
  }

  function updateCustomMonster(patch: Partial<CustomMonsterState>) {
    const next = { ...customMonster, ...patch };
    saveCustomMonster(next);
    if (monsterId === CUSTOM_MONSTER_ID) {
      if (patch.toughness !== undefined) setToughnessPoints(patch.toughness);
      if (patch.weak !== undefined) setMonsterWeak(patch.weak);
      if (patch.maxHp !== undefined) setEnemyMaxHp(patch.maxHp);
    }
  }

  async function onMonsterChange(id: string) {
    setMonsterId(id);
    setMonsterWeak([]);
    setMonsterRes({});
    if (id === CUSTOM_MONSTER_ID) {
      setToughnessPoints(customMonster.toughness);
      setMonsterWeak(customMonster.weak);
      setEnemyMaxHp(customMonster.maxHp);
      return;
    }
    if (!id) return;
    setMonsterLoading(true);
    try {
      const detail = await fetchMonsterDetail(
        id,
        i18n.language === 'en' ? 'en' : 'zh',
      );
      setToughnessPoints(String(+detail.toughnessPoints.toFixed(2)));
      setMonsterWeak(detail.weak);
      setMonsterRes(detail.resistances ?? {});
      if (Object.keys(detail.resistances ?? {}).length > 0) {
        const r = detail.resistances[element] ?? 0;
        setResistance(String(+((r * 100).toFixed(2))));
      }
    } catch {
      /* 详情拉取失败则保留手动输入 */
    } finally {
      setMonsterLoading(false);
    }
  }

  const result: DamageResult | null = useMemo(() => {
    const common: CommonZonesInput = {
      attackerLevel: num(attackerLevel),
      enemyLevel: num(enemyLevel),
      defReduction: pct(defReduction) + equipmentAdds.defReduction,
      defIgnore: pct(defIgnore) + equipmentAdds.defIgnore,
      resistance: pct(resistance),
      resReduction: pct(resReduction),
      resPenetration: pct(resPenetration),
      vulnerability: pct(vulnerability) + equipmentAdds.vulnerability,
      damageReductions: [
        ...damageReductions
          .split(',')
          .map((s) => pct(s.trim()))
          .filter((n) => n !== 0),
        ...equipmentAdds.damageReductions,
      ],
      toughness,
    };
    try {
      switch (kind) {
        case 'direct':
          return computeDirectDamage({
            statValue: num(statValue),
            multiplier: pct(multiplier),
            damageBonus: pct(damageBonus) + equipmentAdds.damageBonus,
            critRate: pct(critRate),
            critDmg: pct(critDmg),
            critMode,
            independentMultiplier: num(independent),
            common,
          });
        case 'dot':
          return computeDotDamage({
            statValue: num(statValue),
            multiplier: pct(multiplier),
            damageBonus: pct(damageBonus) + equipmentAdds.damageBonus,
            independentMultiplier: num(independent),
            common,
          });
        case 'breakTrigger':
          return computeBreakTrigger({
            breakBase: num(breakBase),
            element,
            toughnessPoints: num(toughnessPoints),
            breakEffect: pct(breakEffect),
            breakDmgBoost: pct(breakDmgBoost) + equipmentAdds.breakDmgBoost,
            breakVuln: pct(breakVuln),
            independentMultiplier: num(independent),
            common,
          });
        case 'breakDot':
          return computeBreakDot({
            breakBase: num(breakBase),
            dotType,
            stacks: num(stacks),
            breakEffect: pct(breakEffect),
            breakDmgBoost: pct(breakDmgBoost) + equipmentAdds.breakDmgBoost,
            breakVuln: pct(breakVuln),
            toughnessPoints: num(toughnessPoints),
            enemyMaxHp: num(enemyMaxHp),
            enemyClass,
            independentMultiplier: num(independent),
            common,
          });
        case 'superBreak':
          return computeSuperBreak({
            breakBase: num(breakBase),
            breakEffect: pct(breakEffect),
            skillToughnessPoints: num(skillToughnessPoints),
            toughnessBoost: pct(toughnessBoost),
            weaknessBreakEfficiency: pct(weaknessBreakEfficiency),
            superBreakBonus: pct(superBreakBonus),
            breakDmgBoost: pct(breakDmgBoost) + equipmentAdds.breakDmgBoost,
            breakVuln: pct(breakVuln),
            independentMultiplier: num(independent),
            common,
          });
        case 'elation':
          return computeElation({
            elationBase: num(elationBase),
            multiplier: pct(elationMultiplier),
            elationDegree: pct(elationDegree) + equipmentAdds.elationDegree,
            mirthBonus: pct(mirthBonus),
            mode: elationMode,
            goodWorkReward: num(goodWork),
            laughPoints: num(laughPoints),
            critRate: pct(critRate),
            critDmg: pct(critDmg),
            critMode,
            independentMultiplier: num(independent),
            common,
          });
        case 'trueDamage':
          // 真实伤害为占位类型：不走任何乘区，仅依附技能效果在实战中结算（恒 0）
          return { kind: 'trueDamage', factors: [], total: 0 };
      }
    } catch {
      return null;
    }
  }, [
    kind,
    attackerLevel,
    enemyLevel,
    statValue,
    multiplier,
    damageBonus,
    independent,
    critRate,
    critDmg,
    critMode,
    defReduction,
    defIgnore,
    resistance,
    resReduction,
    resPenetration,
    vulnerability,
    damageReductions,
    toughness,
    element,
    toughnessPoints,
    breakEffect,
    breakDmgBoost,
    breakVuln,
    breakBase,
    dotType,
    stacks,
    enemyMaxHp,
    enemyClass,
    skillToughnessPoints,
    toughnessBoost,
    weaknessBreakEfficiency,
    superBreakBonus,
    elationBase,
    elationMultiplier,
    elationDegree,
    mirthBonus,
    elationMode,
    goodWork,
    laughPoints,
    equipmentAdds,
  ]);

  function loadCharacter(id: string) {
    setLoadedCharId(id);
    const c = characters.find((x) => x.id === id);
    if (!c) return;
    setAttackerLevel(String(c.level));
    setStatValue(String(c.atk));
    setCritRate(String(+(c.critRate * 100).toFixed(4)));
    setCritDmg(String(+(c.critDmg * 100).toFixed(4)));
    setBreakEffect(String(+(c.breakEffect * 100).toFixed(4)));
    setDamageBonus(String(+(c.damageBonus * 100).toFixed(4)));
    setStatKind('atk');
    setLoadedClauses(c.equipment?.effectClauses ?? []);
    setEffectToggles({});
  }

  function saveToHistory() {
    if (!result) return;
    const entry: HistoryEntry = {
      id: newId(),
      time: Date.now(),
      kind: t(`calc.kinds.${kind}`),
      total: result.total,
      summary: result.factors.map((f) => `${f.key}=${f.value.toFixed(4)}`).join(' '),
    };
    storage.saveHistory([entry, ...storage.getHistory()].slice(0, 200));
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 1500);
  }

  return (
    <div>
      <section className="panel">
        <h2>{t('calc.title')}</h2>
        <HintCard id="calculator" />
        <div className="tabs">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={k === kind ? 'active' : ''}
              onClick={() => setKind(k)}
            >
              {t(`calc.kinds.${k}`)}
            </button>
          ))}
        </div>

        <div className="grid">
          <label className="field">
            {t('calc.loadCharacter')}
            <select onChange={(e) => loadCharacter(e.target.value)} defaultValue="">
              <option value="">{t('calc.none')}</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {charLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('calc.fields.attackerLevel')}
            <input value={attackerLevel} onChange={(e) => setAttackerLevel(e.target.value)} />
          </label>
          <label className="field">
            {t('calc.fields.enemyLevel')}
            <input value={enemyLevel} onChange={(e) => setEnemyLevel(e.target.value)} />
          </label>
          {(kind === 'direct' || kind === 'dot') && (
            <>
              <label className="field">
                {t('calc.statKind')}
                <select
                  value={statKind}
                  onChange={(e) => setStatKind(e.target.value as StatKind)}
                >
                  <option value="atk">{t('calc.statKinds.atk')}</option>
                  <option value="hp">{t('calc.statKinds.hp')}</option>
                  <option value="def">{t('calc.statKinds.def')}</option>
                </select>
              </label>
              <label className="field">
                {t('calc.fields.statValue')}
                <input value={statValue} onChange={(e) => setStatValue(e.target.value)} />
              </label>
              <label className="field">
                {t('calc.fields.multiplier')}
                <input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} />
                <span className="muted">× {pct(multiplier)}</span>
              </label>
              <label className="field">
                {t('calc.fields.damageBonus')}
                <input value={damageBonus} onChange={(e) => setDamageBonus(e.target.value)} />
              </label>
            </>
          )}
          {(kind === 'direct' || kind === 'elation') && (
            <>
              <label className="field">
                {t('calc.fields.critRate')}
                <input value={critRate} onChange={(e) => setCritRate(e.target.value)} />
              </label>
              <label className="field">
                {t('calc.fields.critDmg')}
                <input value={critDmg} onChange={(e) => setCritDmg(e.target.value)} />
              </label>
              <label className="field">
                {t('calc.fields.critMode')}
                <select
                  value={critMode}
                  onChange={(e) => setCritMode(e.target.value as typeof critMode)}
                >
                  <option value="expected">{t('calc.fields.critExpected')}</option>
                  <option value="crit">{t('calc.fields.critMust')}</option>
                  <option value="normal">{t('calc.fields.critNone')}</option>
                </select>
              </label>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>{t('calc.gameData')}</h2>
        <div className="grid">
          <label className="field">
            {t('calc.gameChar')}
            <select value={gameCharId} onChange={(e) => void onGameCharChange(e.target.value)}>
              <option value="">{t('calc.none')}</option>
              {CHARACTER_ROSTER.map((c) => (
                <option key={c.id} value={c.id}>
                  {i18n.language === 'en' ? c.en : c.zh}（{t(`elements.${c.element}`)}）
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('calc.gameSkill')}
            <select
              value={gameSkillId}
              onChange={(e) => onGameSkillChange(e.target.value)}
              disabled={!gameDetail}
            >
              <option value="">{t('calc.none')}</option>
              {skillEntries.map((s) => {
                const tag = t(`calc.formTags.${s.form}`);
                return (
                  <option key={`${s.form}-${s.id}`} value={s.id}>
                    {tag ? `[${tag}] ` : ''}
                    {s.type_name ? `${s.type_name} · ` : ''}
                    {s.name}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="field">
            {t('calc.gameLevel')}
            <select
              value={gameLevel}
              onChange={(e) => setGameLevel(e.target.value)}
              disabled={!currentSkill}
            >
              {levelKeys.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          </label>
        </div>
        {gameLoading && <p className="muted">{t('calc.loading')}</p>}
        {gameError && <p className="muted">{t('calc.loadFailed')}</p>}
        {placeholders.length > 0 && (
          <p style={{ marginTop: 12 }}>
            {t('calc.gameParams')}：
            {placeholders.map((ph) => {
              const v = currentParams[ph.index - 1];
              const label =
                v === undefined
                  ? `#${ph.index}`
                  : ph.percent
                    ? `#${ph.index}=${(v * 100).toFixed(0)}%`
                    : `#${ph.index}=${v}`;
              return (
                <button
                  key={ph.index}
                  type="button"
                  className={paramIndex === ph.index ? 'primary' : 'secondary'}
                  style={{ marginRight: 6 }}
                  onClick={() => setParamIndex(ph.index)}
                >
                  {label}
                </button>
              );
            })}
          </p>
        )}
        {descText && (
          <p style={{ whiteSpace: 'pre-wrap' }}>
            {t('calc.gameDesc')}：{descText}
          </p>
        )}
      </section>

      {loadedClauses.length > 0 && (
        <section className="panel">
          <h2>{t('calc.effects.title')}</h2>
          {loadedClauses.map((c) =>
            c.zone === 'engine' ? (
              <p key={c.id}>
                {c.raw} <span className="muted">（{t('calc.effects.engine')}）</span>
              </p>
            ) : c.zone === 'unknown' ? (
              <p key={c.id} className="muted">
                {c.raw}（{t('calc.effects.unknown')}）
              </p>
            ) : c.conditional ? (
              <label key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={effectToggles[c.id] ?? false}
                  onChange={(e) =>
                    setEffectToggles((prev) => ({ ...prev, [c.id]: e.target.checked }))
                  }
                />
                <span>{c.raw}</span>
              </label>
            ) : (
              <p key={c.id}>
                {c.raw} <span className="muted">（{t('calc.effects.auto')}）</span>
              </p>
            ),
          )}
        </section>
      )}

      <section className="panel">
        <h2>{t('calc.enemy')}</h2>
        <div className="grid">
          <label className="field">
            {t('calc.monster')}
            <select
              value={monsterId}
              onChange={(e) => void onMonsterChange(e.target.value)}
            >
              <option value="">{t('calc.none')}</option>
              {MONSTER_ROSTER.map((m) => (
                <option key={m.id} value={m.id}>
                  {i18n.language === 'en' ? m.en : m.zh}
                </option>
              ))}
              <option value={CUSTOM_MONSTER_ID}>{t('calc.customMonster')}</option>
            </select>
          </label>
          <label className="field">
            {t('calc.fields.resistance')}
            <input value={resistance} onChange={(e) => setResistance(e.target.value)} />
          </label>
          <label className="field">
            {t('calc.fields.enemyMaxHp')}
            <input
              value={enemyMaxHp}
              onChange={(e) => {
                setEnemyMaxHp(e.target.value);
                if (monsterId === CUSTOM_MONSTER_ID) updateCustomMonster({ maxHp: e.target.value });
              }}
            />
          </label>
          <label className="field">
            {t('calc.fields.enemyClass')}
            <select
              value={enemyClass}
              onChange={(e) => setEnemyClass(e.target.value as typeof enemyClass)}
            >
              <option value="normal">{t('calc.fields.enemyNormal')}</option>
              <option value="elite">{t('calc.fields.enemyElite')}</option>
            </select>
          </label>
        </div>
        {monsterId === CUSTOM_MONSTER_ID && (
          <div className="grid" style={{ marginTop: 8 }}>
            <label className="field">
              {t('calc.fields.toughnessPoints')}
              <input
                value={customMonster.toughness}
                onChange={(e) => updateCustomMonster({ toughness: e.target.value })}
              />
            </label>
            <label className="field">
              {t('calc.fields.enemyMaxHp')}
              <input
                value={customMonster.maxHp}
                onChange={(e) => updateCustomMonster({ maxHp: e.target.value })}
              />
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <span>{t('calc.monsterWeak')}</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {ELEMENTS.map((el) => (
                  <label key={el} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={customMonster.weak.includes(el)}
                      onChange={(e) =>
                        updateCustomMonster({
                          weak: e.target.checked
                            ? [...customMonster.weak, el]
                            : customMonster.weak.filter((w) => w !== el),
                        })
                      }
                    />
                    {t(`elements.${el}`)}
                  </label>
                ))}
              </div>
            </div>
            <p className="muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
              {t('calc.customMonsterInfo')}
            </p>
          </div>
        )}
        {monsterLoading && <p className="muted">{t('calc.loading')}</p>}
        {monsterWeak.length > 0 && (
          <p className="muted">
            {t('calc.monsterWeak')}：{monsterWeak.map((w) => t(`elements.${w}`)).join(' / ')}
          </p>
        )}
        {Object.keys(monsterRes).length > 0 && (
          <p className="muted">
            {t('calc.monsterRes')}：
            {ELEMENTS.map(
              (el) =>
                `${t(`elements.${el}`)} ${Number(((monsterRes[el] ?? 0) * 100).toFixed(2))}%`,
            ).join(' / ')}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>{t('calc.modifiers')}</h2>
        <div className="grid">
          <label className="field">
            {t('calc.fields.defReduction')}
            <input value={defReduction} onChange={(e) => setDefReduction(e.target.value)} />
          </label>
          <label className="field">
            {t('calc.fields.defIgnore')}
            <input value={defIgnore} onChange={(e) => setDefIgnore(e.target.value)} />
          </label>
          <label className="field">
            {t('calc.fields.resReduction')}
            <input value={resReduction} onChange={(e) => setResReduction(e.target.value)} />
          </label>
          <label className="field">
            {t('calc.fields.resPenetration')}
            <input value={resPenetration} onChange={(e) => setResPenetration(e.target.value)} />
          </label>
          <label className="field">
            {t('calc.fields.vulnerability')}
            <input value={vulnerability} onChange={(e) => setVulnerability(e.target.value)} />
          </label>
          <label className="field">
            {t('calc.fields.damageReductions')}
            <input
              value={damageReductions}
              onChange={(e) => setDamageReductions(e.target.value)}
            />
          </label>
          <label className="field">
            {t('calc.fields.independentMultiplier')}
            <input value={independent} onChange={(e) => setIndependent(e.target.value)} />
            <span className="muted">× {num(independent)}</span>
          </label>
          <label className="field">
            {t('calc.fields.toughness')}
            <select
              value={toughness}
              onChange={(e) => setToughness(e.target.value as typeof toughness)}
            >
              <option value="unbroken">{t('calc.fields.toughnessUnbroken')}</option>
              <option value="broken">{t('calc.fields.toughnessBroken')}</option>
              <option value="notApplied">{t('calc.fields.toughnessNotApplied')}</option>
            </select>
          </label>
        </div>
      </section>

      {(kind === 'breakTrigger' || kind === 'breakDot' || kind === 'superBreak') && (
        <section className="panel">
          <h2>{t('calc.breakSection')}</h2>
          <div className="grid">
            <label className="field">
              {t('calc.fields.breakBase')}
              <input value={breakBase} onChange={(e) => setBreakBase(e.target.value)} />
            </label>
            <label className="field">
              {t('calc.fields.breakEffect')}
              <input value={breakEffect} onChange={(e) => setBreakEffect(e.target.value)} />
            </label>
            <label className="field">
              {t('calc.fields.breakDmgBoost')}
              <input
                value={breakDmgBoost}
                onChange={(e) => setBreakDmgBoost(e.target.value)}
              />
            </label>
            <label className="field">
              {t('calc.fields.breakVuln')}
              <input value={breakVuln} onChange={(e) => setBreakVuln(e.target.value)} />
            </label>
            {kind !== 'superBreak' && (
              <>
                <label className="field">
                  {t('calc.fields.element')}
                  <select
                    value={kind === 'breakDot' ? dotType : element}
                    onChange={(e) => {
                      if (kind === 'breakDot') setDotType(e.target.value as BreakDotType);
                      else {
                        const el = e.target.value as Element;
                        setElement(el);
                        if (Object.keys(monsterRes).length > 0) {
                          setResistance(
                            String(+(((monsterRes[el] ?? 0) * 100).toFixed(2))),
                          );
                        }
                      }
                    }}
                  >
                    {kind === 'breakDot'
                      ? DOT_TYPES.map((d) => (
                          <option key={d} value={d}>
                            {t(`dotTypes.${d}`)}
                          </option>
                        ))
                      : ELEMENTS.map((el) => (
                          <option key={el} value={el}>
                            {t(`elements.${el}`)}
                          </option>
                        ))}
                  </select>
                </label>
                <label className="field">
                  {t('calc.fields.toughnessPoints')}
                  <input
                    value={toughnessPoints}
                    onChange={(e) => {
                      setToughnessPoints(e.target.value);
                      if (monsterId === CUSTOM_MONSTER_ID) {
                        updateCustomMonster({ toughness: e.target.value });
                      }
                    }}
                  />
                </label>
              </>
            )}
            {kind === 'breakDot' && (
              <>
                <label className="field">
                  {t('calc.fields.stacks')}
                  <input value={stacks} onChange={(e) => setStacks(e.target.value)} />
                </label>
              </>
            )}
            {kind === 'superBreak' && (
              <>
                <label className="field">
                  {t('calc.fields.skillToughnessPoints')}
                  <input
                    value={skillToughnessPoints}
                    onChange={(e) => setSkillToughnessPoints(e.target.value)}
                  />
                </label>
                <label className="field">
                  {t('calc.fields.toughnessBoost')}
                  <input
                    value={toughnessBoost}
                    onChange={(e) => setToughnessBoost(e.target.value)}
                  />
                </label>
                <label className="field">
                  {t('calc.fields.weaknessBreakEfficiency')}
                  <input
                    value={weaknessBreakEfficiency}
                    onChange={(e) => setWeaknessBreakEfficiency(e.target.value)}
                  />
                </label>
                <label className="field">
                  {t('calc.fields.superBreakBonus')}
                  <input
                    value={superBreakBonus}
                    onChange={(e) => setSuperBreakBonus(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>
        </section>
      )}

      {kind === 'elation' && (
        <section className="panel">
          <h2>{t('calc.elationSection')}</h2>
          <div className="grid">
            <label className="field">
              {t('calc.fields.elationMode')}
              <select
                value={elationMode}
                onChange={(e) => setElationMode(e.target.value as ElationMode)}
              >
                <option value="normal">{t('calc.elationModes.normal')}</option>
                <option value="ahaMoment">{t('calc.elationModes.ahaMoment')}</option>
              </select>
            </label>
            <label className="field">
              {t('calc.fields.goodWorkReward')}
              <input value={goodWork} onChange={(e) => setGoodWork(e.target.value)} />
            </label>
            <label className="field">
              {t('calc.fields.laughPoints')}
              <input value={laughPoints} onChange={(e) => setLaughPoints(e.target.value)} />
            </label>
            <label className="field">
              {t('calc.fields.elationBase')}
              <input value={elationBase} onChange={(e) => setElationBase(e.target.value)} />
            </label>
            <label className="field">
              {t('calc.fields.elationMultiplier')}
              <input
                value={elationMultiplier}
                onChange={(e) => setElationMultiplier(e.target.value)}
              />
              <span className="muted">× {pct(elationMultiplier)}</span>
            </label>
            <label className="field">
              {t('calc.fields.elationDegree')}
              <input value={elationDegree} onChange={(e) => setElationDegree(e.target.value)} />
            </label>
            <label className="field">
              {t('calc.fields.mirthBonus')}
              <input value={mirthBonus} onChange={(e) => setMirthBonus(e.target.value)} />
            </label>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>{t('calc.result')}</h2>
        {result ? (
          <>
            <p>
              {t('calc.total')}: <span className="total">{result.total.toFixed(4)}</span>
            </p>
            <h2>{t('calc.factors')}</h2>
            <table>
              <thead>
                <tr>
                  <th>{t('calc.factors')}</th>
                  <th>×</th>
                </tr>
              </thead>
              <tbody>
                {result.factors.map((f) => (
                  <tr key={f.key}>
                    <td>{t(`calc.factorKeys.${f.key}`)}</td>
                    <td>{f.value.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 12 }}>
              <button type="button" className="primary" onClick={saveToHistory}>
                {savedFlag ? t('calc.saved') : t('calc.save')}
              </button>
            </p>
          </>
        ) : (
          <p className="muted">—</p>
        )}
      </section>
    </div>
  );
}
