'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { Point2D, WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';
import {
  snapToGrid,
  snapToEndpoints,
  snapAngle,
  wallLength,
  wallAngle,
  distance,
} from '@/lib/geometry';

// --- 定数 ---
const GRID_SIZE_M = 0.5; // グリッド間隔(m)
const PIXELS_PER_METER_BASE = 80; // 基本スケール
const WALL_DEFAULT_COLOR = '#555555';
const WALL_SELECTED_COLOR = '#3B82F6';
const GRID_COLOR = '#E5E7EB';
const GRID_MAJOR_COLOR = '#D1D5DB';
const DIMENSION_FONT = '11px sans-serif';
const DIMENSION_COLOR = '#6B7280';
const SNAP_INDICATOR_COLOR = '#EF4444';
const PREVIEW_WALL_COLOR = 'rgba(59,130,246,0.5)';

interface ViewState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export default function FloorPlanCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ストア
  const walls = useEditorStore((s) => s.walls);
  const openings = useEditorStore((s) => s.openings);
  const furniture = useEditorStore((s) => s.furniture);
  const activeTool = useEditorStore((s) => s.activeTool);
  const selectedWallId = useEditorStore((s) => s.selectedWallId);
  const selectedFurnitureId = useEditorStore((s) => s.selectedFurnitureId);
  const isDrawingWall = useEditorStore((s) => s.isDrawingWall);
  const wallDrawStart = useEditorStore((s) => s.wallDrawStart);
  const addWall = useEditorStore((s) => s.addWall);
  const deleteWall = useEditorStore((s) => s.deleteWall);
  const setSelectedWall = useEditorStore((s) => s.setSelectedWall);
  const setSelectedFurniture = useEditorStore((s) => s.setSelectedFurniture);
  const startDrawingWall = useEditorStore((s) => s.startDrawingWall);
  const finishDrawingWall = useEditorStore((s) => s.finishDrawingWall);
  const addOpening = useEditorStore((s) => s.addOpening);
  const deleteOpening = useEditorStore((s) => s.deleteOpening);
  const deleteFurniture = useEditorStore((s) => s.deleteFurniture);

  // ビュー状態
  const [view, setView] = useState<ViewState>({
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
  });
  const [mouseWorld, setMouseWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const pxPerM = PIXELS_PER_METER_BASE * view.zoom;

  // --- 座標変換 ---
  const worldToScreen = useCallback(
    (p: Point2D): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      return {
        x: canvas.width / 2 + (p.x + view.offsetX) * pxPerM,
        y: canvas.height / 2 + (p.y + view.offsetY) * pxPerM,
      };
    },
    [view.offsetX, view.offsetY, pxPerM]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number): Point2D => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      return {
        x: (sx - canvas.width / 2) / pxPerM - view.offsetX,
        y: (sy - canvas.height / 2) / pxPerM - view.offsetY,
      };
    },
    [view.offsetX, view.offsetY, pxPerM]
  );

  // --- 描画 ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // クリア
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // グリッド描画
    drawGrid(ctx, w, h);

    // 壁描画
    for (const wall of walls) {
      drawWall(ctx, wall, wall.id === selectedWallId);
    }

    // 開口部描画
    for (const op of openings) {
      drawOpening(ctx, op);
    }

    // 家具描画
    for (const f of furniture) {
      drawFurniture(ctx, f, f.id === selectedFurnitureId);
    }

    // 寸法線
    for (const wall of walls) {
      drawDimension(ctx, wall);
    }

    // 壁描画プレビュー
    if (isDrawingWall && wallDrawStart) {
      drawWallPreview(ctx, wallDrawStart, mouseWorld);
    }

    // スナップインジケーター
    if (activeTool === 'wall' || activeTool === 'door' || activeTool === 'window') {
      const snap = snapToEndpoints(mouseWorld, walls, 0.3);
      if (snap.type === 'endpoint') {
        const sp = worldToScreen(snap.point);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = SNAP_INDICATOR_COLOR;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    walls,
    openings,
    furniture,
    selectedWallId,
    selectedFurnitureId,
    isDrawingWall,
    wallDrawStart,
    mouseWorld,
    activeTool,
    view,
    pxPerM,
    worldToScreen,
  ]);

  // グリッド
  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(w, h);

    const startX = Math.floor(topLeft.x / GRID_SIZE_M) * GRID_SIZE_M;
    const startY = Math.floor(topLeft.y / GRID_SIZE_M) * GRID_SIZE_M;
    const endX = Math.ceil(bottomRight.x / GRID_SIZE_M) * GRID_SIZE_M;
    const endY = Math.ceil(bottomRight.y / GRID_SIZE_M) * GRID_SIZE_M;

    ctx.lineWidth = 0.5;

    for (let x = startX; x <= endX; x += GRID_SIZE_M) {
      const isMajor = Math.abs(x % 1) < 0.01;
      ctx.strokeStyle = isMajor ? GRID_MAJOR_COLOR : GRID_COLOR;
      ctx.lineWidth = isMajor ? 1 : 0.5;
      const sp = worldToScreen({ x, y: 0 });
      ctx.beginPath();
      ctx.moveTo(sp.x, 0);
      ctx.lineTo(sp.x, h);
      ctx.stroke();
    }

    for (let y = startY; y <= endY; y += GRID_SIZE_M) {
      const isMajor = Math.abs(y % 1) < 0.01;
      ctx.strokeStyle = isMajor ? GRID_MAJOR_COLOR : GRID_COLOR;
      ctx.lineWidth = isMajor ? 1 : 0.5;
      const sp = worldToScreen({ x: 0, y });
      ctx.beginPath();
      ctx.moveTo(0, sp.y);
      ctx.lineTo(w, sp.y);
      ctx.stroke();
    }
  }

  // 壁描画
  function drawWall(
    ctx: CanvasRenderingContext2D,
    wall: WallSegment,
    selected: boolean
  ) {
    const s = worldToScreen(wall.start);
    const e = worldToScreen(wall.end);
    const thicknessPx = wall.thickness * pxPerM;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 壁の厚み（太線）
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.strokeStyle = selected ? WALL_SELECTED_COLOR : WALL_DEFAULT_COLOR;
    ctx.lineWidth = Math.max(thicknessPx, 4);
    ctx.stroke();

    // 壁端点マーカー
    if (selected) {
      for (const p of [s, e]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = WALL_SELECTED_COLOR;
        ctx.fill();
      }
    }
  }

  // 開口部描画
  function drawOpening(ctx: CanvasRenderingContext2D, op: Opening) {
    const wall = walls.find((w) => w.id === op.wallId);
    if (!wall) return;

    const angle = wallAngle(wall);
    const len = wallLength(wall);
    if (len === 0) return;

    // 壁上の位置を算出
    const t = op.positionAlongWall / len;
    const cx = wall.start.x + (wall.end.x - wall.start.x) * t;
    const cy = wall.start.y + (wall.end.y - wall.start.y) * t;
    const center = worldToScreen({ x: cx, y: cy });
    const widthPx = op.width * pxPerM;
    const thicknessPx = wall.thickness * pxPerM;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);

    if (op.type === 'door') {
      // ドアシンボル: 壁の切れ目 + 開き弧
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-widthPx / 2, -thicknessPx / 2 - 1, widthPx, thicknessPx + 2);

      ctx.beginPath();
      ctx.arc(-widthPx / 2, -thicknessPx / 2, widthPx, 0, -Math.PI / 2, true);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.stroke();

      // ドア線
      ctx.beginPath();
      ctx.moveTo(-widthPx / 2, -thicknessPx / 2);
      ctx.lineTo(-widthPx / 2, -thicknessPx / 2 - widthPx);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // 窓シンボル: 壁の切れ目 + 二重線
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-widthPx / 2, -thicknessPx / 2 - 1, widthPx, thicknessPx + 2);

      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(-widthPx / 2, -2);
      ctx.lineTo(widthPx / 2, -2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-widthPx / 2, 2);
      ctx.lineTo(widthPx / 2, 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 家具描画（上面図）
  function drawFurniture(
    ctx: CanvasRenderingContext2D,
    item: FurnitureItem,
    selected: boolean
  ) {
    const pos = worldToScreen({ x: item.position[0], y: item.position[2] });
    const sw = item.scale[0] * pxPerM;
    const sd = item.scale[2] * pxPerM;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(item.rotation[1]); // Y軸回転を2D回転として使用

    const isRound =
      item.type === 'table_round' || item.type === 'plant' || item.type === 'stool';

    if (isRound) {
      const r = Math.max(sw, sd) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = item.color + '40';
      ctx.fill();
      ctx.strokeStyle = selected ? WALL_SELECTED_COLOR : item.color;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    } else {
      ctx.fillStyle = item.color + '40';
      ctx.fillRect(-sw / 2, -sd / 2, sw, sd);
      ctx.strokeStyle = selected ? WALL_SELECTED_COLOR : item.color;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(-sw / 2, -sd / 2, sw, sd);
    }

    // ラベル
    ctx.fillStyle = '#374151';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, 0, 0);

    ctx.restore();
  }

  // 寸法線
  function drawDimension(ctx: CanvasRenderingContext2D, wall: WallSegment) {
    const len = wallLength(wall);
    if (len < 0.1) return;

    const angle = wallAngle(wall);
    const mid = worldToScreen({
      x: (wall.start.x + wall.end.x) / 2,
      y: (wall.start.y + wall.end.y) / 2,
    });

    // 壁に直交するオフセット
    const offset = 18;
    const nx = -Math.sin(angle) * offset;
    const ny = Math.cos(angle) * offset;

    const label = `${len.toFixed(2)}m`;

    ctx.save();
    ctx.translate(mid.x + nx, mid.y + ny);

    // テキストが逆さにならないよう調整
    let textAngle = angle;
    if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
      textAngle += Math.PI;
    }
    ctx.rotate(textAngle);

    ctx.font = DIMENSION_FONT;
    ctx.fillStyle = DIMENSION_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 背景
    const metrics = ctx.measureText(label);
    const pad = 3;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(
      -metrics.width / 2 - pad,
      -7,
      metrics.width + pad * 2,
      14
    );

    ctx.fillStyle = DIMENSION_COLOR;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  // 壁プレビュー
  function drawWallPreview(
    ctx: CanvasRenderingContext2D,
    start: Point2D,
    end: Point2D
  ) {
    const snapped = snapAngle(start, end);
    const s = worldToScreen(start);
    const e = worldToScreen(snapped);

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.strokeStyle = PREVIEW_WALL_COLOR;
    ctx.lineWidth = 0.12 * pxPerM;
    ctx.lineCap = 'round';
    ctx.stroke();

    // プレビュー寸法
    const len = distance(start, snapped);
    if (len > 0.05) {
      const mx = (s.x + e.x) / 2;
      const my = (s.y + e.y) / 2 - 14;
      ctx.font = DIMENSION_FONT;
      ctx.fillStyle = WALL_SELECTED_COLOR;
      ctx.textAlign = 'center';
      ctx.fillText(`${len.toFixed(2)}m`, mx, my);
    }
  }

  // --- マウスイベント ---
  const getCanvasPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    []
  );

  const getSnappedWorld = useCallback(
    (screenPt: { x: number; y: number }): Point2D => {
      const raw = screenToWorld(screenPt.x, screenPt.y);
      // 端点スナップ優先
      const epSnap = snapToEndpoints(raw, walls, 0.3);
      if (epSnap.type === 'endpoint') return epSnap.point;
      // グリッドスナップ
      return snapToGrid(raw, 0.1);
    },
    [screenToWorld, walls]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 中ボタン or Shift+左ボタン → パン
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        setIsPanning(true);
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          ox: view.offsetX,
          oy: view.offsetY,
        };
        return;
      }

      if (e.button !== 0) return;

      const sp = getCanvasPoint(e);
      const worldPt = getSnappedWorld(sp);

      switch (activeTool) {
        case 'wall': {
          if (!isDrawingWall) {
            startDrawingWall(worldPt);
          } else if (wallDrawStart) {
            const endPt = snapAngle(wallDrawStart, worldPt);
            const len = distance(wallDrawStart, endPt);
            if (len > 0.05) {
              addWall({
                id: `wall_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                start: wallDrawStart,
                end: endPt,
                thickness: 0.12,
                height: 2.7,
                color: '#E0E0E0',
              });
            }
            finishDrawingWall();
          }
          break;
        }
        case 'select': {
          // 壁ヒットテスト
          const raw = screenToWorld(sp.x, sp.y);
          let hitWall: string | null = null;
          let hitFurn: string | null = null;

          for (const wall of walls) {
            if (pointToSegmentDist(raw, wall.start, wall.end) < wall.thickness + 0.15) {
              hitWall = wall.id;
              break;
            }
          }

          if (!hitWall) {
            for (const f of furniture) {
              const fx = f.position[0];
              const fz = f.position[2];
              const hw = f.scale[0] / 2;
              const hd = f.scale[2] / 2;
              if (
                raw.x >= fx - hw &&
                raw.x <= fx + hw &&
                raw.y >= fz - hd &&
                raw.y <= fz + hd
              ) {
                hitFurn = f.id;
                break;
              }
            }
          }

          setSelectedWall(hitWall);
          setSelectedFurniture(hitFurn);
          break;
        }
        case 'delete': {
          const rawDel = screenToWorld(sp.x, sp.y);
          for (const wall of walls) {
            if (pointToSegmentDist(rawDel, wall.start, wall.end) < wall.thickness + 0.15) {
              deleteWall(wall.id);
              return;
            }
          }
          for (const f of furniture) {
            const fx = f.position[0];
            const fz = f.position[2];
            const hw = f.scale[0] / 2;
            const hd = f.scale[2] / 2;
            if (
              rawDel.x >= fx - hw &&
              rawDel.x <= fx + hw &&
              rawDel.y >= fz - hd &&
              rawDel.y <= fz + hd
            ) {
              deleteFurniture(f.id);
              return;
            }
          }
          break;
        }
        case 'door':
        case 'window': {
          // 壁上の最も近い点にドア/窓を配置
          const rawOp = screenToWorld(sp.x, sp.y);
          let closestWall: WallSegment | null = null;
          let closestDist = Infinity;
          for (const wall of walls) {
            const d = pointToSegmentDist(rawOp, wall.start, wall.end);
            if (d < closestDist && d < wall.thickness + 0.3) {
              closestDist = d;
              closestWall = wall;
            }
          }
          if (closestWall) {
            const posAlong = projectOntoSegment(rawOp, closestWall.start, closestWall.end);
            addOpening({
              id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              wallId: closestWall.id,
              type: activeTool as 'door' | 'window',
              positionAlongWall: posAlong,
              width: activeTool === 'door' ? 0.9 : 1.2,
              height: activeTool === 'door' ? 2.1 : 1.2,
              elevation: activeTool === 'window' ? 0.9 : 0,
            });
          }
          break;
        }
        case 'measure':
          // 計測は寸法線表示のみ（すべての壁に自動表示済み）
          break;
      }
    },
    [
      activeTool,
      isDrawingWall,
      wallDrawStart,
      walls,
      furniture,
      view,
      getCanvasPoint,
      getSnappedWorld,
      screenToWorld,
      addWall,
      deleteWall,
      startDrawingWall,
      finishDrawingWall,
      setSelectedWall,
      setSelectedFurniture,
      addOpening,
      deleteFurniture,
    ]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPanning && panStart.current) {
        const dx = (e.clientX - panStart.current.x) / pxPerM;
        const dy = (e.clientY - panStart.current.y) / pxPerM;
        setView((v) => ({
          ...v,
          offsetX: panStart.current!.ox + dx,
          offsetY: panStart.current!.oy + dy,
        }));
        return;
      }

      const sp = getCanvasPoint(e);
      const worldPt = getSnappedWorld(sp);
      setMouseWorld(worldPt);
    },
    [isPanning, pxPerM, getCanvasPoint, getSnappedWorld]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
    }
  }, [isPanning]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setView((v) => ({
        ...v,
        zoom: Math.max(0.1, Math.min(10, v.zoom * factor)),
      }));
    },
    []
  );

  // --- リサイズ ---
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      draw();
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [draw]);

  // --- 再描画 ---
  useEffect(() => {
    draw();
  }, [draw]);

  // --- キーボード ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawingWall) {
          useEditorStore.getState().cancelDrawingWall();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDrawingWall]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] bg-white"
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* 座標表示 */}
      <div className="absolute bottom-2 right-2 bg-white/80 px-2 py-1 text-xs text-gray-500 rounded shadow-sm pointer-events-none">
        {mouseWorld.x.toFixed(2)}, {mouseWorld.y.toFixed(2)} m
        <span className="ml-2">×{view.zoom.toFixed(1)}</span>
      </div>
    </div>
  );
}

// --- ヘルパー ---
function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function projectOntoSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return t * Math.sqrt(lenSq);
}
