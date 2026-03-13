import { Point2D, WallSegment, SnapResult } from '@/types/floor-plan';

export function distance(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function wallLength(wall: WallSegment): number {
  return distance(wall.start, wall.end);
}

export function wallAngle(wall: WallSegment): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

// グリッドスナップ (0.1m単位)
export function snapToGrid(point: Point2D, gridSize: number = 0.1): Point2D {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

// 端点スナップ
export function snapToEndpoints(
  point: Point2D,
  walls: WallSegment[],
  threshold: number = 0.2
): SnapResult {
  let closest: Point2D | null = null;
  let minDist = threshold;

  for (const wall of walls) {
    for (const ep of [wall.start, wall.end]) {
      const d = distance(point, ep);
      if (d < minDist) {
        minDist = d;
        closest = ep;
      }
    }
  }

  if (closest) {
    return { point: closest, type: 'endpoint' };
  }
  return { point, type: 'none' };
}

// 角度スナップ (0, 45, 90度)
export function snapAngle(start: Point2D, end: Point2D, snapDegrees: number = 15): Point2D {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const len = Math.sqrt(dx * dx + dy * dy);

  const snapRad = (snapDegrees * Math.PI) / 180;
  const snappedAngle = Math.round(angle / snapRad) * snapRad;

  return {
    x: start.x + len * Math.cos(snappedAngle),
    y: start.y + len * Math.sin(snappedAngle),
  };
}

// 壁群から閉じたポリゴン（床面）を簡易算出
export function computeFloorPolygon(walls: WallSegment[]): Point2D[] {
  if (walls.length === 0) return [];

  // 全端点を収集
  const points: Point2D[] = [];
  for (const wall of walls) {
    points.push(wall.start, wall.end);
  }

  if (points.length < 3) return points;

  // 重心を計算
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;

  // 重複除去
  const unique = points.filter(
    (p, i, arr) => arr.findIndex((q) => distance(p, q) < 0.05) === i
  );

  // 角度順にソート（凸包近似）
  unique.sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  return unique;
}

// 矩形部屋のWallSegment生成ヘルパー
export function createRectRoom(
  width: number,
  depth: number,
  height: number = 2.7,
  thickness: number = 0.12
): WallSegment[] {
  const hw = width / 2;
  const hd = depth / 2;
  const id = () => `wall_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return [
    {
      id: id(),
      start: { x: -hw, y: -hd },
      end: { x: hw, y: -hd },
      thickness,
      height,
      color: '#E0E0E0',
    },
    {
      id: id(),
      start: { x: hw, y: -hd },
      end: { x: hw, y: hd },
      thickness,
      height,
      color: '#E0E0E0',
    },
    {
      id: id(),
      start: { x: hw, y: hd },
      end: { x: -hw, y: hd },
      thickness,
      height,
      color: '#E0E0E0',
    },
    {
      id: id(),
      start: { x: -hw, y: hd },
      end: { x: -hw, y: -hd },
      thickness,
      height,
      color: '#E0E0E0',
    },
  ];
}
