/**
 * 预告片素材导出（临时脚本，跑完即删）。
 *
 * 目的：用项目自己的 buildLoadout（角色管理/展示柜共用烘焙）配出「绯爻神真」满配面板，
 * 再喂引擎跑一场真实战斗，把事件与伤害导出成 JSON 供预告片演示页使用。
 *
 * 不手搓任何面板数值 —— 白值走 data/ 成长段，加算走遗器主/副词条与行迹点。
 */
import { describe, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Element } from '@hsr-calc/shared';
import { simulateBattle, type BattleConfig, type CombatMember } from '@hsr-calc/engine';
import { fetchCharacterDetail, fetchLightconeDetail, fetchRelicSetDetail } from './game-data.js';
import { buildLoadout, type LoadoutInput } from './loadout-panel.js';
import type { RelicPieceState } from './storage.js';

const OUT_DIR = fileURLToPath(new URL('../../../.tmp-trailer/data/', import.meta.url));

interface TeamSpec {
  charId: string;
  rosterId: string;
  element: Element;
  lightconeId: string;
  relicsetId: string;
  planarsetId: string;
  /** 主词条：躯干 / 鞋 / 球 / 绳（头手固定） */
  mains: [string, string, string, string];
  /** 副词条分配（每件总 9 roll，不与主词条重复） */
  subPlan: Array<Array<[string, number]>>;
}

/** 元素 → 增伤主词条名 */
const ELEM_AFFIX: Record<string, string> = {
  Physical: 'PhysicalAddedRatio',
  Fire: 'FireAddedRatio',
  Ice: 'IceAddedRatio',
  Thunder: 'ThunderAddedRatio',
  Wind: 'WindAddedRatio',
  Quantum: 'QuantumAddedRatio',
  Imaginary: 'ImaginaryAddedRatio',
};

/** 满配参考：主 C 暴率躯干 + 副词条堆暴伤；辅助鞋走速度 */
function makePieces(spec: TeamSpec): RelicPieceState[] {
  const elementMain = ELEM_AFFIX[spec.element] ?? 'PhysicalAddedRatio';
  const mains = ['HPDelta', 'AttackDelta', spec.mains[0], spec.mains[1], spec.mains[2] || elementMain, spec.mains[3]];
  const pieces: RelicPieceState[] = [];
  for (let slot = 0; slot < 6; slot += 1) {
    const mainProperty = mains[slot]!;
    const plan = spec.subPlan[slot] ?? [];
    pieces.push({
      rarity: 5,
      enhance: 15,
      mainProperty,
      subs: plan
        .filter(([p]) => p !== mainProperty)
        .map(([property, rolls]) => ({ property, rolls, tiers: undefined })),
    });
  }
  return pieces;
}

/** 主 C 通用副词条方案（每件 9 roll = 4 条初始 + 5 次强化；暴伤压到 2/件，避免堆出 290% 的神仙面板） */
const CARRY_SUBS: Array<Array<[string, number]>> = [
  [['CriticalDamageBase', 2], ['AttackAddedRatio', 4], ['SpeedDelta', 3]], // 躯干（主暴率）
  [['CriticalChanceBase', 2], ['CriticalDamageBase', 2], ['AttackAddedRatio', 3], ['SpeedDelta', 2]], // 手
  [['CriticalChanceBase', 2], ['CriticalDamageBase', 2], ['AttackAddedRatio', 3], ['SpeedDelta', 2]], // 头
  [['CriticalChanceBase', 2], ['CriticalDamageBase', 2], ['SpeedDelta', 5]], // 鞋（主攻击%）
  [['CriticalChanceBase', 1], ['CriticalDamageBase', 2], ['AttackAddedRatio', 3], ['SpeedDelta', 3]], // 球
  [['CriticalChanceBase', 1], ['CriticalDamageBase', 2], ['SpeedDelta', 6]], // 绳（主攻击%）
];

/** 辅助（爻光/真珠）：鞋主速度，副词条速度 3 roll/件 → 面板约 170（过 130 套 160 门槛，又不荒诞） */
const SPEEDY_SUBS: Array<Array<[string, number]>> = [
  [['CriticalDamageBase', 2], ['AttackAddedRatio', 4], ['SpeedDelta', 3]],
  [['CriticalChanceBase', 2], ['CriticalDamageBase', 2], ['AttackAddedRatio', 2], ['SpeedDelta', 3]],
  [['CriticalChanceBase', 2], ['CriticalDamageBase', 2], ['AttackAddedRatio', 2], ['SpeedDelta', 3]],
  [['CriticalChanceBase', 2], ['CriticalDamageBase', 2], ['AttackAddedRatio', 5]], // 鞋（主速度，副词条不可再出速度）
  [['CriticalChanceBase', 2], ['CriticalDamageBase', 2], ['AttackAddedRatio', 2], ['SpeedDelta', 3]],
  [['CriticalChanceBase', 2], ['CriticalDamageBase', 2], ['AttackAddedRatio', 2], ['SpeedDelta', 3]],
];

