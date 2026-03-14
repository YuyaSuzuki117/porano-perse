'use client';

/**
 * PostProcessingEffects — 遅延ロード対象のポストプロセッシングエフェクト
 *
 * EffectComposer, SSAO, Bloom, Vignette, SMAA は重量級のため、
 * medium/high品質時のみ dynamic import で遅延ロードする。
 * low品質では一切ロードされず、初期表示が高速になる。
 *
 * ■ シネマティック強化 (2026-03-14)
 * - BrightnessContrast / HueSaturation: medium+high で色調補正
 * - ChromaticAberration: high のみ、微細なレンズ収差
 * - Noise (フィルムグレイン): high のみ、映画的テクスチャ
 * - DepthOfField: high + photoMode 時のみ被写界深度
 * - SSAO チューニング強化: サンプル数増・bias微細化
 */

import {
  EffectComposer,
  SSAO,
  Bloom,
  Vignette,
  SMAA,
  BrightnessContrast,
  HueSaturation,
  ChromaticAberration,
  Noise,
  DepthOfField,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';

interface PostProcessingEffectsProps {
  qualityLevel: 'high' | 'medium' | 'low';
  ssaoRadius: number;
  ssaoIntensity: number;
  bloomLuminanceThreshold: number;
  bloomIntensity: number;
  vignetteIntensity: number;
  photoMode?: boolean;
}

/** 色収差オフセット — high用 (ウルトラシネマティック・GC防止のためコンポーネント外定義) */
const chromaticOffsetHigh = new THREE.Vector2(0.0008, 0.0007);
/** 色収差オフセット — medium用 (控えめ) */
const chromaticOffsetMedium = new THREE.Vector2(0.0003, 0.0003);

function PostProcessingEffects({
  qualityLevel,
  ssaoRadius,
  ssaoIntensity,
  bloomLuminanceThreshold,
  bloomIntensity,
  vignetteIntensity,
  photoMode = false,
}: PostProcessingEffectsProps) {
  // ── high + photoMode: DOF含む全エフェクト + シネマティック強化 ──
  if (qualityLevel === 'high' && photoMode) {
    return (
      <EffectComposer enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={192}
          radius={ssaoRadius}
          intensity={ssaoIntensity}
          luminanceInfluence={0.7}
          bias={0.0003}
          worldDistanceThreshold={1.5}
          worldProximityThreshold={0.7}
        />
        <Bloom
          luminanceThreshold={bloomLuminanceThreshold}
          luminanceSmoothing={0.2}
          intensity={bloomIntensity * 1.4}
          mipmapBlur
        />
        <BrightnessContrast brightness={0.06} contrast={0.18} />
        <HueSaturation hue={0.03} saturation={0.12} />
        <ChromaticAberration offset={chromaticOffsetHigh} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.03} />
        <DepthOfField
          focusDistance={0.01}
          focalLength={0.035}
          bokehScale={6.0}
        />
        <Vignette eskil={false} offset={0.15} darkness={vignetteIntensity * 1.15 * 1.3 * 1.2} blendFunction={BlendFunction.NORMAL} />
        <SMAA />
      </EffectComposer>
    );
  }

  // ── high (非photoMode): DOF以外の全エフェクト + シネマティック強化 ──
  if (qualityLevel === 'high') {
    return (
      <EffectComposer enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={192}
          radius={ssaoRadius}
          intensity={ssaoIntensity}
          luminanceInfluence={0.7}
          bias={0.0003}
          worldDistanceThreshold={1.5}
          worldProximityThreshold={0.7}
        />
        <Bloom
          luminanceThreshold={bloomLuminanceThreshold}
          luminanceSmoothing={0.2}
          intensity={bloomIntensity * 1.2}
          mipmapBlur
        />
        <BrightnessContrast brightness={0.06} contrast={0.18} />
        <HueSaturation hue={0.03} saturation={0.12} />
        <ChromaticAberration offset={chromaticOffsetHigh} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.03} />
        <Vignette eskil={false} offset={0.15} darkness={vignetteIntensity * 1.15 * 1.2} blendFunction={BlendFunction.NORMAL} />
        <SMAA />
      </EffectComposer>
    );
  }

  // ── medium — SSAO64サンプル・Bloom強化・Vignette追加 ──
  return (
    <EffectComposer enableNormalPass>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={64}
        radius={ssaoRadius}
        intensity={ssaoIntensity * 0.9}
        luminanceInfluence={0.6}
        bias={0.0008}
      />
      <Bloom
        luminanceThreshold={bloomLuminanceThreshold + 0.08}
        luminanceSmoothing={0.4}
        intensity={bloomIntensity * 0.7}
      />
      <BrightnessContrast brightness={0.025} contrast={0.1} />
      <HueSaturation saturation={0.07} />
      <ChromaticAberration offset={chromaticOffsetMedium} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.035} />
      <Vignette eskil={false} offset={0.12} darkness={vignetteIntensity * 0.7} blendFunction={BlendFunction.NORMAL} />
      <SMAA />
    </EffectComposer>
  );
}

export default PostProcessingEffects;
