'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { computeFloorPolygon } from '@/lib/geometry';

interface CeilingMeshProps {
  walls: WallSegment[];
  roomHeight: number;
  style: StyleConfig;
}

export function CeilingMesh({ walls, roomHeight, style }: CeilingMeshProps) {
  const ceilingGeometry = useMemo(() => {
    const polygon = computeFloorPolygon(walls);
    if (polygon.length < 3) return null;

    // 天井は床と同じ形状だが、法線を下向きにするため頂点順序を反転
    const shape = new THREE.Shape();
    const reversed = [...polygon].reverse();
    shape.moveTo(reversed[0].x, reversed[0].y);
    for (let i = 1; i < reversed.length; i++) {
      shape.lineTo(reversed[i].x, reversed[i].y);
    }
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }, [walls]);

  if (!ceilingGeometry) return null;

  // ShapeGeometry は XY 平面 → XZ 平面へ回転、roomHeight の高さに配置
  return (
    <mesh
      geometry={ceilingGeometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, roomHeight, 0]}
    >
      <meshStandardMaterial
        color={style.ceilingColor}
        roughness={0.9}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}
