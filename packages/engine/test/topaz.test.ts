import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(): MemberPanel {
  return {
    element: 'Fire',
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
  } as MemberPanel;
}

function monster(fireWeak = true, attack = 0): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 1000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: fireWeak
      ? ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary']
      : ['Physical', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack,
  } as MonsterConfig;
}

function config(
  ids: CharId[],
  eidolons: Partial<Record<CharId, number>> = {},
  opts: {
    techniques?: boolean;
    maxTime?: number;
    initialSp?: number;
    fireWeak?: boolean;
    attack?: number;
  } = {},
): BattleConfig {
  return {
    members: ids.map(
      (id) =>
        ({
          id,
          panel: panel(),
          eidolonLevel: eidolons[id] ?? 0,
        }) as CombatMember,
    ),
    monsters: [monster(opts.fireWeak ?? true, opts.attack ?? 0)],
    maxTime: opts.maxTime ?? 300,
    initialSp: opts.initialSp ?? 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

const base = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'base')!.value;
const crit = (h: { factors: { key: string; value: number }[] }) =>
  h.factors.find((f) => f.key === 'crit')!.value;
const topazSkills = (r: ReturnType<typeof simulateBattle>) =>
  r.events.filter((e) => e.unitId === 'topaz' && e.skillCode === 'topaz.skill');
const numbyTurns = (r: ReturnType<typeof simulateBattle>) =>
  r.events.filter((e) => e.unitId === 'topazNumby' && e.kind === 'action');

describe('托帕&账账 1112', () => {
  it('E0 战技：账账 150% 追击吃【负债证明】+50% 与 point07 火弱点 +15%', () => {
    const r = simulateBattle(config(['topaz'], {}, { maxTime: 100 }));
    const skill = topazSkills(r)[0]!;
    expect(skill.note).toContain('topazDebt');
    expect(skill.note).toContain('topazNumby');
    expect(skill.note).toContain('topazSkill');
    expect(skill.note).toContain('topazFollowAdvance');
    expect(skill.spAfter).toBe(2);
    // 65 初战 + 战技 30 + 账账攻击 20，均吃 19.4% 充能效率
    expect(skill.energyAfter).toBeCloseTo(124.7);
    const hit = r.hits[skill.hitSeqs![0]];
    expect(hit.attackKind).toBe('followup');
    expect(hit.skillCode).toBe('topaz.skill');
    expect(base(hit)).toBeCloseTo(4500);
    expect(crit(hit)).toBeCloseTo(1.75);
    expect(hit.total).toBeCloseTo(5821.875);
  });

  it('point07 金融动荡：无火弱点时整段少 15%（5821.875 → 5062.5）', () => {
    const r = simulateBattle(config(['topaz'], {}, { maxTime: 100, fireWeak: false }));
    const skill = topazSkills(r)[0]!;
    expect(r.hits[skill.hitSeqs![0]].total).toBeCloseTo(5062.5);
    const numby = numbyTurns(r)[0]!;
    expect(r.hits[numby.hitSeqs![0]].total).toBeCloseTo(5062.5);
  });

  it('point06 透支：普攻整段按追加攻击结算（吃负债 +50%、可叠 E1、触发追击钩子）', () => {
    const r = simulateBattle(config(['topaz'], {}, { maxTime: 100, initialSp: 0 }));
    const basic = r.events.find((e) => e.unitId === 'topaz' && e.action === 'basic')!;
    expect(basic.note).toContain('topazAutoDebt'); // 场上无负债 → 回合开始自动随机施加
    const hit = r.hits[basic.hitSeqs![0]];
    expect(hit.attackKind).toBe('followup');
    expect(base(hit)).toBeCloseTo(3000);
    // 无负债时为 3622.5（= 4200×1.75×1.15×0.9×def），此处 ×1.5
    expect(hit.total).toBeCloseTo(3881.25);
    // 视为追击 → 触发天赋拉条
    expect(basic.note).toContain('topazFollowAdvance');
  });

  it('天赋拉条：我方追加攻击命中负债目标 → 账账提前 50%（自身回合内不触发）', () => {
    const r = simulateBattle(config(['topaz'], {}, { maxTime: 100, initialSp: 0 }));
    const numby = numbyTurns(r)[0]!;
    // 账账基础速度 80 → 原本 125 才行动；被普攻追击拉条 50% 后提前到 100
    expect(numby.time).toBe(100);
    expect(numby.note).toContain('topazNumby');
    // 账账自身回合内不能给自己拉条
    expect(numby.note ?? []).not.toContain('topazFollowAdvance');
    expect(numby.note ?? []).not.toContain('topazAdvance');
    expect(base(r.hits[numby.hitSeqs![0]])).toBeCloseTo(4500);
  });

  it('E1【被执行】：负债目标受追击暴伤 +25%/层，最多 2 层，当次攻击不吃新层', () => {
    const r = simulateBattle(config(['topaz'], { topaz: 1 }, { maxTime: 260, initialSp: 0 }));
    const basic = r.events.find((e) => e.unitId === 'topaz' && e.action === 'basic')!;
    expect(crit(r.hits[basic.hitSeqs![0]])).toBeCloseTo(1.75); // 0 层
    expect(basic.note).toContain('topazE1');
    const numby = numbyTurns(r)[0]!;
    expect(crit(r.hits[numby.hitSeqs![0]])).toBeCloseTo(1.875); // 1 层
    const skill = topazSkills(r)[0]!;
    expect(crit(r.hits[skill.hitSeqs![0]])).toBeCloseTo(2); // 2 层封顶
    const second = numbyTurns(r)[1]!;
    // 2 层 + 终结技暴伤 +25% → 暴伤 2.25 → 因子 1+0.5×2.25
    expect(crit(r.hits[second.hitSeqs![0]])).toBeCloseTo(2.125);
  });

  it('E2：账账自身回合攻击后额外回 5 能（吃充能效率）', () => {
    const e0 = simulateBattle(config(['topaz'], {}, { maxTime: 100, initialSp: 0 }));
    const e2 = simulateBattle(config(['topaz'], { topaz: 2 }, { maxTime: 100, initialSp: 0 }));
    const a = numbyTurns(e0)[0]!;
    const b = numbyTurns(e2)[0]!;
    expect(b.note).toContain('topazE2');
    expect(a.energyAfter).toBeCloseTo(112.76);
    expect(b.energyAfter).toBeCloseTo(118.73);
    expect(b.energyAfter! - a.energyAfter!).toBeCloseTo(5 * 1.194);
  });

  it('E4：账账自身回合开始时托帕行动提前 20%（下次行动 200 → 180）', () => {
    const e0 = simulateBattle(config(['topaz'], {}, { maxTime: 300 }));
    const e4 = simulateBattle(config(['topaz'], { topaz: 4 }, { maxTime: 300 }));
    expect(topazSkills(e0)[1]!.time).toBe(200);
    expect(topazSkills(e4)[1]!.time).toBe(180);
    expect(numbyTurns(e4)[0]!.note).toContain('topazE4');
  });

  it('终结技【涨幅惊人！】：倍率 +150pp、暴伤 +25%、账账攻击 2 次后退出、point08 回能', () => {
    const r = simulateBattle(config(['topaz'], {}, { maxTime: 350 }));
    const ult = r.events.find((e) => e.skillCode === 'topaz.ult')!;
    expect(ult.time).toBe(100);
    expect(ult.note).toContain('topazUlt');
    expect(ult.hitSeqs).toBeUndefined(); // 终结技本身不造成伤害
    const inUlt = topazSkills(r)[1]!;
    expect(inUlt.note).toContain('topazAdvance');
    const hit = r.hits[inUlt.hitSeqs![0]];
    expect(base(hit)).toBeCloseTo(9000); // 1.5 → 3.0 倍攻击力
    expect(crit(hit)).toBeCloseTo(1.875); // 暴伤 1.5 → 1.75
    expect(hit.total).toBeCloseTo(12475.446428571428);
    // 2 次攻击后退出
    const p08: string[] = [];
    for (const e of r.events) {
      if ((e.note ?? []).includes('topazP08')) p08.push(e.skillCode ?? '');
      if ((e.note ?? []).includes('topazUltEnd')) break;
    }
    expect(p08.length).toBe(2);
    // point08 只在【涨幅惊人！】期间回能
    const firstNumby = numbyTurns(r)[0]!;
    expect(firstNumby.note ?? []).not.toContain('topazP08');
  });

  it('E6：涨幅惊人期间账账攻击次数 2 → 3，且火属性抗性穿透 +10%', () => {
    const e4 = simulateBattle(config(['topaz'], { topaz: 4 }, { maxTime: 300 }));
    const e6 = simulateBattle(config(['topaz'], { topaz: 6 }, { maxTime: 300 }));
    const countP08 = (r: ReturnType<typeof simulateBattle>): number => {
      let n = 0;
      for (const e of r.events) {
        if ((e.note ?? []).includes('topazP08')) n += 1;
        if ((e.note ?? []).includes('topazUltEnd')) break;
      }
      return n;
    };
    expect(countP08(e4)).toBe(2);
    expect(countP08(e6)).toBe(3);
    // 同一时点（180s 首次涨幅惊人内战技）：基础倍率两侧同为 9450，仅抗穿差 10%
    const h4 = e4.hits[topazSkills(e4)[1]!.hitSeqs![0]];
    const h6 = e6.hits[topazSkills(e6)[1]!.hitSeqs![0]];
    expect(base(h4)).toBeCloseTo(9450);
    expect(base(h6)).toBeCloseTo(9450);
    expect(h6.total / h4.total).toBeCloseTo(1.1);
  });

  it('秘技：下一场账账首次攻击后托帕回 60 能，只生效一次', () => {
    const plain = simulateBattle(config(['topaz'], {}, { maxTime: 100 }));
    const tech = simulateBattle(config(['topaz'], {}, { maxTime: 100, techniques: true }));
    const techEv = tech.events.find((e) => e.skillCode === 'topaz.tech')!;
    expect(techEv.time).toBe(0);
    expect(techEv.note).toContain('topazTech');
    const numbyEvents = tech.events.filter(
      (e) => (e.note ?? []).includes('topazNumby'),
    );
    expect(numbyEvents[0]!.note).toContain('topazTech');
    expect(numbyEvents.slice(1).every((e) => !(e.note ?? []).includes('topazTech'))).toBe(true);
    // 秘技回能后首次战技即满能：124.7 + 60×1.194 溢出封顶 130
    expect(plain.events.find((e) => e.skillCode === 'topaz.skill')!.energyAfter).toBeCloseTo(124.7);
    expect(tech.events.find((e) => e.skillCode === 'topaz.skill')!.energyAfter).toBe(130);
  });

  it('队友的追加攻击同样拉条账账（真理医生战技天赋追击）', () => {
    const r = simulateBattle(config(['topaz', 'ratio'], {}, { maxTime: 220 }));
    const ratioSkill = r.events.find((e) => e.skillCode === 'ratio.skill')!;
    expect(ratioSkill.note).toContain('topazFollowAdvance');
    // 账账 100 行动后下次本应 225；被真理医生追击拉条 50% → 162.5
    const second = numbyTurns(r)[1]!;
    expect(second.time).toBeCloseTo(162.5);
  });

  it('托帕阵亡后账账消失（不再行动）', () => {
    const r = simulateBattle(config(['topaz', 'arlan'], {}, { maxTime: 400, attack: 300000 }));
    const monsterActs = r.events.filter((e) => e.unitId === 'monster1' && e.action === 'monster');
    expect(monsterActs.length).toBeGreaterThan(0);
    const diedAt = monsterActs[0]!.time;
    const after = r.events.filter((e) => e.unitId === 'topazNumby' && e.time > diedAt);
    expect(after.length).toBe(0);
    expect(r.events.filter((e) => e.unitId === 'topaz' && e.time > diedAt).length).toBe(0);
  });
});
