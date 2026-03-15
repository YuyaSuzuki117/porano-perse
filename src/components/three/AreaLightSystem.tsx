'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Opening, WallSegment } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { useCameraStore } from '@/stores/useCameraStore';
import { wallLength, wallAngle } from '@/lib/geometry';

interface AreaLightSystemProps {
  /** 窓・ドアの開口部リスト */
  openings: Opening[];
  /** 壁セグメントリスト */
  walls: WallSegment[];
  /** 部屋の天井高 */
  roomHeight: number;
  /** スタイル設定 */
  style: StyleConfig;
  /** 描画品質レベル */
  qualityLevel: string;
}

/** 昼間のライト色（暖白） */
const DAY_COLOR = '#FFF5E6';
/** 夜間のライト色（寒白） */
const NIGHT_COLOR = '#E0E8FF';

/** 昼間のライト強度 */
const DAY_INTENSITY = 3.0;
/** 夜間のライト強度 */
const NIGHT_INTENSITY = 0.8;

/** ライト配置情報 */
interface LightPlacement {
  /** ワールド座標上の位置 */
  position: THREE.Vector3;
  /** ライトの回転（壁法線方向に向く） */
  rotationY: number;
  /** ライトの幅（開口部幅に基づく） */
  width: number;
  /** ライトの高さ（開口部高さに基づく） */
  height: number;
}

/**
 * 窓・天井パネル用のRectAreaLightシステム
 * 各窓開口部に対して内向きの面光源を配置し、
 * 昼夜で色温度・強度を自動切替する
 */
export const AreaLightSystem = React.memo(function AreaLightSystem({
  openings,
  walls,
  roomHeight,
  style,
  qualityLevel,
}: AreaLightSystemProps) {
  const dayNight = useCameraStore((s) => s.dayNight);
  const isNight = dayNight === 'night';

  // 低品質モードではライト生成をスキップ
  if (qualityLevel === 'low') return null;

  // 窓開口部のライト配置を計算
  const windowLights = useMemo(() => {
    const placements: LightPlacement[] = [];

    // 窓のみ対象（ドアは除外）
    const windowOpenings = openings.filter((o) => o.type === 'window');

    for (const opening of windowOpenings) {
      // 対応する壁を検索
      const wall = walls.find((w) => w.id === opening.wallId);
      if (!wall) continue;

      const len = wallLength(wall);
      if (len === 0) continue;

      const angle = wallAngle(wall);

      // 壁に沿った方向の単位ベクトル
      const dx = (wall.end.x - wall.start.x) / len;
      const dy = (wall.end.y - wall.start.y) / len;

      // 壁の内側法線（右手系、部屋内部方向）
      const nx = dy;
      const nz = -dx;

      // 開口部中心のワールド座標を計算
      const centerAlong = opening.positionAlongWall + opening.width / 2;
      const px = wall.start.x + dx * centerAlong + nx * 0.05;
      const py = opening.elevation + opening.height / 2;
      const pz = wall.start.y + dy * centerAlong + nz * 0.05;

      placements.push({
        position: new THREE.Vector3(px, py, pz),
        rotationY: -angle + Math.PI,
        width: opening.width,
        height: opening.height,
      });
    }

    return placements;
  }, [openings, walls]);

  // ライト色と強度
  const lightColor = isNight ? NIGHT_COLOR : DAY_COLOR;
  const intensity = isNight ? NIGHT_INTENSITY : DAY_INTENSITY;

  return (
    <group>
      {/* 窓ごとの面光源 */}
      {windowLights.map((light, i) => (
        <group
          key={`area-light-${i}`}
          position={[light.position.x, light.position.y, light.position.z]}
          rotation={[0, light.rotationY, 0]}
        >
          <rectAreaLight
            color={lightColor}
            intensity={intensity}
            width={light.width}
            height={light.height}
          />
        </group>
      ))}

      {/* 天井面パネルライト（中品質以上） */}
      {qualityLevel === 'high' && (
        <CeilingPanelLights
          walls={walls}
          roomHeight={roomHeight}
          style={style}
          isNight={isNight}
        />
      )}
    </group>
  );
});

/** 天井パネルライトのProps */
interface CeilingPanelLightsProps {
  walls: WallSegment[];
  roomHeight: number;
  style: StyleConfig;
  isNight: boolean;
}

/**
 * 天井面パネルライト
 * 部屋の中心付近に下向きの面光源を配置
 */
const CeilingPanelLights = React.memo(function CeilingPanelLights({
  walls,
  roomHeight,
  style,
  isNight,
}: CeilingPanelLightsProps) {
  // 壁の頂点から部屋の中心を概算
  const center = useMemo(() => {
    if (walls.length === 0) return { x: 0, z: 0 };
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (const w of walls) {
      sumX += w.start.x + w.end.x;
      sumZ += w.start.y + w.end.y;
      count += 2;
    }
    return { x: sumX / count, z: sumZ / count };
  }, [walls]);

  // 天井直下に下向き面光源を配置
  const panelColor = isNight ? '#FFF0D0' : '#FFFFFF';
  const panelIntensity = isNight ? 2.0 : 0.5;

  return (
    <group position={[center.x, roomHeight - 0.02, center.z]}>
      <rectAreaLight
        color={panelColor}
        intensity={panelIntensity}
        width={1.2}
        height={1.2}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
});
