'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import { WallSegment, Opening, RoomLabel } from '@/types/floor-plan';
import { computeFloorArea } from '@/lib/geometry';

interface RoomDimensionLabelProps {
  walls: WallSegment[];
  openings?: Opening[];
  roomLabels?: RoomLabel[];
  roomHeight?: number;
}

/** ラベルの共通スタイル */
const labelStyle = {
  background: 'rgba(0,0,0,0.7)',
  color: 'white',
  padding: '2px 6px',
  borderRadius: '3px',
  fontSize: '10px',
  fontWeight: 600,
  fontFamily: 'monospace',
  whiteSpace: 'nowrap' as const,
  lineHeight: '1.3',
  textAlign: 'center' as const,
};

const openingLabelStyle = {
  background: 'rgba(234,88,12,0.85)',
  color: 'white',
  padding: '2px 5px',
  borderRadius: '3px',
  fontSize: '9px',
  fontWeight: 600,
  fontFamily: 'monospace',
  whiteSpace: 'nowrap' as const,
  lineHeight: '1.2',
  textAlign: 'center' as const,
};

const offsetLabelStyle = {
  background: 'rgba(99,102,241,0.8)',
  color: 'white',
  padding: '1px 4px',
  borderRadius: '2px',
  fontSize: '8px',
  fontWeight: 500,
  fontFamily: 'monospace',
  whiteSpace: 'nowrap' as const,
  lineHeight: '1.2',
  textAlign: 'center' as const,
};

interface OpeningDimInfo {
  id: string;
  type: 'door' | 'window';
  width: number;
  height: number;
  positionAlongWall: number;
  /** 3D position for the width label (above/below opening on the wall) */
  widthLabelPos: [number, number, number];
  /** 3D position for the offset label (distance from wall start) */
  offsetLabelPos: [number, number, number];
  /** 3D line start for offset dimension line */
  offsetLineStart: [number, number, number];
  /** 3D line end for offset dimension line */
  offsetLineEnd: [number, number, number];
  /** 3D line start for width dimension line */
  widthLineStart: [number, number, number];
  /** 3D line end for width dimension line */
  widthLineEnd: [number, number, number];
}

