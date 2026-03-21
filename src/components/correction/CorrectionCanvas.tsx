'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import {
  parseScale,
  mmToCanvas,
  canvasToMm,
  pointInPolygon,
  distanceMm,
  distanceToSegment,
  isPolygonSelfIntersecting,
} from '@/lib/blueprint-geometry';
import { showToast } from '@/components/correction/Toast';
import { theme, HIT_THRESHOLD_PX, AUTOFIT_PADDING, AUTOFIT_MAX_ZOOM } from './theme';
import {
  drawPdfBackground,
  drawGrid,
  drawRooms,
  drawCompareOverlay,
  drawWalls,
  drawDimensions,
  drawFixtures,
  drawLabels,
  drawVertexHandles,
  drawHighlight,
  drawAddRoomPreview,
  drawWallAddPreview,
  drawMeasureLine,
  drawSnapIndicator,
  drawRuler,
  type ViewState,
} from './drawLayers';
import {
  applySnap,
  applyAxisLock,
  createKeyDownHandler,
  createKeyUpHandler,
  fitAll,
  type CanvasRefs,
} from './canvasHandlers';
import ContextMenu, { type ContextMenuState } from './ContextMenu';

/**
 * PDF補正キャンバス (CAD品質)
 * 描画: drawLayers.ts / 操作: canvasHandlers.ts / 色定数: theme.ts
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
  const isDraggingAllRef = useRef(false);
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

  // 自己交差警告の重複抑制
  const selfIntersectWarningRef = useRef(false);

  // ホバー状態
  const [hoveredRoomIdx, setHoveredRoomIdx] = useState<number | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; name: string; area: number } | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [showHint, setShowHint] = useState(true);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);
  const [mousePosMm, setMousePosMm] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
  const compareMode = useCorrectionStore((s) => s.compareMode);
  const history = useCorrectionStore((s) => s.history);

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
  const moveAllElements = useCorrectionStore((s) => s.moveAllElements);
  const toggleRoomSelect = useCorrectionStore((s) => s.toggleRoomSelect);
  const clearMultiSelect = useCorrectionStore((s) => s.clearMultiSelect);
  const commitMoveAll = useCorrectionStore((s) => s.commitMoveAll);
  const selectAllRooms = useCorrectionStore((s) => s.selectAllRooms);
  const setWallAddPoints = useCorrectionStore((s) => s.setWallAddPoints);
  const setMeasurePoints = useCorrectionStore((s) => s.setMeasurePoints);
  const addVertexOnEdge = useCorrectionStore((s) => s.addVertexOnEdge);
  const splitRoom = useCorrectionStore((s) => s.splitRoom);

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
        minCx = Math.min(minCx, cx); minCy = Math.min(minCy, cy);
        maxCx = Math.max(maxCx, cx); maxCy = Math.max(maxCy, cy);
      }
    }
    if (!isFinite(minCx)) return;

    const bboxW = maxCx - minCx;
    const bboxH = maxCy - minCy;
    const fitZoom = Math.min((cw - AUTOFIT_PADDING * 2) / Math.max(bboxW, 1), (ch - AUTOFIT_PADDING * 2) / Math.max(bboxH, 1), AUTOFIT_MAX_ZOOM);
    const centerBboxX = (minCx + maxCx) / 2;
    const centerBboxY = (minCy + maxCy) / 2;
    setZoom(fitZoom);
    setPan(cw / 2 - centerBboxX * fitZoom, ch / 2 - centerBboxY * fitZoom);
    setHasAutoFitted(true);
  }, [blueprint, hasAutoFitted, effectiveDpi, effectivePageHeightPx, setZoom, setPan]);

  // --- 不明室ナビゲーション時の自動ズーム ---
  useEffect(() => {
    if (selectedRoomIdx === null || !blueprint || activeTool !== 'editName') return;
    const room = blueprint.rooms[selectedRoomIdx];
    if (!room || room.polygon_mm.length < 3) return;
    const container = containerRef.current;
    if (!container) return;
    const { width: cw, height: ch } = container.getBoundingClientRect();
    if (cw === 0 || ch === 0) return;

    // Calculate room bounding box in image pixels
    let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
    const scale = parseScale(blueprint.scale_detected);
    for (const pt of room.polygon_mm) {
      const { cx, cy } = mmToCanvas(pt[0], pt[1], scale, effectiveDpi, effectivePageHeightPx, 1, 0, 0);
      minCx = Math.min(minCx, cx); minCy = Math.min(minCy, cy);
      maxCx = Math.max(maxCx, cx); maxCy = Math.max(maxCy, cy);
    }

    const padding = 100;
    const bboxW = maxCx - minCx;
    const bboxH = maxCy - minCy;
    const fitZoom = Math.min((cw - padding * 2) / Math.max(bboxW, 1), (ch - padding * 2) / Math.max(bboxH, 1), 3);
    const centerX = (minCx + maxCx) / 2;
    const centerY = (minCy + maxCy) / 2;
    setZoom(fitZoom);
    setPan(cw / 2 - centerX * fitZoom, ch / 2 - centerY * fitZoom);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoomIdx, activeTool]); // intentionally minimal deps for navigation

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

    // 背景色
    ctx.fillStyle = theme.canvasBg;
    ctx.fillRect(0, 0, canvasW, canvasH);

    const vs: ViewState = { zoom, panX, panY, effectiveDpi, effectivePageHeightPx, canvasW, canvasH };

    // Layer 0: PDF背景
    drawPdfBackground(ctx, pdfImageRef.current, pdfInfo, vs, layers, pdfOpacity);

    // Layer 1: グリッド
    if (blueprint) drawGrid(ctx, blueprint, vs, layers, gridVisible);

    if (!blueprint) return;

    // Layer 2-5: 部屋・壁・寸法・什器・ラベル
    drawRooms(ctx, blueprint, vs, layers, selectedRoomIdx, hoveredRoomIdx);
    // Layer 2.5: 比較モード（修正前オーバーレイ）
    drawCompareOverlay(ctx, blueprint, vs, compareMode, history);
    drawWalls(ctx, blueprint, vs, layers, selectedWallIdx);
    drawDimensions(ctx, blueprint, vs, layers);
    drawFixtures(ctx, blueprint, vs, layers, selectedFixtureIdx);
    drawLabels(ctx, blueprint, vs, layers);

    // Layer 6-7: 頂点ハンドル・選択ハイライト
    drawVertexHandles(ctx, blueprint, vs, selectedRoomIdx, selectedVertexIdx);
    drawHighlight(ctx, blueprint, vs, selectedRoomIdx);

    // Layer 8-8.5: 描画中プレビュー
    drawAddRoomPreview(ctx, blueprint, vs, activeTool, newRoomPointsRef.current, currentMouseMmRef.current);
    drawWallAddPreview(ctx, blueprint, vs, activeTool, wallAddPoints, currentMouseMmRef.current);

    // Layer 9: 測定線
    drawMeasureLine(ctx, blueprint, vs, measurePoints, currentMouseMmRef.current);

    // Layer 10: スナップインジケータ
    drawSnapIndicator(ctx, blueprint, vs, snapIndicatorRef.current, snapEnabled);

    // Layer 11: ルーラー
    drawRuler(ctx, blueprint, vs, mousePosMm);
  }, [blueprint, pdfInfo, zoom, panX, panY, selectedRoomIdx, selectedFixtureIdx, selectedVertexIdx, selectedWallIdx, hoveredRoomIdx, activeTool, layers, gridVisible, pdfOpacity, snapEnabled, wallAddPoints, measurePoints, mousePosMm, effectiveDpi, effectivePageHeightPx, compareMode, history]);

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
    const refs: Pick<CanvasRefs, 'spaceHeldRef' | 'ctrlHeldRef' | 'shiftHeldRef' | 'newRoomPointsRef' | 'currentMouseMmRef'> = {
      spaceHeldRef, ctrlHeldRef, shiftHeldRef, newRoomPointsRef, currentMouseMmRef,
    };
    const handleKeyDown = createKeyDownHandler(refs);
    const handleKeyUp = createKeyUpHandler(refs);
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
      const snapped = applySnap(mm.x_mm, mm.y_mm, snapEnabled, snapGrid, blueprint, zoom, shiftHeldRef.current);
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
          addWall(wallAddPoints[0][0], wallAddPoints[0][1], snapped.x_mm, snapped.y_mm);
          showToast('壁を追加しました');
        }
        return;
      }

      // splitRoom ツール
      if (activeTool === 'splitRoom') {
        const pts = [...wallAddPoints, [snapped.x_mm, snapped.y_mm] as [number, number]];
        setWallAddPoints(pts);
        if (pts.length >= 2) {
          // Find room that contains the midpoint of the split line
          const midX = (pts[0][0] + pts[1][0]) / 2;
          const midY = (pts[0][1] + pts[1][1]) / 2;
          for (let i = 0; i < blueprint.rooms.length; i++) {
            if (pointInPolygon(midX, midY, blueprint.rooms[i].polygon_mm)) {
              splitRoom(i, [pts[0], pts[1]]);
              showToast('部屋を分割しました');
              break;
            }
          }
          setWallAddPoints([]);
        }
        return;
      }

      // wallDelete ツール
      if (activeTool === 'wallDelete') {
        const scale = parseScale(blueprint.scale_detected);
        const thresholdMm = (HIT_THRESHOLD_PX / zoom) * scale;
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

      // moveAll ツール
      if (activeTool === 'moveAll') {
        isDraggingAllRef.current = true;
        dragStartMmRef.current = { x_mm: mm.x_mm, y_mm: mm.y_mm };
        return;
      }

      // wallMove ツール
      if (activeTool === 'wallMove') {
        const scale = parseScale(blueprint.scale_detected);
        const thresholdMm = (HIT_THRESHOLD_PX / zoom) * scale;
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
        const thresholdMm = (HIT_THRESHOLD_PX / zoom) * scale;
        for (let v = 0; v < room.polygon_mm.length; v++) {
          const d = distanceMm([mm.x_mm, mm.y_mm], room.polygon_mm[v]);
          if (d < thresholdMm) {
            selectVertex(v);
            isDraggingVertexRef.current = true;
            return;
          }
        }
      }

      // 辺上に頂点追加 (moveVertexツール + 部屋選択時)
      if (activeTool === 'moveVertex' && selectedRoomIdx !== null && blueprint.rooms[selectedRoomIdx]) {
        const room = blueprint.rooms[selectedRoomIdx];
        const scale = parseScale(blueprint.scale_detected);
        const thresholdMm = (HIT_THRESHOLD_PX / zoom) * scale;

        for (let e = 0; e < room.polygon_mm.length; e++) {
          const p1 = room.polygon_mm[e];
          const p2 = room.polygon_mm[(e + 1) % room.polygon_mm.length];
          const d = distanceToSegment(mm.x_mm, mm.y_mm, p1[0], p1[1], p2[0], p2[1]);
          if (d < thresholdMm) {
            // Project click point onto edge
            const ex = p2[0] - p1[0], ey = p2[1] - p1[1];
            const len2 = ex * ex + ey * ey;
            const t = Math.max(0, Math.min(1, ((mm.x_mm - p1[0]) * ex + (mm.y_mm - p1[1]) * ey) / len2));
            const px = p1[0] + t * ex, py = p1[1] + t * ey;

            addVertexOnEdge(selectedRoomIdx, e, Math.round(px), Math.round(py));
            selectVertex(e + 1);
            isDraggingVertexRef.current = true;
            showToast('頂点を追加しました');
            return;
          }
        }
      }

      // 壁クリック判定 (selectツール)
      if (activeTool === 'select') {
        const scale = parseScale(blueprint.scale_detected);
        const thresholdMm = (HIT_THRESHOLD_PX / zoom) * scale;
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
          if (shiftHeldRef.current) {
            toggleRoomSelect(i);
          } else {
            clearMultiSelect();
            selectRoom(i);
          }
          return;
        }
      }

      selectRoom(null);
      selectFixture(null);
      selectWall(null);
    },
    [blueprint, zoom, toMm, selectedRoomIdx, selectRoom, selectFixture, selectVertex, selectWall, activeTool, deleteRoom, deleteWall, addWall, snapEnabled, snapGrid, wallAddPoints, measurePoints, setWallAddPoints, setMeasurePoints, moveFixture, toggleRoomSelect, clearMultiSelect, addVertexOnEdge, splitRoom]
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
        let snapped = applySnap(rawMm.x_mm, rawMm.y_mm, snapEnabled, snapGrid, blueprint!, zoom, shiftHeldRef.current);
        if (ctrlHeldRef.current && blueprint) {
          const room = blueprint.rooms[selectedRoomIdx];
          const prevVertex = room.polygon_mm[(selectedVertexIdx - 1 + room.polygon_mm.length) % room.polygon_mm.length];
          const locked = applyAxisLock(snapped.x_mm, snapped.y_mm, prevVertex[0], prevVertex[1], true);
          snapped = { ...locked, snapType: snapped.snapType };
        }
        snapIndicatorRef.current = snapped.snapType ? { x: snapped.x_mm, y: snapped.y_mm, type: snapped.snapType } : null;
        moveVertex(selectedRoomIdx, selectedVertexIdx, snapped.x_mm, snapped.y_mm);

        // 自己交差チェック
        {
          const updatedBp = useCorrectionStore.getState().blueprint;
          if (updatedBp) {
            const room = updatedBp.rooms[selectedRoomIdx];
            if (room && isPolygonSelfIntersecting(room.polygon_mm)) {
              if (!selfIntersectWarningRef.current) {
                selfIntersectWarningRef.current = true;
                showToast('ポリゴンが自己交差しています');
              }
            } else {
              selfIntersectWarningRef.current = false;
            }
          }
        }
        return;
      }

      // 什器ドラッグ
      if (isDraggingFixtureRef.current && selectedFixtureIdx !== null && blueprint) {
        setCursorStyle('move');
        const snapped = applySnap(rawMm.x_mm, rawMm.y_mm, snapEnabled, snapGrid, blueprint, zoom, shiftHeldRef.current);
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

      // 全体移動ドラッグ
      if (isDraggingAllRef.current && blueprint) {
        setCursorStyle('move');
        const dxMm = rawMm.x_mm - dragStartMmRef.current.x_mm;
        const dyMm = rawMm.y_mm - dragStartMmRef.current.y_mm;
        moveAllElements(dxMm, dyMm);
        // 移動後の座標系で再計算するためdragStartは更新しない（moveAllで座標が変わるため）
        return;
      }

      // ツール別マウス追跡
      if (activeTool === 'addRoom' || activeTool === 'wallAdd' || activeTool === 'splitRoom' || activeTool === 'measure') {
        const snapped = applySnap(rawMm.x_mm, rawMm.y_mm, snapEnabled, snapGrid, blueprint!, zoom, shiftHeldRef.current);
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
          const thresholdMm = (HIT_THRESHOLD_PX / zoom) * scale;
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
              activeTool === 'addRoom' || activeTool === 'wallAdd' || activeTool === 'splitRoom' || activeTool === 'measure' ? 'crosshair' :
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
            activeTool === 'moveAll' ? 'move' :
            activeTool === 'addRoom' || activeTool === 'wallAdd' || activeTool === 'splitRoom' || activeTool === 'measure' ? 'crosshair' :
            activeTool === 'deleteRoom' || activeTool === 'wallDelete' ? 'crosshair' :
            'default'
          );
        }
      }
    },
    [panX, panY, setPan, selectedRoomIdx, selectedVertexIdx, selectedFixtureIdx, selectedWallIdx, moveVertex, moveFixture, moveWall, moveAllElements, toMm, blueprint, zoom, activeTool, showHint, snapEnabled, snapGrid]
  );

  // --- マウスアップ ---
  const handleMouseUp = useCallback(() => {
    if (isDraggingAllRef.current) {
      commitMoveAll();
    }
    isPanningRef.current = false;
    isDraggingVertexRef.current = false;
    isDraggingFixtureRef.current = false;
    isDraggingWallRef.current = false;
    isDraggingAllRef.current = false;
    snapIndicatorRef.current = null;
  }, [commitMoveAll]);

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

  // --- 部屋にズーム ---
  const zoomToRoom = useCallback(
    (roomIdx: number) => {
      if (!blueprint) return;
      const room = blueprint.rooms[roomIdx];
      if (!room || room.polygon_mm.length < 3) return;
      const container = containerRef.current;
      if (!container) return;
      const { width: cw, height: ch } = container.getBoundingClientRect();
      if (cw === 0 || ch === 0) return;
      const scale = parseScale(blueprint.scale_detected);
      let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
      for (const pt of room.polygon_mm) {
        const { cx, cy } = mmToCanvas(pt[0], pt[1], scale, effectiveDpi, effectivePageHeightPx, 1, 0, 0);
        minCx = Math.min(minCx, cx); minCy = Math.min(minCy, cy);
        maxCx = Math.max(maxCx, cx); maxCy = Math.max(maxCy, cy);
      }
      const padding = 100;
      const bboxW = maxCx - minCx;
      const bboxH = maxCy - minCy;
      const fz = Math.min((cw - padding * 2) / Math.max(bboxW, 1), (ch - padding * 2) / Math.max(bboxH, 1), 3);
      const centerX = (minCx + maxCx) / 2;
      const centerY = (minCy + maxCy) / 2;
      setZoom(fz);
      setPan(cw / 2 - centerX * fz, ch / 2 - centerY * fz);
      selectRoom(roomIdx);
    },
    [blueprint, effectiveDpi, effectivePageHeightPx, setZoom, setPan, selectRoom]
  );

  // --- 右クリックコンテキストメニュー ---
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!blueprint) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const mm = toMm(mx, my);

      // 部屋判定
      for (let i = 0; i < blueprint.rooms.length; i++) {
        const room = blueprint.rooms[i];
        if (room.polygon_mm.length >= 3 && pointInPolygon(mm.x_mm, mm.y_mm, room.polygon_mm)) {
          setContextMenu({ x: mx, y: my, roomIdx: i, wallIdx: null });
          return;
        }
      }

      // 壁判定
      const scale = parseScale(blueprint.scale_detected);
      const thresholdMm = (HIT_THRESHOLD_PX / zoom) * scale;
      for (let i = 0; i < blueprint.walls.length; i++) {
        const w = blueprint.walls[i];
        const d = distanceToSegment(mm.x_mm, mm.y_mm, w.start_x_mm, w.start_y_mm, w.end_x_mm, w.end_y_mm);
        if (d < thresholdMm) {
          setContextMenu({ x: mx, y: my, roomIdx: null, wallIdx: i });
          return;
        }
      }

      // 空白エリア
      setContextMenu({ x: mx, y: my, roomIdx: null, wallIdx: null });
    },
    [blueprint, toMm, zoom]
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
        onContextMenu={handleContextMenu}
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

      {/* コンテキストメニュー */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onZoomToRoom={zoomToRoom}
          onFitAll={fitAll}
        />
      )}

      {/* フローティング進捗表示 */}
      {blueprint && (() => {
        const unknowns = blueprint.rooms.filter(r => r.name === '不明' || r.name === '').length;
        if (unknowns === 0) return null;
        return (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-amber-500/90 text-white px-4 py-1.5 rounded-full shadow-lg text-sm font-bold flex items-center gap-2 pointer-events-auto">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            あと {unknowns} 室
            <button
              onClick={() => {
                const store = useCorrectionStore.getState();
                store.navigateUnknown('next');
                store.setActiveTool('editName');
              }}
              className="ml-1 bg-white/20 hover:bg-white/30 rounded px-2 py-0.5 text-xs transition-colors"
            >
              次へ →
            </button>
          </div>
        );
      })()}
    </div>
  );
}
