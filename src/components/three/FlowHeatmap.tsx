'use client';

/**
 * 動線ヒートマップ
 *
 * 顧客の移動パターンを床面ヒートマップで可視化する。
 * Canvas APIでテクスチャを生成し、距離場ベースの計算で
 * 入口→カウンター→座席の動線を熱量として表現する。
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';

interface FlowHeatmapProps {
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
  visible: boolean;
}

/** ヒートマップのテクスチャ解像度 */
const TEX_SIZE = 256;

/** カラーグラデーション: 透明 → 青 → 緑 → 黄 → 赤 */
function heatColor(value: number): [number, number, number, number] {
  const v = Math.max(0, Math.min(1, value));
  if (v < 0.05) return [0, 0, 0, 0]; // 透明
  if (v < 0.25) {
    const t = (v - 0.05) / 0.2;
    return [0, 0, Math.round(100 + 155 * t), Math.round(80 * t)]; // 青系
  }
  if (v < 0.5) {
    const t = (v - 0.25) / 0.25;
    return [0, Math.round(200 * t), Math.round(255 * (1 - t * 0.3)), Math.round(80 + 40 * t)]; // 青→緑
  }
  if (v < 0.75) {
    const t = (v - 0.5) / 0.25;
    return [Math.round(255 * t), Math.round(200 + 55 * t), 0, Math.round(120 + 30 * t)]; // 緑→黄
  }
  const t = (v - 0.75) / 0.25;
  return [255, Math.round(255 * (1 - t)), 0, Math.round(150 + 50 * t)]; // 黄→赤
}

/** 2D距離計算 */
function dist2D(x1: number, z1: number, x2: number, z2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2);
}

/** 家具の占有領域チェック（簡易AABB） */
function isBlockedByFurniture(
  wx: number, wz: number,
  furniture: FurnitureItem[],
): boolean {
  for (const f of furniture) {
    const hw = f.scale[0] / 2;
    const hd = f.scale[2] / 2;
    if (
      Math.abs(wx - f.position[0]) < hw &&
      Math.abs(wz - f.position[2]) < hd &&
      f.scale[1] > 0.5 // 高さ0.5m以上の家具のみ障害物とみなす
    ) {
      return true;
    }
  }
  return false;
}

