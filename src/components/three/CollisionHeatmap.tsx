'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { FurnitureItem } from '@/types/scene';
import { WallSegment } from '@/types/floor-plan';

interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function furnitureToAABB(item: FurnitureItem): AABB {
  const [px, , pz] = item.position;
  const [sx, , sz] = item.scale;
  const halfX = sx / 2;
  const halfZ = sz / 2;

  // Account for rotation around Y axis
  const ry = item.rotation[1];
  const cosR = Math.abs(Math.cos(ry));
  const sinR = Math.abs(Math.sin(ry));
  const rotHalfX = halfX * cosR + halfZ * sinR;
  const rotHalfZ = halfX * sinR + halfZ * cosR;

  return {
    minX: px - rotHalfX,
    maxX: px + rotHalfX,
    minZ: pz - rotHalfZ,
    maxZ: pz + rotHalfZ,
  };
}

function distanceToAABB(x: number, z: number, aabb: AABB): number {
  const dx = Math.max(aabb.minX - x, 0, x - aabb.maxX);
  const dz = Math.max(aabb.minZ - z, 0, z - aabb.maxZ);
  return Math.sqrt(dx * dx + dz * dz);
}

function distanceToWall(x: number, z: number, wall: WallSegment): number {
  const ax = wall.start.x;
  const az = wall.start.y;
  const bx = wall.end.x;
  const bz = wall.end.y;

  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq === 0) return Math.sqrt((x - ax) ** 2 + (z - az) ** 2);

  let t = ((x - ax) * abx + (z - az) * abz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * abx;
  const projZ = az + t * abz;
  return Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2);
}

interface CollisionHeatmapProps {
  furniture: FurnitureItem[];
  walls: WallSegment[];
  visible: boolean;
  resolution?: number;
}

const CollisionHeatmapInner: React.FC<CollisionHeatmapProps> = ({
  furniture,
  walls,
  visible,
  resolution = 0.25,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Compute bounding box of room from walls
  const bounds = useMemo(() => {
    if (walls.length === 0) {
      return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    }
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minZ = Math.min(minZ, w.start.y, w.end.y);
      maxZ = Math.max(maxZ, w.start.y, w.end.y);
    }
    const pad = 0.5;
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }, [walls]);

  const texture = useMemo(() => {
    const widthM = bounds.maxX - bounds.minX;
    const depthM = bounds.maxZ - bounds.minZ;
    const cellsX = Math.max(1, Math.ceil(widthM / resolution));
    const cellsZ = Math.max(1, Math.ceil(depthM / resolution));

    const canvas = document.createElement('canvas');
    canvas.width = cellsX;
    canvas.height = cellsZ;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const aabbs = furniture.map(furnitureToAABB);
    const imageData = ctx.createImageData(cellsX, cellsZ);

    for (let zi = 0; zi < cellsZ; zi++) {
      for (let xi = 0; xi < cellsX; xi++) {
        const worldX = bounds.minX + (xi + 0.5) * resolution;
        const worldZ = bounds.minZ + (zi + 0.5) * resolution;

        let minDist = Infinity;

        for (const aabb of aabbs) {
          const d = distanceToAABB(worldX, worldZ, aabb);
          if (d < minDist) minDist = d;
        }

        // Also check distance to walls
        for (const wall of walls) {
          const d = distanceToWall(worldX, worldZ, wall);
          if (d < minDist) minDist = d;
        }

        // Color mapping
        let r: number, g: number, b: number, a: number;
        if (minDist < 0.5) {
          // Red zone (collision)
          const t = minDist / 0.5;
          r = 255;
          g = Math.floor(t * 80);
          b = 0;
          a = Math.floor(180 - t * 60);
        } else if (minDist < 1.0) {
          // Yellow zone
          const t = (minDist - 0.5) / 0.5;
          r = 255;
          g = Math.floor(80 + t * 175);
          b = 0;
          a = Math.floor(120 - t * 40);
        } else {
          // Green zone
          const t = Math.min((minDist - 1.0) / 1.0, 1);
          r = Math.floor(255 * (1 - t));
          g = 200;
          b = 0;
          a = Math.floor(80 - t * 60);
        }

        const idx = (zi * cellsX + xi) * 4;
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = a;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [furniture, walls, bounds, resolution]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!visible || !texture) return null;

  const widthM = bounds.maxX - bounds.minX;
  const depthM = bounds.maxZ - bounds.minZ;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  return (
    <mesh
      ref={meshRef}
      position={[centerX, 0.01, centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[widthM, depthM]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

export const CollisionHeatmap = React.memo(CollisionHeatmapInner);
