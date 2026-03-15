'use client';

/**
 * SketchRenderer — 線画/鉛筆画/色鉛筆スタイル ポストプロセッシングエフェクト
 *
 * - 3種エッジ検出（深度Sobel + 法線推定 + 色差）で多段アウトライン
 * - 内部エッジ強化（家具形状ディテール向上）
 * - 鉛筆筆圧シミュレーション（濃淡・ギザギザ・フェード）
 * - 5段階ハッチング（線なし/極細/通常/クロス/密クロス+点描）
 * - 紙テクスチャ（繊維パターン・粒状感・凹凸ムラ・経年変化）
 * - 距離ベースのディテール制御
 * - 水彩モード: にじみ・色ムラ・白抜き・重ね塗り透明感
 * - 色鉛筆モード: 元色の淡い保持・色付きハッチング・筆圧ムラ
 * - 照明表現: 明度ベースのハッチング密度変化・光源マーク
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
uniform int mode; // 0 = sketch, 1 = watercolor, 2 = colored-pencil
uniform float time;

// ─── ノイズ関数群 ───

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

// Perlin風 fBm（繊維パターン用）— ループ展開済み
float fbm3(vec2 p) {
  float val = 0.5 * noise2d(p);
  val += 0.25 * noise2d(p * 2.0);
  val += 0.125 * noise2d(p * 4.0);
  return val;
}

// ─── 深度サンプリング ───

float getDepth(vec2 uv) {
  return texture2D(depthBuffer, uv).r;
}

// 深度からリニア距離(0~1正規化)を推定
float linearizeDepth(float d) {
  float near = 0.1;
  float far = 100.0;
  return (2.0 * near) / (far + near - d * (far - near));
}

// ─── 色サンプリング ───

vec3 getColor(vec2 uv) {
  return texture2D(inputBuffer, uv).rgb;
}

// ─── エッジ検出: 3種合成（強化版） ───

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

// 2. 法線推定エッジ（深度からscreen-space法線を再構築 — 強化版）
float normalEdge(vec2 uv, vec2 ts) {
  float dc = getDepth(uv);
  float dl = getDepth(uv - vec2(ts.x, 0.0));
  float dr = getDepth(uv + vec2(ts.x, 0.0));
  float dt = getDepth(uv - vec2(0.0, ts.y));
  float db = getDepth(uv + vec2(0.0, ts.y));
  // screen-space法線近似
  vec3 normalC = normalize(vec3(dl - dr, dt - db, 2.0 * ts.x));
  // 隣接ピクセルの法線との差分（4方向チェック）
  float dl2 = getDepth(uv - vec2(ts.x * 2.0, 0.0));
  float dr2 = getDepth(uv + vec2(ts.x * 2.0, 0.0));
  float dt2 = getDepth(uv - vec2(0.0, ts.y * 2.0));
  float db2 = getDepth(uv + vec2(0.0, ts.y * 2.0));
  vec3 normalR = normalize(vec3(dc - dr2, dt - db, 2.0 * ts.x));
  vec3 normalB = normalize(vec3(dl - dr, dc - db2, 2.0 * ts.x));
  vec3 normalL = normalize(vec3(dl2 - dc, dt - db, 2.0 * ts.x));
  vec3 normalT = normalize(vec3(dl - dr, dt2 - dc, 2.0 * ts.x));
  float dotR = 1.0 - abs(dot(normalC, normalR));
  float dotB = 1.0 - abs(dot(normalC, normalB));
  float dotL = 1.0 - abs(dot(normalC, normalL));
  float dotT = 1.0 - abs(dot(normalC, normalT));
  return max(max(dotR, dotB), max(dotL, dotT));
}

// 3. 色差エッジ（マテリアル境界 — 感度強化+対角サンプル追加）
float colorEdge(vec2 uv, vec2 ts) {
  vec3 cc = getColor(uv);
  vec3 cl = getColor(uv - vec2(ts.x, 0.0));
  vec3 cr = getColor(uv + vec2(ts.x, 0.0));
  vec3 ct = getColor(uv - vec2(0.0, ts.y));
  vec3 cb = getColor(uv + vec2(0.0, ts.y));
  // 対角方向も追加（家具の曲線・角をより正確に検出）
  vec3 ctl = getColor(uv + vec2(-ts.x, -ts.y));
  vec3 cbr = getColor(uv + vec2(ts.x, ts.y));
  float diffH = length(cr - cl);
  float diffV = length(cb - ct);
  float diffD = length(cbr - ctl) * 0.707; // 対角は距離補正
  return sqrt(diffH * diffH + diffV * diffV + diffD * diffD);
}

// ─── 鉛筆筆圧シミュレーション ───

float pencilPressure(vec2 uv, float edgeStr) {
  float pressureNoise = noise2d(uv * 23.0 + time * 0.01) * 0.4 + 0.6;
  float tremor = noise2d(uv * 80.0) * 0.15;
  return clamp(pressureNoise + tremor, 0.3, 1.0);
}

// エッジ方向のストローク感（始端・終端フェード）
float strokeFade(vec2 uv) {
  float strokePos = fract(noise2d(uv * 15.0) * 5.0);
  float fade = smoothstep(0.0, 0.08, strokePos) * smoothstep(1.0, 0.92, strokePos);
  return mix(0.5, 1.0, fade);
}

// ─── 5段階ハッチングパターン（照明対応強化版） ───

float hatchPattern5(vec2 uv, float darkness, float density, float randomness, float distFactor) {
  // 距離によるハッチング密度調整
  float adjDensity = density * mix(1.0, 0.5, distFactor);

  // 非常に明るい: 線なし
  if (darkness < 0.08) return 0.0;

  float result = 0.0;
  float wobble = noise2d(uv * 3.0) * randomness;

  // 段階1: 明るい → 極細の軽いストローク（0.08~0.22）
  if (darkness >= 0.08) {
    float line0 = abs(fract((uv.x + uv.y * 0.8 + wobble) * adjDensity * 0.7) - 0.5) * 2.0;
    float str0 = smoothstep(0.75, 0.60, line0) * smoothstep(0.08, 0.18, darkness) * 0.4;
    float pressVar = noise2d(uv * 40.0 + 5.0) * 0.3 + 0.7;
    result = max(result, str0 * pressVar);
  }

  // 段階2: 中間 → 通常ハッチング（0.22~）
  if (darkness > 0.22) {
    float wobble1 = noise2d(uv * 4.0 + 3.0) * randomness;
    float line1 = abs(fract((uv.x + uv.y + wobble1) * adjDensity) - 0.5) * 2.0;
    float str1 = smoothstep(0.60, 0.45, line1) * min((darkness - 0.12) * 1.5, 1.0);
    float pressVar1 = noise2d(uv * 35.0 + 8.0) * 0.25 + 0.75;
    result = max(result, str1 * pressVar1);
  }

  // 段階3: やや暗い → クロスハッチ（0.40~）
  if (darkness > 0.40) {
    float wobble2 = noise2d(uv * 5.0 + 10.0) * randomness;
    float line2 = abs(fract((uv.x - uv.y + wobble2) * adjDensity) - 0.5) * 2.0;
    float str2 = smoothstep(0.60, 0.45, line2) * (darkness - 0.25);
    float pressVar2 = noise2d(uv * 30.0 + 12.0) * 0.2 + 0.8;
    result = max(result, str2 * pressVar2);
  }

  // 段階4: 暗い → 密クロスハッチ（水平）（0.60~）
  if (darkness > 0.60) {
    float wobble3 = noise2d(uv * 7.0 + 20.0) * randomness * 0.5;
    float line3 = abs(fract((uv.y + wobble3) * adjDensity * 1.3) - 0.5) * 2.0;
    result = max(result, smoothstep(0.7, 0.55, line3) * (darkness - 0.40) * 0.7);
  }

  // 段階5: 非常に暗い → 追加密クロスハッチ + スティップリング（0.78~）
  if (darkness > 0.78) {
    float wobble4 = noise2d(uv * 9.0 + 30.0) * randomness * 0.3;
    float line4 = abs(fract((uv.x * 0.7 + uv.y * 1.2 + wobble4) * adjDensity * 1.5) - 0.5) * 2.0;
    result = max(result, smoothstep(0.65, 0.50, line4) * (darkness - 0.60) * 0.6);
    // スティップリング（点描）
    float stipple = hash(floor(uv * adjDensity * 8.0));
    float stippleThreshold = mix(0.7, 0.3, (darkness - 0.78) * 4.5);
    result = max(result, step(stippleThreshold, stipple) * (darkness - 0.68) * 0.5);
  }

  return clamp(result, 0.0, 1.0);
}

// ─── 紙テクスチャ ───

vec3 paperTexture(vec2 uv, vec2 res) {
  vec2 paperUV = uv * res;

  // 繊維パターン: 方向性のあるfBmノイズ
  vec2 fiberUV = paperUV * 0.02;
  fiberUV.x *= 1.5;
  float fiber = fbm3(fiberUV) * 0.03;

  // 粒状感: 高周波ノイズ
  float grain = (hash(floor(paperUV * 0.8)) - 0.5) * 0.025;

  // 紙の凹凸: 中周波ノイズ
  float bump = noise2d(paperUV * 0.05) * 0.02;

  // 経年変化感
  vec2 centeredUV = uv * 2.0 - 1.0;
  float edgeDist = length(centeredUV);
  float aging = smoothstep(0.3, 1.2, edgeDist) * 0.04;
  vec3 agingTint = vec3(-0.01, -0.02, -0.04) * aging;

  vec3 paper = paperColor + vec3(fiber + grain + bump) * paperNoiseIntensity / 0.03 + agingTint;
  return paper;
}

// 紙の凹凸による鉛筆のムラ係数
float paperBumpInfluence(vec2 uv, vec2 res) {
  float bumpVal = noise2d(uv * res * 0.05);
  return 0.7 + bumpVal * 0.3;
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

// ─── HSV変換 ───

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// ─── メインシェーダー ───

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 texelSize = 1.0 / resolution;

  // ── 深度の線形化と距離ファクター ──
  float linDepth = linearizeDepth(depth);
  float distFactor = clamp(linDepth * 5.0, 0.0, 1.0);

  // ── 空気遠近法: 遠い物ほど線が薄く（強化版） ──
  // distFactor 0=近い, 1=遠い → aerialFade 1.0→0.15 で遠景を大幅に薄く
  float aerialFade = mix(1.0, 0.15, smoothstep(0.0, 0.8, distFactor));

  // ── 3種エッジ検出（強化版） ──

  // 距離で線の太さを変化（近い→太い、遠い→細い）
  float lineScale = mix(1.5, 0.5, distFactor);
  vec2 edgeTS = texelSize * lineScale;

  // 1. シルエットエッジ（深度差大）→太い線
  float silhouetteEdge = sobelEdgeDepth(uv, edgeTS * 1.5);
  // edgeThreshold を低く設定して内部エッジも検出（家具ディテール強化）
  float silhouetteIntensity = smoothstep(edgeThreshold * 0.2, edgeThreshold * 1.2, silhouetteEdge);

  // 2. クリースエッジ（法線差）→中程度の線 — 感度強化
  float creaseEdge = normalEdge(uv, edgeTS);
  float creaseIntensity = smoothstep(0.06, 0.35, creaseEdge) * 0.8;

  // 3. マテリアルエッジ（色差）→細い線 — 感度強化
  float matEdge = colorEdge(uv, edgeTS * 0.8);
  float matIntensity = smoothstep(0.08, 0.4, matEdge) * 0.6;

  // エッジ合成（最大値ベース、距離+空気遠近で減衰）
  float edgeFade = mix(1.0, 0.2, distFactor) * aerialFade;
  float edgeIntensity = clamp(
    max(max(silhouetteIntensity, creaseIntensity), matIntensity) * edgeFade,
    0.0, 1.0
  );

  // ── 鉛筆筆圧 ──
  vec2 pressUV = uv * resolution / 8.0;
  float pressure = pencilPressure(pressUV, edgeIntensity);
  float sFade = strokeFade(pressUV);
  float pencilMod = pressure * sFade;

  // エッジに筆圧を適用
  edgeIntensity *= pencilMod;

  // ── 元画像の明度取得 ──
  vec3 originalColor = inputColor.rgb;
  float luminance = dot(originalColor, vec3(0.299, 0.587, 0.114));
  float darkness = 1.0 - luminance;

  // 背景（空/遠景）検出
  float bgMask = smoothstep(0.95, 1.0, linDepth);

  // ── 照明表現: 明度ベースでハッチング密度を調整 ──
  // 明るい部分（照明直下/窓際）= ハッチング薄く
  // 暗い部分（影）= ハッチング密に
  float lightInfluence = luminance; // 0=暗い, 1=明るい
  float hatchDarkness = darkness * mix(1.3, 0.5, lightInfluence);
  hatchDarkness = clamp(hatchDarkness, 0.0, 1.0);

  // ── 5段階ハッチング ──
  vec2 screenUV = uv * resolution / 4.0;
  float hatch = hatchPattern5(screenUV, hatchDarkness, hatchDensity, hatchRandomness, distFactor);
  // 紙の凹凸ムラをハッチングに適用
  hatch *= paperBumpInfluence(uv, resolution);
  // 筆圧をハッチングにも適用
  hatch *= mix(0.8, 1.0, pencilMod);
  // 空気遠近法: 遠くのハッチングも薄く
  hatch *= aerialFade;
  // 背景ではハッチングを消す
  hatch *= (1.0 - bgMask);

  // ── 紙テクスチャ ──
  vec3 paper = paperTexture(uv, resolution);

  // ── 方向性シャドウ: 右下45度の一貫した影で立体感を強調 ──
  // エッジの右下方向にわずかなオフセットサンプルを取り、影を加算
  vec2 shadowOffset = texelSize * vec2(1.5, 1.5); // 右下45度
  float shadowDepth = getDepth(uv + shadowOffset);
  float shadowEdge = abs(linearizeDepth(depth) - linearizeDepth(shadowDepth));
  float directionalShadow = smoothstep(0.001, 0.02, shadowEdge) * 0.25 * aerialFade * (1.0 - bgMask);

  // ── 合成 ──
  vec3 result;

  if (mode == 1) {
    // ════════════════════════════════════════
    // watercolor モード: 淡い水彩風の色付け
    // ════════════════════════════════════════

    float colorVariation = fbm3(uv * 8.0 + 1.5) * 0.3;
    float whiteout = smoothstep(0.2, 0.6, luminance);

    float colorMix = 0.2 + luminance * 0.2 + colorVariation * 0.15;
    colorMix *= (1.0 - whiteout * 0.7);
    vec3 watercolor = mix(paper, originalColor * 0.85 + paper * 0.15, colorMix);

    // にじみ（5x5カーネル）
    vec3 blurred = vec3(0.0);
    float totalWeight = 0.0;
    for (float dx = -2.0; dx <= 2.0; dx += 1.0) {
      for (float dy = -2.0; dy <= 2.0; dy += 1.0) {
        float w = 1.0 / (1.0 + abs(dx) + abs(dy));
        vec2 sampleUV = uv + vec2(dx, dy) * texelSize * 2.0;
        sampleUV += (noise2d(sampleUV * 50.0) - 0.5) * texelSize * 1.5;
        blurred += texture2D(inputBuffer, sampleUV).rgb * w;
        totalWeight += w;
      }
    }
    blurred /= totalWeight;

    float bleedAmount = edgeIntensity * 0.4 + 0.1;
    vec3 bleedColor = mix(blurred, paper, 0.3);
    watercolor = mix(watercolor, bleedColor, bleedAmount);

    float muddiness = noise2d(uv * 12.0 + 3.0) * 0.08;
    watercolor += vec3(muddiness * 0.5, muddiness * 0.3, -muddiness * 0.2);

    // エッジを薄い鉛筆線で追加
    watercolor = mix(watercolor, inkColor * 0.5, edgeIntensity * 0.35);
    watercolor = mix(watercolor, inkColor * 0.4, hatch * 0.1);
    // 方向性シャドウ
    watercolor = mix(watercolor, inkColor * 0.6, directionalShadow * 0.3);

    result = watercolor;
    result = toSepia(result, sepiaAmount * 0.3);

  } else if (mode == 2) {
    // ════════════════════════════════════════
    // colored-pencil モード: 色鉛筆スケッチ
    // ════════════════════════════════════════

    // 元の色をHSVに変換して彩度を落とす（淡い色鉛筆感）
    vec3 hsv = rgb2hsv(originalColor);
    hsv.y *= 0.4; // 彩度30-50%に落とす
    hsv.z = mix(hsv.z, 0.85, 0.3); // 明度を紙色に近づける
    vec3 pallidColor = hsv2rgb(hsv);

    // ベースは紙色と淡い元色のブレンド
    float colorStrength = 0.35 + darkness * 0.25; // 暗い部分ほど色が強い
    result = mix(paper, pallidColor, colorStrength);

    // 色鉛筆の筆圧ムラ（塗りムラ表現）
    float pressureMura = noise2d(uv * resolution * 0.012) * 0.4
                       + noise2d(uv * resolution * 0.003 + 7.0) * 0.3;
    pressureMura = pressureMura * 0.5 + 0.5; // 0.25~0.75 に正規化
    result = mix(paper, result, clamp(pressureMura + 0.3, 0.0, 1.0));

    // 色付きハッチング（元の色に合わせた線の色）
    vec3 hatchColor = mix(inkColor, originalColor * 0.5, 0.6); // 元色寄りのハッチング
    // 暗い部分は濃く、明るい部分は薄くハッチング
    float coloredHatch = hatch * 0.65;
    result = mix(result, hatchColor, coloredHatch);

    // エッジ（輪郭線）— 色付き鉛筆線
    vec3 edgeColor = mix(inkColor * 0.7, originalColor * 0.3, 0.4);
    float silEdge = silhouetteIntensity * edgeFade * pencilMod;
    result = mix(result, edgeColor, silEdge * 0.85);
    float crEdge = creaseIntensity * edgeFade * pencilMod * 0.6;
    result = mix(result, edgeColor * 1.1, crEdge * 0.50);
    float mtEdge = matIntensity * edgeFade * pencilMod * 0.5;
    result = mix(result, edgeColor * 1.15, mtEdge * 0.35);

    // 方向性シャドウ
    result = mix(result, edgeColor * 0.6, directionalShadow * 0.35);

    // 背景は紙色
    result = mix(result, paper, bgMask * 0.85);

    // 色鉛筆は軽いセピアのみ
    result = toSepia(result, sepiaAmount * 0.15);

  } else {
    // ════════════════════════════════════════
    // sketch モード: モノクロ鉛筆画（照明表現強化）
    // ════════════════════════════════════════

    // ベースは紙色
    result = paper;

    // ハッチングで陰影（照明表現込み）
    result = mix(result, inkColor, hatch * 0.7);

    // エッジ（輪郭線）— 種類別の太さ・濃さ
    float silEdge = silhouetteIntensity * edgeFade * pencilMod;
    result = mix(result, inkColor, silEdge * 0.90);
    float crEdge = creaseIntensity * edgeFade * pencilMod * 0.65;
    result = mix(result, inkColor * 1.1, crEdge * 0.55);
    float mtEdge = matIntensity * edgeFade * pencilMod * 0.5;
    result = mix(result, inkColor * 1.2, mtEdge * 0.35);

    // 方向性シャドウ（右下45度）で立体感強調
    result = mix(result, inkColor * 0.8, directionalShadow * 0.5);

    // 照明位置マーク: 非常に明るい部分に×印を描画
    if (luminance > 0.92 && linDepth < 0.8) {
      vec2 markUV = fract(uv * resolution / 20.0) - 0.5;
      float cross1 = abs(markUV.x + markUV.y);
      float cross2 = abs(markUV.x - markUV.y);
      float crossMark = smoothstep(0.06, 0.02, min(cross1, cross2));
      // まばらに配置（グリッドの一部だけ）
      float gridCheck = step(0.85, hash(floor(uv * resolution / 20.0)));
      crossMark *= gridCheck * 0.3;
      result = mix(result, inkColor * 0.6, crossMark);
    }

    // 背景はほぼ紙色
    result = mix(result, paper, bgMask * 0.85);

    // セピアトーン
    result = toSepia(result, sepiaAmount);
  }

  // 紙端のビネット
  vec2 vignetteUV = uv * 2.0 - 1.0;
  float vignette = 1.0 - dot(vignetteUV, vignetteUV) * 0.18;
  result *= vignette;

  outputColor = vec4(result, inputColor.a);
}
`;

// ── カスタムEffect クラス ──
class SketchEffectImpl extends Effect {
  constructor({
    edgeThreshold = 0.015,
    hatchDensity = 10.0,
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
  mode?: 'sketch' | 'watercolor' | 'colored-pencil';
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
      edgeThreshold = 0.015,
      hatchDensity = 10.0,
      hatchRandomness = 0.3,
      paperNoiseIntensity = 0.03,
      paperColor = '#faf8f0',
      inkColor = '#333333',
      sepiaAmount = 0.4,
    },
    ref,
  ) {
    const effect = useMemo(() => {
      const modeInt = mode === 'watercolor' ? 1 : mode === 'colored-pencil' ? 2 : 0;
      return new SketchEffectImpl({
        edgeThreshold,
        hatchDensity,
        hatchRandomness,
        paperNoiseIntensity,
        paperColor: new THREE.Color(paperColor),
        inkColor: new THREE.Color(inkColor),
        sepiaAmount,
        mode: modeInt,
        time: performance.now() * 0.001,
      });
    }, [mode, edgeThreshold, hatchDensity, hatchRandomness, paperNoiseIntensity, paperColor, inkColor, sepiaAmount]);

    return <primitive ref={ref} object={effect} dispose={null} />;
  },
);
