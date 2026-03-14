/**
 * AI自動レイアウトエンジン（ルールベース、外部API不使用）
 *
 * 部屋タイプごとのルールに基づいて家具を自動配置する。
 * 壁・開口部の情報から最適な配置を計算し、LayoutSuggestion[] を返す。
 */

import { WallSegment, Opening, Point2D } from '@/types/floor-plan';
import { FurnitureType } from '@/types/scene';
import { FURNITURE_CATALOG } from '@/data/furniture';

/** 自動配置候補1件 */
export interface LayoutSuggestion {
  furnitureType: FurnitureType;
  position: [number, number, number]; // [x, y, z] 3D座標
  rotation: number; // Y軸回転（ラジアン）
  reason: string;   // 配置理由（日本語）
  scale?: [number, number, number];
}

/** 対応する部屋タイプ */
export type RoomType = 'cafe' | 'restaurant' | 'office' | 'salon' | 'retail' | 'bar' | 'clinic';

/** 部屋タイプの日本語ラベル */
export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  cafe: 'カフェ',
  restaurant: 'レストラン',
  office: 'オフィス',
  salon: '美容室',
  retail: '物販',
  bar: 'バー',
  clinic: 'クリニック',
};

// ────────────────────────────────────────────────
// 内部ヘルパー
// ────────────────────────────────────────────────

interface BoundingBox {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  width: number; depth: number;
  centerX: number; centerZ: number;
}

interface WallInfo {
  wall: WallSegment;
  length: number;
  angle: number; // ラジアン
  midX: number;
  midZ: number;
  normalAngle: number; // 壁に垂直な方向（内側向き）
}

/** 壁のバウンディングボックスを計算 */
function computeBoundingBox(walls: WallSegment[]): BoundingBox {
  if (walls.length === 0) {
    return { minX: 0, maxX: 4, minZ: 0, maxZ: 4, width: 4, depth: 4, centerX: 2, centerZ: 2 };
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    // 2Dの y → 3Dの z
    minZ = Math.min(minZ, w.start.y, w.end.y);
    maxZ = Math.max(maxZ, w.start.y, w.end.y);
  }
  const width = maxX - minX;
  const depth = maxZ - minZ;
  return { minX, maxX, minZ, maxZ, width, depth, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2 };
}

/** 壁情報をリッチに計算 */
function analyzeWalls(walls: WallSegment[], bb: BoundingBox): WallInfo[] {
  return walls.map(wall => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const midX = (wall.start.x + wall.end.x) / 2;
    const midZ = (wall.start.y + wall.end.y) / 2;
    // 法線を内側に向ける（部屋の中心方向）
    const nx1 = angle + Math.PI / 2;
    const nx2 = angle - Math.PI / 2;
    const testX1 = midX + Math.cos(nx1) * 0.1;
    const testZ1 = midZ + Math.sin(nx1) * 0.1;
    const dist1 = Math.abs(testX1 - bb.centerX) + Math.abs(testZ1 - bb.centerZ);
    const testX2 = midX + Math.cos(nx2) * 0.1;
    const testZ2 = midZ + Math.sin(nx2) * 0.1;
    const dist2 = Math.abs(testX2 - bb.centerX) + Math.abs(testZ2 - bb.centerZ);
    const normalAngle = dist1 < dist2 ? nx1 : nx2;
    return { wall, length, angle, midX, midZ, normalAngle };
  });
}

/** 最長の壁を取得 */
function findLongestWall(wallInfos: WallInfo[]): WallInfo | undefined {
  return wallInfos.reduce<WallInfo | undefined>((best, wi) =>
    !best || wi.length > best.length ? wi : best, undefined);
}

/** 入口（ドア）の位置を特定。なければBBox手前中央 */
function findEntrancePosition(walls: WallSegment[], openings: Opening[], bb: BoundingBox): { x: number; z: number; wallAngle: number } {
  const door = openings.find(o => o.type === 'door');
  if (door) {
    const wall = walls.find(w => w.id === door.wallId);
    if (wall) {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const t = len > 0 ? door.positionAlongWall / len : 0.5;
      return {
        x: wall.start.x + dx * t,
        z: wall.start.y + dy * t,
        wallAngle: Math.atan2(dy, dx),
      };
    }
  }
  // ドアがない場合：minZ側（手前）の中央を入口とみなす
  return { x: bb.centerX, z: bb.minZ, wallAngle: 0 };
}

