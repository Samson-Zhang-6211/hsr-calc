import { describe, expect, it } from 'vitest';
import { baseAttackOf } from './base-attack.js';

describe('baseAttackOf（基础攻击力 = 角色 + 光锥）', () => {
  it('流萤 + 记一位星神的陨落 = 1053（录像局内面板实测）', () => {
    expect(baseAttackOf('1310', '24000')).toBe(1053);
  });
  it('大丽花 1155 / 忘归人 1111 / 丹恒 1217（四格录像面板实测）', () => {
    expect(baseAttackOf('1321', '22000')).toBe(1155);
    expect(baseAttackOf('1225', '24003')).toBe(1111);
    expect(baseAttackOf('1414', '23026')).toBe(1217);
  });
  it('未知角色 / 未知光锥 → 缺省返回 undefined（引擎回退旧口径）', () => {
    expect(baseAttackOf('unknown', '24000')).toBeUndefined();
    expect(baseAttackOf('1310', '99999')).toBe(524);
    expect(baseAttackOf(undefined, '24000')).toBeUndefined();
  });
});
