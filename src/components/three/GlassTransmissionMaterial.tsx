'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

// --- 日本語コメント ---
// ガラス素材コンポーネント（meshPhysicalMaterial ベース）
// 透明ガラス・色付きガラス・すりガラスの3バリアント対応
// transmission / ior / roughness でリアルなガラス表現を実現

/** ガラスバリアント名 */
type GlassVariant = 'clear' | 'tinted' | 'frosted';

interface GlassTransmissionMaterialProps {
  /** ガラスの色 */
  color?: string;
  /** 不透明度 (0=完全透明, 1=不透明) */
  opacity?: number;
  /** 表面の粗さ (0=鏡面, 1=完全拡散) */
  roughness?: number;
  /** ガラスの厚み（屈折計算用） */
  thickness?: number;
  /** 屈折率 (1.0=空気, 1.5=一般ガラス, 2.42=ダイヤモンド) */
  ior?: number;
  /** 透過率 (0=不透過, 1=完全透過) */
  transmission?: number;
  /** 環境マップ反映強度 */
  envMapIntensity?: number;
  /** レンダリング面 */
  side?: THREE.Side;
}

/** バリアント別のデフォルトプロパティ */
const VARIANT_DEFAULTS: Record<GlassVariant, {
  color: string;
  transmission: number;
  roughness: number;
  ior: number;
  thickness: number;
  opacity: number;
  envMapIntensity: number;
}> = {
  // 透明ガラス: 高い透過率、低い粗さ
  clear: {
    color: '#ffffff',
    transmission: 0.9,
    roughness: 0.05,
    ior: 1.5,
    thickness: 0.1,
    opacity: 1.0,
    envMapIntensity: 1.0,
  },
  // 色付きガラス: やや低い透過率、青みがかった色
  tinted: {
    color: '#88ccff',
    transmission: 0.7,
    roughness: 0.05,
    ior: 1.5,
    thickness: 0.15,
    opacity: 1.0,
    envMapIntensity: 0.8,
  },
  // すりガラス: 高い粗さで拡散透過
  frosted: {
    color: '#f0f0f0',
    transmission: 0.6,
    roughness: 0.4,
    ior: 1.5,
    thickness: 0.2,
    opacity: 1.0,
    envMapIntensity: 0.6,
  },
};

/**
 * ガラスバリアントに対応するマテリアルプロパティを返すヘルパー関数
 * meshPhysicalMaterial に spread して使用可能
 */
export function getGlassMaterialProps(variant: GlassVariant): {
  color: string;
  transmission: number;
  roughness: number;
  ior: number;
  thickness: number;
  opacity: number;
  transparent: boolean;
  envMapIntensity: number;
  depthWrite: boolean;
  side: THREE.Side;
} {
  const defaults = VARIANT_DEFAULTS[variant];
  return {
    color: defaults.color,
    transmission: defaults.transmission,
    roughness: defaults.roughness,
    ior: defaults.ior,
    thickness: defaults.thickness,
    opacity: defaults.opacity,
    transparent: true,
    envMapIntensity: defaults.envMapIntensity,
    depthWrite: false,
    side: THREE.DoubleSide,
  };
}

/**
 * ガラス透過マテリアルコンポーネント
 * meshPhysicalMaterial を使用したリアルなガラス表現
 *
 * 使用例:
 * <mesh>
 *   <boxGeometry />
 *   <GlassTransmissionMaterial roughness={0.1} ior={1.52} />
 * </mesh>
 */
export const GlassTransmissionMaterial = React.memo(function GlassTransmissionMaterial({
  color = '#ffffff',
  opacity = 1.0,
  roughness = 0.05,
  thickness = 0.1,
  ior = 1.5,
  transmission = 0.9,
  envMapIntensity = 1.0,
  side = THREE.DoubleSide,
}: GlassTransmissionMaterialProps) {
  // マテリアルプロパティをメモ化
  const materialProps = useMemo(
    () => ({
      color,
      transmission,
      roughness,
      ior,
      thickness,
      opacity,
      transparent: true as const,
      envMapIntensity,
      depthWrite: false as const,
      side,
      // ガラスの反射をリアルにするためメタルネス0
      metalness: 0,
    }),
    [color, transmission, roughness, ior, thickness, opacity, envMapIntensity, side]
  );

  return <meshPhysicalMaterial {...materialProps} />;
});

GlassTransmissionMaterial.displayName = 'GlassTransmissionMaterial';