/** 窓の位置を特定 */
function findWindowPositions(walls: WallSegment[], openings: Opening[]): Array<{ x: number; z: number }> {
  return openings.filter(o => o.type === 'window').map(win => {
    const wall = walls.find(w => w.id === win.wallId);
    if (!wall) return { x: 0, z: 0 };
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const t = len > 0 ? win.positionAlongWall / len : 0.5;
    return { x: wall.start.x + dx * t, z: wall.start.y + dy * t };
  });
}

/** カタログからデフォルトスケールを取得 */
function getDefaultScale(type: FurnitureType): [number, number, number] {
  const cat = FURNITURE_CATALOG.find(c => c.type === type);
  return cat ? [...cat.defaultScale] : [1, 1, 1];
}

/** 配置済み家具との衝突チェック（簡易AABB） */
function hasCollision(
  pos: [number, number, number],
  scale: [number, number, number],
  placed: LayoutSuggestion[],
  minGap: number = 0.1,
): boolean {
  const hw = scale[0] / 2 + minGap;
  const hd = scale[2] / 2 + minGap;
  for (const p of placed) {
    const ps = p.scale ?? getDefaultScale(p.furnitureType);
    const phw = ps[0] / 2 + minGap;
    const phd = ps[2] / 2 + minGap;
    if (
      Math.abs(pos[0] - p.position[0]) < hw + phw &&
      Math.abs(pos[2] - p.position[2]) < hd + phd
    ) {
      return true;
    }
  }
  return false;
}

/** 壁沿い配置（壁内側にオフセット） */
function placeAlongWall(
  wallInfo: WallInfo,
  tRatio: number,  // 壁上の位置 (0-1)
  offset: number,  // 壁から内側へのオフセット
): { x: number; z: number; rotation: number } {
  const { wall, angle, normalAngle } = wallInfo;
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const x = wall.start.x + dx * tRatio + Math.cos(normalAngle) * offset;
  const z = wall.start.y + dy * tRatio + Math.sin(normalAngle) * offset;
  // 家具は壁に平行に配置し、内側を向く
  const rotation = angle + Math.PI;
  return { x, z, rotation };
}

/** 入口から最も遠い壁を特定（「奥の壁」として使用） */
function findBackWall(wallInfos: WallInfo[], entrance: { x: number; z: number }): WallInfo | undefined {
  return wallInfos.reduce<WallInfo | undefined>((best, wi) => {
    const dist = Math.sqrt((wi.midX - entrance.x) ** 2 + (wi.midZ - entrance.z) ** 2);
    if (!best) return wi;
    const bestDist = Math.sqrt((best.midX - entrance.x) ** 2 + (best.midZ - entrance.z) ** 2);
    return dist > bestDist ? wi : best;
  }, undefined);
}

/** 入口に最も近い壁を特定 */
function findEntranceWall(wallInfos: WallInfo[], entrance: { x: number; z: number }): WallInfo | undefined {
  return wallInfos.reduce<WallInfo | undefined>((best, wi) => {
    const dist = Math.sqrt((wi.midX - entrance.x) ** 2 + (wi.midZ - entrance.z) ** 2);
    if (!best) return wi;
    const bestDist = Math.sqrt((best.midX - entrance.x) ** 2 + (best.midZ - entrance.z) ** 2);
    return dist < bestDist ? wi : best;
  }, undefined);
}

