import { describe, expect, it } from 'vitest';
import {
  STAGE_PACKS,
  STAGE_SCALES_BY_GROUP,
  buildPackStageWaves,
  mechanicIdsFor,
  type StageDef,
} from '../src/index.js';

// ── 关卡包数据完整性（2026-10-30 第三十三轮）──
// `stage-packs-smoke` 只验证「跑得动」，`stage-boss-signatures` 验证「机制触发」；
// 本文件补的是**数据结构本身**：怪 id / 血量 / 等级 / 弱点 / 段位切分 / 机制名映射。
// 这一层最容易在改 `data/monster-stages/*.json` 或 `gen-monster-stages.mjs` 时静默坏掉
// （例如 halves 丢了、hp 变成 0、弱点写成非法元素），而「跑得动」的用例照样绿。

// 元素键用游戏内部名：雷 = `Thunder`（不是 `Lightning`），见 packages/shared 的 `Element`
const ELEMENTS = new Set(['Physical', 'Fire', 'Ice', 'Thunder', 'Wind', 'Quantum', 'Imaginary']);

/** 段位合法形态：boss 有 ≥1 个 half，非 boss 有 ≥1 个 wave；两者互斥 */
function sectionsOf(stage: StageDef) {
  if (stage.kind === 'boss') {
    expect(stage.halves.length, `${stage.name} 缺 halves`).toBeGreaterThan(0);
    expect(stage.waves.length, `${stage.name} boss 不应自带 waves`).toBe(0);
    for (const half of stage.halves) {
      expect(['上半', '下半'], `${stage.name} half 名非法`).toContain(half.half);
      expect(half.waves.length, `${stage.name}/${half.half} 无波次`).toBeGreaterThan(0);
      expect(half.hp, `${stage.name}/${half.half} 血量非正`).toBeGreaterThan(0);
      expect(half.level, `${stage.name}/${half.half} 等级非法`).toBeGreaterThanOrEqual(1);
      for (const tag of half.tags) expect(ELEMENTS.has(tag), `非法弱点 ${tag}`).toBe(true);
    }
    return stage.halves.map((h) => ({ label: `${stage.name}/${h.half}`, waves: h.waves }));
  }
  expect(stage.waves.length, `${stage.name} 无波次`).toBeGreaterThan(0);
  for (const tag of stage.tags ?? []) expect(ELEMENTS.has(tag), `非法弱点 ${tag}`).toBe(true);
  return [{ label: stage.name, waves: stage.waves }];
}

describe('关卡包 · 数据完整性', () => {
  it('5 包 / 13 关（数据 24 关，按裁定只暴露最难关 + 星启 + 仲裁 5 关）', () => {
    expect(STAGE_PACKS.length).toBe(5);
    let stageCount = 0;
    for (const pack of STAGE_PACKS) {
      expect(pack.id).toMatch(/^(moc|pure|apo|arb)-p\d+$/);
      expect(['moc', 'pure', 'apo', 'arb']).toContain(pack.mode);
      expect(pack.id.startsWith(pack.mode)).toBe(true);
      expect(pack.title.length).toBeGreaterThan(0);
      expect(['forgotten', 'arbiter', 'phantom']).toContain(pack.roundMode);
      // 难度乘区组必须真实存在，否则 gen 时血量会算成 NaN
      expect(Object.keys(STAGE_SCALES_BY_GROUP)).toContain(String(pack.difficultyGroup));
      expect(pack.stages.length).toBeGreaterThan(0);
      for (const stage of pack.stages) {
        stageCount += 1;
        expect(stage.name.length, `${pack.id}#${stage.index} 无名`).toBeGreaterThan(0);
        expect(stage.index).toBeGreaterThanOrEqual(0);
        expect(stage.totalHp, `${stage.name} totalHp 非正`).toBeGreaterThan(0);
        sectionsOf(stage);
      }
      // 同一包内 index 不得重复（前端按 index 选择）
      const idx = pack.stages.map((s) => s.index);
      expect(new Set(idx).size, `${pack.id} 段位 index 重复`).toBe(idx.length);
    }
    // `data/monster-stages/*.json` 共 24 关；对外（用户裁定）只暴露各模式最难关 + 星启 + 仲裁 5 关 = 13
    expect(stageCount).toBe(13);
  });

  it('每个敌人条目都有合法 id / 血量 / 只数，且能被 buildPackStageWaves 组出波次', () => {
    for (const pack of STAGE_PACKS) {
      for (const stage of pack.stages) {
        const halves = stage.kind === 'boss' ? stage.halves.map((h) => h.half) : [undefined];
        for (const half of halves) {
          const label = `${pack.id}#${stage.index}${half ? '/' + half : ''}`;
          const waves = buildPackStageWaves(pack.id, stage.index, half as '上半' | '下半' | undefined);
          expect(waves.length, `${label} 无波次`).toBeGreaterThan(0);
          for (const wave of waves) {
            expect(wave.length, `${label} 空波次`).toBeGreaterThan(0);
            for (const foe of wave) {
              expect(foe.monsterId, `${label} 怪 id 非法`).toMatch(/^\d+$/);
              expect(foe.hp, `${label} ${foe.monsterId} 血量非正`).toBeGreaterThan(0);
              // 注：`MonsterConfig` 没有 `count`（数据层的只数已在 `buildPackStageWaves` 展开成多个配置），
              //     所以这里只能校验展开后的每一份配置本身。
              expect(foe.maxToughness ?? 0, `${label} ${foe.monsterId} 韧性非负`).toBeGreaterThanOrEqual(0);
              expect(foe.level ?? 1, `${label} ${foe.monsterId} 等级非法`).toBeGreaterThanOrEqual(1);
              expect(foe.speed ?? 1, `${label} ${foe.monsterId} 速度非正`).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it('包级机制名全部能映射到引擎 id（未收录的会拿到 undefined/空）', () => {
    let known = 0;
    for (const pack of STAGE_PACKS) {
      const names = (pack.modeMechanics ?? []).map((m) => m.name);
      const ids = mechanicIdsFor(names);
      // 每个机制对象都必须带非空 name + desc（tooltip 直接渲染这两个字段）
      for (const m of pack.modeMechanics ?? []) {
        expect(m.name.length, `${pack.id} 机制无 name`).toBeGreaterThan(0);
        expect(m.desc.length, `${pack.id} 机制 ${m.name} 无 desc`).toBeGreaterThan(0);
      }
      // 映射数量必须与「引擎支持的机制」一一对应，不能出现「有名字但没 id」
      expect(ids.length, `${pack.id} 机制未全部映射: ${names.join('/')}`).toBe(names.length);
      known += ids.length;
    }
    expect(known).toBeGreaterThan(0);
  });

  it('引擎已收录 11 项关卡机制（中文名 → id 全覆盖）', () => {
    const names = ['血嗜', '洞穿', '闭锁', '桎梏', '激怒', '狂喜之夜', '领航誓言', '记忆紊流', '末法余烬', '不屈', '胞吞作用'];
    const ids = mechanicIdsFor(names);
    expect(ids.length).toBe(names.length);
    expect(new Set(ids).size).toBe(names.length);
  });
});
