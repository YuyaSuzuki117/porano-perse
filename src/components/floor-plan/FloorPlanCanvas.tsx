'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { useUIStore } from '@/stores/useUIStore';
import { Point2D, WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';
import { STYLE_PRESETS } from '@/data/styles';
import { FURNITURE_CATALOG } from '@/data/furniture';
import {
  snapToGrid,
  snapToEndpoints,
  snapAngle,
  wallLength,
  wallAngle,
  distance,
  computePolygonArea,
  computePolygonCentroid,
} from '@/lib/geometry';

// --- ユーティリティ ---
function isPointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// --- 定数 ---
const GRID_SIZE_M = 0.5; // グリッド間隔(m)
const PIXELS_PER_METER_BASE = 80; // 基本スケール
const WALL_DEFAULT_COLOR = '#555555';
const WALL_SELECTED_COLOR = '#3B82F6';
const GRID_COLOR = '#EDEFF2';
const GRID_MAJOR_COLOR = '#C9CDD4';
const GRID_AXIS_COLOR = '#94A3B8';
const DIMENSION_FONT = '11px "Inter", "Segoe UI", sans-serif';
const DIMENSION_COLOR = '#6B7280';
const SNAP_INDICATOR_COLOR = '#EF4444';
const PREVIEW_WALL_COLOR = 'rgba(59,130,246,0.5)';
const ORIGIN_MARKER_SIZE = 12; // 原点十字マーカーのサイズ(px)
const MEASURE_COLOR = '#F59E0B'; // 計測線アンバー色
const FURNITURE_SNAP_GRID = 0.05; // 家具ドラッグ用の細かいグリッド(m)
const WALL_SNAP_DISTANCE = 0.2; // 家具→壁スナップ距離(m)
const WALL_SNAP_HIGHLIGHT_COLOR = 'rgba(59, 130, 246, 0.7)'; // 壁スナップ時の青ハイライト

// 家具カテゴリ別カラーマップ（2D表示用）
const FURNITURE_CATEGORY_COLORS: Record<string, string> = {
  // 座席系 = 青
  chair: '#3B82F6', stool: '#3B82F6', sofa: '#3B82F6', bench: '#3B82F6',
  // テーブル系 = 茶
  table_square: '#92400E', table_round: '#92400E', bar_table: '#92400E', desk: '#92400E',
  counter: '#92400E', kitchen_island: '#92400E', reception_desk: '#92400E',
  // 収納系 = 緑
  shelf: '#16A34A', bookcase: '#16A34A', wardrobe: '#16A34A', shoe_rack: '#16A34A',
  display_case: '#16A34A',
  // 設備系 = グレー
  sink: '#6B7280', fridge: '#6B7280', washing_machine: '#6B7280', air_conditioner: '#6B7280',
  register: '#6B7280', cash_register: '#6B7280',
  // 装飾系 = 紫
  plant: '#7C3AED', flower_pot: '#7C3AED', mirror: '#7C3AED', clock: '#7C3AED',
  pendant_light: '#EAB308', ceiling_fan: '#EAB308',
  // その他
  partition: '#6B7280', coat_rack: '#6B7280', umbrella_stand: '#6B7280',
  menu_board: '#6B7280', rug: '#A855F7', curtain: '#A855F7', trash_can: '#6B7280',
  tv_monitor: '#6B7280', custom: '#888888',
};

function getCategoryColor(type: string): string {
  return FURNITURE_CATEGORY_COLORS[type] || '#888888';
}

// 家具ピッカー用トップアイテム
const QUICK_FURNITURE_ITEMS = FURNITURE_CATALOG.slice(0, 10);

// スタイルに応じた床色マッピング（2D表示用、薄い色）
function getFloorFillColor(style: string): string {
  const config = STYLE_PRESETS[style as keyof typeof STYLE_PRESETS];
  if (!config) return 'rgba(245, 240, 230, 0.25)';
  // 床色を薄くして2D用に使用
  const hex = config.floorColor;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

interface Measurement {
  start: Point2D;
  end: Point2D;
  distance: number;
}

interface ViewState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

interface FloorPlanCanvasProps {
  /** External ref to access the 2D canvas (for PDF export) */
  canvasRef2D?: React.RefObject<HTMLCanvasElement | null>;
}

export default function FloorPlanCanvas({ canvasRef2D }: FloorPlanCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external ref for PDF export
  useEffect(() => {
    if (canvasRef2D && canvasRef.current) {
      (canvasRef2D as React.MutableRefObject<HTMLCanvasElement | null>).current = canvasRef.current;
    }
    return () => {
      if (canvasRef2D) {
        (canvasRef2D as React.MutableRefObject<HTMLCanvasElement | null>).current = null;
      }
    };
  }, [canvasRef2D]);

  // ストア
  const walls = useEditorStore((s) => s.walls);
  const openings = useEditorStore((s) => s.openings);
  const furniture = useEditorStore((s) => s.furniture);
  const activeTool = useUIStore(s => s.activeTool);
  const selectedWallId = useUIStore(s => s.selectedWallId);
  const selectedFurnitureId = useUIStore(s => s.selectedFurnitureId);
  const isDrawingWall = useUIStore(s => s.isDrawingWall);
  const wallDrawStart = useUIStore(s => s.wallDrawStart);
  const style = useEditorStore((s) => s.style);
  const addWall = useEditorStore((s) => s.addWall);
  const deleteWall = useEditorStore((s) => s.deleteWall);
  const setSelectedWall = useUIStore(s => s.setSelectedWall);
  const setSelectedFurniture = useEditorStore((s) => s.setSelectedFurniture);
  const startDrawingWall = useUIStore(s => s.startDrawingWall);
  const finishDrawingWall = useUIStore(s => s.finishDrawingWall);
  const addOpening = useEditorStore((s) => s.addOpening);
  const updateOpening = useEditorStore((s) => s.updateOpening);
  const deleteOpening = useEditorStore((s) => s.deleteOpening);
  const deleteFurniture = useEditorStore((s) => s.deleteFurniture);
  const moveFurniture = useEditorStore((s) => s.moveFurniture);
  const updateFurniture = useEditorStore((s) => s.updateFurniture);
  const addFurniture = useEditorStore((s) => s.addFurniture);
  const roomLabels = useEditorStore((s) => s.roomLabels);
  const equipmentItems = useEditorStore((s) => s.equipmentItems);
  const routes = useEditorStore((s) => s.routes);

  // ビュー状態
  const [view, setView] = useState<ViewState>({
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
  });
  const [mouseWorld, setMouseWorld] = useState<Point2D>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // 開口部ドラッグ状態
  const [draggingOpeningId, setDraggingOpeningId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);

  // 家具ドラッグ状態
  const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
  const dragFurnitureOffset = useRef<{ dx: number; dz: number } | null>(null);

  // 計測ツール状態
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measuringStart, setMeasuringStart] = useState<Point2D | null>(null);

  // 家具リサイズ状態
  const [resizingFurnitureId, setResizingFurnitureId] = useState<string | null>(null);
  const [resizeCornerIndex, setResizeCornerIndex] = useState<number>(-1);
  const resizeStart = useRef<{ mouseWorld: Point2D; origScale: [number, number, number]; origPos: [number, number, number] } | null>(null);
  const [resizeDimLabel, setResizeDimLabel] = useState<string | null>(null);

  // 壁スナップ情報（ドラッグ中に検出されたスナップライン）
  const [wallSnapLines, setWallSnapLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  // クイック家具ピッカーポップアップ
  const [quickPickerPos, setQuickPickerPos] = useState<{ screen: { x: number; y: number }; world: Point2D } | null>(null);
  const lastClickTime = useRef<number>(0);
  const lastClickPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // rAFベースの描画制御
  const rafId = useRef<number>(0);
  const needsRedraw = useRef(true);

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

  // --- 壁で囲まれた領域を検出して塗りつぶす ---
  function fillEnclosedRegions(ctx: CanvasRenderingContext2D) {
    if (walls.length < 3) return;

    // 壁の端点からつながった閉ループを検出
    const floorColor = getFloorFillColor(style);
    const loops = findClosedLoops(walls);

    for (const loop of loops) {
      ctx.beginPath();
      const first = worldToScreen(loop[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < loop.length; i++) {
        const pt = worldToScreen(loop[i]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = floorColor;
      ctx.fill();
    }
  }

  // --- 計測線の描画 ---
  function drawMeasurementLine(
    ctx: CanvasRenderingContext2D,
    measurement: Measurement
  ) {
    const start = worldToScreen(measurement.start);
    const end = worldToScreen(measurement.end);

    ctx.save();
    // 点線
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = MEASURE_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // 端点マーカー
    ctx.setLineDash([]);
    ctx.fillStyle = MEASURE_COLOR;
    ctx.beginPath();
    ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // 距離テキスト
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const text = `${measurement.distance.toFixed(2)}m`;

    ctx.font = 'bold 13px monospace';
    const metrics = ctx.measureText(text);
    const padding = 4;

    // 背景
    ctx.fillStyle = MEASURE_COLOR;
    ctx.beginPath();
    ctx.roundRect(
      midX - metrics.width / 2 - padding,
      midY - 8 - padding,
      metrics.width + padding * 2,
      16 + padding * 2,
      4
    );
    ctx.fill();

    // テキスト
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, midX, midY);
    ctx.restore();
  }

  // --- 面積ラベル描画（閉じた部屋ごとに面積を計算して中央に表示） ---
  function drawAreaLabels(ctx: CanvasRenderingContext2D) {
    if (walls.length < 3) return;
    const loops = findClosedLoops(walls);

    for (const loop of loops) {
      // ループごとに面積を計算
      const loopArea = computePolygonArea(loop);
      if (loopArea <= 0.1) continue; // 極小領域はスキップ

      // ループの重心を計算
      const centroid = computePolygonCentroid(loop);
      const center = worldToScreen(centroid);

      // ルームラベル（もしあれば）
      const roomLabel = roomLabels.find(rl => {
        // ラベル位置がこのループ内にあるか判定
        return isPointInPolygon(rl.position, loop);
      });

      const areaText = `${loopArea.toFixed(1)} m\u00B2`;
      const tsuboText = `(${(loopArea / 3.306).toFixed(1)} \u5764)`;

      ctx.save();

      // ラベル名がある場合は3行、ない場合は2行
      const hasLabel = roomLabel && roomLabel.name.trim().length > 0;
      const lineHeight = 18;
      const totalHeight = hasLabel ? 54 : 36;

      ctx.font = 'bold 16px "Inter", "Segoe UI", sans-serif';
      const areaMetrics = ctx.measureText(areaText);
      ctx.font = '12px "Inter", "Segoe UI", sans-serif';
      const tsuboMetrics = ctx.measureText(tsuboText);
      let textWidth = Math.max(areaMetrics.width, tsuboMetrics.width);
      if (hasLabel) {
        ctx.font = 'bold 13px "Inter", "Segoe UI", sans-serif';
        const labelMetrics = ctx.measureText(roomLabel.name);
        textWidth = Math.max(textWidth, labelMetrics.width);
      }
      const padding = 8;

      // 半透明背景
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(
        center.x - textWidth / 2 - padding,
        center.y - totalHeight / 2,
        textWidth + padding * 2,
        totalHeight,
        6
      );
      ctx.fill();
      ctx.stroke();

      let yOffset = hasLabel ? -16 : -7;

      // ルームラベル名
      if (hasLabel) {
        ctx.fillStyle = '#374151';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 13px "Inter", "Segoe UI", sans-serif';
        ctx.fillText(roomLabel.name, center.x, center.y + yOffset);
        yOffset += lineHeight;
      }

      // 面積テキスト
      ctx.fillStyle = '#1E40AF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 16px "Inter", "Segoe UI", sans-serif';
      ctx.fillText(areaText, center.x, center.y + yOffset);

      // 坪数テキスト
      ctx.fillStyle = '#6B7280';
      ctx.font = '12px "Inter", "Segoe UI", sans-serif';
      ctx.fillText(tsuboText, center.x, center.y + yOffset + lineHeight);
      ctx.restore();
    }
  }

  // --- 北矢印描画 ---
  function drawNorthArrow(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
    const cx = canvasW - 40;
    const cy = 50;
    const r = 18;

    ctx.save();
    ctx.translate(cx, cy);

    // 外円（コンパス枠）
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 北矢印（上向き）
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(-6, 4);
    ctx.lineTo(0, -2);
    ctx.closePath();
    ctx.fillStyle = '#EF4444';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(6, 4);
    ctx.lineTo(0, -2);
    ctx.closePath();
    ctx.fillStyle = '#FCA5A5';
    ctx.fill();

    // 南矢印（下向き）
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(-5, 2);
    ctx.lineTo(0, 5);
    ctx.closePath();
    ctx.fillStyle = '#94A3B8';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(5, 2);
    ctx.lineTo(0, 5);
    ctx.closePath();
    ctx.fillStyle = '#CBD5E1';
    ctx.fill();

    // N ラベル
    ctx.font = 'bold 10px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#EF4444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', 0, -r - 5);

    ctx.restore();
  }

  // --- マウスから最近壁/角への距離表示 ---
  function drawNearestDistance(ctx: CanvasRenderingContext2D) {
    if (walls.length === 0) return;
    // 計測ツール以外でも、selectツール時にも表示
    if (activeTool !== 'measure' && activeTool !== 'select') return;

    let nearestDist = Infinity;
    let nearestPt: Point2D | null = null;

    // 壁の端点への距離
    for (const wall of walls) {
      for (const ep of [wall.start, wall.end]) {
        const d = distance(mouseWorld, ep);
        if (d < nearestDist) {
          nearestDist = d;
          nearestPt = ep;
        }
      }
      // 壁のセグメントへの距離
      const segDist = pointToSegmentDist(mouseWorld, wall.start, wall.end);
      if (segDist < nearestDist) {
        nearestDist = segDist;
        // 射影点を計算
        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq > 0) {
          let t = ((mouseWorld.x - wall.start.x) * dx + (mouseWorld.y - wall.start.y) * dy) / lenSq;
          t = Math.max(0, Math.min(1, t));
          nearestPt = { x: wall.start.x + t * dx, y: wall.start.y + t * dy };
        }
      }
    }

    if (!nearestPt || nearestDist > 5 || nearestDist < 0.05) return;

    const mouseScreen = worldToScreen(mouseWorld);
    const nearScreen = worldToScreen(nearestPt);

    // 点線で距離を表示
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mouseScreen.x, mouseScreen.y);
    ctx.lineTo(nearScreen.x, nearScreen.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 距離ラベル（中間点）
    const midX = (mouseScreen.x + nearScreen.x) / 2;
    const midY = (mouseScreen.y + nearScreen.y) / 2;
    const label = `${nearestDist.toFixed(2)}m`;

    ctx.font = '10px "Inter", "Segoe UI", sans-serif';
    const metrics = ctx.measureText(label);
    const pad = 3;

    ctx.fillStyle = 'rgba(139, 92, 246, 0.85)';
    ctx.beginPath();
    ctx.roundRect(midX - metrics.width / 2 - pad, midY - 7 - pad, metrics.width + pad * 2, 14 + pad * 2, 3);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY);

    // ターゲット点に小さなダイヤモンドマーカー
    ctx.fillStyle = 'rgba(139, 92, 246, 0.7)';
    ctx.beginPath();
    ctx.moveTo(nearScreen.x, nearScreen.y - 4);
    ctx.lineTo(nearScreen.x + 4, nearScreen.y);
    ctx.lineTo(nearScreen.x, nearScreen.y + 4);
    ctx.lineTo(nearScreen.x - 4, nearScreen.y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // --- 壁スナップインジケーター（壁描画時に端点・交点を強調表示） ---
  function drawSnapIndicators(ctx: CanvasRenderingContext2D) {
    if (activeTool !== 'wall' && activeTool !== 'door' && activeTool !== 'window') return;

    // 全端点にスナップドットを表示
    const drawnKeys = new Set<string>();
    for (const wall of walls) {
      for (const ep of [wall.start, wall.end]) {
        const key = `${ep.x.toFixed(2)},${ep.y.toFixed(2)}`;
        if (drawnKeys.has(key)) continue;
        drawnKeys.add(key);

        const sp = worldToScreen(ep);
        const distToMouse = distance(mouseWorld, ep);

        // 近くにいるときは大きく光る + 接続ラベル表示
        if (distToMouse < 0.3) {
          ctx.save();
          // グロー効果（大きめ）
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
          ctx.fill();

          // スナップリング（緑: 接続可能を示す）
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#22C55E';
          ctx.lineWidth = 2;
          ctx.stroke();

          // 中心ドット
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#22C55E';
          ctx.fill();

          // 「接続」ラベル
          ctx.font = 'bold 10px "Inter", "Segoe UI", sans-serif';
          const labelText = '\u63A5\u7D9A';
          const lm = ctx.measureText(labelText);
          const lpad = 3;
          ctx.fillStyle = 'rgba(34, 197, 94, 0.9)';
          ctx.beginPath();
          ctx.roundRect(sp.x - lm.width / 2 - lpad, sp.y - 24, lm.width + lpad * 2, 14, 3);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, sp.x, sp.y - 17);

          ctx.restore();
        } else if (distToMouse < 0.5) {
          ctx.save();
          // グロー効果
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.fill();

          // スナップリング
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
          ctx.strokeStyle = SNAP_INDICATOR_COLOR;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // 中心ドット
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = SNAP_INDICATOR_COLOR;
          ctx.fill();
          ctx.restore();
        } else if (distToMouse < 2) {
          // 遠めの端点は小さくドットだけ表示
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
          ctx.fill();
        }
      }
    }
  }

  // --- 描画 ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // クリア
    ctx.fillStyle = '#FAFBFC';
    ctx.fillRect(0, 0, w, h);

    // グリッド描画
    drawGrid(ctx, w, h);

    // 原点マーカー
    drawOriginMarker(ctx);

    // 床面塗りつぶし（壁の下に描画）
    fillEnclosedRegions(ctx);

    // 壁描画
    for (const wall of walls) {
      drawWall(ctx, wall, wall.id === selectedWallId);
    }

    // 開口部描画
    for (const op of openings) {
      drawOpening(ctx, op);
    }

    // 選択中の開口部ハイライト
    if (selectedOpeningId) {
      const selOp = openings.find((o) => o.id === selectedOpeningId);
      if (selOp) {
        drawOpeningSelectionHighlight(ctx, selOp);
      }
    }

    // ドラッグ中の開口部ゴースト表示
    if (draggingOpeningId) {
      const dragOp = openings.find((o) => o.id === draggingOpeningId);
      if (dragOp) {
        drawOpeningDragGuide(ctx, dragOp);
      }
    }

    // 家具描画
    for (const f of furniture) {
      drawFurniture(ctx, f, f.id === selectedFurnitureId);
    }

    // 寸法線
    for (const wall of walls) {
      drawDimension(ctx, wall);
    }

    // 選択中のリサイズハンドル
    if (selectedWallId) {
      const sw = walls.find((w) => w.id === selectedWallId);
      if (sw) drawSelectionHandles(ctx, sw);
    }
    if (selectedFurnitureId) {
      const sf = furniture.find((f) => f.id === selectedFurnitureId);
      if (sf) drawFurnitureSelectionHandles(ctx, sf);
    }

    // 壁描画プレビュー
    if (isDrawingWall && wallDrawStart) {
      drawWallPreview(ctx, wallDrawStart, mouseWorld);
    }

    // スナップインジケーター（強化版）
    drawSnapIndicators(ctx);

    // 面積ラベル描画
    drawAreaLabels(ctx);

    // 配線・配管ルート描画
    const ROUTE_COLORS: Record<string, string> = { electrical: '#E04040', plumbing_water: '#4080E0', plumbing_drain: '#40A040', gas: '#E0A020', lan: '#8040C0' };
    for (const route of routes) {
      if (route.points.length < 2) continue;
      ctx.beginPath();
      const rp0 = worldToScreen({ x: route.points[0][0], y: route.points[0][1] });
      ctx.moveTo(rp0.x, rp0.y);
      for (let ri = 1; ri < route.points.length; ri++) {
        const rp = worldToScreen({ x: route.points[ri][0], y: route.points[ri][1] });
        ctx.lineTo(rp.x, rp.y);
      }
      ctx.strokeStyle = ROUTE_COLORS[route.type] || '#888';
      ctx.lineWidth = route.isConcealed ? 1.5 : 2.5;
      if (route.isConcealed) ctx.setLineDash([6, 4]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const pt of route.points) {
        const ps = worldToScreen({ x: pt[0], y: pt[1] });
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = ROUTE_COLORS[route.type] || '#888';
        ctx.fill();
      }
    }

    // 設備アイコン描画
    const EQ_ICONS: Record<string, { color: string; symbol: string }> = {
      air_conditioner: { color: '#4488FF', symbol: '❄' }, outlet: { color: '#FF8844', symbol: '⊞' },
      switch: { color: '#FF8844', symbol: '□' }, lighting_downlight: { color: '#FFCC00', symbol: '◉' },
      lighting_ceiling: { color: '#FFCC00', symbol: '☀' }, fire_alarm: { color: '#FF4444', symbol: '▲' },
      exhaust_fan: { color: '#88CCFF', symbol: '◎' }, lan_port: { color: '#8844CC', symbol: '⊡' },
      intercom: { color: '#44AA44', symbol: '☎' },
    };
    for (const eq of equipmentItems) {
      const eqs = worldToScreen({ x: eq.position[0], y: eq.position[1] });
      const eqIcon = EQ_ICONS[eq.type] || { color: '#888', symbol: '?' };
      ctx.beginPath();
      ctx.arc(eqs.x, eqs.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = eqIcon.color + '30';
      ctx.fill();
      ctx.strokeStyle = eqIcon.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = eqIcon.color;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(eqIcon.symbol, eqs.x, eqs.y);
    }

    // マウスから最近壁/角への距離表示
    drawNearestDistance(ctx);

    // 家具ドラッグ中ガイドライン
    if (draggingFurnitureId) {
      const dragItem = furniture.find(f => f.id === draggingFurnitureId);
      if (dragItem) {
        drawFurnitureDragGuides(ctx, dragItem);
      }
    }

    // 壁スナップハイライトライン
    if (wallSnapLines.length > 0) {
      ctx.save();
      ctx.strokeStyle = WALL_SNAP_HIGHLIGHT_COLOR;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      for (const sl of wallSnapLines) {
        const s = worldToScreen({ x: sl.x1, y: sl.y1 });
        const e = worldToScreen({ x: sl.x2, y: sl.y2 });
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // リサイズ中の寸法ラベル
    if (resizingFurnitureId && resizeDimLabel) {
      const resItem = furniture.find(f => f.id === resizingFurnitureId);
      if (resItem) {
        const resPos = worldToScreen({ x: resItem.position[0], y: resItem.position[2] });
        ctx.save();
        ctx.font = 'bold 12px "Inter", "Segoe UI", sans-serif';
        const tm = ctx.measureText(resizeDimLabel);
        const lx = resPos.x;
        const ly = resPos.y - (resItem.scale[2] * pxPerM) / 2 - 20;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
        ctx.beginPath();
        ctx.roundRect(lx - tm.width / 2 - 4, ly - 8, tm.width + 8, 16, 3);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(resizeDimLabel, lx, ly);
        ctx.restore();
      }
    }

    // 北矢印
    drawNorthArrow(ctx, w, h);

    // 確定済み計測線
    for (const m of measurements) {
      drawMeasurementLine(ctx, m);
    }

    // 計測中プレビュー（始点からマウス位置まで）
    if (measuringStart && activeTool === 'measure') {
      const previewDist = Math.sqrt(
        (mouseWorld.x - measuringStart.x) ** 2 +
        (mouseWorld.y - measuringStart.y) ** 2
      );
      drawMeasurementLine(ctx, {
        start: measuringStart,
        end: mouseWorld,
        distance: previewDist,
      });
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
    style,
    worldToScreen,
    selectedOpeningId,
    draggingOpeningId,
    draggingFurnitureId,
    measurements,
    measuringStart,
    roomLabels,
    equipmentItems,
    routes,
    wallSnapLines,
    resizingFurnitureId,
    resizeDimLabel,
  ]);

  // --- 原点十字マーカー ---
  function drawOriginMarker(ctx: CanvasRenderingContext2D) {
    const origin = worldToScreen({ x: 0, y: 0 });
    const size = ORIGIN_MARKER_SIZE;

    ctx.strokeStyle = GRID_AXIS_COLOR;
    ctx.lineWidth = 1.5;

    // 横線
    ctx.beginPath();
    ctx.moveTo(origin.x - size, origin.y);
    ctx.lineTo(origin.x + size, origin.y);
    ctx.stroke();

    // 縦線
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y - size);
    ctx.lineTo(origin.x, origin.y + size);
    ctx.stroke();

    // 中心円
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = GRID_AXIS_COLOR;
    ctx.fill();
  }

  // グリッド（メートル数字付き）
  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(w, h);

    const startX = Math.floor(topLeft.x / GRID_SIZE_M) * GRID_SIZE_M;
    const startY = Math.floor(topLeft.y / GRID_SIZE_M) * GRID_SIZE_M;
    const endX = Math.ceil(bottomRight.x / GRID_SIZE_M) * GRID_SIZE_M;
    const endY = Math.ceil(bottomRight.y / GRID_SIZE_M) * GRID_SIZE_M;

    // グリッド線
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

    // メートル数字（X軸上）
    ctx.font = '10px "Inter", "Segoe UI", sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const originScreen = worldToScreen({ x: 0, y: 0 });

    for (let x = startX; x <= endX; x += 1) {
      if (Math.abs(x) < 0.01) continue; // 原点はスキップ
      const sp = worldToScreen({ x, y: 0 });
      // Y軸（水平）上のラベルをorigin.yの近くに表示
      const labelY = Math.min(Math.max(originScreen.y + 4, 2), h - 14);
      ctx.fillText(`${Math.round(x)}m`, sp.x, labelY);
    }

    // メートル数字（Y軸上）
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let y = startY; y <= endY; y += 1) {
      if (Math.abs(y) < 0.01) continue;
      const sp = worldToScreen({ x: 0, y });
      const labelX = Math.min(Math.max(originScreen.x - 4, 28), w - 4);
      ctx.fillText(`${Math.round(y)}m`, labelX, sp.y);
    }

    // 原点ラベル "0"
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('0', originScreen.x - 4, originScreen.y + 4);
  }

  // --- 壁描画（直角接合・矩形として描画） ---
  function drawWall(
    ctx: CanvasRenderingContext2D,
    wall: WallSegment,
    selected: boolean
  ) {
    const s = worldToScreen(wall.start);
    const e = worldToScreen(wall.end);
    const thicknessPx = Math.max(wall.thickness * pxPerM, 4);

    // 壁の角度を算出して矩形として描画
    const angle = Math.atan2(e.y - s.y, e.x - s.x);
    const halfThick = thicknessPx / 2;

    // 壁の厚み方向の法線ベクトル
    const nx = -Math.sin(angle) * halfThick;
    const ny = Math.cos(angle) * halfThick;

    ctx.beginPath();
    ctx.moveTo(s.x + nx, s.y + ny);
    ctx.lineTo(e.x + nx, e.y + ny);
    ctx.lineTo(e.x - nx, e.y - ny);
    ctx.lineTo(s.x - nx, s.y - ny);
    ctx.closePath();

    // 壁の塗りつぶし
    ctx.fillStyle = selected ? '#DBEAFE' : '#E5E7EB';
    ctx.fill();

    // 壁の輪郭（直角接合）
    ctx.strokeStyle = selected ? WALL_SELECTED_COLOR : WALL_DEFAULT_COLOR;
    ctx.lineWidth = selected ? 2 : 1;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }

  // --- 選択中壁のリサイズハンドル ---
  function drawSelectionHandles(ctx: CanvasRenderingContext2D, wall: WallSegment) {
    const s = worldToScreen(wall.start);
    const e = worldToScreen(wall.end);
    const thicknessPx = Math.max(wall.thickness * pxPerM, 4);
    const angle = Math.atan2(e.y - s.y, e.x - s.x);
    const halfThick = thicknessPx / 2;
    const nx = -Math.sin(angle) * halfThick;
    const ny = Math.cos(angle) * halfThick;

    // 四隅の座標
    const corners = [
      { x: s.x + nx, y: s.y + ny },
      { x: e.x + nx, y: e.y + ny },
      { x: e.x - nx, y: e.y - ny },
      { x: s.x - nx, y: s.y - ny },
    ];

    const handleSize = 5;
    for (const c of corners) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(c.x - handleSize, c.y - handleSize, handleSize * 2, handleSize * 2);
      ctx.strokeStyle = WALL_SELECTED_COLOR;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - handleSize, c.y - handleSize, handleSize * 2, handleSize * 2);
    }
  }

  // --- 選択中家具のリサイズハンドル ---
  function drawFurnitureSelectionHandles(ctx: CanvasRenderingContext2D, item: FurnitureItem) {
    const pos = worldToScreen({ x: item.position[0], y: item.position[2] });
    const sw = item.scale[0] * pxPerM;
    const sd = item.scale[2] * pxPerM;

    const corners = [
      { x: pos.x - sw / 2, y: pos.y - sd / 2 },
      { x: pos.x + sw / 2, y: pos.y - sd / 2 },
      { x: pos.x + sw / 2, y: pos.y + sd / 2 },
      { x: pos.x - sw / 2, y: pos.y + sd / 2 },
    ];

    const handleSize = 6;
    for (let ci = 0; ci < corners.length; ci++) {
      const c = corners[ci];
      const isActive = resizingFurnitureId === item.id && resizeCornerIndex === ci;

      // ハンドル背景
      ctx.fillStyle = isActive ? WALL_SELECTED_COLOR : '#FFFFFF';
      ctx.fillRect(c.x - handleSize, c.y - handleSize, handleSize * 2, handleSize * 2);
      ctx.strokeStyle = WALL_SELECTED_COLOR;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - handleSize, c.y - handleSize, handleSize * 2, handleSize * 2);

      // リサイズ方向の矢印インジケーター（対角線）
      if (!isActive) {
        const dx = ci === 0 || ci === 3 ? 1 : -1;
        const dy = ci === 0 || ci === 1 ? 1 : -1;
        ctx.strokeStyle = WALL_SELECTED_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x - dx * 3, c.y - dy * 3);
        ctx.lineTo(c.x + dx * 3, c.y + dy * 3);
        ctx.stroke();
      }
    }

    // 寸法表示（選択時常時）
    const dimText = `${item.scale[0].toFixed(2)} x ${item.scale[2].toFixed(2)}m`;
    ctx.save();
    ctx.font = '9px "Inter", "Segoe UI", sans-serif';
    const dm = ctx.measureText(dimText);
    ctx.fillStyle = 'rgba(30, 64, 175, 0.75)';
    ctx.beginPath();
    ctx.roundRect(pos.x - dm.width / 2 - 3, pos.y + sd / 2 + 6, dm.width + 6, 14, 2);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dimText, pos.x, pos.y + sd / 2 + 13);
    ctx.restore();
  }

  // --- 開口部ヒットテスト（ワールド座標で判定） ---
  function findOpeningAtPoint(point: Point2D, threshold: number): Opening | null {
    for (const opening of openings) {
      const wall = walls.find((w) => w.id === opening.wallId);
      if (!wall) continue;

      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      // 開口部の中心位置（ワールド座標）
      const t = opening.positionAlongWall / len;
      const ox = wall.start.x + dx * t;
      const oy = wall.start.y + dy * t;

      const dist = Math.sqrt((point.x - ox) ** 2 + (point.y - oy) ** 2);
      if (dist < threshold) return opening;
    }
    return null;
  }

  // --- マウス位置を壁上に射影してpositionAlongWallを計算 ---
  function getPositionAlongWall(wall: WallSegment, point: Point2D): number {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return 0;

    const t = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / (len * len);
    // 壁の範囲内にクランプ（開口部の幅分のマージンを残す）
    return Math.max(0.3, Math.min(len - 0.3, t * len));
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
      ctx.fillStyle = '#FAFBFC';
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
      ctx.fillStyle = '#FAFBFC';
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

  // --- 開口部選択ハイライト ---
  function drawOpeningSelectionHighlight(ctx: CanvasRenderingContext2D, op: Opening) {
    const wall = walls.find((w) => w.id === op.wallId);
    if (!wall) return;

    const angle = wallAngle(wall);
    const len = wallLength(wall);
    if (len === 0) return;

    const t = op.positionAlongWall / len;
    const cx = wall.start.x + (wall.end.x - wall.start.x) * t;
    const cy = wall.start.y + (wall.end.y - wall.start.y) * t;
    const center = worldToScreen({ x: cx, y: cy });
    const widthPx = op.width * pxPerM;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);

    // 選択枠（破線）
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-widthPx / 2 - 4, -12, widthPx + 8, 24);
    ctx.setLineDash([]);

    // 四隅のハンドル
    const handleSize = 4;
    const corners = [
      { x: -widthPx / 2 - 4, y: -12 },
      { x: widthPx / 2 + 4, y: -12 },
      { x: widthPx / 2 + 4, y: 12 },
      { x: -widthPx / 2 - 4, y: 12 },
    ];
    for (const c of corners) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(c.x - handleSize, c.y - handleSize, handleSize * 2, handleSize * 2);
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x - handleSize, c.y - handleSize, handleSize * 2, handleSize * 2);
    }

    ctx.restore();
  }

  // --- ドラッグ中の壁上ガイドライン ---
  function drawOpeningDragGuide(ctx: CanvasRenderingContext2D, op: Opening) {
    const wall = walls.find((w) => w.id === op.wallId);
    if (!wall) return;

    const s = worldToScreen(wall.start);
    const e = worldToScreen(wall.end);

    // 壁全体をハイライト（ドラッグ範囲を示す）
    ctx.save();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 6;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // --- 家具描画（タイプ別上面図） ---
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

    // スタイルパレットから家具の描画色を取得
    const palette = STYLE_PRESETS[style as keyof typeof STYLE_PRESETS]?.furniturePalette;
    const color = item.color || (palette?.primary ?? '#888888');
    const catColor = getCategoryColor(item.type);

    switch (item.type) {
      case 'chair':
      case 'stool':
        drawChairTopView(ctx, sw, sd, color, selected, item.type === 'stool');
        break;
      case 'table_square':
        drawTableTopView(ctx, sw, sd, color, selected);
        break;
      case 'table_round':
        drawRoundTableTopView(ctx, sw, sd, color, selected);
        break;
      case 'counter':
        drawCounterTopView(ctx, sw, sd, color, selected);
        break;
      case 'sofa':
        drawSofaTopView(ctx, sw, sd, color, selected);
        break;
      case 'plant':
        drawPlantTopView(ctx, sw, sd, color, selected);
        break;
      case 'shelf':
      case 'bookcase':
        drawShelfTopView(ctx, sw, sd, color, selected);
        break;
      case 'sink':
        drawSinkTopView(ctx, sw, sd, color, selected);
        break;
      case 'fridge':
      case 'wardrobe':
        drawBoxWithDoorTopView(ctx, sw, sd, color, selected);
        break;
      case 'mirror':
        drawMirrorTopView(ctx, sw, sd, color, selected);
        break;
      case 'display_case':
        drawDisplayCaseTopView(ctx, sw, sd, color, selected);
        break;
      case 'register':
        drawRegisterTopView(ctx, sw, sd, color, selected);
        break;
      case 'pendant_light':
        drawPendantTopView(ctx, sw, sd, color, selected);
        break;
      case 'partition':
        drawPartitionTopView(ctx, sw, sd, color, selected);
        break;
      case 'reception_desk':
      case 'kitchen_island':
        drawIslandTopView(ctx, sw, sd, color, selected);
        break;
      case 'desk':
        drawDeskTopView(ctx, sw, sd, color, selected);
        break;
      case 'bar_table':
        drawRoundTableTopView(ctx, sw, sd, color, selected);
        break;
      case 'coat_rack':
        drawCoatRackTopView(ctx, sw, sd, color, selected);
        break;
      default:
        // デフォルト矩形
        ctx.fillStyle = color + '40';
        ctx.fillRect(-sw / 2, -sd / 2, sw, sd);
        ctx.strokeStyle = selected ? WALL_SELECTED_COLOR : color;
        ctx.lineWidth = selected ? 2 : 1;
        ctx.strokeRect(-sw / 2, -sd / 2, sw, sd);
        break;
    }

    // 回転方向インジケーター（小三角矢印 — 上向きが前面）
    const arrowSize = Math.min(sw, sd) * 0.2;
    if (arrowSize > 3) {
      ctx.fillStyle = selected ? WALL_SELECTED_COLOR : (catColor + 'AA');
      ctx.beginPath();
      ctx.moveTo(0, -sd / 2 - 2);
      ctx.lineTo(-arrowSize / 2, -sd / 2 + arrowSize - 2);
      ctx.lineTo(arrowSize / 2, -sd / 2 + arrowSize - 2);
      ctx.closePath();
      ctx.fill();
    }

    // 選択時の青グロー枠
    if (selected) {
      ctx.strokeStyle = WALL_SELECTED_COLOR;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      const glowPad = 3;
      ctx.strokeRect(-sw / 2 - glowPad, -sd / 2 - glowPad, sw + glowPad * 2, sd + glowPad * 2);

      // グロー効果
      ctx.shadowColor = 'rgba(59, 130, 246, 0.4)';
      ctx.shadowBlur = 8;
      ctx.strokeRect(-sw / 2 - glowPad, -sd / 2 - glowPad, sw + glowPad * 2, sd + glowPad * 2);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // カテゴリカラーの小さなインジケータードット（左上角）
    if (!selected) {
      ctx.fillStyle = catColor;
      ctx.beginPath();
      ctx.arc(-sw / 2 + 4, -sd / 2 + 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ラベル
    ctx.fillStyle = selected ? '#1E40AF' : '#374151';
    ctx.font = selected ? 'bold 10px "Inter", "Segoe UI", sans-serif' : '10px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 名前ラベル背景（読みやすさ向上）
    const labelMetrics = ctx.measureText(item.name);
    if (labelMetrics.width > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.roundRect(-labelMetrics.width / 2 - 2, -6, labelMetrics.width + 4, 12, 2);
      ctx.fill();
    }
    ctx.fillStyle = selected ? '#1E40AF' : '#374151';
    ctx.fillText(item.name, 0, 0);

    ctx.restore();
  }

  // 椅子の上面図（背もたれ付き）
  function drawChairTopView(
    ctx: CanvasRenderingContext2D,
    w: number, d: number,
    color: string, selected: boolean,
    isStool: boolean
  ) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;

    if (isStool) {
      // スツール: 円形
      const r = Math.max(w, d) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = color + '40';
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW;
      ctx.stroke();
    } else {
      // 椅子: 座面 + 背もたれ
      const seatH = d * 0.7;
      const backH = d * 0.3;

      // 座面
      ctx.fillStyle = color + '40';
      ctx.fillRect(-w / 2, -seatH / 2, w, seatH);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW;
      ctx.strokeRect(-w / 2, -seatH / 2, w, seatH);

      // 背もたれ（上部に厚い帯）
      ctx.fillStyle = color + '70';
      ctx.fillRect(-w / 2, -seatH / 2 - backH, w, backH);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineW;
      ctx.strokeRect(-w / 2, -seatH / 2 - backH, w, backH);
    }
  }

  // テーブルの上面図（矩形 + 脚マーク）
  function drawTableTopView(
    ctx: CanvasRenderingContext2D,
    w: number, d: number,
    color: string, selected: boolean
  ) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;

    // テーブル天板
    ctx.fillStyle = color + '30';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, d);

    // 四隅の脚マーク
    const legSize = Math.min(w, d) * 0.1;
    const inset = legSize;
    const legs = [
      { x: -w / 2 + inset, y: -d / 2 + inset },
      { x: w / 2 - inset, y: -d / 2 + inset },
      { x: w / 2 - inset, y: d / 2 - inset },
      { x: -w / 2 + inset, y: d / 2 - inset },
    ];
    ctx.fillStyle = color + '80';
    for (const leg of legs) {
      ctx.beginPath();
      ctx.arc(leg.x, leg.y, legSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 丸テーブルの上面図
  function drawRoundTableTopView(
    ctx: CanvasRenderingContext2D,
    w: number, d: number,
    color: string, selected: boolean
  ) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    const r = Math.max(w, d) / 2;

    // 天板
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color + '30';
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // 中央脚マーク
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = color + '80';
    ctx.fill();
  }

  // カウンターの上面図（ハッチング付き長い矩形）
  function drawCounterTopView(
    ctx: CanvasRenderingContext2D,
    w: number, d: number,
    color: string, selected: boolean
  ) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;

    // カウンター本体
    ctx.fillStyle = color + '30';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, d);

    // ハッチング（斜線）
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    ctx.clip();

    ctx.strokeStyle = color + '30';
    ctx.lineWidth = 0.5;
    const step = Math.max(6, Math.min(w, d) * 0.15);
    for (let i = -w - d; i < w + d; i += step) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + i, -d / 2);
      ctx.lineTo(-w / 2 + i + d, d / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ソファの上面図
  function drawSofaTopView(
    ctx: CanvasRenderingContext2D,
    w: number, d: number,
    color: string, selected: boolean
  ) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    const armW = w * 0.12;
    const backD = d * 0.25;

    // 背もたれ
    ctx.fillStyle = color + '50';
    ctx.fillRect(-w / 2, -d / 2, w, backD);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, backD);

    // 座面
    ctx.fillStyle = color + '30';
    ctx.fillRect(-w / 2 + armW, -d / 2 + backD, w - armW * 2, d - backD);
    ctx.strokeStyle = stroke;
    ctx.strokeRect(-w / 2 + armW, -d / 2 + backD, w - armW * 2, d - backD);

    // 左アーム
    ctx.fillStyle = color + '50';
    ctx.fillRect(-w / 2, -d / 2 + backD, armW, d - backD);
    ctx.strokeStyle = stroke;
    ctx.strokeRect(-w / 2, -d / 2 + backD, armW, d - backD);

    // 右アーム
    ctx.fillRect(w / 2 - armW, -d / 2 + backD, armW, d - backD);
    ctx.strokeRect(w / 2 - armW, -d / 2 + backD, armW, d - backD);
  }

  // 観葉植物の上面図
  function drawPlantTopView(
    ctx: CanvasRenderingContext2D,
    w: number, d: number,
    color: string, selected: boolean
  ) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    const r = Math.max(w, d) / 2;

    // 葉っぱ風の複数円
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const ox = Math.cos(angle) * r * 0.3;
      const oy = Math.sin(angle) * r * 0.3;
      ctx.beginPath();
      ctx.arc(ox, oy, r * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = color + '25';
      ctx.fill();
    }

    // 外周円
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.stroke();

    // 中央の鉢
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#8B7355';
    ctx.fill();
  }

  // 棚/本棚の上面図（横線ハッチング付き矩形）
  function drawShelfTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    ctx.fillStyle = color + '30';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    // 棚板を示す横線
    ctx.strokeStyle = color + '50';
    ctx.lineWidth = 0.5;
    const shelves = 4;
    for (let i = 1; i < shelves; i++) {
      const y = -d / 2 + (d / shelves) * i;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 2, y);
      ctx.lineTo(w / 2 - 2, y);
      ctx.stroke();
    }
  }

  // シンクの上面図（矩形＋内側の楕円）
  function drawSinkTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    ctx.fillStyle = color + '25';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    // シンク穴
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.3, d * 0.3, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 蛇口
    ctx.beginPath();
    ctx.arc(0, -d * 0.35, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();
  }

  // 冷蔵庫/ワードローブの上面図（矩形+中央分割線）
  function drawBoxWithDoorTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    ctx.fillStyle = color + '30';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    // ドア分割線
    ctx.beginPath();
    ctx.moveTo(0, -d / 2 + 2);
    ctx.lineTo(0, d / 2 - 2);
    ctx.strokeStyle = color + '60';
    ctx.lineWidth = 1;
    ctx.stroke();
    // 取っ手
    ctx.beginPath();
    ctx.arc(-3, 0, 2, 0, Math.PI * 2);
    ctx.arc(3, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();
  }

  // 鏡の上面図（薄い矩形）
  function drawMirrorTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    const thickness = Math.max(d, 4);
    ctx.fillStyle = '#C0D8E8' + '50';
    ctx.fillRect(-w / 2, -thickness / 2, w, thickness);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -thickness / 2, w, thickness);
  }

  // ショーケースの上面図（矩形+点線ガラス）
  function drawDisplayCaseTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    ctx.fillStyle = color + '20';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.setLineDash([]);
    // 内側棚
    ctx.strokeStyle = color + '40';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, 0);
    ctx.lineTo(w / 2 - 3, 0);
    ctx.stroke();
  }

  // レジの上面図（矩形+スクリーン）
  function drawRegisterTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    ctx.fillStyle = color + '40';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    // スクリーン
    ctx.fillStyle = '#334155';
    ctx.fillRect(-w * 0.3, -d * 0.35, w * 0.6, d * 0.3);
  }

  // ペンダントライトの上面図（同心円）
  function drawPendantTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    const r = Math.max(w, d) / 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color + '20';
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.stroke();
    // 電球
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF8E1';
    ctx.fill();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // パーティションの上面図（薄い長方形）
  function drawPartitionTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    const thickness = Math.max(d, 4);
    ctx.fillStyle = color + '40';
    ctx.fillRect(-w / 2, -thickness / 2, w, thickness);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -thickness / 2, w, thickness);
    // ハッチング
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, -thickness / 2, w, thickness);
    ctx.clip();
    ctx.strokeStyle = color + '30';
    ctx.lineWidth = 0.5;
    for (let i = -w; i < w; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, -thickness / 2);
      ctx.lineTo(i + thickness, thickness / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // アイランド/レセプションの上面図（矩形+天板オーバーハング）
  function drawIslandTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    // 本体
    ctx.fillStyle = color + '35';
    ctx.fillRect(-w / 2 + 3, -d / 2 + 3, w - 6, d - 6);
    // 天板（はみ出し）
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    // ハッチング
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, -d / 2, w, d);
    ctx.clip();
    ctx.strokeStyle = color + '25';
    ctx.lineWidth = 0.5;
    const step = 8;
    for (let i = -w - d; i < w + d; i += step) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + i, -d / 2);
      ctx.lineTo(-w / 2 + i + d, d / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // デスクの上面図（矩形+引き出し）
  function drawDeskTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    ctx.fillStyle = color + '30';
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    // 引き出し領域
    ctx.strokeStyle = color + '50';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(w * 0.1, -d / 2 + 2, w * 0.35, d - 4);
    // 取っ手
    ctx.beginPath();
    ctx.arc(w * 0.28, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#888';
    ctx.fill();
  }

  // コートラックの上面図（中心円+放射状フック）
  function drawCoatRackTopView(ctx: CanvasRenderingContext2D, w: number, d: number, color: string, selected: boolean) {
    const stroke = selected ? WALL_SELECTED_COLOR : color;
    const lineW = selected ? 2 : 1;
    const r = Math.max(w, d) / 2;
    // ベース
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = color + '25';
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.stroke();
    // 中央ポール
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    // フック放射線
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 4, Math.sin(angle) * 4);
      ctx.lineTo(Math.cos(angle) * r * 0.5, Math.sin(angle) * r * 0.5);
      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // --- 家具ドラッグ中のガイドライン（壁からの距離表示） ---
  function drawFurnitureDragGuides(ctx: CanvasRenderingContext2D, item: FurnitureItem) {
    const fx = item.position[0];
    const fz = item.position[2];
    const pos = worldToScreen({ x: fx, y: fz });

    ctx.save();

    // 最近の壁への距離ガイド（上下左右）
    const directions = [
      { dx: 0, dy: -1, label: '上' }, // 上
      { dx: 0, dy: 1, label: '下' },  // 下
      { dx: -1, dy: 0, label: '左' }, // 左
      { dx: 1, dy: 0, label: '右' },  // 右
    ];

    for (const dir of directions) {
      let nearestDist = Infinity;
      let nearestWallPt: Point2D | null = null;

      for (const wall of walls) {
        const segDist = pointToSegmentDist({ x: fx, y: fz }, wall.start, wall.end);
        // 方向フィルター: この方向にある壁だけ
        const wallMidX = (wall.start.x + wall.end.x) / 2;
        const wallMidY = (wall.start.y + wall.end.y) / 2;
        const toWallX = wallMidX - fx;
        const toWallY = wallMidY - fz;
        const dot = toWallX * dir.dx + toWallY * dir.dy;

        if (dot > 0 && segDist < nearestDist) {
          nearestDist = segDist;
          // 射影点
          const ddx = wall.end.x - wall.start.x;
          const ddy = wall.end.y - wall.start.y;
          const lenSq = ddx * ddx + ddy * ddy;
          if (lenSq > 0) {
            let t = ((fx - wall.start.x) * ddx + (fz - wall.start.y) * ddy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            nearestWallPt = { x: wall.start.x + t * ddx, y: wall.start.y + t * ddy };
          }
        }
      }

      if (nearestWallPt && nearestDist < 5) {
        const wallScreen = worldToScreen(nearestWallPt);

        // ガイドライン
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(wallScreen.x, wallScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // 距離ラベル
        const midX = (pos.x + wallScreen.x) / 2;
        const midY = (pos.y + wallScreen.y) / 2;
        const label = `${nearestDist.toFixed(2)}m`;

        ctx.font = '9px "Inter", "Segoe UI", sans-serif';
        const metrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
        ctx.beginPath();
        ctx.roundRect(midX - metrics.width / 2 - 2, midY - 6, metrics.width + 4, 12, 2);
        ctx.fill();
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);
      }
    }

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
    ctx.fillStyle = 'rgba(250,251,252,0.9)';
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

    // プレビューも矩形で描画
    const thicknessPx = 0.12 * pxPerM;
    const angle = Math.atan2(e.y - s.y, e.x - s.x);
    const halfThick = Math.max(thicknessPx, 4) / 2;
    const nnx = -Math.sin(angle) * halfThick;
    const nny = Math.cos(angle) * halfThick;

    ctx.beginPath();
    ctx.moveTo(s.x + nnx, s.y + nny);
    ctx.lineTo(e.x + nnx, e.y + nny);
    ctx.lineTo(e.x - nnx, e.y - nny);
    ctx.lineTo(s.x - nnx, s.y - nny);
    ctx.closePath();
    ctx.fillStyle = 'rgba(59,130,246,0.15)';
    ctx.fill();
    ctx.strokeStyle = PREVIEW_WALL_COLOR;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'miter';
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
              // 連続描画モード: 壁の終点を次の始点にする
              startDrawingWall(endPt);
            }
          }
          break;
        }
        case 'select': {
          const raw = screenToWorld(sp.x, sp.y);

          // ダブルクリック検出（クイック家具ピッカー）
          const now = Date.now();
          const clickDist = Math.sqrt((sp.x - lastClickPos.current.x) ** 2 + (sp.y - lastClickPos.current.y) ** 2);
          if (now - lastClickTime.current < 350 && clickDist < 10) {
            // ダブルクリック: 空きエリアかチェック
            let isEmptyArea = true;
            for (const f of furniture) {
              const fx = f.position[0]; const fz = f.position[2];
              const hw = f.scale[0] / 2; const hd = f.scale[2] / 2;
              if (raw.x >= fx - hw && raw.x <= fx + hw && raw.y >= fz - hd && raw.y <= fz + hd) {
                isEmptyArea = false; break;
              }
            }
            for (const wall of walls) {
              if (pointToSegmentDist(raw, wall.start, wall.end) < wall.thickness + 0.15) {
                isEmptyArea = false; break;
              }
            }
            if (isEmptyArea) {
              const canvas = canvasRef.current;
              if (canvas) {
                const rect = canvas.getBoundingClientRect();
                setQuickPickerPos({
                  screen: {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  },
                  world: { x: raw.x, y: raw.y },
                });
              }
              lastClickTime.current = 0;
              break;
            }
          }
          lastClickTime.current = now;
          lastClickPos.current = { x: sp.x, y: sp.y };

          // クイックピッカーを閉じる
          if (quickPickerPos) {
            setQuickPickerPos(null);
          }

          // 開口部ヒットテスト（最優先: 壁より手前に描画されるため）
          const hitOpening = findOpeningAtPoint(raw, 0.4);
          if (hitOpening) {
            setSelectedOpeningId(hitOpening.id);
            setDraggingOpeningId(hitOpening.id);
            setSelectedWall(null);
            setSelectedFurniture(null);
            break;
          }

          // 家具リサイズハンドルヒットテスト（選択中の家具のコーナー）
          if (selectedFurnitureId) {
            const sf = furniture.find(f => f.id === selectedFurnitureId);
            if (sf) {
              const pos = worldToScreen({ x: sf.position[0], y: sf.position[2] });
              const sw = sf.scale[0] * pxPerM;
              const sd = sf.scale[2] * pxPerM;
              const corners = [
                { x: pos.x - sw / 2, y: pos.y - sd / 2 },
                { x: pos.x + sw / 2, y: pos.y - sd / 2 },
                { x: pos.x + sw / 2, y: pos.y + sd / 2 },
                { x: pos.x - sw / 2, y: pos.y + sd / 2 },
              ];
              const handleHitSize = 8;
              for (let ci = 0; ci < corners.length; ci++) {
                if (Math.abs(sp.x - corners[ci].x) < handleHitSize && Math.abs(sp.y - corners[ci].y) < handleHitSize) {
                  setResizingFurnitureId(sf.id);
                  setResizeCornerIndex(ci);
                  resizeStart.current = {
                    mouseWorld: raw,
                    origScale: [...sf.scale] as [number, number, number],
                    origPos: [...sf.position] as [number, number, number],
                  };
                  break;
                }
              }
              if (resizingFurnitureId) break;
            }
          }

          // 家具ヒットテスト（壁より手前）
          let hitFurn: string | null = null;
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
              // ドラッグ開始（オフセットを記録）
              dragFurnitureOffset.current = {
                dx: raw.x - fx,
                dz: raw.y - fz,
              };
              setDraggingFurnitureId(f.id);
              break;
            }
          }

          // 壁ヒットテスト
          let hitWall: string | null = null;
          if (!hitFurn) {
            for (const wall of walls) {
              if (pointToSegmentDist(raw, wall.start, wall.end) < wall.thickness + 0.15) {
                hitWall = wall.id;
                break;
              }
            }
          }

          setSelectedWall(hitWall);
          setSelectedFurniture(hitFurn);
          setSelectedOpeningId(null);
          break;
        }
        case 'delete': {
          const rawDel = screenToWorld(sp.x, sp.y);
          // 開口部の削除（最優先）
          const hitOpDel = findOpeningAtPoint(rawDel, 0.4);
          if (hitOpDel) {
            deleteOpening(hitOpDel.id);
            if (selectedOpeningId === hitOpDel.id) setSelectedOpeningId(null);
            return;
          }
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
        case 'measure': {
          const rawMeasure = screenToWorld(sp.x, sp.y);
          if (!measuringStart) {
            setMeasuringStart(rawMeasure);
          } else {
            const dist = Math.sqrt(
              (rawMeasure.x - measuringStart.x) ** 2 +
              (rawMeasure.y - measuringStart.y) ** 2
            );
            setMeasurements(prev => [...prev, {
              start: measuringStart,
              end: rawMeasure,
              distance: dist,
            }]);
            setMeasuringStart(null);
          }
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeTool,
      isDrawingWall,
      wallDrawStart,
      walls,
      openings,
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
      deleteOpening,
      deleteFurniture,
      selectedOpeningId,
      measuringStart,
      selectedFurnitureId,
      quickPickerPos,
      worldToScreen,
      pxPerM,
      addFurniture,
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

      // 開口部ドラッグ中: マウス位置を壁上に射影して位置を更新
      if (draggingOpeningId) {
        const dragOp = openings.find((o) => o.id === draggingOpeningId);
        if (dragOp) {
          const wall = walls.find((w) => w.id === dragOp.wallId);
          if (wall) {
            const rawPt = screenToWorld(sp.x, sp.y);
            const newPos = getPositionAlongWall(wall, rawPt);
            updateOpening(draggingOpeningId, { positionAlongWall: newPos });
          }
        }
      }

      // 家具ドラッグ中: マウス位置に追従（細かいグリッド+壁スナップ付き）
      if (draggingFurnitureId && dragFurnitureOffset.current) {
        const rawPt = screenToWorld(sp.x, sp.y);
        const snappedPt = snapToGrid(rawPt, FURNITURE_SNAP_GRID);
        let newX = snappedPt.x - dragFurnitureOffset.current.dx;
        let newZ = snappedPt.y - dragFurnitureOffset.current.dz;
        const item = furniture.find(f => f.id === draggingFurnitureId);
        if (item) {
          // 壁スナップ: 家具の辺が壁に近い場合にスナップ
          const hw = item.scale[0] / 2;
          const hd = item.scale[2] / 2;
          const edges = [
            { side: 'left', val: newX - hw, axis: 'x' as const },
            { side: 'right', val: newX + hw, axis: 'x' as const },
            { side: 'top', val: newZ - hd, axis: 'y' as const },
            { side: 'bottom', val: newZ + hd, axis: 'y' as const },
          ];
          const snapLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
          for (const wall of walls) {
            for (const edge of edges) {
              // 壁の各端点から垂直/水平壁辺を検出してスナップ
              for (const wp of [wall.start, wall.end]) {
                if (edge.axis === 'x') {
                  const diff = Math.abs(edge.val - wp.x);
                  if (diff < WALL_SNAP_DISTANCE) {
                    newX += (wp.x - edge.val);
                    snapLines.push({ x1: wp.x, y1: newZ - hd - 0.3, x2: wp.x, y2: newZ + hd + 0.3 });
                  }
                } else {
                  const diff = Math.abs(edge.val - wp.y);
                  if (diff < WALL_SNAP_DISTANCE) {
                    newZ += (wp.y - edge.val);
                    snapLines.push({ x1: newX - hw - 0.3, y1: wp.y, x2: newX + hw + 0.3, y2: wp.y });
                  }
                }
              }
            }
          }
          setWallSnapLines(snapLines);
          moveFurniture(draggingFurnitureId, [newX, item.position[1], newZ]);
        }
      }

      // 家具リサイズ中
      if (resizingFurnitureId && resizeStart.current) {
        const rawPt = screenToWorld(sp.x, sp.y);
        const orig = resizeStart.current;
        const dxW = rawPt.x - orig.mouseWorld.x;
        const dzW = rawPt.y - orig.mouseWorld.y;
        // コーナーインデックス: 0=TL, 1=TR, 2=BR, 3=BL
        const signX = (resizeCornerIndex === 1 || resizeCornerIndex === 2) ? 1 : -1;
        const signZ = (resizeCornerIndex === 2 || resizeCornerIndex === 3) ? 1 : -1;
        const isProportional = !e.shiftKey;
        let newW = Math.max(0.1, orig.origScale[0] + signX * dxW * 2);
        let newD = Math.max(0.1, orig.origScale[2] + signZ * dzW * 2);
        if (isProportional) {
          const ratio = orig.origScale[0] / orig.origScale[2];
          const avgScale = (newW / orig.origScale[0] + newD / orig.origScale[2]) / 2;
          newW = orig.origScale[0] * avgScale;
          newD = orig.origScale[2] * avgScale;
          newW = Math.max(0.1, newW);
          newD = Math.max(0.1, newD);
          // keep ratio
          if (newW / newD !== ratio) {
            newD = newW / ratio;
          }
        }
        const snappedW = Math.round(newW / FURNITURE_SNAP_GRID) * FURNITURE_SNAP_GRID;
        const snappedD = Math.round(newD / FURNITURE_SNAP_GRID) * FURNITURE_SNAP_GRID;
        setResizeDimLabel(`${snappedW.toFixed(2)} x ${snappedD.toFixed(2)}`);
        updateFurniture(resizingFurnitureId, {
          scale: [snappedW, orig.origScale[1], snappedD],
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPanning, pxPerM, getCanvasPoint, getSnappedWorld, draggingOpeningId, openings, walls, screenToWorld, updateOpening, draggingFurnitureId, furniture, moveFurniture, resizingFurnitureId, resizeCornerIndex, updateFurniture]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
    }
    if (draggingOpeningId) {
      setDraggingOpeningId(null);
    }
    if (draggingFurnitureId) {
      setDraggingFurnitureId(null);
      dragFurnitureOffset.current = null;
      setWallSnapLines([]);
    }
    if (resizingFurnitureId) {
      setResizingFurnitureId(null);
      setResizeCornerIndex(-1);
      resizeStart.current = null;
      setResizeDimLabel(null);
    }
  }, [isPanning, draggingOpeningId, draggingFurnitureId, resizingFurnitureId]);

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

  // --- タッチイベント → マウスイベント変換（モバイル対応） ---
  const touchToMouse = useCallback((e: React.TouchEvent<HTMLCanvasElement>): React.MouseEvent<HTMLCanvasElement> | null => {
    if (e.touches.length === 0 && e.changedTouches.length === 0) return null;
    const touch = e.touches[0] || e.changedTouches[0];
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      button: 0,
      buttons: 1,
      preventDefault: () => e.preventDefault(),
      stopPropagation: () => e.stopPropagation(),
      nativeEvent: e.nativeEvent,
      currentTarget: e.currentTarget,
      target: e.target,
    } as unknown as React.MouseEvent<HTMLCanvasElement>;
  }, []);

  const lastTouchDist = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      // ピンチズーム開始
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
      return;
    }
    if (e.touches.length === 1) {
      const mouseEvt = touchToMouse(e);
      if (mouseEvt) handleMouseDown(mouseEvt);
    }
  }, [touchToMouse, handleMouseDown]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      // ピンチズーム
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / lastTouchDist.current;
      setView((v) => ({
        ...v,
        zoom: Math.max(0.1, Math.min(10, v.zoom * ratio)),
      }));
      lastTouchDist.current = dist;
      return;
    }
    if (e.touches.length === 1) {
      const mouseEvt = touchToMouse(e);
      if (mouseEvt) handleMouseMove(mouseEvt);
    }
  }, [touchToMouse, handleMouseMove, setView]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) {
      lastTouchDist.current = null;
      handleMouseUp();
    }
  }, [handleMouseUp]);

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

  // --- rAFベースの再描画ループ ---
  useEffect(() => {
    needsRedraw.current = true;
    const loop = () => {
      if (needsRedraw.current) {
        draw();
        needsRedraw.current = false;
      }
      rafId.current = requestAnimationFrame(loop);
    };
    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [draw]);

  // 状態変更時にredrawフラグを立てる
  useEffect(() => {
    needsRedraw.current = true;
  }, [walls, openings, furniture, mouseWorld, view, draggingFurnitureId, resizingFurnitureId, wallSnapLines]);

  // --- キーボード ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDrawingWall) {
          useUIStore.getState().finishDrawingWall();
        }
        // クイックピッカーを閉じる
        if (quickPickerPos) {
          setQuickPickerPos(null);
        }
        // 計測ツール: 計測中ならキャンセル、そうでなければ全クリア
        if (measuringStart) {
          setMeasuringStart(null);
        } else if (measurements.length > 0) {
          setMeasurements([]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDrawingWall, measuringStart, measurements.length, quickPickerPos]);

  // ツールに応じたカーソル
  const cursorClass = (() => {
    if (resizingFurnitureId) return 'cursor-nwse-resize';
    if (draggingOpeningId || draggingFurnitureId) return 'cursor-grabbing';
    switch (activeTool) {
      case 'wall': return 'cursor-crosshair';
      case 'door': return 'cursor-crosshair';
      case 'window': return 'cursor-crosshair';
      case 'delete': return 'cursor-not-allowed';
      case 'measure': return 'cursor-crosshair';
      case 'select': return 'cursor-default';
      default: return 'cursor-default';
    }
  })();

  // クイック家具ピッカーのアイテム追加ハンドラ
  const handleQuickAddFurniture = useCallback((catalogItem: typeof FURNITURE_CATALOG[0], worldPos: Point2D) => {
    const newItem: FurnitureItem = {
      id: `${catalogItem.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: catalogItem.type,
      name: catalogItem.name,
      position: [worldPos.x, catalogItem.defaultScale[1] / 2, worldPos.y],
      rotation: [0, 0, 0],
      scale: [...catalogItem.defaultScale] as [number, number, number],
      color: catalogItem.defaultColor,
      material: catalogItem.defaultMaterial,
    };
    addFurniture(newItem);
    setQuickPickerPos(null);
  }, [addFurniture]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] bg-[#FAFBFC]"
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 ${cursorClass}`}
        style={{ touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* クイック家具ピッカーポップアップ */}
      {quickPickerPos && (
        <div
          className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-2"
          style={{
            left: Math.min(quickPickerPos.screen.x, (containerRef.current?.clientWidth || 400) - 220),
            top: Math.min(quickPickerPos.screen.y, (containerRef.current?.clientHeight || 400) - 160),
          }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="text-xs text-gray-500 font-medium mb-1.5 px-1">家具を配置</div>
          <div className="grid grid-cols-5 gap-1" style={{ width: 200 }}>
            {QUICK_FURNITURE_ITEMS.map((item) => (
              <button
                key={item.type}
                className="flex flex-col items-center justify-center p-1.5 rounded hover:bg-blue-50 transition-colors text-center"
                title={item.name}
                onClick={() => handleQuickAddFurniture(item, quickPickerPos.world)}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-[8px] text-gray-500 mt-0.5 leading-tight truncate w-full">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* 座標表示 */}
      <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm px-3 py-1.5 text-xs text-gray-500 rounded-md shadow-sm border border-gray-200 pointer-events-none font-mono">
        <span className="text-gray-400">X:</span> {mouseWorld.x.toFixed(2)}m{' '}
        <span className="text-gray-400 ml-1">Y:</span> {mouseWorld.y.toFixed(2)}m
        <span className="ml-2 text-gray-400">|</span>
        <span className="ml-2 text-blue-500 font-medium">{view.zoom.toFixed(1)}x</span>
      </div>
    </div>
  );
}

// --- 閉ループ検出（壁の端点グラフから複数ループ対応） ---
function findClosedLoops(walls: WallSegment[]): Point2D[][] {
  const EPS = 0.05;
  const pointKey = (p: Point2D) => `${Math.round(p.x / EPS) * EPS},${Math.round(p.y / EPS) * EPS}`;

  // 隣接リストを構築
  const adj = new Map<string, { point: Point2D; neighbors: Set<string> }>();

  for (const wall of walls) {
    const sk = pointKey(wall.start);
    const ek = pointKey(wall.end);

    if (!adj.has(sk)) adj.set(sk, { point: wall.start, neighbors: new Set() });
    if (!adj.has(ek)) adj.set(ek, { point: wall.end, neighbors: new Set() });

    adj.get(sk)!.neighbors.add(ek);
    adj.get(ek)!.neighbors.add(sk);
  }

  const nodes = Array.from(adj.entries());
  if (nodes.length < 3) return [];

  // 辺セット（方向付き）を管理して、各辺を最大2つのループで使用
  const usedEdges = new Map<string, number>(); // edge key -> usage count
  const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

  const loops: Point2D[][] = [];

  // 各ノードから右手法則でループ追跡を試みる
  function traceLoop(startKey: string, initialAngle: number): Point2D[] | null {
    const startNode = adj.get(startKey);
    if (!startNode) return null;

    const loop: Point2D[] = [startNode.point];
    let currentKey = startKey;
    let prevAngle = initialAngle;
    const loopVisited = new Set<string>([startKey]);
    const loopEdges: string[] = [];

    for (let step = 0; step < 100; step++) {
      const node = adj.get(currentKey);
      if (!node || node.neighbors.size === 0) return null;

      let bestKey: string | null = null;
      let bestAngle = Infinity;

      for (const nk of node.neighbors) {
        const neighbor = adj.get(nk);
        if (!neighbor) continue;

        const ek = edgeKey(currentKey, nk);
        if ((usedEdges.get(ek) ?? 0) >= 2) continue;

        const angle = Math.atan2(
          neighbor.point.y - node.point.y,
          neighbor.point.x - node.point.x
        );

        let relAngle = angle - (prevAngle + Math.PI);
        while (relAngle < 0) relAngle += Math.PI * 2;
        while (relAngle >= Math.PI * 2) relAngle -= Math.PI * 2;

        if (relAngle < bestAngle) {
          bestAngle = relAngle;
          bestKey = nk;
        }
      }

      if (!bestKey) return null;

      const ek = edgeKey(currentKey, bestKey);
      loopEdges.push(ek);

      if (bestKey === startKey && step >= 2) {
        // ループ完成 - 使用した辺をマーク
        for (const e of loopEdges) {
          usedEdges.set(e, (usedEdges.get(e) ?? 0) + 1);
        }
        return loop;
      }

      if (loopVisited.has(bestKey) && bestKey !== startKey) return null;

      const nextNode = adj.get(bestKey)!;
      prevAngle = Math.atan2(
        nextNode.point.y - node.point.y,
        nextNode.point.x - node.point.x
      );

      loopVisited.add(bestKey);
      loop.push(nextNode.point);
      currentKey = bestKey;
    }
    return null;
  }

  // 全ノードの全辺方向からループ追跡を試みる
  for (const [key, data] of nodes) {
    for (const neighborKey of data.neighbors) {
      const ek = edgeKey(key, neighborKey);
      if ((usedEdges.get(ek) ?? 0) >= 2) continue;

      const neighbor = adj.get(neighborKey);
      if (!neighbor) continue;

      // neighborからkeyに来た方向
      const incomingAngle = Math.atan2(
        data.point.y - neighbor.point.y,
        data.point.x - neighbor.point.x
      );

      const loop = traceLoop(key, incomingAngle);
      if (loop && loop.length >= 3) {
        // 面積が極小でないか確認
        let area = 0;
        for (let i = 0; i < loop.length; i++) {
          const j = (i + 1) % loop.length;
          area += loop[i].x * loop[j].y;
          area -= loop[j].x * loop[i].y;
        }
        if (Math.abs(area / 2) > 0.1) {
          loops.push(loop);
        }
      }
    }
  }

  // 重複ループ除去（同じ頂点セットを持つループ）
  const unique: Point2D[][] = [];
  const loopKeys = new Set<string>();
  for (const loop of loops) {
    const sorted = loop
      .map(p => pointKey(p))
      .sort()
      .join(',');
    if (!loopKeys.has(sorted)) {
      loopKeys.add(sorted);
      unique.push(loop);
    }
  }

  return unique;
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

