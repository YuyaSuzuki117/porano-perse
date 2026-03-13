'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { computeFloorPolygon } from '@/lib/geometry';

interface FloorMeshProps {
  walls: WallSegment[];
  style: StyleConfig;
}

export function FloorMesh({ walls, style }: FloorMeshProps) {
  const floorGeometry = useMemo(() => {
    const polygon = computeFloorPolygon(walls);
    if (polygon.length < 3) return null;

    // 2D polygon → THREE.Shape (2D座標系のまま)
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i].x, polygon[i].y);
    }
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }, [walls]);

  // 床の大きさ推定（テクスチャ repeat 用）
  const floorSize = useMemo(() => {
    if (walls.length === 0) return { w: 1, d: 1 };
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    return {
      w: Math.max(...xs) - Math.min(...xs),
      d: Math.max(...ys) - Math.min(...ys),
    };
  }, [walls]);

  const floorTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const baseColor = style.floorColor;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    if (style.floorTexture === 'wood') {
      ctx.strokeStyle = adjustBrightness(baseColor, -20);
      ctx.lineWidth = 1;
      for (let i = 0; i < 512; i += 64) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
        for (let j = 0; j < 512; j += 128) {
          ctx.beginPath();
          ctx.moveTo(j, i);
          ctx.lineTo(j, i + 64);
          ctx.stroke();
        }
      }
    } else if (style.floorTexture === 'tile') {
      ctx.strokeStyle = adjustBrightness(baseColor, 30);
      ctx.lineWidth = 2;
      const tileSize = 128;
      for (let x = 0; x < 512; x += tileSize) {
        for (let y = 0; y < 512; y += tileSize) {
          ctx.strokeRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
        }
      }
    } else if (style.floorTexture === 'tatami') {
      ctx.strokeStyle = adjustBrightness(baseColor, -15);
      ctx.lineWidth = 3;
      for (let i = 0; i < 512; i += 8) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
      ctx.strokeStyle = '#8B7D3C';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 256, 512);
      ctx.strokeRect(256, 0, 256, 512);
    } else {
      // concrete
      ctx.fillStyle = adjustBrightness(baseColor, 5);
      for (let i = 0; i < 200; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = Math.random() * 3 + 1;
        ctx.fillRect(x, y, size, size);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(floorSize.w / 2, floorSize.d / 2);
    return texture;
  }, [style.floorColor, style.floorTexture, floorSize]);

  if (!floorGeometry) return null;

  // ShapeGeometry は XY 平面に生成される
  // 3D空間では床は XZ 平面 → X軸で -90度回転
  return (
    <mesh
      geometry={floorGeometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      <meshStandardMaterial map={floorTexture} roughness={0.8} />
    </mesh>
  );
}

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
