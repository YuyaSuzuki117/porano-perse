'use client';

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────

/** パーティクルタイプ */
type ParticleType = 'smoke' | 'steam' | 'aroma';

interface SmokeParticlesProps {
  /** 発生源の位置 */
  position: [number, number, number];
  /** パーティクルタイプ（煙・蒸気・アロマ） */
  type: ParticleType;
  /** 強度（0.0〜1.0） */
  intensity: number;
  /** 有効フラグ */
  enabled: boolean;
}

// ────────────────────────────────────────────────
// タイプ別パラメータ定義（コンポーネント外で定義 — 再生成防止）
// ────────────────────────────────────────────────

interface ParticleConfig {
  count: number;         // パーティクル数
  color: THREE.Color;    // 色
  riseSpeed: number;     // 上昇速度
  spreadRadius: number;  // 水平拡散半径
  maxHeight: number;     // 最大上昇高さ
  fadeRate: number;       // 透明度減衰速度（高い=早く消える）
  wobbleFreq: number;    // 揺れの周波数
  wobbleAmp: number;     // 揺れの振幅
  baseSize: number;      // パーティクルの基本サイズ
  baseOpacity: number;   // 初期透明度
}

const PARTICLE_CONFIGS: Record<ParticleType, ParticleConfig> = {
  smoke: {
    count: 50,
    color: new THREE.Color(0.5, 0.5, 0.52),      // 灰色
    riseSpeed: 0.008,                               // ゆっくり上昇
    spreadRadius: 0.15,                              // 広い拡散
    maxHeight: 1.8,
    fadeRate: 0.4,
    wobbleFreq: 0.8,
    wobbleAmp: 0.06,
    baseSize: 0.06,
    baseOpacity: 0.35,
  },
  steam: {
    count: 30,
    color: new THREE.Color(0.92, 0.92, 0.95),     // 白
    riseSpeed: 0.02,                                 // 速い上昇
    spreadRadius: 0.06,                              // 狭い柱状
    maxHeight: 1.2,
    fadeRate: 0.8,                                   // すぐ消える
    wobbleFreq: 1.5,
    wobbleAmp: 0.02,
    baseSize: 0.04,
    baseOpacity: 0.5,
  },
  aroma: {
    count: 20,
    color: new THREE.Color(0.65, 0.5, 0.35),      // 温かい茶色
    riseSpeed: 0.005,                                // 非常にゆっくり
    spreadRadius: 0.1,
    maxHeight: 0.8,
    fadeRate: 0.6,
    wobbleFreq: 0.5,                                 // ゆるやかな波
    wobbleAmp: 0.1,                                  // 大きい波形（うねるパス）
    baseSize: 0.035,
    baseOpacity: 0.2,                                // 非常に控えめ
  },
};

/** 最大パーティクル数（プリアロケート用） */
const MAX_PARTICLES = 50;

// パーティクル毎のランダム位相・速度オフセット（プリアロケート）
const particlePhases = new Float32Array(MAX_PARTICLES);
const particleSpeedOffsets = new Float32Array(MAX_PARTICLES);
const particleRadiusOffsets = new Float32Array(MAX_PARTICLES);
for (let i = 0; i < MAX_PARTICLES; i++) {
  particlePhases[i] = Math.random() * Math.PI * 2;
  particleSpeedOffsets[i] = 0.7 + Math.random() * 0.6;
  particleRadiusOffsets[i] = Math.random();
}

// ────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────

export const SmokeParticles = React.memo(function SmokeParticles({
  position,
  type,
  intensity,
  enabled,
}: SmokeParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const config = PARTICLE_CONFIGS[type];
  const count = config.count;

  // 初期パーティクル位置（ランダムな高さから開始、自然な分布に）
  const initialPositions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const angle = particlePhases[i];
      const radius = particleRadiusOffsets[i] * config.spreadRadius;
      pos[i3] = Math.cos(angle) * radius;        // x（ローカル座標）
      pos[i3 + 1] = Math.random() * config.maxHeight; // y（ランダム初期高さ）
      pos[i3 + 2] = Math.sin(angle) * radius;    // z
    }
    return pos;
  }, [count, config.spreadRadius, config.maxHeight]);

  // バッファジオメトリ
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(initialPositions, 3));

    // 透明度属性（useFrameで更新）
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const heightRatio = initialPositions[i * 3 + 1] / config.maxHeight;
      opacities[i] = config.baseOpacity * (1.0 - heightRatio * config.fadeRate);
    }
    geo.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

    return geo;
  }, [initialPositions, count, config.maxHeight, config.baseOpacity, config.fadeRate]);

  // シェーダーマテリアル（サイズ減衰 + 透明度個別制御）
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: config.color },
        uSize: { value: config.baseSize },
        uIntensity: { value: intensity },
      },
      vertexShader: `
        attribute float opacity;
        varying float vOpacity;
        uniform float uSize;
        uniform float uIntensity;
        void main() {
          vOpacity = opacity * uIntensity;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (200.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vOpacity;
        void main() {
          // 丸いソフトパーティクル（ガウシアンフォールオフ）
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = vOpacity * exp(-dist * dist * 8.0);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
  }, [config.color, config.baseSize, intensity]);

  // フレーム毎のアニメーション
  useFrame((_, delta) => {
    if (!pointsRef.current || !enabled) return;

    timeRef.current += delta;
    const time = timeRef.current;

    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const opAttr = pointsRef.current.geometry.getAttribute('opacity') as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const opArray = opAttr.array as Float32Array;

    // intensity uniformを更新
    const mat = pointsRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.uIntensity.value = intensity;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const phase = particlePhases[i];
      const speedMul = particleSpeedOffsets[i];

      // 上昇（タイプ別速度 × 個体差）
      posArray[i3 + 1] += config.riseSpeed * speedMul;

      // XZ方向のサイン揺れ（smokeは広い揺れ、steamは狭い揺れ、aromaは波状パス）
      const wobbleX = Math.sin(time * config.wobbleFreq + phase) * config.wobbleAmp * delta;
      const wobbleZ = Math.cos(time * config.wobbleFreq * 0.7 + phase + 2.0) * config.wobbleAmp * delta;
      posArray[i3] += wobbleX;
      posArray[i3 + 2] += wobbleZ;

      // 高さに応じた透明度減衰
      const currentHeight = posArray[i3 + 1];
      const heightRatio = currentHeight / config.maxHeight;
      opArray[i] = config.baseOpacity * Math.max(0, 1.0 - heightRatio * config.fadeRate) * intensity;

      // 最大高さ超過 → 発生源にリセット
      if (currentHeight >= config.maxHeight) {
        const angle = phase + time * 0.3;
        const radius = particleRadiusOffsets[i] * config.spreadRadius;
        posArray[i3] = Math.cos(angle) * radius;
        posArray[i3 + 1] = 0;
        posArray[i3 + 2] = Math.sin(angle) * radius;
        opArray[i] = config.baseOpacity * intensity;
      }
    }

    posAttr.needsUpdate = true;
    opAttr.needsUpdate = true;
  });

  if (!enabled) return null;

  return (
    <points
      ref={pointsRef}
      position={position}
      geometry={geometry}
      material={material}
      frustumCulled={false}
    />
  );
});

SmokeParticles.displayName = 'SmokeParticles';
