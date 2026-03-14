/**
 * Generate tile texture with visible grout lines that create depth illusion
 * via normal maps. Used for floor and wall tiles.
 */

export interface TileGroutConfig {
  tileSize: number; // tiles per row
  groutWidth: number; // 0.01-0.05 relative
  groutColor: string; // e.g. '#b0a898'
  tileColor: string; // base tile color
  tileVariation: number; // 0-1, color variation between tiles
  groutDepth: number; // 0-1, normal map depth intensity
  pattern: 'grid' | 'brick' | 'herringbone';
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

const textureCache = new Map<string, HTMLCanvasElement>();
const normalCache = new Map<string, HTMLCanvasElement>();
const roughnessCache = new Map<string, HTMLCanvasElement>();

function configHash(config: TileGroutConfig, size: number, suffix: string): string {
  return `${config.tileSize}-${config.groutWidth}-${config.groutColor}-${config.tileColor}-${config.tileVariation}-${config.groutDepth}-${config.pattern}-${size}-${suffix}`;
}

function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Simple seeded pseudo-random (mulberry32) so tile colours are stable per
 * config without needing external state.
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
// Tile layout helpers — each returns an array of tile rects (in pixels)
// that can be iterated for drawing.
// ---------------------------------------------------------------------

interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  col: number;
}

function layoutGrid(tileSize: number, groutPx: number, canvasSize: number): TileRect[] {
  const tilePx = (canvasSize - groutPx) / tileSize - groutPx / tileSize;
  const step = (canvasSize - groutPx) / tileSize;
  const rects: TileRect[] = [];
  for (let row = 0; row < tileSize; row++) {
    for (let col = 0; col < tileSize; col++) {
      rects.push({
        x: groutPx + col * step,
        y: groutPx + row * step,
        w: step - groutPx,
        h: step - groutPx,
        row,
        col,
      });
    }
  }
  return rects;
}

function layoutBrick(tileSize: number, groutPx: number, canvasSize: number): TileRect[] {
  const step = (canvasSize - groutPx) / tileSize;
  const rects: TileRect[] = [];
  for (let row = 0; row < tileSize; row++) {
    const offset = row % 2 === 1 ? step / 2 : 0;
    for (let col = 0; col < tileSize; col++) {
      rects.push({
        x: groutPx + col * step + offset,
        y: groutPx + row * step,
        w: step - groutPx,
        h: step - groutPx,
        row,
        col,
      });
    }
  }
  return rects;
}

function layoutHerringbone(tileSize: number, groutPx: number, canvasSize: number): TileRect[] {
  const unitW = canvasSize / tileSize;
  const unitH = unitW / 2;
  const rects: TileRect[] = [];
  let id = 0;
  for (let row = 0; row < tileSize * 2; row++) {
    for (let col = 0; col < tileSize; col++) {
      const isVertical = (row + col) % 2 === 0;
      const x = col * unitW + (row % 2 === 1 ? unitW / 2 : 0);
      const y = row * unitH;
      rects.push({
        x: x + groutPx / 2,
        y: y + groutPx / 2,
        w: (isVertical ? unitH : unitW) - groutPx,
        h: (isVertical ? unitW : unitH) - groutPx,
        row,
        col: id++,
      });
    }
  }
  return rects;
}

