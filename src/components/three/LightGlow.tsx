'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard } from '@react-three/drei';

// --- 日本語コメント ---
// ポイントライトやペンダントライト周りのグロー/フレア効果
// Billboard + 透過スプライトでカメラ追従するグロー表現
// Canvas API でラジアルグラデーションテクスチャを動的生成（外部画像不要）
// Additive ブレンディングで光の加算合成を実現

interface LightGlowProps {
  /** グローの中心位置 */
  position?: [number, number, number];
  /** グローの色 */
  color?: string;
  /** 光の強度 (0-10) — サイズにも影響 */
  intensity?: number;
  /** グローの基本サイズ */
  size?: number;
  /** 表示/非表示 */
  visible?: boolean;
}

/** グローテクスチャのキャンバスサイズ */
const GLOW_TEXTURE_SIZE = 128;

/**
 * Canvas API でラジアルグラデーションのグローテクスチャを生成
 * モジュールスコープで1回だけ生成し、全インスタンスで共有
 */
export function generateGlowTexture(size: number = GLOW_TEXTURE_SIZE): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // フォールバック: 空のテクスチャ
    return new THREE.CanvasTexture(canvas);
  }

  const center = size / 2;

  // 中心から外周へ向かうラジアルグラデーション
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

  // 中心: 明るい白（光源コア）
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  // 内側: やや減衰
  gradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.8)');
  // 中間: 大きく減衰
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.3)');
  // 外側: ほぼ透明
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.08)');
  // エッジ: 完全透明
  gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  return texture;
}

/** グローテクスチャ (遅延初期化 — SSR対応) */
let glowTextureCache: THREE.CanvasTexture | null = null;

function getGlowTexture(): THREE.CanvasTexture {
  if (!glowTextureCache) {
    glowTextureCache = generateGlowTexture();
  }
  return glowTextureCache;
}

/**
 * ライトグローエフェクトコンポーネント
 * ポイントライトやペンダントライトの周りにグロー効果を追加
 *
 * 使用例:
 * <LightGlow position={[0, 2.5, 0]} color="#FFE4C0" intensity={1.5} size={0.8} />
 */
export const LightGlow = React.memo(function LightGlow({
  position = [0, 0, 0],
  color = '#FFFFFF',
  intensity = 1.0,
  size = 0.5,
  visible = true,
}: LightGlowProps) {
  // 強度に応じたスケール計算（光が強いほどグローが大きい）
  const scale = useMemo(() => {
    const intensityScale = 0.5 + Math.sqrt(intensity) * 0.5;
    const finalSize = size * intensityScale;
    return [finalSize, finalSize, 1] as [number, number, number];
  }, [intensity, size]);

  // マテリアルプロパティをメモ化
  const materialProps = useMemo(() => {
    const texture = getGlowTexture();
    return {
      map: texture,
      color: new THREE.Color(color),
      transparent: true as const,
      opacity: Math.min(intensity * 0.6, 1.0),
      blending: THREE.AdditiveBlending,
      depthWrite: false as const,
      depthTest: true as const,
      side: THREE.DoubleSide,
      toneMapped: false as const,
    };
  }, [color, intensity]);

  if (!visible) return null;

  return (
    <Billboard
      position={position}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
    >
      <mesh scale={scale}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial {...materialProps} />
      </mesh>
    </Billboard>
  );
});

LightGlow.displayName = 'LightGlow';
