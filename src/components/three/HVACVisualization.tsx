'use client';

// 空調効率ヒートマップ可視化
// エアコン位置からの距離に基づく温度分布をカラーグリッドで表示

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { WallSegment } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';

interface HVACVisualizationProps {
  walls: WallSegment[];
  furniture: FurnitureItem[];
  roomHeight: number;
  enabled: boolean;
}

/** ヒートマップのグリッド解像度(m) */
const GRID_RESOLUTION = 0.3;

/** エアコンの有効冷却半径(m) */
const AC_EFFECTIVE_RADIUS = 5.0;

/** 基準室温(°C) — エアコンなしの場合 */
const BASE_TEMPERATURE = 32.0;

/** エアコン吹出口の温度(°C) */
const AC_OUTPUT_TEMPERATURE = 18.0;

/** 快適温度範囲 */
const COMFORT_MIN = 22.0;
const COMFORT_MAX = 26.0;

/**
 * 温度値に対応するカラーを返す
 * 青(冷) → 緑(快適) → 黄(やや暖) → 赤(暑)
 */
function temperatureToColor(temp: number): THREE.Color {
  // 18-32°Cの範囲を0-1に正規化
  const t = Math.max(0, Math.min(1, (temp - AC_OUTPUT_TEMPERATURE) / (BASE_TEMPERATURE - AC_OUTPUT_TEMPERATURE)));

  if (t < 0.3) {
    // 冷(青) → 快適(緑)
    const s = t / 0.3;
    return new THREE.Color().setRGB(0, s, 1 - s * 0.7);
  } else if (t < 0.55) {
    // 快適(緑)
    const s = (t - 0.3) / 0.25;
    return new THREE.Color().setRGB(s * 0.3, 0.8 + s * 0.2, 0.3 - s * 0.3);
  } else if (t < 0.75) {
    // やや暖(黄)
    const s = (t - 0.55) / 0.2;
    return new THREE.Color().setRGB(0.8 + s * 0.2, 1.0 - s * 0.3, 0);
  } else {
    // 暑(赤)
    const s = (t - 0.75) / 0.25;
    return new THREE.Color().setRGB(1, 0.7 - s * 0.7, 0);
  }
}

/**
 * 2点間に壁が存在するかチェック（簡易レイキャスト）
 */
function isBlockedByWall(
  x1: number, z1: number,
  x2: number, z2: number,
  walls: WallSegment[]
): boolean {
  for (const wall of walls) {
    // 線分交差判定
    if (segmentsIntersect(
      x1, z1, x2, z2,
      wall.start.x, wall.start.y, wall.end.x, wall.end.y
    )) {
      return true;
    }
  }
  return false;
}

/**
 * 2線分の交差判定
 */
function segmentsIntersect(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): boolean {
  const d1x = ax2 - ax1, d1y = ay2 - ay1;
  const d2x = bx2 - bx1, d2y = by2 - by1;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;

  const dx = bx1 - ax1, dy = by1 - ay1;
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;

  // 両端は除外（壁端点の誤検出を防ぐ）
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

/**
 * 家具による気流遮蔽チェック（簡易AABB判定）
 */
function isBlockedByFurniture(
  x1: number, z1: number,
  x2: number, z2: number,
  furniture: FurnitureItem[]
): boolean {
  for (const item of furniture) {
    // 壁掛け・天井アイテムは気流を遮らない
    if (item.type === 'pendant_light' || item.type === 'ceiling_fan' ||
        item.type === 'clock' || item.type === 'curtain' ||
        item.type === 'air_conditioner' || item.type === 'mirror') continue;

    // 家具が低い場合は気流を遮りにくい（高さ0.5m未満はスキップ）
    if (item.scale[1] < 0.5) continue;

    const fx = item.position[0];
    const fz = item.position[2];
    const hw = item.scale[0] / 2;
    const hd = item.scale[2] / 2;

    // 線分がAABBと交差するか簡易チェック
    const minX = fx - hw, maxX = fx + hw;
    const minZ = fz - hd, maxZ = fz + hd;

    // パラメトリック交差判定
    const dx = x2 - x1, dz = z2 - z1;
    let tMin = 0, tMax = 1;

    if (Math.abs(dx) > 1e-10) {
      let t1 = (minX - x1) / dx;
      let t2 = (maxX - x1) / dx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    } else if (x1 < minX || x1 > maxX) {
      continue;
    }

    if (Math.abs(dz) > 1e-10) {
      let t1 = (minZ - z1) / dz;
      let t2 = (maxZ - z1) / dz;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) continue;
    } else if (z1 < minZ || z1 > maxZ) {
      continue;
    }

    if (tMin <= tMax && tMax > 0.01 && tMin < 0.99) {
      return true;
    }
  }
  return false;
}

