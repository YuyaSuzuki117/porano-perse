'use client';

// 電気配線・コンセント・スイッチ可視化オーバーレイ
// 家具の電力需要に基づいてコンセントを自動配置し、ドア付近にスイッチを配置

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem, FurnitureType } from '@/types/scene';

interface ElectricalOverlayProps {
  walls: WallSegment[];
  furniture: FurnitureItem[];
  roomHeight: number;
  enabled: boolean;
}

/** コンセント情報 */
interface OutletPlacement {
  position: THREE.Vector3;
  /** 壁に垂直な方向（室内側を向くノーマル） */
  normal: THREE.Vector3;
  /** 配置理由 */
  reason: string;
}

/** スイッチ情報 */
interface SwitchPlacement {
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

/** 配線経路の端点ペア */
interface WiringRun {
  from: THREE.Vector3;
  to: THREE.Vector3;
}

/** 電力が必要な家具タイプとその理由 */
const POWER_REQUIRING_FURNITURE: Partial<Record<FurnitureType, string>> = {
  fridge: '冷蔵庫用',
  air_conditioner: 'エアコン用',
  desk: 'PC/デスク用',
  register: 'レジカウンター用',
  cash_register: 'レジ用',
  tv_monitor: 'TV/モニター用',
  washing_machine: '洗濯機用',
};

/** コンセントの床からの高さ(m) */
const OUTLET_HEIGHT = 0.3;

/** スイッチの床からの高さ(m) */
const SWITCH_HEIGHT = 1.2;

/** 壁沿い自動配置の間隔(m) */
const AUTO_OUTLET_INTERVAL = 3.0;

/** コンセント面のジオメトリ（壁面に張り付く小さな長方形） */
const outletGeometry = new THREE.PlaneGeometry(0.07, 0.1);

/** スイッチ面のジオメトリ */
const switchGeometry = new THREE.PlaneGeometry(0.06, 0.08);

/** コンセントスロットのジオメトリ */
const slotGeometry = new THREE.PlaneGeometry(0.008, 0.025);

/**
 * 壁の室内側法線を算出
 * 全壁の中心点を基準に、壁から中心方向を向く法線を返す
 */
function computeWallNormal(wall: WallSegment, walls: WallSegment[]): THREE.Vector3 {
  // 壁の方向ベクトル
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return new THREE.Vector3(0, 0, 1);

  // 法線候補（2方向）
  const n1 = new THREE.Vector3(-dy / len, 0, dx / len);
  const n2 = new THREE.Vector3(dy / len, 0, -dx / len);

  // 全壁の中心点を算出
  let cx = 0, cz = 0, count = 0;
  for (const w of walls) {
    cx += w.start.x + w.end.x;
    cz += w.start.y + w.end.y;
    count += 2;
  }
  cx /= count;
  cz /= count;

  // 壁の中点
  const mx = (wall.start.x + wall.end.x) / 2;
  const mz = (wall.start.y + wall.end.y) / 2;

  // 中心方向に近い法線を選択（室内側）
  const toCenter = new THREE.Vector3(cx - mx, 0, cz - mz);
  return toCenter.dot(n1) > 0 ? n1 : n2;
}

/**
 * 壁上の指定位置に沿った3D座標を取得
 */
function getWallPoint(wall: WallSegment, t: number, height: number, normal: THREE.Vector3, offset: number = 0.01): THREE.Vector3 {
  const x = wall.start.x + (wall.end.x - wall.start.x) * t;
  const z = wall.start.y + (wall.end.y - wall.start.y) * t;
  // 壁面から少しオフセット（めり込み防止）
  return new THREE.Vector3(
    x + normal.x * offset,
    height,
    z + normal.z * offset
  );
}

/**
 * 壁の長さを算出
 */
function wallLength(wall: WallSegment): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 家具の2D位置から最寄りの壁と壁上のt値を取得
 */
function findNearestWallPoint(
  furnitureX: number,
  furnitureZ: number,
  walls: WallSegment[]
): { wall: WallSegment; t: number; distance: number } | null {
  let best: { wall: WallSegment; t: number; distance: number } | null = null;

  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 0.001) continue;

