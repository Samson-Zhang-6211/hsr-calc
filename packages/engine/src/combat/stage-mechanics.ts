/**
 * 关卡级机制的「站点名称 → 引擎 id」映射（2026-10-30 rulings 15~19 全 A）。
 *
 * 站点数据把机制写成中文名 + 文案（`data/monster-stages/*.json` 的 `modeMechanics` / `stages[].mechanics`，
 * 生成物 `combat/monster-stages.ts` 里也是 `{ name, desc }`）；引擎的 `BattleConfig.mechanics` 期望
 * 稳定的英文 id（见 `types.ts` 的字段注释）。web 侧组配置时先过一遍本函数。
 *
 * 全部 11 项均已映射（2026-10-30 rulings 15~19 全 A）。其中三处只接了主要半句、另一半留口：
 * `记忆紊流` 的「阿哈额外回合本体」、`末法余烬` 的「阿哈额外回合 + 终结技 25%/欢愉 15% 加伤」、
 * `胞吞作用` 的「稳态失衡对血脑屏障 +50%」已接数值（占位口径，无独立界面）。
 */
export const STAGE_MECHANIC_IDS: Record<string, string | undefined> = {
  血嗜: 'bloodthirst',
  '血嗜+': 'bloodthirst2',
  洞穿: 'pierce',
  '洞穿+': 'pierce2',
  狂喜之夜: 'ecstasyNight',
  领航誓言: 'pilotVow',
  桎梏: 'shackle',
  '桎梏+': 'shackle2',
  激怒: 'enrage',
  闭锁: 'lockdown',
  记忆紊流: 'miasma',
  // ── 混沌回忆 P44「物竞天择」本期机制（2026-11-06 用户录像 t≈84s 关卡页原文）──
  // ①我方目标施放终结技时获得 5 个笑点；②每个轮开始时使阿哈立即获得 1 个固定计入 20 笑点的额外回合。
  物竞天择: 'naturalSelection',
  // 2026-11-06 用户裁定：「贪饕」附属【阿哈帮大忙了】按关卡 buff 接（录屏局内面板条目）
  阿哈帮大忙了: 'ahaHelp',
  末法余烬: 'ember',
  不屈: 'unyielding',
  胞吞作用: 'cytosis',
  // ── 虚构叙事「荒腔走板」战意效果（2026-11-02 用户截图文案；战意值累积规则见 battle.ts）──
  触技: 'chuji',
  笑韵: 'xiaoyun',
  赋格: 'fuge',
};

/** 把站点机制名列表翻成引擎 id（丢弃未实现/未知项，去重保序） */
export function mechanicIdsFor(names: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const name of names ?? []) {
    const id = STAGE_MECHANIC_IDS[name];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
