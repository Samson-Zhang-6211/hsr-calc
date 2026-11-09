/** 遗器套装下拉分类（2026-10-13 用户裁定的 64 套分组，勿随手挪组——组序/归属均经用户过目确认）。
 * *GROUPS 按数组顺序渲染为 optgroup；未收录 id 落尾部无组兜底（防御：gen 脚本新增套件不丢选项）。 */

export type RelicGroupKey =
  | 'break'
  | 'elation'
  | 'memory'
  | 'followup'
  | 'dot'
  | 'basic'
  | 'life'
  | 'survival'
  | 'support'
  | 'direct'
  | 'lifeSurvival';

export interface RelicGroupDef {
  readonly key: RelicGroupKey;
  readonly ids: readonly string[];
}

/** 四件套（34 套）：击破→欢愉→记忆→追加→负面→普攻→生命→生存→辅助→直伤 */
export const RELIC_FOUR_GROUPS: readonly RelicGroupDef[] = [
  { key: 'break', ids: ['111', '118', '119'] },
  { key: 'elation', ids: ['129', '130', '133'] },
  { key: 'memory', ids: ['123', '127'] },
  { key: 'followup', ids: ['115', '120'] },
  { key: 'dot', ids: ['116', '112', '132'] },
  { key: 'basic', ids: ['102', '134'] },
  { key: 'life', ids: ['113'] },
  { key: 'survival', ids: ['101', '103', '106', '125', '128'] },
  { key: 'support', ids: ['114', '121'] },
  { key: 'direct', ids: [
    '104', '105', '107', '108', '109', '110', '117', '122', '124', '126', '131',
  ] },
];

/** 位面（30 套）：击破→欢愉→追加→负面→生命与生存→辅助→记忆→直伤 */
export const RELIC_PLANAR_GROUPS: readonly RelicGroupDef[] = [
  { key: 'break', ids: ['307', '316', '330'] },
  { key: 'elation', ids: ['325', '329'] },
  { key: 'followup', ids: ['315', '326'] },
  { key: 'dot', ids: ['303', '322'] },
  { key: 'lifeSurvival', ids: ['302', '319', '304', '320', '310'] },
  { key: 'support', ids: ['308', '312', '317'] },
  { key: 'memory', ids: ['323', '318'] },
  { key: 'direct', ids: [
    '301', '305', '306', '309', '311', '313', '314', '321', '324', '327', '328',
  ] },
];

export interface RelicGrouped<T> {
  key: RelicGroupKey | null;
  items: T[];
}

/** 按分组拆选项：组内保持入参顺序（roster 原序），未收录 id 归 key:null 尾段 */
export function groupRelicOptions<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  groups: readonly RelicGroupDef[],
): RelicGrouped<T>[] {
  const out: RelicGrouped<T>[] = [];
  let matched: T[] = items.slice() as T[];
  for (const g of groups) {
    const inGroup: T[] = [];
    const rest: T[] = [];
    for (const item of matched) {
      (g.ids.includes(idOf(item)) ? inGroup : rest).push(item);
    }
    if (inGroup.length > 0) out.push({ key: g.key, items: inGroup });
    matched = rest;
  }
  if (matched.length > 0) out.push({ key: null, items: matched });
  return out;
}

/** 命途分组顺序（角色/光锥下拉通用；未知命途落尾段） */
export const PATH_ORDER = [
  'Warrior', 'Rogue', 'Mage', 'Warlock', 'Knight', 'Priest', 'Shaman', 'Elation', 'Memory',
] as const;

export interface PathGrouped<T> {
  key: string | null;
  items: T[];
}

export function groupByPath<T>(
  items: readonly T[],
  pathOf: (item: T) => string | undefined,
): PathGrouped<T>[] {
  const out: PathGrouped<T>[] = [];
  let matched: T[] = items.slice() as T[];
  for (const p of PATH_ORDER) {
    const inGroup: T[] = [];
    const rest: T[] = [];
    for (const item of matched) {
      (pathOf(item) === p ? inGroup : rest).push(item);
    }
    if (inGroup.length > 0) out.push({ key: p, items: inGroup });
    matched = rest;
  }
  if (matched.length > 0) out.push({ key: null, items: matched });
  return out;
}
