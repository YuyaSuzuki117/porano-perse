'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '@/stores/useEditorStore';

/** Creates a vertical gradient texture from dark to transparent */
function createAOGradient(width: number, height: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(0.4, 'rgba(0,0,0,0.10)');
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
  gradient.addColorStop(0, 'rgba(0,0,0,0.18)');
  gradient.addColorStop(0.3, 'rgba(0,0,0,0.08)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export default function AmbientOcclusionPlanes() {
  const walls = useEditorStore(s => s.walls);
  const roomHeight = useEditorStore(s => s.roomHeight);
  const qualityLevel = useEditorStore(s => s.qualityLevel);

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

  const aoHeight = 0.3;
  const floorAOWidth = 0.25;

  const wallAOTex = useMemo(() => createAOGradient(128, 256), []);
  const floorAOTex = useMemo(() => createFloorAOGradient(256, 128), []);

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

  return (
    <group name="ambient-occlusion-planes">
      {wallPositions.map((wp, i) => (
        <mesh key={`wall-ao-${i}`} position={wp.pos} rotation={wp.rot} scale={wp.scale}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={wallAOTex}
            transparent
            opacity={qualityLevel === 'high' ? 1.0 : 0.6}
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
            opacity={qualityLevel === 'high' ? 1.0 : 0.6}
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
