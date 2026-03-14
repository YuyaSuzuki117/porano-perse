'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment, Opening } from '@/types/floor-plan';
import { wallAngle } from '@/lib/geometry';
import { useEditorStore } from '@/stores/useEditorStore';

interface WindowLightBeamsProps {
  walls: WallSegment[];
  openings: Opening[];
  roomHeight: number;
  qualityLevel?: 'high' | 'medium' | 'low';
}

/** 光条のprops比較: walls数・openings数・天井高・品質のみで判定 */
function lightBeamPropsAreEqual(prev: WindowLightBeamsProps, next: WindowLightBeamsProps): boolean {
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.openings.length !== next.openings.length) return false;
  if (prev.roomHeight !== next.roomHeight) return false;
  if (prev.qualityLevel !== next.qualityLevel) return false;
  return true;
}

export const WindowLightBeams = React.memo(function WindowLightBeams({ walls, openings, roomHeight, qualityLevel = 'high' }: WindowLightBeamsProps) {
  const dayNight = useEditorStore((s) => s.dayNight);
  const isNight = dayNight === 'night';

  const windowOpenings = useMemo(() => {
    return openings.filter((o) => o.type === 'window');
  }, [openings]);

  const wallMap = useMemo(() => {
    const map = new Map<string, WallSegment>();
    for (const w of walls) {
      map.set(w.id, w);
    }
    return map;
  }, [walls]);

  // 部屋サイズの40%を光条の長さとする（シネマ品質）
  const beamLength = useMemo(() => {
    if (walls.length === 0) return 1;
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    return Math.max(w, d) * 0.4;
  }, [walls]);

  // lowモードでは完全無効化（hooksの後に配置）
  if (qualityLevel === 'low') return null;

  return (
    <group>
      {windowOpenings.map((op) => {
        const wall = wallMap.get(op.wallId);
        if (!wall) return null;
        return (
          <LightBeamMesh
            key={`beam-${op.id}`}
            opening={op}
            wall={wall}
            beamLength={beamLength}
            roomHeight={roomHeight}
            isNight={isNight}
            qualityLevel={qualityLevel}
          />
        );
      })}
    </group>
  );
}, lightBeamPropsAreEqual);

interface LightBeamMeshProps {
  opening: Opening;
  wall: WallSegment;
  beamLength: number;
  roomHeight: number;
  isNight: boolean;
  qualityLevel: 'high' | 'medium' | 'low';
}

function LightBeamMesh({ opening, wall, beamLength, isNight, qualityLevel }: LightBeamMeshProps) {
  const { geometry, vertexColors } = useMemo(() => {
    const angle = wallAngle(wall);

    // 壁の法線（内側向き）: wall.start→wall.end の右向き法線
    const nx = Math.sin(angle);
    const nz = -Math.cos(angle);

    // 窓の中心位置（ワールド座標）
    const alongWall = opening.positionAlongWall + opening.width / 2;
    const wx = wall.start.x + Math.cos(angle) * alongWall;
    const wz = wall.start.y + Math.sin(angle) * alongWall;
    const wy = opening.elevation + opening.height / 2;

    // 窓の半サイズ
    const hw = opening.width / 2;
    const hh = opening.height / 2;

    // 壁に沿った方向（3D）
    const tx = Math.cos(angle);
    const tz = Math.sin(angle);

    // 光の方向: 法線 + 下方向
    const dirX = nx;
    const dirY = -0.5;
    const dirZ = nz;

    // 先端面のオフセット
    const endOffsetX = dirX * beamLength;
    const endOffsetY = dirY * beamLength;
    const endOffsetZ = dirZ * beamLength;

    // 先端面は1.5倍に拡大
    const spread = 1.5;

    // 8頂点: 0-3が窓面、4-7が先端面
    const v0 = [
      wx - tx * hw + nx * wall.thickness * 0.5,
      wy - hh,
      wz - tz * hw + nz * wall.thickness * 0.5,
    ];
    const v1 = [
      wx + tx * hw + nx * wall.thickness * 0.5,
      wy - hh,
      wz + tz * hw + nz * wall.thickness * 0.5,
    ];
    const v2 = [
      wx + tx * hw + nx * wall.thickness * 0.5,
      wy + hh,
      wz + tz * hw + nz * wall.thickness * 0.5,
    ];
    const v3 = [
      wx - tx * hw + nx * wall.thickness * 0.5,
      wy + hh,
      wz - tz * hw + nz * wall.thickness * 0.5,
    ];

    const ecx = wx + endOffsetX + nx * wall.thickness * 0.5;
    const ecy = wy + endOffsetY;
    const ecz = wz + endOffsetZ + nz * wall.thickness * 0.5;

    const v4 = [
      ecx - tx * hw * spread,
      ecy - hh * spread,
      ecz - tz * hw * spread,
    ];
    const v5 = [
      ecx + tx * hw * spread,
      ecy - hh * spread,
      ecz + tz * hw * spread,
    ];
    const v6 = [
      ecx + tx * hw * spread,
      ecy + hh * spread,
      ecz + tz * hw * spread,
    ];
    const v7 = [
      ecx - tx * hw * spread,
      ecy + hh * spread,
      ecz - tz * hw * spread,
    ];

    const vertices = new Float32Array([
      ...v0, ...v1, ...v2, ...v3,
      ...v4, ...v5, ...v6, ...v7,
    ]);

    // 頂点カラー: 窓面(0-3)は明るく、先端面(4-7)はフェードアウト
    // これにより光ビームが窓から遠ざかるほど自然に減衰
    const colors = new Float32Array([
      // 窓面 v0-v3: 明るい暖色
      1.0, 0.98, 0.88,
      1.0, 0.98, 0.88,
      1.0, 0.98, 0.88,
      1.0, 0.98, 0.88,
      // 先端面 v4-v7: フェードアウト（暖色寄りの薄い色）
      1.0, 0.95, 0.8,
      1.0, 0.95, 0.8,
      1.0, 0.95, 0.8,
      1.0, 0.95, 0.8,
    ]);

    // 6面 x 2三角形 = 12三角形
    const indices = new Uint16Array([
      0, 1, 2, 0, 2, 3,
      4, 6, 5, 4, 7, 6,
      0, 5, 1, 0, 4, 5,
      3, 2, 6, 3, 6, 7,
      0, 3, 7, 0, 7, 4,
      1, 5, 6, 1, 6, 2,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    return { geometry: geo, vertexColors: true as const };
  }, [opening, wall, beamLength]);

  return (
    <mesh geometry={geometry} renderOrder={999}>
      <meshBasicMaterial
        color={isNight ? '#8888CC' : '#FFF5D6'}
        transparent={true}
        opacity={(isNight ? 0.06 : 0.15) * (qualityLevel === 'medium' ? 0.5 : 1)}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexColors={vertexColors}
      />
    </mesh>
  );
}
