import { create } from 'zustand';
import { EditorTool, Point2D } from '@/types/floor-plan';

// ──────────────────────────────────────────
// UI State — エディタの表示/操作に関する状態
// useEditorStore から分離（図面データとUI状態を分割）
// ──────────────────────────────────────────

export interface UIState {
  // 選択・ツール
  activeTool: EditorTool;
  selectedWallId: string | null;
  selectedFurnitureId: string | null;
  selectedFurnitureIds: string[];

  // ビュー
  viewMode: '2d' | '3d' | 'split';

  // 壁描画
  isDrawingWall: boolean;
  wallDrawStart: Point2D | null;

  // ズーム
  zoom: number;

  // 表示トグル
  showGrid: boolean;
  showDimensions: boolean;
  showFurniture: boolean;
  showAnnotations: boolean;

  // 計測・分析
  measurementActive: boolean;
  showFlowHeatmap: boolean;
  showLightingAnalysis: boolean;
  showCollisionHeatmap: boolean;

  // フォトモード
  photoMode: boolean;
  photoModePrevState: { showGrid: boolean; showDimensions: boolean; qualityLevel: 'high' | 'medium' | 'low' } | null;

  // ダークモード
  darkMode: boolean;

  // ミニマップ
  showMinimap: boolean;

  // ドラッグ・衝突
  isDraggingFurniture: boolean;
  furnitureCollision: boolean;

  // 壁・天井表示
  wallDisplayMode: 'solid' | 'transparent' | 'hidden' | 'section';
  ceilingVisible: boolean;
  sectionCutHeight: number;

  // テクスチャオーバーライド
  wallColorOverride: string | null;
  floorColorOverride: string | null;
  wallTextureType: string | null;
  floorTextureType: string | null;

  // ── アクション ──
  setActiveTool: (tool: EditorTool) => void;
  setSelectedWall: (id: string | null) => void;
  setSelectedFurniture: (id: string | null) => void;
  setSelectedWallId: (id: string | null) => void;
  /** 内部用: 選択状態を直接セット (useEditorStoreのアクションから呼ばれる) */
  _setSelection: (patch: { selectedFurnitureId?: string | null; selectedFurnitureIds?: string[]; selectedWallId?: string | null }) => void;

  startDrawingWall: (start: Point2D) => void;
  finishDrawingWall: () => void;
  cancelDrawingWall: () => void;

  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  setViewMode: (mode: '2d' | '3d' | 'split') => void;
  setShowGrid: (show: boolean) => void;
  setShowDimensions: (show: boolean) => void;
  setShowFurniture: (v: boolean) => void;
  setShowAnnotations: (show: boolean) => void;

  setWallDisplayMode: (mode: 'solid' | 'transparent' | 'hidden' | 'section') => void;
  setCeilingVisible: (visible: boolean) => void;
  setSectionCutHeight: (height: number) => void;
  activateDioramaMode: () => void;

  setWallColorOverride: (color: string | null) => void;
  setFloorColorOverride: (color: string | null) => void;
  setWallTextureType: (type: string | null) => void;
  setFloorTextureType: (type: string | null) => void;
  resetTextureOverrides: () => void;

  setMeasurementActive: (active: boolean) => void;
  toggleFlowHeatmap: () => void;
  toggleLightingAnalysis: () => void;
  toggleCollisionHeatmap: () => void;

  setPhotoMode: (v: boolean) => void;
  toggleDarkMode: () => void;
  setShowMinimap: (v: boolean) => void;

