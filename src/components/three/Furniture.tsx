'use client';

import React, { useRef, useState, Suspense, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import { RoundedBox, Html } from '@react-three/drei';
import { FurnitureItem, FurnitureMaterial, WoodType, FabricType, MetalFinish } from '@/types/scene';
import { WallSegment } from '@/types/floor-plan';
import { useEditorStore } from '@/stores/useEditorStore';
import { useCameraStore } from '@/stores/useCameraStore';
import { useUIStore } from '@/stores/useUIStore';
import { STYLE_PRESETS } from '@/data/styles';
import {
  useScaledGLTF,
  overrideModelColor,
  applyModelHighlight,
  enableModelShadows,
} from '@/lib/gltf-loader';
import { FurnitureDimensionLabel } from './FurnitureDimensionLabel';
import {
  getCachedGeometry,
  getCachedPhysicalMaterial,
} from './furniture/FurnitureGeometryCache';
import {
  generateWoodTexture,
  generateWoodTextureWithNormal,
  generateFabricTexture,
  generateMetalTexture,
  getFurnitureTexSizes,
} from './furniture/FurnitureTextures';

/** グリッドスナップ: 値を最寄りのグリッドポイントに吸着 */
function snapToGridValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** 壁スナップ結果 */
interface WallSnapResult {
  x: number;
  z: number;
}

/** 点から線分への最近接点を求め、距離が閾値以下ならスナップ位置を返す */
function findNearestWallSnap(
  x: number,
  z: number,
  walls: WallSegment[],
  threshold: number,
): WallSnapResult | null {
  let minDist = Infinity;
  let bestSnap: WallSnapResult | null = null;

  for (const wall of walls) {
    const ax = wall.start.x;
    const az = wall.start.y; // 2D y -> 3D z
    const bx = wall.end.x;
    const bz = wall.end.y;

    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) continue;

    // 線分上の最近接パラメータ t (0~1にクランプ)
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lenSq));
    const closestX = ax + t * dx;
    const closestZ = az + t * dz;

    const dist = Math.sqrt((x - closestX) ** 2 + (z - closestZ) ** 2);

    if (dist < threshold && dist < minDist) {
      minDist = dist;
      // 壁の法線方向にthickness/2分オフセットして壁面に配置
      const wallLen = Math.sqrt(lenSq);
      const nx = -dz / wallLen; // 法線 (左手)
      const nz = dx / wallLen;
      // 家具が壁のどちら側にいるか判定
      const side = (x - closestX) * nx + (z - closestZ) * nz;
      const sign = side >= 0 ? 1 : -1;
      const offset = (wall.thickness / 2) * sign;
      bestSnap = {
        x: closestX + nx * offset,
        z: closestZ + nz * offset,
      };
    }
  }

  return bestSnap;
}

/** スタイル別家具カラーパレット */
interface FurniturePalette {
  primary: string;
  secondary: string;
  accent: string;
  metal: string;
  fabric: string;
}

/** スタイル別PBRパラメータ */
interface FurniturePBR {
  roughness: number;
  metalness: number;
}

/** 素材別PBRプリセット — リアルな建材に近い値（高品質チューニング済み） */
const MATERIAL_PBR: Record<FurnitureMaterial, FurniturePBR> = {
  wood:    { roughness: 0.48, metalness: 0.04 },  // ワックスがけされた木（clearcoat+20%, envMap+15%で運用）
  metal:   { roughness: 0.054, metalness: 0.9 },  // ブラッシュドメタル（roughness-10%で鏡面感向上）
  fabric:  { roughness: 0.82, metalness: 0.0  },  // ファブリック（sheen+15%, sheenRoughness-10%で質感向上）
  leather: { roughness: 0.32, metalness: 0.06 },  // なめし革（clearcoat+20%で光沢感向上）
  glass:   { roughness: 0.01, metalness: 0.04 },  // クリアガラス（envMap+20%, dispersion:0.4で虹彩効果）
  plastic: { roughness: 0.3,  metalness: 0.0  },  // ツヤのあるプラスチック
  stone:   { roughness: 0.82, metalness: 0.03 },  // 天然石
};

// Re-export cleanupFurnitureCaches for external consumers
export { cleanupFurnitureCaches } from './furniture/FurnitureGeometryCache';



/** 共有ジオメトリ: 椅子/テーブル脚など頻出パーツ */
const SHARED_LEG_GEO_8 = new THREE.CylinderGeometry(0.015, 0.018, 1, 8);
const SHARED_FOOT_GEO = new THREE.CylinderGeometry(0.04, 0.04, 0.005, 12);
const SHARED_CROSSBAR_GEO = new THREE.BoxGeometry(1, 0.012, 0.012);
const SHARED_SLAT_GEO = new THREE.BoxGeometry(1, 0.012, 0.008);

/** ドラッグプレビュー用プリアロケートジオメトリ（コンポーネント外で生成） */
const DRAG_CIRCLE_GEOMETRY = new THREE.CircleGeometry(1, 32);
const DRAG_CIRCLE_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x3B82F6,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** モバイル用ヒットエリアの共有マテリアル（不可視） */
const HIT_AREA_MATERIAL = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
});

interface FurnitureProps {
  item: FurnitureItem;
  selected: boolean;
  isDeleting?: boolean;
  onSelect: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onMove: (id: string, position: [number, number, number]) => void;
  qualityLevel?: 'high' | 'medium' | 'low';
}

/** 家具アイテムの比較関数: 必要なpropsが変わった時のみ再レンダリング */
function furniturePropsAreEqual(
  prev: FurnitureProps,
  next: FurnitureProps,
): boolean {
  if (prev.item.id !== next.item.id) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.isDeleting !== next.isDeleting) return false;
  // 位置が変わった場合（ドラッグ完了時）
  if (
    prev.item.position[0] !== next.item.position[0] ||
    prev.item.position[1] !== next.item.position[1] ||
    prev.item.position[2] !== next.item.position[2]
  ) return false;
  // 回転が変わった場合
  if (
    prev.item.rotation[0] !== next.item.rotation[0] ||
    prev.item.rotation[1] !== next.item.rotation[1] ||
    prev.item.rotation[2] !== next.item.rotation[2]
  ) return false;
  // スケール・色・素材・モデルURL
  if (
    prev.item.scale[0] !== next.item.scale[0] ||
    prev.item.scale[1] !== next.item.scale[1] ||
    prev.item.scale[2] !== next.item.scale[2]
  ) return false;
  if (prev.item.color !== next.item.color) return false;
  if (prev.item.material !== next.item.material) return false;
  if (prev.item.modelUrl !== next.item.modelUrl) return false;
  // コールバックの参照比較（useCallbackで安定化されている前提）
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onToggleSelect !== next.onToggleSelect) return false;
  if (prev.onMove !== next.onMove) return false;
  if (prev.qualityLevel !== next.qualityLevel) return false;
  return true;
}

/** 15度刻みスナップ */
const ROTATION_SNAP_RAD = (15 * Math.PI) / 180;
function snapRotation(rad: number): number {
  return Math.round(rad / ROTATION_SNAP_RAD) * ROTATION_SNAP_RAD;
}

export const Furniture = React.memo(function Furniture({ item, selected, isDeleting, onSelect, onToggleSelect, onMove, qualityLevel = 'high' }: FurnitureProps) {
  const groupRef = useRef<THREE.Group>(null);

  // 配置時「ポップ」アニメーション: マウント時にscale 0→1.0 (400ms elastic easing)
  const placementAnimRef = useRef({ active: true, elapsed: 0, duration: 0.4 });

  // 削除フェードアニメーション用ref
  const deleteAnimRef = useRef({ active: false, elapsed: 0, duration: 0.2 });

  // 選択時エミッシブグロー用ref
  const emissivePhaseRef = useRef(0);

  const style = useEditorStore((s) => s.style);
  // スナップ設定はドラッグ中getState()で直接取得（サブスクリプション不要）
  const styleConfig = STYLE_PRESETS[style];
  const palette = styleConfig.furniturePalette;
  const stylePbr: FurniturePBR = { roughness: styleConfig.furnitureRoughness, metalness: styleConfig.furnitureMetalness };
  const pbr: FurniturePBR = item.material ? MATERIAL_PBR[item.material] : stylePbr;

  // 品質レベル連動テクスチャ解像度
  const furnitureTexSize = qualityLevel === 'high' ? 2048 : qualityLevel === 'medium' ? 512 : 256;
  const furnitureTexSmall = qualityLevel === 'high' ? 1024 : qualityLevel === 'medium' ? 256 : 128;

  // ヒットエリア用ジオメトリ (scale変更時のみ再生成)
  const hitAreaGeometry = useMemo(
    () => new THREE.BoxGeometry(item.scale[0] + 0.3, item.scale[1] + 0.2, item.scale[2] + 0.3),
    [item.scale[0], item.scale[1], item.scale[2]],
  );

  // ホバー状態（寸法ラベル表示用）
  const [isHovered, setIsHovered] = useState(false);

  // ドラッグ状態をrefで管理（React再レンダリングを避ける）
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  // スナップ状態もref管理（ドラッグ中の高頻度setState排除）
  const snappedToWallRef = useRef(false);
  const snappedToGridRef = useRef(false);
  const [snappedToWall, setSnappedToWall] = useState(false);
  const [snappedToGrid, setSnappedToGrid] = useState(false);
  // ドラッグ中の目標位置（lerp用）
  const dragTargetRef = useRef(new THREE.Vector3());
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragOffset = useRef(new THREE.Vector3());

  // ドラッグ中の座標表示用ref（state更新せずrefで高速追跡）
  const dragPosRef = useRef({ x: 0, z: 0 });
  const coordLabelRef = useRef<HTMLDivElement>(null);
  const dragCircleRef = useRef<THREE.Mesh>(null);
  // ドラッグ時の半透明化: 元のopacityを保存
  const originalOpacitiesRef = useRef<Map<THREE.Material, { opacity: number; transparent: boolean }>>(new Map());

  // 回転ハンドル用state（ref管理でuseFrame互換）
  const isRotatingRef = useRef(false);
  const [isRotating, setIsRotating] = useState(false);
  const rotateStartAngle = useRef(0);
  const rotateStartRotation = useRef(0);

  // モバイル長押しドラッグ: 500msホールドでドラッグモード有効化
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressReadyRef = useRef(false);
  const pendingPointerEventRef = useRef<ThreeEvent<PointerEvent> | null>(null);
  const isTouchDeviceRef = useRef(false);

  // パルスアニメーション用ref（選択時に発動）
  const pulseRef = useRef<THREE.Mesh>(null);
  const pulsePhaseRef = useRef(0);

  // pointerDown即時フィードバック用（1.02xスケール）
  const isPointerDownRef = useRef(false);

  // パルスリングのジオメトリをmemo化 (scale変更時のみ再生成)
  const pulseRingGeometry = useMemo(() => {
    const maxDim = Math.max(item.scale[0], item.scale[2]);
    return new THREE.RingGeometry(maxDim * 0.5 + 0.1, maxDim * 0.5 + 0.25, 32);
  }, [item.scale[0], item.scale[2]]);

  // メモリクリーンアップ: アンマウント時にジオメトリをdispose (G)
  useEffect(() => {
    return () => {
      hitAreaGeometry.dispose();
      pulseRingGeometry.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // フラスタムカリング用: バウンディングボックスの明示的計算 + グループレベルカリング
  useEffect(() => {
    if (!groupRef.current) return;
    // グループ自体もfrustumCulled有効化
    groupRef.current.frustumCulled = true;
    // 1フレーム遅延でジオメトリが確定した後にbounding box/sphere計算
    const timer = requestAnimationFrame(() => {
      if (groupRef.current) {
        groupRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            child.geometry.computeBoundingBox();
            child.geometry.computeBoundingSphere();
            child.frustumCulled = true;
          }
          // グループ/Object3DにもfrustumCulled設定
          child.frustumCulled = true;
        });
      }
    });
    return () => cancelAnimationFrame(timer);
  }, [item.type, item.modelUrl]);

  // 削除アニメーション開始検知
  useEffect(() => {
    if (isDeleting && !deleteAnimRef.current.active) {
      deleteAnimRef.current = { active: true, elapsed: 0, duration: 0.2 };
    }
  }, [isDeleting]);

  // パルスアニメーション + 配置ポップ + 選択グロー + 削除フェード
  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // 削除フェードアニメーション: opacity 1→0 (200ms)
    if (deleteAnimRef.current.active) {
      deleteAnimRef.current.elapsed += delta;
      const t = Math.min(deleteAnimRef.current.elapsed / deleteAnimRef.current.duration, 1);
      const opacity = 1 - t;
      // 全メッシュの透明度を直接操作
      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            mat.transparent = true;
            mat.opacity = opacity;
            mat.needsUpdate = true;
          }
        }
      });
      if (t >= 1) {
        deleteAnimRef.current.active = false;
        // アニメーション完了 → 実際の削除
        useEditorStore.getState().completeDeleteFurniture(item.id);
      }
      return; // 削除中は他のアニメーションスキップ
    }

    // 配置ポップアニメーション (マウント時400ms, elastic easing)
    if (placementAnimRef.current.active) {
      placementAnimRef.current.elapsed += delta;
      const t = Math.min(placementAnimRef.current.elapsed / placementAnimRef.current.duration, 1);
      // elastic easing (bounce): sin波減衰で弾むような動き
      const p = 0.3; // 周期パラメータ
      const eased = t === 1 ? 1 : -(Math.pow(2, -10 * t)) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
      const s = eased; // 0→1 with elastic bounce
      groupRef.current.scale.setScalar(s);
      if (t >= 1) {
        placementAnimRef.current.active = false;
        groupRef.current.scale.setScalar(1);
      }
      // 配置アニメーション中は他のスケール処理スキップ
      if (t < 1) return;
    }

    // pointerDown即時フィードバック: 1.02xスケール (タッチレスポンス向上)
    {
      const targetScale = isPointerDownRef.current ? 1.02 : 1.0;
      const currentScale = groupRef.current.scale.x;
      const newScale = currentScale + (targetScale - currentScale) * 0.3;
      if (Math.abs(newScale - currentScale) > 0.001) {
        groupRef.current.scale.setScalar(newScale);
      }
    }

    // 選択時エミッシブグロー: emissiveIntensity 0→0.15→0 (1.5sループ)
    if (selected) {
      emissivePhaseRef.current += delta * (2 * Math.PI / 1.5); // 1.5秒周期
      const glowIntensity = (Math.sin(emissivePhaseRef.current) * 0.5 + 0.5) * 0.15;
      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            if ('emissiveIntensity' in mat) {
              (mat as THREE.MeshStandardMaterial).emissiveIntensity = glowIntensity;
              if ('emissive' in mat && (mat as THREE.MeshStandardMaterial).emissive) {
                (mat as THREE.MeshStandardMaterial).emissive.setHex(0x3B82F6);
              }
            }
          }
        }
      });
    } else {
      // 非選択時: エミッシブリセット
      if (emissivePhaseRef.current !== 0) {
        emissivePhaseRef.current = 0;
        groupRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
              if ('emissiveIntensity' in mat) {
                (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0;
              }
            }
          }
        });
      }
    }

    // パルスリングアニメーション
    if (!selected || !pulseRef.current) return;
    pulsePhaseRef.current += delta * 2.5;
    const scale = 1 + Math.sin(pulsePhaseRef.current) * 0.08;
    pulseRef.current.scale.set(scale, scale, 1);
    const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.25 + Math.sin(pulsePhaseRef.current) * 0.15;
  });

  // ドラッグ中: 毎フレームlerpで滑らかに目標位置へ追従
  useFrame(() => {
    if (!isDraggingRef.current || !groupRef.current) return;
    const pos = groupRef.current.position;
    const target = dragTargetRef.current;
    // 高速lerp — 即応性を保ちつつ滑らかに収束
    pos.x += (target.x - pos.x) * 0.5;
    pos.z += (target.z - pos.z) * 0.5;
  });

  /** ドラッグ開始時: 半透明化 + 初期位置記録 */
  const applyDragTransparency = useCallback(() => {
    if (!groupRef.current) return;
    originalOpacitiesRef.current.clear();
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!originalOpacitiesRef.current.has(mat)) {
            originalOpacitiesRef.current.set(mat, { opacity: mat.opacity, transparent: mat.transparent });
          }
          mat.transparent = true;
          mat.opacity = Math.min(mat.opacity, 0.6);
          mat.needsUpdate = true;
        }
      }
    });
  }, []);

  /** ドラッグ終了時: 元のopacityに復元 */
  const restoreDragTransparency = useCallback(() => {
    originalOpacitiesRef.current.forEach((saved, mat) => {
      mat.opacity = saved.opacity;
      mat.transparent = saved.transparent;
      mat.needsUpdate = true;
    });
    originalOpacitiesRef.current.clear();
  }, []);

  /** ドラッグを実際に開始する共通処理 */
  const startDrag = useCallback((e: ThreeEvent<PointerEvent>) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    useUIStore.getState().setIsDraggingFurniture(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const intersect = new THREE.Vector3();
    e.ray.intersectPlane(dragPlane.current, intersect);
    dragOffset.current.copy(intersect).sub(new THREE.Vector3(...item.position));

    // 初期ドラッグ位置を記録
    dragPosRef.current = { x: item.position[0], z: item.position[2] };
    // lerp目標を初期位置に設定
    dragTargetRef.current.set(item.position[0], item.position[1], item.position[2]);

    // 半透明化を適用（次フレームで確実にメッシュが存在するよう少し遅延）
    requestAnimationFrame(() => applyDragTransparency());
  }, [item.position, applyDragTransparency]);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // 即時視覚フィードバック（1.02xスケール）
    isPointerDownRef.current = true;
    // Shift+クリックで複数選択トグル
    if (e.nativeEvent.shiftKey && onToggleSelect) {
      onToggleSelect(item.id);
      return; // ドラッグは開始しない
    }
    onSelect(item.id);

    // タッチデバイス判定: pointerType === 'touch' の場合は長押し待ち
    const isTouch = e.nativeEvent.pointerType === 'touch';
    isTouchDeviceRef.current = isTouch;

    if (isTouch) {
      // モバイル: 長押し500msでドラッグモード有効化
      longPressReadyRef.current = false;
      pendingPointerEventRef.current = e;
      longPressTimerRef.current = setTimeout(() => {
        longPressReadyRef.current = true;
        // 触覚フィードバック代わりのビジュアル: pulseフラッシュ
        if (pulseRef.current) {
          const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.6;
        }
        if (pendingPointerEventRef.current) {
          startDrag(pendingPointerEventRef.current);
        }
      }, 500);
    } else {
      // デスクトップ: 即座にドラッグ開始
      startDrag(e);
    }
  }, [item.id, onSelect, onToggleSelect, startDrag]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    // モバイル長押し待ち中に指が動いたらタイマーキャンセル（スクロール/オービット優先）
    if (isTouchDeviceRef.current && !longPressReadyRef.current && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      pendingPointerEventRef.current = null;
      return;
    }
    // refで高速チェック（React stateを読まない）
    if (!isDraggingRef.current || !groupRef.current) return;
    e.stopPropagation();

    const intersect = new THREE.Vector3();
    e.ray.intersectPlane(dragPlane.current, intersect);

    let x = intersect.x - dragOffset.current.x;
    let z = intersect.z - dragOffset.current.z;

    // グリッドスナップ
    const currentSnapToGrid = useCameraStore.getState().snapToGrid3D;
    const currentGridSize = useCameraStore.getState().gridSnapSize;
    if (currentSnapToGrid) {
      x = snapToGridValue(x, currentGridSize);
      z = snapToGridValue(z, currentGridSize);
      snappedToGridRef.current = true;
    } else {
      snappedToGridRef.current = false;
    }

    // 壁スナップ
    const currentSnapToWall = useCameraStore.getState().snapToWall;
    const currentWalls = useEditorStore.getState().walls;
    if (currentSnapToWall) {
      const wallSnap = findNearestWallSnap(x, z, currentWalls, 0.3);
      if (wallSnap) {
        x = wallSnap.x;
        z = wallSnap.z;
        snappedToWallRef.current = true;
      } else {
        snappedToWallRef.current = false;
      }
    } else {
      snappedToWallRef.current = false;
    }

    // スナップ状態変化時のみsetState（リレンダリング最小化）
    if (snappedToGridRef.current !== snappedToGrid) setSnappedToGrid(snappedToGridRef.current);
    if (snappedToWallRef.current !== snappedToWall) setSnappedToWall(snappedToWallRef.current);

    // ドラッグ目標位置をrefに格納（useFrameでlerpして滑らかに追従）
    dragTargetRef.current.set(x, item.position[1], z);

    // ゴーストプレビュー: 座標ラベル更新（DOM直接操作、state更新なし）
    dragPosRef.current = { x, z };
    if (coordLabelRef.current) {
      coordLabelRef.current.textContent = `X: ${x.toFixed(2)}  Z: ${z.toFixed(2)}`;
    }

    // ドラッグインジケーター円の位置更新
    if (dragCircleRef.current) {
      dragCircleRef.current.position.set(0, -item.position[1] + 0.01, 0);
    }

  }, [item.position, snappedToGrid, snappedToWall]);

  const handlePointerUp = useCallback(() => {
    // 即時フィードバック解除
    isPointerDownRef.current = false;
    // 長押しタイマーのクリーンアップ
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressReadyRef.current = false;
    pendingPointerEventRef.current = null;
    isTouchDeviceRef.current = false;

    if (!isDraggingRef.current || !groupRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    snappedToWallRef.current = false;
    snappedToGridRef.current = false;
    setSnappedToWall(false);
    setSnappedToGrid(false);
    useUIStore.getState().setIsDraggingFurniture(false);

    // 半透明を元に戻す
    restoreDragTransparency();

    // pointerUp時のみZustand更新（確定値をストアに反映）
    const pos = groupRef.current.position;
    onMove(item.id, [pos.x, pos.y, pos.z]);
  }, [item.id, onMove, restoreDragTransparency]);

  // 回転ハンドルのポインター操作
  const handleRotateStart = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    isRotatingRef.current = true;
    setIsRotating(true);
    useUIStore.getState().setIsDraggingFurniture(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    // 家具のワールド位置からポインターまでの角度を初期角度として記録
    const intersect = new THREE.Vector3();
    e.ray.intersectPlane(dragPlane.current, intersect);
    const furniturePos = groupRef.current?.position ?? new THREE.Vector3(...item.position);
    rotateStartAngle.current = Math.atan2(
      intersect.x - furniturePos.x,
      intersect.z - furniturePos.z
    );
    rotateStartRotation.current = item.rotation[1];
  }, [item.position, item.rotation]);

  const handleRotateMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!isRotatingRef.current || !groupRef.current) return;
    e.stopPropagation();

    const intersect = new THREE.Vector3();
    e.ray.intersectPlane(dragPlane.current, intersect);
    const furniturePos = groupRef.current.position;
    const currentAngle = Math.atan2(
      intersect.x - furniturePos.x,
      intersect.z - furniturePos.z
    );
    const deltaAngle = currentAngle - rotateStartAngle.current;
    const newRotation = snapRotation(rotateStartRotation.current + deltaAngle);

    // ref経由で直接回転更新（再レンダリング回避）
    groupRef.current.rotation.set(
      item.rotation[0],
      newRotation,
      item.rotation[2]
    );
  }, [item.rotation]);

  const handleRotateUp = useCallback(() => {
    if (!isRotatingRef.current || !groupRef.current) return;
    isRotatingRef.current = false;
    setIsRotating(false);
    useUIStore.getState().setIsDraggingFurniture(false);

    // 確定値をストアに反映
    const finalRotationY = groupRef.current.rotation.y;
    useEditorStore.getState().rotateFurniture(item.id, finalRotationY);
  }, [item.id]);

  return (
    <group
      ref={groupRef}
      position={item.position}
      rotation={item.rotation}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {item.modelUrl ? (
        <Suspense fallback={<FurnitureModel type={item.type} scale={item.scale} color={item.color ?? ''} palette={palette} pbr={pbr} selected={selected} styleName={styleConfig.name} woodType={styleConfig.woodType} fabricType={styleConfig.fabricType} metalFinish={styleConfig.metalFinish} qualityLevel={qualityLevel} />}>
          <GLTFModelRenderer modelUrl={item.modelUrl} scale={item.scale} color={item.color} selected={selected} />
        </Suspense>
      ) : (
        <FurnitureModel type={item.type} scale={item.scale} color={item.color ?? ''} palette={palette} pbr={pbr} selected={selected} styleName={styleConfig.name} woodType={styleConfig.woodType} fabricType={styleConfig.fabricType} metalFinish={styleConfig.metalFinish} qualityLevel={qualityLevel} />
      )}
      {/* モバイル用: 拡大ヒットエリア（不可視メッシュ、ジオメトリmemo化） */}
      <mesh
        position={[0, item.scale[1] / 2, 0]}
        visible={false}
        geometry={hitAreaGeometry}
        material={HIT_AREA_MATERIAL}
      />
      {/* 選択時パルスアニメーション (ジオメトリmemo化済み) */}
      {selected && (
        <mesh
          ref={pulseRef}
          geometry={pulseRingGeometry}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.015, 0]}
        >
          <meshBasicMaterial color="#3B82F6" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
      {selected && <SelectionIndicator scale={item.scale} />}
      {/* 選択中の回転ハンドル（トーラスリング） */}
      {selected && (
        <RotationHandle
          height={item.scale[1]}
          radius={Math.max(item.scale[0], item.scale[2]) * 0.5 + 0.15}
          isRotating={isRotating}
          parentGroupRef={groupRef}
          baseRotationY={item.rotation[1]}
          onPointerDown={handleRotateStart}
          onPointerMove={handleRotateMove}
          onPointerUp={handleRotateUp}
        />
      )}
      {isDragging && snappedToGrid && !snappedToWall && <GridSnapIndicator scale={item.scale} />}
      {isDragging && snappedToWall && <WallSnapIndicator scale={item.scale} />}
      {/* ゴーストプレビュー: ドラッグ中のみ表示 */}
      {isDragging && (
        <DragGhostIndicator
          scale={item.scale}
          heightY={item.position[1]}
          dragPosRef={dragPosRef}
          coordLabelRef={coordLabelRef}
          dragCircleRef={dragCircleRef}
          snappedToGrid={snappedToGrid}
        />
      )}
      {/* ホバー時寸法ラベル（ドラッグ中は非表示） */}
      <FurnitureDimensionLabel item={item} visible={isHovered && !isDragging} />
    </group>
  );
}, furniturePropsAreEqual);