/** グリッドパターンでテーブル+椅子を配置 */
function placeTablesInGrid(
  bb: BoundingBox,
  placed: LayoutSuggestion[],
  tableType: FurnitureType,
  chairType: FurnitureType,
  seatsPerTable: number,
  spacing: number,
  marginX: number,
  marginZ: number,
  reason: string,
): LayoutSuggestion[] {
  const result: LayoutSuggestion[] = [];
  const tableScale = getDefaultScale(tableType);
  const chairScale = getDefaultScale(chairType);

  const startX = bb.minX + marginX;
  const endX = bb.maxX - marginX;
  const startZ = bb.minZ + marginZ;
  const endZ = bb.maxZ - marginZ;

  for (let x = startX; x <= endX; x += spacing) {
    for (let z = startZ; z <= endZ; z += spacing) {
      const tablePos: [number, number, number] = [x, 0, z];
      if (hasCollision(tablePos, tableScale, [...placed, ...result])) continue;

      result.push({
        furnitureType: tableType,
        position: tablePos,
        rotation: 0,
        reason,
        scale: tableScale,
      });

      // 椅子を配置（テーブル周囲）
      const chairOffsets: Array<{ dx: number; dz: number; rot: number }> = [];
      if (seatsPerTable >= 2) {
        chairOffsets.push(
          { dx: 0, dz: -(tableScale[2] / 2 + chairScale[2] / 2 + 0.05), rot: 0 },
          { dx: 0, dz: tableScale[2] / 2 + chairScale[2] / 2 + 0.05, rot: Math.PI },
        );
      }
      if (seatsPerTable >= 4) {
        chairOffsets.push(
          { dx: -(tableScale[0] / 2 + chairScale[0] / 2 + 0.05), dz: 0, rot: Math.PI / 2 },
          { dx: tableScale[0] / 2 + chairScale[0] / 2 + 0.05, dz: 0, rot: -Math.PI / 2 },
        );
      }

      for (const co of chairOffsets) {
        const chairPos: [number, number, number] = [x + co.dx, 0, z + co.dz];
        if (!hasCollision(chairPos, chairScale, [...placed, ...result])) {
          result.push({
            furnitureType: chairType,
            position: chairPos,
            rotation: co.rot,
            reason: `${reason}用の椅子`,
            scale: chairScale,
          });
        }
      }
    }
  }
  return result;
}

// ────────────────────────────────────────────────
// 部屋タイプ別レイアウトルール
// ────────────────────────────────────────────────

function layoutCafe(walls: WallSegment[], openings: Opening[], bb: BoundingBox): LayoutSuggestion[] {
  const result: LayoutSuggestion[] = [];
  const wallInfos = analyzeWalls(walls, bb);
  const entrance = findEntrancePosition(walls, openings, bb);
  const longestWall = findLongestWall(wallInfos);
  const corners = [
    { x: bb.minX, z: bb.minZ }, { x: bb.maxX, z: bb.minZ },
    { x: bb.minX, z: bb.maxZ }, { x: bb.maxX, z: bb.maxZ },
  ];

  // カウンターを最長壁沿いに配置（壁から0.5m内側）
  if (longestWall) {
    const counterScale: [number, number, number] = [Math.min(longestWall.length * 0.7, 3), 1.1, 0.6];
    const p = placeAlongWall(longestWall, 0.5, 0.5);
    result.push({
      furnitureType: 'counter',
      position: [p.x, 0, p.z],
      rotation: p.rotation,
      reason: '最長壁沿いにカウンターを配置（客との対面に最適）',
      scale: counterScale,
    });

    // レジをカウンター端（入口寄り）に配置
    const regP = placeAlongWall(longestWall, 0.15, 0.5);
    const regScale = getDefaultScale('register');
    if (!hasCollision([regP.x, 0, regP.z], regScale, result)) {
      result.push({
        furnitureType: 'register',
        position: [regP.x, 0, regP.z],
        rotation: regP.rotation,
        reason: 'カウンター端の入口寄りにレジを配置（会計動線を短縮）',
        scale: regScale,
      });
    }
  }

  // 2人掛けテーブル: 1.2m間隔
  const tables2 = placeTablesInGrid(
    bb, result, 'table_round', 'chair', 2, 1.6,
    1.2, 1.5, '2人掛け席（来店頻度の高い少人数客に対応）',
  );
  result.push(...tables2);

  // コーナーに観葉植物
  const plantScale = getDefaultScale('plant');
  for (const corner of corners) {
    const pos: [number, number, number] = [
      corner.x + (corner.x === bb.minX ? 0.3 : -0.3),
      0,
      corner.z + (corner.z === bb.minZ ? 0.3 : -0.3),
    ];
    if (!hasCollision(pos, plantScale, result)) {
      result.push({
        furnitureType: 'plant',
        position: pos,
        rotation: 0,
        reason: 'コーナーに緑を配置して空間に潤いを持たせる',
        scale: plantScale,
      });
    }
  }

  return result;
}

