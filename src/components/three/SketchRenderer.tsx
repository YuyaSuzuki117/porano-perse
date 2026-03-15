'use client';

/**
 * SketchRenderer — 線画/鉛筆画スタイル ポストプロセッシングエフェクト
 *
 * - 3種エッジ検出（深度Sobel + 法線推定 + 色差）で多段アウトライン
 * - 鉛筆筆圧シミュレーション（濃淡・ギザギザ・フェード）
 * - 5段階ハッチング（線なし/極細/通常/クロス/密クロス+点描）
 * - 紙テクスチャ（繊維パターン・粒状感・凹凸ムラ・経年変化）
 * - 距離ベースのディテール制御
 * - 水彩モード: にじみ・色ムラ・白抜き・重ね塗り透明感
 * - セピアトーンのモノクロ出力
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
uniform float time;

// ─── ノイズ関数群 ───

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
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

// Perlin風 fBm（繊維パターン用）
float fbm(vec2 p, int octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    val += amp * noise2d(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

// ─── 深度サンプリング ───

float getDepth(vec2 uv) {
  return texture2D(depthBuffer, uv).r;
}

// 深度からリニア距離(0~1正規化)を推定
float linearizeDepth(float d) {
  // 非線形深度を簡易的にリニア化（near=0.1, far=100想定）
  float near = 0.1;
  float far = 100.0;
  return (2.0 * near) / (far + near - d * (far - near));
}

// ─── 色サンプリング ───

vec3 getColor(vec2 uv) {
  return texture2D(inputBuffer, uv).rgb;
}

// ─── エッジ検出: 3種合成 ───

// 1. 深度ベースSobel（シルエットエッジ）
float sobelEdgeDepth(vec2 uv, vec2 ts) {
  float tl = getDepth(uv + ts * vec2(-1.0, -1.0));
  float t  = getDepth(uv + ts * vec2( 0.0, -1.0));
  float tr = getDepth(uv + ts * vec2( 1.0, -1.0));
  float l  = getDepth(uv + ts * vec2(-1.0,  0.0));
  float r  = getDepth(uv + ts * vec2( 1.0,  0.0));
  float bl = getDepth(uv + ts * vec2(-1.0,  1.0));
  float b  = getDepth(uv + ts * vec2( 0.0,  1.0));
  float br = getDepth(uv + ts * vec2( 1.0,  1.0));
  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  return sqrt(gx*gx + gy*gy);
}

// 2. 法線推定エッジ（深度からscreen-space法線を再構築）
float normalEdge(vec2 uv, vec2 ts) {
  float dc = getDepth(uv);
  float dl = getDepth(uv - vec2(ts.x, 0.0));
  float dr = getDepth(uv + vec2(ts.x, 0.0));
  float dt = getDepth(uv - vec2(0.0, ts.y));
  float db = getDepth(uv + vec2(0.0, ts.y));
  // screen-space法線近似
  vec3 normalC = normalize(vec3(dl - dr, dt - db, 2.0 * ts.x));
  // 隣接ピクセルの法線との差分
  float dl2 = getDepth(uv - vec2(ts.x * 2.0, 0.0));
  float dr2 = getDepth(uv + vec2(ts.x * 2.0, 0.0));
  float dt2 = getDepth(uv - vec2(0.0, ts.y * 2.0));
  float db2 = getDepth(uv + vec2(0.0, ts.y * 2.0));
  vec3 normalR = normalize(vec3(dc - dr2, dt - db, 2.0 * ts.x));
  vec3 normalB = normalize(vec3(dl - dr, dc - db2, 2.0 * ts.x));
  float dotR = 1.0 - abs(dot(normalC, normalR));
  float dotB = 1.0 - abs(dot(normalC, normalB));
  return max(dotR, dotB);
}

// 3. 色差エッジ（マテリアル境界）
float colorEdge(vec2 uv, vec2 ts) {
  vec3 cc = getColor(uv);
  vec3 cl = getColor(uv - vec2(ts.x, 0.0));
  vec3 cr = getColor(uv + vec2(ts.x, 0.0));
  vec3 ct = getColor(uv - vec2(0.0, ts.y));
  vec3 cb = getColor(uv + vec2(0.0, ts.y));
  float diffH = length(cr - cl);
  float diffV = length(cb - ct);
  return sqrt(diffH * diffH + diffV * diffV);
}

// ─── 鉛筆筆圧シミュレーション ───

float pencilPressure(vec2 uv, float edgeStr) {
  // ノイズによる濃淡変化
  float pressureNoise = noise2d(uv * 23.0 + time * 0.01) * 0.4 + 0.6;
  // hand tremor（ギザギザ）
  float tremor = noise2d(uv * 80.0) * 0.15;
  return clamp(pressureNoise + tremor, 0.3, 1.0);
}

// エッジ方向のストローク感（始端・終端フェード）
float strokeFade(vec2 uv, float edgeStr) {
  float strokePos = fract(noise2d(uv * 15.0) * 5.0);
  // 始端・終端のフェード
  float fade = smoothstep(0.0, 0.08, strokePos) * smoothstep(1.0, 0.92, strokePos);
  return mix(0.5, 1.0, fade);
}

// ─── 5段階ハッチングパターン ───

float hatchPattern5(vec2 uv, float darkness, float density, float randomness, float distFactor) {
  // 距離によるハッチング密度調整
  float adjDensity = density * mix(1.0, 0.5, distFactor);

  // 非常に明るい: 線なし
  if (darkness < 0.10) return 0.0;

  float result = 0.0;
  float wobble = noise2d(uv * 3.0) * randomness;

  // 段階1: 明るい → 極細の軽いストローク（0.10~0.25）
  if (darkness >= 0.10) {
    float line0 = abs(fract((uv.x + uv.y * 0.8 + wobble) * adjDensity * 0.7) - 0.5) * 2.0;
    float str0 = smoothstep(0.75, 0.65, line0) * smoothstep(0.10, 0.20, darkness) * 0.35;
    // 筆圧による線の太さ変化
    float pressVar = noise2d(uv * 40.0 + 5.0) * 0.3 + 0.7;
    result = max(result, str0 * pressVar);
  }

  // 段階2: 中間 → 通常ハッチング（0.25~）
  if (darkness > 0.25) {
    float wobble1 = noise2d(uv * 4.0 + 3.0) * randomness;
    float line1 = abs(fract((uv.x + uv.y + wobble1) * adjDensity) - 0.5) * 2.0;
    float str1 = smoothstep(0.65, 0.50, line1) * min((darkness - 0.15) * 1.5, 1.0);
    float pressVar1 = noise2d(uv * 35.0 + 8.0) * 0.25 + 0.75;
    result = max(result, str1 * pressVar1);
  }

  // 段階3: やや暗い → クロスハッチ（0.45~）
  if (darkness > 0.45) {
    float wobble2 = noise2d(uv * 5.0 + 10.0) * randomness;
    float line2 = abs(fract((uv.x - uv.y + wobble2) * adjDensity) - 0.5) * 2.0;
    float str2 = smoothstep(0.65, 0.50, line2) * (darkness - 0.30);
    float pressVar2 = noise2d(uv * 30.0 + 12.0) * 0.2 + 0.8;
    result = max(result, str2 * pressVar2);
  }

  // 段階4: 暗い → 密クロスハッチ（水平）（0.65~）
  if (darkness > 0.65) {
    float wobble3 = noise2d(uv * 7.0 + 20.0) * randomness * 0.5;
    float line3 = abs(fract((uv.y + wobble3) * adjDensity * 1.3) - 0.5) * 2.0;
    result = max(result, smoothstep(0.7, 0.55, line3) * (darkness - 0.45) * 0.7);
  }

  // 段階5: 非常に暗い → 追加密クロスハッチ + スティップリング（点描）（0.80~）
  if (darkness > 0.80) {
    // 追加の斜め線
    float wobble4 = noise2d(uv * 9.0 + 30.0) * randomness * 0.3;
    float line4 = abs(fract((uv.x * 0.7 + uv.y * 1.2 + wobble4) * adjDensity * 1.5) - 0.5) * 2.0;
    result = max(result, smoothstep(0.65, 0.50, line4) * (darkness - 0.65) * 0.6);

    // スティップリング（点描）
    float stipple = hash(floor(uv * adjDensity * 8.0));
    float stippleThreshold = mix(0.7, 0.3, (darkness - 0.80) * 5.0);
    if (stipple > stippleThreshold) {
      result = max(result, (darkness - 0.70) * 0.5);
    }
  }

  return clamp(result, 0.0, 1.0);
}

// ─── 紙テクスチャ ───

vec3 paperTexture(vec2 uv, vec2 res) {
  vec2 paperUV = uv * res;

  // 繊維パターン: 方向性のあるfBmノイズ
  vec2 fiberUV = paperUV * 0.02;
  fiberUV.x *= 1.5; // 横方向に引き伸ばし（繊維の方向性）
  float fiber = fbm(fiberUV, 3) * 0.03;

  // 粒状感: 高周波ノイズ
  float grain = (hash(floor(paperUV * 0.8)) - 0.5) * 0.025;

  // 紙の凹凸: 中周波ノイズ
  float bump = noise2d(paperUV * 0.05) * 0.02;

  // 紙色のバリエーション: 中央と端で微妙に色が異なる（経年変化感）
  vec2 centeredUV = uv * 2.0 - 1.0;
  float edgeDist = length(centeredUV);
  float aging = smoothstep(0.3, 1.2, edgeDist) * 0.04; // 端は少し暗く/黄色く
  vec3 agingTint = vec3(-0.01, -0.02, -0.04) * aging;

  vec3 paper = paperColor + vec3(fiber + grain + bump) * paperNoiseIntensity / 0.03 + agingTint;
  return paper;
}

// 紙の凹凸による鉛筆のムラ係数
float paperBumpInfluence(vec2 uv, vec2 res) {
  float bumpVal = noise2d(uv * res * 0.05);
  return 0.7 + bumpVal * 0.3; // 0.7~1.0の範囲でムラ
}

// ─── セピアトーン変換 ───

vec3 toSepia(vec3 color, float amount) {
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 sepia = vec3(
    gray * 1.0,
    gray * 0.85,
    gray * 0.65
  );
  return mix(color, sepia, amount);
}

// ─── メインシェーダー ───

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 texelSize = 1.0 / resolution;

  // ── 深度の線形化と距離ファクター ──
  float linDepth = linearizeDepth(depth);
  float distFactor = clamp(linDepth * 5.0, 0.0, 1.0); // 0=近い, 1=遠い

  // ── 3種エッジ検出 ──

  // 距離で線の太さを変化（近い→太い、遠い→細い）
  float lineScale = mix(1.5, 0.6, distFactor);
  vec2 edgeTS = texelSize * lineScale;

  // 1. シルエットエッジ（深度差大）→太い線
  float silhouetteEdge = sobelEdgeDepth(uv, edgeTS * 1.5);
  float silhouetteIntensity = smoothstep(edgeThreshold * 0.3, edgeThreshold * 1.5, silhouetteEdge);

  // 2. クリースエッジ（法線差）→中程度の線
  float creaseEdge = normalEdge(uv, edgeTS);
  float creaseIntensity = smoothstep(0.1, 0.5, creaseEdge) * 0.7;

  // 3. マテリアルエッジ（色差）→細い線
  float matEdge = colorEdge(uv, edgeTS * 0.8);
  float matIntensity = smoothstep(0.15, 0.6, matEdge) * 0.5;

  // エッジ合成（最大値ベース、距離で減衰）
  float edgeFade = mix(1.0, 0.3, distFactor);
  float edgeIntensity = clamp(
    max(max(silhouetteIntensity, creaseIntensity), matIntensity) * edgeFade,
    0.0, 1.0
  );

  // ── 鉛筆筆圧 ──
  vec2 pressUV = uv * resolution / 8.0;
  float pressure = pencilPressure(pressUV, edgeIntensity);
  float sFade = strokeFade(pressUV, edgeIntensity);
  float pencilMod = pressure * sFade;

  // エッジに筆圧を適用
  edgeIntensity *= pencilMod;

  // ── 元画像の明度取得 ──
  vec3 originalColor = inputColor.rgb;
  float luminance = dot(originalColor, vec3(0.299, 0.587, 0.114));
  float darkness = 1.0 - luminance;

  // 背景（空/遠景）検出：ほぼ紙色のみ
  float bgMask = smoothstep(0.95, 1.0, linDepth);

  // ── 5段階ハッチング ──
  vec2 screenUV = uv * resolution / 4.0;
  float hatch = hatchPattern5(screenUV, darkness, hatchDensity, hatchRandomness, distFactor);
  // 紙の凹凸ムラをハッチングに適用
  hatch *= paperBumpInfluence(uv, resolution);
  // 筆圧をハッチングにも適用
  hatch *= mix(0.8, 1.0, pencilMod);
  // 背景ではハッチングを消す
  hatch *= (1.0 - bgMask);

  // ── 紙テクスチャ ──
  vec3 paper = paperTexture(uv, resolution);

  // ── 合成 ──
  vec3 result;

  if (mode == 1) {
    // ════════════════════════════════════════
    // watercolor モード: 淡い水彩風の色付け
    // ════════════════════════════════════════

    // 色のムラ: 場所によって濃淡が変わる
    float colorVariation = fbm(uv * 8.0 + 1.5, 3) * 0.3;

    // 白い余白: 明るい部分は完全に紙色（白抜き効果）
    float whiteout = smoothstep(0.2, 0.6, luminance);

    // ベース水彩色（透明感のある重ね塗り）
    float colorMix = 0.2 + luminance * 0.2 + colorVariation * 0.15;
    colorMix *= (1.0 - whiteout * 0.7); // 明るい部分は紙色が見える
    vec3 watercolor = mix(paper, originalColor * 0.85 + paper * 0.15, colorMix);

    // エッジへのにじみ: 輪郭に沿って色がにじむ
    vec3 blurred = vec3(0.0);
    float totalWeight = 0.0;
    for (float dx = -2.0; dx <= 2.0; dx += 1.0) {
      for (float dy = -2.0; dy <= 2.0; dy += 1.0) {
        float w = 1.0 / (1.0 + abs(dx) + abs(dy));
        vec2 sampleUV = uv + vec2(dx, dy) * texelSize * 2.0;
        // にじみにノイズを加える
        sampleUV += (noise2d(sampleUV * 50.0) - 0.5) * texelSize * 1.5;
        blurred += texture2D(inputBuffer, sampleUV).rgb * w;
        totalWeight += w;
      }
    }
    blurred /= totalWeight;

    // エッジ付近でにじみを強くする
    float bleedAmount = edgeIntensity * 0.4 + 0.1;
    // テクスチャの透明感: 下の色が透ける重ね塗り効果
    vec3 bleedColor = mix(blurred, paper, 0.3);
    watercolor = mix(watercolor, bleedColor, bleedAmount);

    // 色ムラの追加レイヤー
    float muddiness = noise2d(uv * 12.0 + 3.0) * 0.08;
    watercolor += vec3(muddiness * 0.5, muddiness * 0.3, -muddiness * 0.2);

    // エッジを薄い鉛筆線で追加
    watercolor = mix(watercolor, inkColor * 0.5, edgeIntensity * 0.35);

    // ハッチングは非常に薄く
    watercolor = mix(watercolor, inkColor * 0.4, hatch * 0.1);

    result = watercolor;
    result = toSepia(result, sepiaAmount * 0.3);
  } else {
    // ════════════════════════════════════════
    // sketch モード: モノクロ鉛筆画
    // ════════════════════════════════════════

    // ベースは紙色
    result = paper;

    // ハッチングで陰影（紙ムラ込み）
    result = mix(result, inkColor, hatch * 0.7);

    // エッジ（輪郭線）— 種類別の太さ・濃さ
    // シルエット: 最も濃い太い線
    float silEdge = silhouetteIntensity * edgeFade * pencilMod;
    result = mix(result, inkColor, silEdge * 0.90);
    // クリース: 中程度
    float crEdge = creaseIntensity * edgeFade * pencilMod * 0.65;
    result = mix(result, inkColor * 1.1, crEdge * 0.55);
    // マテリアル: 細く薄い
    float mtEdge = matIntensity * edgeFade * pencilMod * 0.5;
    result = mix(result, inkColor * 1.2, mtEdge * 0.35);

    // 背景はほぼ紙色
    result = mix(result, paper, bgMask * 0.85);

    // セピアトーン
    result = toSepia(result, sepiaAmount);
  }

  // 紙端のビネット（わずかな経年変化感）
  vec2 vignetteUV = uv * 2.0 - 1.0;
  float vignette = 1.0 - dot(vignetteUV, vignetteUV) * 0.18;
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
    time = 0,
  }: {
    edgeThreshold?: number;
    hatchDensity?: number;
    hatchRandomness?: number;
    paperNoiseIntensity?: number;
    paperColor?: THREE.Color;
    inkColor?: THREE.Color;
    sepiaAmount?: number;
    mode?: number;
    time?: number;
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
        ['time', new THREE.Uniform(time)],
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
        time: performance.now() * 0.001,
      });
    }, [mode, edgeThreshold, hatchDensity, hatchRandomness, paperNoiseIntensity, paperColor, inkColor, sepiaAmount]);

    return <primitive ref={ref} object={effect} dispose={null} />;
  },
);
