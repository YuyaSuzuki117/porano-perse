'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

// --- 日本語コメント ---
// 3Dシーン内のスケール参照用の人体シルエットフィギュア
// 立ち(1.7m)・座り(1.2m)・歩行(1.7m)の3ポーズ対応
// シンプルなプリミティブジオメトリで構成（外部モデル不要）

/** ポーズタイプ */
type Pose = 'standing' | 'sitting' | 'walking';

interface HumanFigureProps {
  position?: [number, number, number];
  pose?: Pose;
  rotation?: [number, number, number];
  visible?: boolean;
}

// --- モジュールスコープのジオメトリ（再生成防止） ---

/** 頭部（球） */
const headGeometry = new THREE.SphereGeometry(0.1, 12, 8);
/** 胴体（シリンダー） */
const torsoGeometry = new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8);
/** 腕（シリンダー） */
const armGeometry = new THREE.CylinderGeometry(0.035, 0.04, 0.45, 6);
/** 脚（シリンダー） */
const legGeometry = new THREE.CylinderGeometry(0.05, 0.055, 0.55, 6);
/** 座り用の短い脚（太もも部分） */
const thighGeometry = new THREE.CylinderGeometry(0.055, 0.06, 0.35, 6);
/** 座り用のすね部分 */
const shinGeometry = new THREE.CylinderGeometry(0.045, 0.05, 0.4, 6);

/** 半透明ダーク素材 */
const figureMaterial = new THREE.MeshStandardMaterial({
  color: '#2a2a2a',
  transparent: true,
  opacity: 0.6,
  roughness: 0.8,
  metalness: 0.0,
});

/** 立ちポーズのパーツ配置 */
interface PartConfig {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
}

/** 立ちポーズ構成 (全高約1.7m) */
const standingParts: PartConfig[] = [
  // 頭 (y=1.6)
  { geometry: headGeometry, position: [0, 1.6, 0], rotation: [0, 0, 0] },
  // 胴体 (y=1.2)
  { geometry: torsoGeometry, position: [0, 1.2, 0], rotation: [0, 0, 0] },
  // 左腕
  { geometry: armGeometry, position: [-0.2, 1.15, 0], rotation: [0, 0, 0.1] },
  // 右腕
  { geometry: armGeometry, position: [0.2, 1.15, 0], rotation: [0, 0, -0.1] },
  // 左脚
  { geometry: legGeometry, position: [-0.08, 0.45, 0], rotation: [0, 0, 0] },
  // 右脚
  { geometry: legGeometry, position: [0.08, 0.45, 0], rotation: [0, 0, 0] },
];

/** 座りポーズ構成 (座った高さ約1.2m) */
const sittingParts: PartConfig[] = [
  // 頭
  { geometry: headGeometry, position: [0, 1.1, 0], rotation: [0, 0, 0] },
  // 胴体
  { geometry: torsoGeometry, position: [0, 0.75, 0], rotation: [0, 0, 0] },
  // 左腕（少し前に出す）
  { geometry: armGeometry, position: [-0.2, 0.7, 0.05], rotation: [0.3, 0, 0.15] },
  // 右腕
  { geometry: armGeometry, position: [0.2, 0.7, 0.05], rotation: [0.3, 0, -0.15] },
  // 左太もも（水平に近い）
  { geometry: thighGeometry, position: [-0.08, 0.45, 0.12], rotation: [1.3, 0, 0] },
  // 右太もも
  { geometry: thighGeometry, position: [0.08, 0.45, 0.12], rotation: [1.3, 0, 0] },
  // 左すね（下向き）
  { geometry: shinGeometry, position: [-0.08, 0.2, 0.28], rotation: [0, 0, 0] },
  // 右すね
  { geometry: shinGeometry, position: [0.08, 0.2, 0.28], rotation: [0, 0, 0] },
];

/** 歩行ポーズ構成 (ストライド付き、全高約1.7m) */
const walkingParts: PartConfig[] = [
  // 頭
  { geometry: headGeometry, position: [0, 1.6, 0], rotation: [0, 0, 0] },
  // 胴体（わずかに前傾）
  { geometry: torsoGeometry, position: [0, 1.2, 0.02], rotation: [0.05, 0, 0] },
  // 左腕（前に振る）
  { geometry: armGeometry, position: [-0.2, 1.15, 0.1], rotation: [0.4, 0, 0.1] },
  // 右腕（後ろに振る）
  { geometry: armGeometry, position: [0.2, 1.15, -0.08], rotation: [-0.3, 0, -0.1] },
  // 左脚（前に出す - ストライド）
  { geometry: legGeometry, position: [-0.08, 0.45, 0.15], rotation: [0.3, 0, 0] },
  // 右脚（後ろ - ストライド）
  { geometry: legGeometry, position: [0.08, 0.45, -0.12], rotation: [-0.25, 0, 0] },
];

/** ポーズ別パーツマップ */
const POSE_PARTS: Record<Pose, PartConfig[]> = {
  standing: standingParts,
  sitting: sittingParts,
  walking: walkingParts,
};

/**
 * 人体シルエットフィギュア
 * 3Dシーン内でスケール感を把握するための参照用オブジェクト
 */
export const HumanFigure = React.memo(function HumanFigure({
  position = [0, 0, 0],
  pose = 'standing',
  rotation = [0, 0, 0],
  visible = true,
}: HumanFigureProps) {
  const parts = useMemo(() => POSE_PARTS[pose], [pose]);

  if (!visible) return null;

  return (
    <group
      position={position}
      rotation={rotation}
      visible={visible}
    >
      {parts.map((part, i) => (
        <mesh
          key={`${pose}-${i}`}
          geometry={part.geometry}
          material={figureMaterial}
          position={part.position}
          rotation={part.rotation}
          castShadow
        />
      ))}
    </group>
  );
});

HumanFigure.displayName = 'HumanFigure';
