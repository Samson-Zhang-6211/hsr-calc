/**
 * 立绘战场区（2026-10-25 新增，两页共用）
 *
 * 由来：全真模拟页（FullSimPage）原本把这块 markup 内联在 3000 行里；数值代理模拟页
 * （TimelinePage）要「加一块和全真模拟一致的、有立绘的区域」→ 抽成本组件，两页共用同一份
 * 视觉与动画实现，避免第二次复制粘贴。
 *
 * 职责边界：
 *  - **只负责画**：立绘卡（我方）、敌方三槽、召唤物窄卡、中间简略信息栏、底部条容器；
 *  - **不管战斗**：所有数值由调用方传入（全真模拟传 controller 的 status，数值代理传回放快照）；
 *  - **不管编排**：动画帧由 `battle-anim.ts` 的 `planFrames` 产出，这里只按帧渲染
 *    「出手者前冲 / 受击方抖动+闪光 / 飘字 / 终结技演出」；
 *  - 交互全部可选（`onPick` 不传 = 只读展示）：全真模拟传目标点选与终结技按钮，
 *    数值代理模拟不传（回放不参与操作）。
 *
 * 视觉口径保持不变（2026-10-11 用户裁定为冻结区）：渐变背景、血条/能量/韧性的内联色、
 * 列宽变量（`--stage-col-*`）都沿用原样，本次只新增动画层。
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { assetUrl } from './asset-url.js';
import type { AnimFrame } from './battle-anim.js';
import { EXTRA_SUMMON_OWNERS, POP_LIFETIME_MS } from './battle-anim.js';

/** 属性徽章：nanoka 七元素图标（路径见 scripts/fetch-ui-icons.mjs） */
export const elementIcon = (el: string): string => assetUrl(`element/${el.toLowerCase()}.webp`);
/** 命途徽章 612x612（memory/elation 为 512x512） */
export const pathIcon = (p: string): string => assetUrl(`pathicon/${p.toLowerCase()}.webp`);
/**
 * 4 个「主角第二形态」源站没有技能图标（8002/8004/8006/8008）。
 * 实测 `data/characters` 里这 4 对兄弟的 SkillIcon 路径**逐条完全相同**（同命途图标一致），
 * 所以直接借第一形态的图，别让终结技槽退成文字按钮（2026-11-07 立绘核查）。
 */
const SKILL_ICON_ALIAS: Record<string, string> = {
  '8002': '8001',
  '8004': '8003',
  '8006': '8005',
  '8008': '8007',
};

/** 技能图标 128×128：Normal=普攻 BP=战技 Ultra=终结技 Passive=天赋 */
export const skillIcon = (
  rosterId: string,
  kind: 'Normal' | 'BP' | 'Ultra' | 'Passive',
): string => assetUrl(`skillicon/${SKILL_ICON_ALIAS[rosterId] ?? rosterId}_${kind}.webp`);
/** 敌方美术（`monster-art/{id}.webp`；覆盖不全，失败时退回徽章） */
export const monsterArt = (monsterId: string): string => assetUrl(`monster-art/${monsterId}.webp`);

/** 手配木桩（未选怪物）时的默认美术 = 无想面具 8001030 */
export const DEFAULT_MONSTER_ART_ID = '8001030';

/** 战技点上限（引擎侧上限 5，初始 3） */
export const SP_MAX = 5;

/** 敌方木桩槽（顺序即显示顺序；2026-11-01 用户裁定：最多 5 个，monster3 居中为主目标） */
export const MONSTER_IDS = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5'] as const;

