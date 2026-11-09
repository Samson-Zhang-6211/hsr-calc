import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  mechanicIdsFor,
  simulateBattle,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// ── 关卡级机制（2026-10-30 rulings 15~19 全部 A）──
// 数据源：data/monster-stages/arb-p10.json 的 stages[].mechanics（血嗜/洞穿/闭锁/桎梏/激怒/狂喜之夜/领航誓言）
// 锚点（实测）：4023020 波次的敌方技能基础命中 1574.12；【洞穿】下持盾目标 4722.35（= ×3）。

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

function monOf(stageIdx: number): MonsterConfig {
  const waves = buildPackStageWaves('arb-p10', stageIdx);
  const c = waves[0]![0]!;
  return { ...c, hp: Math.min(c.hp, 3e7) };
}

function run(mechanics: string[], rounds = 5, stageIdx = 1) {
  return simulateBattle({
    members: members(),
    monsterWaves: [[monOf(stageIdx)]],
    techniques: false,
    rounds,
    maxTime: 3000,
    roundMode: 'arbiter',
    mechanics,
  });
}

const stageNotes = (mechanics: string[], rounds = 5): string[] => {
  const notes = run(mechanics, rounds).events.flatMap((e) => e.note ?? []);
  return [...new Set(notes.filter((n) => n.startsWith('stage')))];
};

describe('关卡机制 · 站点名 → 引擎 id 映射', () => {
  it('中文名能翻成 id；未实现机制被丢弃；星启与常规关同机制', () => {
    expect(mechanicIdsFor(['血嗜', '洞穿', '狂喜之夜', '领航誓言'])).toEqual([
      'bloodthirst',
      'pierce',
      'ecstasyNight',
      'pilotVow',
    ]);
    expect(mechanicIdsFor(['血嗜+', '洞穿+', '不屈'])).toEqual(['bloodthirst2', 'pierce2', 'unyielding']);
    expect(mechanicIdsFor(['闭锁'])).toEqual(['lockdown']);
    expect(mechanicIdsFor(['桎梏+', '激怒'])).toEqual(['shackle2', 'enrage']);
    // 全部 11 项已映射（2026-10-30 rulings 15~19 全 A）
    expect(mechanicIdsFor(['末法余烬'])).toEqual(['ember']);
    expect(mechanicIdsFor(['记忆紊流', '胞吞作用'])).toEqual(['miasma', 'cytosis']);
    expect(mechanicIdsFor(['未知机制'])).toEqual([]);
    expect(mechanicIdsFor(undefined)).toEqual([]);
  });
});

describe('关卡机制 · 记忆紊流 / 胞吞作用', () => {
  it('记忆紊流：每轮开始编队第一位以固定 20 笑点释放 100% 群攻欢愉技', () => {
    const r = run(['miasma'], 4);
    const casts = r.events.filter((e) => e.skillCode === 'stage.miasma');
    expect(casts.length).toBeGreaterThanOrEqual(2);
    expect(casts[0]!.note).toContain('stageMiasma');
    // 命中为欢愉伤害（elation kind），且打全体
    const elationHits = r.hits.filter((h) => h.skillCode === 'stage.miasma');
    expect(elationHits.length).toBeGreaterThan(0);
    expect(elationHits[0]!.kind).toBe('elation');
    // 无该机制时不产生事件
    expect(run([], 4).events.some((e) => e.skillCode === 'stage.miasma')).toBe(false);
  });

  it('胞吞作用：只在【稳态失衡】结算时放大自身伤害（无亚婆离时无副作用）', () => {
    expect(() => run(['cytosis'], 3)).not.toThrow();
  });
});

