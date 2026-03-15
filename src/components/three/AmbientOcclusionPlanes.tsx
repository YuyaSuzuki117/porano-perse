'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '@/stores/useEditorStore';
import { useCameraStore } from '@/stores/useCameraStore';

/** Creates a vertical gradient texture from dark to transparent (wall-floor edge) */
function createAOGradient(width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(0.25, 'rgba(0,0,0,0.14)');
  gradient.addColorStop(0.6, 'rgba(0,0,0,0.04)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Floor-edge AO gradient for horizontal corners */
function createFloorAOGradient(width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(0.2, 'rgba(0,0,0,0.10)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.03)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Corner AO gradient — radial falloff for room corners */
function createCornerAOGradient(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(0, size, 0, 0, size, size * 1.2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.20)');
  gradient.addColorStop(0.3, 'rgba(0,0,0,0.08)');
  gradient.addColorStop(0.7, 'rgba(0,0,0,0.02)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export default function AmbientOcclusionPlanes() {
  const walls = useEditorStore(s => s.walls);
  const roomHeight = useEditorStore(s => s.roomHeight);
  const qualityLevel = useCameraStore(s => s.qualityLevel);

  const { roomWidth, roomDepth } = useMemo(() => {
    if (walls.length === 0) return { roomWidth: 6, roomDepth: 6 };
    const xs = walls.flatMap(wall => [wall.start.x, wall.end.x]);
    const ys = walls.flatMap(wall => [wall.start.y, wall.end.y]);
    return {
      roomWidth: Math.max(...xs) - Math.min(...xs),
      roomDepth: Math.max(...ys) - Math.min(...ys),
    };
  }, [walls]);

  if (qualityLevel === 'low') return null;

  const isHigh = qualityLevel === 'high';
  const aoHeight = isHigh ? 0.4 : 0.3;
  const floorAOWidth = isHigh ? 0.35 : 0.25;
  const cornerSize = isHigh ? 0.4 : 0.3;

  const wallAOTex = useMemo(() => createAOGradient(128, 256), []);
  const floorAOTex = useMemo(() => createFloorAOGradient(256, 128), []);
  const cornerAOTex = useMemo(() => createCornerAOGradient(256), []);

  const wallPositions = useMemo(() => [
    { pos: [0, aoHeight / 2, -roomDepth / 2 + 0.005] as [number, number, number], rot: [0, 0, 0] as [number, number, number], scale: [roomWidth, aoHeight, 1] as [number, number, number] },
    { pos: [0, aoHeight / 2, roomDepth / 2 - 0.005] as [number, number, number], rot: [0, Math.PI, 0] as [number, number, number], scale: [roomWidth, aoHeight, 1] as [number, number, number] },
    { pos: [-roomWidth / 2 + 0.005, aoHeight / 2, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number], scale: [roomDepth, aoHeight, 1] as [number, number, number] },
    { pos: [roomWidth / 2 - 0.005, aoHeight / 2, 0] as [number, number, number], rot: [0, -Math.PI / 2, 0] as [number, number, number], scale: [roomDepth, aoHeight, 1] as [number, number, number] },
  ], [roomWidth, roomDepth, aoHeight]);

  const floorPositions = useMemo(() => [
    { pos: [0, 0.003, -roomDepth / 2 + floorAOWidth / 2] as [number, number, number], rot: [-Math.PI / 2, 0, 0] as [number, number, number], scale: [roomWidth, floorAOWidth, 1] as [number, number, number] },
    { pos: [0, 0.003, roomDepth / 2 - floorAOWidth / 2] as [number, number, number], rot: [-Math.PI / 2, 0, Math.PI] as [number, number, number], scale: [roomWidth, floorAOWidth, 1] as [number, number, number] },
    { pos: [-roomWidth / 2 + floorAOWidth / 2, 0.003, 0] as [number, number, number], rot: [-Math.PI / 2, 0, -Math.PI / 2] as [number, number, number], scale: [roomDepth, floorAOWidth, 1] as [number, number, number] },
    { pos: [roomWidth / 2 - floorAOWidth / 2, 0.003, 0] as [number, number, number], rot: [-Math.PI / 2, 0, Math.PI / 2] as [number, number, number], scale: [roomDepth, floorAOWidth, 1] as [number, number, number] },
  ], [roomWidth, roomDepth, floorAOWidth]);

  // 4隅のコーナーAO位置（床面上、壁の交差点）
  const cornerPositions = useMemo(() => [
    { pos: [-roomWidth / 2 + cornerSize / 2, 0.004, -roomDepth / 2 + cornerSize / 2] as [number, number, number], rot: [-Math.PI / 2, 0, 0] as [number, number, number] },
    { pos: [roomWidth / 2 - cornerSize / 2, 0.004, -roomDepth / 2 + cornerSize / 2] as [number, number, number], rot: [-Math.PI / 2, 0, Math.PI / 2] as [number, number, number] },
    { pos: [-roomWidth / 2 + cornerSize / 2, 0.004, roomDepth / 2 - cornerSize / 2] as [number, number, number], rot: [-Math.PI / 2, 0, -Math.PI / 2] as [number, number, number] },
    { pos: [roomWidth / 2 - cornerSize / 2, 0.004, roomDepth / 2 - cornerSize / 2] as [number, number, number], rot: [-Math.PI / 2, 0, Math.PI] as [number, number, number] },
  ], [roomWidth, roomDepth, cornerSize]);

  const aoOpacity = isHigh ? 1.0 : 0.6;

  return (
    <group name="ambient-occlusion-planes">
      {wallPositions.map((wp, i) => (
        <mesh key={`wall-ao-${i}`} position={wp.pos} rotation={wp.rot} scale={wp.scale}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={wallAOTex}
            transparent
            opacity={aoOpacity}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.CustomBlending}
            blendSrc={THREE.DstColorFactor}
            blendDst={THREE.ZeroFactor}
            blendEquation={THREE.AddEquation}
          />
        </mesh>
      ))}
      {floorPositions.map((fp, i) => (
        <mesh key={`floor-ao-${i}`} position={fp.pos} rotation={fp.rot} scale={fp.scale}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={floorAOTex}
            transparent
            opacity={aoOpacity}
            depthWrite={false}
            blending={THREE.CustomBlending}
            blendSrc={THREE.DstColorFactor}
            blendDst={THREE.ZeroFactor}
            blendEquation={THREE.AddEquation}
          />
        </mesh>
      ))}
      {/* コーナーAO: 壁の交差点に放射状の影を追加 */}
      {cornerPositions.map((cp, i) => (
        <mesh key={`corner-ao-${i}`} position={cp.pos} rotation={cp.rot}>
          <planeGeometry args={[cornerSize, cornerSize]} />
          <meshBasicMaterial
            map={cornerAOTex}
            transparent
            opacity={aoOpacity * 0.8}
            depthWrite={false}
            blending={THREE.CustomBlending}
            blendSrc={THREE.DstColorFactor}
            blendDst={THREE.ZeroFactor}
            blendEquation={THREE.AddEquation}
          />
        </mesh>
      ))}
    </group>
  );
}
