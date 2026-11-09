import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../src/index.js';
import type { BattleConfig, CharId, CombatMember, MemberPanel, MonsterConfig } from '../src/index.js';

function panel(over: Partial<MemberPanel> = {}): MemberPanel {
  return {
    element: 'Thunder',
    level: 80,
    hp: 10000,
    attack: 3000,
    defence: 1000,
    critRate: 0.5,
    critDmg: 1.5,
    breakEffect: 1,
    damageBonus: 0,
    speed: 100,
    energyRegen: 0.194,
    ...over,
  } as MemberPanel;
}

function monster(): MonsterConfig {
  return {
    level: 90,
    hp: 5e8,
    maxToughness: 1000,
    speed: 100,
    resistance: { Physical: 0, Fire: 0, Ice: 0, Thunder: 0, Wind: 0, Quantum: 0, Imaginary: 0 },
    weaknesses: ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'],
    enemyClass: 'normal',
    monsterId: '1004011',
    attack: 0,
  } as MonsterConfig;
}

function config(
  ids: CharId[],
  eidolons: Partial<Record<CharId, number>> = {},
  opts: { techniques?: boolean; maxTime?: number; initialSp?: number } = {},
): BattleConfig {
  return {
    members: ids.map(
      (id) => ({ id, panel: panel(), eidolonLevel: eidolons[id] ?? 0 }) as CombatMember,
    ),
    monsters: [monster()],
    maxTime: opts.maxTime ?? 200,
    initialSp: opts.initialSp ?? 3,
    seed: 1,
    techniques: opts.techniques ?? false,
  };
}

const F = (h: { factors: { key: string; value: number }[] }, k: string) =>
  h.factors.find((f) => f.key === k)!.value;
const hitsOf = (r: ReturnType<typeof simulateBattle>, e: { hitSeqs?: number[] }) =>
  (e.hitSeqs ?? []).map((s) => r.hits[s]);
const byCode = (r: ReturnType<typeof simulateBattle>, code: string) =>
  r.hits.filter((h) => h.skillCode === code);

