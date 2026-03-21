/**
 * Blueprint JSON向けジオメトリユーティリティ
 * mm座標系での計算・変換
 */

import type { BlueprintWall } from '@/types/blueprint';

/** スケール文字列をパース ("1:60" → 60) */
export function parseScale(s: string): number {
  const m = s.match(/1\s*:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 50;
}

/** ポリゴンの面積を計算 (Shoelace公式, m²) */
export function polygonAreaM2(polygon: [number, number][]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    sum += polygon[i][0] * polygon[j][1];
    sum -= polygon[j][0] * polygon[i][1];
  }
  return Math.abs(sum) / 2 / 1_000_000;
}

/** 点がポリゴン内にあるか (Ray casting法) */
export function pointInPolygon(
  px: number,
  py: number,
  polygon: [number, number][]
): boolean {
  let inside = false;
  const n = polygon.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

/** 2点間距離 */
export function distanceMm(
  a: [number, number],
  b: [number, number]
): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** ポリゴンの重心 */
export function polygonCentroid(polygon: [number, number][]): [number, number] {
  if (polygon.length === 0) return [0, 0];
  const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
  return [cx, cy];
}

/**
 * mm座標 → Canvas pixel座標
 * blueprint JSON: mm, Y-up, 原点=左下
 * Canvas: px, Y-down, 原点=左上
 */
export function mmToCanvas(
  x_mm: number,
  y_mm: number,
  scale: number,
  dpi: number,
  pageHeightPx: number,
  zoom: number,
  panX: number,
  panY: number
): { cx: number; cy: number } {
  const paperX = x_mm / scale;
  const paperY = y_mm / scale;
  const imgX = (paperX * dpi) / 25.4;
  const imgY = pageHeightPx - (paperY * dpi) / 25.4;
  return {
    cx: imgX * zoom + panX,
    cy: imgY * zoom + panY,
  };
}

/**
 * Canvas pixel座標 → mm座標 (逆変換)
 */
export function canvasToMm(
  cx: number,
  cy: number,
  scale: number,
  dpi: number,
  pageHeightPx: number,
  zoom: number,
  panX: number,
  panY: number
): { x_mm: number; y_mm: number } {
  const imgX = (cx - panX) / zoom;
  const imgY = (cy - panY) / zoom;
  const paperX = (imgX * 25.4) / dpi;
  const paperY = ((pageHeightPx - imgY) * 25.4) / dpi;
  return {
    x_mm: Math.round(paperX * scale),
    y_mm: Math.round(paperY * scale),
  };
}

/** mm座標を1mm単位にスナップ */
export function snapMm(v: number): number {
  return Math.round(v);
}

// --- スナップ計算関数 ---

/** グリッドスナップ */
export function snapToGrid(x: number, y: number, gridSize: number): [number, number] {
  return [
    Math.round(x / gridSize) * gridSize,
    Math.round(y / gridSize) * gridSize,
  ];
}

/** 最近傍の点にスナップ (threshold mm以内) */
export function snapToNearestPoint(
  x: number,
  y: number,
  points: [number, number][],
  threshold: number
): [number, number] | null {
  let bestDist = Infinity;
  let bestPt: [number, number] | null = null;
  for (const pt of points) {
    const d = Math.hypot(x - pt[0], y - pt[1]);
    if (d < threshold && d < bestDist) {
      bestDist = d;
      bestPt = pt;
    }
  }
  return bestPt;
}

/** 点から線分への最短距離 */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** 点から線分上の最近点を返す */
export function nearestPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [x1, y1];
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return [x1 + t * dx, y1 + t * dy];
}

