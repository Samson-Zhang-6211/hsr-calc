import { type StageSectionPreset, adjacentStagePreset, mechanicChips } from './monster-presets.js';

/**
 * 关卡机制小标签行（2026-10-30 第四十五轮）：两页共用。
 *
 * 只做展示：机制名 + `title` 悬浮描述（`desc` 来自关卡数据，与选择卡 tooltip 同源）。
 * 无机制的段返回 `null`（不占位、不渲染空行）。
 */
export function StageMechanicsRow({
  preset,
  label,
}: {
  preset: StageSectionPreset | undefined;
  /** 前缀文案（页面侧传 `t('battle.stageMechanics')`，保持两页中英一致） */
  label: string;
}) {
  const chips = mechanicChips(preset);
  if (chips.length === 0) return null;
  return (
    <span className="muted" style={{ marginLeft: 8 }} data-stage-mechanics="">
      {`${label}: `}
      {chips.map((c, i) => (
        <span key={c.key} title={c.desc}>
          {i > 0 ? ' / ' : ''}
          {c.name}
        </span>
      ))}
    </span>
  );
}

/**
 * 上一段 / 下一段（2026-10-30 第四十八轮）：两页共用。
 *
 * 按 `stagePresets()` 的顺序前后跳（包 → 关 → 上半/下半），跨关卡、跨包连续。
 * 未选段或已在首/末段时 → 整个组件不渲染（不留两个禁用按钮占位）；
 * 只有首段或只有末段时对应那一个按钮 disabled。
 */
export function StageNavRow({
  preset,
  onPick,
  prevLabel,
  nextLabel,
}: {
  preset: StageSectionPreset | undefined;
  onPick: (next: StageSectionPreset) => void;
  prevLabel: string;
  nextLabel: string;
}) {
  if (!preset) return null;
  const prev = adjacentStagePreset(preset.key, -1);
  const next = adjacentStagePreset(preset.key, 1);
  if (!prev && !next) return null;
  const label = (p: StageSectionPreset) => `${p.packId}#${p.stage.index}${p.half ? ' ' + p.half : ''}`;
  return (
    <span style={{ marginLeft: 8 }} data-stage-nav="">
      <button
        type="button"
        disabled={!prev}
        title={prev ? label(prev) : undefined}
        onClick={() => prev && onPick(prev)}
      >
        ◀ {prevLabel}
      </button>{' '}
      <button
        type="button"
        disabled={!next}
        title={next ? label(next) : undefined}
        onClick={() => next && onPick(next)}
      >
        {nextLabel} ▶
      </button>
    </span>
  );
}
