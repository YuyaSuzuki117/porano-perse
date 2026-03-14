'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';

/**
 * リファレンス画像オーバーレイ（3Dシーン内）。
 * 実店舗の写真などを半透明のプレーンとして3D空間に配置し、
 * レイアウトの参考として利用する。
 */

interface ReferenceImageOverlayProps {
  /** 画像URL（dataURL or blob URL） */
  imageUrl: string;
  /** 不透明度 (0-1) */
  opacity: number;
  /** 3D空間での位置 [x, y, z] */
  position: [number, number, number];
  /** スケール（プレーンの拡大率） */
  scale: number;
  /** 表示/非表示 */
  visible: boolean;
}

/** テクスチャをロードする内部コンポーネント */
function ReferenceImageMesh({
  imageUrl,
  opacity,
  position,
  scale,
}: Omit<ReferenceImageOverlayProps, 'visible'>) {
  const texture = useLoader(THREE.TextureLoader, imageUrl);

  // テクスチャのアスペクト比を保持してプレーンサイズを計算
  const planeArgs = useMemo((): [number, number] => {
    const image = texture.image as HTMLImageElement | undefined;
    if (!image || !image.width || !image.height) {
      return [2 * scale, 2 * scale];
    }
    const aspect = image.width / image.height;
    if (aspect >= 1) {
      return [2 * scale, (2 * scale) / aspect];
    }
    return [2 * scale * aspect, 2 * scale];
  }, [texture, scale]);

  return (
    <mesh position={position}>
      <planeGeometry args={planeArgs} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export const ReferenceImageOverlay = React.memo(function ReferenceImageOverlay({
  imageUrl,
  opacity,
  position,
  scale,
  visible,
}: ReferenceImageOverlayProps) {
  if (!visible || !imageUrl) return null;

  return (
    <React.Suspense fallback={null}>
      <ReferenceImageMesh
        imageUrl={imageUrl}
        opacity={opacity}
        position={position}
        scale={scale}
      />
    </React.Suspense>
  );
});

ReferenceImageOverlay.displayName = 'ReferenceImageOverlay';
