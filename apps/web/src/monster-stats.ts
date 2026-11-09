// 怪物面板换算（2026-10-09 破解自 hsr.nanoka.cc 前端 nodes/23）：
//   面板 = base × childModifyRatio × EliteGroup.Ratio × HardLevelGroup[level].Ratio [+ modify_value]
// 主形态 child = id 与父文档相同的变体（用户裁定：变体下拉后续需要再加）。
// 表数据由 scripts/fetch-monster-growth.mjs 落盘 data/monster-growth/。

import { createLocalSource, loadCategoryFiles } from './local-data.js';

export interface EliteGroupRow {
  EliteGroup: number;
  AttackRatio: number;
  DefenceRatio: number;
  HPRatio: number;
  SpeedRatio: number;
  StanceRatio: number;
}

export interface HardLevelRow {
  HardLevelGroup: number;
  Level: number;
  AttackRatio: number;
  DefenceRatio: number;
  HPRatio: number;
  SpeedRatio: number;
  StanceRatio: number;
  StatusProbability?: number;
  StatusResistance?: number;
}

export interface MonsterPanel {
  level: number;
  hp: number;
  attack: number;
  defence: number;
  speed: number;
  stance: number;
  effectHit: number;
  effectRes: number;
}

/** 怪物原始文档来源（在线 = 懒加载分片；离线包 = 经典脚本注入）。 */
const monsterSource = createLocalSource('monsters');

let tablesPromise: Promise<{
  eliteGroups: Map<number, EliteGroupRow>;
  hardLevels: Map<string, HardLevelRow>;
} | null> | null = null;

function loadTables() {
  tablesPromise ??= (async () => {
    try {
      let elite: EliteGroupRow[] | null = null;
      let hard: HardLevelRow[] | Record<string, HardLevelRow> | null = null;
      const growth = await loadCategoryFiles('monster-growth');
      elite = (growth.EliteGroup ?? null) as EliteGroupRow[] | null;
      hard = (growth.HardLevelGroup ?? null) as HardLevelRow[] | Record<string, HardLevelRow> | null;
      if (!elite || !hard) return null;
      const eliteGroups = new Map<number, EliteGroupRow>();
      for (const row of elite) eliteGroups.set(row.EliteGroup, row);
      const hardLevels = new Map<string, HardLevelRow>();
      const rows = Array.isArray(hard) ? hard : Object.values(hard);
      for (const row of rows) hardLevels.set(`${row.HardLevelGroup}:${row.Level}`, row);
      return { eliteGroups, hardLevels };
    } catch {
      return null;
    }
  })();
  return tablesPromise;
}

interface MonsterChild {
  id?: number;
  attack_modify_ratio?: number | null;
  defence_modify_ratio?: number | null;
  hp_modify_ratio?: number | null;
  speed_modify_ratio?: number | null;
  speed_modify_value?: number | null;
  stance_modify_ratio?: number | null;
  stance_modify_value?: number | null;
  elite_group?: number | null;
  hard_level_group?: number | null;
}

interface MonsterDoc {
  id?: string | number;
  zh?: {
    attack_base?: number;
    defence_base?: number;
    hp_base?: number;
    speed_base?: number;
    stance_base?: number;
    status_resistance_base?: number;
    child?: MonsterChild[];
  };
}

/** 同组档位就近取：精确档 → ≤level 的最近档 → 最小档（成长表各组档位覆盖不全，如 745 条 < 9×101）。 */
function nearestRow(
  rows: HardLevelRow[],
  level: number,
): HardLevelRow {
  const exact = rows.find((r) => r.Level === level);
  if (exact) return exact;
  let best: HardLevelRow | null = null;
  for (const r of rows) {
    if (r.Level <= level && (!best || r.Level > best.Level)) best = r;
  }
  if (best) return best;
  return rows.reduce((a, b) => (a.Level <= b.Level ? a : b));
}

/** 按怪物 id + 等级换算主形态面板；数据缺失返回 null。level 会 clamp 到 [1,120]。 */
export async function computeMonsterStats(
  monsterId: string,
  level: number,
): Promise<MonsterPanel | null> {
  if (!monsterId) return null;
  const tables = await loadTables();
  if (!tables) return null;
  const load = monsterSource.get(monsterId);
  if (!load) return null;
  let doc: MonsterDoc;
  try {
    const mod = (await load()) as { default?: MonsterDoc } & MonsterDoc;
    doc = (mod.default ?? mod) as MonsterDoc;
  } catch {
    return null;
  }
  const zh = doc?.zh;
  if (!zh || !Array.isArray(zh.child) || zh.child.length === 0) return null;
  const child =
    zh.child.find((c) => c.id !== undefined && String(c.id) === monsterId) ?? zh.child[0];
  const eg = tables.eliteGroups.get(child.elite_group ?? 0);
  if (!eg) return null;
  const lv = Math.min(120, Math.max(1, Math.round(level)));
  const rows: HardLevelRow[] = [];
  for (const row of tables.hardLevels.values()) {
    if (row.HardLevelGroup === (child.hard_level_group ?? 0)) rows.push(row);
  }
  if (rows.length === 0) return null;
  const hg = nearestRow(rows, lv);
  const mod = (v: number | null | undefined, fallback = 1) => v ?? fallback;
  const hp = Math.round(
    (zh.hp_base ?? 0) * mod(child.hp_modify_ratio) * eg.HPRatio * hg.HPRatio,
  );
  const attack = Math.round(
    (zh.attack_base ?? 0) * mod(child.attack_modify_ratio) * eg.AttackRatio * hg.AttackRatio,
  );
  const defence = Math.round(
    (zh.defence_base ?? 0) * mod(child.defence_modify_ratio) * eg.DefenceRatio * hg.DefenceRatio,
  );
  const speed = Math.round(
    (zh.speed_base ?? 0) * mod(child.speed_modify_ratio) * eg.SpeedRatio * hg.SpeedRatio +
      (child.speed_modify_value ?? 0),
  );
  const stance = Math.round(
    (zh.stance_base ?? 0) * mod(child.stance_modify_ratio) * eg.StanceRatio * hg.StanceRatio +
      (child.stance_modify_value ?? 0),
  );
  const effectHit = hg.StatusProbability ?? 0;
  const effectRes = (zh.status_resistance_base ?? 0) + (hg.StatusResistance ?? 0);
  return { level: lv, hp, attack, defence, speed, stance, effectHit, effectRes };
}

// 怪物文档索引已上移为 monsterSource（2026-11-08），此处不再单独维护一份 glob。
