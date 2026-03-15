'use client';

/**
 * SketchRenderer — 線画/水彩/色鉛筆/設計図 ポストプロセッシングエフェクト
 *
 * mode=0 sketch:         7段階ハッチング・紙目インタラクション・AO密度・セピアモノクロ鉛筆画
 * mode=1 watercolor:     顔料粒状化・重力にじみ・カリフラワー効果・塩テクスチャ・グレージング水彩画
 * mode=2 colored-pencil: 3層方向性ストローク・ワックスビルドアップ・バーニッシング色鉛筆画
 * mode=3 blueprint:      4段階線階層・十字マーク・SDF線描画・フレーム付き設計図
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

// ハッシュ関数（高速疑似乱数）
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 2Dバリューノイズ（滑らかな乱数フィールド）
float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  // エルミート補間で滑らかに
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// fBm 3オクターブ（中規模のフラクタルノイズ）
float fbm3(vec2 p) {
  float val = 0.5 * noise2d(p);
  val += 0.25 * noise2d(p * 2.0);
  val += 0.125 * noise2d(p * 4.0);
  return val;
}

// fBm 4オクターブ（高解像度フラクタルノイズ）
float fbm4(vec2 p) {
  float val = 0.5 * noise2d(p);
  val += 0.25 * noise2d(p * 2.0);
  val += 0.125 * noise2d(p * 4.0);
  val += 0.0625 * noise2d(p * 8.0);
  return val;
}

// fBm 5オクターブ（超高解像度フラクタルノイズ — 水彩用）
float fbm5(vec2 p) {
  float val = 0.5 * noise2d(p);
  val += 0.25 * noise2d(p * 2.0);
  val += 0.125 * noise2d(p * 4.0);
  val += 0.0625 * noise2d(p * 8.0);
  val += 0.03125 * noise2d(p * 16.0);
  return val;
}

// ─── 深度サンプリング ───

float getDepth(vec2 uv) {
  return texture2D(depthBuffer, uv).r;
}

// 深度値をリニア[0,1]に変換
float linearizeDepth(float d) {
  float near = 0.01;
  float far = 200.0;
  return (2.0 * near) / (far + near - d * (far - near));
}

// ─── 色サンプリング ───

vec3 getColor(vec2 uv) {
  return texture2D(inputBuffer, uv).rgb;
}

// ─── マルチスケールエッジ検出 ───

// 深度ベースSobelフィルタ（シルエットエッジ検出）
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

// 深度から法線を再構築してエッジ検出（クリースエッジ）
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

// 色差ベースエッジ検出（マテリアル境界）
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

// ─── 簡易スクリーンスペースAO（深度差による隅検出） ───
float ssaoEstimate(vec2 uv, vec2 ts) {
  float centerD = linearizeDepth(getDepth(uv));
  float aoSum = 0.0;
  // 8方向サンプリング（展開済みループ）
  aoSum += linearizeDepth(getDepth(uv + ts * vec2(-2.0, -2.0)));
  aoSum += linearizeDepth(getDepth(uv + ts * vec2( 0.0, -2.5)));
  aoSum += linearizeDepth(getDepth(uv + ts * vec2( 2.0, -2.0)));
  aoSum += linearizeDepth(getDepth(uv + ts * vec2(-2.5,  0.0)));
  aoSum += linearizeDepth(getDepth(uv + ts * vec2( 2.5,  0.0)));
  aoSum += linearizeDepth(getDepth(uv + ts * vec2(-2.0,  2.0)));
  aoSum += linearizeDepth(getDepth(uv + ts * vec2( 0.0,  2.5)));
  aoSum += linearizeDepth(getDepth(uv + ts * vec2( 2.0,  2.0)));
  float avgD = aoSum / 8.0;
  // 周囲より凹んでいる箇所でAO値が高くなる
  float ao = clamp((avgD - centerD) * 80.0, 0.0, 1.0);
  return ao;
}

// ─── 鉛筆筆圧シミュレーション ───

float pencilPressure(vec2 uv, float edgeStr) {
  // 大きめのノイズで筆圧の波を表現
  float pressureNoise = noise2d(uv * 23.0 + time * 0.01) * 0.4 + 0.6;
  // 細かい震えを重畳
  float tremor = noise2d(uv * 80.0) * 0.15;
  return clamp(pressureNoise + tremor, 0.3, 1.0);
}

// ストロークの開始/終了フェード
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

// ─── 7段階ハッチングパターン（紙目インタラクション付き） ───

float hatchPattern7(vec2 uv, vec2 rawUV, float darkness, float density, float randomness, float distFactor, float aoVal, vec2 res) {
  float adjDensity = density * mix(1.0, 0.5, distFactor);

  // 明るい部分は完全に紙色を見せる
  if (darkness < 0.06) return 0.0;

  // AO（隅/窪み）で追加ハッチング密度
  float aoDarkBoost = aoVal * 0.25;
  float effDarkness = clamp(darkness + aoDarkBoost, 0.0, 1.0);

  float result = 0.0;

  // 紙目テクスチャとの干渉（控えめ — ハッチングを抑制しすぎない）
  float paperTooth = noise2d(rawUV * res * 0.12);
  float toothMask = smoothstep(0.15, 0.55, paperTooth) * 0.4 + 0.6;

  // ストローク太さの変動（fBmで自然な揺らぎ）
  float widthVar = fbm3(uv * 8.0) * 0.3 + 0.85;

  // 一貫した斜め線の揺らぎ
  float wobble = noise2d(uv * 3.0) * randomness;

  // 段階1 (0.06~): 極細の45度ストローク — 最も明るい影
  if (effDarkness >= 0.06) {
    float line0 = abs(fract((uv.x + uv.y + wobble) * adjDensity * 0.45) - 0.5) * 2.0;
    float str0 = smoothstep(0.72 * widthVar, 0.42, line0) * smoothstep(0.06, 0.22, effDarkness) * 0.4;
    float pressVar = noise2d(uv * 40.0 + 5.0) * 0.25 + 0.75;
    result = max(result, str0 * pressVar * toothMask);
  }

  // 段階2 (0.14~): 主要45度ハッチング — 中間トーン基盤
  if (effDarkness > 0.14) {
    float wobble1 = noise2d(uv * 4.0 + 3.0) * randomness;
    float line1 = abs(fract((uv.x + uv.y + wobble1) * adjDensity * 0.7) - 0.5) * 2.0;
    float str1 = smoothstep(0.48 * widthVar, 0.16, line1) * min((effDarkness - 0.10) * 2.0, 1.0) * 0.7;
    float pressVar1 = noise2d(uv * 35.0 + 8.0) * 0.2 + 0.8;
    result = max(result, str1 * pressVar1 * toothMask);
  }

  // 段階3 (0.25~): やや密な45度ハッチング — トーン強化
  if (effDarkness > 0.25) {
    float wobble15 = noise2d(uv * 3.5 + 6.0) * randomness;
    float line15 = abs(fract((uv.x + uv.y + wobble15) * adjDensity * 0.95) - 0.5) * 2.0;
    float str15 = smoothstep(0.44 * widthVar, 0.18, line15) * min((effDarkness - 0.20) * 2.2, 1.0) * 0.65;
    result = max(result, str15 * toothMask);
  }

  // 段階4 (0.38~): クロスハッチ（-45度）— 影を深くする
  if (effDarkness > 0.38) {
    float wobble2 = noise2d(uv * 5.0 + 10.0) * randomness;
    float line2 = abs(fract((uv.x - uv.y + wobble2) * adjDensity * 0.8) - 0.5) * 2.0;
    float str2 = smoothstep(0.46 * widthVar, 0.18, line2) * min((effDarkness - 0.30) * 1.8, 1.0) * 0.72;
    result = max(result, str2 * toothMask);
  }

  // 段階5 (0.52~): 水平ハッチ — 暗い領域
  if (effDarkness > 0.52) {
    float wobble3 = noise2d(uv * 7.0 + 20.0) * randomness * 0.5;
    float line3 = abs(fract((uv.y + wobble3) * adjDensity * 1.1) - 0.5) * 2.0;
    float str3 = smoothstep(0.50 * widthVar, 0.20, line3) * min((effDarkness - 0.42) * 2.0, 1.0) * 0.78;
    result = max(result, str3 * toothMask);
  }

  // 段階6 (0.65~): 密集斜めクロスハッチ — 深い影
  if (effDarkness > 0.65) {
    float wobble5 = noise2d(uv * 8.0 + 25.0) * randomness * 0.4;
    float line5 = abs(fract((uv.x * 0.8 + uv.y * 1.1 + wobble5) * adjDensity * 1.2) - 0.5) * 2.0;
    float str5 = smoothstep(0.42 * widthVar, 0.14, line5) * min((effDarkness - 0.55) * 2.5, 1.0) * 0.82;
    result = max(result, str5 * mix(toothMask, 1.0, 0.4));
  }

  // 段階7 (0.78~): 超密集ハッチ＋スティップリング — ほぼ黒
  if (effDarkness > 0.78) {
    float wobble4 = noise2d(uv * 9.0 + 30.0) * randomness * 0.3;
    float line4 = abs(fract((uv.x * 0.6 + uv.y * 1.3 + wobble4) * adjDensity * 1.5) - 0.5) * 2.0;
    float str4 = smoothstep(0.40, 0.12, line4) * min((effDarkness - 0.65) * 2.8, 1.0) * 0.9;
    result = max(result, str4);
    // スティップリング（点描）
    float stipple = hash(floor(uv * adjDensity * 10.0));
    float stippleThreshold = mix(0.55, 0.08, clamp((effDarkness - 0.78) * 4.0, 0.0, 1.0));
    result = max(result, step(stippleThreshold, stipple) * (effDarkness - 0.65) * 0.85);
  }

  return clamp(result, 0.0, 1.0);
}

// ─── 色鉛筆用3層方向性ストロークパターン ───

float coloredPencilStroke3Layer(vec2 uv, float density, float darkness) {
  float result = 0.0;

  // レイヤー1: 17度 — 全体の基本ストローク
  float angle1 = 0.2967; // ≈17度
  float rotU1 = uv.x * cos(angle1) - uv.y * sin(angle1);
  float rotV1 = uv.x * sin(angle1) + uv.y * cos(angle1);
  float wobble1 = noise2d(vec2(rotU1, rotV1) * 4.0) * 0.2;
  float stroke1 = abs(fract((rotV1 + wobble1) * density * 0.26) - 0.5) * 2.0;
  float pressure1 = noise2d(vec2(rotU1 * 2.0, rotV1 * 0.3) + 7.0) * 0.5 + 0.5;
  float layer1 = smoothstep(0.55, 0.06, stroke1) * pressure1;
  result = max(result, layer1);

  // レイヤー2: 55度 — 中間の暗さから出現
  if (darkness > 0.22) {
    float angle2 = 0.9599; // ≈55度
    float rotU2 = uv.x * cos(angle2) - uv.y * sin(angle2);
    float rotV2 = uv.x * sin(angle2) + uv.y * cos(angle2);
    float wobble2 = noise2d(vec2(rotU2, rotV2) * 3.5 + 11.0) * 0.18;
    float stroke2 = abs(fract((rotV2 + wobble2) * density * 0.32) - 0.5) * 2.0;
    float pressure2 = noise2d(vec2(rotU2 * 1.8, rotV2 * 0.4) + 13.0) * 0.45 + 0.55;
    float layer2 = smoothstep(0.48, 0.10, stroke2) * pressure2 * smoothstep(0.22, 0.50, darkness) * 0.75;
    result = max(result, layer2);
  }

  // レイヤー3: -30度 — 暗い部分のクロスハッチ
  if (darkness > 0.45) {
    float angle3 = -0.5236; // ≈-30度
    float rotU3 = uv.x * cos(angle3) - uv.y * sin(angle3);
    float rotV3 = uv.x * sin(angle3) + uv.y * cos(angle3);
    float wobble3 = noise2d(vec2(rotU3, rotV3) * 5.0 + 23.0) * 0.15;
    float stroke3 = abs(fract((rotV3 + wobble3) * density * 0.38) - 0.5) * 2.0;
    float pressure3 = noise2d(vec2(rotU3 * 2.2, rotV3 * 0.5) + 19.0) * 0.4 + 0.6;
    float layer3 = smoothstep(0.45, 0.12, stroke3) * pressure3 * smoothstep(0.45, 0.75, darkness) * 0.65;
    result = max(result, layer3);
  }

  return result;
}

// ─── 紙テクスチャ ───

vec3 paperTexture(vec2 uv, vec2 res) {
  vec2 paperUV = uv * res;
  // 繊維質のノイズ（異方性）
  float fiber = fbm3(paperUV * 0.02 * vec2(1.5, 1.0)) * 0.03;
  // 微細な粒状ノイズ
  float grain = (hash(floor(paperUV * 0.8)) - 0.5) * 0.025;
  // 中規模のバンプ
  float bump = noise2d(paperUV * 0.05) * 0.02;

  // 紙端のエイジング効果
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

// ─── セピアトーン変換（影に微かな青味） ───

vec3 toSepiaEnhanced(vec3 color, float amount, float darkness) {
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  // 温かみのあるセピア（やや赤みを強調）
  vec3 warmSepia = vec3(gray * 1.05, gray * 0.83, gray * 0.62);
  // 影部分に微かな青味を加えて深みを出す
  vec3 coolShadow = vec3(gray * 0.90, gray * 0.85, gray * 0.78);
  vec3 sepia = mix(warmSepia, coolShadow, darkness * 0.3);
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

  // ── 深度の線形化と対数距離ファクター ──
  float linDepth = linearizeDepth(depth);
  // 対数スケーリングでより自然な線の太さ減衰
  float distFactor = clamp(log(1.0 + linDepth * 10.0) / log(11.0), 0.0, 1.0);

  // ── 空気遠近法 ──
  float aerialFade = mix(1.0, 0.15, smoothstep(0.0, 0.8, distFactor));

  // ── マルチスケールエッジ検出（3スケール合成） ──
  float lineScale = mix(3.0, 0.8, distFactor);
  vec2 edgeTS = texelSize * lineScale;

  // 手描き揺らぎ（sketch/colored-pencil用）
  vec2 tremor = handTremor(uv * resolution / 8.0, texelSize.x * 0.8);
  vec2 sketchUV = (mode == 0 || mode == 2) ? uv + tremor : uv;

  // ── 広域カーネル：シルエットエッジ（太い線 4-5px相当） ──
  float wideEdge = sobelEdgeDepth(sketchUV, edgeTS * 3.0);
  float wideIntensity = smoothstep(edgeThreshold * 0.06, edgeThreshold * 0.5, wideEdge);

  // ── 中域カーネル：クリースエッジ（中太 2px相当） ──
  float midEdge = normalEdge(sketchUV, edgeTS * 1.4);
  float midIntensity = smoothstep(0.018, 0.13, midEdge) * 0.88;

  // ── 細域カーネル：ディテールエッジ（細い線 1px相当） ──
  float fineEdge = colorEdge(sketchUV, edgeTS * 0.7);
  float fineIntensity = smoothstep(0.025, 0.18, fineEdge) * 0.65;

  // マルチスケールエッジの重み付き合成
  float edgeFade = mix(1.0, 0.2, distFactor) * aerialFade;
  float edgeIntensity = clamp(
    (wideIntensity * 1.0 + midIntensity * 0.7 + fineIntensity * 0.4) / 1.5 * edgeFade,
    0.0, 1.0
  );
  // 各スケールのピーク値も保持（モード別で使用）
  float silhouetteIntensity = wideIntensity;
  float creaseIntensity = midIntensity;
  float matIntensity = fineIntensity;

  // ── 鉛筆筆圧 ──
  vec2 pressUV = uv * resolution / 8.0;
  float pressure = pencilPressure(pressUV, edgeIntensity);
  float sFade = strokeFade(pressUV);
  float pencilMod = pressure * sFade;

  // ── 元画像の明度取得 ──
  vec3 originalColor = inputColor.rgb;
  float luminance = dot(originalColor, vec3(0.299, 0.587, 0.114));
  float darkness = 1.0 - luminance;

  // 背景検出（遠距離フラグ）
  float bgMask = smoothstep(0.95, 1.0, linDepth);

  // ── 照明ベースのハッチング密度 ──
  float lightInfluence = luminance;
  float hatchDarkness = darkness * mix(1.6, 0.3, lightInfluence);
  hatchDarkness = clamp(hatchDarkness, 0.0, 1.0);

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
    // ════════════════════════════════════════════════════════════
    // watercolor モード: 顔料粒状化・重力にじみ・カリフラワー・
    //                    グレージング・塩テクスチャ・透明感
    // ════════════════════════════════════════════════════════════

    // ── にじみブラー（拡張4カーネル + 重力バイアス） ──
    vec3 blurred = vec3(0.0);
    float totalWeight = 0.0;
    for (float dx = -4.0; dx <= 4.0; dx += 1.0) {
      for (float dy = -4.0; dy <= 4.0; dy += 1.0) {
        float w = 1.0 / (1.0 + abs(dx) + abs(dy));
        vec2 offset = vec2(dx, dy) * texelSize * 5.5;
        // 重力バイアス（水は下に流れる）
        offset.y += texelSize.y * 2.0;
        // 不規則なオフセットで水の流れ感
        float nOff = noise2d(uv * 30.0 + vec2(dx, dy) * 7.0);
        offset += (nOff - 0.5) * texelSize * 4.5;
        blurred += texture2D(inputBuffer, clamp(uv + offset, 0.0, 1.0)).rgb * w;
        totalWeight += w;
      }
    }
    blurred /= totalWeight;

    // ── 顔料粒状化（暗い色ほど紙の谷に顔料が溜まる） ──
    float granulation = noise2d(uv * resolution * 0.04) * pow(1.0 - luminance, 0.5) * 0.3;

    // ── 色のムラ（水彩特有の不均一性） ──
    float colorVariation = fbm4(uv * 12.0 + 2.5) * 0.25;
    float colorVariation2 = noise2d(uv * 25.0 + 5.0) * 0.15;

    // ── 白抜き（ハイライトは紙の白） ──
    float whiteout = smoothstep(0.5, 0.88, luminance);

    // ── ベースカラー（元色とブラーのブレンド + 明るさ補正） ──
    vec3 waterBase = blurred * 0.35 + originalColor * 0.65;
    // 暗くなりすぎ防止：最低輝度を確保
    waterBase = max(waterBase, originalColor * 0.5);

    // 彩度を上げて水彩らしい鮮やかさを（過度にならない範囲で）
    vec3 hsv = rgb2hsv(waterBase);
    hsv.y = min(hsv.y * 1.25, 0.92);
    hsv.z = mix(hsv.z, 0.88, 0.1);
    waterBase = hsv2rgb(hsv);

    // ── ウォッシュ効果（大スケールノイズで色ムラ — 軽い不均一性） ──
    float washNoise = fbm5(uv * 6.0 + 1.0);
    float washEdge = smoothstep(0.3, 0.7, abs(washNoise - 0.5) * 2.0);
    waterBase = mix(waterBase, waterBase * (0.92 + washEdge * 0.12), 0.2);

    // ── 色の溜まり（暗い部分でpigment pooling — 控えめ）──
    float pooling = smoothstep(0.35, 0.75, darkness) * 0.35;
    vec3 poolColor = originalColor * 0.55;
    waterBase = mix(waterBase, poolColor, pooling);

    // ── 顔料粒状化の適用（控えめに — 暗くなりすぎない） ──
    waterBase -= vec3(granulation * 0.15, granulation * 0.10, granulation * 0.05);

    // 色のムラを適用
    waterBase += vec3(colorVariation * 0.35, colorVariation2 * 0.25, -colorVariation * 0.15);

    // ── グレージング（乗算的色混合で重なりの深み） ──
    vec2 wetOffset = texelSize * 5.0 * vec2(
      noise2d(uv * 20.0) - 0.5,
      noise2d(uv * 20.0 + 50.0) - 0.5
    );
    vec3 neighborColor = texture2D(inputBuffer, clamp(uv + wetOffset, 0.0, 1.0)).rgb;
    // 乗算的ブレンド（sqrt(a*b)）でグレージング効果
    vec3 glazed = sqrt(max(waterBase * neighborColor, vec3(0.001)));
    waterBase = mix(waterBase, glazed, 0.18);

    // 紙色とのブレンド（色をしっかり出す）
    float colorMix = 0.78 + darkness * 0.18 + colorVariation * 0.08;
    colorMix *= (1.0 - whiteout * 0.45);
    vec3 watercolor = mix(paper, waterBase, colorMix);

    // ── カリフラワー/ブルーム効果（にじみ境界のフラクタルエッジ） ──
    float cauliflower = fbm4(uv * 40.0 + time * 0.08) * edgeIntensity * 0.15;
    watercolor = mix(watercolor, paper, cauliflower);

    // ── エッジにじみ（色が広がる — 控えめ） ──
    float bleedAmount = edgeIntensity * 0.3 + 0.08;
    vec3 bleedColor = mix(blurred * 0.8, paper, 0.35);
    watercolor = mix(watercolor, bleedColor, bleedAmount * 0.3);

    // ── 塩テクスチャ（湿った部分にランダムな明るい斑点） ──
    float salt = step(0.97, hash(floor(uv * resolution * 0.15))) * 0.2 * (1.0 - luminance);
    watercolor += vec3(salt);

    // ── 輪郭は極薄（水彩は線がほぼない） ──
    watercolor = mix(watercolor, inkColor * 0.35 + watercolor * 0.65, edgeIntensity * 0.05);

    // 方向性シャドウは弱め
    watercolor = mix(watercolor, inkColor * 0.5, directionalShadow * 0.12);

    // 背景は紙色
    watercolor = mix(watercolor, paper, bgMask * 0.92);

    result = watercolor;

  } else if (mode == 2) {
    // ════════════════════════════════════════════════════════════
    // colored-pencil モード: 3層方向性ストローク・ワックスビルドアップ・
    //                        バーニッシング・彩度ブースト・色付きエッジ
    // ════════════════════════════════════════════════════════════

    // ── 鮮やかな色（彩度1.2倍ブースト、クランプで過飽和防止） ──
    vec3 hsvC = rgb2hsv(originalColor);
    hsvC.y = min(hsvC.y * 1.2, 0.95); // 過飽和をクランプ
    hsvC.z = mix(hsvC.z, 0.82, 0.18);
    vec3 vividColor = hsv2rgb(hsvC);

    // ── ベース: 紙色と色のブレンド ──
    float colorStrength = 0.55 + darkness * 0.32;
    result = mix(paper, vividColor, colorStrength);

    // ── 紙のざらつき（二方向性 — 控えめに凹凸感を出す） ──
    float grainMask = paperGrainMask(uv, resolution);
    float grainFade = smoothstep(0.30, 0.65, grainMask);
    // 紙の谷ではやや暖色にシフト（大部分は色が乗る）
    vec3 grainTint = mix(paper * vec3(1.01, 1.0, 0.98), result, grainFade * 0.08 + 0.92);
    result = grainTint;

    // ── 3層方向性ストロークパターン ──
    vec2 strokeUV = uv * resolution / 4.0;
    float strokePattern = coloredPencilStroke3Layer(strokeUV, hatchDensity, darkness);

    // ストロークを色で塗る（暗い部分ほど強い）
    vec3 strokeColor = vividColor * 0.78;
    result = mix(result, strokeColor, strokePattern * 0.82 * max(darkness, 0.22));

    // ── ワックスビルドアップ（暗い部分で蝋光沢） ──
    if (darkness > 0.6) {
      float wax = pow(luminance, 8.0) * darkness * 0.15;
      result += vec3(wax);
    }

    // ── バーニッシング効果（暗い+ストローク強で紙目が消える） ──
    if (darkness > 0.7) {
      float burnish = smoothstep(0.7, 0.95, darkness) * smoothstep(0.5, 0.8, strokePattern);
      // バーニッシングで紙目の影響が減少（ワックスが紙を埋める）
      result = mix(result, vividColor * 0.55, burnish * 0.4);
    }

    // ── 重ね塗り感（暗い部分はさらに濃く） ──
    if (darkness > 0.4) {
      float overlap = smoothstep(0.4, 0.8, darkness);
      vec3 darkStroke = vividColor * 0.38;
      result = mix(result, darkStroke, overlap * 0.35 * strokePattern);
    }

    // ── 色のはみ出し ──
    if (edgeIntensity > 0.3) {
      vec2 bleedDir = texelSize * 2.5 * vec2(
        noise2d(uv * 40.0) - 0.5,
        noise2d(uv * 40.0 + 77.0) - 0.5
      );
      vec3 bleedColor = texture2D(inputBuffer, clamp(uv + bleedDir, 0.0, 1.0)).rgb;
      vec3 hsvBleed = rgb2hsv(bleedColor);
      hsvBleed.y *= 0.6;
      bleedColor = hsv2rgb(hsvBleed);
      result = mix(result, bleedColor * 0.7 + paper * 0.3, edgeIntensity * 0.10);
    }

    // ── 筆圧ムラ ──
    float pressureMura = noise2d(uv * resolution * 0.010) * 0.35
                       + noise2d(uv * resolution * 0.003 + 7.0) * 0.25;
    pressureMura = pressureMura * 0.5 + 0.5;
    result = mix(paper, result, clamp(pressureMura + 0.55, 0.0, 1.0));

    // ── 色付きエッジ（ローカル色を60%暗くして線色に） ──
    vec3 edgeColorBase = originalColor * 0.4;
    // シルエットエッジ
    float silEdge = silhouetteIntensity * edgeFade * pencilMod;
    result = mix(result, edgeColorBase, silEdge * 0.78);
    // クリースエッジ
    float crEdge = creaseIntensity * edgeFade * pencilMod * 0.6;
    result = mix(result, edgeColorBase * 1.1, crEdge * 0.48);
    // マテリアルエッジ
    float mtEdge = matIntensity * edgeFade * pencilMod * 0.4;
    result = mix(result, edgeColorBase * 1.15, mtEdge * 0.32);

    // 方向性シャドウ
    result = mix(result, edgeColorBase * 0.5, directionalShadow * 0.28);

    // 背景は紙色
    result = mix(result, paper, bgMask * 0.87);

    // 色鉛筆はセピアごく軽く
    result = toSepiaEnhanced(result, sepiaAmount * 0.06, darkness);

  } else if (mode == 3) {
    // ════════════════════════════════════════════════════════════
    // blueprint モード: 4段階線階層・十字マーク・SDF線描画・
    //                   紙繊維テクスチャ・フレーム/ボーダー・強化グロー
    // ════════════════════════════════════════════════════════════

    // ── 背景: 暗い紺色（完全にinputColorを無視） ──
    vec3 bgTop = vec3(0.02, 0.05, 0.12);
    vec3 bgBot = vec3(0.04, 0.08, 0.18);
    vec3 bgColor = mix(bgBot, bgTop, uv.y * 0.7 + 0.15);
    // 紙繊維ノイズ
    float fiberNoise = fbm3(uv * 50.0) * 0.02;
    bgColor += vec3(fiberNoise * 0.08, fiberNoise * 0.15, fiberNoise * 0.35);

    // ── グリッドパターン ──
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
    vec3 gridColor = pow(vec3(0.08, 0.20, 0.38), vec3(2.2));

    // ── 十字マーク（メジャーグリッド交差点） ──
    float crossMark = 0.0;
    // メジャーグリッドの交差点に3px腕の十字
    float crossDistH = min(gridPos.y, gridSpacing - gridPos.y);
    float crossDistV = min(gridPos.x, gridSpacing - gridPos.x);
    float atIntersection = step(crossDistH, 3.0) * step(crossDistV, 3.0);
    // 十字マークの腕（水平・垂直各3px）
    float armH = smoothstep(1.0, 0.0, crossDistH) * step(crossDistV, 5.0);
    float armV = smoothstep(1.0, 0.0, crossDistV) * step(crossDistH, 5.0);
    crossMark = max(armH, armV) * atIntersection * 0.35;

    // ── 線の色: 白～シアン（逆ガンマ補正済み） ──
    vec3 lineColor = pow(vec3(0.88, 0.94, 1.0), vec3(2.2));

    // ── 4段階線階層（SDF的アンチエイリアス付き） ──
    float bpEdgeFade = mix(1.0, 0.4, distFactor);
    float pixelWidth = length(texelSize);

    // 1. 断面線（シルエット — 5px相当、フル輝度）
    float bpSilhouette = sobelEdgeDepth(uv, edgeTS * 4.5);
    float silDist = 1.0 - smoothstep(edgeThreshold * 0.04, edgeThreshold * 0.35, bpSilhouette);
    float bpSilIntensity = 1.0 - smoothstep(-pixelWidth * 0.5, pixelWidth * 0.5, silDist - 0.5);

    // 2. 可視エッジ（クリース — 2.5px相当、85%輝度）
    float bpCrease = normalEdge(uv, edgeTS * 1.6);
    float crDist = 1.0 - smoothstep(0.012, 0.09, bpCrease);
    float bpCreaseIntensity = (1.0 - smoothstep(-pixelWidth * 0.5, pixelWidth * 0.5, crDist - 0.5)) * 0.85;

    // 3. ディテールエッジ（1.2px相当、60%輝度）
    float bpDetail = colorEdge(uv, edgeTS * 0.5);
    float dtDist = 1.0 - smoothstep(0.02, 0.12, bpDetail);
    float bpDetailIntensity = (1.0 - smoothstep(-pixelWidth * 0.5, pixelWidth * 0.5, dtDist - 0.5)) * 0.60;

    // 4. 寸法/アノテーション線（0.8px相当、40%輝度）
    float bpAnnot = colorEdge(uv, edgeTS * 0.3);
    float anDist = 1.0 - smoothstep(0.035, 0.18, bpAnnot);
    float bpAnnotIntensity = (1.0 - smoothstep(-pixelWidth * 0.5, pixelWidth * 0.5, anDist - 0.5)) * 0.40;

    // 線の合成（ピクセル完璧なAA）
    float bpEdge = max(max(bpSilIntensity, bpCreaseIntensity), max(bpDetailIntensity, bpAnnotIntensity)) * bpEdgeFade;
    bpEdge *= mix(1.0, 0.3, bgMask);

    // ── セクションフィル（閉領域に薄いティント — 5%） ──
    float sectionFill = bpEdge * 0.05;

    // ── 線の太さで明るさを変える + 強化グロー ──
    float lineGlow = bpSilIntensity * 0.45;
    // シルエット線の周辺にラジアルフォールオフのグロー
    float glowRadius = bpSilhouette * 15.0;
    float radialGlow = exp(-glowRadius * glowRadius * 0.5) * bpSilIntensity * 0.2;
    vec3 glowColor = pow(vec3(0.4, 0.7, 1.0), vec3(2.2));

    // ── 寸法線風の短い直交線 ──
    float dimLine = 0.0;
    if (bpSilIntensity > 0.3) {
      vec2 dimGrid = floor(uv * resolution / 20.0);
      float dimCheck = step(0.7, hash(dimGrid + 0.5));
      float dimMarkH = smoothstep(1.5, 0.0, abs(mod(gridUV.y, 20.0) - 10.0)) *
                        smoothstep(4.0, 0.0, abs(mod(gridUV.x, 20.0) - 10.0));
      float dimMarkV = smoothstep(1.5, 0.0, abs(mod(gridUV.x, 20.0) - 10.0)) *
                        smoothstep(4.0, 0.0, abs(mod(gridUV.y, 20.0) - 10.0));
      dimLine = max(dimMarkH, dimMarkV) * dimCheck * bpSilIntensity * 0.4;
    }

    // ── フレーム/ボーダー（端から2%にエッジライン + コーナーマーカー） ──
    float frameMargin = 0.02;
    float frameWidth = 0.001;
    float frameDist = min(min(uv.x - frameMargin, 1.0 - frameMargin - uv.x),
                          min(uv.y - frameMargin, 1.0 - frameMargin - uv.y));
    float frameLine = smoothstep(frameWidth, 0.0, abs(frameDist)) * 0.6;

    // コーナーマーカー（角に短いL字）
    float cornerSize = 0.035;
    float cornerWidth = 0.0015;
    float cornerMark = 0.0;
    // 4隅を展開（WebGL互換性のためループなし）
    // 左上
    float clu = step(uv.x, frameMargin + cornerSize) * step(uv.y, frameMargin + cornerSize) *
                (smoothstep(cornerWidth, 0.0, abs(uv.x - frameMargin)) +
                 smoothstep(cornerWidth, 0.0, abs(uv.y - frameMargin)));
    // 右上
    float cru = step(1.0 - frameMargin - cornerSize, uv.x) * step(uv.y, frameMargin + cornerSize) *
                (smoothstep(cornerWidth, 0.0, abs(uv.x - (1.0 - frameMargin))) +
                 smoothstep(cornerWidth, 0.0, abs(uv.y - frameMargin)));
    // 左下
    float clb = step(uv.x, frameMargin + cornerSize) * step(1.0 - frameMargin - cornerSize, uv.y) *
                (smoothstep(cornerWidth, 0.0, abs(uv.x - frameMargin)) +
                 smoothstep(cornerWidth, 0.0, abs(uv.y - (1.0 - frameMargin))));
    // 右下
    float crb = step(1.0 - frameMargin - cornerSize, uv.x) * step(1.0 - frameMargin - cornerSize, uv.y) *
                (smoothstep(cornerWidth, 0.0, abs(uv.x - (1.0 - frameMargin))) +
                 smoothstep(cornerWidth, 0.0, abs(uv.y - (1.0 - frameMargin))));
    cornerMark = clamp(clu + cru + clb + crb, 0.0, 1.0) * 0.5;

    // ── 合成（元画像のRGBを完全に無視） ──
    result = bgColor;
    // セクションフィル
    result = mix(result, lineColor * 0.15 + bgColor * 0.85, sectionFill);
    // グリッド
    result = mix(result, gridColor, grid);
    // 十字マーク
    result = mix(result, gridColor * 1.5, crossMark);
    // 寸法線
    result = mix(result, lineColor * 0.7, dimLine);
    // フレーム
    result = mix(result, lineColor * 0.5, frameLine);
    // コーナーマーカー
    result = mix(result, lineColor * 0.6, cornerMark);
    // エッジ線
    result = mix(result, lineColor, bpEdge * 0.95);
    // グロー（シルエット線の放射状フォールオフ）
    result += glowColor * (lineGlow + radialGlow) * bpEdge * 0.3;

    // sRGBエンコード補正
    result = pow(result, vec3(2.2));
    outputColor = vec4(result, inputColor.a);
    return;

  } else {
    // ════════════════════════════════════════════════════════════
    // sketch モード: 7段階ハッチング・紙目干渉・AO密度・
    //               建築補助線・改善セピア・立体感強化
    // ════════════════════════════════════════════════════════════

    // ── スクリーンスペースAO ──
    float ao = ssaoEstimate(uv, texelSize * 3.0);

    // ── 7段階ハッチング（紙目インタラクション＋AO連動） ──
    vec2 screenUV = uv * resolution / 4.0;
    float hatch = hatchPattern7(screenUV, uv, hatchDarkness, hatchDensity, hatchRandomness, distFactor, ao, resolution);
    hatch *= paperBumpInfluence(uv, resolution);
    hatch *= mix(0.8, 1.0, pencilMod);
    hatch *= aerialFade;
    hatch *= (1.0 - bgMask);

    // ── エッジに筆圧を適用 ──
    float sketchEdge = edgeIntensity * pencilMod;

    // ベースは紙色（明るい部分はしっかり白く）
    result = paper;

    // ── ハッチングで陰影 ──
    float hatchStrength = hatch * 1.0;
    result = mix(result, inkColor, hatchStrength);

    // ── 建築補助線（薄い水平/垂直のコンストラクションライン） ──
    float constructH = smoothstep(1.2, 0.0, abs(fract(uv.y * resolution.y * 0.008) - 0.5) * 2.0 * resolution.y * 0.008);
    float constructV = smoothstep(1.2, 0.0, abs(fract(uv.x * resolution.x * 0.008) - 0.5) * 2.0 * resolution.x * 0.008);
    float constructLines = max(constructH, constructV) * 0.08 * (1.0 - bgMask);
    result = mix(result, inkColor * 0.6, constructLines);

    // ── エッジ（太くはっきり、コントラスト強） ──
    // シルエット（太い線 4-5px）
    float silEdge = silhouetteIntensity * edgeFade * pencilMod;
    result = mix(result, inkColor * 0.92, silEdge * 1.0);
    // クリース（中太）
    float crEdge = creaseIntensity * edgeFade * pencilMod * 0.75;
    result = mix(result, inkColor, crEdge * 0.85);
    // マテリアル（細い）
    float mtEdge = matIntensity * edgeFade * pencilMod * 0.55;
    result = mix(result, inkColor * 1.1, mtEdge * 0.50);

    // ── AO密度（隅/窪みで追加の暗さ） ──
    result = mix(result, inkColor * 0.7, ao * 0.18 * (1.0 - bgMask));

    // ── 方向性シャドウで立体感 ──
    result = mix(result, inkColor * 0.75, directionalShadow * 0.5);

    // 背景は紙色
    result = mix(result, paper, bgMask * 0.92);

    // ── 改善セピアトーン（温かみ＋影に青味） ──
    result = toSepiaEnhanced(result, sepiaAmount, darkness);
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
