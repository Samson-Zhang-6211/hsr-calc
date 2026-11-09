import { describe, expect, it } from 'vitest';
import { applyDamageToMember, computeEnemyDamage } from '../src/enemy-damage.js';

// 裁定口径（2026-10-09）：基础=敌攻×倍率；防御区=(敌lv+20)/[(敌lv+20)+(我方lv+20)×(1−我方减防0)]；
// 抗性区=1、不吃敌方增伤与暴击；减伤区=1−damageReduction。本测试为公式与受击结算的单测（挂点未接）。
describe('computeEnemyDamage（敌方对我方伤害公式，2026-10-09 裁定）', () => {
  it('同等级 + 减伤 20%：连乘 2000×0.5×0.8 = 800', () => {
    const r = computeEnemyDamage({
      attack: 2000,
      multiplier: 1,
      attackerLevel: 80,
      defenderLevel: 80,
      damageReduction: 0.2,
    });
    expect(r.factors.map((f) => f.key)).toEqual(['base', 'defense', 'reduction', 'resist']);
    const base = r.factors[0].value;
    const defense = r.factors[1].value;
    const reduction = r.factors[2].value;
    expect(base).toBe(2000);
    expect(defense).toBeCloseTo(100 / 200, 12); // 同级 = 0.5
    expect(reduction).toBeCloseTo(0.8, 12);
    expect(r.factors[3].value).toBe(1); // 全属性抗性缺省 0 → 抗性区 1
    expect(r.total).toBeCloseTo(800, 8);
    expect(r.total).toBe(
      r.factors.reduce((acc, f) => acc * f.value, 1), // total = 连乘积自洽
    );
  });

  it('攻击方等级高：防御区 110/(110+100)', () => {
    const r = computeEnemyDamage({
      attack: 1000,
      multiplier: 1.5,
      attackerLevel: 90,
      defenderLevel: 80,
    });
    const defense = r.factors[1].value;
    expect(defense).toBeCloseTo(110 / 210, 12);
    expect(r.total).toBeCloseTo(1500 * (110 / 210), 8);
  });

  it('damageReduction 缺省 0 → 减伤区 1；dr=1 → 伤害归 0', () => {
    const noDr = computeEnemyDamage({
      attack: 1000,
      multiplier: 1,
      attackerLevel: 80,
      defenderLevel: 80,
    });
    expect(noDr.factors[2].value).toBe(1);
    // 2026-10-29：全属性抗性（光锥21002）→ 抗性区 = 1 − 抗性
    const res = computeEnemyDamage({
      attack: 1000,
      multiplier: 1,
      attackerLevel: 80,
      defenderLevel: 80,
      resistance: 0.2,
    });
    expect(res.factors[3].value).toBeCloseTo(0.8, 12);
    expect(res.total).toBeCloseTo(500 * 0.8, 8);
    const fullDr = computeEnemyDamage({
      attack: 1000,
      multiplier: 1,
      attackerLevel: 80,
      defenderLevel: 80,
      damageReduction: 1,
    });
    expect(fullDr.total).toBe(0);
  });
});

describe('applyDamageToMember（受击结算：盾优先消耗，2026-10-09 裁定）', () => {
  it('护盾充足：只扣盾，生命与上限不动，dead=false', () => {
    const r = applyDamageToMember({ hp: 5000, maxHp: 10000, shield: 300 }, 200);
    expect(r).toEqual({ hp: 5000, shield: 100, blocked: 200, hpLoss: 0, dead: false });
  });

  it('护盾不足：盾扣光后剩余扣生命', () => {
    const r = applyDamageToMember({ hp: 5000, maxHp: 10000, shield: 300 }, 800);
    expect(r).toEqual({ hp: 4500, shield: 0, blocked: 300, hpLoss: 500, dead: false });
  });

  it('生命归零：dead=true 且 hp 恒为 0（不为负）', () => {
    const r = applyDamageToMember({ hp: 400, maxHp: 10000, shield: 0 }, 800);
    expect(r).toEqual({ hp: 0, shield: 0, blocked: 0, hpLoss: 400, dead: true });
  });

  it('负伤害与负状态防御性 clamp：生命不增，dead=false', () => {
    const r = applyDamageToMember({ hp: -50, maxHp: 10000, shield: -10 }, -300);
    expect(r.hp).toBe(0);
    expect(r.shield).toBe(0);
    expect(r.blocked).toBe(0);
    expect(r.hpLoss).toBe(0);
    expect(r.dead).toBe(true); // 输入生命已 ≤0 → 保持死亡语义
  });

  it('有盾时受击不会误判死亡', () => {
    const r = applyDamageToMember({ hp: 100, maxHp: 10000, shield: 9999 }, 10000);
    expect(r.dead).toBe(false);
    expect(r.hp).toBe(99);
    expect(r.shield).toBe(0);
    expect(r.blocked).toBe(9999);
    expect(r.hpLoss).toBe(1);
  });
});
