'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

// --- 日本語コメント ---
// 天井埋め込みダウンライト（リセスドライト）コンポーネント
// テーパード円筒ハウジング + クロームトリムリング + LED面 + フロストディフューザー
// 品質レベルに応じてセグメント数・影の有無を調整

interface RecessedLightProps {
  position: [number, number, number];
  color?: string;
  intensity?: number;
  size?: number;        // 開口半径 (デフォルト 0.06m)
  housingDepth?: number; // 天井への埋め込み深さ (デフォルト 0.05m)
  qualityLevel: 'high' | 'medium' | 'low';
  castShadow?: boolean;
}

// --- ジオメトリキャッシュ（モジュールスコープ） ---
// 品質レベル別のセグメント数でキャッシュ
const geometryCache = new Map<string, {
  housing: THREE.CylinderGeometry;
  trimRing: THREE.TorusGeometry;
  ledSurface: THREE.CircleGeometry;
  diffuser: THREE.CircleGeometry;
}>();

/** セグメント数を品質レベルから決定 */
function getSegments(qualityLevel: 'high' | 'medium' | 'low'): number {
  switch (qualityLevel) {
    case 'high': return 32;
    case 'medium': return 16;
    case 'low': return 8;
  }
}

/** キャッシュキー生成 */
function getCacheKey(
  size: number,
  housingDepth: number,
  qualityLevel: 'high' | 'medium' | 'low'
): string {
  return `${size.toFixed(4)}_${housingDepth.toFixed(4)}_${qualityLevel}`;
}

/** キャッシュ済みジオメトリを取得（なければ生成） */
function getCachedGeometries(
  size: number,
  housingDepth: number,
  qualityLevel: 'high' | 'medium' | 'low'
) {
  const key = getCacheKey(size, housingDepth, qualityLevel);
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const segments = getSegments(qualityLevel);
  const closedEndRadius = size * 0.7;

  // ハウジング: テーパード円筒（開口側が広く、奥が狭い）
  // radiusTop=閉じた奥側, radiusBottom=開口側
  const housing = new THREE.CylinderGeometry(
    closedEndRadius,  // 奥（天井内側）
    size,             // 開口（天井面）
    housingDepth,
    segments,
    1,
    true              // open-ended（両端面なし）
  );

  // トリムリング: 開口部を囲むクロームリング
  const trimRing = new THREE.TorusGeometry(
    size,    // リング半径
    0.004,   // チューブ半径
    qualityLevel === 'low' ? 4 : 8,  // チューブセグメント
    segments
  );

  // LED発光面: ハウジング奥面
  const ledSurface = new THREE.CircleGeometry(
    closedEndRadius * 0.9,
    segments
  );

  // フロストディフューザー: 開口面のすりガラス
  const diffuser = new THREE.CircleGeometry(
    size * 0.95,
    segments
  );

  const geos = { housing, trimRing, ledSurface, diffuser };
  geometryCache.set(key, geos);
  return geos;
}

export const RecessedLight = React.memo(function RecessedLight({
  position,
  color = '#FFF5E6',
  intensity = 1.0,
  size = 0.06,
  housingDepth = 0.05,
  qualityLevel,
  castShadow: castShadowProp = false,
}: RecessedLightProps) {
  // ジオメトリ取得（キャッシュ）
  const geometries = useMemo(
    () => getCachedGeometries(size, housingDepth, qualityLevel),
    [size, housingDepth, qualityLevel]
  );

  // ハウジング内面マテリアル（白いリフレクター）
  const housingMaterialProps = useMemo(() => ({
    color: '#F0F0F0',
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.BackSide as THREE.Side,
  }), []);

  // トリムリングマテリアル（クローム/ブラッシュドメタル）
  const trimMaterialProps = useMemo(() => ({
    color: '#E8E8E8',
    roughness: 0.15,
    metalness: 0.9,
  }), []);

  // LED面マテリアル（発光）
  const ledMaterialProps = useMemo(() => ({
    color: color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 2.0 * intensity,
    roughness: 0.2,
    metalness: 0.0,
    toneMapped: false,
  }), [color, intensity]);

  // ディフューザーマテリアル（すりガラス風）
  const diffuserMaterialProps = useMemo(() => ({
    color: '#FFFFFF',
    transparent: true,
    transmission: 0.7,
    roughness: 0.6,
    opacity: 0.8,
    thickness: 0.003,
    ior: 1.4,
    depthWrite: false,
  }), []);

  // ポイントライト影設定
  const enableShadow = castShadowProp && qualityLevel === 'high';

  // 各パーツの相対位置（position基準、下向き設置）
  // position = 天井面の穴の中心
  // ハウジングは天井面から上（Y+）方向に埋まる
  const housingY = housingDepth / 2;
  const ledY = housingDepth;         // ハウジング奥面
  const diffuserY = -0.002;          // トリムリングよりわずかに内側
  const lightY = -0.01;              // 天井面から少し下

  return (
    <group position={position}>
      {/* ハウジング（テーパード円筒、内面レンダリング） */}
      <mesh
        geometry={geometries.housing}
        position={[0, housingY, 0]}
        receiveShadow
      >
        <meshStandardMaterial {...housingMaterialProps} />
      </mesh>

      {/* トリムリング（開口部） */}
      <mesh
        geometry={geometries.trimRing}
        position={[0, 0, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial {...trimMaterialProps} />
      </mesh>

      {/* LED発光面（ハウジング奥） */}
      <mesh
        geometry={geometries.ledSurface}
        position={[0, ledY, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial {...ledMaterialProps} />
      </mesh>

      {/* フロストディフューザー（開口面すりガラス） */}
      <mesh
        geometry={geometries.diffuser}
        position={[0, diffuserY, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshPhysicalMaterial {...diffuserMaterialProps} />
      </mesh>

      {/* ポイントライト（照明効果） */}
      <pointLight
        position={[0, lightY, 0]}
        color={color}
        intensity={intensity * 0.3}
        distance={4.0}
        decay={2}
        castShadow={enableShadow}
        shadow-mapSize-width={enableShadow ? 512 : undefined}
        shadow-mapSize-height={enableShadow ? 512 : undefined}
      />
    </group>
  );
});

RecessedLight.displayName = 'RecessedLight';
