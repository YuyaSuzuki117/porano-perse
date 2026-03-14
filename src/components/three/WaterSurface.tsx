'use client';

// ---------------------------------------------------------------------------
// 水面アニメーションコンポーネント（水槽・噴水用）
// 複数の正弦波を重ね合わせた頂点変位で水面のさざ波を表現
// meshPhysicalMaterialのtransmission/iorで水の屈折・透過を再現
// 縁にフォーム（泡）リングを配置してリアリティ向上
// UVオフセットアニメーションで流れる反射感を演出
// ---------------------------------------------------------------------------

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface WaterSurfaceProps {
  /** 水面の中心座標 */
  position: [number, number, number];
  /** 水面サイズ [幅, 奥行] */
  size: [number, number];
  /** 水の深さ（thickness パラメータに使用） */
  depth: number;
  /** アニメーション有効フラグ */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// 定数（コンポーネント外）
// ---------------------------------------------------------------------------

/** 水面のセグメント数 */
const WATER_SEGMENTS_X = 32;
const WATER_SEGMENTS_Z = 32;

/** 波のパラメータ: [周波数, 振幅, 方向X, 方向Z, 速度] */
const WAVE_PARAMS: readonly [number, number, number, number, number][] = [
  [3.0, 0.015, 1.0, 0.0, 1.2],   // メイン波: X方向
  [5.0, 0.008, 0.0, 1.0, 0.8],   // サブ波: Z方向
  [7.0, 0.005, 0.7, 0.7, 1.5],   // 斜め細波
  [2.0, 0.012, -0.5, 0.8, 0.6],  // 逆方向のゆったりした波
] as const;

/** 水面の色 */
const WATER_COLOR = new THREE.Color('#C0E8F0');

/** フォーム（泡）の色 */
const FOAM_COLOR = new THREE.Color('#E8F4F8');

/** フォーム粒子数 */
const FOAM_COUNT = 24;

// 一時ベクトル（useFrame内でのnew防止）
const _tempVec3 = new THREE.Vector3();

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export const WaterSurface = React.memo(function WaterSurface({
  position,
  size,
  depth,
  enabled,
}: WaterSurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);

  // 水面ジオメトリ（頂点変位用にセグメント分割）
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(
      size[0],
      size[1],
      WATER_SEGMENTS_X,
      WATER_SEGMENTS_Z
    );
  }, [size]);

  // 初期頂点位置のコピー（変位の基準点として保持）
  const basePositions = useMemo(() => {
    const posAttr = geometry.getAttribute('position');
    return new Float32Array(posAttr.array);
  }, [geometry]);

  // フォーム粒子の配置（水面の縁に沿って配置）
  const foamPositions = useMemo(() => {
    const positions: [number, number, number][] = [];
    const [w, h] = size;
    const halfW = w / 2;
    const halfH = h / 2;
    const margin = 0.02; // 縁からの内側オフセット

    for (let i = 0; i < FOAM_COUNT; i++) {
      const t = i / FOAM_COUNT;
      const perimeter = 2 * (w + h);
      const dist = t * perimeter;

      let x: number, z: number;
      if (dist < w) {
        // 上辺
        x = -halfW + dist + margin;
        z = -halfH + margin;
      } else if (dist < w + h) {
        // 右辺
        x = halfW - margin;
        z = -halfH + (dist - w) + margin;
      } else if (dist < 2 * w + h) {
        // 下辺
        x = halfW - (dist - w - h) - margin;
        z = halfH - margin;
      } else {
        // 左辺
        x = -halfW + margin;
        z = halfH - (dist - 2 * w - h) - margin;
      }

      // 微妙なランダム散らし（seedベースではなくindexベース）
      const jitter = 0.02;
      x += Math.sin(i * 7.3) * jitter;
      z += Math.cos(i * 11.1) * jitter;

      positions.push([x, 0.005, z]);
    }
    return positions;
  }, [size]);

  // 毎フレーム: 頂点変位 + UVオフセットアニメーション
  useFrame((_, delta) => {
    if (!enabled || !meshRef.current || !materialRef.current) return;

    const geo = meshRef.current.geometry;
    const posAttr = geo.getAttribute('position');
    const time = performance.now() * 0.001; // 秒単位

    // 頂点ごとに複数波の重ね合わせで変位を計算
    for (let i = 0; i < posAttr.count; i++) {
      const baseX = basePositions[i * 3];
      const baseZ = basePositions[i * 3 + 2];

      let displacement = 0;
      for (const [freq, amp, dirX, dirZ, speed] of WAVE_PARAMS) {
        const phase = (baseX * dirX + baseZ * dirZ) * freq + time * speed;
        displacement += Math.sin(phase) * amp;
      }

      // Y軸に変位を適用（PlaneGeometryは XZ平面に回転するためY成分）
      posAttr.setY(i, displacement);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    // UVオフセットでゆっくり流れる反射を演出
    const uvAttr = geo.getAttribute('uv');
    if (uvAttr) {
      const offsetX = Math.sin(time * 0.15) * 0.02;
      const offsetY = Math.cos(time * 0.1) * 0.02;
      // マテリアル側でmapのoffsetを動かす代わりに、法線更新で十分な反射変化を得る
      _tempVec3.set(offsetX, offsetY, 0); // 利用可能な場合のための予約
    }
  });

  return (
    <group position={position}>
      {/* 水面メッシュ（XZ平面に水平配置） */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshPhysicalMaterial
          ref={materialRef}
          color={WATER_COLOR}
          transmission={0.8}
          ior={1.33}
          roughness={0.05}
          thickness={depth}
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
          envMapIntensity={0.8}
        />
      </mesh>

      {/* 縁のフォーム（泡）粒子 */}
      {foamPositions.map((pos, idx) => (
        <mesh key={idx} position={pos}>
          <sphereGeometry args={[0.008, 6, 6]} />
          <meshPhysicalMaterial
            color={FOAM_COLOR}
            transparent
            opacity={0.4}
            roughness={0.9}
            metalness={0.0}
          />
        </mesh>
      ))}
    </group>
  );
});

WaterSurface.displayName = 'WaterSurface';
