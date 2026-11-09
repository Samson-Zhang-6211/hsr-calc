import { describe, expect, it } from 'vitest';
import {
  buildPackStageWaves,
  enemySkills,
  enemyUsableSkills,
  simulateBattle,
  type CombatEvent,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 末日幻影 P21 难度04「迷惘之渊的裁定者」4064012（2026-10-30 第二批接入）──
// 数据源：data/monster-stages/apo-p21.json → STAGE_PACKS → buildPackStageWaves('apo-p21', 4, '下半')
// 技能表：packages/engine/src/combat/monster-skill-data.ts 的 '4064012'
// 锚点全部来自 zz-judge-dump 实测（同 seed 确定性），倍率/概率占位 1（rulings「1 A」）。
//
// 本批接入：伤害三连（嚼齿/锯刑/钳刑）+【侵蚀】（降低可回复生命上限）+【壁垒反震】（护盾反击 → 自身防御降低）
//          +【强化防御】（减伤乘区，破韧解除）+【罪血眈视】锁定窗口 +【指名祸首】蓄力→【罪血枭首】点名。
// 留口（文档已记）：化整为零（分裂/合体/假死）、执刑就位（召唤金血忆灵）、劣化残躯（需「我方施加负面」中央钩）。

function panel(speed: number): MemberPanel {
  return {
    element: 'Wind',
    level: 80,
    hp: 100000,
    attack: 2000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

/** 队伍刻意不含晴歌（Fever 离场会污染确定性巡演），且带砂金给盾以触发【壁垒反震】 */
function members(): CombatMember[] {
  return [
    { id: 'sunday', panel: panel(156) },
    { id: 'jingyuan', panel: panel(134) },
    { id: 'tenghuang', panel: panel(135) },
    { id: 'aventurine', panel: panel(134) },
  ];
}

const MON = (() => {
  const cfg = buildPackStageWaves('apo-p21', 4, '下半')[0]![0]!;
  // noSplit：这些用例验证本体技能，跳过【化整为零】分裂（分裂/合体见 monster-karma-split.test.ts）
  return { ...cfg, hp: 20_000_000, noSplit: true };
})();
/** 单体一跳 = 敌攻 × 1 × 防御区（攻方 Lv90 / 守方 Lv80） */
const HIT = MON.attack! * ((90 + 20) / (90 + 20 + (80 + 20)));

function run(): CombatEvent[] {
  return simulateBattle({
    members: members(),
    monsterWaves: [[MON]],
    techniques: false,
    rounds: 8,
    maxTime: 1600,
    roundMode: 'phantom',
  }).events;
}

describe('末日 P21 · 4064012 技能表', () => {
  it('11 条技能；AI 池含【罪血眈视】（无倍率也要能出手）', () => {
    const all = enemySkills('4064012');
    expect(all.map((s) => s.skillId)).toEqual([
      '406401201',
      '406401202',
      '406401203',
      '406401204',
      '406401205',
      '406401206',
      '406401207',
      '406401208',
      '406401209',
      '406401210',
      '406401211',
    ]);
    expect(all.find((s) => s.skillId === '406401204')!.erosion).toMatchObject({ ratio: 0.5 });
    expect(all.find((s) => s.skillId === '406401201')!.shieldCounter).toBe(true);
    expect(all.find((s) => s.skillId === '406401203')!.judge).toMatchObject({ turns: 3 });
    expect(all.find((s) => s.skillId === '406401206')!.charge).toMatchObject({ nextSkillId: '406401207' });
    expect(all.find((s) => s.skillId === '406401208')!.hardenedDefence).toMatchObject({ dmgReduction: 0.4 });
    // 罪血枭首只能在蓄力窗口释放
    expect(all.find((s) => s.skillId === '406401207')!.requiresCharge).toBe(true);
    const usable = enemyUsableSkills('4064012').map((s) => s.skillId);
    // 406401207 有倍率 → 在池内，但 requiresCharge 让它在选招时被过滤（与既有蓄力怪同口径）
    // 406401202【执刑就位】于第十七批接上 summon → 进入 AI 池
    expect(usable).toEqual([
      '406401201',
      '406401202',
      '406401203',
      '406401204',
      '406401205',
      '406401206',
      '406401207',
    ]);
    // 仍为留口：化整为零（分裂/合体框架未接）
    expect(usable).not.toContain('406401211');
  });
});

describe('【侵蚀】与【壁垒反震】', () => {
  it('侵蚀只在真实掉血时产生（满盾吸收的命中不转化）', () => {
    const evs = run();
    const eroded = evs.filter((e) => (e.note ?? []).includes('allyErosion'));
    expect(eroded.length).toBeGreaterThan(0);
    for (const e of eroded) {
      // 【侵蚀】按「该目标未被护盾抵消的伤害」转化 → 事件内**命中者里至少有一段真掉血**即可
      // （AoE 是多段 enemyHits，首段可能被盾全吸收而其它段掉血；2026-10-30 第二十三轮补技能表后
      //   分裂体也开始出手、RNG 序列前移，旧「只看 enemyHits[0]」的写法过严）
      const hits = e.enemyHits ?? [];
      expect(hits.some((h) => h.hpLoss > 0)).toBe(true);
      // 侵蚀只由锯刑/钳刑产生
      expect(['406401204', '406401205']).toContain(e.skillCode!.replace('monster.', ''));
    }
    // 反例：**全段**被盾吸收的锯刑/钳刑不带 allyErosion
    const absorbed = evs.filter(
      (e) =>
        ['monster.406401204', 'monster.406401205'].includes(e.skillCode ?? '') &&
        (e.enemyHits ?? []).length > 0 &&
        (e.enemyHits ?? []).every((h) => h.hpLoss === 0),
    );
    expect(absorbed.length).toBeGreaterThan(0);
    for (const e of absorbed) expect((e.note ?? []).includes('allyErosion')).toBe(false);
  });

  it('壁垒反震：命中被护盾吸收 → 自身 +1 层防御降低（enemyShieldCounter）', () => {
    const evs = run();
    const counter = evs.filter((e) => (e.note ?? []).includes('enemyShieldCounter'));
    expect(counter.length).toBeGreaterThan(0);
    for (const e of counter) {
      expect([406401201, 406401204].map(String)).toContain(e.skillCode!.replace('monster.', ''));
      expect(e.enemyHits!.some((h) => h.blocked > 0)).toBe(true);
    }
    // 反例：没有任何护盾吸收的命中不触发
    for (const e of evs.filter((x) => x.skillCode === 'monster.406401201')) {
      const anyBlocked = e.enemyHits!.some((h) => h.blocked > 0);
      expect((e.note ?? []).includes('enemyShieldCounter')).toBe(anyBlocked);
    }
  });
});

describe('【罪血眈视】锁定窗口与【罪血枭首】点名', () => {
  it('锁定后只施放嚼齿/锯刑，窗口结束打 enemyJudgeEnd', () => {
    const evs = run();
    const lockIdx = evs.findIndex((e) => (e.note ?? []).includes('enemyJudgeLock'));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    const lock = evs[lockIdx]!;
    expect(lock.skillCode).toBe('monster.406401203');
    expect(lock.note).toContain('enemySpeedUp');
    // 窗口内（到 enemyJudgeEnd 为止）怪物只用 406401201/406401204
    let endIdx = -1;
    for (let i = lockIdx + 1; i < evs.length; i += 1) {
      const e = evs[i]!;
      if (e.unitId !== 'monster1' || e.kind !== 'action') continue;
      const sid = e.skillCode?.replace('monster.', '');
      if (sid) expect(['406401201', '406401204']).toContain(sid);
      if ((e.note ?? []).includes('enemyJudgeEnd')) {
        endIdx = i;
        break;
      }
    }
    expect(endIdx).toBeGreaterThan(lockIdx);
    // 窗口内至少 3 次伤害行动（施放 + 再行动 1 次 + 锁定期）
    const windowActions = evs
      .slice(lockIdx, endIdx + 1)
      .filter((e) => e.unitId === 'monster1' && e.kind === 'action' && e.skillCode);
    expect(windowActions.length).toBeGreaterThanOrEqual(3);
  });

  it('罪血枭首：被【指名祸首】点名的角色吃 ×2 倍率，并按未被抵消的伤害施加【罪血腐蚀】', () => {
    const evs = run();
    const head = evs.filter((e) => e.skillCode === 'monster.406401207');
    expect(head.length).toBeGreaterThan(0);
    let corroded = 0;
    for (const e of head) {
      const hits = e.enemyHits!;
      const designated = hits.filter((h) => h.damage > HIT * 1.5);
      expect(designated.length).toBe(1);
      expect(designated[0]!.damage).toBeCloseTo(HIT * 2, 2);
      // 其余目标为标准倍率
      for (const h of hits.filter((x) => x !== designated[0])) {
        expect(h.damage).toBeCloseTo(HIT, 2);
      }
      expect(e.note).toContain('monsterChargeRelease');
      // 「未被护盾抵消的伤害」> 0 才转化（满盾吸收时不施加）
      const unshielded = designated[0]!.damage - designated[0]!.blocked;
      if (unshielded > 0) {
        expect(e.note).toContain('allyCorrode');
        corroded += 1;
      } else {
        expect((e.note ?? []).includes('allyCorrode')).toBe(false);
      }
    }
    expect(corroded).toBeGreaterThan(0);
    // 蓄力在前：指名祸首 → 下次行动枭首
    const idx = evs.findIndex((e) => e.skillCode === 'monster.406401207');
    expect(evs.slice(0, idx).some((e) => e.skillCode === 'monster.406401206')).toBe(true);
  });
});

describe('【强化防御】', () => {
  it('被弱点击破时解除（break 事件带 enemyHardenedDefenceBreak）', () => {
    const evs = run();
    const breaks = evs.filter((e) => e.kind === 'break');
    expect(breaks.length).toBeGreaterThan(0);
    const withNote = breaks.filter((e) => (e.note ?? []).includes('enemyHardenedDefenceBreak'));
    expect(withNote.length).toBe(1); // 单只怪只解除一次
    expect(withNote[0]!.targetId).toBe('monster1');
  });
});