/** 回転ハンドル: 家具の上部に表示されるトーラスリング + 角度表示 */
interface RotationHandleProps {
  height: number;
  radius: number;
  isRotating: boolean;
  parentGroupRef: React.RefObject<THREE.Group | null>;
  baseRotationY: number;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: () => void;
}

/** 方向ラベルデータ */
const CARDINAL_LABELS: { label: string; angle: number }[] = [
  { label: '\u524D', angle: 0 },
  { label: '\u53F3', angle: Math.PI / 2 },
  { label: '\u5F8C', angle: Math.PI },
  { label: '\u5DE6', angle: -Math.PI / 2 },
];

/** 角度弧ジオメトリを生成 (XZ平面上) */
function createArcGeometry(angleDeg: number, arcRadius: number): THREE.BufferGeometry {
  const segments = Math.max(2, Math.abs(Math.round(angleDeg / 3)));
  const angleRad = (angleDeg * Math.PI) / 180;
  const points: THREE.Vector3[] = [];
  points.push(new THREE.Vector3(0, 0, 0));
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * angleRad;
    points.push(new THREE.Vector3(Math.sin(t) * arcRadius, 0, -Math.cos(t) * arcRadius));
  }
  const indices: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    indices.push(0, i, i + 1);
  }
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(points.length * 3);
  points.forEach((p, idx) => {
    positions[idx * 3] = p.x;
    positions[idx * 3 + 1] = p.y;
    positions[idx * 3 + 2] = p.z;
  });
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

function RotationHandle({
  height,
  radius,
  isRotating,
  parentGroupRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: RotationHandleProps) {
  const ringRadius = Math.max(0.25, radius);

  // 角度表示用ref (useFrame更新、setState不使用)
  const angleLabelRef = useRef<HTMLDivElement>(null);
  const arcMeshRef = useRef<THREE.Mesh>(null);
  const snapFlashRef = useRef<THREE.Mesh>(null);
  const lastSnappedDeg = useRef<number>(0);
  const flashTimer = useRef<number>(0);

  // useFrameで角度テキストと弧を毎フレーム更新（回転中のみ）
  useFrame((_, delta) => {
    if (!isRotating || !parentGroupRef.current) return;

    const currentRotY = parentGroupRef.current.rotation.y;
    let deg = ((currentRotY * 180) / Math.PI) % 360;
    if (deg > 180) deg -= 360;
    if (deg < -180) deg += 360;
    const roundedDeg = Math.round(deg);

    if (angleLabelRef.current) {
      angleLabelRef.current.textContent = `${roundedDeg}\u00B0`;
    }

    if (arcMeshRef.current && Math.abs(roundedDeg) > 1) {
      const oldGeo = arcMeshRef.current.geometry;
      arcMeshRef.current.geometry = createArcGeometry(roundedDeg, ringRadius * 0.7);
      oldGeo.dispose();
      arcMeshRef.current.rotation.y = -currentRotY;
      arcMeshRef.current.visible = true;
    } else if (arcMeshRef.current) {
      arcMeshRef.current.visible = false;
    }

    const snappedDeg = Math.round(roundedDeg / 15) * 15;
    if (snappedDeg !== lastSnappedDeg.current && snappedDeg === roundedDeg) {
      lastSnappedDeg.current = snappedDeg;
      flashTimer.current = 0.15;
    }
    if (flashTimer.current > 0) {
      flashTimer.current -= delta;
      if (snapFlashRef.current) {
        snapFlashRef.current.visible = true;
        const mat = snapFlashRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(0.5, (flashTimer.current / 0.15) * 0.5);
      }
    } else if (snapFlashRef.current) {
      snapFlashRef.current.visible = false;
    }
  });

  return (
    <group position={[0, height + 0.15, 0]}>
      {/* 回転トーラスリング */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <torusGeometry args={[ringRadius, 0.025, 8, 32]} />
        <meshBasicMaterial
          color={isRotating ? '#F59E0B' : '#3B82F6'}
          transparent
          opacity={isRotating ? 0.9 : 0.7}
          depthWrite={false}
        />
      </mesh>
      {/* 方向インジケーター（前方を示す小さな矢印） */}
      <mesh position={[0, 0, -ringRadius - 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.04, 0.08, 4]} />
        <meshBasicMaterial
          color={isRotating ? '#F59E0B' : '#3B82F6'}
          transparent
          opacity={0.8}
          depthWrite={false}
        />
      </mesh>

      {/* 角度表示 (回転中のみ) */}
      {isRotating && (
        <>
          {/* 角度テキスト (Html overlay) */}
          <Html position={[0, 0.25, 0]} center style={{ pointerEvents: 'none' }}>
            <div
              ref={angleLabelRef}
              style={{
                background: 'rgba(0,0,0,0.8)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 'bold',
                fontFamily: 'monospace',
                padding: '2px 6px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
            >
              0&deg;
            </div>
          </Html>

          {/* 角度弧インジケーター (XZ平面) */}
          <mesh ref={arcMeshRef} position={[0, 0.01, 0]} visible={false}>
            <bufferGeometry />
            <meshBasicMaterial
              color="#F59E0B"
              transparent
              opacity={0.3}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>

          {/* 15度スナップ時フラッシュリング */}
          <mesh ref={snapFlashRef} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[ringRadius, 0.05, 8, 32]} />
            <meshBasicMaterial
              color="#22C55E"
              transparent
              opacity={0.5}
              depthWrite={false}
            />
          </mesh>
        </>
      )}

      {/* 方向ラベル (前/後/左/右) */}
      {CARDINAL_LABELS.map(({ label, angle }) => (
        <Html
          key={label}
          position={[
            Math.sin(angle) * (ringRadius + 0.15),
            0,
            -Math.cos(angle) * (ringRadius + 0.15),
          ]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              color: '#94A3B8',
              fontSize: '9px',
              fontWeight: 500,
              fontFamily: 'sans-serif',
              opacity: isRotating ? 0.9 : 0.5,
              userSelect: 'none',
              textShadow: '0 0 3px rgba(0,0,0,0.5)',
            }}
          >
            {label}
          </div>
        </Html>
      ))}
    </group>
  );
}

function SelectionIndicator({ scale }: { scale: [number, number, number] }) {
  const maxDim = Math.max(scale[0], scale[2]) + 0.2;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[maxDim * 0.4, maxDim * 0.5, 32]} />
      <meshBasicMaterial color="#3B82F6" transparent opacity={0.6} />
    </mesh>
  );
}

