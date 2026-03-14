'use client';

/**
 * FurnitureAnimation — 家具のインタラクティブアニメーション
 *
 * ドア開閉、引き出し、椅子回転、カーテン揺れの4種類をサポート。
 * スプリング的なイージング（lerp+ダンピング）で滑らかに補間する。
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FurnitureItem } from '@/types/scene';

// ─── アニメーションタイプ ──────────────────────────────
type AnimationType = 'door_open' | 'drawer' | 'chair_spin' | 'curtain_sway';

// ─── ダンピング係数（スプリング的なイージング） ──────────
const DAMPING = 0.08;

// ─── アニメーション定数 ────────────────────────────────
const DOOR_MAX_ANGLE = Math.PI / 2;   // 90度
const DRAWER_MAX_OFFSET = 0.3;        // 0.3m
const SPIN_SPEED = 2.0;               // rad/s
const SWAY_AMPLITUDE = 0.05;          // カーテン揺れ振幅
const SWAY_FREQUENCY = 2.0;           // カーテン揺れ周波数

interface FurnitureAnimationProps {
  /** 対象の家具アイテム */
  furnitureItem: FurnitureItem;
  /** アニメーションのオン/オフ */
  active: boolean;
  /** アニメーション種別 */
  animationType: AnimationType;
}

/**
 * ドア開閉アニメーション
 * ヒンジポイント（Y軸）を中心に0〜90度回転
 */
const DoorAnimation = React.memo(function DoorAnimation({
  furnitureItem,
  active,
}: Omit<FurnitureAnimationProps, 'animationType'>) {
  const groupRef = useRef<THREE.Group>(null);
  const currentAngle = useRef(0);

  const scale = furnitureItem.scale;
  const color = furnitureItem.color ?? '#8B4513';

  // ヒンジオフセット（ドアの端を回転軸にする）
  const hingeOffset = scale[0] / 2;

  useFrame(() => {
    if (!groupRef.current) return;

    const targetAngle = active ? DOOR_MAX_ANGLE : 0;
    // スプリング補間
    currentAngle.current += (targetAngle - currentAngle.current) * DAMPING;

    // ヒンジポイントを中心に回転
    groupRef.current.rotation.y = currentAngle.current;
  });

  return (
    <group
      position={[
        furnitureItem.position[0] - hingeOffset,
        furnitureItem.position[1] + scale[1] / 2,
        furnitureItem.position[2],
      ]}
    >
      <group ref={groupRef}>
        {/* ヒンジからオフセットしたドアメッシュ */}
        <mesh position={[hingeOffset, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[scale[0], scale[1], scale[2] * 0.1]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
});

/**
 * 引き出しアニメーション
 * Z軸方向に0〜0.3mスライド
 */
const DrawerAnimation = React.memo(function DrawerAnimation({
  furnitureItem,
  active,
}: Omit<FurnitureAnimationProps, 'animationType'>) {
  const drawerRef = useRef<THREE.Mesh>(null);
  const currentOffset = useRef(0);

  const scale = furnitureItem.scale;
  const color = furnitureItem.color ?? '#A0522D';

  // 引き出しのサイズ（本体より少し小さく）
  const drawerScale: [number, number, number] = [
    scale[0] * 0.9,
    scale[1] * 0.3,
    scale[2] * 0.85,
  ];

  useFrame(() => {
    if (!drawerRef.current) return;

    const targetOffset = active ? DRAWER_MAX_OFFSET : 0;
    currentOffset.current += (targetOffset - currentOffset.current) * DAMPING;

    drawerRef.current.position.z = currentOffset.current;
  });

  return (
    <group
      position={[
        furnitureItem.position[0],
        furnitureItem.position[1] + scale[1] / 2,
        furnitureItem.position[2],
      ]}
    >
      {/* 本体 */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[scale[0], scale[1], scale[2]]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* 引き出し部分 */}
      <mesh
        ref={drawerRef}
        position={[0, -scale[1] * 0.2, 0]}
        castShadow
      >
        <boxGeometry args={drawerScale} />
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
});

/**
 * 椅子スピンアニメーション
 * Y軸周りの連続回転
 */
const ChairSpinAnimation = React.memo(function ChairSpinAnimation({
  furnitureItem,
  active,
}: Omit<FurnitureAnimationProps, 'animationType'>) {
  const meshRef = useRef<THREE.Mesh>(null);
  const spinSpeed = useRef(0);

  const scale = furnitureItem.scale;
  const color = furnitureItem.color ?? '#654321';

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // スプリング的に回転速度を補間
    const targetSpeed = active ? SPIN_SPEED : 0;
    spinSpeed.current += (targetSpeed - spinSpeed.current) * DAMPING;

    meshRef.current.rotation.y += spinSpeed.current * delta;
  });

  return (
    <mesh
      ref={meshRef}
      position={[
        furnitureItem.position[0],
        furnitureItem.position[1] + scale[1] / 2,
        furnitureItem.position[2],
      ]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[scale[0], scale[1], scale[2]]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
});

/**
 * カーテン揺れアニメーション
 * サイン波によるX方向の揺れ
 */
const CurtainSwayAnimation = React.memo(function CurtainSwayAnimation({
  furnitureItem,
  active,
}: Omit<FurnitureAnimationProps, 'animationType'>) {
  const meshRef = useRef<THREE.Mesh>(null);
  const amplitude = useRef(0);
  const elapsed = useRef(0);

  const scale = furnitureItem.scale;
  const color = furnitureItem.color ?? '#F5F5DC';

  // カーテン用ジオメトリ（薄い板）
  const curtainSize = useMemo<[number, number, number]>(
    () => [scale[0], scale[1], scale[2] * 0.05],
    [scale],
  );

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // 振幅のスプリング補間
    const targetAmplitude = active ? SWAY_AMPLITUDE : 0;
    amplitude.current += (targetAmplitude - amplitude.current) * DAMPING;

    elapsed.current += delta;

    // サイン波による揺れ
    const sway = amplitude.current * Math.sin(elapsed.current * SWAY_FREQUENCY * Math.PI * 2);
    meshRef.current.position.x = furnitureItem.position[0] + sway;
  });

  return (
    <mesh
      ref={meshRef}
      position={[
        furnitureItem.position[0],
        furnitureItem.position[1] + scale[1] / 2,
        furnitureItem.position[2],
      ]}
      castShadow
    >
      <boxGeometry args={curtainSize} />
      <meshStandardMaterial
        color={color}
        roughness={0.9}
        metalness={0.0}
        side={THREE.DoubleSide}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
});

/**
 * 家具アニメーションのルートコンポーネント。
 * animationType に応じて適切なアニメーションサブコンポーネントを描画する。
 */
export const FurnitureAnimation = React.memo(function FurnitureAnimation({
  furnitureItem,
  active,
  animationType,
}: FurnitureAnimationProps) {
  const commonProps = { furnitureItem, active };

  switch (animationType) {
    case 'door_open':
      return <DoorAnimation {...commonProps} />;
    case 'drawer':
      return <DrawerAnimation {...commonProps} />;
    case 'chair_spin':
      return <ChairSpinAnimation {...commonProps} />;
    case 'curtain_sway':
      return <CurtainSwayAnimation {...commonProps} />;
    default:
      return null;
  }
});
