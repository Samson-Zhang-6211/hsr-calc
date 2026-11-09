import { describe, expect, it } from 'vitest';
import { createInteractiveBattle, simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig, MonsterId } from '../src/index.js';
import { skillParams } from '../src/combat/skill-data.js';

// 同谐四人（1412 刻律德菈 / 1309 知更鸟 / 1303 阮•梅 / 8005+8006 同谐主）接入验证。
// 锚点由 test/probe-dump.test.ts 实跑定锚（%TEMP%/opencode/probe.txt），勿凭推理改数。
// 逐级技能参数（倍率/增益比例）期望值一律 = skillParams(id, 等级)[i]（默认等级 10）——
// TRACE 常量是 Lmax 冗余值，引擎误用 TRACE 会让这些断言直接失败（回归保护）。

function panel(element: string, speed: number): MemberPanel {
  return {
    element: element as MemberPanel['element'],
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1.0,
    damageBonus: 0,
    speed,
    energyRegen: 0,
  } as MemberPanel;
}

function monster(): MonsterConfig {
  return {
    level: 85,
    hp: 1e9,
    resistance: {},
    weaknesses: ['Wind', 'Physical', 'Ice', 'Imaginary', 'Thunder'],
    maxToughness: 300,
    speed: 100,
    enemyClass: 'elite',
  };
}

function cfg(
  ids: [string, string, number, number][],
  maxTime = 300,
  toughness = 300,
): BattleConfig {
  return {
    members: ids.map(([id, el, spd, eo]) => ({
      id: id as CharId,
      panel: panel(el, spd),
      eidolonLevel: eo,
    })) as CombatMember[],
    monster: { ...monster(), maxToughness: toughness },
    maxTime,
    techniques: true,
  };
}

const noteSet = (r: ReturnType<typeof simulateBattle>): Set<string> =>
  new Set(r.events.flatMap((e) => e.note ?? []));

const hitsOf = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

const factorOf = (h: { factors: { key: string; value: number }[] }, key: string) =>
  h.factors.find((f) => f.key === key)?.value;

/** 事件内伤害段（按 seq 还原） */
const eventHits = (r: ReturnType<typeof simulateBattle>, ev: { hitSeqs?: number[] }) =>
  (ev.hitSeqs ?? [])
    .map((s) => r.hits.find((h) => h.seq === s))
    .filter((h): h is NonNullable<typeof h> => !!h);

