'use client';

/**
 * PerformanceManager — レンダーループ最適化の一括管理
 *
 * - LOD距離チェック (low/medium品質のみ)
 * - useFrame呼び出しのスロットリング
 * - FPS計測用フラグ管理
 * - 適応型LOD更新間隔（FPSベース）
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useCameraStore } from '@/stores/useCameraStore';
import { updateLODs } from './InstancedFurniture';

/** FPS移動平均のサンプル数 */
const FPS_SAMPLE_COUNT = 30;

export function PerformanceManager() {
  const qualityLevel = useCameraStore((s) => s.qualityLevel);
  const frameCounter = useRef(0);

  // FPS移動平均トラッカー（ref管理、setState不使用）
  const fpsSamplesRef = useRef<number[]>([]);
  const avgFpsRef = useRef(60);
  // 適応型LOD更新間隔（FPSに基づいて動的調整）
  const lodIntervalRef = useRef(6);

  useFrame(({ camera }, delta) => {
    // FPS計測: 移動平均で安定した値を算出
    if (delta > 0) {
      const instantFps = 1 / delta;
      const samples = fpsSamplesRef.current;
      samples.push(instantFps);
      if (samples.length > FPS_SAMPLE_COUNT) {
        samples.shift();
      }
      // 移動平均FPS
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i];
      }
      avgFpsRef.current = sum / samples.length;

      // FPSに基づくLOD更新間隔の適応調整
      const fps = avgFpsRef.current;
      if (fps > 50) {
        lodIntervalRef.current = 3;   // 高FPS: 3フレームに1回
      } else if (fps >= 30) {
        lodIntervalRef.current = 6;   // 中FPS: 6フレームに1回
      } else {
        lodIntervalRef.current = 12;  // 低FPS: 12フレームに1回
      }
    }

    // LOD更新: low/mediumのみ、かつ適応型間引き
    if (qualityLevel !== 'high') {
      frameCounter.current++;
      if (frameCounter.current >= lodIntervalRef.current) {
        frameCounter.current = 0;
        updateLODs(camera, 8);
      }
    }
  });

  return null;
}
