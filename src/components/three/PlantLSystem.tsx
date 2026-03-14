'use client';

// ---------------------------------------------------------------------------
// L-Systemによるプロシージャル植物生成コンポーネント
// 種別ごとに異なる書き換えルールで文字列を展開し、3Dジオメトリに変換
// F=前進（シリンダー）、+=右回転、-=左回転、[=状態保存、]=状態復元
// 全セグメントをmergedBufferGeometryに統合してドローコール最小化
// species+seed+sizeの組み合わせでジオメトリをキャッシュ（再計算防止）
// ---------------------------------------------------------------------------

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 対応する植物種別 */
type PlantSpecies = 'fern' | 'tree' | 'bush' | 'bamboo';

interface PlantLSystemProps {
  /** 植物の根元座標 */
  position: [number, number, number];
  /** 植物の種別 */
  species: PlantSpecies;
  /** 全体スケール */
  size: number;
  /** 乱数シード（同じ値で同じ形状を再現） */
  seed: number;
  /** 品質レベル: 'high' | 'medium' | 'low' */
  qualityLevel: string;
}

// ---------------------------------------------------------------------------
// L-System ルール定義（コンポーネント外）
// ---------------------------------------------------------------------------

/** 種別ごとの L-System ルール */
interface LSystemRule {
  /** 初期文字列（公理） */
  axiom: string;
  /** 書き換えルール */
  rules: Record<string, string>;
  /** 展開回数 */
  iterations: number;
  /** 回転角度（度） */
  angle: number;
  /** セグメント長 */
  segmentLength: number;
  /** セグメント半径 */
  segmentRadius: number;
  /** 深さごとの半径減衰率 */
  radiusDecay: number;
  /** 葉を付けるか */
  hasLeaves: boolean;
  /** 幹の色 */
  trunkColor: string;
  /** 葉の色 */
  leafColor: string;
}

const SPECIES_RULES: Record<PlantSpecies, LSystemRule> = {
  fern: {
    axiom: 'F',
    rules: { F: 'F[+F]F[-F]F' },
    iterations: 3,
    angle: 25,
    segmentLength: 0.06,
    segmentRadius: 0.004,
    radiusDecay: 0.7,
    hasLeaves: true,
    trunkColor: '#3A5F0B',
    leafColor: '#5CB85C',
  },
  tree: {
    axiom: 'F',
    rules: { F: 'FF+[+F-F-F]-[-F+F+F]' },
    iterations: 2,
    angle: 22,
    segmentLength: 0.08,
    segmentRadius: 0.008,
    radiusDecay: 0.65,
    hasLeaves: true,
    trunkColor: '#5C3A1E',
    leafColor: '#2E8B57',
  },
  bush: {
    axiom: 'F',
    rules: { F: 'FF[+F][-F][F]' },
    iterations: 3,
    angle: 30,
    segmentLength: 0.04,
    segmentRadius: 0.003,
    radiusDecay: 0.75,
    hasLeaves: true,
    trunkColor: '#4A3728',
    leafColor: '#228B22',
  },
  bamboo: {
    axiom: 'F',
    rules: { F: 'FF[+L][-L]' },
    iterations: 4,
    angle: 15,
    segmentLength: 0.12,
    segmentRadius: 0.006,
    radiusDecay: 0.95,
    hasLeaves: true,
    trunkColor: '#8FBC8F',
    leafColor: '#006400',
  },
};

// ---------------------------------------------------------------------------
// 品質別のジオメトリ詳細度
// ---------------------------------------------------------------------------

/** シリンダーの円周セグメント数 */
const CYLINDER_RADIAL_MAP: Record<string, number> = {
  high: 6,
  medium: 4,
  low: 3,
};

/** 葉のジオメトリ詳細度 */
const LEAF_DETAIL_MAP: Record<string, number> = {
  high: 6,
  medium: 4,
  low: 3,
};

// ---------------------------------------------------------------------------
// ジオメトリキャッシュ
// ---------------------------------------------------------------------------

/** キャッシュキーからジオメトリへのマップ */
const geometryCache = new Map<string, { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null }>();

// ---------------------------------------------------------------------------
// シード付き擬似乱数生成器（再現性保証）
// ---------------------------------------------------------------------------

function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

// ---------------------------------------------------------------------------
// L-System 文字列展開
// ---------------------------------------------------------------------------

function expandLSystem(axiom: string, rules: Record<string, string>, iterations: number): string {
  let current = axiom;
  for (let i = 0; i < iterations; i++) {
    let next = '';
    for (const ch of current) {
      next += rules[ch] ?? ch;
    }
    current = next;
    // 極端に長い文字列を防止（メモリ保護）
    if (current.length > 50000) break;
  }
  return current;
}

// ---------------------------------------------------------------------------
// L-System 文字列 → 3Dジオメトリ変換
// ---------------------------------------------------------------------------

interface TurtleState {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  depth: number;
}

