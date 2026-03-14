'use client';

// 巾木（ベースボード）と廻り縁（クラウンモールディング）コンポーネント
// 壁の底辺と天井接合部に装飾モールディングを配置する

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment, Opening } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { wallLength, wallAngle } from '@/lib/geometry';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BaseboardsProps {
  walls: WallSegment[];
  openings: Opening[];
  roomHeight: number;
  style: StyleConfig;
}

// ---------------------------------------------------------------------------
// スタイル別巾木設定
// ---------------------------------------------------------------------------

interface MoldingProfile {
  baseboardHeight: number;
  baseboardDepth: number;
  baseboardColor: string;
  crownHeight: number;
  crownDepth: number;
  crownColor: string;
  skipBaseboard: boolean;
  skipCrown: boolean;
  /** luxury用ダブルステップクラウン */
  doubleCrown: boolean;
  /** industrial用パイプレール */
  pipeCrown: boolean;
}

function getMoldingProfile(style: StyleConfig): MoldingProfile {
  const name = style.name;
  switch (name) {
    case 'japanese':
      return {
        baseboardHeight: 0.08, baseboardDepth: 0.012, baseboardColor: '#4A3728',
        crownHeight: 0.08, crownDepth: 0.01, crownColor: '#5A4738',
        skipBaseboard: false, skipCrown: false, doubleCrown: false, pipeCrown: false,
      };
    case 'luxury':
      return {
        baseboardHeight: 0.15, baseboardDepth: 0.018, baseboardColor: '#3D1F0A',
        crownHeight: 0.15, crownDepth: 0.015, crownColor: '#3D1F0A',
        skipBaseboard: false, skipCrown: false, doubleCrown: true, pipeCrown: false,
      };
    case 'retro':
      return {
        baseboardHeight: 0.15, baseboardDepth: 0.018, baseboardColor: '#6B3A2A',
        crownHeight: 0.10, crownDepth: 0.012, crownColor: '#8B6914',
        skipBaseboard: false, skipCrown: false, doubleCrown: false, pipeCrown: false,
      };
    case 'industrial':
      return {
        baseboardHeight: 0, baseboardDepth: 0, baseboardColor: '#505050',
        crownHeight: 0.04, crownDepth: 0.04, crownColor: '#606060',
        skipBaseboard: true, skipCrown: false, doubleCrown: false, pipeCrown: true,
      };
    case 'minimal':
      return {
        baseboardHeight: 0.06, baseboardDepth: 0.01, baseboardColor: style.wallColor,
        crownHeight: 0.04, crownDepth: 0.008, crownColor: style.wallColor,
        skipBaseboard: false, skipCrown: false, doubleCrown: false, pipeCrown: false,
      };
    case 'modern':
      return {
        baseboardHeight: 0.06, baseboardDepth: 0.01, baseboardColor: style.wallColor,
        crownHeight: 0.04, crownDepth: 0.008, crownColor: style.wallColor,
        skipBaseboard: false, skipCrown: false, doubleCrown: false, pipeCrown: false,
      };
    case 'scandinavian':
      return {
        baseboardHeight: 0.10, baseboardDepth: 0.014, baseboardColor: '#F0F0F0',
        crownHeight: 0.08, crownDepth: 0.012, crownColor: '#F0F0F0',
        skipBaseboard: false, skipCrown: false, doubleCrown: false, pipeCrown: false,
      };
    case 'cafe':
      return {
        baseboardHeight: 0.10, baseboardDepth: 0.014, baseboardColor: '#F0F0F0',
        crownHeight: 0.08, crownDepth: 0.012, crownColor: '#F0F0F0',
        skipBaseboard: false, skipCrown: false, doubleCrown: false, pipeCrown: false,
      };
    default: // medical等
      return {
        baseboardHeight: 0.08, baseboardDepth: 0.012, baseboardColor: '#E0E0E0',
        crownHeight: 0.06, crownDepth: 0.01, crownColor: '#E8E8E8',
        skipBaseboard: false, skipCrown: false, doubleCrown: false, pipeCrown: false,
      };
  }
}

// ---------------------------------------------------------------------------
// ドア開口部との重複チェック
// ---------------------------------------------------------------------------

/** 壁上のドア開口をpositionAlongWallとwidthで取得し、巾木をスキップすべき区間を返す */
function getDoorGaps(wall: WallSegment, openings: Opening[]): Array<{ start: number; end: number }> {
  return openings
    .filter((o) => o.wallId === wall.id && o.type === 'door')
    .map((o) => ({
      start: o.positionAlongWall - o.width / 2,
      end: o.positionAlongWall + o.width / 2,
    }));
}

