// 避難経路シミュレーター
// 壁・開口部・家具データから避難経路を解析し、ボトルネックや避難時間を算出

import { Point2D, WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';

/** 避難経路 */
export interface EvacuationRoute {
  /** 経路上の座標列 */
  points: Point2D[];
  /** 経路長(m) */
  length: number;
  /** 家具等で塞がれているか */
  blocked: boolean;
}

/** 避難シミュレーション結果 */
export interface EvacuationResult {
  /** 全避難経路 */
  routes: EvacuationRoute[];
  /** 推定避難時間(秒) */
  evacuationTimeSeconds: number;
  /** ボトルネック地点 */
  bottlenecks: Point2D[];
  /** 出口(ドア)数 */
  exitCount: number;
  /** 最大収容人数 */
  maxOccupancy: number;
}

/** グリッドセル状態 */
const CELL_EMPTY = 0;
const CELL_WALL = 1;
const CELL_FURNITURE = 2;

/** グリッド解像度(m) */
const GRID_RESOLUTION = 0.2;

/** 歩行速度(m/s) — 避難時の標準歩行速度 */
const WALK_SPEED = 1.2;

/** 1人あたり必要面積(m²) — 商業施設の一般基準 */
const AREA_PER_PERSON = 3.0;

/** 出口1箇所あたりの待ち行列係数(秒/人) */
const QUEUE_FACTOR_PER_PERSON = 1.5;

/**
 * 部屋のバウンディングボックスを壁データから算出
 */
function computeBounds(walls: WallSegment[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 壁セグメントがグリッドセルを通過するか判定
 */
function wallIntersectsCell(
  wall: WallSegment,
  cellX: number,
  cellY: number,
  cellSize: number,
  openings: Opening[]
): boolean {
  // 壁上の開口部を除外するため、開口部区間を算出
  const wallDx = wall.end.x - wall.start.x;
  const wallDy = wall.end.y - wall.start.y;
  const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
  if (wallLen < 0.001) return false;

  const dirX = wallDx / wallLen;
  const dirY = wallDy / wallLen;
  const normX = -dirY;
  const normY = dirX;
  const thickness = wall.thickness || 0.12;

  // セル中心
  const cx = cellX + cellSize / 2;
  const cy = cellY + cellSize / 2;

  // 壁からの距離チェック（壁法線方向）
  const relX = cx - wall.start.x;
  const relY = cy - wall.start.y;
  const normalDist = Math.abs(relX * normX + relY * normY);
  if (normalDist > thickness / 2 + cellSize / 2) return false;

  // 壁方向の投影位置
  const alongDist = relX * dirX + relY * dirY;
  if (alongDist < -cellSize / 2 || alongDist > wallLen + cellSize / 2) return false;

  // 開口部区間に該当する場合は壁なしとみなす
  for (const op of openings) {
    if (op.wallId !== wall.id) continue;
    // ドアの場合のみ避難出口として通過可能
    const opStart = op.positionAlongWall;
    const opEnd = opStart + op.width;
    if (alongDist >= opStart - cellSize / 2 && alongDist <= opEnd + cellSize / 2) {
      return false; // 開口部なので壁ではない
    }
  }

  return true;
}

/**
 * 家具がグリッドセルを占有するか判定（簡易矩形判定）
 */
function furnitureOccupiesCell(
  furniture: FurnitureItem,
  cellX: number,
  cellY: number,
  cellSize: number
): boolean {
  // 家具のposition: [x, y, z] → 2D座標は (x, z)
  const fx = furniture.position[0];
  const fz = furniture.position[2];
  const sx = furniture.scale[0] / 2;
  const sz = furniture.scale[2] / 2;

  const cx = cellX + cellSize / 2;
  const cy = cellY + cellSize / 2;

  // 回転を無視した簡易AABB判定
  return (
    cx >= fx - sx - cellSize / 2 &&
    cx <= fx + sx + cellSize / 2 &&
    cy >= fz - sz - cellSize / 2 &&
    cy <= fz + sz + cellSize / 2
  );
}

/**
 * 出口座標を算出（ドア型開口部の中心位置）
 */
function findExits(walls: WallSegment[], openings: Opening[]): Point2D[] {
  const exits: Point2D[] = [];
  for (const op of openings) {
    if (op.type !== 'door') continue;
    const wall = walls.find((w) => w.id === op.wallId);
    if (!wall) continue;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) continue;

    // 壁上の中心位置
    const t = (op.positionAlongWall + op.width / 2) / len;
    exits.push({
      x: wall.start.x + dx * t,
      y: wall.start.y + dy * t,
    });
  }
  return exits;
}

/**
 * BFSで各グリッドセルから最寄り出口への最短距離を算出
 * @returns 距離グリッド（到達不能 = Infinity）
 */
function bfsFromExits(
  grid: number[][],
  rows: number,
  cols: number,
  exitCells: [number, number][]
): number[][] {
  const dist: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(Infinity)
  );

  // BFSキュー（[row, col]）
  const queue: [number, number][] = [];
  for (const [r, c] of exitCells) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
      dist[r][c] = 0;
      queue.push([r, c]);
    }
  }

  // 8方向探索（斜め移動はsqrt(2)倍のコスト）
  const dr = [-1, -1, -1, 0, 0, 1, 1, 1];
  const dc = [-1, 0, 1, -1, 1, -1, 0, 1];
  const cost = [1.414, 1, 1.414, 1, 1, 1.414, 1, 1.414];

  let head = 0;
  while (head < queue.length) {
    const [r, c] = queue[head++];
    for (let d = 0; d < 8; d++) {
      const nr = r + dr[d];
      const nc = c + dc[d];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_WALL) continue;

      const newDist = dist[r][c] + cost[d];
      if (newDist < dist[nr][nc]) {
        dist[nr][nc] = newDist;
        queue.push([nr, nc]);
      }
    }
  }

  return dist;
}

