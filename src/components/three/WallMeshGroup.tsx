'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { wallLength, wallAngle } from '@/lib/geometry';

interface WallMeshGroupProps {
  walls: WallSegment[];
  style: StyleConfig;
}

export function WallMeshGroup({ walls, style }: WallMeshGroupProps) {
  return (
    <group>
      {walls.map((wall) => (
        <WallMesh key={wall.id} wall={wall} style={style} />
      ))}
    </group>
  );
}

interface WallMeshProps {
  wall: WallSegment;
  style: StyleConfig;
}

function WallMesh({ wall, style }: WallMeshProps) {
  const { geometry, position, rotationY } = useMemo(() => {
    const len = wallLength(wall);
    const angle = wallAngle(wall);
    const h = wall.height;
    const t = wall.thickness;

    // 壁断面 Shape: 幅 = len, 高さ = h
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(len, 0);
    shape.lineTo(len, h);
    shape.lineTo(0, h);
    shape.closePath();

    // 奥行方向に thickness 分 extrude
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: t,
      bevelEnabled: false,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // extrude は z 方向に伸びるので、厚み中心がローカル z=0 になるよう移動
    geo.translate(0, 0, -t / 2);

    // 2D → 3D 座標変換: (x, y) → (x, 0, y)
    const cx = (wall.start.x + wall.end.x) / 2;
    const cz = (wall.start.y + wall.end.y) / 2;

    // ExtrudeGeometry のローカル原点は shape の (0,0) = 壁始点
    // position を始点に置き、angle で回転させる
    const pos = new THREE.Vector3(wall.start.x, 0, wall.start.y);

    return {
      geometry: geo,
      position: pos,
      rotationY: -angle, // THREE.js の Y 軸回転は反時計回り、atan2 と逆
    };
  }, [wall]);

  const color = wall.materialId ? wall.color : (wall.color !== '#E0E0E0' ? wall.color : style.wallColor);

  // 壁テクスチャ（微細パターン）
  const wallTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = adjustBrightness(color, 3);
    for (let i = 0; i < 100; i++) {
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const len = wallLength(wall);
    texture.repeat.set(len, wall.height);
    return texture;
  }, [color, wall]);

  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={[0, rotationY, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial map={wallTexture} roughness={0.9} />
    </mesh>
  );
}

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
