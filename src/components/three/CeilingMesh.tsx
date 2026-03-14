'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { computeFloorPolygon, wallLength, wallAngle } from '@/lib/geometry';
import { useEditorStore } from '@/stores/useEditorStore';
import { useCeilingTexture } from '@/hooks/useCeilingTexture';

// useFrame内でのnew演算子を避けるためコンポーネント外に確保
const _ceilCamDir = new THREE.Vector3();
const _ceilPrevCamPos = new THREE.Vector3();
let _ceilCamInitialized = false;

interface CeilingMeshProps {
  walls: WallSegment[];
  roomHeight: number;
  style: StyleConfig;
}

/** スタイル別ダウンライト発光色 */
const DOWNLIGHT_COLORS: Record<string, string> = {
  japanese: '#FFF0D0',
  luxury: '#FFF5E0',
  industrial: '#FFFFFF',
  modern: '#FFFAF0',
  cafe: '#FFE8C0',
  minimal: '#FFFFFF',
  scandinavian: '#FFF8F0',
  retro: '#FFDDAA',
  medical: '#F0F8FF',
};

/** 点が多角形内部にあるか判定（Ray Casting法） */
function isPointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 点から線分への最短距離 */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

/** 点から壁までの最短距離 */
function minDistToWalls(px: number, py: number, walls: WallSegment[]): number {
  let minD = Infinity;
  for (const w of walls) {
    const d = distToSegment(px, py, w.start.x, w.start.y, w.end.x, w.end.y);
    if (d < minD) minD = d;
  }
  return minD;
}

/** リセス型ダウンライト */
function DownLight({ x, z, y, emissiveColor, isNight }: {
  x: number; z: number; y: number; emissiveColor: string; isNight: boolean;
}) {
  const intensity = isNight ? 5 : 2;
  return (
    <group position={[x, y, z]}>
      {/* くぼみシリンダー */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.03, 24, 1, true]} />
        <meshStandardMaterial color="#333333" side={THREE.BackSide} />
      </mesh>
      {/* LED発光面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[0.02, 24]} />
        <meshStandardMaterial
          color="#FFFFFF"
          emissive={emissiveColor}
          emissiveIntensity={intensity}
        />
      </mesh>
      {/* ポイントライト */}
      <pointLight
        position={[0, -0.05, 0]}
        intensity={isNight ? 0.6 : 0.25}
        distance={4}
        color={emissiveColor}
      />
    </group>
  );
}

/** スタイル別装飾梁設定 */
interface BeamConfig {
  count: number;          // 梁の本数 (0 = なし)
  height: number;         // 梁の高さ (m)
  width: number;          // 梁の幅 (m)
  color: string;          // 梁の色
  metalness: number;      // metalness値
  roughness: number;      // roughness値
}

const BEAM_CONFIGS: Record<string, BeamConfig | null> = {
  japanese:     { count: 2, height: 0.12, width: 0.10, color: '#8B7355', metalness: 0.0, roughness: 0.7 },
  industrial:   { count: 2, height: 0.12, width: 0.10, color: '#555555', metalness: 0.4, roughness: 0.3 },
  cafe:         { count: 2, height: 0.12, width: 0.10, color: '#6B4226', metalness: 0.0, roughness: 0.7 },
  scandinavian: { count: 1, height: 0.12, width: 0.10, color: '#C4A882', metalness: 0.0, roughness: 0.6 },
  luxury: null,
  modern: null,
  minimal: null,
  retro: null,
  medical: null,
};

/** 天井メッシュのprops比較: walls数・天井高・スタイル名のみで判定 */
function ceilingMeshPropsAreEqual(prev: CeilingMeshProps, next: CeilingMeshProps): boolean {
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.roomHeight !== next.roomHeight) return false;
  if (prev.style.name !== next.style.name) return false;
  if (prev.style.ceilingColor !== next.style.ceilingColor) return false;
  return true;
}

