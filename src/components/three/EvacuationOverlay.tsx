'use client';

// 避難経路3Dオーバーレイ
// 避難経路を緑の破線、ボトルネックを赤い脈動マーカー、出口を矢印で可視化

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';
import { simulateEvacuation, EvacuationRoute } from '@/lib/evacuation-simulator';

interface EvacuationOverlayProps {
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
  roomHeight: number;
  enabled: boolean;
}

/** 避難経路の破線マテリアル */
const routeMaterial = new THREE.LineDashedMaterial({
  color: 0x22c55e,
  dashSize: 0.15,
  gapSize: 0.08,
  linewidth: 1,
  transparent: true,
  opacity: 0.7,
});

/** ボトルネックマーカーのジオメトリ */
const bottleneckGeometry = new THREE.SphereGeometry(0.08, 12, 12);

/** 出口矢印のジオメトリ（三角錐で表現） */
const exitConeGeometry = new THREE.ConeGeometry(0.12, 0.3, 8);

/** 出口ベースのジオメトリ */
const exitBaseGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16);

/**
 * 避難経路ラインの描画
 */
const RouteLines = React.memo(function RouteLines({
  routes,
}: {
  routes: EvacuationRoute[];
}) {
  // 有効な（ブロックされていない）経路のみ描画
  const geometries = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    for (const route of routes) {
      if (route.blocked || route.points.length < 2) continue;
      // 経路が長すぎる場合は間引き（パフォーマンス対策）
      const step = route.points.length > 50 ? Math.floor(route.points.length / 25) : 1;
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < route.points.length; i += step) {
        const p = route.points[i];
        // 2D(x,y) → 3D(x, 高さ, z)。床から少し浮かせて表示
        points.push(new THREE.Vector3(p.x, 0.05, p.y));
      }
      // 最後の点を必ず含める
      const last = route.points[route.points.length - 1];
      const lastV = new THREE.Vector3(last.x, 0.05, last.y);
      if (points.length > 0 && !points[points.length - 1].equals(lastV)) {
        points.push(lastV);
      }
      if (points.length >= 2) {
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        geo.computeBoundingSphere();
        geos.push(geo);
      }
    }
    return geos;
  }, [routes]);

  return (
    <group>
      {geometries.map((geo, i) => (
        <lineSegments key={`route-${i}`} geometry={geo} material={routeMaterial}>
          {/* computeLineDistancesは破線表示に必要 */}
        </lineSegments>
      ))}
    </group>
  );
});

/**
 * ボトルネックの脈動マーカー
 */
