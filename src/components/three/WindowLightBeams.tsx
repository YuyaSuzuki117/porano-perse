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
}

/** 光条のprops比較: walls数・openings数・天井高のみで判定 */
function lightBeamPropsAreEqual(prev: WindowLightBeamsProps, next: WindowLightBeamsProps): boolean {
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.openings.length !== next.openings.length) return false;
  if (prev.roomHeight !== next.roomHeight) return false;
  return true;
}

export const WindowLightBeams = React.memo(function WindowLightBeams({ walls, openings, roomHeight }: WindowLightBeamsProps) {
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

  // 部屋サイズの30%を光条の長さとする
  const beamLength = useMemo(() => {
    if (walls.length === 0) return 1;
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    return Math.max(w, d) * 0.3;
  }, [walls]);

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
}

function LightBeamMesh({ opening, wall, beamLength, isNight }: LightBeamMeshProps) {
  const geometry = useMemo(() => {
    const angle = wallAngle(wall);

    // 壁の法線（内側向き）: wall.start→wall.end の右向き法線
    // 2D: wallDir = (cos(angle), sin(angle)), 右法線 = (sin(angle), -cos(angle))
    // 3D座標系では z = 2DのY なので: normalX = sin(angle), normalZ = -cos(angle)
    // ただし壁メッシュは -angle で回転されており、pointLight は -thickness/2 で内側配置
    // 法線方向 = (sin(angle), 0, -cos(angle)) これが壁の「手前側」
    // 内側 or 外側は壁配置に依存するが、WallMeshGroup の pointLight が
    // z = -thickness/2 - 0.1 で配置しているので、ローカル -z が内側

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
    // 窓面の4頂点（ワールド座標）
    const v0 = [ // 左下
      wx - tx * hw + nx * wall.thickness * 0.5,
      wy - hh,
      wz - tz * hw + nz * wall.thickness * 0.5,
    ];
    const v1 = [ // 右下
      wx + tx * hw + nx * wall.thickness * 0.5,
      wy - hh,
      wz + tz * hw + nz * wall.thickness * 0.5,
    ];
    const v2 = [ // 右上
      wx + tx * hw + nx * wall.thickness * 0.5,
      wy + hh,
      wz + tz * hw + nz * wall.thickness * 0.5,
    ];
    const v3 = [ // 左上
      wx - tx * hw + nx * wall.thickness * 0.5,
      wy + hh,
      wz - tz * hw + nz * wall.thickness * 0.5,
    ];

    // 先端面の4頂点（窓面中心からオフセット + 拡大）
    const ecx = wx + endOffsetX + nx * wall.thickness * 0.5;
    const ecy = wy + endOffsetY;
    const ecz = wz + endOffsetZ + nz * wall.thickness * 0.5;

    const v4 = [ // 左下
      ecx - tx * hw * spread,
      ecy - hh * spread,
      ecz - tz * hw * spread,
    ];
    const v5 = [ // 右下
      ecx + tx * hw * spread,
      ecy - hh * spread,
      ecz + tz * hw * spread,
    ];
    const v6 = [ // 右上
      ecx + tx * hw * spread,
      ecy + hh * spread,
      ecz + tz * hw * spread,
    ];
    const v7 = [ // 左上
      ecx - tx * hw * spread,
      ecy + hh * spread,
      ecz - tz * hw * spread,
    ];

    const vertices = new Float32Array([
      ...v0, ...v1, ...v2, ...v3,
      ...v4, ...v5, ...v6, ...v7,
    ]);

    // 6面 x 2三角形 = 12三角形
    const indices = new Uint16Array([
      // 窓面（前面）
      0, 1, 2, 0, 2, 3,
      // 先端面（後面）
      4, 6, 5, 4, 7, 6,
      // 下面
      0, 5, 1, 0, 4, 5,
      // 上面
      3, 2, 6, 3, 6, 7,
      // 左面
      0, 3, 7, 0, 7, 4,
      // 右面
      1, 5, 6, 1, 6, 2,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    return geo;
  }, [opening, wall, beamLength]);

  return (
    <mesh geometry={geometry} renderOrder={999}>
      <meshBasicMaterial
        color={isNight ? '#8888CC' : '#FFFFEE'}
        transparent={true}
        opacity={isNight ? 0.03 : 0.08}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
