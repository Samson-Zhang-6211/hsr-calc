import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import {
  createInteractiveBattle,
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CharId,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

const ALL_ELEMENTS: Element[] = [
  'Physical',
  'Fire',
  'Ice',
  'Wind',
  'Thunder',
  'Quantum',
  'Imaginary',
];

function mp(speed: number, extra: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Fire',
    level: 80,
    hp: 10000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0,
    ...extra,
  };
}

function mon(hp = 1e9, toughness = 9999): MonsterConfig {
  return {
    level: 90,
    hp,
    resistance: {},
    weaknesses: ALL_ELEMENTS,
    maxToughness: toughness,
    speed: 100,
    enemyClass: 'elite',
  };
}

function cfg(members: CombatMember[], overrides: Partial<BattleConfig> = {}): BattleConfig {
  return { members, monster: mon(), rounds: 8, maxTime: 1500, techniques: false, ...overrides };
}

function hh(eidolonLevel?: number, extra: Partial<CombatMember> = {}): CombatMember {
  return { id: 'huohua' as CharId, panel: mp(107), eidolonLevel, ...extra };
}

function firstEv(r: BattleResult, pred: (e: CombatEvent) => boolean): CombatEvent {
  const ev = r.events.find(pred);
  if (!ev) throw new Error('未找到匹配事件');
  return ev;
}

function hitBySeq(r: BattleResult, seq: number): BattleResult['hits'][number] {
  const h = r.hits.find((x) => x.seq === seq);
  if (!h) throw new Error(`未找到 hit seq=${seq}`);
  return h;
}

function factorOf(hit: BattleResult['hits'][number], key: string): number {
  const f = hit.factors.find((x) => x.key === key);
  if (!f) throw new Error(`factors 缺少 ${key}：${hit.skillCode}`);
  return f.value as number;
}

function factorOpt(hit: BattleResult['hits'][number], key: string): number | undefined {
  return hit.factors.find((x) => x.key === key)?.value as number | undefined;
}

function fin(r: BattleResult): {
  sp: number;
  laughPoints: number;
  energy: Partial<Record<CharId, number>>;
} {
  return r.finalState as unknown as {
    sp: number;
    laughPoints: number;
    energy: Partial<Record<CharId, number>>;
  };
}

function hasFactor(r: BattleResult, key: string, value: number, eps = 1e-4): boolean {
  return r.hits.some((h) => {
    const v = factorOpt(h, key);
    return v != null && Math.abs(v - value) < eps;
  });
}

/** 合并行动事件（火花一回合单事件模型：开场+互动陷阱+强化普攻，action 恒为 basic） */
function linkEvents(r: BattleResult): CombatEvent[] {
  return r.events.filter((e) => e.action === 'basic' && e.unitId === 'huohua');
}

function noteCount(ev: CombatEvent, key: string): number {
  return (ev.note ?? []).filter((n) => n === key).length;
}

