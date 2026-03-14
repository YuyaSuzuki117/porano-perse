'use client';

/**
 * InstancedFurnitureRenderer — 重複家具のインスタンスレンダリング
 *
 * 同一typeの家具が2つ以上ある場合、InstancedMeshで一括描画し
 * ドローコールを削減する。count < 2 のタイプはスキップし、
 * 通常のFurnitureコンポーネントに委譲する。
 */

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { FurnitureItem, FurnitureType } from '@/types/scene';

// ─── インスタンシングの閾値 ───────────────────────────
const INSTANCE_THRESHOLD = 2;

// ─── タイプ別デフォルトジオメトリサイズ ─────────────────
const TYPE_DIMENSIONS: Partial<Record<FurnitureType, [number, number, number]>> = {
  chair: [0.45, 0.85, 0.45],
  stool: [0.35, 0.7, 0.35],
  table_square: [0.8, 0.75, 0.8],
  table_round: [0.8, 0.75, 0.8],
  counter: [3, 1.1, 0.6],
  shelf: [1.2, 1.8, 0.4],
  pendant_light: [0.3, 0.25, 0.3],
  plant: [0.4, 0.8, 0.4],
  desk: [1.2, 0.75, 0.6],
};

// ─── ジオメトリキャッシュ（タイプ別に1つだけ生成） ────────
const geometryCache = new Map<FurnitureType, THREE.BoxGeometry>();

/** タイプに応じたBoxGeometryを取得（キャッシュ付き） */
function getGeometryForType(type: FurnitureType): THREE.BoxGeometry {
  const cached = geometryCache.get(type);
  if (cached) return cached;

  // タイプ固有サイズがあればそれを使用、なければ1x1x1
  const dims = TYPE_DIMENSIONS[type] ?? [1, 1, 1];
  const geo = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
  geometryCache.set(type, geo);
  return geo;
}

/**
 * インスタンス化すべきタイプのセットを返す。
 * 同一typeのアイテムが INSTANCE_THRESHOLD 以上ある場合に対象。
 */
export function getInstancedTypes(furniture: FurnitureItem[]): Set<string> {
  const countByType = new Map<string, number>();
  for (const item of furniture) {
    countByType.set(item.type, (countByType.get(item.type) ?? 0) + 1);
  }

  const result = new Set<string>();
  for (const [type, count] of countByType) {
    if (count >= INSTANCE_THRESHOLD) {
      result.add(type);
    }
  }
  return result;
}

// ─── タイプ別インスタンスグループ ─────────────────────────
interface TypeGroupProps {
  type: FurnitureType;
  items: FurnitureItem[];
}

/** 単一タイプの家具群をInstancedMeshで描画 */
const TypeGroup = React.memo(function TypeGroup({ type, items }: TypeGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // 一時オブジェクト（useFrame外なのでuseMemoで生成、GC削減）
  const temp = useMemo(() => ({
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    euler: new THREE.Euler(),
    color: new THREE.Color(),
  }), []);

  const geometry = useMemo(() => getGeometryForType(type), [type]);

  // マテリアル（インスタンスカラーを有効化するため白ベース）
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      roughness: 0.7,
      metalness: 0.0,
      vertexColors: false,
    }),
    [],
  );

  // インスタンス行列とカラーを更新
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // 位置（Y軸はスケールの半分だけ持ち上げて床置き）
      temp.position.set(
        item.position[0],
        item.position[1] + item.scale[1] / 2,
        item.position[2],
      );
      temp.euler.set(item.rotation[0], item.rotation[1], item.rotation[2]);
      temp.quaternion.setFromEuler(temp.euler);
      temp.scale.set(item.scale[0], item.scale[1], item.scale[2]);

      temp.matrix.compose(temp.position, temp.quaternion, temp.scale);
      mesh.setMatrixAt(i, temp.matrix);

      // インスタンスカラー設定
      temp.color.set(item.color ?? '#888888');
      mesh.setColorAt(i, temp.color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.count = items.length;
  }, [items, temp]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, items.length]}
      castShadow
      receiveShadow
      frustumCulled
    />
  );
});

// ─── メインコンポーネント ─────────────────────────────
interface InstancedFurnitureRendererProps {
  /** 全家具アイテム */
  furniture: FurnitureItem[];
  /** 品質レベル（low/medium/highで将来LOD切り替えに使用） */
  qualityLevel: string;
}

/**
 * 重複する家具タイプをInstancedMeshで一括描画するレンダラー。
 * count < 2 のタイプはスキップし、通常描画に委譲する。
 */
export const InstancedFurnitureRenderer = React.memo(function InstancedFurnitureRenderer({
  furniture,
  qualityLevel,
}: InstancedFurnitureRendererProps) {
  // タイプ別にグループ化（インスタンス対象のみ）
  const typeGroups = useMemo(() => {
    const groups = new Map<FurnitureType, FurnitureItem[]>();

    for (const item of furniture) {
      const list = groups.get(item.type);
      if (list) {
        list.push(item);
      } else {
        groups.set(item.type, [item]);
      }
    }

    // 閾値未満のグループを除外
    const threshold = qualityLevel === 'low' ? 1 : INSTANCE_THRESHOLD;
    const result: Array<{ type: FurnitureType; items: FurnitureItem[] }> = [];
    for (const [type, items] of groups) {
      if (items.length >= threshold) {
        result.push({ type, items });
      }
    }

    return result;
  }, [furniture, qualityLevel]);

  return (
    <group name="instanced-furniture-renderer">
      {typeGroups.map(({ type, items }) => (
        <TypeGroup key={type} type={type} items={items} />
      ))}
    </group>
  );
});
