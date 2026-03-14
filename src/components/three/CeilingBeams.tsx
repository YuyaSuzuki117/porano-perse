'use client';

// 天井梁（シーリングビーム）コンポーネント
// スタイルに応じた露出天井梁を配置する

import React, { useMemo } from 'react';
import { WallSegment } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CeilingBeamsProps {
  walls: WallSegment[];
  roomHeight: number;
  style: StyleConfig;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 梁の標準サイズ */
const BEAM_WIDTH = 0.15;
const BEAM_DEPTH = 0.20;

/** 梁を表示するスタイル */
const BEAM_STYLES = new Set(['industrial', 'japanese', 'scandinavian', 'cafe', 'retro']);

// ---------------------------------------------------------------------------
// スタイル別設定
// ---------------------------------------------------------------------------

interface BeamStyle {
  color: string;
  roughness: number;
  metalness: number;
  beamCount: number;
  /** グリッドパターン（japanese: 縦横格子） */
  grid: boolean;
  /** ブラケット装飾（retro） */
  brackets: boolean;
  beamWidth: number;
  beamDepth: number;
}

function getBeamStyle(style: StyleConfig): BeamStyle {
  switch (style.name) {
    case 'industrial':
      return {
        color: '#3A3A3A', roughness: 0.3, metalness: 0.8,
        beamCount: 3, grid: false, brackets: false,
        beamWidth: 0.12, beamDepth: 0.18,
      };
    case 'japanese':
      return {
        color: '#4A3728', roughness: 0.7, metalness: 0.02,
        beamCount: 3, grid: true, brackets: false,
        beamWidth: BEAM_WIDTH, beamDepth: BEAM_DEPTH,
      };
    case 'scandinavian':
      return {
        color: '#D4C5A0', roughness: 0.65, metalness: 0.02,
        beamCount: 4, grid: false, brackets: false,
        beamWidth: 0.14, beamDepth: 0.18,
      };
    case 'cafe':
      return {
        color: '#5A3A2A', roughness: 0.7, metalness: 0.02,
        beamCount: 3, grid: false, brackets: false,
        beamWidth: BEAM_WIDTH, beamDepth: BEAM_DEPTH,
      };
    case 'retro':
      return {
        color: '#6B3A2A', roughness: 0.6, metalness: 0.03,
        beamCount: 3, grid: false, brackets: true,
        beamWidth: BEAM_WIDTH, beamDepth: 0.22,
      };
    default:
      return {
        color: '#808080', roughness: 0.5, metalness: 0.0,
        beamCount: 2, grid: false, brackets: false,
        beamWidth: BEAM_WIDTH, beamDepth: BEAM_DEPTH,
      };
  }
}

// ---------------------------------------------------------------------------
// 部屋のバウンディングボックス計算
// ---------------------------------------------------------------------------

interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
}

