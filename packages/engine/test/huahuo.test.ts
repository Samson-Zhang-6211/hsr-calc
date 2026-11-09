import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CombatMember,
} from '../src/index.js';

/** 花火 1306 接入回归（2026-10；dump 锚点法：锚点全部来自 huahuo-dump 实测，勿纯推理改写） */

type Ev = BattleResult['events'][number];
type Hit = BattleResult['hits'][number];

const MON: BattleConfig['monster'] = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 300,
  weaknesses: ['Quantum'],
  resistance: { Quantum: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Physical: 0, Imaginary: 0 },
  attack: 0,
  enemyClass: 'normal',
  speed: 100,
};

function hh(
  over: Partial<CombatMember['panel']> = {},
  eidolonLevel = 0,
  lightconeId?: string,
): CombatMember {
  return {
    id: 'huahuo',
    panel: {
      level: 80, hp: 3000, attack: 1400, defence: 800, speed: 101,
      critRate: 0.05, critDmg: 1.6, element: 'Quantum', damageBonus: 0.1, energyRegen: 0,
      breakEffect: 0,
      ...over,
    },
    eidolonLevel,
    lightconeId,
  };
}
function jy(): CombatMember {
  return {
    id: 'jingyuan',
    panel: {
      level: 80, hp: 3500, attack: 2600, defence: 900, speed: 135,
      critRate: 0.8, critDmg: 1.6, element: 'Thunder', damageBonus: 0.4888, energyRegen: 0,
      breakEffect: 0,
    },
  };
}
function hhua(): CombatMember {
  return {
    id: 'huohua',
    panel: {
      level: 80, hp: 3200, attack: 1500, defence: 850, speed: 118,
      critRate: 0.1, critDmg: 1.5, element: 'Fire', damageBonus: 0.2, energyRegen: 0,
      breakEffect: 0,
    },
  };
}
/** 花火在场时战技点上限 5+2（130604 #3） */
const runCache = new Map<string, BattleResult>();
function run(key: string, cfg: () => BattleConfig): BattleResult {
  let r = runCache.get(key);
  if (!r) {
    r = simulateBattle(cfg());
    runCache.set(key, r);
  }
  return r;
}

const evsOf = (r: BattleResult, pred: (e: Ev) => boolean): Ev[] => r.events.filter(pred);
const hitOf = (r: BattleResult, seq: number): Hit => {
  const h = r.hits.find((x) => x.seq === seq);
  if (!h) throw new Error(`no hit seq=${seq}`);
  return h;
};
const factorOf = (h: Hit, key: string): number => {
  const f = h.factors.find((x) => x.key === key);
  if (!f) throw new Error(`no factor ${key} on seq=${h.seq}`);
  return f.value;
};
const close = (a: number, b: number, eps = 0.01): void => {
  expect(Math.abs(a - b)).toBeLessThan(eps);
};
const firstBuff = (
  r: BattleResult,
  unit: string,
  labelKey: string,
  afterTime = -1,
): { value: number; duration: number } => {
  for (const ev of r.events) {
    if (ev.time <= afterTime || !ev.buffs) continue;
    const list = ev.buffs[unit as keyof typeof ev.buffs];
    if (!list) continue;
    const b = list.find((x) => x.labelKey === labelKey);
    if (b) return { value: b.value, duration: b.duration };
  }
  throw new Error(`no buff ${labelKey} on ${unit}`);
};

