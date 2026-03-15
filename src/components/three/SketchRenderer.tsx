'use client';

/**
 * SketchRenderer — 線画/鉛筆画スタイル ポストプロセッシングエフェクト
 *
 * - エッジ検出（法線差+深度差ベースのSobel）でアウトライン描画
 * - 明暗に応じたハッチング（斜線パターン）でシェーディング
 * - 紙テクスチャ（クリーム背景+ノイズ）
 * - セピアトーンのモノクロ出力
 * - watercolorモード: 淡い水彩風の色付け
 */

import { forwardRef, useMemo } from 'react';
import { Effect, EffectAttribute, BlendFunction } from 'postprocessing';
import * as THREE from 'three';

// ── GLSL フラグメントシェーダー ──
const sketchFragmentShader = /* glsl */ `
uniform float edgeThreshold;
uniform float hatchDensity;
uniform float hatchRandomness;
uniform float paperNoiseIntensity;
uniform vec3 paperColor;
uniform vec3 inkColor;
uniform float sepiaAmount;
uniform int mode; // 0 = sketch, 1 = watercolor

// ノイズ関数（手描き感のランダムさ用）
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 深度サンプリング
float getDepth(vec2 uv) {
  return texture2D(depthBuffer, uv).r;
}

// Sobel エッジ検出（深度ベース）
float sobelEdge(vec2 uv, vec2 texelSize) {
  float tl = getDepth(uv + texelSize * vec2(-1.0, -1.0));
  float t  = getDepth(uv + texelSize * vec2( 0.0, -1.0));
  float tr = getDepth(uv + texelSize * vec2( 1.0, -1.0));
  float l  = getDepth(uv + texelSize * vec2(-1.0,  0.0));
  float r  = getDepth(uv + texelSize * vec2( 1.0,  0.0));
  float bl = getDepth(uv + texelSize * vec2(-1.0,  1.0));
  float b  = getDepth(uv + texelSize * vec2( 0.0,  1.0));
  float br = getDepth(uv + texelSize * vec2( 1.0,  1.0));

  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;

  return sqrt(gx*gx + gy*gy);
}

// ハッチングパターン
float hatchPattern(vec2 uv, float darkness, float density, float randomness) {
  if (darkness < 0.15) return 0.0; // 明るい部分は線なし

  float result = 0.0;

  // ランダムオフセット（手描き感）
  float wobble = noise2d(uv * 3.0) * randomness;

  // 第1ハッチング（斜め45度）
  float line1 = abs(fract((uv.x + uv.y + wobble) * density) - 0.5) * 2.0;
  if (darkness > 0.15) {
    result = max(result, smoothstep(0.65, 0.55, line1) * min(darkness * 1.5, 1.0));
  }

  // 第2ハッチング（クロスハッチ、暗い部分のみ）
  if (darkness > 0.45) {
    float wobble2 = noise2d(uv * 5.0 + 10.0) * randomness;
    float line2 = abs(fract((uv.x - uv.y + wobble2) * density) - 0.5) * 2.0;
    result = max(result, smoothstep(0.65, 0.55, line2) * (darkness - 0.3));
  }

  // 第3ハッチング（水平線、非常に暗い部分）
  if (darkness > 0.7) {
    float wobble3 = noise2d(uv * 7.0 + 20.0) * randomness * 0.5;
    float line3 = abs(fract((uv.y + wobble3) * density * 1.3) - 0.5) * 2.0;
    result = max(result, smoothstep(0.7, 0.6, line3) * (darkness - 0.5) * 0.6);
  }

  return clamp(result, 0.0, 1.0);
}

// セピアトーン変換
vec3 toSepia(vec3 color, float amount) {
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 sepia = vec3(
    gray * 1.0,
    gray * 0.85,
    gray * 0.65
  );
  return mix(color, sepia, amount);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 texelSize = 1.0 / resolution;

  // ── エッジ検出 ──
  float edge = sobelEdge(uv, texelSize);
  // エッジ強度の正規化とシャープ化
  float edgeIntensity = smoothstep(edgeThreshold * 0.5, edgeThreshold * 2.0, edge);

  // ── 元画像の明度取得 ──
  vec3 originalColor = inputColor.rgb;
  float luminance = dot(originalColor, vec3(0.299, 0.587, 0.114));
  float darkness = 1.0 - luminance;

  // ── ハッチング ──
  vec2 screenUV = uv * resolution / 4.0; // スクリーンスペースUV
  float hatch = hatchPattern(screenUV, darkness, hatchDensity, hatchRandomness);

  // ── 紙テクスチャ ──
  float paperNoise = noise2d(uv * resolution * 0.15) * paperNoiseIntensity;
  vec3 paper = paperColor + vec3(paperNoise);

  // ── 合成 ──
  vec3 result;

  if (mode == 1) {
    // watercolor モード: 淡い水彩風の色付け
    vec3 watercolor = mix(paper, originalColor, 0.25 + luminance * 0.25);
    // 水彩にじみ効果（周辺ピクセルとのブレンド）
    vec3 blurred = vec3(0.0);
    float blurRadius = 2.0;
    for (float dx = -blurRadius; dx <= blurRadius; dx += 1.0) {
      for (float dy = -blurRadius; dy <= blurRadius; dy += 1.0) {
        blurred += texture2D(inputBuffer, uv + vec2(dx, dy) * texelSize * 1.5).rgb;
      }
    }
    blurred /= (blurRadius * 2.0 + 1.0) * (blurRadius * 2.0 + 1.0);
    watercolor = mix(watercolor, blurred * 0.7 + paper * 0.3, 0.3);

    // エッジを薄い線で追加
    watercolor = mix(watercolor, inkColor * 0.6, edgeIntensity * 0.5);
    // ハッチングは非常に薄く
    watercolor = mix(watercolor, inkColor * 0.5, hatch * 0.15);

    result = watercolor;
    // 軽いセピア
    result = toSepia(result, sepiaAmount * 0.3);
  } else {
    // sketch モード: モノクロ鉛筆画
    // ベースは紙色
    result = paper;
    // ハッチングで陰影
    result = mix(result, inkColor, hatch * 0.7);
    // エッジ（輪郭線）
    result = mix(result, inkColor, edgeIntensity * 0.85);
    // セピアトーン
    result = toSepia(result, sepiaAmount);
  }

  // 紙端のビネット（わずか）
  vec2 vignetteUV = uv * 2.0 - 1.0;
  float vignette = 1.0 - dot(vignetteUV, vignetteUV) * 0.15;
  result *= vignette;

  outputColor = vec4(result, inputColor.a);
}
`;