const BottleneckMarkers = React.memo(function BottleneckMarkers({
  points,
}: {
  points: { x: number; y: number }[];
}) {
  const groupRef = useRef<THREE.Group>(null);

  // 脈動アニメーション
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    const scale = 1.0 + 0.3 * Math.sin(t * 3);
    groupRef.current.children.forEach((child) => {
      child.scale.setScalar(scale);
    });
  });

  if (points.length === 0) return null;

  return (
    <group ref={groupRef}>
      {points.map((pt, i) => (
        <mesh
          key={`bn-${i}`}
          geometry={bottleneckGeometry}
          position={[pt.x, 0.15, pt.y]}
        >
          <meshStandardMaterial
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={0.6}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
});

/**
 * 出口マーカー（緑の矢印 + 台座）
 */
const ExitMarkers = React.memo(function ExitMarkers({
  walls,
  openings,
}: {
  walls: WallSegment[];
  openings: Opening[];
}) {
  // ドア型開口部の位置を算出
  const exitPositions = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    for (const op of openings) {
      if (op.type !== 'door') continue;
      const wall = walls.find((w) => w.id === op.wallId);
      if (!wall) continue;
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) continue;
      const t = (op.positionAlongWall + op.width / 2) / len;
      positions.push(new THREE.Vector3(
        wall.start.x + dx * t,
        0.2,
        wall.start.y + dy * t
      ));
    }
    return positions;
  }, [walls, openings]);

  return (
    <group>
      {exitPositions.map((pos, i) => (
        <group key={`exit-${i}`} position={pos}>
          {/* 台座 */}
          <mesh geometry={exitBaseGeometry} position={[0, -0.1, 0]}>
            <meshStandardMaterial color="#22c55e" />
          </mesh>
          {/* 上向き矢印（コーン） */}
          <mesh
            geometry={exitConeGeometry}
            position={[0, 0.15, 0]}
          >
            <meshStandardMaterial
              color="#22c55e"
              emissive="#22c55e"
              emissiveIntensity={0.4}
            />
          </mesh>
          {/* 「EXIT」ラベル */}
          <Html
            position={[0, 0.45, 0]}
            center
            distanceFactor={6}
            style={{ pointerEvents: 'none' }}
          >
            <div
              style={{
                background: '#22c55e',
                color: '#fff',
                fontSize: 10,
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }}
            >
              EXIT
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
});

/**
 * 避難情報サマリーラベル
 */
const EvacuationSummary = React.memo(function EvacuationSummary({
  evacuationTimeSeconds,
  exitCount,
  maxOccupancy,
  bottleneckCount,
  position,
}: {
  evacuationTimeSeconds: number;
  exitCount: number;
  maxOccupancy: number;
  bottleneckCount: number;
  position: [number, number, number];
}) {
  return (
    <Html
      position={position}
      center
      distanceFactor={10}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          fontSize: 11,
          padding: '8px 12px',
          borderRadius: 6,
          minWidth: 160,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 4 }}>
          避難解析結果
        </div>
        <div>避難時間: <span style={{ color: evacuationTimeSeconds > 120 ? '#ef4444' : '#22c55e', fontWeight: 'bold' }}>
          {evacuationTimeSeconds === Infinity ? '算出不可' : `${evacuationTimeSeconds}秒`}
        </span></div>
        <div>出口数: {exitCount}</div>
        <div>最大収容人数: {maxOccupancy}人</div>
        {bottleneckCount > 0 && (
          <div style={{ color: '#fbbf24' }}>
            ボトルネック: {bottleneckCount}箇所
          </div>
        )}
      </div>
    </Html>
  );
});

/**
 * 避難経路オーバーレイコンポーネント
 * 壁・開口部・家具データから避難経路を解析し、3D空間にオーバーレイ表示
 */
export const EvacuationOverlay = React.memo(function EvacuationOverlay({
  walls,
  openings,
  furniture,
  roomHeight,
  enabled,
}: EvacuationOverlayProps) {
  // 無効時は何も描画しない
  if (!enabled) return null;

  // 避難シミュレーション実行（依存データが変化したときのみ再計算）
  const result = useMemo(
    () => simulateEvacuation(walls, openings, furniture, roomHeight),
    [walls, openings, furniture, roomHeight]
  );

  // サマリーラベルの表示位置（部屋の上方中央）
  const summaryPosition = useMemo<[number, number, number]>(() => {
    if (walls.length === 0) return [0, roomHeight + 0.5, 0];
    let sumX = 0, sumZ = 0, count = 0;
    for (const w of walls) {
      sumX += w.start.x + w.end.x;
      sumZ += w.start.y + w.end.y;
      count += 2;
    }
    return [sumX / count, roomHeight + 0.5, sumZ / count];
  }, [walls, roomHeight]);

  return (
    <group>
      {/* 避難経路ライン */}
      <RouteLines routes={result.routes} />

      {/* ボトルネック脈動マーカー */}
      <BottleneckMarkers points={result.bottlenecks} />

      {/* 出口マーカー */}
      <ExitMarkers walls={walls} openings={openings} />

      {/* 情報サマリー */}
      <EvacuationSummary
        evacuationTimeSeconds={result.evacuationTimeSeconds}
        exitCount={result.exitCount}
        maxOccupancy={result.maxOccupancy}
        bottleneckCount={result.bottlenecks.length}
        position={summaryPosition}
      />
    </group>
  );
});
