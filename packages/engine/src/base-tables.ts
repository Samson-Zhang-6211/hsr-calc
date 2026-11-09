export interface LevelBaseTable {
  get(level: number): number;
}

export function tableFromRecord(
  record: Readonly<Record<number, number>>,
): LevelBaseTable {
  return {
    get(level: number): number {
      const value = record[level];
      if (value === undefined) {
        throw new Error(`缺少等级基数数据：level=${level}`);
      }
      return value;
    },
  };
}

/** 击破基数锚点：80 级 ≈ 3767.55（旧单位口径，多源核实） */
export const BREAK_BASE_LEVEL_80 = 3767.55;

/** 欢愉基础值锚点：80 级 ≈ 7535.107（多源核实） */
export const ELATION_BASE_LEVEL_80 = 7535.107;
