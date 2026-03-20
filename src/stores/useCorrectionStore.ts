import { create } from 'zustand';
import type { BlueprintJson, CorrectionTool, PdfRenderInfo, LayerVisibility } from '@/types/blueprint';
import { polygonAreaM2, polygonCentroid } from '@/lib/blueprint-geometry';

const STORAGE_KEY = 'porano-correction-autosave';

function autoSave(bp: BlueprintJson) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bp));
    localStorage.setItem(STORAGE_KEY + '-timestamp', new Date().toISOString());
  } catch { /* quota exceeded - ignore */ }
}

/** 描画レイヤーのdirtyフラグ型 */
export interface DirtyLayers {
  pdf: boolean;
  grid: boolean;
  rooms: boolean;
  walls: boolean;
  fixtures: boolean;
  labels: boolean;
  dimensions: boolean;
  highlight: boolean;
  measure: boolean;
}

/** 全レイヤーをdirtyにするヘルパー */
function allDirty(): DirtyLayers {
  return { pdf: true, grid: true, rooms: true, walls: true, fixtures: true, labels: true, dimensions: true, highlight: true, measure: true };
}

interface CorrectionState {
  // データ
  blueprint: BlueprintJson | null;
  pdfInfo: PdfRenderInfo | null;

  // 表示
  zoom: number;
  panX: number;
  panY: number;

  // 選択
  selectedRoomIdx: number | null;
  selectedFixtureIdx: number | null;
  selectedVertexIdx: number | null;
  activeTool: CorrectionTool;

  // Undo/Redo
  history: BlueprintJson[];
  historyIdx: number;

  // スナップ設定
  snapEnabled: boolean;
  snapGrid: number; // mm
  gridVisible: boolean;

  // レイヤー表示
  layers: LayerVisibility;

  // 壁編集
  selectedWallIdx: number | null;
  wallAddPoints: [number, number][];

  // 測定
  measurePoints: [number, number][];
  measureActive: boolean;

  // PDF透明度
  pdfOpacity: number;

  // 描画最適化: どのレイヤーが再描画必要か
  dirtyLayers: DirtyLayers;

  // アクション
  loadBlueprint: (bp: BlueprintJson) => void;
  setPdfInfo: (info: PdfRenderInfo) => void;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  setActiveTool: (t: CorrectionTool) => void;
  selectRoom: (idx: number | null) => void;
  selectFixture: (idx: number | null) => void;
  selectVertex: (idx: number | null) => void;

  // 編集
  setRoomName: (roomIdx: number, name: string) => void;
  moveVertex: (roomIdx: number, vertexIdx: number, x_mm: number, y_mm: number) => void;
  addRoom: (polygon: [number, number][], name: string) => void;
  deleteRoom: (roomIdx: number) => void;
  moveFixture: (fixtureIdx: number, x_mm: number, y_mm: number) => void;
  mergeRooms: (roomIdx1: number, roomIdx2: number) => void;
  undo: () => void;
  redo: () => void;
  resetToOriginal: () => void;
  loadAutosave: () => boolean;
  clearAutosave: () => void;

  // 新機能アクション
  setSnapEnabled: (v: boolean) => void;
  setSnapGrid: (v: number) => void;
  setGridVisible: (v: boolean) => void;
  setLayerVisible: (layer: keyof LayerVisibility, visible: boolean) => void;
  setPdfOpacity: (v: number) => void;
  selectWall: (idx: number | null) => void;
  addWall: (startX: number, startY: number, endX: number, endY: number) => void;
  moveWall: (wallIdx: number, dx: number, dy: number) => void;
  deleteWall: (wallIdx: number) => void;
  setWallAddPoints: (pts: [number, number][]) => void;
  setMeasurePoints: (pts: [number, number][]) => void;
  setMeasureActive: (v: boolean) => void;

  // dirtyLayers操作
  markDirty: (layers: Partial<DirtyLayers>) => void;
  markAllDirty: () => void;
  clearDirty: (layer: keyof DirtyLayers) => void;
  clearAllDirty: () => void;
}

