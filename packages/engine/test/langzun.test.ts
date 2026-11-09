import { describe, expect, it } from 'vitest';
import { simulateBattle, type BattleConfig, type CombatMember } from '../src/index.js';

/** 狼尊1506接入回归测试——全部锚点取自 2026-10-09 dump
 * （%TEMP%/opencode/langzun-dump2.txt，seed=20261009 单机复现） */

const mkPanel = (over: Record<string, unknown> = {}) => ({
  level: 80,
  speed: 110,
  attack: 2000,
  hp: 3000,
  defence: 800,
  element: 'Imaginary' as const,
  critRate: 0.5,
  critDmg: 1.0,
  elationDegree: 0,
  damageBonus: 0,
  breakEffect: 0,
  effectHit: 0,
  effectRes: 0,
  damageReduction: 0,
  energyRegen: 0,
  outgoingHealing: 0,
  elementDmg: { Imaginary: 0.3 },
  ...over,
});

const MON: BattleConfig['monster'] = {
  level: 90,
  hp: 500_000_000,
  maxToughness: 300,
  speed: 100,
  enemyClass: 'elite',
  resistance: {},
  weaknesses: [],
};

const lz = (eidolon: number): CombatMember => ({
  id: 'langzun',
  eidolonLevel: eidolon,
  panel: mkPanel(),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const hh = (): CombatMember => ({
  id: 'huohua',
  eidolonLevel: 0,
  panel: mkPanel({ speed: 107, element: 'Fire', elementDmg: { Fire: 0.3 } }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const yg = (): CombatMember => ({
  id: 'yaoguang',
  eidolonLevel: 0,
  panel: mkPanel({
    speed: 105,
    element: 'Quantum',
    critRate: 0.7,
    critDmg: 1.6,
    elementDmg: { Quantum: 0.3 },
  }),
  skillLevels: { basic: 10, skill: 10, ult: 10, talent: 10 },
});

const cfg = (members: CombatMember[]): BattleConfig => ({
  members,
  monster: MON,
  techniques: true,
  rounds: 60,
  maxTime: 3000,
  seed: 20261009,
});

const noteArr = (n: unknown): string[] =>
  Array.isArray(n) ? (n as string[]) : n ? [String(n)] : [];

const hasNote = (e: { note?: unknown }, k: string): boolean => noteArr(e.note).includes(k);

const factorOf = (h: { factors: { key: string; value: number }[] }, k: string): number =>
  h.factors.find((f) => f.key === k)?.value ?? Number.NaN;

describe('狼尊1506接入', () => {
  it('秘技直触盲盒：固定计入99好活、不经概率衰减、大剑真伤（裁定9/4/10）', () => {
    const r = simulateBattle(cfg([lz(0)]));
    const tech = r.events[0];
    expect(tech.action).toBe('technique');
    expect(tech.unitId).toBe('langzun');
    expect(tech.hitSeqs?.length).toBe(4); // 3 欢愉段 + 1 大剑真伤
    const hits = tech.hitSeqs!.map((s) => r.hits[s]);
    const elation = hits.filter((h) => h.kind === 'elation');
    const sword = hits.find((h) => h.kind === 'trueDamage')!;
    expect(elation.length).toBe(3);
    for (const h of elation) {
      expect(h.skillCode).toBe('langzun.box');
      expect(factorOf(h, 'base')).toBeCloseTo(2260.5321, 6); // 7535.107×0.9/3 全体均分
      expect(factorOf(h, 'laugh')).toBeCloseTo(2.4601769911504423, 10); // x=99 笑点区
      expect(h.note).toBe('lzBox');
    }
    expect(sword.note).toBe('lzSword');
    expect(factorOf(sword, 'trueDamage')).toBeCloseTo(0.2, 6);
    expect(sword.total).toBeCloseTo(2145.08, 2);
    // 2026-11-05：啊哈不在队 → 无「欢愉」命途升格 → 无 150629#3 暴伤 40%（旧锚 2463.12）
    // 直触通道：全 run 首个事件即秘技盒，后续 SP 通道概率衰减不作用于它
    expect(r.report.byKind.trueDamage).toBeGreaterThan(0);
  });

  it('战技结构与笑点→隐藏分转发（1.6直伤×3 + 0.4天赋附带；能量列=隐藏分）', () => {
    const r = simulateBattle(cfg([lz(0)]));
    const skills = r.events.filter((e) => e.action === 'skill' && e.unitId === 'langzun');
    const s1 = skills[0];
    expect(hasNote(s1, 'lzSkill')).toBe(true);
    expect(hasNote(s1, 'lzTalentPlus')).toBe(true);
    const hits = s1.hitSeqs!.map((s) => r.hits[s]);
    expect(hits.length).toBe(6); // 3 直伤 + 3 附带
    for (const h of hits.slice(0, 3)) {
      expect(h.kind).toBe('direct');
      expect(factorOf(h, 'base')).toBeCloseTo(3200, 6); // 2000×1.6（lv10）
    }
    const attach = hits[3];
    expect(attach.skillCode).toBe('langzun.talent');
    expect(attach.kind).toBe('elation');
    expect(factorOf(attach, 'base')).toBeCloseTo(3014.0428, 6); // 7535.107×0.4
    expect(factorOf(attach, 'laugh')).toBeCloseTo(1.3846153846153846, 10); // x=好活20
    // 能量列=隐藏分：**啊哈不在队 → 无升格 150629#2**（不追加 20% 隐藏分）
    // 故进战 20 好活不转化 → 首战技 5、经时刻 +15 → 25、再 +5+15 → 45
    expect(s1.energyAfter).toBe(5);
    expect(skills[1].energyAfter).toBe(25);
    expect(skills[2].energyAfter).toBe(45);
  });

  it('开大链：耗60隐藏分→点08+20→立即行动接强化普攻（裁定2/6/7）', () => {
    const r = simulateBattle(cfg([lz(0)]));
    const ult = r.events.find((e) => e.kind === 'ult' && e.unitId === 'langzun')!;
    expect(noteArr(ult.note)).toEqual(['lzTrace08', 'lzSupreme']);
    expect(ult.energyAfter).toBe(20); // 60−60+20（无升格 → 进战隐藏分比旧锚少 7）
    expect(ult.time).toBeCloseTo(294.11764705882354, 6);
    const next = r.events[r.events.indexOf(ult) + 1];
    expect(next.time).toBe(ult.time); // 立即行动（裁定6）
    expect(hasNote(next, 'lzEnhanced')).toBe(true);
    expect(next.hitSeqs?.length).toBe(112);
    expect(next.energyAfter).toBe(29); // 20 + 3盒×豆3
  });

  it('强化普攻结构：100段+末击=103欢愉段、每33段中插盲盒、欢愉基数×3.36/100（裁定3/5/10）', () => {
    const r = simulateBattle(cfg([lz(0)]));
    const enh = r.events.find((e) => hasNote(e, 'lzEnhanced'))!;
    const hits = enh.hitSeqs!.map((s) => r.hits[s]);
    const own = hits.filter((h) => h.kind === 'elation' && h.skillCode === 'langzun.basic');
    expect(own.length).toBe(103); // 100 弹射 + 3 末击（三桩）
    expect(factorOf(own[0], 'base')).toBeCloseTo(253.1795952, 6); // 7535.107×3.36/100
    expect(factorOf(own[0], 'laugh')).toBeCloseTo(1.2, 10); // 状态内 x=好活10
    expect(factorOf(own[0], 'mirthBonus')).toBeCloseTo(1, 10); // E0 无增笑
    // 末击 140% 三桩均分
    expect(factorOf(own[102], 'base')).toBeCloseTo(3516.3832666666663, 6);
    // 第34段后中插盲盒（100段每33段）
    expect(hits[34].note).toBe('lzBox');
    expect(hits[34].skillCode).toBe('langzun.box');
    // 报告分发：欢愉为主要通道
    expect(r.report.byKind.elation).toBeGreaterThan(r.report.byKind.direct ?? 0);
  });

  it('三次强化普攻后退出状态：E0 隐藏分清零（裁定7）', () => {
    const r = simulateBattle(cfg([lz(0)]));
    const exits = r.events.filter((e) => hasNote(e, 'lzSupremeEnd'));
    expect(exits.length).toBe(6);
    expect(exits[0].time).toBeCloseTo(475.94, 2);
    expect(exits[0].energyAfter).toBe(0);
    for (const e of exits) expect(e.energyAfter).toBe(0);
  });

  it('E1 结界退出保留20%隐藏分', () => {
    const e0 = simulateBattle(cfg([lz(0)]));
    const e1 = simulateBattle(cfg([lz(1)]));
    const exits = e1.events.filter((e) => hasNote(e, 'lzSupremeEnd'));
    expect(exits.length).toBe(7); // 保留使循环更快
    expect(exits[0].energyAfter).toBeCloseTo(7.6, 6); // 38×0.2
    for (const e of exits) expect(e.energyAfter).toBeGreaterThan(0);
    expect(e1.report.totalDamage).not.toBe(e0.report.totalDamage);
  });

  it('E6：进场全属性抗性压降 + 结界内易伤+20% + 强化普攻欢愉增笑50%', () => {
    const r = simulateBattle(cfg([lz(6)]));
    const enh = r.events.find((e) => hasNote(e, 'lzEnhanced'))!;
    const h0 = r.hits[enh.hitSeqs![0]];
    expect(factorOf(h0, 'resist')).toBeCloseTo(1.2, 10); // 抗性0 → 降20%
    expect(factorOf(h0, 'vuln')).toBeCloseTo(1.2, 10); // E1 结界内受伤+20%
    expect(factorOf(h0, 'mirthBonus')).toBeCloseTo(1.5, 10); // E6② 增笑50%
    expect(h0.total).toBeCloseTo(446.62, 2);
    // 状态外：E6① 抗穿常驻生效、E1 易伤不生效
    const sk = r.events.find((e) => e.action === 'skill')!;
    const s0 = r.hits[sk.hitSeqs![0]];
    expect(factorOf(s0, 'resist')).toBeCloseTo(1.2, 10);
    expect(factorOf(s0, 'vuln')).toBeCloseTo(1, 10);
    expect(factorOf(s0, 'base')).toBeCloseTo(3520, 6); // E6≥5 → E3 skill+2
  });

  it('E2 额外回合触发（火花连线新模型：二人队 1 次、三欢愉队 4 次）', () => {
    // 火花开场一回合合并模型改变了笑点流入节奏：二人队现在也会触发（旧口径=0，已随
    // 「火花连线一回合多步」改造重锚，锚点来自 hh-link-dump L1/L1c 段，dump 已删）
    // 2026-11-05：啊哈不在队 → 无升格 150629#2（好活不转隐藏分）→ 二人队 2→1 次、三次时刻整体后移
    const two = simulateBattle(cfg([lz(2), hh()]));
    const twoE2 = two.events.filter((e) => hasNote(e, 'lzE2'));
    expect(twoE2.length).toBe(1);
    expect(twoE2[0].time).toBeCloseTo(1242.24, 1);
    const r = simulateBattle(cfg([lz(2), hh(), yg()]));
    const e2 = r.events.filter((e) => hasNote(e, 'lzE2'));
    // 2026-11-05 重锚：爻光升格同样需啊哈在队 → 她终招不再 +10 笑点 → 三欢愉队 E2 9→4 次
    // 2026-11 重锚（额外回合改「插入回合」用户裁定）：狼尊 E2 额外回合不再重置她的行动值、
    // 也不再递减 buff → 同窗口多做几动、隐藏分攒得更快 → 触发 4→6 次（前三次时刻未变）
    expect(e2.length).toBe(6);
    expect(e2[0].time).toBeCloseTo(372.29, 2);
    expect(e2[1].time).toBeCloseTo(593.47, 2);
    expect(e2[2].time).toBeCloseTo(841.12, 2);
    expect(e2[3].time).toBeCloseTo(1308.41, 2);
    expect(e2[4].time).toBeCloseTo(1780.42, 2);
    expect(e2[5].time).toBeCloseTo(2634.36, 2);
    expect(r.events.filter((e) => e.kind === 'ult' && e.unitId === 'langzun').length).toBe(12);
    const exits = r.events.filter((e) => hasNote(e, 'lzSupremeEnd'));
    expect(exits.length).toBe(12);
    for (const e of exits) expect(Number(e.energyAfter) / 0.2).toBeLessThanOrEqual(300.001); // 上限300
  });

  it('E3/E5 技能等级提高（E5 含 E3 效果，星魂累进）', () => {
    const e0 = simulateBattle(cfg([lz(0)]));
    const e3 = simulateBattle(cfg([lz(3)]));
    const e5 = simulateBattle(cfg([lz(5)]));
    const firstSkill = (r: typeof e0) => {
      const ev = r.events.find((e) => e.action === 'skill')!;
      return ev.hitSeqs!.map((s) => r.hits[s]);
    };
    const [s0, s3, s5] = [firstSkill(e0), firstSkill(e3), firstSkill(e5)];
    expect(factorOf(s0[0], 'base')).toBeCloseTo(3200, 6); // lv10 1.6
    expect(factorOf(s3[0], 'base')).toBeCloseTo(3520, 6); // lv12 1.76（E3 skill+2）
    expect(factorOf(s5[0], 'base')).toBeCloseTo(3520, 6); // E5 不动 skill，但 E3 累进
    expect(factorOf(s0[3], 'base')).toBeCloseTo(3014.0428, 6); // 天赋 lv10 0.4
    expect(factorOf(s3[3], 'base')).toBeCloseTo(3014.0428, 6); // E3 不动天赋
    expect(factorOf(s5[3], 'base')).toBeCloseTo(3315.44708, 6); // E5 talent+2 → 0.44
  });

  it('E4 状态内欢愉段笑点×6', () => {
    const run = (e: number) => {
      const r = simulateBattle(cfg([lz(e)]));
      const sup = r.events.findIndex((ev) => hasNote(ev, 'lzSupreme'));
      const end = r.events.findIndex((ev, i) => i > sup && hasNote(ev, 'lzSupremeEnd'));
      const mom = r.events.slice(sup, end).find((ev) => ev.unitId === 'ahaMoment' && (ev.hitSeqs?.length ?? 0) > 0)!;
      expect(mom.time).toBeCloseTo(392.16, 2);
      return r.hits[mom.hitSeqs![0]];
    };
    const h0 = run(0);
    const h4 = run(4);
    expect(factorOf(h0, 'laugh')).toBeCloseTo(1.238095, 6); // x=12
    expect(factorOf(h4, 'laugh')).toBeCloseTo(2.153846, 6); // x=72=12×6
    // E4≥3 → E3 累进：150621 欢愉技 lv10→11（0.9→0.945）
    expect(factorOf(h0, 'base')).toBeCloseTo(6781.5963, 4);
    expect(factorOf(h4, 'base')).toBeCloseTo(7120.676115, 4);
    expect(h4.total).toBeCloseTo(12840.88, 2);
    expect(h0.total).toBeCloseTo(5858.19, 2);
  });

  it('阿哈时刻参演双形态与备注归位（裁定8）', () => {
    const r = simulateBattle(cfg([lz(0), hh()]));
    const moments = r.events.filter((e) => e.unitId === 'ahaMoment');
    expect(moments.length).toBe(33);
    // 火花连线新模型下笑声流入变化 19→21（hh-link-dump L2 锚点）
    expect(moments.filter((e) => hasNote(e, 'lzElationGain')).length).toBe(21);
    // 状态外参演 = 150620：狼尊不贡献伤害段（时刻事件里的段全来自队友火花）、备注带 lzElationGain
    expect(noteArr(moments[0].note)).toEqual(['ahaMoment', 'lzElationGain']);
    expect(
      (moments[0].hitSeqs ?? []).map((s) => r.hits[s].skillCode).filter((c) => c.startsWith('langzun')),
    ).toEqual([]);
    // 状态内参演 = 150621：6 次弹射欢愉段（时刻段含队友段，按 skillCode 过滤）
    const sup = r.events.findIndex((e) => hasNote(e, 'lzSupreme'));
    const end = r.events.findIndex((e, i) => i > sup && hasNote(e, 'lzSupremeEnd'));
    const firstIn = r.events.slice(sup, end).find(
      (e) => e.unitId === 'ahaMoment' && (e.hitSeqs?.length ?? 0) > 0,
    )!;
    const lzSegs = firstIn.hitSeqs!.map((s) => r.hits[s]).filter((h) => h.skillCode === 'langzun.elation');
    expect(lzSegs.length).toBe(6);
    expect(lzSegs[0].kind).toBe('elation');
    // 备注不再错位到下一行动（原 bug 回归）
    const skills = r.events.filter((e) => e.action === 'skill' && e.unitId === 'langzun');
    expect(hasNote(skills[0], 'lzElationGain')).toBe(false);
  });

  it('盲盒三种效果均出现（裁定4 随机效果）', () => {
    const r = simulateBattle(cfg([lz(0)]));
    const notes = new Set<string>();
    for (const e of r.events) for (const n of noteArr(e.note)) notes.add(n);
    for (const h of r.hits) if (h.note) notes.add(h.note);
    expect(notes.has('lzSword')).toBe(true);
    expect(notes.has('lzBean')).toBe(true);
    expect(notes.has('lzEgg')).toBe(true);
    expect(notes.has('lzBox')).toBe(true); // 命中级备注
  });
});
