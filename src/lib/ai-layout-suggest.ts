/**
 * AIフリーのスマート家具配置提案エンジン
 *
 * 部屋の壁形状（ポリゴン）を解析し、部屋タイプごとのルールに基づいて
 * 最適な家具配置を提案する。外部AI APIは一切使用しない。
 */

import { WallSegment, Opening, Point2D } from '@/types/floor-plan';
import { FurnitureItem, FurnitureType } from '@/types/scene';

// ────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────

/** 対応する部屋タイプ */
type LayoutRoomType = 'cafe' | 'office' | 'restaurant' | 'salon' | 'clinic' | 'retail' | 'bar';

/** 壁解析結果 */
interface WallAnalysis {
  wall: WallSegment;
  length: number;
  angle: number; // ラジアン
  midpoint: Point2D;
  /** 壁の法線（部屋内側方向） */
  inwardNormal: Point2D;
}

/** バウンディングボックス */
interface RoomBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  depth: number;
  centroid: Point2D;
}

// ────────────────────────────────────────────────
// ヘルパー関数
// ────────────────────────────────────────────────

/** 最長壁を取得 */
export function findLongestWall(walls: WallSegment[]): WallSegment | null {
  if (walls.length === 0) return null;
  let longest: WallSegment = walls[0];
  let maxLen = 0;
  for (const w of walls) {
    const len = wallLength(w);
    if (len > maxLen) {
      maxLen = len;
      longest = w;
    }
  }
  return longest;
}

/** 開口部（ドア）がある壁を取得 */
export function findDoorWall(
  walls: WallSegment[],
  openings: Opening[],
): WallSegment | null {
  const door = openings.find((o) => o.type === 'door');
  if (!door) return null;
  return walls.find((w) => w.id === door.wallId) ?? null;
}

