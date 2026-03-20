'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import type { CorrectionTool } from '@/types/blueprint';
import {
  parseScale,
  mmToCanvas,
  canvasToMm,
  pointInPolygon,
  distanceMm,
  snapToGrid,
  snapToNearestPoint,
  snapToWallLine,
  distanceToSegment,
} from '@/lib/blueprint-geometry';
import { showToast } from '@/components/correction/Toast';

/**
 * PDF補正キャンバス (CAD品質)
 * レイヤー順: PDF背景 → グリッド → 部屋ポリゴン → 壁線 → 什器 → 室名 → 頂点ハンドル → 選択ハイライト → スナップインジケータ → 測定線 → ルーラー
 */
export default function CorrectionCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfImageRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);

  // ドラッグ状態
  const isPanningRef = useRef(false);
  const isDraggingVertexRef = useRef(false);
  const isDraggingFixtureRef = useRef(false);
  const isDraggingWallRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const dragStartMmRef = useRef({ x_mm: 0, y_mm: 0 });
  const spaceHeldRef = useRef(false);
  const ctrlHeldRef = useRef(false);
  const shiftHeldRef = useRef(false);

  // addRoom ポリゴン描画状態
  const newRoomPointsRef = useRef<[number, number][]>([]);
  const currentMouseMmRef = useRef<{ x_mm: number; y_mm: number } | null>(null);

  // スナップインジケータ
  const snapIndicatorRef = useRef<{ x: number; y: number; type: string } | null>(null);

  // ホバー状態
  const [hoveredRoomIdx, setHoveredRoomIdx] = useState<number | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; name: string; area: number } | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [showHint, setShowHint] = useState(true);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);
  const [mousePosMm, setMousePosMm] = useState<{ x: number; y: number } | null>(null);

  // ストアから個別セレクタで取得
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const pdfInfo = useCorrectionStore((s) => s.pdfInfo);
  const zoom = useCorrectionStore((s) => s.zoom);
  const panX = useCorrectionStore((s) => s.panX);
  const panY = useCorrectionStore((s) => s.panY);
  const selectedRoomIdx = useCorrectionStore((s) => s.selectedRoomIdx);
  const selectedFixtureIdx = useCorrectionStore((s) => s.selectedFixtureIdx);
  const selectedVertexIdx = useCorrectionStore((s) => s.selectedVertexIdx);
  const selectedWallIdx = useCorrectionStore((s) => s.selectedWallIdx);
  const activeTool = useCorrectionStore((s) => s.activeTool);
  const snapEnabled = useCorrectionStore((s) => s.snapEnabled);
  const snapGrid = useCorrectionStore((s) => s.snapGrid);
  const gridVisible = useCorrectionStore((s) => s.gridVisible);
  const layers = useCorrectionStore((s) => s.layers);
  const pdfOpacity = useCorrectionStore((s) => s.pdfOpacity);
  const wallAddPoints = useCorrectionStore((s) => s.wallAddPoints);
  const measurePoints = useCorrectionStore((s) => s.measurePoints);

  const setZoom = useCorrectionStore((s) => s.setZoom);
  const setPan = useCorrectionStore((s) => s.setPan);
  const selectRoom = useCorrectionStore((s) => s.selectRoom);
  const selectFixture = useCorrectionStore((s) => s.selectFixture);
  const selectVertex = useCorrectionStore((s) => s.selectVertex);
  const selectWall = useCorrectionStore((s) => s.selectWall);
  const setActiveTool = useCorrectionStore((s) => s.setActiveTool);
  const moveVertex = useCorrectionStore((s) => s.moveVertex);
  const moveFixture = useCorrectionStore((s) => s.moveFixture);
  const addRoom = useCorrectionStore((s) => s.addRoom);
  const deleteRoom = useCorrectionStore((s) => s.deleteRoom);
  const addWall = useCorrectionStore((s) => s.addWall);
  const deleteWall = useCorrectionStore((s) => s.deleteWall);
  const moveWall = useCorrectionStore((s) => s.moveWall);
  const setWallAddPoints = useCorrectionStore((s) => s.setWallAddPoints);
  const setMeasurePoints = useCorrectionStore((s) => s.setMeasurePoints);

  // --- 座標変換ヘルパー ---
  const effectiveDpi = pdfInfo?.dpi ?? 150;
  const effectivePageHeightPx = pdfInfo?.pageHeightPx ?? (blueprint ? (blueprint.room.depth_mm / parseScale(blueprint.scale_detected)) * effectiveDpi / 25.4 : 1000);

  const toCanvas = useCallback(
    (x_mm: number, y_mm: number) => {
      if (!blueprint) return { cx: 0, cy: 0 };
      const scale = parseScale(blueprint.scale_detected);
      return mmToCanvas(x_mm, y_mm, scale, effectiveDpi, effectivePageHeightPx, zoom, panX, panY);
    },
    [blueprint, effectiveDpi, effectivePageHeightPx, zoom, panX, panY]
  );

  const toMm = useCallback(
    (cx: number, cy: number) => {
      if (!blueprint) return { x_mm: 0, y_mm: 0 };
      const scale = parseScale(blueprint.scale_detected);
      return canvasToMm(cx, cy, scale, effectiveDpi, effectivePageHeightPx, zoom, panX, panY);
    },
    [blueprint, effectiveDpi, effectivePageHeightPx, zoom, panX, panY]
  );

  // --- スナップ処理 ---
  const applySnap = useCallback(
    (x_mm: number, y_mm: number): { x_mm: number; y_mm: number; snapType: string | null } => {
      if (!snapEnabled || !blueprint) return { x_mm, y_mm, snapType: null };

      const gridSize = shiftHeldRef.current ? 10 : snapGrid;

      // 1. 頂点スナップ (最優先)
      const allVertices: [number, number][] = [];
      for (const room of blueprint.rooms) {
        for (const pt of room.polygon_mm) {
          allVertices.push(pt);
        }
      }
      const vertexSnap = snapToNearestPoint(x_mm, y_mm, allVertices, 15 * (parseScale(blueprint.scale_detected) / zoom));
      if (vertexSnap) {
        return { x_mm: vertexSnap[0], y_mm: vertexSnap[1], snapType: 'vertex' };
      }

      // 2. 壁スナップ
      const wallSnap = snapToWallLine(x_mm, y_mm, blueprint.walls, 15 * (parseScale(blueprint.scale_detected) / zoom));
      if (wallSnap) {
        return { x_mm: wallSnap.point[0], y_mm: wallSnap.point[1], snapType: wallSnap.type };
      }

      // 3. グリッドスナップ
      const [gx, gy] = snapToGrid(x_mm, y_mm, gridSize);
      return { x_mm: gx, y_mm: gy, snapType: 'grid' };
    },
    [snapEnabled, snapGrid, blueprint, zoom]
  );

  // 軸ロック (Ctrl押下時)
  const applyAxisLock = useCallback(
    (x_mm: number, y_mm: number, refX: number, refY: number): { x_mm: number; y_mm: number } => {
      if (!ctrlHeldRef.current) return { x_mm, y_mm };
      const dx = Math.abs(x_mm - refX);
      const dy = Math.abs(y_mm - refY);
      if (dx > dy) {
        return { x_mm, y_mm: refY };
      } else {
        return { x_mm: refX, y_mm };
      }
    },
    []
  );

  // --- PDF背景画像の読み込み ---
  useEffect(() => {
    if (!pdfInfo?.imageUrl) {
      pdfImageRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => { pdfImageRef.current = img; };
    img.src = pdfInfo.imageUrl;
  }, [pdfInfo?.imageUrl]);

  // --- ResizeObserver ---
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- オートフィット ---
  useEffect(() => {
    if (!blueprint || hasAutoFitted) return;
    const container = containerRef.current;
    if (!container) return;
    const { width: cw, height: ch } = container.getBoundingClientRect();
    if (cw === 0 || ch === 0) return;

    let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
    for (const room of blueprint.rooms) {
      for (const pt of room.polygon_mm) {
        const { cx, cy } = mmToCanvas(pt[0], pt[1], parseScale(blueprint.scale_detected), effectiveDpi, effectivePageHeightPx, 1, 0, 0);
        minCx = Math.min(minCx, cx);
        minCy = Math.min(minCy, cy);
        maxCx = Math.max(maxCx, cx);
        maxCy = Math.max(maxCy, cy);
      }
    }
    if (!isFinite(minCx)) return;

    const bboxW = maxCx - minCx;
    const bboxH = maxCy - minCy;
    const padding = 80;
    const fitZoom = Math.min((cw - padding * 2) / Math.max(bboxW, 1), (ch - padding * 2) / Math.max(bboxH, 1), 3);
    const centerBboxX = (minCx + maxCx) / 2;
    const centerBboxY = (minCy + maxCy) / 2;
    setZoom(fitZoom);
    setPan(cw / 2 - centerBboxX * fitZoom, ch / 2 - centerBboxY * fitZoom);
    setHasAutoFitted(true);
  }, [blueprint, hasAutoFitted, effectiveDpi, effectivePageHeightPx, setZoom, setPan]);

  // --- 描画 ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const canvasW = canvas.width / dpr;
    const canvasH = canvas.height / dpr;
    ctx.clearRect(0, 0, canvasW, canvasH);

    // 背景色 (ダークテーマ)
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Layer 0: PDF背景
    if (layers.pdf && pdfImageRef.current && pdfInfo) {
      ctx.globalAlpha = pdfOpacity;
      ctx.drawImage(pdfImageRef.current, panX, panY, pdfInfo.pageWidthPx * zoom, pdfInfo.pageHeightPx * zoom);
      ctx.globalAlpha = 1;
    }

    // Layer 1: グリッド
    if (layers.grid && gridVisible) {
      // ズームに応じてグリッド密度を自動調整
      let gridMm = 1000;
      if (zoom > 0.4) gridMm = 100;
      if (zoom > 2) gridMm = 10;

      // mmグリッドをキャンバスピクセルに変換
      if (blueprint) {
        const scale = parseScale(blueprint.scale_detected);
        const mmPerPx = (25.4 / effectiveDpi) * scale;
        const gridPx = (gridMm / mmPerPx) * zoom;

        if (gridPx > 4) {
          // 細いグリッド線
          ctx.strokeStyle = 'rgba(74, 106, 138, 0.15)';
          ctx.lineWidth = 0.5;

          const startMmX = toMm(0, 0);
          const endMmX = toMm(canvasW, canvasH);

          const gStartX = Math.floor(startMmX.x_mm / gridMm) * gridMm;
          const gEndX = Math.ceil(endMmX.x_mm / gridMm) * gridMm;
          const gStartY = Math.floor(endMmX.y_mm / gridMm) * gridMm;
          const gEndY = Math.ceil(startMmX.y_mm / gridMm) * gridMm;

          for (let x = gStartX; x <= gEndX; x += gridMm) {
            const { cx } = toCanvas(x, 0);
            const isMajor = x % (gridMm * 10) === 0;
            ctx.strokeStyle = isMajor ? 'rgba(74, 106, 138, 0.3)' : 'rgba(74, 106, 138, 0.12)';
            ctx.lineWidth = isMajor ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, canvasH);
            ctx.stroke();
          }
          for (let y = gStartY; y <= gEndY; y += gridMm) {
            const { cy } = toCanvas(0, y);
            const isMajor = y % (gridMm * 10) === 0;
            ctx.strokeStyle = isMajor ? 'rgba(74, 106, 138, 0.3)' : 'rgba(74, 106, 138, 0.12)';
            ctx.lineWidth = isMajor ? 1 : 0.5;
            ctx.beginPath();
            ctx.moveTo(0, cy);
            ctx.lineTo(canvasW, cy);
            ctx.stroke();
          }
        }
      }
    }

    if (!blueprint) return;

    // Layer 2: 部屋ポリゴン
    if (layers.rooms) {
      for (let i = 0; i < blueprint.rooms.length; i++) {
        const room = blueprint.rooms[i];
        if (!room.polygon_mm || room.polygon_mm.length < 3) continue;
        if (!room.center_mm || room.center_mm.length < 2) continue;
        const confidence = room.confidence;
        const isLowConfidence = room.name === '不明' || room.name === '' || (confidence !== undefined && confidence < 0.5);
        const isMediumConfidence = !isLowConfidence && confidence !== undefined && confidence < 0.8;
        const isSelected = selectedRoomIdx === i;
        const isHovered = hoveredRoomIdx === i && !isSelected;

        ctx.beginPath();
        const first = toCanvas(room.polygon_mm[0][0], room.polygon_mm[0][1]);
        ctx.moveTo(first.cx, first.cy);
        for (let j = 1; j < room.polygon_mm.length; j++) {
          const p = toCanvas(room.polygon_mm[j][0], room.polygon_mm[j][1]);
          ctx.lineTo(p.cx, p.cy);
        }
        ctx.closePath();

        if (isLowConfidence) {
          ctx.fillStyle = isHovered ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.15)';
        } else if (isMediumConfidence) {
          ctx.fillStyle = isHovered ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.15)';
        } else {
          ctx.fillStyle = isHovered ? 'rgba(74, 144, 217, 0.25)' : 'rgba(74, 144, 217, 0.1)';
        }
        ctx.fill();

        ctx.strokeStyle = isLowConfidence ? '#ef4444' : isMediumConfidence ? '#f59e0b' : '#4a90d9';
        ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
        ctx.stroke();
      }
    }

    // Layer 3: 壁線
    if (layers.walls) {
      for (let i = 0; i < blueprint.walls.length; i++) {
        const wall = blueprint.walls[i];
        const start = toCanvas(wall.start_x_mm, wall.start_y_mm);
        const end = toCanvas(wall.end_x_mm, wall.end_y_mm);
        const isWallSelected = selectedWallIdx === i;

        ctx.beginPath();
        ctx.moveTo(start.cx, start.cy);
        ctx.lineTo(end.cx, end.cy);
        ctx.strokeStyle = isWallSelected ? '#f97316' : '#8ba4c4';
        ctx.lineWidth = isWallSelected ? 3 : 1.5;
        ctx.stroke();

        // 壁選択時にエンドポイント表示
        if (isWallSelected) {
          for (const pt of [start, end]) {
            ctx.beginPath();
            ctx.arc(pt.cx, pt.cy, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f97316';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }
    }

    // Layer 3.5: 寸法線
    if (layers.dimensions && zoom > 0.3) {
      ctx.font = `${Math.max(8, 9 * zoom)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const wall of blueprint.walls) {
        const start = toCanvas(wall.start_x_mm, wall.start_y_mm);
        const end = toCanvas(wall.end_x_mm, wall.end_y_mm);
        const midX = (start.cx + end.cx) / 2;
        const midY = (start.cy + end.cy) / 2;
        const dx = wall.end_x_mm - wall.start_x_mm;
        const dy = wall.end_y_mm - wall.start_y_mm;
        const lengthMm = Math.round(Math.sqrt(dx * dx + dy * dy));
        if (lengthMm < 200) continue;

        const label = `${lengthMm}`;
        const metrics = ctx.measureText(label);
        ctx.fillStyle = 'rgba(13, 27, 42, 0.85)';
        ctx.fillRect(midX - metrics.width / 2 - 3, midY - 11, metrics.width + 6, 13);
        ctx.fillStyle = '#8ba4c4';
        ctx.fillText(label, midX, midY);
      }
    }

    // Layer 4: 什器
    if (layers.fixtures) {
      for (let i = 0; i < blueprint.fixtures.length; i++) {
        const fix = blueprint.fixtures[i];
        const center = toCanvas(fix.x_mm, fix.y_mm);
        const corner1 = toCanvas(fix.x_mm - fix.width_mm / 2, fix.y_mm - fix.depth_mm / 2);
        const corner2 = toCanvas(fix.x_mm + fix.width_mm / 2, fix.y_mm + fix.depth_mm / 2);
        const w = Math.abs(corner2.cx - corner1.cx);
        const h = Math.abs(corner2.cy - corner1.cy);

        ctx.save();
        ctx.translate(center.cx, center.cy);
        ctx.rotate((-fix.rotation_deg * Math.PI) / 180);
        ctx.strokeStyle = selectedFixtureIdx === i ? '#4ade80' : '#22c55e80';
        ctx.lineWidth = selectedFixtureIdx === i ? 2 : 1;
        ctx.setLineDash(selectedFixtureIdx === i ? [] : [3, 2]);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Layer 5: 室名ラベル
    if (layers.labels) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const room of blueprint.rooms) {
        if (!room.center_mm || isNaN(room.center_mm[0])) continue;
        const c = toCanvas(room.center_mm[0], room.center_mm[1]);
        const isUnknown = room.name === '不明' || room.name === '';

        const labelFont = `${Math.max(10, 12 * zoom)}px sans-serif`;
        ctx.font = labelFont;
        ctx.fillStyle = isUnknown ? '#ef4444' : '#4a90d9';
        ctx.fillText(room.name || '不明', c.cx, c.cy);

        ctx.font = `${Math.max(8, 9 * zoom)}px monospace`;
        ctx.fillStyle = '#6b8ab5';
        ctx.fillText(`${room.area_m2}m2`, c.cx, c.cy + Math.max(11, 14 * zoom));
      }
    }

    // Layer 6: 頂点ハンドル (選択中の部屋のみ)
    if (selectedRoomIdx !== null && blueprint.rooms[selectedRoomIdx]) {
      const room = blueprint.rooms[selectedRoomIdx];
      for (let v = 0; v < room.polygon_mm.length; v++) {
        if (isNaN(room.polygon_mm[v][0]) || isNaN(room.polygon_mm[v][1])) continue;
        const p = toCanvas(room.polygon_mm[v][0], room.polygon_mm[v][1]);
        const isActiveVertex = selectedVertexIdx === v;

        // 外枠
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, isActiveVertex ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isActiveVertex ? '#f59e0b' : '#4a90d9';
        ctx.fill();
        ctx.strokeStyle = '#0d1b2a';
        ctx.lineWidth = 2;
        ctx.stroke();
        // 内枠
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, isActiveVertex ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }

    // Layer 7: 選択ハイライト
    if (selectedRoomIdx !== null && blueprint.rooms[selectedRoomIdx]) {
      const room = blueprint.rooms[selectedRoomIdx];
      if (room.polygon_mm.length >= 3) {
        ctx.beginPath();
        const f = toCanvas(room.polygon_mm[0][0], room.polygon_mm[0][1]);
        ctx.moveTo(f.cx, f.cy);
        for (let j = 1; j < room.polygon_mm.length; j++) {
          const p = toCanvas(room.polygon_mm[j][0], room.polygon_mm[j][1]);
          ctx.lineTo(p.cx, p.cy);
        }
        ctx.closePath();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Layer 8: addRoom 描画中ポリゴン
    if (activeTool === 'addRoom' && newRoomPointsRef.current.length > 0) {
      const pts = newRoomPointsRef.current;
      const mouseMm = currentMouseMmRef.current;

      ctx.beginPath();
      const p0 = toCanvas(pts[0][0], pts[0][1]);
      ctx.moveTo(p0.cx, p0.cy);
      for (let i = 1; i < pts.length; i++) {
        const p = toCanvas(pts[i][0], pts[i][1]);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (mouseMm) {
        const lastPt = toCanvas(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        const mouseC = toCanvas(mouseMm.x_mm, mouseMm.y_mm);
        ctx.beginPath();
        ctx.moveTo(lastPt.cx, lastPt.cy);
        ctx.lineTo(mouseC.cx, mouseC.cy);
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(mouseC.cx, mouseC.cy);
          ctx.lineTo(p0.cx, p0.cy);
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
          ctx.stroke();
        }
        ctx.setLineDash([]);

        ctx.font = '11px monospace';
        ctx.fillStyle = '#22c55e';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${pts.length}pt (2x click)`, mouseC.cx + 14, mouseC.cy - 6);
      }

      for (let i = 0; i < pts.length; i++) {
        const p = toCanvas(pts[i][0], pts[i][1]);
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#f59e0b' : '#22c55e';
        ctx.fill();
        ctx.strokeStyle = '#0d1b2a';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Layer 8.5: wallAdd 描画中
    if (activeTool === 'wallAdd' && wallAddPoints.length > 0) {
      const pts = wallAddPoints;
      const p0 = toCanvas(pts[0][0], pts[0][1]);

      ctx.beginPath();
      ctx.arc(p0.cx, p0.cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.fill();
      ctx.strokeStyle = '#0d1b2a';
      ctx.lineWidth = 2;
      ctx.stroke();

      const mouseMm = currentMouseMmRef.current;
      if (mouseMm) {
        const mouseC = toCanvas(mouseMm.x_mm, mouseMm.y_mm);
        ctx.beginPath();
        ctx.moveTo(p0.cx, p0.cy);
        ctx.lineTo(mouseC.cx, mouseC.cy);
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        // 距離表示
        const dist = Math.round(Math.hypot(mouseMm.x_mm - pts[0][0], mouseMm.y_mm - pts[0][1]));
        ctx.font = '11px monospace';
        ctx.fillStyle = '#f97316';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${dist}mm`, (p0.cx + mouseC.cx) / 2, (p0.cy + mouseC.cy) / 2 - 8);
      }
    }

    // Layer 9: 測定線
    if (measurePoints.length > 0) {
      for (let i = 0; i < measurePoints.length; i++) {
        const p = toCanvas(measurePoints[i][0], measurePoints[i][1]);
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#e879f9';
        ctx.fill();
        ctx.strokeStyle = '#0d1b2a';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (measurePoints.length >= 2) {
        const p0 = toCanvas(measurePoints[0][0], measurePoints[0][1]);
        const p1 = toCanvas(measurePoints[1][0], measurePoints[1][1]);

        ctx.beginPath();
        ctx.moveTo(p0.cx, p0.cy);
        ctx.lineTo(p1.cx, p1.cy);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        const dist = Math.round(Math.hypot(measurePoints[1][0] - measurePoints[0][0], measurePoints[1][1] - measurePoints[0][1]));
        const midCx = (p0.cx + p1.cx) / 2;
        const midCy = (p0.cy + p1.cy) / 2;

        // 背景ボックス
        ctx.font = 'bold 12px monospace';
        const label = `${dist}mm`;
        const tm = ctx.measureText(label);
        ctx.fillStyle = 'rgba(13, 27, 42, 0.9)';
        ctx.fillRect(midCx - tm.width / 2 - 6, midCy - 18, tm.width + 12, 22);
        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 1;
        ctx.strokeRect(midCx - tm.width / 2 - 6, midCy - 18, tm.width + 12, 22);
        ctx.fillStyle = '#e879f9';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midCx, midCy - 7);
      }

      // マウス位置への破線プレビュー (測定中 & 1点目のみ)
      if (measurePoints.length === 1 && currentMouseMmRef.current) {
        const p0 = toCanvas(measurePoints[0][0], measurePoints[0][1]);
        const mouseC = toCanvas(currentMouseMmRef.current.x_mm, currentMouseMmRef.current.y_mm);
        ctx.beginPath();
        ctx.moveTo(p0.cx, p0.cy);
        ctx.lineTo(mouseC.cx, mouseC.cy);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = 'rgba(232, 121, 249, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);

        const dist = Math.round(Math.hypot(
          currentMouseMmRef.current.x_mm - measurePoints[0][0],
          currentMouseMmRef.current.y_mm - measurePoints[0][1]
        ));
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(232, 121, 249, 0.7)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${dist}mm`, (p0.cx + mouseC.cx) / 2, (p0.cy + mouseC.cy) / 2 - 4);
      }
    }

    // Layer 10: スナップインジケータ
    const snapInd = snapIndicatorRef.current;
    if (snapInd && snapEnabled) {
      const { cx: sx, cy: sy } = toCanvas(snapInd.x, snapInd.y);

      if (snapInd.type === 'vertex') {
        // ダイヤモンド
        ctx.beginPath();
        ctx.moveTo(sx, sy - 8);
        ctx.lineTo(sx + 8, sy);
        ctx.lineTo(sx, sy + 8);
        ctx.lineTo(sx - 8, sy);
        ctx.closePath();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (snapInd.type === 'endpoint') {
        // 四角
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 6, sy - 6, 12, 12);
      } else if (snapInd.type === 'midpoint') {
        // 三角
        ctx.beginPath();
        ctx.moveTo(sx, sy - 7);
        ctx.lineTo(sx + 7, sy + 5);
        ctx.lineTo(sx - 7, sy + 5);
        ctx.closePath();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (snapInd.type === 'grid') {
        // 十字線
        ctx.strokeStyle = 'rgba(74, 144, 217, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, canvasH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(canvasW, sy);
        ctx.stroke();
      }
    }

    // Layer 11: ルーラー (上辺・左辺)
    const RULER_SIZE = 20;

    // 上辺ルーラー
    ctx.fillStyle = 'rgba(13, 27, 42, 0.92)';
    ctx.fillRect(RULER_SIZE, 0, canvasW - RULER_SIZE, RULER_SIZE);
    // 左辺ルーラー
    ctx.fillRect(0, RULER_SIZE, RULER_SIZE, canvasH - RULER_SIZE);
    // 角
    ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);

    if (blueprint) {
      const scale = parseScale(blueprint.scale_detected);

      // 上辺の目盛り
      ctx.font = '8px monospace';
      ctx.fillStyle = '#4a6a8a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      let rulerStep = 1000;
      if (zoom > 0.5) rulerStep = 500;
      if (zoom > 1) rulerStep = 100;
      if (zoom > 2.5) rulerStep = 50;

      const leftMm = toMm(RULER_SIZE, 0);
      const rightMm = toMm(canvasW, 0);
      const startXmm = Math.floor(leftMm.x_mm / rulerStep) * rulerStep;
      const endXmm = Math.ceil(rightMm.x_mm / rulerStep) * rulerStep;

      for (let xmm = startXmm; xmm <= endXmm; xmm += rulerStep) {
        const { cx } = toCanvas(xmm, 0);
        if (cx < RULER_SIZE || cx > canvasW) continue;
        const isMajor = xmm % (rulerStep * 5) === 0;
        ctx.strokeStyle = isMajor ? '#6b8ab5' : '#3a5a7a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, isMajor ? 0 : RULER_SIZE * 0.5);
        ctx.lineTo(cx, RULER_SIZE);
        ctx.stroke();
        if (isMajor) {
          ctx.fillText(String(xmm), cx, 1);
        }
      }

      // 左辺の目盛り
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const topMm = toMm(0, RULER_SIZE);
      const bottomMm = toMm(0, canvasH);
      const startYmm = Math.floor(bottomMm.y_mm / rulerStep) * rulerStep;
      const endYmm = Math.ceil(topMm.y_mm / rulerStep) * rulerStep;

      for (let ymm = startYmm; ymm <= endYmm; ymm += rulerStep) {
        const { cy } = toCanvas(0, ymm);
        if (cy < RULER_SIZE || cy > canvasH) continue;
        const isMajor = ymm % (rulerStep * 5) === 0;
        ctx.strokeStyle = isMajor ? '#6b8ab5' : '#3a5a7a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(isMajor ? 0 : RULER_SIZE * 0.5, cy);
        ctx.lineTo(RULER_SIZE, cy);
        ctx.stroke();
        if (isMajor) {
          ctx.save();
          ctx.translate(9, cy);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String(ymm), 0, 0);
          ctx.restore();
        }
      }

      // ルーラーのマウス位置マーカー
      if (mousePosMm) {
        const { cx: mCx, cy: mCy } = toCanvas(mousePosMm.x, mousePosMm.y);
        ctx.fillStyle = '#f59e0b';
        // 上辺マーカー
        ctx.beginPath();
        ctx.moveTo(mCx - 3, RULER_SIZE);
        ctx.lineTo(mCx + 3, RULER_SIZE);
        ctx.lineTo(mCx, RULER_SIZE - 4);
        ctx.closePath();
        ctx.fill();
        // 左辺マーカー
        ctx.beginPath();
        ctx.moveTo(RULER_SIZE, mCy - 3);
        ctx.lineTo(RULER_SIZE, mCy + 3);
        ctx.lineTo(RULER_SIZE - 4, mCy);
        ctx.closePath();
        ctx.fill();
      }
    }

    // ルーラー境界線
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(RULER_SIZE, 0);
    ctx.lineTo(RULER_SIZE, canvasH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, RULER_SIZE);
    ctx.lineTo(canvasW, RULER_SIZE);
    ctx.stroke();

  }, [blueprint, pdfInfo, zoom, panX, panY, selectedRoomIdx, selectedFixtureIdx, selectedVertexIdx, selectedWallIdx, hoveredRoomIdx, toCanvas, toMm, activeTool, layers, gridVisible, pdfOpacity, snapEnabled, wallAddPoints, measurePoints, mousePosMm, effectiveDpi]);

  // 描画ループ
  useEffect(() => {
    const render = () => {
      draw();
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // --- キーボードイベント ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        spaceHeldRef.current = true;
        return;
      }
      if (e.key === 'Control') { ctrlHeldRef.current = true; return; }
      if (e.key === 'Shift') { shiftHeldRef.current = true; return; }

      // Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        useCorrectionStore.getState().undo();
        return;
      }
      // Ctrl+Y / Ctrl+Shift+Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        useCorrectionStore.getState().redo();
        return;
      }
      // Ctrl+0: 全体表示
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        // ツールバーのfitAllロジックを呼ぶ代わりに簡易版
        const containerEl = document.querySelector('[data-correction-canvas]');
        if (containerEl) {
          const cw = containerEl.clientWidth;
          const ch = containerEl.clientHeight;
          const state = useCorrectionStore.getState();
          const bp = state.blueprint;
          if (bp) {
            const scale = parseScale(bp.scale_detected);
            const dpi = state.pdfInfo?.dpi ?? 150;
            const pageH = state.pdfInfo?.pageHeightPx ?? (bp.room.depth_mm / scale) * dpi / 25.4;
            let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
            for (const room of bp.rooms) {
              for (const pt of room.polygon_mm) {
                const { cx, cy } = mmToCanvas(pt[0], pt[1], scale, dpi, pageH, 1, 0, 0);
                if (cx < minCx) minCx = cx; if (cy < minCy) minCy = cy;
                if (cx > maxCx) maxCx = cx; if (cy > maxCy) maxCy = cy;
              }
            }
            if (isFinite(minCx)) {
              const bW = maxCx - minCx;
              const bH = maxCy - minCy;
              const fz = Math.min((cw - 120) / Math.max(bW, 1), (ch - 120) / Math.max(bH, 1), 3);
              state.setZoom(fz);
              state.setPan(cw / 2 - ((minCx + maxCx) / 2) * fz, ch / 2 - ((minCy + maxCy) / 2) * fz);
            }
          }
        }
        return;
      }

      // Delete
      if (e.key === 'Delete') {
        const state = useCorrectionStore.getState();
        if (state.selectedWallIdx !== null) {
          state.deleteWall(state.selectedWallIdx);
          showToast('壁を削除しました');
        } else if (state.selectedRoomIdx !== null) {
          state.deleteRoom(state.selectedRoomIdx);
          showToast('部屋を削除しました');
        }
        return;
      }
      // Escape
      if (e.key === 'Escape') {
        if (newRoomPointsRef.current.length > 0) {
          newRoomPointsRef.current = [];
          currentMouseMmRef.current = null;
        }
        const state = useCorrectionStore.getState();
        state.selectRoom(null);
        state.selectFixture(null);
        state.selectWall(null);
        state.setWallAddPoints([]);
        state.setMeasurePoints([]);
        state.setActiveTool('select');
        return;
      }

      // ツールショートカット
      const toolShortcuts: Record<string, CorrectionTool> = {
        'v': 'select', 'V': 'select',
        'n': 'editName', 'N': 'editName',
        'm': 'moveVertex', 'M': 'moveVertex',
        'w': 'wallAdd', 'W': 'wallAdd',
        'r': 'measure', 'R': 'measure',
      };
      const toolAction = toolShortcuts[e.key];
      if (toolAction) {
        useCorrectionStore.getState().setActiveTool(toolAction);
        return;
      }

      // G: グリッド切替
      if (e.key === 'g' || e.key === 'G') {
        const s = useCorrectionStore.getState();
        s.setGridVisible(!s.gridVisible);
        return;
      }
      // S: スナップ切替
      if (e.key === 's' || e.key === 'S') {
        const s = useCorrectionStore.getState();
        s.setSnapEnabled(!s.snapEnabled);
        return;
      }
      // 1-7: レイヤー切替
      const layerKeys = ['1', '2', '3', '4', '5', '6', '7'];
      const layerNames: (keyof typeof layers)[] = ['pdf', 'grid', 'rooms', 'walls', 'fixtures', 'labels', 'dimensions'];
      const layerIdx = layerKeys.indexOf(e.key);
      if (layerIdx >= 0) {
        const s = useCorrectionStore.getState();
        const lk = layerNames[layerIdx];
        s.setLayerVisible(lk, !s.layers[lk]);
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeldRef.current = false;
      if (e.key === 'Control') ctrlHeldRef.current = false;
      if (e.key === 'Shift') shiftHeldRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // --- ホイール ---
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = zoom * factor;
      setZoom(newZoom);
      setPan(mx - (mx - panX) * factor, my - (my - panY) * factor);
    },
    [zoom, panX, panY, setZoom, setPan]
  );

  // --- マウスダウン ---
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      lastMouseRef.current = { x: mx, y: my };

      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        isPanningRef.current = true;
        e.preventDefault();
        return;
      }

      if (e.button !== 0 || !blueprint) return;

      const mm = toMm(mx, my);
      const snapped = applySnap(mm.x_mm, mm.y_mm);
      dragStartMmRef.current = { x_mm: snapped.x_mm, y_mm: snapped.y_mm };

      // measure ツール
      if (activeTool === 'measure') {
        if (measurePoints.length < 2) {
          setMeasurePoints([...measurePoints, [snapped.x_mm, snapped.y_mm]]);
        } else {
          setMeasurePoints([[snapped.x_mm, snapped.y_mm]]);
        }
        return;
      }

      // wallAdd ツール
      if (activeTool === 'wallAdd') {
        if (wallAddPoints.length === 0) {
          setWallAddPoints([[snapped.x_mm, snapped.y_mm]]);
        } else {
          // 2点目: 壁追加
          addWall(wallAddPoints[0][0], wallAddPoints[0][1], snapped.x_mm, snapped.y_mm);
          showToast('壁を追加しました');
        }
        return;
      }

      // wallDelete ツール
      if (activeTool === 'wallDelete') {
        const scale = parseScale(blueprint.scale_detected);
        const thresholdMm = (12 / zoom) * scale;
        for (let i = 0; i < blueprint.walls.length; i++) {
          const w = blueprint.walls[i];
          const d = distanceToSegment(mm.x_mm, mm.y_mm, w.start_x_mm, w.start_y_mm, w.end_x_mm, w.end_y_mm);
          if (d < thresholdMm) {
            deleteWall(i);
            showToast('壁を削除しました');
            return;
          }
        }
        return;
      }

      // wallMove ツール
      if (activeTool === 'wallMove') {
        const scale = parseScale(blueprint.scale_detected);
        const thresholdMm = (12 / zoom) * scale;
        for (let i = 0; i < blueprint.walls.length; i++) {
          const w = blueprint.walls[i];
          const d = distanceToSegment(mm.x_mm, mm.y_mm, w.start_x_mm, w.start_y_mm, w.end_x_mm, w.end_y_mm);
          if (d < thresholdMm) {
            selectWall(i);
            isDraggingWallRef.current = true;
            return;
          }
        }
        return;
      }

      // addRoom
      if (activeTool === 'addRoom') {
        newRoomPointsRef.current = [...newRoomPointsRef.current, [snapped.x_mm, snapped.y_mm]];
        return;
      }

      // deleteRoom
      if (activeTool === 'deleteRoom') {
        for (let i = 0; i < blueprint.rooms.length; i++) {
          const room = blueprint.rooms[i];
          if (room.polygon_mm.length >= 3 && pointInPolygon(mm.x_mm, mm.y_mm, room.polygon_mm)) {
            deleteRoom(i);
            showToast('部屋を削除しました');
            return;
          }
        }
        return;
      }

      // 頂点ハンドルドラッグ
      if (selectedRoomIdx !== null && blueprint.rooms[selectedRoomIdx]) {
        const room = blueprint.rooms[selectedRoomIdx];
        const scale = parseScale(blueprint.scale_detected);
        const thresholdMm = (10 / zoom) * scale;
        for (let v = 0; v < room.polygon_mm.length; v++) {
          const d = distanceMm([mm.x_mm, mm.y_mm], room.polygon_mm[v]);
          if (d < thresholdMm) {
            selectVertex(v);
            isDraggingVertexRef.current = true;
            return;
          }
        }
      }

      // 壁クリック判定 (selectツール)
      if (activeTool === 'select') {
        const scale = parseScale(blueprint.scale_detected);
        const thresholdMm = (8 / zoom) * scale;
        for (let i = 0; i < blueprint.walls.length; i++) {
          const w = blueprint.walls[i];
          const d = distanceToSegment(mm.x_mm, mm.y_mm, w.start_x_mm, w.start_y_mm, w.end_x_mm, w.end_y_mm);
          if (d < thresholdMm) {
            selectWall(i);
            return;
          }
        }
      }

      // 什器クリック判定
      for (let i = 0; i < blueprint.fixtures.length; i++) {
        const fix = blueprint.fixtures[i];
        const hw = fix.width_mm / 2;
        const hd = fix.depth_mm / 2;
        if (mm.x_mm >= fix.x_mm - hw && mm.x_mm <= fix.x_mm + hw && mm.y_mm >= fix.y_mm - hd && mm.y_mm <= fix.y_mm + hd) {
          selectFixture(i);
          isDraggingFixtureRef.current = true;
          return;
        }
      }

      // 部屋クリック判定
      for (let i = 0; i < blueprint.rooms.length; i++) {
        const room = blueprint.rooms[i];
        if (room.polygon_mm.length >= 3 && pointInPolygon(mm.x_mm, mm.y_mm, room.polygon_mm)) {
          selectRoom(i);
          return;
        }
      }

      selectRoom(null);
      selectFixture(null);
      selectWall(null);
    },
    [blueprint, zoom, toMm, selectedRoomIdx, selectRoom, selectFixture, selectVertex, selectWall, activeTool, deleteRoom, deleteWall, addWall, applySnap, wallAddPoints, measurePoints, setWallAddPoints, setMeasurePoints]
  );

  // --- マウスムーブ ---
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dx = mx - lastMouseRef.current.x;
      const dy = my - lastMouseRef.current.y;
      lastMouseRef.current = { x: mx, y: my };

      if (showHint) setShowHint(false);

      // マウスmm座標の更新
      const rawMm = toMm(mx, my);
      setMousePosMm({ x: rawMm.x_mm, y: rawMm.y_mm });

      // パン
      if (isPanningRef.current) {
        setCursorStyle('grabbing');
        setPan(panX + dx, panY + dy);
        return;
      }

      // 頂点ドラッグ
      if (isDraggingVertexRef.current && selectedRoomIdx !== null && selectedVertexIdx !== null) {
        setCursorStyle('move');
        let snapped = applySnap(rawMm.x_mm, rawMm.y_mm);
        if (ctrlHeldRef.current && blueprint) {
          const room = blueprint.rooms[selectedRoomIdx];
          const prevVertex = room.polygon_mm[(selectedVertexIdx - 1 + room.polygon_mm.length) % room.polygon_mm.length];
          snapped = { ...applyAxisLock(snapped.x_mm, snapped.y_mm, prevVertex[0], prevVertex[1]), snapType: snapped.snapType };
        }
        snapIndicatorRef.current = snapped.snapType ? { x: snapped.x_mm, y: snapped.y_mm, type: snapped.snapType } : null;
        moveVertex(selectedRoomIdx, selectedVertexIdx, snapped.x_mm, snapped.y_mm);
        return;
      }

      // 什器ドラッグ
      if (isDraggingFixtureRef.current && selectedFixtureIdx !== null && blueprint) {
        setCursorStyle('move');
        const snapped = applySnap(rawMm.x_mm, rawMm.y_mm);
        snapIndicatorRef.current = snapped.snapType ? { x: snapped.x_mm, y: snapped.y_mm, type: snapped.snapType } : null;
        moveFixture(selectedFixtureIdx, snapped.x_mm, snapped.y_mm);
        return;
      }

      // 壁ドラッグ
      if (isDraggingWallRef.current && selectedWallIdx !== null && blueprint) {
        setCursorStyle('move');
        const dxMm = rawMm.x_mm - dragStartMmRef.current.x_mm;
        const dyMm = rawMm.y_mm - dragStartMmRef.current.y_mm;
        moveWall(selectedWallIdx, dxMm, dyMm);
        dragStartMmRef.current = { x_mm: rawMm.x_mm, y_mm: rawMm.y_mm };
        return;
      }

      // ツール別マウス追跡
      if (activeTool === 'addRoom' || activeTool === 'wallAdd' || activeTool === 'measure') {
        const snapped = applySnap(rawMm.x_mm, rawMm.y_mm);
        currentMouseMmRef.current = { x_mm: snapped.x_mm, y_mm: snapped.y_mm };
        snapIndicatorRef.current = snapped.snapType ? { x: snapped.x_mm, y: snapped.y_mm, type: snapped.snapType } : null;
      } else {
        snapIndicatorRef.current = null;
      }

      // ホバー検出
      if (blueprint) {
        // 頂点ハンドル近接
        if (selectedRoomIdx !== null && blueprint.rooms[selectedRoomIdx]) {
          const room = blueprint.rooms[selectedRoomIdx];
          const scale = parseScale(blueprint.scale_detected);
          const thresholdMm = (10 / zoom) * scale;
          for (let v = 0; v < room.polygon_mm.length; v++) {
            const d = distanceMm([rawMm.x_mm, rawMm.y_mm], room.polygon_mm[v]);
            if (d < thresholdMm) {
              setCursorStyle('move');
              setHoveredRoomIdx(null);
              setHoverTooltip(null);
              return;
            }
          }
        }

        // 部屋ホバー
        let foundRoom = false;
        for (let i = 0; i < blueprint.rooms.length; i++) {
          const room = blueprint.rooms[i];
          if (room.polygon_mm.length >= 3 && pointInPolygon(rawMm.x_mm, rawMm.y_mm, room.polygon_mm)) {
            setHoveredRoomIdx(i);
            setHoverTooltip({ x: mx, y: my, name: room.name || '不明', area: room.area_m2 });
            setCursorStyle(
              activeTool === 'addRoom' || activeTool === 'wallAdd' || activeTool === 'measure' ? 'crosshair' :
              activeTool === 'deleteRoom' || activeTool === 'wallDelete' ? 'not-allowed' :
              'pointer'
            );
            foundRoom = true;
            break;
          }
        }
        if (!foundRoom) {
          setHoveredRoomIdx(null);
          setHoverTooltip(null);
          setCursorStyle(
            spaceHeldRef.current ? 'grab' :
            activeTool === 'addRoom' || activeTool === 'wallAdd' || activeTool === 'measure' ? 'crosshair' :
            activeTool === 'deleteRoom' || activeTool === 'wallDelete' ? 'crosshair' :
            'default'
          );
        }
      }
    },
    [panX, panY, setPan, selectedRoomIdx, selectedVertexIdx, selectedFixtureIdx, selectedWallIdx, moveVertex, moveFixture, moveWall, toMm, blueprint, zoom, activeTool, showHint, applySnap, applyAxisLock]
  );

  // --- マウスアップ ---
  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    isDraggingVertexRef.current = false;
    isDraggingFixtureRef.current = false;
    isDraggingWallRef.current = false;
    snapIndicatorRef.current = null;
  }, []);

  // --- ダブルクリック ---
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === 'addRoom' && newRoomPointsRef.current.length >= 3) {
        addRoom(newRoomPointsRef.current, '不明');
        newRoomPointsRef.current = [];
        currentMouseMmRef.current = null;
        setActiveTool('select');
        showToast('部屋を追加しました');
        return;
      }

      if (!blueprint) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const mm = toMm(mx, my);

      for (let i = 0; i < blueprint.rooms.length; i++) {
        const room = blueprint.rooms[i];
        if (room.polygon_mm.length >= 3 && pointInPolygon(mm.x_mm, mm.y_mm, room.polygon_mm)) {
          selectRoom(i);
          setActiveTool('editName');
          return;
        }
      }
    },
    [blueprint, toMm, selectRoom, setActiveTool, activeTool, addRoom]
  );

  return (
    <div ref={containerRef} data-correction-canvas className="relative w-full h-full overflow-hidden bg-[#1a1a2e]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: cursorStyle }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setHoveredRoomIdx(null);
          setHoverTooltip(null);
          setMousePosMm(null);
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* ホバーツールチップ */}
      {hoverTooltip && hoveredRoomIdx !== selectedRoomIdx && (
        <div
          className="absolute z-40 pointer-events-none rounded bg-[#0d1b2a] border border-[#1e3a5f] px-2 py-1 text-[10px] text-[#c8d8e8] shadow-lg"
          style={{ left: `${hoverTooltip.x + 14}px`, top: `${hoverTooltip.y - 8}px` }}
        >
          <span className="font-medium">{hoverTooltip.name}</span>
          <span className="ml-2 text-[#6b8ab5] font-mono">{hoverTooltip.area}m2</span>
        </div>
      )}

      {/* マウス座標表示 (左下) */}
      {mousePosMm && blueprint && (
        <div className="absolute bottom-1 left-6 z-30 bg-[#0d1b2a]/90 border border-[#1e3a5f] rounded px-2 py-0.5 text-[10px] text-[#6b8ab5] font-mono">
          X:{mousePosMm.x} Y:{mousePosMm.y} mm
          {snapEnabled && <span className="ml-2 text-[#f59e0b]">SNAP</span>}
        </div>
      )}

      {/* 操作ヒント */}
      {showHint && blueprint && (
        <div className="absolute bottom-1 right-1 z-30 rounded bg-[#0d1b2a]/80 border border-[#1e3a5f] px-2 py-1 text-[10px] text-[#6b8ab5]">
          Wheel:Zoom | Middle:Pan | Dbl-click:名前 | S:Snap | G:Grid
        </div>
      )}
    </div>
  );
}
