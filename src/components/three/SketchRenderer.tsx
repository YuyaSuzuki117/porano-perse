'use client';

/**
 * SketchRenderer — 線画/水彩/色鉛筆/設計図 ポストプロセッシングエフェクト
 *
 * mode=0 sketch:         太いアウトライン・明確な5段階ハッチング・セピアモノクロ鉛筆画
 * mode=1 watercolor:     にじみ・色溜まり・白抜き・透明感のある水彩画
 * mode=2 colored-pencil: 鮮やかな色・ストローク方向性・重ね塗り感のある色鉛筆画
 * mode=3 blueprint:      紺背景・白シアン線・グリッド・寸法線風の設計図
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
uniform int mode; // 0 = sketch, 1 = watercolor, 2 = colored-pencil, 3 = blueprint
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

// Perlin風 fBm — ループ展開済み
float fbm3(vec2 p) {
  float val = 0.5 * noise2d(p);
  val += 0.25 * noise2d(p * 2.0);
  val += 0.125 * noise2d(p * 4.0);
  return val;
}

float fbm4(vec2 p) {
  float val = 0.5 * noise2d(p);
  val += 0.25 * noise2d(p * 2.0);
  val += 0.125 * noise2d(p * 4.0);
  val += 0.0625 * noise2d(p * 8.0);
  return val;
}

// ─── 深度サンプリング ───

float getDepth(vec2 uv) {
  return texture2D(depthBuffer, uv).r;
}

float linearizeDepth(float d) {
  float near = 0.01;
  float far = 200.0;
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

// 2. 法線推定エッジ（深度から法線再構築）
float normalEdge(vec2 uv, vec2 ts) {
  float dc = getDepth(uv);
  float dl = getDepth(uv - vec2(ts.x, 0.0));
  float dr = getDepth(uv + vec2(ts.x, 0.0));
  float dt = getDepth(uv - vec2(0.0, ts.y));
  float db = getDepth(uv + vec2(0.0, ts.y));
  vec3 normalC = normalize(vec3(dl - dr, dt - db, 2.0 * ts.x));
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

// 3. 色差エッジ（マテリアル境界）
float colorEdge(vec2 uv, vec2 ts) {
  vec3 cc = getColor(uv);
  vec3 cl = getColor(uv - vec2(ts.x, 0.0));
  vec3 cr = getColor(uv + vec2(ts.x, 0.0));
  vec3 ct = getColor(uv - vec2(0.0, ts.y));
  vec3 cb = getColor(uv + vec2(0.0, ts.y));
  vec3 ctl = getColor(uv + vec2(-ts.x, -ts.y));
  vec3 cbr = getColor(uv + vec2(ts.x, ts.y));
  float diffH = length(cr - cl);
  float diffV = length(cb - ct);
  float diffD = length(cbr - ctl) * 0.707;
  return sqrt(diffH * diffH + diffV * diffV + diffD * diffD);
}

// ─── 鉛筆筆圧シミュレーション ───

float pencilPressure(vec2 uv, float edgeStr) {
  float pressureNoise = noise2d(uv * 23.0 + time * 0.01) * 0.4 + 0.6;
  float tremor = noise2d(uv * 80.0) * 0.15;
  return clamp(pressureNoise + tremor, 0.3, 1.0);
}

float strokeFade(vec2 uv) {
  float strokePos = fract(noise2d(uv * 15.0) * 5.0);
  float fade = smoothstep(0.0, 0.08, strokePos) * smoothstep(1.0, 0.92, strokePos);
  return mix(0.5, 1.0, fade);
}

// ─── 手描き風のエッジ揺らぎ ───
vec2 handTremor(vec2 uv, float strength) {
  float tx = noise2d(uv * 60.0 + 0.5) - 0.5;
  float ty = noise2d(uv * 60.0 + 100.5) - 0.5;
  return vec2(tx, ty) * strength;
}

// ─── 5段階ハッチングパターン（改善版：明確な濃淡差） ───

float hatchPattern5(vec2 uv, float darkness, float density, float randomness, float distFactor) {
  float adjDensity = density * mix(1.0, 0.5, distFactor);

  // 明るい部分は完全に紙色を見せる
  if (darkness < 0.08) return 0.0;

  float result = 0.0;
  // 一貫した45度斜め線の揺らぎ
  float wobble = noise2d(uv * 3.0) * randomness;

  // 段階1 (0.08~): 極細の軽い45度ストローク — 最も明るい影に
  if (darkness >= 0.08) {
    float line0 = abs(fract((uv.x + uv.y + wobble) * adjDensity * 0.5) - 0.5) * 2.0;
    float str0 = smoothstep(0.70, 0.45, line0) * smoothstep(0.08, 0.25, darkness) * 0.5;
    float pressVar = noise2d(uv * 40.0 + 5.0) * 0.25 + 0.75;
    result = max(result, str0 * pressVar);
  }

  // 段階2 (0.15~): 主要45度ハッチング — 中間トーンの主力
  if (darkness > 0.15) {
    float wobble1 = noise2d(uv * 4.0 + 3.0) * randomness;
    float line1 = abs(fract((uv.x + uv.y + wobble1) * adjDensity * 0.8) - 0.5) * 2.0;
    float str1 = smoothstep(0.45, 0.18, line1) * min((darkness - 0.10) * 2.0, 1.0) * 0.8;
    float pressVar1 = noise2d(uv * 35.0 + 8.0) * 0.2 + 0.8;
    result = max(result, str1 * pressVar1);
  }

  // 段階3 (0.35~): クロスハッチ（-45度）— 影を濃くする
  if (darkness > 0.35) {
    float wobble2 = noise2d(uv * 5.0 + 10.0) * randomness;
    float line2 = abs(fract((uv.x - uv.y + wobble2) * adjDensity * 0.9) - 0.5) * 2.0;
    float str2 = smoothstep(0.45, 0.20, line2) * min((darkness - 0.25) * 1.8, 1.0) * 0.75;
    result = max(result, str2);
  }

  // 段階4 (0.50~): 水平ハッチ — さらに暗い領域
  if (darkness > 0.50) {
    float wobble3 = noise2d(uv * 7.0 + 20.0) * randomness * 0.5;
    float line3 = abs(fract((uv.y + wobble3) * adjDensity * 1.2) - 0.5) * 2.0;
    float str3 = smoothstep(0.50, 0.22, line3) * min((darkness - 0.40) * 2.0, 1.0) * 0.8;
    result = max(result, str3);
  }

  // 段階5 (0.70~): 密集クロスハッチ + スティップリング — ほぼ黒
  if (darkness > 0.70) {
    float wobble4 = noise2d(uv * 9.0 + 30.0) * randomness * 0.3;
    float line4 = abs(fract((uv.x * 0.7 + uv.y * 1.2 + wobble4) * adjDensity * 1.4) - 0.5) * 2.0;
    float str4 = smoothstep(0.45, 0.15, line4) * min((darkness - 0.55) * 2.5, 1.0) * 0.9;
    result = max(result, str4);
    float stipple = hash(floor(uv * adjDensity * 10.0));
    float stippleThreshold = mix(0.55, 0.1, clamp((darkness - 0.70) * 3.5, 0.0, 1.0));
    result = max(result, step(stippleThreshold, stipple) * (darkness - 0.60) * 0.8);
  }

  return clamp(result, 0.0, 1.0);
}

// ─── 色鉛筆用方向性ストロークパターン ───

float coloredPencilStroke(vec2 uv, float density, float darkness) {
  // 一方向（やや斜め）のストローク
  float angle = 0.3; // ≈17度の微妙な傾き
  float rotU = uv.x * cos(angle) - uv.y * sin(angle);
  float rotV = uv.x * sin(angle) + uv.y * cos(angle);

  float wobble = noise2d(vec2(rotU, rotV) * 4.0) * 0.2;
  // ストロークを大きく（density * 0.35 で太い線に）
  float stroke = abs(fract((rotV + wobble) * density * 0.35) - 0.5) * 2.0;

  // ストロークの筆圧ムラ（強めに）
  float pressure = noise2d(vec2(rotU * 2.0, rotV * 0.3) + 7.0) * 0.5 + 0.5;

  float intensity = smoothstep(0.50, 0.12, stroke) * pressure;

  // 暗い部分で二重塗り（30度ずらして重ね塗り感）
  if (darkness > 0.3) {
    float stroke2 = abs(fract((rotV + wobble * 1.5) * density * 0.5 + 0.25) - 0.5) * 2.0;
    float layer2 = smoothstep(0.45, 0.15, stroke2) * smoothstep(0.3, 0.65, darkness) * 0.65;
    intensity = max(intensity, layer2);
  }

  return intensity;
}

// ─── 紙テクスチャ ───

vec3 paperTexture(vec2 uv, vec2 res) {
  vec2 paperUV = uv * res;
  float fiber = fbm3(paperUV * 0.02 * vec2(1.5, 1.0)) * 0.03;
  float grain = (hash(floor(paperUV * 0.8)) - 0.5) * 0.025;
  float bump = noise2d(paperUV * 0.05) * 0.02;

  vec2 centeredUV = uv * 2.0 - 1.0;
  float edgeDist = length(centeredUV);
  float aging = smoothstep(0.3, 1.2, edgeDist) * 0.04;
  vec3 agingTint = vec3(-0.01, -0.02, -0.04) * aging;

  return paperColor + vec3(fiber + grain + bump) * paperNoiseIntensity / 0.03 + agingTint;
}

// 紙の凹凸による鉛筆のムラ係数
float paperBumpInfluence(vec2 uv, vec2 res) {
  float bumpVal = noise2d(uv * res * 0.05);
  return 0.7 + bumpVal * 0.3;
}

// 紙のざらつき（色鉛筆用：凹凸で色が乗らない部分）
float paperGrainMask(vec2 uv, vec2 res) {
  float grain = noise2d(uv * res * 0.08);
  float fine = noise2d(uv * res * 0.25) * 0.3;
  return clamp(grain + fine, 0.0, 1.0);
}

// ─── セピアトーン変換 ───

vec3 toSepia(vec3 color, float amount) {
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 sepia = vec3(gray * 1.0, gray * 0.85, gray * 0.65);
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

  // ── 空気遠近法 ──
  float aerialFade = mix(1.0, 0.15, smoothstep(0.0, 0.8, distFactor));

  // ── 3種エッジ検出 ──
  float lineScale = mix(3.0, 0.8, distFactor);
  vec2 edgeTS = texelSize * lineScale;

  // 手描き揺らぎ（sketch/colored-pencil用）
  vec2 tremor = handTremor(uv * resolution / 8.0, texelSize.x * 0.8);
  vec2 sketchUV = (mode == 0 || mode == 2) ? uv + tremor : uv;

  // 1. シルエットエッジ（太い線 3-4px相当）
  float silhouetteEdge = sobelEdgeDepth(sketchUV, edgeTS * 2.5);
  float silhouetteIntensity = smoothstep(edgeThreshold * 0.08, edgeThreshold * 0.6, silhouetteEdge);

  // 2. クリースエッジ（中程度の線）
  float creaseEdge = normalEdge(sketchUV, edgeTS * 1.2);
  float creaseIntensity = smoothstep(0.02, 0.15, creaseEdge) * 0.9;

  // 3. マテリアルエッジ（細い線）
  float matEdge = colorEdge(sketchUV, edgeTS * 0.8);
  float matIntensity = smoothstep(0.03, 0.20, matEdge) * 0.7;

  // エッジ合成
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

  // ── 元画像の明度取得 ──
  vec3 originalColor = inputColor.rgb;
  float luminance = dot(originalColor, vec3(0.299, 0.587, 0.114));
  float darkness = 1.0 - luminance;

  // 背景検出
  float bgMask = smoothstep(0.95, 1.0, linDepth);

  // ── 照明ベースのハッチング密度 ──
  float lightInfluence = luminance;
  float hatchDarkness = darkness * mix(1.4, 0.4, lightInfluence);
  hatchDarkness = clamp(hatchDarkness, 0.0, 1.0);

  // ── 5段階ハッチング ──
  vec2 screenUV = uv * resolution / 4.0;
  float hatch = hatchPattern5(screenUV, hatchDarkness, hatchDensity, hatchRandomness, distFactor);
  hatch *= paperBumpInfluence(uv, resolution);
  hatch *= mix(0.8, 1.0, pencilMod);
  hatch *= aerialFade;
  hatch *= (1.0 - bgMask);

  // ── 紙テクスチャ ──
  vec3 paper = paperTexture(uv, resolution);

  // ── 方向性シャドウ ──
  vec2 shadowOffset = texelSize * vec2(1.5, 1.5);
  float shadowDepth = getDepth(uv + shadowOffset);
  float shadowEdge = abs(linearizeDepth(depth) - linearizeDepth(shadowDepth));
  float directionalShadow = smoothstep(0.001, 0.02, shadowEdge) * 0.25 * aerialFade * (1.0 - bgMask);

  // ── 合成 ──
  vec3 result;

  if (mode == 1) {
    // ════════════════════════════════════════════════════════
    // watercolor モード: にじみ・色溜まり・白抜き・透明感
    // ════════════════════════════════════════════════════════

    // ── にじみブラー（大きめカーネル+不規則オフセット） ──
    vec3 blurred = vec3(0.0);
    float totalWeight = 0.0;
    for (float dx = -3.0; dx <= 3.0; dx += 1.0) {
      for (float dy = -3.0; dy <= 3.0; dy += 1.0) {
        float w = 1.0 / (1.0 + abs(dx) + abs(dy));
        vec2 offset = vec2(dx, dy) * texelSize * 4.5;
        // 不規則なオフセットで水の流れ感
        float nOff = noise2d(uv * 30.0 + vec2(dx, dy) * 7.0);
        offset += (nOff - 0.5) * texelSize * 4.0;
        blurred += texture2D(inputBuffer, clamp(uv + offset, 0.0, 1.0)).rgb * w;
        totalWeight += w;
      }
    }
    blurred /= totalWeight;

    // ── 色のムラ（水彩特有の不均一性） ──
    float colorVariation = fbm4(uv * 12.0 + 2.5) * 0.25;
    float colorVariation2 = noise2d(uv * 25.0 + 5.0) * 0.15;

    // ── 白抜き（ハイライトは紙の白） ──
    float whiteout = smoothstep(0.5, 0.85, luminance);
    whiteout = pow(whiteout, 1.0); // 白抜きを弱める

    // ── ベースカラー（色をしっかり出す） ──
    vec3 waterBase = blurred * 0.5 + originalColor * 0.5;
    // 彩度を上げて水彩らしい鮮やかさを
    vec3 hsv = rgb2hsv(waterBase);
    hsv.y *= 1.2; // 彩度を上げる
    hsv.z = mix(hsv.z, 0.9, 0.1); // 明度はほぼそのまま
    waterBase = hsv2rgb(hsv);

    // 色の溜まり（暗い部分でpigment pooling）— 強めに
    float pooling = smoothstep(0.3, 0.7, darkness) * 0.6;
    vec3 poolColor = originalColor * 0.45;
    waterBase = mix(waterBase, poolColor, pooling);

    // 色のムラを適用
    waterBase += vec3(colorVariation * 0.35, colorVariation2 * 0.25, -colorVariation * 0.15);

    // 紙色とのブレンド（色を強く出す）
    float colorMix = 0.65 + darkness * 0.25 + colorVariation * 0.1;
    colorMix *= (1.0 - whiteout * 0.6); // 白抜きを弱める
    vec3 watercolor = mix(paper, waterBase, colorMix);

    // ── エッジにじみ（色が広がる） ──
    float bleedAmount = edgeIntensity * 0.5 + 0.15;
    vec3 bleedColor = mix(blurred * 0.8, paper, 0.25);
    watercolor = mix(watercolor, bleedColor, bleedAmount * 0.5);

    // ── ウェットオンウェット（隣接色の混ざり） ──
    vec2 wetOffset = texelSize * 5.0 * vec2(
      noise2d(uv * 20.0) - 0.5,
      noise2d(uv * 20.0 + 50.0) - 0.5
    );
    vec3 neighborColor = texture2D(inputBuffer, clamp(uv + wetOffset, 0.0, 1.0)).rgb;
    watercolor = mix(watercolor, neighborColor * 0.6 + paper * 0.4, 0.08);

    // ── 輪郭は極薄（水彩は線がほぼない） ──
    watercolor = mix(watercolor, inkColor * 0.4 + watercolor * 0.6, edgeIntensity * 0.06);

    // 方向性シャドウは弱め
    watercolor = mix(watercolor, inkColor * 0.5, directionalShadow * 0.15);

    // 背景は紙色
    watercolor = mix(watercolor, paper, bgMask * 0.9);

    result = watercolor;
    // 水彩はセピアほぼなし
    result = toSepia(result, 0.0);

  } else if (mode == 2) {
    // ════════════════════════════════════════════════════════
    // colored-pencil モード: 鮮やかな色・ストローク方向性・重ね塗り
    // ════════════════════════════════════════════════════════

    // ── 鮮やかな色（彩度75%） ──
    vec3 hsvC = rgb2hsv(originalColor);
    hsvC.y *= 0.85; // 彩度をさらに上げる
    hsvC.z = mix(hsvC.z, 0.80, 0.2); // 明度を少し紙に近づける
    vec3 vividColor = hsv2rgb(hsvC);

    // ── ベース: 紙色と色のブレンド ──
    float colorStrength = 0.55 + darkness * 0.30;
    result = mix(paper, vividColor, colorStrength);

    // ── 紙のざらつき（色が乗らない凹凸） ──
    float grainMask = paperGrainMask(uv, resolution);
    // ざらつきで色が一部抜ける
    float grainFade = smoothstep(0.25, 0.55, grainMask);
    result = mix(paper, result, grainFade * 0.3 + 0.7);

    // ── 方向性ストロークパターン ──
    vec2 strokeUV = uv * resolution / 4.0;
    float strokePattern = coloredPencilStroke(strokeUV, hatchDensity, darkness);

    // ストロークを色で塗る（暗い部分ほど強い）
    vec3 strokeColor = vividColor * 0.8;
    result = mix(result, strokeColor, strokePattern * 0.7 * max(darkness, 0.2));

    // ── 重ね塗り感（暗い部分はさらに濃く） ──
    if (darkness > 0.4) {
      float overlap = smoothstep(0.4, 0.8, darkness);
      vec3 darkStroke = vividColor * 0.4;
      result = mix(result, darkStroke, overlap * 0.35 * strokePattern);
    }

    // ── 色のはみ出し（輪郭からわずかにはみ出す） ──
    if (edgeIntensity > 0.3) {
      vec2 bleedDir = texelSize * 2.5 * vec2(
        noise2d(uv * 40.0) - 0.5,
        noise2d(uv * 40.0 + 77.0) - 0.5
      );
      vec3 bleedColor = texture2D(inputBuffer, clamp(uv + bleedDir, 0.0, 1.0)).rgb;
      vec3 hsvBleed = rgb2hsv(bleedColor);
      hsvBleed.y *= 0.6;
      bleedColor = hsv2rgb(hsvBleed);
      result = mix(result, bleedColor * 0.7 + paper * 0.3, edgeIntensity * 0.12);
    }

    // ── 筆圧ムラ ──
    float pressureMura = noise2d(uv * resolution * 0.010) * 0.35
                       + noise2d(uv * resolution * 0.003 + 7.0) * 0.25;
    pressureMura = pressureMura * 0.5 + 0.5;
    result = mix(paper, result, clamp(pressureMura + 0.55, 0.0, 1.0));

    // ── 輪郭線（柔らかい暗色、黒ではない） ──
    vec3 edgeColor = originalColor * 0.25 + vec3(0.1, 0.08, 0.06); // 暗い色味
    // シルエットエッジ
    float silEdge = silhouetteIntensity * edgeFade * pencilMod;
    result = mix(result, edgeColor, silEdge * 0.75);
    // クリースエッジ
    float crEdge = creaseIntensity * edgeFade * pencilMod * 0.6;
    result = mix(result, edgeColor * 1.1, crEdge * 0.45);
    // マテリアルエッジ
    float mtEdge = matIntensity * edgeFade * pencilMod * 0.4;
    result = mix(result, edgeColor * 1.15, mtEdge * 0.30);

    // 方向性シャドウ
    result = mix(result, edgeColor * 0.5, directionalShadow * 0.3);

    // 背景は紙色
    result = mix(result, paper, bgMask * 0.85);

    // 色鉛筆はセピアごく軽く
    result = toSepia(result, sepiaAmount * 0.08);

  } else if (mode == 3) {
    // ════════════════════════════════════════════════════════
    // blueprint モード: 紺背景・白シアン線・グリッド・寸法線風
    // ════════════════════════════════════════════════════════

    // ── 背景: 完全に暗い紺色で上書き（inputColorを無視） ──
    // PostProcessingのバックバッファに元の背景色が残るため、
    // outputColorで完全に上書きしなければ紺色にならない
    vec3 bgTop = vec3(0.005, 0.012, 0.035);  // 極暗紺（トーンマッピング後の持ち上げを見越して極端に暗く）
    vec3 bgBot = vec3(0.012, 0.028, 0.065); // 暗い紺
    vec3 bgColor = mix(bgBot, bgTop, uv.y * 0.7 + 0.15);
    float bgNoise = noise2d(uv * resolution * 0.03) * 0.01;
    bgColor += vec3(bgNoise * 0.1, bgNoise * 0.2, bgNoise * 0.4);

    // ── グリッドパターン（線幅を広げて視認性UP） ──
    vec2 gridUV = uv * resolution;
    float gridSpacing = 40.0;
    float gridFine = 10.0;

    // メジャーグリッド（太め）
    vec2 gridPos = mod(gridUV, gridSpacing);
    float gridDistH = min(gridPos.y, gridSpacing - gridPos.y);
    float gridDistV = min(gridPos.x, gridSpacing - gridPos.x);
    float gridLineH = smoothstep(1.5, 0.0, gridDistH);
    float gridLineV = smoothstep(1.5, 0.0, gridDistV);
    float majorGrid = max(gridLineH, gridLineV) * 0.18;

    // マイナーグリッド
    vec2 gridPosFine = mod(gridUV, gridFine);
    float gridDistFH = min(gridPosFine.y, gridFine - gridPosFine.y);
    float gridDistFV = min(gridPosFine.x, gridFine - gridPosFine.x);
    float gridFineH = smoothstep(0.8, 0.0, gridDistFH);
    float gridFineV = smoothstep(0.8, 0.0, gridDistFV);
    float minorGrid = max(gridFineH, gridFineV) * 0.08;

    float grid = max(majorGrid, minorGrid);
    vec3 gridColor = vec3(0.08, 0.20, 0.38);

    // ── 線の色: 白～シアン ──
    vec3 lineColor = vec3(0.88, 0.94, 1.0); // #e0f0ff

    // ── エッジ描画（ハッチングなし、クリーンな線のみ） ──
    // BlueprintではdistFactorの影響を弱めてクリアに
    float bpEdgeFade = mix(1.0, 0.4, distFactor);

    // シルエットエッジ（太い 4px相当）
    float bpSilhouette = sobelEdgeDepth(uv, edgeTS * 4.0);
    float bpSilIntensity = smoothstep(edgeThreshold * 0.06, edgeThreshold * 0.4, bpSilhouette);

    // クリースエッジ（中太 2px相当）
    float bpCrease = normalEdge(uv, edgeTS * 1.5);
    float bpCreaseIntensity = smoothstep(0.015, 0.10, bpCrease) * 0.85;

    // ディテールエッジ（細い 1px相当）
    float bpDetail = colorEdge(uv, edgeTS * 0.6);
    float bpDetailIntensity = smoothstep(0.025, 0.15, bpDetail) * 0.6;

    // 線の合成
    float bpEdge = max(max(bpSilIntensity, bpCreaseIntensity), bpDetailIntensity) * bpEdgeFade;
    // 背景では線を薄くするが完全には消さない（設計図は全面紺）
    bpEdge *= mix(1.0, 0.3, bgMask);

    // ── 線の太さで明るさを変える（太い線=より明るい） ──
    float lineGlow = bpSilIntensity * 0.3; // シルエットに微光彩
    vec3 glowColor = vec3(0.4, 0.7, 1.0);

    // ── 寸法線風の短い直交線 ──
    float dimLine = 0.0;
    // シルエットエッジ付近にのみ寸法線マーク
    if (bpSilIntensity > 0.3) {
      // 一定間隔でマーク配置
      vec2 dimGrid = floor(uv * resolution / 20.0);
      float dimCheck = step(0.7, hash(dimGrid + 0.5));

      // エッジの方向に直交する短い線
      float dimMarkH = smoothstep(1.5, 0.0, abs(mod(gridUV.y, 20.0) - 10.0)) *
                        smoothstep(4.0, 0.0, abs(mod(gridUV.x, 20.0) - 10.0));
      float dimMarkV = smoothstep(1.5, 0.0, abs(mod(gridUV.x, 20.0) - 10.0)) *
                        smoothstep(4.0, 0.0, abs(mod(gridUV.y, 20.0) - 10.0));
      dimLine = max(dimMarkH, dimMarkV) * dimCheck * bpSilIntensity * 0.4;
    }

    // ── 合成（元画像のRGBを完全に無視、紺色ベースから構築） ──
    result = bgColor;  // inputColor ではなく紺色を起点
    // グリッド
    result = mix(result, gridColor, grid);
    // 寸法線
    result = mix(result, lineColor * 0.7, dimLine);
    // エッジ線
    result = mix(result, lineColor, bpEdge * 0.95);
    // グロー
    result += glowColor * lineGlow * bpEdge * 0.25;

    // 背景も紺色を維持（bgMaskで薄まらないように）
    // ビネットなし（設計図は均一）
    outputColor = vec4(result, inputColor.a);
    return;

  } else {
    // ════════════════════════════════════════════════════════
    // sketch モード: 太い輪郭・明確なハッチング・セピア鉛筆画
    // ════════════════════════════════════════════════════════

    // ── エッジに筆圧を適用 ──
    float sketchEdge = edgeIntensity * pencilMod;

    // ベースは紙色（明るい部分はしっかり白く）
    result = paper;

    // ── ハッチングで陰影（コントラスト強め） ──
    float hatchStrength = hatch * 0.95;
    result = mix(result, inkColor, hatchStrength);

    // ── エッジ（太くはっきり、コントラスト強） ──
    // シルエット（太い線 3-4px）
    float silEdge = silhouetteIntensity * edgeFade * pencilMod;
    result = mix(result, inkColor * 0.95, silEdge * 0.98);
    // クリース（中太）
    float crEdge = creaseIntensity * edgeFade * pencilMod * 0.75;
    result = mix(result, inkColor, crEdge * 0.75);
    // マテリアル（細い）
    float mtEdge = matIntensity * edgeFade * pencilMod * 0.55;
    result = mix(result, inkColor * 1.1, mtEdge * 0.50);

    // ── 方向性シャドウで立体感 ──
    result = mix(result, inkColor * 0.75, directionalShadow * 0.5);

    // 背景は紙色
    result = mix(result, paper, bgMask * 0.9);

    // ── セピアトーン（温かみ） ──
    result = toSepia(result, sepiaAmount);
  }

  // ── 紙端のビネット（blueprintは上のreturnで除外済み） ──
  vec2 vignetteUV = uv * 2.0 - 1.0;
  float vignette = 1.0 - dot(vignetteUV, vignetteUV) * 0.18;
  result *= vignette;

  outputColor = vec4(result, inputColor.a);
}
`;

// ── カスタムEffect クラス ──
class SketchEffectImpl extends Effect {
  constructor({
    edgeThreshold = 0.005,
    hatchDensity = 14.0,
    hatchRandomness = 0.3,
    paperNoiseIntensity = 0.05,
    paperColor = new THREE.Color('#f5f0e8'),
    inkColor = new THREE.Color('#1a1a1a'),
    sepiaAmount = 0.5,
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
      attributes: EffectAttribute.DEPTH
    });
  }
}

// ── React コンポーネント ──

interface SketchEffectProps {
  mode?: 'sketch' | 'watercolor' | 'colored-pencil' | 'blueprint';
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
      edgeThreshold = 0.005,
      hatchDensity = 14.0,
      hatchRandomness = 0.3,
      paperNoiseIntensity = 0.05,
      paperColor = '#f5f0e8',
      inkColor = '#1a1a1a',
      sepiaAmount = 0.5,
    },
    ref,
  ) {
    const effect = useMemo(() => {
      const modeInt = mode === 'watercolor' ? 1
                    : mode === 'colored-pencil' ? 2
                    : mode === 'blueprint' ? 3
                    : 0;
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