/** 壁線の端点・中点にスナップ */
export function snapToWallLine(
  x: number,
  y: number,
  walls: BlueprintWall[],
  threshold: number
): { point: [number, number]; type: 'endpoint' | 'midpoint' | 'line' } | null {
  let bestDist = Infinity;
  let bestResult: { point: [number, number]; type: 'endpoint' | 'midpoint' | 'line' } | null = null;

  for (const wall of walls) {
    // 端点チェック
    const startDist = Math.hypot(x - wall.start_x_mm, y - wall.start_y_mm);
    if (startDist < threshold && startDist < bestDist) {
      bestDist = startDist;
      bestResult = { point: [wall.start_x_mm, wall.start_y_mm], type: 'endpoint' };
    }
    const endDist = Math.hypot(x - wall.end_x_mm, y - wall.end_y_mm);
    if (endDist < threshold && endDist < bestDist) {
      bestDist = endDist;
      bestResult = { point: [wall.end_x_mm, wall.end_y_mm], type: 'endpoint' };
    }
    // 中点チェック
    const midX = (wall.start_x_mm + wall.end_x_mm) / 2;
    const midY = (wall.start_y_mm + wall.end_y_mm) / 2;
    const midDist = Math.hypot(x - midX, y - midY);
    if (midDist < threshold && midDist < bestDist) {
      bestDist = midDist;
      bestResult = { point: [midX, midY], type: 'midpoint' };
    }
    // 壁線上チェック
    const lineDist = distanceToSegment(x, y, wall.start_x_mm, wall.start_y_mm, wall.end_x_mm, wall.end_y_mm);
    if (lineDist < threshold && lineDist < bestDist) {
      const np = nearestPointOnSegment(x, y, wall.start_x_mm, wall.start_y_mm, wall.end_x_mm, wall.end_y_mm);
      bestDist = lineDist;
      bestResult = { point: [Math.round(np[0]), Math.round(np[1])], type: 'line' };
    }
  }

  return bestResult;
}

/** ポリゴンの重心計算 (平均座標) */
export function polygonCentroidCalc(polygon: [number, number][]): [number, number] {
  if (polygon.length === 0) return [0, 0];
  const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
  return [cx, cy];
}

/**
 * 2つの線分が交差するかチェック (端点共有は除外)
 * 線分AB と 線分CD
 */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false; // parallel

  const sx = cx - ax, sy = cy - ay;
  const t = (sx * d2y - sy * d2x) / cross;
  const u = (sx * d1y - sy * d1x) / cross;

  // Strict interior intersection (exclude endpoints)
  return t > 1e-10 && t < 1 - 1e-10 && u > 1e-10 && u < 1 - 1e-10;
}

/** ポリゴンが自己交差しているかチェック (O(n²)) */
export function isPolygonSelfIntersecting(polygon: [number, number][]): boolean {
  const n = polygon.length;
  if (n < 4) return false; // triangle can't self-intersect
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges (they share a vertex)
      if (i === 0 && j === n - 1) continue;
      const j2 = (j + 1) % n;
      if (segmentsIntersect(
        polygon[i][0], polygon[i][1], polygon[i2][0], polygon[i2][1],
        polygon[j][0], polygon[j][1], polygon[j2][0], polygon[j2][1],
      )) {
        return true;
      }
    }
  }
  return false;
}

/** 線分交差判定 (分割ツール用): 線分a1-a2 が 線分b1-b2 と交差する点を返す */
export function lineSegmentIntersection(
  a1: [number, number], a2: [number, number],
  b1: [number, number], b2: [number, number]
): { point: [number, number]; t: number } | null {
  const dx1 = a2[0] - a1[0], dy1 = a2[1] - a1[1];
  const dx2 = b2[0] - b1[0], dy2 = b2[1] - b1[1];
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((b1[0] - a1[0]) * dy2 - (b1[1] - a1[1]) * dx2) / denom;
  const u = ((b1[0] - a1[0]) * dy1 - (b1[1] - a1[1]) * dx1) / denom;

  if (u < 0.01 || u > 0.99) return null; // Strict interior of edge b

  return {
    point: [Math.round(a1[0] + t * dx1), Math.round(a1[1] + t * dy1)],
    t: u,
  };
}

