'use client';

import React, { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';
import { FurnitureItem, FurnitureType } from '@/types/scene';

// --- 型定義 ---

/** ウェイポイント（経路上の通過点） */
interface Waypoint {
  position: THREE.Vector2;
  /** この地点での速度係数（1.0が通常、0.3が最も遅い） */
  speedFactor: number;
  /** ポイントの種類 */
  type: 'entrance' | 'register' | 'counter' | 'seating' | 'display' | 'aisle' | 'exit';
}

/** 各ドットの状態 */
interface DotState {
  /** 現在のパスインデックス */
  pathIndex: number;
  /** パス上の進行率 (0-1) */
  progress: number;
  /** 割り当てられたパスのウェイポイント列 */
  path: Waypoint[];
  /** ドット固有の速度乗数 */
  speedMultiplier: number;
}

// --- 定数 ---

const DOT_COUNT = 25;
const DOT_RADIUS = 0.06;
const BASE_SPEED = 0.15; // m/s ベース速度

/** 家具タイプ別の速度係数（低いほど客が滞留しやすい） */
const SPEED_BY_FURNITURE: Partial<Record<FurnitureType, number>> = {
  register: 0.3,
  cash_register: 0.3,
  counter: 0.4,
  display_case: 0.35,
  menu_board: 0.4,
  table_square: 0.5,
  table_round: 0.5,
  sofa: 0.5,
  bench: 0.5,
  chair: 0.6,
  stool: 0.6,
  shelf: 0.5,
  bookcase: 0.5,
};

/** 家具タイプからウェイポイント種別へのマッピング */
const FURNITURE_TO_WAYPOINT_TYPE: Partial<Record<FurnitureType, Waypoint['type']>> = {
  register: 'register',
  cash_register: 'register',
  counter: 'counter',
  display_case: 'display',
  menu_board: 'display',
  table_square: 'seating',
  table_round: 'seating',
  sofa: 'seating',
  bench: 'seating',
  chair: 'seating',
  stool: 'seating',
};

// --- ユーティリティ ---

/** 壁データから部屋の境界を取得 */
function getRoomBounds(walls: WallSegment[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (walls.length === 0) return { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    // 2D y → 3D z
    minZ = Math.min(minZ, w.start.y, w.end.y);
    maxZ = Math.max(maxZ, w.start.y, w.end.y);
  }
  return { minX, maxX, minZ, maxZ };
}

/** 入口位置を推定（ドアがある壁の中点、なければ部屋端） */
function findEntrancePosition(walls: WallSegment[]): THREE.Vector2 {
  const bounds = getRoomBounds(walls);
  // デフォルト: 部屋の手前中央
  return new THREE.Vector2((bounds.minX + bounds.maxX) / 2, bounds.maxZ);
}

/** 家具からウェイポイントを生成 */
function generateWaypoints(furniture: FurnitureItem[], walls: WallSegment[]): Waypoint[] {
  const waypoints: Waypoint[] = [];
  const bounds = getRoomBounds(walls);
  const entrance = findEntrancePosition(walls);

  // 入口ウェイポイント
  waypoints.push({
    position: entrance,
    speedFactor: 0.8,
    type: 'entrance',
  });

  // 家具ベースのウェイポイント
  for (const f of furniture) {
    const speedFactor = SPEED_BY_FURNITURE[f.type] ?? 0.7;
    const wpType = FURNITURE_TO_WAYPOINT_TYPE[f.type] ?? 'aisle';
    // 家具の少し手前にウェイポイントを置く（家具中心ではなく近接ポイント）
    const offset = 0.5;
    waypoints.push({
      position: new THREE.Vector2(f.position[0] + offset, f.position[2]),
      speedFactor,
      type: wpType,
    });
  }

  // 通路ウェイポイント（部屋を格子状に分割）
  const stepX = (bounds.maxX - bounds.minX) / 4;
  const stepZ = (bounds.maxZ - bounds.minZ) / 4;
  for (let ix = 1; ix < 4; ix++) {
    for (let iz = 1; iz < 4; iz++) {
      const px = bounds.minX + stepX * ix;
      const pz = bounds.minZ + stepZ * iz;
      // 既存ウェイポイントと近すぎる場合はスキップ
      const tooClose = waypoints.some(
        (wp) => wp.position.distanceTo(new THREE.Vector2(px, pz)) < 0.8
      );
      if (!tooClose) {
        waypoints.push({
          position: new THREE.Vector2(px, pz),
          speedFactor: 1.0,
          type: 'aisle',
        });
      }
    }
  }

  // 出口ウェイポイント（入口と同じ位置）
  waypoints.push({
    position: entrance.clone(),
    speedFactor: 0.8,
    type: 'exit',
  });

  return waypoints;
}

/** ウェイポイント群からランダムなパスを生成（入口→いくつかの中間点→出口） */
function generateRandomPath(waypoints: Waypoint[]): Waypoint[] {
  if (waypoints.length < 2) return waypoints;

  const entrance = waypoints.find((w) => w.type === 'entrance');
  const exit = waypoints.find((w) => w.type === 'exit');
  const middlePoints = waypoints.filter((w) => w.type !== 'entrance' && w.type !== 'exit');

  const path: Waypoint[] = [];
  if (entrance) path.push(entrance);

  // 中間点をランダムに3-6個選択
  const count = Math.min(middlePoints.length, 3 + Math.floor(Math.random() * 4));
  const shuffled = [...middlePoints].sort(() => Math.random() - 0.5);
  // 距離順にソート（簡易的な経路最適化）
  const selected = shuffled.slice(0, count);
  if (entrance) {
    selected.sort((a, b) => {
      const da = a.position.distanceTo(entrance.position);
      const db = b.position.distanceTo(entrance.position);
      return da - db;
    });
  }
  path.push(...selected);

  if (exit) path.push(exit);
  return path;
}

/** 2つのウェイポイント間を補間した位置を返す */
function interpolatePosition(
  from: Waypoint,
  to: Waypoint,
  t: number
): { x: number; z: number; speedFactor: number } {
  const x = from.position.x + (to.position.x - from.position.x) * t;
  const z = from.position.y + (to.position.y - from.position.y) * t;
  const speedFactor = from.speedFactor + (to.speedFactor - from.speedFactor) * t;
  return { x, z, speedFactor };
}

/** 速度係数から色を計算（緑=スムーズ → 赤=混雑） */
function speedToColor(speedFactor: number): THREE.Color {
  // speedFactor: 1.0(速い=緑) → 0.3(遅い=赤)
  const t = Math.max(0, Math.min(1, (1.0 - speedFactor) / 0.7));
  const r = t;
  const g = 1.0 - t;
  const b = 0.1;
  return new THREE.Color(r, g, b);
}

// --- コンポーネント ---

interface FlowSimulationProps {
  enabled: boolean;
  walls: WallSegment[];
  furniture: FurnitureItem[];
  speed?: number;
}

/**
 * フローシミュレーション — 客の動線を3D上でアニメーション表示
 * InstancedMeshで高パフォーマンスな多数ドット描画
 */
const FlowSimulation = React.memo(function FlowSimulation({
  enabled,
  walls,
  furniture,
  speed = 1.0,
}: FlowSimulationProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dotsRef = useRef<DotState[]>([]);

  // ウェイポイントの生成（家具・壁が変わったら再計算）
  const waypoints = useMemo(() => generateWaypoints(furniture, walls), [furniture, walls]);

  // ドット初期化
  const initDots = useCallback(() => {
    const dots: DotState[] = [];
    for (let i = 0; i < DOT_COUNT; i++) {
      const path = generateRandomPath(waypoints);
      dots.push({
        pathIndex: 0,
        progress: Math.random(), // 最初はバラバラの位置からスタート
        path,
        speedMultiplier: 0.7 + Math.random() * 0.6, // 個体差
      });
    }
    return dots;
  }, [waypoints]);

  // ウェイポイント変更時にドットを再初期化
  useMemo(() => {
    dotsRef.current = initDots();
  }, [initDots]);

  // ジオメトリとマテリアル
  const geometry = useMemo(() => new THREE.SphereGeometry(DOT_RADIUS, 8, 6), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);

  // ダミーオブジェクト（行列計算用）
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    if (!enabled || !meshRef.current) return;
    const mesh = meshRef.current;
    const dots = dotsRef.current;

    for (let i = 0; i < DOT_COUNT; i++) {
      const dot = dots[i];
      if (!dot || dot.path.length < 2) continue;

      const fromIdx = dot.pathIndex;
      const toIdx = fromIdx + 1;

      if (toIdx >= dot.path.length) {
        // パス終端 → 新しいパスを割り当て
        dot.path = generateRandomPath(waypoints);
        dot.pathIndex = 0;
        dot.progress = 0;
        dot.speedMultiplier = 0.7 + Math.random() * 0.6;
        continue;
      }

      const from = dot.path[fromIdx];
      const to = dot.path[toIdx];
      const segmentLength = from.position.distanceTo(to.position);
      const currentSpeed = BASE_SPEED * speed * dot.speedMultiplier * from.speedFactor;
      const progressIncrement = segmentLength > 0 ? (currentSpeed * delta) / segmentLength : 1;

      dot.progress += progressIncrement;

      if (dot.progress >= 1.0) {
        dot.progress = 0;
        dot.pathIndex++;
        if (dot.pathIndex + 1 >= dot.path.length) {
          // 次のパスへ
          dot.path = generateRandomPath(waypoints);
          dot.pathIndex = 0;
          dot.speedMultiplier = 0.7 + Math.random() * 0.6;
        }
        continue;
      }

      const pos = interpolatePosition(from, to, dot.progress);

      // 位置セット（Y=0.05で床面すれすれ）
      dummy.position.set(pos.x, 0.05, pos.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // 色セット
      const col = speedToColor(pos.speedFactor);
      colorObj.setRGB(col.r, col.g, col.b);
      mesh.setColorAt(i, colorObj);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (!enabled) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, DOT_COUNT]}
      frustumCulled={false}
    />
  );
});

export default FlowSimulation;
