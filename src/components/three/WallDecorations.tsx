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
  /** 配置インデックス（装飾タイプの決定的選択用） */
  index: number;
}

/** 装飾タイプ一覧 */
type DecorationType =
  | 'painting'
  | 'menuboard'
  | 'clock'
  | 'pipe'
  | 'sconce'
  | 'framed_art'
  | 'wall_shelf'
  | 'signage'
  | 'wall_mirror'
  | 'exposed_pipe';

/** スタイル別の装飾タイプ候補テーブル */
const STYLE_DECORATIONS: Record<string, DecorationType[]> = {
  industrial: ['exposed_pipe', 'signage', 'clock'],
  medical: ['clock', 'wall_mirror', 'wall_shelf'],
  modern: ['clock', 'wall_mirror', 'framed_art', 'wall_shelf'],
  cafe: ['menuboard', 'sconce', 'framed_art', 'signage', 'wall_shelf'],
  japanese: ['menuboard', 'sconce', 'framed_art'],
  luxury: ['framed_art', 'sconce', 'wall_mirror'],
  scandinavian: ['painting', 'wall_shelf', 'wall_mirror', 'framed_art'],
  retro: ['painting', 'sconce', 'signage'],
  minimal: ['painting', 'wall_mirror', 'framed_art'],
  office: ['clock', 'wall_shelf', 'framed_art'],
};

/**
 * 壁装飾品コンポーネント
 * スタイルに応じて絵画、メニューボード、時計、パイプ、照明、ミラー等を壁面に自動配置
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
    let idx = 0;

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
          rotationY: -angle + Math.PI,
          wallLen: len,
          index: idx++,
        });
      }
    }

    return results;
  }, [walls, openings]);

  // スタイルに基づく装飾タイプの選定（配置ごとに決定的にバリエーション）
  const styleName = style.name;
  const decorTypes = useMemo(() => {
    const candidates = STYLE_DECORATIONS[styleName] ?? ['clock', 'painting'];
    return placements.map((p) => {
      const hash = seededRandom(p.index * 17 + 42);
      return candidates[Math.floor(hash * candidates.length)];
    });
  }, [styleName, placements]);

  return (
    <group>
      {placements.map((p, i) => {
        const decorType = decorTypes[i];
        const baseProps = {
          position: p.position,
          rotationY: p.rotationY,
          roomHeight,
          style,
        };

        switch (decorType) {
          case 'painting':
            return <PaintingFrame key={`deco-${i}`} {...baseProps} />;
          case 'menuboard':
            return <MenuBoard key={`deco-${i}`} {...baseProps} />;
          case 'clock':
            return <WallClock key={`deco-${i}`} {...baseProps} />;
          case 'pipe':
          case 'exposed_pipe':
            return (
              <IndustrialPipe
                key={`deco-${i}`}
                position={p.position}
                rotationY={p.rotationY}
                roomHeight={roomHeight}
                wallLen={p.wallLen}
              />
            );
          case 'sconce':
            return <WallSconce key={`deco-${i}`} {...baseProps} />;
          case 'framed_art':
            return <FramedArt key={`deco-${i}`} {...baseProps} />;
          case 'wall_shelf':
            return <WallShelf key={`deco-${i}`} {...baseProps} />;
          case 'signage':
            return <Signage key={`deco-${i}`} {...baseProps} />;
          case 'wall_mirror':
            return <WallMirror key={`deco-${i}`} {...baseProps} />;
          default:
            return <WallClock key={`deco-${i}`} {...baseProps} />;
        }
      })}
    </group>
  );
}, wallDecorPropsAreEqual);

// ============================================================
// 共通型・ユーティリティ
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

// ============================================================
// 絵画フレーム（既存）
// ============================================================

function PaintingFrame({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const frameW = 0.6;
  const frameH = 0.4;
  const frameD = 0.03;
  const borderW = 0.03;
  const y = roomHeight * 0.6;

  const frameColor = style.name === 'luxury'
    ? '#C9A84C'
    : style.name === 'scandinavian'
      ? '#F0F0F0'
      : '#8B6914';

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
      <mesh castShadow>
        <boxGeometry args={[frameW, frameH, frameD]} />
        <meshStandardMaterial color={frameColor} roughness={0.4} metalness={style.name === 'luxury' ? 0.6 : 0.1} />
      </mesh>
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
// メニューボード（既存）
// ============================================================

function MenuBoard({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const boardW = 0.8;
  const boardH = 0.5;
  const borderW = 0.04;
  const y = roomHeight * 0.55;

  const frameColor = style.name === 'japanese' ? '#6B5A3C' : '#5C3D1A';

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      <mesh castShadow>
        <boxGeometry args={[boardW + borderW * 2, boardH + borderW * 2, 0.025]} />
        <meshStandardMaterial color={frameColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.013]}>
        <planeGeometry args={[boardW, boardH]} />
        <meshStandardMaterial
          color="#1A2A1A"
          roughness={0.9}
          emissive="#FFFFFF"
          emissiveIntensity={0.02}
        />
      </mesh>
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
// 壁掛け時計（既存）
// ============================================================

function WallClock({ position, rotationY, roomHeight }: DecoBaseProps) {
  const radius = 0.15;
  const depth = 0.02;
  const y = roomHeight * 0.7;

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[radius + 0.01, radius + 0.01, depth + 0.005, 32]} />
        <meshStandardMaterial color="#2A2A2A" roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.001]}>
        <circleGeometry args={[radius, 32]} />
        <meshStandardMaterial color="#F8F8F0" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.02, depth / 2 + 0.003]} rotation={[0, 0, Math.PI / 6]}>
        <boxGeometry args={[0.008, radius * 0.5, 0.003]} />
        <meshStandardMaterial color="#1A1A1A" />
      </mesh>
      <mesh position={[0.02, 0, depth / 2 + 0.004]} rotation={[0, 0, -Math.PI / 3]}>
        <boxGeometry args={[0.005, radius * 0.7, 0.002]} />
        <meshStandardMaterial color="#1A1A1A" />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.005]}>
        <circleGeometry args={[0.008, 16]} />
        <meshStandardMaterial color="#333333" />
      </mesh>
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
// インダストリアルパイプ（拡張: バルブホイール + ブラケット強化）
// ============================================================

interface PipeProps {
  position: THREE.Vector3;
  rotationY: number;
  roomHeight: number;
  wallLen: number;
}

/** バルブホイールジオメトリ（モジュールスコープ） */
const valveTorusGeo = new THREE.TorusGeometry(0.035, 0.005, 8, 16);
const valveStemGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.04, 8);

