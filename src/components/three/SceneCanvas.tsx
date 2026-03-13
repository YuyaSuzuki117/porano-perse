'use client';

import { Suspense, useRef, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { WallMeshGroup } from './WallMeshGroup';
import { FloorMesh } from './FloorMesh';
import { CeilingMesh } from './CeilingMesh';
import { LightingRig } from './LightingRig';
import { Furniture } from './Furniture';
import { useEditorStore } from '@/stores/useEditorStore';
import { STYLE_PRESETS } from '@/data/styles';
import { StyleConfig } from '@/types/scene';

interface SceneCanvasProps {
  selectedFurniture: string | null;
  onSelectFurniture: (id: string | null) => void;
  onMoveFurniture: (id: string, position: [number, number, number]) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function SceneCanvas({
  selectedFurniture,
  onSelectFurniture,
  onMoveFurniture,
  canvasRef,
}: SceneCanvasProps) {
  const walls = useEditorStore((s) => s.walls);
  const openings = useEditorStore((s) => s.openings);
  const furniture = useEditorStore((s) => s.furniture);
  const styleName = useEditorStore((s) => s.style);
  const roomHeight = useEditorStore((s) => s.roomHeight);

  const styleConfig: StyleConfig = STYLE_PRESETS[styleName];
  const controlsRef = useRef(null);

  // 壁群からカメラ位置とターゲットを算出
  const { cameraPosition, cameraTarget, gridSize } = useMemo(() => {
    if (walls.length === 0) {
      return {
        cameraPosition: [5, 5, 5] as [number, number, number],
        cameraTarget: [0, 1, 0] as [number, number, number],
        gridSize: { w: 8, d: 6 },
      };
    }
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    const maxDim = Math.max(w, d, roomHeight);

    return {
      cameraPosition: [cx + maxDim * 0.8, roomHeight * 1.5, cz + maxDim * 0.8] as [number, number, number],
      cameraTarget: [cx, roomHeight * 0.4, cz] as [number, number, number],
      gridSize: { w, d },
    };
  }, [walls, roomHeight]);

  const handleCanvasCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.2;
    if (canvasRef) {
      (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = gl.domElement;
    }
  }, [canvasRef]);

  const handlePointerMissed = useCallback(() => {
    onSelectFurniture(null);
  }, [onSelectFurniture]);

  return (
    <Canvas
      shadows
      camera={{
        position: cameraPosition,
        fov: 60,
        near: 0.1,
        far: 100,
      }}
      onCreated={handleCanvasCreated}
      onPointerMissed={handlePointerMissed}
      style={{ background: '#1a1a2e' }}
    >
      <Suspense fallback={null}>
        {/* ライティング */}
        <LightingRig style={styleConfig} walls={walls} roomHeight={roomHeight} />

        <Environment preset="apartment" background={false} />

        {/* 壁メッシュ群 */}
        <WallMeshGroup walls={walls} style={styleConfig} />

        {/* 床 */}
        <FloorMesh walls={walls} style={styleConfig} />

        {/* 天井 */}
        <CeilingMesh walls={walls} roomHeight={roomHeight} style={styleConfig} />

        {/* 家具 */}
        {furniture.map((item) => (
          <Furniture
            key={item.id}
            item={item}
            selected={selectedFurniture === item.id}
            onSelect={onSelectFurniture}
            onMove={onMoveFurniture}
          />
        ))}

        {/* グリッドヘルパー */}
        <Grid
          position={[0, 0.001, 0]}
          args={[gridSize.w, gridSize.d]}
          cellSize={0.5}
          cellColor="#00000010"
          sectionSize={1}
          sectionColor="#00000020"
          fadeDistance={20}
          infiniteGrid={false}
        />

        {/* コントロール */}
        <OrbitControls
          ref={controlsRef}
          target={cameraTarget}
          maxPolarAngle={Math.PI * 0.85}
          minDistance={1}
          maxDistance={20}
          enableDamping
          dampingFactor={0.05}
        />
      </Suspense>
    </Canvas>
  );
}
