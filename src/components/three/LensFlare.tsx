'use client';

// --- 日本語コメント ---
// スプライトベースのレンズフレアエフェクト
// ペンダントライトや窓の強い光源に対してカメラ追従するフレアを表示
// Canvas API でラジアルグラデーション+3リングのプロシージャルテクスチャを動的生成
// メインフレア + 2つのゴーストフレア（スクリーン中心軸にオフセット）

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

interface LensFlareProps {
  position: [number, number, number];
  color?: string;
  intensity?: number; // 0-1
  size?: number; // world units, default 0.3
}

/** テクスチャのキャンバスサイズ */
const FLARE_TEXTURE_SIZE = 256;

/** ゴーストフレアの設定: スクリーン中心からのオフセット比率とスケール */
const GHOST_CONFIGS: ReadonlyArray<{ offsetRatio: number; scaleFactor: number; opacityFactor: number }> = [
  { offsetRatio: 0.4, scaleFactor: 0.5, opacityFactor: 0.3 },
  { offsetRatio: 0.7, scaleFactor: 0.3, opacityFactor: 0.15 },
] as const;

/** パルスアニメーションの周波数 (Hz) */
const PULSE_FREQUENCY = 0.5;

/** パルスの振幅 (±10%) */
const PULSE_AMPLITUDE = 0.1;

// ---------------------------------------------------------------------------
// プロシージャルテクスチャ生成（モジュールスコープキャッシュ）
// ---------------------------------------------------------------------------

let flareTextureCache: THREE.CanvasTexture | null = null;

/**
 * Canvas API で3リング構造のフレアテクスチャを生成
 * - 中心: 明るい白コア
 * - リング1: 内側ソフトグロー
 * - リング2: 中間リング（やや強調）
 * - リング3: 外側フェードアウト
 */
function generateFlareTexture(): THREE.CanvasTexture {
  if (flareTextureCache) return flareTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = FLARE_TEXTURE_SIZE;
  canvas.height = FLARE_TEXTURE_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    flareTextureCache = new THREE.CanvasTexture(canvas);
    return flareTextureCache;
  }

  const center = FLARE_TEXTURE_SIZE / 2;
  const radius = center;

  // ベースのラジアルグラデーション
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);

  // 明るいコア
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.05, 'rgba(255, 255, 255, 0.9)');
  // リング1: 内側ソフトグロー
  gradient.addColorStop(0.12, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.15)');
  // リング2: 中間リング（やや強調）
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)');
  gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.15)');
  gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.05)');
  // リング3: 外側フェード
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.03)');
  gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FLARE_TEXTURE_SIZE, FLARE_TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  flareTextureCache = texture;

  return texture;
}

// ---------------------------------------------------------------------------
// useFrame用の一時変数（GC回避）
// ---------------------------------------------------------------------------

const _worldPos = new THREE.Vector3();
const _screenPos = new THREE.Vector3();
const _screenCenter = new THREE.Vector2(0, 0);
const _toCenter = new THREE.Vector2();

/**
 * スプライトベースのレンズフレアエフェクト
 *
 * 光源位置にメインフレアスプライト、スクリーン中心軸上にゴーストフレアを2つ配置。
 * スケールがパルスアニメーションで微細に振動し、自然な光の揺らぎを表現。
 */
export const LensFlare = React.memo(function LensFlare({
  position,
  color = '#FFFFFF',
  intensity = 0.8,
  size = 0.3,
}: LensFlareProps) {
  const mainSpriteRef = useRef<THREE.Sprite>(null);
  const ghost0Ref = useRef<THREE.Sprite>(null);
  const ghost1Ref = useRef<THREE.Sprite>(null);
  const { camera } = useThree();

  // メインフレアのマテリアル
  const mainMaterial = useMemo(() => {
    const texture = generateFlareTexture();
    return new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color(color),
      transparent: true,
      opacity: Math.min(intensity, 1.0),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
  }, [color, intensity]);

  // ゴーストフレアのマテリアル（色を少し変えて多様性を出す）
  const ghostMaterials = useMemo(() => {
    const texture = generateFlareTexture();
    const baseColor = new THREE.Color(color);

    return GHOST_CONFIGS.map((config) => {
      const ghostColor = baseColor.clone().offsetHSL(0, -0.1, 0.05);
      return new THREE.SpriteMaterial({
        map: texture,
        color: ghostColor,
        transparent: true,
        opacity: Math.min(intensity * config.opacityFactor, 1.0),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      });
    });
  }, [color, intensity]);

  // パルスアニメーション + ゴーストフレア位置更新
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const pulse = 1.0 + Math.sin(time * Math.PI * 2 * PULSE_FREQUENCY) * PULSE_AMPLITUDE;
    const mainScale = size * pulse;

    // メインスプライトのスケール更新
    if (mainSpriteRef.current) {
      mainSpriteRef.current.scale.set(mainScale, mainScale, 1);
    }

    // ゴーストフレアの位置計算: 光源のスクリーン座標→中心への方向に沿って配置
    _worldPos.set(position[0], position[1], position[2]);
    _screenPos.copy(_worldPos).project(camera);

    _toCenter.set(
      _screenCenter.x - _screenPos.x,
      _screenCenter.y - _screenPos.y,
    );

    const ghostRefs = [ghost0Ref, ghost1Ref];
    for (let i = 0; i < GHOST_CONFIGS.length; i++) {
      const ghostRef = ghostRefs[i];
      const config = GHOST_CONFIGS[i];
      if (!ghostRef?.current || !config) continue;

      // スクリーン空間でオフセット計算し、ワールド空間に逆投影
      const ghostScreenX = _screenPos.x + _toCenter.x * config.offsetRatio;
      const ghostScreenY = _screenPos.y + _toCenter.y * config.offsetRatio;

      const ghostWorldPos = new THREE.Vector3(ghostScreenX, ghostScreenY, _screenPos.z)
        .unproject(camera);

      ghostRef.current.position.copy(ghostWorldPos);

      const ghostScale = size * config.scaleFactor * pulse;
      ghostRef.current.scale.set(ghostScale, ghostScale, 1);
    }
  });

  return (
    <group>
      {/* メインフレア */}
      <sprite
        ref={mainSpriteRef}
        position={position}
        material={mainMaterial}
        scale={[size, size, 1]}
        renderOrder={1000}
      />
      {/* ゴーストフレア 0 */}
      <sprite
        ref={ghost0Ref}
        material={ghostMaterials[0]}
        scale={[size * GHOST_CONFIGS[0].scaleFactor, size * GHOST_CONFIGS[0].scaleFactor, 1]}
        renderOrder={1000}
      />
      {/* ゴーストフレア 1 */}
      <sprite
        ref={ghost1Ref}
        material={ghostMaterials[1]}
        scale={[size * GHOST_CONFIGS[1].scaleFactor, size * GHOST_CONFIGS[1].scaleFactor, 1]}
        renderOrder={1000}
      />
    </group>
  );
});

LensFlare.displayName = 'LensFlare';
