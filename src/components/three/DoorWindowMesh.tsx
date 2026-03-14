'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Opening } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';

interface DoorWindowMeshProps {
  opening: Opening;
  wallThickness: number;
  style?: StyleConfig;
}

// ドア枠: 幅0.05m、深さ0.02m
const DOOR_FRAME_WIDTH = 0.05;
const DOOR_FRAME_DEPTH = 0.02;
// 窓枠: 幅0.04m、深さ0.02m
const WINDOW_FRAME_WIDTH = 0.04;
const WINDOW_FRAME_DEPTH = 0.02;

// 格子バーのサイズ
const GLAZING_BAR_WIDTH = 0.02;
const GLAZING_BAR_DEPTH = 0.015;

// ドアケーシング（額縁モールディング）
const DOOR_CASING_WIDTH = 0.06;
const DOOR_CASING_DEPTH = 0.03;

// 窓ケーシング（額縁モールディング）
const WINDOW_CASING_WIDTH = 0.05;
const WINDOW_CASING_DEPTH = 0.025;

// 窓台（シル）
const WINDOW_SILL_WIDTH = 0.08;
const WINDOW_SILL_DEPTH = 0.06;

/** スタイルに応じたケーシング設定を返す */
interface CasingStyle {
  color: string;
  roughness: number;
  metalness: number;
  casingWidth?: number; // minimal用の上書き
  hasKeystone?: boolean; // luxury用の装飾キーストーン
}

function getDoorCasingStyle(style?: StyleConfig): CasingStyle {
  if (!style) return { color: '#C4A882', roughness: 0.6, metalness: 0.0 };
  switch (style.name) {
    case 'japanese': return { color: '#C4A882', roughness: 0.6, metalness: 0.0 };
    case 'luxury': return { color: '#2A1506', roughness: 0.3, metalness: 0.0, hasKeystone: true };
    case 'industrial': return { color: '#666666', roughness: 0.5, metalness: 0.4 };
    case 'modern': return { color: '#444444', roughness: 0.4, metalness: 0.0 };
    case 'cafe': return { color: '#6B4226', roughness: 0.5, metalness: 0.0 };
    case 'minimal': return { color: '#FFFFFF', roughness: 0.5, metalness: 0.0, casingWidth: 0.03 };
    case 'scandinavian': return { color: '#E0CDB4', roughness: 0.5, metalness: 0.0 };
    case 'retro': return { color: '#704214', roughness: 0.6, metalness: 0.0 };
    case 'medical': return { color: '#E8E8E8', roughness: 0.5, metalness: 0.0 };
    default: return { color: '#C4A882', roughness: 0.6, metalness: 0.0 };
  }
}

function getWindowCasingStyle(style?: StyleConfig): CasingStyle {
  if (!style) return { color: '#C4A882', roughness: 0.6, metalness: 0.0 };
  switch (style.name) {
    case 'japanese': return { color: '#C4A882', roughness: 0.6, metalness: 0.0 };
    case 'luxury': return { color: '#2A1506', roughness: 0.3, metalness: 0.0, hasKeystone: true };
    case 'industrial': return { color: '#666666', roughness: 0.5, metalness: 0.4 };
    case 'modern': return { color: '#444444', roughness: 0.4, metalness: 0.0 };
    case 'cafe': return { color: '#6B4226', roughness: 0.5, metalness: 0.0 };
    case 'minimal': return { color: '#FFFFFF', roughness: 0.5, metalness: 0.0, casingWidth: 0.03 };
    case 'scandinavian': return { color: '#E0CDB4', roughness: 0.5, metalness: 0.0 };
    case 'retro': return { color: '#704214', roughness: 0.6, metalness: 0.0 };
    case 'medical': return { color: '#E8E8E8', roughness: 0.5, metalness: 0.0 };
    default: return { color: '#C4A882', roughness: 0.6, metalness: 0.0 };
  }
}

/** スタイルに応じたドア枠色を返す */
function getDoorFrameColor(style?: StyleConfig): string {
  if (!style) return '#5C4033';
  switch (style.name) {
    case 'japanese': return '#6B5A3C';
    case 'luxury': return style.accentColor || '#1A1210';
    case 'industrial': return '#3A3A3A';
    case 'medical': return '#D0D0D0';
    case 'scandinavian': return '#C8B896';
    case 'retro': return '#4A2810';
    default: return style.accentColor || '#5C4033';
  }
}

