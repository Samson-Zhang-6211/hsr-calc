export const ENGINE_PACKAGE = '@hsr-calc/engine';

export {
  bonusZone,
  critZone,
  defenseZone,
  reductionZone,
  resistZone,
  toughnessZone,
  vulnZone,
  type CritMode,
  type ToughnessState,
} from './zones.js';

export {
  BREAK_DOT_MULTIPLIER,
  BREAK_ELEMENT_MULTIPLIER,
  BLEED_HP_COEFFICIENT,
  TOUGHNESS_POINTS_PER_BASIC,
  computeBreakDot,
  computeBreakTrigger,
  computeDirectDamage,
  computeDotDamage,
  computeElation,
  computeSuperBreak,
  computeTrueDamage,
  laughZone,
  toughnessCoeff,
  type BreakDotInput,
  type BreakTriggerInput,
  type CommonZonesInput,
  type DirectDamageInput,
  type DamageFactor,
  type DamageResult,
  type DotDamageInput,
  type ElationInput,
  type ElationMode,
  type EnemyClass,
  type SuperBreakInput,
  type TrueDamageInput,
} from './damage.js';

export {
  applyDamageToMember,
  computeEnemyDamage,
  type EnemyDamageInput,
  type EnemyDamageResult,
  type MemberDamageOutcome,
  type MemberHitState,
} from './enemy-damage.js';

export {
  BREAK_BASE_LEVEL_80,
  ELATION_BASE_LEVEL_80,
  tableFromRecord,
  type LevelBaseTable,
} from './base-tables.js';

export {
  categorizeStat,
  composePanel,
  elementOfStat,
  grownValue,
  mainAffixValue,
  minPromotionForLevel,
  resolvePromotion,
  subAffixRollValue,
  type GrowSegment,
  type PanelAddition,
  type PanelInput,
  type PanelStatCategory,
  type PanelStats,
  type WhiteValues,
} from './panel.js';

export {
  allocateEffectiveRelicSubs,
  effectiveRollTarget,
  generateRelicSubstats,
  type AllocatedRelicSet,
  type AllocateEffectiveOptions,
  type CritCap,
  type GeneratedRelicSub,
  type RelicAffix,
  type RelicGenOptions,
  type RelicGenResult,
  type RelicTier,
} from './relic-gen.js';

export {
  FIRST_ROUND_AV,
  LATER_ROUND_AV,
  TRACK_LENGTH,
  Timeline,
  type TimelineEvent,
  type TimelineOptions,
  type TimelineUnitConfig,
  type TimelineUnitView,
  type UnitSide,
} from './timeline.js';

export {
  TEAM_CHAR_IDS,
  TEAM_ROSTER_ID,
  simulateTeamAxis,
  type AxisActionType,
  type AxisEvent,
  type AxisEventKind,
  type AxisFinalState,
  type AxisNote,
  type AxisResult,
  type AxisUnitId,
  type SummonId,
  type TeamAxisConfig,
  type TeamMemberConfig,
} from './team-axis.js';

export {
  PERFORMANCE_ORDER,
  ENERGY_MAX,
  ALLY_TARGET_KINDS,
  type AllyAction,
  type AllyTargetKind,
  SUMMON_OWNERS,
  type SummonStatus,
  simulateBattle,
  simulateBattleReplay,
  tickCountdownMood,
  createInteractiveBattle,
  xiediePoint07Triggered,
  xiedieP06Take,
  feiyingSgUltMult,
  zhenzhuLowHpDr,
  type EnemyHpSnapshot,
  type BattleReplayStep,
  type BattleStatus,
  type BattleStep,
  type BattleStepOptions,
  type DecisionInput,
  type TargetPicks,
  type InteractiveBattle,
  type PredictRow,
} from './combat/battle.js';
export {
  addBuff,
  buffSum,
  findBuffInstance,
  removeBuff,
  removeBuffInstance,
  tickHolderBuffs,
  type Buff,
  type BuffHolder,
  type BuffKey,
  type BuffTick,
} from './combat/buff.js';
export {
  buildCommon,
  dispatchDamage,
  type DamageDispatch,
  type ZoneSnapshot,
} from './combat/damage-ops.js';
export { SKILL_TABLES, skillParams, stanceOf, type SkillTable } from './combat/skill-data.js';
export { LIGHTCONE_SKILLS, lcParams, type LightconeSkill } from './combat/lightcone-data.js';
export {
  RELIC_SETS,
  relicSetEffect,
  type RelicSetEffect,
} from './combat/relic-set-data.js';
export {
  ENEMY_SKILLS,
  enemyDamageSkills,
  enemySelfDamageReduction,
  enemySkillById,
  enemySkills,
  enemyUsableSkills,
  monsterPhaseCount,
  pkSubSummon,
  type EnemyDebuffKind,
  type EnemySkillDef,
  type EnemyTargetMode,
} from './combat/monster-skill-data.js';
export {
  ENEMY_STATUS,
  enemyStatusDef,
  enemyStatusMaxStacks,
  enemyStatusShared,
  type EnemyStatusDef,
  type EnemyStatusHook,
  type EnemyStatusKind,
} from './combat/monster-status-data.js';
export {
  MONSTER_STAGES,
  STAGE_MONSTERS,
  STAGE_PACKS,
  STAGE_SCALES,
  STAGE_SCALES_BY_GROUP,
  buildPackStageWaves,
  buildStageMonster,
  buildStageMonsterConfigs,
  monsterStage,
  packStage,
  stagePack,
  stageScale,
  stageSections,
  type StageDef,
  type StageFoe,
  type StageHalf,
  type StageKind,
  type StageMechanic,
  type StageMonsterProfile,
  type StagePackDef,
  type StageScale,
  type StageSection,
  type StageWave,
} from './combat/monster-stages.js';
export {
  STAGE_MECHANIC_IDS,
  mechanicIdsFor,
} from './combat/stage-mechanics.js';
export {
  SUMMON_MONSTERS,
  summonMonsterProfile,
  summonStats,
  type SummonMonsterProfile,
} from './combat/monster-summon-data.js';
export {
  MONSTER_DEBUFF_RESIST,
  debuffResistValue,
  monsterDebuffResist,
  monsterElementResistance,
  type MonsterDebuffResist,
} from './combat/monster-resist-data.js';
export {
  MONSTER_ELEM_RESIST,
  PURE_2027_MONSTERS,
  pureStageMonsterResist,
  type PureResistProfile,
} from './combat/monster-resist-table.js';
export type {
  AllyUnitId,
  BattleConfig,
  BattleFinalState,
  BattleReport,
  BattleResult,
  BattleSummary,
  BuffSnapshot,
  CharId,
  CombatActionType,
  CombatEvent,
  CombatMember,
  CombatTarget,
  CombatUnitId,
  EnemyHitLog,
  EnemyUnitId,
  HitLog,
  MemberPanel,
  MonsterConfig,
  MonsterId,
  PolicyFn,
  RoundMode,
  SkillLevels,
} from './combat/types.js';
