/**
 * occlusion-culling — 壁の背後にある家具のオクルージョンカリング
 *
 * カメラ位置から各家具への2Dレイを飛ばし、
 * 壁セグメントとの交差判定でビジビリティを決定する。
 * 高さは無視し、平面図上のXZ座標で判定する。
 */

import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';

// ─── カメラ移動閾値（この距離以上動いたら再計算） ─────────
const CAMERA_MOVE_THRESHOLD = 0.3;

// キャッシュ用
let lastCameraX = Infinity;
let lastCameraZ = Infinity;
let cachedVisible: Set<string> = new Set();

/**
 * 2D線分の交差判定（XZ平面）
 * 線分AB と 線分CD が交差するかを判定する。
 *
 * @returns 交差する場合 true
 */
function segmentsIntersect2D(
  ax: number, az: number,
  bx: number, bz: number,
  cx: number, cz: number,
  dx: number, dz: number,
): boolean {
  // 方向ベクトル
  const abx = bx - ax;
  const abz = bz - az;
  const cdx = dx - cx;
  const cdz = dz - cz;

  // 分母（平行判定）
  const denom = abx * cdz - abz * cdx;
  if (Math.abs(denom) < 1e-10) return false;

  const acx = cx - ax;
  const acz = cz - az;

  // パラメータ t, u を求める
  const t = (acx * cdz - acz * cdx) / denom;
  const u = (acx * abz - acz * abx) / denom;

  // 両方のパラメータが [0, 1] の範囲内なら交差
  // t は (0, 1) の開区間で判定（端点での偽陽性を回避）
  return t > 0.01 && t < 0.99 && u > 0.0 && u < 1.0;
}

/**
 * 指定の点が壁の向こう側にあるかを判定する（2D）。
 *
 * @param cameraPos カメラのXZ座標
 * @param targetPos 対象のXZ座標
 * @param walls 壁セグメント配列
 * @returns 壁の背後にある場合 true
 */
export function isPointBehindWalls(
  cameraPos: { x: number; z: number },
  targetPos: { x: number; z: number },
  walls: WallSegment[],
): boolean {
  for (const wall of walls) {
    // 壁の2D座標（floor-planのyを3DのzとしてSwap）
    if (segmentsIntersect2D(
      cameraPos.x, cameraPos.z,
      targetPos.x, targetPos.z,
      wall.start.x, wall.start.y,
      wall.end.x, wall.end.y,
    )) {
      return true;
    }
  }
  return false;
}

/**
 * カメラ位置から見て壁に遮られていない家具のIDセットを返す。
 *
 * 内部でカメラ移動閾値チェックを行い、カメラがほぼ動いていない場合は
 * 前回のキャッシュ結果を返して計算コストを削減する。
 *
 * @param cameraPosition カメラの3D位置
 * @param walls 壁セグメント配列
 * @param furniture 全家具配列
 * @returns 可視な家具のIDセット
 */
export function computeVisibleFurniture(
  cameraPosition: THREE.Vector3,
  walls: WallSegment[],
  furniture: FurnitureItem[],
): Set<string> {
  // カメラがほとんど動いていない場合はキャッシュを返す
  const dx = cameraPosition.x - lastCameraX;
  const dz = cameraPosition.z - lastCameraZ;
  const cameraMoved = Math.sqrt(dx * dx + dz * dz);

  if (cameraMoved < CAMERA_MOVE_THRESHOLD && cachedVisible.size > 0) {
    return cachedVisible;
  }

  // カメラ位置を更新
  lastCameraX = cameraPosition.x;
  lastCameraZ = cameraPosition.z;

  const visible = new Set<string>();
  const camPos = { x: cameraPosition.x, z: cameraPosition.z };

  for (const item of furniture) {
    // 家具の中心座標（3D position → XZ平面）
    const targetPos = { x: item.position[0], z: item.position[2] };

    // 壁による遮蔽チェック
    if (!isPointBehindWalls(camPos, targetPos, walls)) {
      visible.add(item.id);
    }
  }

  // キャッシュ更新
  cachedVisible = visible;
  return visible;
}

/**
 * キャッシュをリセットする（壁の構成が変わった時に呼ぶ）
 */
export function resetOcclusionCache(): void {
  lastCameraX = Infinity;
  lastCameraZ = Infinity;
  cachedVisible = new Set();
}