    // 壁上の最近傍点のパラメータt
    let t = ((furnitureX - wall.start.x) * dx + (furnitureZ - wall.start.y) * dy) / len2;
    t = Math.max(0.05, Math.min(0.95, t)); // 壁端から少し内側

    const px = wall.start.x + dx * t;
    const py = wall.start.y + dy * t;
    const dist = Math.sqrt((furnitureX - px) ** 2 + (furnitureZ - py) ** 2);

    if (!best || dist < best.distance) {
      best = { wall, t, distance: dist };
    }
  }

  return best;
}

/**
 * 開口部（ドア）付近の壁上位置を取得
 */
function findDoorPositions(
  walls: WallSegment[],
  openings: Opening[]
): { wall: WallSegment; t: number }[] {
  const positions: { wall: WallSegment; t: number }[] = [];
  for (const op of openings) {
    if (op.type !== 'door') continue;
    const wall = walls.find((w) => w.id === op.wallId);
    if (!wall) continue;
    const len = wallLength(wall);
    if (len < 0.001) continue;
    // ドアの横（開口部の手前側）にスイッチを配置
    const switchOffset = 0.15; // ドア端から15cm
    const t = (op.positionAlongWall - switchOffset) / len;
    if (t >= 0.02 && t <= 0.98) {
      positions.push({ wall, t });
    }
  }
  return positions;
}

/**
 * コンセントとスイッチの自動配置を計算
 */
function computePlacements(
  walls: WallSegment[],
  furniture: FurnitureItem[],
  openings: Opening[]
): {
  outlets: OutletPlacement[];
  switches: SwitchPlacement[];
  wiring: WiringRun[];
  circuitEstimate: number;
} {
  const outlets: OutletPlacement[] = [];
  const switches: SwitchPlacement[] = [];
  const wiring: WiringRun[] = [];

  if (walls.length === 0) {
    return { outlets, switches, wiring, circuitEstimate: 0 };
  }

  // 壁ごとの法線キャッシュ
  const normalCache = new Map<string, THREE.Vector3>();
  for (const wall of walls) {
    normalCache.set(wall.id, computeWallNormal(wall, walls));
  }

  // 1. 電力需要家具の近くにコンセントを配置
  for (const item of furniture) {
    const reason = POWER_REQUIRING_FURNITURE[item.type];
    if (!reason) continue;

    const nearest = findNearestWallPoint(item.position[0], item.position[2], walls);
    if (!nearest) continue;

    const normal = normalCache.get(nearest.wall.id)!;
    // エアコンは高い位置にコンセント
    const height = item.type === 'air_conditioner' ? 1.8 : OUTLET_HEIGHT;
    const pos = getWallPoint(nearest.wall, nearest.t, height, normal);

    outlets.push({ position: pos, normal, reason });

    // 配線経路（壁沿いに引く）
    const wallStart3D = new THREE.Vector3(
      nearest.wall.start.x + normal.x * 0.01,
      0.05,
      nearest.wall.start.y + normal.z * 0.01
    );
    wiring.push({ from: wallStart3D, to: pos });
  }

  // 2. 壁沿いに定間隔でコンセントを自動配置（既存コンセントと重複しない位置）
  for (const wall of walls) {
    const len = wallLength(wall);
    if (len < 1.0) continue; // 短い壁はスキップ

    const normal = normalCache.get(wall.id)!;
    const count = Math.floor(len / AUTO_OUTLET_INTERVAL);
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const pos = getWallPoint(wall, t, OUTLET_HEIGHT, normal);

      // 既存コンセントと0.8m以内に近い場合はスキップ
      const tooClose = outlets.some(
        (o) => o.position.distanceTo(pos) < 0.8
      );
      if (tooClose) continue;

      outlets.push({ position: pos, normal, reason: '標準配置' });

      // 配線経路
      const prevOutlet = outlets[outlets.length - 2];
      if (prevOutlet) {
        wiring.push({ from: prevOutlet.position.clone(), to: pos });
      }
    }
  }

  // 3. ドア付近にスイッチを配置
  const doorPositions = findDoorPositions(walls, openings);
  for (const dp of doorPositions) {
    const normal = normalCache.get(dp.wall.id)!;
    const pos = getWallPoint(dp.wall, dp.t, SWITCH_HEIGHT, normal);
    switches.push({ position: pos, normal });

    // スイッチへの配線
    if (outlets.length > 0) {
      // 最寄りコンセントからスイッチへ配線
      let nearest = outlets[0];
      for (const o of outlets) {
        if (o.position.distanceTo(pos) < nearest.position.distanceTo(pos)) {
          nearest = o;
        }
      }
      wiring.push({ from: nearest.position.clone(), to: pos });
    }
  }

  // 回路数の概算（コンセント6個 + スイッチ2個で1回路）
  const circuitEstimate = Math.max(1, Math.ceil((outlets.length + switches.length / 2) / 6));

  return { outlets, switches, wiring, circuitEstimate };
}