function computeRoomBounds(walls: WallSegment[]): RoomBounds | null {
  if (walls.length === 0) return null;

  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const zs = walls.flatMap((w) => [w.start.y, w.end.y]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    minX, maxX, minZ, maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export const CeilingBeams = React.memo(function CeilingBeams({
  walls,
  roomHeight,
  style,
}: CeilingBeamsProps) {
  if (!BEAM_STYLES.has(style.name)) return null;

  const beamStyle = useMemo(() => getBeamStyle(style), [style]);

  const meshes = useMemo(() => {
    const bounds = computeRoomBounds(walls);
    if (!bounds) return [];

    const elements: React.JSX.Element[] = [];
    const beamY = roomHeight - beamStyle.beamDepth / 2;

    if (beamStyle.grid) {
      // 和風: 格子状の梁配置
      const gridCountX = Math.min(3, Math.max(2, Math.round(bounds.width / 2)));
      const gridCountZ = Math.min(3, Math.max(2, Math.round(bounds.depth / 2)));

      // X方向に走る梁（Z軸に沿って等間隔）
      for (let i = 1; i <= gridCountZ; i++) {
        const z = bounds.minZ + (bounds.depth * i) / (gridCountZ + 1);
        elements.push(
          <mesh
            key={`beam-grid-x-${i}`}
            position={[bounds.centerX, beamY, z]}
            castShadow
          >
            <boxGeometry args={[bounds.width, beamStyle.beamDepth, beamStyle.beamWidth]} />
            <meshStandardMaterial
              color={beamStyle.color}
              roughness={beamStyle.roughness}
              metalness={beamStyle.metalness}
            />
          </mesh>
        );
      }

      // Z方向に走る梁（X軸に沿って等間隔）
      for (let i = 1; i <= gridCountX; i++) {
        const x = bounds.minX + (bounds.width * i) / (gridCountX + 1);
        elements.push(
          <mesh
            key={`beam-grid-z-${i}`}
            position={[x, beamY, bounds.centerZ]}
            castShadow
          >
            <boxGeometry args={[beamStyle.beamWidth, beamStyle.beamDepth, bounds.depth]} />
            <meshStandardMaterial
              color={beamStyle.color}
              roughness={beamStyle.roughness}
              metalness={beamStyle.metalness}
            />
          </mesh>
        );
      }
    } else {
      // 平行梁: 短辺方向にまたがる梁を長辺方向に等間隔配置
      const spanAlongX = bounds.width <= bounds.depth;
      const spanLen = spanAlongX ? bounds.width : bounds.depth;
      const distributeLen = spanAlongX ? bounds.depth : bounds.width;

      for (let i = 1; i <= beamStyle.beamCount; i++) {
        const pos = (distributeLen * i) / (beamStyle.beamCount + 1);

        const x = spanAlongX
          ? bounds.centerX
          : bounds.minX + pos;
        const z = spanAlongX
          ? bounds.minZ + pos
          : bounds.centerZ;

        elements.push(
          <mesh
            key={`beam-${i}`}
            position={[x, beamY, z]}
            castShadow
          >
            <boxGeometry args={[
              spanAlongX ? spanLen : beamStyle.beamWidth,
              beamStyle.beamDepth,
              spanAlongX ? beamStyle.beamWidth : spanLen,
            ]} />
            <meshStandardMaterial
              color={beamStyle.color}
              roughness={beamStyle.roughness}
              metalness={beamStyle.metalness}
            />
          </mesh>
        );

        // retro: 装飾ブラケット（梁の両端に三角形のサポート）
        if (beamStyle.brackets) {
          const bracketSize = 0.08;
          // 始端ブラケット
          const bx1 = spanAlongX ? bounds.minX + bracketSize / 2 : x;
          const bz1 = spanAlongX ? z : bounds.minZ + bracketSize / 2;
          elements.push(
            <mesh
              key={`bracket-s-${i}`}
              position={[bx1, beamY + beamStyle.beamDepth / 2 - bracketSize / 2, bz1]}
            >
              <boxGeometry args={[bracketSize, bracketSize, bracketSize]} />
              <meshStandardMaterial
                color={beamStyle.color}
                roughness={beamStyle.roughness}
              />
            </mesh>
          );
          // 終端ブラケット
          const bx2 = spanAlongX ? bounds.maxX - bracketSize / 2 : x;
          const bz2 = spanAlongX ? z : bounds.maxZ - bracketSize / 2;
          elements.push(
            <mesh
              key={`bracket-e-${i}`}
              position={[bx2, beamY + beamStyle.beamDepth / 2 - bracketSize / 2, bz2]}
            >
              <boxGeometry args={[bracketSize, bracketSize, bracketSize]} />
              <meshStandardMaterial
                color={beamStyle.color}
                roughness={beamStyle.roughness}
              />
            </mesh>
          );
        }
      }
    }

    return elements;
  }, [walls, roomHeight, beamStyle]);

  return <group>{meshes}</group>;
});
