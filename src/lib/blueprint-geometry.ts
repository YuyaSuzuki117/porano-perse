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