/** 部屋ポリゴンのバウンディングボックスを計算 */
export function getRoomPolygonBounds(walls: WallSegment[]): RoomBounds {
  if (walls.length === 0) {
    return { minX: 0, maxX: 4, minY: 0, maxY: 4, width: 4, depth: 4, centroid: { x: 2, y: 2 } };
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }

  const width = maxX - minX;
  const depth = maxY - minY;
  return {
    minX, maxX, minY, maxY, width, depth,
    centroid: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

/** 壁の長さを計算 */
function wallLength(w: WallSegment): number {
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 壁解析情報を生成 */
function analyzeWall(wall: WallSegment, roomCentroid: Point2D): WallAnalysis {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const midpoint: Point2D = {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  };

  // 法線方向を2つ候補にし、部屋中心に近い方を内側とする
  const n1: Point2D = { x: -Math.sin(angle), y: Math.cos(angle) };
  const n2: Point2D = { x: Math.sin(angle), y: -Math.cos(angle) };
  const d1 = dist2D({ x: midpoint.x + n1.x, y: midpoint.y + n1.y }, roomCentroid);
  const d2 = dist2D({ x: midpoint.x + n2.x, y: midpoint.y + n2.y }, roomCentroid);

  return {
    wall,
    length,
    angle,
    midpoint,
    inwardNormal: d1 < d2 ? n1 : n2,
  };
}

/** 2点間距離 */
function dist2D(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** 3D位置間のXZ距離（衝突判定用） */
function dist3DXZ(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2);
}

/** 既存家具との衝突チェック（簡易AABB） */
function hasCollision(
  pos: [number, number, number],
  scale: [number, number, number],
  existing: Array<{ position: [number, number, number]; scale: [number, number, number] }>,
  minGap = 0.3,
): boolean {
  const hw = scale[0] / 2 + minGap;
  const hd = scale[2] / 2 + minGap;

  for (const item of existing) {
    const ihw = item.scale[0] / 2 + minGap;
    const ihd = item.scale[2] / 2 + minGap;

    // AABB衝突判定
    if (
      Math.abs(pos[0] - item.position[0]) < hw + ihw &&
      Math.abs(pos[2] - item.position[2]) < hd + ihd
    ) {
      return true;
    }
  }
  return false;
}

/** 壁沿いにオフセットした3D座標を計算（2Dの y → 3Dの z） */
function wallOffsetPosition(
  analysis: WallAnalysis,
  alongRatio: number,
  inwardOffset: number,
  yHeight = 0,
): [number, number, number] {
  const { wall, inwardNormal } = analysis;
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const px = wall.start.x + dx * alongRatio + inwardNormal.x * inwardOffset;
  const pz = wall.start.y + dy * alongRatio + inwardNormal.y * inwardOffset;
  return [px, yHeight, pz];
}

/** 壁に垂直な方向のY軸回転を取得 */
function wallFacingRotation(analysis: WallAnalysis): number {
  return -analysis.angle + Math.PI / 2;
}

// ────────────────────────────────────────────────
// デフォルトスケール定義
// ────────────────────────────────────────────────

const DEFAULT_SCALES: Partial<Record<FurnitureType, [number, number, number]>> = {
  counter: [2.0, 1.0, 0.6],
  table_square: [0.8, 0.75, 0.8],
  table_round: [0.8, 0.75, 0.8],
  chair: [0.45, 0.85, 0.45],
  stool: [0.35, 0.7, 0.35],
  sofa: [1.8, 0.8, 0.8],
  shelf: [1.2, 1.8, 0.4],
  desk: [1.2, 0.75, 0.7],
  reception_desk: [1.6, 1.1, 0.6],
  register: [0.5, 0.4, 0.4],
  display_case: [1.0, 1.2, 0.5],
  mirror: [0.8, 1.5, 0.05],
  plant: [0.4, 0.8, 0.4],
  partition: [1.5, 1.5, 0.1],
  sink: [0.6, 0.85, 0.5],
  fridge: [0.6, 1.8, 0.6],
  bar_table: [0.6, 1.1, 0.6],
  bench: [1.2, 0.45, 0.5],
  menu_board: [0.6, 0.9, 0.05],
  kitchen_island: [1.5, 0.9, 0.8],
};

function getScale(type: FurnitureType): [number, number, number] {
  return DEFAULT_SCALES[type] ? [...DEFAULT_SCALES[type]!] : [1, 1, 1];
}

// ────────────────────────────────────────────────
// 配置ルール（部屋タイプ別）
// ────────────────────────────────────────────────

/** 家具配置1件（IDなし — 呼び出し側で付与） */
type PlacementItem = Omit<FurnitureItem, 'id'>;

function makePlacement(
  type: FurnitureType,
  name: string,
  position: [number, number, number],
  rotation: number,
  scaleOverride?: [number, number, number],
): PlacementItem {
  const scale = scaleOverride ?? getScale(type);
  return {
    type,
    name,
    position,
    rotation: [0, rotation, 0],
    scale,
  };
}

/** カフェ配置ルール */
function layoutCafe(
  wallAnalyses: WallAnalysis[],
  bounds: RoomBounds,
  doorWallAnalysis: WallAnalysis | null,
): PlacementItem[] {
  const items: PlacementItem[] = [];
  const longest = wallAnalyses.reduce((a, b) => (a.length > b.length ? a : b));

  // カウンターを入口付近の壁に配置
  const counterWall = doorWallAnalysis ?? wallAnalyses[0];
  const counterPos = wallOffsetPosition(counterWall, 0.3, 0.4);
  items.push(makePlacement('counter', 'カウンター', counterPos, wallFacingRotation(counterWall)));

  // レジをカウンター端に
  const registerPos = wallOffsetPosition(counterWall, 0.15, 0.4);
  items.push(makePlacement('register', 'レジ', registerPos, wallFacingRotation(counterWall)));

  // 最長壁沿いにテーブル＋椅子を等間隔配置
  const tableCount = Math.max(2, Math.floor(longest.length / 1.5));
  for (let i = 0; i < tableCount; i++) {
    const ratio = (i + 0.5) / tableCount;
    const tPos = wallOffsetPosition(longest, ratio, 0.8);
    if (!hasCollision(tPos, getScale('table_square'), items)) {
      items.push(makePlacement('table_square', `テーブル ${i + 1}`, tPos, wallFacingRotation(longest)));

      // テーブルの内側に椅子2脚
      const chairOffset1: [number, number, number] = [tPos[0] + 0.5, 0, tPos[2]];
      const chairOffset2: [number, number, number] = [tPos[0] - 0.5, 0, tPos[2]];
      if (!hasCollision(chairOffset1, getScale('chair'), items)) {
        items.push(makePlacement('chair', '椅子', chairOffset1, wallFacingRotation(longest) + Math.PI));
      }
      if (!hasCollision(chairOffset2, getScale('chair'), items)) {
        items.push(makePlacement('chair', '椅子', chairOffset2, wallFacingRotation(longest)));
      }
    }
  }

  // 中央にソファ席（部屋が十分広い場合）
  if (bounds.width > 4 && bounds.depth > 4) {
    const sofaPos: [number, number, number] = [bounds.centroid.x, 0, bounds.centroid.y + 0.5];
    if (!hasCollision(sofaPos, getScale('sofa'), items)) {
      items.push(makePlacement('sofa', 'ソファ', sofaPos, 0));
    }
  }

  // 観葉植物を角に
  const cornerPos: [number, number, number] = [bounds.minX + 0.4, 0, bounds.minY + 0.4];
  if (!hasCollision(cornerPos, getScale('plant'), items)) {
    items.push(makePlacement('plant', '観葉植物', cornerPos, 0));
  }

  return items;
}

/** オフィス配置ルール */
function layoutOffice(
  wallAnalyses: WallAnalysis[],
  bounds: RoomBounds,
  doorWallAnalysis: WallAnalysis | null,
): PlacementItem[] {
  const items: PlacementItem[] = [];
  const longest = wallAnalyses.reduce((a, b) => (a.length > b.length ? a : b));

  // レセプションを入口壁付近に
  if (doorWallAnalysis) {
    const recPos = wallOffsetPosition(doorWallAnalysis, 0.5, 1.2);
    items.push(makePlacement('reception_desk', 'レセプション', recPos, wallFacingRotation(doorWallAnalysis)));
  }

  // 最長壁沿いにデスクを配置
  const deskCount = Math.max(2, Math.floor(longest.length / 1.5));
  for (let i = 0; i < deskCount; i++) {
    const ratio = (i + 0.5) / deskCount;
    const dPos = wallOffsetPosition(longest, ratio, 0.6);
    if (!hasCollision(dPos, getScale('desk'), items)) {
      items.push(makePlacement('desk', `デスク ${i + 1}`, dPos, wallFacingRotation(longest)));

      // デスクごとに椅子
      const chairPos = wallOffsetPosition(longest, ratio, 1.2);
      if (!hasCollision(chairPos, getScale('chair'), items)) {
        items.push(makePlacement('chair', '椅子', chairPos, wallFacingRotation(longest) + Math.PI));
      }
    }
  }

  // 中央にミーティングテーブル
  const mtPos: [number, number, number] = [bounds.centroid.x, 0, bounds.centroid.y];
  if (!hasCollision(mtPos, [1.6, 0.75, 1.0], items)) {
    items.push(makePlacement('table_square', 'ミーティングテーブル', mtPos, 0, [1.6, 0.75, 1.0]));

    // ミーティング椅子4脚
    const offsets: [number, number][] = [[0.9, 0], [-0.9, 0], [0, 0.6], [0, -0.6]];
    for (const [ox, oz] of offsets) {
      const cPos: [number, number, number] = [mtPos[0] + ox, 0, mtPos[2] + oz];
      if (!hasCollision(cPos, getScale('chair'), items)) {
        items.push(makePlacement('chair', '椅子', cPos, Math.atan2(-ox, -oz)));
      }
    }
  }

  // 本棚を短い壁沿いに
  const shortest = wallAnalyses.reduce((a, b) => (a.length < b.length ? a : b));
  const shelfPos = wallOffsetPosition(shortest, 0.5, 0.3);
  if (!hasCollision(shelfPos, getScale('shelf'), items)) {
    items.push(makePlacement('shelf', '本棚', shelfPos, wallFacingRotation(shortest)));
  }

  return items;
}

/** レストラン配置ルール */
function layoutRestaurant(
  wallAnalyses: WallAnalysis[],
  bounds: RoomBounds,
  doorWallAnalysis: WallAnalysis | null,
): PlacementItem[] {
  const items: PlacementItem[] = [];

  // キッチンカウンターを奥の壁に
  const backWall = doorWallAnalysis
    ? wallAnalyses.reduce((farthest, wa) => {
        const dCur = dist2D(wa.midpoint, doorWallAnalysis.midpoint);
        const dBest = dist2D(farthest.midpoint, doorWallAnalysis.midpoint);
        return dCur > dBest ? wa : farthest;
      })
    : wallAnalyses[0];

  const kitchenPos = wallOffsetPosition(backWall, 0.5, 0.5);
  items.push(makePlacement('kitchen_island', 'キッチンカウンター', kitchenPos, wallFacingRotation(backWall)));

  // テーブルをグリッド配置（通路幅1mを確保）
  const margin = 0.8; // 壁からのマージン
  const spacing = 1.8; // テーブル間隔
  const startX = bounds.minX + margin;
  const startZ = bounds.minY + margin;
  const endX = bounds.maxX - margin;
  const endZ = bounds.maxY - margin - 1.5; // キッチン分を除く

  let tableIdx = 1;
  for (let x = startX; x < endX; x += spacing) {
    for (let z = startZ; z < endZ; z += spacing) {
      const tPos: [number, number, number] = [x, 0, z];
      if (!hasCollision(tPos, getScale('table_square'), items)) {
        items.push(makePlacement('table_square', `テーブル ${tableIdx}`, tPos, 0));
        tableIdx++;

        // テーブル周りに椅子2脚
        const c1: [number, number, number] = [x, 0, z + 0.55];
        const c2: [number, number, number] = [x, 0, z - 0.55];
        if (!hasCollision(c1, getScale('chair'), items)) {
          items.push(makePlacement('chair', '椅子', c1, Math.PI));
        }
        if (!hasCollision(c2, getScale('chair'), items)) {
          items.push(makePlacement('chair', '椅子', c2, 0));
        }
      }
    }
  }

  // レジを入口近くに
  if (doorWallAnalysis) {
    const regPos = wallOffsetPosition(doorWallAnalysis, 0.2, 0.5);
    if (!hasCollision(regPos, getScale('register'), items)) {
      items.push(makePlacement('register', 'レジ', regPos, wallFacingRotation(doorWallAnalysis)));
    }
  }

  return items;
}

/** 美容室配置ルール */
function layoutSalon(
  wallAnalyses: WallAnalysis[],
  bounds: RoomBounds,
  doorWallAnalysis: WallAnalysis | null,
): PlacementItem[] {
  const items: PlacementItem[] = [];
  const longest = wallAnalyses.reduce((a, b) => (a.length > b.length ? a : b));

  // 最長壁沿いにミラー＋椅子のステーション
  const stationCount = Math.max(2, Math.floor(longest.length / 1.2));
  for (let i = 0; i < stationCount; i++) {
    const ratio = (i + 0.5) / stationCount;

    // 鏡を壁に
    const mirrorPos = wallOffsetPosition(longest, ratio, 0.1, 1.0);
    if (!hasCollision(mirrorPos, getScale('mirror'), items)) {
      items.push(makePlacement('mirror', 'ミラー', mirrorPos, wallFacingRotation(longest)));
    }

    // 椅子を鏡の前に
    const chairPos = wallOffsetPosition(longest, ratio, 0.8);
    if (!hasCollision(chairPos, getScale('chair'), items)) {
      items.push(makePlacement('chair', 'スタイリングチェア', chairPos, wallFacingRotation(longest)));
    }
  }

  // レセプションを入口近くに
  if (doorWallAnalysis) {
    const recPos = wallOffsetPosition(doorWallAnalysis, 0.7, 0.8);
    if (!hasCollision(recPos, getScale('reception_desk'), items)) {
      items.push(makePlacement('reception_desk', 'レセプション', recPos, wallFacingRotation(doorWallAnalysis)));
    }
  }

  // 待合ソファ
  const sofaPos: [number, number, number] = [bounds.minX + 1.2, 0, bounds.minY + 0.6];
  if (!hasCollision(sofaPos, getScale('sofa'), items)) {
    items.push(makePlacement('sofa', '待合ソファ', sofaPos, 0));
  }

  // シンクを奥に
  const backWall = wallAnalyses.find((wa) => wa !== longest) ?? longest;
  const sinkPos = wallOffsetPosition(backWall, 0.5, 0.4);
  if (!hasCollision(sinkPos, getScale('sink'), items)) {
    items.push(makePlacement('sink', 'シャンプー台', sinkPos, wallFacingRotation(backWall)));
  }

  return items;
}

/** クリニック配置ルール */
function layoutClinic(
  wallAnalyses: WallAnalysis[],
  bounds: RoomBounds,
  doorWallAnalysis: WallAnalysis | null,
): PlacementItem[] {
  const items: PlacementItem[] = [];

  // レセプション
  if (doorWallAnalysis) {
    const recPos = wallOffsetPosition(doorWallAnalysis, 0.5, 1.0);
    items.push(makePlacement('reception_desk', '受付カウンター', recPos, wallFacingRotation(doorWallAnalysis)));
  }

  // 待合ベンチを壁沿いに
  const sideWalls = wallAnalyses.filter((wa) => wa !== (doorWallAnalysis ?? wallAnalyses[0]));
  if (sideWalls.length > 0) {
    const waitWall = sideWalls[0];
    const benchCount = Math.max(1, Math.floor(waitWall.length / 1.5));
    for (let i = 0; i < benchCount; i++) {
      const ratio = (i + 0.5) / benchCount;
      const bPos = wallOffsetPosition(waitWall, ratio, 0.4);
      if (!hasCollision(bPos, getScale('bench'), items)) {
        items.push(makePlacement('bench', '待合ベンチ', bPos, wallFacingRotation(waitWall)));
      }
    }
  }

  // デスク＋椅子（診察室イメージ）
  const deskPos: [number, number, number] = [bounds.centroid.x + 1, 0, bounds.centroid.y];
  if (!hasCollision(deskPos, getScale('desk'), items)) {
    items.push(makePlacement('desk', '診察デスク', deskPos, 0));
    const cPos: [number, number, number] = [deskPos[0], 0, deskPos[2] + 0.8];
    items.push(makePlacement('chair', '診察椅子', cPos, Math.PI));
  }

  // 棚（カルテ等）
  const shelfPos: [number, number, number] = [bounds.maxX - 0.4, 0, bounds.centroid.y];
  if (!hasCollision(shelfPos, getScale('shelf'), items)) {
    items.push(makePlacement('shelf', 'カルテ棚', shelfPos, Math.PI / 2));
  }

  return items;
}

/** 物販配置ルール */
function layoutRetail(
  wallAnalyses: WallAnalysis[],
  bounds: RoomBounds,
  doorWallAnalysis: WallAnalysis | null,
): PlacementItem[] {
  const items: PlacementItem[] = [];

  // レジを入口近くに
  if (doorWallAnalysis) {
    const regPos = wallOffsetPosition(doorWallAnalysis, 0.2, 0.6);
    items.push(makePlacement('register', 'レジカウンター', regPos, wallFacingRotation(doorWallAnalysis)));
  }

  // 壁沿いに棚を配置
  for (const wa of wallAnalyses) {
    if (wa === doorWallAnalysis) continue; // 入口壁はスキップ
    const shelfCount = Math.max(1, Math.floor(wa.length / 1.5));
    for (let i = 0; i < shelfCount; i++) {
      const ratio = (i + 0.5) / shelfCount;
      const sPos = wallOffsetPosition(wa, ratio, 0.3);
      if (!hasCollision(sPos, getScale('shelf'), items)) {
        items.push(makePlacement('shelf', '陳列棚', sPos, wallFacingRotation(wa)));
      }
    }
  }

  // 中央にディスプレイケース
  const dcPos: [number, number, number] = [bounds.centroid.x, 0, bounds.centroid.y];
  if (!hasCollision(dcPos, getScale('display_case'), items)) {
    items.push(makePlacement('display_case', 'ショーケース', dcPos, 0));
  }

  return items;
}

/** バー配置ルール */
function layoutBar(
  wallAnalyses: WallAnalysis[],
  bounds: RoomBounds,
  doorWallAnalysis: WallAnalysis | null,
): PlacementItem[] {
  const items: PlacementItem[] = [];
  const longest = wallAnalyses.reduce((a, b) => (a.length > b.length ? a : b));

  // 最長壁沿いにバーカウンター
  const counterPos = wallOffsetPosition(longest, 0.5, 0.4);
  items.push(makePlacement('counter', 'バーカウンター', counterPos, wallFacingRotation(longest), [
    Math.min(longest.length * 0.7, 3.5), 1.1, 0.6,
  ]));

  // カウンター前にスツール
  const stoolCount = Math.max(3, Math.floor(longest.length / 0.7));
  for (let i = 0; i < stoolCount; i++) {
    const ratio = 0.15 + (0.7 * i) / stoolCount;
    const sPos = wallOffsetPosition(longest, ratio, 1.0);
    if (!hasCollision(sPos, getScale('stool'), items)) {
      items.push(makePlacement('stool', 'バースツール', sPos, wallFacingRotation(longest)));
    }
  }

  // ハイテーブルを部屋の反対側に
  const oppositeWalls = wallAnalyses.filter(
    (wa) => dist2D(wa.midpoint, longest.midpoint) > bounds.width * 0.3,
  );
  if (oppositeWalls.length > 0) {
    const oppWall = oppositeWalls[0];
    const htCount = Math.max(1, Math.floor(oppWall.length / 1.2));
    for (let i = 0; i < htCount; i++) {
      const ratio = (i + 0.5) / htCount;
      const htPos = wallOffsetPosition(oppWall, ratio, 0.6);
      if (!hasCollision(htPos, getScale('bar_table'), items)) {
        items.push(makePlacement('bar_table', 'ハイテーブル', htPos, wallFacingRotation(oppWall)));
      }
    }
  }

  // カウンター裏に冷蔵庫＋シンク
  const fridgePos = wallOffsetPosition(longest, 0.1, 0.15);
  if (!hasCollision(fridgePos, getScale('fridge'), items)) {
    items.push(makePlacement('fridge', '冷蔵庫', fridgePos, wallFacingRotation(longest)));
  }
  const sinkPos = wallOffsetPosition(longest, 0.9, 0.15);
  if (!hasCollision(sinkPos, getScale('sink'), items)) {
    items.push(makePlacement('sink', 'シンク', sinkPos, wallFacingRotation(longest)));
  }

  return items;
}

// ────────────────────────────────────────────────
// メインAPI
// ────────────────────────────────────────────────

/**
 * 部屋形状と用途に基づいて最適な家具配置を提案する
 *
 * @param walls - 部屋を構成する壁セグメント配列
 * @param roomType - 部屋の用途タイプ
 * @param existingFurniture - 既に配置済みの家具（衝突回避に使用）
 * @returns IDなしのFurnitureItem配列（呼び出し側でIDを付与すること）
 */
export function suggestOptimalLayout(
  walls: WallSegment[],
  roomType: string,
  existingFurniture: FurnitureItem[],
): FurnitureItem[] {
  if (walls.length === 0) return [];

  const bounds = getRoomPolygonBounds(walls);
  const wallAnalyses = walls.map((w) => analyzeWall(w, bounds.centroid));

  // 開口部情報は壁データから推定（壁にOpeningが紐づかないため、最短壁を入口候補とする）
  // 既存のfindDoorWallはOpening配列が必要なので、ここでは壁の位置で推定
  const doorWallAnalysis = wallAnalyses.reduce<WallAnalysis | null>((best, wa) => {
    // minY（手前）に最も近い壁を入口候補とする
    const distToFront = Math.abs(wa.midpoint.y - bounds.minY);
    if (!best || distToFront < Math.abs(best.midpoint.y - bounds.minY)) return wa;
    return best;
  }, null);

  // 部屋タイプ別にレイアウト生成
  const layoutFn: Record<LayoutRoomType, typeof layoutCafe> = {
    cafe: layoutCafe,
    office: layoutOffice,
    restaurant: layoutRestaurant,
    salon: layoutSalon,
    clinic: layoutClinic,
    retail: layoutRetail,
    bar: layoutBar,
  };

  const fn = layoutFn[roomType as LayoutRoomType];
  if (!fn) return [];

  const placements = fn(wallAnalyses, bounds, doorWallAnalysis);

  // 既存家具との衝突を最終チェックし、衝突するものは除外
  const existingPositions = existingFurniture.map((f) => ({
    position: f.position,
    scale: f.scale,
  }));

  const results: FurnitureItem[] = [];
  for (const item of placements) {
    if (!hasCollision(item.position, item.scale, [...existingPositions, ...results])) {
      // IDなしで返す（呼び出し側で付与想定だが型上はstring必須のため空文字）
      results.push({ ...item, id: '' } as FurnitureItem);
    }
  }

  return results;
}