interface GridCell {
  x: number;
  z: number;
  temperature: number;
  color: THREE.Color;
}

interface ACUnit {
  x: number;
  z: number;
  index: number;
}

/**
 * 温度シミュレーション実行
 */
function computeTemperatureGrid(
  walls: WallSegment[],
  furniture: FurnitureItem[]
): { cells: GridCell[]; acUnits: ACUnit[]; bounds: { minX: number; minZ: number; maxX: number; maxZ: number } } {
  // バウンディングボックス
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    minZ = Math.min(minZ, w.start.y, w.end.y);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    maxZ = Math.max(maxZ, w.start.y, w.end.y);
  }

  if (!isFinite(minX)) {
    return { cells: [], acUnits: [], bounds: { minX: 0, minZ: 0, maxX: 0, maxZ: 0 } };
  }

  // エアコンの位置を抽出
  const acUnits: ACUnit[] = [];
  let acIdx = 0;
  for (const item of furniture) {
    if (item.type === 'air_conditioner') {
      acUnits.push({
        x: item.position[0],
        z: item.position[2],
        index: acIdx++,
      });
    }
  }

  // グリッドセルの温度を算出
  const cells: GridCell[] = [];
  const cols = Math.ceil((maxX - minX) / GRID_RESOLUTION);
  const rows = Math.ceil((maxZ - minZ) / GRID_RESOLUTION);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = minX + (c + 0.5) * GRID_RESOLUTION;
      const cz = minZ + (r + 0.5) * GRID_RESOLUTION;

      let temperature = BASE_TEMPERATURE;

      if (acUnits.length > 0) {
        // 各エアコンからの冷却効果を距離に応じて合算
        let totalCooling = 0;

        for (const ac of acUnits) {
          const dist = Math.sqrt((cx - ac.x) ** 2 + (cz - ac.z) ** 2);
          if (dist > AC_EFFECTIVE_RADIUS) continue;

          // 壁による遮蔽チェック
          const wallBlocked = isBlockedByWall(cx, cz, ac.x, ac.z, walls);
          // 家具による部分遮蔽
          const furnitureBlocked = isBlockedByFurniture(cx, cz, ac.x, ac.z, furniture);

          // 距離による減衰（逆二乗則をソフトに）
          let attenuation = 1.0 - (dist / AC_EFFECTIVE_RADIUS);
          attenuation = attenuation * attenuation; // 二次減衰

          // 遮蔽による減衰
          if (wallBlocked) attenuation *= 0.1;   // 壁越しはほぼ効かない
          if (furnitureBlocked) attenuation *= 0.6; // 家具越しは6割

          totalCooling += attenuation * (BASE_TEMPERATURE - AC_OUTPUT_TEMPERATURE);
        }

        temperature = BASE_TEMPERATURE - totalCooling;
        temperature = Math.max(AC_OUTPUT_TEMPERATURE, Math.min(BASE_TEMPERATURE, temperature));
      }

      cells.push({
        x: cx,
        z: cz,
        temperature,
        color: temperatureToColor(temperature),
      });
    }
  }

  return { cells, acUnits, bounds: { minX, minZ, maxX, maxZ } };
}

/**
 * ヒートマップグリッド描画（InstancedMeshで高速描画）
 */
