'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { RoomDimensions, StyleConfig } from '@/types/scene';

interface RoomProps {
  dimensions: RoomDimensions;
  style: StyleConfig;
}

export function Room({ dimensions, style }: RoomProps) {
  const { width, depth, height } = dimensions;

  const floorPattern = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const baseColor = style.floorColor;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    if (style.floorTexture === 'wood') {
      // 木目パターン
      ctx.strokeStyle = adjustBrightness(baseColor, -20);
      ctx.lineWidth = 1;
      for (let i = 0; i < 512; i += 64) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
        // 木目の節
        for (let j = 0; j < 512; j += 128) {
          ctx.beginPath();
          ctx.moveTo(j, i);
          ctx.lineTo(j, i + 64);
          ctx.stroke();
        }
      }
    } else if (style.floorTexture === 'tile') {
      // タイルパターン
      ctx.strokeStyle = adjustBrightness(baseColor, 30);
      ctx.lineWidth = 2;
      const tileSize = 128;
      for (let x = 0; x < 512; x += tileSize) {
        for (let y = 0; y < 512; y += tileSize) {
          ctx.strokeRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
        }
      }
    } else if (style.floorTexture === 'tatami') {
      // 畳パターン
      ctx.strokeStyle = adjustBrightness(baseColor, -15);
      ctx.lineWidth = 3;
      // 横線（い草の目）
      for (let i = 0; i < 512; i += 8) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
      // 畳の縁
      ctx.strokeStyle = '#8B7D3C';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 256, 512);
      ctx.strokeRect(256, 0, 256, 512);
    } else {
      // コンクリート
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
    texture.repeat.set(width / 2, depth / 2);
    return texture;
  }, [style.floorColor, style.floorTexture, width, depth]);

  const wallPattern = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = style.wallColor;
    ctx.fillRect(0, 0, 256, 256);
    // 微細なテクスチャ
    ctx.fillStyle = adjustBrightness(style.wallColor, 3);
    for (let i = 0; i < 100; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(width, height);
    return texture;
  }, [style.wallColor, width, height]);

  return (
    <group>
      {/* 床 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={floorPattern} roughness={0.8} />
      </mesh>

      {/* 天井 */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={style.ceilingColor} roughness={0.9} />
      </mesh>

      {/* 背面壁 */}
      <mesh position={[0, height / 2, -depth / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={wallPattern} roughness={0.9} />
      </mesh>

      {/* 左壁 */}
      <mesh
        rotation={[0, Math.PI / 2, 0]}
        position={[-width / 2, height / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial map={wallPattern} roughness={0.9} />
      </mesh>

      {/* 右壁 */}
      <mesh
        rotation={[0, -Math.PI / 2, 0]}
        position={[width / 2, height / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial map={wallPattern} roughness={0.9} />
      </mesh>

      {/* 巾木 */}
      <Baseboard width={width} depth={depth} height={0.08} color={style.accentColor} />
    </group>
  );
}

function Baseboard({ width, depth, height, color }: { width: number; depth: number; height: number; color: string }) {
  return (
    <group>
      {/* 背面 */}
      <mesh position={[0, height / 2, -depth / 2 + 0.005]}>
        <boxGeometry args={[width, height, 0.01]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* 左 */}
      <mesh position={[-width / 2 + 0.005, height / 2, 0]}>
        <boxGeometry args={[0.01, height, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* 右 */}
      <mesh position={[width / 2 - 0.005, height / 2, 0]}>
        <boxGeometry args={[0.01, height, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