/** グリッドスナップインジケーター: 十字線 */
function GridSnapIndicator({ scale }: { scale: [number, number, number] }) {
  const size = Math.max(scale[0], scale[2]) + 0.3;
  return (
    <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {/* 横線 */}
      <mesh>
        <planeGeometry args={[size, 0.02]} />
        <meshBasicMaterial color="#22C55E" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {/* 縦線 */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <planeGeometry args={[size, 0.02]} />
        <meshBasicMaterial color="#22C55E" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** 壁スナップインジケーター: ハイライトリング */
function WallSnapIndicator({ scale }: { scale: [number, number, number] }) {
  const maxDim = Math.max(scale[0], scale[2]) + 0.15;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[maxDim * 0.45, maxDim * 0.52, 32]} />
      <meshBasicMaterial color="#F59E0B" transparent opacity={0.7} depthWrite={false} />
    </mesh>
  );
}

/** ドラッグゴーストインジケーター: 床面の影円 + 座標ラベル + スナップライン */
interface DragGhostIndicatorProps {
  scale: [number, number, number];
  heightY: number;
  dragPosRef: React.RefObject<{ x: number; z: number }>;
  coordLabelRef: React.RefObject<HTMLDivElement | null>;
  dragCircleRef: React.RefObject<THREE.Mesh | null>;
  snappedToGrid: boolean;
}

function DragGhostIndicator({
  scale,
  heightY,
  dragPosRef,
  coordLabelRef,
  dragCircleRef,
  snappedToGrid,
}: DragGhostIndicatorProps) {
  const circleRadius = Math.max(scale[0], scale[2]) * 0.6;
  const labelHeight = scale[1] + 0.4;
  // スナップライン長（床面全体に伸びる想定）
  const snapLineLen = 10;

  return (
    <group>
      {/* 床面インジケーター円: 半透明の青い円 */}
      <mesh
        ref={dragCircleRef}
        geometry={DRAG_CIRCLE_GEOMETRY}
        material={DRAG_CIRCLE_MATERIAL}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -heightY + 0.01, 0]}
        scale={[circleRadius, circleRadius, 1]}
      />

      {/* 座標ラベル: Html overlayで軽量に表示 */}
      <Html
        position={[0, labelHeight, 0]}
        center
        distanceFactor={5}
        style={{ pointerEvents: 'none' }}
      >
        <div
          ref={coordLabelRef}
          style={{
            background: 'rgba(0, 0, 0, 0.75)',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          {`X: ${dragPosRef.current.x.toFixed(2)}  Z: ${dragPosRef.current.z.toFixed(2)}`}
        </div>
      </Html>

      {/* スナップライン: グリッドスナップ時、X/Z方向に細い破線プレーンを表示 */}
      {snappedToGrid && (
        <group position={[0, -heightY + 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          {/* X方向（横方向）のスナップライン */}
          <mesh>
            <planeGeometry args={[snapLineLen, 0.008]} />
            <meshBasicMaterial color="#22C55E" transparent opacity={0.4} depthWrite={false} />
          </mesh>
          {/* Z方向（縦方向）のスナップライン */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <planeGeometry args={[snapLineLen, 0.008]} />
            <meshBasicMaterial color="#22C55E" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** glTFモデルレンダラー: modelUrlが指定された家具に使用 */
interface GLTFModelRendererProps {
  modelUrl: string;
  scale: [number, number, number];
  color?: string;
  selected?: boolean;
}

function GLTFModelRenderer({ modelUrl, scale, color, selected }: GLTFModelRendererProps) {
  const groupRef = useRef<THREE.Group>(null);
  const model = useScaledGLTF(modelUrl, scale);

  // マテリアルカラーのオーバーライドとシャドウ設定
  useEffect(() => {
    if (color) {
      overrideModelColor(model, color);
    }
    enableModelShadows(model);
  }, [model, color]);

  // 選択ハイライトの適用
  useEffect(() => {
    applyModelHighlight(model, !!selected);
  }, [model, selected]);

  return <primitive ref={groupRef} object={model} />;
}

/** 家具コンポーネント共通Props */
interface FurniturePartProps {
  scale: [number, number, number];
  color: string;
  palette: FurniturePalette;
  pbr: FurniturePBR;
  selected?: boolean;
  /** スタイル名（テクスチャ選択に使用） */
  styleName: string;
  /** スタイル別木材タイプ */
  woodType: WoodType;
  /** スタイル別布地タイプ */
  fabricType: FabricType;
  /** スタイル別金属仕上げ */
  metalFinish: MetalFinish;
  /** 描画品質レベル */
  qualityLevel: 'high' | 'medium' | 'low';
}

function FurnitureModel({ type, scale, color, palette, pbr, selected, styleName, woodType, fabricType, metalFinish, qualityLevel }: { type: string; scale: [number, number, number]; color: string; palette: FurniturePalette; pbr: FurniturePBR; selected?: boolean; styleName: string; woodType: WoodType; fabricType: FabricType; metalFinish: MetalFinish; qualityLevel: 'high' | 'medium' | 'low' }) {
  const props: FurniturePartProps = { scale, color, palette, pbr, selected, styleName, woodType, fabricType, metalFinish, qualityLevel };
  switch (type) {
    case 'counter':
      return <Counter {...props} />;
    case 'table_square':
      return <TableSquare {...props} />;
    case 'table_round':
      return <TableRound {...props} />;
    case 'chair':
      return <Chair {...props} />;
    case 'stool':
      return <Stool {...props} />;
    case 'sofa':
      return <Sofa {...props} />;
    case 'shelf':
      return <Shelf {...props} />;
    case 'pendant_light':
      return <PendantLight {...props} />;
    case 'plant':
      return <Plant {...props} />;
    case 'partition':
      return <Partition {...props} />;
    case 'register':
      return <Register {...props} />;
    case 'sink':
      return <Sink {...props} />;
    case 'fridge':
      return <Fridge {...props} />;
    case 'display_case':
      return <DisplayCase {...props} />;
    case 'bench':
      return <Bench {...props} />;
    case 'mirror':
      return <Mirror {...props} />;
    case 'reception_desk':
      return <ReceptionDesk {...props} />;
    case 'tv_monitor':
      return <TvMonitor {...props} />;
    case 'washing_machine':
      return <WashingMachine {...props} />;
    case 'coat_rack':
      return <CoatRack {...props} />;
    case 'air_conditioner':
      return <AirConditioner {...props} />;
    case 'desk':
      return <Desk {...props} />;
    case 'bookcase':
      return <Bookcase {...props} />;
    case 'kitchen_island':
      return <KitchenIsland {...props} />;
    case 'bar_table':
      return <BarTable {...props} />;
    case 'wardrobe':
      return <Wardrobe {...props} />;
    case 'shoe_rack':
      return <ShoeRack {...props} />;
    case 'umbrella_stand':
      return <UmbrellaStand {...props} />;
    case 'cash_register':
      return <CashRegister {...props} />;
    case 'menu_board':
      return <MenuBoard {...props} />;
    case 'flower_pot':
      return <FlowerPot {...props} />;
    case 'ceiling_fan':
      return <CeilingFan {...props} />;
    case 'rug':
      return <Rug {...props} />;
    case 'curtain':
      return <Curtain {...props} />;
    case 'clock':
      return <Clock {...props} />;
    case 'trash_can':
      return <TrashCan {...props} />;
    default:
      return (
        <mesh position={[0, scale[1] / 2, 0]} castShadow>
          <boxGeometry args={scale} />
          <meshStandardMaterial color={color || palette.primary} roughness={pbr.roughness} metalness={pbr.metalness} />
        </mesh>
      );
  }
}

function Counter({ scale, color, palette, pbr, selected, woodType, qualityLevel }: FurniturePartProps) {
  const { size: furnitureTexSize } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const bodyW = w - 0.04;
  const bodyD = d - 0.06;
  const panelCount = Math.max(2, Math.floor(w / 0.4));
  const panelSpacing = bodyW / (panelCount + 1);
  // カウンター: 天板=secondary, 本体=primary, トリム/パネル=metal
  const topColor = color || palette.secondary;
  const bodyColor = color || palette.primary;
  // 木目テクスチャ適用（カスタムカラー未指定時のみ）
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSize, furnitureTexSize, woodType) : null, [color, woodType, furnitureTexSize]);
  return (
    <group>
      {/* 天板（オーバーハング強化 + 面取り） */}
      <RoundedBox args={[w + 0.06, 0.05, d + 0.04]} radius={0.015} smoothness={qualityLevel === 'high' ? 8 : qualityLevel === 'medium' ? 4 : 2} position={[0, h, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={topColor} map={woodTex} roughness={pbr.roughness * 0.65} metalness={pbr.metalness + 0.02} clearcoat={0.42} clearcoatRoughness={0.2} envMapIntensity={2.3} iridescence={0.02} iridescenceIOR={1.5} emissive={topColor} emissiveIntensity={selected ? 0.15 : 0.01} />
      </RoundedBox>
      {/* トリムライン（天板と本体の間） */}
      <mesh position={[0, h - 0.035, 0]}>
        <boxGeometry args={[w + 0.02, 0.008, d + 0.01]} />
        <meshPhysicalMaterial color={color ? adjustColor(color, -35) : palette.metal} roughness={0.18} metalness={0.15} clearcoat={0.48} clearcoatRoughness={0.15} envMapIntensity={2.4} />
      </mesh>
      {/* 本体 */}
      <RoundedBox args={[bodyW, h - 0.08, bodyD]} radius={0.01} position={[0, (h - 0.08) / 2 + 0.04, 0]} castShadow>
        <meshPhysicalMaterial color={color ? adjustColor(color, -20) : palette.primary} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} emissive={color ? adjustColor(color, -20) : palette.primary} emissiveIntensity={selected ? 0.15 : 0} />
      </RoundedBox>
      {/* フロントパネルライン（縦の装飾） — 小さな装飾のためcastShadow省略 */}
      {Array.from({ length: panelCount }).map((_, i) => (
        <RoundedBox
          key={`panel-${i}`}
          args={[0.015, h - 0.18, bodyD * 0.02]}
          radius={0.003}
          position={[
            -bodyW / 2 + panelSpacing * (i + 1),
            (h - 0.08) / 2 + 0.04,
            bodyD / 2 + 0.005,
          ]}
        >
          <meshPhysicalMaterial color={color ? adjustColor(color, -35) : palette.accent} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
        </RoundedBox>
      ))}
      {/* キックプレート（底面奥まり） */}
      <mesh position={[0, 0.015, 0.015]}>
        <boxGeometry args={[bodyW - 0.06, 0.03, bodyD - 0.06]} />
        <meshPhysicalMaterial color={color ? adjustColor(color, -45) : adjustColor(bodyColor, -30)} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
      </mesh>
    </group>
  );
}

function TableSquare({ scale, color, palette, pbr, selected, woodType, qualityLevel }: FurniturePartProps) {
  const { size: furnitureTexSize } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const legInset = 0.06;
  const legTopR = 0.025;
  const legBotR = 0.03;
  const apronH = 0.03;
  // テーブル: 天板=secondary, 脚=metal or primary
  const topColor = color || palette.secondary;
  const legColor = color ? adjustColor(color, -30) : palette.metal;
  const apronColor = color ? adjustColor(color, -15) : palette.primary;
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSize, furnitureTexSize, woodType) : null, [color, woodType, furnitureTexSize]);

  // キャッシュされた脚ジオメトリ（テーパー脚）
  const legH = h - 0.04;
  const legSegs = qualityLevel === 'high' ? 48 : 8;
  const legGeoKey = `table-leg-${legH.toFixed(2)}-${legSegs}`;
  const legGeo = useMemo(() =>
    getCachedGeometry(legGeoKey, () => new THREE.CylinderGeometry(legTopR, legBotR, legH, legSegs)),
  [legGeoKey, legH, legSegs]);

  // キャッシュされたフットパッドジオメトリ
  const footGeo = SHARED_FOOT_GEO;

  // キャッシュされた脚マテリアル
  const legMatKey = `table-leg-mat-${legColor}-${pbr.roughness}-${pbr.metalness}`;
  const legMat = useMemo(() =>
    getCachedPhysicalMaterial(legMatKey, {
      color: legColor, roughness: pbr.roughness * 0.81,
      metalness: Math.min(pbr.metalness + 0.1, 1.0),
      clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 3.456, iridescence: 0.05,
    }),
  [legMatKey, legColor, pbr.roughness, pbr.metalness]);

  return (
    <group>
      {/* 天板 — 面取りを強化した木目風の自然な艶 */}
      <RoundedBox args={[w, 0.04, d]} radius={0.018} smoothness={qualityLevel === 'high' ? 12 : qualityLevel === 'medium' ? 4 : 2} position={[0, h, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={topColor} map={woodTex} roughness={pbr.roughness * 0.75} metalness={pbr.metalness + 0.02} clearcoat={0.63} clearcoatRoughness={0.2} envMapIntensity={2.38} emissive={topColor} emissiveIntensity={selected ? 0.15 : 0.01} />
      </RoundedBox>
      {/* 天板エッジハイライト */}
      <mesh position={[0, h + 0.021, 0]} frustumCulled>
        <boxGeometry args={[w - 0.01, 0.002, d - 0.01]} />
        <meshPhysicalMaterial color={adjustColor(topColor, 15)} roughness={0.25} metalness={pbr.metalness + 0.02} clearcoat={0.15} clearcoatRoughness={0.4} />
      </mesh>
      {/* 天板エッジベベルライン（high品質のみ）— 4辺の細い線 */}
      {qualityLevel === 'high' && (
        <>
          {/* 前後エッジ */}
          {[-1, 1].map((z, i) => (
            <mesh key={`bevel-z-${i}`} position={[0, h - 0.019, z * (d / 2 - 0.003)]} frustumCulled>
              <boxGeometry args={[w - 0.006, 0.002, 0.003]} />
              <meshPhysicalMaterial color={adjustColor(topColor, -20)} roughness={0.3} metalness={pbr.metalness + 0.05} clearcoat={0.4} clearcoatRoughness={0.2} />
            </mesh>
          ))}
          {/* 左右エッジ */}
          {[-1, 1].map((x, i) => (
            <mesh key={`bevel-x-${i}`} position={[x * (w / 2 - 0.003), h - 0.019, 0]} frustumCulled>
              <boxGeometry args={[0.003, 0.002, d - 0.006]} />
              <meshPhysicalMaterial color={adjustColor(topColor, -20)} roughness={0.3} metalness={pbr.metalness + 0.05} clearcoat={0.4} clearcoatRoughness={0.2} />
            </mesh>
          ))}
        </>
      )}
      {/* 幕板（天板下の水平ビーム） */}
      {/* 前後 */}
      {[-1, 1].map((z, i) => (
        <mesh key={`apron-z-${i}`} position={[0, h - 0.04 - apronH / 2, z * (d / 2 - legInset)]} frustumCulled>
          <boxGeometry args={[w - legInset * 2, apronH, 0.015]} />
          <meshPhysicalMaterial color={apronColor} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.25} clearcoatRoughness={0.5} envMapIntensity={1.15} />
        </mesh>
      ))}
      {/* 左右 */}
      {[-1, 1].map((x, i) => (
        <mesh key={`apron-x-${i}`} position={[x * (w / 2 - legInset), h - 0.04 - apronH / 2, 0]} frustumCulled>
          <boxGeometry args={[0.015, apronH, d - legInset * 2]} />
          <meshPhysicalMaterial color={apronColor} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.25} clearcoatRoughness={0.5} envMapIntensity={1.15} />
        </mesh>
      ))}
      {/* 幕板コーナーブロック（high品質のみ）— 幕板と脚の接合部補強 */}
      {qualityLevel === 'high' && [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={`apron-corner-${i}`} position={[x * (w / 2 - legInset), h - 0.04 - apronH / 2, z * (d / 2 - legInset)]} frustumCulled>
          <boxGeometry args={[0.02, apronH + 0.005, 0.02]} />
          <meshPhysicalMaterial color={adjustColor(apronColor, -10)} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.15} clearcoatRoughness={0.4} />
        </mesh>
      ))}
      {/* テーパー脚 + フットパッド — ジオメトリ/マテリアル共有 */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <group key={i} position={[x * (w / 2 - legInset), 0, z * (d / 2 - legInset)]}>
          <mesh position={[0, legH / 2, 0]} geometry={legGeo} material={legMat} castShadow frustumCulled />
          <mesh position={[0, 0.0025, 0]} geometry={footGeo} frustumCulled>
            <meshPhysicalMaterial color={color ? adjustColor(color, -40) : adjustColor(palette.metal, -10)} roughness={0.35} metalness={0.15} clearcoat={0.35} clearcoatRoughness={0.15} envMapIntensity={1.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TableRound({ scale, color, palette, pbr, selected, woodType, qualityLevel }: FurniturePartProps) {
  const { size: furnitureTexSize } = getFurnitureTexSizes(qualityLevel);
  const [w, h] = scale;
  const topR = w / 2;
  const pedestalMidH = h - 0.03 - 0.1 - 0.04;
  const topColor = color || palette.secondary;
  const legColor = color ? adjustColor(color, -25) : palette.metal;
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSize, furnitureTexSize, woodType) : null, [color, woodType, furnitureTexSize]);
  return (
    <group>
      {/* 天板 */}
      <mesh position={[0, h, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[topR, topR, 0.03, 32]} />
        <meshPhysicalMaterial color={topColor} map={woodTex} roughness={pbr.roughness * 0.8} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} emissive={topColor} emissiveIntensity={selected ? 0.15 : 0} />
      </mesh>
      {/* 天板ベベルエッジ（トーラス） */}
      <mesh position={[0, h - 0.015, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[topR - 0.004, 0.008, 8, 32]} />
        <meshPhysicalMaterial color={adjustColor(topColor, -10)} roughness={pbr.roughness * 0.7} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
      </mesh>
      {/* ペデスタル上部 */}
      <mesh position={[0, h - 0.03 - 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.04, 0.1, 12]} />
        <meshPhysicalMaterial color={legColor} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.3} clearcoatRoughness={0.2} />
      </mesh>
      {/* ペデスタル中央 */}
      <mesh position={[0, 0.04 + pedestalMidH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, pedestalMidH, 10]} />
        <meshPhysicalMaterial color={legColor} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.3} clearcoatRoughness={0.2} />
      </mesh>
      {/* ベースディスク */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.06, 0.065, 0.04, 24]} />
        <meshPhysicalMaterial color={color ? adjustColor(color, -30) : palette.metal} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.3} clearcoatRoughness={0.2} />
      </mesh>
      {/* ベースベベルエッジ */}
      <mesh position={[0, 0.005, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.062, 0.006, 6, 24]} />
        <meshPhysicalMaterial color={color ? adjustColor(color, -35) : adjustColor(palette.metal, -10)} roughness={pbr.roughness * 0.8} metalness={pbr.metalness} clearcoat={0.3} clearcoatRoughness={0.2} />
      </mesh>
    </group>
  );
}

function Chair({ scale, color, palette, pbr, selected, styleName, fabricType, metalFinish, woodType, qualityLevel }: FurniturePartProps) {
  const { small: furnitureTexSmall } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const seatH = h * 0.5;
  const legInset = 0.035;
  // 椅子: フレーム=primary, クッション=fabric, 脚=metal
  const frameColor = color || palette.primary;
  const cushionColor = color ? adjustColor(color, 12) : palette.fabric;
  const fabricTex = useMemo(() => !color ? generateFabricTexture(furnitureTexSmall, furnitureTexSmall, styleName, fabricType) : null, [color, styleName, fabricType, furnitureTexSmall]);
  const metalTex = useMemo(() => !color ? generateMetalTexture(furnitureTexSmall, furnitureTexSmall, metalFinish) : null, [color, metalFinish, furnitureTexSmall]);
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSmall, furnitureTexSmall, woodType) : null, [color, woodType, furnitureTexSmall]);
  const legColor = color ? adjustColor(color, -40) : palette.metal;

  // キャッシュされた脚ジオメトリ（テーパー脚）
  const chairLegSegs = qualityLevel === 'high' ? 48 : 8;
  const legGeoKey = `chair-leg-${seatH.toFixed(2)}-${chairLegSegs}`;
  const legGeo = useMemo(() =>
    getCachedGeometry(legGeoKey, () => new THREE.CylinderGeometry(0.015, 0.018, seatH, chairLegSegs)),
  [legGeoKey, seatH, chairLegSegs]);

  // キャッシュされた脚マテリアル
  const legMatKey = `chair-leg-mat-${legColor}-${pbr.roughness}-${pbr.metalness}`;
  const legMat = useMemo(() =>
    getCachedPhysicalMaterial(legMatKey, {
      color: legColor, roughness: pbr.roughness * 0.9, metalness: pbr.metalness,
      clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 1.2,
    }),
  [legMatKey, legColor, pbr.roughness, pbr.metalness]);

  return (
    <group>
      {/* 座面フレーム */}
      <RoundedBox
        args={[w, 0.025, d]}
        radius={0.02}
        position={[0, seatH, 0]}
        rotation={[-0.03, 0, 0]}
        castShadow
      >
        <meshPhysicalMaterial color={frameColor} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.45} clearcoatRoughness={0.3} envMapIntensity={1.99} emissive={frameColor} emissiveIntensity={selected ? 0.15 : 0} />
      </RoundedBox>
      {/* 座面クッション — 丸みを持たせたふっくら形状 */}
      <RoundedBox
        args={[w - 0.03, 0.04, d - 0.03]}
        radius={0.02}
        smoothness={qualityLevel === 'high' ? 12 : qualityLevel === 'medium' ? 4 : 2}
        position={[0, seatH + 0.032, 0.005]}
        rotation={[-0.03, 0, 0]}
        castShadow
      >
        <meshPhysicalMaterial color={adjustColor(cushionColor, -10)} map={fabricTex?.map ?? null} normalMap={fabricTex?.normalMap ?? null} roughness={0.92} metalness={0} clearcoat={0.3} clearcoatRoughness={0.6} sheen={0.661} sheenRoughness={0.324} sheenColor={new THREE.Color(cushionColor).multiplyScalar(1.1)} anisotropy={0.3} anisotropyRotation={Math.PI / 4} emissive={cushionColor} emissiveIntensity={selected ? 0.15 : 0.02} />
      </RoundedBox>
      {/* 背もたれフレーム — わずかに曲面化 */}
      <RoundedBox
        args={[w - 0.01, h * 0.45, 0.025]}
        radius={0.02}
        smoothness={qualityLevel === 'high' ? 12 : qualityLevel === 'medium' ? 4 : 2}
        position={[0, h * 0.73, -d / 2 + 0.015]}
        rotation={[0.1, 0, 0]}
        castShadow
      >
        <meshPhysicalMaterial color={frameColor} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.45} clearcoatRoughness={0.3} envMapIntensity={1.99} />
      </RoundedBox>
      {/* 背もたれ横スラット（2本） — ジオメトリ共有 */}
      {[0.62, 0.82].map((ratio, i) => (
        <mesh key={`slat-${i}`} position={[0, h * ratio, -d / 2 + 0.028]} rotation={[0.1, 0, 0]}
          scale={[w - 0.06, 1, 1]} geometry={SHARED_SLAT_GEO} frustumCulled>
          <meshPhysicalMaterial color={adjustColor(frameColor, -12)} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
        </mesh>
      ))}
      {/* 脚 — ジオメトリ/マテリアル共有 */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh
          key={i}
          position={[x * (w / 2 - legInset), seatH / 2, z * (d / 2 - legInset)]}
          geometry={legGeo}
          material={legMat}
          castShadow
          frustumCulled
        />
      ))}
      {/* 前脚クロスバー — ジオメトリ共有 */}
      <mesh position={[0, 0.15, d / 2 - legInset]}
        scale={[w - legInset * 2, 1, 1]} geometry={SHARED_CROSSBAR_GEO} material={legMat} frustumCulled />
      {/* ストレッチャーバー（脚間の補強棒） — high品質のみ */}
      {qualityLevel === 'high' && (
        <>
          {/* 左右サイドストレッチャー */}
          {[-1, 1].map((x, i) => (
            <mesh key={`stretcher-side-${i}`}
              position={[x * (w / 2 - legInset), seatH / 3, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              frustumCulled>
              <cylinderGeometry args={[0.006, 0.006, d - legInset * 2, 8]} />
              <meshPhysicalMaterial color={legColor} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.2} clearcoatRoughness={0.3} />
            </mesh>
          ))}
          {/* 後脚クロスバー */}
          <mesh position={[0, seatH / 3, -(d / 2 - legInset)]}
            scale={[w - legInset * 2, 1, 1]} geometry={SHARED_CROSSBAR_GEO} material={legMat} frustumCulled />
        </>
      )}
    </group>
  );
}

