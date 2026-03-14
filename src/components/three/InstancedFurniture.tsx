'use client';

/**
 * InstancedFurniture — 同一タイプの家具をInstancedMeshで一括レンダリング
 *
 * 同じtype+colorの家具が複数ある場合、1つのドローコールで描画し、
 * GPU負荷を大幅に削減する。
 * 選択中・ドラッグ中の家具は個別レンダリングにフォールバック。
 */

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { FurnitureItem } from '@/types/scene';
import { LOD_BOX_GEOMETRY } from '@/lib/material-cache';

// ─── InstancedMesh用の共有ジオメトリ ─────────────────────────
const INSTANCED_BOX = new THREE.BoxGeometry(1, 1, 1);

interface InstanceGroupProps {
  /** 同一タイプ+色の家具リスト */
  items: FurnitureItem[];
  /** 選択中の家具ID (個別レンダリング対象) */
  selectedIds: Set<string>;
}

/**
 * 同一タイプ・同一色の家具グループを InstancedMesh で描画。
 * 選択中のアイテムはスキップ（個別Furnitureで描画される）。
 */
export const InstanceGroup = React.memo(function InstanceGroup({
  items,
  selectedIds,
}: InstanceGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  const tempEuler = useMemo(() => new THREE.Euler(), []);

  // 選択されていないアイテムのみインスタンス化
  const instanceItems = useMemo(
    () => items.filter((item) => !selectedIds.has(item.id)),
    [items, selectedIds],
  );

  const color = useMemo(() => {
    if (items.length === 0) return '#888888';
    return items[0].color || '#888888';
  }, [items]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.0,
      }),
    [color],
  );

  // インスタンス行列の更新
  useEffect(() => {
    if (!meshRef.current) return;
    instanceItems.forEach((item, i) => {
      tempPosition.set(item.position[0], item.position[1] + item.scale[1] / 2, item.position[2]);
      tempEuler.set(item.rotation[0], item.rotation[1], item.rotation[2]);
      tempQuaternion.setFromEuler(tempEuler);
      tempScale.set(item.scale[0], item.scale[1], item.scale[2]);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current!.setMatrixAt(i, tempMatrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.count = instanceItems.length;
  }, [instanceItems, tempMatrix, tempPosition, tempQuaternion, tempScale, tempEuler]);

  if (instanceItems.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[INSTANCED_BOX, material, instanceItems.length]}
      castShadow
      receiveShadow
      frustumCulled
    />
  );
});

// ─── LOD Proxy ─────────────────────────────────────────────────

interface FurnitureLODProxyProps {
  item: FurnitureItem;
  /** カメラからの距離がこの値を超えるとLODボックスで描画 */
  lodDistance?: number;
  children: React.ReactNode;
}

/**
 * LODプロキシ: カメラ距離に応じてchildrenとシンプルボックスを切り替え。
 * 遠距離の家具を軽量ボックスに置き換え、GPU負荷を削減。
 */
export const FurnitureLODProxy = React.memo(function FurnitureLODProxy({
  item,
  lodDistance = 8,
  children,
}: FurnitureLODProxyProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lodRef = useRef<THREE.Mesh>(null);
  const detailRef = useRef<THREE.Group>(null);

  const lodMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: item.color || '#888888',
        roughness: 0.8,
        metalness: 0.0,
      }),
    [item.color],
  );

  // NOTE: LOD切り替えはuseFrameで行いたいが、
  // このコンポーネントはFurnitureの内部で使用されるため、
  // SceneCanvasのuseFrame内で一括管理する方が効率的。
  // ここでは visible プロパティで制御する。

  return (
    <group ref={groupRef}>
      {/* 詳細メッシュ */}
      <group ref={detailRef}>{children}</group>
      {/* LODボックス (デフォルト非表示、LODManagerで制御) */}
      <mesh
        ref={lodRef}
        geometry={LOD_BOX_GEOMETRY}
        material={lodMaterial}
        position={[0, item.scale[1] / 2, 0]}
        scale={item.scale}
        visible={false}
        castShadow
      />
    </group>
  );
});

// ─── LODマネージャー (SceneCanvasでuseFrame一括制御) ────────────

interface LODTarget {
  group: THREE.Group;
  detailGroup: THREE.Group;
  lodMesh: THREE.Mesh;
}

/**
 * LODターゲットの登録リスト。
 * SceneCanvasのuseFrame内で一括距離チェック＆切り替え。
 */
export const lodTargets: LODTarget[] = [];

export function registerLODTarget(target: LODTarget): () => void {
  lodTargets.push(target);
  return () => {
    const idx = lodTargets.indexOf(target);
    if (idx >= 0) lodTargets.splice(idx, 1);
  };
}

/**
 * LOD一括更新（useFrame内で呼ぶ）
 * カメラ位置から各ターゲットの距離を計算し、visible切り替え。
 */
const _tempVec = new THREE.Vector3();
export function updateLODs(camera: THREE.Camera, threshold: number): void {
  const camPos = camera.position;
  for (const target of lodTargets) {
    target.group.getWorldPosition(_tempVec);
    const dist = camPos.distanceTo(_tempVec);
    const useLOD = dist > threshold;
    target.detailGroup.visible = !useLOD;
    target.lodMesh.visible = useLOD;
  }
}
