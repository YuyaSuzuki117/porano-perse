'use client';

import React, { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** LODの詳細レベル */
type DetailLevel = 'high' | 'medium' | 'low';

/** LODコンテキスト: 子コンポーネントが現在の詳細レベルを取得するために使用 */
const LODContext = createContext<DetailLevel>('high');

/**
 * 現在のLODレベルを取得するフック
 * FurnitureLODの子コンポーネント内で使用し、
 * カメラ距離に応じてジオメトリ詳細度を切り替える
 */
export function useLODLevel(): DetailLevel {
  return useContext(LODContext);
}

interface FurnitureLODProps {
  /** 子コンポーネント（家具メッシュ） */
  children: ReactNode;
  /** ワールド座標上の配置位置 */
  position: [number, number, number];
  /** バウンディング半径（LOD判定の基準距離に加算） */
  boundingRadius: number;
}

/** 距離閾値: カメラからの距離に応じてLODレベルを決定 */
const LOD_THRESHOLD_HIGH = 3.0;   // 3m以内: 高詳細
const LOD_THRESHOLD_MEDIUM = 8.0; // 3-8m: 中詳細
// 8m超: 低詳細

/** カメラ位置計算用の再利用ベクトル（GC回避） */
const _cameraPos = new THREE.Vector3();
const _objectPos = new THREE.Vector3();

/**
 * 家具のLOD（Level of Detail）ラッパー
 * カメラとの距離を毎フレーム計算し、
 * LODContextを通じて子コンポーネントに詳細レベルを提供する
 */
export const FurnitureLOD = React.memo(function FurnitureLOD({
  children,
  position,
  boundingRadius,
}: FurnitureLODProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('high');
  // 前回のレベルを保持してsetStateの呼び出しを最小化
  const prevLevelRef = useRef<DetailLevel>('high');

  // 距離判定コールバック（useFrame内で毎フレーム実行）
  const updateLOD = useCallback((camera: THREE.Camera) => {
    _cameraPos.copy(camera.position);
    _objectPos.set(position[0], position[1], position[2]);

    const dist = _cameraPos.distanceTo(_objectPos) - boundingRadius;

    let newLevel: DetailLevel;
    if (dist < LOD_THRESHOLD_HIGH) {
      newLevel = 'high';
    } else if (dist < LOD_THRESHOLD_MEDIUM) {
      newLevel = 'medium';
    } else {
      newLevel = 'low';
    }

    // レベルが変わった場合のみstate更新（不要な再レンダリング防止）
    if (newLevel !== prevLevelRef.current) {
      prevLevelRef.current = newLevel;
      setDetailLevel(newLevel);
    }
  }, [position, boundingRadius]);

  useFrame(({ camera }) => {
    updateLOD(camera);
  });

  return (
    <group ref={groupRef} position={position}>
      <LODContext.Provider value={detailLevel}>
        {children}
      </LODContext.Provider>
    </group>
  );
});