  setIsDraggingFurniture: (v: boolean) => void;
  setFurnitureCollision: (colliding: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // ── 初期値 ──
  activeTool: 'select',
  selectedWallId: null,
  selectedFurnitureId: null,
  selectedFurnitureIds: [],
  viewMode: 'split',
  isDrawingWall: false,
  wallDrawStart: null,
  zoom: 1,
  showGrid: true,
  showDimensions: true,
  showFurniture: true,
  showAnnotations: true,
  measurementActive: false,
  showFlowHeatmap: false,
  showLightingAnalysis: false,
  showCollisionHeatmap: false,
  photoMode: false,
  photoModePrevState: null,
  darkMode: false,
  showMinimap: true,
  isDraggingFurniture: false,
  furnitureCollision: false,
  wallDisplayMode: 'section',
  ceilingVisible: false,
  sectionCutHeight: 1.8,
  wallColorOverride: null,
  floorColorOverride: null,
  wallTextureType: null,
  floorTextureType: null,

  // ── アクション ──
  setActiveTool: (activeTool) =>
    set({ activeTool, isDrawingWall: false, wallDrawStart: null }),
  setSelectedWall: (selectedWallId) => set({ selectedWallId }),
  setSelectedFurniture: (selectedFurnitureId) => {
    set({ selectedFurnitureId, selectedFurnitureIds: selectedFurnitureId ? [selectedFurnitureId] : [] });
  },
  setSelectedWallId: (selectedWallId) => set({ selectedWallId }),
  _setSelection: (patch) => set(patch),

  startDrawingWall: (start) =>
    set({ isDrawingWall: true, wallDrawStart: start }),
  finishDrawingWall: () =>
    set({ isDrawingWall: false, wallDrawStart: null }),
  cancelDrawingWall: () =>
    set({ isDrawingWall: false, wallDrawStart: null }),

  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(5, s.zoom * 1.2) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.1, s.zoom / 1.2) })),
  resetZoom: () => set({ zoom: 1 }),

  setViewMode: (viewMode) => set({ viewMode }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowDimensions: (showDimensions) => set({ showDimensions }),
  setShowFurniture: (showFurniture) => set({ showFurniture }),
  setShowAnnotations: (showAnnotations) => set({ showAnnotations }),

  setWallDisplayMode: (wallDisplayMode) => set({ wallDisplayMode }),
  setCeilingVisible: (ceilingVisible) => set({ ceilingVisible }),
  setSectionCutHeight: (sectionCutHeight) => set({ sectionCutHeight: Math.max(0.5, Math.min(2.5, sectionCutHeight)) }),
  activateDioramaMode: () => set({ wallDisplayMode: 'section', ceilingVisible: false, sectionCutHeight: 1.2 }),

  setWallColorOverride: (color) => set({ wallColorOverride: color }),
  setFloorColorOverride: (color) => set({ floorColorOverride: color }),
  setWallTextureType: (type) => set({ wallTextureType: type }),
  setFloorTextureType: (type) => set({ floorTextureType: type }),
  resetTextureOverrides: () => set({
    wallColorOverride: null,
    floorColorOverride: null,
    wallTextureType: null,
    floorTextureType: null,
  }),

  setMeasurementActive: (measurementActive) => set({ measurementActive }),
  toggleFlowHeatmap: () => set((s) => ({ showFlowHeatmap: !s.showFlowHeatmap })),
  toggleLightingAnalysis: () => set((s) => ({ showLightingAnalysis: !s.showLightingAnalysis })),
  toggleCollisionHeatmap: () => set((s) => ({ showCollisionHeatmap: !s.showCollisionHeatmap })),

  setPhotoMode: (v) => set((s) => {
    if (v) {
      return {
        photoMode: true,
        viewMode: '3d' as const,
        photoModePrevState: {
          showGrid: s.showGrid,
          showDimensions: s.showDimensions,
          qualityLevel: 'medium' as const,
        },
        showGrid: false,
        showDimensions: false,
      };
    } else {
      const prev = s.photoModePrevState;
      return {
        photoMode: false,
        photoModePrevState: null,
        showGrid: prev?.showGrid ?? s.showGrid,
        showDimensions: prev?.showDimensions ?? s.showDimensions,
      };
    }
  }),

  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      try {
        localStorage.setItem('porano-perse-dark-mode', next ? '1' : '0');
      } catch { /* noop */ }
      return { darkMode: next };
    }),

  setShowMinimap: (showMinimap) => set({ showMinimap }),

  setIsDraggingFurniture: (isDraggingFurniture) => set({ isDraggingFurniture }),
  setFurnitureCollision: (furnitureCollision) => set({ furnitureCollision }),
}));