/**
 * 距離グリッドからグリッドセル→出口への経路を復元
 */
function traceRoute(
  distGrid: number[][],
  grid: number[][],
  startRow: number,
  startCol: number,
  rows: number,
  cols: number,
  minX: number,
  minY: number
): Point2D[] {
  const points: Point2D[] = [];
  let r = startRow;
  let c = startCol;

  // 最大ステップ数で無限ループ防止
  const maxSteps = rows * cols;
  for (let step = 0; step < maxSteps; step++) {
    points.push({
      x: minX + c * GRID_RESOLUTION + GRID_RESOLUTION / 2,
      y: minY + r * GRID_RESOLUTION + GRID_RESOLUTION / 2,
    });

    if (distGrid[r][c] === 0) break; // 出口に到達

    // 最も距離が小さい隣接セルへ移動
    let bestR = r, bestC = c, bestDist = distGrid[r][c];
    const dr = [-1, -1, -1, 0, 0, 1, 1, 1];
    const dc = [-1, 0, 1, -1, 1, -1, 0, 1];
    for (let d = 0; d < 8; d++) {
      const nr = r + dr[d];
      const nc = c + dc[d];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (grid[nr][nc] === CELL_WALL) continue;
      if (distGrid[nr][nc] < bestDist) {
        bestDist = distGrid[nr][nc];
        bestR = nr;
        bestC = nc;
      }
    }
    if (bestR === r && bestC === c) break; // 行き止まり
    r = bestR;
    c = bestC;
  }

  return points;
}

/**
 * ボトルネック検出 — 多数の経路が狭い箇所を通過する地点
 */
function detectBottlenecks(
  routes: EvacuationRoute[],
  grid: number[][],
  rows: number,
  cols: number,
  minX: number,
  minY: number
): Point2D[] {
  // 各セルの通過回数をカウント
  const passCount: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(0)
  );

  for (const route of routes) {
    if (route.blocked) continue;
    for (const pt of route.points) {
      const c = Math.floor((pt.x - minX) / GRID_RESOLUTION);
      const r = Math.floor((pt.y - minY) / GRID_RESOLUTION);
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        passCount[r][c]++;
      }
    }
  }

  // 通過回数が平均の3倍以上かつ周囲に壁/家具がある箇所をボトルネックとする
  const totalRoutes = routes.filter((r) => !r.blocked).length;
  if (totalRoutes === 0) return [];
  const threshold = Math.max(totalRoutes * 0.6, 3);

  const bottlenecks: Point2D[] = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (passCount[r][c] < threshold) continue;
      if (grid[r][c] !== CELL_EMPTY) continue;

      // 周囲8セルに壁/家具があるか（狭い通路の判定）
      let obstacleNeighbors = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (grid[r + dr][c + dc] !== CELL_EMPTY) obstacleNeighbors++;
        }
      }
      if (obstacleNeighbors >= 2) {
        bottlenecks.push({
          x: minX + c * GRID_RESOLUTION + GRID_RESOLUTION / 2,
          y: minY + r * GRID_RESOLUTION + GRID_RESOLUTION / 2,
        });
      }
    }
  }

  // 近接するボトルネックを統合（0.5m以内）
  const merged: Point2D[] = [];
  const used = new Set<number>();
  for (let i = 0; i < bottlenecks.length; i++) {
    if (used.has(i)) continue;
    let sumX = bottlenecks[i].x;
    let sumY = bottlenecks[i].y;
    let count = 1;
    for (let j = i + 1; j < bottlenecks.length; j++) {
      if (used.has(j)) continue;
      const dx = bottlenecks[i].x - bottlenecks[j].x;
      const dy = bottlenecks[i].y - bottlenecks[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.5) {
        sumX += bottlenecks[j].x;
        sumY += bottlenecks[j].y;
        count++;
        used.add(j);
      }
    }
    merged.push({ x: sumX / count, y: sumY / count });
  }

  return merged;
}

/**
 * 避難シミュレーション実行
 * @param walls 壁セグメント配列
 * @param openings 開口部配列（ドア・窓）
 * @param furniture 家具配列
 * @param roomHeight 部屋の天井高(m) — 将来的な煙シミュレーション用
 * @returns 避難解析結果
 */
