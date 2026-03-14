import { WoodType } from '@/types/scene';

/**
 * 木目バリエーション生成 — インスタンスごとにシード値でユニークな木目を生成
 * Canvas APIプロシージャル生成（外部画像不使用）
 */

/** シード付き疑似乱数生成器 */
const seededRandom = (seed: number): number => {
  const s = Math.sin(seed) * 43758.5453;
  return s - Math.floor(s);
};

/** シード付きランダムシーケンス生成 */
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state += 1;
    return seededRandom(this.state);
  }

  /** min ~ max の範囲 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 整数: min ~ max（inclusive） */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

/** 木材の基本色定義 */
const WOOD_BASE_COLORS: Record<WoodType, { base: [number, number, number]; shades: [number, number, number][] }> = {
  oak:      { base: [180, 140, 80],  shades: [[170, 130, 70], [190, 150, 90], [175, 135, 75]] },
  walnut:   { base: [85, 55, 30],    shades: [[75, 45, 20], [95, 65, 40], [80, 50, 25]] },
  pine:     { base: [220, 195, 150], shades: [[210, 185, 140], [230, 205, 160], [215, 190, 145]] },
  birch:    { base: [235, 220, 195], shades: [[225, 210, 185], [240, 225, 200], [230, 215, 190]] },
  mahogany: { base: [120, 40, 20],   shades: [[110, 30, 15], [130, 50, 30], [115, 35, 18]] },
  teak:     { base: [160, 110, 55],  shades: [[150, 100, 45], [170, 120, 65], [155, 105, 50]] },
  ash:      { base: [230, 220, 200], shades: [[220, 210, 190], [235, 225, 205], [225, 215, 195]] },
  kiri:     { base: [210, 190, 165], shades: [[200, 180, 155], [220, 200, 175], [205, 185, 160]] },
};