function Stool({ scale, color, palette, pbr }: FurniturePartProps) {
  const [w, h] = scale;
  const legCount = 4;
  const legSpread = w * 0.3;
  const crossRingH = h * 0.6;
  const footrestH = h * 0.3;
  // スツール: 座面=fabric, 脚/リング=metal
  const seatColor = color || palette.fabric;
  const metalColor = color ? '#888' : palette.metal;
  return (
    <group>
      {/* 座面 */}
      <RoundedBox
        args={[w * 0.85, 0.04, w * 0.85]}
        radius={0.05}
        position={[0, h, 0]}
        castShadow
      >
        <meshStandardMaterial color={seatColor} roughness={pbr.roughness} metalness={0} />
      </RoundedBox>
      {/* 座面リングトリム */}
      <mesh position={[0, h - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[w * 0.38, 0.006, 6, 24]} />
        <meshStandardMaterial color={metalColor} roughness={0.4} metalness={0.1} />
      </mesh>
      {/* テーパーメタル脚 */}
      {Array.from({ length: legCount }).map((_, i) => {
        const angle = (i * Math.PI * 2) / legCount + Math.PI / 4;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * legSpread, h / 2, Math.sin(angle) * legSpread]}
          >
            <cylinderGeometry args={[0.012, 0.018, h, 8]} />
            <meshStandardMaterial color={metalColor} metalness={0.5} roughness={0.2} envMapIntensity={1.5} />
          </mesh>
        );
      })}
      {/* クロスリングコネクタ */}
      <mesh position={[0, crossRingH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[legSpread * 0.7, 0.005, 6, 24]} />
        <meshStandardMaterial color={metalColor} metalness={0.5} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      {/* フットレストリング */}
      <mesh position={[0, footrestH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[legSpread * 0.85, 0.008, 8, 24]} />
        <meshStandardMaterial color={color ? '#777' : adjustColor(palette.metal, -15)} metalness={0.6} roughness={0.15} envMapIntensity={1.5} />
      </mesh>
    </group>
  );
}

function Sofa({ scale, color, palette, pbr, selected, styleName, fabricType, qualityLevel }: FurniturePartProps) {
  const { size: furnitureTexSize } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const armW = 0.13;
  const innerW = w - armW * 2 - 0.04;
  const cushionW = (innerW - 0.02) / 2;
  const frameH = 0.06;
  const footR = 0.02;
  // ソファ: フレーム=primary, クッション=fabric, 脚=metal
  const frameColor = color ? adjustColor(color, -45) : adjustColor(palette.primary, -20);
  const cushionColor = color || palette.fabric;
  const legColor = color ? adjustColor(color, -50) : palette.metal;
  const fabricTex = useMemo(() => !color ? generateFabricTexture(furnitureTexSize, furnitureTexSize, styleName, fabricType) : null, [color, styleName, fabricType, furnitureTexSize]);

  // キャッシュされた脚ジオメトリ/マテリアル
  const footSegs = qualityLevel === 'high' ? 48 : 8;
  const footGeoKey = `sofa-foot-${footR.toFixed(3)}-${footSegs}`;
  const footGeo = useMemo(() =>
    getCachedGeometry(footGeoKey, () => new THREE.CylinderGeometry(footR, footR, footR * 2, footSegs)),
  [footGeoKey, footR, footSegs]);
  const footMatKey = `sofa-foot-mat-${legColor}`;
  const footMat = useMemo(() =>
    getCachedPhysicalMaterial(footMatKey, {
      color: legColor, roughness: 0.4, metalness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.2,
    }),
  [footMatKey, legColor]);

  const backColor = color ? adjustColor(color, -12) : adjustColor(palette.fabric, -12);
  const backSheen = color ? adjustColor(color, 5) : palette.fabric;

  return (
    <group>
      {/* フレーム/ベース */}
      <RoundedBox
        args={[w - 0.02, frameH, d - 0.02]}
        radius={0.01}
        position={[0, frameH / 2 + footR * 2, 0]}
        castShadow
      >
        <meshPhysicalMaterial color={frameColor} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.57} clearcoatRoughness={0.25} envMapIntensity={2.38} />
      </RoundedBox>
      {/* 脚 — ジオメトリ/マテリアル共有 */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={`foot-${i}`} position={[x * (w / 2 - 0.06), footR, z * (d / 2 - 0.06)]}
          geometry={footGeo} material={footMat} frustumCulled />
      ))}
      {/* 座面クッション（2分割）— より丸みのある形状 */}
      {[-1, 1].map((side, i) => (
        <RoundedBox
          key={`seat-${i}`}
          args={[cushionW, h * 0.25, d * 0.7]}
          radius={0.06}
          smoothness={qualityLevel === 'high' ? 12 : qualityLevel === 'medium' ? 4 : 2}
          position={[side * (cushionW / 2 + 0.01), h * 0.38, d * 0.05]}
          castShadow
        >
          <meshPhysicalMaterial color={adjustColor(cushionColor, -8)} map={fabricTex?.map ?? null} normalMap={fabricTex?.normalMap ?? null} roughness={0.78} metalness={0} clearcoat={0.12} clearcoatRoughness={0.5} sheen={0.926} sheenRoughness={0.243} sheenColor={cushionColor} anisotropy={0.3} anisotropyRotation={Math.PI / 4} emissive={cushionColor} emissiveIntensity={selected ? 0.15 : 0.02} />
        </RoundedBox>
      ))}
      {/* 座面クッション間の縫い目ライン */}
      {qualityLevel === 'high' && (
        <mesh position={[0, h * 0.42, d * 0.05]} frustumCulled>
          <boxGeometry args={[0.003, h * 0.18, d * 0.65]} />
          <meshStandardMaterial color={adjustColor(cushionColor, -35)} roughness={0.95} metalness={0} />
        </mesh>
      )}
      {/* 座面クッション上の装飾シームライン（high品質のみ） */}
      {qualityLevel === 'high' && [-1, 1].map((side, i) => (
        <group key={`seat-seam-${i}`}>
          {/* 横方向シーム */}
          <mesh position={[side * (cushionW / 2 + 0.01), h * 0.44, d * 0.05]} frustumCulled>
            <boxGeometry args={[cushionW * 0.8, 0.002, 0.003]} />
            <meshStandardMaterial color={adjustColor(cushionColor, -30)} roughness={0.95} metalness={0} />
          </mesh>
          {/* 縦方向シーム */}
          <mesh position={[side * (cushionW / 2 + 0.01), h * 0.44, d * 0.05]} frustumCulled>
            <boxGeometry args={[0.003, 0.002, d * 0.55]} />
            <meshStandardMaterial color={adjustColor(cushionColor, -30)} roughness={0.95} metalness={0} />
          </mesh>
        </group>
      ))}
      {/* 座面クッション中央の膨らみ（ピロー感） */}
      {[-1, 1].map((side, i) => (
        <mesh key={`seat-bulge-${i}`}
          position={[side * (cushionW / 2 + 0.01), h * 0.42, d * 0.05]}
          scale={[cushionW * 0.7, 1, d * 0.5]}
          frustumCulled>
          <sphereGeometry args={[0.5, qualityLevel === 'high' ? 24 : 12, qualityLevel === 'high' ? 16 : 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color={adjustColor(cushionColor, -5)} map={fabricTex?.map ?? null} roughness={0.92} metalness={0} transparent opacity={0.7} sheen={0.529} sheenRoughness={0.446} sheenColor={cushionColor} anisotropy={0.3} anisotropyRotation={Math.PI / 4} />
        </mesh>
      ))}
      {/* 背もたれクッション（2分割）— より丸みのある形状 */}
      {[-1, 1].map((side, i) => (
        <RoundedBox
          key={`back-${i}`}
          args={[cushionW, h * 0.5, d * 0.22]}
          radius={0.05}
          smoothness={qualityLevel === 'high' ? 12 : qualityLevel === 'medium' ? 4 : 2}
          position={[side * (cushionW / 2 + 0.01), h * 0.6, -d * 0.33]}
          castShadow
        >
          <meshPhysicalMaterial color={backColor} map={fabricTex?.map ?? null} normalMap={fabricTex?.normalMap ?? null} roughness={0.78} metalness={0} clearcoat={0.12} clearcoatRoughness={0.5} sheen={0.926} sheenRoughness={0.243} sheenColor={backSheen} anisotropy={0.3} anisotropyRotation={Math.PI / 4} emissive={backColor} emissiveIntensity={selected ? 0.15 : 0.02} />
        </RoundedBox>
      ))}
      {/* 背もたれクッション間の縫い目ライン */}
      {qualityLevel === 'high' && (
        <mesh position={[0, h * 0.6, -d * 0.33]} frustumCulled>
          <boxGeometry args={[0.003, h * 0.45, d * 0.18]} />
          <meshStandardMaterial color={adjustColor(backColor, -35)} roughness={0.95} metalness={0} />
        </mesh>
      )}
      {/* ボタンタフティング（背もたれクッション上の凹みボタン） */}
      {qualityLevel === 'high' && [-1, 1].map((side, si) => (
        [[-0.3, 0.15], [0, 0.15], [0.3, 0.15], [-0.15, -0.1], [0.15, -0.1], [0, -0.1]].map(([bx, by], bi) => (
          <mesh key={`tuft-${si}-${bi}`}
            position={[side * (cushionW / 2 + 0.01) + bx * cushionW * 0.4, h * 0.6 + by * h * 0.22, -d * 0.22]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[1, 1, -1]}
            frustumCulled>
            <sphereGeometry args={[0.015, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial color={adjustColor(backColor, -18)} roughness={0.9} metalness={0} />
          </mesh>
        ))
      ))}
      {/* 背もたれフレーム */}
      <RoundedBox
        args={[w - 0.02, h * 0.55, 0.03]}
        radius={0.01}
        position={[0, h * 0.58, -d * 0.45]}
        castShadow
      >
        <meshPhysicalMaterial color={frameColor} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.57} clearcoatRoughness={0.25} envMapIntensity={2.38} />
      </RoundedBox>
      {/* 肘掛け — より丸い形状 */}
      {[-1, 1].map((side, i) => (
        <RoundedBox
          key={`arm-${i}`}
          args={[armW, h * 0.4, d * 0.9]}
          radius={0.04}
          smoothness={qualityLevel === 'high' ? 12 : qualityLevel === 'medium' ? 4 : 2}
          position={[side * (w / 2 - armW / 2 - 0.01), h * 0.42, -d * 0.02]}
          castShadow
        >
          <meshPhysicalMaterial color={color ? adjustColor(color, -15) : adjustColor(palette.fabric, -15)} roughness={0.95} metalness={0} clearcoat={0} clearcoatRoughness={0.4} />
        </RoundedBox>
      ))}
    </group>
  );
}

function Shelf({ scale, color, palette, pbr, selected, woodType, metalFinish, qualityLevel }: FurniturePartProps) {
  const { small: furnitureTexSmall } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const shelves = 4;
  // 棚: 本体=primary
  const c = color || palette.primary;
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSmall, furnitureTexSmall, woodType) : null, [color, woodType, furnitureTexSmall]);
  const metalTex = useMemo(() => !color ? generateMetalTexture(furnitureTexSmall / 2, furnitureTexSmall / 2, metalFinish) : null, [color, metalFinish, furnitureTexSmall]);
  // 棚に置く装飾アイテム（棚番号→アイテム配列）
  const decorItems: Record<number, { x: number; color: string; size: [number, number, number] }[]> = {
    1: [
      { x: -w * 0.2, color: '#C62828', size: [0.04, 0.06, 0.04] },
      { x: w * 0.15, color: '#1565C0', size: [0.035, 0.05, 0.035] },
    ],
    2: [
      { x: w * 0.05, color: '#2E7D32', size: [0.05, 0.04, 0.04] },
      { x: -w * 0.25, color: '#F9A825', size: [0.03, 0.07, 0.03] },
      { x: w * 0.25, color: '#6A1B9A', size: [0.04, 0.05, 0.035] },
    ],
    3: [
      { x: -w * 0.1, color: '#EF6C00', size: [0.045, 0.055, 0.04] },
      { x: w * 0.2, color: '#00838F', size: [0.035, 0.065, 0.035] },
    ],
  };
  return (
    <group>
      {/* 側板（角丸） */}
      {[-1, 1].map((side, i) => (
        <RoundedBox
          key={i}
          args={[0.03, h, d]}
          radius={0.005}
          position={[side * (w / 2 - 0.015), h / 2, 0]}
          castShadow
        >
          <meshPhysicalMaterial color={adjustColor(c, -10)} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} emissive={adjustColor(c, -10)} emissiveIntensity={selected ? 0.15 : 0} />
        </RoundedBox>
      ))}
      {/* 棚板（角丸） */}
      {Array.from({ length: shelves + 1 }).map((_, i) => (
        <RoundedBox
          key={`shelf-${i}`}
          args={[w - 0.04, 0.02, d]}
          radius={0.003}
          position={[0, (h / shelves) * i, 0]}
        >
          <meshPhysicalMaterial color={c} map={woodTex} roughness={pbr.roughness * 0.8} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
        </RoundedBox>
      ))}
      {/* 背板 */}
      <mesh position={[0, h / 2, -d / 2 + 0.0075]}>
        <boxGeometry args={[w - 0.04, h, 0.015]} />
        <meshPhysicalMaterial color={adjustColor(c, -20)} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
      </mesh>
      {/* 縦仕切り板 */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[0.015, h - 0.04, d - 0.02]} />
        <meshPhysicalMaterial color={adjustColor(c, -5)} roughness={pbr.roughness * 0.9} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
      </mesh>
      {/* クラウンモールディング */}
      <RoundedBox
        args={[w + 0.02, 0.015, d + 0.02]}
        radius={0.003}
        position={[0, h + 0.008, 0]}
      >
        <meshPhysicalMaterial color={adjustColor(c, -15)} roughness={pbr.roughness * 0.7} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
      </RoundedBox>
      {/* 棚上の装飾アイテム */}
      {Object.entries(decorItems).map(([shelfIdx, items]) =>
        items.map((item, j) => {
          const si = Number(shelfIdx);
          const shelfY = (h / shelves) * si + 0.01;
          return (
            <RoundedBox
              key={`decor-${si}-${j}`}
              args={item.size}
              radius={0.003}
              position={[item.x, shelfY + item.size[1] / 2, 0]}
            >
              <meshStandardMaterial color={item.color} roughness={0.7} metalness={0} />
            </RoundedBox>
          );
        })
      )}
    </group>
  );
}

