import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(over: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Thunder',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1,
    damageBonus: 0,
    speed: 100,
    energyRegen: 0.194,
    ...over,
  } as MemberPanel;
}

function monster(hp = 5e8): MonsterConfig {
  return {
    level: 90,
    hp,
    maxToughness: 1000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack: 0,
  } as MonsterConfig;
}

function config(
  ids: CharId[],
  eidolons: Partial<Record<CharId, number>> = {},
  opts: { techniques?: boolean; maxTime?: number; initialSp?: number; hp?: number } = {},
): BattleConfig {
  return {
    members: ids.map(
      (id) => ({ id, panel: panel(), eidolonLevel: eidolons[id] ?? 0 }) as CombatMember,
    ),
    monsters: [monster(opts.hp)],
    maxTime: opts.maxTime ?? 200,
    initialSp: opts.initialSp ?? 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

const F = (h: { factors: { key: string; value: number }[] }, k: string) =>
  h.factors.find((f) => f.key === k)!.value;
const hitsOf = (r: ReturnType<typeof simulateBattle>, e: { hitSeqs?: number[] }) =>
  (e.hitSeqs ?? []).map((s) => r.hits[s]);
const byCode = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

describe('不死途 1504', () => {
  it('进战自动挂【饲饵】（当前 HP 最低敌人）；战技 200%，目标已是饲饵时额外 100% 并回 1 战技点', () => {
    const r = simulateBattle(config(['ashveil', 'danheng'], {}, { maxTime: 200 }));
    const skill = r.events.find((e) => e.skillCode === 'ashveil.skill')!;
    expect(skill.note).toContain('asBait');
    expect(skill.note).toContain('ashveilSkillExtra');
    expect(skill.note).toContain('asP06');
    const hits = hitsOf(r, skill);
    expect(F(hits[0], 'base')).toBeCloseTo(6000); // 3000×2.0
    const extra = hits.find((h) => h.skillCode === 'ashveil.skillExtra')!;
    expect(F(extra, 'base')).toBeCloseTo(3000); // 3000×1.0
    // 战技耗 1 回 1 → 净 SP 与开战相同
    expect(skill.spAfter).toBeCloseTo(3);
  });

  it('【饲饵】受我方其他目标攻击后：固定回 8 能 + 消耗 1 充能 + 200% 追击 + 2 层【婪酣】', () => {
    const r = simulateBattle(config(['ashveil', 'danheng'], {}, { maxTime: 200 }));
    const skill = r.events.find((e) => e.skillCode === 'ashveil.skill')!;
    const dh = r.events.find((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.skill')!;
    expect(dh.note).toContain('asEnergy');
    expect(dh.note).toContain('asFollow');
    expect(dh.note).toContain('asGreed');
    const follow = hitsOf(r, dh).find((h) => h.skillCode === 'ashveil.talent')!;
    expect(F(follow, 'base')).toBeCloseTo(6000); // 3000×2.0
    // 回能走 gainEnergyRaw（不吃充能效率），且落在事件之后 → event.energyAfter 是事件前快照，
    // 故用 note + 追击段锚定「已触发」，不在此锁 energy 数值
    // 充能初战 2，天赋每次消耗 1；战技自身 +30×1.194 已在事件内结算
    expect(skill.energyAfter).toBeCloseTo(75 + 30 * 1.194);
  });

  it('行迹 07：追击伤害 +80%，每层【婪酣】额外 +10%', () => {
    const r = simulateBattle(config(['ashveil', 'danheng'], {}, { maxTime: 200 }));
    const follows = byCode(r, 'ashveil.talent');
    // 第 1 次触发时婪酣=1（战技行迹 06 +1 层）→ 1 + 0.8 + 0.1
    expect(F(follows[0], 'damageBonus')).toBeCloseTo(1.9);
    // 第 2 次触发时婪酣=3 → 1 + 0.8 + 0.3
    expect(F(follows[1], 'damageBonus')).toBeCloseTo(2.1);
  });

  it('E1：敌方全体受伤 +24%（vuln 区，逐怪判定）', () => {
    const r = simulateBattle(config(['ashveil', 'danheng'], {}, { maxTime: 200 }));
    const hit = byCode(r, 'ashveil.talent')[0]!;
    expect(F(hit, 'vuln')).toBeCloseTo(1.24);
    // 队友的伤害同样吃
    const dh = byCode(r, 'danheng.skill')[0]!;
    expect(F(dh, 'vuln')).toBeCloseTo(1.24);
  });

  it('point08：我方暴伤 +40%，追击暴伤额外 +80%（追击共 +120%）', () => {
    const r = simulateBattle(config(['ashveil', 'danheng'], {}, { maxTime: 200 }));
    const dh = byCode(r, 'danheng.skill')[0]!;
    expect(F(dh, 'crit')).toBeCloseTo(1.95); // 1 + 0.5×(1.5+0.4)
    const follow = byCode(r, 'ashveil.talent')[0]!;
    expect(F(follow, 'crit')).toBeCloseTo(2.35); // 1 + 0.5×(1.5+1.2)
  });

  it('终结技：400% + 强化天赋追击（基础 1 段 + floor(婪酣/4) 段），不消耗充能', () => {
    const r = simulateBattle(config(['ashveil', 'danheng'], {}, { maxTime: 400 }));
    const ult = r.events.find((e) => e.unitId === 'ashveil' && e.kind === 'ult')!;
    const hits = hitsOf(r, ult);
    expect(F(hits[0], 'base')).toBeCloseTo(12000); // 3000×4.0
    const enh = hits.filter((h) => h.skillCode === 'ashveil.followEnhanced');
    expect(enh.length).toBeGreaterThanOrEqual(1);
    expect(F(enh[0], 'base')).toBeCloseTo(6000);
    // 强化追击不额外扣充能：大招本身给 3 点
    expect(ult.note).toContain('ashveilUlt');
    expect(hits.every((h) => F(h, 'vuln') > 1.2)).toBe(true);
  });

  it('E6：有【饲饵】时敌方全属性抗性 −20%（resist 区），且每累计 1 层婪酣伤害 +4%', () => {
    const r = simulateBattle(config(['ashveil', 'danheng'], { ashveil: 6 }, { maxTime: 400 }));
    const hit = byCode(r, 'ashveil.talent')[0]!;
    expect(F(hit, 'resist')).toBeCloseTo(1.2); // 1 − (−0.2)
    // E6 增伤：累计 1 层 → +4%，叠在 point07 的 0.8+0.1×1 上
    expect(F(hit, 'damageBonus')).toBeCloseTo(1.9 + 0.04);
  });

  it('秘技：进战对敌方全体 100% 雷伤 + 1 点充能', () => {
    const r = simulateBattle(config(['ashveil', 'danheng'], {}, { techniques: true, maxTime: 20 }));
    const tech = r.events.find((e) => e.skillCode === 'ashveil.tech')!;
    expect(tech.note).toContain('ashveilTech');
    const hit = hitsOf(r, tech)[0]!;
    expect(F(hit, 'base')).toBeCloseTo(3000); // 3000×1.0
  });
});