/** 色相シフト（HSL空間で±10°回転） */
function applyHueShift(r: number, g: number, b: number, shiftDeg: number): [number, number, number] {
  // RGB → HSL
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    // 無彩色 — シフト不要
    return [r, g, b];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  // 色相シフト適用
  h = (h + shiftDeg / 360 + 1) % 1;

  // HSL → RGB
  const hue2rgb = (p: number, q: number, t: number): number => {
    const tt = ((t % 1) + 1) % 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/** テクスチャキャッシュ */
const variationCache = new Map<string, HTMLCanvasElement>();

/**
 * シード値に基づいたユニークな木目テクスチャを生成
 *
 * 同じ woodType + seed の組み合わせは常に同じテクスチャを返す。
 * 異なる seed では木目の間隔、節の位置、色相、木目角度が変化する。
 *
 * @param woodType - 木材タイプ (oak, walnut, pine, birch, mahogany, teak, ash, kiri)
 * @param seed - バリエーション用シード値
 * @param resolution - テクスチャ解像度 (デフォルト 512)
 * @returns HTMLCanvasElement — THREE.CanvasTexture に渡して使用
 */
export function generateVariedWoodTexture(
  woodType: WoodType,
  seed: number,
  resolution: number = 512,
): HTMLCanvasElement {
  const key = `varied-wood-${woodType}-${seed}-${resolution}`;
  const cached = variationCache.get(key);
  if (cached) return cached;

  const rng = new SeededRNG(seed * 7919); // 素数でスケーリングして偏り軽減
  const width = resolution;
  const height = resolution;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const colors = WOOD_BASE_COLORS[woodType];

  // --- シードに基づくバリエーションパラメータ ---
  const hueShift = rng.range(-10, 10);         // 色相シフト ±10°
  const grainAngle = rng.range(-15, 15);        // 木目角度 ±15°
  const grainSpacingMul = rng.range(0.6, 1.5);  // 木目間隔倍率
  const knotCount = rng.int(0, 3);              // 節の数
  const crossGrainCount = rng.int(2, 7);        // クロスグレイン数

  // 色相シフト適用
  const [br, bg, bb] = applyHueShift(colors.base[0], colors.base[1], colors.base[2], hueShift);
  const shiftedShades = colors.shades.map(
    (shade) => applyHueShift(shade[0], shade[1], shade[2], hueShift),
  );

  // 木目角度を回転で表現
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((grainAngle * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  // ベースカラー（回転を考慮して大きく塗りつぶし）
  const expandFactor = 1.5; // 回転時に隅が見えないよう拡大
  const ex = width * (expandFactor - 1) / 2;
  const ey = height * (expandFactor - 1) / 2;
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(-ex, -ey, width * expandFactor, height * expandFactor);

  // 木目ライン（縦方向の平行線 + sin波の揺れ）
  const baseLineCount = Math.floor(width / 4);
  const lineCount = Math.max(8, Math.floor(baseLineCount * grainSpacingMul));
  const expandedWidth = width * expandFactor;
  const expandedHeight = height * expandFactor;

  for (let i = 0; i < lineCount; i++) {
    const shadeIdx = Math.floor(rng.next() * shiftedShades.length);
    const shade = shiftedShades[shadeIdx];
    const alpha = 0.12 + rng.next() * 0.28;
    ctx.strokeStyle = `rgba(${shade[0]},${shade[1]},${shade[2]},${alpha})`;
    ctx.lineWidth = 0.4 + rng.next() * 1.8;
    ctx.beginPath();
    const baseX = -ex + (i / lineCount) * expandedWidth;
    const amplitude = 1.5 + rng.next() * 2.5;
    const period = 30 + rng.next() * 30;
    const phase = rng.next() * Math.PI * 2;
    for (let y = -ey; y < expandedHeight - ey; y += 2) {
      const x = baseX + Math.sin((y / period) * Math.PI * 2 + phase) * amplitude;
      if (y === -ey) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 年輪ノット
  for (let k = 0; k < knotCount; k++) {
    const kx = rng.range(ex * 0.3, width - ex * 0.3);
    const ky = rng.range(ey * 0.3, height - ey * 0.3);
    const kRadius = 4 + rng.next() * 5;
    const darkShade = shiftedShades[0];
    const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kRadius);
    grad.addColorStop(0, `rgba(${Math.max(0, darkShade[0] - 30)},${Math.max(0, darkShade[1] - 30)},${Math.max(0, darkShade[2] - 20)},0.6)`);
    grad.addColorStop(0.5, `rgba(${Math.max(0, darkShade[0] - 15)},${Math.max(0, darkShade[1] - 15)},${Math.max(0, darkShade[2] - 10)},0.3)`);
    grad.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(kx - kRadius, ky - kRadius, kRadius * 2, kRadius * 2);

    // ノット周辺の同心年輪
    const ringCount = rng.int(2, 5);
    for (let ring = 1; ring <= ringCount; ring++) {
      ctx.strokeStyle = `rgba(${darkShade[0]},${darkShade[1]},${darkShade[2]},${0.12 / ring})`;
      ctx.lineWidth = 0.4 + rng.next() * 0.3;
      ctx.beginPath();
      ctx.arc(kx, ky, kRadius + ring * (1.5 + rng.next() * 1.5), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // クロスグレイン
  for (let c = 0; c < crossGrainCount; c++) {
    const cy = rng.next() * expandedHeight - ey;
    const shade = shiftedShades[1] || shiftedShades[0];
    ctx.strokeStyle = `rgba(${shade[0]},${shade[1]},${shade[2]},${0.05 + rng.next() * 0.06})`;
    ctx.lineWidth = 0.3 + rng.next() * 0.5;
    ctx.beginPath();
    ctx.moveTo(-ex, cy);
    ctx.lineTo(expandedWidth - ex, cy + rng.range(-4, 4));
    ctx.stroke();
  }

  ctx.restore();

  variationCache.set(key, canvas);
  return canvas;
}

/**
 * バリエーションキャッシュをクリア
 * メモリ圧迫時に呼び出し
 */
export function clearVariationCache(): void {
  variationCache.clear();
}
