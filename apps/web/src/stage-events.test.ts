import { describe, expect, it } from 'vitest';
import { isEmptyMonsterTurn } from './stage-events.js';

/**
 * 「空敌方行动」判定（2026-10-30 第五十二轮）。
 *
 * 引擎契约：怪已死 / 无技能可放 / 只是跳过时**仍然记一条 `action:'monster'` 事件**（既有大量用例按敌方
 * 行动条数定锚，不能改事件流）。这类事件没有技能名、没有伤害、没有 note，在明细表里就是一行脏数据。
 * 本模块只负责「渲染层要不要显示它」，不参与任何战斗数值。
 */

describe('空敌方行动判定', () => {
  it('无技能 + 无敌方伤害 + 无 note 的 monster 事件 = 空行动', () => {
    expect(isEmptyMonsterTurn({ kind: 'action', action: 'monster' })).toBe(true);
    // enemyHits 为空数组也算空（引擎在无命中时可能给 []）
    expect(isEmptyMonsterTurn({ kind: 'action', action: 'monster', enemyHits: [] })).toBe(true);
    expect(isEmptyMonsterTurn({ kind: 'action', action: 'monster', note: [] })).toBe(true);
  });

  it('有技能 / 有伤害 / 有 note 的一律不算空（冻结跳过、DoT 跳伤都要显示）', () => {
    expect(isEmptyMonsterTurn({ kind: 'action', action: 'monster', skillCode: 'monster.201302001' })).toBe(false);
    expect(
      isEmptyMonsterTurn({
        kind: 'action',
        action: 'monster',
        enemyHits: [{ targetId: 'feixiao', damage: 123, blocked: 0, dead: false }],
      }),
    ).toBe(false);
    expect(isEmptyMonsterTurn({ kind: 'action', action: 'monster', note: ['enemyFreezeSkip'] })).toBe(false);
  });

  it('非敌方行动的事件永远不算空（我方行动、波次、轮次边界）', () => {
    expect(isEmptyMonsterTurn({ kind: 'action', action: 'skill', skillCode: 'huohua.skill' })).toBe(false);
    expect(isEmptyMonsterTurn({ kind: 'action', action: 'basic' })).toBe(false);
    expect(isEmptyMonsterTurn({ kind: 'wave' })).toBe(false);
    expect(isEmptyMonsterTurn({ kind: 'round' })).toBe(false);
    expect(isEmptyMonsterTurn({ kind: 'break' })).toBe(false);
  });
});