/** 我方召唤物窄卡（引擎 SummonStatus 的显示子集） */
export interface StageSummon {
  id: string;
  owner: string;
  present: boolean;
  stacks?: number;
  birds?: { beisi: boolean; qiumi: boolean; paiding: boolean };
  charge?: number;
  hp?: number;
  hpMax?: number;
  /**
   * 召唤物自己的头像（2026-11-07）：`summonIconUrl(id)` 的结果。
   * 不传 = CDN 无图（神君/龙灵/浮元/晴空乐手）→ 组件画「元素徽记 + 名字」，
   * **不要退回复用主人立绘**（用户当场指出那不是神君）。
   */
  iconSrc?: string;
}

/** 我方一张立绘卡 */
export interface StageAlly {
  id: string;
  rosterId: string;
  name: string;
  element?: string;
  path?: string;
  hp: number;
  maxHp: number;
  shield: number;
  energy: number;
  energyMax: number;
  dead: boolean;
  ultReady: boolean;
  /** 隐藏分（火花/欢愉类机制在卡面上的小数值；不传 = 不显示） */
  hidden?: number;
  /** 终结技槽：全真模拟注入可点按钮；不传 = 只读图标（数值代理模拟） */
  ultSlot?: ReactNode;
  /** 【连麦PK】是否被隔离到副战场（火花大会 5014010，2026-10-30 裁定 51：页面要标出） */
  subField?: boolean;
  summons?: readonly StageSummon[];
  /** 黄框（目标已选中／自身目标技能默认高亮） */
  marked?: boolean;
  /** 可点选（需要选我方目标的技能） */
  pickable?: boolean;
  onPick?: () => void;
  /** 正在行动（蓝框高亮） */
  acting?: boolean;
}

/** 敌方一个木桩槽 */
export interface StageEnemy {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  toughness: number;
  maxToughness: number;
  broken: boolean;
  artId: string;
  /** 美术是否可用（false = 该 id 无图，退回序号徽章） */
  artOk?: boolean;
  /** main=黄框可确认 / adjacent=扩散波及（仅加粗，不可点） */
  highlight?: 'main' | 'adjacent' | null;
  pickable?: boolean;
  onPick?: () => void;
}

/** 中间简略信息栏 */
export interface StageCenter {
  round: number | string;
  time: number | string;
  totalDamage: number;
  enemyHpLeft: number;
  allyHpLeft: number;
  /** 本行动伤害（当前动画帧的飘字合计；大号黄字显示在最下面） */
  actionDamage?: number;
  /**
   * 全队共享资源（2026-11-07：阿哈【笑点】等）：显示在「本行动伤害」**上方**。
   * 空数组 = 不占位（非欢愉队伍没有这一行）。
   */
  shared?: readonly { key: string; label: string; value: string }[];
}

export interface BattleStageProps {
  allies: readonly StageAlly[];
  enemies: readonly StageEnemy[];
  center: StageCenter;
  sp: number;
  /** 当前动画帧（null = 静止） */
  frame?: AnimFrame | null;
  /**
   * 顶部 HUD 插槽（2026-11-07 命令区一体化批）：全真模拟放「战斗状态 + 暂停/撤回/重新开始/快进」。
   * 不传 = 不渲染这一行（数值代理模拟保持原样）。行本身 `position: sticky`，
   * 页面滚到战报时仍在视口顶部可操作。
   */
  header?: ReactNode;
  /**
   * 左侧竖排行动条插槽（2026-11-07 第二批）：全真模拟放 `ActionRail`（出手顺序）。
   * 不传 = 不占用这一列（数值代理模拟保持三列）。
   */
  rail?: ReactNode;
  /** 底部条内容：全真模拟=普攻/战技/目标/确定；数值代理=播放控制 */
  footer?: ReactNode;
  /** 中间信息栏追加内容（如回放进度） */
  extraCenter?: ReactNode;
  /** 敌方名字徽章兜底（美术加载失败时显示序号） */
  onEnemyArtError?: (artId: string) => void;
}

const barPct = (v: number, max: number): number =>
  max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0;

const fmtInt = (v: number): string => Math.round(v).toLocaleString();