function PendantLight({ scale, color, palette, metalFinish, qualityLevel }: FurniturePartProps) {
  const [w, h] = scale;
  const style = useEditorStore((s) => s.style);
  const dayNight = useCameraStore((s) => s.dayNight);
  const isNight = dayNight === 'night';

  // スタイル別SpotLight設定
  const spotLightConfig: Record<string, { color: string; intensity: number }> = {
    japanese:     { color: '#FFF0D0', intensity: 3 },
    luxury:       { color: '#FFF5E0', intensity: 4 },
    industrial:   { color: '#FFFFFF', intensity: 3 },
    modern:       { color: '#FFFAF0', intensity: 3 },
    cafe:         { color: '#FFE8C0', intensity: 4 },
    minimal:      { color: '#FFFFFF', intensity: 2 },
    scandinavian: { color: '#FFF8F0', intensity: 3 },
    retro:        { color: '#FFDDAA', intensity: 4 },
    medical:      { color: '#F0F8FF', intensity: 3 },
  };
  const cfg = spotLightConfig[style] || { color: '#FFFAF0', intensity: 3 };
  const spotIntensity = isNight ? cfg.intensity * 1.5 : cfg.intensity;
  const emissiveIntensity = isNight ? 8 : 3;

  // ペンダントライト: シェード=accent, コード/金具=metal
  const shadeColor = color || palette.accent;
  const cordColor = color ? '#333' : palette.metal;
  // ベル/ドーム型シェードのプロファイル
  const shadePoints: THREE.Vector2[] = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const r = (w / 2) * (0.3 + 0.7 * Math.sin(t * Math.PI * 0.6));
    const y = -h * 0.4 * t;
    shadePoints.push(new THREE.Vector2(r, y));
  }
  const shadeSegs = qualityLevel === 'high' ? 48 : 24;
  const shadeGeo = new THREE.LatheGeometry(shadePoints, shadeSegs);
  // 内側シェード用（少し小さく）
  const innerPoints: THREE.Vector2[] = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const r = (w / 2) * (0.28 + 0.65 * Math.sin(t * Math.PI * 0.6));
    const y = -h * 0.4 * t + 0.003;
    innerPoints.push(new THREE.Vector2(r, y));
  }
  const innerGeo = new THREE.LatheGeometry(innerPoints, shadeSegs);
  // シェード底面のY座標
  const shadeBottomY = -h * 0.4;
  return (
    <group>
      {/* 天井キャップ */}
      <mesh position={[0, h, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.015, qualityLevel === 'high' ? 32 : 16]} />
        <meshPhysicalMaterial color={color ? '#444' : palette.metal} metalness={0.5} roughness={0.27} envMapIntensity={1.8} clearcoat={0.2} clearcoatRoughness={0.15} />
      </mesh>
      {/* 天井キャップフランジ（high品質のみ） */}
      {qualityLevel === 'high' && (
        <mesh position={[0, h - 0.008, 0]}>
          <cylinderGeometry args={[0.035, 0.03, 0.005, 32]} />
          <meshPhysicalMaterial color={color ? '#3a3a3a' : adjustColor(palette.metal, -10)} metalness={0.6} roughness={0.225} clearcoat={0.3} clearcoatRoughness={0.15} envMapIntensity={1.2} />
        </mesh>
      )}
      {/* コード — palette.metal連動 */}
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.004, 0.004, h, qualityLevel === 'high' ? 12 : 6]} />
        <meshStandardMaterial color={cordColor} roughness={0.8} metalness={0.3} />
      </mesh>
      {/* コード巻きディテール（high品質のみ）— シェード接続部 */}
      {qualityLevel === 'high' && (
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.008, 0.006, 0.015, 16]} />
          <meshPhysicalMaterial color={color ? '#3a3a3a' : palette.metal} metalness={0.55} roughness={0.3} clearcoat={0.2} clearcoatRoughness={0.2} />
        </mesh>
      )}
      {/* シェード外側 — emissive glow追加 */}
      <mesh geometry={shadeGeo} position={[0, 0, 0]}>
        <meshPhysicalMaterial
          color={shadeColor}
          side={THREE.DoubleSide}
          metalness={0.0}
          roughness={0.08}
          transparent
          opacity={0.9}
          transmission={0.4}
          ior={1.5}
          thickness={0.02}
          dispersion={0.4}
          envMapIntensity={1.2}
          emissive={cfg.color}
          emissiveIntensity={0.8}
        />
      </mesh>
      {/* シェード内側（明るめ + 強emissive） */}
      <mesh geometry={innerGeo} position={[0, 0, 0]}>
        <meshPhysicalMaterial
          color={adjustColor(shadeColor, 40)}
          side={THREE.BackSide}
          roughness={0.15}
          metalness={0.1}
          emissive="#fff5e0"
          emissiveIntensity={2.0}
        />
      </mesh>
      {/* 電球（やや縦長） — 発光色はそのまま暖色系 */}
      <mesh position={[0, -0.05, 0]} scale={[1, 1.3, 1]}>
        <sphereGeometry args={[0.035, 32, 32]} />
        <meshPhysicalMaterial color="#FFF8E1" emissive="#FFF8E1" emissiveIntensity={isNight ? 4 : 2} />
      </mesh>
      {/* PointLight — シェードからの暖色拡散光 (medium+high) */}
      <pointLight
        position={[0, -0.1, 0]}
        intensity={0.5}
        color="#FFF4E0"
        distance={3}
        decay={1.5}
        castShadow={qualityLevel === 'high'}
        {...(qualityLevel === 'high' ? { 'shadow-mapSize': [512, 512] as [number, number] } : {})}
      />
      {/* SpotLight — テーブルを照らすリアルな光のプール */}
      <spotLight
        position={[0, shadeBottomY, 0]}
        target-position={[0, shadeBottomY - 3, 0]}
        color={cfg.color}
        intensity={spotIntensity}
        angle={Math.PI / 6}
        penumbra={0.5}
        decay={2}
        distance={3}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.001}
      />
    </group>
  );
}

function Plant({ scale, color, palette, qualityLevel }: FurniturePartProps) {
  const [w, h] = scale;
  const style = useEditorStore((s) => s.style);
  // 葉の色: カスタム色があればそれを使用、なければ自然な緑を維持
  const leafColor = color || '#2E7D32';
  // 鉢の色: luxuryスタイルではゴールド（palette.metal）、それ以外はテラコッタ
  const potColor = style === 'luxury' ? palette.metal : '#A0522D';
  const potMetalness = style === 'luxury' ? 0.4 : 0;
  const potRoughness = style === 'luxury' ? 0.3 : 0.85;
  // テラコッタ鉢のプロファイル（LatheGeometry）
  const potPoints = [
    new THREE.Vector2(w * 0.2, 0),
    new THREE.Vector2(w * 0.22, 0.01),
    new THREE.Vector2(w * 0.25, h * 0.15),
    new THREE.Vector2(w * 0.32, h * 0.28),
    new THREE.Vector2(w * 0.33, h * 0.3),
    new THREE.Vector2(w * 0.35, h * 0.3),
    new THREE.Vector2(w * 0.34, h * 0.28),
  ];
  const potGeo = new THREE.LatheGeometry(potPoints, qualityLevel === 'high' ? 32 : 20);
  // 葉の配置（放射状、角度・傾きを多様に）
  const leaves: { angle: number; tilt: number; yOff: number; scaleF: number; shade: number }[] = [
    { angle: 0, tilt: 0.4, yOff: 0, scaleF: 1.0, shade: 0 },
    { angle: Math.PI * 0.4, tilt: 0.5, yOff: 0.02, scaleF: 0.9, shade: 15 },
    { angle: Math.PI * 0.75, tilt: 0.35, yOff: -0.01, scaleF: 1.1, shade: -10 },
    { angle: Math.PI * 1.1, tilt: 0.55, yOff: 0.01, scaleF: 0.85, shade: 20 },
    { angle: Math.PI * 1.5, tilt: 0.3, yOff: 0.03, scaleF: 1.05, shade: -5 },
    { angle: Math.PI * 1.8, tilt: 0.45, yOff: -0.02, scaleF: 0.95, shade: 10 },
    { angle: Math.PI * 0.15, tilt: 0.6, yOff: 0.04, scaleF: 0.8, shade: -15 },
  ];
  const stemH = h * 0.25;
  const stemBase = h * 0.32;
  return (
    <group>
      {/* 鉢（LatheGeometry） — luxuryではゴールド仕上げ */}
      <mesh geometry={potGeo} castShadow>
        <meshPhysicalMaterial color={potColor} roughness={potRoughness} metalness={potMetalness} clearcoat={0.3} envMapIntensity={1.2} />
      </mesh>
      {/* 土（鉢リム内側に少し凹ませる） */}
      <mesh position={[0, h * 0.28, 0]}>
        <cylinderGeometry args={[w * 0.31, w * 0.31, 0.015, 16]} />
        <meshStandardMaterial color="#3E2723" roughness={0.9} />
      </mesh>
      {/* 幹/茎 */}
      <mesh position={[0, stemBase + stemH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.02, stemH, 8]} />
        <meshStandardMaterial color="#5D4037" roughness={0.7} metalness={0} />
      </mesh>
      {/* 葉（楕円体、放射状に配置） — 自然な緑ベース */}
      {leaves.map((leaf, i) => {
        const leafSize = w * 0.18 * leaf.scaleF;
        const leafY = stemBase + stemH + leaf.yOff;
        const spread = w * 0.12;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(leaf.angle) * spread,
              leafY,
              Math.sin(leaf.angle) * spread,
            ]}
            rotation={[leaf.tilt, leaf.angle, 0]}
            scale={[0.5, 1, 0.3]}
            castShadow
          >
            <sphereGeometry args={[leafSize, 8, 8]} />
            <meshStandardMaterial
              color={adjustColor(leafColor, leaf.shade)}
              roughness={0.8}
              metalness={0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Partition({ scale, color, palette, pbr }: FurniturePartProps) {
  const [w, h, d] = scale;
  const c = color || palette.primary;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={c} roughness={pbr.roughness} transparent opacity={0.9} />
      </mesh>
      {/* フレーム */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w + 0.02, h + 0.02, d + 0.01]} />
        <meshStandardMaterial color={color ? adjustColor(color, -40) : palette.metal} wireframe />
      </mesh>
    </group>
  );
}

function Register({ scale, color, palette, pbr }: FurniturePartProps) {
  const [w, h, d] = scale;
  const c = color || palette.primary;
  return (
    <group>
      {/* カウンター本体 */}
      <RoundedBox args={[w, h * 0.8, d]} radius={0.01} position={[0, h * 0.4, 0]} castShadow>
        <meshStandardMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* スクリーン（ベゼル） */}
      <RoundedBox args={[w * 0.55, h * 0.38, 0.025]} radius={0.008} position={[0, h * 0.88, -d * 0.15]} rotation={[-0.26, 0, 0]} castShadow>
        <meshStandardMaterial color="#1a1a1a" roughness={0.2} metalness={0.1} />
      </RoundedBox>
      {/* スクリーン表示面（発光） */}
      <RoundedBox args={[w * 0.5, h * 0.33, 0.003]} radius={0.005} position={[0, h * 0.88, -d * 0.15 + 0.014]} rotation={[-0.26, 0, 0]}>
        <meshStandardMaterial color="#0a0a2a" emissive="#1a2a5a" emissiveIntensity={0.8} roughness={0.05} />
      </RoundedBox>
      {/* POS/キーボードエリア */}
      <RoundedBox args={[w * 0.45, 0.012, d * 0.25]} radius={0.004} position={[0, h * 0.81, d * 0.15]}>
        <meshStandardMaterial color="#222" roughness={0.7} metalness={0} />
      </RoundedBox>
      {/* レシートプリンター */}
      <RoundedBox args={[w * 0.18, h * 0.15, d * 0.2]} radius={0.005} position={[w * 0.32, h * 0.88, 0]} castShadow>
        <meshStandardMaterial color={adjustColor(c, -20)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* レシート排出口 */}
      <mesh position={[w * 0.32, h * 0.93, d * 0.1 + 0.005]}>
        <boxGeometry args={[w * 0.12, 0.003, 0.003]} />
        <meshStandardMaterial color="#333" roughness={0.5} />
      </mesh>
      {/* キャッシュドロワーライン */}
      <mesh position={[0, h * 0.35, d / 2 + 0.002]}>
        <boxGeometry args={[w * 0.75, 0.004, 0.002]} />
        <meshStandardMaterial color={adjustColor(c, -35)} roughness={pbr.roughness} />
      </mesh>
      {/* カードリーダー（傾斜デバイス） */}
      <RoundedBox args={[0.06, 0.08, 0.04]} radius={0.008} position={[-w * 0.35, h * 0.84, d * 0.2]} rotation={[-0.4, 0.15, 0]} castShadow>
        <meshStandardMaterial color="#2a2a2a" roughness={0.3} metalness={0.15} />
      </RoundedBox>
      {/* カードリーダースロット */}
      <mesh position={[-w * 0.35, h * 0.87, d * 0.2 + 0.021]} rotation={[-0.4, 0.15, 0]}>
        <boxGeometry args={[0.04, 0.003, 0.003]} />
        <meshStandardMaterial color="#555" metalness={0.4} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
    </group>
  );
}

function Sink({ scale, color, palette, pbr: _pbr }: FurniturePartProps) {
  const [w, h, d] = scale;
  const c = color || palette.metal;
  return (
    <group>
      <mesh position={[0, h * 0.45, 0]} castShadow>
        <boxGeometry args={[w, h * 0.9, d]} />
        <meshStandardMaterial color={c} metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[0, h * 0.85, 0]}>
        <boxGeometry args={[w * 0.8, h * 0.15, d * 0.7]} />
        <meshStandardMaterial color={adjustColor(c, -30)} metalness={0.7} roughness={0.15} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[0, h * 1.1, -d * 0.3]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, h * 0.3, 8]} />
        <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.1} envMapIntensity={1.5} />
      </mesh>
    </group>
  );
}

