/**
 * 战斗事件的小工具（2026-10-30 第五十二轮）。
 *
 * 只做「这条事件要不要显示」的判断，**不参与任何战斗数值**。
 */

/** 判定用的事件形状（只取用到的字段，避免 import 引擎类型造成循环依赖） */
interface EventLike {
  kind?: string;
  action?: string;
  skillCode?: string;
  enemyHits?: unknown[];
  note?: string[];
}

/**
 * 「空敌方行动」= 引擎记了一条 `action:'monster'` 事件，但**没有技能名、没有敌方伤害、没有 note**。
 *
 * 产生原因：怪已死 / 被控到没有可放技能 / 只是跳过回合时，`monsterTurn` 依然会跑完回合开始的
 * DoT、阶段、计数等 tick，于是照常 record 一条事件。事件流是公开契约（既有用例按敌方行动条数定锚），
 * 所以**引擎不改**，只在明细表渲染时把它过滤掉——否则波次战斗里每只先死的怪都会留下几行脏数据。
 */
export function isEmptyMonsterTurn(ev: EventLike): boolean {
  if (ev.kind !== 'action' || ev.action !== 'monster') return false;
  if (ev.skillCode) return false;
  if ((ev.enemyHits?.length ?? 0) > 0) return false;
  if ((ev.note?.length ?? 0) > 0) return false;
  return true;
}