/**
 * 动画重播技巧：**不 remount 元素**（否则立绘 <img> 会被重建），改按帧号奇偶在两个
 * 同名 keyframes 之间切换——类名变化即触发一次新的 CSS 动画。见 styles.css 的 `*-alt` 段。
 */
const animClass = (base: string, frame: AnimFrame | null | undefined): string =>
  frame && frame.id % 2 === 1 ? `${base} ${base}-alt` : base;

// ── 动画零件（两页共用：BattleStage 内部用，全真模拟的内联战场区也直接引用） ──────────

/** 出手者前冲类名（actor 命中该帧时才加；召唤物窄卡同样适用）
 *  无独立卡片的行动条召唤物（账账 topazNumby）没有自己的 DOM 卡 → 前冲借用主人立绘。 */
export function stageLungeClass(frame: AnimFrame | null | undefined, id: string): string {
  if (!frame || (frame.kind !== 'ally' && frame.kind !== 'ult')) return 'stage-sprite';
  const carded = frame.actor === id;
  const cardlessOwner = EXTRA_SUMMON_OWNERS[frame.actor!] === id;
  if (!carded && !cardlessOwner) return 'stage-sprite';
  return `stage-sprite ${animClass('stage-lunge-r', frame)}`;
}

/** 受击抖动类名（敌方出手打我方的立绘/召唤物） */
export function stageShakeClass(frame: AnimFrame | null | undefined, id: string): string {
  if (!frame || frame.kind !== 'enemy' || !frame.targets.includes(id)) return 'stage-sprite';
  return `stage-sprite ${animClass('stage-shake', frame)}`;
}

/** 该帧是否打到了这个目标（决定要不要叠受击闪光） */
export function stageHitBy(frame: AnimFrame | null | undefined, id: string): boolean {
  return !!frame && frame.targets.includes(id);
}

/** 受击闪光（覆盖在立绘/头像上；round=圆形头像） */
export function StageFlash({ frame, round }: { frame: AnimFrame; round?: boolean }): ReactNode {
  return (
    <span
      className={`stage-flash${round ? ' stage-flash--round' : ''} ${animClass('stage-flash', frame)}`}
      style={{ ['--anim-dur' as string]: `${frame.durationMs}ms` }}
    />
  );
}

/** 某个目标身上的伤害飘字（negative=我方受击，前缀「-」） */
export function StagePops({
  frame,
  target,
  negative = false,
  max = 8,
}: {
  frame: AnimFrame;
  target: string;
  negative?: boolean;
  max?: number;
}): ReactNode {
  const { t } = useTranslation();
  const pops = frame.numbers.filter((n) => n.target === target);
  if (pops.length === 0) return null;
  return (
    <>
      {pops.slice(0, max).map((n, i) => (
        <span key={`${frame.id}-${i}`}>
          {/* 「暴击」/「击破」小标签：游戏里就是在数字上方跳两个字，白字带描边 */}
          {n.tag && (
            <span
              className="stage-pop-tag"
              style={{
                animationDelay: `${n.delayMs}ms`,
                ['--anim-dur' as string]: `${POP_LIFETIME_MS}ms`,
                ['--pop-x' as string]: `${n.offsetX}px`,
                ['--pop-y' as string]: `${n.offsetY}px`,
              }}
            >
              {n.tag === 'crit' ? t('fullsim.popCrit') : t('fullsim.popBreak')}
            </span>
          )}
          <span
            className={`stage-pop stage-pop--${n.tier}${n.rainbow ? ' stage-pop--rainbow' : ''}`}
            data-testid="stage-pop"
            style={{
              color: n.color,
              animationDelay: `${n.delayMs}ms`,
              ['--anim-dur' as string]: `${POP_LIFETIME_MS}ms`,
              ['--pop-rot' as string]: `${n.angleDeg}deg`,
              ['--pop-x' as string]: `${n.offsetX}px`,
              ['--pop-y' as string]: `${n.offsetY}px`,
            }}
          >
            {negative ? '-' : ''}
            {n.value.toLocaleString()}
            {n.multi && n.multi > 1 ? <span className="stage-pop-multi">×{n.multi}</span> : null}
          </span>
        </span>
      ))}
    </>
  );
}