function buildGeometry(
  lString: string,
  rule: LSystemRule,
  scaleFactor: number,
  random: () => number,
  radialSegments: number,
  leafDetail: number
): { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry | null } {
  const trunkParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];

  // タートル状態スタック
  const stack: TurtleState[] = [];
  let pos = new THREE.Vector3(0, 0, 0);
  let dir = new THREE.Vector3(0, 1, 0); // 初期方向: 上
  let currentDepth = 0;

  const angleRad = (rule.angle * Math.PI) / 180;
  const segLen = rule.segmentLength * scaleFactor;

  // 回転用行列（useFrame外なのでnew OK）
  const rotMatrix = new THREE.Matrix4();
  const translationMatrix = new THREE.Matrix4();

  for (const ch of lString) {
    switch (ch) {
      case 'F': {
        // 前進: シリンダーセグメントを配置
        const radius = rule.segmentRadius * scaleFactor * Math.pow(rule.radiusDecay, currentDepth);
        const cyl = new THREE.CylinderGeometry(
          radius * 0.8, // 上端（細い）
          radius,        // 下端
          segLen,
          radialSegments,
          1
        );

        // シリンダーをY軸方向に沿って配置し、位置と向きを変換
        const endPos = pos.clone().add(dir.clone().multiplyScalar(segLen));
        const midPos = pos.clone().add(dir.clone().multiplyScalar(segLen / 2));

        // シリンダーをdir方向に回転
        const up = new THREE.Vector3(0, 1, 0);
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
        translationMatrix.makeRotationFromQuaternion(quat);
        translationMatrix.setPosition(midPos);

        cyl.applyMatrix4(translationMatrix);
        trunkParts.push(cyl);

        // 位置を更新
        pos = endPos;
        break;
      }
      case 'L':
      case 'l': {
        // 葉を描画（bamboo用の明示的葉記号）
        if (rule.hasLeaves) {
          const leafSize = rule.segmentRadius * scaleFactor * 3;
          const leaf = new THREE.ConeGeometry(leafSize, leafSize * 2, leafDetail);
          const leafMatrix = new THREE.Matrix4();
          leafMatrix.makeTranslation(pos.x, pos.y, pos.z);
          leaf.applyMatrix4(leafMatrix);
          leafParts.push(leaf);
        }
        break;
      }
      case '+': {
        // 右回転（Z軸周り）+ シードによる微小ランダム揺らぎ
        const jitter = (random() - 0.5) * 0.2;
        const angle = angleRad + jitter;
        rotMatrix.makeRotationZ(angle);
        dir.applyMatrix4(rotMatrix).normalize();
        break;
      }
      case '-': {
        // 左回転
        const jitter = (random() - 0.5) * 0.2;
        const angle = -(angleRad + jitter);
        rotMatrix.makeRotationZ(angle);
        dir.applyMatrix4(rotMatrix).normalize();
        break;
      }
      case '[': {
        // 状態保存
        stack.push({
          position: pos.clone(),
          direction: dir.clone(),
          depth: currentDepth,
        });
        currentDepth += 1;
        break;
      }
      case ']': {
        // 状態復元 → 分岐の先端に葉を配置
        if (rule.hasLeaves && leafParts.length < 500) {
          const leafSize = rule.segmentRadius * scaleFactor * 2.5;
          const leaf = new THREE.SphereGeometry(leafSize, leafDetail, leafDetail);
          const leafMatrix = new THREE.Matrix4();
          // ランダムな微小オフセット
          leafMatrix.makeTranslation(
            pos.x + (random() - 0.5) * leafSize,
            pos.y + (random() - 0.5) * leafSize,
            pos.z + (random() - 0.5) * leafSize
          );
          leaf.applyMatrix4(leafMatrix);
          leafParts.push(leaf);
        }

        const restored = stack.pop();
        if (restored) {
          pos = restored.position;
          dir = restored.direction;
          currentDepth = restored.depth;
        }
        break;
      }
    }
  }

  // ジオメトリを統合（ドローコール削減）
  const trunk = trunkParts.length > 0
    ? mergeGeometries(trunkParts, false)
    : new THREE.BufferGeometry();

  const leaves = leafParts.length > 0
    ? mergeGeometries(leafParts, false)
    : null;

  // 個別ジオメトリを解放
  for (const g of trunkParts) g.dispose();
  for (const g of leafParts) g.dispose();

  return { trunk, leaves };
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export const PlantLSystem = React.memo(function PlantLSystem({
  position,
  species,
  size,
  seed,
  qualityLevel,
}: PlantLSystemProps) {
  const rule = SPECIES_RULES[species];
  const radialSegments = CYLINDER_RADIAL_MAP[qualityLevel] ?? 4;
  const leafDetail = LEAF_DETAIL_MAP[qualityLevel] ?? 4;

  // キャッシュキー
  const cacheKey = `${species}_${seed}_${size}_${qualityLevel}`;

  // ジオメトリ生成（キャッシュ付き）
  const { trunk, leaves } = useMemo(() => {
    const cached = geometryCache.get(cacheKey);
    if (cached) return cached;

    // L-System 文字列を展開
    const lString = expandLSystem(rule.axiom, rule.rules, rule.iterations);

    // シード付き乱数生成器
    const random = createSeededRandom(seed);

    // 3Dジオメトリを構築
    const result = buildGeometry(lString, rule, size, random, radialSegments, leafDetail);

    // キャッシュに保存
    geometryCache.set(cacheKey, result);

    return result;
  }, [cacheKey, rule, size, seed, radialSegments, leafDetail]);

  return (
    <group position={position}>
      {/* 幹・枝 */}
      <mesh geometry={trunk}>
        <meshPhysicalMaterial
          color={rule.trunkColor}
          roughness={0.85}
          metalness={0.0}
        />
      </mesh>

      {/* 葉 */}
      {leaves && (
        <mesh geometry={leaves}>
          <meshPhysicalMaterial
            color={rule.leafColor}
            roughness={0.6}
            metalness={0.0}
            transmission={0.1}
            thickness={0.01}
          />
        </mesh>
      )}
    </group>
  );
});

PlantLSystem.displayName = 'PlantLSystem';