function layoutRestaurant(walls: WallSegment[], openings: Opening[], bb: BoundingBox): LayoutSuggestion[] {
  const result: LayoutSuggestion[] = [];
  const wallInfos = analyzeWalls(walls, bb);
  const entrance = findEntrancePosition(walls, openings, bb);
  const backWall = findBackWall(wallInfos, entrance);
  const windows = findWindowPositions(walls, openings);

  // ホストステーション（入口付近）
  const recScale = getDefaultScale('reception_desk');
  result.push({
    furnitureType: 'reception_desk',
    position: [entrance.x + 0.8, 0, entrance.z + 0.8],
    rotation: entrance.wallAngle + Math.PI,
    reason: '入口脇にホストステーションを配置（来店客の案内拠点）',
    scale: recScale,
  });

  // 奥の壁沿いにキッチンカウンター+シンク
  if (backWall) {
    const kitchenP = placeAlongWall(backWall, 0.4, 0.5);
    const counterScale: [number, number, number] = [Math.min(backWall.length * 0.5, 2.5), 0.9, 0.7];
    result.push({
      furnitureType: 'kitchen_island',
      position: [kitchenP.x, 0, kitchenP.z],
      rotation: kitchenP.rotation,
      reason: '奥の壁沿いにキッチンカウンターを配置（調理スペース確保）',
      scale: counterScale,
    });

    const sinkP = placeAlongWall(backWall, 0.75, 0.5);
    const sinkScale = getDefaultScale('sink');
    if (!hasCollision([sinkP.x, 0, sinkP.z], sinkScale, result)) {
      result.push({
        furnitureType: 'sink',
        position: [sinkP.x, 0, sinkP.z],
        rotation: sinkP.rotation,
        reason: 'キッチン横にシンクを配置（衛生動線の効率化）',
        scale: sinkScale,
      });
    }
  }

  // 4人掛けテーブルをグリッド配置（1.5m間隔）
  const tables4 = placeTablesInGrid(
    bb, result, 'table_square', 'chair', 4, 2.0,
    1.5, 2.0, '4人掛けテーブル（ファミリー・グループ客に対応）',
  );
  result.push(...tables4);

  // 窓沿いに2人掛けテーブル
  for (const win of windows) {
    const tableScale = getDefaultScale('table_round');
    const pos: [number, number, number] = [win.x, 0, win.z + 0.6];
    if (!hasCollision(pos, tableScale, result)) {
      result.push({
        furnitureType: 'table_round',
        position: pos,
        rotation: 0,
        reason: '窓際に2人掛け席を配置（景色を楽しめる特等席）',
        scale: tableScale,
      });
    }
  }

  return result;
}

function layoutOffice(walls: WallSegment[], openings: Opening[], bb: BoundingBox): LayoutSuggestion[] {
  const result: LayoutSuggestion[] = [];
  const wallInfos = analyzeWalls(walls, bb);
  const entrance = findEntrancePosition(walls, openings, bb);
  const entranceWall = findEntranceWall(wallInfos, entrance);

  // 受付デスク（入口付近）
  const recScale = getDefaultScale('reception_desk');
  result.push({
    furnitureType: 'reception_desk',
    position: [entrance.x + 1.0, 0, entrance.z + 1.0],
    rotation: entrance.wallAngle + Math.PI,
    reason: '入口正面に受付デスクを配置（来訪者の第一接点）',
    scale: recScale,
  });

  // 壁沿いにデスクを配置
  const deskScale = getDefaultScale('desk');
  const chairScale = getDefaultScale('chair');
  let deskCount = 0;
  for (const wi of wallInfos) {
    if (wi === entranceWall) continue; // 入口壁は除外
    const numDesks = Math.floor((wi.length - 1.0) / 1.5);
    for (let i = 0; i < numDesks && deskCount < 8; i++) {
      const t = (i + 1) / (numDesks + 1);
      const p = placeAlongWall(wi, t, 0.5);
      const pos: [number, number, number] = [p.x, 0, p.z];
      if (!hasCollision(pos, deskScale, result)) {
        result.push({
          furnitureType: 'desk',
          position: pos,
          rotation: p.rotation,
          reason: '壁向きデスク配置（集中作業に最適、動線を阻害しない）',
          scale: deskScale,
        });
        // デスク前に椅子
        const chairPos: [number, number, number] = [
          p.x + Math.cos(wi.normalAngle) * 0.5,
          0,
          p.z + Math.sin(wi.normalAngle) * 0.5,
        ];
        if (!hasCollision(chairPos, chairScale, result)) {
          result.push({
            furnitureType: 'chair',
            position: chairPos,
            rotation: p.rotation + Math.PI,
            reason: 'デスク用の椅子',
            scale: chairScale,
          });
        }
        deskCount++;
      }
    }
  }

  // 本棚（壁1面に）
  const bookcaseWall = wallInfos.find(wi => wi !== entranceWall && wi.length >= 1.5);
  if (bookcaseWall) {
    const bcScale = getDefaultScale('bookcase');
    const p = placeAlongWall(bookcaseWall, 0.85, 0.3);
    const pos: [number, number, number] = [p.x, 0, p.z];
    if (!hasCollision(pos, bcScale, result)) {
      result.push({
        furnitureType: 'bookcase',
        position: pos,
        rotation: p.rotation,
        reason: '壁面に本棚を配置（資料収納スペース確保）',
        scale: bcScale,
      });
    }
  }

  // 中央にミーティングテーブル（余裕があれば）
  if (bb.width >= 4 && bb.depth >= 4) {
    const mtScale: [number, number, number] = [1.5, 0.75, 0.9];
    const mtPos: [number, number, number] = [bb.centerX, 0, bb.centerZ];
    if (!hasCollision(mtPos, mtScale, result)) {
      result.push({
        furnitureType: 'table_square',
        position: mtPos,
        rotation: 0,
        reason: '中央にミーティングテーブルを配置（チーム打合せ用）',
        scale: mtScale,
      });
      // ミーティング椅子
      for (const offset of [{ dx: 0, dz: -0.8, r: 0 }, { dx: 0, dz: 0.8, r: Math.PI }, { dx: -0.9, dz: 0, r: Math.PI / 2 }, { dx: 0.9, dz: 0, r: -Math.PI / 2 }]) {
        const cp: [number, number, number] = [bb.centerX + offset.dx, 0, bb.centerZ + offset.dz];
        if (!hasCollision(cp, chairScale, result)) {
          result.push({
            furnitureType: 'chair',
            position: cp,
            rotation: offset.r,
            reason: 'ミーティング用椅子',
            scale: chairScale,
          });
        }
      }
    }
  }

  return result;
}