function pushHistory(state: CorrectionState): Partial<CorrectionState> {
  if (!state.blueprint) return {};
  const newHistory = state.history.slice(0, state.historyIdx + 1);
  newHistory.push(JSON.parse(JSON.stringify(state.blueprint)));
  return { history: newHistory, historyIdx: newHistory.length - 1 };
}

export const useCorrectionStore = create<CorrectionState>((set, get) => ({
  blueprint: null,
  pdfInfo: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  selectedRoomIdx: null,
  selectedFixtureIdx: null,
  selectedVertexIdx: null,
  activeTool: 'select',
  history: [],
  historyIdx: -1,

  // スナップ設定
  snapEnabled: true,
  snapGrid: 100,
  gridVisible: true,

  // レイヤー
  layers: {
    pdf: true,
    grid: true,
    rooms: true,
    walls: true,
    fixtures: true,
    labels: true,
    dimensions: true,
  },

  // 壁編集
  selectedWallIdx: null,
  wallAddPoints: [],

  // 測定
  measurePoints: [],
  measureActive: false,

  // PDF透明度
  pdfOpacity: 0.4,

  // 描画最適化: 初期状態は全レイヤーdirty
  dirtyLayers: allDirty(),

  loadBlueprint: (bp) =>
    set({
      blueprint: bp,
      history: [JSON.parse(JSON.stringify(bp))],
      historyIdx: 0,
      selectedRoomIdx: null,
      selectedFixtureIdx: null,
      selectedVertexIdx: null,
      selectedWallIdx: null,
      dirtyLayers: allDirty(),
    }),

  setPdfInfo: (info) => set({ pdfInfo: info, dirtyLayers: allDirty() }),
  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(5, z)), dirtyLayers: allDirty() }),
  setPan: (x, y) => set({ panX: x, panY: y, dirtyLayers: allDirty() }),
  setActiveTool: (t) =>
    set({
      activeTool: t,
      selectedVertexIdx: null,
      selectedWallIdx: null,
      wallAddPoints: [],
      measurePoints: [],
      measureActive: t === 'measure',
    }),
  selectRoom: (idx) =>
    set({ selectedRoomIdx: idx, selectedFixtureIdx: null, selectedVertexIdx: null, selectedWallIdx: null,
      dirtyLayers: { ...allDirty(), pdf: false, grid: false, walls: false, dimensions: false, highlight: true } }),
  selectFixture: (idx) =>
    set({ selectedFixtureIdx: idx, selectedRoomIdx: null, selectedVertexIdx: null, selectedWallIdx: null,
      dirtyLayers: { ...allDirty(), pdf: false, grid: false, rooms: false, walls: false, dimensions: false, highlight: true } }),
  selectVertex: (idx) => set({ selectedVertexIdx: idx,
    dirtyLayers: { ...allDirty(), pdf: false, grid: false, walls: false, dimensions: false, highlight: true } }),

  setRoomName: (roomIdx, name) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      bp.rooms[roomIdx].name = name;
      bp.rooms[roomIdx].confidence = 1.0;
      autoSave(bp);
      return { blueprint: bp, dirtyLayers: { ...s.dirtyLayers, labels: true }, ...pushHistory({ ...s, blueprint: bp }) };
    }),

  moveVertex: (roomIdx, vertexIdx, x_mm, y_mm) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      const room = bp.rooms[roomIdx];
      room.polygon_mm[vertexIdx] = [x_mm, y_mm];
      room.area_m2 = Math.round(polygonAreaM2(room.polygon_mm) * 10) / 10;
      room.center_mm = polygonCentroid(room.polygon_mm).map(Math.round) as [number, number];
      autoSave(bp);
      return { blueprint: bp, dirtyLayers: { ...s.dirtyLayers, rooms: true, labels: true, dimensions: true, highlight: true }, ...pushHistory({ ...s, blueprint: bp }) };
    }),

  addRoom: (polygon, name) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      bp.rooms.push({
        name,
        wall_ids: [],
        area_m2: Math.round(polygonAreaM2(polygon) * 10) / 10,
        center_mm: polygonCentroid(polygon).map(Math.round) as [number, number],
        polygon_mm: polygon,
      });
      autoSave(bp);
      return { blueprint: bp, dirtyLayers: { ...s.dirtyLayers, rooms: true, labels: true, dimensions: true, highlight: true }, ...pushHistory({ ...s, blueprint: bp }) };
    }),

  deleteRoom: (roomIdx) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      bp.rooms.splice(roomIdx, 1);
      autoSave(bp);
      return {
        blueprint: bp,
        selectedRoomIdx: null,
        selectedVertexIdx: null,
        dirtyLayers: { ...s.dirtyLayers, rooms: true, labels: true, dimensions: true, highlight: true },
        ...pushHistory({ ...s, blueprint: bp }),
      };
    }),

  moveFixture: (fixtureIdx, x_mm, y_mm) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      bp.fixtures[fixtureIdx].x_mm = x_mm;
      bp.fixtures[fixtureIdx].y_mm = y_mm;
      autoSave(bp);
      return { blueprint: bp, dirtyLayers: { ...s.dirtyLayers, fixtures: true }, ...pushHistory({ ...s, blueprint: bp }) };
    }),

  undo: () =>
    set((s) => {
      if (s.historyIdx <= 0) return s;
      const newIdx = s.historyIdx - 1;
      return {
        blueprint: JSON.parse(JSON.stringify(s.history[newIdx])),
        historyIdx: newIdx,
        selectedRoomIdx: null,
        selectedFixtureIdx: null,
        selectedVertexIdx: null,
        selectedWallIdx: null,
        dirtyLayers: allDirty(),
      };
    }),

  redo: () =>
    set((s) => {
      if (s.historyIdx >= s.history.length - 1) return s;
      const newIdx = s.historyIdx + 1;
      return {
        blueprint: JSON.parse(JSON.stringify(s.history[newIdx])),
        historyIdx: newIdx,
        selectedRoomIdx: null,
        selectedFixtureIdx: null,
        selectedVertexIdx: null,
        selectedWallIdx: null,
        dirtyLayers: allDirty(),
      };
    }),

  mergeRooms: (roomIdx1, roomIdx2) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      const keepIdx = Math.min(roomIdx1, roomIdx2);
      const removeIdx = Math.max(roomIdx1, roomIdx2);
      const room1 = bp.rooms[keepIdx];
      const room2 = bp.rooms[removeIdx];

      if (polygonAreaM2(room2.polygon_mm) > polygonAreaM2(room1.polygon_mm)) {
        room1.polygon_mm = room2.polygon_mm;
      }
      room1.area_m2 = Math.round((room1.area_m2 + room2.area_m2) * 10) / 10;
      room1.center_mm = polygonCentroid([...room1.polygon_mm, ...room2.polygon_mm]).map(Math.round) as [number, number];
      room1.wall_ids = [...new Set([...room1.wall_ids, ...room2.wall_ids])];
      room1.confidence = Math.min(room1.confidence ?? 0.5, room2.confidence ?? 0.5);

      bp.rooms.splice(removeIdx, 1);

      autoSave(bp);
      return {
        blueprint: bp,
        selectedRoomIdx: keepIdx,
        selectedFixtureIdx: null,
        selectedVertexIdx: null,
        dirtyLayers: { ...s.dirtyLayers, rooms: true, labels: true, dimensions: true, highlight: true },
        ...pushHistory({ ...s, blueprint: bp }),
      };
    }),

  resetToOriginal: () =>
    set((s) => {
      if (s.history.length === 0) return s;
      return {
        blueprint: JSON.parse(JSON.stringify(s.history[0])),
        historyIdx: 0,
        history: [JSON.parse(JSON.stringify(s.history[0]))],
        selectedRoomIdx: null,
        selectedFixtureIdx: null,
        selectedVertexIdx: null,
        selectedWallIdx: null,
        dirtyLayers: allDirty(),
      };
    }),

  loadAutosave: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const bp = JSON.parse(saved) as BlueprintJson;
        set({
          blueprint: bp,
          history: [JSON.parse(JSON.stringify(bp))],
          historyIdx: 0,
        });
        return true;
      }
    } catch { /* ignore */ }
    return false;
  },

  clearAutosave: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY + '-timestamp');
    } catch { /* ignore */ }
  },

  // --- 新機能アクション ---
  setSnapEnabled: (v) => set({ snapEnabled: v }),
  setSnapGrid: (v) => set((s) => ({ snapGrid: v, dirtyLayers: { ...s.dirtyLayers, grid: true } })),
  setGridVisible: (v) => set((s) => ({ gridVisible: v, dirtyLayers: { ...s.dirtyLayers, grid: true } })),
  setLayerVisible: (layer, visible) =>
    set((s) => ({ layers: { ...s.layers, [layer]: visible }, dirtyLayers: { ...s.dirtyLayers, [layer]: true } })),
  setPdfOpacity: (v) => set((s) => ({ pdfOpacity: v, dirtyLayers: { ...s.dirtyLayers, pdf: true } })),
  selectWall: (idx) =>
    set((s) => ({ selectedWallIdx: idx, selectedRoomIdx: null, selectedFixtureIdx: null, selectedVertexIdx: null,
      dirtyLayers: { ...s.dirtyLayers, highlight: true } })),
  setWallAddPoints: (pts) => set({ wallAddPoints: pts }),

  addWall: (startX, startY, endX, endY) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      const newId = `w_user_${Date.now()}`;
      bp.walls.push({
        id: newId,
        start_x_mm: startX,
        start_y_mm: startY,
        end_x_mm: endX,
        end_y_mm: endY,
        thickness_mm: 120,
        type: 'interior',
        openings: [],
      });
      autoSave(bp);
      return { blueprint: bp, wallAddPoints: [], dirtyLayers: { ...s.dirtyLayers, walls: true, dimensions: true }, ...pushHistory({ ...s, blueprint: bp }) };
    }),

  moveWall: (wallIdx, dx, dy) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      const wall = bp.walls[wallIdx];
      wall.start_x_mm += dx;
      wall.start_y_mm += dy;
      wall.end_x_mm += dx;
      wall.end_y_mm += dy;
      autoSave(bp);
      return { blueprint: bp, dirtyLayers: { ...s.dirtyLayers, walls: true, dimensions: true }, ...pushHistory({ ...s, blueprint: bp }) };
    }),

  deleteWall: (wallIdx) =>
    set((s) => {
      if (!s.blueprint) return s;
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      bp.walls.splice(wallIdx, 1);
      autoSave(bp);
      return {
        blueprint: bp,
        selectedWallIdx: null,
        dirtyLayers: { ...s.dirtyLayers, walls: true, dimensions: true },
        ...pushHistory({ ...s, blueprint: bp }),
      };
    }),

  setMeasurePoints: (pts) => set((s) => ({ measurePoints: pts, dirtyLayers: { ...s.dirtyLayers, measure: true } })),
  setMeasureActive: (v) => set((s) => ({ measureActive: v, dirtyLayers: { ...s.dirtyLayers, measure: true } })),

  // --- dirtyLayers操作 ---
  markDirty: (layers) => set((s) => ({ dirtyLayers: { ...s.dirtyLayers, ...layers } })),
  markAllDirty: () => set({ dirtyLayers: allDirty() }),
  clearDirty: (layer) => set((s) => ({ dirtyLayers: { ...s.dirtyLayers, [layer]: false } })),
  clearAllDirty: () => set({ dirtyLayers: { pdf: false, grid: false, rooms: false, walls: false, fixtures: false, labels: false, dimensions: false, highlight: false, measure: false } }),
}));
