'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { FurnitureType } from '@/types/scene';
import { FURNITURE_CATALOG } from '@/data/furniture';

interface PlacementPreviewProps {
  furnitureType: FurnitureType;
  position: [number, number, number];
  rotation: [number, number, number];
  isValid: boolean;
  visible: boolean;
  gridSnap?: boolean;
  gridSize?: number;
}

/** 家具タイプに対応するジオメトリを返す */
function usePreviewGeometry(furnitureType: FurnitureType): THREE.BufferGeometry {
  return useMemo(() => {
    const catalog = FURNITURE_CATALOG.find((f) => f.type === furnitureType);
    const scale = catalog?.defaultScale ?? [1, 1, 1];

    // 基本的なボックスジオメトリ（各家具タイプの既定スケールに準拠）
    switch (furnitureType) {
      case 'table_round':
        return new THREE.CylinderGeometry(scale[0] / 2, scale[0] / 2, scale[1], 24);
      case 'stool':
        return new THREE.CylinderGeometry(scale[0] / 2, scale[0] / 2.5, scale[1], 16);
      case 'plant':
      case 'flower_pot':
        return new THREE.CylinderGeometry(scale[0] / 3, scale[0] / 2, scale[1], 12);
      case 'pendant_light':
      case 'ceiling_fan':
        return new THREE.SphereGeometry(scale[0] / 2, 16, 12);
      case 'clock':
        return new THREE.CylinderGeometry(scale[0] / 2, scale[0] / 2, 0.05, 24);
      default:
        return new THREE.BoxGeometry(scale[0], scale[1], scale[2]);
    }
  }, [furnitureType]);
}

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

const PlacementPreview = React.memo(function PlacementPreview({
  furnitureType,
  position,
  rotation,
  isValid,
  visible,
  gridSnap = false,
  gridSize = 0.25,
}: PlacementPreviewProps) {
  const geometry = usePreviewGeometry(furnitureType);

  const snappedPosition = useMemo<[number, number, number]>(() => {
    if (!gridSnap) return position;
    return [
      snapToGrid(position[0], gridSize),
      position[1],
      snapToGrid(position[2], gridSize),
    ];
  }, [position, gridSnap, gridSize]);

  const ghostMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isValid ? 0x22c55e : 0xef4444,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, [isValid]);

  const wireframeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: isValid ? 0x4ade80 : 0xf87171,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
  }, [isValid]);

  if (!visible) return null;

  return (
    <group position={snappedPosition} rotation={rotation}>
      {/* ソリッドゴースト */}
      <mesh geometry={geometry} material={ghostMaterial} />
      {/* ワイヤフレームオーバーレイ */}
      <mesh geometry={geometry} material={wireframeMaterial} />
    </group>
  );
});

PlacementPreview.displayName = 'PlacementPreview';

export default PlacementPreview;