function getLayout(config: TileGroutConfig, size: number): { rects: TileRect[]; groutPx: number } {
  const groutPx = Math.max(1, Math.round(config.groutWidth * size));
  switch (config.pattern) {
    case 'brick':
      return { rects: layoutBrick(config.tileSize, groutPx, size), groutPx };
    case 'herringbone':
      return { rects: layoutHerringbone(config.tileSize, groutPx, size), groutPx };
    case 'grid':
    default:
      return { rects: layoutGrid(config.tileSize, groutPx, size), groutPx };
  }
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Generate the diffuse / albedo tile texture.
 * Each tile gets a slight hue-shifted colour based on `tileVariation`.
 */
export function generateTileTexture(config: TileGroutConfig, size: number): HTMLCanvasElement {
  const key = configHash(config, size, 'tex');
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Fill grout background
  ctx.fillStyle = config.groutColor;
  ctx.fillRect(0, 0, size, size);

  const { rects } = getLayout(config, size);
  const [baseR, baseG, baseB] = parseHexColor(config.tileColor);
  const rand = seededRandom(config.tileSize * 1000 + config.pattern.length);

  for (const rect of rects) {
    // Per-tile hue shift (simple RGB offset approach)
    const shift = (rand() - 0.5) * 2 * config.tileVariation * 10;
    const r = clamp(Math.round(baseR + shift * 2.55), 0, 255);
    const g = clamp(Math.round(baseG + shift * 1.8), 0, 255);
    const b = clamp(Math.round(baseB + shift * 1.2), 0, 255);

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  textureCache.set(key, canvas);
  return canvas;
}

/**
 * Generate a tangent-space normal map where grout lines appear concave.
 *
 * Flat surface = (128, 128, 255).
 * Grout centre  = blue reduced  → concave look.
 * Grout edges   = R/G shifted   → slopes pointing away from grout centre.
 */
export function generateTileNormalMap(config: TileGroutConfig, size: number): HTMLCanvasElement {
  const key = configHash(config, size, 'nrm');
  if (normalCache.has(key)) return normalCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Start with flat normal everywhere
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  const { rects, groutPx } = getLayout(config, size);
  const depth = config.groutDepth;
  const edgeWidth = Math.max(1, Math.floor(groutPx * 1.5));

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  // Helper: mark a pixel as grout-depth normal
  const setPixel = (px: number, py: number, nr: number, ng: number, nb: number) => {
    if (px < 0 || px >= size || py < 0 || py >= size) return;
    const idx = (py * size + px) * 4;
    data[idx] = clamp(Math.round(nr), 0, 255);
    data[idx + 1] = clamp(Math.round(ng), 0, 255);
    data[idx + 2] = clamp(Math.round(nb), 0, 255);
    data[idx + 3] = 255;
  };

  // For every tile rect, encode edge normals around each tile.
  for (const rect of rects) {
    const x0 = Math.round(rect.x);
    const y0 = Math.round(rect.y);
    const x1 = Math.round(rect.x + rect.w);
    const y1 = Math.round(rect.y + rect.h);

    for (let e = 1; e <= edgeWidth; e++) {
      const t = e / edgeWidth; // 0→1 from tile surface into grout
      const slopeStrength = depth * 127 * (1 - t * 0.5);

      // Left edge — normal points left (R < 128)
      for (let py = y0; py < y1; py++) {
        setPixel(x0 - e, py, 128 - slopeStrength, 128, 255 - depth * 60 * t);
      }
      // Right edge — normal points right (R > 128)
      for (let py = y0; py < y1; py++) {
        setPixel(x1 + e - 1, py, 128 + slopeStrength, 128, 255 - depth * 60 * t);
      }
      // Top edge — normal points up (G < 128)
      for (let px = x0; px < x1; px++) {
        setPixel(px, y0 - e, 128, 128 - slopeStrength, 255 - depth * 60 * t);
      }
      // Bottom edge — normal points down (G > 128)
      for (let px = x0; px < x1; px++) {
        setPixel(px, y1 + e - 1, 128, 128 + slopeStrength, 255 - depth * 60 * t);
      }
    }

    // Grout centre — reduce blue channel for concave look
    // (Pixels not covered by tile rects are grout; set their blue lower.)
  }

  // Second pass: any pixel that is still the background grout colour in the
  // original diffuse layout gets a reduced blue channel to look concave.
  const { rects: checkRects } = getLayout(config, size);
  const isTile = new Uint8Array(size * size);
  for (const rect of checkRects) {
    const x0 = clamp(Math.round(rect.x), 0, size);
    const y0 = clamp(Math.round(rect.y), 0, size);
    const x1 = clamp(Math.round(rect.x + rect.w), 0, size);
    const y1 = clamp(Math.round(rect.y + rect.h), 0, size);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        isTile[py * size + px] = 1;
      }
    }
  }

  for (let i = 0; i < size * size; i++) {
    if (!isTile[i]) {
      const idx = i * 4;
      // Only adjust if it hasn't been slope-encoded already
      if (data[idx] === 128 && data[idx + 1] === 128) {
        data[idx + 2] = clamp(Math.round(255 - depth * 80), 0, 255);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  normalCache.set(key, canvas);
  return canvas;
}

/**
 * Generate roughness map.
 * - Grout areas:  0.9  (matte)
 * - Tile surface:  0.3  (slightly glossy) ± 0.1 per-tile variation
 */
export function generateTileRoughnessMap(config: TileGroutConfig, size: number): HTMLCanvasElement {
  const key = configHash(config, size, 'rgh');
  if (roughnessCache.has(key)) return roughnessCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Default: grout roughness 0.9
  const groutVal = Math.round(0.9 * 255);
  ctx.fillStyle = `rgb(${groutVal},${groutVal},${groutVal})`;
  ctx.fillRect(0, 0, size, size);

  const { rects } = getLayout(config, size);
  const rand = seededRandom(config.tileSize * 7777 + config.pattern.length * 3);

  for (const rect of rects) {
    const variation = (rand() - 0.5) * 0.2; // ±0.1
    const roughness = clamp(0.3 + variation, 0, 1);
    const val = Math.round(roughness * 255);
    ctx.fillStyle = `rgb(${val},${val},${val})`;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  roughnessCache.set(key, canvas);
  return canvas;
}
