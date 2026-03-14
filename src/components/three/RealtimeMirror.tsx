'use client';

// ---------------------------------------------------------------------------
// リアルタイムミラー反射コンポーネント
// CubeCameraで周囲のシーンをキャプチャし、meshPhysicalMaterialのenvMapに適用
// qualityLevelに応じてレンダリング頻度とテクスチャ解像度を動的に制御
// フレームカウンターでN フレームごとにのみCubeCamera更新（GPU負荷低減）
// 木製/金属製の額縁をBoxGeometryで構築
// ---------------------------------------------------------------------------

import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface RealtimeMirrorProps {
  /** ミラーのワールド座標 */
  position: [number, number, number];
  /** ミラー面のサイズ [幅, 高さ] */
  size: [number, number];
  /** Y軸回転（ラジアン） */
  rotation: number;
  /** 品質レベル: 'high' | 'medium' | 'low' */
  qualityLevel: string;
  /** 額縁スタイル: 'wood' | 'metal' */
  frameStyle?: 'wood' | 'metal';
}

// ---------------------------------------------------------------------------
// 定数（コンポーネント外で定義して再生成防止）
// ---------------------------------------------------------------------------

/** 品質別のCubeRenderTarget解像度 */
const RESOLUTION_MAP: Record<string, number> = {
  high: 256,
  medium: 128,
};

/** 品質別の更新フレーム間隔 */
const UPDATE_INTERVAL_MAP: Record<string, number> = {
  high: 2,
  medium: 5,
};

/** 額縁の太さ */
const FRAME_THICKNESS = 0.04;
/** 額縁の奥行き */
const FRAME_DEPTH = 0.03;

/** 額縁色マップ */
const FRAME_COLORS: Record<string, string> = {
  wood: '#5C3A1E',
  metal: '#8A8A8A',
};

/** 額縁メタルネス */
const FRAME_METALNESS: Record<string, number> = {
  wood: 0.1,
  metal: 0.9,
};

/** 額縁粗さ */
const FRAME_ROUGHNESS: Record<string, number> = {
  wood: 0.7,
  metal: 0.3,
};

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export const RealtimeMirror = React.memo(function RealtimeMirror({
  position,
  size,
  rotation,
  qualityLevel,
  frameStyle = 'wood',
}: RealtimeMirrorProps) {
  const { gl, scene } = useThree();

  // ミラー面のref
  const mirrorMeshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  // フレームカウンター（useFrame内でsetState禁止のためrefで管理）
  const frameCountRef = useRef(0);

  // lowの場合はCubeCamera不要
  const isActive = qualityLevel !== 'low';

  // CubeRenderTargetとCubeCameraを品質レベルに応じて生成
  const { cubeRenderTarget, cubeCamera } = useMemo(() => {
    if (!isActive) return { cubeRenderTarget: null, cubeCamera: null };

    const resolution = RESOLUTION_MAP[qualityLevel] ?? 128;
    const rt = new THREE.WebGLCubeRenderTarget(resolution, {
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const cam = new THREE.CubeCamera(0.1, 100, rt);
    return { cubeRenderTarget: rt, cubeCamera: cam };
  }, [qualityLevel, isActive]);

  // クリーンアップ: RenderTarget のdispose
  useEffect(() => {
    return () => {
      if (cubeRenderTarget) {
        cubeRenderTarget.dispose();
      }
    };
  }, [cubeRenderTarget]);

  // 更新間隔
  const updateInterval = UPDATE_INTERVAL_MAP[qualityLevel] ?? 5;

  // 毎フレーム: CubeCameraの更新（N フレームに一度）
  useFrame(() => {
    if (!isActive || !cubeCamera || !cubeRenderTarget || !mirrorMeshRef.current || !materialRef.current) return;

    frameCountRef.current += 1;
    if (frameCountRef.current % updateInterval !== 0) return;

    // ミラーメッシュを一時非表示にしてキャプチャ（自身の映り込みを防止）
    mirrorMeshRef.current.visible = false;
    cubeCamera.position.copy(mirrorMeshRef.current.getWorldPosition(new THREE.Vector3()));
    cubeCamera.update(gl, scene);
    mirrorMeshRef.current.visible = true;

    // envMapを更新
    materialRef.current.envMap = cubeRenderTarget.texture;
    materialRef.current.needsUpdate = true;
  });

  // ミラー面ジオメトリ
  const mirrorGeometry = useMemo(() => new THREE.PlaneGeometry(size[0], size[1]), [size]);

  // 額縁パーツのジオメトリ（上下左右4辺）
  const frameGeometries = useMemo(() => {
    const [w, h] = size;
    const t = FRAME_THICKNESS;
    const d = FRAME_DEPTH;
    // 上辺
    const top = new THREE.BoxGeometry(w + t * 2, t, d);
    // 下辺
    const bottom = new THREE.BoxGeometry(w + t * 2, t, d);
    // 左辺
    const left = new THREE.BoxGeometry(t, h, d);
    // 右辺
    const right = new THREE.BoxGeometry(t, h, d);
    return { top, bottom, left, right };
  }, [size]);

  // 額縁の位置オフセット
  const framePositions = useMemo(() => {
    const [w, h] = size;
    const t = FRAME_THICKNESS;
    return {
      top: [0, h / 2 + t / 2, 0] as [number, number, number],
      bottom: [0, -(h / 2 + t / 2), 0] as [number, number, number],
      left: [-(w / 2 + t / 2), 0, 0] as [number, number, number],
      right: [w / 2 + t / 2, 0, 0] as [number, number, number],
    };
  }, [size]);

  // 額縁の色・質感
  const frameColor = FRAME_COLORS[frameStyle] ?? FRAME_COLORS.wood;
  const frameMetalness = FRAME_METALNESS[frameStyle] ?? 0.1;
  const frameRoughness = FRAME_ROUGHNESS[frameStyle] ?? 0.7;

  // low品質の場合は単純な灰色の平面を表示（反射なし）
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* ミラー面 */}
      <mesh ref={mirrorMeshRef} geometry={mirrorGeometry}>
        <meshPhysicalMaterial
          ref={materialRef}
          metalness={1.0}
          roughness={isActive ? 0.02 : 0.5}
          envMapIntensity={1.0}
          color={isActive ? '#ffffff' : '#cccccc'}
        />
      </mesh>

      {/* 額縁: 上 */}
      <mesh geometry={frameGeometries.top} position={framePositions.top}>
        <meshPhysicalMaterial
          color={frameColor}
          metalness={frameMetalness}
          roughness={frameRoughness}
        />
      </mesh>

      {/* 額縁: 下 */}
      <mesh geometry={frameGeometries.bottom} position={framePositions.bottom}>
        <meshPhysicalMaterial
          color={frameColor}
          metalness={frameMetalness}
          roughness={frameRoughness}
        />
      </mesh>

      {/* 額縁: 左 */}
      <mesh geometry={frameGeometries.left} position={framePositions.left}>
        <meshPhysicalMaterial
          color={frameColor}
          metalness={frameMetalness}
          roughness={frameRoughness}
        />
      </mesh>

      {/* 額縁: 右 */}
      <mesh geometry={frameGeometries.right} position={framePositions.right}>
        <meshPhysicalMaterial
          color={frameColor}
          metalness={frameMetalness}
          roughness={frameRoughness}
        />
      </mesh>
    </group>
  );
});

RealtimeMirror.displayName = 'RealtimeMirror';
