'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment, Opening } from '@/types/floor-plan';
import { wallLength, wallAngle } from '@/lib/geometry';

/** 温度状態による結露パターン */
type TemperatureMode = 'warm' | 'cold' | 'frost';

interface GlassCondensationProps {
  /** 壁セグメントリスト */
  walls: WallSegment[];
  /** 開口部リスト */
  openings: Opening[];
  /** 部屋の天井高 */
  roomHeight: number;
  /** 温度状態（結露パターンを決定） */
  temperature: TemperatureMode;
  /** エフェクトの有効/無効 */
  enabled: boolean;
}

/** 結露パネルの配置情報 */
interface CondensationPlacement {
  /** ワールド座標上の位置 */
  position: THREE.Vector3;
  /** Y軸回転 */
  rotationY: number;
  /** パネル幅（開口部幅に基づく） */
  width: number;
  /** パネル高さ（開口部高さに基づく） */
  height: number;
}

/** 擬似乱数シード生成（水滴配置の再現性のため） */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 暖かい状態の水滴テクスチャを生成
 * 細かいランダム水滴を薄い透明度で描画
 */
function generateWarmDroplets(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = seededRandom(123);
  const dropletCount = 80;

  for (let i = 0; i < dropletCount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const radius = rand() * 4 + 1;
    const alpha = rand() * 0.15 + 0.05;

    // 水滴本体
    ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 水滴のハイライト（光の反射）
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 冷たい状態の水滴+筋テクスチャを生成
 * 密度の高い水滴に加え、重力方向の水筋を描画
 */
function generateColdDroplets(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = seededRandom(456);

  // 密な水滴
  const dropletCount = 200;
  for (let i = 0; i < dropletCount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const radius = rand() * 5 + 1.5;
    const alpha = rand() * 0.25 + 0.1;

    ctx.fillStyle = `rgba(180, 210, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 水筋（上から下に流れる縦線）
  const streakCount = 12;
  for (let i = 0; i < streakCount; i++) {
    const x = rand() * w;
    const startY = rand() * h * 0.3;
    const endY = startY + rand() * h * 0.5 + h * 0.2;
    const streakWidth = rand() * 2 + 0.5;
    const alpha = rand() * 0.15 + 0.08;

    ctx.strokeStyle = `rgba(180, 210, 255, ${alpha})`;
    ctx.lineWidth = streakWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, startY);

    // 水筋は完全な直線ではなく、僅かに揺らぐ
    const segments = 8;
    for (let s = 1; s <= segments; s++) {
      const sy = startY + (endY - startY) * (s / segments);
      const sx = x + (rand() - 0.5) * 3;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
}

/**
 * 霜状態のクリスタルパターンを生成
 * 四隅から放射状に広がる氷の結晶を描画
 */
function generateFrostPattern(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = seededRandom(789);

  // ベースの霜（全体にうっすら白）
  ctx.fillStyle = 'rgba(220, 235, 255, 0.15)';
  ctx.fillRect(0, 0, w, h);

  // 四隅からの放射状結晶
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h },
    { x: w, y: h },
  ];

  for (const corner of corners) {
    const branchCount = 6 + Math.floor(rand() * 4);

    for (let b = 0; b < branchCount; b++) {
      // メイン枝の角度（隅から中心方向にランダム拡散）
      const baseAngle = Math.atan2(h / 2 - corner.y, w / 2 - corner.x);
      const angle = baseAngle + (rand() - 0.5) * Math.PI * 0.6;
      const length = rand() * w * 0.35 + w * 0.1;

      drawFrostBranch(ctx, corner.x, corner.y, angle, length, 3, rand);
    }
  }

  // 端部の霜粒子
  const particleCount = 100;
  for (let i = 0; i < particleCount; i++) {
    const x = rand() * w;
    const y = rand() * h;
    // 端ほど密度が高い
    const edgeDist = Math.min(x, w - x, y, h - y) / (w * 0.5);
    if (rand() > (1 - edgeDist) * 0.7) continue;

    const size = rand() * 3 + 0.5;
    const alpha = rand() * 0.2 + 0.1;
    ctx.fillStyle = `rgba(200, 225, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 霜の枝を再帰的に描画（フラクタル風） */
function drawFrostBranch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  depth: number,
  rand: () => number,
): void {
  if (depth <= 0 || length < 3) return;

  const endX = x + Math.cos(angle) * length;
  const endY = y + Math.sin(angle) * length;
  const alpha = 0.1 + depth * 0.05;

  ctx.strokeStyle = `rgba(200, 225, 255, ${alpha})`;
  ctx.lineWidth = depth * 0.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // 枝分かれ（左右に分岐）
  const subBranches = 1 + Math.floor(rand() * 2);
  for (let i = 0; i < subBranches; i++) {
    const branchPos = 0.3 + rand() * 0.5;
    const bx = x + Math.cos(angle) * length * branchPos;
    const by = y + Math.sin(angle) * length * branchPos;
    const branchAngle = angle + (rand() > 0.5 ? 1 : -1) * (Math.PI * 0.2 + rand() * Math.PI * 0.3);
    const branchLength = length * (0.3 + rand() * 0.3);

    drawFrostBranch(ctx, bx, by, branchAngle, branchLength, depth - 1, rand);
  }
}

/**
 * 窓ガラスの結露・霜エフェクト
 * 各窓開口部のガラス内側にわずかにオフセットした平面を配置し、
 * meshPhysicalMaterialで透過+凹凸感を表現する
 */
function glassCondensationPropsAreEqual(
  prev: GlassCondensationProps,
  next: GlassCondensationProps,
): boolean {
  if (prev.enabled !== next.enabled) return false;
  if (prev.temperature !== next.temperature) return false;
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.openings.length !== next.openings.length) return false;
  if (prev.roomHeight !== next.roomHeight) return false;
  return true;
}

export const GlassCondensation = React.memo(function GlassCondensation({
  walls,
  openings,
  roomHeight,
  temperature,
  enabled,
}: GlassCondensationProps) {
  // 窓の配置を計算
  const placements = useMemo(() => {
    if (!enabled) return [];
    const results: CondensationPlacement[] = [];

    const windowOpenings = openings.filter((o) => o.type === 'window');

    for (const opening of windowOpenings) {
      const wall = walls.find((w) => w.id === opening.wallId);
      if (!wall) continue;

      const len = wallLength(wall);
      if (len === 0) continue;

      const angle = wallAngle(wall);
      const dx = (wall.end.x - wall.start.x) / len;
      const dy = (wall.end.y - wall.start.y) / len;

      // 内側法線
      const nx = dy;
      const nz = -dx;

      // 開口部中心座標（ガラスより内側にオフセット）
      const centerAlong = opening.positionAlongWall + opening.width / 2;
      const offset = 0.008; // ガラス面から内側8mmオフセット
      const px = wall.start.x + dx * centerAlong + nx * offset;
      const py = opening.elevation + opening.height / 2;
      const pz = wall.start.y + dy * centerAlong + nz * offset;

      results.push({
        position: new THREE.Vector3(px, py, pz),
        rotationY: -angle + Math.PI,
        width: opening.width - 0.02,  // 枠内に収まるよう僅かに縮小
        height: opening.height - 0.02,
      });
    }

    return results;
  }, [enabled, openings, walls]);

  // 結露テクスチャ生成（温度モードに応じて切替）
  const condensationTexture = useMemo(() => {
    if (!enabled) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // 透明な背景
    ctx.clearRect(0, 0, 256, 256);

    switch (temperature) {
      case 'warm':
        generateWarmDroplets(ctx, 256, 256);
        break;
      case 'cold':
        generateColdDroplets(ctx, 256, 256);
        break;
      case 'frost':
        generateFrostPattern(ctx, 256, 256);
        break;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }, [enabled, temperature]);

  // 法線マップ用テクスチャ（水滴・霜の凹凸感を表現）
  const normalTexture = useMemo(() => {
    if (!enabled) return null;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // ニュートラルな法線マップの基本色（RGB=128,128,255 → 平面）
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, 256, 256);

    const rand = seededRandom(temperature === 'frost' ? 999 : 555);

    if (temperature === 'warm') {
      // 細かい水滴による微小な凹凸
      for (let i = 0; i < 60; i++) {
        const x = rand() * 256;
        const y = rand() * 256;
        const r = rand() * 4 + 1;
        // 法線の歪み（赤・緑チャンネルをずらす）
        const nx = 128 + (rand() - 0.5) * 30;
        const ny = 128 + (rand() - 0.5) * 30;
        ctx.fillStyle = `rgb(${nx}, ${ny}, 255)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (temperature === 'cold') {
      // 大きめの水滴による強い歪み
      for (let i = 0; i < 120; i++) {
        const x = rand() * 256;
        const y = rand() * 256;
        const r = rand() * 5 + 2;
        const nx = 128 + (rand() - 0.5) * 50;
        const ny = 128 + (rand() - 0.5) * 50;
        ctx.fillStyle = `rgb(${nx}, ${ny}, 255)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // 霜: 全体的に細かい凹凸
      for (let i = 0; i < 300; i++) {
        const x = rand() * 256;
        const y = rand() * 256;
        const r = rand() * 2 + 0.5;
        const nx = 128 + (rand() - 0.5) * 40;
        const ny = 128 + (rand() - 0.5) * 40;
        ctx.fillStyle = `rgb(${Math.round(nx)}, ${Math.round(ny)}, 255)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }, [enabled, temperature]);

  if (!enabled || placements.length === 0 || !condensationTexture) return null;

  // 温度に応じたマテリアルパラメータ
  const materialParams = useMemo(() => {
    switch (temperature) {
      case 'warm':
        return { opacity: 0.08, transmission: 0.95, roughness: 0.1, color: '#f0f5ff' };
      case 'cold':
        return { opacity: 0.15, transmission: 0.85, roughness: 0.2, color: '#e8efff' };
      case 'frost':
        return { opacity: 0.3, transmission: 0.6, roughness: 0.4, color: '#dce8ff' };
    }
  }, [temperature]);

  return (
    <group>
      {placements.map((placement, i) => (
        <mesh
          key={`condensation-${i}`}
          position={[placement.position.x, placement.position.y, placement.position.z]}
          rotation={[0, placement.rotationY, 0]}
        >
          <planeGeometry args={[placement.width, placement.height]} />
          <meshPhysicalMaterial
            color={materialParams.color}
            transparent={true}
            opacity={materialParams.opacity}
            transmission={materialParams.transmission}
            thickness={0.002}
            roughness={materialParams.roughness}
            metalness={0.0}
            ior={1.3}
            map={condensationTexture}
            normalMap={normalTexture}
            normalScale={new THREE.Vector2(0.3, 0.3)}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}, glassCondensationPropsAreEqual);