export const CeilingMesh = React.memo(function CeilingMesh({ walls, roomHeight, style }: CeilingMeshProps) {
  const dayNight = useEditorStore((s) => s.dayNight);
  const ceilingVisible = useEditorStore((s) => s.ceilingVisible);
  const isNight = dayNight === 'night';

  // 天井マテリアルの参照（カメラ角度ベースのフェードに使用）
  const ceilingMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const currentCeilingOpacityRef = useRef(0.7); // 基本不透明度
  const groupRef = useRef<THREE.Group>(null);

  // カメラ仰角に基づく天井の自動フェード
  useFrame(({ camera }) => {
    if (!ceilingMatRef.current) return;

    // カメラ位置変化量チェック: 閾値以下なら計算スキップ
    const cp = camera.position;
    if (_ceilCamInitialized) {
      const dx = cp.x - _ceilPrevCamPos.x;
      const dy = cp.y - _ceilPrevCamPos.y;
      const dz = cp.z - _ceilPrevCamPos.z;
      if (dx * dx + dy * dy + dz * dz < 0.0001) {
        // opacity lerp収束のみ処理
        const baseOpacity = ceilingVisible ? 0.7 : 0.0;
        const delta = baseOpacity - currentCeilingOpacityRef.current;
        if (Math.abs(delta) > 0.001) {
          currentCeilingOpacityRef.current += delta * 0.08;
          ceilingMatRef.current.opacity = currentCeilingOpacityRef.current;
        }
        return;
      }
    }
    _ceilPrevCamPos.copy(cp);
    _ceilCamInitialized = true;

    // カメラの向きからY成分（下向きの度合い）を取得
    camera.getWorldDirection(_ceilCamDir);
    // elevation = カメラの下向き角度（-Y方向が正 = 見下ろし）
    // _ceilCamDir.y が負 = カメラが下を見ている = 見下ろし
    const elevationAngle = Math.asin(-_ceilCamDir.y) * (180 / Math.PI); // 度に変換

    // 基本の不透明度（ceilingVisible が false の場合は 0 を目標に）
    let baseOpacity = ceilingVisible ? 0.7 : 0.0;

    // カメラ仰角が高い（30度以上見下ろし）場合、天井をフェードアウト
    if (elevationAngle > 30) {
      // 30度～50度の間で 0.7 → 0.05 に補間
      const fadeT = Math.min(1, (elevationAngle - 30) / 20);
      // smoothstep的な補間
      const smooth = fadeT * fadeT * (3 - 2 * fadeT);
      baseOpacity = baseOpacity * (1 - smooth) + 0.05 * smooth;
    }

    // lerp でスムーズ遷移
    currentCeilingOpacityRef.current += (baseOpacity - currentCeilingOpacityRef.current) * 0.08;

    ceilingMatRef.current.opacity = currentCeilingOpacityRef.current;

    // グループ全体の可視性制御（不透明度がほぼゼロの場合非表示）
    if (groupRef.current) {
      groupRef.current.visible = currentCeilingOpacityRef.current > 0.01;
    }
  });

  const ceilingGeometry = useMemo(() => {
    const polygon = computeFloorPolygon(walls);
    if (polygon.length < 3) return null;

    const shape = new THREE.Shape();
    const reversed = [...polygon].reverse();
    shape.moveTo(reversed[0].x, reversed[0].y);
    for (let i = 1; i < reversed.length; i++) {
      shape.lineTo(reversed[i].x, reversed[i].y);
    }
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }, [walls]);

  const roomBounds = useMemo(() => {
    if (walls.length === 0) return null;
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    return {
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cz: (Math.min(...ys) + Math.max(...ys)) / 2,
      w: Math.max(...xs) - Math.min(...xs),
      d: Math.max(...ys) - Math.min(...ys),
    };
  }, [walls]);

  const ceilingTexture = useCeilingTexture(style.name);

  // ダウンライト配置位置を計算
  const downlightPositions = useMemo(() => {
    if (!roomBounds || walls.length < 3) return [];
    const polygon = computeFloorPolygon(walls);
    if (polygon.length < 3) return [];

    const spacing = 1.5;
    const wallMargin = 0.5;
    const maxLights = 20;

    const minX = roomBounds.cx - roomBounds.w / 2;
    const maxX = roomBounds.cx + roomBounds.w / 2;
    const minZ = roomBounds.cz - roomBounds.d / 2;
    const maxZ = roomBounds.cz + roomBounds.d / 2;

    // グリッドを重心基準で配置
    const positions: { x: number; z: number }[] = [];
    const startX = roomBounds.cx - Math.floor((roomBounds.cx - minX) / spacing) * spacing;
    const startZ = roomBounds.cz - Math.floor((roomBounds.cz - minZ) / spacing) * spacing;

    for (let x = startX; x <= maxX; x += spacing) {
      for (let z = startZ; z <= maxZ; z += spacing) {
        if (!isPointInPolygon(x, z, polygon)) continue;
        if (minDistToWalls(x, z, walls) < wallMargin) continue;
        positions.push({ x, z });
        if (positions.length >= maxLights) break;
      }
      if (positions.length >= maxLights) break;
    }
    return positions;
  }, [walls, roomBounds]);

  const downlightColor = DOWNLIGHT_COLORS[style.name] || '#FFFAF0';

  // スタイル別の天井色・パネル設定
  const styleConfig = useMemo(() => {
    const name = style.name;
    let ceilingColor = style.ceilingColor;
    let panelEmissive = '#FFFDE8';
    let panelEmissiveIntensity = 0.8;
    let showPanels = true;
    let spacingMultiplier = 1.0;

    if (name === 'japanese') {
      ceilingColor = '#FFF8F0'; // 暖かみのあるティント
      spacingMultiplier = 1.4; // パネル間隔を広く
    } else if (name === 'industrial') {
      showPanels = false; // 露出天井：パネルなし
      ceilingColor = style.ceilingColor; // 暗めの天井色をそのまま使用
    } else if (name === 'luxury') {
      panelEmissive = '#FFF5D0'; // ゴールデンティント
    } else if (name === 'medical') {
      panelEmissiveIntensity = 1.0; // 明るい白パネル
      panelEmissive = '#FFFFFF';
    }

    return { ceilingColor, panelEmissive, panelEmissiveIntensity, showPanels, spacingMultiplier };
  }, [style]);

  // 天井照明パネルの配置を計算
  const lightPanels = useMemo(() => {
    if (!roomBounds) return [];
    const panels: { x: number; z: number }[] = [];
    const sm = styleConfig.spacingMultiplier;
    const spacingX = Math.max(2, (roomBounds.w * sm) / Math.max(1, Math.floor(roomBounds.w / (2.5 * sm))));
    const spacingZ = Math.max(2, (roomBounds.d * sm) / Math.max(1, Math.floor(roomBounds.d / (2.5 * sm))));
    const startX = roomBounds.cx - roomBounds.w / 2 + spacingX / 2;
    const startZ = roomBounds.cz - roomBounds.d / 2 + spacingZ / 2;

    for (let x = startX; x < roomBounds.cx + roomBounds.w / 2; x += spacingX) {
      for (let z = startZ; z < roomBounds.cz + roomBounds.d / 2; z += spacingZ) {
        panels.push({ x, z });
      }
    }
    return panels;
  }, [roomBounds, styleConfig.spacingMultiplier]);

  // 廻り縁（Crown Molding）のデータを計算
  const crownMoldings = useMemo(() => {
    // インダストリアルスタイルでは廻り縁なし
    if (style.name === 'industrial') return [];

    // スタイル別の廻り縁カラー
    let moldingColor: string;
    if (style.name === 'japanese') {
      moldingColor = '#D4C5A0'; // 薄い木目色
    } else if (style.name === 'luxury') {
      moldingColor = '#C9B037'; // ゴールド
    } else if (style.name === 'medical') {
      moldingColor = '#FFFFFF'; // 白
    } else {
      // 天井色と同系色（やや暗め）
      moldingColor = style.ceilingColor;
    }

    const moldingHeight = 0.05; // 高さ 0.05m
    const moldingDepth = 0.03;  // 奥行 0.03m

    return walls.map((wall) => {
      const len = wallLength(wall);
      const angle = wallAngle(wall);
      const pos = new THREE.Vector3(wall.start.x, 0, wall.start.y);
      return { len, angle, pos, moldingColor, moldingHeight, moldingDepth };
    });
  }, [walls, style]);

  // 装飾梁（Beam）の配置を計算
  const beams = useMemo(() => {
    if (!roomBounds) return [];
    const cfg = BEAM_CONFIGS[style.name];
    if (!cfg || cfg.count === 0) return [];

    const { cx, cz, w, d } = roomBounds;
    const minX = cx - w / 2;
    const minZ = cz - d / 2;

    // 短辺方向に横断する梁を配置
    const isWiderThanDeep = w >= d;
    // 短辺方向 = 梁が横断する方向、長辺方向 = 梁の配置間隔方向
    const beamLength = isWiderThanDeep ? d : w;
    const longSpan = isWiderThanDeep ? w : d;
    const longStart = isWiderThanDeep ? minX : minZ;
    const crossCenter = isWiderThanDeep ? cz : cx;

    const result: {
      pos: [number, number, number];
      size: [number, number, number];
      color: string;
      metalness: number;
      roughness: number;
    }[] = [];

    const positions: number[] = [];
    if (cfg.count === 1) {
      positions.push(longStart + longSpan / 2);
    } else {
      positions.push(longStart + longSpan / 3);
      positions.push(longStart + (longSpan * 2) / 3);
    }

    for (const p of positions) {
      const y = roomHeight - cfg.height / 2;
      // 短辺方向に横断: isWiderThanDeep -> 梁はZ方向に伸びる（Xで配置）
      const pos: [number, number, number] = isWiderThanDeep
        ? [p, y, crossCenter]
        : [crossCenter, y, p];
      // boxGeometry args: [幅, 高さ, 奥行]
      const size: [number, number, number] = isWiderThanDeep
        ? [cfg.width, cfg.height, beamLength]
        : [beamLength, cfg.height, cfg.width];

      result.push({
        pos,
        size,
        color: cfg.color,
        metalness: cfg.metalness,
        roughness: cfg.roughness,
      });
    }
    return result;
  }, [roomBounds, style.name, roomHeight]);

  if (!ceilingGeometry || !roomBounds) return null;

  return (
    <group ref={groupRef}>
      {/* 廻り縁（Crown Molding） */}
      {crownMoldings.map((m, i) => (
        <group
          key={`crown-${i}`}
          position={m.pos}
          rotation={[0, -m.angle, 0]}
        >
          <mesh
            position={[m.len / 2, roomHeight - m.moldingHeight / 2, 0]}
            castShadow
          >
            <boxGeometry args={[m.len, m.moldingHeight, m.moldingDepth]} />
            <meshStandardMaterial
              color={m.moldingColor}
              roughness={0.4}
              metalness={style.name === 'luxury' ? 0.3 : 0.05}
            />
          </mesh>
        </group>
      ))}

      {/* 装飾梁（Decorative Beams） */}
      {beams.map((beam, i) => (
        <mesh
          key={`beam-${i}`}
          position={beam.pos}
          castShadow
          receiveShadow
        >
          <boxGeometry args={beam.size} />
          <meshStandardMaterial
            color={beam.color}
            roughness={beam.roughness}
            metalness={beam.metalness}
          />
        </mesh>
      ))}

      {/* 天井面 */}
      <mesh
        geometry={ceilingGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, roomHeight, 0]}
      >
        <meshStandardMaterial
          ref={ceilingMatRef}
          color={styleConfig.ceilingColor}
          map={ceilingTexture}
          roughness={0.95}
          metalness={0.0}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* 天井照明パネル */}
      {styleConfig.showPanels && lightPanels.map((panel, i) => (
        <group key={i} position={[panel.x, roomHeight - 0.01, panel.z]}>
          {/* パネル本体 */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.8, 0.8]} />
            <meshStandardMaterial
              color="#FFFFFF"
              emissive={styleConfig.panelEmissive}
              emissiveIntensity={styleConfig.panelEmissiveIntensity}
              transparent
              opacity={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* パネル枠（矩形フレーム） */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
            <boxGeometry args={[0.85, 0.85, 0.02]} />
            <meshStandardMaterial
              color={styleConfig.ceilingColor}
              roughness={0.8}
            />
          </mesh>
          {/* パネル下のポイントライト */}
          <pointLight
            position={[0, -0.1, 0]}
            intensity={0.15}
            distance={3}
            color="#FFF8F0"
          />
        </group>
      ))}

      {/* リセス型ダウンライト */}
      {downlightPositions.map((pos, i) => (
        <DownLight
          key={`downlight-${i}`}
          x={pos.x}
          z={pos.z}
          y={roomHeight}
          emissiveColor={downlightColor}
          isNight={isNight}
        />
      ))}
    </group>
  );
}, ceilingMeshPropsAreEqual);