/** スタイルに応じた窓枠色を返す */
function getWindowFrameColor(style?: StyleConfig): string {
  if (!style) return '#FFFFFF';
  switch (style.name) {
    case 'japanese': return '#8B7355';
    case 'luxury': return '#E8E0D0';
    case 'industrial': return '#555555';
    case 'medical': return '#FFFFFF';
    case 'scandinavian': return '#FFFFFF';
    case 'retro': return '#DDD5C0';
    default: return '#FFFFFF';
  }
}

/** スタイルに応じたガラス色を返す */
function getGlassColor(style?: StyleConfig): string {
  if (!style) return '#E8F4FD';
  switch (style.name) {
    case 'japanese': return '#F0EBE0';
    case 'luxury': return '#E8EFF8';
    case 'industrial': return '#D0D8E0';
    case 'modern': return '#E5F0F8';
    case 'cafe': return '#F0EDE0';
    case 'minimal': return '#F0F5FA';
    case 'scandinavian': return '#F5F0E8';
    case 'retro': return '#E8E0D0';
    case 'medical': return '#E8F0F8';
    default: return '#E8F4FD';
  }
}

/** スタイルに応じたガラスのroughnessを返す */
function getGlassRoughness(style?: StyleConfig): number {
  if (!style) return 0.05;
  switch (style.name) {
    case 'industrial': return 0.15;
    case 'retro': return 0.1;
    default: return 0.05;
  }
}

/** 格子（グレーズバー）を表示するスタイルかどうか */
function hasGlazingBars(style?: StyleConfig): boolean {
  if (!style) return false;
  return style.name === 'japanese' || style.name === 'scandinavian';
}

