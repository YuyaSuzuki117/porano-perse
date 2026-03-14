export type ColorBlindType =
  | 'normal'
  | 'protanopia'     // red-blind
  | 'deuteranopia'   // green-blind
  | 'tritanopia'     // blue-blind
  | 'achromatopsia'; // total color blindness

/**
 * Brettel/Vienot/Mollon algorithm — LMS color space matrix transformations
 * for simulating color vision deficiency.
 */

// sRGB to Linear RGB
function srgbToLinear(c: number): number {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Linear RGB to sRGB
function linearToSrgb(c: number): number {
  c = Math.max(0, Math.min(1, c));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

// RGB to LMS conversion matrix
const RGB_TO_LMS: [number, number, number][] = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
];

// LMS to RGB conversion matrix (inverse of above)
const LMS_TO_RGB: [number, number, number][] = [
  [5.47221206, -4.64196010, 0.16963708],
  [-1.12524190, 2.29317094, -0.16789520],
  [0.02980165, -0.19318073, 1.16364789],
];

// Simulation matrices in LMS space (Vienot 1999)
const SIM_MATRICES: Record<string, [number, number, number][]> = {
  protanopia: [
    [0.0, 1.05118294, -0.05116099],
    [0.0, 1.0, 0.0],
    [0.0, 0.0, 1.0],
  ],
  deuteranopia: [
    [1.0, 0.0, 0.0],
    [0.9513092, 0.0, 0.04866992],
    [0.0, 0.0, 1.0],
  ],
  tritanopia: [
    [1.0, 0.0, 0.0],
    [0.0, 1.0, 0.0],
    [-0.86744736, 1.86727089, 0.0],
  ],
};

function matMul3(mat: [number, number, number][], vec: [number, number, number]): [number, number, number] {
  return [
    mat[0][0] * vec[0] + mat[0][1] * vec[1] + mat[0][2] * vec[2],
    mat[1][0] * vec[0] + mat[1][1] * vec[1] + mat[1][2] * vec[2],
    mat[2][0] * vec[0] + mat[2][1] * vec[1] + mat[2][2] * vec[2],
  ];
}

function simulateRGB(
  r: number,
  g: number,
  b: number,
  type: ColorBlindType
): [number, number, number] {
  if (type === 'normal') return [r, g, b];

  // Convert to linear RGB
  const linR = srgbToLinear(r);
  const linG = srgbToLinear(g);
  const linB = srgbToLinear(b);

  if (type === 'achromatopsia') {
    // Total color blindness: convert to luminance
    const lum = 0.2126 * linR + 0.7152 * linG + 0.0722 * linB;
    return [linearToSrgb(lum), linearToSrgb(lum), linearToSrgb(lum)];
  }

  // Convert to LMS
  const lms = matMul3(RGB_TO_LMS, [linR, linG, linB]);

  // Apply simulation matrix
  const simMatrix = SIM_MATRICES[type];
  if (!simMatrix) return [r, g, b];
  const simLms = matMul3(simMatrix, lms);

  // Convert back to RGB
  const simRgb = matMul3(LMS_TO_RGB, simLms);

  return [
    linearToSrgb(simRgb[0]),
    linearToSrgb(simRgb[1]),
    linearToSrgb(simRgb[2]),
  ];
}

/**
 * Parse a CSS color string (hex or rgb) and return [r, g, b].
 */
function parseColor(color: string): [number, number, number] | null {
  // Hex: #RGB, #RRGGBB
  const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }

  return null;
}

/**
 * Simulate color blindness on a single CSS color string.
 * Returns hex color string.
 */
export function simulateColorBlindness(color: string, type: ColorBlindType): string {
  if (type === 'normal') return color;

  const rgb = parseColor(color);
  if (!rgb) return color;

  const [r, g, b] = simulateRGB(rgb[0], rgb[1], rgb[2], type);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Simulate color blindness on an entire HTMLCanvasElement.
 * Returns a new canvas with the simulated colors.
 */
export function simulateImageColorBlindness(
  canvas: HTMLCanvasElement,
  type: ColorBlindType
): HTMLCanvasElement {
  const { width, height } = canvas;
  const srcCtx = canvas.getContext('2d');
  if (!srcCtx) return canvas;

  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  const dstCtx = result.getContext('2d');
  if (!dstCtx) return canvas;

  const imageData = srcCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = simulateRGB(data[i], data[i + 1], data[i + 2], type);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    // Alpha unchanged
  }

  dstCtx.putImageData(imageData, 0, 0);
  return result;
}
