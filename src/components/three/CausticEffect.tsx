'use client';

// --- 日本語コメント ---
// 光のコースティクスエフェクト: 窓から差し込む光が床面に波紋状の干渉パターンを投影
// 複数方向の正弦波を重ね合わせて水面を通過した光のような模様を生成
// AdditiveBlendingで床面に加算合成、useFrameでUVオフセットをゆっくりアニメーション
// qualityLevel === 'low' 時は描画をスキップ（パフォーマンス配慮）

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Opening, WallSegment } from '@/types/floor-plan';
import { useCameraStore } from '@/stores/useCameraStore';
import { wallAngle } from '@/lib/geometry';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CausticEffectProps {
  openings: Opening[];
  walls: WallSegment[];
  intensity: number;  // 0-1
  enabled: boolean;
}

/** 個別コースティクスパッチのデータ */
interface CausticPatch {
  position: THREE.Vector3;
  rotation: number; // Y軸回転
  width: number;
  depth: number;
}

// ---------------------------------------------------------------------------
// 定数・コンポーネント外の生成物（再生成防止）
// ---------------------------------------------------------------------------

/** コースティクステクスチャサイズ */
const CAUSTIC_TEX_SIZE = 256;

/** UVオフセット用の一時Vector2（useFrame内でnew防止） */
const _uvOffset = new THREE.Vector2(0, 0);

// ---------------------------------------------------------------------------
// コースティクステクスチャ生成（干渉パターン）
// ---------------------------------------------------------------------------

/** テクスチャキャッシュ */
let causticTextureCache: HTMLCanvasElement | null = null;

/**
 * 複数方向の正弦波を重ね合わせた干渉パターンを生成
 * 水面コースティクスのような明暗の波紋模様
 */
function generateCausticPattern(): HTMLCanvasElement {
  if (causticTextureCache) return causticTextureCache;

  const size = CAUSTIC_TEX_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  // 干渉波のパラメータ（異なる角度・周波数の波を重ねる）
  const waves = [
    { angle: 0, freq: 4, amp: 0.3 },
    { angle: Math.PI * 0.33, freq: 5.7, amp: 0.25 },
    { angle: Math.PI * 0.67, freq: 3.3, amp: 0.2 },
    { angle: Math.PI * 0.15, freq: 7.1, amp: 0.15 },
    { angle: Math.PI * 0.85, freq: 6.3, amp: 0.1 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 正規化座標 (0-1)
      const u = x / size;
      const v = y / size;

      // 各波の合成
      let value = 0;
      for (const wave of waves) {
        const cosA = Math.cos(wave.angle);
        const sinA = Math.sin(wave.angle);
        // 波の方向に沿った座標
        const projected = u * cosA + v * sinA;
        // 正弦波（位相をずらして干渉効果）
        value += Math.sin(projected * Math.PI * 2 * wave.freq) * wave.amp;
      }

      // コースティクスの明るい集光部分を強調（二乗で鋭いピーク）
      const normalized = (value + 1) * 0.5; // 0-1
      const caustic = Math.pow(normalized, 2.5);

      // 白色のコースティクス（アルファで強度制御）
      const brightness = Math.min(255, Math.round(caustic * 255));
      const idx = (y * size + x) * 4;
      data[idx] = brightness;
      data[idx + 1] = brightness;
      data[idx + 2] = Math.min(255, Math.round(brightness * 1.1)); // やや青白い光
      data[idx + 3] = brightness; // アルファもコースティクス強度に連動
    }
  }

  ctx.putImageData(imageData, 0, 0);
  causticTextureCache = canvas;
  return canvas;
}

// ---------------------------------------------------------------------------
// props比較関数
// ---------------------------------------------------------------------------

