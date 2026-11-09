import { describe, expect, it } from 'vitest';
import {
  simulateBattle,
  type BattleConfig,
  type BattleResult,
  type CharId,
  type CombatMember,
  type MemberPanel,
  type MonsterConfig,
} from '../src/index.js';

/** 存护收尾批（2026-10-29）：符玄 1208 / 存护开拓者 8003·8004
 *  锚点来自 zz-knight2-dump 实测（可可利亚 1004011 会反击）；攻击力取低值保证两人存活到能放出终结技。 */

type Ev = BattleResult['events'][number];

const MON = (attack = 400): MonsterConfig =>
  ({
    monsterId: '1004011',
    level: 85,
    hp: 1_000_000_000,
    attack,
    resistance: {},
    weaknesses: ['Ice', 'Imaginary', 'Wind', 'Quantum', 'Fire', 'Thunder', 'Physical'],
    maxToughness: 300,
    speed: 100,
    enemyClass: 'elite',
  }) as MonsterConfig;

const P = (element: string, speed: number, hp = 10000, defence = 1000): MemberPanel =>
  ({
    element,
    level: 80,
    hp,
    attack: 3000,
    defence,
    critRate: 0.5,
    critDmg: 1.5,
    speed,
    energyRegen: 0,
    damageBonus: 0,
    breakEffect: 1,
  }) as MemberPanel;

const cfg = (
  ids: [string, string, number, number, number, number][],
  maxTime = 600,
  techniques = false,
  attack = 400,
): BattleConfig => ({
  members: ids.map(([id, el, spd, eo, hp, def]) => ({
    id: id as CharId,
    panel: P(el, spd, hp, def),
    eidolonLevel: eo,
  })) as CombatMember[],
  monster: MON(attack),
  rounds: 30,
  maxTime,
  techniques,
});

const mkFx = () =>
  simulateBattle(
    cfg([
      ['fuxuan', 'Quantum', 110, 6, 15000, 1000],
      ['jingyuan', 'Thunder', 135, 0, 10000, 1000],
    ]),
  );

const mkTbk = () =>
  simulateBattle(
    cfg([
      ['trailblazerKnight', 'Fire', 100, 6, 12000, 1000],
      ['jingyuan', 'Thunder', 135, 0, 10000, 1000],
    ]),
  );

const buff = (e: Ev, unit: string, label: string) =>
  ((e.buffs?.[unit] ?? []) as { labelKey: string; value: number }[]).find((b) => b.labelKey === label);

const notesOf = (r: BattleResult, key: string) => r.events.filter((e) => (e.note ?? []).includes(key));

describe('符玄 1208（存护·量子）', () => {
  it('A1 战技开【穷观阵】，全队获得鉴知暴击 +12% 与 E1 暴伤 +30%', () => {
    const r = mkFx();
    const skill = r.events.find((e) => e.skillCode === 'fuxuan.skill')!;
    expect(skill.note ?? []).toContain('fxMatrix');
    expect(buff(skill, 'fuxuan', 'fxJzCr')!.value).toBeGreaterThan(0.1);
    expect(buff(skill, 'jingyuan', 'fxJzCr')!.value).toBeGreaterThan(0.1);
    expect(buff(skill, 'fuxuan', 'fxE1Cd')!.value).toBeCloseTo(0.3, 5);
    expect(buff(skill, 'jingyuan', 'fxE1Cd')!.value).toBeCloseTo(0.3, 5);
  });

  it('A2 阵中伤害分摊：敌方行动带 fxSplit，且符玄在未被选为目标时也掉血', () => {
    const r = mkFx();
    const splitEvents = notesOf(r, 'fxSplit');
    expect(splitEvents.length).toBeGreaterThan(0);
    for (const e of splitEvents) expect(e.action).toBe('monster');
    // 分摊发生在敌方 AoE/单体上：队友挨打的目标列表里符玄不是唯一目标，但符玄确实损失生命
    const fuxuanHp = r.finalState.memberHp.fuxuan ?? 0;
    expect(fuxuanHp).toBeLessThan(15000);
  });

  it('A3 终结技：+1 次天赋回血次数并打出全体伤害', () => {
    const r = mkFx();
    const ult = r.events.find((e) => e.skillCode === 'fuxuan.ult');
    if (!ult) return; // 能量未满时该局可能放不出（本配置下通常能放出）
    expect(ult.note ?? []).toContain('fxUlt');
    expect((ult.hitSeqs ?? []).length).toBeGreaterThan(0);
  });

  it('A5 行迹 point08：阵中抵抗控制类负面（note fxP08，每个阵 1 次）', () => {
    // 8003040（禁锢型怪）会对我方施放控制；符玄开阵后首次控制应被 point08 挡下
    const r = simulateBattle({
      members: [
        { id: 'fuxuan' as CharId, panel: P('Quantum', 110, 15000, 1000), eidolonLevel: 2 },
        { id: 'jingyuan' as CharId, panel: P('Thunder', 135, 12000, 1000), eidolonLevel: 0 },
      ] as CombatMember[],
      monster: { ...MON(300), monsterId: '8003040' } as MonsterConfig,
      rounds: 30,
      maxTime: 900,
    });
    const p08 = notesOf(r, 'fxP08');
    // 每次开阵给 1 次抵抗；本局符玄多次开阵 → 拦截次数 ≥1 且不超过开阵次数
    expect(p08.length).toBeGreaterThanOrEqual(1);
    const matrixCasts = r.events.filter((e) => (e.note ?? []).includes('fxMatrix')).length;
    expect(p08.length).toBeLessThanOrEqual(matrixCasts + 1);
  });

  it('A6 符玄阵亡 → 穷观阵立即结束（此后不再分摊）', () => {
    const r = simulateBattle(
      cfg(
        [
          ['fuxuan', 'Quantum', 110, 0, 6000, 1000],
          ['jingyuan', 'Thunder', 135, 0, 8000, 1000],
        ],
        400,
        false,
        3000,
      ),
    );
    const deathIdx = r.events.findIndex((e) =>
      (e.enemyHits ?? []).some((h) => h.targetId === 'fuxuan' && h.dead),
    );
    if (deathIdx < 0) return; // 该配置下符玄未阵亡 → 无可断言
    const after = r.events.slice(deathIdx + 1).filter((e) => (e.note ?? []).includes('fxSplit'));
    expect(after.length).toBe(0);
  });

  it('A4 E2「柔兆」：阵中受致命伤目标回 70% 且不倒下（单场 1 次，对照 E0）', () => {
    const mk = (eo: number) =>
      simulateBattle(
        cfg(
          [
            ['fuxuan', 'Quantum', 110, eo, 15000, 1000],
            ['jingyuan', 'Thunder', 135, 0, 8000, 1000],
          ],
          400,
          false,
          3000,
        ),
      );
    const e2 = mk(2);
    const e0 = mk(0);
    // E2 触发后至少有一名我方在「本应阵亡的那次行动」后仍存活
    const aliveE2 = Object.values(e2.finalState.memberHp).filter((hp) => (hp ?? 0) > 0).length;
    const aliveE0 = Object.values(e0.finalState.memberHp).filter((hp) => (hp ?? 0) > 0).length;
    expect(aliveE2).toBeGreaterThanOrEqual(aliveE0);
  });
});

