import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig, PolicyFn } from '../src/index.js';

function panel(over: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Quantum',
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
  opts: {
    eidolons?: Partial<Record<CharId, number>>;
    techniques?: boolean;
    maxTime?: number;
    policy?: PolicyFn;
    energyRegen?: number;
    speeds?: Partial<Record<CharId, number>>;
    lightcones?: Partial<Record<CharId, string>>;
  } = {},
): BattleConfig {
  return {
    members: ids.map(
      (id) =>
        ({
          id,
          panel: panel({
            element: id === 'ellen' ? 'Ice' : id === 'danheng' ? 'Wind' : 'Quantum',
            speed: opts.speeds?.[id] ?? 100,
            energyRegen: opts.energyRegen ?? 0.194,
          }),
          eidolonLevel: opts.eidolons?.[id] ?? 0,
          ...(opts.lightcones?.[id] ? { lightconeId: opts.lightcones[id] } : {}),
        }) as CombatMember,
    ),
    monsters: [monster()],
    maxTime: opts.maxTime ?? 200,
    initialSp: 3,
    seed: 1,
    techniques: opts.techniques ?? false,
    ...(opts.policy ? { policy: opts.policy } : {}),
  };
}

const F = (h: { factors: { key: string; value: number }[] }, k: string) => h.factors.find((f) => f.key === k)!;
const hitsOf = (r: ReturnType<typeof simulateBattle>, e: { hitSeqs?: number[] }) =>
  (e.hitSeqs ?? []).map((s) => r.hits[s]);

