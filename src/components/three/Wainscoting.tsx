'use client';

// 腰壁パネリング（ウェインスコッティング）コンポーネント
// 壁の下部1mに装飾パネルを配置するスタイル別ディテール

import React, { useMemo } from 'react';
import { WallSegment, Opening } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { wallLength, wallAngle } from '@/lib/geometry';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WainscotingProps {
  walls: WallSegment[];
  openings: Opening[];
  roomHeight: number;
  style: StyleConfig;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 腰壁の高さ (m) */
const WAINSCOT_HEIGHT = 1.0;
/** チェアレールの高さ (m) */
const CHAIR_RAIL_HEIGHT = 0.04;
const CHAIR_RAIL_DEPTH = 0.02;

// 対象スタイルのみ表示
const WAINSCOT_STYLES = new Set(['luxury', 'retro', 'japanese', 'cafe']);

// ---------------------------------------------------------------------------
// スタイル別設定
// ---------------------------------------------------------------------------

interface WainscotStyle {
  panelColor: string;
  panelRoughness: number;
  railColor: string;
}

function getWainscotStyle(style: StyleConfig): WainscotStyle {
  switch (style.name) {
    case 'luxury':
      return { panelColor: '#5A3A2A', panelRoughness: 0.25, railColor: '#4A2A1A' };
    case 'retro':
      return { panelColor: '#8B6914', panelRoughness: 0.6, railColor: '#7A5A10' };
    case 'japanese':
      return { panelColor: '#6B5B3C', panelRoughness: 0.5, railColor: '#5A4A30' };
    case 'cafe':
      return { panelColor: '#D4C5A0', panelRoughness: 0.4, railColor: '#C4B590' };
    default:
      return { panelColor: '#808080', panelRoughness: 0.5, railColor: '#707070' };
  }
}

// ---------------------------------------------------------------------------
// ドア開口部チェック
// ---------------------------------------------------------------------------

/** 指定した壁の腰壁領域にドアがあるかチェック */
function hasDoorInWainscotArea(wall: WallSegment, openings: Opening[]): boolean {
  return openings.some(
    (o) => o.wallId === wall.id && o.type === 'door'
  );
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export const Wainscoting = React.memo(function Wainscoting({
  walls,
  openings,
  style,
}: WainscotingProps) {
  // 対象スタイル以外は何も描画しない
  if (!WAINSCOT_STYLES.has(style.name)) return null;

  const wStyle = useMemo(() => getWainscotStyle(style), [style]);

  const meshes = useMemo(() => {
    const elements: React.JSX.Element[] = [];

    for (const wall of walls) {
      const len = wallLength(wall);
      if (len < 0.2) continue;

      // ドアがある壁はスキップ
      if (hasDoorInWainscotArea(wall, openings)) continue;

      const angle = wallAngle(wall);
      const midX = (wall.start.x + wall.end.x) / 2;
      const midY = (wall.start.y + wall.end.y) / 2;
      const thickness = wall.thickness || 0.12;

      // 壁の法線方向（内側）
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const panelOffset = thickness / 2 + 0.005; // 壁面から少し浮かせる

      const posX = midX + nx * panelOffset;
      const posZ = midY + ny * panelOffset;

      // --- スタイル別パネル描画 ---
      switch (style.name) {
        case 'luxury': {
          // レイズドパネル: 壁セグメントを3分割して浮き出しパネルを配置
          const panelCount = Math.max(1, Math.min(5, Math.floor(len / 0.6)));
          const panelWidth = (len - 0.1 * (panelCount + 1)) / panelCount;
          const panelHeight = WAINSCOT_HEIGHT - 0.15; // 上下にマージン

          for (let pi = 0; pi < panelCount; pi++) {
            const panelCenterAlongWall = 0.1 + panelWidth / 2 + pi * (panelWidth + 0.1) - len / 2;
            const px = posX + Math.cos(angle) * panelCenterAlongWall;
            const pz = posZ + Math.sin(angle) * panelCenterAlongWall;

            // ベースパネル
            elements.push(
              <mesh
                key={`wn-lux-base-${wall.id}-${pi}`}
                position={[px, WAINSCOT_HEIGHT / 2, pz]}
                rotation={[0, -angle, 0]}
              >
                <boxGeometry args={[panelWidth, panelHeight, 0.008]} />
                <meshPhysicalMaterial color={wStyle.panelColor} roughness={wStyle.panelRoughness} clearcoat={0.4} clearcoatRoughness={0.2} />
              </mesh>
            );
            // 浮き出し部分（少し前に出る）
            elements.push(
              <mesh
                key={`wn-lux-raise-${wall.id}-${pi}`}
                position={[
                  px + nx * 0.005,
                  WAINSCOT_HEIGHT / 2,
                  pz + ny * 0.005,
                ]}
                rotation={[0, -angle, 0]}
              >
                <boxGeometry args={[panelWidth - 0.06, panelHeight - 0.06, 0.01]} />
                <meshPhysicalMaterial color={wStyle.panelColor} roughness={wStyle.panelRoughness - 0.1} clearcoat={0.4} clearcoatRoughness={0.2} />
              </mesh>
            );
          }
          break;
        }

        case 'retro': {
          // ビーズボード: 縦の細いストリップを等間隔配置
          const stripSpacing = 0.08;
          const stripWidth = 0.02;
          const stripCount = Math.floor(len / stripSpacing);

          // ベースパネル
          elements.push(
            <mesh
              key={`wn-retro-base-${wall.id}`}
              position={[posX, WAINSCOT_HEIGHT / 2, posZ]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[len, WAINSCOT_HEIGHT - 0.05, 0.006]} />
              <meshPhysicalMaterial color={wStyle.panelColor} roughness={wStyle.panelRoughness} />
            </mesh>
          );

          // 縦ストリップ
          for (let si = 0; si < stripCount; si++) {
            const stripAlongWall = si * stripSpacing - len / 2 + stripSpacing / 2;
            const sx = posX + Math.cos(angle) * stripAlongWall + nx * 0.004;
            const sz = posZ + Math.sin(angle) * stripAlongWall + ny * 0.004;

            elements.push(
              <mesh
                key={`wn-retro-strip-${wall.id}-${si}`}
                position={[sx, WAINSCOT_HEIGHT / 2, sz]}
                rotation={[0, -angle, 0]}
              >
                <boxGeometry args={[stripWidth, WAINSCOT_HEIGHT - 0.08, 0.005]} />
                <meshPhysicalMaterial color={wStyle.panelColor} roughness={wStyle.panelRoughness + 0.1} />
              </mesh>
            );
          }
          break;
        }

        case 'japanese': {
          // 水平木製スラット: 3本の横板
          const slats = [0.25, 0.50, 0.75]; // 高さ比率
          for (let si = 0; si < slats.length; si++) {
            const slatY = slats[si] * WAINSCOT_HEIGHT;
            elements.push(
              <mesh
                key={`wn-jp-slat-${wall.id}-${si}`}
                position={[posX, slatY, posZ]}
                rotation={[0, -angle, 0]}
              >
                <boxGeometry args={[len - 0.04, 0.06, 0.008]} />
                <meshPhysicalMaterial color={wStyle.panelColor} roughness={wStyle.panelRoughness} clearcoat={0.15} clearcoatRoughness={0.3} />
              </mesh>
            );
          }
          break;
        }

        case 'cafe': {
          // シンプルフラットパネル
          elements.push(
            <mesh
              key={`wn-cafe-panel-${wall.id}`}
              position={[posX, WAINSCOT_HEIGHT / 2, posZ]}
              rotation={[0, -angle, 0]}
            >
              <boxGeometry args={[len - 0.02, WAINSCOT_HEIGHT - 0.05, 0.006]} />
              <meshPhysicalMaterial color={wStyle.panelColor} roughness={wStyle.panelRoughness} clearcoat={0.2} clearcoatRoughness={0.3} />
            </mesh>
          );
          break;
        }
      }

      // --- チェアレール（全スタイル共通: 腰壁上端のトリム） ---
      const railX = posX + nx * 0.006;
      const railZ = posZ + ny * 0.006;
      elements.push(
        <mesh
          key={`wn-rail-${wall.id}`}
          position={[railX, WAINSCOT_HEIGHT, railZ]}
          rotation={[0, -angle, 0]}
        >
          <boxGeometry args={[len, CHAIR_RAIL_HEIGHT, CHAIR_RAIL_DEPTH]} />
          <meshPhysicalMaterial color={wStyle.railColor} roughness={0.4} clearcoat={0.2} clearcoatRoughness={0.3} />
        </mesh>
      );
    }

    return elements;
  }, [walls, openings, style.name, wStyle]);

  return <group>{meshes}</group>;
});