function Fridge({ scale, color, palette, pbr: _pbr }: FurniturePartProps) {
  const [w, h, d] = scale;
  const ventH = 0.03;
  const c = color || palette.metal;
  return (
    <group>
      {/* 本体（角丸、モダン家電風） */}
      <RoundedBox args={[w, h - ventH, d]} radius={0.01} position={[0, h / 2 + ventH / 2, 0]} castShadow>
        <meshStandardMaterial color={c} roughness={0.3} metalness={0.2} />
      </RoundedBox>
      {/* 上部ドア天面（少し濃い色） */}
      <mesh position={[0, h - 0.005, 0]}>
        <boxGeometry args={[w - 0.02, 0.01, d - 0.02]} />
        <meshStandardMaterial color={adjustColor(c, -15)} roughness={0.25} metalness={0.25} />
      </mesh>
      {/* ドア分離線（上下セクション間の溝） */}
      <mesh position={[0, h * 0.52, d / 2 + 0.002]}>
        <boxGeometry args={[w - 0.04, 0.006, 0.003]} />
        <meshStandardMaterial color={adjustColor(c, -40)} roughness={0.5} metalness={0.1} />
      </mesh>
      {/* 上部ハンドル（メタリック、浮き出し） */}
      <RoundedBox
        args={[0.02, 0.15, 0.015]}
        radius={0.005}
        position={[w * 0.38, h * 0.72, d / 2 + 0.015]}
      >
        <meshStandardMaterial color="#BBB" metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
      </RoundedBox>
      {/* 下部ハンドル */}
      <RoundedBox
        args={[0.02, 0.15, 0.015]}
        radius={0.005}
        position={[w * 0.38, h * 0.3, d / 2 + 0.015]}
      >
        <meshStandardMaterial color="#BBB" metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
      </RoundedBox>
      {/* LED表示エリア（上部ドア） */}
      <mesh position={[0, h * 0.78, d / 2 + 0.004]}>
        <boxGeometry args={[0.08, 0.03, 0.003]} />
        <meshStandardMaterial color="#0a0a1a" emissive="#1a3a6a" emissiveIntensity={0.4} roughness={0.05} />
      </mesh>
      {/* 底部ベンチレーション（凹み） */}
      <mesh position={[0, ventH / 2, 0]}>
        <boxGeometry args={[w - 0.04, ventH, d - 0.04]} />
        <meshStandardMaterial color={adjustColor(c, -30)} roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  );
}

function DisplayCase({ scale, color, palette: _palette, qualityLevel }: FurniturePartProps) {
  const [w, h, d] = scale;
  const baseH = 0.08;
  // ショーケース: ガラスはそのまま、ベース=primary
  const topH = 0.03;
  const footH = 0.025;
  const footR = 0.015;
  const isHigh = qualityLevel === 'high';
  const glassH = h - baseH - topH - footH;
  const glassY = baseH + footH + glassH / 2;
  const frameColor = '#1a1a1a';
  return (
    <group>
      {/* ベース（ダークウッド/メタル仕上げ） */}
      <RoundedBox args={[w, baseH, d]} radius={0.008} position={[0, baseH / 2 + footH, 0]} castShadow>
        <meshPhysicalMaterial color="#2a2018" roughness={0.5} metalness={0.1} clearcoat={0.15} clearcoatRoughness={0.3} envMapIntensity={1.15} />
      </RoundedBox>
      {/* 4本の脚（シリンダー） */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={`foot-${i}`} position={[x * (w / 2 - 0.03), footH / 2, z * (d / 2 - 0.03)]}>
          <cylinderGeometry args={[footR, footR, footH, isHigh ? 16 : 8]} />
          <meshPhysicalMaterial color={frameColor} roughness={0.135} metalness={0.7} clearcoat={0.4} clearcoatRoughness={0.1} envMapIntensity={2.4} />
        </mesh>
      ))}
      {/* ガラスパネル — 4面個別（high品質）or 一体型 */}
      {isHigh ? (
        <>
          {/* 前後ガラスパネル */}
          {[-1, 1].map((z, i) => (
            <mesh key={`glass-z-${i}`} position={[0, glassY, z * (d / 2 - 0.004)]}>
              <boxGeometry args={[w - 0.015, glassH, 0.004]} />
              <meshPhysicalMaterial
                color={color || '#e8f0f8'}
                transparent opacity={0.1} roughness={0.005} metalness={0.02}
                transmission={0.94} ior={1.52} thickness={0.04} dispersion={0.4}
                envMapIntensity={4.2} clearcoat={1.0} clearcoatRoughness={0.03}
              />
            </mesh>
          ))}
          {/* 左右ガラスパネル */}
          {[-1, 1].map((x, i) => (
            <mesh key={`glass-x-${i}`} position={[x * (w / 2 - 0.004), glassY, 0]}>
              <boxGeometry args={[0.004, glassH, d - 0.015]} />
              <meshPhysicalMaterial
                color={color || '#e8f0f8'}
                transparent opacity={0.1} roughness={0.005} metalness={0.02}
                transmission={0.94} ior={1.52} thickness={0.04} dispersion={0.4}
                envMapIntensity={4.2} clearcoat={1.0} clearcoatRoughness={0.03}
              />
            </mesh>
          ))}
        </>
      ) : (
        <mesh position={[0, glassY, 0]}>
          <boxGeometry args={[w - 0.01, glassH, d - 0.01]} />
          <meshPhysicalMaterial
            color={color || '#e8f0f8'}
            transparent opacity={0.12} roughness={0.01} metalness={0.02}
            transmission={0.92} ior={1.52} thickness={0.04} dispersion={0.4}
            envMapIntensity={3.6} clearcoat={1.0} clearcoatRoughness={0.05}
          />
        </mesh>
      )}
      {/* コーナーフレーム（4本の縦エッジ） */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={`edge-${i}`} position={[x * (w / 2 - 0.005), glassY, z * (d / 2 - 0.005)]}>
          <cylinderGeometry args={[isHigh ? 0.006 : 0.005, isHigh ? 0.006 : 0.005, glassH, isHigh ? 12 : 6]} />
          <meshPhysicalMaterial color={frameColor} roughness={0.045} metalness={0.9} envMapIntensity={4.2} clearcoat={0.8} clearcoatRoughness={0.05} iridescence={0.08} />
        </mesh>
      ))}
      {/* 水平フレームレール（high品質のみ）— 上下の横枠 */}
      {isHigh && [-1, 1].map((ySign) => {
        const railY = ySign === -1 ? baseH + footH + 0.003 : baseH + footH + glassH - 0.003;
        return (
          <group key={`rail-${ySign}`}>
            {/* 前後レール */}
            {[-1, 1].map((z, i) => (
              <mesh key={`hrail-z-${i}`} position={[0, railY, z * (d / 2 - 0.005)]}>
                <boxGeometry args={[w - 0.01, 0.004, 0.004]} />
                <meshPhysicalMaterial color={frameColor} roughness={0.045} metalness={0.9} envMapIntensity={3.6} clearcoat={0.7} clearcoatRoughness={0.08} />
              </mesh>
            ))}
            {/* 左右レール */}
            {[-1, 1].map((x, i) => (
              <mesh key={`hrail-x-${i}`} position={[x * (w / 2 - 0.005), railY, 0]}>
                <boxGeometry args={[0.004, 0.004, d - 0.01]} />
                <meshPhysicalMaterial color={frameColor} roughness={0.045} metalness={0.9} envMapIntensity={3.6} clearcoat={0.7} clearcoatRoughness={0.08} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* ガラス棚板（3枚 for high, 2枚 for others） */}
      {(isHigh ? [1, 2, 3] : [1, 2]).map((i) => {
        const divisions = isHigh ? 4 : 3;
        const shelfY = baseH + footH + (glassH / divisions) * i;
        return (
          <group key={`gshelf-${i}`}>
            <mesh position={[0, shelfY, 0]}>
              <boxGeometry args={[w - 0.03, isHigh ? 0.006 : 0.005, d - 0.03]} />
              <meshPhysicalMaterial
                color="#e8eef4" transparent opacity={0.3} roughness={0.01}
                transmission={0.88} ior={1.52} thickness={0.012} dispersion={0.4}
                envMapIntensity={2.592}
              />
            </mesh>
            {/* 棚板支持ピン（high品質のみ） */}
            {isHigh && [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], pi) => (
              <mesh key={`shelf-pin-${i}-${pi}`} position={[x * (w / 2 - 0.02), shelfY, z * (d / 2 - 0.02)]}>
                <cylinderGeometry args={[0.003, 0.003, 0.008, 6]} />
                <meshPhysicalMaterial color="#c0c0c0" roughness={0.09} metalness={0.85} clearcoat={0.5} clearcoatRoughness={0.1} envMapIntensity={1.2} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* 天板（ベースと同じ仕上げ、少し幅広 — 漆仕上げ風） */}
      <RoundedBox args={[w + 0.02, topH, d + 0.02]} radius={0.006} position={[0, h - topH / 2, 0]} castShadow>
        <meshPhysicalMaterial color="#2a2018" roughness={0.4} metalness={0.12} clearcoat={0.35} clearcoatRoughness={0.3} envMapIntensity={1.15} emissive="#2a2018" emissiveIntensity={0.015} />
      </RoundedBox>
      {/* 内部照明（微弱暖色ポイントライト） */}
      <pointLight position={[0, h * 0.6, 0]} intensity={0.15} color="#FFF5E0" distance={1.5} decay={2} />
    </group>
  );
}

function Bench({ scale, color, palette, pbr, woodType, styleName, fabricType, qualityLevel }: FurniturePartProps) {
  const { small: furnitureTexSmall } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const legInset = 0.1;
  const legThick = 0.04;
  // ベンチ: 座面=secondary, 脚=metal
  const seatColor = color || palette.secondary;
  const legColor = color ? adjustColor(color, -30) : palette.metal;
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSmall, furnitureTexSmall, woodType) : null, [color, woodType, furnitureTexSmall]);
  const fabricTex = useMemo(() => !color ? generateFabricTexture(furnitureTexSmall, furnitureTexSmall, styleName, fabricType) : null, [color, styleName, fabricType, furnitureTexSmall]);
  return (
    <group>
      {/* 座面 */}
      <RoundedBox args={[w, 0.04, d]} radius={0.015} position={[0, h, 0]} castShadow>
        <meshStandardMaterial color={seatColor} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 座面端カーブ */}
      {[-1, 1].map((side, i) => (
        <mesh key={`edge-${i}`} position={[side * (w / 2 - 0.03), h + 0.01, 0]} rotation={[0, 0, side * 0.15]}>
          <boxGeometry args={[0.04, 0.015, d * 0.85]} />
          <meshStandardMaterial color={seatColor} roughness={pbr.roughness} metalness={pbr.metalness} />
        </mesh>
      ))}
      {/* 脚 */}
      {[-1, 1].map((side, i) => (
        <group key={`leg-${i}`} position={[side * (w / 2 - legInset), 0, 0]}>
          <mesh position={[side * 0.01, h / 2, 0]} rotation={[0, 0, -side * 0.04]} castShadow>
            <boxGeometry args={[legThick, h, d * 0.85]} />
            <meshStandardMaterial color={legColor} roughness={pbr.roughness} metalness={pbr.metalness} />
          </mesh>
          {/* 脚底のフットパッド */}
          <mesh position={[side * 0.01, 0.004, 0]}>
            <boxGeometry args={[legThick + 0.01, 0.008, d * 0.8]} />
            <meshStandardMaterial color={color ? adjustColor(color, -40) : adjustColor(palette.metal, -10)} roughness={0.4} metalness={0.05} />
          </mesh>
        </group>
      ))}
      {/* 脚のクロスブレース */}
      <mesh position={[0, h * 0.3, 0]}>
        <boxGeometry args={[w - legInset * 2 - legThick, 0.02, 0.02]} />
        <meshStandardMaterial color={color ? adjustColor(color, -35) : adjustColor(palette.metal, -5)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </mesh>
    </group>
  );
}

function Mirror({ scale, color, palette }: FurniturePartProps) {
  const [w, h, d] = scale;
  const centerY = h / 2 + 0.8;
  const frameW = 0.03;
  const frameDepth = d + 0.02;
  const frameColor = color ? '#555' : palette.metal;
  return (
    <group>
      {/* フレーム上辺 */}
      <RoundedBox args={[w + frameW * 2, frameW, frameDepth]} radius={0.005} position={[0, centerY + h / 2 + frameW / 2, 0]} castShadow>
        <meshPhysicalMaterial color={frameColor} roughness={0.108} metalness={0.75} clearcoat={0.5} clearcoatRoughness={0.08} envMapIntensity={3.0} emissive={frameColor} emissiveIntensity={0.01} />
      </RoundedBox>
      {/* フレーム下辺 */}
      <RoundedBox args={[w + frameW * 2, frameW, frameDepth]} radius={0.005} position={[0, centerY - h / 2 - frameW / 2, 0]} castShadow>
        <meshPhysicalMaterial color={frameColor} roughness={0.108} metalness={0.75} clearcoat={0.5} clearcoatRoughness={0.08} envMapIntensity={3.0} emissive={frameColor} emissiveIntensity={0.01} />
      </RoundedBox>
      {/* フレーム左辺 */}
      <RoundedBox args={[frameW, h, frameDepth]} radius={0.005} position={[-w / 2 - frameW / 2, centerY, 0]} castShadow>
        <meshPhysicalMaterial color={frameColor} roughness={0.108} metalness={0.75} clearcoat={0.5} clearcoatRoughness={0.08} envMapIntensity={3.0} emissive={frameColor} emissiveIntensity={0.01} />
      </RoundedBox>
      {/* フレーム右辺 */}
      <RoundedBox args={[frameW, h, frameDepth]} radius={0.005} position={[w / 2 + frameW / 2, centerY, 0]} castShadow>
        <meshPhysicalMaterial color={frameColor} roughness={0.108} metalness={0.75} clearcoat={0.5} clearcoatRoughness={0.08} envMapIntensity={3.0} emissive={frameColor} emissiveIntensity={0.01} />
      </RoundedBox>
      {/* ミラー面 — 高い映り込み */}
      <mesh position={[0, centerY, frameDepth / 2 - 0.002]}>
        <boxGeometry args={[w, h, 0.003]} />
        <meshPhysicalMaterial color={color || palette.metal} metalness={0.99} roughness={0.009} envMapIntensity={3.6} clearcoat={1.0} clearcoatRoughness={0.0} />
      </mesh>
      {/* ミラー下部の小物棚 */}
      <RoundedBox args={[w * 0.7, 0.015, 0.06]} radius={0.004} position={[0, centerY - h / 2 - frameW - 0.005, frameDepth / 2 - 0.01]}>
        <meshPhysicalMaterial color="#666" roughness={0.2} metalness={0.2} clearcoat={0.3} clearcoatRoughness={0.2} envMapIntensity={1.5} />
      </RoundedBox>
      {/* 壁マウントブラケット（背面） */}
      {[-1, 1].map((side, i) => (
        <mesh key={`mount-${i}`} position={[side * w * 0.3, centerY, -frameDepth / 2 - 0.01]}>
          <boxGeometry args={[0.04, 0.06, 0.02]} />
          <meshPhysicalMaterial color="#444" roughness={0.35} metalness={0.3} envMapIntensity={1.2} />
        </mesh>
      ))}
    </group>
  );
}

function ReceptionDesk({ scale, color, palette, pbr }: FurniturePartProps) {
  const [w, h, d] = scale;
  const staffSurfaceH = h * 0.78;
  const c = color || palette.primary;
  return (
    <group>
      {/* メイン本体 */}
      <RoundedBox args={[w, h * 0.85, d]} radius={0.015} position={[0, h * 0.425, 0]} castShadow>
        <meshStandardMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* フロントカーブパネル */}
      <RoundedBox args={[w * 0.92, h * 0.5, 0.04]} radius={0.15} position={[0, h * 0.45, d / 2 + 0.015]} castShadow>
        <meshStandardMaterial color={color ? adjustColor(color, -25) : palette.accent} roughness={pbr.roughness * 0.7} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 天板 */}
      <RoundedBox args={[w + 0.04, 0.04, d + 0.06]} radius={0.012} position={[0, h * 0.9, 0.01]} castShadow>
        <meshStandardMaterial color={color ? adjustColor(color, -10) : palette.secondary} roughness={pbr.roughness * 0.5} metalness={pbr.metalness} />
      </RoundedBox>
      {/* スタッフ作業面 */}
      <RoundedBox args={[w * 0.7, 0.025, d * 0.45]} radius={0.008} position={[0, staffSurfaceH, -d * 0.15]} castShadow>
        <meshStandardMaterial color={color ? adjustColor(color, 10) : palette.secondary} roughness={pbr.roughness * 0.5} metalness={pbr.metalness} />
      </RoundedBox>
      {/* ロゴプレート（メタリック） */}
      <RoundedBox args={[w * 0.28, 0.06, 0.012]} radius={0.008} position={[0, h * 0.65, d / 2 + 0.04]}>
        <meshStandardMaterial color="#aaa" metalness={0.7} roughness={0.15} envMapIntensity={1.5} />
      </RoundedBox>
      {/* 天板上の小物トレイ */}
      <RoundedBox args={[w * 0.2, 0.015, 0.12]} radius={0.005} position={[w * 0.3, h * 0.92 + 0.008, 0]}>
        <meshStandardMaterial color={adjustColor(c, -35)} roughness={pbr.roughness * 0.7} metalness={pbr.metalness} />
      </RoundedBox>
      {/* キックプレート */}
      <mesh position={[0, 0.015, 0.01]}>
        <boxGeometry args={[w - 0.06, 0.03, d - 0.06]} />
        <meshStandardMaterial color={adjustColor(c, -45)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </mesh>
    </group>
  );
}

function TvMonitor({ scale, color, palette }: FurniturePartProps) {
  const [w, h] = scale;
  const screenY = h / 2 + 0.8;
  const thinDepth = 0.03;
  const standLegAngle = 0.25;
  const standLegLen = 0.35;
  const metalColor = color ? adjustColor(color, -60) : palette.metal;
  return (
    <group>
      {/* スクリーンベゼル */}
      <RoundedBox args={[w, h, thinDepth]} radius={0.005} position={[0, screenY, 0]} castShadow>
        <meshStandardMaterial color={metalColor} roughness={0.2} metalness={0.1} />
      </RoundedBox>
      {/* スクリーン表示面（発光） */}
      <RoundedBox args={[w - 0.02, h - 0.02, 0.003]} radius={0.003} position={[0, screenY, thinDepth / 2 + 0.001]}>
        <meshStandardMaterial color="#080818" emissive="#1a2a5a" emissiveIntensity={0.8} roughness={0.02} />
      </RoundedBox>
      {/* 電源LED（小さな発光ドット） */}
      <mesh position={[0, screenY - h / 2 + 0.015, thinDepth / 2 + 0.002]}>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={2} />
      </mesh>
      {/* V字スタンド — 左脚 */}
      <mesh position={[-w * 0.12, standLegLen / 2 * Math.cos(standLegAngle), -0.03]} rotation={[0, 0, standLegAngle]} castShadow>
        <boxGeometry args={[0.02, standLegLen, 0.03]} />
        <meshStandardMaterial color="#555" metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      {/* V字スタンド — 右脚 */}
      <mesh position={[w * 0.12, standLegLen / 2 * Math.cos(standLegAngle), -0.03]} rotation={[0, 0, -standLegAngle]} castShadow>
        <boxGeometry args={[0.02, standLegLen, 0.03]} />
        <meshStandardMaterial color="#555" metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      {/* スタンドベースプレート */}
      <RoundedBox args={[w * 0.5, 0.012, 0.12]} radius={0.004} position={[0, 0.006, -0.03]}>
        <meshStandardMaterial color="#444" metalness={0.5} roughness={0.25} envMapIntensity={1.5} />
      </RoundedBox>
    </group>
  );
}

function WashingMachine({ scale, color, palette }: FurniturePartProps) {
  const [w, h, d] = scale;
  const c = color || palette.metal;
  return (
    <group>
      {/* 本体 */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={c} roughness={0.3} metalness={0.1} />
      </mesh>
      {/* ドア（円形） */}
      <mesh position={[0, h * 0.45, d / 2 + 0.01]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[w * 0.3, w * 0.3, 0.02, 24]} />
        <meshPhysicalMaterial color="#B8D8E8" transparent opacity={0.4} roughness={0.05} metalness={0.1} />
      </mesh>
      {/* ドアリング */}
      <mesh position={[0, h * 0.45, d / 2 + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[w * 0.3, 0.015, 8, 24]} />
        <meshStandardMaterial color="#CCC" metalness={0.5} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      {/* 操作パネル */}
      <mesh position={[0, h * 0.88, d / 2 + 0.01]}>
        <boxGeometry args={[w * 0.7, h * 0.12, 0.01]} />
        <meshStandardMaterial color={adjustColor(c, -15)} roughness={0.4} />
      </mesh>
    </group>
  );
}

function CoatRack({ scale, color, palette }: FurniturePartProps) {
  const [w, h] = scale;
  const c = color || palette.metal;
  return (
    <group>
      {/* ポール */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.025, h, 8]} />
        <meshStandardMaterial color={c} metalness={0.5} roughness={0.3} envMapIntensity={1.5} />
      </mesh>
      {/* ベース */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[w * 0.35, w * 0.4, 0.04, 16]} />
        <meshStandardMaterial color={c} metalness={0.4} roughness={0.3} envMapIntensity={1.5} />
      </mesh>
      {/* フック */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i * Math.PI * 2) / 6;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * w * 0.2, h * 0.9, Math.sin(angle) * w * 0.2]}
            rotation={[0, -angle, Math.PI / 6]}
            castShadow
          >
            <cylinderGeometry args={[0.01, 0.01, w * 0.25, 6]} />
            <meshStandardMaterial color={c} metalness={0.5} roughness={0.3} envMapIntensity={1.5} />
          </mesh>
        );
      })}
      {/* トップキャップ */}
      <mesh position={[0, h, 0]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial color={c} metalness={0.4} roughness={0.3} envMapIntensity={1.5} />
      </mesh>
    </group>
  );
}

function AirConditioner({ scale, color, palette, metalFinish, qualityLevel }: FurniturePartProps) {
  const { small: furnitureTexSmall } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const c = color || palette.metal;
  const metalTex = useMemo(() => !color ? generateMetalTexture(furnitureTexSmall, furnitureTexSmall, metalFinish) : null, [color, metalFinish, furnitureTexSmall]);
  return (
    <group>
      {/* 本体（壁掛け位置） */}
      <mesh position={[0, 2.2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={c} map={metalTex?.map ?? null} normalMap={metalTex?.normalMap ?? null} roughness={0.3} />
      </mesh>
      {/* フロントパネル */}
      <mesh position={[0, 2.2, d / 2 + 0.005]}>
        <boxGeometry args={[w - 0.02, h - 0.02, 0.005]} />
        <meshStandardMaterial color={adjustColor(c, -5)} roughness={0.2} />
      </mesh>
      {/* 吹出口スリット */}
      <mesh position={[0, 2.2 - h / 2 + 0.02, d / 2 + 0.01]}>
        <boxGeometry args={[w * 0.85, 0.015, 0.01]} />
        <meshStandardMaterial color={adjustColor(c, -30)} roughness={0.4} />
      </mesh>
      {/* インジケーターLED */}
      <mesh position={[w * 0.35, 2.2 + h * 0.2, d / 2 + 0.01]}>
        <boxGeometry args={[0.04, 0.01, 0.005]} />
        <meshStandardMaterial color="#00CC00" emissive="#00CC00" emissiveIntensity={1} />
      </mesh>
    </group>
  );
}

function Desk({ scale, color, palette, pbr, woodType, qualityLevel }: FurniturePartProps) {
  const { size: furnitureTexSize } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const legInset = 0.06;
  const legTopR = 0.025;
  const legBotR = 0.03;
  const drawerW = w * 0.35;
  const drawerH = h * 0.65;
  const drawerCount = 3;
  const singleDrawerH = drawerH / drawerCount;
  // デスク: 天板=secondary, 本体/引き出し=primary, 脚=metal
  const topColor = color || palette.secondary;
  const bodyColor = color || palette.primary;
  const legColor = color ? adjustColor(color, -30) : palette.metal;
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSize, furnitureTexSize, woodType) : null, [color, woodType, furnitureTexSize]);
  return (
    <group>
      {/* 天板 */}
      <RoundedBox args={[w, 0.035, d]} radius={0.008} position={[0, h, 0]} castShadow>
        <meshStandardMaterial color={topColor} map={woodTex} roughness={pbr.roughness * 0.7} metalness={pbr.metalness} />
      </RoundedBox>
      {/* ケーブルホール（天板後方） */}
      <mesh position={[0, h + 0.001, -d / 2 + 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.04, 16]} />
        <meshStandardMaterial color="#222" roughness={0.8} metalness={0} />
      </mesh>
      {/* テーパー脚（左側2本） */}
      {[-1, 1].map((z, i) => (
        <group key={`leg-l-${i}`} position={[-(w / 2 - legInset), 0, z * (d / 2 - legInset)]}>
          <mesh position={[0, (h - 0.035) / 2, 0]} castShadow>
            <cylinderGeometry args={[legTopR, legBotR, h - 0.035, 8]} />
            <meshStandardMaterial color={legColor} roughness={pbr.roughness} metalness={pbr.metalness} />
          </mesh>
          <mesh position={[0, 0.003, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.006, 12]} />
            <meshStandardMaterial color={color ? adjustColor(color, -40) : adjustColor(palette.metal, -10)} roughness={0.4} metalness={0.1} />
          </mesh>
        </group>
      ))}
      {/* 引き出しユニット（右側） */}
      <RoundedBox
        args={[drawerW, drawerH, d - 0.04]}
        radius={0.005}
        position={[w / 2 - legInset - drawerW / 2 + 0.02, drawerH / 2 + 0.01, 0]}
        castShadow
      >
        <meshStandardMaterial color={color ? adjustColor(color, -8) : bodyColor} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 引き出しライン（溝）+ 取っ手 */}
      {Array.from({ length: drawerCount }).map((_, i) => {
        const drawerY = 0.01 + singleDrawerH * i + singleDrawerH / 2;
        const drawerX = w / 2 - legInset - drawerW / 2 + 0.02;
        return (
          <group key={`drawer-${i}`}>
            {/* 溝ライン（上端） */}
            <mesh position={[drawerX, 0.01 + singleDrawerH * (i + 1), d / 2 - 0.019]}>
              <boxGeometry args={[drawerW - 0.02, 0.004, 0.002]} />
              <meshStandardMaterial color={color ? adjustColor(color, -40) : adjustColor(bodyColor, -20)} roughness={pbr.roughness} metalness={pbr.metalness} />
            </mesh>
            {/* 取っ手（メタリック） */}
            <RoundedBox
              args={[0.06, 0.012, 0.015]}
              radius={0.003}
              position={[drawerX, drawerY, d / 2 - 0.005]}
            >
              <meshStandardMaterial color="#AAA" metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
            </RoundedBox>
          </group>
        );
      })}
      {/* モデスティパネル */}
      <mesh position={[0, h * 0.25, d / 2 - 0.01]} castShadow>
        <boxGeometry args={[w - drawerW - legInset * 2 + 0.02, h * 0.35, 0.012]} />
        <meshStandardMaterial color={color ? adjustColor(color, -15) : adjustColor(bodyColor, -10)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </mesh>
    </group>
  );
}

function Bookcase({ scale, color, palette, pbr, woodType, qualityLevel }: FurniturePartProps) {
  const { small: furnitureTexSmall } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const shelves = 5;
  const c = color || palette.primary;
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSmall, furnitureTexSmall, woodType) : null, [color, woodType, furnitureTexSmall]);
  return (
    <group>
      {/* 側板 */}
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[side * (w / 2 - 0.015), h / 2, 0]} castShadow>
          <boxGeometry args={[0.03, h, d]} />
          <meshPhysicalMaterial color={adjustColor(c, -10)} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.3} clearcoatRoughness={0.3} envMapIntensity={1.73} />
        </mesh>
      ))}
      {/* 棚板 */}
      {Array.from({ length: shelves + 1 }).map((_, i) => (
        <mesh key={`s-${i}`} position={[0, (h / shelves) * i, 0]}>
          <boxGeometry args={[w - 0.04, 0.02, d]} />
          <meshPhysicalMaterial color={c} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.3} clearcoatRoughness={0.3} envMapIntensity={1.73} />
        </mesh>
      ))}
      {/* 背板 */}
      <mesh position={[0, h / 2, -d / 2 + 0.005]}>
        <boxGeometry args={[w - 0.04, h, 0.01]} />
        <meshPhysicalMaterial color={adjustColor(c, -20)} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.3} clearcoatRoughness={0.3} envMapIntensity={1.73} />
      </mesh>
      {/* 本（ランダムに色を付けた小さなbox） */}
      {Array.from({ length: shelves }).map((_, si) =>
        Array.from({ length: Math.floor(w / 0.08) }).map((_, bi) => {
          const bookH = (h / shelves) * 0.7 + Math.random() * (h / shelves) * 0.2;
          const bookW = 0.03 + Math.random() * 0.03;
          const colors = ['#8B4513', '#2F4F4F', '#8B0000', '#00008B', '#DAA520', '#556B2F', '#4B0082'];
          const bookColor = colors[(si * 7 + bi * 3) % colors.length];
          return (
            <mesh
              key={`b-${si}-${bi}`}
              position={[
                -w / 2 + 0.04 + bi * 0.07,
                (h / shelves) * si + bookH / 2 + 0.02,
                0,
              ]}
            >
              <boxGeometry args={[bookW, bookH, d * 0.7]} />
              <meshStandardMaterial color={bookColor} roughness={0.8} />
            </mesh>
          );
        })
      )}
    </group>
  );
}