export function RoomDimensionLabel({ walls, openings = [], roomLabels = [], roomHeight = 2.4 }: RoomDimensionLabelProps) {
  const info = useMemo(() => {
    if (walls.length === 0) return null;
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = maxX - minX;
    const d = maxY - minY;
    const area = computeFloorArea(walls);
    return {
      cx: (minX + maxX) / 2,
      cz: (minY + maxY) / 2,
      w,
      d,
      area,
      // 寸法線の位置
      widthLabelZ: maxY + 0.5,
      depthLabelX: maxX + 0.5,
    };
  }, [walls]);

  // 各壁の個別寸法（壁の上に表示）
  const wallDimensions = useMemo(() => {
    return walls.map((wall) => {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const midX = (wall.start.x + wall.end.x) / 2;
      const midZ = (wall.start.y + wall.end.y) / 2;
      // 壁の上面（roomHeight）にラベルを配置
      const wallTopY = roomHeight + 0.1;
      return {
        id: wall.id,
        length,
        labelPos: [midX, wallTopY, midZ] as [number, number, number],
        start: [wall.start.x, wallTopY, wall.start.y] as [number, number, number],
        end: [wall.end.x, wallTopY, wall.end.y] as [number, number, number],
      };
    });
  }, [walls, roomHeight]);

  // 各開口部の寸法情報を計算
  const openingDimensions = useMemo(() => {
    if (openings.length === 0) return [];

    const wallMap = new Map<string, WallSegment>();
    for (const w of walls) wallMap.set(w.id, w);

    const dims: OpeningDimInfo[] = [];

    for (const op of openings) {
      const wall = wallMap.get(op.wallId);
      if (!wall) continue;

      const wDx = wall.end.x - wall.start.x;
      const wDy = wall.end.y - wall.start.y;
      const wallLen = Math.sqrt(wDx * wDx + wDy * wDy);
      if (wallLen < 0.01) continue;

      // 壁方向の単位ベクトル
      const dirX = wDx / wallLen;
      const dirZ = wDy / wallLen;
      // 法線方向（外向き）
      const normX = -dirZ;
      const normZ = dirX;

      // 開口部の壁始点からの距離（positionAlongWall）
      const opStart = op.positionAlongWall;
      const opEnd = opStart + op.width;
      const opMid = opStart + op.width / 2;

      // 開口部中心の3D位置（壁に沿った方向）
      const midWorldX = wall.start.x + dirX * opMid;
      const midWorldZ = wall.start.y + dirZ * opMid;

      // 開口部始点の3D位置
      const startWorldX = wall.start.x + dirX * opStart;
      const startWorldZ = wall.start.y + dirZ * opStart;

      // 開口部終点の3D位置
      const endWorldX = wall.start.x + dirX * opEnd;
      const endWorldZ = wall.start.y + dirZ * opEnd;

      // 壁始点の3D位置
      const wallStartX = wall.start.x;
      const wallStartZ = wall.start.y;

      // 法線方向オフセット（壁の外側にラベルを配置）
      const normalOffset = 0.45;
      const offsetDimNormalOffset = 0.55;

      // 開口部の高さに応じたY位置
      const labelY = op.type === 'window'
        ? op.elevation + op.height + 0.15
        : op.height + 0.15;

      // 幅ラベル位置（開口部の上方・法線方向にオフセット）
      const widthLabelPos: [number, number, number] = [
        midWorldX + normX * normalOffset,
        labelY,
        midWorldZ + normZ * normalOffset,
      ];

      // 幅寸法線
      const widthLineStart: [number, number, number] = [
        startWorldX + normX * normalOffset,
        labelY,
        startWorldZ + normZ * normalOffset,
      ];
      const widthLineEnd: [number, number, number] = [
        endWorldX + normX * normalOffset,
        labelY,
        endWorldZ + normZ * normalOffset,
      ];

      // オフセット（壁始点からの距離）ラベル
      const offsetMidX = (wallStartX + startWorldX) / 2;
      const offsetMidZ = (wallStartZ + startWorldZ) / 2;
      const offsetLabelPos: [number, number, number] = [
        offsetMidX + normX * offsetDimNormalOffset,
        0.02,
        offsetMidZ + normZ * offsetDimNormalOffset,
      ];
      const offsetLineStart: [number, number, number] = [
        wallStartX + normX * offsetDimNormalOffset,
        0.02,
        wallStartZ + normZ * offsetDimNormalOffset,
      ];
      const offsetLineEnd: [number, number, number] = [
        startWorldX + normX * offsetDimNormalOffset,
        0.02,
        startWorldZ + normZ * offsetDimNormalOffset,
      ];

      dims.push({
        id: op.id,
        type: op.type,
        width: op.width,
        height: op.height,
        positionAlongWall: op.positionAlongWall,
        widthLabelPos,
        offsetLabelPos,
        offsetLineStart,
        offsetLineEnd,
        widthLineStart,
        widthLineEnd,
      });
    }

    return dims;
  }, [walls, openings]);

  if (!info) return null;

  return (
    <group>
      {/* 幅寸法線（矢印付き） */}
      <DimensionLine
        start={[info.cx - info.w / 2, 0.02, info.widthLabelZ]}
        end={[info.cx + info.w / 2, 0.02, info.widthLabelZ]}
        label={`${info.w.toFixed(2)}m`}
        subLabel={`${Math.round(info.w * 1000)}mm`}
      />
      {/* 奥行寸法線（矢印付き） */}
      <DimensionLine
        start={[info.depthLabelX, 0.02, info.cz - info.d / 2]}
        end={[info.depthLabelX, 0.02, info.cz + info.d / 2]}
        label={`${info.d.toFixed(2)}m`}
        subLabel={`${Math.round(info.d * 1000)}mm`}
      />
      {/* 各壁の個別寸法 */}
      {wallDimensions.map((wd) => (
        <WallDimensionLabel
          key={wd.id}
          start={wd.start}
          end={wd.end}
          labelPos={wd.labelPos}
          length={wd.length}
        />
      ))}
      {/* 各開口部の寸法 */}
      {openingDimensions.map((od) => (
        <OpeningDimensionLabel key={od.id} info={od} />
      ))}
      {/* 面積ラベル（大きく表示） */}
      <Html
        position={[info.cx, 0.05, info.cz]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          background: 'rgba(59,130,246,0.9)',
          color: 'white',
          padding: '6px 14px',
          borderRadius: '6px',
          fontSize: '16px',
          fontWeight: 700,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          textAlign: 'center',
          lineHeight: '1.4',
        }}>
          <div>{info.area.toFixed(2)} m²</div>
          <div style={{
            fontSize: '11px',
            fontWeight: 500,
            opacity: 0.85,
          }}>
            ({(info.area / 3.306).toFixed(1)} 坪)
          </div>
        </div>
      </Html>
      {/* ルームラベル（3D表示） */}
      {roomLabels.map((label) => (
        label.name.trim() && (
          <Html
            key={label.id}
            position={[label.position.x, 0.08, label.position.y]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              background: 'rgba(55, 65, 81, 0.85)',
              color: 'white',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: '"Inter", "Segoe UI", sans-serif',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              textAlign: 'center',
            }}>
              {label.name}
            </div>
          </Html>
        )
      ))}
    </group>
  );
}