const HeatmapGrid = React.memo(function HeatmapGrid({
  cells,
}: {
  cells: GridCell[];
}) {
  const { mesh, geometry, material } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(GRID_RESOLUTION * 0.95, GRID_RESOLUTION * 0.95);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      vertexColors: false,
    });

    // InstancedMeshを使用
    const instancedMesh = new THREE.InstancedMesh(geo, mat, cells.length);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    // 床面に水平に配置（X-Z平面）
    const rotationMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      matrix.identity();
      matrix.multiply(rotationMatrix);
      matrix.setPosition(cell.x, 0.02, cell.z);

      // 位置のみ変更（回転はジオメトリで対応）
      const posMatrix = new THREE.Matrix4().makeTranslation(cell.x, 0.02, cell.z);
      const finalMatrix = posMatrix.multiply(rotationMatrix);
      instancedMesh.setMatrixAt(i, finalMatrix);

      color.copy(cell.color);
      instancedMesh.setColorAt(i, color);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    // vertexColorsを有効にするためマテリアルを更新
    mat.vertexColors = false;

    return { mesh: instancedMesh, geometry: geo, material: mat };
  }, [cells]);

  // InstancedMeshはプリミティブとして直接描画
  return <primitive object={mesh} />;
});

/**
 * エアコンカバレッジ円の描画
 */
