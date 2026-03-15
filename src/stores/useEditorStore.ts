import { create } from 'zustand';
import { WallSegment, Opening, EditorTool, Point2D, RoomLabel } from '@/types/floor-plan';
import { FurnitureItem, FurnitureMaterial, StylePreset, Annotation } from '@/types/scene';
import { WallFinishAssignment, RoomFinishAssignment, FittingSpec, EquipmentItem, RouteSegment } from '@/types/finishing';
import { createRectRoom, createLShapeRoom, createUShapeRoom } from '@/lib/geometry';
import { DEFAULT_TEMPLATE, getTemplateById } from '@/data/templates';
import { getRoomTemplateById } from '@/data/room-templates';
import { LightingPreset } from '@/data/lighting-presets';
import { FurnitureSet } from '@/data/furniture-sets';
import { invalidateTextureCache } from '@/lib/texture-cache';
import { FURNITURE_CATALOG } from '@/data/furniture';
import LZString from 'lz-string';

const MAX_HISTORY = 50;
const SHARE_URL_MAX_LENGTH = 8000;
const DEBOUNCE_MS = 300;
const LOCALSTORAGE_KEY = 'porano-perse-project';
const PROJECTS_KEY = 'porano-perse-projects';

/** デバイス性能に基づく描画品質の自動判定 */
function detectQualityLevel(): 'high' | 'medium' | 'low' {
  if (typeof navigator === 'undefined') return 'medium';
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const isLowCore = navigator.hardwareConcurrency <= 4;
  if (isMobile || isLowCore) return 'low';
  return 'medium';
}

export interface SavedProject {
  id: string;
  name: string;
  updatedAt: string;
  thumbnail?: string;
  data: string;
}

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
  wallDisplayMode?: 'solid' | 'transparent' | 'hidden' | 'section';
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

