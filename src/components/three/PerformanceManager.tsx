'use client';

/**
 * PerformanceManager — レンダーループ最適化の一括管理
 *
 * - LOD距離チェック (low/medium品質のみ)
 * - useFrame呼び出しのスロットリング
 * - FPS計測用フラグ管理
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useEditorStore } from '@/stores/useEditorStore';
import { updateLODs } from './InstancedFurniture';

/** LOD更新を間引きするためのフレームカウンター */
const LOD_UPDATE_INTERVAL = 6; // 6フレームに1回LOD判定（10fps相当）

export function PerformanceManager() {
  const qualityLevel = useEditorStore((s) => s.qualityLevel);
  const frameCounter = useRef(0);

  useFrame(({ camera }) => {
    // LOD更新: low/mediumのみ、かつ間引き
    if (qualityLevel !== 'high') {
      frameCounter.current++;
      if (frameCounter.current >= LOD_UPDATE_INTERVAL) {
        frameCounter.current = 0;
        updateLODs(camera, 8);
      }
    }
  });

  return null;
}