describe('同谐四人接入（1412/1309/1303/8005+8006）', () => {
  it('1412 刻律德菈：秘技自动战技→军功→爵位→奇袭→附伤全链', () => {
    const r = simulateBattle(
      cfg([
        ['cerdra', 'Wind', 99, 0],
        ['jingyuan', 'Thunder', 135, 0],
      ], 400),
    );
    const notes = noteSet(r);
    // 秘技自动战技（免耗SP）/ 战技授予军功 / 充能满升爵位 / 终招重置附伤 / 奇袭复制
    expect(notes.has('cdFreeSkill')).toBe(true);
    expect(notes.has('cdSkill')).toBe(true);
    expect(notes.has('cdPeerage')).toBe(true);
    expect(notes.has('cdUlt')).toBe(true);
    expect(notes.has('cdCoup')).toBe(true);
    // 军功附伤段（note 在 hit 上）
    const attach = hitsOf(r, 'cerdra.attach');
    expect(attach.length).toBeGreaterThan(0);
    expect(factorOf(attach[0], 'independent')).toBe(1);
    // 军功 buff（atkFlat 快照 = 刻律德菈 atk × 天赋#2 比例（逐级参数））出现在军功持有者的事件快照里
    const meritEvent = r.events.find((e) =>
      e.buffs?.['jingyuan']?.some((b) => b.labelKey === 'cdMeritAtk'),
    );
    expect(meritEvent).toBeTruthy();
    const merit = meritEvent!.buffs!['jingyuan']!.find((b) => b.labelKey === 'cdMeritAtk')!;
    expect(merit.key).toBe('atkFlat');
    expect(merit.value).toBeCloseTo(3000 * skillParams('141204', 10)[1], 6);
    // 奇袭事件：复制体伤害段 + 附伤并入同一事件
    const coup = r.events.find((e) => (e.note ?? []).includes('cdCoup'))!;
    expect(coup).toBeTruthy();
    const coupHits = eventHits(r, coup);
    expect(coupHits.filter((h) => h.skillCode === 'jingyuan.skill').length).toBeGreaterThan(0);
    expect(coupHits.some((h) => h.skillCode === 'cerdra.attach')).toBe(true);
    // 终招 AoE 段（3 木桩各一段）
    const ult = r.events.find((e) => e.kind === 'ult' && e.unitId === 'cerdra')!;
    expect(ult).toBeTruthy();
    expect(eventHits(r, ult).filter((h) => h.skillCode === 'cerdra.ult').length).toBe(3);
  });

  it('1309 知更鸟：战技全队增伤→协奏（立即行动+附伤固定双暴）', () => {
    const r = simulateBattle(
      cfg([
        ['robin', 'Physical', 102, 0],
        ['jingyuan', 'Thunder', 135, 0],
      ], 420),
    );
    const notes = noteSet(r);
    expect(notes.has('robinSkill')).toBe(true);
    expect(notes.has('rbConcerto')).toBe(true);
    // 天赋全队暴伤是进战 buff（不进 event note）→ 断 buff 快照；值=天赋#1 逐级参数
    const rtEvent = r.events.find((e) =>
      e.buffs?.['jingyuan']?.some((b) => b.labelKey === 'robinTalent'),
    );
    expect(rtEvent).toBeTruthy();
    expect(
      rtEvent!.buffs!['jingyuan']!.find((b) => b.labelKey === 'robinTalent')!.value,
    ).toBeCloseTo(skillParams('130904', 10)[0], 10);
    // 协奏中我方攻击后附伤：暴率/暴伤完全锁死 = 1+1×1.5 = 2.5（不吃天赋暴伤 0.275）
    const attach = hitsOf(r, 'robin.attach');
    expect(attach.length).toBeGreaterThan(0);
    for (const h of attach) {
      expect(factorOf(h, 'crit')).toBeCloseTo(2.5, 10);
      expect(h.kind).toBe('direct');
    }
    // 协奏 buff：全队 atkFlat = 知更鸟面板 atk×终结技#1 + #3（均逐级参数）
    const atkEvent = r.events.find((e) =>
      e.buffs?.['jingyuan']?.some((b) => b.labelKey === 'rbConcertoAtk'),
    );
    expect(atkEvent).toBeTruthy();
    const atk = atkEvent!.buffs!['jingyuan']!.find((b) => b.labelKey === 'rbConcertoAtk')!;
    expect(atk.value).toBeCloseTo(3000 * skillParams('130903', 10)[0] + skillParams('130903', 10)[2], 6);
    // 协奏后景元立即行动（知更鸟退场换倒计时）
    const ultIdx = r.events.findIndex((e) => (e.note ?? []).includes('rbConcerto'));
    expect(r.events[ultIdx + 1]?.unitId).toBe('jingyuan');
    expect(r.events[ultIdx + 1]?.time).toBeCloseTo(r.events[ultIdx].time, 6);
  });

  it('1303 阮•梅：弦外音增伤+击破效率、结界抗穿、残梅绽标记、天赋击破伤', () => {
    const r = simulateBattle(
      cfg([
        ['ruanmei', 'Ice', 104, 0],
        ['jingyuan', 'Thunder', 135, 0],
      ], 400),
    );
    const notes = noteSet(r);
    expect(notes.has('rmSkill')).toBe(true); // 秘技自动战技
    expect(notes.has('ruanmeiSkill') || notes.has('rmOvertone')).toBe(true);
    expect(notes.has('rmZone')).toBe(true);
    expect(notes.has('rmBlossom')).toBe(true);
    // 天赋：我方破韧 → 冰击破伤害段（倍率=天赋#2 逐级参数）
    const talent = hitsOf(r, 'ruanmei.talent');
    expect(talent.length).toBeGreaterThan(0);
    expect(talent[0].kind).toBe('breakTrigger');
    expect(factorOf(talent[0], 'independent')).toBeCloseTo(skillParams('130304', 10)[1], 10);
    // 全队击破特攻 +20%（行迹06，初始面板 1.0 → 1.2）
    const beEvent = r.events.find((e) =>
      e.buffs?.['ruanmei']?.some((b) => b.labelKey === 'traceRmP06'),
    );
    expect(beEvent).toBeTruthy();
    expect(
      beEvent!.buffs!['ruanmei']!.find((b) => b.labelKey === 'traceRmP06')!.value,
    ).toBeCloseTo(0.2, 10);
    // 弦外音增伤（战技全队 damageBonus 40%）出现在景元 buff 快照
    const ov = r.events.find((e) =>
      e.buffs?.['jingyuan']?.some((b) => b.labelKey === 'ruanmeiOvertone' && b.key === 'damageBonus'),
    );
    expect(ov).toBeTruthy();
  });

  it('1303 阮•梅：残梅绽·破韧恢复接口（触发一次击破伤后转真恢复）', () => {
    const b = createInteractiveBattle(
      cfg([
        ['ruanmei', 'Ice', 104, 0],
        ['jingyuan', 'Thunder', 135, 0],
      ], 400),
    );
    // 推进到「结界中标记残梅绽」事件（需要阮梅终结技展开结界 → 手动 requestUlt）
    let st = b.advance();
    let blossom: { hitSeqs?: number[] } | null = null;
    for (let i = 0; i < 900 && st; i++) {
      const ready = st.status.ultReady.includes('ruanmei');
      if (ready) b.requestUlt('ruanmei');
      if (st.type === 'event') {
        const note = (st.event as unknown as { note?: string[] }).note ?? [];
        if (note.includes('rmBlossom')) {
          blossom = st.event as unknown as { hitSeqs?: number[] };
          break;
        }
      }
      st = st.type === 'decision' ? b.advance(ready ? undefined : { action: 'skill' }) : b.advance();
    }
    expect(blossom).toBeTruthy();
    const targets = new Set<MonsterId>(
      (blossom!.hitSeqs ?? [])
        .map((s) => b.hits().find((h) => h.seq === s)?.target)
        .filter((t): t is MonsterId => !!t),
    );
    expect(targets.size).toBeGreaterThan(0);
    // 推进到某个「已标记且已破韧」的目标（恢复尝试只对 broken 生效）
    let brokenId: string | null = null;
    for (let i = 0; i < 800 && st; i++) {
      const idx = st.status.monsters.findIndex((m) => m.broken);
      if (idx >= 0 && targets.has(('monster' + (idx + 1)) as MonsterId)) {
        brokenId = 'monster' + (idx + 1);
        break;
      }
      st = st.type === 'decision' ? b.advance({ action: 'skill' }) : b.advance();
    }
    expect(brokenId).toBeTruthy();
    const before = b.hits().filter((h) => h.skillCode === 'ruanmei.blossom').length;
    b.rmRecoveryAttempt(brokenId! as never);
    const after1 = b.hits().filter((h) => h.skillCode === 'ruanmei.blossom').length;
    b.rmRecoveryAttempt(brokenId! as never);
    const after2 = b.hits().filter((h) => h.skillCode === 'ruanmei.blossom').length;
    expect(before).toBe(0);
    expect(after1).toBe(1); // state1 → 触发 60% 冰击破伤
    expect(after2).toBe(1); // state2 → 真恢复，不再产生伤害
    const hit = b.hits().find((h) => h.skillCode === 'ruanmei.blossom')!;
    expect(hit.kind).toBe('breakTrigger');
    // 残梅绽击破倍率 = 终结技#5 逐级参数（probe 实测 L10 = 0.5）
    expect(factorOf(hit, 'independent')).toBeCloseTo(skillParams('130303', 10)[4], 10);
    expect(factorOf(hit, 'breakEffect')).toBeCloseTo(2.2, 10); // 面板1.0 + 行迹06 0.2
  });

  it('8005/8006 同谐主：战技弹射段数（4次随机，E6 +2=6）+ E1 首次战技回1SP', () => {
    for (const [eo, expectHits] of [
      [0, 5],
      [6, 7],
    ] as const) {
      const r = simulateBattle(
        cfg([
          ['trailblazerShaman', 'Imaginary', 105, eo],
          ['jingyuan', 'Thunder', 135, 0],
        ], 220, 300),
      );
      const ev = r.events.find((e) => (e.note ?? []).includes('tbsSkill'))!;
      expect(ev).toBeTruthy();
      const dmg = eventHits(r, ev).filter(
        (h) => h.skillCode === 'trailblazerShaman.skill' && !h.skillCode.includes('.break'),
      );
      expect(dmg.length).toBe(expectHits);
      // 每段倍率 = 战技#1 逐级参数（默认10；E3 起 skill+2 → 12，勿写死等级）
      const skillLv = eo >= 3 ? 12 : 10;
      for (const h of dmg) expect(factorOf(h, 'base')).toBeCloseTo(3000 * skillParams('800502', skillLv)[0], 6);
      const notes = noteSet(r);
      expect(notes.has('tbsTech')).toBe(true); // 秘技全队击破特攻+30%
      if (eo === 6) expect(notes.has('tbsE1')).toBe(true);
    }
  });

  it('8005 同谐主：伴舞期间攻击破韧目标 → 每次命中追加超击破', () => {
    const r = simulateBattle(
      cfg([
        ['trailblazerShaman', 'Imaginary', 105, 0],
        ['jingyuan', 'Thunder', 135, 0],
      ], 1200, 120),
    );
    const notes = noteSet(r);
    expect(notes.has('tbsDance')).toBe(true);
    const sb = r.hits.filter((h) => h.kind === 'superBreak');
    expect(sb.length).toBeGreaterThan(0);
    expect(sb.some((h) => (h.skillCode ?? '').endsWith('.sb'))).toBe(true);
    // 超击破不吃暴击、不吃常规增伤：base = 击破基数/30 × 削韧点数，且吃到伴舞BE与行迹档位
    const first = sb[0];
    expect(factorOf(first, 'breakEffect')).toBeGreaterThan(1);
    expect(factorOf(first, 'superBreakBonus')).toBeGreaterThan(1);
    expect(factorOf(first, 'weaknessBreakEfficiency')).toBe(1); // 无阮梅效率 buff
  });
});