/** ドア枠ケーシング（左・右・上の3辺） */
function DoorCasing({ opening, wallThickness, style }: DoorWindowMeshProps) {
  const { positionAlongWall, width, height, elevation } = opening;
  const casingStyle = getDoorCasingStyle(style);
  const cw = casingStyle.casingWidth ?? DOOR_CASING_WIDTH;
  const cd = DOOR_CASING_DEPTH;
  const fw = DOOR_FRAME_WIDTH; // 既存フレーム幅（ケーシングはこの外側）

  const casingGeos = useMemo(() => {
    const zOffset = wallThickness / 2 + cd / 2; // 壁面の外側に突出
    const geos: { geo: THREE.BoxGeometry; pos: [number, number, number] }[] = [];

    // 左ケーシング（フレーム外側）
    geos.push({
      geo: new THREE.BoxGeometry(cw, height + fw, cd),
      pos: [positionAlongWall - fw - cw / 2, elevation + height / 2 + fw / 2, zOffset],
    });
    // 右ケーシング（フレーム外側）
    geos.push({
      geo: new THREE.BoxGeometry(cw, height + fw, cd),
      pos: [positionAlongWall + width + fw + cw / 2, elevation + height / 2 + fw / 2, zOffset],
    });
    // 上ケーシング（フレーム外側、左右ケーシングの幅も含む）
    geos.push({
      geo: new THREE.BoxGeometry(width + fw * 2 + cw * 2, cw, cd),
      pos: [positionAlongWall + width / 2, elevation + height + fw + cw / 2, zOffset],
    });

    // 背面側にも同じケーシング
    geos.push({
      geo: new THREE.BoxGeometry(cw, height + fw, cd),
      pos: [positionAlongWall - fw - cw / 2, elevation + height / 2 + fw / 2, -zOffset],
    });
    geos.push({
      geo: new THREE.BoxGeometry(cw, height + fw, cd),
      pos: [positionAlongWall + width + fw + cw / 2, elevation + height / 2 + fw / 2, -zOffset],
    });
    geos.push({
      geo: new THREE.BoxGeometry(width + fw * 2 + cw * 2, cw, cd),
      pos: [positionAlongWall + width / 2, elevation + height + fw + cw / 2, -zOffset],
    });

    return geos;
  }, [positionAlongWall, width, height, elevation, wallThickness, cw, cd, fw]);

  // Luxuryスタイルのキーストーン（上部中央の小さな三角形装飾）
  const keystoneGeo = useMemo(() => {
    if (!casingStyle.hasKeystone) return null;
    const zOffset = wallThickness / 2 + cd / 2;
    const keystoneSize = 0.06;
    const shape = new THREE.Shape();
    shape.moveTo(-keystoneSize / 2, 0);
    shape.lineTo(keystoneSize / 2, 0);
    shape.lineTo(0, keystoneSize * 0.8);
    shape.closePath();
    const extrudeSettings = { depth: cd, bevelEnabled: false };
    return {
      geo: new THREE.ExtrudeGeometry(shape, extrudeSettings),
      posFront: [
        positionAlongWall + width / 2,
        elevation + height + fw + cw,
        zOffset - cd / 2,
      ] as [number, number, number],
      posBack: [
        positionAlongWall + width / 2,
        elevation + height + fw + cw,
        -zOffset - cd / 2,
      ] as [number, number, number],
    };
  }, [casingStyle.hasKeystone, positionAlongWall, width, height, elevation, wallThickness, cw, cd, fw]);

  return (
    <group>
      {casingGeos.map((c, i) => (
        <mesh key={`dc-${i}`} geometry={c.geo} position={c.pos} castShadow receiveShadow>
          <meshStandardMaterial
            color={casingStyle.color}
            roughness={casingStyle.roughness}
            metalness={casingStyle.metalness}
          />
        </mesh>
      ))}
      {keystoneGeo && (
        <>
          <mesh geometry={keystoneGeo.geo} position={keystoneGeo.posFront} castShadow receiveShadow>
            <meshStandardMaterial color={casingStyle.color} roughness={casingStyle.roughness} metalness={casingStyle.metalness} />
          </mesh>
          <mesh geometry={keystoneGeo.geo} position={keystoneGeo.posBack} castShadow receiveShadow>
            <meshStandardMaterial color={casingStyle.color} roughness={casingStyle.roughness} metalness={casingStyle.metalness} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** 窓枠ケーシング（左・右・上・下の4辺 + 窓台シル） */
function WindowCasing({ opening, wallThickness, style }: DoorWindowMeshProps) {
  const { positionAlongWall, width, height, elevation } = opening;
  const casingStyle = getWindowCasingStyle(style);
  const cw = casingStyle.casingWidth ?? WINDOW_CASING_WIDTH;
  const cd = WINDOW_CASING_DEPTH;
  const fw = WINDOW_FRAME_WIDTH; // 既存フレーム幅

  const casingGeos = useMemo(() => {
    const zOffset = wallThickness / 2 + cd / 2;
    const geos: { geo: THREE.BoxGeometry; pos: [number, number, number] }[] = [];

    // 左ケーシング
    geos.push({
      geo: new THREE.BoxGeometry(cw, height + fw * 2, cd),
      pos: [positionAlongWall - fw - cw / 2, elevation + height / 2, zOffset],
    });
    // 右ケーシング
    geos.push({
      geo: new THREE.BoxGeometry(cw, height + fw * 2, cd),
      pos: [positionAlongWall + width + fw + cw / 2, elevation + height / 2, zOffset],
    });
    // 上ケーシング
    geos.push({
      geo: new THREE.BoxGeometry(width + fw * 2 + cw * 2, cw, cd),
      pos: [positionAlongWall + width / 2, elevation + height + fw + cw / 2, zOffset],
    });
    // 下ケーシング（シルの上に位置）
    geos.push({
      geo: new THREE.BoxGeometry(width + fw * 2 + cw * 2, cw, cd),
      pos: [positionAlongWall + width / 2, elevation - fw * 1.5 - cw / 2, zOffset],
    });

    // 背面側
    geos.push({
      geo: new THREE.BoxGeometry(cw, height + fw * 2, cd),
      pos: [positionAlongWall - fw - cw / 2, elevation + height / 2, -zOffset],
    });
    geos.push({
      geo: new THREE.BoxGeometry(cw, height + fw * 2, cd),
      pos: [positionAlongWall + width + fw + cw / 2, elevation + height / 2, -zOffset],
    });
    geos.push({
      geo: new THREE.BoxGeometry(width + fw * 2 + cw * 2, cw, cd),
      pos: [positionAlongWall + width / 2, elevation + height + fw + cw / 2, -zOffset],
    });
    geos.push({
      geo: new THREE.BoxGeometry(width + fw * 2 + cw * 2, cw, cd),
      pos: [positionAlongWall + width / 2, elevation - fw * 1.5 - cw / 2, -zOffset],
    });

    return geos;
  }, [positionAlongWall, width, height, elevation, wallThickness, cw, cd, fw]);

  // 窓台（シル）: 手前側のみ、幅広・奥行大きめ
  const sillGeo = useMemo(() => {
    const sw = WINDOW_SILL_WIDTH;
    const sd = WINDOW_SILL_DEPTH;
    const totalWidth = width + fw * 2 + sw * 2;
    const sillY = elevation - fw * 1.5 - cw;
    const zOffset = wallThickness / 2 + sd / 2;

    return {
      geo: new THREE.BoxGeometry(totalWidth, 0.02, sd),
      pos: [positionAlongWall + width / 2, sillY, zOffset] as [number, number, number],
    };
  }, [positionAlongWall, width, elevation, wallThickness, cw, fw]);

  // Luxuryスタイルのキーストーン
  const keystoneGeo = useMemo(() => {
    if (!casingStyle.hasKeystone) return null;
    const zOffset = wallThickness / 2 + cd / 2;
    const keystoneSize = 0.05;
    const shape = new THREE.Shape();
    shape.moveTo(-keystoneSize / 2, 0);
    shape.lineTo(keystoneSize / 2, 0);
    shape.lineTo(0, keystoneSize * 0.8);
    shape.closePath();
    const extrudeSettings = { depth: cd, bevelEnabled: false };
    return {
      geo: new THREE.ExtrudeGeometry(shape, extrudeSettings),
      posFront: [
        positionAlongWall + width / 2,
        elevation + height + fw + cw,
        zOffset - cd / 2,
      ] as [number, number, number],
      posBack: [
        positionAlongWall + width / 2,
        elevation + height + fw + cw,
        -zOffset - cd / 2,
      ] as [number, number, number],
    };
  }, [casingStyle.hasKeystone, positionAlongWall, width, height, elevation, wallThickness, cw, cd, fw]);

  return (
    <group>
      {casingGeos.map((c, i) => (
        <mesh key={`wc-${i}`} geometry={c.geo} position={c.pos} castShadow receiveShadow>
          <meshStandardMaterial
            color={casingStyle.color}
            roughness={casingStyle.roughness}
            metalness={casingStyle.metalness}
          />
        </mesh>
      ))}
      {/* 窓台（シル） */}
      <mesh geometry={sillGeo.geo} position={sillGeo.pos} castShadow receiveShadow>
        <meshStandardMaterial
          color={casingStyle.color}
          roughness={casingStyle.roughness}
          metalness={casingStyle.metalness}
        />
      </mesh>
      {keystoneGeo && (
        <>
          <mesh geometry={keystoneGeo.geo} position={keystoneGeo.posFront} castShadow receiveShadow>
            <meshStandardMaterial color={casingStyle.color} roughness={casingStyle.roughness} metalness={casingStyle.metalness} />
          </mesh>
          <mesh geometry={keystoneGeo.geo} position={keystoneGeo.posBack} castShadow receiveShadow>
            <meshStandardMaterial color={casingStyle.color} roughness={casingStyle.roughness} metalness={casingStyle.metalness} />
          </mesh>
        </>
      )}
    </group>
  );
}

export function DoorWindowMesh({ opening, wallThickness, style }: DoorWindowMeshProps) {
  const { type, positionAlongWall, width, height, elevation } = opening;

  const frameWidth = type === 'door' ? DOOR_FRAME_WIDTH : WINDOW_FRAME_WIDTH;
  const frameDepthExtra = type === 'door' ? DOOR_FRAME_DEPTH : WINDOW_FRAME_DEPTH;
  const frameColor = type === 'door' ? getDoorFrameColor(style) : getWindowFrameColor(style);
  const glassColor = getGlassColor(style);
  const glassRoughness = getGlassRoughness(style);
  const showGlazingBars = hasGlazingBars(style);

  const frameGeometries = useMemo(() => {
    const d = wallThickness + frameDepthExtra;
    const fw = frameWidth;
    const geos: { geo: THREE.BoxGeometry; pos: [number, number, number] }[] = [];

    // 左枠
    geos.push({
      geo: new THREE.BoxGeometry(fw, height, d),
      pos: [positionAlongWall - fw / 2, elevation + height / 2, 0],
    });
    // 右枠
    geos.push({
      geo: new THREE.BoxGeometry(fw, height, d),
      pos: [positionAlongWall + width + fw / 2, elevation + height / 2, 0],
    });
    // 上枠
    geos.push({
      geo: new THREE.BoxGeometry(width + fw * 2, fw, d),
      pos: [positionAlongWall + width / 2, elevation + height + fw / 2, 0],
    });

    // 窓の場合: 下枠（窓台）
    if (type === 'window') {
      geos.push({
        geo: new THREE.BoxGeometry(width + fw * 2, fw * 1.5, d + 0.02),
        pos: [positionAlongWall + width / 2, elevation - fw * 0.75, 0],
      });
    }

    return geos;
  }, [positionAlongWall, width, height, elevation, wallThickness, type, frameWidth, frameDepthExtra]);

  // Glass for windows
  const glassMesh = useMemo(() => {
    if (type !== 'window') return null;
    return {
      geo: new THREE.BoxGeometry(width, height, 0.006),
      pos: [positionAlongWall + width / 2, elevation + height / 2, 0] as [number, number, number],
    };
  }, [type, positionAlongWall, width, height, elevation]);

  // 窓の格子（グレーズバー）
  const glazingBarGeometries = useMemo(() => {
    if (type !== 'window' || !showGlazingBars) return [];
    const bars: { geo: THREE.BoxGeometry; pos: [number, number, number] }[] = [];
    const centerX = positionAlongWall + width / 2;
    const centerY = elevation + height / 2;

    // 縦バー（中央）
    bars.push({
      geo: new THREE.BoxGeometry(GLAZING_BAR_WIDTH, height, GLAZING_BAR_DEPTH),
      pos: [centerX, centerY, 0],
    });
    // 横バー（中央）
    bars.push({
      geo: new THREE.BoxGeometry(width, GLAZING_BAR_WIDTH, GLAZING_BAR_DEPTH),
      pos: [centerX, centerY, 0],
    });

    return bars;
  }, [type, showGlazingBars, positionAlongWall, width, height, elevation]);

  // Door panel
  const doorMesh = useMemo(() => {
    if (type !== 'door') return null;
    return {
      geo: new THREE.BoxGeometry(width - 0.02, height - 0.02, 0.04),
      pos: [positionAlongWall + width / 2, elevation + height / 2, 0] as [number, number, number],
    };
  }, [type, positionAlongWall, width, height, elevation]);

  // Door glass panel (upper 40% of door, 80% width)
  const doorGlassMesh = useMemo(() => {
    if (type !== 'door') return null;
    const glassWidth = (width - 0.02) * 0.8;
    const glassHeight = (height - 0.02) * 0.4;
    const doorTop = elevation + height - 0.01; // top of door panel
    const glassCenterY = doorTop - glassHeight / 2;

    return {
      geo: new THREE.BoxGeometry(glassWidth, glassHeight, 0.006),
      pos: [positionAlongWall + width / 2, glassCenterY, 0.018] as [number, number, number],
    };
  }, [type, positionAlongWall, width, height, elevation]);

  return (
    <group>
      {/* 枠（Frame） */}
      {frameGeometries.map((f, i) => (
        <mesh key={i} geometry={f.geo} position={f.pos} castShadow receiveShadow>
          <meshStandardMaterial
            color={frameColor}
            roughness={style?.name === 'industrial' ? 0.4 : 0.6}
            metalness={style?.name === 'industrial' ? 0.3 : 0.1}
          />
        </mesh>
      ))}

      {/* Window Glass */}
      {glassMesh && (
        <mesh geometry={glassMesh.geo} position={glassMesh.pos}>
          <meshPhysicalMaterial
            color={glassColor}
            transparent={true}
            opacity={0.3}
            transmission={0.8}
            thickness={0.01}
            roughness={glassRoughness}
            metalness={0.0}
            ior={1.5}
            envMapIntensity={2.0}
            clearcoat={1.0}
            clearcoatRoughness={0.0}
          />
        </mesh>
      )}

      {/* Window Glazing Bars (japanese & scandinavian only) */}
      {glazingBarGeometries.map((bar, i) => (
        <mesh key={`bar-${i}`} geometry={bar.geo} position={bar.pos}>
          <meshStandardMaterial
            color={frameColor}
            roughness={style?.name === 'industrial' ? 0.4 : 0.6}
            metalness={style?.name === 'industrial' ? 0.3 : 0.1}
          />
        </mesh>
      ))}

      {/* Door panel */}
      {doorMesh && (
        <mesh geometry={doorMesh.geo} position={doorMesh.pos} castShadow>
          <meshStandardMaterial color="#8B6914" roughness={0.7} metalness={0.05} />
        </mesh>
      )}

      {/* Door Glass Panel (upper 40%) */}
      {doorGlassMesh && (
        <mesh geometry={doorGlassMesh.geo} position={doorGlassMesh.pos}>
          <meshPhysicalMaterial
            color={glassColor}
            transparent={true}
            opacity={0.3}
            transmission={0.8}
            thickness={0.01}
            roughness={glassRoughness}
            metalness={0.0}
            ior={1.5}
            envMapIntensity={2.0}
            clearcoat={1.0}
            clearcoatRoughness={0.0}
          />
        </mesh>
      )}

      {/* ケーシング（額縁モールディング） */}
      {type === 'door' && (
        <DoorCasing opening={opening} wallThickness={wallThickness} style={style} />
      )}
      {type === 'window' && (
        <WindowCasing opening={opening} wallThickness={wallThickness} style={style} />
      )}
    </group>
  );
}
