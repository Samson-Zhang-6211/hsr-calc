import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 132「叩问天工的名冶」四件套（2026-11-02 round 55 补）
 *
 * 条款（`data/relicsets/132.json` → `require_num['4'].param_list = [0.28, 2, 0.15]`）：
 * ① 装备者对**防御力被降低**的敌方目标造成的暴击伤害 +28%；
 * ② 装备者对敌方施加防御力降低后 → 我方全体获得【助燃】2 回合（不可叠加），
 *    持【助燃】者造成的伤害 +15%；「施放攻击后可再次触发」= 每次成功上降防都重挂（同实例覆盖刷新）。
 *
 * 落点：① 在 `dealAttack` 的暴击区（`critLocked` 保护内），判定用现成 `lcHasDefDown(mon)`
 * （= `buffSum(mon.buffs,'defReduction') > 0`）；② 挂在怪侧 buff 唯一入口 `lcMonsterBuff`，
 * 当 `key === 'defReduction'` 时按 source 的四件套判定给全队挂 `damageBonus`。
 *
 * ⚠ TDZ 教训：`RS132_*` 常量必须放在 battleSteps **早期执行段**（约 5370 一带）；
 * 放在遗器常量块（约 26930）会崩 —— `lcMonsterBuff` 在开战初始化（hysilensOpenField 等）
 * 就会被调用，而那段代码的执行顺序早于 26930。
 *
 * dump 锚点（8 回合 / 三名会挂降防的装备者）：
 * 装 132 时出现 `relic132` 事件 54~61 次、不装时 0 次；
 * 暴击因子均值 1.02500 → 1.03122/1.03043/1.03351（只有打在降防目标上的段才 +0.05×0.28）。
 */

const mon = {
  level: 90,
  hp: 12_000_000,
  maxHp: 12_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: ['Wind', 'Ice', 'Quantum', 'Fire', 'Physical'] as Element[],
};

const card = (el: Element, speed: number) => ({
  level: 80,
  hp: 8000,
  attack: 1200,
  defence: 900,
  speed,
  critRate: 0.05,
  critDmg: 0.5,
  energyRegen: 0.6,
  element: el,
  damageBonus: 0,
  breakEffect: 0,
});

const cfg = (relic: string | undefined, caster: string): BattleConfig =>
  ({
    rounds: 8,
    maxTime: 1200,
    techniques: false,
    members: [
      { id: caster, panel: card('Ice', 120), eidolonLevel: 0, relicsetId: relic },
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const run = (relic: string | undefined, caster: string) => {
  const rep = simulateBattleReplay(cfg(relic, caster));
  const crits: number[] = [];
  let buffEvents = 0;
  let buffValue = 0;
  for (const st of rep.steps) {
    for (const seq of st.event.hitSeqs ?? []) {
      const h = (rep.result as unknown as { hits?: { seq: number; kind?: string; factors: { key: string; value: number }[] }[] }).hits?.find(
        (x) => x.seq === seq,
      );
      if (!h || h.kind !== 'direct') continue;
      const c = h.factors.find((f) => f.key === 'crit')?.value;
      if (typeof c === 'number') crits.push(c);
    }
    const b = st.event.buffs as unknown as Record<string, { labelKey?: string; value: number }[]> | undefined;
    for (const arr of Object.values(b ?? {})) {
      for (const inst of arr) {
        if (inst.labelKey === 'relic132') {
          buffEvents += 1;
          buffValue = inst.value;
        }
      }
    }
  }
  return { maxCrit: Math.max(...crits), buffEvents, buffValue };
};

describe('遗器 132 叩问天工的名冶 4pc', () => {
  it('对降防目标暴伤 +28%；施加降防后全队【助燃】+15% 增伤', () => {
    const bare = run(undefined, 'pela');
    const withR = run('132', 'pela');
    // ① 暴伤：暴击因子 = 1 + 暴率×暴伤，暴率 0.05 → 差 0.05×0.28 = 0.014
    expect(withR.maxCrit - bare.maxCrit).toBeCloseTo(0.014, 6);
    // ② 助燃：全队 damageBonus +15%，只在装备时出现
    expect(bare.buffEvents).toBe(0);
    expect(withR.buffEvents).toBeGreaterThan(0);
    expect(withR.buffValue).toBeCloseTo(0.15, 10);
  }, 600_000);
});