function causticPropsAreEqual(prev: CausticEffectProps, next: CausticEffectProps): boolean {
  if (prev.enabled !== next.enabled) return false;
  if (prev.intensity !== next.intensity) return false;
  if (prev.openings.length !== next.openings.length) return false;
  if (prev.walls.length !== next.walls.length) return false;
  return true;
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

/**
 * コースティクスエフェクト
 *
 * 窓の開口部ごとに床面にコースティクス模様を投影。
 * 加算合成の半透明プレーンをゆっくりアニメーションさせて
 * 水面を通過した光のゆらぎを表現する。
 */
export const CausticEffect = React.memo(function CausticEffect({
  openings,
  walls,
  intensity,
  enabled,
}: CausticEffectProps) {
  const qualityLevel = useCameraStore((s) => s.qualityLevel);

  // 低品質モードまたは無効時は描画しない
  if (!enabled || qualityLevel === 'low') return null;

  // 壁マップ構築
  const wallMap = useMemo(() => {
    const map = new Map<string, WallSegment>();
    for (const w of walls) map.set(w.id, w);
    return map;
  }, [walls]);

  // 窓開口のみフィルタ
  const windowOpenings = useMemo(() => {
    return openings.filter((o) => o.type === 'window');
  }, [openings]);

  // コースティクスパッチの位置・サイズ算出
  const patches = useMemo((): CausticPatch[] => {
    return windowOpenings.map((opening) => {
      const wall = wallMap.get(opening.wallId);
      if (!wall) return null;

      const angle = wallAngle(wall);
      const wallLen = Math.sqrt(
        (wall.end.x - wall.start.x) ** 2 + (wall.end.y - wall.start.y) ** 2,
      );

      // 壁に沿った窓の中心位置
      const t = (opening.positionAlongWall + opening.width / 2) / wallLen;
      const wx = wall.start.x + (wall.end.x - wall.start.x) * t;
      const wy = wall.start.y + (wall.end.y - wall.start.y) * t;

      // 壁の法線方向に少しオフセット（室内側に投影）
      const normalX = -Math.sin(angle);
      const normalY = Math.cos(angle);
      const projectionDist = opening.width * 0.8; // 窓幅に比例した投影距離

      return {
        position: new THREE.Vector3(
          wx + normalX * projectionDist * 0.5,
          0.02, // 床面すれすれ（z-fighting防止）
          wy + normalY * projectionDist * 0.5,
        ),
        rotation: angle,
        width: opening.width * 1.2,
        depth: projectionDist,
      };
    }).filter((p): p is CausticPatch => p !== null);
  }, [windowOpenings, wallMap]);

  // テクスチャ生成
  const causticTexture = useMemo(() => {
    const canvas = generateCausticPattern();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  if (patches.length === 0) return null;

  return (
    <group>
      {patches.map((patch, i) => (
        <CausticPatchMesh
          key={i}
          patch={patch}
          texture={causticTexture}
          intensity={intensity}
        />
      ))}
    </group>
  );
}, causticPropsAreEqual);

// ---------------------------------------------------------------------------
// 個別パッチメッシュ（useFrame使用のため分離）
// ---------------------------------------------------------------------------

interface CausticPatchMeshProps {
  patch: CausticPatch;
  texture: THREE.CanvasTexture;
  intensity: number;
}

/** 個別コースティクスパッチのメッシュ */
function CausticPatchMesh({ patch, texture, intensity }: CausticPatchMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // UVオフセットのアニメーション（ゆっくり流れる光の揺らぎ）
  useFrame((_, delta) => {
    if (!materialRef.current) return;
    const map = materialRef.current.map;
    if (!map) return;

    // ゆっくりUVをスクロール（毎秒0.02単位）
    map.offset.x += delta * 0.02;
    map.offset.y += delta * 0.015;
  });

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(patch.width, patch.depth);
  }, [patch.width, patch.depth]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={patch.position}
      rotation={[-Math.PI / 2, 0, patch.rotation]}
    >
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        blending={THREE.AdditiveBlending}
        opacity={intensity * 0.4}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
