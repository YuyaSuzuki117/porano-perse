'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment, Opening } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { wallLength, wallAngle } from '@/lib/geometry';

interface WallNichesProps {
  walls: WallSegment[];
  openings: Opening[];
  roomHeight: number;
  style: StyleConfig;
}

/** ニッチのスタイル別設定 */
interface NicheStyleConfig {
  enabled: boolean;
  innerColor: string;
  lightColor: string;
  ornament: 'vase' | 'pot' | 'sphere' | 'cross' | null;
}

const NICHE_WIDTH = 0.5;
const NICHE_HEIGHT = 0.6;
const NICHE_DEPTH = 0.1;
const NICHE_CENTER_Y = 1.4;
const FRAME_WIDTH = 0.03;
const FRAME_DEPTH = 0.01;
const MAX_NICHES = 3;
const MIN_WALL_LENGTH = 3;

function getNicheStyle(styleName: string): NicheStyleConfig {
  switch (styleName) {
    case 'luxury':
      return { enabled: true, innerColor: '#1A0A04', lightColor: '#FFF5E0', ornament: 'vase' };
    case 'japanese':
      return { enabled: true, innerColor: '#C4A882', lightColor: '#FFF0D0', ornament: 'pot' };
    case 'modern':
      return { enabled: true, innerColor: '#333333', lightColor: '#FFFFFF', ornament: 'sphere' };
    case 'medical':
      return { enabled: true, innerColor: '#E0E8F0', lightColor: '#F0F8FF', ornament: 'cross' };
    default:
      return { enabled: false, innerColor: '', lightColor: '', ornament: null };
  }
}

/** wallColorを少し暗くしてフレーム色を生成 */
function darkenColor(hex: string, factor: number = 0.7): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return '#' + c.getHexString();
}

interface NichePlacement {
  position: THREE.Vector3;
  rotationY: number;
  /** 壁の法線方向（内側向き）単位ベクトル */
  normalX: number;
  normalZ: number;
}

/**
 * 壁面ニッチ（飾り棚用くぼみ）コンポーネント
 * luxury / japanese / modern / medical スタイルのみ表示
 */
/** ニッチのprops比較: walls数・openings数・スタイル名のみで判定 */
function wallNichePropsAreEqual(prev: WallNichesProps, next: WallNichesProps): boolean {
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.openings.length !== next.openings.length) return false;
  if (prev.roomHeight !== next.roomHeight) return false;
  if (prev.style.name !== next.style.name) return false;
  return true;
}

export const WallNiches = React.memo(function WallNiches({ walls, openings, roomHeight, style }: WallNichesProps) {
  const nicheStyle = useMemo(() => getNicheStyle(style.name), [style.name]);

  const placements = useMemo(() => {
    if (!nicheStyle.enabled) return [];

    // 壁を「開口部なし」優先でソートし、3m以上のみ対象
    const candidates: { wall: WallSegment; hasOpenings: boolean; len: number }[] = [];

    for (const wall of walls) {
      const len = wallLength(wall);
      if (len < MIN_WALL_LENGTH) continue;
      const wallOpenings = openings.filter((o) => o.wallId === wall.id);
      candidates.push({ wall, hasOpenings: wallOpenings.length > 0, len });
    }

    // 開口部なし優先、次に壁長さ降順
    candidates.sort((a, b) => {
      if (a.hasOpenings !== b.hasOpenings) return a.hasOpenings ? 1 : -1;
      return b.len - a.len;
    });

    const results: NichePlacement[] = [];

    for (const { wall, len } of candidates) {
      if (results.length >= MAX_NICHES) break;

      const wallOpeningsForWall = openings.filter((o) => o.wallId === wall.id);
      const angle = wallAngle(wall);

      const dx = (wall.end.x - wall.start.x) / len;
      const dy = (wall.end.y - wall.start.y) / len;

      // 壁の法線（右回り = 内側向き）
      const nx = dy;
      const ny = -dx;

      // 壁の中央に配置
      const ratio = 0.5;
      const alongWall = len * ratio;

      // 開口部と重なるかチェック（ニッチ幅分のマージン）
      const overlaps = wallOpeningsForWall.some((op) => {
        const opStart = op.positionAlongWall;
        const opEnd = opStart + op.width;
        return alongWall > opStart - NICHE_WIDTH && alongWall < opEnd + NICHE_WIDTH;
      });
      if (overlaps) continue;

      // 2D→3D: 壁面上の位置（法線方向に少しオフセット）
      const px = wall.start.x + dx * alongWall + nx * 0.01;
      const pz = wall.start.y + dy * alongWall + ny * 0.01;

      results.push({
        position: new THREE.Vector3(px, NICHE_CENTER_Y, pz),
        rotationY: -angle + Math.PI,
        normalX: nx,
        normalZ: ny,
      });
    }

    return results;
  }, [walls, openings, nicheStyle.enabled]);

  if (!nicheStyle.enabled || placements.length === 0) return null;

  const frameColor = darkenColor(style.wallColor, 0.7);

  return (
    <group>
      {placements.map((p, i) => (
        <NicheUnit
          key={`niche-${i}`}
          position={p.position}
          rotationY={p.rotationY}
          nicheStyle={nicheStyle}
          frameColor={frameColor}
          normalX={p.normalX}
          normalZ={p.normalZ}
        />
      ))}
    </group>
  );
}, wallNichePropsAreEqual);

// ============================================================
// 個別ニッチユニット
// ============================================================

interface NicheUnitProps {
  position: THREE.Vector3;
  rotationY: number;
  nicheStyle: NicheStyleConfig;
  frameColor: string;
  normalX: number;
  normalZ: number;
}

