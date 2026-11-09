/**
 * 全真模拟 · 命令区与行动跑道（2026-11-07 命令区一体化批）
 *
 * 由来（用户报「操作台有点怪」，CDP 实测）：
 *   ① 「确定」原来在页面第三块面板里，点完场上「普攻」后它落在 y≈1462（视口高 1000）——
 *      必须滚过整块战报才按得到；
 *   ② 倍速/取消/行动提示在战场底栏与操作台各有一份；
 *   ③ 操作台是一段 `<p>` 拼贴（状态+暂停+撤回+生命列表+倍速+行动+目标按钮+跟放+确定+取消）。
 * 改法（用户裁定 B 档「命令区一体化 + 战场整备」）：
 *   - 操作全部收进战场底栏 `CommandBar`：行动者 / 普攻·战技 / 目标 / 跟放 / 取消·确定 / 倍速；
 *   - 战斗控制（暂停·撤回·重新开始·快进）收进战场顶部 `SimHud`；
 *   - 未来推演由大表格改为 `ActionRunner` 跑道（手里有决策时一眼看行动顺序）；
 *   - 第三块操作台面板整块删除。
 *
 * 边界：只 `t` + 展示，不碰引擎、不改 area 的冻结配色（血条/能量/韧性内联色仍在 battle-stage）。
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { POP_ELEMENT_COLORS } from './battle-anim.js';

/** HUD 状态语义色（与战场区既有内联色同一套：金=待操作、绿=运行、红=结束） */
const TONE_COLORS: Record<SimTone, string> = {
  run: '#3fbf6f',
  wait: '#ffd76e',
  pause: '#9aa3c0',
  end: '#e6443a',
};

export type SimTone = 'run' | 'wait' | 'pause' | 'end';

export interface SimHudProps {
  /** 本地化状态文案（运行中 / 等待操作 / 已暂停 / 战斗结束） */
  statusText: string;
  tone: SimTone;
  paused: boolean;
  ended: boolean;
  canUndo: boolean;
  canFastForward: boolean;
  onPause?: () => void;
  onUndo?: () => void;
  onRestart?: () => void;
  onFastForward?: () => void;
}

/** 战场顶部 HUD：状态徽章 + 战斗控制（暂停 / 撤回 / 重新开始 / 快进） */
export function SimHud(props: SimHudProps): ReactNode {
  const { t } = useTranslation();
  const { statusText, tone, paused, ended, canUndo, canFastForward } = props;
  return (
    <>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.3,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: TONE_COLORS[tone],
            boxShadow: `0 0 8px ${TONE_COLORS[tone]}`,
            flex: '0 0 auto',
          }}
        />
        {statusText}
      </span>
      <span style={{ flex: 1, minWidth: 8 }} />
      <button
        type="button"
        onClick={props.onFastForward}
        disabled={!canFastForward}
        title={t('fullsim.skipHint')}
      >
        {`⏩ ${t('fullsim.skip')}`}
      </button>
      <button type="button" onClick={props.onPause} disabled={ended} title={t('fullsim.pause')}>
        {paused ? `▶ ${t('fullsim.resume')}` : `⏸ ${t('fullsim.pause')}`}
      </button>
      <button type="button" onClick={props.onUndo} disabled={!canUndo} title={t('fullsim.undo')}>
        {`↩ ${t('fullsim.undo')}`}
      </button>
      <button type="button" onClick={props.onRestart} title={t('fullsim.restart')}>
        {`⟳ ${t('fullsim.restart')}`}
      </button>
    </>
  );
}

/** 目标/选项按钮的数据形状（敌方我方同构：id + 文案 + 次要信息） */
export interface CommandTarget {
  id: string;
  label: string;
  /** 次要信息（敌方血条百分比之类），只在按钮 title 里出现 */
  note?: string;
}

export interface CommandBarProps {
  /** 无决策、正在自动推进 */
  running: boolean;
  ended: boolean;
  paused: boolean;
  /** 轮到的角色 */
  actor?: { name: string; rosterId: string; acting: boolean } | null;
  basicLabel: string;
  skillLabel: string;
  skillDisabled: boolean;
  /** 轮到该角色且尚未点技能 → 显示普攻/战技 */
  canAct: boolean;
  onBasic?: () => void;
  onSkill?: () => void;
  /** 待确认（已点普攻/战技/终结技，等目标或确定） */
  pending?: PendingView | null;
  speed: number;
  speeds: readonly number[];
  onSpeed: (s: number) => void;
}

