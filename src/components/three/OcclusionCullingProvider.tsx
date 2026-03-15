'use client';

/**
 * OcclusionCullingProvider — 壁によるオクルージョンカリング
 *
 * Canvas内でuseFrameを使い、カメラ位置と壁の交差判定により
 * 壁の背後にある家具を非表示にし、ドローコールを削減する。
 *
 * useVisibleFurniture() フックで可視な家具IDセットを取得。
 */

import React, { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeVisibleFurniture } from '@/lib/occlusion-culling';
import { WallSegment } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';

/** 可視家具IDセットのContext */
const VisibleFurnitureContext = createContext<Set<string>>(new Set());

/** 可視な家具IDセットを取得するフック */
export function useVisibleFurniture(): Set<string> {
  return useContext(VisibleFurnitureContext);
}

interface OcclusionCullingProviderProps {
  walls: WallSegment[];
  furniture: FurnitureItem[];
  children: ReactNode;
  /** カリングを有効にするか（壁がない場合は無効） */
  enabled?: boolean;
}

// フレームスロットリング: 6フレームに1回のみ計算
let _occlusionFrame = 0;

/**
 * オクルージョンカリングのコンテキストプロバイダー。
 * useFrameで定期的に可視性を再計算し、子コンポーネントに提供する。
 */
export const OcclusionCullingProvider = React.memo(function OcclusionCullingProvider({
  walls,
  furniture,
  children,
  enabled = true,
}: OcclusionCullingProviderProps) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => {
    // 初期値: 全家具を可視
    return new Set(furniture.map((f) => f.id));
  });
  const prevVisibleRef = useRef<Set<string>>(visibleIds);

  const updateOcclusion = useCallback(
    (camera: THREE.Camera) => {
      if (!enabled || walls.length < 3 || furniture.length === 0) return;

      const newVisible = computeVisibleFurniture(
        camera.position,
        walls,
        furniture,
      );

      // 差分がある場合のみstate更新
      const prev = prevVisibleRef.current;
      if (newVisible.size !== prev.size || ![...newVisible].every((id) => prev.has(id))) {
        prevVisibleRef.current = newVisible;
        setVisibleIds(newVisible);
      }
    },
    [walls, furniture, enabled],
  );

  useFrame(({ camera }) => {
    _occlusionFrame++;
    if (_occlusionFrame % 6 !== 0) return;
    updateOcclusion(camera);
  });

  return (
    <VisibleFurnitureContext.Provider value={visibleIds}>
      {children}
    </VisibleFurnitureContext.Provider>
  );
});
