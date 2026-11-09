import type { SkillLevels } from '@hsr-calc/engine';
import type { ShowcaseChar, ShowcasePlayer, ShowcaseRelic } from './showcase.js';

/**
 * 第二数据源：`api.mihomo.me/sr_info_parsed/{uid}`（2026-10-27 新增）。
 *
 * 为什么加它：**Enka.Network 在国内网络下会被阻断**（实测 `ECONNRESET`/超时），
 * 而 mihomo 走 Cloudflare 但不被拦（3/3 通、0.7–1.7s）；官方米游社接口虽通，
 * 但要登录 cookie + DS 签名，无法给朋友用。
 *
 * 相比 Enka，mihomo 的字段更省事：稀有度、套装 id、主/副词条**数值**、技能等级
 * 全都有，不需要 tid 前缀推断 / `_flat.props` 合并拆分 / `cnt×base+step` 反推。
 * 它同样**不返回 CORS 头**，所以线上仍需要一个转发口（见 docs/showcase-uid.md）。
 */

export interface MihomoStat {
  type: string;
  value: number;
  /** 副词条：强化次数 */
  count?: number;
  step?: number;
}

export interface MihomoRelic {
  id?: string;
  /** 部位 1..6 */
  type: number;
  set_id: string;
  rarity: number;
  level?: number;
  main_affix?: MihomoStat;
  sub_affix?: MihomoStat[];
}

export interface MihomoLightCone {
  id: string;
  /** 叠影 1-5 */
  rank?: number;
  level?: number;
  promotion?: number;
}

export interface MihomoSkill {
  id: string;
  /** Normal / BPSkill / Ultra / Talent / Maze / MazeNormal … */
  type: string;
  level: number;
}

export interface MihomoTree {
  /** 行迹节点 id（= 本地 point_id，末 3 位是序号） */
  id: string;
  level: number;
  /** Point01…Point18 */
  anchor: string;
}

export interface MihomoChar {
  id: string;
  name?: string;
  level: number;
  promotion?: number;
  rank?: number;
  /** 展示柜位次（数组，取首个） */
  pos?: number[];
  skills?: MihomoSkill[];
  skill_trees?: MihomoTree[];
  light_cone?: MihomoLightCone | null;
  relics?: MihomoRelic[];
}

export interface MihomoResponse {
  player?: {
    uid?: string;
    nickname?: string;
    level?: number;
    signature?: string;
    /** 是否公开了角色展示柜 */
    is_display?: boolean;
  };
  characters?: MihomoChar[];
}

const SKILL_KIND: Readonly<Record<string, keyof SkillLevels | undefined>> = {
  Normal: 'basic',
  BPSkill: 'skill',
  Ultra: 'ult',
  Talent: 'talent',
};

/** 玩家数据（含 mihomo 独有的「是否公开展柜」标记） */
export interface MihomoShowcase extends ShowcasePlayer {
  isDisplay: boolean;
}

/** mihomo 响应 → 与 Enka 完全相同的 `ShowcasePlayer` 结构（后续面板烘焙共用） */
export function parseMihomo(
  json: MihomoResponse,
  rosterIds: ReadonlySet<string>,
): MihomoShowcase {
  const player = json.player ?? {};
  const chars = (json.characters ?? []).map((c): ShowcaseChar => {
    const avatarId = String(c.id);
    const relics: ShowcaseRelic[] = (c.relics ?? [])
      .map((r): ShowcaseRelic | null => {
        if (!r.main_affix) return null;
        if (!Number.isFinite(r.type) || r.type < 1 || r.type > 6) return null;
        const subs = (r.sub_affix ?? []).map((s) => ({
          property: s.type,
          value: s.value,
          rolls: Math.max(1, Math.round(s.count ?? 1)),
        }));
        return {
          slot: r.type,
          setId: String(r.set_id),
          rarity: r.rarity ?? 5,
          level: r.level ?? 0,
          mainProperty: r.main_affix.type,
          mainValue: r.main_affix.value,
          subs,
          // mihomo 直接给稀有度与数值，不存在推断/近似
          rarityVerified: true,
          approximate: false,
        };
      })
      .filter((r): r is ShowcaseRelic => r !== null)
      .sort((a, b) => a.slot - b.slot);

    // 技能等级：同名类型取最大值（强化形态会再出现一条 level=0）
    const skillLevels: Partial<SkillLevels> = {};
    for (const s of c.skills ?? []) {
      const kind = SKILL_KIND[s.type];
      if (!kind) continue;
      const lv = s.level ?? 0;
      if (lv <= 0) continue;
      skillLevels[kind] = Math.max(skillLevels[kind] ?? 0, lv);
    }

    const trees = c.skill_trees ?? [];
    const lc = c.light_cone;

    return {
      avatarId,
      rosterId: rosterIds.has(avatarId) ? avatarId : null,
      level: c.level ?? 0,
      promotion: c.promotion ?? 0,
      eidolon: c.rank ?? 0,
      assist: false,
      pos: typeof c.pos?.[0] === 'number' ? c.pos[0] : null,
      lightcone: lc
        ? {
            id: String(lc.id),
            refinement: Math.max(1, lc.rank ?? 1),
            level: lc.level ?? 0,
            promotion: lc.promotion ?? 0,
          }
        : null,
      relics,
      points: trees.map((t) => ({ pointId: Number(t.id), level: t.level ?? 0 })),
      // 行迹用 anchor（Point09…）直接对齐本地 tracePoints.key 的前缀
      anchors: trees
        .filter((t) => (t.level ?? 0) > 0 && t.anchor)
        .map((t) => t.anchor.toLowerCase()),
      skillLevels,
    };
  });

  chars.sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));

  return {
    uid: player.uid ?? '',
    nickname: player.nickname ?? '',
    level: player.level ?? 0,
    signature: player.signature ?? '',
    // mihomo 没有 region 字段
    region: '',
    ttl: 60,
    chars,
    isDisplay: player.is_display !== false,
  };
}
