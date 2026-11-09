import { describe, expect, it } from 'vitest';
import { ENGINE_PACKAGE } from '../src/index.js';

describe('engine 包骨架', () => {
  it('可被导入', () => {
    expect(ENGINE_PACKAGE).toBe('@hsr-calc/engine');
  });
});
