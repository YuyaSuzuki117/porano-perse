'use client';

/**
 * ToneMappingController — renderStyle/品質に応じてGL設定を動的に管理
 *
 * - blueprintモード: NoToneMapping（暗紺の正確な表示）
 * - リアルモード: ACESFilmic + 適切な露出 + シャドウマップ有効化
 * - NPRモード: ACESFilmic + シャドウマップ無効（軽量化）
 *
 * onCreatedは1回しか実行されないため、renderStyle切替時の
 * シャドウマップ・ピクセルレシオ・トーンマッピング露出を
 * このコンポーネントで動的に制御する。
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface ToneMappingControllerProps {
  renderStyle: 'realistic' | 'sketch' | 'colored-pencil' | 'watercolor' | 'blueprint';
  qualityLevel?: 'high' | 'medium' | 'low';
  brightness?: number;
  isNight?: boolean;
  isWarmStyle?: boolean;
}

export function ToneMappingController({
  renderStyle,
  qualityLevel = 'medium',
  brightness = 100,
  isNight = false,
  isWarmStyle = false,
}: ToneMappingControllerProps) {
  const gl = useThree((s) => s.gl);

  const isSketchStyle = renderStyle === 'sketch' || renderStyle === 'watercolor' || renderStyle === 'colored-pencil' || renderStyle === 'blueprint';

  useEffect(() => {
    // ── トーンマッピング ──
    if (renderStyle === 'blueprint') {
      gl.toneMapping = THREE.NoToneMapping;
      gl.toneMappingExposure = 1.0;
    } else {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      // 露出を動的に計算（onCreatedと同じロジック）
      const warmBoost = isWarmStyle ? 0.10 : 0.02;
      gl.toneMappingExposure = isNight
        ? 0.80 + brightness / 450
        : 1.25 + brightness / 250 + warmBoost;
    }
    gl.outputColorSpace = THREE.SRGBColorSpace;

    // ── シャドウマップ・ピクセルレシオの動的切替 ──
    if (isSketchStyle) {
      gl.shadowMap.enabled = false;
      gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    } else if (qualityLevel === 'low') {
      gl.shadowMap.enabled = false;
      gl.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    } else {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
      gl.setPixelRatio(Math.min(window.devicePixelRatio, qualityLevel === 'high' ? 2.5 : 1.5));
    }
    gl.shadowMap.needsUpdate = true;
  }, [gl, renderStyle, isSketchStyle, qualityLevel, brightness, isNight, isWarmStyle]);

  return null;
}
