'use client';

import { useMemo } from 'react';
import { StyleConfig } from '@/types/scene';
import { WallSegment } from '@/types/floor-plan';

interface LightingRigProps {
  style: StyleConfig;
  walls: WallSegment[];
  roomHeight: number;
}

export function LightingRig({ style, walls, roomHeight }: LightingRigProps) {
  // 壁群から部屋の中心と大きさを推定
  const roomBounds = useMemo(() => {
    if (walls.length === 0) {
      return { cx: 0, cz: 0, w: 8, d: 6 };
    }
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      cx: (minX + maxX) / 2,
      cz: (minY + maxY) / 2,
      w: maxX - minX,
      d: maxY - minY,
    };
  }, [walls]);

  return (
    <>
      {/* 環境光 */}
      <ambientLight
        intensity={style.ambientIntensity}
        color="#FFFFFF"
      />

      {/* メインディレクショナルライト（太陽光的） */}
      <directionalLight
        position={[roomBounds.cx + roomBounds.w * 0.3, roomHeight + 1, roomBounds.cz + roomBounds.d * 0.3]}
        intensity={style.spotlightIntensity * 0.5}
        color={style.spotlightColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />

      {/* 天井中央ポイントライト */}
      <pointLight
        position={[roomBounds.cx, roomHeight - 0.3, roomBounds.cz]}
        intensity={style.spotlightIntensity * 0.3}
        color={style.spotlightColor}
        distance={Math.max(roomBounds.w, roomBounds.d) * 2}
      />

      {/* フィルライト（反対側からの補助光） */}
      <pointLight
        position={[roomBounds.cx - roomBounds.w * 0.4, roomHeight * 0.6, roomBounds.cz - roomBounds.d * 0.4]}
        intensity={style.spotlightIntensity * 0.15}
        color={style.spotlightColor}
        distance={Math.max(roomBounds.w, roomBounds.d) * 1.5}
      />
    </>
  );
}