describe('花火 1306（2026-10 接入）', () => {
  it('D 单人普攻路线：岁时记普攻+30能量/大招恢复6SP/上限7/溢出入池', () => {
    const r = run('D', () => ({
      members: [hh()],
      monster: { ...MON }, rounds: 6, maxTime: 400, techniques: false, seed: 20261010,
      policy: () => 'basic',
    }) as BattleConfig);
    // 普攻 130601：sp_base=20 + 时机岁记 point06BasicEnergy=10 → 初始55+30=85
    const basics = evsOf(r, (e) => e.unitId === 'huahuo' && e.action === 'basic');
    expect(basics[0].time).toBeCloseTo(99.01, 1);
    expect(basics[0].spAfter).toBe(4); // 3+1
    expect(basics[0].energyAfter).toBe(85);
    expect(basics[0].note).toContain('hh2P06Basic');
    expect(basics[0].hitSeqs?.length).toBe(1);
    expect(basics[1].energyAfter).toBe(110); // 85+30 触顶
    // 大招：+6SP（e0无E4）、能量清5；能量链 85/110/35/65
    const ult = evsOf(r, (e) => e.unitId === 'huahuo' && e.kind === 'ult')[0];
    expect(ult.time).toBeCloseTo(198.02, 1);
    expect(ult.spAfter).toBe(7); // 5+6 → 上限7
    expect(ult.energyAfter).toBe(5);
    expect(ult.note).toContain('hh2Ult');
    expect(ult.note).toContain('hh2Cipher');
    expect(basics[2].energyAfter).toBe(35); // 5+30
    expect(basics[3].energyAfter).toBe(65);
    // 终态：SP 满（上限7）+ 大招溢出4入池
    expect(r.finalState.sp).toBe(7);
    expect(r.finalState.hh2Overflow).toBe(4);
    close(r.report.totalDamage, 4134.240000000001);
  });

  it('E 单人战技路线：谜诡暴伤0.834/溢出池补SP/能量链含岁时记+1', () => {
    const r = run('E', () => ({
      members: [hh()],
      monster: { ...MON }, rounds: 12, maxTime: 1000, techniques: false, seed: 20261010,
    }) as BattleConfig);
    const skills = evsOf(r, (e) => e.unitId === 'huahuo' && e.action === 'skill');
    // 战技单体我方目标（solo 回落自身）、耗1SP、e0 notes=[hh2Skill,hh2Talent]
    expect(skills[0].time).toBeCloseTo(99.01, 1);
    expect(skills[0].spAfter).toBe(2); // 3-1
    expect(skills[0].energyAfter).toBe(85); // 55+30（施放时未持谜诡，无岁时记）
    expect(skills[0].note).toContain('hh2Skill');
    expect(skills[0].note).toContain('hh2Talent');
    expect(skills[0].targetId).toBe('huahuo');
    expect(skills[0].note).not.toContain('hh2E1'); // e0
    // 谜诡：huahuo 暴伤1.6×0.24+0.45=0.834、抗穿0.1、持续2
    const cd = firstBuff(r, 'huahuo', 'hh2Cd');
    close(cd.value, 0.8340000000000001, 0.0001);
    expect(cd.duration).toBe(2);
    const res = firstBuff(r, 'huahuo', 'hh2Res');
    close(res.value, 0.1, 0.0001);
    // 能量链：85/110/36/67/98/110（持谜诡耗SP→岁时记+1）
    expect(skills[1].energyAfter).toBe(110);
    expect(skills[2].energyAfter).toBe(36); // 5+30+1
    expect(skills[3].energyAfter).toBe(67);
    expect(skills[4].energyAfter).toBe(98);
    expect(skills[5].energyAfter).toBe(110);
    // 三次大招后终态：SP满+溢出池4
    const ults = evsOf(r, (e) => e.unitId === 'huahuo' && e.kind === 'ult');
    expect(ults.length).toBe(3);
    expect(ults[0].spAfter).toBe(7); // 1+6
    expect(ults[1].spAfter).toBe(7); // 3+6→7
    expect(ults[2].spAfter).toBe(7); // 5+6→7
    expect(r.finalState.sp).toBe(7);
    expect(r.finalState.hh2Overflow).toBe(4);
    close(r.report.totalDamage, 0); // 纯辅助无伤害
  });

  it('B2 e0 双人对照：无E2 def恒0.476/谜诡0.834/总伤锚点', () => {
    const r = run('B2', () => ({
      members: [hh(), jy()],
      monster: { ...MON }, rounds: 12, maxTime: 800, techniques: false, seed: 20261010,
      policy: (ctx) => (ctx.id === 'huahuo' ? (ctx.energyFull ? 'basic' : 'skill') : 'skill'),
    }) as BattleConfig);
    close(r.report.totalDamage, 2042518.094871766, 1);
    const skill = evsOf(r, (e) => e.unitId === 'huahuo' && e.action === 'skill')[0];
    expect(skill.time).toBeCloseTo(99.01, 1);
    expect(skill.note).not.toContain('hh2E1');
    expect(skill.note).not.toContain('hh2E6');
    // e0：E2 不生效 → 首击 def 区恒 100/210
    const h0 = hitOf(r, 0);
    close(factorOf(h0, 'defense'), 100 / 210, 0.0001);
    const h3 = hitOf(r, 3);
    close(factorOf(h3, 'defense'), 100 / 210, 0.0001);
    close(factorOf(h0, 'crit'), 2.5360000000000005, 0.0001);
    // 景元持有谜诡 0.834
    const cd = firstBuff(r, 'jingyuan', 'hh2Cd');
    close(cd.value, 0.8340000000000001, 0.0001);
  });

  it('F e6 双人：E2无视防御按幻相层数/E6谜诡1.3884+扩散/大招E6扩散note', () => {
    const r = run('F', () => ({
      members: [hh({}, 6), jy()],
      monster: { ...MON }, rounds: 12, maxTime: 800, techniques: false, seed: 20261010,
      policy: (ctx) => (ctx.id === 'huahuo' ? (ctx.energyFull ? 'basic' : 'skill') : 'skill'),
    }) as BattleConfig);
    close(r.report.totalDamage, 3104218.826744639, 1);
    // 首战技 notes 含 E1（速度触发）
    const skill = evsOf(r, (e) => e.unitId === 'huahuo' && e.action === 'skill')[0];
    expect(skill.time).toBeCloseTo(99.01, 1);
    expect(skill.note).toEqual(expect.arrayContaining(['hh2E1', 'hh2Skill', 'hh2Talent']));
    // E2：def 因子随幻相层数 1→3（100/199、100/177），对照 B2 的 100/210
    const h0 = hitOf(r, 0);
    close(factorOf(h0, 'defense'), 100 / 199, 0.0001); // 1层（景元首动耗1SP）
    const h3 = hitOf(r, 3);
    close(factorOf(h3, 'defense'), 100 / 177, 0.0001); // 3层
    close(h0.total, 8780.182127369008);
    close(h3.total, 22529.58016229387);
    // E6 谜诡：1.6×(0.264+0.3)+0.486=1.3884（E3→lv12）、持续2
    const cd = firstBuff(r, 'jingyuan', 'hh2Cd');
    close(cd.value, 1.3884, 0.0001);
    expect(cd.duration).toBe(2);
    // 大招：E4 +1SP（-2+6+1=5）、notes 含 E6
    const ult = evsOf(r, (e) => e.unitId === 'huahuo' && e.kind === 'ult')[0];
    expect(ult.spAfter).toBe(5);
    expect(ult.note).toEqual(expect.arrayContaining(['hh2Ult', 'hh2Cipher', 'hh2E6']));
    // E1 攻击力+40% 于大招挂到全队
    const atk = firstBuff(r, 'jingyuan', 'hh2E1Atk');
    close(atk.value, 0.4, 0.0001);
    expect(atk.duration).toBe(3);
    // E6 扩散：目标已持谜诡 → 后续战技 notes 含 hh2E6
    const skill2 = evsOf(
      r,
      (e) => e.unitId === 'huahuo' && e.action === 'skill' && e.time > 200,
    )[0];
    expect(skill2.note).toContain('hh2E6');
    expect(skill2.energyAfter).toBe(38); // 5+30+3岁时记(1SP×? dump锚)
  });

  it('G 秘技：全队+3SP/花火+20能量', () => {
    const r = run('G', () => ({
      members: [hh(), jy()],
      monster: { ...MON }, rounds: 4, maxTime: 200, techniques: true, seed: 20261010,
    }) as BattleConfig);
    const tech = evsOf(r, (e) => e.unitId === 'huahuo' && e.kind === 'action' && e.action === 'technique')[0];
    expect(tech.time).toBe(0);
    expect(tech.spAfter).toBe(6); // 3+3
    expect(tech.energyAfter).toBe(75); // 55+20
    expect(tech.note).toContain('hh2Tech');
    expect(tech.note).toContain('technique');
    close(r.report.totalDamage, 585668.7738813756);
  });

  it('H 专武23021：开场假面全队暴击0.1/暴伤0.28常驻、无额外SP恢复', () => {
    const r = run('H', () => ({
      members: [hh({}, 0, '23021'), jy()],
      monster: { ...MON }, rounds: 10, maxTime: 600, techniques: false, seed: 20261010,
      policy: (ctx) => (ctx.id === 'huahuo' ? (ctx.energyFull ? 'basic' : 'skill') : 'skill'),
    }) as BattleConfig);
    const cr = firstBuff(r, 'jingyuan', 'lc21Mask');
    close(cr.value, 0.1, 0.0001);
    expect(cr.duration).toBe(-1);
    // 持久 buff 实例键=lc21Mask 同时挂 critDmg 0.28（首事件同现）
    let found = false;
    for (const ev of r.events) {
      const list = ev.buffs?.jingyuan;
      if (!list) continue;
      const cd = list.find((x) => x.labelKey === 'lc21Mask' && x.key === 'critDmg');
      if (cd) {
        close(cd.value, 0.28, 0.0001);
        expect(cd.duration).toBe(-1);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    // LC 无额外 SP 恢复：大招 sp 与 B2 同（-2+6=4，非5）
    const ult = evsOf(r, (e) => e.unitId === 'huahuo' && e.kind === 'ult')[0];
    expect(ult.spAfter).toBe(4);
    expect(ult.note).toEqual(expect.arrayContaining(['hh2Ult', 'hh2Cipher']));
    expect(ult.note).not.toContain('hh2E1');
    close(r.report.totalDamage, 1578239.9276289972);
  });

  it('I 火花联动：火花耗SP触发hh2P07→花火下次战技免耗hh2Free', () => {
    const r = run('I', () => ({
      members: [hh(), hhua()],
      monster: { ...MON }, rounds: 12, maxTime: 800, techniques: false, seed: 20261010,
      policy: (ctx) => (ctx.id === 'huahuo' ? (ctx.energyFull ? 'basic' : 'skill') : 'skill'),
    }) as BattleConfig);
    // 火花开场一回合合并事件（连线模型：战技+陷阱+强化普攻单事件，触发 hh2P07）
    const hhuaSkill = evsOf(r, (e) => e.unitId === 'huohua' && e.action === 'basic')[0];
    expect(hhuaSkill.time).toBeCloseTo(84.75, 1);
    expect(hhuaSkill.note).toContain('hh2P07');
    expect(hhuaSkill.note).toContain('hhLink');
    expect(hhuaSkill.spAfter).toBe(1); // 买光后强化普攻回 1（旧独立战技事件为 0）
    expect(hhuaSkill.energyAfter).toBe(120); // 80 + 强化普攻 sp_base 40
    // 花火下一次战技免耗：sp 不变 + notes=[hh2Free,hh2Skill]、无 hh2Talent（未耗SP不叠幻相）
    const freeSkill = evsOf(r, (e) => e.unitId === 'huahuo' && e.action === 'skill')[0];
    expect(freeSkill.time).toBeCloseTo(99.01, 1);
    expect(freeSkill.spAfter).toBe(1); // 火花合并事件回 1 后免费不扣
    expect(freeSkill.note).toContain('hh2Free');
    expect(freeSkill.note).toContain('hh2Skill');
    expect(freeSkill.note).not.toContain('hh2Talent');
    expect(freeSkill.energyAfter).toBe(85);
    close(r.report.totalDamage, 493045.5146208183);
  });
});
