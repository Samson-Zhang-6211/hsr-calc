import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type CombatEvent, type CombatMember, type MemberPanel, type MonsterConfig } from '../src/index.js';

// ── 可可利亚技能脚本（2026-10-09，用户裁定③「数据表+战斗挂点」+ 三项实施裁定：
//    AI 等概率随机 / 单体随机存活成员 / PhaseList 全部可用）──
// 倍率来源：Dimbreath/turnbasedgamedata ExcelOutput/MonsterSkillConfig.json（GitLab 62701613）。
// 锚点由 enemy-attack-dump 临时测试实跑写 %TEMP%/opencode/enemy-attack-dump.txt 后据实定锚。

const ALL: Element[] = ['Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary'];

function panel(element: Element, speed: number, energyRegen: number): MemberPanel {
  return {
    element,
    level: 80,
    hp: 10000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen,
  };
}
function members(): CombatMember[] {
  return [
    { id: 'qingge', panel: panel('Wind', 156, 0.194) },
    { id: 'sunday', panel: panel('Imaginary', 134, 0.194) },
    { id: 'jingyuan', panel: panel('Thunder', 135, 0) },
    { id: 'tenghuang', panel: panel('Physical', 134, 0.194) },
  ];
}
const ORDER = ['qingge', 'sunday', 'jingyuan', 'tenghuang'];

/** 可可利亚 config：hp/韧性拉满、锁定 seed（BattleConfig 缺省 seed 即固定值，跑两次结果一致） */
function cfg(attack: number, withSkill = true): BattleConfig {
  const monster: MonsterConfig = {
    level: 90,
    hp: 1e9,
    resistance: {},
    weaknesses: ALL,
    maxToughness: 9999,
    speed: 100,
    enemyClass: 'elite',
    attack,
    ...(withSkill ? { monsterId: '1004011' } : {}),
  };
  return { members: members(), monster, techniques: false, rounds: 10, maxTime: 1500 };
}

const enemyEvents = (events: CombatEvent[]): CombatEvent[] => events.filter((e) => e.enemyHits);

