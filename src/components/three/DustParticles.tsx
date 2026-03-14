'use client';

import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { WallSegment, Opening } from '@/types/floor-plan';

interface DustParticlesProps {
  walls: WallSegment[];
  openings: Opening[];
  roomHeight: number;
  qualityLevel: 'low' | 'medium' | 'high';
}

/** パーティクル数 */
const PARTICLE_COUNT = 200;
/** 塵の色（暖白） */
const DUST_COLOR = new THREE.Color('#FFF8E7');

/** 各パーティクルの揺れ位相（プリアロケート） */
const particlePhases = new Float32Array(PARTICLE_COUNT);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  particlePhases[i] = Math.random() * Math.PI * 2;
}

/** 各パーティクルの揺れ速度（プリアロケート） */
const particleSwaySpeeds = new Float32Array(PARTICLE_COUNT);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  particleSwaySpeeds[i] = 0.2 + Math.random() * 0.4;
}

/** 各パーティクルの揺れ振幅（プリアロケート） */
const particleSwayAmplitudes = new Float32Array(PARTICLE_COUNT);
for (let i = 0; i < PARTICLE_COUNT; i++) {
  particleSwayAmplitudes[i] = 0.002 + Math.random() * 0.005;
}

/** 壁データから部屋のバウンディングボックスを計算 */
function computeRoomBounds(walls: WallSegment[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (walls.length === 0) {
    return { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minZ = Math.min(minZ, wall.start.y, wall.end.y);
    maxZ = Math.max(maxZ, wall.start.y, wall.end.y);
  }
  // 少し内側にオフセット
  const inset = 0.2;
  return {
    minX: minX + inset,
    maxX: maxX - inset,
    minZ: minZ + inset,
    maxZ: maxZ - inset,
  };
}

/** 窓の位置をワールド座標に変換 */
function computeWindowPositions(walls: WallSegment[], openings: Opening[]): Array<{ x: number; z: number }> {
  const windowOpenings = openings.filter(o => o.type === 'window');
  const positions: Array<{ x: number; z: number }> = [];
  for (const opening of windowOpenings) {
    const wall = walls.find(w => w.id === opening.wallId);
    if (!wall) continue;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    const t = opening.positionAlongWall / len;
    positions.push({
      x: wall.start.x + dx * t,
      z: wall.start.y + dy * t,
    });
  }
  return positions;
}

/** プリアロケートしたVector3（useFrame内で使用） */
const _tempVec = new THREE.Vector3();

const DustParticles = React.memo(function DustParticles({
  walls,
  openings,
  roomHeight,
  qualityLevel,
}: DustParticlesProps) {
  // high品質でのみレンダリング
  if (qualityLevel !== 'high') return null;

  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const bounds = useMemo(() => computeRoomBounds(walls), [walls]);
  const windowPositions = useMemo(() => computeWindowPositions(walls, openings), [walls, openings]);

  // 初期パーティクル位置とサイズを生成
  const { positions, sizes, opacities } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const sz = new Float32Array(PARTICLE_COUNT);
    const op = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      pos[i3] = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);     // x
      pos[i3 + 1] = Math.random() * roomHeight;                                 // y
      pos[i3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ); // z
      sz[i] = 0.008 + Math.random() * 0.007;
      op[i] = 0.3 + Math.random() * 0.3;
    }

    return { positions: pos, sizes: sz, opacities: op };
  }, [bounds, roomHeight]);

  // BufferGeometryの構築
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
    return geo;
  }, [positions, sizes, opacities]);

  // ShaderMaterialでサイズ/透明度を個別制御
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: DUST_COLOR },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aOpacity;
        varying float vOpacity;
        void main() {
          vOpacity = aOpacity;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vOpacity;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = vOpacity * (1.0 - dist * 2.0);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    timeRef.current += delta;
    const time = timeRef.current;

    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const opAttr = pointsRef.current.geometry.getAttribute('aOpacity') as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const opArray = opAttr.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // ゆっくり上昇
      posArray[i3 + 1] += 0.0003;

      // 水平方向の揺れ（sin波、個別位相）
      const swayX = Math.sin(time * particleSwaySpeeds[i] + particlePhases[i]) * particleSwayAmplitudes[i];
      const swayZ = Math.cos(time * particleSwaySpeeds[i] * 0.7 + particlePhases[i] + 1.5) * particleSwayAmplitudes[i] * 0.6;
      posArray[i3] += swayX;
      posArray[i3 + 2] += swayZ;

      // 天井に達したら床にリセット
      if (posArray[i3 + 1] >= roomHeight) {
        posArray[i3 + 1] = 0;
        posArray[i3] = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        posArray[i3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      }

      // 窓近くでは明るさ/透明度増加
      let baseOpacity = opacities[i];
      for (const win of windowPositions) {
        _tempVec.set(posArray[i3] - win.x, 0, posArray[i3 + 2] - win.z);
        const dist = _tempVec.length();
        if (dist < 1.5) {
          const boost = 1.0 + (1.5 - dist) * 0.4;
          baseOpacity = Math.min(0.8, baseOpacity * boost);
        }
      }
      opArray[i] = baseOpacity;
    }

    posAttr.needsUpdate = true;
    opAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
  );
});

DustParticles.displayName = 'DustParticles';
export { DustParticles };
