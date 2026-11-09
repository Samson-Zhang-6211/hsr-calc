import { describe, expect, it } from 'vitest';
import { simulateBattle, type CombatMember, type MemberPanel, type MonsterConfig } from '../src/index.js';

// ── 【末法余烬】「破韧 → 立即阿哈额外回合」（末日 P21 关卡机制尾句，2026-10-30 第十九轮）──
// 实现：破韧分支置 `emberAhaPending`，主循环下一拍以 `fixedLaughRound = 10` 跑一次完整
// `runAhaMoment()`，事件口径 = `unitId:'ahaMoment'` + `skillCode:'aha.moment'` + note `stageEmberAha`。
// 实测锚点（dump 定锚，花火/星期日/飞霄/砂金 vs 4064012）：默认 7 次阿哈时刻，开 ember 后 8 次，
// 额外那次带 21 段 hitSeqs。

function panel(speed: number, elationDegree = 0): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp: 100000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 2,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
    elationDegree,
  } as MemberPanel;
}

const members = (): CombatMember[] => [
  { id: 'huohua', panel: panel(150, 0.5) },
  { id: 'sunday', panel: panel(156) },
  { id: 'feixiao', panel: panel(140) },
  { id: 'aventurine', panel: panel(134) },
];

// 4064012 金血忆灵：406401208 带【强化防御】（dmgReduction 0.4）→ 被弱点击破时触发末法余烬
const judge: MonsterConfig = {
  monsterId: '4064012',
  level: 95,
  hp: 6_000_000,
  attack: 800,
  speed: 120,
  maxToughness: 120,
  weaknesses: ['Fire', 'Quantum'],
  resistance: {},
  // 【化整为零】分裂会让本体【假死】而无法被破韧 → 本条只验证末法余烬，跳过分裂
  noSplit: true,
};

const run = (mechanics?: string[]) =>
  simulateBattle({
    members: members(),
    monsters: [judge],
    techniques: false,
    rounds: 6,
    maxTime: 4000,
    roundMode: 'forgotten',
    mechanics,
  });

describe('关卡机制 · 末法余烬的阿哈额外回合', () => {
  it('坚防守备被破韧 → 立即多出一次阿哈时刻（固定计入 10 笑点）', () => {
    const plain = run();
    const ember = run(['ember']);
    const ahaOf = (r: ReturnType<typeof run>) => r.events.filter((e) => e.action === 'ahaMoment');
    const extra = ahaOf(ember).filter((e) => (e.note ?? []).includes('stageEmberAha'));
    expect(ahaOf(plain).some((e) => (e.note ?? []).includes('stageEmberAha'))).toBe(false);
    expect(extra.length).toBe(1);
    // 额外时刻带欢愉技命中，且与普通时刻同口径记录
    expect((extra[0]!.hitSeqs ?? []).length).toBeGreaterThan(0);
    expect(extra[0]!.unitId).toBe('ahaMoment');
    expect(extra[0]!.skillCode).toBe('aha.moment');
    // 破韧与机制 note 都在
    const notes = ember.events.flatMap((e) => e.note ?? []);
    expect(notes).toContain('enemyHardenedDefenceBreak');
    expect(notes).toContain('stageEmber');
    expect(ahaOf(ember).length).toBe(ahaOf(plain).length + 1);
  });
});
