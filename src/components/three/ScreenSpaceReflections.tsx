'use client';

/**
 * FloorReflection — 床面のフォトリアリスティック反射エフェクト
 *
 * MeshReflectorMaterial（WebGLエラーの原因）を避け、
 * meshPhysicalMaterial + clearcoat で光沢のある床面反射を再現する。
 * modern, luxury, medical, industrial, minimal スタイルのハードフロアのみ対象。
 * high品質限定。
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';

/** ハードフロア対象スタイル */
const HARD_FLOOR_STYLES = new Set(['modern', 'luxury', 'medical', 'industrial', 'minimal']);

interface FloorReflectionProps {
  walls: WallSegment[];
  styleName: string;
  qualityLevel: string;
  enabled: boolean;
}

export const FloorReflection = React.memo(function FloorReflection({
  walls,
  styleName,
  qualityLevel,
  enabled,
}: FloorReflectionProps) {
  // 条件判定: high品質 + ハードフロア + 有効 + 壁あり
  if (!enabled || qualityLevel !== 'high' || !HARD_FLOOR_STYLES.has(styleName) || walls.length === 0) {
    return null;
  }

  // 壁座標から床ポリゴン範囲を計算
  const { center, size } = useMemo(() => {
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      center: [(minX + maxX) / 2, (minY + maxY) / 2] as [number, number],
      size: [maxX - minX + 0.02, maxY - minY + 0.02] as [number, number],
    };
  }, [walls]);

  // スタイル別の微調整
  const materialProps = useMemo(() => {
    switch (styleName) {
      case 'luxury':
        return { roughness: 0.1, opacity: 0.10, clearcoatRoughness: 0.03 };
      case 'medical':
        return { roughness: 0.12, opacity: 0.07, clearcoatRoughness: 0.04 };
      case 'industrial':
        return { roughness: 0.2, opacity: 0.06, clearcoatRoughness: 0.08 };
      case 'minimal':
        return { roughness: 0.13, opacity: 0.08, clearcoatRoughness: 0.04 };
      default: // modern
        return { roughness: 0.15, opacity: 0.08, clearcoatRoughness: 0.05 };
    }
  }, [styleName]);

  return (
    <mesh
      position={[center[0], 0.002, center[1]]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={1}
    >
      <planeGeometry args={[size[0], size[1]]} />
      <meshPhysicalMaterial
        metalness={0.0}
        roughness={materialProps.roughness}
        envMapIntensity={2.0}
        clearcoat={1.0}
        clearcoatRoughness={materialProps.clearcoatRoughness}
        transparent
        opacity={materialProps.opacity}
        depthWrite={false}
        side={THREE.FrontSide}
        color="#ffffff"
      />
    </mesh>
  );
});
