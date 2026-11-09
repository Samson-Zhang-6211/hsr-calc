import { describe, expect, it } from 'vitest';
import { countEidolons, descriptorOf, detectMenuPage, type ImageFrame } from './pages.js';

function frame(w: number, h: number, paint?: (px: (x: number, y: number, r: number, g: number, b: number) => void) => void): ImageFrame {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255;
  const px = (x: number, y: number, r: number, g: number, b: number): void => {
    const p = (y * w + x) * 4;
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
  };
  paint?.(px);
  return { data, width: w, height: h };
}

describe('视频页识别（纯函数）', () => {
  it('左侧金色选中项 → 页面类型', () => {
    const f = frame(200, 200, (px) => {
      for (let y = 72; y < 80; y++) for (let x = 22; x < 40; x++) px(x, y, 235, 190, 90);
    });
    expect(detectMenuPage(f)).toBe('traces');
  });

  it('16×16 描述子：纯红 → 红色直方图 + 亮度网格', () => {
    const d = descriptorOf(frame(16, 16, (px) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, 255, 0, 0);
    }));
    expect(Math.round(d.grid[0] * 1000) / 1000).toBe(0.299);
    expect(d.hist[48]).toBe(1);
    expect(d.hist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('星魂计数：已解锁 = 白色亮环，锁定 = 灰色环', () => {
    const f = frame(400, 400, (px) => {
      for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) px(x, y, 70, 70, 70);
      // E1 (0.3403,0.1528) / E2 (0.5407,0.0903) 画白色环；其余保持灰
      for (const [cx, cy] of [[136, 61], [216, 36]] as const) {
        for (let y = cy - 12; y <= cy + 12; y++) for (let x = cx - 12; x <= cx + 12; x++) px(x, y, 240, 240, 240);
      }
    });
    expect(countEidolons(f)).toBe(2);
  });
});
