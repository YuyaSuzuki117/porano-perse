import { create } from 'zustand';
import { LightingPreset } from '@/data/lighting-presets';
import { StylePreset } from '@/types/scene';
import { useUIStore } from './useUIStore';

// ──────────────────────────────────────────
// Camera & Rendering State
// useEditorStore から分離（カメラ・ライティング・3D効果）
// ──────────────────────────────────────────

/** デバイス性能に基づく描画品質の自動判定 */
function detectQualityLevel(): 'high' | 'medium' | 'low' {
  if (typeof navigator === 'undefined') return 'medium';
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const isLowCore = navigator.hardwareConcurrency <= 4;
  if (isMobile || isLowCore) return 'low';
  return 'medium';
}

export interface CameraBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  thumbnail?: string; // base64 thumbnail
}

export interface CameraState {
  // カメラプリセット
  cameraPreset: string | null;
  setCameraPreset: (preset: string | null) => void;

  // カメラブックマーク
  cameraBookmarks: CameraBookmark[];
  addCameraBookmark: (name: string, position: [number, number, number], target: [number, number, number], thumbnail?: string) => void;
  deleteCameraBookmark: (id: string) => void;
  renameCameraBookmark: (id: string, name: string) => void;
  applyCameraBookmark: (id: string) => void;

  // 一人称モード
  isFirstPersonMode: boolean;
  setFirstPersonMode: (v: boolean) => void;

  // ウォークスルー
  walkthroughPlaying: boolean;
  isAutoWalkthrough: boolean;
  walkthroughSpeed: 'slow' | 'normal' | 'fast';
  walkthroughProgress: number;
  setWalkthroughPlaying: (v: boolean) => void;
  setAutoWalkthrough: (v: boolean) => void;
  setWalkthroughSpeed: (speed: 'slow' | 'normal' | 'fast') => void;
  setWalkthroughProgress: (progress: number) => void;

  // ライティング
  dayNight: 'day' | 'night';
  fogDistance: number;
  lightBrightness: number;
  lightWarmth: number;
  activeLightingPreset: string | null;
  setDayNight: (v: 'day' | 'night') => void;
  setFogDistance: (v: number) => void;
  setLightBrightness: (v: number) => void;
  setLightWarmth: (v: number) => void;
  applyLightingPreset: (preset: LightingPreset) => void;

  // 品質
  qualityLevel: 'high' | 'medium' | 'low';
  setQualityLevel: (level: 'high' | 'medium' | 'low') => void;

  // 3Dスナップ
  snapToGrid3D: boolean;
  gridSnapSize: number;
  snapToWall: boolean;
  setSnapToGrid3D: (v: boolean) => void;
  setGridSnapSize: (v: number) => void;
  setSnapToWall: (v: boolean) => void;

  // カメラトラッキング（ミニマップ用）
  liveCameraPosition: [number, number, number];
  liveCameraRotationY: number;
  setLiveCameraPosition: (pos: [number, number, number]) => void;
  setLiveCameraRotationY: (rot: number) => void;

  // スタイル比較モード
  styleCompareMode: boolean;
  styleCompareLeft: string | null;
  styleCompareRight: string | null;
  styleCompareLeftName: string | null;
  styleCompareRightName: string | null;
  setStyleCompareMode: (v: boolean) => void;
  setStyleCompareScreenshot: (side: 'left' | 'right', screenshot: string, styleName: string) => void;
  clearStyleComparison: () => void;

  // ルーム雰囲気プリセット
  activeRoomAtmosphere: string | null;
  applyRoomAtmosphere: (presetName: string) => void;

  // 参照画像
  referenceImageUrl: string | null;
  referenceImageOpacity: number;
  setReferenceImage: (url: string | null) => void;
  setReferenceImageOpacity: (opacity: number) => void;

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

  // ゴッドレイ
  showGodRays: boolean;
  godRayIntensity: number;
  toggleGodRays: () => void;
  setGodRayIntensity: (v: number) => void;

  // ウェットフロア
  wetFloorEnabled: boolean;
  wetFloorWetness: number;
  toggleWetFloor: () => void;
  setWetFloorWetness: (v: number) => void;

  // レンズフレア
  showLensFlare: boolean;
  toggleLensFlare: () => void;

  // トーンマッピング
  toneMappingPreset: string;
  setToneMappingPreset: (preset: string) => void;

  // レンダリング品質プリセット
  renderQualityPreset: string;
  setRenderQualityPreset: (preset: string) => void;