/**
 * コンセントメッシュ（白い長方形 + スロット2つ）
 */
const OutletMesh = React.memo(function OutletMesh({
  placement,
}: {
  placement: OutletPlacement;
}) {
  // 法線方向を向くようにクォータニオンを計算
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      placement.normal
    );
    return q;
  }, [placement.normal]);

  return (
    <group position={placement.position} quaternion={quaternion}>
      {/* コンセント本体（白いプレート） */}
      <mesh geometry={outletGeometry}>
        <meshStandardMaterial color="#f5f5f5" roughness={0.4} />
      </mesh>
      {/* スロット上 */}
      <mesh geometry={slotGeometry} position={[0, 0.018, 0.001]}>
        <meshStandardMaterial color="#333333" />
      </mesh>
      {/* スロット下 */}
      <mesh geometry={slotGeometry} position={[0, -0.018, 0.001]}>
        <meshStandardMaterial color="#333333" />
      </mesh>
    </group>
  );
});

/**
 * スイッチメッシュ（小さな四角形）
 */
const SwitchMesh = React.memo(function SwitchMesh({
  placement,
}: {
  placement: SwitchPlacement;
}) {
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      placement.normal
    );
    return q;
  }, [placement.normal]);

  return (
    <group position={placement.position} quaternion={quaternion}>
      {/* スイッチプレート */}
      <mesh geometry={switchGeometry}>
        <meshStandardMaterial color="#f0f0f0" roughness={0.3} />
      </mesh>
      {/* スイッチボタン */}
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[0.03, 0.04]} />
        <meshStandardMaterial color="#e0e0e0" roughness={0.5} />
      </mesh>
    </group>
  );
});

/** 配線の破線マテリアル */
const wiringMaterial = new THREE.LineDashedMaterial({
  color: 0x3b82f6,
  dashSize: 0.1,
  gapSize: 0.06,
  linewidth: 1,
  transparent: true,
  opacity: 0.5,
});

/**
 * 配線経路の描画
 */
const WiringLines = React.memo(function WiringLines({
  runs,
}: {
  runs: WiringRun[];
}) {
  const geometries = useMemo(() => {
    return runs.map((run) => {
      const geo = new THREE.BufferGeometry().setFromPoints([run.from, run.to]);
      geo.computeBoundingSphere();
      return geo;
    });
  }, [runs]);

  return (
    <group>
      {geometries.map((geo, i) => (
        <lineSegments key={`wire-${i}`} geometry={geo} material={wiringMaterial} />
      ))}
    </group>
  );
});

/**
 * 電気設備情報サマリー
 */
