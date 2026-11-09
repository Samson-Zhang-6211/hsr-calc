import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, Timeline, type BattleConfig, type CombatMember, type MonsterConfig } from '../src/index.js';

// ── 轮次模式（2026-10 用户裁定：忘却式/异相仲裁式快捷键 + 末日幻影式无轮次）──
// 锚点由 round-mode-dump 临时测试实跑写 %TEMP%/临时目录/round-mode-dump.txt 后据实定锚
//（末批：A/B/C/D/E/F + T1/T2/T3）。

const ALL: Element[] = ['Physical', 'Fire', 'Ice', 'Wind', 'Thunder', 'Quantum', 'Imaginary'];

function members(): CombatMember[] {
  return [
    {
      id: 'jingyuan',
      panel: {
        element: 'Thunder',
        level: 80,
        hp: 10000,
        attack: 2000,
        defence: 1000,
        critRate: 0.05,
        critDmg: 0.5,
        breakEffect: 0,
        damageBonus: 0,
        speed: 135,
        energyRegen: 0,
      },
    },
  ];
}
function monster(): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    resistance: {},
    weaknesses: ALL,
    maxToughness: 9999,
    speed: 100,
    enemyClass: 'normal',
    attack: 0,
  };
}
function run(over: Partial<BattleConfig>) {
  return simulateBattle({ members: members(), monster: monster(), techniques: false, ...over });
}
const roundEvents = (r: ReturnType<typeof run>) => r.events.filter((e) => e.kind === 'round');

describe('轮次模式（忘却式/异相仲裁式/末日幻影式）', () => {
  it('忘却式回归（默认 forgotten）：轮次事件 1@150、2@250 起步，逐轮 +100', () => {
    const a = run({ rounds: 10 });
    const rounds = roundEvents(a);
    expect(rounds.length).toBe(9); // r10 边界触发轮次上限 break（不记录）
    expect(rounds.slice(0, 2).map((e) => `${e.round}@${e.time}`)).toEqual(['1@150', '2@250']);
    expect(a.summary.rounds).toBe(9);
  });

  it('异相仲裁式：首轮边界 300、之后每轮 +100（同机制两参数）', () => {
    const b = run({ rounds: 10, roundMode: 'arbiter' });
    const rounds = roundEvents(b);
    expect(rounds.length).toBe(9);
    expect(rounds.slice(0, 2).map((e) => `${e.round}@${e.time}`)).toEqual(['1@300', '2@400']);
    expect(rounds[rounds.length - 1].time).toBe(1100); // r10@1200 触发上限 break
    expect(b.summary.rounds).toBe(9);
  });

  it('末日幻影式：无轮次边界事件、事件轮次恒 0、rounds:1 配置被忽略（跑过 150 直到 maxTime）', () => {
    const c = run({ rounds: 1, maxTime: 400, roundMode: 'phantom' });
    expect(roundEvents(c).length).toBe(0);
    expect(Math.max(...c.events.map((e) => e.round))).toBe(0);
    expect(c.events[c.events.length - 1].time).toBe(400); // 仅行动值上限收尾
    expect(c.summary.rounds).toBe(0);
    expect(c.victory).toBe(false);
  });

  it('对照：同参忘却式在首轮边界 150 截断（rounds:1 上限 break 不记录轮次事件）', () => {
    const d = run({ rounds: 1, maxTime: 400 });
    expect(roundEvents(d).length).toBe(0);
    expect(d.events[d.events.length - 1].time).toBeCloseTo(148.14814814814815, 6); // 边界 150 前最后行动
    expect(d.events[d.events.length - 1].time).toBeLessThan(150);
  });

  it('末日幻影式缺省 maxTime = 2000', () => {
    const e = run({ rounds: 10, roundMode: 'phantom' });
    expect(e.events[e.events.length - 1].time).toBe(2000);
    expect(roundEvents(e).length).toBe(0);
  });

  it('Timeline 层：firstRoundAv=300 首边界 300、rounds:false 无边界、默认 150', () => {
    const seq = (opts: ConstructorParameters<typeof Timeline>[0]): string[] => {
      const t = new Timeline(opts);
      t.addUnit({ id: 'u1', side: 'ally', speed: 100, order: 0 });
      const out: string[] = [];
      for (let i = 0; i < 4; i++) {
        const ev = t.advance();
        if (!ev) break;
        out.push(`${ev.type}@${ev.time}(r${ev.round})`);
        if (ev.type === 'unitAction') t.finishAction(ev.unitId);
      }
      return out;
    };
    expect(seq({ rounds: true })).toEqual([
      'unitAction@100(r0)',
      'roundBoundary@150(r1)',
      'unitAction@200(r1)',
      'roundBoundary@250(r2)',
    ]);
    expect(seq({ rounds: true, firstRoundAv: 300 })).toEqual([
      'unitAction@100(r0)',
      'unitAction@200(r0)',
      'unitAction@300(r0)',
      'roundBoundary@300(r1)',
    ]);
    expect(seq({ rounds: false })).toEqual([
      'unitAction@100(r0)',
      'unitAction@200(r0)',
      'unitAction@300(r0)',
      'unitAction@400(r0)',
    ]);
  });
});