  // プロシージャルスカイ
  skyTimeOfDay: number;
  showProceduralSky: boolean;
  setSkyTimeOfDay: (v: number) => void;
  toggleProceduralSky: () => void;

  // エリアライト
  showAreaLights: boolean;
  toggleAreaLights: () => void;

  // ガラス結露
  glassCondensation: 'off' | 'warm' | 'cold' | 'frost';
  setGlassCondensation: (v: 'off' | 'warm' | 'cold' | 'frost') => void;

  // コースティクス
  showCaustics: boolean;
  causticsIntensity: number;
  toggleCaustics: () => void;
  setCausticsIntensity: (v: number) => void;

  // 太陽シミュレーション
  showSunSimulation: boolean;
  toggleSunSimulation: () => void;

  // 音響可視化
  showAcoustics: boolean;
  toggleAcoustics: () => void;

  // ビフォーアフター
  beforeAfterActive: boolean;
  beforeAfterLeft: string | null;
  beforeAfterRight: string | null;
  beforeAfterLeftLabel: string;
  beforeAfterRightLabel: string;
  setBeforeAfter: (left: string, right: string, leftLabel: string, rightLabel: string) => void;
  closeBeforeAfter: () => void;

  // 3Dフレーム表示
  showWindowDoorFrames: boolean;
  toggleWindowDoorFrames: () => void;

  // 避難経路
  showEvacuation: boolean;
  toggleEvacuation: () => void;

  // 電気配線
  showElectrical: boolean;
  toggleElectrical: () => void;

  // 空調可視化
  showHVAC: boolean;
  toggleHVAC: () => void;

  // 煙パーティクル
  showSmoke: boolean;
  toggleSmoke: () => void;

  // フォトモード（qualityLevel復帰用）
  setPhotoMode: (v: boolean) => void;

  // レンダリングスタイル
  renderStyle: 'realistic' | 'sketch' | 'colored-pencil' | 'watercolor';
  setRenderStyle: (style: 'realistic' | 'sketch' | 'colored-pencil' | 'watercolor') => void;

  // ジオラマモード
  activateDioramaMode: () => void;
}

