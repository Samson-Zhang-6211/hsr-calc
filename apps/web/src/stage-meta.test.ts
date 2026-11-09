import { describe, expect, it } from 'vitest';
import { stageMetaOf, stagePreset } from './monster-presets';
import type { StoredBattleEntry } from './storage';

// ── 战报的关卡上下文（第四十六轮）──
// 历史记录现在会带 `stage`（哪一段 + 哪些机制）；旧战报没有该字段，必须保持兼容。
// 这里只验纯数据层：`stageMetaOf` 的取值、以及「有无 stage 的条目都能原样序列化/读回」。

describe('战报关卡上下文', () => {
  it('boss 关带上下半；单段关不带 half', () => {
    const half = stageMetaOf(stagePreset('moc-p43|12|下半'))!;
    expect(half.packId).toBe('moc-p43');
    expect(half.stageIndex).toBe(12);
    expect(half.half).toBe('下半');
    expect(half.level).toBeGreaterThan(0);
    expect(half.mechanics).toEqual(['记忆紊流']);

    const single = stageMetaOf(stagePreset('arb-p10|3|'))!;
    expect(single.half).toBeUndefined();
    expect(single.mechanics).toEqual(['闭锁']);

    // 星启关**继承包级机制**（混沌的记忆紊流挂在包级 → 星启也有）
    const mocStar = stageMetaOf(stagePreset('moc-p43|0|'))!;
    expect(mocStar.mechanics).toEqual(['记忆紊流']);
    expect(mocStar.half).toBeUndefined();
    // 无机制包的星启 → 空数组（而不是省略字段）
    const pureStar = stageMetaOf(stagePreset('pure-p27|0|'))!;
    expect(pureStar.mechanics).toEqual([]);

    expect(stageMetaOf(undefined)).toBeUndefined();
  });

  it('旧战报（没有 stage 字段）与新战报（有 stage）都能 JSON 往返', () => {
    const legacy = {
      id: 'old-1',
      time: 1,
      summary: 'x',
      total: 100,
      result: { events: [], hits: [] },
    };
    const roundTripLegacy = JSON.parse(JSON.stringify(legacy)) as StoredBattleEntry;
    expect(roundTripLegacy.stage).toBeUndefined();

    const fresh: Pick<StoredBattleEntry, 'id' | 'time' | 'summary' | 'total' | 'stage'> = {
      id: 'new-1',
      time: 2,
      summary: 'y',
      total: 200,
      stage: stageMetaOf(stagePreset('arb-p10|2|')),
    };
    const roundTrip = JSON.parse(JSON.stringify(fresh)) as StoredBattleEntry;
    expect(roundTrip.stage?.mechanics).toEqual(['血嗜+', '洞穿+', '不屈']);
    expect(roundTrip.stage?.stageIndex).toBe(2);
  });
});
