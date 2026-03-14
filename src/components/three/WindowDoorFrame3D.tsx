'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Opening, WallSegment } from '@/types/floor-plan';

// --- 日本語コメント ---
// 窓・ドアの3D押出しフレームコンポーネント
// フラットなBoxGeometryの代わりにExtrudeGeometryで立体的なL字断面フレームを生成
// 品質レベルに応じてベベル・セグメント数を調整

interface WindowDoorFrame3DProps {
  opening: Opening;
  wall: WallSegment;
  roomHeight: number;
  style: string; // スタイル名（色・マテリアル選択用）
  qualityLevel: 'high' | 'medium' | 'low';
}

// --- フレーム寸法定数 ---
const FRAME_WIDTH = 0.05;      // フレーム幅 (m)
const FRAME_DEPTH = 0.08;      // フレーム奥行き（壁面からの出っ張り）(m)
const RABBET_DEPTH = 0.02;     // ラベット（段差）深さ (m)
const RABBET_INSET = 0.015;    // ラベット内側オフセット (m)

// --- 窓台寸法 ---
const SILL_DEPTH = 0.12;       // 窓台の奥行き (m)
const SILL_THICKNESS = 0.02;   // 窓台の厚さ (m)
const SILL_OVERHANG = 0.02;    // 窓台の左右はみ出し (m)

// --- ガラス ---
const GLASS_THICKNESS = 0.006; // ガラス厚 (m)

/** スタイルに応じた窓フレーム色を返す */
function getWindowFrameColor(style: string): string {
  switch (style) {
    case 'japanese': return '#8B7355';
    case 'luxury': return '#E8E0D0';
    case 'industrial': return '#555555';
    case 'modern': return '#444444';
    case 'cafe': return '#6B4226';
    case 'minimal': return '#FFFFFF';
    case 'scandinavian': return '#FFFFFF';
    case 'retro': return '#DDD5C0';
    case 'medical': return '#FFFFFF';
    default: return '#FFFFFF';
  }
}

/** スタイルに応じたドアフレーム色を返す */
function getDoorFrameColor(style: string): string {
  switch (style) {
    case 'japanese': return '#6B5A3C';
    case 'luxury': return '#1A1210';
    case 'industrial': return '#3A3A3A';
    case 'modern': return '#333333';
    case 'cafe': return '#5C3A1E';
    case 'minimal': return '#666666';
    case 'scandinavian': return '#C8B896';
    case 'retro': return '#4A2810';
    case 'medical': return '#D0D0D0';
    default: return '#5C4033';
  }
}

/** フレームが木材かペイントかを判定 */
function isWoodFrame(style: string): boolean {
  return ['japanese', 'luxury', 'cafe', 'scandinavian', 'retro'].includes(style);
}

/**
 * L字断面プロファイル（フレームのクロスセクション）を生成
 *
 *   ┌──────┐
 *   │      │
 *   │  ┌───┘  ← ラベット段差
 *   │  │
 *   └──┘
 */
function createFrameProfile(): THREE.Shape {
  const shape = new THREE.Shape();
  const fw = FRAME_WIDTH;
  const fd = FRAME_DEPTH;
  const rd = RABBET_DEPTH;
  const ri = RABBET_INSET;

  shape.moveTo(0, 0);
  shape.lineTo(fw, 0);
  shape.lineTo(fw, fd);
  shape.lineTo(fw - ri, fd);
  shape.lineTo(fw - ri, fd - rd);
  shape.lineTo(0, fd - rd);
  shape.closePath();

  return shape;
}

/** 壁セグメントの角度を計算 */
function getWallAngle(wall: WallSegment): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.atan2(dy, dx);
}

/** 壁上の開口部のワールド座標を計算 */
function getOpeningWorldPosition(
  opening: Opening,
  wall: WallSegment
): { x: number; z: number; angle: number } {
  const angle = getWallAngle(wall);
  const wallLength = Math.sqrt(
    Math.pow(wall.end.x - wall.start.x, 2) +
    Math.pow(wall.end.y - wall.start.y, 2)
  );

  // 開口部の中心位置（壁に沿った距離）
  const centerAlongWall = opening.positionAlongWall + opening.width / 2;
  const t = wallLength > 0 ? centerAlongWall / wallLength : 0;

  const x = wall.start.x + (wall.end.x - wall.start.x) * t;
  const z = wall.start.y + (wall.end.y - wall.start.y) * t;

  return { x, z, angle };
}

/**
 * フレームの4辺をExtrudeGeometryで生成
 * 各辺はL字断面を辺に沿って押出し、適切に回転配置する
 */
function useFrameGeometries(
  opening: Opening,
  qualityLevel: 'high' | 'medium' | 'low'
) {
  return useMemo(() => {
    const profile = createFrameProfile();
    const { width, height } = opening;

    const bevelEnabled = qualityLevel === 'high';
    const curveSegments = qualityLevel === 'high' ? 4 : 2;

    const extrudeSettings = (length: number): THREE.ExtrudeGeometryOptions => ({
      depth: length,
      bevelEnabled,
      bevelThickness: bevelEnabled ? 0.002 : 0,
      bevelSize: bevelEnabled ? 0.002 : 0,
      bevelSegments: qualityLevel === 'high' ? 4 : 1,
      curveSegments,
    });

    // 下辺フレーム
    const bottomGeo = new THREE.ExtrudeGeometry(profile, extrudeSettings(width));

    // 上辺フレーム
    const topGeo = new THREE.ExtrudeGeometry(profile, extrudeSettings(width));

    // 左辺フレーム
    const leftGeo = new THREE.ExtrudeGeometry(profile, extrudeSettings(height));

    // 右辺フレーム
    const rightGeo = new THREE.ExtrudeGeometry(profile, extrudeSettings(height));

    return { bottomGeo, topGeo, leftGeo, rightGeo };
  }, [opening.width, opening.height, qualityLevel]);
}

