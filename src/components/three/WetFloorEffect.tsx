'use client';

// --- 日本語コメント ---
// 濡れた床エフェクト: 反射性のある透明オーバーレイで床面にウェット感を演出
// meshPhysicalMaterial による物理ベースの反射+透過表現
// wetness パラメータで乾燥(0)→水たまり(1)を連続制御
// 高wetness時はCanvas APIで水たまりノーマルマップをプロシージャル生成

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';

interface WetFloorEffectProps {
  walls: WallSegment[];
  wetness: number; // 0-1, 0=dry, 1=puddles
  enabled?: boolean;
}

/** 水たまりノーマルマップのキャンバスサイズ */
const PUDDLE_MAP_SIZE = 512;

/** 水たまりの乱数シード用定数（再生成のたびに異なるパターンを防止） */
const PUDDLE_SEED_CIRCLES = 30;

/** ノーマルマップテクスチャキャッシュ */
let puddleNormalMapCache: THREE.CanvasTexture | null = null;

/**
 * Canvas API で水たまりノーマルマップを生成
 * ランダムな円形の凹みパターンで水面の歪みを表現
 * RGB=(0.5, 0.5, 1.0) をフラット法線とし、円形部分に微小な傾斜を加える
 */
function generatePuddleNormalMap(): THREE.CanvasTexture {
  if (puddleNormalMapCache) return puddleNormalMapCache;

  const canvas = document.createElement('canvas');
  canvas.width = PUDDLE_MAP_SIZE;
  canvas.height = PUDDLE_MAP_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    puddleNormalMapCache = new THREE.CanvasTexture(canvas);
    return puddleNormalMapCache;
  }

  // フラット法線で塗りつぶし: (0.5, 0.5, 1.0) → RGB(128, 128, 255)
  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, PUDDLE_MAP_SIZE, PUDDLE_MAP_SIZE);

  // 疑似乱数生成（決定論的）
  const seededRandom = (seed: number): number => {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  // ランダムな円形水たまり
  for (let i = 0; i < PUDDLE_SEED_CIRCLES; i++) {
    const cx = seededRandom(i * 3 + 0.1) * PUDDLE_MAP_SIZE;
    const cy = seededRandom(i * 3 + 0.2) * PUDDLE_MAP_SIZE;
    const radius = 15 + seededRandom(i * 3 + 0.3) * 50;

    // 水たまり部分: 法線を微妙にずらす（中心に向かって傾斜）
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    // 中心: フラット法線のまま（水面は平ら）
    gradient.addColorStop(0.0, 'rgba(128, 128, 255, 0.8)');
    // 端: 法線をやや傾ける（水たまりのエッジ）
    gradient.addColorStop(0.7, 'rgba(140, 140, 245, 0.4)');
    gradient.addColorStop(1.0, 'rgba(128, 128, 255, 0.0)');

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 微細なノイズを追加（水面の細かい歪み）
  const imageData = ctx.getImageData(0, 0, PUDDLE_MAP_SIZE, PUDDLE_MAP_SIZE);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (seededRandom(i * 0.001) - 0.5) * 6;
    data[i] = Math.max(0, Math.min(255, data[i]! + noise));     // R
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! + noise)); // G
    // B (Z法線) はそのまま
  }
  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;

  puddleNormalMapCache = texture;
  return texture;
}

/**
 * 壁データから床の境界ボックスを計算
 * @returns [幅, 奥行, 中心X, 中心Z]
 */
function computeFloorBounds(walls: WallSegment[]): [number, number, number, number] {
  if (walls.length === 0) return [4, 4, 0, 0];

  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const zs = walls.flatMap((w) => [w.start.y, w.end.y]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  return [width, depth, centerX, centerZ];
}

/** props比較 */
function wetFloorPropsAreEqual(prev: WetFloorEffectProps, next: WetFloorEffectProps): boolean {
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.wetness !== next.wetness) return false;
  if (prev.enabled !== next.enabled) return false;
  return true;
}

/**
 * 濡れた床オーバーレイエフェクト
 *
 * 床面のすぐ上(y=0.002)に透明なmeshPhysicalMaterialプレーンを配置し、
 * wetnessに応じた反射・透過・ノーマルマップで濡れた質感を表現。
 *
 * - wetness=0: 完全に透明（乾燥）
 * - wetness=0.5: 軽い反射、ノーマルマップ有効化
 * - wetness=1.0: 強い鏡面反射、水たまり表現
 */
export const WetFloorEffect = React.memo(function WetFloorEffect({
  walls,
  wetness,
  enabled = true,
}: WetFloorEffectProps) {
  // 床の範囲を壁データから計算
  const [floorWidth, floorDepth, centerX, centerZ] = useMemo(
    () => computeFloorBounds(walls),
    [walls],
  );

  // マテリアルプロパティの計算
  const materialProps = useMemo(() => {
    const usePuddleMap = wetness > 0.5;
    const normalMap = usePuddleMap ? generatePuddleNormalMap() : null;

    return {
      roughness: 0.05 * (1 - wetness),
      metalness: 0.1,
      envMapIntensity: 3.0 + wetness * 2.0,
      transmission: 0.1,
      transparent: true as const,
      opacity: wetness * 0.3,
      color: new THREE.Color('#8899aa'),
      normalMap,
      normalScale: usePuddleMap ? new THREE.Vector2(0.3, 0.3) : undefined,
      depthWrite: false as const,
      side: THREE.DoubleSide,
    };
  }, [wetness]);

  // 無効時または完全乾燥時はレンダリングしない（hooksの後）
  if (!enabled || wetness <= 0) return null;

  return (
    <mesh
      position={[centerX, 0.002, centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={50}
    >
      <planeGeometry args={[floorWidth, floorDepth]} />
      <meshPhysicalMaterial {...materialProps} />
    </mesh>
  );
}, wetFloorPropsAreEqual);

WetFloorEffect.displayName = 'WetFloorEffect';
