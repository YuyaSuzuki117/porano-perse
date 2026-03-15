import { create } from 'zustand';
import { WallSegment, Opening, RoomLabel } from '@/types/floor-plan';
import { useUIStore } from './useUIStore';
import { useCameraStore } from './useCameraStore';
import { FurnitureItem, FurnitureMaterial, StylePreset, Annotation } from '@/types/scene';
import { WallFinishAssignment, RoomFinishAssignment, FittingSpec, EquipmentItem, RouteSegment } from '@/types/finishing';
import { createRectRoom, createLShapeRoom, createUShapeRoom } from '@/lib/geometry';
import { DEFAULT_TEMPLATE, getTemplateById } from '@/data/templates';
import { getRoomTemplateById } from '@/data/room-templates';
import { FurnitureSet } from '@/data/furniture-sets';
import { invalidateTextureCache } from '@/lib/texture-cache';
import { FURNITURE_CATALOG } from '@/data/furniture';

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 300;
const LOCALSTORAGE_KEY = 'porano-perse-project';

// SavedProject interface → useProjectStore に移動済み（re-export は上部で定義）

interface HistorySnapshot {
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
  roomLabels: RoomLabel[];
  roomHeight: number;
  style: StylePreset;
}

export interface ProjectData {
  projectName: string;
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
  roomLabels?: RoomLabel[];
  annotations?: Annotation[];
  roomHeight: number;
  style: StylePreset;
  wallDisplayMode?: 'solid' | 'transparent' | 'hidden' | 'section' | 'wireframe';
  ceilingVisible?: boolean;
  showGrid?: boolean;
  showDimensions?: boolean;
  dayNight?: 'day' | 'night';
}

export interface VersionedProjectFile {
  version: number;
  name: string;
  createdAt: string;
  data: ProjectData;
}

// CameraBookmark → useCameraStore に移動済み
export type { CameraBookmark } from './useCameraStore';
// SavedProject → useProjectStore に移動済み
export type { SavedProject } from './useProjectStore';

interface EditorState {
  // プロジェクト
  projectName: string;

  // 図面データ
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
  roomLabels: RoomLabel[];
  annotations: Annotation[];
  roomHeight: number;
  style: StylePreset;

  // Undo/Redo
  history: HistorySnapshot[];
  historyIndex: number;

  // エディタUI状態 → useUIStore に移動済み
  // カメラ・ライティング・3D効果 → useCameraStore に移動済み
  // スナップショット・保存・ウォーターマーク → useProjectStore に移動済み

  // プロジェクト操作（EditorStoreに残す: 図面データの読み書き）
  setProjectName: (name: string) => void;
  exportProject: () => string;
  importProject: (json: string) => void;
  resetProject: () => void;
  restoreFromLocalStorage: () => boolean;

  // 壁操作
  addWall: (wall: WallSegment) => void;
  updateWall: (id: string, updates: Partial<WallSegment>) => void;
  deleteWall: (id: string) => void;
  setWalls: (walls: WallSegment[]) => void;

  // 開口部操作
  addOpening: (opening: Opening) => void;
  updateOpening: (id: string, updates: Partial<Opening>) => void;
  deleteOpening: (id: string) => void;

  // ルームラベル操作
  addRoomLabel: (label: RoomLabel) => void;
  updateRoomLabel: (id: string, updates: Partial<RoomLabel>) => void;
  deleteRoomLabel: (id: string) => void;

  // 注釈操作
  addAnnotation: (text: string, position: [number, number, number]) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  // showAnnotations → useUIStore に移動済み

  // 削除アニメーション用
  deletingFurnitureIds: string[];
  markFurnitureForDeletion: (id: string) => void;
  completeDeleteFurniture: (id: string) => void;

  // 家具操作
  addFurniture: (item: FurnitureItem) => void;
  updateFurniture: (id: string, updates: Partial<FurnitureItem>) => void;
  deleteFurniture: (id: string) => void;
  moveFurniture: (id: string, position: [number, number, number]) => void;
  rotateFurniture: (id: string, rotationY: number) => void;
  updateFurnitureColor: (id: string, color: string) => void;
  updateFurnitureMaterial: (id: string, material: FurnitureMaterial) => void;
  duplicateFurniture: (id: string) => void;
  addFurnitureSet: (items: Omit<FurnitureItem, 'id'>[]) => void;
  applyFurnitureSet: (furnitureSet: FurnitureSet) => void;

  // カスタムテクスチャオーバーライド → useUIStore に移動済み

  // スタイル・設定
  setStyle: (style: StylePreset) => void;
  setRoomHeight: (height: number) => void;

  // UI操作 — 選択/ツール/ビュー/ズーム/壁描画 → useUIStore に移動済み
  // ただし以下のデータ操作系アクションはEditorStoreに残る
  setSelectedFurniture: (id: string | null) => void;
  toggleFurnitureSelection: (id: string) => void;
  clearMultiSelection: () => void;
  alignLeft: () => void;
  alignRight: () => void;
  alignTop: () => void;
  alignBottom: () => void;
  alignCenterH: () => void;
  alignCenterV: () => void;
  distributeH: () => void;
  distributeV: () => void;
  duplicateSelectedFurniture: () => void;
  // setCameraPreset, setWalkthroughPlaying, setAutoWalkthrough, setWalkthroughSpeed,
  // setWalkthroughProgress, setDayNight, setFogDistance, setLightBrightness, setLightWarmth,
  // setSnapToGrid3D, setGridSnapSize, setSnapToWall, applyLightingPreset → useCameraStore に移動済み
  // activeRoomAtmosphere, applyRoomAtmosphere → useCameraStore に移動済み
  // enableWatermark, setEnableWatermark → useProjectStore に移動済み
  // liveCameraPosition, liveCameraRotationY → useCameraStore に移動済み

  applyAutoLayout: (roomType: string) => void;

  // 家具ロック
  toggleLockFurniture: (id: string) => void;
  lockSelected: () => void;
  unlockSelected: () => void;

  // 部屋形状
  initLShapeRoom: (w: number, d: number) => void;
  initUShapeRoom: (w: number, d: number) => void;

  // クリップボード
  clipboard: FurnitureItem | null;
  copyFurniture: () => void;
  pasteFurniture: () => void;
  selectAllFurniture: () => void;
  deleteSelected: () => void;

