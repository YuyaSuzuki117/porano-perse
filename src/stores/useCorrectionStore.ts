import { create } from 'zustand';
import type { BlueprintJson, CorrectionTool, PdfRenderInfo, LayerVisibility } from '@/types/blueprint';
import { polygonAreaM2, polygonCentroid, parseScale, lineSegmentIntersection } from '@/lib/blueprint-geometry';

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
  selectedRoomIndices: number[];
  activeTool: CorrectionTool;

  // Undo/Redo
  history: BlueprintJson[];
  historyIdx: number;

  // 全体移動の履歴制御
  _moveAllHistoryPushed: boolean;

  // 自動バックアップ
  _operationCount: number;
  _snapshots: { blueprint: BlueprintJson; timestamp: string; label: string }[];
  restoreSnapshot: (idx: number) => void;

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

  // 比較モード
  compareMode: boolean;

  // かんたんモード
  simpleMode: boolean;
  setSimpleMode: (v: boolean) => void;

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

  // 全体移動
  moveAllElements: (dx_mm: number, dy_mm: number) => void;
  commitMoveAll: () => void;

  // 複数選択
  toggleRoomSelect: (idx: number) => void;
  selectAllRooms: () => void;
  clearMultiSelect: () => void;
  moveSelectedRooms: (dx_mm: number, dy_mm: number) => void;

  // 壁スナップ・矯正
  snapWallEndpoints: () => void;
  straightenWalls: () => void;

  // 辺上に頂点追加
  addVertexOnEdge: (roomIdx: number, edgeIdx: number, x_mm: number, y_mm: number) => void;

  // PDF自動整列
  autoAlignToPdf: () => void;

  // 履歴ジャンプ
  jumpToHistory: (idx: number) => void;

  // 比較モード
  setCompareMode: (v: boolean) => void;

  // 部屋分割
  splitRoom: (roomIdx: number, splitLine: [[number, number], [number, number]]) => void;

  // 不明室ナビゲーション
  navigateUnknown: (direction: 'next' | 'prev') => void;

  // エクスポートトリガー (キーボードショートカット用)
  _exportTrigger: { format: 'json' | 'dxf'; ts: number } | null;
  triggerExport: (format: 'json' | 'dxf') => void;

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

  const newCount = state._operationCount + 1;
  let snapshotUpdate: Partial<CorrectionState> = { _operationCount: newCount };

  if (newCount % 5 === 0) {
    const snapshot = {
      blueprint: JSON.parse(JSON.stringify(state.blueprint)),
      timestamp: new Date().toISOString(),
      label: `自動バックアップ #${Math.floor(newCount / 5)}`,
    };
    const snapshots = [...state._snapshots, snapshot].slice(-10);
    try {
      localStorage.setItem('porano-correction-snapshots', JSON.stringify(snapshots));
    } catch { /* ignore */ }
    snapshotUpdate = { _operationCount: newCount, _snapshots: snapshots };
  }

  return { history: newHistory, historyIdx: newHistory.length - 1, ...snapshotUpdate };
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
  selectedRoomIndices: [],
  activeTool: 'select',
  _moveAllHistoryPushed: false,
  history: [],
  historyIdx: -1,
  _operationCount: 0,
  _snapshots: [],

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

  // 比較モード
  compareMode: false,

  // かんたんモード
  simpleMode: true,

  // エクスポートトリガー
  _exportTrigger: null,

  // 描画最適化: 初期状態は全レイヤーdirty
  dirtyLayers: allDirty(),

  loadBlueprint: (bp) => {
    // JSON validation with defaults
    bp.rooms = bp.rooms ?? [];
    bp.walls = bp.walls ?? [];
    bp.fixtures = bp.fixtures ?? [];
    bp.warnings = bp.warnings ?? [];
    bp.scale_detected = bp.scale_detected ?? '1:50';
    bp.room = bp.room ?? { width_mm: 10000, depth_mm: 10000, ceiling_height_mm: 2700, shape: 'rectangle' };
    bp.origin_offset_mm = bp.origin_offset_mm ?? { x: 0, y: 0 };
    for (const room of bp.rooms) {
      room.confidence = room.confidence ?? 0;
      room.nearby_texts = room.nearby_texts ?? [];
      room.area_m2 = room.area_m2 ?? 0;
    }
    // Load existing snapshots from localStorage
    let savedSnapshots: { blueprint: BlueprintJson; timestamp: string; label: string }[] = [];
    try {
      const saved = localStorage.getItem('porano-correction-snapshots');
      if (saved) savedSnapshots = JSON.parse(saved);
    } catch { /* ignore */ }

    set({
      blueprint: bp,
      history: [JSON.parse(JSON.stringify(bp))],
      historyIdx: 0,
      selectedRoomIdx: null,
      selectedFixtureIdx: null,
      selectedVertexIdx: null,
      selectedWallIdx: null,
      selectedRoomIndices: [],
      dirtyLayers: allDirty(),
      _snapshots: savedSnapshots,
      _operationCount: 0,
    });
  },

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

  // --- スナップショット復元 ---
  restoreSnapshot: (idx) => set((s) => {
    const snapshot = s._snapshots[idx];
    if (!snapshot) return {};
    const bp = JSON.parse(JSON.stringify(snapshot.blueprint)) as BlueprintJson;
    return {
      blueprint: bp,
      history: [bp],
      historyIdx: 0,
      dirtyLayers: allDirty(),
    };
  }),

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

  // --- 壁スナップ・矯正 ---
  snapWallEndpoints: () => set((s) => {
    if (!s.blueprint) return {};
    const bp = JSON.parse(JSON.stringify(s.blueprint));
    const SNAP_DIST = 200; // mm
    const walls = bp.walls;

    const endpoints: { wallIdx: number; end: 'start' | 'end'; x: number; y: number }[] = [];
    for (let i = 0; i < walls.length; i++) {
      endpoints.push({ wallIdx: i, end: 'start', x: walls[i].start_x_mm, y: walls[i].start_y_mm });
      endpoints.push({ wallIdx: i, end: 'end', x: walls[i].end_x_mm, y: walls[i].end_y_mm });
    }

    const used = new Set<number>();
    let snapCount = 0;
    for (let i = 0; i < endpoints.length; i++) {
      if (used.has(i)) continue;
      const group = [i];
      for (let j = i + 1; j < endpoints.length; j++) {
        if (used.has(j)) continue;
        const dx = endpoints[i].x - endpoints[j].x;
        const dy = endpoints[i].y - endpoints[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < SNAP_DIST) {
          group.push(j);
        }
      }
      if (group.length > 1) {
        const avgX = group.reduce((sum, idx) => sum + endpoints[idx].x, 0) / group.length;
        const avgY = group.reduce((sum, idx) => sum + endpoints[idx].y, 0) / group.length;
        for (const idx of group) {
          const ep = endpoints[idx];
          const w = walls[ep.wallIdx];
          if (ep.end === 'start') { w.start_x_mm = avgX; w.start_y_mm = avgY; }
          else { w.end_x_mm = avgX; w.end_y_mm = avgY; }
          used.add(idx);
        }
        snapCount++;
      }
    }

    if (snapCount === 0) return {};
    autoSave(bp);
    return { blueprint: bp, ...pushHistory(s), dirtyLayers: allDirty() };
  }),

  straightenWalls: () => set((s) => {
    if (!s.blueprint) return {};
    const bp = JSON.parse(JSON.stringify(s.blueprint));
    const ANGLE_THRESHOLD = 5 * Math.PI / 180;
    let count = 0;

    for (const wall of bp.walls) {
      const dx = wall.end_x_mm - wall.start_x_mm;
      const dy = wall.end_y_mm - wall.start_y_mm;
      const angle = Math.atan2(Math.abs(dy), Math.abs(dx));

      if (angle < ANGLE_THRESHOLD) {
        const avgY = (wall.start_y_mm + wall.end_y_mm) / 2;
        wall.start_y_mm = avgY;
        wall.end_y_mm = avgY;
        count++;
      } else if (angle > Math.PI / 2 - ANGLE_THRESHOLD) {
        const avgX = (wall.start_x_mm + wall.end_x_mm) / 2;
        wall.start_x_mm = avgX;
        wall.end_x_mm = avgX;
        count++;
      }
    }

    if (count === 0) return {};
    autoSave(bp);
    return { blueprint: bp, ...pushHistory(s), dirtyLayers: allDirty() };
  }),

  // --- 辺上に頂点追加 ---
  addVertexOnEdge: (roomIdx, edgeIdx, x_mm, y_mm) => set((s) => {
    if (!s.blueprint) return {};
    const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
    const room = bp.rooms[roomIdx];
    if (!room) return {};
    room.polygon_mm.splice(edgeIdx + 1, 0, [x_mm, y_mm]);
    autoSave(bp);
    return { blueprint: bp, ...pushHistory(s), dirtyLayers: allDirty() };
  }),

  // --- 全体移動 ---
  moveAllElements: (dx_mm, dy_mm) =>
    set((s) => {
      if (!s.blueprint) return {};
      const bp = JSON.parse(JSON.stringify(s.blueprint));
      // 全部屋のポリゴンとセンターを移動
      for (const room of bp.rooms) {
        room.polygon_mm = room.polygon_mm.map(([x, y]: [number, number]) => [x + dx_mm, y + dy_mm]);
        if (room.center_mm) {
          room.center_mm = [room.center_mm[0] + dx_mm, room.center_mm[1] + dy_mm];
        }
      }
      // 全壁を移動
      for (const wall of bp.walls) {
        wall.start_x_mm += dx_mm;
        wall.start_y_mm += dy_mm;
        wall.end_x_mm += dx_mm;
        wall.end_y_mm += dy_mm;
      }
      // 全什器を移動
      for (const fix of bp.fixtures) {
        fix.x_mm += dx_mm;
        fix.y_mm += dy_mm;
      }
      autoSave(bp);
      // Only push history on the first drag frame to prevent undo stack explosion
      if (!s._moveAllHistoryPushed) {
        return { blueprint: bp, _moveAllHistoryPushed: true, ...pushHistory(s), dirtyLayers: allDirty() };
      }
      return { blueprint: bp, dirtyLayers: allDirty() };
    }),

  commitMoveAll: () => set({ _moveAllHistoryPushed: false }),

  // --- 複数選択 ---
  toggleRoomSelect: (idx) =>
    set((s) => {
      const indices = s.selectedRoomIndices.includes(idx)
        ? s.selectedRoomIndices.filter((i) => i !== idx)
        : [...s.selectedRoomIndices, idx];
      return { selectedRoomIndices: indices };
    }),

  selectAllRooms: () =>
    set((s) => {
      if (!s.blueprint) return {};
      return { selectedRoomIndices: s.blueprint.rooms.map((_, i) => i) };
    }),

  clearMultiSelect: () => set({ selectedRoomIndices: [] }),

  moveSelectedRooms: (dx_mm, dy_mm) =>
    set((s) => {
      if (!s.blueprint || s.selectedRoomIndices.length === 0) return {};
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      for (const idx of s.selectedRoomIndices) {
        const room = bp.rooms[idx];
        if (!room) continue;
        room.polygon_mm = room.polygon_mm.map(([x, y]: [number, number]) => [x + dx_mm, y + dy_mm] as [number, number]);
        if (room.center_mm) {
          room.center_mm = [room.center_mm[0] + dx_mm, room.center_mm[1] + dy_mm];
        }
      }
      autoSave(bp);
      // Only push history on first drag frame (reuse _moveAllHistoryPushed flag)
      if (!s._moveAllHistoryPushed) {
        return { blueprint: bp, _moveAllHistoryPushed: true, ...pushHistory(s), dirtyLayers: allDirty() };
      }
      return { blueprint: bp, dirtyLayers: allDirty() };
    }),

  // --- 履歴ジャンプ ---
  jumpToHistory: (idx) =>
    set((s) => {
      if (idx < 0 || idx >= s.history.length) return {};
      const bp = JSON.parse(JSON.stringify(s.history[idx]));
      return {
        blueprint: bp,
        historyIdx: idx,
        selectedRoomIdx: null,
        selectedFixtureIdx: null,
        selectedVertexIdx: null,
        selectedWallIdx: null,
        dirtyLayers: allDirty(),
      };
    }),

  // --- エクスポートトリガー ---
  triggerExport: (format) => set({ _exportTrigger: { format, ts: Date.now() } }),

  // --- PDF自動整列 ---
  autoAlignToPdf: () =>
    set((s) => {
      if (!s.blueprint || !s.pdfInfo) return {};
      const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
      const scale = parseScale(bp.scale_detected);

      // Calculate bounding box in real mm
      let minX = Infinity,
        minY = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity;
      for (const room of bp.rooms) {
        for (const [x, y] of room.polygon_mm) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      for (const wall of bp.walls) {
        minX = Math.min(minX, wall.start_x_mm, wall.end_x_mm);
        minY = Math.min(minY, wall.start_y_mm, wall.end_y_mm);
        maxX = Math.max(maxX, wall.start_x_mm, wall.end_x_mm);
        maxY = Math.max(maxY, wall.start_y_mm, wall.end_y_mm);
      }

      if (!isFinite(minX)) return {};

      // Paper mm of the min/max points
      const minPaperX = minX / scale;
      const minPaperY = minY / scale;
      const maxPaperX = maxX / scale;
      const maxPaperY = maxY / scale;

      // PDF page dimensions in mm (from pt: pt * 25.4/72)
      const pageWidthMm = (s.pdfInfo.pageWidthPt * 25.4) / 72;
      const pageHeightMm = (s.pdfInfo.pageHeightPt * 25.4) / 72;

      const drawingW = maxPaperX - minPaperX;
      const drawingH = maxPaperY - minPaperY;

      // If already near origin (min paper coords < 50mm), no shift needed
      if (minPaperX < 50 && minPaperY < 50) return {};

      // Estimate: try centering the drawing on the page
      const targetMinX = (pageWidthMm - drawingW) / 2;
      const targetMinY = (pageHeightMm - drawingH) / 2;

      const dx = (targetMinX - minPaperX) * scale;
      const dy = (targetMinY - minPaperY) * scale;

      // Apply shift to all elements
      for (const room of bp.rooms) {
        room.polygon_mm = room.polygon_mm.map(
          ([x, y]: [number, number]) => [x + dx, y + dy] as [number, number],
        );
        if (room.center_mm)
          room.center_mm = [room.center_mm[0] + dx, room.center_mm[1] + dy];
      }
      for (const wall of bp.walls) {
        wall.start_x_mm += dx;
        wall.start_y_mm += dy;
        wall.end_x_mm += dx;
        wall.end_y_mm += dy;
      }
      for (const fix of bp.fixtures) {
        fix.x_mm += dx;
        fix.y_mm += dy;
      }

      autoSave(bp);
      return { blueprint: bp, ...pushHistory(s), dirtyLayers: allDirty() };
    }),

  // --- 不明室ナビゲーション ---
  navigateUnknown: (direction) => set((s) => {
    if (!s.blueprint) return {};
    const unknowns = s.blueprint.rooms
      .map((r, i) => ({ idx: i, name: r.name }))
      .filter(r => !r.name || r.name === '不明');
    if (unknowns.length === 0) return {};

    const currentIdx = s.selectedRoomIdx;
    let currentUnknownPos = unknowns.findIndex(u => u.idx === currentIdx);

    if (direction === 'next') {
      currentUnknownPos = currentUnknownPos < unknowns.length - 1 ? currentUnknownPos + 1 : 0;
    } else {
      currentUnknownPos = currentUnknownPos > 0 ? currentUnknownPos - 1 : unknowns.length - 1;
    }

    const target = unknowns[currentUnknownPos];
    return {
      selectedRoomIdx: target.idx,
      selectedFixtureIdx: null,
      selectedVertexIdx: null,
      selectedWallIdx: null,
      activeTool: 'editName' as CorrectionTool,
      dirtyLayers: allDirty(),
    };
  }),

  // --- 比較モード ---
  setCompareMode: (v) => set({ compareMode: v }),

  // --- かんたんモード ---
  setSimpleMode: (v) => set({ simpleMode: v }),

  // --- 部屋分割 ---
  splitRoom: (roomIdx, splitLine) => set((s) => {
    if (!s.blueprint) return {};
    const bp = JSON.parse(JSON.stringify(s.blueprint)) as BlueprintJson;
    const room = bp.rooms[roomIdx];
    if (!room || room.polygon_mm.length < 3) return {};

    const [lineStart, lineEnd] = splitLine;
    const polygon = room.polygon_mm as [number, number][];

    // Find intersection points of the split line with polygon edges
    const intersections: { edgeIdx: number; point: [number, number]; t: number }[] = [];

    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const inter = lineSegmentIntersection(lineStart, lineEnd, p1, p2);
      if (inter) {
        intersections.push({ edgeIdx: i, point: inter.point, t: inter.t });
      }
    }

    // Need exactly 2 intersection points to split
    if (intersections.length !== 2) return {};

    // Sort by edge index
    intersections.sort((a, b) => a.edgeIdx - b.edgeIdx);
    const [int1, int2] = intersections;

    // Build two new polygons
    const poly1: [number, number][] = [];
    const poly2: [number, number][] = [];

    // Poly1: from int1 to int2 along the polygon
    poly1.push(int1.point);
    for (let i = int1.edgeIdx + 1; i <= int2.edgeIdx; i++) {
      poly1.push(polygon[i]);
    }
    poly1.push(int2.point);

    // Poly2: from int2 to int1 along the polygon (wrapping)
    poly2.push(int2.point);
    for (let i = int2.edgeIdx + 1; i < polygon.length + int1.edgeIdx + 1; i++) {
      poly2.push(polygon[i % polygon.length]);
    }
    poly2.push(int1.point);

    // Create two new rooms
    const room1 = {
      ...room,
      name: room.name + '-1',
      polygon_mm: poly1,
      area_m2: Math.round(polygonAreaM2(poly1) * 10) / 10,
      center_mm: polygonCentroid(poly1).map(Math.round) as [number, number],
    };
    const room2 = {
      ...room,
      name: room.name + '-2',
      polygon_mm: poly2,
      area_m2: Math.round(polygonAreaM2(poly2) * 10) / 10,
      center_mm: polygonCentroid(poly2).map(Math.round) as [number, number],
    };

    // Replace original room with two new rooms
    bp.rooms.splice(roomIdx, 1, room1, room2);

    autoSave(bp);
    return { blueprint: bp, selectedRoomIdx: roomIdx, ...pushHistory(s), dirtyLayers: allDirty() };
  }),

  // --- dirtyLayers操作 ---
  markDirty: (layers) => set((s) => ({ dirtyLayers: { ...s.dirtyLayers, ...layers } })),
  markAllDirty: () => set({ dirtyLayers: allDirty() }),
  clearDirty: (layer) => set((s) => ({ dirtyLayers: { ...s.dirtyLayers, [layer]: false } })),
  clearAllDirty: () => set({ dirtyLayers: { pdf: false, grid: false, rooms: false, walls: false, fixtures: false, labels: false, dimensions: false, highlight: false, measure: false } }),
}));
