'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

/* ─── 型定義 ─── */

export type SSSPresetType = 'thin_curtain' | 'thick_curtain' | 'paper_screen';

export interface SSSPreset {
  transmission: number;
  thickness: number;
  attenuationColor: string;
  attenuationDistance: number;
  opacity: number;
  roughness: number;
}

export interface SSSMaterialProps {
  color?: string;
  thickness?: number;
  transmission?: number;
  attenuationColor?: string;
  opacity?: number;
  preset?: SSSPresetType;
  roughness?: number;
}

/* ─── プリセット定義 ─── */

const SSS_PRESETS: Record<SSSPresetType, SSSPreset> = {
  thin_curtain: {
    transmission: 0.55,
    thickness: 0.15,
    attenuationColor: '#ffeedd',  // 暖かみのあるオフホワイト
    attenuationDistance: 0.5,
    opacity: 0.85,
    roughness: 0.7,
  },
  thick_curtain: {
    transmission: 0.3,
    thickness: 0.4,
    attenuationColor: '#ffe8cc',  // 深い暖色
    attenuationDistance: 0.5,
    opacity: 0.95,
    roughness: 0.8,
  },
  paper_screen: {
    transmission: 0.5,
    thickness: 0.1,
    attenuationColor: '#fffff0',  // アイボリーホワイト
    attenuationDistance: 0.5,
    opacity: 0.9,
    roughness: 0.6,
  },
};

/**
 * プリセット設定を取得
 * @param type - プリセットタイプ
 * @returns SSSPreset 設定値
 */
export function getSSSPreset(type: SSSPresetType): SSSPreset {
  return { ...SSS_PRESETS[type] };
}

/* ─── コンポーネント ─── */

/**
 * 半透明素材（カーテン、パーティション、障子）用のサブサーフェススキャタリング近似マテリアル
 *
 * MeshPhysicalMaterial の transmission / thickness / attenuation を活用し、
 * 薄い布地を光が透過する効果を再現する。
 */
const SSSMaterial: React.FC<SSSMaterialProps> = ({
  color = '#ffffff',
  thickness: thicknessProp,
  transmission: transmissionProp,
  attenuationColor: attenuationColorProp,
  opacity: opacityProp,
  preset,
  roughness: roughnessProp,
}) => {
  const resolvedProps = useMemo(() => {
    const base = preset ? SSS_PRESETS[preset] : SSS_PRESETS.thin_curtain;

    return {
      transmission: transmissionProp ?? base.transmission,
      thickness: thicknessProp ?? base.thickness,
      attenuationColor: attenuationColorProp ?? base.attenuationColor,
      attenuationDistance: base.attenuationDistance,
      opacity: opacityProp ?? base.opacity,
      roughness: roughnessProp ?? base.roughness,
    };
  }, [preset, transmissionProp, thicknessProp, attenuationColorProp, opacityProp, roughnessProp]);

  const attenuationColorObj = useMemo(
    () => new THREE.Color(resolvedProps.attenuationColor),
    [resolvedProps.attenuationColor],
  );

  const colorObj = useMemo(() => new THREE.Color(color), [color]);

  return (
    <meshPhysicalMaterial
      attach="material"
      color={colorObj}
      transmission={resolvedProps.transmission}
      thickness={resolvedProps.thickness}
      attenuationColor={attenuationColorObj}
      attenuationDistance={resolvedProps.attenuationDistance}
      opacity={resolvedProps.opacity}
      transparent={resolvedProps.opacity < 1}
      roughness={resolvedProps.roughness}
      side={THREE.DoubleSide}
      // SSS近似のための追加パラメータ
      ior={1.3}                   // 布地の屈折率（ガラスより低い）
      specularIntensity={0.2}     // 布地は弱い鏡面反射
      sheen={0.3}                 // 布地のシーン効果
      sheenColor={colorObj}
    />
  );
};

export default React.memo(SSSMaterial);
