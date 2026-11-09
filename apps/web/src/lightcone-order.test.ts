import { describe, expect, it } from 'vitest';
import { orderLightcones } from './lightcone-order.js';
import type { RosterLightcone } from './data/lightcone-roster.js';

function lc(
  id: string,
  zh: string,
  path: string,
  rarity: number,
  en = zh,
): RosterLightcone {
  return { id, zh, en, path, rarity };
}

const A = lc('a', '甲', 'Warrior', 5);
const B = lc('b', '乙', 'Rogue', 5);
const C = lc('c', '丙', 'Warrior', 4);
const D = lc('d', '丁', 'Rogue', 4);
const E = lc('e', '戊', 'Warrior', 3);

describe('orderLightcones', () => {
  it('专武置顶，其余按同命途 > 星级倒序 > 名字', () => {
    const out = orderLightcones([A, B, C, D, E], {
      path: 'Warrior',
      signatureId: 'b',
    });
    expect(out.map((x) => x.id)).toEqual(['b', 'a', 'c', 'e', 'd']);
  });

  it('无专武时同命途在前，组内星级倒序', () => {
    const out = orderLightcones([B, D, A, C, E], { path: 'Warrior' });
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('同命途同星级按名字稳定排序（zh/en 不同次序）', () => {
    const x = lc('x', '安', 'Rogue', 4, 'Zebra');
    const y = lc('y', '贝', 'Rogue', 4, 'Apple');
    expect(orderLightcones([y, x], { path: 'Rogue' }).map((n) => n.id)).toEqual([
      'x',
      'y',
    ]);
    expect(
      orderLightcones([y, x], { path: 'Rogue', lang: 'en' }).map((n) => n.id),
    ).toEqual(['y', 'x']);
  });

  it('4★ 角色不启用专武置顶', () => {
    const out = orderLightcones([A, B, C, D, E], { path: 'Warrior', signatureId: 'b', rarity: 4 });
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('开拓者不启用专武置顶（多形态）', () => {
    const out = orderLightcones([A, B, C, D, E], {
      path: 'Warrior',
      signatureId: 'b',
      rarity: 5,
      isTrailblazer: true,
    });
    expect(out.map((x) => x.id)).toEqual(['a', 'c', 'e', 'b', 'd']);
  });

  it('5★ 非开拓者：专武置顶 → 同命途 → 组内 5★→3★', () => {
    const out = orderLightcones([A, B, C, D, E], { path: 'Warrior', signatureId: 'b', rarity: 5 });
    expect(out.map((x) => x.id)).toEqual(['b', 'a', 'c', 'e', 'd']);
  });

  it('不修改入参，且未提供 path/signatureId 时仅按星级+名字', () => {
    const input = [C, A, E];
    const out = orderLightcones(input);
    expect(input.map((n) => n.id)).toEqual(['c', 'a', 'e']);
    expect(out.map((n) => n.id)).toEqual(['a', 'c', 'e']);
  });
});
