import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig, PolicyFn } from '../src/index.js';

function panel(over: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Ice',
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
    lightcones?: Partial<Record<CharId, string>>;
    speed?: Partial<Record<CharId, number>>;
  } = {},
): BattleConfig {
  return {
    members: ids.map(
      (id) =>
        ({
          id,
          panel: panel({
            element: id === 'yaojiayin' ? 'Quantum' : id === 'danheng' ? 'Wind' : 'Ice',
            energyRegen: opts.energyRegen ?? 0.194,
            speed: opts.speed?.[id] ?? 100,
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

describe('艾莲 1514（4.7.53 机制重做版）', () => {
  it('战技【暴风雪特调】：主目标 400% 冰伤 + 挂【咬痕】（4.7.53 #5 改 20% → 普攻易伤 1.2）', () => {
    // 强制艾莲一直放战技、丹恒只放普攻 → 战技当次先挂【咬痕】，丹恒普攻吃 basicVuln
    const r = simulateBattle(
      config(['ellen', 'danheng'], {
        maxTime: 120,
        policy: ({ id }) => (id === 'ellen' ? 'skill' : 'basic'),
      }),
    );
    const skill = r.events.find((e) => e.skillCode === 'ellen.skill')!;
    expect(skill.note).toContain('ellenBiteMark');
    const skillHit = hitsOf(r, skill)[0];
    expect(F(skillHit, 'base').value).toBeCloseTo(12000); // 3000 × 400%
    // 丹恒普攻（同一时刻、战技之后）吃【咬痕】：vuln 乘区 = 1 + 20%
    const dh = r.events.find((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.basic')!;
    expect(F(hitsOf(r, dh)[0], 'vuln').value).toBeCloseTo(1.2);
    // 战技本身不是普攻 → 不吃咬痕
    expect(F(skillHit, 'vuln').value).toBeCloseTo(1);
  });

  it('秘技：+3 咬合力（进战 3→6）→ 首次普攻即【冰海潜游式】消耗 6 点打出 3 段额外随机伤害', () => {
    const r = simulateBattle(config(['ellen', 'danheng'], { techniques: true, maxTime: 120 }));
    const tech = r.events.find((e) => e.skillCode === 'ellen.tech')!;
    expect(tech.note).toContain('ellenTech');
    expect(F(hitsOf(r, tech)[0], 'base').value).toBeCloseTo(1500); // 3000 × 50%
    const dive = r.events.find((e) => e.skillCode === 'ellen.dive')!;
    expect(dive.note).toContain('ellenDive');
    const hits = hitsOf(r, dive);
    // 主目标 400%（Lv6）+ 每多消耗 1 点（共 3 点）1 段 200%（4.7.53 #3 改 2.8% 满级 → Lv6 = 2.0）
    expect(hits).toHaveLength(4);
    expect(F(hits[0], 'base').value).toBeCloseTo(12000);
    for (const h of hits.slice(1)) expect(F(h, 'base').value).toBeCloseTo(6000);
    // 冰海潜游式不恢复战技点：本次行动后 SP 不变（秘技不回 SP）→ 与开战相同 3
    expect(dive.spAfter).toBe(3);
  });

  it('终结技：全体 400% + 对【咬痕】目标额外 240%（4.7.53 删除「下一次冰潜 +400%」）', () => {
    const r = simulateBattle(
      config(['ellen', 'danheng'], { techniques: true, maxTime: 1200, energyRegen: 0.5 }),
    );
    const ult = r.events.find((e) => e.unitId === 'ellen' && e.kind === 'ult')!;
    expect(ult).toBeTruthy();
    const hits = hitsOf(r, ult);
    const aoe = hits.find((h) => h.skillCode === 'ellen.ult' && h.note !== 'ellenUltMark')!;
    expect(F(aoe, 'base').value).toBeCloseTo(12000); // 3000 × 400%
    const extra = hits.find((h) => h.skillCode === 'ellen.ult' && h.note === 'ellenUltMark')!;
    expect(extra).toBeTruthy();
    expect(F(extra, 'base').value).toBeCloseTo(7200); // 3000 × 240%
    // 4.7.53：终结技不再给「下一次【冰海潜游式】+400%」→ 后续冰潜增伤乘区仍为 1
    const ultIdx = r.events.indexOf(ult);
    const diveAfter = r.events
      .slice(ultIdx + 1)
      .find((e) => e.skillCode === 'ellen.dive')!;
    expect(diveAfter).toBeTruthy();
    expect(F(hitsOf(r, diveAfter)[0], 'damageBonus').value).toBeCloseTo(1);
  });

  it('天赋【鲨牙布】：进战即召唤、独立行动条首动 AV=50、600% 攻击力追加攻击', () => {
    const r = simulateBattle(config(['ellen', 'danheng'], { maxTime: 60 }));
    const sb = r.events.find((e) => e.unitId === 'shazabu')!;
    expect(sb).toBeTruthy();
    expect(sb.time).toBeCloseTo(50);
    expect(sb.note).toContain('ellenP08');
    const hit = hitsOf(r, sb)[0];
    expect(F(hit, 'base').value).toBeCloseTo(18000); // 3000 × 600%
    expect(hit.attackKind).toBe('followup');
  });

  it('行迹 point06【漫游模式】：队友身上有外部来源增益 → 暴伤 +64%/名（上限 2 名）', () => {
    // 耀嘉音战技给全队 atkFlat（source=yaojiayin）：丹恒身上来自耀嘉音 → 计入 1 名
    const r = simulateBattle(
      config(['ellen', 'yaojiayin', 'danheng'], {
        maxTime: 400,
        policy: ({ id }) => (id === 'danheng' ? 'basic' : 'skill'),
      }),
    );
    const dhBasic = r.events.find((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.basic')!;
    // 耀嘉音战技（t=100）之后艾莲的第二次战技：丹恒身上已有耀嘉音提供的 atkFlat → 计 1 名
    const ellenSkill = r.events.filter((e) => e.skillCode === 'ellen.skill').at(-1)!;
    const ellenHit = hitsOf(r, ellenSkill)[0];
    // 1 名队友（丹恒持耀嘉音增益）→ 暴伤 1.5+0.64=2.14；暴率 0.5 → crit = 1+0.5×2.14 = 2.07
    expect(F(ellenHit, 'crit').value).toBeCloseTo(1 + 0.5 * (1.5 + 0.64), 2);
    // 丹恒自身不吃艾莲行迹 → crit = 1+0.5×1.5 = 1.75
    expect(F(hitsOf(r, dhBasic)[0], 'crit').value).toBeCloseTo(1.75, 2);
  });

  it('零号连线：艾莲终结技后自动【冰海潜游式】(0 消耗) + 151405 弹射 200%×3 → 耀嘉音【共舞】→ 可插终结技的额外回合', () => {
    const r = simulateBattle(
      config(['ellen', 'yaojiayin'], { maxTime: 1200, energyRegen: 0.5 }),
    );
    const ult = r.events.find((e) => e.unitId === 'ellen' && e.kind === 'ult')!;
    expect(ult).toBeTruthy();
    expect(ult.note).toContain('zeroLineEllen');
    const codes = hitsOf(r, ult).map((h) => h.skillCode);
    expect(codes).toContain('ellen.ult');
    expect(codes).toContain('ellen.diveZero');
    expect(codes).toContain('yaojiayin.dance');
    // 4.7.53：联线冰潜 = 主目标 + 弹射 3 段（E0 无 E6）
    const diveZero = hitsOf(r, ult).filter((h) => h.skillCode === 'ellen.diveZero');
    expect(diveZero).toHaveLength(4);
    expect(F(diveZero[0], 'base').value).toBeCloseTo(16080); // 4020 × 400%
    for (const h of diveZero.slice(1)) expect(F(h, 'base').value).toBeCloseTo(8040); // 4020 × 200%
    // 耀嘉音额外回合（同一时刻、紧跟终结技）；4.7.52 起为「可插入施放终结技的额外回合」
    const yaoExtra = r.events.find(
      (e) => e.unitId === 'yaojiayin' && e.extraTurn === true && e.kind === 'action',
    );
    expect(yaoExtra).toBeTruthy();
    expect(yaoExtra!.extraTurnAllowUlt).toBe(true);
  });

  it('E1（4.7.53 重做）：回合开始回 4 咬合力；冰海潜游式**无条件**无视 36% 防御；消耗 6 点 → 攻击后行动提前 25%', () => {
    const e0 = simulateBattle(config(['ellen', 'danheng'], { techniques: true, maxTime: 400 }));
    const e1 = simulateBattle(
      config(['ellen', 'danheng'], { techniques: true, maxTime: 400, eidolons: { ellen: 1 } }),
    );
    const d0 = hitsOf(e0, e0.events.filter((e) => e.skillCode === 'ellen.dive')[0])[0];
    const dive1 = e1.events.filter((e) => e.skillCode === 'ellen.dive')[0];
    const d1 = hitsOf(e1, dive1)[0];
    expect(dive1.note).toContain('ellenE1'); // 消耗 6 点 → 行动提前
    expect(dive1.note).toContain('ellenE1Turn'); // 回合开始回咬合力
    expect(F(d1, 'defense').value).toBeGreaterThan(F(d0, 'defense').value);
    // 防御区 = (80+20) / ((80+20) + (90+20)×(1−36%))
    expect(F(d1, 'defense').value).toBeCloseTo(100 / (100 + 110 * 0.64), 3);
    // 回合开始 +4 咬合力：第二次冰潜（上回合末 3 点 + 4 → 6）多 3 段；E0 同位置只有主段
    const dives0 = e0.events.filter((e) => e.skillCode === 'ellen.dive');
    const dives1 = e1.events.filter((e) => e.skillCode === 'ellen.dive');
    expect(dives0.length).toBeGreaterThan(1);
    expect(dives0[1].hitSeqs?.length).toBe(1);
    expect(dives1[1].hitSeqs?.length).toBe(4);
    // E1 攻击后行动提前 25%：第二次行动 = 90 + 100 − 25 = 165（见 4.7.53 落档 dump）
    expect(dives1[1].time).toBeCloseTo(165);
  });

  it('E1 无视防御**与消耗量解耦**：零号连线的 0 消耗冰潜同样无视 36% 防御', () => {
    const r = simulateBattle(
      config(['ellen', 'yaojiayin'], { maxTime: 1200, energyRegen: 0.5, eidolons: { ellen: 1 } }),
    );
    const ult = r.events.find((e) => e.unitId === 'ellen' && e.kind === 'ult')!;
    const dz = hitsOf(r, ult).filter((h) => h.skillCode === 'ellen.diveZero');
    expect(dz.length).toBeGreaterThan(0);
    for (const h of dz) expect(F(h, 'defense').value).toBeCloseTo(100 / (100 + 110 * 0.64), 3);
  });

  it('E2（4.7.53 重做）：冰潜后【鲨牙布】立即追加攻击（回 5 能 + 1 咬 + 下次冰潜暴伤 +40%）', () => {
    const r = simulateBattle(
      config(['ellen', 'danheng'], { techniques: true, maxTime: 400, eidolons: { ellen: 2 } }),
    );
    const dive = r.events.find((e) => e.skillCode === 'ellen.dive')!;
    expect(dive.note).toContain('ellenE2');
    expect(dive.note).toContain('ellenE2Follow');
    const hits = hitsOf(r, dive);
    const follow = hits.find((h) => h.skillCode === 'ellen.shazabu')!;
    expect(follow).toBeTruthy();
    expect(follow.attackKind).toBe('followup');
    expect(F(follow, 'base').value).toBeCloseTo(18000); // 3000 × 600%
    // 首次冰潜的暴伤来自 t=50 鲨牙布自身行动（不可叠加）；冰潜本身的 4 段吃 +40%
    expect(F(hits[0], 'crit').value).toBeCloseTo(1 + 0.5 * (1.5 + 0.4), 2);
  });

  it('E4（4.7.53 重做）：冰潜固定冰属性抗穿 12%（与消耗量无关）', () => {
    const e0 = simulateBattle(config(['ellen', 'danheng'], { techniques: true, maxTime: 120 }));
    const e4 = simulateBattle(
      config(['ellen', 'danheng'], { techniques: true, maxTime: 120, eidolons: { ellen: 4 } }),
    );
    const d0 = hitsOf(e0, e0.events.find((e) => e.skillCode === 'ellen.dive')!)[0];
    const d4 = hitsOf(e4, e4.events.find((e) => e.skillCode === 'ellen.dive')!)[0];
    expect(F(d4, 'resist').value).toBeCloseTo(F(d0, 'resist').value + 0.12, 4);
  });

  it('行迹 point07（4.7.53 重写）：满上限后每额外获得 1 点咬合力 → 行动提前 10%，每回合最多 2 次', () => {
    // 秘技把咬合力顶到 6（上限）；3 名 200 速队友同刻（t=50）各打 1 次 → 3 次溢出，
    // 只有 2 次生效 → 艾莲首次行动 = 100 − 2×10 = 80（若上限失效会变成 70）
    const r = simulateBattle(
      config(['ellen', 'serval', 'hook', 'arlan'], {
        techniques: true,
        maxTime: 200,
        speed: { serval: 200, hook: 200, arlan: 200 },
        policy: () => 'skill',
      }),
    );
    const first = r.events.find((e) => e.unitId === 'ellen' && e.kind === 'action' && e.time! > 0)!;
    expect(first.time).toBeCloseTo(80);
    // 溢出触发记录（第 3 次起被每回合上限挡住，不再 push）
    const p07Notes = r.events
      .filter((e) => e.time! <= 50)
      .flatMap((e) => e.note ?? [])
      .filter((n) => n === 'ellenP07');
    expect(p07Notes).toHaveLength(2);
  });

  it('E6【狂宴时刻】：上限 1 层（4.7.53）；联线冰潜 = E6 +3 段 + 151405 弹射 3 段（Q2 叠加）', () => {
    const r = simulateBattle(
      config(['ellen', 'yaojiayin'], {
        eidolons: { ellen: 6 },
        maxTime: 1200,
        energyRegen: 0.5,
      }),
    );
    const ult = r.events.find((e) => e.unitId === 'ellen' && e.kind === 'ult')!;
    expect(ult.note).toContain('ellenE6Feast');
    expect(ult.note).toContain('ellenE6');
    // 单体 boss：主 + E6 3 段 + 弹射 3 段 = 7 段
    expect(hitsOf(r, ult).filter((h) => h.skillCode === 'ellen.diveZero')).toHaveLength(7);
    // 4.7.52：E6 的额外回合是「可插入施放终结技的额外回合」
    const extra6 = r.events.find((e) => e.unitId === 'ellen' && e.extraTurn === true);
    expect(extra6).toBeTruthy();
    expect(extra6!.extraTurnAllowUlt).toBe(true);
  });

  it('耀嘉音 E1 真伤（艾莲冰潜事件）：只算艾莲命中段 + 结界附伤，排除击破段与鲨牙布追攻', () => {
    // 韧性压到 30：首次冰潜即破韧 → 同一事件里同时有击破段、鲨牙布追攻、结界附伤
    const base = config(['ellen', 'yaojiayin'], {
      maxTime: 1200,
      energyRegen: 0.5,
      eidolons: { ellen: 2, yaojiayin: 1 },
    });
    const r = simulateBattle({ ...base, monsters: [{ ...monster(), maxToughness: 30 }] });
    const diveEv = r.events.find(
      (e) =>
        e.unitId === 'ellen' &&
        e.skillCode === 'ellen.dive' &&
        (e.note ?? []).includes('yaoE1True') &&
        hitsOf(r, e).some((h) => h.kind === 'breakTrigger'),
    )!;
    expect(diveEv).toBeTruthy();
    const hits = hitsOf(r, diveEv);
    // 事件里确实同时存在「鲨牙布追攻」（E2）与「击破段」，但都不进基数
    expect(hits.some((h) => h.source === 'shazabu')).toBe(true);
    expect(hits.some((h) => h.kind === 'breakTrigger')).toBe(true);
    const trueHit = hits.find((h) => h.skillCode === 'yaojiayin.e1True')!;
    const segs = hits.filter(
      (h) => h.kind === 'direct' && (h.source === 'ellen' || h.skillCode === 'yaojiayin.attach'),
    );
    const sum = segs.reduce((a, h) => a + h.total, 0);
    expect(F(trueHit, 'base').value).toBeCloseTo(sum);
    expect(trueHit.total).toBeCloseTo(sum * 0.24);
    // dump 定锚（seed=1，该事件：艾莲 47829.6+26571.8×3 + 附伤 6367.8 = 133911.52 → ×24% ≈ 32138.77）
    expect(sum).toBeCloseTo(133911.52, 1);
    expect(trueHit.total).toBeCloseTo(32138.77, 1);
    // 反向保证：把所有我方伤害段都算进去会明显更大
    const all = hits
      .filter((h) => h.kind !== 'trueDamage')
      .reduce((a, h) => a + h.total, 0);
    expect(all).toBeGreaterThan(sum * 1.2);
  });

  it('专武23066：4.7.53【冰饮】改为「战斗开始时或施放终结技时」→ 进战即有无视 12% 防御', () => {
    const base = simulateBattle(config(['ellen', 'danheng'], { maxTime: 200 }));
    const r = simulateBattle(
      config(['ellen', 'danheng'], { maxTime: 1200, energyRegen: 0.5, lightcones: { ellen: '23066' } }),
    );
    const firstDive = r.events.find((e) => e.skillCode === 'ellen.dive')!;
    const firstDive0 = base.events.find((e) => e.skillCode === 'ellen.dive')!;
    // 开战即持【冰饮】→ 第一次冰潜就吃 12% 无视防御（旧口径要等一次 ≥200 能的终结技）
    expect(F(hitsOf(r, firstDive)[0], 'defense').value).toBeGreaterThan(
      F(hitsOf(base, firstDive0)[0], 'defense').value,
    );
    expect(F(hitsOf(r, firstDive)[0], 'defense').value).toBeCloseTo(100 / (100 + 110 * 0.88), 4);
    // 终结技里依然会给（并记 note），但不再要求能量阈值
    const ult = r.events.find((e) => e.unitId === 'ellen' && e.kind === 'ult')!;
    expect(ult.note).toContain('lc23066Ice');
  });
});
