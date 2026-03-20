/**
 * 補正キャンバス マウス/キーボード操作ハンドラ
 * CorrectionCanvas.tsx から抽出
 */

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
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { HIT_THRESHOLD_PX, FIT_ALL_PADDING, AUTOFIT_MAX_ZOOM } from './theme';

// --- ref群の型 ---
export interface CanvasRefs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isPanningRef: React.MutableRefObject<boolean>;
  isDraggingVertexRef: React.MutableRefObject<boolean>;
  isDraggingFixtureRef: React.MutableRefObject<boolean>;
  isDraggingWallRef: React.MutableRefObject<boolean>;
  lastMouseRef: React.MutableRefObject<{ x: number; y: number }>;
  dragStartMmRef: React.MutableRefObject<{ x_mm: number; y_mm: number }>;
  spaceHeldRef: React.MutableRefObject<boolean>;
  ctrlHeldRef: React.MutableRefObject<boolean>;
  shiftHeldRef: React.MutableRefObject<boolean>;
  newRoomPointsRef: React.MutableRefObject<[number, number][]>;
  currentMouseMmRef: React.MutableRefObject<{ x_mm: number; y_mm: number } | null>;
  snapIndicatorRef: React.MutableRefObject<{ x: number; y: number; type: string } | null>;
}

// --- スナップ処理 ---
export function applySnap(
  x_mm: number,
  y_mm: number,
  snapEnabled: boolean,
  snapGrid: number,
  blueprint: { rooms: { polygon_mm: [number, number][] }[]; walls: Parameters<typeof snapToWallLine>[2]; scale_detected: string },
  zoom: number,
  shiftHeld: boolean,
): { x_mm: number; y_mm: number; snapType: string | null } {
  if (!snapEnabled) return { x_mm, y_mm, snapType: null };

  const gridSize = shiftHeld ? 10 : snapGrid;
  const scale = parseScale(blueprint.scale_detected);
  const threshold = (HIT_THRESHOLD_PX / zoom) * scale;

  // 1. 頂点スナップ (最優先)
  const allVertices: [number, number][] = [];
  for (const room of blueprint.rooms) {
    for (const pt of room.polygon_mm) {
      allVertices.push(pt);
    }
  }
  const vertexSnap = snapToNearestPoint(x_mm, y_mm, allVertices, threshold);
  if (vertexSnap) {
    return { x_mm: vertexSnap[0], y_mm: vertexSnap[1], snapType: 'vertex' };
  }

  // 2. 壁スナップ
  const wallSnap = snapToWallLine(x_mm, y_mm, blueprint.walls, threshold);
  if (wallSnap) {
    return { x_mm: wallSnap.point[0], y_mm: wallSnap.point[1], snapType: wallSnap.type };
  }

  // 3. グリッドスナップ
  const [gx, gy] = snapToGrid(x_mm, y_mm, gridSize);
  return { x_mm: gx, y_mm: gy, snapType: 'grid' };
}

// --- 軸ロック (Ctrl押下時) ---
export function applyAxisLock(
  x_mm: number,
  y_mm: number,
  refX: number,
  refY: number,
  ctrlHeld: boolean,
): { x_mm: number; y_mm: number } {
  if (!ctrlHeld) return { x_mm, y_mm };
  const dx = Math.abs(x_mm - refX);
  const dy = Math.abs(y_mm - refY);
  return dx > dy ? { x_mm, y_mm: refY } : { x_mm: refX, y_mm };
}

// --- 座標変換ヘルパー (ハンドラ用) ---
function getViewParams(state: ReturnType<typeof useCorrectionStore.getState>) {
  const bp = state.blueprint;
  if (!bp) return null;
  const scale = parseScale(bp.scale_detected);
  const dpi = state.pdfInfo?.dpi ?? 150;
  const pageH = state.pdfInfo?.pageHeightPx ?? (bp.room.depth_mm / scale) * dpi / 25.4;
  return { scale, dpi, pageH };
}

// ============================================================
// handleKeyDown
// ============================================================
export function createKeyDownHandler(
  refs: Pick<CanvasRefs, 'spaceHeldRef' | 'ctrlHeldRef' | 'shiftHeldRef' | 'newRoomPointsRef' | 'currentMouseMmRef'>,
) {
  return (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      refs.spaceHeldRef.current = true;
      return;
    }
    if (e.key === 'Control') { refs.ctrlHeldRef.current = true; return; }
    if (e.key === 'Shift') { refs.shiftHeldRef.current = true; return; }

    // Ctrl+Z: 元に戻す
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      useCorrectionStore.getState().undo();
      return;
    }
    // Ctrl+Y / Ctrl+Shift+Z: やり直し
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault();
      useCorrectionStore.getState().redo();
      return;
    }

    // Ctrl+0: 全体表示
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      fitAll();
      return;
    }

    // Delete: 選択中の壁/部屋を削除
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

    // Escape: 全選択解除・ツールリセット
    if (e.key === 'Escape') {
      if (refs.newRoomPointsRef.current.length > 0) {
        refs.newRoomPointsRef.current = [];
        refs.currentMouseMmRef.current = null;
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
    const layerNames = ['pdf', 'grid', 'rooms', 'walls', 'fixtures', 'labels', 'dimensions'] as const;
    const layerIdx = layerKeys.indexOf(e.key);
    if (layerIdx >= 0) {
      const s = useCorrectionStore.getState();
      const lk = layerNames[layerIdx];
      s.setLayerVisible(lk, !s.layers[lk]);
      return;
    }
  };
}

// ============================================================
// handleKeyUp
// ============================================================
export function createKeyUpHandler(
  refs: Pick<CanvasRefs, 'spaceHeldRef' | 'ctrlHeldRef' | 'shiftHeldRef'>,
) {
  return (e: KeyboardEvent) => {
    if (e.code === 'Space') refs.spaceHeldRef.current = false;
    if (e.key === 'Control') refs.ctrlHeldRef.current = false;
    if (e.key === 'Shift') refs.shiftHeldRef.current = false;
  };
}

// ============================================================
// 全体表示 (Ctrl+0)
// ============================================================
function fitAll() {
  const containerEl = document.querySelector('[data-correction-canvas]');
  if (!containerEl) return;
  const cw = containerEl.clientWidth;
  const ch = containerEl.clientHeight;
  const state = useCorrectionStore.getState();
  const bp = state.blueprint;
  if (!bp) return;

  const vp = getViewParams(state);
  if (!vp) return;

  let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
  for (const room of bp.rooms) {
    for (const pt of room.polygon_mm) {
      const { cx, cy } = mmToCanvas(pt[0], pt[1], vp.scale, vp.dpi, vp.pageH, 1, 0, 0);
      if (cx < minCx) minCx = cx; if (cy < minCy) minCy = cy;
      if (cx > maxCx) maxCx = cx; if (cy > maxCy) maxCy = cy;
    }
  }
  if (!isFinite(minCx)) return;

  const bW = maxCx - minCx;
  const bH = maxCy - minCy;
  const fz = Math.min((cw - FIT_ALL_PADDING) / Math.max(bW, 1), (ch - FIT_ALL_PADDING) / Math.max(bH, 1), AUTOFIT_MAX_ZOOM);
  state.setZoom(fz);
  state.setPan(cw / 2 - ((minCx + maxCx) / 2) * fz, ch / 2 - ((minCy + maxCy) / 2) * fz);
}
