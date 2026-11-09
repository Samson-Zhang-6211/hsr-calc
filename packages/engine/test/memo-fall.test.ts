import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  createInteractiveBattle,
  type BattleConfig,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

// 2026-10-25 完整链裁定（question 四条）：迷迷/晴空乐手进受击池+HP 建模+HP 归零终局退场
// （迷迷→1800706 开拓者行动提前25%、清充能；晴空乐手→复用 exitFever 全套含1151206 晴歌
// 提前50%）；800702/151202 已在场回血改到忆灵本体。锚点由 memo-fall-dump 实跑定锚。

const panel = (over: Partial<MemberPanel>): MemberPanel => ({
  element: 'Ice',
  level: 80,
  hp: 60000,
  attack: 2000,
  defence: 1000,
  critRate: 0.5,
  critDmg: 1.0,
  breakEffect: 0,
  damageBonus: 0,
  speed: 103,
  energyRegen: 0,
  ...over,
});

const mem = (): CombatMember => ({
  id: 'trailblazerMem',
  eidolonLevel: 0,
  panel: panel({ element: 'Ice' }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});
const jy = (): CombatMember => ({
  id: 'jingyuan',
  eidolonLevel: 0,
  panel: panel({ element: 'Thunder', speed: 135 }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});
const qg = (): CombatMember => ({
  id: 'qingge',
  eidolonLevel: 0,
  panel: panel({ element: 'Wind', speed: 156 }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const MON = (attack: number, withSkill = true): MonsterConfig => ({
  level: 90,
  hp: 1e9,
  resistance: {},
  weaknesses: ['Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary'],
  maxToughness: 9999,
  speed: 100,
  enemyClass: 'elite',
  attack,
  ...(withSkill ? { monsterId: '1004011' as const } : {}),
});

const cfg = (members: CombatMember[], monster: MonsterConfig, over: Partial<BattleConfig> = {}): BattleConfig => ({
  members,
  monster,
  techniques: false,
  rounds: 30,
  maxTime: 2500,
  seed: 20261010,
  ...over,
});

const notes = (n: unknown): string[] => (Array.isArray(n) ? (n as string[]) : n ? [String(n)] : []);

describe('迷迷/晴空乐手 HP 归零终局退场（完整链）', () => {
  it(
    'A1 800702 已在场回血改到迷迷本体（交互式：两次战技）',
    { timeout: 120000 },
    () => {
      const ctl = createInteractiveBattle(cfg([mem()], MON(0, false), { rounds: 6, maxTime: 400 }));
      let guard = 0;
      for (;;) {
        const step = ctl.advance();
        if (!step) break;
        if (++guard > 100) break;
        if (step.type === 'decision') {
          ctl.advance({ action: 'skill', target: { enemyTarget: 'monster1' } });
        }
      }
      const r = ctl.result();
      expect(r).not.toBeNull();
      const skills = r!.events.filter(
        (e) => e.kind === 'action' && e.unitId === 'trailblazerMem' && e.skillCode === 'trailblazerMem.skill',
      );
      expect(skills.length).toBeGreaterThanOrEqual(2);
      expect(notes(skills[0].note)).toContain('summonMimi');
      // 第二次战技：迷迷已在场 → 回血到迷迷本体（旧简化错回开拓者，2026-10 裁定修正）
      expect(notes(skills[1].note)).toContain('mimiHeal');
      expect(notes(skills[1].note)).not.toContain('summonMimi');
    },
  );

  it('A2 迷迷进受击池被击杀 → 1800706 开拓者行动提前（memFall）', () => {
    const r = simulateBattle(cfg([mem(), jy()], MON(30000)));
    const evs = r.events.filter((e) => e.enemyHits);
    expect(evs.length).toBeGreaterThanOrEqual(3);

    // 单体 100401104：嘲讽抽中迷迷，30000×1.5×110/210（迷迷防御区按主人等级）
    const single = evs.find((e) => e.skillCode === 'monster.100401104')!;
    expect(single).toBeDefined();
    expect(single.enemyHits!.length).toBe(1);
    expect(single.enemyHits![0].targetId).toBe('mimi');
    expect(single.enemyHits![0].damage).toBeCloseTo(30000 * 1.5 * (110 / 210), 6);
    expect(single.enemyHits![0].dead).toBe(false);

    // 迷迷 HP = 开拓者60000×80%+640 = 48640；第二段 AoE 打掉剩余 25068.57 → 归零退场
    const fall = evs.find((e) => notes(e.note).includes('memFall'))!;
    expect(fall).toBeDefined();
    expect(fall.skillCode).toBe('monster.100401103');
    const mimiHit = fall.enemyHits!.find((h) => h.targetId === 'mimi')!;
    expect(mimiHit).toBeDefined();
    expect(mimiHit.hpLoss).toBeCloseTo(48640 - 30000 * 1.5 * (110 / 210), 6);
    expect(mimiHit.dead).toBe(true);
    // AoE 全体段：主人存活（60000−58928.57）才拉条 → memFall 已由本次事件记账
    const ownerHit = fall.enemyHits!.find((h) => h.targetId === 'trailblazerMem')!;
    expect(ownerHit.damage).toBeCloseTo(30000 * 3.75 * (110 / 210), 6);

    // 退场事件之后的同刻扩散段（固定种子=100401106）不再命中旧迷迷
    //（注意：开拓者终招可在同刻重召新迷迷——那是新单位满血入场，合法再受击，不在本断言范围）
    const fallIdx = evs.indexOf(fall);
    const blast = evs.slice(fallIdx + 1).find((e) => e.skillCode === 'monster.100401106');
    if (blast) {
      expect(blast.enemyHits!.some((h) => h.targetId === 'mimi')).toBe(false);
    }
  });

  it('B 晴空乐手预Fever被击杀 → 复用 exitFever（memoFall，晴歌在轴只拉条不重复入列）', () => {
    const r = simulateBattle(cfg([qg(), mem()], MON(30000)));
    const evs = r.events.filter((e) => e.enemyHits);

    // 召贝茜（memo 入列、HP=晴歌60000×0.7=42000）
    const summon = r.events.find(
      (e) => e.kind === 'action' && e.unitId === 'qingge' && e.skillCode === 'qingge.skill',
    )!;
    expect(summon).toBeDefined();
    expect(notes(summon.note)).toContain('summonBeisi');

    // 预 Fever 阶段 memo 被 AoE 打死（hpLoss=满值42000）→ memoFall；同事件迷迷也被打死
    const fall = evs.find((e) => notes(e.note).includes('memoFall'))!;
    expect(fall).toBeDefined();
    expect(fall.skillCode).toBe('monster.100401103');
    const memoHit = fall.enemyHits!.find((h) => h.targetId === 'memo')!;
    expect(memoHit.hpLoss).toBeCloseTo(42000, 6);
    expect(memoHit.dead).toBe(true);
    expect(notes(fall.note)).toContain('memFall');
    // 晴歌本体仍在轴（预 Fever 分支）：本事件晴歌受击不死（60000−58928.57>0）
    expect(fall.enemyHits!.find((h) => h.targetId === 'qingge')!.dead).toBe(false);

    // memo 死后可再召（下一次战技 summonBeisi）+ 迷迷死后终招/战技重召——退场不锁召唤
    const resummon = r.events.find(
      (e) =>
        e.kind === 'action' &&
        e.unitId === 'qingge' &&
        e.skillCode === 'qingge.skill' &&
        e.time > summon.time &&
        notes(e.note).includes('summonBeisi'),
    );
    expect(resummon).toBeDefined();
    const memResummon = r.events.find(
      (e) =>
        e.kind === 'action' &&
        e.unitId === 'trailblazerMem' &&
        e.skillCode === 'trailblazerMem.skill' &&
        notes(e.note).includes('summonMimi'),
    );
    expect(memResummon).toBeDefined();
  });
});
