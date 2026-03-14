'use client';

// --- 日本語コメント ---
// 窓からのボリュメトリック・ゴッドレイ（光芒）エフェクト
// 窓の開口部ごとに半透明プレーンを8-12枚重ねて光の柱を表現
// AdditiveBlendingで自然な光の加算合成、useFrameで微細なシマー（揺らぎ）アニメーション

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Opening, WallSegment } from '@/types/floor-plan';
import { wallAngle } from '@/lib/geometry';

interface GodRaysProps {
  openings: Opening[];
  walls: WallSegment[];
  roomHeight: number;
  intensity?: number; // 0-1, default 0.6
  color?: string; // default warm white
  enabled?: boolean;
}

/** ゴッドレイの1枚のプレーンデータ */
interface RayPlaneData {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  baseOpacity: number;
}

/** 光芒プレーンの枚数 */
const RAY_PLANE_COUNT = 10;

/** シマーアニメーション用の一時変数（useFrame内でのnew防止） */
const _tempColor = new THREE.Color();

/** props比較: 配列長・天井高・intensity・enabled のみで判定 */
function godRaysPropsAreEqual(prev: GodRaysProps, next: GodRaysProps): boolean {
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.openings.length !== next.openings.length) return false;
  if (prev.roomHeight !== next.roomHeight) return false;
  if (prev.intensity !== next.intensity) return false;
  if (prev.color !== next.color) return false;
  if (prev.enabled !== next.enabled) return false;
  return true;
}

/**
 * ボリュメトリック・ゴッドレイエフェクト
 *
 * 窓の開口部から差し込む光の柱を半透明プレーンの積層で表現。
 * 窓に近いほど明るく、遠ざかるほどフェードアウトし、
 * ビーム幅は窓から離れるにつれ拡散（diverging beam）する。
 */
export const GodRays = React.memo(function GodRays({
  openings,
  walls,
  roomHeight,
  intensity = 0.6,
  color = '#FFF5E0',
  enabled = true,
}: GodRaysProps) {
  // 壁マップ構築
  const wallMap = useMemo(() => {
    const map = new Map<string, WallSegment>();
    for (const w of walls) {
      map.set(w.id, w);
    }
    return map;
  }, [walls]);

  // 窓開口のみフィルタ
  const windowOpenings = useMemo(() => {
    return openings.filter((o) => o.type === 'window');
  }, [openings]);

  // 部屋サイズからビーム長を算出（部屋の最大寸法の40%）
  const beamLength = useMemo(() => {
    if (walls.length === 0) return 1.5;
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    return Math.max(w, d) * 0.4;
  }, [walls]);

  // enabled=false や窓なしの場合はレンダリングしない（hooksの後）
  if (!enabled || windowOpenings.length === 0) return null;

  return (
    <group>
      {windowOpenings.map((op) => {
        const wall = wallMap.get(op.wallId);
        if (!wall) return null;
        return (
          <GodRayBeam
            key={`godray-${op.id}`}
            opening={op}
            wall={wall}
            beamLength={beamLength}
            roomHeight={roomHeight}
            intensity={intensity}
            color={color}
          />
        );
      })}
    </group>
  );
}, godRaysPropsAreEqual);

GodRays.displayName = 'GodRays';

// ---------------------------------------------------------------------------
// 個別ビームコンポーネント
// ---------------------------------------------------------------------------

interface GodRayBeamProps {
  opening: Opening;
  wall: WallSegment;
  beamLength: number;
  roomHeight: number;
  intensity: number;
  color: string;
}

function GodRayBeam({ opening, wall, beamLength, intensity, color }: GodRayBeamProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([]);

  // 各プレーンのジオメトリデータを計算
  const planes = useMemo<RayPlaneData[]>(() => {
    const angle = wallAngle(wall);

    // 壁の法線方向（内側向き）
    const nx = Math.sin(angle);
    const nz = -Math.cos(angle);

    // 窓の中心のワールド座標
    const alongWall = opening.positionAlongWall + opening.width / 2;
    const wx = wall.start.x + Math.cos(angle) * alongWall;
    const wz = wall.start.y + Math.sin(angle) * alongWall;
    const wy = opening.elevation + opening.height / 2;

    const result: RayPlaneData[] = [];

    for (let i = 0; i < RAY_PLANE_COUNT; i++) {
      const t = (i + 1) / RAY_PLANE_COUNT; // 0に近い=窓側、1=先端

      // プレーン位置: 窓面から法線方向に沿って配置 + やや下方向に傾斜
      const px = wx + nx * (wall.thickness * 0.5 + t * beamLength);
      const py = wy - t * beamLength * 0.3; // 光は下方向に傾く
      const pz = wz + nz * (wall.thickness * 0.5 + t * beamLength);

      // ビーム拡散: 窓サイズから徐々に広がる (1.0→1.8)
      const spread = 1.0 + t * 0.8;
      const planeWidth = opening.width * spread;
      const planeHeight = opening.height * spread;

      // 不透明度: 窓に近いほど明るく、先端でフェードアウト（二次減衰）
      const falloff = 1.0 - t * t;
      const baseOpacity = intensity * 0.08 * falloff;

      result.push({
        position: new THREE.Vector3(px, py, pz),
        rotation: new THREE.Euler(0, angle + Math.PI / 2, 0),
        scale: new THREE.Vector3(planeWidth, planeHeight, 1),
        baseOpacity,
      });
    }

    return result;
  }, [opening, wall, beamLength, intensity]);

  // シマーアニメーション: 不透明度を±5%で微細に揺らす
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    const mats = materialsRef.current;
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i];
      if (!mat) continue;
      const plane = planes[i];
      if (!plane) continue;
      // 各プレーンに異なる位相を与え、波のような揺らぎにする
      const shimmer = 1.0 + Math.sin(time * 1.5 + i * 0.7) * 0.05;
      mat.opacity = plane.baseOpacity * shimmer;
    }
  });

  // マテリアル参照配列を初期化
  const setMaterialRef = useMemo(() => {
    materialsRef.current = [];
    return (index: number) => (ref: THREE.MeshBasicMaterial | null) => {
      if (ref) {
        materialsRef.current[index] = ref;
      }
    };
  }, [planes]);

  _tempColor.set(color);

  return (
    <group ref={groupRef}>
      {planes.map((plane, i) => (
        <mesh
          key={i}
          position={plane.position}
          rotation={plane.rotation}
          scale={plane.scale}
          renderOrder={998}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={setMaterialRef(i)}
            color={_tempColor}
            transparent
            opacity={plane.baseOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
