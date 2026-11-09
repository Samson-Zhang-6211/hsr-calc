/**
 * 种子化 PRNG（mulberry32）：同种子同序列。
 * 与 combat/battle.ts 内部 rand01 同算法（battle.ts 保持自带闭包副本，
 * 避免改动战斗热路径；两处如需统一再抽取）。
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