function layoutSalon(walls: WallSegment[], openings: Opening[], bb: BoundingBox): LayoutSuggestion[] {
  const result: LayoutSuggestion[] = [];
  const wallInfos = analyzeWalls(walls, bb);
  const entrance = findEntrancePosition(walls, openings, bb);
  const entranceWall = findEntranceWall(wallInfos, entrance);
  const backWall = findBackWall(wallInfos, entrance);

  // 受付カウンター（入口付近）
  const recScale = getDefaultScale('reception_desk');
  result.push({
    furnitureType: 'reception_desk',
    position: [entrance.x + 0.8, 0, entrance.z + 0.8],
    rotation: entrance.wallAngle + Math.PI,
    reason: '入口横にレセプションを配置（予約確認・会計の拠点）',
    scale: recScale,
  });

  // 待合エリア（入口近く）
  const sofaScale = getDefaultScale('sofa');
  const waitPos: [number, number, number] = [entrance.x - 1.0, 0, entrance.z + 1.0];
  if (!hasCollision(waitPos, sofaScale, result)) {
    result.push({
      furnitureType: 'sofa',
      position: waitPos,
      rotation: 0,
      reason: '入口付近に待合ソファを配置（お客様のウェイティング用）',
      scale: sofaScale,
    });
    // ソファ前にローテーブル
    const tableScale = getDefaultScale('table_round');
    const tPos: [number, number, number] = [waitPos[0], 0, waitPos[2] + 0.8];
    if (!hasCollision(tPos, tableScale, result)) {
      result.push({
        furnitureType: 'table_round',
        position: tPos,
        rotation: 0,
        reason: '待合用サイドテーブル（雑誌・ドリンク置き）',
        scale: [0.5, 0.45, 0.5],
      });
    }
  }

  // スタイリングステーション（壁沿い、1.5m間隔）
  const mirrorScale = getDefaultScale('mirror');
  const chairScale = getDefaultScale('chair');
  const sideWalls = wallInfos.filter(wi => wi !== entranceWall && wi !== backWall);
  let stationCount = 0;
  for (const wi of [...sideWalls, ...(backWall ? [] : [])]) {
    const numStations = Math.floor((wi.length - 0.5) / 1.5);
    for (let i = 0; i < numStations && stationCount < 6; i++) {
      const t = (i + 1) / (numStations + 1);
      const mp = placeAlongWall(wi, t, 0.15);
      const mirrorPos: [number, number, number] = [mp.x, 0.8, mp.z];
      if (!hasCollision([mp.x, 0, mp.z], mirrorScale, result)) {
        result.push({
          furnitureType: 'mirror',
          position: mirrorPos,
          rotation: mp.rotation,
          reason: 'スタイリングステーション（鏡）を壁沿いに等間隔配置',
          scale: [0.8, 1.2, 0.05],
        });
        // 鏡の前に椅子
        const cp = placeAlongWall(wi, t, 0.7);
        const chairPos: [number, number, number] = [cp.x, 0, cp.z];
        if (!hasCollision(chairPos, chairScale, result)) {
          result.push({
            furnitureType: 'chair',
            position: chairPos,
            rotation: mp.rotation + Math.PI,
            reason: 'スタイリング用チェア（鏡に向かって着席）',
            scale: chairScale,
          });
        }
        stationCount++;
      }
    }
  }

  // 奥の壁にシャンプー台
  if (backWall) {
    const sinkScale = getDefaultScale('sink');
    const sp = placeAlongWall(backWall, 0.5, 0.5);
    const sinkPos: [number, number, number] = [sp.x, 0, sp.z];
    if (!hasCollision(sinkPos, sinkScale, result)) {
      result.push({
        furnitureType: 'sink',
        position: sinkPos,
        rotation: sp.rotation,
        reason: '奥の壁にシャンプー台を配置（プライベート感のある位置）',
        scale: sinkScale,
      });
    }
  }

  return result;
}

