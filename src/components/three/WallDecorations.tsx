'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment, Opening } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { wallLength, wallAngle } from '@/lib/geometry';

interface WallDecorationsProps {
  walls: WallSegment[];
  openings: Opening[];
  roomHeight: number;
  style: StyleConfig;
}

/** 各壁に対する装飾品の配置情報 */
interface DecorationPlacement {
  /** 3D位置 */
  position: THREE.Vector3;
  /** Y軸回転（壁面に平行） */
  rotationY: number;
  /** 配置する壁の長さ */
  wallLen: number;
}

/**
 * 壁装飾品コンポーネント
 * スタイルに応じて絵画、メニューボード、時計、パイプなどを壁面に自動配置
 */
/** 壁装飾のprops比較: walls数・openings数・スタイル名・天井高のみで判定 */
function wallDecorPropsAreEqual(prev: WallDecorationsProps, next: WallDecorationsProps): boolean {
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.openings.length !== next.openings.length) return false;
  if (prev.roomHeight !== next.roomHeight) return false;
  if (prev.style.name !== next.style.name) return false;
  return true;
}

export const WallDecorations = React.memo(function WallDecorations({ walls, openings, roomHeight, style }: WallDecorationsProps) {
  // 配置可能な壁と位置を計算
  const placements = useMemo(() => {
    const results: DecorationPlacement[] = [];

    for (const wall of walls) {
      const len = wallLength(wall);
      // 1.5m未満の壁はスキップ
      if (len < 1.5) continue;

      const wallOpenings = openings.filter((o) => o.wallId === wall.id);
      const angle = wallAngle(wall);

      // 壁の方向ベクトル（単位）
      const dx = (wall.end.x - wall.start.x) / len;
      const dy = (wall.end.y - wall.start.y) / len;

      // 壁の法線（右回り = 内側向き）: (dy, -dx) を2D座標系で
      const nx = dy;
      const ny = -dx;

      // 配置割合: 長い壁(3m以上)は1/3と2/3、短い壁は中点
      const ratios = len >= 3 ? [1 / 3, 2 / 3] : [0.5];

      for (const ratio of ratios) {
        const alongWall = len * ratio;

        // この位置が開口部と重なるかチェック
        const overlaps = wallOpenings.some((op) => {
          const opStart = op.positionAlongWall;
          const opEnd = opStart + op.width;
          // 装飾品の幅分のマージン(0.5m)
          return alongWall > opStart - 0.5 && alongWall < opEnd + 0.5;
        });
        if (overlaps) continue;

        // 2D位置 → 3D位置
        const px = wall.start.x + dx * alongWall + nx * 0.01;
        const pz = wall.start.y + dy * alongWall + ny * 0.01;

        results.push({
          position: new THREE.Vector3(px, 0, pz),
          rotationY: -angle + Math.PI, // 壁面に向かい合う向き
          wallLen: len,
        });
      }
    }

    return results;
  }, [walls, openings]);

  // スタイルに基づく装飾タイプの選定
  const styleName = style.name;
  const decorType = useMemo(() => {
    if (styleName === 'industrial') return 'pipe' as const;
    if (styleName === 'medical' || styleName === 'modern') return 'clock' as const;
    if (styleName === 'cafe' || styleName === 'japanese') return 'menuboard' as const;
    if (styleName === 'luxury' || styleName === 'scandinavian' || styleName === 'retro') return 'painting' as const;
    // minimal, office など
    if (styleName === 'minimal') return 'painting' as const;
    return 'clock' as const;
  }, [styleName]);

  return (
    <group>
      {placements.map((p, i) => {
        switch (decorType) {
          case 'painting':
            return (
              <PaintingFrame
                key={`deco-${i}`}
                position={p.position}
                rotationY={p.rotationY}
                roomHeight={roomHeight}
                style={style}
              />
            );
          case 'menuboard':
            return (
              <MenuBoard
                key={`deco-${i}`}
                position={p.position}
                rotationY={p.rotationY}
                roomHeight={roomHeight}
                style={style}
              />
            );
          case 'clock':
            return (
              <WallClock
                key={`deco-${i}`}
                position={p.position}
                rotationY={p.rotationY}
                roomHeight={roomHeight}
                style={style}
              />
            );
          case 'pipe':
            return (
              <IndustrialPipe
                key={`deco-${i}`}
                position={p.position}
                rotationY={p.rotationY}
                roomHeight={roomHeight}
                wallLen={p.wallLen}
              />
            );
        }
      })}
    </group>
  );
}, wallDecorPropsAreEqual);

// ============================================================
// 絵画フレーム
// ============================================================

interface DecoBaseProps {
  position: THREE.Vector3;
  rotationY: number;
  roomHeight: number;
  style: StyleConfig;
}