function KitchenIsland({ scale, color, palette, pbr }: FurniturePartProps) {
  const [w, h, d] = scale;
  const bodyH = h * 0.85;
  const cabinetCount = Math.max(3, Math.floor(w / 0.35));
  const panelSpacing = w / cabinetCount;
  const c = color || palette.primary;
  const topColor = color ? adjustColor(color, -20) : palette.secondary;
  return (
    <group>
      {/* 本体 */}
      <RoundedBox args={[w, bodyH, d]} radius={0.008} position={[0, bodyH / 2 + 0.04, 0]} castShadow>
        <meshStandardMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 天板（カウンタートップ） */}
      <RoundedBox args={[w + 0.06, 0.045, d + 0.06]} radius={0.01} position={[0, h * 0.92, 0]} castShadow>
        <meshStandardMaterial color={topColor} roughness={pbr.roughness * 0.5} metalness={pbr.metalness} />
      </RoundedBox>
      {/* キャビネットドア区切りライン（前面） */}
      {Array.from({ length: cabinetCount - 1 }).map((_, i) => (
        <mesh key={`line-f-${i}`} position={[-w / 2 + panelSpacing * (i + 1), bodyH / 2 + 0.04, d / 2 + 0.002]}>
          <boxGeometry args={[0.004, bodyH * 0.85, 0.002]} />
          <meshStandardMaterial color={adjustColor(c, -30)} roughness={pbr.roughness} />
        </mesh>
      ))}
      {/* キャビネットドア区切りライン（背面） */}
      {Array.from({ length: cabinetCount - 1 }).map((_, i) => (
        <mesh key={`line-b-${i}`} position={[-w / 2 + panelSpacing * (i + 1), bodyH / 2 + 0.04, -d / 2 - 0.002]}>
          <boxGeometry args={[0.004, bodyH * 0.85, 0.002]} />
          <meshStandardMaterial color={adjustColor(c, -30)} roughness={pbr.roughness} />
        </mesh>
      ))}
      {/* キャビネットハンドル（前面） */}
      {Array.from({ length: cabinetCount }).map((_, i) => (
        <mesh key={`hf-${i}`} position={[-w / 2 + panelSpacing * (i + 0.5), h * 0.5, d / 2 + 0.008]}>
          <boxGeometry args={[0.008, 0.02, 0.08]} />
          <meshStandardMaterial color="#aaa" metalness={0.5} roughness={0.2} envMapIntensity={1.5} />
        </mesh>
      ))}
      {/* キャビネットハンドル（背面） */}
      {Array.from({ length: cabinetCount }).map((_, i) => (
        <mesh key={`hb-${i}`} position={[-w / 2 + panelSpacing * (i + 0.5), h * 0.5, -d / 2 - 0.008]}>
          <boxGeometry args={[0.008, 0.02, 0.08]} />
          <meshStandardMaterial color="#aaa" metalness={0.5} roughness={0.2} envMapIntensity={1.5} />
        </mesh>
      ))}
      {/* シンク（天板に凹み） */}
      <mesh position={[-w * 0.25, h * 0.92 + 0.01, 0]}>
        <cylinderGeometry args={[0.12, 0.1, 0.04, 20]} />
        <meshStandardMaterial color="#999" metalness={0.7} roughness={0.1} envMapIntensity={1.5} />
      </mesh>
      {/* 蛇口（垂直パイプ + 水平アーム + ヘッド） */}
      <mesh position={[-w * 0.25, h * 0.92 + 0.12, -d * 0.12]} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.2, 8]} />
        <meshStandardMaterial color="#bbb" metalness={0.7} roughness={0.15} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[-w * 0.25, h * 0.92 + 0.22, -d * 0.06]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.008, 0.008, 0.12, 8]} />
        <meshStandardMaterial color="#bbb" metalness={0.7} roughness={0.15} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[-w * 0.25, h * 0.92 + 0.2, 0]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#bbb" metalness={0.7} roughness={0.15} envMapIntensity={1.5} />
      </mesh>
      {/* キックプレート */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[w - 0.06, 0.04, d - 0.06]} />
        <meshStandardMaterial color={adjustColor(c, -40)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </mesh>
      {/* オープンシェルフ区画 */}
      <mesh position={[w / 2 - panelSpacing / 2, bodyH / 2 + 0.04, 0]}>
        <boxGeometry args={[panelSpacing - 0.02, 0.015, d - 0.04]} />
        <meshStandardMaterial color={adjustColor(c, -15)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </mesh>
    </group>
  );
}

function BarTable({ scale, color, palette, pbr }: FurniturePartProps) {
  const [w, h] = scale;
  // バーテーブル: 天板=secondary, ポール/ベース=metal
  const topColor = color ? adjustColor(color, 20) : palette.secondary;
  const poleColor = color || palette.metal;
  return (
    <group>
      {/* 天板 */}
      <mesh position={[0, h, 0]} castShadow>
        <cylinderGeometry args={[w / 2, w / 2, 0.03, 24]} />
        <meshStandardMaterial color={topColor} roughness={pbr.roughness * 0.5} metalness={0.2} />
      </mesh>
      {/* ポール */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, h, 8]} />
        <meshStandardMaterial color={poleColor} metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      {/* ベース */}
      <mesh position={[0, 0.015, 0]}>
        <cylinderGeometry args={[w * 0.35, w * 0.38, 0.03, 24]} />
        <meshStandardMaterial color={poleColor} metalness={0.5} roughness={0.3} envMapIntensity={1.5} />
      </mesh>
    </group>
  );
}