describe('飞霄 1220', () => {
  it('初战【飞黄】=3（行迹 06），战技 200% + 立即额外天赋追击（不占每回合额度）', () => {
    const r = simulateBattle(config(['feixiao', 'danheng'], {}, { maxTime: 100 }));
    const skill = r.events.find((e) => e.skillCode === 'feixiao.skill')!;
    expect(skill.note).toContain('feixiaoSkill');
    expect(skill.note).toContain('feixiaoP08');
    expect(skill.note).toContain('feixiaoTalent');
    // 战技 200%：3000×2.0
    const [skillHit, talentHit] = hitsOf(r, skill);
    expect(F(skillHit, 'base')).toBeCloseTo(6000);
    // 战技先算，行迹 08 攻击力 +48% 只有后续追击吃：3000×1.48×1.1
    expect(F(talentHit, 'base')).toBeCloseTo(4884);
    // point07：追击暴伤 +36% → 1 + 0.5×(1.5+0.36) = 1.93
    expect(F(talentHit, 'crit')).toBeCloseTo(1.93);
    // 飞黄：初战 3（行迹 06）。注意 energyAfter 是 record 时刻快照，
    // 本事件的「2 次攻击 → +1」在钩子内落地，故此处仍为 3
    expect(skill.energyAfter).toBeCloseTo(3);
  });

  it('天赋：队友攻击后对主目标追击 110%，且自身增伤 +60%（增伤区加算）', () => {
    const r = simulateBattle(config(['feixiao', 'danheng'], {}, { maxTime: 100 }));
    const dh = r.events.find((e) => e.unitId === 'danheng' && e.skillCode === 'danheng.skill')!;
    expect(dh.note).toContain('feixiaoTalent');
    const talent = hitsOf(r, dh).find((h) => h.skillCode === 'feixiao.talent')!;
    expect(F(talent, 'base')).toBeCloseTo(4884);
    // 天赋触发后自身 +60% 增伤，已在本次追击生效
    expect(F(talent, 'damageBonus')).toBeCloseTo(1.6);
    expect(talent.attackKind).toBe('followup');
  });

  it('终结技：6 段 90% + 收尾 160%，扣 6【飞黄】留余量，各段视为追加攻击', () => {
    const r = simulateBattle(config(['feixiao', 'danheng'], {}, { maxTime: 200 }));
    const ult = r.events.find((e) => e.unitId === 'feixiao' && e.kind === 'ult')!;
    expect(ult.note).toContain('feixiaoUlt');
    const hits = hitsOf(r, ult);
    const segs = hits.filter((h) => h.skillCode === 'feixiao.ultSeg');
    expect(segs).toHaveLength(6);
    expect(F(segs[0], 'base')).toBeCloseTo(3996); // 3000×1.48×0.9
    expect(F(segs[0], 'crit')).toBeCloseTo(1.93); // 视为追击 → point07 暴伤
    expect(segs[0].attackKind).toBe('followup');
    const fin = hits.find((h) => h.skillCode === 'feixiao.ultFinal')!;
    expect(F(fin, 'base')).toBeCloseTo(7104); // 3000×1.48×1.6
    // 6 飞黄全部扣掉，余量 0
    expect(ult.energyAfter).toBeCloseTo(0);
  });

  it('E1：每个子段结束叠 +10% 终结技增伤（上限 5，当前段不吃新层）', () => {
    const r = simulateBattle(config(['feixiao', 'danheng'], { feixiao: 1 }, { maxTime: 200 }));
    const ult = r.events.find((e) => e.unitId === 'feixiao' && e.kind === 'ult')!;
    const segs = hitsOf(r, ult).filter((h) => h.skillCode === 'feixiao.ultSeg');
    expect(segs).toHaveLength(6);
    // 6 段分别吃 0/1/2/3/4/5 层（第 6 段封顶 5 层）
    expect(F(segs[0], 'damageBonus')).toBeCloseTo(1.6);
    expect(F(segs[1], 'damageBonus')).toBeCloseTo(1.7);
    expect(F(segs[5], 'damageBonus')).toBeCloseTo(2.1);
    const fin = hitsOf(r, ult).find((h) => h.skillCode === 'feixiao.ultFinal')!;
    expect(F(fin, 'damageBonus')).toBeCloseTo(2.1);
  });

  it('E6：天赋追击倍率 ×2.4，且「视为终结技伤害」吃终结技抗穿 +20%', () => {
    const r = simulateBattle(config(['feixiao', 'danheng'], { feixiao: 6 }, { maxTime: 200 }));
    const talent = byCode(r, 'feixiao.talent')[0]!;
    // E5 天赋 +2 → 天赋 Lv12（1.1 → 1.21）；E6 ×2.4 → 2.904
    expect(F(talent, 'base')).toBeCloseTo(3000 * 1.48 * 1.21 * 2.4);
    // 弱点目标抗性 0 → 1 − 0 + 0.2（E6 全属性抗穿）
    expect(F(talent, 'resist')).toBeCloseTo(1.2);
    // 终结技各段同样带 20% 抗穿
    const ult = r.events.find((e) => e.unitId === 'feixiao' && e.kind === 'ult')!;
    const seg = hitsOf(r, ult).find((h) => h.skillCode.startsWith('feixiao.ultSeg'))!;
    expect(F(seg, 'resist')).toBeCloseTo(1.2);
  });

  it('秘技：进战 +1 飞黄，且每个波次开始对敌方全体必定暴击（crit = 1 + 暴伤）', () => {
    const r = simulateBattle(config(['feixiao'], {}, { techniques: true, maxTime: 10 }));
    const tech = r.events.find((e) => e.skillCode === 'feixiao.tech')!;
    const hit = hitsOf(r, tech)[0]!;
    expect(F(hit, 'base')).toBeCloseTo(6000); // 200%
    expect(F(hit, 'crit')).toBeCloseTo(2.5); // 必定暴击：1 + 1×1.5
    // 初战 3（秘技的 +1 在事件钩子内落地，energyAfter 是事件前快照）
    expect(tech.energyAfter).toBeCloseTo(3);
  });
});