const FlowHeatmapInner: React.FC<FlowHeatmapProps> = ({ walls, openings, furniture, visible }) => {
  const { texture, geometry, position } = useMemo(() => {
    if (walls.length === 0) {
      return {
        texture: null,
        geometry: new THREE.PlaneGeometry(1, 1),
        position: new THREE.Vector3(0, 0.01, 0),
      };
    }

    // バウンディングボックス計算
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minZ = Math.min(minZ, w.start.y, w.end.y);
      maxZ = Math.max(maxZ, w.start.y, w.end.y);
    }
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    // 入口位置を特定
    const door = openings.find(o => o.type === 'door');
    let entranceX = cx;
    let entranceZ = minZ;
    if (door) {
      const wall = walls.find(w => w.id === door.wallId);
      if (wall) {
        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const t = len > 0 ? door.positionAlongWall / len : 0.5;
        entranceX = wall.start.x + dx * t;
        entranceZ = wall.start.y + dy * t;
      }
    }

    // キーポイントを収集（カウンター、レジなど高動線家具）
    const keyPoints: Array<{ x: number; z: number; weight: number }> = [
      { x: entranceX, z: entranceZ, weight: 1.0 }, // 入口は最高ウェイト
    ];
    for (const f of furniture) {
      const type = f.type;
      let weight = 0.2; // デフォルト
      if (type === 'counter' || type === 'register' || type === 'reception_desk') weight = 0.8;
      else if (type === 'table_square' || type === 'table_round' || type === 'bar_table') weight = 0.5;
      else if (type === 'chair' || type === 'stool' || type === 'sofa') weight = 0.4;
      else if (type === 'shelf' || type === 'bookcase' || type === 'display_case') weight = 0.3;
      keyPoints.push({ x: f.position[0], z: f.position[2], weight });
    }

    // Canvas上にヒートマップを生成
    const canvas = document.createElement('canvas');
    canvas.width = TEX_SIZE;
    canvas.height = TEX_SIZE;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    const data = imageData.data;
    const maxDist = Math.sqrt(width * width + depth * depth);

    // ヒートマップ値の生成（距離場ベース）
    const heatValues: number[] = new Array(TEX_SIZE * TEX_SIZE).fill(0);
    for (let py = 0; py < TEX_SIZE; py++) {
      for (let px = 0; px < TEX_SIZE; px++) {
        // テクスチャ座標→ワールド座標
        const wx = minX + (px / (TEX_SIZE - 1)) * width;
        const wz = minZ + (py / (TEX_SIZE - 1)) * depth;

        // 壁近接チェック（壁際は低い）
        let wallProximity = 1.0;
        for (const w of walls) {
          // 壁セグメントへの最短距離を計算
          const ax = w.start.x, az = w.start.y;
          const bx = w.end.x, bz = w.end.y;
          const abx = bx - ax, abz = bz - az;
          const lenSq = abx * abx + abz * abz;
          const t = lenSq > 0 ? Math.max(0, Math.min(1, ((wx - ax) * abx + (wz - az) * abz) / lenSq)) : 0;
          const projX = ax + t * abx;
          const projZ = az + t * abz;
          const d = dist2D(wx, wz, projX, projZ);
          if (d < 0.3) wallProximity = Math.min(wallProximity, d / 0.3);
        }

        // 家具による遮蔽
        const blocked = isBlockedByFurniture(wx, wz, furniture);
        if (blocked) {
          heatValues[py * TEX_SIZE + px] = 0;
          continue;
        }

        // キーポイントからの影響を合算
        let heat = 0;
        for (const kp of keyPoints) {
          const d = dist2D(wx, wz, kp.x, kp.z);
          const falloff = Math.max(0, 1 - d / (maxDist * 0.6));
          heat += falloff * falloff * kp.weight;
        }

        // 入口→キーポイント間のパス沿いにブースト
        for (let i = 1; i < keyPoints.length; i++) {
          const kp = keyPoints[i];
          // 入口からキーポイントへの線分への距離
          const pathDist = pointToSegmentDist(
            wx, wz,
            entranceX, entranceZ,
            kp.x, kp.z,
          );
          const pathBoost = Math.max(0, 1 - pathDist / (maxDist * 0.15)) * kp.weight * 0.5;
          heat += pathBoost;
        }

        heat *= wallProximity;
        heatValues[py * TEX_SIZE + px] = Math.min(1, heat);
      }
    }

    // ガウシアンブラー（3x3の簡易版を2パス）
    const blurred = gaussianBlur(heatValues, TEX_SIZE, TEX_SIZE, 2);

    // ピクセルデータに変換
    for (let i = 0; i < blurred.length; i++) {
      const [r, g, b, a] = heatColor(blurred[i]);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = a;
    }
    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(width, depth);
    const pos = new THREE.Vector3(cx, 0.01, cz);

    return { texture: tex, geometry: geo, position: pos };
  }, [walls, openings, furniture]);

  if (!visible || !texture) return null;

  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.4}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

/** 点から線分への最短距離 */
function pointToSegmentDist(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const abx = bx - ax, abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq === 0) return dist2D(px, pz, ax, az);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  return dist2D(px, pz, ax + t * abx, az + t * abz);
}

/** 簡易ガウシアンブラー */
function gaussianBlur(values: number[], w: number, h: number, passes: number): number[] {
  let src = [...values];
  let dst = new Array(w * h).fill(0);
  const kernel = [0.0625, 0.125, 0.0625, 0.125, 0.25, 0.125, 0.0625, 0.125, 0.0625];

  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const sy = Math.max(0, Math.min(h - 1, y + ky));
            const sx = Math.max(0, Math.min(w - 1, x + kx));
            sum += src[sy * w + sx] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        dst[y * w + x] = sum;
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}

export const FlowHeatmap = React.memo(FlowHeatmapInner);