function layoutRetail(walls: WallSegment[], openings: Opening[], bb: BoundingBox): LayoutSuggestion[] {
  const result: LayoutSuggestion[] = [];
  const wallInfos = analyzeWalls(walls, bb);
  const entrance = findEntrancePosition(walls, openings, bb);
  const entranceWall = findEntranceWall(wallInfos, entrance);
  const windows = findWindowPositions(walls, openings);

  // レジカウンター（入口付近）
  const regScale = getDefaultScale('register');
  result.push({
    furnitureType: 'register',
    position: [entrance.x + 1.0, 0, entrance.z + 0.8],
    rotation: entrance.wallAngle + Math.PI,
    reason: '入口脇にレジを配置（入退店を見渡せる位置）',
    scale: regScale,
  });

  // 壁面に棚を配置
  const shelfScale = getDefaultScale('shelf');
  for (const wi of wallInfos) {
    if (wi === entranceWall) continue;
    const numShelves = Math.floor((wi.length - 0.5) / 1.5);
    for (let i = 0; i < numShelves; i++) {
      const t = (i + 1) / (numShelves + 1);
      const p = placeAlongWall(wi, t, 0.3);
      const pos: [number, number, number] = [p.x, 0, p.z];
      if (!hasCollision(pos, shelfScale, result)) {
        result.push({
          furnitureType: 'shelf',
          position: pos,
          rotation: p.rotation,
          reason: '壁面に商品棚を配置（最大の陳列面積を確保）',
          scale: shelfScale,
        });
      }
    }
  }

  // 中央にディスプレイテーブル（グリッド配置）
  const displayScale = getDefaultScale('table_square');
  const gridSpacing = 2.0;
  for (let x = bb.minX + 1.5; x <= bb.maxX - 1.5; x += gridSpacing) {
    for (let z = bb.minZ + 2.0; z <= bb.maxZ - 1.5; z += gridSpacing) {
      const pos: [number, number, number] = [x, 0, z];
      if (!hasCollision(pos, displayScale, result)) {
        result.push({
          furnitureType: 'table_square',
          position: pos,
          rotation: 0,
          reason: '中央に陳列テーブルを配置（回遊動線を誘導）',
          scale: [0.9, 0.7, 0.6],
        });
      }
    }
  }

  // 入口窓際にショーケース
  if (windows.length > 0) {
    const scScale = getDefaultScale('display_case');
    const win = windows[0];
    const pos: [number, number, number] = [win.x, 0, win.z + 0.5];
    if (!hasCollision(pos, scScale, result)) {
      result.push({
        furnitureType: 'display_case',
        position: pos,
        rotation: 0,
        reason: '窓際にショーケース配置（通行人へのアピール効果）',
        scale: scScale,
      });
    }
  }

  return result;
}

