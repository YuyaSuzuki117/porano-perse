'use client';

/**
 * 照明分析オーバーレイ
 *
 * 床面に近似ルクス値をヒートマップとして表示する。
 * 窓（自然光）、ペンダントライト（点光源）、天井照明（環境光）
 * を考慮し、家具による遮蔽も計算する。
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';

interface LightingAnalysisProps {
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
  roomHeight: number;
  visible: boolean;
  brightness: number; // 0-2 のライト強度
}

/** テクスチャ解像度 */
const TEX_SIZE = 256;

/** ルクス範囲に対応する色: 暗い青 → 水色 → 緑 → 黄 → オレンジ/赤 */
function luxColor(lux: number): [number, number, number, number] {
  if (lux < 10) return [0, 0, 50, 40]; // ほぼ暗闇
  if (lux < 100) {
    const t = (lux - 10) / 90;
    return [0, 0, Math.round(80 + 175 * t), Math.round(60 + 40 * t)]; // 暗い青
  }
  if (lux < 300) {
    const t = (lux - 100) / 200;
    return [0, Math.round(150 * t), Math.round(255 * (1 - t * 0.3)), Math.round(100 + 30 * t)]; // 水色→緑
  }
  if (lux < 500) {
    const t = (lux - 300) / 200;
    return [Math.round(100 + 155 * t), Math.round(150 + 105 * t), Math.round(50 * (1 - t)), Math.round(130 + 20 * t)]; // 緑→黄
  }
  if (lux < 750) {
    const t = (lux - 500) / 250;
    return [255, Math.round(255 * (1 - t * 0.4)), 0, Math.round(150 + 30 * t)]; // 黄→オレンジ
  }
  const t = Math.min(1, (lux - 750) / 500);
  return [255, Math.round(150 * (1 - t)), 0, Math.round(180 + 20 * t)]; // オレンジ→赤
}

/** 2D距離 */
function dist2D(x1: number, z1: number, x2: number, z2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2);
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