/** シードベースの簡易乱数（位置から決定的に色を生成） */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function PaintingFrame({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const frameW = 0.6;
  const frameH = 0.4;
  const frameD = 0.03;
  const borderW = 0.03;
  const y = roomHeight * 0.6;

  // フレーム色（スタイル別）
  const frameColor = style.name === 'luxury'
    ? '#C9A84C'
    : style.name === 'scandinavian'
      ? '#F0F0F0'
      : '#8B6914'; // 木製 (cafe, retro, minimal)

  // プロシージャルカラーブロック（2-3色のストライプ）
  const seed = Math.abs(position.x * 100 + position.z * 37);
  const stripeColors = useMemo(() => {
    const palette = style.furniturePalette;
    const colors = [palette.accent, palette.primary, palette.secondary];
    const count = seededRandom(seed) > 0.5 ? 3 : 2;
    return colors.slice(0, count);
  }, [style.furniturePalette, seed]);

  const innerW = frameW - borderW * 2;
  const innerH = frameH - borderW * 2;
  const stripeW = innerW / stripeColors.length;

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      {/* フレーム外枠 */}
      <mesh castShadow>
        <boxGeometry args={[frameW, frameH, frameD]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} metalness={style.name === 'luxury' ? 0.6 : 0.1} />
      </mesh>
      {/* 内部カラーストライプ */}
      {stripeColors.map((color, i) => (
        <mesh
          key={i}
          position={[
            -innerW / 2 + stripeW * i + stripeW / 2,
            0,
            frameD / 2 + 0.001,
          ]}
        >
          <planeGeometry args={[stripeW - 0.005, innerH]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// メニューボード
// ============================================================

function MenuBoard({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const boardW = 0.8;
  const boardH = 0.5;
  const borderW = 0.04;
  const y = roomHeight * 0.55;

  const frameColor = style.name === 'japanese' ? '#6B5A3C' : '#5C3D1A';

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      {/* 木製フレーム */}
      <mesh castShadow>
        <boxGeometry args={[boardW + borderW * 2, boardH + borderW * 2, 0.025]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} />
      </mesh>
      {/* 黒板面 */}
      <mesh position={[0, 0, 0.013]}>
        <planeGeometry args={[boardW, boardH]} />
        <meshStandardMaterial
          color="#1A2A1A"
          roughness={0.9}
          emissive="#FFFFFF"
          emissiveIntensity={0.02}
        />
      </mesh>
      {/* 疑似テキスト行（白い細いライン） */}
      {[0.12, 0.04, -0.04, -0.12].map((lineY, i) => (
        <mesh key={i} position={[0, lineY, 0.014]}>
          <planeGeometry args={[boardW * 0.6 - i * 0.05, 0.008]} />
          <meshStandardMaterial
            color="#FFFFFF"
            transparent
            opacity={0.3 - i * 0.05}
            emissive="#FFFFFF"
            emissiveIntensity={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
// 壁掛け時計
// ============================================================

function WallClock({ position, rotationY, roomHeight }: DecoBaseProps) {
  const radius = 0.15;
  const depth = 0.02;
  const y = roomHeight * 0.7;

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      {/* 暗い枠 */}
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius + 0.01, radius + 0.01, depth + 0.005, 32]} />
        <meshStandardMaterial color="#2A2A2A" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* 白い文字盤 */}
      <mesh position={[0, 0, depth / 2 + 0.001]} rotation={[0, 0, 0]}>
        <circleGeometry args={[radius, 32]} />
        <meshStandardMaterial color="#F8F8F0" roughness={0.6} />
      </mesh>
      {/* 時針 */}
      <mesh position={[0, 0.02, depth / 2 + 0.003]} rotation={[0, 0, Math.PI / 6]}>
        <boxGeometry args={[0.008, radius * 0.5, 0.003]} />
        <meshStandardMaterial color="#1A1A1A" />
      </mesh>
      {/* 分針 */}
      <mesh position={[0.02, 0, depth / 2 + 0.004]} rotation={[0, 0, -Math.PI / 3]}>
        <boxGeometry args={[0.005, radius * 0.7, 0.002]} />
        <meshStandardMaterial color="#1A1A1A" />
      </mesh>
      {/* 中心点 */}
      <mesh position={[0, 0, depth / 2 + 0.005]}>
        <circleGeometry args={[0.008, 16]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
      {/* 12時マーク（小さな目印） */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
        const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
        const r = radius * 0.85;
        const markSize = h % 3 === 0 ? 0.012 : 0.006;
        return (
          <mesh
            key={h}
            position={[Math.cos(a) * r, Math.sin(a) * r, depth / 2 + 0.002]}
          >
            <circleGeometry args={[markSize, 8]} />
            <meshStandardMaterial color="#333333" />
          </mesh>
        );
      })}
    </group>
  );
}

// ============================================================
// インダストリアルパイプ
// ============================================================

interface PipeProps {
  position: THREE.Vector3;
  rotationY: number;
  roomHeight: number;
  wallLen: number;
}

function IndustrialPipe({ position, rotationY, roomHeight, wallLen }: PipeProps) {
  const pipeRadius = 0.02;
  const pipeLen = wallLen * 0.8;
  const yHigh = roomHeight * 0.8;
  const yLow = roomHeight * 0.3;

  return (
    <group position={[position.x, 0, position.z]} rotation={[0, rotationY, 0]}>
      {/* 上部パイプ */}
      <mesh position={[0, yHigh, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[pipeRadius, pipeRadius, pipeLen, 12]} />
        <meshStandardMaterial color="#7A7A7A" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* 下部パイプ */}
      <mesh position={[0, yLow, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[pipeRadius, pipeRadius, pipeLen, 12]} />
        <meshStandardMaterial color="#6A6A6A" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* パイプ固定ブラケット（上） */}
      {[-pipeLen * 0.3, 0, pipeLen * 0.3].map((x, i) => (
        <mesh key={`bh-${i}`} position={[x, yHigh, 0]}>
          <boxGeometry args={[0.03, 0.04, 0.03]} />
          <meshStandardMaterial color="#555555" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      {/* パイプ固定ブラケット（下） */}
      {[-pipeLen * 0.3, 0, pipeLen * 0.3].map((x, i) => (
        <mesh key={`bl-${i}`} position={[x, yLow, 0]}>
          <boxGeometry args={[0.03, 0.04, 0.03]} />
          <meshStandardMaterial color="#555555" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
