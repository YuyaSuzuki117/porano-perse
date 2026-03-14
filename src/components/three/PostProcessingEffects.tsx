'use client';

/**
 * PostProcessingEffects — 遅延ロード対象のポストプロセッシングエフェクト
 *
 * EffectComposer, SSAO, Bloom, Vignette, SMAA は重量級のため、
 * medium/high品質時のみ dynamic import で遅延ロードする。
 * low品質では一切ロードされず、初期表示が高速になる。
 */

import { EffectComposer, SSAO, Bloom, Vignette, SMAA } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

interface PostProcessingEffectsProps {
  qualityLevel: 'high' | 'medium' | 'low';
  ssaoRadius: number;
  ssaoIntensity: number;
  bloomLuminanceThreshold: number;
  bloomIntensity: number;
  vignetteIntensity: number;
}

function PostProcessingEffects({
  qualityLevel,
  ssaoRadius,
  ssaoIntensity,
  bloomLuminanceThreshold,
  bloomIntensity,
  vignetteIntensity,
}: PostProcessingEffectsProps) {
  if (qualityLevel === 'high') {
    return (
      <EffectComposer enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={32}
          radius={ssaoRadius}
          intensity={ssaoIntensity}
        />
        <Bloom
          luminanceThreshold={bloomLuminanceThreshold}
          luminanceSmoothing={0.4}
          intensity={bloomIntensity}
        />
        <Vignette eskil={false} offset={0.1} darkness={vignetteIntensity} />
        <SMAA />
      </EffectComposer>
    );
  }

  // medium — 軽量版: SSAO少サンプル + Bloom高閾値、Vignette無し
  return (
    <EffectComposer enableNormalPass>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={8}
        radius={ssaoRadius}
        intensity={ssaoIntensity * 0.7}
      />
      <Bloom
        luminanceThreshold={bloomLuminanceThreshold + 0.15}
        luminanceSmoothing={0.4}
        intensity={bloomIntensity * 0.4}
      />
    </EffectComposer>
  );
}

export default PostProcessingEffects;