/**
 * 技能名顶部小条（2026-10-26 用户裁定）：
 * 只显示技能名、不显示单位名；普攻/战技/追击/敌方出手都用它，终结技改用全屏演出。
 */
export function StageSkillName({ frame }: { frame: AnimFrame | null | undefined }): ReactNode {
  if (!frame || frame.kind === 'ult' || !frame.label) return null;
  return (
    <div
      key={`skillname-${frame.id}`}
      className="stage-skillname"
      style={{ ['--anim-dur' as string]: `${Math.max(600, frame.durationMs * 0.8)}ms` }}
    >
      {frame.label}
    </div>
  );
}

/**
 * 终结技演出层（2026-10-25 按实战录屏重做）：
 * 实测 t=17.0~17.5s 的亮度曲线 = 0.13s 冲到峰值 → 保持约 0.1s → 0.35s 衰减，
 * 因此这里用「近白屏 + 立绘居中的底部字幕」，而不是原来那层 0.5 透明度的弱发光。
 * 2026-10-26 用户二次裁定：①立绘太高看不见 → 立绘**居中**且高度受限于层次高度；
 * ②技能名**贴底部**闪出（字在下、立绘在字上方）；③**去掉四射光束特效**（"有点丑"）。
 */
export function StageUltLayer({ frame }: { frame: AnimFrame | null | undefined }): ReactNode {
  if (!frame || frame.kind !== 'ult') return null;
  return (
    <div className="stage-ult-layer" style={{ ['--anim-dur' as string]: `${frame.durationMs}ms` }}>
      <div className="stage-ult-whiteout" />
      {/* 角色立绘：舞台中央，底部给技能名留位 */}
      {frame.portrait && (
        <img
          className="stage-ult-portrait"
          src={assetUrl(`portraits/${frame.portrait}.webp`)}
          alt=""
          draggable={false}
        />
      )}
      {/* 技能名：贴底部闪出 */}
      {frame.label && <div className="stage-ult-name">{frame.label}</div>}
    </div>
  );
}