function layoutBar(walls: WallSegment[], openings: Opening[], bb: BoundingBox): LayoutSuggestion[] {
  const result: LayoutSuggestion[] = [];
  const wallInfos = analyzeWalls(walls, bb);
  const entrance = findEntrancePosition(walls, openings, bb);
  const longestWall = findLongestWall(wallInfos);
  const backWall = findBackWall(wallInfos, entrance);

  // バーカウンター（最長壁沿い）
  if (longestWall) {
    const counterLen = Math.min(longestWall.length * 0.8, 4);
    const counterScale: [number, number, number] = [counterLen, 1.1, 0.6];
    const p = placeAlongWall(longestWall, 0.5, 0.5);
    result.push({
      furnitureType: 'counter',
      position: [p.x, 0, p.z],
      rotation: p.rotation,
      reason: '最長壁沿いにバーカウンターを配置（バーの主役）',
      scale: counterScale,
    });

    // カウンター前にスツール（0.7m間隔）
    const stoolScale = getDefaultScale('stool');
    const numStools = Math.floor(counterLen / 0.7);
    for (let i = 0; i < numStools; i++) {
      const t = (i + 0.5) / numStools;
      const startRatio = 0.5 - (counterLen / longestWall.length) / 2;
      const endRatio = 0.5 + (counterLen / longestWall.length) / 2;
      const ratio = startRatio + (endRatio - startRatio) * t;
      const sp = placeAlongWall(longestWall, ratio, 0.5 + 0.5);
      const pos: [number, number, number] = [sp.x, 0, sp.z];
      if (!hasCollision(pos, stoolScale, result)) {
        result.push({
          furnitureType: 'stool',
          position: pos,
          rotation: sp.rotation + Math.PI,
          reason: 'カウンター席用スツール',
          scale: stoolScale,
        });
      }
    }
  }

  // 奥に棚（ボトルラック）
  if (backWall && backWall !== longestWall) {
    const shelfScale: [number, number, number] = [Math.min(backWall.length * 0.6, 2), 2.0, 0.35];
    const p = placeAlongWall(backWall, 0.5, 0.3);
    const pos: [number, number, number] = [p.x, 0, p.z];
    if (!hasCollision(pos, shelfScale, result)) {
      result.push({
        furnitureType: 'shelf',
        position: pos,
        rotation: p.rotation,
        reason: '奥の壁にボトルラックを配置（バックバーの演出）',
        scale: shelfScale,
      });
    }
  }

  // ハイテーブルを散在配置
  const htScale = getDefaultScale('bar_table');
  const stoolScale = getDefaultScale('stool');
  const spacing = 1.8;
  for (let x = bb.minX + 1.5; x <= bb.maxX - 1.0; x += spacing) {
    for (let z = bb.minZ + 1.5; z <= bb.maxZ - 1.0; z += spacing) {
      const pos: [number, number, number] = [x, 0, z];
      if (!hasCollision(pos, htScale, result)) {
        result.push({
          furnitureType: 'bar_table',
          position: pos,
          rotation: 0,
          reason: '立ち飲みハイテーブル（カジュアルな交流を促進）',
          scale: htScale,
        });
        // テーブル周りにスツール2脚
        for (const offset of [{ dz: -0.5 }, { dz: 0.5 }]) {
          const sp: [number, number, number] = [x, 0, z + offset.dz];
          if (!hasCollision(sp, stoolScale, result)) {
            result.push({
              furnitureType: 'stool',
              position: sp,
              rotation: offset.dz > 0 ? Math.PI : 0,
              reason: 'ハイテーブル用スツール',
              scale: stoolScale,
            });
          }
        }
      }
    }
  }

  // レジ
  const regScale = getDefaultScale('register');
  const regPos: [number, number, number] = [entrance.x + 0.8, 0, entrance.z + 0.6];
  if (!hasCollision(regPos, regScale, result)) {
    result.push({
      furnitureType: 'register',
      position: regPos,
      rotation: entrance.wallAngle + Math.PI,
      reason: '入口脇にレジを配置',
      scale: regScale,
    });
  }

  return result;
}