/** 窓台ジオメトリ */
function useSillGeometry(opening: Opening) {
  return useMemo(() => {
    const sillWidth = opening.width + FRAME_WIDTH * 2 + SILL_OVERHANG * 2;
    return new THREE.BoxGeometry(sillWidth, SILL_THICKNESS, SILL_DEPTH);
  }, [opening.width]);
}

/** ガラスペインジオメトリ */
function useGlassGeometry(opening: Opening) {
  return useMemo(() => {
    const glassW = opening.width - RABBET_INSET * 2;
    const glassH = opening.height - RABBET_INSET * 2;
    return new THREE.PlaneGeometry(glassW, glassH);
  }, [opening.width, opening.height]);
}

export const WindowDoorFrame3D = React.memo(function WindowDoorFrame3D({
  opening,
  wall,
  roomHeight: _roomHeight,
  style,
  qualityLevel,
}: WindowDoorFrame3DProps) {
  // LOW品質ではフレームをスキップ
  if (qualityLevel === 'low') return null;

  const { type, width, height, elevation } = opening;
  const isWindow = type === 'window';
  const isDoor = type === 'door';

  // ワールド座標計算
  const worldPos = useMemo(
    () => getOpeningWorldPosition(opening, wall),
    [opening, wall]
  );

  // フレームジオメトリ
  const frameGeos = useFrameGeometries(opening, qualityLevel);

  // 窓台（窓のみ）
  const sillGeo = useSillGeometry(opening);

  // ガラス（窓のみ）
  const glassGeo = useGlassGeometry(opening);

  // フレーム色
  const frameColor = useMemo(
    () => (isWindow ? getWindowFrameColor(style) : getDoorFrameColor(style)),
    [isWindow, style]
  );

  // マテリアルパラメータ
  const wood = isWoodFrame(style);
  const clearcoat = wood ? 0.3 : 0.6;
  const roughness = wood ? 0.5 : 0.3;
  const metalness = style === 'industrial' ? 0.4 : 0.0;

  // フレーム各辺の位置・回転を計算
  const framePieces = useMemo(() => {
    const halfW = width / 2;
    const fw = FRAME_WIDTH;

    const pieces: {
      key: string;
      geometry: THREE.ExtrudeGeometry;
      position: [number, number, number];
      rotation: [number, number, number];
    }[] = [];

    // 下辺: X方向に押出し、Y=elevation、左端から
    pieces.push({
      key: 'bottom',
      geometry: frameGeos.bottomGeo,
      position: [-halfW, elevation, 0],
      rotation: [0, 0, 0],
    });

    // 上辺: 180度回転（L字を上向きに）
    pieces.push({
      key: 'top',
      geometry: frameGeos.topGeo,
      position: [halfW, elevation + height, 0],
      rotation: [0, 0, Math.PI],
    });

    // 左辺: Z軸で-90度回転してY方向に押出し
    pieces.push({
      key: 'left',
      geometry: frameGeos.leftGeo,
      position: [-halfW - fw, elevation, 0],
      rotation: [0, 0, -Math.PI / 2],
    });

    // 右辺: Z軸で90度回転
    pieces.push({
      key: 'right',
      geometry: frameGeos.rightGeo,
      position: [halfW + fw, elevation + height, 0],
      rotation: [0, 0, Math.PI / 2],
    });

    return pieces;
  }, [width, height, elevation, frameGeos]);

  // 窓台の位置
  const sillPosition = useMemo((): [number, number, number] => {
    return [0, elevation - FRAME_WIDTH - SILL_THICKNESS / 2, SILL_DEPTH / 2 - wall.thickness / 2];
  }, [elevation, wall.thickness]);

  // ガラス中心位置
  const glassPosition = useMemo((): [number, number, number] => {
    return [0, elevation + height / 2, 0];
  }, [elevation, height]);

  return (
    <group
      position={[worldPos.x, 0, worldPos.z]}
      rotation={[0, -worldPos.angle, 0]}
    >
      {/* フレーム4辺（ExtrudeGeometry L字断面） */}
      {framePieces.map((piece) => (
        <mesh
          key={piece.key}
          geometry={piece.geometry}
          position={piece.position}
          rotation={piece.rotation}
          castShadow
          receiveShadow
        >
          <meshPhysicalMaterial
            color={frameColor}
            roughness={roughness}
            metalness={metalness}
            clearcoat={clearcoat}
            clearcoatRoughness={wood ? 0.4 : 0.1}
          />
        </mesh>
      ))}

      {/* 窓台（窓のみ） */}
      {isWindow && (
        <mesh
          geometry={sillGeo}
          position={sillPosition}
          castShadow
          receiveShadow
        >
          <meshPhysicalMaterial
            color={frameColor}
            roughness={roughness}
            metalness={metalness}
            clearcoat={clearcoat}
            clearcoatRoughness={wood ? 0.4 : 0.1}
          />
        </mesh>
      )}

      {/* ガラスペイン（窓のみ） */}
      {isWindow && (
        <mesh geometry={glassGeo} position={glassPosition}>
          <meshPhysicalMaterial
            color="#E8F4FD"
            transparent
            transmission={0.85}
            ior={1.52}
            roughness={0.0}
            thickness={GLASS_THICKNESS}
            metalness={0.0}
            envMapIntensity={2.0}
            clearcoat={1.0}
            clearcoatRoughness={0.0}
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* ドアの場合はパネル不要（既存DoorWindowMeshが担当）
          このコンポーネントはフレーム形状の高品質化のみ */}
      {isDoor && null}
    </group>
  );
});

WindowDoorFrame3D.displayName = 'WindowDoorFrame3D';