export const useCameraStore = create<CameraState>((set, get) => ({
  // ── 初期値 ──
  cameraPreset: null,
  cameraBookmarks: [],
  isFirstPersonMode: false,
  walkthroughPlaying: false,
  isAutoWalkthrough: false,
  walkthroughSpeed: 'normal',
  walkthroughProgress: 0,
  dayNight: 'day',
  fogDistance: 35,
  lightBrightness: 1.0,
  lightWarmth: 0.5,
  activeLightingPreset: null,
  qualityLevel: detectQualityLevel(),
  snapToGrid3D: true,
  gridSnapSize: 0.1,
  snapToWall: true,
  liveCameraPosition: [0, 0, 0],
  liveCameraRotationY: 0,
  styleCompareMode: false,
  styleCompareLeft: null,
  styleCompareRight: null,
  styleCompareLeftName: null,
  styleCompareRightName: null,
  activeRoomAtmosphere: null,
  referenceImageUrl: null,
  referenceImageOpacity: 0.5,
  showHumanFigures: false,
  environmentPreset: 'indoor',
  motionBlurEnabled: false,
  showLightGlow: true,
  showFlowSimulation: false,
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
  renderStyle: 'sketch' as const,

  // ── アクション ──
  setCameraPreset: (cameraPreset) => set({ cameraPreset }),

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
      set({ cameraPreset: `bookmark:${id}` });
    }
  },

  setFirstPersonMode: (isFirstPersonMode) => set((s) => ({
    isFirstPersonMode,
    walkthroughPlaying: isFirstPersonMode ? false : s.walkthroughPlaying,
    isAutoWalkthrough: isFirstPersonMode ? false : s.isAutoWalkthrough,
  })),

  setWalkthroughPlaying: (walkthroughPlaying) => set({ walkthroughPlaying, isAutoWalkthrough: false, walkthroughProgress: 0 }),
  setAutoWalkthrough: (isAutoWalkthrough) => set((s) => ({
    isAutoWalkthrough,
    walkthroughPlaying: isAutoWalkthrough ? true : s.walkthroughPlaying,
    walkthroughProgress: isAutoWalkthrough ? 0 : s.walkthroughProgress,
    isFirstPersonMode: isAutoWalkthrough ? false : s.isFirstPersonMode,
  })),
  setWalkthroughSpeed: (walkthroughSpeed) => set({ walkthroughSpeed }),
  setWalkthroughProgress: (walkthroughProgress) => set({ walkthroughProgress }),

  setDayNight: (dayNight) => set({ dayNight }),
  setFogDistance: (fogDistance) => set({ fogDistance }),
  setLightBrightness: (lightBrightness) => set({ lightBrightness: Math.max(0.2, Math.min(3, lightBrightness)), activeLightingPreset: null }),
  setLightWarmth: (lightWarmth) => set({ lightWarmth: Math.max(0, Math.min(1, lightWarmth)), activeLightingPreset: null }),
  applyLightingPreset: (preset) => set({
    lightBrightness: Math.max(0.2, Math.min(3, preset.brightness)),
    lightWarmth: Math.max(0, Math.min(1, preset.warmth)),
    dayNight: preset.dayNight,
    activeLightingPreset: preset.name,
  }),

  setQualityLevel: (qualityLevel) => set({ qualityLevel }),

  setSnapToGrid3D: (snapToGrid3D) => set({ snapToGrid3D }),
  setGridSnapSize: (gridSnapSize) => set({ gridSnapSize }),
  setSnapToWall: (snapToWall) => set({ snapToWall }),

  setLiveCameraPosition: (liveCameraPosition) => set({ liveCameraPosition }),
  setLiveCameraRotationY: (liveCameraRotationY) => set({ liveCameraRotationY }),

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

  applyRoomAtmosphere: (presetName) => set(() => {
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
    // テクスチャオーバーライドはUIStoreに委任
    const uiStore = useUIStore.getState();
    uiStore.setWallColorOverride(preset.wallColor);
    uiStore.setFloorColorOverride(preset.floorColor);
    uiStore.setFloorTextureType(preset.floorTextureType);
    uiStore.setWallTextureType(preset.wallTextureType);
    // style は useEditorStore に残る — 遅延参照で循環依存を回避
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEditorStore } = require('./useEditorStore') as { useEditorStore: { setState: (s: Record<string, unknown>) => void } };
    useEditorStore.setState({ style: preset.style });
    return {
      lightBrightness: preset.brightness,
      lightWarmth: preset.warmth,
      dayNight: preset.dayNight,
      activeLightingPreset: null,
      activeRoomAtmosphere: presetName,
    };
  }),

  setReferenceImage: (referenceImageUrl) => set({ referenceImageUrl }),
  setReferenceImageOpacity: (referenceImageOpacity) => set({ referenceImageOpacity }),

  toggleHumanFigures: () => set((s) => ({ showHumanFigures: !s.showHumanFigures })),
  setEnvironmentPreset: (environmentPreset) => set({ environmentPreset }),
  toggleMotionBlur: () => set((s) => ({ motionBlurEnabled: !s.motionBlurEnabled })),
  toggleLightGlow: () => set((s) => ({ showLightGlow: !s.showLightGlow })),
  toggleFlowSimulation: () => set((s) => ({ showFlowSimulation: !s.showFlowSimulation })),

  toggleGodRays: () => set((s) => ({ showGodRays: !s.showGodRays })),
  setGodRayIntensity: (v) => set({ godRayIntensity: v }),
  toggleWetFloor: () => set((s) => ({ wetFloorEnabled: !s.wetFloorEnabled })),
  setWetFloorWetness: (v) => set({ wetFloorWetness: v }),
  toggleLensFlare: () => set((s) => ({ showLensFlare: !s.showLensFlare })),
  setToneMappingPreset: (preset) => set({ toneMappingPreset: preset }),
  setRenderQualityPreset: (preset) => set({ renderQualityPreset: preset }),
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
  toggleEvacuation: () => set((s) => ({ showEvacuation: !s.showEvacuation })),
  toggleElectrical: () => set((s) => ({ showElectrical: !s.showElectrical })),
  toggleHVAC: () => set((s) => ({ showHVAC: !s.showHVAC })),
  toggleSmoke: () => set((s) => ({ showSmoke: !s.showSmoke })),

  setRenderStyle: (renderStyle) => set({ renderStyle }),

  // フォトモード（qualityLevel復帰用 — UIStoreと連携）
  setPhotoMode: (v: boolean) => {
    const ui = useUIStore.getState();
    if (v) {
      ui.setPhotoMode(true);
    } else {
      const prev = ui.photoModePrevState;
      ui.setPhotoMode(false);
      if (prev?.qualityLevel) {
        set({ qualityLevel: prev.qualityLevel });
      }
    }
  },

  // ジオラマモード
  activateDioramaMode: () => {
    useUIStore.getState().activateDioramaMode();
    set({ cameraPreset: 'diorama' });
  },
}));