function layoutClinic(walls: WallSegment[], openings: Opening[], bb: BoundingBox): LayoutSuggestion[] {
  const result: LayoutSuggestion[] = [];
  const wallInfos = analyzeWalls(walls, bb);
  const entrance = findEntrancePosition(walls, openings, bb);
  const backWall = findBackWall(wallInfos, entrance);
  const entranceWall = findEntranceWall(wallInfos, entrance);

  // 受付カウンター
  const recScale = getDefaultScale('reception_desk');
  result.push({
    furnitureType: 'reception_desk',
    position: [entrance.x + 1.0, 0, entrance.z + 1.0],
    rotation: entrance.wallAngle + Math.PI,
    reason: '入口正面に受付カウンターを配置（患者様の案内拠点）',
    scale: recScale,
  });

  // 待合椅子（入口付近にベンチ2-3脚）
  const benchScale = getDefaultScale('bench');
  for (let i = 0; i < 3; i++) {
    const pos: [number, number, number] = [bb.minX + 1.0, 0, entrance.z + 1.5 + i * 0.8];
    if (!hasCollision(pos, benchScale, result)) {
      result.push({
        furnitureType: 'bench',
        position: pos,
        rotation: Math.PI / 2,
        reason: '待合エリアにベンチを配置（座って診察を待てる空間）',
        scale: benchScale,
      });
    }
  }

  // 奥にデスク（診察机）+椅子
  if (backWall) {
    const deskScale = getDefaultScale('desk');
    const p = placeAlongWall(backWall, 0.3, 0.6);
    const deskPos: [number, number, number] = [p.x, 0, p.z];
    if (!hasCollision(deskPos, deskScale, result)) {
      result.push({
        furnitureType: 'desk',
        position: deskPos,
        rotation: p.rotation,
        reason: '奥に診察デスクを配置（プライバシー確保）',
        scale: deskScale,
      });
      const chairScale = getDefaultScale('chair');
      // 医師用椅子
      const dcPos: [number, number, number] = [
        p.x + Math.cos(backWall.normalAngle) * 0.5,
        0,
        p.z + Math.sin(backWall.normalAngle) * 0.5,
      ];
      if (!hasCollision(dcPos, chairScale, result)) {
        result.push({
          furnitureType: 'chair',
          position: dcPos,
          rotation: p.rotation + Math.PI,
          reason: '医師用チェア',
          scale: chairScale,
        });
      }
      // 患者用椅子
      const pcPos: [number, number, number] = [
        p.x + Math.cos(backWall.normalAngle) * 1.2,
        0,
        p.z + Math.sin(backWall.normalAngle) * 1.2,
      ];
      if (!hasCollision(pcPos, chairScale, result)) {
        result.push({
          furnitureType: 'chair',
          position: pcPos,
          rotation: p.rotation,
          reason: '患者用チェア',
          scale: chairScale,
        });
      }
    }

    // シンク（手洗い）
    const sinkScale = getDefaultScale('sink');
    const sp = placeAlongWall(backWall, 0.7, 0.4);
    const sinkPos: [number, number, number] = [sp.x, 0, sp.z];
    if (!hasCollision(sinkPos, sinkScale, result)) {
      result.push({
        furnitureType: 'sink',
        position: sinkPos,
        rotation: sp.rotation,
        reason: '奥の壁に手洗い場を配置（衛生管理の基本）',
        scale: sinkScale,
      });
    }
  }

  // 棚（収納）
  const sideWall = wallInfos.find(wi => wi !== entranceWall && wi !== backWall);
  if (sideWall) {
    const shelfScale = getDefaultScale('shelf');
    const p = placeAlongWall(sideWall, 0.5, 0.3);
    const pos: [number, number, number] = [p.x, 0, p.z];
    if (!hasCollision(pos, shelfScale, result)) {
      result.push({
        furnitureType: 'shelf',
        position: pos,
        rotation: p.rotation,
        reason: '壁面に収納棚を配置（医療器具・書類の整理）',
        scale: shelfScale,
      });
    }
  }

  return result;
}

// ────────────────────────────────────────────────
// メインエクスポート
// ────────────────────────────────────────────────

/**
 * 部屋タイプに基づいて家具の自動配置を生成する。
 *
 * 完全ローカル計算（外部API不使用）。壁・開口部のジオメトリから
 * ルールベースで最適な家具配置を算出する。
 */
export function generateAutoLayout(
  walls: WallSegment[],
  openings: Opening[],
  roomType: RoomType,
  _roomHeight: number,
): LayoutSuggestion[] {
  const bb = computeBoundingBox(walls);

  switch (roomType) {
    case 'cafe':       return layoutCafe(walls, openings, bb);
    case 'restaurant': return layoutRestaurant(walls, openings, bb);
    case 'office':     return layoutOffice(walls, openings, bb);
    case 'salon':      return layoutSalon(walls, openings, bb);
    case 'retail':     return layoutRetail(walls, openings, bb);
    case 'bar':        return layoutBar(walls, openings, bb);
    case 'clinic':     return layoutClinic(walls, openings, bb);
    default:           return [];
  }
}