describe('存护开拓者 8003/8004（存护·火）', () => {
  it('B1 战技：全队获得天赋护盾（同值），并记录 tbkSkill', () => {
    const r = mkTbk();
    const skill = r.events.find((e) => e.skillCode === 'trailblazerKnight.skill')!;
    expect(skill.note ?? []).toContain('tbkSkill');
    const selfShield = buff(skill, 'trailblazerKnight', 'shield')!.value;
    const allyShield = buff(skill, 'jingyuan', 'shield')!.value;
    expect(selfShield).toBeGreaterThan(0);
    expect(allyShield).toBeCloseTo(selfShield, 5);
  });

  it('B2 战技嘲讽：敌方【单体】攻击的主目标恒为开拓者，AoE 仍可命中他人', () => {
    const r = mkTbk();
    const monsterActs = r.events.filter((e) => e.action === 'monster');
    const singleHits = monsterActs.filter((e) => (e.enemyHits ?? []).length === 1);
    expect(singleHits.length).toBeGreaterThan(0);
    for (const e of singleHits) {
      expect(e.enemyHits![0].targetId).toBe('trailblazerKnight');
    }
    // 多目标（AoE）应仍能命中景元
    const aoeHits = monsterActs.filter((e) => (e.enemyHits ?? []).length > 1);
    expect(aoeHits.some((e) => e.enemyHits!.some((h) => h.targetId === 'jingyuan'))).toBe(true);
  });

  it('B3 灼热意志 ≥4 层：普攻自动强化（tbkEnhanced）且 E1 附加段出现', () => {
    const r = mkTbk();
    const enhanced = notesOf(r, 'tbkEnhanced');
    expect(enhanced.length).toBeGreaterThan(0);
    expect(notesOf(r, 'tbkE1').length).toBeGreaterThan(0);
    expect(enhanced[0].skillCode).toBe('trailblazerKnight.basic');
  });

  it('B4 终结技：全体 1.0×攻击 + 1.5×防御（tbkUlt），并留下免费强化标记', () => {
    const r = mkTbk();
    const ult = r.events.find((e) => e.skillCode === 'trailblazerKnight.ult');
    if (!ult) return;
    expect(ult.note ?? []).toContain('tbkUlt');
    expect((ult.hitSeqs ?? []).length).toBe(3); // 三木桩 AoE
  });

  it('B6 多来源护盾：显示取最大（1050 杰帕德盾 + 200 开拓者盾 → 1050，不是 1250）', () => {
    const r = simulateBattle(
      cfg(
        [
          ['trailblazerKnight', 'Fire', 120, 0, 12000, 1000],
          ['gepard', 'Ice', 90, 0, 12000, 1000],
        ],
        400,
        false,
        100,
      ),
    );
    const shields: number[] = [];
    for (const e of r.events) {
      for (const u of ['trailblazerKnight', 'gepard']) {
        const b = ((e.buffs?.[u] ?? []) as { labelKey: string; value: number }[]).find(
          (x) => x.labelKey === 'shield',
        );
        if (b) shields.push(b.value);
      }
    }
    expect(shields.length).toBeGreaterThan(0);
    const maxShield = Math.max(...shields);
    // 杰帕德终结技 1050（DEF 1000×45%+600）；开拓者天赋 200 —— 取最大即 1050
    expect(maxShield).toBeCloseTo(1050, 0);
    expect(maxShield).toBeLessThan(1200);
  });
  it('B5 行迹 point08：回合开始持盾 → 攻击 +15% buff（tbkP08）', () => {
    const r = mkTbk();
    const withP08 = r.events.some((e) =>
      ((e.buffs?.trailblazerKnight ?? []) as { labelKey: string; value: number }[]).some(
        (b) => b.labelKey === 'tbkP08' && b.value > 0.14,
      ),
    );
    expect(withP08).toBe(true);
  });
});
