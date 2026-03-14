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

/** 色収差オフセット — high用 (シネマティック強め・GC防止のためコンポーネント外定義) */
const chromaticOffsetHigh = new THREE.Vector2(0.001, 0.0008);
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
  // ── high + photoMode: DOF含む全エフェクト ──
  if (qualityLevel === 'high' && photoMode) {
    return (
      <EffectComposer enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={128}
          radius={ssaoRadius}
          intensity={ssaoIntensity}
          luminanceInfluence={0.7}
          bias={0.0005}
          worldDistanceThreshold={1.2}
          worldProximityThreshold={0.5}
        />
        <Bloom
          luminanceThreshold={bloomLuminanceThreshold}
          luminanceSmoothing={0.4}
          intensity={bloomIntensity}
          mipmapBlur
        />
        <BrightnessContrast brightness={0.03} contrast={0.12} />
        <HueSaturation saturation={0.08} />
        <ChromaticAberration offset={chromaticOffsetHigh} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.06} />
        <DepthOfField
          focusDistance={0}
          focalLength={0.04}
          bokehScale={5.0}
        />
        <Vignette eskil={false} offset={0.15} darkness={vignetteIntensity} blendFunction={BlendFunction.NORMAL} />
        <SMAA />
      </EffectComposer>
    );
  }

  // ── high (非photoMode): DOF以外の全エフェクト ──
  if (qualityLevel === 'high') {
    return (
      <EffectComposer enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={128}
          radius={ssaoRadius}
          intensity={ssaoIntensity}
          luminanceInfluence={0.7}
          bias={0.0005}
          worldDistanceThreshold={1.2}
          worldProximityThreshold={0.5}
        />
        <Bloom
          luminanceThreshold={bloomLuminanceThreshold}
          luminanceSmoothing={0.4}
          intensity={bloomIntensity}
          mipmapBlur
        />
        <BrightnessContrast brightness={0.03} contrast={0.12} />
        <HueSaturation saturation={0.08} />
        <ChromaticAberration offset={chromaticOffsetHigh} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.06} />
        <Vignette eskil={false} offset={0.15} darkness={vignetteIntensity} blendFunction={BlendFunction.NORMAL} />
        <SMAA />
      </EffectComposer>
    );
  }

  // ── medium — BrightnessContrast + HueSaturation 追加、SSAOサンプル16に強化 ──
  return (
    <EffectComposer enableNormalPass>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={48}
        radius={ssaoRadius}
        intensity={ssaoIntensity * 0.9}
        luminanceInfluence={0.6}
        bias={0.001}
      />
      <Bloom
        luminanceThreshold={bloomLuminanceThreshold + 0.08}
        luminanceSmoothing={0.4}
        intensity={bloomIntensity * 0.6}
      />
      <BrightnessContrast brightness={0.025} contrast={0.1} />
      <HueSaturation saturation={0.07} />
      <ChromaticAberration offset={chromaticOffsetMedium} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.035} />
      <SMAA />
    </EffectComposer>
  );
}

export default PostProcessingEffects;
