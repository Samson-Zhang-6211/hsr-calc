import { describe, expect, it } from 'vitest';
import { simulateBattle, type CombatMember, type MemberPanel, type MonsterConfig } from '../src/index.js';

// ── 混沌 P43 其十二：4044010 第一位天才，隐德来希，赞达尔（2026-10-30 第十批）──
// 技能文案见 docs/stage-monsters-skills.md；倍率全部占位 1（ruling「1 A」）。
// 实测锚点：基础单体命中 427.91（atk 800 / Lv95 vs Lv80）；【求解：第一因之果】全体均摊 = 427.91 ÷ 4 = 106.98；
// 4 层强化（+25%/层）→ 213.95；3 层 → 187.21。

function panel(speed: number): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

function members(): CombatMember[] {
  return [
    { id: 'sunday', panel: panel(156) },
    { id: 'jingyuan', panel: panel(134) },
    { id: 'aventurine', panel: panel(134) },
    { id: 'tenghuang', panel: panel(135) },
  ];
}

const ZANDAR: MonsterConfig = {
  monsterId: '4044010',
  level: 95,
  hp: 2e7,
  attack: 800,
  speed: 160,
  maxToughness: 600,
  weaknesses: ['Physical', 'Ice', 'Wind'],
  resistance: { Quantum: 0.2 },
};

function run(rounds = 8, slots = 1) {
  return simulateBattle({
    members: members(),
    monsters: Array.from({ length: slots }, () => ({ ...ZANDAR, hp: 2e7 / slots })),
    techniques: false,
    rounds,
    maxTime: 4000,
    roundMode: 'forgotten',
  });
}

const castsOf = (r: ReturnType<typeof run>, skillId: string) =>
  r.events.filter((e) => e.skillCode === `monster.${skillId}`);

const notesOf = (r: ReturnType<typeof run>) => r.events.flatMap((e) => e.note ?? []);

describe('赞达尔 4044010', () => {
  it('求解：第一因之果 —— 全体均摊（÷存活人数）并按强化层数放大', () => {
    const r = run();
    const casts = castsOf(r, '404401010');
    expect(casts.length).toBeGreaterThanOrEqual(2);
    // 首次施放：427.91 ÷ 4 = 106.98（分摊，无强化层）
    const first = casts[0]!.enemyHits ?? [];
    expect(first.length).toBe(4);
    expect(first[0]!.damage).toBeCloseTo(106.98, 1);
    // 4 层强化（每层 +25%）→ ×2 = 213.95，且按层数使我方【纠缠】
    const boosted = casts
      .slice(1)
      .find((c) => (c.enemyHits ?? []).some((h) => Math.abs(h.damage - 213.95) < 0.2));
    expect(boosted).toBeTruthy();
    expect((boosted!.note ?? []).filter((n) => n === 'allyEntangle').length).toBe(4);
    expect(boosted!.note).toContain('enemyEnhanceConsumed');
  });

  it('SET 论证方法=黑潮 / 求解 都会切换形态（化形公式 + 自身易伤）', () => {
    const r = run();
    expect(notesOf(r)).toContain('enemyFormSwitch');
    expect(notesOf(r)).toContain('enemyStateCast'); // 论证形态叠层到 4 → 强制施放求解
    expect(castsOf(r, '404401005').length).toBeGreaterThanOrEqual(1);
  });

  it('二律背反 / 创生&&毁灭：命中后我方行动提前 + 解控 + 挂【二律背反】印记', () => {
    const r = run();
    const cast = [...castsOf(r, '404401003'), ...castsOf(r, '404401008')][0];
    expect(cast).toBeTruthy();
    const notes = cast!.note ?? [];
    expect(notes).toContain('enemyCleanseAdvance');
    expect(notes.filter((n) => n === 'allyMark').length).toBe(4);
  });

  it('虚数几何演绎法 / 故障空间：一场内 4 段随机单体', () => {
    const r = run();
    const cast = [...castsOf(r, '404401004'), ...castsOf(r, '404401009')][0];
    expect(cast).toBeTruthy();
    const hits = cast!.enemyHits ?? [];
    expect(hits.length).toBe(4);
    expect(hits[0]!.damage).toBeCloseTo(427.91, 1);
  });

  it('多槽：潜能实现猜想 / DEFRAG 生命优化 走敌侧联动，且同种子结果确定', () => {
    const a = run(8, 3);
    const b = run(8, 3);
    expect(JSON.stringify(a.events.map((e) => [e.skillCode, e.enemyHits?.length ?? 0]))).toBe(
      JSON.stringify(b.events.map((e) => [e.skillCode, e.enemyHits?.length ?? 0])),
    );
    // 3 槽下 12 个可施放技能都来自 4044010 表，且至少出现 5 种
    const codes = new Set(
      a.events.filter((e) => e.skillCode?.startsWith('monster.')).map((e) => e.skillCode),
    );
    for (const code of codes) expect(code!.startsWith('monster.4044010')).toBe(true);
    expect(codes.size).toBeGreaterThanOrEqual(5);
  });
});