function Wardrobe({ scale, color, palette, pbr, woodType, qualityLevel }: FurniturePartProps) {
  const { size: furnitureTexSize } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const doorW = (w - 0.005) / 2;
  const doorH = h * 0.82;
  const doorY = h * 0.08 + doorH / 2;
  const panelInset = 0.012;
  const c = color || palette.primary;
  const handleColor = color ? '#bbb' : palette.metal;
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSize, furnitureTexSize, woodType) : null, [color, woodType, furnitureTexSize]);
  return (
    <group>
      {/* 本体 */}
      <RoundedBox args={[w, h, d]} radius={0.01} position={[0, h / 2, 0]} castShadow>
        <meshStandardMaterial color={c} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 左ドア — 外枠 */}
      <RoundedBox args={[doorW, doorH, 0.015]} radius={0.006} position={[-doorW / 2 - 0.0025, doorY, d / 2 + 0.002]}>
        <meshStandardMaterial color={adjustColor(c, -5)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 左ドア — インセットパネル */}
      <RoundedBox args={[doorW - panelInset * 2, doorH - panelInset * 2, 0.008]} radius={0.004} position={[-doorW / 2 - 0.0025, doorY, d / 2 + 0.011]}>
        <meshStandardMaterial color={adjustColor(c, -15)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 右ドア — 外枠 */}
      <RoundedBox args={[doorW, doorH, 0.015]} radius={0.006} position={[doorW / 2 + 0.0025, doorY, d / 2 + 0.002]}>
        <meshStandardMaterial color={adjustColor(c, -5)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 右ドア — インセットパネル */}
      <RoundedBox args={[doorW - panelInset * 2, doorH - panelInset * 2, 0.008]} radius={0.004} position={[doorW / 2 + 0.0025, doorY, d / 2 + 0.011]}>
        <meshStandardMaterial color={adjustColor(c, -15)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
      {/* 左取っ手 */}
      <mesh position={[-0.025, h * 0.5, d / 2 + 0.025]}>
        <cylinderGeometry args={[0.01, 0.01, 0.12, 8]} />
        <meshStandardMaterial color={handleColor} metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      {/* 右取っ手 */}
      <mesh position={[0.025, h * 0.5, d / 2 + 0.025]}>
        <cylinderGeometry args={[0.01, 0.01, 0.12, 8]} />
        <meshStandardMaterial color={handleColor} metalness={0.6} roughness={0.2} envMapIntensity={1.5} />
      </mesh>
      {/* クラウンモールディング */}
      <RoundedBox args={[w + 0.04, 0.03, d + 0.03]} radius={0.006} position={[0, h + 0.015, 0]}>
        <meshStandardMaterial color={adjustColor(c, -12)} roughness={pbr.roughness * 0.8} metalness={pbr.metalness} />
      </RoundedBox>
      {/* ベース */}
      <RoundedBox args={[w - 0.02, 0.06, d - 0.02]} radius={0.005} position={[0, 0.03, 0]}>
        <meshStandardMaterial color={adjustColor(c, -30)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </RoundedBox>
    </group>
  );
}

function ShoeRack({ scale, color, palette, pbr, selected, woodType, qualityLevel }: FurniturePartProps) {
  const { small: furnitureTexSmall } = getFurnitureTexSizes(qualityLevel);
  const [w, h, d] = scale;
  const c = color || palette.primary;
  const woodTex = useMemo(() => !color ? generateWoodTexture(furnitureTexSmall, furnitureTexSmall, woodType) : null, [color, woodType, furnitureTexSmall]);
  const shelfCount = 3;
  const slotCount = Math.max(2, Math.floor(w / 0.15));
  return (
    <group>
      {/* 側板 */}
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[side * (w / 2 - 0.015), h / 2, 0]} castShadow>
          <boxGeometry args={[0.03, h, d]} />
          <meshPhysicalMaterial color={adjustColor(c, -10)} map={woodTex} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} emissive={adjustColor(c, -10)} emissiveIntensity={selected ? 0.15 : 0} />
        </mesh>
      ))}
      {/* 棚板 */}
      {Array.from({ length: shelfCount + 1 }).map((_, i) => (
        <mesh key={`shelf-${i}`} position={[0, (h / shelfCount) * i, 0]}>
          <boxGeometry args={[w - 0.04, 0.015, d]} />
          <meshPhysicalMaterial color={c} map={woodTex} roughness={pbr.roughness * 0.8} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
        </mesh>
      ))}
      {/* スロット仕切り（各段に配置） */}
      {Array.from({ length: shelfCount }).map((_, si) => {
        const shelfY = (h / shelfCount) * si + 0.01;
        const segH = h / shelfCount - 0.025;
        return Array.from({ length: slotCount - 1 }).map((_, di) => (
          <mesh key={`div-${si}-${di}`} position={[(-w / 2 + 0.04) + (di + 1) * ((w - 0.08) / slotCount), shelfY + segH / 2, 0]}>
            <boxGeometry args={[0.008, segH, d * 0.7]} />
            <meshPhysicalMaterial color={adjustColor(c, -15)} roughness={pbr.roughness} metalness={pbr.metalness} />
          </mesh>
        ));
      })}
    </group>
  );
}

function UmbrellaStand({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w, h] = scale;
  const r = w / 2;
  const c = color || palette.metal;
  return (
    <group>
      {/* 本体シリンダー */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[r, r * 0.9, h, 16]} />
        <meshPhysicalMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.2} clearcoatRoughness={0.3} emissive={c} emissiveIntensity={selected ? 0.15 : 0} />
      </mesh>
      {/* 上縁リング */}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r, 0.01, 8, 24]} />
        <meshPhysicalMaterial color={adjustColor(c, 15)} roughness={0.3} metalness={0.2} clearcoat={0.3} clearcoatRoughness={0.2} />
      </mesh>
      {/* 底板 */}
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[r * 0.85, r * 0.85, 0.02, 16]} />
        <meshPhysicalMaterial color={adjustColor(c, -20)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </mesh>
    </group>
  );
}

function CashRegister({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w, h, d] = scale;
  const c = color || palette.primary;
  return (
    <group>
      {/* 本体ボックス */}
      <RoundedBox args={[w, h * 0.5, d]} radius={0.01} position={[0, h * 0.25, 0]} castShadow>
        <meshPhysicalMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} emissive={c} emissiveIntensity={selected ? 0.15 : 0} />
      </RoundedBox>
      {/* スクリーン */}
      <RoundedBox args={[w * 0.7, h * 0.4, 0.02]} radius={0.008} position={[0, h * 0.75, -d * 0.15]} rotation={[-0.3, 0, 0]} castShadow>
        <meshPhysicalMaterial color="#1a1a2e" roughness={0.1} metalness={0.05} clearcoat={0.5} clearcoatRoughness={0.1} />
      </RoundedBox>
      {/* ボタン列 */}
      {Array.from({ length: 3 }).map((_, i) => (
        <mesh key={i} position={[(-w * 0.2) + i * (w * 0.2), h * 0.52, d * 0.2]}>
          <cylinderGeometry args={[0.015, 0.015, 0.01, 8]} />
          <meshPhysicalMaterial color={i === 2 ? '#4CAF50' : '#888888'} roughness={0.5} metalness={0.1} />
        </mesh>
      ))}
      {/* ドロワー前面 */}
      <mesh position={[0, h * 0.15, d / 2 + 0.005]}>
        <boxGeometry args={[w * 0.9, h * 0.25, 0.01]} />
        <meshPhysicalMaterial color={adjustColor(c, -15)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </mesh>
    </group>
  );
}

function MenuBoard({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w, h] = scale;
  const c = color || palette.primary;
  const legH = h * 0.85;
  const legSpread = w * 0.35;
  return (
    <group>
      {/* ボード面 */}
      <RoundedBox args={[w, h * 0.6, 0.025]} radius={0.01} position={[0, h * 0.65, 0]} castShadow>
        <meshPhysicalMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.05} clearcoatRoughness={0.5} emissive={c} emissiveIntensity={selected ? 0.15 : 0} />
      </RoundedBox>
      {/* ボード枠 */}
      <mesh position={[0, h * 0.65, 0.014]}>
        <boxGeometry args={[w - 0.03, h * 0.55, 0.005]} />
        <meshPhysicalMaterial color={adjustColor(c, 25)} roughness={0.6} metalness={0} />
      </mesh>
      {/* イーゼル脚（前2本） */}
      {[-1, 1].map((side, i) => (
        <mesh key={`front-${i}`} position={[side * legSpread, legH / 2, 0.06]} rotation={[0.12, 0, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.015, legH, 8]} />
          <meshPhysicalMaterial color={color ? adjustColor(color, -30) : palette.metal} roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
      {/* イーゼル脚（後ろ1本） */}
      <mesh position={[0, legH * 0.45, -0.15]} rotation={[-0.25, 0, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.015, legH * 0.9, 8]} />
        <meshPhysicalMaterial color={color ? adjustColor(color, -30) : palette.metal} roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

function FlowerPot({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w, h] = scale;
  const potH = h * 0.45;
  const potTopR = w / 2;
  const potBotR = w * 0.3;
  const c = color || palette.primary;
  return (
    <group>
      {/* ポット本体（テーパーシリンダー） */}
      <mesh position={[0, potH / 2, 0]} castShadow>
        <cylinderGeometry args={[potTopR, potBotR, potH, 16]} />
        <meshPhysicalMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} emissive={c} emissiveIntensity={selected ? 0.15 : 0} />
      </mesh>
      {/* ポット縁 */}
      <mesh position={[0, potH, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[potTopR, 0.012, 8, 24]} />
        <meshPhysicalMaterial color={adjustColor(c, -10)} roughness={pbr.roughness * 0.8} metalness={pbr.metalness} />
      </mesh>
      {/* 花のクラスター（球体） */}
      {[
        { pos: [0, h * 0.75, 0] as [number, number, number], col: '#FF6B8A', r: w * 0.22 },
        { pos: [-w * 0.2, h * 0.85, w * 0.1] as [number, number, number], col: '#FFD93D', r: w * 0.16 },
        { pos: [w * 0.15, h * 0.9, -w * 0.1] as [number, number, number], col: '#FF8FA3', r: w * 0.14 },
        { pos: [w * 0.05, h * 0.65, w * 0.15] as [number, number, number], col: '#C7E46B', r: w * 0.18 },
      ].map((flower, i) => (
        <mesh key={i} position={flower.pos}>
          <sphereGeometry args={[flower.r, 8, 8]} />
          <meshStandardMaterial color={flower.col} roughness={0.9} metalness={0} />
        </mesh>
      ))}
      {/* 茎（緑の細い円柱） */}
      <mesh position={[0, potH + (h - potH) * 0.3, 0]}>
        <cylinderGeometry args={[0.008, 0.008, h * 0.35, 6]} />
        <meshStandardMaterial color="#2E7D32" roughness={0.8} metalness={0} />
      </mesh>
    </group>
  );
}

function CeilingFan({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w, h] = scale;
  const bladeCount = 4;
  const bladeLen = w * 0.42;
  const c = color || palette.primary;
  const metalColor = color ? adjustColor(color, -30) : palette.metal;
  return (
    <group>
      {/* 中央モーターハウジング */}
      <mesh position={[0, -h * 0.3, 0]} castShadow>
        <cylinderGeometry args={[w * 0.06, w * 0.08, h * 0.6, 16]} />
        <meshPhysicalMaterial color={metalColor} roughness={0.3} metalness={0.5} clearcoat={0.3} clearcoatRoughness={0.2} emissive={metalColor} emissiveIntensity={selected ? 0.15 : 0} />
      </mesh>
      {/* 天井取付ロッド */}
      <mesh position={[0, h * 0.3, 0]}>
        <cylinderGeometry args={[0.015, 0.015, h * 0.4, 8]} />
        <meshPhysicalMaterial color={metalColor} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* ブレード */}
      {Array.from({ length: bladeCount }).map((_, i) => {
        const angle = (i * Math.PI * 2) / bladeCount;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * bladeLen * 0.5, -h * 0.3, Math.sin(angle) * bladeLen * 0.5]}
            rotation={[0, -angle, 0]}
            castShadow
          >
            <boxGeometry args={[bladeLen, 0.015, w * 0.08]} />
            <meshPhysicalMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.1} clearcoatRoughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

function Rug({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w, , d] = scale;
  const c = color || palette.fabric;
  return (
    <group>
      {/* メインラグ面 */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[w, 0.01, d]} />
        <meshPhysicalMaterial color={c} roughness={0.95} metalness={0} emissive={c} emissiveIntensity={selected ? 0.15 : 0} />
      </mesh>
      {/* ボーダーライン */}
      <mesh position={[0, 0.006, 0]}>
        <boxGeometry args={[w - 0.1, 0.002, d - 0.1]} />
        <meshPhysicalMaterial color={adjustColor(c, -20)} roughness={0.95} metalness={0} />
      </mesh>
      {/* 内側ボーダー */}
      <mesh position={[0, 0.007, 0]}>
        <boxGeometry args={[w - 0.25, 0.002, d - 0.2]} />
        <meshPhysicalMaterial color={adjustColor(c, 15)} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}

function Curtain({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w, h] = scale;
  const c = color || palette.fabric;
  const foldCount = Math.max(4, Math.floor(w / 0.12));
  const foldW = w / foldCount;
  return (
    <group>
      {/* カーテンレール */}
      <mesh position={[0, h, 0]}>
        <cylinderGeometry args={[0.012, 0.012, w + 0.1, 8]} />
        <meshPhysicalMaterial color={color ? adjustColor(color, -40) : palette.metal} roughness={0.3} metalness={0.5} />
      </mesh>
      {/* カーテンひだ（波形の並列ボックス） */}
      {Array.from({ length: foldCount }).map((_, i) => {
        const zOffset = (i % 2 === 0 ? 1 : -1) * 0.015;
        return (
          <mesh key={i} position={[-w / 2 + foldW * (i + 0.5), h / 2, zOffset]} castShadow rotation={[0, 0, 0]}>
            <boxGeometry args={[foldW * 0.9, h, 0.02]} />
            <meshPhysicalMaterial
              color={i % 2 === 0 ? c : adjustColor(c, -6)}
              roughness={0.95}
              metalness={0}
              emissive={c}
              emissiveIntensity={selected ? 0.1 : 0}
              side={2}
            />
          </mesh>
        );
      })}
      {/* カーテンリング */}
      {Array.from({ length: Math.min(6, Math.floor(foldCount / 2)) }).map((_, i) => (
        <mesh key={`ring-${i}`} position={[-w / 2 + (w / 5) * (i + 0.5), h + 0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.015, 0.003, 6, 12]} />
          <meshPhysicalMaterial color={color ? adjustColor(color, -40) : palette.metal} roughness={0.3} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Clock({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w] = scale;
  const r = w / 2;
  const c = color || palette.primary;
  return (
    <group>
      {/* 文字盤（フラットシリンダー） */}
      <mesh position={[0, 0, 0]} castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, 0.03, 24]} />
        <meshPhysicalMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.2} clearcoatRoughness={0.3} emissive={c} emissiveIntensity={selected ? 0.15 : 0} />
      </mesh>
      {/* 枠リング */}
      <mesh position={[0, 0, 0]}>
        <torusGeometry args={[r, 0.01, 8, 32]} />
        <meshPhysicalMaterial color={color ? adjustColor(color, -30) : palette.metal} roughness={0.3} metalness={0.5} clearcoat={0.3} clearcoatRoughness={0.2} />
      </mesh>
      {/* 時針 */}
      <mesh position={[0, r * 0.15, 0.02]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.008, r * 0.5, 0.005]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* 分針 */}
      <mesh position={[0, r * 0.05, 0.025]} rotation={[0, 0, -0.8]}>
        <boxGeometry args={[0.005, r * 0.7, 0.004]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* 中心点 */}
      <mesh position={[0, 0, 0.03]}>
        <sphereGeometry args={[0.01, 8, 8]} />
        <meshStandardMaterial color="#333" roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}

function TrashCan({ scale, color, palette, pbr, selected }: FurniturePartProps) {
  const [w, h] = scale;
  const topR = w / 2;
  const botR = w * 0.4;
  const c = color || palette.metal;
  return (
    <group>
      {/* 本体（テーパーシリンダー） */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[topR, botR, h, 16]} />
        <meshPhysicalMaterial color={c} roughness={pbr.roughness} metalness={pbr.metalness} clearcoat={0.15} clearcoatRoughness={0.3} emissive={c} emissiveIntensity={selected ? 0.15 : 0} />
      </mesh>
      {/* 上縁リング */}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[topR, 0.008, 8, 24]} />
        <meshPhysicalMaterial color={adjustColor(c, 15)} roughness={0.3} metalness={0.3} clearcoat={0.3} clearcoatRoughness={0.2} />
      </mesh>
      {/* ペダル */}
      <mesh position={[0, 0.02, botR + 0.01]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[w * 0.3, 0.01, 0.04]} />
        <meshPhysicalMaterial color={adjustColor(c, -20)} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* 底 */}
      <mesh position={[0, 0.005, 0]}>
        <cylinderGeometry args={[botR, botR, 0.01, 16]} />
        <meshPhysicalMaterial color={adjustColor(c, -25)} roughness={pbr.roughness} metalness={pbr.metalness} />
      </mesh>
    </group>
  );
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