export function simulateEvacuation(
  walls: WallSegment[],
  openings: Opening[],
  furniture: FurnitureItem[],
  roomHeight: number
): EvacuationResult {
  if (walls.length === 0) {
    return {
      routes: [],
      evacuationTimeSeconds: 0,
      bottlenecks: [],
      exitCount: 0,
      maxOccupancy: 0,
    };
  }

  // バウンディングボックス算出
  const bounds = computeBounds(walls);
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX;
  const depth = maxY - minY;

  // グリッド構築
  const cols = Math.ceil(width / GRID_RESOLUTION);
  const rows = Math.ceil(depth / GRID_RESOLUTION);
  if (rows <= 0 || cols <= 0) {
    return { routes: [], evacuationTimeSeconds: 0, bottlenecks: [], exitCount: 0, maxOccupancy: 0 };
  }

  const grid: number[][] = Array.from({ length: rows }, () =>
    new Array(cols).fill(CELL_EMPTY)
  );

  // 壁をグリッドに描画
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellX = minX + c * GRID_RESOLUTION;
      const cellY = minY + r * GRID_RESOLUTION;
      for (const wall of walls) {
        if (wallIntersectsCell(wall, cellX, cellY, GRID_RESOLUTION, openings)) {
          grid[r][c] = CELL_WALL;
          break;
        }
      }
    }
  }

  // 家具をグリッドに描画（床置き家具のみ）
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== CELL_EMPTY) continue;
      const cellX = minX + c * GRID_RESOLUTION;
      const cellY = minY + r * GRID_RESOLUTION;
      for (const item of furniture) {
        // 壁掛け・天井アイテムは除外
        if (item.type === 'pendant_light' || item.type === 'ceiling_fan' ||
            item.type === 'clock' || item.type === 'air_conditioner' ||
            item.type === 'mirror' || item.type === 'curtain') continue;
        if (furnitureOccupiesCell(item, cellX, cellY, GRID_RESOLUTION)) {
          grid[r][c] = CELL_FURNITURE;
          break;
        }
      }
    }
  }

  // 出口検出
  const exits = findExits(walls, openings);
  const exitCells: [number, number][] = exits.map((e) => [
    Math.floor((e.y - minY) / GRID_RESOLUTION),
    Math.floor((e.x - minX) / GRID_RESOLUTION),
  ]);

  if (exits.length === 0) {
    // 出口なし — 全経路がブロック
    const floorArea = width * depth;
    return {
      routes: [],
      evacuationTimeSeconds: Infinity,
      bottlenecks: [],
      exitCount: 0,
      maxOccupancy: Math.floor(floorArea / AREA_PER_PERSON),
    };
  }

  // BFSで最短距離マップを構築
  const distGrid = bfsFromExits(grid, rows, cols, exitCells);

  // サンプリングポイントから経路を生成（1mグリッドでサンプル）
  const sampleStep = Math.max(1, Math.round(1.0 / GRID_RESOLUTION));
  const routes: EvacuationRoute[] = [];
  let maxRouteLength = 0;

  for (let r = 0; r < rows; r += sampleStep) {
    for (let c = 0; c < cols; c += sampleStep) {
      if (grid[r][c] !== CELL_EMPTY) continue;
      if (distGrid[r][c] === Infinity) {
        // 到達不能
        routes.push({
          points: [{ x: minX + c * GRID_RESOLUTION, y: minY + r * GRID_RESOLUTION }],
          length: 0,
          blocked: true,
        });
        continue;
      }
      if (distGrid[r][c] === 0) continue; // 出口そのもの

      const points = traceRoute(distGrid, grid, r, c, rows, cols, minX, minY);
      const length = distGrid[r][c] * GRID_RESOLUTION;
      routes.push({ points, length, blocked: false });
      if (length > maxRouteLength) maxRouteLength = length;
    }
  }

  // ボトルネック検出
  const bottlenecks = detectBottlenecks(routes, grid, rows, cols, minX, minY);

  // 床面積と最大収容人数
  let emptyCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === CELL_EMPTY) emptyCount++;
    }
  }
  const floorArea = emptyCount * GRID_RESOLUTION * GRID_RESOLUTION;
  const maxOccupancy = Math.max(1, Math.floor(floorArea / AREA_PER_PERSON));

  // 避難時間: 最長経路の歩行時間 + 待ち行列時間
  const walkTime = maxRouteLength / WALK_SPEED;
  const queueTime = (maxOccupancy / Math.max(1, exits.length)) * QUEUE_FACTOR_PER_PERSON;
  const evacuationTimeSeconds = Math.ceil(walkTime + queueTime);

  // roomHeight は将来的に煙層厚さの計算に使用予定（現在は避難時間に影響しない）
  void roomHeight;

  return {
    routes,
    evacuationTimeSeconds,
    bottlenecks,
    exitCount: exits.length,
    maxOccupancy,
  };
}