/** 開口部の寸法ラベル（幅・高さ・壁始点からの距離） */
function OpeningDimensionLabel({ info }: { info: OpeningDimInfo }) {
  const { type, width, height, positionAlongWall } = info;
  const icon = type === 'door' ? 'D' : 'W';

  return (
    <group>
      {/* 開口部幅の寸法線 */}
      <Line
        points={[info.widthLineStart, info.widthLineEnd]}
        color="#EA580C"
        lineWidth={1.5}
      />
      {/* 幅ラベル（W x H 表示） */}
      <Html position={info.widthLabelPos} center style={{ pointerEvents: 'none' }}>
        <div style={openingLabelStyle}>
          <div>{icon} {width.toFixed(2)}m x {height.toFixed(2)}m</div>
        </div>
      </Html>

      {/* 壁始点からの距離（オフセット）が0.05m以上の場合のみ表示 */}
      {positionAlongWall >= 0.05 && (
        <>
          <Line
            points={[info.offsetLineStart, info.offsetLineEnd]}
            color="#6366F1"
            lineWidth={1}
            dashed
            dashSize={0.06}
            gapSize={0.04}
          />
          <Html position={info.offsetLabelPos} center style={{ pointerEvents: 'none' }}>
            <div style={offsetLabelStyle}>
              <div>{positionAlongWall.toFixed(2)}m</div>
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

function WallDimensionLabel({
  start,
  end,
  labelPos,
  length,
}: {
  start: [number, number, number];
  end: [number, number, number];
  labelPos: [number, number, number];
  length: number;
}) {
  if (length < 0.1) return null;

  return (
    <group>
      {/* 寸法補助線 */}
      <Line
        points={[start, end]}
        color="#94A3B8"
        lineWidth={1}
        dashed
        dashSize={0.1}
        gapSize={0.05}
      />
      {/* ラベル */}
      <Html position={labelPos} center style={{ pointerEvents: 'none' }}>
        <div style={labelStyle}>
          <div>{length.toFixed(2)}m</div>
          <div style={{ fontSize: '8px', opacity: 0.8 }}>{Math.round(length * 1000)}mm</div>
        </div>
      </Html>
    </group>
  );
}

function DimensionLine({
  start,
  end,
  label,
  subLabel,
}: {
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  subLabel?: string;
}) {
  const midpoint: [number, number, number] = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];

  // 矢印の端点を計算
  const dir = new THREE.Vector3(
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2]
  ).normalize();
  const arrowLen = 0.15;

  // 矢印ヘッドの角度（30度）
  const perpY = new THREE.Vector3(0, 1, 0);
  const arrowDir1 = dir.clone().applyAxisAngle(perpY, Math.PI * 0.85).multiplyScalar(arrowLen);
  const arrowDir2 = dir.clone().applyAxisAngle(perpY, -Math.PI * 0.85).multiplyScalar(arrowLen);

  const startArrow1: [number, number, number] = [
    start[0] + arrowDir1.x, start[1] + arrowDir1.y, start[2] + arrowDir1.z,
  ];
  const startArrow2: [number, number, number] = [
    start[0] + arrowDir2.x, start[1] + arrowDir2.y, start[2] + arrowDir2.z,
  ];

  const negDir = dir.clone().negate();
  const endArrowDir1 = negDir.clone().applyAxisAngle(perpY, Math.PI * 0.85).multiplyScalar(arrowLen);
  const endArrowDir2 = negDir.clone().applyAxisAngle(perpY, -Math.PI * 0.85).multiplyScalar(arrowLen);
  const endArrow1: [number, number, number] = [
    end[0] + endArrowDir1.x, end[1] + endArrowDir1.y, end[2] + endArrowDir1.z,
  ];
  const endArrow2: [number, number, number] = [
    end[0] + endArrowDir2.x, end[1] + endArrowDir2.y, end[2] + endArrowDir2.z,
  ];

  return (
    <group>
      {/* メインライン */}
      <Line points={[start, end]} color="#333333" lineWidth={1.5} />
      {/* 始点矢印 */}
      <Line points={[startArrow1, start, startArrow2]} color="#333333" lineWidth={1.5} />
      {/* 終点矢印 */}
      <Line points={[endArrow1, end, endArrow2]} color="#333333" lineWidth={1.5} />
      {/* ラベル */}
      <Html position={midpoint} center style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          lineHeight: '1.3',
        }}>
          <div>{label}</div>
          {subLabel && (
            <div style={{ fontSize: '9px', opacity: 0.75 }}>{subLabel}</div>
          )}
        </div>
      </Html>
    </group>
  );
}
