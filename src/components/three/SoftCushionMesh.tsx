'use client';

// --- 日本語コメント ---
// ソフトクッション/ピローメッシュ: ソファ用の変形クッションジオメトリ
// BoxGeometryを細分割した後、頂点を変形させてふっくらした形状を生成
// 上面はサイン関数ベースの膨らみ、エッジにはクリース（折り目）を追加
// meshPhysicalMaterialのsheen機能でファブリックの光沢を表現

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface SoftCushionMeshProps {
  width: number;    // クッション幅 (m)
  height: number;   // クッション高さ (m)
  depth: number;    // クッション奥行 (m)
  color: string;    // 布地カラー (HEX)
  material: string; // マテリアルタイプ ('fabric'|'leather' など)
  position: [number, number, number];
  rotation: number; // Y軸回転 (ラジアン)
}

// ---------------------------------------------------------------------------
// ジオメトリキャッシュ（サイズの組み合わせごとに再利用）
// ---------------------------------------------------------------------------

const geometryCache = new Map<string, THREE.BufferGeometry>();

/** キャッシュキー */
function geoKey(w: number, h: number, d: number): string {
  return `cushion-${w.toFixed(3)}-${h.toFixed(3)}-${d.toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// クッション変形ジオメトリ生成
// ---------------------------------------------------------------------------

/** 細分割数（各辺あたり） */
const SUBDIVISIONS = 12;

/**
 * BoxGeometryの頂点を変形してクッション形状を作る
 *
 * 変形ルール:
 * 1. 全面: 中心から外周に向かってサイン関数で膨らみ（パラメトリック変形）
 * 2. 上面: 追加のpuffiness（サインベースのハイトフィールド）
 * 3. エッジ付近: クリース（折り目）としてわずかに凹ませる
 */
function createCushionGeometry(
  width: number,
  height: number,
  depth: number,
): THREE.BufferGeometry {
  const key = geoKey(width, height, depth);
  const cached = geometryCache.get(key);
  if (cached) return cached;

  const geo = new THREE.BoxGeometry(
    width,
    height,
    depth,
    SUBDIVISIONS,
    SUBDIVISIONS,
    SUBDIVISIONS,
  );

  const posAttr = geo.getAttribute('position');
  const normalAttr = geo.getAttribute('normal');
  const positions = posAttr.array as Float32Array;
  const normals = normalAttr.array as Float32Array;

  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;

  // 膨らみの最大量（高さの30%）
  const bulgeAmount = height * 0.30;
  // 上面パフィネスの追加膨らみ
  const puffinessAmount = height * 0.15;
  // クリース（折り目）の深さ
  const creaseDepth = height * 0.05;
  // クリースの幅（エッジからの距離の割合）
  const creaseZone = 0.15; // 15%幅

  for (let i = 0; i < posAttr.count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    // 各軸方向の正規化位置 (-1〜1)
    const nx = halfW > 0 ? x / halfW : 0;
    const ny = halfH > 0 ? y / halfH : 0;
    const nz = halfD > 0 ? z / halfD : 0;

    // 法線方向の判定（どの面にいるか）
    const normX = normals[i * 3];
    const normY = normals[i * 3 + 1];
    const normZ = normals[i * 3 + 2];

    // --- 1. パラメトリック膨らみ ---
    // 面の中心からの距離に基づく膨らみ量
    // cos関数で端に行くほどスムーズに減衰

    let dx = 0;
    let dy = 0;
    let dz = 0;

    if (Math.abs(normY) > 0.5) {
      // 上面・下面: XZ平面上で膨らむ
      const distX = Math.abs(nx);
      const distZ = Math.abs(nz);
      // 中心からの距離が小さいほど大きく膨らむ
      const bulge = Math.cos(distX * Math.PI * 0.5) * Math.cos(distZ * Math.PI * 0.5);
      dy = normY > 0 ? bulge * bulgeAmount : -bulge * bulgeAmount * 0.5;

      // --- 2. 上面のパフィネス（サインベースのハイトフィールド） ---
      if (normY > 0) {
        const puff = Math.sin((nx * 0.5 + 0.5) * Math.PI) *
                     Math.sin((nz * 0.5 + 0.5) * Math.PI);
        dy += puff * puffinessAmount;
      }
    } else if (Math.abs(normX) > 0.5) {
      // 左面・右面: Y,Z方向の中心から膨らむ
      const distY = Math.abs(ny);
      const distZ = Math.abs(nz);
      const bulge = Math.cos(distY * Math.PI * 0.5) * Math.cos(distZ * Math.PI * 0.5);
      dx = normX > 0 ? bulge * bulgeAmount * 0.6 : -bulge * bulgeAmount * 0.6;
    } else if (Math.abs(normZ) > 0.5) {
      // 前面・背面: X,Y方向の中心から膨らむ
      const distX = Math.abs(nx);
      const distY = Math.abs(ny);
      const bulge = Math.cos(distX * Math.PI * 0.5) * Math.cos(distY * Math.PI * 0.5);
      dz = normZ > 0 ? bulge * bulgeAmount * 0.6 : -bulge * bulgeAmount * 0.6;
    }

    // --- 3. エッジクリース（折り目） ---
    // 各エッジに近い頂点をわずかに内側に凹ませて折り目感を出す
    const edgeProximityX = Math.max(0, 1 - Math.abs(1 - Math.abs(nx)) / creaseZone);
    const edgeProximityZ = Math.max(0, 1 - Math.abs(1 - Math.abs(nz)) / creaseZone);

    // 上面のエッジのみにクリースを適用
    if (normY > 0.5) {
      const crease = Math.max(edgeProximityX, edgeProximityZ);
      // サイン関数でスムーズなクリース形状
      const creaseAmount = Math.sin(crease * Math.PI * 0.5) * creaseDepth;
      dy -= creaseAmount;
    }

    // 変形適用
    positions[i * 3] = x + dx;
    positions[i * 3 + 1] = y + dy;
    positions[i * 3 + 2] = z + dz;
  }

  // 法線を再計算（変形後のジオメトリに合わせる）
  geo.computeVertexNormals();

  geometryCache.set(key, geo);
  return geo;
}

// ---------------------------------------------------------------------------
// マテリアル設定ヘルパー
// ---------------------------------------------------------------------------

/** マテリアルタイプ別のPhysicalMaterialパラメータ */
function getMaterialParams(material: string): {
  roughness: number;
  metalness: number;
  sheen: number;
  sheenRoughness: number;
  sheenColorHex: string;
} {
  switch (material) {
    case 'leather':
      return {
        roughness: 0.4,
        metalness: 0,
        sheen: 0.3,
        sheenRoughness: 0.6,
        sheenColorHex: '#332211',
      };
    case 'velvet':
      return {
        roughness: 0.9,
        metalness: 0,
        sheen: 0.8,
        sheenRoughness: 0.3,
        sheenColorHex: '#FFFFFF',
      };
    case 'fabric':
    default:
      return {
        roughness: 0.75,
        metalness: 0,
        sheen: 0.5,
        sheenRoughness: 0.5,
        sheenColorHex: '#DDDDDD',
      };
  }
}

// ---------------------------------------------------------------------------
// props比較関数
// ---------------------------------------------------------------------------

function cushionPropsAreEqual(
  prev: SoftCushionMeshProps,
  next: SoftCushionMeshProps,
): boolean {
  if (prev.width !== next.width) return false;
  if (prev.height !== next.height) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.color !== next.color) return false;
  if (prev.material !== next.material) return false;
  if (prev.rotation !== next.rotation) return false;
  if (prev.position[0] !== next.position[0]) return false;
  if (prev.position[1] !== next.position[1]) return false;
  if (prev.position[2] !== next.position[2]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

/**
 * ソフトクッションメッシュ
 *
 * 細分割されたBoxGeometryの頂点をパラメトリック変形させて
 * ふっくらとしたクッション/ピロー形状を実現。
 * meshPhysicalMaterialのsheen機能でファブリック特有の光沢を表現。
 */
export const SoftCushionMesh = React.memo(function SoftCushionMesh({
  width,
  height,
  depth,
  color,
  material,
  position,
  rotation,
}: SoftCushionMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // 変形済みクッションジオメトリ
  const geometry = useMemo(() => {
    return createCushionGeometry(width, height, depth);
  }, [width, height, depth]);

  // マテリアルパラメータ
  const matParams = useMemo(() => getMaterialParams(material), [material]);

  // sheenカラー
  const sheenColor = useMemo(() => new THREE.Color(matParams.sheenColorHex), [matParams.sheenColorHex]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={position}
      rotation={[0, rotation, 0]}
      castShadow
      receiveShadow
    >
      <meshPhysicalMaterial
        color={color}
        roughness={matParams.roughness}
        metalness={matParams.metalness}
        sheen={matParams.sheen}
        sheenRoughness={matParams.sheenRoughness}
        sheenColor={sheenColor}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}, cushionPropsAreEqual);
