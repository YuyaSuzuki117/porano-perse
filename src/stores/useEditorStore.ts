import { create } from 'zustand';
import { WallSegment, Opening, EditorTool, Point2D } from '@/types/floor-plan';
import { FurnitureItem, StylePreset } from '@/types/scene';
import { createRectRoom } from '@/lib/geometry';

interface EditorState {
  // 図面データ
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
  roomHeight: number;
  style: StylePreset;

  // エディタUI状態
  activeTool: EditorTool;
  selectedWallId: string | null;
  selectedFurnitureId: string | null;
  viewMode: '2d' | '3d' | 'split';
  isDrawingWall: boolean;
  wallDrawStart: Point2D | null;

  // 壁操作
  addWall: (wall: WallSegment) => void;
  updateWall: (id: string, updates: Partial<WallSegment>) => void;
  deleteWall: (id: string) => void;
  setWalls: (walls: WallSegment[]) => void;

  // 開口部操作
  addOpening: (opening: Opening) => void;
  deleteOpening: (id: string) => void;

  // 家具操作
  addFurniture: (item: FurnitureItem) => void;
  updateFurniture: (id: string, updates: Partial<FurnitureItem>) => void;
  deleteFurniture: (id: string) => void;
  moveFurniture: (id: string, position: [number, number, number]) => void;

  // スタイル・設定
  setStyle: (style: StylePreset) => void;
  setRoomHeight: (height: number) => void;

  // UI操作
  setActiveTool: (tool: EditorTool) => void;
  setSelectedWall: (id: string | null) => void;
  setSelectedFurniture: (id: string | null) => void;
  setViewMode: (mode: '2d' | '3d' | 'split') => void;
  startDrawingWall: (start: Point2D) => void;
  finishDrawingWall: () => void;
  cancelDrawingWall: () => void;

  // 初期化
  initRectRoom: (width: number, depth: number) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // 初期状態: 8x6mの矩形部屋
  walls: createRectRoom(8, 6),
  openings: [],
  furniture: [],
  roomHeight: 2.7,
  style: 'cafe',

  activeTool: 'select',
  selectedWallId: null,
  selectedFurnitureId: null,
  viewMode: 'split',
  isDrawingWall: false,
  wallDrawStart: null,

  // 壁
  addWall: (wall) =>
    set((s) => ({ walls: [...s.walls, wall] })),
  updateWall: (id, updates) =>
    set((s) => ({
      walls: s.walls.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    })),
  deleteWall: (id) =>
    set((s) => ({
      walls: s.walls.filter((w) => w.id !== id),
      openings: s.openings.filter((o) => o.wallId !== id),
      selectedWallId: s.selectedWallId === id ? null : s.selectedWallId,
    })),
  setWalls: (walls) => set({ walls }),

  // 開口部
  addOpening: (opening) =>
    set((s) => ({ openings: [...s.openings, opening] })),
  deleteOpening: (id) =>
    set((s) => ({ openings: s.openings.filter((o) => o.id !== id) })),

  // 家具
  addFurniture: (item) =>
    set((s) => ({
      furniture: [...s.furniture, item],
      selectedFurnitureId: item.id,
    })),
  updateFurniture: (id, updates) =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),
  deleteFurniture: (id) =>
    set((s) => ({
      furniture: s.furniture.filter((f) => f.id !== id),
      selectedFurnitureId: s.selectedFurnitureId === id ? null : s.selectedFurnitureId,
    })),
  moveFurniture: (id, position) =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, position } : f
      ),
    })),

  // スタイル
  setStyle: (style) => set({ style }),
  setRoomHeight: (roomHeight) =>
    set((s) => ({
      roomHeight,
      walls: s.walls.map((w) => ({ ...w, height: roomHeight })),
    })),

  // UI
  setActiveTool: (activeTool) =>
    set({ activeTool, isDrawingWall: false, wallDrawStart: null }),
  setSelectedWall: (selectedWallId) => set({ selectedWallId }),
  setSelectedFurniture: (selectedFurnitureId) => set({ selectedFurnitureId }),
  setViewMode: (viewMode) => set({ viewMode }),
  startDrawingWall: (start) =>
    set({ isDrawingWall: true, wallDrawStart: start }),
  finishDrawingWall: () =>
    set({ isDrawingWall: false, wallDrawStart: null }),
  cancelDrawingWall: () =>
    set({ isDrawingWall: false, wallDrawStart: null }),

  // 初期化
  initRectRoom: (width, depth) =>
    set((s) => ({
      walls: createRectRoom(width, depth, s.roomHeight),
      openings: [],
      furniture: [],
    })),
}));