  // グループ操作
  createGroup: (furnitureIds: string[]) => void;
  ungroupSelected: () => void;
  moveGroup: (groupId: string, delta: [number, number, number]) => void;

  // スナップショット → useProjectStore に移動済み

  // Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // 初期化
  initRectRoom: (width: number, depth: number) => void;

  // テンプレート読み込み
  loadTemplate: (templateId: string) => void;
  loadRoomTemplate: (templateId: string) => void;
  newProject: () => void;

  // 複数プロジェクト管理 → useProjectStore に移動済み
  // showHumanFigures, environmentPreset, motionBlurEnabled, showLightGlow,
  // showFlowSimulation, referenceImageUrl/Opacity → useCameraStore に移動済み

  // 家具高さオフセット
  updateFurnitureHeight: (id: string, heightOffset: number) => void;

  // 家具個別マテリアル
  updateFurnitureMaterialOverride: (id: string, overrides: FurnitureItem['materialOverride']) => void;
  resetFurnitureMaterialOverride: (id: string) => void;

  // Round 7-10: 3D効果 → useCameraStore に移動済み

  // 仕上げ材・設備・配線
  wallFinishAssignments: WallFinishAssignment[];
  roomFinishAssignments: RoomFinishAssignment[];
  fittingSpecs: FittingSpec[];
  equipmentItems: EquipmentItem[];
  routes: RouteSegment[];
  setWallFinish: (wallId: string, finishMaterialId: string) => void;
  setAllWallsFinish: (finishMaterialId: string) => void;
  setRoomFloorFinish: (roomLabelId: string, finishId: string) => void;
  setRoomCeilingFinish: (roomLabelId: string, finishId: string) => void;
  addEquipment: (item: Omit<EquipmentItem, 'id'>) => void;
  updateEquipment: (id: string, updates: Partial<EquipmentItem>) => void;
  deleteEquipment: (id: string) => void;
  addRoute: (route: Omit<RouteSegment, 'id'>) => void;
  deleteRoute: (id: string) => void;
  setFittingSpec: (openingId: string, spec: Partial<FittingSpec>) => void;
}

function takeSnapshot(s: { walls: WallSegment[]; openings: Opening[]; furniture: FurnitureItem[]; roomLabels?: RoomLabel[]; roomHeight?: number; style?: StylePreset }): HistorySnapshot {
  return structuredClone({
    walls: s.walls,
    openings: s.openings,
    furniture: s.furniture,
    roomLabels: s.roomLabels ?? [],
    roomHeight: s.roomHeight ?? 2.7,
    style: s.style ?? 'modern',
  });
}

/** デバウンス用: 最後のスナップショット追加タイムスタンプと対象キー */
let _lastSnapshotTime = 0;
let _lastSnapshotKey = '';
/**
 * 履歴にスナップショットを追加するヘルパー。
 * debounceKey が指定されている場合、同じキーでDEBOUNCE_MS以内の連続変更は
 * 最後のスナップショットを置き換える（ドラッグ操作の統合）。
 */
function pushHistory(
  s: EditorState,
  newState: { walls: WallSegment[]; openings: Opening[]; furniture: FurnitureItem[]; roomLabels?: RoomLabel[]; roomHeight?: number; style?: StylePreset },
  debounceKey?: string,
): { history: HistorySnapshot[]; historyIndex: number } {
  const now = Date.now();
  const snapshot = takeSnapshot({
    ...newState,
    roomLabels: newState.roomLabels ?? s.roomLabels,
    roomHeight: newState.roomHeight ?? s.roomHeight,
    style: newState.style ?? s.style,
  });

  // デバウンス: 同一キーでDEBOUNCE_MS以内の変更はスナップショットを上書き
  if (debounceKey && debounceKey === _lastSnapshotKey && now - _lastSnapshotTime < DEBOUNCE_MS && s.historyIndex > 0) {
    const history = [...s.history];
    history[s.historyIndex] = snapshot;
    _lastSnapshotTime = now;
    return { history, historyIndex: s.historyIndex };
  }

  _lastSnapshotTime = now;
  _lastSnapshotKey = debounceKey ?? '';

  const history = [...s.history.slice(0, s.historyIndex + 1), snapshot].slice(-MAX_HISTORY);
  return { history, historyIndex: history.length - 1 };
}

/** 家具のAABBバウンディングボックスを計算（回転考慮、XZ平面の2D） */
function getFurnitureAABB(item: FurnitureItem): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const [px, , pz] = item.position;
  const [sx, , sz] = item.scale;
  const rotY = item.rotation[1];
  // 回転後の幅と奥行を計算
  const cosR = Math.abs(Math.cos(rotY));
  const sinR = Math.abs(Math.sin(rotY));
  const halfW = (sx * cosR + sz * sinR) / 2;
  const halfD = (sx * sinR + sz * cosR) / 2;
  return {
    minX: px - halfW,
    maxX: px + halfW,
    minZ: pz - halfD,
    maxZ: pz + halfD,
  };
}