export interface CameraBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  thumbnail?: string; // base64 thumbnail
}

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

  // エディタUI状態
  activeTool: EditorTool;
  selectedWallId: string | null;
  selectedFurnitureId: string | null;
  /** 複数選択された家具ID群（Shift+クリックで追加） */
  selectedFurnitureIds: string[];
  viewMode: '2d' | '3d' | 'split';
  isDrawingWall: boolean;
  wallDrawStart: Point2D | null;
  zoom: number;
  lastAutoSaved: number | null;
  cameraPreset: string | null;
  walkthroughPlaying: boolean;
  isAutoWalkthrough: boolean;
  walkthroughSpeed: 'slow' | 'normal' | 'fast';
  walkthroughProgress: number;
  showGrid: boolean;
  showDimensions: boolean;
  dayNight: 'day' | 'night';
  fogDistance: number;
  lightBrightness: number;
  lightWarmth: number;
  // パフォーマンス設定
  qualityLevel: 'high' | 'medium' | 'low';
  setQualityLevel: (level: 'high' | 'medium' | 'low') => void;
  snapToGrid3D: boolean;
  gridSnapSize: number;
  snapToWall: boolean;
  showFurniture: boolean;
  // 壁・天井の表示制御
  wallDisplayMode: 'solid' | 'transparent' | 'hidden' | 'section';
  ceilingVisible: boolean;
  sectionCutHeight: number;
  setWallDisplayMode: (mode: 'solid' | 'transparent' | 'hidden' | 'section') => void;
  setCeilingVisible: (visible: boolean) => void;
  setSectionCutHeight: (height: number) => void;
  activateDioramaMode: () => void;
  // 家具ドラッグ中フラグ（OrbitControls無効化用）
  isDraggingFurniture: boolean;
  setIsDraggingFurniture: (v: boolean) => void;
  // ウォークスルー（一人称）モード
  isFirstPersonMode: boolean;
  setFirstPersonMode: (v: boolean) => void;
  activeLightingPreset: string | null;

  // カメラブックマーク
  cameraBookmarks: CameraBookmark[];
  addCameraBookmark: (name: string, position: [number, number, number], target: [number, number, number], thumbnail?: string) => void;
  deleteCameraBookmark: (id: string) => void;
  renameCameraBookmark: (id: string, name: string) => void;
  applyCameraBookmark: (id: string) => void;

  // スタイル比較モード
  styleCompareMode: boolean;
  styleCompareLeft: string | null; // base64 screenshot
  styleCompareRight: string | null;
  styleCompareLeftName: string | null;
  styleCompareRightName: string | null;
  setStyleCompareMode: (v: boolean) => void;
  setStyleCompareScreenshot: (side: 'left' | 'right', screenshot: string, styleName: string) => void;
  clearStyleComparison: () => void;

  // プロジェクト操作
  setProjectName: (name: string) => void;
  exportProject: () => string;
  importProject: (json: string) => void;
  resetProject: () => void;
  restoreFromLocalStorage: () => boolean;
  markAutoSaved: () => void;

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
  showAnnotations: boolean;
  setShowAnnotations: (show: boolean) => void;

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

  // カスタムテクスチャオーバーライド
  wallColorOverride: string | null;
  floorColorOverride: string | null;
  wallTextureType: string | null;
  floorTextureType: string | null;
  setWallColorOverride: (color: string | null) => void;
  setFloorColorOverride: (color: string | null) => void;
  setWallTextureType: (type: string | null) => void;
  setFloorTextureType: (type: string | null) => void;
  resetTextureOverrides: () => void;

  // スタイル・設定
  setStyle: (style: StylePreset) => void;
  setRoomHeight: (height: number) => void;

  // UI操作
  setActiveTool: (tool: EditorTool) => void;
  setSelectedWall: (id: string | null) => void;
  setSelectedFurniture: (id: string | null) => void;
  /** Shift+クリック: 複数選択にトグル追加/削除 */
  toggleFurnitureSelection: (id: string) => void;
  /** 複数選択をクリア */
  clearMultiSelection: () => void;
  /** 整列: 左揃え */
  alignLeft: () => void;
  /** 整列: 右揃え */
  alignRight: () => void;
  /** 整列: 上揃え（Z最小） */
  alignTop: () => void;
  /** 整列: 下揃え（Z最大） */
  alignBottom: () => void;
  /** 整列: 水平中央 */
  alignCenterH: () => void;
  /** 整列: 垂直中央 */
  alignCenterV: () => void;
  /** 整列: 等間隔分布（X軸） */
  distributeH: () => void;
  /** 整列: 等間隔分布（Z軸） */
  distributeV: () => void;
  /** 選択中の全家具を複製 */
  duplicateSelectedFurniture: () => void;
  setViewMode: (mode: '2d' | '3d' | 'split') => void;
  startDrawingWall: (start: Point2D) => void;
  finishDrawingWall: () => void;
  cancelDrawingWall: () => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setCameraPreset: (preset: string | null) => void;
  setWalkthroughPlaying: (playing: boolean) => void;
  setAutoWalkthrough: (active: boolean) => void;
  setWalkthroughSpeed: (speed: 'slow' | 'normal' | 'fast') => void;
  setWalkthroughProgress: (progress: number) => void;
  setShowGrid: (show: boolean) => void;
  setShowDimensions: (show: boolean) => void;
  setDayNight: (mode: 'day' | 'night') => void;
  setFogDistance: (v: number) => void;
  setLightBrightness: (v: number) => void;
  setLightWarmth: (v: number) => void;
  setSnapToGrid3D: (v: boolean) => void;
  setGridSnapSize: (v: number) => void;
  setSnapToWall: (v: boolean) => void;
  setShowFurniture: (v: boolean) => void;
  applyLightingPreset: (preset: LightingPreset) => void;

  // フォトモード
  photoMode: boolean;
  setPhotoMode: (v: boolean) => void;
  /** フォトモード直前の表示設定を保存（復帰用） */
  photoModePrevState: { showGrid: boolean; showDimensions: boolean; qualityLevel: 'high' | 'medium' | 'low' } | null;

  // ルーム雰囲気プリセット
  activeRoomAtmosphere: string | null;
  applyRoomAtmosphere: (presetName: string) => void;

  // ダークモード
  darkMode: boolean;
  toggleDarkMode: () => void;

  // 計測ツール
  measurementActive: boolean;
  setMeasurementActive: (active: boolean) => void;

  // 分析ツール
  showFlowHeatmap: boolean;
  showLightingAnalysis: boolean;
  toggleFlowHeatmap: () => void;
  toggleLightingAnalysis: () => void;
  applyAutoLayout: (roomType: string) => void;

  // ウォーターマーク設定
  enableWatermark: boolean;
  setEnableWatermark: (v: boolean) => void;

  // 衝突検出
  furnitureCollision: boolean;
  setFurnitureCollision: (colliding: boolean) => void;

  // 家具ロック
  toggleLockFurniture: (id: string) => void;
  lockSelected: () => void;
  unlockSelected: () => void;

  // カメラトラッキング（ミニマップ用）
  liveCameraPosition: [number, number, number];
  liveCameraRotationY: number;
  setLiveCameraPosition: (pos: [number, number, number]) => void;
  setLiveCameraRotationY: (rot: number) => void;

  // ミニマップ表示
  showMinimap: boolean;
  setShowMinimap: (v: boolean) => void;

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

  // スナップショット（バージョン履歴）
  snapshots: Array<{ id: string; name: string; timestamp: number; data: string }>;
  saveSnapshot: (name?: string) => void;
  loadSnapshot: (id: string) => void;
  deleteSnapshot: (id: string) => void;
  renameSnapshot: (id: string, name: string) => void;

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

  // 複数プロジェクト管理
  listSavedProjects: () => SavedProject[];
  saveProjectToList: () => void;
  loadProjectFromList: (id: string) => void;
  deleteProjectFromList: (id: string) => void;
  getShareUrl: () => { url: string; tooLong: boolean };
  loadFromShareUrl: (encoded: string) => void;

  // 人物シルエット
  showHumanFigures: boolean;
  toggleHumanFigures: () => void;

  // 環境プリセット
  environmentPreset: string;
  setEnvironmentPreset: (preset: string) => void;

  // モーションブラー
  motionBlurEnabled: boolean;
  toggleMotionBlur: () => void;

  // ライトグロー
  showLightGlow: boolean;
  toggleLightGlow: () => void;

  // 動線シミュレーション
  showFlowSimulation: boolean;
  toggleFlowSimulation: () => void;

  // 参照画像
  referenceImageUrl: string | null;
  referenceImageOpacity: number;
  setReferenceImage: (url: string | null) => void;
  setReferenceImageOpacity: (opacity: number) => void;

  // 家具高さオフセット
  updateFurnitureHeight: (id: string, heightOffset: number) => void;

  // 家具個別マテリアル
  updateFurnitureMaterialOverride: (id: string, overrides: FurnitureItem['materialOverride']) => void;
  resetFurnitureMaterialOverride: (id: string) => void;

  // Round 7: 衝突ヒートマップ
  showCollisionHeatmap: boolean;
  toggleCollisionHeatmap: () => void;

  // Round 8: ゴッドレイ
  showGodRays: boolean;
  toggleGodRays: () => void;
  godRayIntensity: number;
  setGodRayIntensity: (v: number) => void;

  // Round 8: ウェットフロア
  wetFloorEnabled: boolean;
  wetFloorWetness: number;
  toggleWetFloor: () => void;
  setWetFloorWetness: (v: number) => void;

  // Round 8: レンズフレア
  showLensFlare: boolean;
  toggleLensFlare: () => void;

  // Round 8: トーンマッピング
  toneMappingPreset: string;
  setToneMappingPreset: (preset: string) => void;

  // Round 8: レンダリング品質プリセット
  renderQualityPreset: string;
  setRenderQualityPreset: (preset: string) => void;

  // Round 9: プロシージャルスカイ
  skyTimeOfDay: number;
  showProceduralSky: boolean;
  setSkyTimeOfDay: (v: number) => void;
  toggleProceduralSky: () => void;

  // Round 9: エリアライト
  showAreaLights: boolean;
  toggleAreaLights: () => void;

  // Round 9: ガラス結露
  glassCondensation: 'off' | 'warm' | 'cold' | 'frost';
  setGlassCondensation: (v: 'off' | 'warm' | 'cold' | 'frost') => void;

  // Round 9: コースティクス
  showCaustics: boolean;
  causticsIntensity: number;
  toggleCaustics: () => void;
  setCausticsIntensity: (v: number) => void;

  // Round 9: 太陽シミュレーション
  showSunSimulation: boolean;
  toggleSunSimulation: () => void;

  // Round 9: 音響可視化
  showAcoustics: boolean;
  toggleAcoustics: () => void;

  // Round 9: ビフォーアフター
  beforeAfterActive: boolean;
  beforeAfterLeft: string | null;
  beforeAfterRight: string | null;
  beforeAfterLeftLabel: string;
  beforeAfterRightLabel: string;
  setBeforeAfter: (left: string, right: string, leftLabel: string, rightLabel: string) => void;
  closeBeforeAfter: () => void;

  // Round 9: 3Dフレーム表示
  showWindowDoorFrames: boolean;
  toggleWindowDoorFrames: () => void;

  // Round 10: 避難経路
  showEvacuation: boolean;
  toggleEvacuation: () => void;

  // Round 10: 電気配線
  showElectrical: boolean;
  toggleElectrical: () => void;

  // Round 10: 空調可視化
  showHVAC: boolean;
  toggleHVAC: () => void;

  // Round 10: 煙パーティクル
  showSmoke: boolean;
  toggleSmoke: () => void;

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
  showAnnotations: true,
  roomHeight: DEFAULT_TEMPLATE.roomHeight,
  style: DEFAULT_TEMPLATE.style,

  // カスタムテクスチャオーバーライド初期値
  wallColorOverride: null,
  floorColorOverride: null,
  wallTextureType: null,
  floorTextureType: null,

  history: [takeSnapshot({ walls: DEFAULT_TEMPLATE.walls, openings: DEFAULT_TEMPLATE.openings, furniture: DEFAULT_TEMPLATE.furniture, roomHeight: DEFAULT_TEMPLATE.roomHeight, style: DEFAULT_TEMPLATE.style })],
  historyIndex: 0,

  activeTool: 'select',
  selectedWallId: null,
  selectedFurnitureId: null,
  selectedFurnitureIds: [],
  viewMode: 'split',
  isDrawingWall: false,
  wallDrawStart: null,
  zoom: 1,
  lastAutoSaved: null,
  cameraPreset: null,
  walkthroughPlaying: false,
  isAutoWalkthrough: false,
  walkthroughSpeed: 'normal',
  walkthroughProgress: 0,
  showGrid: true,
  showDimensions: true,
  dayNight: 'day',
  fogDistance: 35,
  lightBrightness: 1.0,
  lightWarmth: 0.5,
  snapToGrid3D: true,
  gridSnapSize: 0.25,
  snapToWall: true,
  showFurniture: true,
  wallDisplayMode: 'solid',
  ceilingVisible: true,
  sectionCutHeight: 1.2,
  deletingFurnitureIds: [],
  isDraggingFurniture: false,
  isFirstPersonMode: false,
  activeLightingPreset: null,
  qualityLevel: detectQualityLevel(),
  photoMode: false,
  photoModePrevState: null,
  activeRoomAtmosphere: null,
  darkMode: false,
  measurementActive: false,
  showFlowHeatmap: false,
  showLightingAnalysis: false,
  enableWatermark: false,
  furnitureCollision: false,
  liveCameraPosition: [0, 0, 0],
  liveCameraRotationY: 0,
  showMinimap: true,
  showHumanFigures: false,
  environmentPreset: 'indoor',
  motionBlurEnabled: false,
  showLightGlow: true,
  showFlowSimulation: false,
  referenceImageUrl: null,
  referenceImageOpacity: 0.5,
  showCollisionHeatmap: false,
  showGodRays: false,
  godRayIntensity: 0.6,
  wetFloorEnabled: false,
  wetFloorWetness: 0.5,
  showLensFlare: false,
  toneMappingPreset: 'aces',
  renderQualityPreset: 'cinema',
  skyTimeOfDay: 12,
  showProceduralSky: false,
  showAreaLights: true,
  glassCondensation: 'off' as const,
  showCaustics: false,
  causticsIntensity: 0.5,
  showSunSimulation: false,
  showAcoustics: false,
  beforeAfterActive: false,
  beforeAfterLeft: null,
  beforeAfterRight: null,
  beforeAfterLeftLabel: '',
  beforeAfterRightLabel: '',
  showWindowDoorFrames: true,
  showEvacuation: false,
  showElectrical: false,
  showHVAC: false,
  showSmoke: false,
  clipboard: null,
  cameraBookmarks: [],
  snapshots: (() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('porano-perse-snapshots') : null;
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  })(),
  styleCompareMode: false,
  styleCompareLeft: null,
  styleCompareRight: null,
  styleCompareLeftName: null,
  styleCompareRightName: null,

  // カメラブックマーク
  addCameraBookmark: (name, position, target, thumbnail) =>
    set((s) => ({
      cameraBookmarks: [
        ...s.cameraBookmarks,
        {
          id: `cam_${Date.now()}`,
          name,
          position,
          target,
          thumbnail,
        },
      ],
    })),
  deleteCameraBookmark: (id) =>
    set((s) => ({
      cameraBookmarks: s.cameraBookmarks.filter((b) => b.id !== id),
    })),
  renameCameraBookmark: (id, name) =>
    set((s) => ({
      cameraBookmarks: s.cameraBookmarks.map((b) =>
        b.id === id ? { ...b, name } : b
      ),
    })),
  applyCameraBookmark: (id) => {
    const bookmark = get().cameraBookmarks.find((b) => b.id === id);
    if (bookmark) {
      // Use a special preset key to signal the CameraController
      set({ cameraPreset: `bookmark:${id}` });
    }
  },

  // スタイル比較モード
  setStyleCompareMode: (styleCompareMode) => set({ styleCompareMode }),
  setStyleCompareScreenshot: (side, screenshot, styleName) => {
    if (side === 'left') {
      set({ styleCompareLeft: screenshot, styleCompareLeftName: styleName });
    } else {
      set({ styleCompareRight: screenshot, styleCompareRightName: styleName });
    }
  },
  clearStyleComparison: () => set({
    styleCompareMode: false,
    styleCompareLeft: null,
    styleCompareRight: null,
    styleCompareLeftName: null,
    styleCompareRightName: null,
  }),

  // プロジェクト
  setProjectName: (projectName) => set({ projectName }),

  exportProject: () => {
    const s = get();
    const data: ProjectData = {
      projectName: s.projectName,
      walls: s.walls,
      openings: s.openings,
      furniture: s.furniture,
      roomLabels: s.roomLabels,
      annotations: s.annotations,
      roomHeight: s.roomHeight,
      style: s.style,
      wallDisplayMode: s.wallDisplayMode,
      ceilingVisible: s.ceilingVisible,
      showGrid: s.showGrid,
      showDimensions: s.showDimensions,
      dayNight: s.dayNight,
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
        wallDisplayMode: data.wallDisplayMode ?? 'solid',
        ceilingVisible: data.ceilingVisible ?? true,
        showGrid: data.showGrid ?? true,
        showDimensions: data.showDimensions ?? true,
        dayNight: data.dayNight ?? 'day',
        selectedWallId: null,
        selectedFurnitureId: null,
        selectedFurnitureIds: [],
        history: [snapshot],
        historyIndex: 0,
      });
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
      selectedWallId: null,
      selectedFurnitureId: null,
      selectedFurnitureIds: [],
      history: [snapshot],
      historyIndex: 0,
    });
  },

  restoreFromLocalStorage: () => {
    try {
      // ダークモード復元
      const dm = localStorage.getItem('porano-perse-dark-mode');
      if (dm === '1') {
        set({ darkMode: true });
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

  markAutoSaved: () => set({ lastAutoSaved: Date.now() }),

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
  deleteWall: (id) =>
    set((s) => {
      const walls = s.walls.filter((w) => w.id !== id);
      const openings = s.openings.filter((o) => o.wallId !== id);
      return {
        walls, openings, ...pushHistory(s, { walls, openings, furniture: s.furniture }),
        selectedWallId: s.selectedWallId === id ? null : s.selectedWallId,
      };
    }),
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
  setShowAnnotations: (showAnnotations) => set({ showAnnotations }),

  // 家具
  addFurniture: (item) =>
    set((s) => {
      const furniture = [...s.furniture, item];
      return { furniture, selectedFurnitureId: item.id, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    }),
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
  completeDeleteFurniture: (id) =>
    set((s) => {
      const furniture = s.furniture.filter((f) => f.id !== id);
      const selectedFurnitureIds = s.selectedFurnitureIds.filter((fid) => fid !== id);
      const deletingFurnitureIds = s.deletingFurnitureIds.filter((fid) => fid !== id);
      return {
        furniture,
        deletingFurnitureIds,
        ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }),
        selectedFurnitureId: s.selectedFurnitureId === id ? null : s.selectedFurnitureId,
        selectedFurnitureIds,
      };
    }),
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
        return { furniture, furnitureCollision: colliding, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }, `furniture-move-group-${target.groupId}`) };
      }

      // 衝突検出
      const colliding = checkFurnitureCollision(s.furniture, id, position);
      const furniture = s.furniture.map((f) => (f.id === id ? { ...f, position } : f));
      return { furniture, furnitureCollision: colliding, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }, `furniture-move-${id}`) };
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

  duplicateFurniture: (id) =>
    set((s) => {
      const orig = s.furniture.find((f) => f.id === id);
      if (!orig) return s;
      const newItem: FurnitureItem = {
        ...structuredClone(orig),
        id: `${orig.type}_${Date.now()}`,
        position: [orig.position[0] + 0.5, orig.position[1], orig.position[2] + 0.5],
      };
      const furniture = [...s.furniture, newItem];
      return { furniture, selectedFurnitureId: newItem.id, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
    }),
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
  applyFurnitureSet: (furnitureSet: FurnitureSet) =>
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
        selectedFurnitureId: null,
        selectedFurnitureIds: [],
        ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture: newFurniture }),
      };
    }),

  // カスタムテクスチャオーバーライド（変更時に該当キャッシュを無効化）
  setWallColorOverride: (color) => {
    invalidateTextureCache('wall-');
    set({ wallColorOverride: color });
  },
  setFloorColorOverride: (color) => {
    invalidateTextureCache('floor-');
    set({ floorColorOverride: color });
  },
  setWallTextureType: (type) => {
    invalidateTextureCache('wall-');
    set({ wallTextureType: type });
  },
  setFloorTextureType: (type) => {
    invalidateTextureCache('floor-');
    set({ floorTextureType: type });
  },
  resetTextureOverrides: () => {
    invalidateTextureCache();
    set({
      wallColorOverride: null,
      floorColorOverride: null,
      wallTextureType: null,
      floorTextureType: null,
    });
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

  // UI
  setActiveTool: (activeTool) =>
    set({ activeTool, isDrawingWall: false, wallDrawStart: null }),
  setSelectedWall: (selectedWallId) => set({ selectedWallId }),
  setSelectedFurniture: (selectedFurnitureId) => {
    if (!selectedFurnitureId) {
      set({ selectedFurnitureId: null, selectedFurnitureIds: [] });
      return;
    }
    // グループ選択: 同一groupIdの全家具を選択
    const { furniture } = get();
    const target = furniture.find((f) => f.id === selectedFurnitureId);
    if (target?.groupId) {
      const groupIds = furniture.filter((f) => f.groupId === target.groupId).map((f) => f.id);
      set({ selectedFurnitureId, selectedFurnitureIds: groupIds });
    } else {
      set({ selectedFurnitureId, selectedFurnitureIds: [selectedFurnitureId] });
    }
  },
  toggleFurnitureSelection: (id) => set((s) => {
    const ids = s.selectedFurnitureIds.includes(id)
      ? s.selectedFurnitureIds.filter((fid) => fid !== id)
      : [...s.selectedFurnitureIds, id];
    return { selectedFurnitureIds: ids, selectedFurnitureId: ids.length > 0 ? ids[ids.length - 1] : null };
  }),
  clearMultiSelection: () => set({ selectedFurnitureIds: [], selectedFurnitureId: null }),
  alignLeft: () => set((s) => {
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
    if (items.length < 2) return s;
    const minX = Math.min(...items.map((f) => f.position[0]));
    const furniture = s.furniture.map((f) =>
      s.selectedFurnitureIds.includes(f.id) ? { ...f, position: [minX, f.position[1], f.position[2]] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignRight: () => set((s) => {
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
    if (items.length < 2) return s;
    const maxX = Math.max(...items.map((f) => f.position[0]));
    const furniture = s.furniture.map((f) =>
      s.selectedFurnitureIds.includes(f.id) ? { ...f, position: [maxX, f.position[1], f.position[2]] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignTop: () => set((s) => {
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
    if (items.length < 2) return s;
    const minZ = Math.min(...items.map((f) => f.position[2]));
    const furniture = s.furniture.map((f) =>
      s.selectedFurnitureIds.includes(f.id) ? { ...f, position: [f.position[0], f.position[1], minZ] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignBottom: () => set((s) => {
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
    if (items.length < 2) return s;
    const maxZ = Math.max(...items.map((f) => f.position[2]));
    const furniture = s.furniture.map((f) =>
      s.selectedFurnitureIds.includes(f.id) ? { ...f, position: [f.position[0], f.position[1], maxZ] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignCenterH: () => set((s) => {
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
    if (items.length < 2) return s;
    const avgX = items.reduce((sum, f) => sum + f.position[0], 0) / items.length;
    const furniture = s.furniture.map((f) =>
      s.selectedFurnitureIds.includes(f.id) ? { ...f, position: [avgX, f.position[1], f.position[2]] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  alignCenterV: () => set((s) => {
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
    if (items.length < 2) return s;
    const avgZ = items.reduce((sum, f) => sum + f.position[2], 0) / items.length;
    const furniture = s.furniture.map((f) =>
      s.selectedFurnitureIds.includes(f.id) ? { ...f, position: [f.position[0], f.position[1], avgZ] as [number, number, number] } : f
    );
    return { furniture, ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  distributeH: () => set((s) => {
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
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
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
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
  duplicateSelectedFurniture: () => set((s) => {
    const items = s.furniture.filter((f) => s.selectedFurnitureIds.includes(f.id));
    if (items.length === 0) return s;
    const newItems = items.map((orig, i) => ({
      ...structuredClone(orig),
      id: `${orig.type}_${Date.now()}_${i}`,
      position: [orig.position[0] + 0.5, orig.position[1], orig.position[2] + 0.5] as [number, number, number],
    }));
    const furniture = [...s.furniture, ...newItems];
    const newIds = newItems.map((f) => f.id);
    return { furniture, selectedFurnitureIds: newIds, selectedFurnitureId: newIds[newIds.length - 1], ...pushHistory(s, { walls: s.walls, openings: s.openings, furniture }) };
  }),
  setViewMode: (viewMode) => set({ viewMode }),
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
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),
  setWalkthroughPlaying: (walkthroughPlaying) => set({ walkthroughPlaying, isAutoWalkthrough: false, walkthroughProgress: 0 }),
  setAutoWalkthrough: (isAutoWalkthrough) => set((s) => ({
    isAutoWalkthrough,
    walkthroughPlaying: isAutoWalkthrough ? true : s.walkthroughPlaying,
    walkthroughProgress: isAutoWalkthrough ? 0 : s.walkthroughProgress,
    // Mutual exclusion with first-person mode
    isFirstPersonMode: isAutoWalkthrough ? false : s.isFirstPersonMode,
  })),
  setWalkthroughSpeed: (walkthroughSpeed) => set({ walkthroughSpeed }),
  setWalkthroughProgress: (walkthroughProgress) => set({ walkthroughProgress }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowDimensions: (showDimensions) => set({ showDimensions }),
  setDayNight: (dayNight) => set({ dayNight }),
  setFogDistance: (fogDistance) => set({ fogDistance }),
  setLightBrightness: (lightBrightness) => set({ lightBrightness: Math.max(0.2, Math.min(3, lightBrightness)), activeLightingPreset: null }),
  setLightWarmth: (lightWarmth) => set({ lightWarmth: Math.max(0, Math.min(1, lightWarmth)), activeLightingPreset: null }),
  setSnapToGrid3D: (snapToGrid3D) => set({ snapToGrid3D }),
  setGridSnapSize: (gridSnapSize) => set({ gridSnapSize }),
  setSnapToWall: (snapToWall) => set({ snapToWall }),
  setShowFurniture: (showFurniture) => set({ showFurniture }),
  setEnableWatermark: (enableWatermark) => set({ enableWatermark }),

  // 衝突検出
  setFurnitureCollision: (furnitureCollision) => set({ furnitureCollision }),

  // 家具ロック
  toggleLockFurniture: (id) =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, locked: !f.locked } : f
      ),
    })),
  lockSelected: () =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        s.selectedFurnitureIds.includes(f.id) || f.id === s.selectedFurnitureId
          ? { ...f, locked: true }
          : f
      ),
    })),
  unlockSelected: () =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        s.selectedFurnitureIds.includes(f.id) || f.id === s.selectedFurnitureId
          ? { ...f, locked: false }
          : f
      ),
    })),

  // カメラトラッキング（ミニマップ用）
  setLiveCameraPosition: (liveCameraPosition) => set({ liveCameraPosition }),
  setLiveCameraRotationY: (liveCameraRotationY) => set({ liveCameraRotationY }),

  // ミニマップ表示
  setShowMinimap: (showMinimap) => set({ showMinimap }),

  // ダークモード: localStorage永続化付き
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode;
      try {
        localStorage.setItem('porano-perse-dark-mode', next ? '1' : '0');
      } catch { /* noop */ }
      return { darkMode: next };
    }),

  // 計測ツール
  setMeasurementActive: (measurementActive) => set({ measurementActive }),

  // 分析ツール
  toggleFlowHeatmap: () => set((s) => ({ showFlowHeatmap: !s.showFlowHeatmap })),
  toggleLightingAnalysis: () => set((s) => ({ showLightingAnalysis: !s.showLightingAnalysis })),
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

  // フォトモード
  setPhotoMode: (v) => set((s) => {
    if (v) {
      // フォトモード開始: 3Dビューに強制切替 + UI非表示
      // 注意: qualityLevelは変更しない（highに切替るとモバイルでWebGLクラッシュ）
      // 高解像度はスクリーンショット撮影時にuseScreenshotが一時的に上げる
      return {
        photoMode: true,
        viewMode: '3d' as const,
        photoModePrevState: {
          showGrid: s.showGrid,
          showDimensions: s.showDimensions,
          qualityLevel: s.qualityLevel,
        },
        showGrid: false,
        showDimensions: false,
      };
    } else {
      // フォトモード終了: 元の設定に復帰
      const prev = s.photoModePrevState;
      return {
        photoMode: false,
        photoModePrevState: null,
        showGrid: prev?.showGrid ?? s.showGrid,
        showDimensions: prev?.showDimensions ?? s.showDimensions,
        qualityLevel: prev?.qualityLevel ?? s.qualityLevel,
      };
    }
  }),

  // ルーム雰囲気プリセット
  applyRoomAtmosphere: (presetName) => set((s) => {
    const ROOM_ATMOSPHERE_MAP: Record<string, {
      style: StylePreset;
      wallColor: string;
      floorColor: string;
      floorTextureType: string;
      wallTextureType: string | null;
      brightness: number;
      warmth: number;
      dayNight: 'day' | 'night';
    }> = {
      'natural': {
        style: 'scandinavian',
        wallColor: '#FFFFFF',
        floorColor: '#C9A96E',
        floorTextureType: 'scandinavian',
        wallTextureType: null,
        brightness: 1.0,
        warmth: 0.55,
        dayNight: 'day',
      },
      'modern': {
        style: 'modern',
        wallColor: '#E0E0E0',
        floorColor: '#2A2A3A',
        floorTextureType: 'modern',
        wallTextureType: null,
        brightness: 1.1,
        warmth: 0.3,
        dayNight: 'day',
      },
      'retro': {
        style: 'retro',
        wallColor: '#FFF5E1',
        floorColor: '#8B6914',
        floorTextureType: 'cafe',
        wallTextureType: null,
        brightness: 0.8,
        warmth: 0.8,
        dayNight: 'day',
      },
      'japanese': {
        style: 'japanese',
        wallColor: '#F0E6D0',
        floorColor: '#B8A84C',
        floorTextureType: 'japanese',
        wallTextureType: null,
        brightness: 0.75,
        warmth: 0.65,
        dayNight: 'day',
      },
      'industrial': {
        style: 'industrial',
        wallColor: '#A0522D',
        floorColor: '#808080',
        floorTextureType: 'industrial',
        wallTextureType: null,
        brightness: 0.9,
        warmth: 0.35,
        dayNight: 'day',
      },
    };
    const preset = ROOM_ATMOSPHERE_MAP[presetName];
    if (!preset) return {};
    return {
      style: preset.style,
      wallColorOverride: preset.wallColor,
      floorColorOverride: preset.floorColor,
      floorTextureType: preset.floorTextureType,
      wallTextureType: preset.wallTextureType,
      lightBrightness: preset.brightness,
      lightWarmth: preset.warmth,
      dayNight: preset.dayNight,
      activeLightingPreset: null,
      activeRoomAtmosphere: presetName,
    };
  }),
  setWallDisplayMode: (wallDisplayMode) => set({ wallDisplayMode }),
  setCeilingVisible: (ceilingVisible) => set({ ceilingVisible }),
  setSectionCutHeight: (sectionCutHeight) => set({ sectionCutHeight: Math.max(0.5, Math.min(2.5, sectionCutHeight)) }),
  activateDioramaMode: () => set({ wallDisplayMode: 'section', ceilingVisible: false, sectionCutHeight: 1.2, cameraPreset: 'diorama' }),
  setIsDraggingFurniture: (isDraggingFurniture) => set({ isDraggingFurniture }),
  setFirstPersonMode: (isFirstPersonMode) => set((s) => ({
    isFirstPersonMode,
    // 一人称モード開始時はウォークスルー再生を停止
    walkthroughPlaying: isFirstPersonMode ? false : s.walkthroughPlaying,
    isAutoWalkthrough: isFirstPersonMode ? false : s.isAutoWalkthrough,
  })),
  setQualityLevel: (qualityLevel) => set({ qualityLevel }),
  applyLightingPreset: (preset) => set({
    lightBrightness: Math.max(0.2, Math.min(3, preset.brightness)),
    lightWarmth: Math.max(0, Math.min(1, preset.warmth)),
    dayNight: preset.dayNight,
    activeLightingPreset: preset.name,
  }),

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
    const { selectedFurnitureId, furniture } = get();
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
      const selectedIds = s.selectedFurnitureIds.length > 0
        ? s.selectedFurnitureIds
        : s.selectedFurnitureId
          ? [s.selectedFurnitureId]
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

  // スナップショット（バージョン履歴）
  saveSnapshot: (name) => {
    const s = get();
    const now = Date.now();
    const autoName = name || `スナップショット ${new Date(now).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    const snapshotData = JSON.stringify({
      walls: s.walls,
      furniture: s.furniture,
      openings: s.openings,
      style: s.style,
      roomHeight: s.roomHeight,
    });
    const newSnapshot = {
      id: `snap_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: autoName,
      timestamp: now,
      data: snapshotData,
    };
    const snapshots = [...s.snapshots, newSnapshot];
    // 10件超過時は古いものを削除
    while (snapshots.length > 10) snapshots.shift();
    set({ snapshots });
    try { localStorage.setItem('porano-perse-snapshots', JSON.stringify(snapshots)); } catch { /* ignore */ }
  },
  loadSnapshot: (id) => {
    const s = get();
    const snapshot = s.snapshots.find((snap) => snap.id === id);
    if (!snapshot) return;
    try {
      const parsed = JSON.parse(snapshot.data);
      // 現在の状態をundo履歴にプッシュしてから復元
      const histUpdate = pushHistory(s, { walls: s.walls, openings: s.openings, furniture: s.furniture, roomHeight: s.roomHeight, style: s.style });
      set({
        walls: parsed.walls ?? s.walls,
        furniture: parsed.furniture ?? s.furniture,
        openings: parsed.openings ?? s.openings,
        style: parsed.style ?? s.style,
        roomHeight: parsed.roomHeight ?? s.roomHeight,
        ...histUpdate,
      });
    } catch { /* invalid data */ }
  },
  deleteSnapshot: (id) => {
    set((s) => {
      const snapshots = s.snapshots.filter((snap) => snap.id !== id);
      try { localStorage.setItem('porano-perse-snapshots', JSON.stringify(snapshots)); } catch { /* ignore */ }
      return { snapshots };
    });
  },
  renameSnapshot: (id, name) => {
    set((s) => {
      const snapshots = s.snapshots.map((snap) =>
        snap.id === id ? { ...snap, name } : snap
      );
      try { localStorage.setItem('porano-perse-snapshots', JSON.stringify(snapshots)); } catch { /* ignore */ }
      return { snapshots };
    });
  },

  selectAllFurniture: () => {
    const { furniture } = get();
    if (furniture.length > 0) {
      set({
        selectedFurnitureId: furniture[furniture.length - 1].id,
        selectedFurnitureIds: furniture.map((f) => f.id),
      });
    }
  },
  deleteSelected: () => {
    const { selectedFurnitureId, selectedFurnitureIds, selectedWallId } = get();
    // 複数選択時はまとめて削除（アニメーション付き）
    if (selectedFurnitureIds.length > 1) {
      for (const fid of selectedFurnitureIds) {
        get().markFurnitureForDeletion(fid);
      }
      set({ selectedFurnitureId: null, selectedFurnitureIds: [] });
    } else if (selectedFurnitureId) {
      get().deleteFurniture(selectedFurnitureId);
      set({ selectedFurnitureId: null, selectedFurnitureIds: [] });
    } else if (selectedWallId) {
      get().deleteWall(selectedWallId);
      set({ selectedWallId: null });
    }
  },

  // Undo/Redo
  undo: () =>
    set((s) => {
      if (s.historyIndex <= 0) return s;
      // デバウンスタイマーをクリア（undo後の変更が前の操作と統合されないように）
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
        selectedWallId: null,
        selectedFurnitureId: null,
        selectedFurnitureIds: [],
      };
    }),
  redo: () =>
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
        selectedWallId: null,
        selectedFurnitureId: null,
        selectedFurnitureIds: [],
      };
    }),
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
      selectedWallId: null,
      selectedFurnitureId: null,
      selectedFurnitureIds: [],
      // ジオラマモードをデフォルトに
      wallDisplayMode: 'section' as const,
      ceilingVisible: false,
      sectionCutHeight: 1.2,
      cameraPreset: 'diorama',
      ...pushHistory(s, { walls: template.walls, openings: template.openings, furniture: template.furniture, roomLabels: [], roomHeight: template.roomHeight, style: template.style }),
    }));
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
      selectedWallId: null,
      selectedFurnitureId: null,
      selectedFurnitureIds: [],
      // ジオラマモードをデフォルトに
      wallDisplayMode: 'section' as const,
      ceilingVisible: false,
      sectionCutHeight: 1.2,
      cameraPreset: 'diorama',
      ...pushHistory(s, { walls: template.walls, openings: template.openings, furniture: template.furniture, roomLabels: [], roomHeight: template.roomHeight, style: template.style }),
    }));
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
      selectedWallId: null,
      selectedFurnitureId: null,
      selectedFurnitureIds: [],
      history: [snapshot],
      historyIndex: 0,
    });
  },

  // 複数プロジェクト管理
  listSavedProjects: () => {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      return raw ? (JSON.parse(raw) as SavedProject[]) : [];
    } catch {
      return [];
    }
  },

  saveProjectToList: () => {
    const state = get();
    const projectData = state.exportProject();
    try {
      const projects: SavedProject[] = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      const existing = projects.findIndex((p) => p.name === state.projectName);
      const entry: SavedProject = {
        id: existing >= 0 ? projects[existing].id : `proj_${Date.now()}`,
        name: state.projectName,
        updatedAt: new Date().toISOString(),
        data: projectData,
      };
      if (existing >= 0) {
        projects[existing] = entry;
      } else {
        projects.unshift(entry);
      }
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    } catch {
      // localStorage unavailable or quota exceeded
    }
  },

  loadProjectFromList: (id) => {
    try {
      const projects: SavedProject[] = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      const project = projects.find((p) => p.id === id);
      if (project) {
        get().importProject(project.data);
      }
    } catch {
      // invalid data
    }
  },

  deleteProjectFromList: (id) => {
    try {
      const projects: SavedProject[] = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
      const filtered = projects.filter((p) => p.id !== id);
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(filtered));
    } catch {
      // localStorage unavailable
    }
  },

  getShareUrl: () => {
    const data = get().exportProject();
    const compressed = LZString.compressToEncodedURIComponent(data);
    const url = `${window.location.origin}${window.location.pathname}#project=${compressed}`;
    return { url, tooLong: url.length > SHARE_URL_MAX_LENGTH };
  },

  loadFromShareUrl: (encoded) => {
    try {
      // LZString圧縮形式（新）
      const json = LZString.decompressFromEncodedURIComponent(encoded);
      if (json) {
        get().importProject(json);
        return;
      }
      // レガシーbtoa形式にフォールバック
      const legacy = decodeURIComponent(escape(atob(encoded)));
      get().importProject(legacy);
    } catch (e) {
      console.error('Failed to load shared project:', e);
    }
  },

  // 人物シルエット
  toggleHumanFigures: () => set((s) => ({ showHumanFigures: !s.showHumanFigures })),

  // 環境プリセット
  setEnvironmentPreset: (environmentPreset) => set({ environmentPreset }),

  // モーションブラー
  toggleMotionBlur: () => set((s) => ({ motionBlurEnabled: !s.motionBlurEnabled })),

  // ライトグロー
  toggleLightGlow: () => set((s) => ({ showLightGlow: !s.showLightGlow })),

  // 動線シミュレーション
  toggleFlowSimulation: () => set((s) => ({ showFlowSimulation: !s.showFlowSimulation })),

  // 参照画像
  setReferenceImage: (referenceImageUrl) => set({ referenceImageUrl }),
  setReferenceImageOpacity: (referenceImageOpacity) => set({ referenceImageOpacity }),

  // 家具高さオフセット
  updateFurnitureHeight: (id, heightOffset) =>
    set((s) => ({
      furniture: s.furniture.map((f) =>
        f.id === id ? { ...f, heightOffset } : f
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
  // Round 7: 衝突ヒートマップ
  toggleCollisionHeatmap: () => set((s) => ({ showCollisionHeatmap: !s.showCollisionHeatmap })),
  // Round 8
  toggleGodRays: () => set((s) => ({ showGodRays: !s.showGodRays })),
  setGodRayIntensity: (v) => set({ godRayIntensity: v }),
  toggleWetFloor: () => set((s) => ({ wetFloorEnabled: !s.wetFloorEnabled })),
  setWetFloorWetness: (v) => set({ wetFloorWetness: v }),
  toggleLensFlare: () => set((s) => ({ showLensFlare: !s.showLensFlare })),
  setToneMappingPreset: (preset) => set({ toneMappingPreset: preset }),
  setRenderQualityPreset: (preset) => set({ renderQualityPreset: preset }),
  // Round 9
  setSkyTimeOfDay: (v) => set({ skyTimeOfDay: v }),
  toggleProceduralSky: () => set((s) => ({ showProceduralSky: !s.showProceduralSky })),
  toggleAreaLights: () => set((s) => ({ showAreaLights: !s.showAreaLights })),
  setGlassCondensation: (v) => set({ glassCondensation: v }),
  toggleCaustics: () => set((s) => ({ showCaustics: !s.showCaustics })),
  setCausticsIntensity: (v) => set({ causticsIntensity: v }),
  toggleSunSimulation: () => set((s) => ({ showSunSimulation: !s.showSunSimulation })),
  toggleAcoustics: () => set((s) => ({ showAcoustics: !s.showAcoustics })),
  setBeforeAfter: (left, right, leftLabel, rightLabel) => set({
    beforeAfterActive: true,
    beforeAfterLeft: left,
    beforeAfterRight: right,
    beforeAfterLeftLabel: leftLabel,
    beforeAfterRightLabel: rightLabel,
  }),
  closeBeforeAfter: () => set({
    beforeAfterActive: false,
    beforeAfterLeft: null,
    beforeAfterRight: null,
    beforeAfterLeftLabel: '',
    beforeAfterRightLabel: '',
  }),
  toggleWindowDoorFrames: () => set((s) => ({ showWindowDoorFrames: !s.showWindowDoorFrames })),
  // Round 10
  toggleEvacuation: () => set((s) => ({ showEvacuation: !s.showEvacuation })),
  toggleElectrical: () => set((s) => ({ showElectrical: !s.showElectrical })),
  toggleHVAC: () => set((s) => ({ showHVAC: !s.showHVAC })),
  toggleSmoke: () => set((s) => ({ showSmoke: !s.showSmoke })),

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