export function BattleStage(props: BattleStageProps): ReactNode {
  const { t } = useTranslation();
  const {
    allies,
    enemies,
    center,
    sp,
    frame = null,
    header,
    rail,
    footer,
    extraCenter,
    onEnemyArtError,
  } = props;

  return (
    <section
      className="panel"
      // `clip` 而不是 `hidden`：hidden 会新建滚动容器 → 顶部 HUD 的 position:sticky 失效（2026-11-07）
      style={{ padding: 0, overflow: 'clip', position: 'relative' }}
    >
      {/* 终结技演出层：全屏闪光 + 立绘切镜 + 技能名（不吃点击） */}
      <StageUltLayer frame={frame} />
      {/* 普攻/战技/追击/敌方出手：顶部技能名小条 */}
      <StageSkillName frame={frame} />

      {/* 顶部 HUD（可选）：状态 + 战斗控制按钮；吸顶，滚战报时仍能操作 */}
      {header && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 14px',
            borderBottom: '1px solid #2a2f45',
            // 必须不透明：吸顶后会压在下方的立绘/表格上
            background: 'linear-gradient(180deg,#121a33,#0f1526)',
            flexWrap: 'wrap',
          }}
        >
          {header}
        </div>
      )}

      <div className="stage" style={{ padding: 14, background: 'linear-gradient(180deg,#121a33 0%,#0b1020 100%)' }}>
        {/* ── 左侧：竖排行动条（出手顺序，调用方注入） ── */}
        {rail && (
          <div className="stage-col stage-col--rail">
            {/* 手机档这一列变横排：标签必须 nowrap 且不缩，否则「行动顺序」会一字一行 */}
            <div className="muted" style={{ fontSize: 11, textAlign: 'center', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              {t('fullsim.turnOrder')}
            </div>
            {rail}
          </div>
        )}

        {/* ── 我方 ── */}
        <div className="stage-col stage-col--ally">
          <div className="muted" style={{ fontSize: 12 }}>
            {t('fullsim.allySide')}
          </div>
          {allies.map((a) => {
            const hpP = barPct(a.hp, a.maxHp);
            const energyP = barPct(a.energy, a.energyMax);
            const hitByEnemy = frame?.kind === 'enemy' && frame.targets.includes(a.id);
            return (
              <div
                key={a.id}
                onClick={a.pickable ? a.onPick : undefined}
                title={a.pickable ? t('fullsim.pickAllyTarget') : undefined}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  padding: 6,
                  borderRadius: 8,
                  border: a.marked
                    ? '2px solid #ffd76e'
                    : `1px solid ${a.acting ? '#4a5bd4' : '#2a2f45'}`,
                  background: a.acting ? 'rgba(74,91,212,0.22)' : 'rgba(255,255,255,0.03)',
                  opacity: a.dead ? 0.45 : 1,
                  cursor: a.pickable ? 'pointer' : 'default',
                  position: 'relative',
                }}
              >
                {/* 立绘：外层 relative 供飘字定位，内层 overflow hidden */}
                <div style={{ position: 'relative', flex: '0 0 58px', width: 58, height: 78 }}>
                  {a.subField && (
                    <span
                      title={t('fullsim.subField')}
                      style={{
                        position: 'absolute',
                        left: -4,
                        top: -8,
                        zIndex: 2,
                        padding: '0 5px',
                        borderRadius: 6,
                        fontSize: 10,
                        lineHeight: '15px',
                        color: 'var(--fg)',
                        background: 'var(--accent-strong, #7a3bd4)',
                        border: '1px solid var(--border-strong, #c9a6ff)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('fullsim.subField')}
                    </span>
                  )}
                  <div
                    className={
                      hitByEnemy ? stageShakeClass(frame, a.id) : stageLungeClass(frame, a.id)
                    }
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: '#0f1220',
                      border: '1px solid #2a2f45',
                      ['--anim-dur' as string]: frame ? `${frame.durationMs}ms` : undefined,
                    }}
                  >
                    <img
                      src={assetUrl(`portraits-shop/${a.rosterId}.webp`)}
                      alt={a.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center top',
                        display: 'block',
                      }}
                    />
                    {a.element && (
                      <span
                        title={t(`elements.${a.element}`)}
                        style={{
                          position: 'absolute',
                          left: 1,
                          top: 1,
                          width: 17,
                          height: 17,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          background: 'rgba(9,12,24,0.78)',
                          border: '1px solid rgba(255,255,255,0.28)',
                        }}
                      >
                        <img src={elementIcon(a.element)} alt="" style={{ width: 13, height: 13, display: 'block' }} />
                      </span>
                    )}
                    {a.path && (
                      <span
                        title={t(`paths.${a.path}`)}
                        style={{
                          position: 'absolute',
                          left: 1,
                          bottom: 1,
                          width: 17,
                          height: 17,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          background: 'rgba(9,12,24,0.78)',
                          border: '1px solid rgba(255,215,138,0.45)',
                        }}
                      >
                        <img src={pathIcon(a.path)} alt="" style={{ width: 14, height: 14, display: 'block' }} />
                      </span>
                    )}
                  </div>
                  {/* 受击闪光 + 飘字（我方受伤） */}
                  {frame && hitByEnemy && <StageFlash frame={frame} />}
                  {frame && <StagePops frame={frame} target={a.id} negative max={6} />}
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{a.name}</span>
                    <span className="muted">
                      {fmtInt(a.hp)}/{fmtInt(a.maxHp)}
                      {a.shield > 0 && ` +${fmtInt(a.shield)}`}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: '#232842', overflow: 'hidden' }}>
                    <div
                      className="stage-bar"
                      style={{
                        width: `${hpP}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg,#3fbf6f,#7fe0a0)',
                      }}
                    />
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: '#232842', overflow: 'hidden' }}>
                    <div
                      className="stage-bar"
                      style={{
                        width: `${energyP}%`,
                        height: '100%',
                        background: a.energy >= a.energyMax ? '#ffd76e' : '#e0a94a',
                      }}
                    />
                  </div>
                  <div
                    className="muted"
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}
                  >
                    <span>
                      {t('timeline.team.energy')} {fmtInt(a.energy)}/{fmtInt(a.energyMax)}
                      {a.hidden !== undefined && ` · ${fmtInt(a.hidden)}`}
                    </span>
                  </div>
                  {/*
                   * 战技点是**全队共享**的 5 格资源，2026-11-07 用户裁定「去重」：
                   * 不再每张卡画一遍，改为底栏左侧唯一一份（见下面的 footer 段）。
                   * 卡底只留终结技槽（自己独占），右对齐。
                   */}
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'flex-end' }}>
                    {/* 终结技槽：调用方注入（全真模拟=可点按钮）；未注入时只读图标 */}
                    {a.ultSlot ?? (
                      <img
                        src={skillIcon(a.rosterId, 'Ultra')}
                        alt={t('battle.skillShort.ult')}
                        title={t('battle.skillShort.ult')}
                        style={{
                          width: 20,
                          height: 20,
                          display: 'block',
                          opacity: a.ultReady ? 1 : 0.4,
                          filter: a.ultReady ? 'none' : 'grayscale(1) brightness(0.9)',
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* 召唤物窄卡（神君/忆灵/龙灵/衣匠）：排在主人卡右侧 */}
                {a.summons && a.summons.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flex: '0 0 auto' }}>
                    {a.summons.map((s) => {
                      const name = t(`timeline.team.unitNames.${s.id}`);
                      const stacksText =
                        s.present && s.stacks !== undefined ? `${s.stacks}${t('timeline.team.stacks')}` : '';
                      const stacksFull =
                        s.present && s.stacks !== undefined
                          ? `${t(s.id === 'shenjun' ? 'timeline.team.finalStacks' : 'timeline.team.stacks')} ${s.stacks}`
                          : '';
                      const hint = s.present
                        ? stacksFull || (s.birds ? t('timeline.team.unitNames.memo') : '')
                        : t('fullsim.summonAbsent');
                      return (
                        <div
                          key={s.id}
                          data-summon={s.id}
                          title={`${name} · ${hint}`}
                          style={{
                            position: 'relative',
                            width: 58,
                            height: 78,
                            flex: '0 0 58px',
                            borderRadius: 6,
                            overflow: 'hidden',
                            background: '#0f1220',
                            border: `1px solid ${s.present ? '#2a2f45' : '#1d2130'}`,
                            opacity: s.present ? 0.95 : 0.42,
                          }}
                        >
                          <div
                            className={stageLungeClass(frame, s.id)}
                            style={{
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              ['--anim-dur' as string]: frame ? `${frame.durationMs}ms` : undefined,
                            }}
                          >
                            {s.iconSrc ? (
                              // 召唤物自己的头像（忆灵头像 256×216、带 alpha）：contain 居中，不裁脸
                              <img
                                src={s.iconSrc}
                                alt={name}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'contain',
                                  objectPosition: 'center 35%',
                                  display: 'block',
                                  filter: s.present ? 'none' : 'grayscale(1) brightness(0.55)',
                                }}
                              />
                            ) : (
                              /*
                               * CDN 没有这张召唤物的图（神君/龙灵/浮元/晴空乐手）：
                               * 画「元素徽记 + 名字」——绝不拿主人立绘冒充（2026-11-07 用户当场指出）
                               */
                              <div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 3,
                                  background: 'linear-gradient(180deg,#1a2038,#12172a)',
                                  filter: s.present ? 'none' : 'grayscale(1) brightness(0.6)',
                                }}
                              >
                                {a.element && (
                                  <img
                                    src={elementIcon(a.element)}
                                    alt={t(`elements.${a.element}`)}
                                    style={{ width: 22, height: 22, display: 'block', opacity: 0.9 }}
                                  />
                                )}
                                <span style={{ fontSize: 9, color: '#c8cee0', whiteSpace: 'nowrap' }}>
                                  {name}
                                </span>
                              </div>
                            )}
                          </div>
                          {(s.present && (stacksText || s.birds)) && (
                            <span
                              style={{
                                position: 'absolute',
                                left: 0,
                                right: 0,
                                bottom: 0,
                                height: 14,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 2,
                                background: 'rgba(9,12,24,0.82)',
                                color: '#ffd76e',
                                fontSize: 9,
                                lineHeight: 1,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {s.birds
                                ? (['beisi', 'qiumi', 'paiding'] as const).map((b) => (
                                    <span
                                      key={b}
                                      title={t(`fullsim.bird_${b}`)}
                                      style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        background: s.birds?.[b] ? '#ffd76e' : '#2a2f45',
                                        border: '1px solid rgba(0,0,0,0.45)',
                                      }}
                                    />
                                  ))
                                : stacksText}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 中间：简略战斗信息（用户裁定「挑重要信息、要简略」） ── */}
        <div
          className="stage-mid"
          style={{
            flex: 1,
            minWidth: 0,
            alignSelf: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid #2a2f45',
          }}
        >
          {(
            [
              [t('timeline.round'), center.round],
              [t('timeline.time'), typeof center.time === 'number' ? fmtInt(center.time) : center.time],
              [t('battle.totalDamage'), fmtInt(center.totalDamage)],
              [t('fullsim.enemyHpLeft'), fmtInt(center.enemyHpLeft)],
              [t('fullsim.allyHpLeft'), fmtInt(center.allyHpLeft)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
              <span className="muted">{label}</span>
              <span style={{ fontWeight: 600 }}>{value}</span>
            </div>
          ))}
          {/* 全队共享资源（笑点等，2026-11-07）：在本行动伤害**上方** */}
          {center.shared?.map((s) => (
            <div
              key={s.key}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}
            >
              <span className="muted">{s.label}</span>
              <span style={{ fontWeight: 700, color: '#ffd76e' }}>{s.value}</span>
            </div>
          ))}
          {/* 本行动伤害：用户裁定「最下面用大一号黄色字显示该行动总伤」 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 10,
              marginTop: 2,
              paddingTop: 6,
              borderTop: '1px solid #2a2f45',
            }}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              {t('fullsim.actionDamage')}
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#ffd76e', letterSpacing: 0.5 }}>
              {fmtInt(center.actionDamage ?? 0)}
            </span>
          </div>
          {extraCenter}
        </div>

        {/* ── 敌方 ── */}
        <div className="stage-col stage-col--enemy">
          <div className="muted" style={{ fontSize: 12 }}>
            {t('fullsim.enemySide')}
          </div>
          {enemies.map((m, i) => {
            const hpP = barPct(m.hp, m.maxHp);
            const hl = m.highlight ?? null;
            const isMain = hl === 'main';
            const isAdj = hl === 'adjacent';
            const hit = frame?.targets.includes(m.id) ?? false;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  opacity: isMain || isAdj ? 1 : undefined,
                }}
              >
                {/* 头像：外层 relative（飘字定位），内层圆形裁切 */}
                <div style={{ position: 'relative', width: 46, height: 46, flex: '0 0 46px' }}>
                  <div
                    onClick={m.pickable ? m.onPick : undefined}
                    title={
                      m.pickable
                        ? hl === 'main'
                          ? t('fullsim.pickEnemyTarget')
                          : t('fullsim.aoeTargets')
                        : undefined
                    }
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#c8cee0',
                      background: m.broken ? '#3a3f58' : '#232842',
                      border: isMain
                        ? '2px solid #ffd76e'
                        : m.broken
                          ? '2px solid #e6443a'
                          : '2px solid #4a5bd4',
                      boxShadow: isMain ? '0 0 0 1px #ffd76e' : undefined,
                      filter: isAdj ? 'brightness(1.2)' : undefined,
                      transform: isMain || isAdj ? 'scale(1.08)' : undefined,
                      cursor: m.pickable ? 'pointer' : 'default',
                      outline: isMain ? '2px solid rgba(255,215,110,0.45)' : undefined,
                      outlineOffset: 2,
                    }}
                  >
                    {m.artOk === false ? (
                      i + 1
                    ) : (
                      <img
                        src={monsterArt(m.artId)}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => onEnemyArtError?.(m.artId)}
                      />
                    )}
                  </div>
                  {/* 受击闪光 + 伤害飘字 */}
                  {frame && hit && <StageFlash frame={frame} round />}
                  {frame && (
                    <span style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                      <StagePops frame={frame} target={m.id} />
                    </span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: isMain || isAdj ? 800 : 600, color: isMain ? '#ffd76e' : undefined }}>
                      {m.name}
                    </span>
                    <span className="muted">{hpP.toFixed(0)}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: 10 }}>
                      {t('fullsim.weakness')}
                    </span>
                    {['Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary'].map((el) => (
                      <span
                        key={el}
                        title={t(`elements.${el}`)}
                        style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff4d4f' }}
                      />
                    ))}
                  </div>
                  <div style={{ position: 'relative', height: 8, borderRadius: 4, background: '#e9edf7' }}>
                    <div
                      className="stage-bar"
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${hpP}%`,
                        background: 'linear-gradient(90deg,#ffd76e,#ff9f43)',
                      }}
                    />
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#2a1f26', overflow: 'hidden' }}>
                    <div
                      className="stage-bar"
                      style={{
                        width: `${barPct(m.toughness, m.maxToughness)}%`,
                        height: '100%',
                        background: m.broken ? '#5a5f7a' : 'linear-gradient(90deg,#ff6b6b,#e6443a)',
                      }}
                    />
                  </div>
                  <div
                    className="muted"
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}
                  >
                    <span>
                      {t('fullsim.toughness')} {fmtInt(m.toughness)}/{fmtInt(m.maxToughness)}
                      {m.broken && ` · ${t('fullsim.broken')}`}
                    </span>
                    <span>
                      {fmtInt(m.hp)}/{fmtInt(m.maxHp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/*
       * 底部命令条：**永远渲染**——左侧固定是全局战技点（唯一一份），右侧由调用方注入
       * （全真模拟=普攻/战技/目标/确定；数值代理=倍速与回放控制）。
       */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderTop: '1px solid #2a2f45',
          background: 'rgba(0,0,0,0.25)',
          flexWrap: 'wrap',
        }}
      >
        <span
          title={t('timeline.team.sp')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}
        >
          <span className="muted" style={{ fontSize: 12 }}>
            {t('timeline.team.sp')}
          </span>
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {Array.from({ length: SP_MAX }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  transform: 'rotate(45deg)',
                  background: i < sp ? '#7fd0ff' : '#2a2f45',
                  border: '1px solid rgba(0,0,0,0.4)',
                }}
              />
            ))}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700 }}>
            {sp}/{SP_MAX}
          </span>
        </span>
        <span style={{ width: 1, height: 18, background: '#2a2f45', flex: '0 0 auto' }} />
        {footer}
      </div>
    </section>
  );
}
