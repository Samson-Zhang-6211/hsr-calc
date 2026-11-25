/**
 * 战场资源 HUD（2026-11-13）：4.7.51 新增两人接入时用户裁定要显示的资源行。
 *
 * 引擎侧 `BattleStatus` 只暴露数值（`ellenBite` / `yaoSeg`），
 * 显示上限与 i18n 键放在这里，避免两页（数值代理模拟 / 全真模拟）各写一份。
 * 4.7.53：艾莲行迹 point07 的【热量】整套删除 → HUD 不再有该行。
 * 纯函数 → 单测见 `unit-resources.test.ts`。
 */

export interface UnitResourceRow {
  /** 行标识（React key / data 属性） */
  key: string;
  /** i18n 键（`battle.resEllenBite` 等） */
  labelKey: string;
  value: number;
  /** 上限（显示成 `value/max`）；缺省 = 纯计数 */
  max?: number;
}

/** 引擎状态子集（避免 web 侧直接依赖奇偶字段名） */
export interface UnitResourceStatus {
  ellenBite?: number;
  yaoSeg?: number;
}

/** 资源上限：咬合力 6（天赋151404）、切分音 10（天赋151504） */
export const UNIT_RESOURCE_MAX = {
  ellenBite: 6,
  yaoSeg: 10,
} as const;

/**
 * 状态 → HUD 行。顺序固定：咬合力 → 切分音。
 * 字段缺省表示「该角色不在场」（引擎侧按 ids.has 决定是否输出），因此这里只透传不看队伍。
 */
export function unitResourceRows(status: UnitResourceStatus | null | undefined): UnitResourceRow[] {
  if (!status) return [];
  const rows: UnitResourceRow[] = [];
  if (typeof status.ellenBite === 'number') {
    rows.push({
      key: 'ellenBite',
      labelKey: 'battle.resEllenBite',
      value: status.ellenBite,
      max: UNIT_RESOURCE_MAX.ellenBite,
    });
  }
  if (typeof status.yaoSeg === 'number') {
    rows.push({
      key: 'yaoSeg',
      labelKey: 'battle.resYaoSeg',
      value: status.yaoSeg,
      max: UNIT_RESOURCE_MAX.yaoSeg,
    });
  }
  return rows;
}

/** 行 → 展示文本（`3/6`；无上限则纯数字） */
export function resourceText(row: Pick<UnitResourceRow, 'value' | 'max'>): string {
  return row.max === undefined ? String(row.value) : `${row.value}/${row.max}`;
}