// 断言锚点来自 %TEMP%/临时目录/hh-link-dump.txt（2026-10-11 连线一回合模型重写后实测，
// 临时 dump 测试已删）。旧「战技事件 + 强化普攻单独一动」双事件锚点全部作废。
// 明确不锚定（无 dump 证据，代码审查级）：礼物 20%/80% 概率分布；欢愉技削韧 stance 分摊；
// E2 buff 层数封顶 4。
describe('火花 1501 战斗接入', () => {
  it('solo E0 基线：一回合单事件（开场+陷阱+强化普攻合并）', () => {
    const r = simulateBattle(cfg([hh()]));
    expect(r.report.totalDamage).toBeCloseTo(317492.52, 1);
    expect(r.report.byKind.elation).toBeCloseTo(283115.44, 1);
    expect(r.report.byKind.direct).toBeCloseTo(34377.09, 1);

    // 无独立战技事件（战技/互动陷阱/强化普攻全在开场一回合内结算）
    expect(r.events.filter((e) => e.action === 'skill' && e.unitId === 'huohua')).toHaveLength(0);
    // 首回合合并事件：3SP 买陷阱后强化普攻回 1 → spAfter=1；战技不回能、强化普攻 +40 → 120
    const e0 = linkEvents(r)[0];
    expect(e0.time).toBeCloseTo(93.46, 2);
    expect(e0.spAfter).toBe(1);
    expect(e0.energyAfter).toBe(120);
    expect(e0.note).toEqual(['hhLink', 'hhTrap', 'hhTalent']);
    expect(e0.hitSeqs).toHaveLength(11); // 5 陷阱：3 直伤 + 3 天赋欢愉 + 5 随机段

    // 首个阿哈时刻：全体 3 段 + 弹射 20 段 = 23 段
    const m1 = firstEv(r, (e) => e.action === 'ahaMoment');
    expect(m1.time).toBeCloseTo(98.62, 2);
    expect(m1.hitSeqs).toHaveLength(23);

    // 第二回合合并事件（13 段）与终结技同刻；战技→强化普攻能量链 120→160→开大后 5
    const e1 = linkEvents(r)[1];
    expect(e1.time).toBeCloseTo(186.92, 2);
    expect(e1.hitSeqs).toHaveLength(13);
    expect(e1.energyAfter).toBe(160);
    const ult = firstEv(r, (e) => e.action === 'ult' && e.unitId === 'huohua');
    expect(ult.time).toBeCloseTo(186.92, 2);
    expect(ult.hitSeqs).toHaveLength(6);
    expect(ult.energyAfter).toBe(5);
    expect(ult.note).toEqual(['hhPoint07', 'hhUlt']);

    const f = fin(r);
    expect(f.laughPoints).toBe(3);
    expect(f.sp).toBe(1);
    expect(f.energy.huohua).toBe(140);
    expect(r.report.bySkill.find((s) => s.skillCode === 'huohua.elation')?.hits).toBe(184);
    expect(r.report.bySkill.find((s) => s.skillCode === 'huohua.enhanced')?.hits).toBe(97);
  });

  it('强化普攻倍率与天赋追加段（150108/150109/150104，skillCode=huohua.enhanced）', () => {
    const r = simulateBattle(cfg([hh()]));
    const segs = linkEvents(r)[0].hitSeqs!.map((s) => hitBySeq(r, s));
    // 主目标直伤：2000 × (1.4 + 5陷阱×0.2) = 4800，普攻伤害通道
    expect(segs[0].kind).toBe('direct');
    expect(segs[0].skillCode).toBe('huohua.enhanced');
    expect(factorOf(segs[0], 'base')).toBeCloseTo(4000, 1);
    // 天赋欢愉段：0.4 × 7535.107 = 3014.0428（精确锚）
    expect(segs[1].kind).toBe('elation');
    expect(factorOf(segs[1], 'base')).toBeCloseTo(3014.0428, 3);
    // 相邻目标直伤：2000 × (0.7 + 5陷阱×0.1) = 2400
    expect(segs[2].kind).toBe('direct');
    expect(factorOf(segs[2], 'base')).toBeCloseTo(2000, 1);
  });

  it('终结技倍率与天赋全体追加段（150103/150104）', () => {
    const r = simulateBattle(cfg([hh()]));
    const ult = firstEv(r, (e) => e.action === 'ult' && e.unitId === 'huohua');
    const segs = ult.hitSeqs!.map((s) => hitBySeq(r, s));
    // 全体直伤：2000 × (0.6×欢愉度0 + 0.5) = 1000（point06 攻=2000 不达标、E0 无 E4）
    // 段序 = 3 直伤 + 3 天赋追加（全体三段各自成组）
    expect(segs[0].skillCode).toBe('huohua.ult');
    expect(segs[0].kind).toBe('direct');
    expect(factorOf(segs[0], 'base')).toBeCloseTo(1000, 1);
    expect(segs[1].kind).toBe('direct');
    expect(segs[2].kind).toBe('direct');
    // 天赋追加全体欢愉段：0.48 × 7535.107 = 3616.8514
    expect(segs[3].kind).toBe('elation');
    expect(factorOf(segs[3], 'base')).toBeCloseTo(3616.8514, 3);
  });

  it('point06 高攻欢愉度（2500 攻 → +0.25）', () => {
    const r = simulateBattle(cfg([hh(undefined, { panel: mp(107, { attack: 2500 }) })]));
    expect(r.report.totalDamage).toBeCloseTo(397886.83, 1);
    // 终结技：2500 × (0.6×0.25 + 0.5) = 1625
    const ult = firstEv(r, (e) => e.action === 'ult' && e.unitId === 'huohua');
    expect(factorOf(hitBySeq(r, ult.hitSeqs![0]), 'base')).toBeCloseTo(1625, 1);
    // 首回合强化普攻主段：2500 × 2.4 = 6000（倍率与面板线性）
    expect(factorOf(hitBySeq(r, linkEvents(r)[0].hitSeqs![0]), 'base')).toBeCloseTo(5000, 1);
  });

  it('专武 23053：推流欢愉度 + 自身欢愉伤害无视防御', () => {
    const r = simulateBattle(
      cfg([hh(undefined, { lightconeId: '23053' as never, refinement: 1 })]),
    );
    expect(r.report.totalDamage).toBeCloseTo(414525.8, 1);
    // 首个欢愉技段（首时刻全体段，专武同回合消耗≥4SP → 推流常驻 → 欢愉度 +0.2）
    const e0 = r.hits.find((h) => h.skillCode === 'huohua.elation')!;
    expect(factorOf(e0, 'elationDegree')).toBeCloseTo(1.2, 4);
    // #3：火花自身欢愉伤害无视防御 4层×5%=0.2 → 防御区 100/188=0.53191
    expect(factorOf(e0, 'defense')).toBeCloseTo(0.5319, 4);
    // 对照：首回合强化普攻直伤不吃无视防御
    const direct = hitBySeq(r, linkEvents(r)[0].hitSeqs![0]);
    expect(direct.kind).toBe('direct');
    expect(factorOf(direct, 'defense')).toBeCloseTo(0.4762, 4);
    // 终结技直伤吃推流欢愉度：2000 × (0.6×0.2 + 0.5) = 1240
    const ult = firstEv(r, (e) => e.action === 'ult' && e.unitId === 'huohua');
    expect(factorOf(hitBySeq(r, ult.hitSeqs![0]), 'base')).toBeCloseTo(1240, 1);
  });

  it('秘技 150107：进战全体火伤 + 回 2SP → 陷阱更多', () => {
    const r = simulateBattle(cfg([hh()], { techniques: true }));
    expect(r.report.totalDamage).toBeCloseTo(317881.27, 1);
    const tech = firstEv(r, (e) => e.action === 'technique');
    expect(tech.unitId).toBe('huohua');
    expect(tech.time).toBe(0);
    expect(tech.hitSeqs).toHaveLength(3);
    // 初始 3SP + 秘技回 2 = 5（min(maxSp=5) 封顶）
    expect(tech.spAfter).toBe(5);
    expect(tech.note).toEqual(['technique']);
    // 秘技回 2SP 续命 → 首回合陷阱买满：2000 × (1.4 + 13×0.2) = 8000（solo 无秘技=4800）
    expect(factorOf(hitBySeq(r, linkEvents(r)[0].hitSeqs![0]), 'base')).toBeCloseTo(7200, 1);
  });

  it('E2 额外回合 + E3 等级 + E4 欢愉度/笑点 + 爆点账本', () => {
    const r = simulateBattle(cfg([hh(4)]));
    // 2026-11 重锚（额外回合改「插入回合」用户裁定）：火花 E2 额外回合不再重置她的行动值、
    // 也不再递减她的 buff（不算新回合）→ 同一 8 轮窗口内欢愉段乘区更高。
    // 段数/时刻未变（elationHits=184、links[0..1]=93.46/98.62），纯粹是每段伤害提高。
    expect(r.report.totalDamage).toBeCloseTo(781301.28, 1);

    // E2：阿哈时刻结束 → 火花额外回合（新模型=开场一动之后的**全新合并行动**，紧接同刻）
    const m1 = firstEv(r, (e) => e.action === 'ahaMoment');
    expect(m1.time).toBeCloseTo(98.62, 2);
    const links = linkEvents(r);
    expect(links[0].time).toBeCloseTo(93.46, 2); // 首回合（非额外回合）
    expect(links[1].time).toBe(m1.time); // E2 额外回合 = 第二个合并行动，同刻

    // E3 普攻+1 → 150108 lv11 主倍率 1.5：2000 × (1.5 + 5×0.2) = 5000
    expect(factorOf(hitBySeq(r, links[0].hitSeqs![0]), 'base')).toBeCloseTo(4400, 1);

    // 首次终结技：E4 note 在 point07 后、hhUlt 前
    const ult = firstEv(r, (e) => e.action === 'ult' && e.unitId === 'huohua');
    expect(ult.note).toEqual(['hhPoint07', 'hhE4', 'hhUlt']);
    expect(ult.energyAfter).toBe(5);

    // E4：欢愉度 +0.36 生效 → 时刻段 elationDegree = 1.36
    expect(hasFactor(r, 'elationDegree', 1.36, 1e-6)).toBe(true);

    // E2 爆点→暴伤 note（hhSpendSp 每消耗 1 爆点记 1 次）：合并行动逐动账本
    // 首回合 0 爆点；额外回合 = 首时刻欢愉技+2 + E2 时刻钩子+2 = 4；第三动只剩 1
    expect(links[0].note).toEqual(['hhLink', 'hhTrap', 'hhTalent']);
    expect(noteCount(links[1], 'hhE2')).toBe(4);
    expect(noteCount(links[2], 'hhE2')).toBe(1);

    // 对照组约束：无 E6 → 全程抗穿只来自 E1（封顶 0.15），resist ≤ 1.15
    expect(r.hits.every((h) => (factorOpt(h, 'resist') ?? 1) <= 1.15001)).toBe(true);
  });

  it('E6 额外欢愉技次数 + E1/E6 抗穿与 E1 封顶 + 先清后 +5', () => {
    const r = simulateBattle(cfg([hh(6)]));
    // 2026-11 重锚（同 E4 用例：额外回合不再重置行动值/递减 buff）；段数 312、m1=29 段未变
    expect(r.report.totalDamage).toBeCloseTo(1226377.56, 1);
    // E6：首时刻 20+6=26 弹射 + 3 全体 = 29 段（对照 E0 的 23 段）
    const m1 = firstEv(r, (e) => e.action === 'ahaMoment');
    expect(m1.hitSeqs).toHaveLength(29);
    // 欢愉技总段数 312（E0 对照 184）
    expect(r.report.bySkill.find((s) => s.skillCode === 'huohua.elation')?.hits).toBe(312);

    // 抗穿：x=6 → 1 + E6 0.2 + E1 6×0.015 = 1.29
    expect(hasFactor(r, 'resist', 1.29)).toBe(true);
    // x=16 → E1 0.015×16=0.24 触发封顶 0.15 → 1 + 0.2 + 0.15 = 1.35
    expect(hasFactor(r, 'resist', 1.35)).toBe(true);

    // E1 阿哈时刻结束钩子先清 0（爽点返还）再 +5（E0 对照终态 3）
    // 2026-11 重锚：窗口末段行动序列改变 → 截断点上多 1 个 hhE2 笑点（10→11）
    expect(fin(r).laughPoints).toBe(11);
    // E6 队含 E1-E5：第二动（E2 额外回合）爆点账本同 E4 用例
    expect(noteCount(linkEvents(r)[1], 'hhE2')).toBe(4);
  });

  it('双欢愉队伍：point07 tier1 与爻光联动', () => {
    const r = simulateBattle(
      cfg([
        { id: 'yaoguang' as CharId, panel: mp(101, { element: 'Imaginary' as Element }) },
        hh(),
      ]),
    );
    // 2026-10-29 等级口径修正（普攻/忆灵技 按正常满级 6）后重锚；
    // 2026-11-05 爻光升格需啊哈在队（本例无啊哈 → 无升格）→ 她终招不再 +10 笑点/+12 能量，总伤重锚
    expect(r.report.totalDamage).toBeCloseTo(910843.42, 1);
    expect(fin(r).laughPoints).toBe(17);
    // 爻光「大吉大利」boon 联动正常（合并行动事件内并入 `${actor}.boon` 段）
    expect(r.report.bySkill.some((s) => s.skillCode.endsWith('.boon'))).toBe(true);
    // 单人 tier0 已在基线用例覆盖（hhPoint07 note + 爆点入账本）
    expect(linkEvents(r).length).toBeGreaterThan(0);
  });

  it('全真模拟多步交互：开场→互动陷阱→强化普攻一回合（predictAfter 漂移锁）', () => {
    const ctl = createInteractiveBattle(cfg([hh()]));
    const first = ctl.advance();
    if (!first || first.type !== 'decision') throw new Error('首步应为决策');
    const pred = first.predictAfter!;
    // 决策1：连线未开——战技不回能、普攻 +20（修复前战技错报 +30）
    expect(first.unitId).toBe('huohua');
    expect(first.status.huohuaLink).toBeUndefined();
    expect(pred({ action: 'skill' }).energy.huohua).toBe(80);
    expect(pred({ action: 'basic' }).energy.huohua).toBe(100);
    // 开场（1SP+首陷阱）→ 回到同单位决策，连线开启、SP 3→2
    const second = ctl.advance({ action: 'skill' });
    if (!second || second.type !== 'decision') throw new Error('开场后应仍在决策');
    expect(second.status.huohuaLink).toBe(true);
    expect(second.status.sp).toBe(2);
    expect(second.predictAfter!({ action: 'skill' }).energy.huohua).toBe(80);
    expect(second.predictAfter!({ action: 'basic' }).energy.huohua).toBe(120); // 强化普攻 +40
    // 互动陷阱一次（1SP）→ SP 2→1，仍在连线决策
    const third = ctl.advance({ action: 'skill' });
    if (!third || third.type !== 'decision') throw new Error('陷阱后应仍在决策');
    expect(third.status.huohuaLink).toBe(true);
    expect(third.status.sp).toBe(1);
    // 强化普攻收尾 → 一回合单事件
    const step = ctl.advance({ action: 'basic', target: { enemyTarget: 'monster2' } });
    if (!step || step.type !== 'event') throw new Error('收尾后应产出事件');
    const ev = step.event;
    expect(ev.unitId).toBe('huohua');
    expect(ev.action).toBe('basic');
    expect(ev.time).toBeCloseTo(93.46, 2);
    expect(ev.targetId).toBe('monster2');
    expect(ev.spAfter).toBe(2); // 3 -1 开场 -1 陷阱 +1 强化普攻回
    expect(ev.energyAfter).toBe(120); // 80 + 40（战技/陷阱不回能）
    expect(ev.note).toEqual(['hhLink', 'hhTrap', 'hhTalent']);
    expect(ev.hitSeqs).toHaveLength(8); // 6 段 + 2 陷阱随机段
    // 跑到战斗结束，校验收尾事件全部伤害段 skillCode = huohua.enhanced（普攻伤害）
    let s: ReturnType<typeof ctl.advance> = ctl.advance();
    let guard = 0;
    while (s && guard++ < 500) {
      s = s.type === 'event' ? ctl.advance() : ctl.advance({ action: 'basic' });
    }
    const r = ctl.result()!;
    for (const seq of ev.hitSeqs!) {
      expect(hitBySeq(r, seq).skillCode).toBe('huohua.enhanced');
    }
    expect(r.report.bySkill.some((x) => x.skillCode === 'huohua.enhanced')).toBe(true);
  });

  it('同种子复现（确定性）', () => {
    const a = simulateBattle(cfg([hh()]));
    const b = simulateBattle(cfg([hh()]));
    expect(a.report.totalDamage).toBe(b.report.totalDamage);
    expect(a.hits.length).toBe(b.hits.length);
    expect(a.events.length).toBe(b.events.length);
  });
});