/** ドア開口でセグメントを分割し、巾木を配置すべき区間リストを返す */
function splitByDoors(
  totalLength: number,
  gaps: Array<{ start: number; end: number }>,
): Array<{ offset: number; length: number }> {
  if (gaps.length === 0) return [{ offset: 0, length: totalLength }];

  const sorted = [...gaps].sort((a, b) => a.start - b.start);
  const segments: Array<{ offset: number; length: number }> = [];
  let cursor = 0;

  for (const gap of sorted) {
    const gapStart = Math.max(0, gap.start);
    const gapEnd = Math.min(totalLength, gap.end);
    if (gapStart > cursor) {
      segments.push({ offset: cursor, length: gapStart - cursor });
    }
    cursor = gapEnd;
  }

  if (cursor < totalLength) {
    segments.push({ offset: cursor, length: totalLength - cursor });
  }

  return segments.filter((s) => s.length > 0.01);
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export const Baseboards = React.memo(function Baseboards({
  walls,
  openings,
  roomHeight,
  style,
}: BaseboardsProps) {
  const profile = useMemo(() => getMoldingProfile(style), [style]);

  const meshes = useMemo(() => {
    const elements: React.JSX.Element[] = [];

    for (const wall of walls) {
      const len = wallLength(wall);
      if (len < 0.05) continue;

      const angle = wallAngle(wall);
      const midX = (wall.start.x + wall.end.x) / 2;
      const midY = (wall.start.y + wall.end.y) / 2;
      const thickness = wall.thickness || 0.12;

      // 壁の法線方向（内側方向）
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);

      const doorGaps = getDoorGaps(wall, openings);

      // --- 巾木 ---
      if (!profile.skipBaseboard) {
        const segments = splitByDoors(len, doorGaps);
        for (let si = 0; si < segments.length; si++) {
          const seg = segments[si];
          const segCenterAlongWall = seg.offset + seg.length / 2 - len / 2;
          const posX = midX + Math.cos(angle) * segCenterAlongWall + nx * (thickness / 2 + profile.baseboardDepth / 2);
          const posZ = midY + Math.sin(angle) * segCenterAlongWall + ny * (thickness / 2 + profile.baseboardDepth / 2);

          elements.push(
            <mesh
              key={`bb-${wall.id}-${si}`}
              position={[posX, profile.baseboardHeight / 2, posZ]}
              rotation={[0, -angle, 0]}
              castShadow
            >
              <boxGeometry args={[seg.length, profile.baseboardHeight, profile.baseboardDepth]} />
              <meshStandardMaterial color={profile.baseboardColor} roughness={0.6} />
            </mesh>
          );
        }
      }

      // --- クラウンモールディング ---
      if (!profile.skipCrown) {
        const crownY = roomHeight - profile.crownHeight / 2;
        const crownOffsetX = midX + nx * (thickness / 2 + profile.crownDepth / 2);
        const crownOffsetZ = midY + ny * (thickness / 2 + profile.crownDepth / 2);

        if (profile.doubleCrown) {
          // luxury: ダブルステップ — 上段と下段
          const stepHeight = profile.crownHeight / 2;
          elements.push(
            <mesh
              key={`cr-top-${wall.id}`}
              position={[crownOffsetX, roomHeight - stepHeight / 2, crownOffsetZ]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[len, stepHeight, profile.crownDepth]} />
              <meshStandardMaterial color={profile.crownColor} roughness={0.4} />
            </mesh>
          );
          elements.push(
            <mesh
              key={`cr-bot-${wall.id}`}
              position={[crownOffsetX, roomHeight - stepHeight - stepHeight / 2, crownOffsetZ]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[len, stepHeight, profile.crownDepth * 1.4]} />
              <meshStandardMaterial color={profile.crownColor} roughness={0.4} />
            </mesh>
          );
        } else if (profile.pipeCrown) {
          // industrial: パイプレール
          elements.push(
            <mesh
              key={`cr-pipe-${wall.id}`}
              position={[crownOffsetX, roomHeight - 0.03, crownOffsetZ]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.02, 0.02, len, 8]} />
              <meshStandardMaterial color={profile.crownColor} roughness={0.3} metalness={0.8} />
            </mesh>
          );
        } else {
          // 標準クラウン
          elements.push(
            <mesh
              key={`cr-${wall.id}`}
              position={[crownOffsetX, crownY, crownOffsetZ]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[len, profile.crownHeight, profile.crownDepth]} />
              <meshStandardMaterial color={profile.crownColor} roughness={0.5} />
            </mesh>
          );
        }
      }
    }

    return elements;
  }, [walls, openings, roomHeight, profile]);

  return <group>{meshes}</group>;
});
