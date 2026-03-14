'use client';

/**
 * 音響可視化コンポーネント
 *
 * 部屋中央からレイを多方向に射出し、壁での反射を最大3回まで追跡する。
 * 家具（ソファ・カーテン・ラグなど柔軟素材）による吸音ゾーンと、
 * 硬い壁面での反射集中ポイントを可視化する。
 * RT60（残響時間）の近似値も算出・表示する。
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { WallSegment, Point2D } from '@/types/floor-plan';
import { FurnitureItem, FurnitureType } from '@/types/scene';

interface AcousticVisualizationProps {
  walls: WallSegment[];
  furniture: FurnitureItem[];
  roomHeight: number;
  enabled: boolean;
}

/** レイの最大反射回数 */
const MAX_BOUNCES = 3;

/** 射出レイの本数 */
const RAY_COUNT = 120;

/** 音速 (m/s) */
const SPEED_OF_SOUND = 343;

/** 吸音素材として扱う家具タイプ */
const SOFT_FURNITURE_TYPES: FurnitureType[] = [
  'sofa', 'curtain', 'rug', 'chair', 'bench',
];

/** 素材別吸音係数（0=全反射, 1=全吸収） */
const ABSORPTION_COEFFICIENTS: Record<string, number> = {
  sofa: 0.7,
  curtain: 0.8,
  rug: 0.6,
  chair: 0.3,
  bench: 0.2,
  wall_hard: 0.05,
  wall_default: 0.1,
};

/** 吸音ゾーンの半径 (m) */
const ABSORPTION_ZONE_RADIUS = 0.8;

/** 反射ホットスポットの検出閾値（同一地点に収束するレイ数） */
const HOTSPOT_THRESHOLD = 4;

/** ホットスポット検出の距離閾値 (m) */
const HOTSPOT_MERGE_DISTANCE = 0.5;

/** 2Dベクトル */
interface Vec2 {
  x: number;
  y: number;
}

/** レイセグメント（描画用） */
interface RaySegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** 吸収レベル: 0=全反射, 1=全吸収 */
  absorption: number;
}

/** 反射ポイント */
interface ReflectionPoint {
  position: Vec2;
  count: number;
}

/**
 * 2D線分の交差判定
 * 線分AB と CD の交点パラメータ t を返す（交差なしなら null）
 */
function lineSegmentIntersection(
  a: Vec2, b: Vec2, c: Vec2, d: Vec2
): { t: number; u: number; point: Vec2 } | null {
  const dx1 = b.x - a.x;
  const dy1 = b.y - a.y;
  const dx2 = d.x - c.x;
  const dy2 = d.y - c.y;

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null; // 平行

  const t = ((c.x - a.x) * dy2 - (c.y - a.y) * dx2) / denom;
  const u = ((c.x - a.x) * dy1 - (c.y - a.y) * dx1) / denom;

  if (t < 0.001 || t > 1.0 || u < 0 || u > 1.0) return null;

  return {
    t,
    u,
    point: { x: a.x + t * dx1, y: a.y + t * dy1 },
  };
}

/**
 * 壁の法線ベクトルを計算（2D）
 */
function wallNormal(wall: WallSegment): Vec2 {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return { x: 0, y: 1 };
  // 右手系の法線
  return { x: -dy / len, y: dx / len };
}

/**
 * 方向ベクトルを法線で反射
 */
function reflectDirection(dir: Vec2, normal: Vec2): Vec2 {
  const dot = dir.x * normal.x + dir.y * normal.y;
  return {
    x: dir.x - 2 * dot * normal.x,
    y: dir.y - 2 * dot * normal.y,
  };
}

/**
 * 点が家具のバウンディングボックス内にあるか判定
 */
function isPointNearFurniture(
  point: Vec2,
  furniture: FurnitureItem[],
  radius: number
): FurnitureItem | null {
  for (const item of furniture) {
    // 家具座標: position[0]=x, position[2]=z (2D平面)
    const fx = item.position[0];
    const fz = item.position[2];
    const sx = item.scale[0];
    const sz = item.scale[2];
    const halfW = (sx / 2) + radius;
    const halfD = (sz / 2) + radius;

    if (
      Math.abs(point.x - fx) <= halfW &&
      Math.abs(point.y - fz) <= halfD
    ) {
      return item;
    }
  }
  return null;
}

/**
 * 部屋の中心座標を壁データから算出
 */
function computeRoomCenter(walls: WallSegment[]): Vec2 {
  if (walls.length === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const w of walls) {
    sumX += w.start.x + w.end.x;
    sumY += w.start.y + w.end.y;
    count += 2;
  }
  return { x: sumX / count, y: sumY / count };
}

/**
 * 部屋の体積を壁座標から近似計算（凸包ベースの面積 × 天井高）
 */
function estimateRoomVolume(walls: WallSegment[], height: number): number {
  // 全頂点を集めて最小/最大で面積を近似
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  const area = (maxX - minX) * (maxY - minY);
  return area * height;
}

/**
 * 壁と家具の全表面積を近似計算
 */
