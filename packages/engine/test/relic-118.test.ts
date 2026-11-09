import { describe, expect, it } from 'vitest';
import type { Element } from '@hsr-calc/shared';
import { simulateBattleReplay, type BattleConfig } from '../src/index.js';

/**
 * 遗器 118「机心戏梦的钟表匠」四件套（2026-11-02 round 58，按用户裁定走方案 A）
 *
 * 条款（`data/relicsets/118.json` → `require_num['4'].param_list = [0.3, 2]`）：
 * 当装备者**对我方目标施放终结技**时，我方全体击破特攻提高 30%，持续 2 回合，该效果无法叠加。
 *
 * **用户裁定（2026-11-02）**：走方案 A「终结技期间的中央钩」，不列辅助角色名册。
 * 实现落在 `resolveAlly`（我方单体目标唯一解析器）：`castingUlt && spActor && out !== spActor`
 * 即「终结技指向**其他**我方目标」→ `relic118OnAllyUlt(spActor)` 给 `allHolders()` 挂 `breakEffect`。
 *
 * ⚠ 已知边界（方案 A 的固有代价）：**不经过 `resolveAlly` 的终结技**（如知更鸟/布洛妮娅那种
 * 全队增益或自身强化型终结技、以及纯伤害型）不会触发 —— dump 实测：停云 85 次、星期日 108 次事件；
 * 布洛妮娅/知更鸟/火花 0 次。要覆盖它们必须改成「逐角色名册」方案 B，本轮按裁定只做 A。
 */

const mon = {
  level: 90,
  hp: 20_000_000,
  maxHp: 20_000_000,
  maxToughness: 9999,
  enemyClass: 'elite' as const,
  attack: 0,
  speed: 90,
  resistance: {} as Record<string, number>,
  weaknesses: ['Ice', 'Quantum', 'Wind', 'Fire'] as Element[],
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
    maxTime: 1400,
    techniques: false,
    members: [
      { id: caster, panel: card('Ice', 140), eidolonLevel: 0, relicsetId: relic },
      { id: 'seele', panel: card('Quantum', 150), eidolonLevel: 0 },
    ],
    monster: { ...mon },
    mainC: 'seele',
    seed: 20261011,
  }) as unknown as BattleConfig;

const breakEffectBuff = (relic: string | undefined, caster: string) => {
  const rep = simulateBattleReplay(cfg(relic, caster));
  let events = 0;
  let value = 0;
  for (const st of rep.steps) {
    const b = st.event.buffs as unknown as Record<string, { labelKey?: string; value: number }[]> | undefined;
    for (const arr of Object.values(b ?? {})) {
      for (const inst of arr) {
        if (inst.labelKey !== 'relic118') continue;
        events += 1;
        value = inst.value;
      }
    }
  }
  return { events, value };
};

describe('遗器 118 机心戏梦的钟表匠 4pc', () => {
  it('终结技指向队友 → 全队击破特攻 +30%（2 回合、不叠加）', () => {
    // 停云/星期日的终结技会指向其他我方目标 → 两条独立证据
    for (const caster of ['tingyun', 'sunday']) {
      const on = breakEffectBuff('118', caster);
      expect(on.events).toBeGreaterThan(0);
      expect(on.value).toBeCloseTo(0.3, 10);
      expect(breakEffectBuff(undefined, caster)).toEqual({ events: 0, value: 0 });
    }
  }, 600_000);
});
