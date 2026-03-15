'use client';
import { useMemo } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { useCameraStore } from '@/stores/useCameraStore';

export default function FloorReflection() {
  const walls = useEditorStore(s => s.walls);
  const qualityLevel = useCameraStore(s => s.qualityLevel);

  const { w, d } = useMemo(() => {
    if (walls.length === 0) return { w: 6, d: 6 };
    const xs = walls.flatMap(wall => [wall.start.x, wall.end.x]);
    const ys = walls.flatMap(wall => [wall.start.y, wall.end.y]);
    return {
      w: Math.max(...xs) - Math.min(...xs),
      d: Math.max(...ys) - Math.min(...ys),
    };
  }, [walls]);

  if (qualityLevel === 'low') return null;

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshPhysicalMaterial
        transparent
        opacity={qualityLevel === 'high' ? 0.15 : 0.08}
        color="#ffffff"
        metalness={0.2}
        roughness={0.015}
        clearcoat={1.0}
        clearcoatRoughness={0.04}
        envMapIntensity={qualityLevel === 'high' ? 4.5 : 3.0}
        depthWrite={false}
      />
    </mesh>
  );
}
