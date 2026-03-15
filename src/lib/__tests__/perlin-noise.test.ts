import { describe, it, expect } from 'vitest';
import { perlin2d } from '../perlin-noise-texture';

describe('perlin-noise', () => {
  it('perlin2d: 出力が -1.0 〜 1.0 の範囲内', () => {
    // 多数のサンプル点で範囲チェック
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const value = perlin2d(x, y);
      expect(value).toBeGreaterThanOrEqual(-1.0);
      expect(value).toBeLessThanOrEqual(1.0);
    }
  });

  it('perlin2d: 同じ入力は同じ出力（決定的）', () => {
    const a = perlin2d(3.14, 2.71);
    const b = perlin2d(3.14, 2.71);
    expect(a).toBe(b);
  });
});