/** ポリゴンのバウンディングボックス (width_mm, height_mm) */
export function polygonBBox(polygon: [number, number][]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  if (polygon.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// =====================================================
// measureText メモ化キャッシュ
// =====================================================

/** measureText結果のキャッシュエントリ */
interface TextMeasureEntry {
  width: number;
  actualBoundingBoxAscent: number;
  actualBoundingBoxDescent: number;
}

/**
 * Canvas measureText のメモ化キャッシュを生成
 * フォント+テキストをキーにキャッシュし、LRU的に古いエントリから破棄
 * @param maxSize キャッシュ上限（デフォルト500）
 */
export function createTextMeasureCache(maxSize = 500) {
  const cache = new Map<string, TextMeasureEntry>();
  /** アクセス順序追跡用（先頭が最も古い） */
  const accessOrder: string[] = [];

  function makeKey(font: string, text: string): string {
    return `${font}|||${text}`;
  }

  /** LRU的に古いエントリを破棄 */
  function evictIfNeeded() {
    while (cache.size >= maxSize && accessOrder.length > 0) {
      const oldest = accessOrder.shift()!;
      cache.delete(oldest);
    }
  }

  /** アクセス順序を更新（最後尾=最新） */
  function touchKey(key: string) {
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) {
      accessOrder.splice(idx, 1);
    }
    accessOrder.push(key);
  }

  return {
    /**
     * キャッシュ付きmeasureText
     * @param ctx Canvas 2D コンテキスト（font設定済み前提）
     * @param font フォント文字列（ctx.fontと同じ値）
     * @param text 計測するテキスト
     */
    measure(ctx: CanvasRenderingContext2D, font: string, text: string): TextMeasureEntry {
      const key = makeKey(font, text);
      const cached = cache.get(key);
      if (cached) {
        touchKey(key);
        return cached;
      }

      // 実測
      const prev = ctx.font;
      if (ctx.font !== font) ctx.font = font;
      const m = ctx.measureText(text);
      if (prev !== font) ctx.font = prev;

      const entry: TextMeasureEntry = {
        width: m.width,
        actualBoundingBoxAscent: m.actualBoundingBoxAscent,
        actualBoundingBoxDescent: m.actualBoundingBoxDescent,
      };

      evictIfNeeded();
      cache.set(key, entry);
      accessOrder.push(key);

      return entry;
    },

    /** キャッシュをクリア */
    clear() {
      cache.clear();
      accessOrder.length = 0;
    },

    /** 現在のキャッシュサイズ */
    get size() {
      return cache.size;
    },
  };
}

// =====================================================
// 空間インデックス（グリッドベース簡易版）
// =====================================================

/** 空間インデックスのエントリ型 */
export interface SpatialEntry {
  type: 'room' | 'wall';
  idx: number;
  /** バウンディングボックス（mm） */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** グリッドベース空間インデックス */
export interface SpatialIndex {
  /** グリッドセルサイズ（mm） */
  cellSize: number;
  /** グリッドマップ: "gx,gy" → エントリ配列 */
  grid: Map<string, SpatialEntry[]>;
  /** 全エントリ（デバッグ用） */
  entries: SpatialEntry[];
}

/**
 * 部屋と壁から空間インデックスを構築
 * @param rooms BlueprintRoom配列
 * @param walls BlueprintWall配列
 * @param cellSize グリッドセルサイズ（デフォルト100mm）
 */
export function buildSpatialIndex(
  rooms: { polygon_mm: [number, number][] }[],
  walls: { start_x_mm: number; start_y_mm: number; end_x_mm: number; end_y_mm: number }[],
  cellSize = 100,
): SpatialIndex {
  const grid = new Map<string, SpatialEntry[]>();
  const entries: SpatialEntry[] = [];

  /** エントリをグリッドに登録 */
  function insertEntry(entry: SpatialEntry) {
    entries.push(entry);
    const gxMin = Math.floor(entry.minX / cellSize);
    const gyMin = Math.floor(entry.minY / cellSize);
    const gxMax = Math.floor(entry.maxX / cellSize);
    const gyMax = Math.floor(entry.maxY / cellSize);

    for (let gx = gxMin; gx <= gxMax; gx++) {
      for (let gy = gyMin; gy <= gyMax; gy++) {
        const key = `${gx},${gy}`;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(entry);
      }
    }
  }

  // 部屋を登録
  for (let i = 0; i < rooms.length; i++) {
    const poly = rooms[i].polygon_mm;
    if (poly.length === 0) continue;
    const bbox = polygonBBox(poly);
    insertEntry({
      type: 'room',
      idx: i,
      minX: bbox.minX,
      minY: bbox.minY,
      maxX: bbox.maxX,
      maxY: bbox.maxY,
    });
  }

  // 壁を登録
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    insertEntry({
      type: 'wall',
      idx: i,
      minX: Math.min(w.start_x_mm, w.end_x_mm),
      minY: Math.min(w.start_y_mm, w.end_y_mm),
      maxX: Math.max(w.start_x_mm, w.end_x_mm),
      maxY: Math.max(w.start_y_mm, w.end_y_mm),
    });
  }

  return { cellSize, grid, entries };
}

/**
 * 指定座標の近傍にあるエントリを返す
 * @param index 空間インデックス
 * @param x_mm X座標（mm）
 * @param y_mm Y座標（mm）
 * @param radius_mm 検索半径（mm）
 * @returns 近傍のエントリ（重複なし）
 */
export function queryNearby(
  index: SpatialIndex,
  x_mm: number,
  y_mm: number,
  radius_mm: number,
): SpatialEntry[] {
  const { cellSize, grid } = index;
  const gxMin = Math.floor((x_mm - radius_mm) / cellSize);
  const gyMin = Math.floor((y_mm - radius_mm) / cellSize);
  const gxMax = Math.floor((x_mm + radius_mm) / cellSize);
  const gyMax = Math.floor((y_mm + radius_mm) / cellSize);

  /** 重複排除用セット（type+idxをキーに） */
  const seen = new Set<string>();
  const results: SpatialEntry[] = [];

  for (let gx = gxMin; gx <= gxMax; gx++) {
    for (let gy = gyMin; gy <= gyMax; gy++) {
      const bucket = grid.get(`${gx},${gy}`);
      if (!bucket) continue;
      for (const entry of bucket) {
        const key = `${entry.type}_${entry.idx}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // AABBと検索範囲の交差判定
        if (
          entry.maxX >= x_mm - radius_mm &&
          entry.minX <= x_mm + radius_mm &&
          entry.maxY >= y_mm - radius_mm &&
          entry.minY <= y_mm + radius_mm
        ) {
          results.push(entry);
        }
      }
    }
  }

  return results;
}

/**
 * Parse area value from text like "25.3m²", "25.3㎡", "12.5m2"
 * Returns area in m² or null if not parseable
 */
export function parseAreaFromText(text: string): number | null {
  const match = text.match(/([\d.]+)\s*(?:m²|㎡|m2|平米)/i);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Validate room area against nearby text areas
 * Returns { valid: boolean, expected: number | null, actual: number, diffPercent: number | null }
 */
export function validateRoomArea(room: { area_m2: number; nearby_texts?: string[] }): {
  valid: boolean;
  expected: number | null;
  actual: number;
  diffPercent: number | null;
} {
  const actual = room.area_m2;
  if (!room.nearby_texts) return { valid: true, expected: null, actual, diffPercent: null };

  for (const text of room.nearby_texts) {
    const expected = parseAreaFromText(text);
    if (expected !== null && expected > 0) {
      const diffPercent = Math.abs(actual - expected) / expected * 100;
      return {
        valid: diffPercent < 15, // 15% tolerance
        expected,
        actual,
        diffPercent,
      };
    }
  }
  return { valid: true, expected: null, actual, diffPercent: null };
}