const TEAM: TeamSpec[] = [
  {
    charId: 'feiying',
    rosterId: '1505',
    element: 'Physical',
    lightconeId: '23058',
    relicsetId: '129',
    planarsetId: '325',
    mains: ['CriticalChanceBase', 'AttackAddedRatio', '', 'AttackAddedRatio'],
    subPlan: CARRY_SUBS,
  },
  {
    charId: 'aha',
    rosterId: '1511',
    element: 'Quantum',
    lightconeId: '23065',
    relicsetId: '129',
    planarsetId: '325',
    mains: ['CriticalChanceBase', 'AttackAddedRatio', '', 'AttackAddedRatio'],
    subPlan: CARRY_SUBS,
  },
  {
    charId: 'yaoguang',
    rosterId: '1502',
    element: 'Physical',
    lightconeId: '23054',
    relicsetId: '130',
    planarsetId: '329',
    mains: ['CriticalChanceBase', 'SpeedDelta', '', 'AttackAddedRatio'],
    subPlan: SPEEDY_SUBS,
  },
  {
    charId: 'zhenzhu',
    rosterId: '1503',
    element: 'Ice',
    lightconeId: '23055',
    relicsetId: '133',
    planarsetId: '329',
    mains: ['CriticalChanceBase', 'SpeedDelta', '', 'AttackAddedRatio'],
    subPlan: SPEEDY_SUBS,
  },
];

const FULL_LEVELS = { basic: 6, skill: 10, ult: 10, talent: 10, memoSkill: 6 };

interface BakedMember {
  member: CombatMember;
  source: Record<string, unknown>;
}

async function bakeMember(spec: TeamSpec, eidolonLevel: number): Promise<BakedMember> {
  const detail = await fetchCharacterDetail(spec.rosterId, 'zh');
  const lightcone = await fetchLightconeDetail(spec.lightconeId, 'zh');
  const setA = await fetchRelicSetDetail(spec.relicsetId, 'zh');
  const planar = await fetchRelicSetDetail(spec.planarsetId, 'zh');
  if (!detail || !lightcone) {
    throw new Error(`missing detail for ${spec.rosterId} / ${spec.lightconeId}`);
  }
  const traceChecked: Record<string, boolean> = {};
  for (const point of detail.tracePoints) traceChecked[point.key] = true;

  const input: LoadoutInput = {
    rosterId: spec.rosterId,
    charLevel: 80,
    charPromotion: 6,
    lcLevel: 80,
    lcPromotion: 6,
    lightconeId: spec.lightconeId,
    refinement: 5,
    relicsetId: spec.relicsetId,
    planarsetId: spec.planarsetId,
    eidolonLevel,
    traceChecked,
    relicPieces: makePieces(spec),
  };
  const baked = buildLoadout(input, {
    charDetail: detail,
    lightcone,
    relicSets: {
      [spec.relicsetId]: setA ?? undefined,
      [spec.planarsetId]: planar ?? undefined,
    },
    battleRosterIds: new Set(['1505', '1511', '1502', '1503']),
  });
  const panel = baked.panel;
  if (!panel) throw new Error(`panel bake failed for ${spec.rosterId}`);

  // 与 CharactersPage.save() 完全相同的映射（配装模式分支）
  const equipCommonBonus = baked.clauses
    .filter((c) => c.zone === 'damageBonus' && !c.conditional)
    .reduce((a, c) => a + c.value, 0);
  const equipElation = baked.clauses
    .filter((c) => c.zone === 'elationDegree' && !c.conditional)
    .reduce((a, c) => a + c.value, 0);

  const source = {
    rosterId: spec.rosterId,
    element: spec.element,
    level: 80,
    atk: panel.atk,
    hp: panel.hp,
    def: panel.def,
    critRate: panel.critRate,
    critDmg: panel.critDmg,
    breakEffect: panel.breakEffect,
    damageBonus: panel.elementDmg[spec.element] ?? 0,
    commonBonus: equipCommonBonus,
    elementDmg: panel.elementDmg,
    speed: panel.speed,
    energyRegen: panel.energyRegen,
    elationDegree: equipElation,
    effectHit: panel.effectHit,
    effectRes: panel.effectRes,
    healBonus: panel.healBonus,
    lightconeId: spec.lightconeId,
    refinement: 5,
    relicsetId: spec.relicsetId,
    planarsetId: spec.planarsetId,
    eidolonLevel,
  };

  const member: CombatMember = {
    id: spec.charId as CombatMember['id'],
    skillLevels: FULL_LEVELS,
    eidolonLevel,
    lightconeId: spec.lightconeId,
    refinement: 5,
    relicsetId: spec.relicsetId,
    planarsetId: spec.planarsetId,
    panel: {
      element: spec.element,
      level: 80,
      hp: panel.hp,
      attack: panel.atk,
      defence: panel.def,
      critRate: panel.critRate,
      critDmg: panel.critDmg,
      breakEffect: panel.breakEffect,
      damageBonus: panel.elementDmg[spec.element] ?? 0,
      commonBonus: equipCommonBonus,
      elementDmg: panel.elementDmg,
      speed: panel.speed,
      energyRegen: panel.energyRegen,
      elationDegree: equipElation,
      effectHit: panel.effectHit,
      effectRes: panel.effectRes,
      healBonus: panel.healBonus,
    },
  };
  return { member, source };
}

