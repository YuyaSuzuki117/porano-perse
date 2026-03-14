'use client';

// ---------------------------------------------------------------------------
// 布シミュレーションコンポーネント（カーテン・ファブリック用）
// 細分割されたPlaneGeometryの頂点を正弦波ベースで変位させて布の揺れを表現
// 上端の頂点は固定（カーテンレール吊り下げ）、下端ほど振幅大（重力ドレープ）
// 風の強さに応じてX方向バイアスを加算し、自然な風なびきを演出
// meshPhysicalMaterialのsheen/transmissionで薄い布の質感を再現
// ---------------------------------------------------------------------------

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ClothSimulationProps {
  /** 布の上端中心のワールド座標 */
  position: [number, number, number];
  /** 布の幅 */
  width: number;
  /** 布の高さ（垂れ下がり長さ） */
  height: number;
  /** 布の色 */
  color: string;
  /** 風の強さ（0.0 = 無風、1.0 = 強風） */
  windStrength: number;
  /** アニメーション有効フラグ */
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// 定数（コンポーネント外で定義）
// ---------------------------------------------------------------------------

/** 水平セグメント数 */
const SEGMENTS_X = 20;
/** 垂直セグメント数 */
const SEGMENTS_Y = 30;

/** 水平揺れの基本周波数 */
const SWAY_FREQUENCY = 1.5;
/** 水平揺れの基本速度 */
const SWAY_SPEED = 1.8;
/** 水平揺れの基本振幅 */
const SWAY_AMPLITUDE = 0.03;

/** 垂直さざ波の周波数 */
const RIPPLE_FREQUENCY = 2.0;
/** 垂直さざ波の速度 */
const RIPPLE_SPEED = 0.5;
/** 垂直さざ波の振幅 */
const RIPPLE_AMPLITUDE = 0.008;

/** sheen色（光沢反射） */
const SHEEN_COLOR = new THREE.Color('#FFFFFF');

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export const ClothSimulation = React.memo(function ClothSimulation({
  position,
  width,
  height,
  color,
  windStrength,
  enabled,
}: ClothSimulationProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // 布ジオメトリ（細分割平面）
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(width, height, SEGMENTS_X, SEGMENTS_Y);
  }, [width, height]);

  // 初期頂点位置の保存（変位基準点）
  const basePositions = useMemo(() => {
    const posAttr = geometry.getAttribute('position');
    return new Float32Array(posAttr.array);
  }, [geometry]);

  // 頂点ごとの正規化Y座標を事前計算（0=上端、1=下端）
  // PlaneGeometryは中心原点なので、Y座標を[0,1]に変換
  const normalizedY = useMemo(() => {
    const posAttr = geometry.getAttribute('position');
    const result = new Float32Array(posAttr.count);
    const halfH = height / 2;

    for (let i = 0; i < posAttr.count; i++) {
      const y = basePositions[i * 3 + 1]; // 原点中心: +halfH（上端）〜-halfH（下端）
      // 0（上端）から1（下端）に正規化
      result[i] = Math.max(0, Math.min(1, (halfH - y) / height));
    }
    return result;
  }, [geometry, basePositions, height]);

  // 毎フレーム: 頂点変位アニメーション
  useFrame(() => {
    if (!enabled || !meshRef.current) return;

    const geo = meshRef.current.geometry;
    const posAttr = geo.getAttribute('position');
    const time = performance.now() * 0.001;

    for (let i = 0; i < posAttr.count; i++) {
      const baseX = basePositions[i * 3];
      const baseY = basePositions[i * 3 + 1];
      const nY = normalizedY[i]; // 0（上端）〜1（下端）

      // 上端は固定（ピン留め）: nY === 0 のとき変位ゼロ
      if (nY < 0.01) {
        posAttr.setXYZ(i, baseX, baseY, 0);
        continue;
      }

      // 重力ドレープ係数: 下端ほど大きく変位
      const drapeFactor = nY * nY; // 二次曲線で自然な垂れ下がり

      // 水平揺れ（X方向のうねり）
      const swayX =
        Math.sin(time * SWAY_SPEED + baseX * SWAY_FREQUENCY + nY * 3.0) *
        SWAY_AMPLITUDE *
        drapeFactor;

      // 垂直さざ波（Y方向の微細な波打ち）
      const rippleY =
        Math.sin(time * RIPPLE_SPEED + baseY * RIPPLE_FREQUENCY) *
        RIPPLE_AMPLITUDE *
        drapeFactor;

      // 風によるX方向バイアス（一様な押し出し）
      const windBias = windStrength * 0.05 * drapeFactor;

      // 奥行き方向（Z軸）の波打ち（布の立体感）
      const depthWave =
        Math.sin(time * 1.2 + baseX * 2.5 + nY * 4.0) *
        0.01 *
        drapeFactor;

      posAttr.setXYZ(
        i,
        baseX + swayX + windBias,
        baseY + rippleY,
        depthWave
      );
    }

    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} position={position} geometry={geometry}>
      <meshPhysicalMaterial
        color={color}
        side={THREE.DoubleSide}
        metalness={0.0}
        roughness={0.6}
        sheen={0.8}
        sheenRoughness={0.3}
        sheenColor={SHEEN_COLOR}
        transmission={0.15}
        thickness={0.02}
        transparent
        opacity={0.95}
      />
    </mesh>
  );
});

ClothSimulation.displayName = 'ClothSimulation';