function NicheUnit({ position, rotationY, nicheStyle, frameColor, normalX, normalZ }: NicheUnitProps) {
  const halfW = NICHE_WIDTH / 2;
  const halfH = NICHE_HEIGHT / 2;
  const halfD = NICHE_DEPTH / 2;

  // くぼみの中心は法線方向に NICHE_DEPTH/2 だけ壁の内側にオフセット
  // ローカル座標系では Z- 方向が壁の内側（法線方向）
  const innerOffset = -halfD;

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, rotationY, 0]}>
      {/* 背面パネル */}
      <mesh position={[0, 0, innerOffset - halfD]}>
        <planeGeometry args={[NICHE_WIDTH, NICHE_HEIGHT]} />
        <meshStandardMaterial color={nicheStyle.innerColor} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* 上面 */}
      <mesh position={[0, halfH, innerOffset]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[NICHE_WIDTH, NICHE_DEPTH]} />
        <meshStandardMaterial color={nicheStyle.innerColor} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* 下面 */}
      <mesh position={[0, -halfH, innerOffset]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[NICHE_WIDTH, NICHE_DEPTH]} />
        <meshStandardMaterial color={nicheStyle.innerColor} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* 左側面 */}
      <mesh position={[-halfW, 0, innerOffset]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[NICHE_DEPTH, NICHE_HEIGHT]} />
        <meshStandardMaterial color={nicheStyle.innerColor} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* 右側面 */}
      <mesh position={[halfW, 0, innerOffset]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[NICHE_DEPTH, NICHE_HEIGHT]} />
        <meshStandardMaterial color={nicheStyle.innerColor} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>

      {/* アクセント照明（背面中央上部） */}
      <pointLight
        position={[0, halfH * 0.6, innerOffset - halfD + 0.02]}
        color={nicheStyle.lightColor}
        intensity={0.5}
        distance={1}
        decay={2}
        castShadow={false}
      />

      {/* フレーム: 開口部周囲の細い枠 */}
      {/* 上フレーム */}
      <mesh position={[0, halfH + FRAME_WIDTH / 2, -FRAME_DEPTH / 2]}>
        <boxGeometry args={[NICHE_WIDTH + FRAME_WIDTH * 2, FRAME_WIDTH, FRAME_DEPTH]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      {/* 下フレーム */}
      <mesh position={[0, -halfH - FRAME_WIDTH / 2, -FRAME_DEPTH / 2]}>
        <boxGeometry args={[NICHE_WIDTH + FRAME_WIDTH * 2, FRAME_WIDTH, FRAME_DEPTH]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      {/* 左フレーム */}
      <mesh position={[-halfW - FRAME_WIDTH / 2, 0, -FRAME_DEPTH / 2]}>
        <boxGeometry args={[FRAME_WIDTH, NICHE_HEIGHT, FRAME_DEPTH]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      {/* 右フレーム */}
      <mesh position={[halfW + FRAME_WIDTH / 2, 0, -FRAME_DEPTH / 2]}>
        <boxGeometry args={[FRAME_WIDTH, NICHE_HEIGHT, FRAME_DEPTH]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>

      {/* オブジェ */}
      <NicheOrnament type={nicheStyle.ornament} innerOffset={innerOffset} nicheStyle={nicheStyle} />
    </group>
  );
}

// ============================================================
// ニッチ内オブジェ
// ============================================================

interface NicheOrnamentProps {
  type: NicheStyleConfig['ornament'];
  innerOffset: number;
  nicheStyle: NicheStyleConfig;
}

function NicheOrnament({ type, innerOffset, nicheStyle }: NicheOrnamentProps) {
  const baseY = -NICHE_HEIGHT / 2 + 0.01; // 下面の少し上

  switch (type) {
    case 'vase':
      // 小さな花瓶 (luxury)
      return (
        <group position={[0, baseY, innerOffset]}>
          {/* 本体 */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.12, 16]} />
            <meshStandardMaterial color="#C9A84C" roughness={0.3} metalness={0.4} />
          </mesh>
          {/* 口部 */}
          <mesh position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.03, 0.025, 0.02, 16]} />
            <meshStandardMaterial color="#C9A84C" roughness={0.3} metalness={0.4} />
          </mesh>
        </group>
      );

    case 'pot':
      // 小さな壺 (japanese / 床の間風)
      return (
        <group position={[0, baseY, innerOffset]}>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.02, 0.04, 0.10, 16]} />
            <meshStandardMaterial color="#8B6914" roughness={0.7} metalness={0.0} />
          </mesh>
          {/* 蓋 */}
          <mesh position={[0, 0.105, 0]}>
            <cylinderGeometry args={[0.005, 0.025, 0.015, 16]} />
            <meshStandardMaterial color="#6B5A3C" roughness={0.7} />
          </mesh>
        </group>
      );

    case 'sphere':
      // 球体オブジェ (modern)
      return (
        <mesh position={[0, baseY + 0.05, innerOffset]}>
          <sphereGeometry args={[0.05, 24, 24]} />
          <meshStandardMaterial color="#808080" roughness={0.2} metalness={0.6} />
        </mesh>
      );

    case 'cross':
      // 十字マーク (medical)
      return (
        <group position={[0, baseY + 0.1, innerOffset + 0.01]}>
          {/* 縦棒 */}
          <mesh>
            <boxGeometry args={[0.015, 0.08, 0.005]} />
            <meshStandardMaterial color="#2E86AB" roughness={0.4} />
          </mesh>
          {/* 横棒 */}
          <mesh>
            <boxGeometry args={[0.08, 0.015, 0.005]} />
            <meshStandardMaterial color="#2E86AB" roughness={0.4} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}
