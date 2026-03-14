'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '@/stores/useEditorStore';
import { FurnitureItem, StylePreset } from '@/types/scene';

interface RugConfig {
  shape: 'circle' | 'rect';
  color: string;
  radius?: number;
  width?: number;
  height?: number;
  fringe?: boolean;
}

const RUG_CONFIGS: Partial<Record<StylePreset, RugConfig>> = {
  japanese: { shape: 'circle', color: '#8B7355', radius: 1.0 },
  luxury: { shape: 'circle', color: '#4A0E2E', radius: 1.2, fringe: true },
  cafe: { shape: 'rect', color: '#A0785A', width: 1.2, height: 1.2 },
  scandinavian: { shape: 'circle', color: '#D4C5A0', radius: 1.0 },
  retro: { shape: 'rect', color: '#C4956A', width: 1.0, height: 1.0 },
};

function createRugTexture(style: StylePreset, baseColor: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Fill base
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  switch (style) {
    case 'japanese': {
      // Concentric circles
      const rings = 5;
      for (let i = rings; i >= 1; i--) {
        const r = (i / rings) * (size / 2 - 10);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = i % 2 === 0 ? '#7A6348' : '#9C8462';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      break;
    }
    case 'luxury': {
      // Outer border
      ctx.strokeStyle = '#6B1D45';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2 - 12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#8B3A5E';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2 - 24, 0, Math.PI * 2);
      ctx.stroke();

      // Central geometric pattern (star/diamond)
      const points = 8;
      const outerR = size / 4;
      const innerR = size / 8;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#8B3A5E';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#5A1838';
      ctx.fill();
      break;
    }
    case 'cafe': {
      // Stripes
      const stripeCount = 8;
      const stripeWidth = size / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        if (i % 2 === 0) continue;
        ctx.fillStyle = '#8E6A4E';
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, size);
      }
      break;
    }
    case 'scandinavian': {
      // Simple concentric rings
      const ringCount = 3;
      for (let i = ringCount; i >= 1; i--) {
        const r = (i / ringCount) * (size / 2 - 20);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#BFB28A';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      break;
    }
    case 'retro': {
      // Diamond pattern
      const gridSize = 4;
      const cellW = size / gridSize;
      const cellH = size / gridSize;
      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const dcx = col * cellW + cellW / 2;
          const dcy = row * cellH + cellH / 2;
          const half = cellW * 0.35;
          ctx.beginPath();
          ctx.moveTo(dcx, dcy - half);
          ctx.lineTo(dcx + half, dcy);
          ctx.lineTo(dcx, dcy + half);
          ctx.lineTo(dcx - half, dcy);
          ctx.closePath();
          ctx.fillStyle = (row + col) % 2 === 0 ? '#B0805A' : '#D4A87A';
          ctx.fill();
          ctx.strokeStyle = '#9A7050';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      break;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function SingleRug({ item, config, style }: { item: FurnitureItem; config: RugConfig; style: StylePreset }) {
  const rugTexture = useMemo(() => createRugTexture(style, config.color), [style, config.color]);

  return (
    <group
      position={[item.position[0], 0.003, item.position[2]]}
      rotation={[0, item.rotation[1], 0]}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow={false}
      >
        {config.shape === 'circle' ? (
          <circleGeometry args={[config.radius!, 32]} />
        ) : (
          <planeGeometry args={[config.width!, config.height!]} />
        )}
        <meshStandardMaterial
          map={rugTexture}
          roughness={0.95}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Fringe for luxury */}
      {config.fringe && config.shape === 'circle' && (() => {
        const fringeCount = 48;
        const r = config.radius!;
        return Array.from({ length: fringeCount }, (_, i) => {
          const angle = (i / fringeCount) * Math.PI * 2;
          const x = Math.cos(angle) * r;
          const z = Math.sin(angle) * r;
          const fringeLength = 0.06;
          const outerX = Math.cos(angle) * (r + fringeLength);
          const outerZ = Math.sin(angle) * (r + fringeLength);
          return (
            <mesh
              key={i}
              position={[(x + outerX) / 2, 0, (z + outerZ) / 2]}
              rotation={[-Math.PI / 2, 0, angle]}
              receiveShadow
              castShadow={false}
            >
              <planeGeometry args={[0.01, fringeLength]} />
              <meshStandardMaterial
                color={config.color}
                roughness={0.95}
                metalness={0}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        });
      })()}
    </group>
  );
}

interface FurnitureRugProps {
  furniture: FurnitureItem[];
}

export function FurnitureRug({ furniture }: FurnitureRugProps) {
  const styleName = useEditorStore((s) => s.style);
  const config = RUG_CONFIGS[styleName];

  if (!config) return null;

  const tables = furniture.filter(
    (f) => f.type === 'table_round' || f.type === 'table_square'
  );

  if (tables.length === 0) return null;

  return (
    <>
      {tables.map((item) => (
        <SingleRug key={`rug-${item.id}`} item={item} config={config} style={styleName} />
      ))}
    </>
  );
}
