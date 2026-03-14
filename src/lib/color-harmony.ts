/**
 * カラーハーモニーユーティリティ
 * hex色文字列ベースの調和色計算
 */

export type HarmonyType = 'complementary' | 'analogous' | 'triadic' | 'split-complementary';

// --- 内部HSL変換ユーティリティ ---

interface HSL {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

interface RGB {
  r: number; // 0-255
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: RGB): string {
  const toHex = (n: number): string => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }

  return { h: h * 360, s, l };
}

function hslToRgb(hsl: HSL): RGB {
  const { h, s, l } = hsl;

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = h / 360;

  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  };
}

function hexToHsl(hex: string): HSL {
  return rgbToHsl(hexToRgb(hex));
}

function hslToHex(hsl: HSL): string {
  return rgbToHex(hslToRgb(hsl));
}

function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

// --- パブリックAPI ---

/**
 * 基準色から調和色を生成する
 * @param baseColor hex色 (#RRGGBB)
 * @param count 生成する色数 (2-6, デフォルト4)
 * @param harmonyType ハーモニータイプ (デフォルト: analogous)
 */
export function suggestHarmonious(
  baseColor: string,
  count: number = 4,
  harmonyType: HarmonyType = 'analogous'
): string[] {
  const base = hexToHsl(baseColor);
  const results: HSL[] = [];
  const clampedCount = Math.max(2, Math.min(6, count));

  switch (harmonyType) {
    case 'complementary': {
      results.push(base);
      results.push({ ...base, h: wrapHue(base.h + 180) });
      // 追加の色はベースと補色の間を補間
      for (let i = 2; i < clampedCount; i++) {
        const ratio = i / clampedCount;
        results.push({
          h: wrapHue(base.h + 180 * ratio),
          s: base.s * (0.7 + 0.3 * ratio),
          l: Math.min(0.85, base.l + 0.1 * (i % 2 === 0 ? 1 : -1)),
        });
      }
      break;
    }
    case 'analogous': {
      const spread = 30;
      for (let i = 0; i < clampedCount; i++) {
        const offset = (i - Math.floor(clampedCount / 2)) * spread;
        results.push({
          h: wrapHue(base.h + offset),
          s: Math.max(0.15, Math.min(1, base.s + (i % 2 === 0 ? 0.05 : -0.05))),
          l: Math.max(0.2, Math.min(0.85, base.l + (i % 2 === 0 ? 0.08 : -0.08))),
        });
      }
      break;
    }
    case 'triadic': {
      results.push(base);
      results.push({ ...base, h: wrapHue(base.h + 120) });
      results.push({ ...base, h: wrapHue(base.h + 240) });
      for (let i = 3; i < clampedCount; i++) {
        results.push({
          h: wrapHue(base.h + 120 * (i - 2)),
          s: base.s * 0.7,
          l: Math.min(0.9, base.l + 0.15),
        });
      }
      break;
    }
    case 'split-complementary': {
      results.push(base);
      results.push({ ...base, h: wrapHue(base.h + 150) });
      results.push({ ...base, h: wrapHue(base.h + 210) });
      for (let i = 3; i < clampedCount; i++) {
        results.push({
          h: wrapHue(base.h + (i % 2 === 0 ? 30 : -30)),
          s: base.s * 0.8,
          l: Math.min(0.85, base.l + 0.1),
        });
      }
      break;
    }
  }

  return results.slice(0, clampedCount).map(hslToHex);
}

/**
 * 既存の色配列からハーモニータイプを推定する
 * @param colors hex色の配列
 * @returns 検出されたハーモニータイプ
 */
export function getHarmonyType(colors: string[]): HarmonyType {
  if (colors.length < 2) return 'analogous';

  const hues = colors.map((c) => hexToHsl(c).h);
  const diffs: number[] = [];

  for (let i = 1; i < hues.length; i++) {
    let diff = Math.abs(hues[i] - hues[0]);
    if (diff > 180) diff = 360 - diff;
    diffs.push(diff);
  }

  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

  if (avgDiff < 45) return 'analogous';
  if (diffs.some((d) => d > 165 && d < 195)) return 'complementary';
  if (diffs.some((d) => d > 110 && d < 130)) return 'triadic';
  if (diffs.some((d) => d > 140 && d < 165) || diffs.some((d) => d > 195 && d < 220)) {
    return 'split-complementary';
  }

  return 'analogous';
}

/**
 * プライマリ色とセカンダリ色からアクセント色を提案する
 * 両色に対してバランスの取れたポジションを選ぶ
 */
export function suggestAccentColor(primaryColor: string, secondaryColor: string): string {
  const primary = hexToHsl(primaryColor);
  const secondary = hexToHsl(secondaryColor);

  // 両色のhueの中間 + 120度オフセット
  const midHue = (primary.h + secondary.h) / 2;
  const accentHue = wrapHue(midHue + 120);

  // 彩度は高め、明度は中間
  const accentS = Math.min(1, Math.max(primary.s, secondary.s) + 0.15);
  const accentL = (primary.l + secondary.l) / 2;

  return hslToHex({ h: accentHue, s: accentS, l: accentL });
}

/**
 * 2色間の知覚的距離 (CIE76 近似)
 * Lab色空間での簡易ユークリッド距離
 */
export function colorDistance(a: string, b: string): number {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);

  // sRGB → 線形RGB
  const linearize = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const toXyz = (rgb: RGB) => {
    const r = linearize(rgb.r);
    const g = linearize(rgb.g);
    const b = linearize(rgb.b);
    return {
      x: 0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
      y: 0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
      z: 0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
    };
  };

  // D65 白色点
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;

  const f = (t: number): number => {
    return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  };

  const xyzToLab = (xyz: { x: number; y: number; z: number }) => {
    const fx = f(xyz.x / refX);
    const fy = f(xyz.y / refY);
    const fz = f(xyz.z / refZ);
    return {
      l: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz),
    };
  };

  const labA = xyzToLab(toXyz(rgbA));
  const labB = xyzToLab(toXyz(rgbB));

  return Math.sqrt(
    (labA.l - labB.l) ** 2 +
    (labA.a - labB.a) ** 2 +
    (labA.b - labB.b) ** 2
  );
}