const ACCoverageCircles = React.memo(function ACCoverageCircles({
  acUnits,
}: {
  acUnits: ACUnit[];
}) {
  const circleGeometry = useMemo(
    () => new THREE.RingGeometry(AC_EFFECTIVE_RADIUS - 0.05, AC_EFFECTIVE_RADIUS, 64),
    []
  );

  return (
    <group>
      {acUnits.map((ac) => (
        <mesh
          key={`ac-circle-${ac.index}`}
          geometry={circleGeometry}
          position={[ac.x, 0.03, ac.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshBasicMaterial
            color="#3b82f6"
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
});

/**
 * 温度ラベル（主要ポイントに表示）
 */
const TemperatureLabels = React.memo(function TemperatureLabels({
  cells,
  acUnits,
  bounds,
}: {
  cells: GridCell[];
  acUnits: ACUnit[];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}) {
  // 代表ポイントを選定（エアコン付近、中央、四隅）
  const labelPoints = useMemo(() => {
    if (cells.length === 0) return [];

    const points: { x: number; z: number; temp: number; label: string }[] = [];
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;

    // 中央
    const centerCell = cells.reduce((best, cell) => {
      const d1 = Math.abs(cell.x - cx) + Math.abs(cell.z - cz);
      const d2 = Math.abs(best.x - cx) + Math.abs(best.z - cz);
      return d1 < d2 ? cell : best;
    });
    points.push({ x: centerCell.x, z: centerCell.z, temp: centerCell.temperature, label: '中央' });

    // エアコン付近
    for (const ac of acUnits) {
      const nearAC = cells.reduce((best, cell) => {
        const d1 = Math.sqrt((cell.x - ac.x) ** 2 + (cell.z - ac.z) ** 2);
        const d2 = Math.sqrt((best.x - ac.x) ** 2 + (best.z - ac.z) ** 2);
        return d1 < d2 ? cell : best;
      });
      points.push({ x: nearAC.x, z: nearAC.z, temp: nearAC.temperature, label: `AC${ac.index + 1}付近` });
    }

    // 最高温度ポイント
    const hottest = cells.reduce((best, cell) =>
      cell.temperature > best.temperature ? cell : best
    );
    if (hottest.temperature > COMFORT_MAX) {
      points.push({ x: hottest.x, z: hottest.z, temp: hottest.temperature, label: '最高温' });
    }

    // 最低温度ポイント
    const coolest = cells.reduce((best, cell) =>
      cell.temperature < best.temperature ? cell : best
    );
    points.push({ x: coolest.x, z: coolest.z, temp: coolest.temperature, label: '最低温' });

    return points;
  }, [cells, acUnits, bounds]);

  return (
    <group>
      {labelPoints.map((pt, i) => (
        <Html
          key={`temp-label-${i}`}
          position={[pt.x, 0.3, pt.z]}
          center
          distanceFactor={5}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: pt.temp > COMFORT_MAX
                ? 'rgba(239,68,68,0.9)'
                : pt.temp < COMFORT_MIN
                ? 'rgba(59,130,246,0.9)'
                : 'rgba(34,197,94,0.9)',
              color: '#fff',
              fontSize: 9,
              padding: '2px 5px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            <div style={{ fontWeight: 'bold' }}>{pt.temp.toFixed(1)}°C</div>
            <div style={{ fontSize: 7, opacity: 0.8 }}>{pt.label}</div>
          </div>
        </Html>
      ))}
    </group>
  );
});

/**
 * HVAC情報サマリー
 */
const HVACSummary = React.memo(function HVACSummary({
  acCount,
  avgTemp,
  minTemp,
  maxTemp,
  comfortRatio,
  position,
}: {
  acCount: number;
  avgTemp: number;
  minTemp: number;
  maxTemp: number;
  /** 快適温度範囲内のセル割合(0-1) */
  comfortRatio: number;
  position: [number, number, number];
}) {
  return (
    <Html
      position={position}
      center
      distanceFactor={10}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          fontSize: 11,
          padding: '8px 12px',
          borderRadius: 6,
          minWidth: 170,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 4 }}>
          空調効率分析
        </div>
        <div>エアコン台数: {acCount}</div>
        <div>平均温度: {avgTemp.toFixed(1)}°C</div>
        <div>温度範囲: {minTemp.toFixed(1)} - {maxTemp.toFixed(1)}°C</div>
        <div>
          快適率:{' '}
          <span style={{
            color: comfortRatio >= 0.7 ? '#22c55e' : comfortRatio >= 0.4 ? '#eab308' : '#ef4444',
            fontWeight: 'bold',
          }}>
            {(comfortRatio * 100).toFixed(0)}%
          </span>
        </div>
        {acCount === 0 && (
          <div style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>
            エアコン未設置
          </div>
        )}
      </div>
    </Html>
  );
});

/**
 * 空調効率ヒートマップ可視化コンポーネント
 */
export const HVACVisualization = React.memo(function HVACVisualization({
  walls,
  furniture,
  roomHeight,
  enabled,
}: HVACVisualizationProps) {
  if (!enabled) return null;

  const { cells, acUnits, bounds } = useMemo(
    () => computeTemperatureGrid(walls, furniture),
    [walls, furniture]
  );

  // 統計情報を算出
  const stats = useMemo(() => {
    if (cells.length === 0) {
      return { avgTemp: BASE_TEMPERATURE, minTemp: BASE_TEMPERATURE, maxTemp: BASE_TEMPERATURE, comfortRatio: 0 };
    }
    let sum = 0, min = Infinity, max = -Infinity, comfortCount = 0;
    for (const cell of cells) {
      sum += cell.temperature;
      if (cell.temperature < min) min = cell.temperature;
      if (cell.temperature > max) max = cell.temperature;
      if (cell.temperature >= COMFORT_MIN && cell.temperature <= COMFORT_MAX) comfortCount++;
    }
    return {
      avgTemp: sum / cells.length,
      minTemp: min,
      maxTemp: max,
      comfortRatio: comfortCount / cells.length,
    };
  }, [cells]);

  // サマリー位置
  const summaryPosition = useMemo<[number, number, number]>(() => {
    if (walls.length === 0) return [0, roomHeight + 0.5, 0];
    let sumX = 0, sumZ = 0, count = 0;
    for (const w of walls) {
      sumX += w.start.x + w.end.x;
      sumZ += w.start.y + w.end.y;
      count += 2;
    }
    return [sumX / count, roomHeight + 0.5, sumZ / count];
  }, [walls, roomHeight]);

  return (
    <group>
      {/* ヒートマップグリッド */}
      {cells.length > 0 && <HeatmapGrid cells={cells} />}

      {/* エアコンカバレッジ円 */}
      <ACCoverageCircles acUnits={acUnits} />

      {/* 温度ラベル */}
      <TemperatureLabels cells={cells} acUnits={acUnits} bounds={bounds} />

      {/* サマリー */}
      <HVACSummary
        acCount={acUnits.length}
        avgTemp={stats.avgTemp}
        minTemp={stats.minTemp}
        maxTemp={stats.maxTemp}
        comfortRatio={stats.comfortRatio}
        position={summaryPosition}
      />
    </group>
  );
});