const ElectricalSummary = React.memo(function ElectricalSummary({
  outletCount,
  switchCount,
  circuitEstimate,
  position,
}: {
  outletCount: number;
  switchCount: number;
  circuitEstimate: number;
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
          minWidth: 150,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 4 }}>
          電気設備概要
        </div>
        <div>コンセント: {outletCount}口</div>
        <div>スイッチ: {switchCount}個</div>
        <div>推定回路数: {circuitEstimate}回路</div>
      </div>
    </Html>
  );
});

/**
 * 電気配線・コンセント・スイッチオーバーレイ
 */
export const ElectricalOverlay = React.memo(function ElectricalOverlay({
  walls,
  furniture,
  roomHeight,
  enabled,
}: ElectricalOverlayProps) {
  if (!enabled) return null;

  // openingsは壁データからドア位置を推定するために使用
  // ElectricalOverlayのpropsにopeningsがないため、壁端点のみから推定
  // → ドア位置はwallsの接続点から推定（簡易版）
  const openings: Opening[] = useMemo(() => {
    // 壁端が他の壁端と離れている箇所をドアとみなす簡易推定
    const ops: Opening[] = [];
    for (const wall of walls) {
      const len = wallLength(wall);
      if (len < 0.8) continue;
      // 壁の各端点が他の壁と接続しているか確認
      for (const endpoint of [wall.start, wall.end]) {
        let connected = false;
        for (const other of walls) {
          if (other.id === wall.id) continue;
          for (const otherEnd of [other.start, other.end]) {
            const dist = Math.sqrt(
              (endpoint.x - otherEnd.x) ** 2 + (endpoint.y - otherEnd.y) ** 2
            );
            if (dist < 0.15) {
              connected = true;
              break;
            }
          }
          if (connected) break;
        }
        // 未接続端点の付近にドアがあると推定
        if (!connected) {
          const t = endpoint === wall.start ? 0 : wallLength(wall);
          ops.push({
            id: `auto-door-${wall.id}-${t}`,
            wallId: wall.id,
            type: 'door',
            positionAlongWall: Math.max(0, t - 0.45),
            width: 0.9,
            height: 2.0,
            elevation: 0,
          });
        }
      }
    }
    return ops;
  }, [walls]);

  const { outlets, switches, wiring, circuitEstimate } = useMemo(
    () => computePlacements(walls, furniture, openings),
    [walls, furniture, openings]
  );

  // サマリー表示位置
  const summaryPosition = useMemo<[number, number, number]>(() => {
    if (walls.length === 0) return [0, roomHeight + 0.3, 0];
    let sumX = 0, sumZ = 0, count = 0;
    for (const w of walls) {
      sumX += w.start.x + w.end.x;
      sumZ += w.start.y + w.end.y;
      count += 2;
    }
    return [sumX / count, roomHeight + 0.3, sumZ / count];
  }, [walls, roomHeight]);

  return (
    <group>
      {/* コンセント */}
      {outlets.map((o, i) => (
        <OutletMesh key={`outlet-${i}`} placement={o} />
      ))}

      {/* スイッチ */}
      {switches.map((s, i) => (
        <SwitchMesh key={`switch-${i}`} placement={s} />
      ))}

      {/* 配線経路 */}
      <WiringLines runs={wiring} />

      {/* コンセントラベル（ホバー用は省略、数が多いため） */}
      {outlets.slice(0, 8).map((o, i) => (
        <Html
          key={`outlet-label-${i}`}
          position={[o.position.x, o.position.y + 0.08, o.position.z]}
          center
          distanceFactor={4}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(59,130,246,0.85)',
            color: '#fff',
            fontSize: 8,
            padding: '1px 4px',
            borderRadius: 2,
            whiteSpace: 'nowrap',
          }}>
            {o.reason}
          </div>
        </Html>
      ))}

      {/* サマリー */}
      <ElectricalSummary
        outletCount={outlets.length}
        switchCount={switches.length}
        circuitEstimate={circuitEstimate}
        position={summaryPosition}
      />
    </group>
  );
});
