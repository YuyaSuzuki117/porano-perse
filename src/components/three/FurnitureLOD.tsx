'use client';

import React, { createContext, useContext, useRef, useState, ReactNode, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** LODの詳細レベル */
type DetailLevel = 'high' | 'medium' | 'low' | 'bbox';

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
  /** バウンディングボックスサイズ（bbox LOD用） */
  bboxSize?: [number, number, number];
}

/** 距離閾値: カメラからの距離に応じてLODレベルを決定 */
const LOD_THRESHOLD_HIGH = 3.0;    // 3m以内: 高詳細
const LOD_THRESHOLD_MEDIUM = 8.0;  // 3-8m: 中詳細
const LOD_THRESHOLD_LOW = 15.0;    // 8-15m: 低詳細
// 15m超: バウンディングボックスのみ

/** カメラ位置計算用の再利用ベクトル（GC回避） */
const _cameraPos = new THREE.Vector3();
const _objectPos = new THREE.Vector3();

// フレームカウンタ: LOD更新頻度を制限 (3フレームに1回)
let _lodFrameCounter = 0;

/** bbox用マテリアル（共有インスタンス） */
const _bboxMaterial = new THREE.MeshBasicMaterial({
  color: 0xaaaaaa,
  transparent: true,
  opacity: 0.15,
  wireframe: true,
  depthWrite: false,
});

/**
 * 家具のLOD（Level of Detail）ラッパー
 * カメラとの距離を毎フレーム計算し、
 * LODContextを通じて子コンポーネントに詳細レベルを提供する。
 * 超遠距離ではBoundingBoxのみ表示でドローコールを大幅削減。
 */
export const FurnitureLOD = React.memo(function FurnitureLOD({
  children,
  position,
  boundingRadius,
  bboxSize,
}: FurnitureLODProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('high');
  // 前回のレベルを保持してsetStateの呼び出しを最小化
  const prevLevelRef = useRef<DetailLevel>('high');

  // bbox用ジオメトリ (キャッシュ)
  const bboxGeometry = useMemo(() => {
    const s = bboxSize ?? [boundingRadius * 2, boundingRadius * 2, boundingRadius * 2];
    return new THREE.BoxGeometry(s[0], s[1], s[2]);
  }, [bboxSize, boundingRadius]);

  // 距離判定コールバック（useFrame内でスロットリング実行）
  const updateLOD = useCallback((camera: THREE.Camera) => {
    _cameraPos.copy(camera.position);
    _objectPos.set(position[0], position[1], position[2]);

    const dist = _cameraPos.distanceTo(_objectPos) - boundingRadius;

    let newLevel: DetailLevel;
    if (dist < LOD_THRESHOLD_HIGH) {
      newLevel = 'high';
    } else if (dist < LOD_THRESHOLD_MEDIUM) {
      newLevel = 'medium';
    } else if (dist < LOD_THRESHOLD_LOW) {
      newLevel = 'low';
    } else {
      newLevel = 'bbox';
    }

    // レベルが変わった場合のみstate更新（不要な再レンダリング防止）
    if (newLevel !== prevLevelRef.current) {
      prevLevelRef.current = newLevel;
      setDetailLevel(newLevel);
    }
  }, [position, boundingRadius]);

  useFrame(({ camera }) => {
    // 3フレームに1回のみLOD更新（パフォーマンス最適化）
    _lodFrameCounter++;
    if (_lodFrameCounter % 3 !== 0) return;
    updateLOD(camera);
  });

  return (
    <group ref={groupRef} position={position}>
      {detailLevel === 'bbox' ? (
        /* 超遠距離: バウンディングボックスのみ表示 */
        <mesh
          geometry={bboxGeometry}
          material={_bboxMaterial}
          position={[0, (bboxSize?.[1] ?? boundingRadius) / 2, 0]}
        />
      ) : (
        <LODContext.Provider value={detailLevel}>
          {children}
        </LODContext.Provider>
      )}
    </group>
  );
});