describe('耀嘉音 1515', () => {
  it('战技【虹光为你闪耀】：全队攻击力 += 自身攻击 ×24% + 300（快照，后续伤害基数生效）', () => {
    const r = simulateBattle(
      config(['yaojiayin', 'danheng'], {
        maxTime: 150,
        speeds: { yaojiayin: 150 },
        policy: ({ id }) => (id === 'yaojiayin' ? 'skill' : 'basic'),
      }),
    );
    const skill = r.events.find((e) => e.skillCode === 'yaojiayin.skill')!;
    expect(skill).toBeTruthy();
    expect(skill.note).toContain('yaoSkill');
    // 战技本身无伤害
    expect(hitsOf(r, skill)).toHaveLength(0);
    // 丹恒战技后（拿到 atkFlat）普攻基数 = 3000 + 3000×0.24 + 300 = 4020
    const dh = r.events.filter((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.basic').at(-1)!;
    expect(F(hitsOf(r, dh)[0], 'base').value).toBeCloseTo(4020);
  });

  it('强化普攻【高歌，倾落华彩】：全体 160% 攻击力（吃自身战技攻击力加成）', () => {
    const r = simulateBattle(
      config(['yaojiayin', 'danheng'], {
        maxTime: 240,
        speeds: { yaojiayin: 150 },
      }),
    );
    const gaoge = r.events.find((e) => e.skillCode === 'yaojiayin.gaoge')!;
    expect(gaoge).toBeTruthy();
    expect(gaoge.note).toContain('yaoGaoge');
    // 面板 3000 + atkFlat 1020 = 4020；160% → 6432
    expect(F(hitsOf(r, gaoge)[0], 'base').value).toBeCloseTo(6432);
  });

  it('终结技【星夜的安可曲】：全体 320% + 结界（敌方受伤 +32%）+ 我方普攻后附加 40% 攻击力伤害', () => {
    const r = simulateBattle(
      config(['yaojiayin', 'danheng'], {
        maxTime: 600,
        energyRegen: 0.6,
        speeds: { yaojiayin: 150 },
        policy: ({ id }) => (id === 'danheng' ? 'basic' : 'skill'),
      }),
    );
    const ult = r.events.find((e) => e.kind === 'ult' && e.unitId === 'yaojiayin')!;
    expect(ult).toBeTruthy();
    expect(ult.note).toContain('yaoField');
    expect(ult.note).toContain('yaoZeroSolo'); // 队伍无艾莲 → 额外回 40 能
    const ultHit = hitsOf(r, ult).find((h) => h.skillCode === 'yaojiayin.ult')!;
    // 自身战技 atkFlat（1020）也作用自身 → 攻击基数 4020；320% → 12864
    expect(F(ultHit, 'base').value).toBeCloseTo(12864);
    // 结界后丹恒普攻：vuln 因子 = 1.32
    const after = r.events.filter(
      (e) => e.unitId === 'danheng' && e.skillCode === 'danheng.basic' && e.time! >= ult.time!,
    )[0];
    expect(after).toBeTruthy();
    const dhHit = hitsOf(r, after).find((h) => h.skillCode === 'danheng.basic')!;
    expect(F(dhHit, 'vuln').value).toBeCloseTo(1.32);
    // 同一次普攻触发耀嘉音附加伤害：4020 × 40% = 1608
    const attach = hitsOf(r, after).find((h) => h.skillCode === 'yaojiayin.attach')!;
    expect(attach).toBeTruthy();
    expect(F(attach, 'base').value).toBeCloseTo(1608);
  });

  it('天赋【切分音】：我方攻击叠层（普攻额外 +1），每层使我方普攻增伤 +5%，行迹8 再 +40% 全队增伤', () => {
    const r = simulateBattle(
      config(['yaojiayin', 'danheng'], {
        maxTime: 200,
        speeds: { yaojiayin: 150 },
        policy: () => 'basic',
      }),
    );
    // 耀嘉音首次普攻（t≈66.7）自身那次还不吃层数；钩子在 record 内叠 1+1=2 层
    const yaoFirst = r.events.find(
      (e) => e.unitId === 'yaojiayin' && (e.skillCode === 'yaojiayin.basic' || e.skillCode === 'yaojiayin.gaoge'),
    )!;
    expect(yaoFirst.note).toContain('yaoSeg');
    // 之后丹恒的普攻（t=100）：2 层 → damageBonus = 1 + 0.05×2 + 行迹8 0.4
    const dh = r.events.find((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.basic')!;
    expect(F(hitsOf(r, dh)[0], 'damageBonus').value).toBeCloseTo(1 + 0.1 + 0.4, 2);
  });

  it('行迹 point06【幻想音阶】：暴击率 +50%，攻击力每超 2000 每 200 点 → 暴伤 +20%（上限 +200%）', () => {
    const r = simulateBattle(
      config(['yaojiayin', 'danheng'], { maxTime: 240, speeds: { yaojiayin: 150 } }),
    );
    const gaoge = r.events.find((e) => e.skillCode === 'yaojiayin.gaoge')!;
    expect(gaoge).toBeTruthy();
    // 攻击基数 4020 → 超 2020 → 10 档 × 20% = +200%（封顶）→ 暴伤 1.5+2.0 = 3.5；
    // 暴率 0.5+0.5 = 100% → crit = 1 + 1×3.5 = 4.5
    expect(F(hitsOf(r, gaoge)[0], 'crit').value).toBeCloseTo(4.5, 2);
  });

  it('E1（4.7.53 重做）：结界期间我方角色普攻后 → 对命中目标中当前生命值最高者造成「本次攻击总伤害 ×24%」真实伤害', () => {
    const mk = (eid: number) =>
      simulateBattle(
        config(['yaojiayin', 'danheng'], {
          maxTime: 600,
          energyRegen: 0.6,
          eidolons: { yaojiayin: eid },
          policy: ({ id }) => (id === 'danheng' ? 'basic' : 'skill'),
        }),
      );
    const r = mk(1);
    const ult = r.events.find((e) => e.kind === 'ult' && e.unitId === 'yaojiayin')!;
    const after = r.events.filter(
      (e) => e.unitId === 'danheng' && e.action === 'basic' && (e.time ?? 0) >= ult.time!,
    )[0];
    const hits = hitsOf(r, after);
    expect(after.note).toContain('yaoE1True');
    expect(after.note).toContain('yaoAttach');
    const trueHit = hits.find((h) => h.skillCode === 'yaojiayin.e1True')!;
    expect(trueHit).toBeTruthy();
    expect(trueHit.kind).toBe('trueDamage');
    // 基数 = 本次攻击的攻击命中段（含结界附加伤害）最终伤害之和；比例 #1=24%
    //（2026-11-25 裁定：不含击破/超击破段、不含本次攻击触发的其他单位攻击）
    const sum = hits
      .filter(
        (h) => h.kind === 'direct' && (h.source === 'danheng' || h.skillCode === 'yaojiayin.attach'),
      )
      .reduce((a, h) => a + h.total, 0);
    expect(sum).toBeGreaterThan(0);
    expect(F(trueHit, 'base').value).toBeCloseTo(sum);
    expect(F(trueHit, 'trueDamage').value).toBeCloseTo(0.24);
    expect(trueHit.total).toBeCloseTo(sum * 0.24);
    // 不吃任何乘区：无暴击/增伤/防御/抗性因子
    for (const k of ['crit', 'damageBonus', 'defense', 'resist']) {
      expect(trueHit.factors.some((f) => f.key === k)).toBe(false);
    }
    // 不视为 1 次攻击：本次普攻只叠 1 层切分音（真伤不再叠层、不回能）
    expect((after.note ?? []).filter((n) => n === 'yaoSeg')).toHaveLength(1);
    // E0 没有该段
    const r0 = mk(0);
    const ult0 = r0.events.find((e) => e.kind === 'ult' && e.unitId === 'yaojiayin')!;
    const after0 = r0.events.filter(
      (e) => e.unitId === 'danheng' && e.action === 'basic' && (e.time ?? 0) >= ult0.time!,
    )[0];
    expect(hitsOf(r0, after0).some((h) => h.skillCode === 'yaojiayin.e1True')).toBe(false);
  });

  it('E1 真实伤害选目标：命中目标中**当前生命值最高**者（AoE 普攻【高歌】打三个不同血量木桩）', () => {
    const mons = [monster(6e8), monster(2e8), monster(4e8)];
    const r = simulateBattle({
      ...config(['yaojiayin'], { maxTime: 600, energyRegen: 0.6, eidolons: { yaojiayin: 1 } }),
      monsters: mons,
    });
    // 耀嘉音先战技再【高歌】全体普攻：真伤应落在 6e8 的 monster1（命中目标里血最高）
    const gaoge = r.events.find((e) => (e.note ?? []).includes('yaoE1True') && e.skillCode === 'yaojiayin.gaoge')!;
    expect(gaoge).toBeTruthy();
    const trueHit = hitsOf(r, gaoge).find((h) => h.skillCode === 'yaojiayin.e1True')!;
    expect(trueHit.target).toBe('monster1');
  });

  it('E2（4.7.53 重做）：【切分音】增伤覆盖全攻击类型（战技也吃），旧「结界附加伤害 +80%」已删', () => {
    const mk = (eid: number) =>
      simulateBattle(
        config(['yaojiayin', 'danheng'], {
          maxTime: 600,
          energyRegen: 0.6,
          eidolons: { yaojiayin: eid },
          policy: () => 'skill',
        }),
      );
    const sk = (r: ReturnType<typeof simulateBattle>) =>
      r.events.filter((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.skill').at(-1)!;
    const r0 = mk(0);
    const r2 = mk(2);
    const db0 = F(hitsOf(r0, sk(r0))[0], 'damageBonus').value;
    const db2 = F(hitsOf(r2, sk(r2))[0], 'damageBonus').value;
    // 战技（非普攻）也吃「切分音层数 ×5%」→ E2 比 E0 多出数层增伤
    expect(db2 - db0).toBeGreaterThan(0.3);
    // 结界附加伤害恢复为 151503 #4 原倍率（不再 ×1.8）；E2 战技攻击力 +12% → 自身攻击 4380
    const basicRun = simulateBattle(
      config(['yaojiayin', 'danheng'], {
        maxTime: 600,
        energyRegen: 0.6,
        eidolons: { yaojiayin: 2 },
        policy: ({ id }) => (id === 'danheng' ? 'basic' : 'skill'),
      }),
    );
    const bu = basicRun.events.find((e) => e.kind === 'ult' && e.unitId === 'yaojiayin')!;
    const after = basicRun.events.filter(
      (e) => e.unitId === 'danheng' && e.action === 'basic' && (e.time ?? 0) >= bu.time!,
    )[0];
    const attach = hitsOf(basicRun, after).find((h) => h.skillCode === 'yaojiayin.attach')!;
    expect(F(attach, 'base').value).toBeCloseTo(1752); // 4380 × 40%
  });
  it('专武23067【闪亮如她】（4.7.53 重做）：终结技后我方全体行动提前 24%，全体暴伤 +40%（S1，4 回合，无能量门槛）', () => {
    const mk = (lc?: string) =>
      simulateBattle(
        config(['yaojiayin', 'danheng'], {
          maxTime: 600,
          energyRegen: 0.6,
          policy: () => 'skill',
          ...(lc ? { lightcones: { yaojiayin: lc } } : {}),
        }),
      );
    const r = mk('23067');
    const base = mk();
    const ult = r.events.find((e) => e.kind === 'ult' && e.unitId === 'yaojiayin')!;
    expect(ult.note).toContain('lc23067Advance');
    expect(ult.note).toContain('lc23067Song');
    const idx = r.events.indexOf(ult);
    const dh = r.events
      .slice(idx + 1)
      .find((e) => e.unitId === 'danheng' && (e.hitSeqs?.length ?? 0) > 0)!;
    // 丹恒：暴率 0.5、暴伤 1.5+0.40 → crit = 1 + 0.5×1.9（S1 参数 #3=40%）
    expect(F(hitsOf(r, dh)[0], 'crit').value).toBeCloseTo(1 + 0.5 * 1.9, 2);
    // 全体行动提前 24%：丹恒下一次行动 383.33 → 359.33
    const baseUlt = base.events.find((e) => e.kind === 'ult' && e.unitId === 'yaojiayin')!;
    const dh0 = base.events
      .slice(base.events.indexOf(baseUlt) + 1)
      .find((e) => e.unitId === 'danheng' && (e.hitSeqs?.length ?? 0) > 0)!;
    expect(dh0.time).toBeCloseTo(383.33, 1);
    expect(dh.time).toBeCloseTo(359.33, 1);
  });

  it('E6：第 1 次终结技即固定回 240 能（之后每施放 4 次再次触发）', () => {
    const mk = (eidolons: Partial<Record<CharId, number>>) =>
      simulateBattle(
        config(['yaojiayin', 'danheng'], {
          eidolons,
          maxTime: 600,
          energyRegen: 0.6,
          speeds: { yaojiayin: 150 },
        }),
      );
    const e0 = mk({});
    const e6 = mk({ yaojiayin: 6 });
    const ult0 = e0.events.find((e) => e.kind === 'ult' && e.unitId === 'yaojiayin')!;
    const ult6 = e6.events.find((e) => e.kind === 'ult' && e.unitId === 'yaojiayin')!;
    expect(ult6.note).toContain('yaoE6Energy');
    // E6：+240 固定回能 → 能量顶到上限 240；无 E6 只有终结技回能 + 无艾莲 40
    expect(ult6.energyAfter).toBeCloseTo(240);
    expect(ult0.energyAfter!).toBeLessThan(240);
  });
});
