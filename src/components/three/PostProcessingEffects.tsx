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
 *
 * ■ スケッチ/水彩レンダリング (2026-03-15)
 * - renderStyle='sketch' | 'watercolor' 時は全リアリスティックエフェクトを無効化
 * - カスタムSketchEffectのみ適用（軽量・高パフォーマンス）
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
import { SketchEffect } from './SketchRenderer';

interface PostProcessingEffectsProps {
  qualityLevel: 'high' | 'medium' | 'low';
  ssaoRadius: number;
  ssaoIntensity: number;
  bloomLuminanceThreshold: number;
  bloomIntensity: number;
  vignetteIntensity: number;
  photoMode?: boolean;
  renderStyle?: 'realistic' | 'sketch' | 'colored-pencil' | 'watercolor';
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
  renderStyle = 'realistic',
}: PostProcessingEffectsProps) {

  // ── sketch / watercolor モード: 軽量シェーダーのみ ──
  if (renderStyle === 'sketch' || renderStyle === 'watercolor' || renderStyle === 'colored-pencil') {
    return (
      <EffectComposer enableNormalPass={false}>
        <SketchEffect mode={renderStyle} />
        <SMAA />
      </EffectComposer>
    );
  }

  // ── high + photoMode: DOF含む全エフェクト + シネマティック強化 ──
  if (qualityLevel === 'high' && photoMode) {
    return (
      <EffectComposer enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={192}
          radius={ssaoRadius * 0.7}
          intensity={ssaoIntensity * 1.15}
          luminanceInfluence={0.65}
          bias={0.0002}
          worldDistanceThreshold={1.2}
          worldProximityThreshold={0.5}
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
          radius={ssaoRadius * 0.7}
          intensity={ssaoIntensity * 1.15}
          luminanceInfluence={0.65}
          bias={0.0002}
          worldDistanceThreshold={1.2}
          worldProximityThreshold={0.5}
        />
        <Bloom
          luminanceThreshold={bloomLuminanceThreshold}
          luminanceSmoothing={0.15}
          intensity={bloomIntensity * 1.3}
          mipmapBlur
        />
        <BrightnessContrast brightness={0.04} contrast={0.15} />
        <HueSaturation hue={0.02} saturation={0.1} />
        <ChromaticAberration offset={chromaticOffsetHigh} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.025} />
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
        radius={ssaoRadius * 0.75}
        intensity={ssaoIntensity * 1.0}
        luminanceInfluence={0.6}
        bias={0.0005}
      />
      <Bloom
        luminanceThreshold={bloomLuminanceThreshold}
        luminanceSmoothing={0.3}
        intensity={bloomIntensity * 0.85}
        mipmapBlur
      />
      <BrightnessContrast brightness={0.025} contrast={0.1} />
      <HueSaturation hue={0.01} saturation={0.07} />
      <ChromaticAberration offset={chromaticOffsetMedium} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.03} />
      <Vignette eskil={false} offset={0.12} darkness={vignetteIntensity * 0.7} blendFunction={BlendFunction.NORMAL} />
      <SMAA />
    </EffectComposer>
  );
}

export default PostProcessingEffects;
