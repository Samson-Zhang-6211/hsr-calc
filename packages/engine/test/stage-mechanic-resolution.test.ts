import { describe, expect, it } from 'vitest';
import { STAGE_PACKS, mechanicIdsFor, type StageDef } from '../src/index.js';

// ── 关卡机制：段级/半段级解析（2026-10-30 第三十四轮）──
// 第三十三轮的完整性用例只看了**包级** `modeMechanics`；但异相仲裁 P10 的 5 关机制**全部挂在
// `stage.mechanics` 上**（包级是空数组），于是那 5 关在完整性用例里是 0 === 0 的空断言。
// 本文件按 web 侧 `monster-presets.ts` 的真实优先级（half ?? stage ?? pack）逐段解析，
// 确保**每个段实际会下发给引擎的机制列表**完整、无未知名（未知名会被 `mechanicIdsFor` 静默丢弃
// → 战斗里机制完全不生效，且不会报错）。

/** 与 `apps/web/src/monster-presets.ts` 完全一致的优先级 */
function resolveMechanics(pack: (typeof STAGE_PACKS)[number], stage: StageDef, half?: { mechanics?: readonly { name: string; desc: string }[] }) {
  return half?.mechanics ?? stage.mechanics ?? pack.modeMechanics ?? [];
}

describe('关卡机制 · 段级解析', () => {
  it('每个段的机制列表都能 100% 映射到引擎 id（含 stage / half 级）', () => {
    let total = 0;
    for (const pack of STAGE_PACKS) {
      for (const stage of pack.stages) {
        const halves = stage.kind === 'boss' ? stage.halves : [undefined];
        for (const half of halves) {
          const label = `${pack.id}#${stage.index}${half ? '/' + half.half : ''}`;
          const list = resolveMechanics(pack, stage, half as { mechanics?: readonly { name: string; desc: string }[] } | undefined);
          const ids = mechanicIdsFor(list.map((m) => m.name));
          // 未知机制名会被静默丢弃：数量不等即代表「数据里写了、引擎没接」
          expect(ids.length, `${label} 机制未全部映射: ${list.map((m) => m.name).join('/')}`).toBe(list.length);
          for (const m of list) {
            expect(m.name.length, `${label} 机制缺 name`).toBeGreaterThan(0);
            expect(m.desc.length, `${label} 机制 ${m.name} 缺 desc`).toBeGreaterThan(0);
          }
          total += ids.length;
        }
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it('异相仲裁 P10：5 关各自带不同机制（段级优先，包级为空）', () => {
    const arb = STAGE_PACKS.find((p) => p.id === 'arb-p10')!;
    expect((arb.modeMechanics ?? []).length).toBe(0); // 包级确实是空的
    const byIndex = new Map(arb.stages.map((s) => [s.index, mechanicIdsFor(s.mechanics?.map((m) => m.name))]));
    expect([...byIndex.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    // 每关机制集合与其站点文案一一对应（含 血嗜+/洞穿+/桎梏+ 变体）
    expect(byIndex.get(1)).toEqual(['bloodthirst', 'pierce', 'ecstasyNight', 'pilotVow', 'cytosis']);
    expect(byIndex.get(2)).toEqual(['bloodthirst2', 'pierce2', 'unyielding']);
    expect(byIndex.get(3)).toEqual(['lockdown']);
    expect(byIndex.get(4)).toEqual(['shackle2', 'enrage']);
    expect(byIndex.get(5)).toEqual(['bloodthirst']);
    // 5 关机制互不相同（否则说明数据粘错了段）
    const seen = new Set([...byIndex.values()].map((v) => v.join(',')));
    expect(seen.size).toBe(5);
  });

  it('混沌/末日：机制挂在包级，boss 段与星启都能拿到', () => {
    const moc = STAGE_PACKS.find((p) => p.id === 'moc-p43')!;
    for (const stage of moc.stages) {
      const ids = mechanicIdsFor(resolveMechanics(moc, stage).map((m) => m.name));
      expect(ids, `moc-p43#${stage.index} 丢了记忆紊流`).toEqual(['miasma']);
    }
    const apo = STAGE_PACKS.find((p) => p.id === 'apo-p21')!;
    for (const stage of apo.stages) {
      for (const half of stage.halves) {
        const ids = mechanicIdsFor(resolveMechanics(apo, stage, half).map((m) => m.name));
        expect(ids, `apo-p21#${stage.index}/${half.half} 丢了末法余烬`).toEqual(['ember']);
      }
    }
    // 无机制的一包必须解析成空数组（前端据此不下发 mechanics 字段）
    const pure = STAGE_PACKS.find((p) => p.id === 'pure-p27')!;
    for (const stage of pure.stages) {
      expect(mechanicIdsFor(resolveMechanics(pure, stage).map((m) => m.name))).toEqual([]);
    }
    // 混沌 P44「物竞天择」（2026-11-06 用户录像 t≈84s 关卡页原文）：包级机制，
    // 其十二上下半与星启都应解析出 naturalSelection
    const p44 = STAGE_PACKS.find((p) => p.id === 'moc-p44')!;
    for (const stage of p44.stages) {
      // 星启（index 0）额外带「贪饕」附属 buff【阿哈帮大忙了】（2026-11-06 用户裁定按关卡 buff 接）
      expect(mechanicIdsFor(resolveMechanics(p44, stage).map((m) => m.name))).toEqual(
        stage.index === 0 ? ['naturalSelection', 'ahaHelp'] : ['naturalSelection'],
      );
    }
  });
});