export interface PendingView {
  /** 「我方3（丹恒·腾荒） · 战技」 */
  label: string;
  /** 目标提示（点场上头像 / 群攻点任一） */
  hint: string;
  targets: readonly CommandTarget[];
  selTarget: string | null;
  onPick: (id: string) => void;
  canConfirm: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 技能后跟放的终结技（预计算能量回满的候选） */
  after?: {
    candidates: readonly { id: string; label: string; picked: boolean }[];
    onToggle: (id: string) => void;
    picksText: string;
    pickLabel?: string;
    pickOptions?: readonly CommandTarget[];
    onChoose?: (id: string) => void;
    onCancelPick?: () => void;
  };
}

/**
 * 战场底栏命令区（替换原「操作台」面板）：
 *   行 A 状态/行动者 + 倍速
 *   行 B 普攻·战技（或 待确认：目标 + 确定/取消）
 *   行 C 跟放终结技
 * 目标点选同时保留「点场上头像」这条主路径（用户裁定两处都保留）。
 */
export function CommandBar(props: CommandBarProps): ReactNode {
  const { t } = useTranslation();
  const {
    running,
    ended,
    paused,
    actor,
    basicLabel,
    skillLabel,
    skillDisabled,
    canAct,
    pending,
    speed,
    speeds,
  } = props;

  const speedButtons = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
      <span className="muted" style={{ fontSize: 12 }}>
        {t('fullsim.speed')}
      </span>
      {speeds.map((s) => (
        <button
          key={s}
          type="button"
          className={speed === s ? 'primary' : ''}
          onClick={() => props.onSpeed(s)}
          style={{ fontSize: 11, padding: '2px 6px' }}
        >
          {s}×
        </button>
      ))}
    </span>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* 行 A：行动者 / 状态 + 倍速 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {actor ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: actor.acting ? '#4a5bd4' : '#9aa3c0',
                flex: '0 0 auto',
              }}
            />
            <strong>{actor.name}</strong>
            <span className="muted">{t('fullsim.actingNow')}</span>
          </span>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            {ended ? t('fullsim.ended') : paused ? t('fullsim.paused') : running ? t('fullsim.running') : ''}
          </span>
        )}
        <span style={{ flex: 1, minWidth: 8 }} />
        {speedButtons}
      </div>

      {/* 行 B：行动按钮，或待确认的目标行 */}
      {pending ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 12 }}>{pending.label}</strong>
          {pending.targets.length > 0 && (
            <>
              <span className="muted" style={{ fontSize: 12 }}>
                {t('fullsim.pickTarget')}
              </span>
              {pending.targets.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={pending.selTarget === c.id ? 'primary' : ''}
                  onClick={() => pending.onPick(c.id)}
                  title={c.note}
                  style={{ fontSize: 12, padding: '3px 9px' }}
                >
                  {c.label}
                </button>
              ))}
            </>
          )}
          <button
            type="button"
            className="primary"
            onClick={pending.onConfirm}
            disabled={!pending.canConfirm}
            style={{ fontSize: 12, padding: '3px 12px' }}
          >
            {t('fullsim.confirm')}
          </button>
          <button type="button" onClick={pending.onCancel} style={{ fontSize: 12, padding: '3px 9px' }}>
            {t('fullsim.cancel')}
          </button>
          <span className="muted" style={{ fontSize: 11, flex: '1 1 160px', minWidth: 0 }}>
            {pending.hint}
          </span>
        </div>
      ) : canAct ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={props.onBasic}
            style={{ fontSize: 13, padding: '4px 16px', fontWeight: 600 }}
          >
            {basicLabel}
          </button>
          <button
            type="button"
            className="primary"
            onClick={props.onSkill}
            disabled={skillDisabled}
            style={{ fontSize: 13, padding: '4px 16px', fontWeight: 600 }}
          >
            {skillLabel}
          </button>
        </div>
      ) : null}

      {/* 行 C：技能后跟放终结技（预计算能量回满者） */}
      {pending?.after && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {pending.after.pickOptions && pending.after.pickLabel ? (
            <>
              <span className="muted" style={{ fontSize: 12 }}>
                {pending.after.pickLabel}
              </span>
              {pending.after.pickOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => pending.after?.onChoose?.(o.id)}
                  style={{ fontSize: 12, padding: '3px 9px' }}
                >
                  {o.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pending.after?.onCancelPick?.()}
                style={{ fontSize: 12, padding: '3px 9px' }}
              >
                {t('fullsim.cancel')}
              </button>
            </>
          ) : pending.after.candidates.length > 0 ? (
            <>
              {pending.after.candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={c.picked ? 'primary' : ''}
                  onClick={() => pending.after?.onToggle(c.id)}
                  style={{ fontSize: 12, padding: '3px 9px' }}
                >
                  {c.picked ? `✓ ${c.label}` : c.label}
                </button>
              ))}
            </>
          ) : null}
          {pending.after.picksText && pending.after.candidates.length > 0 && (
            <span className="muted" style={{ fontSize: 11 }}>
              {`${t('fullsim.afterSelected')}: ${pending.after.picksText}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** 左侧竖排行动条上的一个单位 */
export interface RailEntry {
  id: string;
  /** 悬浮提示里的全名（我方3（景元）…） */
  label: string;
  /** 下次行动的行动值 */
  time: number;
  /** 头像图（我方/召唤物=立绘名册图，敌方=怪物图）；不给 = 文字圆点 */
  imgSrc?: string;
  /** 元素色（边框）；敌方不给 = 红 */
  element?: string;
  enemy?: boolean;
}

/**
 * 左侧竖排行动条（2026-11-07 第二批，替代原「行动跑道」）：
 * 每个在场单位一个小头像 + 下次行动的行动值，按行动值升序——从上到下就是出手顺序，
 * 和游戏里左边缘那根行动条同一读法。挂在 BattleStage 的 rail 插槽里（战场第一列）。
 * 口径不变：纯速度推演，不计终结技/追加攻击（见 FullSimPage 的 predictRows）。
 */
export function ActionRail({
  entries,
  max = 12,
}: {
  entries: readonly RailEntry[];
  max?: number;
}): ReactNode {
  if (entries.length === 0) return null;
  return (
    <>
      {entries.slice(0, max).map((e) => {
        const color = e.enemy
          ? '#e6443a'
          : POP_ELEMENT_COLORS[String(e.element ?? '').toLowerCase()] ?? '#c8cee0';
        return (
          <div
            key={e.id}
            title={`${e.label} · ${e.time.toFixed(2)}`}
            style={{
              position: 'relative',
              width: 38,
              height: 38,
              flex: '0 0 38px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: `2px solid ${color}`,
              background: '#232842',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {e.imgSrc ? (
              <img
                src={e.imgSrc}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
              />
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#c8cee0' }}>{e.label.slice(-2)}</span>
            )}
            <span
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(9,12,24,0.86)',
                color: '#eae6dc',
                fontSize: 9,
                lineHeight: 1,
              }}
            >
              {e.time.toFixed(1)}
            </span>
          </div>
        );
      })}
    </>
  );
}

// ── 键盘快捷键（2026-11-07 第二批）──────────────────────────────────────────

export type ShortcutAction = 'basic' | 'skill' | 'confirm' | 'cancel' | 'pause';

export interface ShortcutState {
  /** 轮到该角色、且还没进目标选择（普攻/战技可点） */
  canAct: boolean;
  /** 有未确认的选择 */
  pending: boolean;
  /** 当前选择可以确定（要选目标的已选好） */
  canConfirm: boolean;
  ended: boolean;
}

/**
 * 键位 → 动作（纯函数，单测锁死；绑定见 FullSimPage 的 keydown effect）：
 * `1` 普攻 / `2` 战技 / `Enter` 确定 / `Esc` 取消 / `空格` 暂停继续。
 * 只在战斗页生效；输入框里按键由调用方先挡掉（见 FullSimPage 的 isTypingTarget）。
 */
export function shortcutAction(key: string, s: ShortcutState): ShortcutAction | null {
  if (s.ended) return null;
  switch (key) {
    case '1':
      return s.canAct && !s.pending ? 'basic' : null;
    case '2':
      return s.canAct && !s.pending ? 'skill' : null;
    case 'Enter':
      return s.pending && s.canConfirm ? 'confirm' : null;
    case 'Escape':
      return s.pending ? 'cancel' : null;
    case ' ':
    case 'Spacebar':
      return 'pause';
    default:
      return null;
  }
}