// ── カスタムEffect クラス ──
class SketchEffectImpl extends Effect {
  constructor({
    edgeThreshold = 0.02,
    hatchDensity = 8.0,
    hatchRandomness = 0.3,
    paperNoiseIntensity = 0.03,
    paperColor = new THREE.Color('#faf8f0'),
    inkColor = new THREE.Color('#333333'),
    sepiaAmount = 0.4,
    mode = 0,
  }: {
    edgeThreshold?: number;
    hatchDensity?: number;
    hatchRandomness?: number;
    paperNoiseIntensity?: number;
    paperColor?: THREE.Color;
    inkColor?: THREE.Color;
    sepiaAmount?: number;
    mode?: number;
  } = {}) {
    super('SketchEffect', sketchFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['edgeThreshold', new THREE.Uniform(edgeThreshold)],
        ['hatchDensity', new THREE.Uniform(hatchDensity)],
        ['hatchRandomness', new THREE.Uniform(hatchRandomness)],
        ['paperNoiseIntensity', new THREE.Uniform(paperNoiseIntensity)],
        ['paperColor', new THREE.Uniform(paperColor)],
        ['inkColor', new THREE.Uniform(inkColor)],
        ['sepiaAmount', new THREE.Uniform(sepiaAmount)],
        ['mode', new THREE.Uniform(mode)],
      ]),
      // 深度バッファが必要
      attributes: EffectAttribute.DEPTH
    });
  }
}

// ── React コンポーネント ──

interface SketchEffectProps {
  mode?: 'sketch' | 'watercolor';
  edgeThreshold?: number;
  hatchDensity?: number;
  hatchRandomness?: number;
  paperNoiseIntensity?: number;
  paperColor?: string;
  inkColor?: string;
  sepiaAmount?: number;
}

export const SketchEffect = forwardRef<SketchEffectImpl, SketchEffectProps>(
  function SketchEffect(
    {
      mode = 'sketch',
      edgeThreshold = 0.02,
      hatchDensity = 8.0,
      hatchRandomness = 0.3,
      paperNoiseIntensity = 0.03,
      paperColor = '#faf8f0',
      inkColor = '#333333',
      sepiaAmount = 0.4,
    },
    ref,
  ) {
    const effect = useMemo(() => {
      return new SketchEffectImpl({
        edgeThreshold,
        hatchDensity,
        hatchRandomness,
        paperNoiseIntensity,
        paperColor: new THREE.Color(paperColor),
        inkColor: new THREE.Color(inkColor),
        sepiaAmount,
        mode: mode === 'watercolor' ? 1 : 0,
      });
    }, [mode, edgeThreshold, hatchDensity, hatchRandomness, paperNoiseIntensity, paperColor, inkColor, sepiaAmount]);

    return <primitive ref={ref} object={effect} dispose={null} />;
  },
);