function estimateTotalSurfaceArea(
  walls: WallSegment[],
  furniture: FurnitureItem[],
  roomHeight: number
): { totalArea: number; totalAbsorption: number } {
  let totalArea = 0;
  let totalAbsorption = 0;

  // 壁面積
  for (const w of walls) {
    const dx = w.end.x - w.start.x;
    const dy = w.end.y - w.start.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    const area = wallLen * (w.height || roomHeight);
    totalArea += area;
    totalAbsorption += area * ABSORPTION_COEFFICIENTS.wall_default;
  }

  // 床と天井（近似: バウンディングボックスの面積 × 2）
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  const floorArea = (maxX - minX) * (maxY - minY);
  totalArea += floorArea * 2; // 床 + 天井
  totalAbsorption += floorArea * 0.15; // 床（木材等）
  totalAbsorption += floorArea * 0.05; // 天井（石膏ボード等）

  // 家具の吸音面積
  for (const item of furniture) {
    const coeff = ABSORPTION_COEFFICIENTS[item.type] ?? 0.1;
    const surfArea = item.scale[0] * item.scale[1] * 2 +
                     item.scale[1] * item.scale[2] * 2 +
                     item.scale[0] * item.scale[2] * 2;
    totalArea += surfArea;
    totalAbsorption += surfArea * coeff;
  }

  return { totalArea, totalAbsorption };
}

/**
 * サビーネの公式によるRT60近似計算
 * RT60 = 0.161 * V / A
 * V: 部屋体積 (m³), A: 総吸音力 (m² sabins)
 */
function calculateRT60(
  walls: WallSegment[],
  furniture: FurnitureItem[],
  roomHeight: number
): number {
  const volume = estimateRoomVolume(walls, roomHeight);
  const { totalAbsorption } = estimateTotalSurfaceArea(walls, furniture, roomHeight);
  if (totalAbsorption <= 0) return 99; // 吸音ゼロ = 無限残響
  return (0.161 * volume) / totalAbsorption;
}

/**
 * レイトレーシングを実行し、描画用セグメントと反射ポイントを返す
 */
function traceRays(
  walls: WallSegment[],
  furniture: FurnitureItem[],
  roomHeight: number
): { segments: RaySegment[]; hotspots: ReflectionPoint[] } {
  const center = computeRoomCenter(walls);
  const segments: RaySegment[] = [];
  const reflectionPoints: Vec2[] = [];
  const softFurniture = furniture.filter(f => SOFT_FURNITURE_TYPES.includes(f.type));
  const rayHeight = roomHeight * 0.5; // レイの高さ（部屋中央）

  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (i / RAY_COUNT) * Math.PI * 2;
    let dir: Vec2 = { x: Math.cos(angle), y: Math.sin(angle) };
    let origin: Vec2 = { ...center };
    let cumulativeAbsorption = 0;

    for (let bounce = 0; bounce <= MAX_BOUNCES; bounce++) {
      // 最も近い壁との交点を探す
      let closestHit: { point: Vec2; wall: WallSegment; t: number } | null = null;
      let minT = Infinity;

      const rayEnd: Vec2 = {
        x: origin.x + dir.x * 50, // 十分長いレイ
        y: origin.y + dir.y * 50,
      };

      for (const wall of walls) {
        const hit = lineSegmentIntersection(
          origin, rayEnd,
          { x: wall.start.x, y: wall.start.y },
          { x: wall.end.x, y: wall.end.y }
        );
        if (hit && hit.t < minT) {
          minT = hit.t;
          closestHit = { point: hit.point, wall: wall, t: hit.t };
        }
      }

      if (!closestHit) break; // 壁に当たらない場合終了

      // レイ経路上の家具による吸収チェック
      const nearFurniture = isPointNearFurniture(
        closestHit.point, softFurniture, ABSORPTION_ZONE_RADIUS
      );
      if (nearFurniture) {
        cumulativeAbsorption += ABSORPTION_COEFFICIENTS[nearFurniture.type] ?? 0.3;
      }

      // 壁面の吸収
      cumulativeAbsorption += ABSORPTION_COEFFICIENTS.wall_default;

      // セグメントを記録
      const clampedAbsorption = Math.min(1, cumulativeAbsorption);
      segments.push({
        start: new THREE.Vector3(origin.x, rayHeight, origin.y),
        end: new THREE.Vector3(closestHit.point.x, rayHeight, closestHit.point.y),
        absorption: clampedAbsorption,
      });

      // 反射ポイントを記録
      reflectionPoints.push({ ...closestHit.point });

      // 反射方向を計算
      const normal = wallNormal(closestHit.wall);
      dir = reflectDirection(dir, normal);
      origin = {
        x: closestHit.point.x + dir.x * 0.01, // 壁面から微小距離離す
        y: closestHit.point.y + dir.y * 0.01,
      };

      // 吸収が十分大きければ打ち切り
      if (cumulativeAbsorption >= 0.95) break;
    }
  }

  // ホットスポット検出（反射ポイントの密集箇所）
  const hotspots: ReflectionPoint[] = [];
  const visited = new Set<number>();

  for (let i = 0; i < reflectionPoints.length; i++) {
    if (visited.has(i)) continue;
    let cluster = [reflectionPoints[i]];
    visited.add(i);

    for (let j = i + 1; j < reflectionPoints.length; j++) {
      if (visited.has(j)) continue;
      const dx = reflectionPoints[i].x - reflectionPoints[j].x;
      const dy = reflectionPoints[i].y - reflectionPoints[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < HOTSPOT_MERGE_DISTANCE) {
        cluster.push(reflectionPoints[j]);
        visited.add(j);
      }
    }

    if (cluster.length >= HOTSPOT_THRESHOLD) {
      const cx = cluster.reduce((s, p) => s + p.x, 0) / cluster.length;
      const cy = cluster.reduce((s, p) => s + p.y, 0) / cluster.length;
      hotspots.push({ position: { x: cx, y: cy }, count: cluster.length });
    }
  }

  return { segments, hotspots };
}