/** 2つのAABBが重なっているか判定（XZ平面） */
function aabbOverlap(
  a: { minX: number; maxX: number; minZ: number; maxZ: number },
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** 家具の衝突を判定。movingIdの家具をnewPosに移動した際に他家具と衝突するかを返す */
function checkFurnitureCollision(
  furniture: FurnitureItem[],
  movingId: string,
  newPos: [number, number, number],
): boolean {
  const moving = furniture.find((f) => f.id === movingId);
  if (!moving) return false;
  const movedItem = { ...moving, position: newPos };
  const movedAABB = getFurnitureAABB(movedItem);
  for (const f of furniture) {
    if (f.id === movingId) continue;
    if (aabbOverlap(movedAABB, getFurnitureAABB(f))) return true;
  }
  return false;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  projectName: '新規プロジェクト',

  walls: DEFAULT_TEMPLATE.walls,
  openings: DEFAULT_TEMPLATE.openings,
  furniture: DEFAULT_TEMPLATE.furniture,
  roomLabels: [],
  annotations: [],
  roomHeight: DEFAULT_TEMPLATE.roomHeight,
  style: DEFAULT_TEMPLATE.style,

  history: [takeSnapshot({ walls: DEFAULT_TEMPLATE.walls, openings: DEFAULT_TEMPLATE.openings, furniture: DEFAULT_TEMPLATE.furniture, roomHeight: DEFAULT_TEMPLATE.roomHeight, style: DEFAULT_TEMPLATE.style })],
  historyIndex: 0,

  // activeTool, selectedWallId, selectedFurnitureId, selectedFurnitureIds,
  // viewMode, isDrawingWall, wallDrawStart, zoom → useUIStore
  // カメラ・ライティング・3D効果 → useCameraStore
  // スナップショット・保存・ウォーターマーク → useProjectStore
  deletingFurnitureIds: [],
  clipboard: null,

  // プロジェクト
  setProjectName: (projectName) => set({ projectName }),

  exportProject: () => {
    const s = get();
    const ui = useUIStore.getState();
    const cam = useCameraStore.getState();
    const data: ProjectData = {
      projectName: s.projectName,
      walls: s.walls,
      openings: s.openings,
      furniture: s.furniture,
      roomLabels: s.roomLabels,
      annotations: s.annotations,
      roomHeight: s.roomHeight,
      style: s.style,
      wallDisplayMode: ui.wallDisplayMode,
      ceilingVisible: ui.ceilingVisible,
      showGrid: ui.showGrid,
      showDimensions: ui.showDimensions,
      dayNight: cam.dayNight,
    };
    const file: VersionedProjectFile = {
      version: 1,
      name: s.projectName,
      createdAt: new Date().toISOString(),
      data,
    };
    return JSON.stringify(file, null, 2);
  },

  importProject: (json) => {
    try {
      const parsed = JSON.parse(json);
      // versioned format (version 1+) or legacy flat format
      let data: ProjectData;
      if (parsed.version && parsed.data) {
        data = parsed.data as ProjectData;
      } else {
        data = parsed as ProjectData;
      }
      if (!data.walls || !Array.isArray(data.walls)) {
        if (typeof window !== 'undefined') {
          alert('無効なプロジェクトファイルです。壁データが見つかりません。');
        }
        return;
      }
      _lastSnapshotKey = '';
      const snapshot = takeSnapshot({ ...data, roomLabels: data.roomLabels ?? [], roomHeight: data.roomHeight ?? 2.7, style: data.style || 'modern' });
      set({
        projectName: data.projectName || '読み込みプロジェクト',
        walls: data.walls,
        openings: data.openings || [],
        furniture: data.furniture || [],
        roomLabels: data.roomLabels || [],
        annotations: data.annotations || [],
        roomHeight: data.roomHeight ?? 2.7,
        style: data.style || 'modern',
        history: [snapshot],
        historyIndex: 0,
      });
      useCameraStore.getState().setDayNight(data.dayNight ?? 'day');
      useUIStore.getState()._setSelection({ selectedWallId: null, selectedFurnitureId: null, selectedFurnitureIds: [] });
      useUIStore.getState().setWallDisplayMode(data.wallDisplayMode ?? 'section');
      useUIStore.getState().setCeilingVisible(data.ceilingVisible ?? false);
      useUIStore.getState().setShowGrid(data.showGrid ?? true);
      useUIStore.getState().setShowDimensions(data.showDimensions ?? true);
    } catch {
      if (typeof window !== 'undefined') {
        alert('プロジェクトファイルの読み込みに失敗しました。JSONファイルの形式を確認してください。');
      }
    }
  },

  resetProject: () => {
    _lastSnapshotKey = '';
    const snapshot = takeSnapshot({ ...DEFAULT_TEMPLATE, roomLabels: [], roomHeight: DEFAULT_TEMPLATE.roomHeight, style: DEFAULT_TEMPLATE.style });
    set({
      projectName: '新規プロジェクト',
      walls: DEFAULT_TEMPLATE.walls,
      openings: DEFAULT_TEMPLATE.openings,
      furniture: DEFAULT_TEMPLATE.furniture,
      roomLabels: [],
      annotations: [],
      roomHeight: DEFAULT_TEMPLATE.roomHeight,
      style: DEFAULT_TEMPLATE.style,
      history: [snapshot],
      historyIndex: 0,
    });
    useUIStore.getState()._setSelection({ selectedWallId: null, selectedFurnitureId: null, selectedFurnitureIds: [] });
  },

  restoreFromLocalStorage: () => {
    try {
      // ダークモード復元
      const dm = localStorage.getItem('porano-perse-dark-mode');
      if (dm === '1') {
        useUIStore.getState().toggleDarkMode();
      }
      const saved = localStorage.getItem(LOCALSTORAGE_KEY);
      if (saved) {
        get().importProject(saved);
        return true;
      }
    } catch {
      // localStorage unavailable
    }
    return false;
  },

  // markAutoSaved → useProjectStore に移動済み

  // 壁
  addWall: (wall) =>
    set((s) => {
      const walls = [...s.walls, wall];
      return { walls, ...pushHistory(s, { walls, openings: s.openings, furniture: s.furniture }) };
    }),
  updateWall: (id, updates) =>
    set((s) => {
      const walls = s.walls.map((w) => (w.id === id ? { ...w, ...updates } : w));
      return { walls, ...pushHistory(s, { walls, openings: s.openings, furniture: s.furniture }, `wall-move-${id}`) };
    }),
  deleteWall: (id) => {
    set((s) => {
      const walls = s.walls.filter((w) => w.id !== id);
      const openings = s.openings.filter((o) => o.wallId !== id);
      return {
        walls, openings, ...pushHistory(s, { walls, openings, furniture: s.furniture }),
      };
    });
    const uiState = useUIStore.getState();
    if (uiState.selectedWallId === id) {
      uiState._setSelection({ selectedWallId: null });
    }
  },
  setWalls: (walls) =>
    set((s) => {
      return { walls, ...pushHistory(s, { walls, openings: s.openings, furniture: s.furniture }) };
    }),

  // 開口部
  addOpening: (opening) =>
    set((s) => {
      const openings = [...s.openings, opening];
      return { openings, ...pushHistory(s, { walls: s.walls, openings, furniture: s.furniture }) };
    }),
  updateOpening: (id, updates) =>
    set((s) => {
      const openings = s.openings.map((o) => (o.id === id ? { ...o, ...updates } : o));
      return { openings, ...pushHistory(s, { walls: s.walls, openings, furniture: s.furniture }, `opening-update-${id}`) };
    }),
  deleteOpening: (id) =>
    set((s) => {
      const openings = s.openings.filter((o) => o.id !== id);
      return { openings, ...pushHistory(s, { walls: s.walls, openings, furniture: s.furniture }) };
    }),

  // ルームラベル
  addRoomLabel: (label) =>
    set((s) => {
      const roomLabels = [...s.roomLabels, label];
      return { roomLabels, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture: s.furniture, roomLabels }) };
    }),
  updateRoomLabel: (id, updates) =>
    set((s) => {
      const roomLabels = s.roomLabels.map((l) => (l.id === id ? { ...l, ...updates } : l));
      return { roomLabels, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture: s.furniture, roomLabels }, `room-label-${id}`) };
    }),
  deleteRoomLabel: (id) =>
    set((s) => {
      const roomLabels = s.roomLabels.filter((l) => l.id !== id);
      return { roomLabels, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture: s.furniture, roomLabels }) };
    }),

  // 注釈
  addAnnotation: (text, position) =>
    set((s) => {
      const annotation: Annotation = {
        id: `ann_${Date.now()}`,
        text,
        position,
        color: '#ef4444',
        visible: true,
      };
      return { annotations: [...s.annotations, annotation] };
    }),
  updateAnnotation: (id, updates) =>
    set((s) => ({
      annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  deleteAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
    })),
  // setShowAnnotations → useUIStore に移動済み

  // 家具
  addFurniture: (item) => {
    set((s) => {
      const furniture = [...s.furniture, item];
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    });
    useUIStore.getState()._setSelection({ selectedFurnitureId: item.id, selectedFurnitureIds: [item.id] });
  },
  updateFurniture: (id, updates) =>
    set((s) => {
      const furniture = s.furniture.map((f) => (f.id === id ? { ...f, ...updates } : f));
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }, `furniture-update-${id}`) };
    }),
  deleteFurniture: (id) => {
    // ロック中の家具は削除不可
    const target = get().furniture.find((f) => f.id === id);
    if (target?.locked) return;
    // グループ削除: 同一groupIdの全家具を削除
    if (target?.groupId) {
      const groupItems = get().furniture.filter((f) => f.groupId === target.groupId && !f.locked);
      for (const gi of groupItems) {
        get().markFurnitureForDeletion(gi.id);
      }
      return;
    }
    // 削除アニメーション付き: まずmarkしてアニメーション後にcompleteDeleteで実削除
    get().markFurnitureForDeletion(id);
  },
  markFurnitureForDeletion: (id) =>
    set((s) => {
      // ロック中の家具は削除不可
      const target = s.furniture.find((f) => f.id === id);
      if (target?.locked) return s;
      return {
        deletingFurnitureIds: s.deletingFurnitureIds.includes(id)
          ? s.deletingFurnitureIds
          : [...s.deletingFurnitureIds, id],
      };
    }),
  completeDeleteFurniture: (id) => {
    set((s) => {
      const furniture = s.furniture.filter((f) => f.id !== id);
      const deletingFurnitureIds = s.deletingFurnitureIds.filter((fid) => fid !== id);
      return {
        furniture,
        deletingFurnitureIds,
        ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }),
      };
    });
    const ui = useUIStore.getState();
    const newSelectedIds = ui.selectedFurnitureIds.filter((fid) => fid !== id);
    ui._setSelection({
      selectedFurnitureId: ui.selectedFurnitureId === id ? null : ui.selectedFurnitureId,
      selectedFurnitureIds: newSelectedIds,
    });
  },
  moveFurniture: (id, position) =>
    set((s) => {
      // ロック中の家具は移動不可
      const target = s.furniture.find((f) => f.id === id);
      if (target?.locked) return s;

      // グループ移動: 同一groupIdの全家具をデルタ分移動
      if (target?.groupId) {
        const delta: [number, number, number] = [
          position[0] - target.position[0],
          position[1] - target.position[1],
          position[2] - target.position[2],
        ];
        const colliding = checkFurnitureCollision(s.furniture, id, position);
        const furniture = s.furniture.map((f) => {
          if (f.groupId === target.groupId) {
            if (f.id === id) return { ...f, position };
            if (f.locked) return f;
            return {
              ...f,
              position: [
                f.position[0] + delta[0],
                f.position[1] + delta[1],
                f.position[2] + delta[2],
              ] as [number, number, number],
            };
          }
          return f;
        });
        useUIStore.getState().setFurnitureCollision(colliding);
        return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }, `furniture-move-group-${target.groupId}`) };
      }

      // 衝突検出
      const colliding = checkFurnitureCollision(s.furniture, id, position);
      const furniture = s.furniture.map((f) => (f.id === id ? { ...f, position } : f));
      useUIStore.getState().setFurnitureCollision(colliding);
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }, `furniture-move-${id}`) };
    }),
  rotateFurniture: (id, rotationY) =>
    set((s) => {
      // ロック中の家具は回転不可
      const target = s.furniture.find((f) => f.id === id);
      if (target?.locked) return s;

      // グループ回転: グループ中心を軸に全メンバーを回転
      if (target?.groupId) {
        const groupItems = s.furniture.filter((f) => f.groupId === target.groupId);
        // グループ中心を計算
        const cx = groupItems.reduce((sum, f) => sum + f.position[0], 0) / groupItems.length;
        const cz = groupItems.reduce((sum, f) => sum + f.position[2], 0) / groupItems.length;
        const deltaAngle = rotationY - target.rotation[1];

        const furniture = s.furniture.map((f) => {
          if (f.groupId === target.groupId) {
            if (f.locked) return f;
            // 中心からの相対位置を回転
            const rx = f.position[0] - cx;
            const rz = f.position[2] - cz;
            const cos = Math.cos(deltaAngle);
            const sin = Math.sin(deltaAngle);
            return {
              ...f,
              position: [
                cx + rx * cos - rz * sin,
                f.position[1],
                cz + rx * sin + rz * cos,
              ] as [number, number, number],
              rotation: [f.rotation[0], f.rotation[1] + deltaAngle, f.rotation[2]] as [number, number, number],
            };
          }
          return f;
        });
        return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }, `furniture-rotate-group-${target.groupId}`) };
      }

      const furniture = s.furniture.map((f) =>
        f.id === id ? { ...f, rotation: [f.rotation[0], rotationY, f.rotation[2]] as [number, number, number] } : f
      );
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }, `furniture-rotate-${id}`) };
    }),
  updateFurnitureColor: (id, color) =>
    set((s) => {
      const furniture = s.furniture.map((f) => (f.id === id ? { ...f, color } : f));
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    }),
  updateFurnitureMaterial: (id, material) =>
    set((s) => {
      const furniture = s.furniture.map((f) => (f.id === id ? { ...f, material } : f));
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    }),

  duplicateFurniture: (id) => {
    set((s) => {
      const orig = s.furniture.find((f) => f.id === id);
      if (!orig) return s;
      const newItem: FurnitureItem = {
        ...structuredClone(orig),
        id: `${orig.type}_${Date.now()}`,
        position: [orig.position[0] + 0.5, orig.position[1], orig.position[2] + 0.5],
      };
      const furniture = [...s.furniture, newItem];
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    });
    const lastItem = get().furniture[get().furniture.length - 1];
    if (lastItem) useUIStore.getState()._setSelection({ selectedFurnitureId: lastItem.id, selectedFurnitureIds: [lastItem.id] });
  },
  addFurnitureSet: (items) =>
    set((s) => {
      const newItems = items.map((item, i) => ({
        ...item,
        id: `${item.type}_${Date.now()}_${i}`,
      }));
      const furniture = [...s.furniture, ...newItems];
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    }),

  // 家具セット一括配置（既存家具をクリアして配置）
  applyFurnitureSet: (furnitureSet: FurnitureSet) => {
    set((s) => {
      const newFurniture: FurnitureItem[] = furnitureSet.items.map((item, i) => ({
        id: `${item.type}_${Date.now()}_${i}`,
        type: item.type,
        name: item.name,
        position: [item.offsetX, 0, item.offsetZ] as [number, number, number],
        rotation: item.rotation,
        scale: item.scale,
        color: item.color,
      }));
      return {
        furniture: newFurniture,
        ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture: newFurniture }),
      };
    });
    useUIStore.getState()._setSelection({ selectedFurnitureId: null, selectedFurnitureIds: [] });
  },

  // カスタムテクスチャオーバーライド → useUIStore に移動済み
  // invalidateTextureCache は useUIStore からは呼べないため、ここでラッパーを提供
  setWallColorOverride: (color: string | null) => {
    invalidateTextureCache('wall-');
    useUIStore.getState().setWallColorOverride(color);
  },
  setFloorColorOverride: (color: string | null) => {
    invalidateTextureCache('floor-');
    useUIStore.getState().setFloorColorOverride(color);
  },
  setWallTextureType: (type: string | null) => {
    invalidateTextureCache('wall-');
    useUIStore.getState().setWallTextureType(type);
  },
  setFloorTextureType: (type: string | null) => {
    invalidateTextureCache('floor-');
    useUIStore.getState().setFloorTextureType(type);
  },
  resetTextureOverrides: () => {
    invalidateTextureCache();
    useUIStore.getState().resetTextureOverrides();
  },

  // スタイル変更時はテクスチャキャッシュを全て無効化
  setStyle: (style) => {
    invalidateTextureCache();
    set((s) => ({
      style,
      ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture: s.furniture, style }),
    }));
  },
  setRoomHeight: (roomHeight) =>
    set((s) => {
      const walls = s.walls.map((w) => ({ ...w, height: roomHeight }));
      return { roomHeight, walls, ...pushHistory(s, { walls, openings: s.openings, furniture: s.furniture, roomHeight }, 'room-height') };
    }),

  // UI — setActiveTool, setSelectedWall → useUIStore に移動済み
  // setSelectedFurniture はグループ選択ロジックがfurnitureデータに依存するためここに残る
  setSelectedFurniture: (selectedFurnitureId) => {
    const ui = useUIStore.getState();
    if (!selectedFurnitureId) {
      ui._setSelection({ selectedFurnitureId: null, selectedFurnitureIds: [] });
      return;
    }
    // グループ選択: 同一groupIdの全家具を選択
    const { furniture } = get();
    const target = furniture.find((f) => f.id === selectedFurnitureId);
    if (target?.groupId) {
      const groupIds = furniture.filter((f) => f.groupId === target.groupId).map((f) => f.id);
      ui._setSelection({ selectedFurnitureId, selectedFurnitureIds: groupIds });
    } else {
      ui._setSelection({ selectedFurnitureId, selectedFurnitureIds: [selectedFurnitureId] });
    }
  },
  toggleFurnitureSelection: (id) => {
    const ui = useUIStore.getState();
    const ids = ui.selectedFurnitureIds.includes(id)
      ? ui.selectedFurnitureIds.filter((fid) => fid !== id)
      : [...ui.selectedFurnitureIds, id];
    ui._setSelection({ selectedFurnitureIds: ids, selectedFurnitureId: ids.length > 0 ? ids[ids.length - 1] : null });
  },
  clearMultiSelection: () => {
    useUIStore.getState()._setSelection({ selectedFurnitureIds: [], selectedFurnitureId: null });
  },
  alignLeft: () => set((s) => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    const items = s.furniture.filter((f) => selIds.includes(f.id));
    if (items.length < 2) return s;
    const minX = Math.min(...items.map((f) => f.position[0]));
    const furniture = s.furniture.map((f) =>
      selIds.includes(f.id) ? { ...f, position: [minX, f.position[1], f.position[2]] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignRight: () => set((s) => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    const items = s.furniture.filter((f) => selIds.includes(f.id));
    if (items.length < 2) return s;
    const maxX = Math.max(...items.map((f) => f.position[0]));
    const furniture = s.furniture.map((f) =>
      selIds.includes(f.id) ? { ...f, position: [maxX, f.position[1], f.position[2]] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignTop: () => set((s) => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    const items = s.furniture.filter((f) => selIds.includes(f.id));
    if (items.length < 2) return s;
    const minZ = Math.min(...items.map((f) => f.position[2]));
    const furniture = s.furniture.map((f) =>
      selIds.includes(f.id) ? { ...f, position: [f.position[0], f.position[1], minZ] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignBottom: () => set((s) => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    const items = s.furniture.filter((f) => selIds.includes(f.id));
    if (items.length < 2) return s;
    const maxZ = Math.max(...items.map((f) => f.position[2]));
    const furniture = s.furniture.map((f) =>
      selIds.includes(f.id) ? { ...f, position: [f.position[0], f.position[1], maxZ] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignCenterH: () => set((s) => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    const items = s.furniture.filter((f) => selIds.includes(f.id));
    if (items.length < 2) return s;
    const avgX = items.reduce((sum, f) => sum + f.position[0], 0) / items.length;
    const furniture = s.furniture.map((f) =>
      selIds.includes(f.id) ? { ...f, position: [avgX, f.position[1], f.position[2]] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignCenterV: () => set((s) => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    const items = s.furniture.filter((f) => selIds.includes(f.id));
    if (items.length < 2) return s;
    const avgZ = items.reduce((sum, f) => sum + f.position[2], 0) / items.length;
    const furniture = s.furniture.map((f) =>
      selIds.includes(f.id) ? { ...f, position: [f.position[0], f.position[1], avgZ] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  distributeH: () => set((s) => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    const items = s.furniture.filter((f) => selIds.includes(f.id));
    if (items.length < 3) return s;
    const sorted = [...items].sort((a, b) => a.position[0] - b.position[0]);
    const minX = sorted[0].position[0];
    const maxX = sorted[sorted.length - 1].position[0];
    const step = (maxX - minX) / (sorted.length - 1);
    const posMap = new Map(sorted.map((f, i) => [f.id, minX + i * step]));
    const furniture = s.furniture.map((f) =>
      posMap.has(f.id) ? { ...f, position: [posMap.get(f.id)!, f.position[1], f.position[2]] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  distributeV: () => set((s) => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    const items = s.furniture.filter((f) => selIds.includes(f.id));
    if (items.length < 3) return s;
    const sorted = [...items].sort((a, b) => a.position[2] - b.position[2]);
    const minZ = sorted[0].position[2];
    const maxZ = sorted[sorted.length - 1].position[2];
    const step = (maxZ - minZ) / (sorted.length - 1);
    const posMap = new Map(sorted.map((f, i) => [f.id, minZ + i * step]));
    const furniture = s.furniture.map((f) =>
      posMap.has(f.id) ? { ...f, position: [f.position[0], f.position[1], posMap.get(f.id)!] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  duplicateSelectedFurniture: () => {
    const selIds = useUIStore.getState().selectedFurnitureIds;
    set((s) => {
      const items = s.furniture.filter((f) => selIds.includes(f.id));
      if (items.length === 0) return s;
      const newItems = items.map((orig, i) => ({
        ...structuredClone(orig),
        id: `${orig.type}_${Date.now()}_${i}`,
        position: [orig.position[0] + 0.5, orig.position[1], orig.position[2] + 0.5] as [number, number, number],
      }));
      const furniture = [...s.furniture, ...newItems];
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    });
    const newFurniture = get().furniture;
    const newIds = newFurniture.slice(-selIds.length).map((f) => f.id);
    useUIStore.getState()._setSelection({ selectedFurnitureIds: newIds, selectedFurnitureId: newIds[newIds.length - 1] });
  },
  // setCameraPreset ... setSnapToWall → useCameraStore に移動済み
  // setEnableWatermark → useProjectStore に移動済み

  // 家具ロック
  toggleLockFurniture: (id) =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, locked: !f.locked } : f
      ),
    })),
  lockSelected: () => {
    const ui = useUIStore.getState();
    set((s) => ({
      furniture: s.furniture.map((f) =>
        ui.selectedFurnitureIds.includes(f.id) || f.id === ui.selectedFurnitureId
          ? { ...f, locked: true }
          : f
      ),
    }));
  },
  unlockSelected: () => {
    const ui = useUIStore.getState();
    set((s) => ({
      furniture: s.furniture.map((f) =>
        ui.selectedFurnitureIds.includes(f.id) || f.id === ui.selectedFurnitureId
          ? { ...f, locked: false }
          : f
      ),
    }));
  },

  // setLiveCameraPosition, setLiveCameraRotationY → useCameraStore に移動済み
  applyAutoLayout: (roomType: string) => {
    const s = get();
    // 遅延インポートで循環参照を回避
    import('@/lib/auto-layout').then(({ generateAutoLayout }) => {
      const suggestions = generateAutoLayout(
        s.walls,
        s.openings,
        roomType as 'cafe' | 'restaurant' | 'office' | 'salon' | 'retail' | 'bar' | 'clinic',
        s.roomHeight,
      );
      const newFurniture = suggestions.map((sg, i) => ({
        id: `auto_${roomType}_${Date.now()}_${i}`,
        type: sg.furnitureType,
        name: sg.reason.slice(0, 20),
        position: sg.position,
        rotation: [0, sg.rotation, 0] as [number, number, number],
        scale: sg.scale ?? ((): [number, number, number] => {
          const cat = FURNITURE_CATALOG.find(c => c.type === sg.furnitureType);
          return cat ? [...cat.defaultScale] : [1, 1, 1];
        })(),
        color: ((): string | undefined => {
          const cat = FURNITURE_CATALOG.find(c => c.type === sg.furnitureType);
          return cat?.defaultColor;
        })(),
        material: ((): import('@/types/scene').FurnitureMaterial | undefined => {
          const cat = FURNITURE_CATALOG.find(c => c.type === sg.furnitureType);
          return cat?.defaultMaterial;
        })(),
        modelUrl: FURNITURE_CATALOG.find(c => c.type === sg.furnitureType)?.modelUrl,
      }));
      set((prev) => {
        const snapshot = pushHistory(prev, { walls: prev.walls, openings: prev.openings, furniture: newFurniture, roomLabels: prev.roomLabels });
        return { ...snapshot, furniture: newFurniture };
      });
    });
  },

  // setPhotoMode, applyRoomAtmosphere, activateDioramaMode, setFirstPersonMode,
  // setQualityLevel, applyLightingPreset → useCameraStore に移動済み

  // 部屋形状
  initLShapeRoom: (width, depth) =>
    set((s) => {
      const walls = createLShapeRoom(width, depth, s.roomHeight);
      const openings: Opening[] = [];
      const furniture: FurnitureItem[] = [];
      const roomLabels: RoomLabel[] = [];
      return { walls, openings, furniture, roomLabels, ...pushHistory(s, { walls, openings, furniture, roomLabels }) };
    }),
  initUShapeRoom: (width, depth) =>
    set((s) => {
      const walls = createUShapeRoom(width, depth, s.roomHeight);
      const openings: Opening[] = [];
      const furniture: FurnitureItem[] = [];
      const roomLabels: RoomLabel[] = [];
      return { walls, openings, furniture, roomLabels, ...pushHistory(s, { walls, openings, furniture, roomLabels }) };
    }),

  // クリップボード
  copyFurniture: () => {
    const selectedFurnitureId = useUIStore.getState().selectedFurnitureId;
    const { furniture } = get();
    if (!selectedFurnitureId) return;
    const item = furniture.find((f) => f.id === selectedFurnitureId);
    if (item) {
      set({ clipboard: structuredClone(item) });
    }
  },
  pasteFurniture: () => {
    const { clipboard } = get();
    if (!clipboard) return;
    const newItem: FurnitureItem = {
      ...structuredClone(clipboard),
      id: `${clipboard.type}_${Date.now()}`,
      position: [
        clipboard.position[0] + 0.5,
        clipboard.position[1],
        clipboard.position[2] + 0.5,
      ],
    };
    get().addFurniture(newItem);
  },
  // グループ操作
  createGroup: (furnitureIds) =>
    set((s) => {
      if (furnitureIds.length < 2) return s;
      const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const furniture = s.furniture.map((f) =>
        furnitureIds.includes(f.id) ? { ...f, groupId } : f
      );
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    }),
  ungroupSelected: () =>
    set((s) => {
      const ui = useUIStore.getState();
      const selectedIds = ui.selectedFurnitureIds.length > 0
        ? ui.selectedFurnitureIds
        : ui.selectedFurnitureId
          ? [ui.selectedFurnitureId]
          : [];
      if (selectedIds.length === 0) return s;
      const furniture = s.furniture.map((f) =>
        selectedIds.includes(f.id) ? { ...f, groupId: undefined } : f
      );
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    }),
  moveGroup: (groupId, delta) =>
    set((s) => {
      const furniture = s.furniture.map((f) => {
        if (f.groupId === groupId && !f.locked) {
          return {
            ...f,
            position: [
              f.position[0] + delta[0],
              f.position[1] + delta[1],
              f.position[2] + delta[2],
            ] as [number, number, number],
          };
        }
        return f;
      });
      return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }, `group-move-${groupId}`) };
    }),

  // saveSnapshot, loadSnapshot, deleteSnapshot, renameSnapshot → useProjectStore に移動済み

  selectAllFurniture: () => {
    const { furniture } = get();
    if (furniture.length > 0) {
      useUIStore.getState()._setSelection({
        selectedFurnitureId: furniture[furniture.length - 1].id,
        selectedFurnitureIds: furniture.map((f) => f.id),
      });
    }
  },
  deleteSelected: () => {
    const ui = useUIStore.getState();
    const { selectedFurnitureId, selectedFurnitureIds, selectedWallId } = ui;
    // 複数選択時はまとめて削除（アニメーション付き）
    if (selectedFurnitureIds.length > 1) {
      for (const fid of selectedFurnitureIds) {
        get().markFurnitureForDeletion(fid);
      }
      ui._setSelection({ selectedFurnitureId: null, selectedFurnitureIds: [] });
    } else if (selectedFurnitureId) {
      get().deleteFurniture(selectedFurnitureId);
      ui._setSelection({ selectedFurnitureId: null, selectedFurnitureIds: [] });
    } else if (selectedWallId) {
      get().deleteWall(selectedWallId);
      ui._setSelection({ selectedWallId: null });
    }
  },

  // Undo/Redo
  undo: () => {
    set((s) => {
      if (s.historyIndex <= 0) return s;
      _lastSnapshotKey = '';
      const newIndex = s.historyIndex - 1;
      const snapshot = structuredClone(s.history[newIndex]);
      return {
        walls: snapshot.walls,
        openings: snapshot.openings,
        furniture: snapshot.furniture,
        roomLabels: snapshot.roomLabels,
        roomHeight: snapshot.roomHeight,
        style: snapshot.style,
        historyIndex: newIndex,
      };
    });
    useUIStore.getState()._setSelection({ selectedWallId: null, selectedFurnitureId: null, selectedFurnitureIds: [] });
  },
  redo: () => {
    set((s) => {
      if (s.historyIndex >= s.history.length - 1) return s;
      _lastSnapshotKey = '';
      const newIndex = s.historyIndex + 1;
      const snapshot = structuredClone(s.history[newIndex]);
      return {
        walls: snapshot.walls,
        openings: snapshot.openings,
        furniture: snapshot.furniture,
        roomLabels: snapshot.roomLabels,
        roomHeight: snapshot.roomHeight,
        style: snapshot.style,
        historyIndex: newIndex,
      };
    });
    useUIStore.getState()._setSelection({ selectedWallId: null, selectedFurnitureId: null, selectedFurnitureIds: [] });
  },
  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // 初期化
  initRectRoom: (width, depth) =>
    set((s) => {
      const walls = createRectRoom(width, depth, s.roomHeight);
      const openings: Opening[] = [];
      const furniture: FurnitureItem[] = [];
      const roomLabels: RoomLabel[] = [];
      return { walls, openings, furniture, roomLabels, ...pushHistory(s, { walls, openings, furniture, roomLabels }) };
    }),

  // テンプレート読み込み
  loadTemplate: (templateId) => {
    const template = getTemplateById(templateId);
    if (!template) return;
    set((s) => ({
      walls: template.walls,
      openings: template.openings,
      furniture: template.furniture,
      roomLabels: [],
      style: template.style,
      roomHeight: template.roomHeight,
      ...pushHistory(s, { walls: template.walls, openings: template.openings, furniture: template.furniture, roomLabels: [], roomHeight: template.roomHeight, style: template.style }),
    }));
    useCameraStore.getState().setCameraPreset('diorama');
    const ui = useUIStore.getState();
    ui._setSelection({ selectedWallId: null, selectedFurnitureId: null, selectedFurnitureIds: [] });
    ui.setWallDisplayMode('section');
    ui.setCeilingVisible(false);
    ui.setSectionCutHeight(1.2);
  },

  // 部屋テンプレートプリセット読み込み
  loadRoomTemplate: (templateId) => {
    const template = getRoomTemplateById(templateId);
    if (!template) return;
    invalidateTextureCache();
    _lastSnapshotKey = '';
    set((s) => ({
      projectName: template.name,
      walls: template.walls,
      openings: template.openings,
      furniture: template.furniture,
      roomLabels: [],
      style: template.style,
      roomHeight: template.roomHeight,
      ...pushHistory(s, { walls: template.walls, openings: template.openings, furniture: template.furniture, roomLabels: [], roomHeight: template.roomHeight, style: template.style }),
    }));
    useCameraStore.getState().setCameraPreset('diorama');
    const ui = useUIStore.getState();
    ui._setSelection({ selectedWallId: null, selectedFurnitureId: null, selectedFurnitureIds: [] });
    ui.setWallDisplayMode('section');
    ui.setCeilingVisible(false);
    ui.setSectionCutHeight(1.2);
  },

  // 新規プロジェクト（全クリア）
  newProject: () => {
    _lastSnapshotKey = '';
    const walls = createRectRoom(6, 6, 2.7);
    const emptyOpenings: Opening[] = [];
    const emptyFurniture: FurnitureItem[] = [];
    const snapshot = takeSnapshot({ walls, openings: emptyOpenings, furniture: emptyFurniture, roomLabels: [], roomHeight: 2.7, style: 'modern' });
    set({
      projectName: '新規プロジェクト',
      walls,
      openings: emptyOpenings,
      furniture: emptyFurniture,
      roomLabels: [],
      annotations: [],
      roomHeight: 2.7,
      style: 'modern',
      history: [snapshot],
      historyIndex: 0,
    });
    useUIStore.getState()._setSelection({ selectedWallId: null, selectedFurnitureId: null, selectedFurnitureIds: [] });
  },

  // listSavedProjects ... loadFromShareUrl → useProjectStore に移動済み
  // toggleHumanFigures ... setReferenceImageOpacity → useCameraStore に移動済み

  // 家具高さオフセット（heightOffset + position.yを同期）
  updateFurnitureHeight: (id, heightOffset) =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        f.id === id ? {
          ...f,
          heightOffset,
          position: [f.position[0], heightOffset, f.position[2]] as [number, number, number],
        } : f
      ),
    })),

  // 家具個別マテリアル
  updateFurnitureMaterialOverride: (id, overrides) =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, materialOverride: { ...f.materialOverride, ...overrides } } : f
      ),
    })),
  resetFurnitureMaterialOverride: (id) =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, materialOverride: undefined } : f
      ),
    })),
  // Round 7-10: 全3D効果 → useCameraStore に移動済み

  // ─── 仕上げ材・設備・配線 ───────────────────────
  wallFinishAssignments: [] as WallFinishAssignment[],
  roomFinishAssignments: [] as RoomFinishAssignment[],
  fittingSpecs: [] as FittingSpec[],
  equipmentItems: [] as EquipmentItem[],
  routes: [] as RouteSegment[],

  setWallFinish: (wallId: string, finishMaterialId: string) => set((s) => ({
    wallFinishAssignments: [...s.wallFinishAssignments.filter((a: WallFinishAssignment) => a.wallId !== wallId), { wallId, finishMaterialId }],
  })),
  setAllWallsFinish: (finishMaterialId: string) => set((s) => ({
    wallFinishAssignments: s.walls.map((w: WallSegment) => ({ wallId: w.id, finishMaterialId })),
  })),
  setRoomFloorFinish: (roomLabelId: string, finishId: string) => set((s) => {
    const existing = s.roomFinishAssignments.find((a: RoomFinishAssignment) => a.roomLabelId === roomLabelId);
    if (existing) {
      return { roomFinishAssignments: s.roomFinishAssignments.map((a: RoomFinishAssignment) => a.roomLabelId === roomLabelId ? { ...a, floorFinishId: finishId } : a) };
    }
    return { roomFinishAssignments: [...s.roomFinishAssignments, { roomLabelId, floorFinishId: finishId }] };
  }),
  setRoomCeilingFinish: (roomLabelId: string, finishId: string) => set((s) => {
    const existing = s.roomFinishAssignments.find((a: RoomFinishAssignment) => a.roomLabelId === roomLabelId);
    if (existing) {
      return { roomFinishAssignments: s.roomFinishAssignments.map((a: RoomFinishAssignment) => a.roomLabelId === roomLabelId ? { ...a, ceilingFinishId: finishId } : a) };
    }
    return { roomFinishAssignments: [...s.roomFinishAssignments, { roomLabelId, ceilingFinishId: finishId }] };
  }),
  addEquipment: (item: Omit<EquipmentItem, 'id'>) => set((s) => ({
    equipmentItems: [...s.equipmentItems, { ...item, id: `eq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` } as EquipmentItem],
  })),
  updateEquipment: (id: string, updates: Partial<EquipmentItem>) => set((s) => ({
    equipmentItems: s.equipmentItems.map((e: EquipmentItem) => e.id === id ? { ...e, ...updates } : e),
  })),
  deleteEquipment: (id: string) => set((s) => ({
    equipmentItems: s.equipmentItems.filter((e: EquipmentItem) => e.id !== id),
  })),
  addRoute: (route: Omit<RouteSegment, 'id'>) => set((s) => ({
    routes: [...s.routes, { ...route, id: `rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` } as RouteSegment],
  })),
  deleteRoute: (id: string) => set((s) => ({
    routes: s.routes.filter((r: RouteSegment) => r.id !== id),
  })),
  setFittingSpec: (openingId: string, spec: Partial<FittingSpec>) => set((s) => {
    const existing = s.fittingSpecs.find((f: FittingSpec) => f.openingId === openingId);
    if (existing) {
      return { fittingSpecs: s.fittingSpecs.map((f: FittingSpec) => f.openingId === openingId ? { ...f, ...spec } : f) };
    }
    return { fittingSpecs: [...s.fittingSpecs, { openingId, productName: 'ドア', material: 'wood' as const, unitPrice: 80000, quantity: 1, ...spec }] };
  }),
}));

export { LOCALSTORAGE_KEY };
