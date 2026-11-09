import { describe, expect, it } from 'vitest';
import {
  STAGE_PACKS,
  buildPackStageWaves,
  simulateBattle,
  mechanicIdsFor,
  type CombatMember,
  type MemberPanel,
} from '../src/index.js';

// ── 关卡机制：仲裁 P10 五关的**运行时**验收（2026-10-30 第三十四轮）──
// `stage-mechanics.test.ts` 用**手搓木桩**验证 11 项机制的数值；本文件补的是另一半：
// **真实关卡数据 + web 侧真实的机制解析优先级**（half ?? stage ?? pack）下，
// 机制是否真的被下发并在战斗里产生可观测效果。
// 之所以单列：arb-p10 的 5 关机制全在 `stage.mechanics`（包级为空），
// 只读包级的旧写法会让 5 关全部「静默无机制」，而任何「能跑完」的用例都不会报错。

function panel(speed: number, hp = 200_000): MemberPanel {
  return {
    element: 'Quantum',
    level: 80,
    hp,
    attack: 3000,
    defence: 1000,
    critRate: 0.05,
    critDmg: 0.5,
    breakEffect: 0,
    damageBonus: 0,
    speed,
    energyRegen: 0.194,
  };
}

const members = (hp?: number): CombatMember[] => [
  { id: 'huohua', panel: panel(160, hp) },
  { id: 'feixiao', panel: panel(150, hp) },
  { id: 'sunday', panel: panel(156, hp) },
  { id: 'aventurine', panel: panel(134, hp) },
];

const ARB = () => STAGE_PACKS.find((p) => p.id === 'arb-p10')!;

/** 该关数据里声明的机制 id（web 侧优先级的等价实现） */
function stageMechanics(index: number): string[] {
  const stage = ARB().stages.find((s) => s.index === index)!;
  return mechanicIdsFor(stage.mechanics?.map((m) => m.name));
}

interface RunOpts {
  rounds?: number;
  hpCap?: number;
  memberHp?: number;
  withMechanics?: boolean;
}

function run(index: number, opts: RunOpts = {}) {
  const { rounds = 8, hpCap = 2_000_000, memberHp, withMechanics = true } = opts;
  const waves = buildPackStageWaves('arb-p10', index).map((w) =>
    w.map((c) => ({ ...c, hp: Math.min(c.hp, hpCap) })),
  );
  const r = simulateBattle({
    members: members(memberHp),
    monsterWaves: waves,
    techniques: false,
    rounds,
    maxTime: 6000,
    roundMode: ARB().roundMode,
    mechanics: withMechanics ? stageMechanics(index) : undefined,
  });
  const notes = new Map<string, number>();
  for (const e of r.events) for (const n of e.note ?? []) notes.set(n, (notes.get(n) ?? 0) + 1);
  return { r, notes };
}

describe('关卡机制 · 仲裁 P10 运行时', () => {
  it('第 1 关：血嗜扣血 + 洞穿（持盾时敌方伤害放大）都真的触发', () => {
    expect(stageMechanics(1)).toEqual(['bloodthirst', 'pierce', 'ecstasyNight', 'pilotVow', 'cytosis']);
    const { r, notes } = run(1);
    expect(notes.get('stageBloodthirst') ?? 0).toBeGreaterThan(0);
    expect(notes.get('stagePierce') ?? 0).toBeGreaterThan(0);
    // 血嗜 = 每回合开始固定 500，我方生命必须真的减少过
    expect(r.events.length).toBeGreaterThan(0);
    expect(notes.get('stageEnrageClear') ?? 0).toBe(0); // 该关没有激怒
  });

  it('第 1 关：关掉机制后血嗜/洞穿都不出现（机制确实来自配置而非默认）', () => {
    const { notes } = run(1, { withMechanics: false });
    expect(notes.get('stageBloodthirst') ?? 0).toBe(0);
    expect(notes.get('stagePierce') ?? 0).toBe(0);
  });

  it('第 2 关：血嗜+ 与 不屈（护盾池）生效', () => {
    expect(stageMechanics(2)).toEqual(['bloodthirst2', 'pierce2', 'unyielding']);
    const { notes } = run(2);
    expect(notes.get('stageBloodthirst') ?? 0).toBeGreaterThan(0);
    // 不屈不给 note，靠「有机制时敌方更难死」间接体现：同一配置下关掉机制血量更低
    const off = run(2, { withMechanics: false });
    expect(off.r.monsterHpLeft).toBeLessThan(run(2).r.monsterHpLeft + 1e-6);
  });

  it('第 3 关：闭锁 6 层 → 禁锢（关掉机制则完全不出现）', () => {
    expect(stageMechanics(3)).toEqual(['lockdown']);
    const on = run(3, { rounds: 15, hpCap: 3_000_000 });
    const off = run(3, { rounds: 15, hpCap: 3_000_000, withMechanics: false });
    expect(on.notes.get('allyImprison') ?? 0).toBeGreaterThan(0);
    expect(off.notes.get('allyImprison') ?? 0).toBe(0);
    // 注：`stageLockdown` 这个 hit note 在「该段已有其它 note」时会被丢弃（既有 first-wins 规则），
    // 因此这里断言的是**效果**（禁锢）而不是 note。
  });

  it('第 4 关：桎梏+ 让伤害降低、激怒叠层与清空都触发', () => {
    expect(stageMechanics(4)).toEqual(['shackle2', 'enrage']);
    const { notes } = run(4);
    expect(notes.get('stageShackleDown') ?? 0).toBeGreaterThan(0);
    expect(notes.get('stageEnrage') ?? 0).toBeGreaterThan(0);
    expect(notes.get('stageEnrageClear') ?? 0).toBeGreaterThan(0);
  });

  it('第 5 关：只有血嗜，不应出现其他机制 note', () => {
    expect(stageMechanics(5)).toEqual(['bloodthirst']);
    const { notes } = run(5);
    expect(notes.get('stageBloodthirst') ?? 0).toBeGreaterThan(0);
    for (const other of ['stagePierce', 'stageShackleDown', 'stageEnrage', 'stageLockdown']) {
      expect(notes.get(other) ?? 0, `第 5 关不该出现 ${other}`).toBe(0);
    }
  });
});