const ALL_ELEMENTS = ['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary'] as const;

function buildConfig(members: CombatMember[]): BattleConfig {
  return {
    members,
    monster: {
      level: 90,
      hp: 50_000_000,
      maxToughness: 300,
      speed: 100,
      attack: 0,
      resistance: Object.fromEntries(ALL_ELEMENTS.map((e) => [e, 0])),
      weaknesses: [...ALL_ELEMENTS],
      enemyClass: 'normal',
    },
    techniques: true,
    rounds: 24,
    maxTime: 1500,
    seed: 20261030,
  };
}

describe('预告片素材导出', () => {
  it('绯爻神真满配 · E0/E6 两版战斗导出', async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const report: Record<string, unknown> = {};

    for (const eidolon of [0, 6]) {
      const baked = [] as BakedMember[];
      for (const spec of TEAM) baked.push(await bakeMember(spec, eidolon));
      const members = baked.map((b) => b.member);

      const result = simulateBattle(buildConfig(members));
      const payload = {
        eidolon,
        seed: 20261030,
        members: baked.map((b) => b.source),
        victory: result.victory,
        rounds: result.summary.rounds,
        events: result.events.map((e) => ({
          kind: e.kind,
          action: e.action,
          unitId: e.unitId,
          skillCode: e.skillCode,
          time: e.time,
          wave: e.wave,
          note: e.note,
          hitSeqs: e.hitSeqs,
        })),
        hits: result.hits.map((h) => ({
          seq: h.seq,
          kind: h.kind,
          total: h.total,
          source: h.source,
          target: h.target,
          skillCode: h.skillCode,
          crit: h.factors.find((f) => f.key === 'crit')?.value ?? null,
          factors: h.factors,
        })),
      };
      fs.writeFileSync(`${OUT_DIR}battle-e${eidolon}.json`, JSON.stringify(payload, null, 1), 'utf8');
      report[`e${eidolon}`] = {
        victory: result.victory,
        rounds: result.summary.rounds,
        events: result.events.length,
        hits: result.hits.length,
        totalDamage: Math.round(result.hits.reduce((a, h) => a + h.total, 0)),
        /** 行动序列（预告片战斗段的镜头依据） */
        actions: result.events
          .filter((e) => e.kind === 'action' || e.kind === 'ult')
          .map((e) => {
            const seqs = new Set(e.hitSeqs ?? []);
            const dmg = result.hits
              .filter((h) => seqs.has(h.seq))
              .reduce((a, h) => a + h.total, 0);
            return {
              time: +e.time.toFixed(2),
              unit: e.unitId,
              action: e.action,
              skill: e.skillCode,
              hits: seqs.size,
              dmg: Math.round(dmg),
              note: e.note ?? null,
            };
          }),
        kindCount: result.hits.reduce<Record<string, number>>((acc, h) => {
          acc[h.kind] = (acc[h.kind] ?? 0) + 1;
          return acc;
        }, {}),
        top10: result.hits
          .slice()
          .sort((a, b) => b.total - a.total)
          .slice(0, 10)
          .map((h) => ({ total: Math.round(h.total), kind: h.kind, source: h.source, skillCode: h.skillCode })),
        memberPanels: baked.map((b) => ({
          id: b.member.id,
          atk: Math.round(b.member.panel.attack),
          critRate: +b.member.panel.critRate.toFixed(4),
          critDmg: +b.member.panel.critDmg.toFixed(4),
          speed: +b.member.panel.speed.toFixed(1),
          elationDegree: +((b.member.panel.elationDegree ?? 0).toFixed(4)),
          elementDmg: b.member.panel.elementDmg,
        })),
      };
    }

    fs.writeFileSync(`${OUT_DIR}summary.json`, JSON.stringify(report, null, 1), 'utf8');
  }, 120_000);
});
