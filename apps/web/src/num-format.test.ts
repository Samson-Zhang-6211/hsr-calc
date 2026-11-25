import { describe, expect, it } from 'vitest';
import { fmtNum } from './num-format';

describe('fmtNum', () => {
  it('去掉浮点噪声尾巴', () => {
    expect(fmtNum(234.09951999999998)).toBe('234.1');
    expect(fmtNum(0.19439401499999998, 4)).toBe('0.1944');
    expect(fmtNum(139.332)).toBe('139.332');
  });

  it('整数与尾随 0 不在显示里留残渣', () => {
    expect(fmtNum(100)).toBe('100');
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(93.45699999999999)).toBe('93.457');
  });

  it('四舍五入后的 -0 归一到 0', () => {
    expect(fmtNum(-0.0001)).toBe('0');
  });

  it('空值/非有限值给占位符', () => {
    expect(fmtNum(undefined)).toBe('—');
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(Number.NaN)).toBe('—');
    expect(fmtNum(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
