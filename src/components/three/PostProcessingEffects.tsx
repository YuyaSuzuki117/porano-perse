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
  renderStyle?: 'realistic' | 'sketch' | 'colored-pencil' | 'watercolor' | 'blueprint';
}

/** 色収差オフセット — high用 (自然なレンズ収差・GC防止のためコンポーネント外定義) */
const chromaticOffsetHigh = new THREE.Vector2(0.0006, 0.0005);
/** 色収差オフセット — medium用 (微細なヒント程度) */
const chromaticOffsetMedium = new THREE.Vector2(0.0002, 0.0002);

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
  if (renderStyle === 'sketch' || renderStyle === 'watercolor' || renderStyle === 'colored-pencil' || renderStyle === 'blueprint') {
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
          intensity={ssaoIntensity * 1.2}
          luminanceInfluence={0.65}
          bias={0.0002}
          worldDistanceThreshold={1.2}
          worldProximityThreshold={0.5}
        />
        <Bloom
          luminanceThreshold={bloomLuminanceThreshold}
          luminanceSmoothing={0.1}
          intensity={bloomIntensity * 1.2}
          mipmapBlur
        />
        <BrightnessContrast brightness={0.04} contrast={0.14} />
        <HueSaturation hue={0.015} saturation={0.08} />
        <ChromaticAberration offset={chromaticOffsetHigh} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.022} />
        <DepthOfField
          focusDistance={0.01}
          focalLength={0.045}
          bokehScale={4.5}
        />
        <Vignette eskil={false} offset={0.2} darkness={vignetteIntensity * 1.1} blendFunction={BlendFunction.NORMAL} />
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
          luminanceSmoothing={0.12}
          intensity={bloomIntensity * 1.2}
          mipmapBlur
        />
        <BrightnessContrast brightness={0.03} contrast={0.12} />
        <HueSaturation hue={0.015} saturation={0.08} />
        <ChromaticAberration offset={chromaticOffsetHigh} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.018} />
        <Vignette eskil={false} offset={0.15} darkness={vignetteIntensity * 1.0} blendFunction={BlendFunction.NORMAL} />
        <SMAA />
      </EffectComposer>
    );
  }

  // ── medium — SSAO64サンプル・Bloom強化・Vignette追加 ──
  return (
    <EffectComposer enableNormalPass>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={96}
        radius={ssaoRadius * 0.7}
        intensity={ssaoIntensity * 1.1}
        luminanceInfluence={0.6}
        bias={0.0005}
      />
      <Bloom
        luminanceThreshold={bloomLuminanceThreshold}
        luminanceSmoothing={0.2}
        intensity={bloomIntensity * 0.9}
        mipmapBlur
      />
      <BrightnessContrast brightness={0.02} contrast={0.08} />
      <HueSaturation hue={0.01} saturation={0.06} />
      <ChromaticAberration offset={chromaticOffsetMedium} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.03} />
      <Vignette eskil={false} offset={0.15} darkness={vignetteIntensity * 0.6} blendFunction={BlendFunction.NORMAL} />
      <SMAA />
    </EffectComposer>
  );
}

export default PostProcessingEffects;