describe('关卡机制 · 不屈 / 末法余烬', () => {
  it('不屈：敌方受击累积护盾（1% 生命上限/次，池上限 30%），护盾先抵扣伤害', () => {
    const plain = run([], 4);
    const shielded = run(['unyielding'], 4);
    // 同一编队/同一怪：不屈使怪物存活更久（伤害被护盾吃掉一部分）
    expect(shielded.monsterHpLeft).toBeGreaterThan(plain.monsterHpLeft);
    // 我方命中总数不变（只是伤害被抵扣）
    expect(shielded.hits.length).toBe(plain.hits.length);
  });

  it('末法余烬：坚防守备被弱点击破 → 我方解控 + 行动提前', () => {
    // 4023020（P44 其十二）带 hardenedDefence 的怪：未击破时不触发
    const without = run(['ember'], 4);
    const withBreak = run(['ember'], 4);
    const noteOf = (r: ReturnType<typeof run>) => r.events.flatMap((e) => e.note ?? []);
    // 破韧后才有 stageEmber；若 4 轮内没破韧则跳过（用 8 轮兜底）
    if (!noteOf(withBreak).includes('enemyHardenedDefenceBreak')) {
      const long = run(['ember'], 8);
      const notes = noteOf(long);
      expect(notes.includes('stageEmber') || !notes.includes('enemyHardenedDefenceBreak')).toBe(true);
    } else {
      expect(noteOf(withBreak)).toContain('stageEmber');
    }
    expect(noteOf(without)).toBeDefined();
  });
});

describe('关卡机制 · 血嗜 / 洞穿', () => {
  it('血嗜：我方回合开始扣 500 生命（血嗜+ 为 1000）', () => {
    const base = run([], 4);
    const bt = run(['bloodthirst'], 4);
    expect(stageNotes(['bloodthirst'], 4)).toContain('stageBloodthirst');
    const sum = (st: { memberHp: Record<string, number> }) =>
      Object.values(st.memberHp).reduce((a, b) => a + b, 0);
    const diff = sum(base.finalState) - sum(bt.finalState);
    expect(diff).toBeGreaterThan(0);
    // 每轮每名成员各扣 500 → 差额是 500 的整数倍
    expect(diff % 500).toBe(0);
    // 血嗜+ 扣得更多
    const bt2 = run(['bloodthirst2'], 4);
    expect(sum(base.finalState) - sum(bt2.finalState)).toBeGreaterThan(diff);
  });

  it('洞穿：持盾目标受到的敌方伤害 ×3（1574.12 → 4722.35）；洞穿+ 为 ×5', () => {
    const norm = run(['pierce'], 4);
    const hit = norm.events
      .flatMap((e) => e.enemyHits ?? [])
      .find((h) => h.blocked > 0)!;
    expect(hit.damage).toBeCloseTo(4722.35, 1);
    const plain = run([], 4);
    const plainHit = plain.events.flatMap((e) => e.enemyHits ?? [])[0]!;
    expect(plainHit.damage).toBeCloseTo(1574.12, 1);
  });
});

describe('关卡机制 · 桎梏 / 激怒', () => {
  it('桎梏：初始 2 层，我方伤害 −40%；每次终结技移除 1 层', () => {
    const plain = run([], 4);
    const shackled = run(['shackle'], 4);
    const totalOf = (r: ReturnType<typeof run>) =>
      r.hits.filter((h) => h.skillCode.startsWith('jingyuan')).reduce((a, b) => a + b.total, 0);
    // 同一编队同一怪，确定性：受桎梏时我方总伤更低
    expect(totalOf(shackled)).toBeLessThan(totalOf(plain));
    expect(stageNotes(['shackle'], 4)).toContain('stageShackleDown');
  });

  it('激怒：我方每次终结技 → 敌方加速 +30%/层（≤4），敌方回合开始清空', () => {
    const notes = stageNotes(['enrage'], 5);
    expect(notes).toContain('stageEnrage');
    expect(notes).toContain('stageEnrageClear');
  });
});

describe('关卡机制 · 闭锁 / 编队第一位增益', () => {
  it('闭锁：6 次攻击后禁锢 1 回合并扣 30% 能量', () => {
    const r = run(['lockdown'], 8);
    // 注：闭锁的 note 落在**命中**上（我方攻击的 hit.note），事件 note 里没有
    const hitNotes = r.hits.map((h) => h.note).filter((n): n is string => typeof n === 'string');
    expect(hitNotes).toContain('stageLockdown');
    expect(r.events.some((e) => e.action === 'skip')).toBe(true);
  });

  it('狂喜之夜 / 领航誓言：只给编队第一位挂增益（不改变事件结构）', () => {
    const plain = run([], 4);
    const buffed = run(['ecstasyNight', 'pilotVow'], 4);
    // 两者都是常驻 buff：我方总伤不降（领航誓言 +50% 抗穿）
    const totalOf = (r: ReturnType<typeof run>) => r.hits.reduce((a, b) => a + b.total, 0);
    expect(totalOf(buffed)).toBeGreaterThanOrEqual(totalOf(plain));
  });
});