const LightingAnalysisInner: React.FC<LightingAnalysisProps> = ({
  walls, openings, furniture, roomHeight, visible, brightness,
}) => {
  const { texture, geometry, position, luxLabels } = useMemo(() => {
    if (walls.length === 0) {
      return {
        texture: null,
        geometry: new THREE.PlaneGeometry(1, 1),
        position: new THREE.Vector3(0, 0.02, 0),
        luxLabels: [],
      };
    }

    // バウンディングボックス
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

    // 光源リストを構築
    interface LightSource {
      x: number;
      z: number;
      height: number;   // 光源の高さ
      intensity: number; // ルクス基準値
      type: 'window' | 'pendant' | 'ceiling';
    }

    const lights: LightSource[] = [];

    // 窓 → 自然光源（日光 ~500-1000 lux）
    for (const op of openings) {
      if (op.type !== 'window') continue;
      const wall = walls.find(w => w.id === op.wallId);
      if (!wall) continue;
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const t = len > 0 ? op.positionAlongWall / len : 0.5;
      lights.push({
        x: wall.start.x + dx * t,
        z: wall.start.y + dy * t,
        height: op.elevation + op.height / 2,
        intensity: 800 * (op.width / 1.0) * brightness, // 窓幅に比例
        type: 'window',
      });
    }

    // ペンダントライト → 点光源（~300 lux at 1m）
    for (const f of furniture) {
      if (f.type === 'pendant_light') {
        lights.push({
          x: f.position[0],
          z: f.position[2],
          height: f.position[1] > 0.5 ? f.position[1] : roomHeight - 0.5,
          intensity: 400 * brightness,
          type: 'pendant',
        });
      }
    }

    // 天井照明（部屋全体にデフォルト環境光）
    // 部屋の中心に仮想天井照明を配置
    const numCeilingLights = Math.max(1, Math.round((width * depth) / 6));
    const gridX = Math.ceil(Math.sqrt(numCeilingLights * (width / depth)));
    const gridZ = Math.ceil(numCeilingLights / gridX);
    for (let gx = 0; gx < gridX; gx++) {
      for (let gz = 0; gz < gridZ; gz++) {
        lights.push({
          x: minX + (gx + 0.5) * (width / gridX),
          z: minZ + (gz + 0.5) * (depth / gridZ),
          height: roomHeight - 0.1,
          intensity: (200 / numCeilingLights) * brightness,
          type: 'ceiling',
        });
      }
    }

    // 各ピクセルのルクス値を計算
    const luxValues: number[] = new Array(TEX_SIZE * TEX_SIZE).fill(0);
    const canvas = document.createElement('canvas');
    canvas.width = TEX_SIZE;
    canvas.height = TEX_SIZE;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(TEX_SIZE, TEX_SIZE);
    const data = imageData.data;

    for (let py = 0; py < TEX_SIZE; py++) {
      for (let px = 0; px < TEX_SIZE; px++) {
        const wx = minX + (px / (TEX_SIZE - 1)) * width;
        const wz = minZ + (py / (TEX_SIZE - 1)) * depth;

        let totalLux = 0;

        for (const light of lights) {
          const hDist = dist2D(wx, wz, light.x, light.z);
          const dist3D = Math.sqrt(hDist * hDist + light.height * light.height);

          // 逆二乗の法則で減衰（ただし最小距離0.5mでクランプ）
          const effectiveDist = Math.max(0.5, dist3D);
          let lux: number;

          if (light.type === 'window') {
            // 窓は横方向に広がる光: cosine falloff
            const cosAngle = light.height / effectiveDist;
            lux = light.intensity * cosAngle / (effectiveDist * effectiveDist) * 4;
          } else {
            // 点光源: 逆二乗
            lux = light.intensity / (effectiveDist * effectiveDist) * 2;
          }

          // 家具による遮蔽: 光源と測定点の間に高い家具があれば減衰
          let shadow = 1.0;
          for (const f of furniture) {
            if (f.type === 'pendant_light') continue; // ライト自身は除外
            if (f.scale[1] < 0.8) continue; // 低い家具は影響なし
            // 光源→測定点の線分が家具のAABBを横切るか簡易チェック
            const fMinX = f.position[0] - f.scale[0] / 2;
            const fMaxX = f.position[0] + f.scale[0] / 2;
            const fMinZ = f.position[2] - f.scale[2] / 2;
            const fMaxZ = f.position[2] + f.scale[2] / 2;
            if (lineIntersectsAABB(light.x, light.z, wx, wz, fMinX, fMinZ, fMaxX, fMaxZ)) {
              shadow *= 0.4; // 40%に減衰
            }
          }

          totalLux += lux * shadow;
        }

        luxValues[py * TEX_SIZE + px] = totalLux;
      }
    }

    // ブラーをかけて滑らかに
    // ルクス値を正規化して相対的に使う（ブラーは正規化後）
    const maxLux = Math.max(1, ...luxValues);
    const normalized = luxValues.map(v => v / maxLux);
    const blurred = gaussianBlur(normalized, TEX_SIZE, TEX_SIZE, 3);

    // ピクセルデータ生成
    for (let i = 0; i < blurred.length; i++) {
      const lux = blurred[i] * maxLux; // 復元
      const [r, g, b, a] = luxColor(lux);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = a;
    }
    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(width, depth);
    const pos = new THREE.Vector3(cx, 0.02, cz);

    // ルクスラベル（キーポイントに表示）
    const labelPositions: Array<{ x: number; z: number; lux: number }> = [];
    // 4隅 + 中央のルクス値をラベル表示
    const samplePoints = [
      { x: cx, z: cz },
      { x: minX + width * 0.2, z: minZ + depth * 0.2 },
      { x: maxX - width * 0.2, z: minZ + depth * 0.2 },
      { x: minX + width * 0.2, z: maxZ - depth * 0.2 },
      { x: maxX - width * 0.2, z: maxZ - depth * 0.2 },
    ];
    for (const sp of samplePoints) {
      const px = Math.round(((sp.x - minX) / width) * (TEX_SIZE - 1));
      const pz = Math.round(((sp.z - minZ) / depth) * (TEX_SIZE - 1));
      const idx = pz * TEX_SIZE + px;
      if (idx >= 0 && idx < luxValues.length) {
        labelPositions.push({ x: sp.x, z: sp.z, lux: Math.round(luxValues[idx]) });
      }
    }

    return { texture: tex, geometry: geo, position: pos, luxLabels: labelPositions };
  }, [walls, openings, furniture, roomHeight, brightness]);

  if (!visible || !texture) return null;

  return (
    <group>
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
      {/* ルクスラベル */}
      {luxLabels.map((label, i) => (
        <Html
          key={i}
          position={[label.x, 0.3, label.z]}
          center
          distanceFactor={8}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(0,0,0,0.75)',
              color: '#fff',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {label.lux} lux
          </div>
        </Html>
      ))}
    </group>
  );
};

/** 線分がAABBと交差するか（2D簡易版） */
function lineIntersectsAABB(
  x1: number, z1: number, x2: number, z2: number,
  minX: number, minZ: number, maxX: number, maxZ: number,
): boolean {
  // Cohen-Sutherland的な簡易判定
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return false;

  const steps = Math.ceil(len / 0.3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t;
    const z = z1 + dz * t;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
  }
  return false;
}

export const LightingAnalysis = React.memo(LightingAnalysisInner);