/**
 * 吸収レベルに応じた色を返す
 * 赤=硬反射, 黄=混合, 緑=吸音
 */
function absorptionColor(absorption: number): THREE.Color {
  if (absorption < 0.3) {
    // 赤（硬反射）
    return new THREE.Color(1.0, 0.2, 0.1);
  } else if (absorption < 0.6) {
    // 黄（混合）
    const t = (absorption - 0.3) / 0.3;
    return new THREE.Color(1.0, 0.8 + 0.2 * t, 0.1);
  } else {
    // 緑（吸音）
    const t = (absorption - 0.6) / 0.4;
    return new THREE.Color(0.2 * (1 - t), 0.8 + 0.2 * t, 0.1);
  }
}

export const AcousticVisualization = React.memo(function AcousticVisualization({
  walls,
  furniture,
  roomHeight,
  enabled,
}: AcousticVisualizationProps) {
  // レイトレーシング結果をメモ化（壁・家具変更時のみ再計算）
  const { segments, hotspots, rt60, softItems, center } = useMemo(() => {
    if (!enabled || walls.length === 0) {
      return {
        segments: [] as RaySegment[],
        hotspots: [] as ReflectionPoint[],
        rt60: 0,
        softItems: [] as FurnitureItem[],
        center: { x: 0, y: 0 } as Vec2,
      };
    }

    const traced = traceRays(walls, furniture, roomHeight);
    const rt60Value = calculateRT60(walls, furniture, roomHeight);
    const soft = furniture.filter(f => SOFT_FURNITURE_TYPES.includes(f.type));
    const roomCenter = computeRoomCenter(walls);

    return {
      segments: traced.segments,
      hotspots: traced.hotspots,
      rt60: rt60Value,
      softItems: soft,
      center: roomCenter,
    };
  }, [walls, furniture, roomHeight, enabled]);

  // レイ線分のジオメトリをメモ化
  const rayGeometries = useMemo(() => {
    return segments.map((seg) => {
      const points = [seg.start, seg.end];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const color = absorptionColor(seg.absorption);
      return { geometry, color, key: `${seg.start.x}-${seg.start.z}-${seg.end.x}-${seg.end.z}` };
    });
  }, [segments]);

  if (!enabled || walls.length === 0) return null;

  // RT60の評価テキスト
  const rt60Label = rt60 < 0.5
    ? '非常にデッド（吸音過多）'
    : rt60 < 1.0
      ? '適度（会話向き）'
      : rt60 < 2.0
        ? 'やや残響あり（音楽向き）'
        : '残響過多（反響が強い）';

  return (
    <group name="acoustic-visualization">
      {/* レイ線分 */}
      {rayGeometries.map((ray, i) => (
        <lineSegments key={`ray-${i}`} geometry={ray.geometry}>
          <lineBasicMaterial
            color={ray.color}
            transparent
            opacity={0.5}
            linewidth={1}
          />
        </lineSegments>
      ))}

      {/* 吸音ゾーン（柔軟素材家具の周辺） */}
      {softItems.map((item) => (
        <mesh
          key={`absorb-zone-${item.id}`}
          position={[item.position[0], roomHeight * 0.3, item.position[2]]}
        >
          <sphereGeometry args={[ABSORPTION_ZONE_RADIUS, 16, 12]} />
          <meshBasicMaterial
            color="#22c55e"
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 反射ホットスポット */}
      {hotspots.map((hs, i) => (
        <mesh
          key={`hotspot-${i}`}
          position={[hs.position.x, roomHeight * 0.5, hs.position.y]}
        >
          <sphereGeometry args={[0.15 + hs.count * 0.02, 12, 8]} />
          <meshBasicMaterial
            color="#f97316"
            transparent
            opacity={0.6}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* RT60表示ラベル */}
      <Html
        position={[center.x, roomHeight + 0.3, center.y]}
        center
        distanceFactor={8}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: 'sans-serif',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            RT60: {rt60.toFixed(2)}秒
          </div>
          <div style={{ fontSize: '11px', opacity: 0.8 }}>
            {rt60Label}
          </div>
        </div>
      </Html>
    </group>
  );
});