describe('可可利亚敌方出手（ENEMY_SKILLS 挂点）', () => {
  it('伤害公式：单体225%/扩散375%×防御区(110/210)，盾优先吸收', () => {
    const r = simulateBattle(cfg(2000));
    const evs = enemyEvents(r.events);
    expect(evs.length).toBeGreaterThan(0);

    // 首事件（固定种子）：monster1 扩散 100401106 = 2000×3.75×(110/210) = 3928.5714…
    const first = evs[0];
    expect(first.skillCode).toBe('monster.100401106');
    expect(first.action).toBe('monster');
    expect(first.enemyHits!.length).toBe(3);
    // 防御区：攻90守80 → (90+20)/[(90+20)+(80+20)] = 110/210
    for (const h of first.enemyHits!) {
      expect(h.damage).toBeCloseTo(2000 * 3.75 * (110 / 210), 6); // 3928.571428…
      expect(h.blocked).toBe(800); // 腾荒战技盾（lv10=800）优先吸收
      expect(h.hpLoss).toBeCloseTo(h.damage - 800, 6);
      expect(h.dead).toBe(false);
      expect(h.skillId).toBe('100401106');
    }

    // 单体 100401101 = 2000×2.25×110/210 = 2357.142857…
    const single = evs.find((e) => e.skillCode === 'monster.100401101');
    expect(single).toBeDefined();
    const sh = single!.enemyHits!;
    expect(sh.length).toBe(1);
    expect(sh[0].damage).toBeCloseTo(2000 * 2.25 * (110 / 210), 6); // 2357.142857…
    expect(single!.targetId).toBe(sh[0].targetId);
  });

  it('目标规则：单体1目标、全体=当时存活全员、扩散=编队顺序链相邻、死亡后不再被选', () => {
    const r = simulateBattle(cfg(2000));
    const evs = enemyEvents(r.events);
    const deadAt = new Map<string, number>();
    for (const ev of evs) {
      const living = ORDER.filter((id) => !deadAt.has(id));
      if (!deadAt.has('memo')) living.push('memo'); // 晴空乐手进受击池（2026-10-24 完整链裁定）
      const hits = ev.enemyHits!;
      const skill = ev.skillCode!.slice('monster.'.length);
      // 目标 ⊆ 当时存活
      for (const h of hits) {
        expect(living).toContain(h.targetId);
        if (h.dead) deadAt.set(h.targetId, ev.time);
      }
      if (skill === '100401103') {
        // 全体：覆盖当时全部存活（成员 + 忆灵）
        expect(new Set(hits.map((h) => h.targetId)).size).toBe(hits.length);
        if (living.length === 5) expect(hits.length).toBe(5);
        else if (living.length === 4) expect(hits.length).toBe(4);
      } else if (skill === '100401106') {
        // 扩散：主目标 + 编队顺序链相邻（按当时存活链取相邻，死亡不占位）
        expect(hits.length).toBeGreaterThanOrEqual(2);
        const idxs = hits.map((h) => living.indexOf(h.targetId)).sort((a, b) => a - b);
        expect(idxs[1] - idxs[0]).toBe(1);
        if (idxs.length === 3) expect(idxs[2] - idxs[1]).toBe(1);
        expect(ev.targetId).toBe(hits[0].targetId); // 扩散主目标 = targetId 字段
      } else {
        // 单体（101/104）
        expect(hits.length).toBe(1);
      }
    }
    // 锚点（固定种子，2026-10-24 忆灵进池重锚）：腾荒 t=200 阵亡、景元 t=300 阵亡；
    // 阵亡后（含同刻死点之后）不再被敌方选中
    expect(deadAt.get('tenghuang')).toBe(200);
    expect(deadAt.get('jingyuan')).toBe(300);
    for (const ev of evs.filter((e) => e.time > 200)) {
      expect(ev.enemyHits!.some((h) => h.targetId === 'tenghuang')).toBe(false);
    }
    // 阵亡后不再行动（同刻 t=200 允许：先后由同刻排序决定，仅排除之后）
    const tfActs = r.events.filter((e) => e.kind === 'action' && e.unitId === 'tenghuang');
    expect(tfActs.every((e) => e.time <= 200)).toBe(true);
  });

  it('全员阵亡 → 战败提前结束（t=100 即止，不跑满 maxTime；受击池含忆灵）', () => {
    const r = simulateBattle(cfg(1e9));
    expect(r.victory).toBe(false);
    expect(r.summary.totalTime).toBe(100); // 锚点：t=100 三只怪相继出手全灭即止
    for (const hp of Object.values(r.finalState.memberHp)) expect(hp).toBe(0);
    for (const s of Object.values(r.finalState.memberShield)) expect(s).toBe(0);
    // 第三只怪补刀最后存活的晴歌（memo 进受击池 → 主目标抽样改变）
    const acts = r.events.filter((e) => e.kind === 'action' && e.unitId === 'monster3');
    expect(acts.length).toBe(1);
    // 致死 hit 记录（4 成员 + 晴空乐手 memo）
    const deathHits = r.events.flatMap((e) => e.enemyHits ?? []).filter((h) => h.dead);
    expect(deathHits.length).toBe(5);
    expect(deathHits.map((h) => h.targetId)).toContain('memo');
    expect(deathHits.every((h) => h.hpLoss > 0)).toBe(true);
  });

  it('无技能表 / 攻击为 0 → 不反击（零回归口径）', () => {
    const noTable = simulateBattle(cfg(2000, false));
    expect(enemyEvents(noTable.events).length).toBe(0);
    expect(noTable.finalState.memberHp.qingge).toBe(10000);

    const noAttack = simulateBattle(cfg(0));
    expect(enemyEvents(noAttack.events).length).toBe(0);
    expect(noAttack.finalState.memberHp.qingge).toBe(10000);
  });

  it('同种子两次运行结果完全一致（等概率随机走种子 PRNG）', () => {
    const a = simulateBattle(cfg(2000));
    const b = simulateBattle(cfg(2000));
    const sig = (r: typeof a): string =>
      enemyEvents(r.events)
        .map((e) => `${e.time.toFixed(3)}:${e.skillCode}:${(e.enemyHits ?? []).map((h) => h.targetId).join(',')}`)
        .join('|');
    expect(sig(a)).toBe(sig(b));
    expect(sig(a).length).toBeGreaterThan(0);
  });
});