function IndustrialPipe({ position, rotationY, roomHeight, wallLen }: PipeProps) {
  const pipeRadius = 0.02;
  const pipeLen = wallLen * 0.8;
  const yHigh = roomHeight * 0.8;
  const yLow = roomHeight * 0.3;

  // ブラケット位置: 1mごとに配置
  const bracketPositions = useMemo(() => {
    const positions: number[] = [];
    const count = Math.max(2, Math.floor(pipeLen));
    for (let i = 0; i <= count; i++) {
      positions.push(-pipeLen / 2 + (pipeLen / count) * i);
    }
    return positions;
  }, [pipeLen]);

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
      {/* ブラケット（上下パイプ） */}
      {bracketPositions.map((x, i) => (
        <group key={`br-${i}`}>
          <mesh position={[x, yHigh, 0]}>
            <boxGeometry args={[0.03, 0.04, 0.03]} />
            <meshStandardMaterial color="#555555" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[x, yLow, 0]}>
            <boxGeometry args={[0.03, 0.04, 0.03]} />
            <meshStandardMaterial color="#555555" metalness={0.5} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* バルブホイール（上部パイプ中央付近） */}
      <group position={[0, yHigh, pipeRadius + 0.02]}>
        {/* トーラス（ホイール） */}
        <mesh geometry={valveTorusGeo} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#8B0000" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* ステム */}
        <mesh geometry={valveStemGeo} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#555555" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

// ============================================================
// 壁付け照明（新規）
// ============================================================

/** 照明バックプレートジオメトリ */
const sconceBackplateGeo = new THREE.BoxGeometry(0.06, 0.08, 0.02);
/** 照明シェードジオメトリ */
const sconceShadeGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.08, 16, 1, true);

function WallSconce({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const y = 1.8;
  if (y > roomHeight - 0.2) return null;

  const shadeColor = style.name === 'luxury' ? '#D4AF37'
    : style.name === 'cafe' ? '#CD853F'
    : style.name === 'retro' ? '#B8860B'
    : style.name === 'japanese' ? '#8B7355'
    : '#C0C0C0';

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      {/* バックプレート */}
      <mesh geometry={sconceBackplateGeo} castShadow>
        <meshStandardMaterial color="#4A4A4A" metalness={0.4} roughness={0.3} />
      </mesh>
      {/* シェード */}
      <mesh geometry={sconceShadeGeo} position={[0, -0.02, 0.03]} rotation={[0, 0, 0]}>
        <meshStandardMaterial
          color={shadeColor}
          roughness={0.5}
          metalness={style.name === 'luxury' ? 0.5 : 0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* ポイントライト */}
      <pointLight
        position={[0, -0.05, 0.06]}
        intensity={0.3}
        distance={2}
        color="#FFF5E1"
      />
    </group>
  );
}

// ============================================================
// 額装アート（新規）
// ============================================================

/** Canvas APIで抽象アートテクスチャを生成 */
function createArtTexture(styleName: string, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 170;
  const ctx = canvas.getContext('2d')!;

  if (styleName === 'japanese') {
    // 墨絵風: 水平筆ストローク
    ctx.fillStyle = '#F5F0E8';
    ctx.fillRect(0, 0, 256, 170);
    for (let i = 0; i < 5; i++) {
      const y = 20 + seededRandom(seed + i * 7) * 130;
      const gray = Math.floor(seededRandom(seed + i * 13) * 80);
      ctx.strokeStyle = `rgba(${gray}, ${gray}, ${gray}, ${0.3 + seededRandom(seed + i * 3) * 0.5})`;
      ctx.lineWidth = 2 + seededRandom(seed + i * 11) * 8;
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.bezierCurveTo(
        80, y - 10 + seededRandom(seed + i) * 20,
        180, y + 10 - seededRandom(seed + i + 1) * 20,
        236, y + seededRandom(seed + i + 2) * 15
      );
      ctx.stroke();
    }
  } else if (styleName === 'luxury') {
    // ゴールド背景+ダーク内部
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, 256, 170);
    // 抽象ゴールドアクセント
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = `rgba(212, 175, 55, ${0.2 + seededRandom(seed + i * 5) * 0.3})`;
      const cx = seededRandom(seed + i * 9) * 200 + 28;
      const cy = seededRandom(seed + i * 11) * 120 + 25;
      ctx.beginPath();
      ctx.arc(cx, cy, 20 + seededRandom(seed + i) * 40, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (styleName === 'scandinavian') {
    // ライトフレーム+幾何学パターン
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(0, 0, 256, 170);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 50;
      const y = 30 + seededRandom(seed + i) * 80;
      const size = 15 + seededRandom(seed + i + 1) * 25;
      ctx.strokeRect(x, y, size, size);
    }
  } else {
    // cafe等: 暖色系水彩ブロブ
    ctx.fillStyle = '#FFF8EE';
    ctx.fillRect(0, 0, 256, 170);
    const warmColors = ['#D4956A', '#C17850', '#A0522D', '#E8B88A', '#8B6914'];
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = warmColors[Math.floor(seededRandom(seed + i * 7) * warmColors.length)];
      ctx.globalAlpha = 0.3 + seededRandom(seed + i * 3) * 0.4;
      const cx = seededRandom(seed + i * 9) * 200 + 28;
      const cy = seededRandom(seed + i * 11) * 120 + 25;
      ctx.beginPath();
      ctx.arc(cx, cy, 15 + seededRandom(seed + i * 5) * 35, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function FramedArt({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const frameW = 0.6;
  const frameH = 0.4;
  const frameD = 0.025;
  const borderW = 0.025;
  const y = 1.4;
  if (y > roomHeight - 0.3) return null;

  const frameColor = style.name === 'luxury' ? '#C9A84C'
    : style.name === 'scandinavian' ? '#E8E8E8'
    : '#6B5A3C';

  const seed = Math.abs(position.x * 100 + position.z * 37);

  const artTexture = useMemo(() => {
    return createArtTexture(style.name, seed);
  }, [style.name, seed]);

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      {/* フレーム */}
      <mesh castShadow>
        <boxGeometry args={[frameW, frameH, frameD]} />
        <meshStandardMaterial
          color={frameColor}
          roughness={0.4}
          metalness={style.name === 'luxury' ? 0.6 : 0.1}
        />
      </mesh>
      {/* キャンバス面 */}
      <mesh position={[0, 0, frameD / 2 + 0.001]}>
        <planeGeometry args={[frameW - borderW * 2, frameH - borderW * 2]} />
        <meshStandardMaterial map={artTexture} roughness={0.8} />
      </mesh>
    </group>
  );
}

// ============================================================
// 飾り棚（新規）
// ============================================================

/** 棚板ジオメトリ */
const shelfBoardGeo = new THREE.BoxGeometry(0.4, 0.02, 0.15);
/** 棚上の本ジオメトリ */
const shelfBookGeo = new THREE.BoxGeometry(0.03, 0.08, 0.06);
/** 棚上の球飾りジオメトリ */
const shelfSphereGeo = new THREE.SphereGeometry(0.025, 12, 12);
/** 棚上の花瓶ジオメトリ */
const shelfVaseGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.07, 12);

function WallShelf({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const y = 1.5;
  if (y > roomHeight - 0.2) return null;

  const shelfColor = style.name === 'scandinavian' ? '#F0E6D2'
    : style.name === 'cafe' ? '#8B6914'
    : '#A0522D';

  const seed = Math.abs(position.x * 100 + position.z * 37);

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      {/* 棚板 */}
      <mesh geometry={shelfBoardGeo} castShadow>
        <meshStandardMaterial color={shelfColor} roughness={0.6} />
      </mesh>
      {/* ブラケット（左右） */}
      {[-0.15, 0.15].map((x, i) => (
        <mesh key={`sb-${i}`} position={[x, -0.03, 0]}>
          <boxGeometry args={[0.02, 0.06, 0.02]} />
          <meshStandardMaterial color="#555555" metalness={0.4} roughness={0.4} />
        </mesh>
      ))}
      {/* 棚上のオブジェクト */}
      {/* 本 */}
      <mesh geometry={shelfBookGeo} position={[-0.1, 0.05, 0]}>
        <meshStandardMaterial color={seededRandom(seed) > 0.5 ? '#4A6741' : '#8B4513'} roughness={0.7} />
      </mesh>
      {seededRandom(seed + 1) > 0.4 && (
        <mesh geometry={shelfBookGeo} position={[-0.06, 0.05, 0]}>
          <meshStandardMaterial color="#2F4F4F" roughness={0.7} />
        </mesh>
      )}
      {/* 球飾り */}
      <mesh geometry={shelfSphereGeo} position={[0.05, 0.035, 0]}>
        <meshStandardMaterial
          color={style.furniturePalette.accent}
          roughness={0.3}
          metalness={0.2}
        />
      </mesh>
      {/* 花瓶 */}
      <mesh geometry={shelfVaseGeo} position={[0.13, 0.045, 0]}>
        <meshStandardMaterial color="#D4C4A8" roughness={0.5} />
      </mesh>
    </group>
  );
}

// ============================================================
// 看板（新規）
// ============================================================

function Signage({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const boardW = 0.5;
  const boardH = 0.3;
  const y = 1.6;
  if (y > roomHeight - 0.2) return null;

  const boardColor = style.name === 'cafe' ? '#5C3D1A'
    : style.name === 'industrial' ? '#4A4A4A'
    : style.name === 'retro' ? '#6B3A2A'
    : '#3A3A3A';

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      {/* 看板ボード */}
      <mesh castShadow>
        <boxGeometry args={[boardW, boardH, 0.02]} />
        <meshStandardMaterial color={boardColor} roughness={0.6} />
      </mesh>
      {/* 疑似テキスト行（水平バー） */}
      {[0.06, 0, -0.06].map((lineY, i) => (
        <mesh key={i} position={[0, lineY, 0.011]}>
          <planeGeometry args={[boardW * 0.6 - i * 0.02, 0.012]} />
          <meshStandardMaterial
            color="#F0E6D2"
            transparent
            opacity={0.6 - i * 0.1}
          />
        </mesh>
      ))}
      {/* ブラケット（上部の庇） */}
      <mesh position={[0, boardH / 2 + 0.015, -0.01]} castShadow>
        <boxGeometry args={[boardW + 0.04, 0.02, 0.04]} />
        <meshStandardMaterial color="#333333" metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  );
}

// ============================================================
// 壁掛けミラー（新規）
// ============================================================

function WallMirror({ position, rotationY, roomHeight, style }: DecoBaseProps) {
  const y = 1.4;
  if (y > roomHeight - 0.3) return null;

  const isCircle = style.name === 'scandinavian' || style.name === 'modern';
  const frameColor = style.name === 'luxury' ? '#C9A84C'
    : style.name === 'scandinavian' ? '#F0E6D2'
    : '#4A4A4A';

  if (isCircle) {
    const radius = 0.2;
    return (
      <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
        {/* フレーム（円形） */}
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[radius + 0.015, radius + 0.015, 0.02, 32]} />
          <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.3} />
        </mesh>
        {/* ミラー面 */}
        <mesh position={[0, 0, 0.011]}>
          <circleGeometry args={[radius, 32]} />
          <meshStandardMaterial
            color="#E8E8E8"
            metalness={0.95}
            roughness={0.05}
            envMapIntensity={2.0}
          />
        </mesh>
      </group>
    );
  }

  // 矩形ミラー
  const mirrorW = 0.4;
  const mirrorH = 0.55;
  const borderW = 0.02;

  return (
    <group position={[position.x, y, position.z]} rotation={[0, rotationY, 0]}>
      {/* フレーム */}
      <mesh castShadow>
        <boxGeometry args={[mirrorW + borderW * 2, mirrorH + borderW * 2, 0.02]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.4} />
      </mesh>
      {/* ミラー面 */}
      <mesh position={[0, 0, 0.011]}>
        <planeGeometry args={[mirrorW, mirrorH]} />
        <meshStandardMaterial
          color="#E8E8E8"
          metalness={0.95}
          roughness={0.05}
          envMapIntensity={2.0}
        />
      </mesh>
    </group>
  );
}
