'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@/stores/useEditorStore';
import { useCameraStore } from '@/stores/useCameraStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useUIStore } from '@/stores/useUIStore';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useScreenshot } from '@/hooks/useScreenshot';
import { useDragDrop } from '@/hooks/useDragDrop';
import { Header } from '@/components/layout/Header';
import { EditorControlPanel } from '@/components/ui/EditorControlPanel';
import { CameraPresetButtons } from '@/components/ui/CameraPresetButtons';
import { WelcomeModal } from '@/components/ui/WelcomeModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { KeyboardShortcutHelp } from '@/components/ui/KeyboardShortcutHelp';
import { AlignmentToolbar } from '@/components/ui/AlignmentToolbar';
import { ToastContainer, showToast } from '@/components/ui/Toast';
import { OnboardingTutorial, isTutorialDone } from '@/components/ui/OnboardingTutorial';
import { QuickTipsContainer } from '@/components/ui/QuickTips';
import { StyleComparisonModal } from '@/components/ui/StyleComparisonModal';
import { MeasurementTool } from '@/components/three/MeasurementTool';
import { MiniMap } from '@/components/ui/MiniMap';
import { FurnitureContextMenu } from '@/components/ui/FurnitureContextMenu';
import SeatCounter from '@/components/ui/SeatCounter';
import AIAssistPanel from '@/components/ui/AIAssistPanel';
import { SelectionOverlay } from '@/components/ui/SelectionOverlay';
import { exportProposalPDF } from '@/lib/pdf-export';
import { FURNITURE_CATALOG } from '@/data/furniture';
import { preloadGLTFModel } from '@/lib/gltf-loader';

const FloorPlanEditor = dynamic(
  () =>
    import('@/components/floor-plan/FloorPlanEditor').then(
      (mod) => mod.default
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">図面エディタを読み込み中...</p>
      </div>
    ),
  }
);

const SceneCanvas = dynamic(
  () =>
    import('@/components/three/SceneCanvas').then((mod) => mod.SceneCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 20 20" fill="none" className="w-7 h-7">
                <path d="M3 14L10 4l7 10H3z" fill="white" opacity={0.9} />
                <path d="M7 14L10 8l3 6H7z" fill="white" opacity={0.5} />
              </svg>
            </div>
          </div>
          <div className="flex items-baseline justify-center gap-0.5 mb-4">
            <span className="text-base font-bold tracking-tight text-white">Porano</span>
            <span className="text-base font-light text-gray-500 mx-0.5">/</span>
            <span className="text-base font-semibold text-blue-400">Perse</span>
          </div>
          <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500 text-xs">3Dエンジンを読み込み中...</p>
        </div>
      </div>
    ),
  }
);

function EmptyStateOverlay({ isMobile }: { isMobile: boolean }) {
  const walls = useEditorStore((s) => s.walls);
  if (walls.length > 0) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="text-center px-6 py-8 bg-black/40 backdrop-blur-sm rounded-2xl max-xs">
        <div className="text-white/80 text-sm font-medium mb-2">
          {isMobile ? '図面タブから壁を描画して開始' : '左パネルの図面エディタで壁を描画して開始'}
        </div>
        {!isMobile && (
          <div className="flex items-center justify-center gap-1 text-white/50 text-xs">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
              <path d="M12 4L6 10l6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>2D図面で壁を作成すると3Dに反映されます</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EditorPage() {
  const viewMode = useUIStore(s => s.viewMode);
  const setViewMode = useUIStore(s => s.setViewMode);
  const selectedFurnitureId = useUIStore(s => s.selectedFurnitureId);
  const selectedFurnitureIds = useUIStore(s => s.selectedFurnitureIds);
  const setSelectedFurniture = useEditorStore((s) => s.setSelectedFurniture);
  const toggleFurnitureSelection = useEditorStore((s) => s.toggleFurnitureSelection);
  const moveFurniture = useEditorStore((s) => s.moveFurniture);
  const restoreFromLocalStorage = useEditorStore((s) => s.restoreFromLocalStorage);
  const loadTemplate = useEditorStore((s) => s.loadTemplate);
  const loadFromShareUrl = useProjectStore((s) => s.loadFromShareUrl);
  const wallDisplayMode = useUIStore(s => s.wallDisplayMode);
  const setWallDisplayMode = useUIStore(s => s.setWallDisplayMode);
  const photoMode = useUIStore(s => s.photoMode);
  const setPhotoMode = useUIStore(s => s.setPhotoMode);
  const measurementActive = useUIStore(s => s.measurementActive);
  const walls = useEditorStore((s) => s.walls);
  const furniture = useEditorStore((s) => s.furniture);
  const showMinimap = useUIStore(s => s.showMinimap);
  const setShowMinimap = useUIStore(s => s.setShowMinimap);
  const liveCameraPosition = useCameraStore((s) => s.liveCameraPosition);
  const liveCameraRotationY = useCameraStore((s) => s.liveCameraRotationY);
  const setCameraPreset = useCameraStore((s) => s.setCameraPreset);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef2D = useRef<HTMLCanvasElement | null>(null);

  // Welcome modal
  const [showWelcome, setShowWelcome] = useState(false);
  // Onboarding tutorial
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('porano-perse-welcome-dismissed');
    if (!dismissed) {
      setShowWelcome(true);
    }
  }, []);

  // ウェルカムモーダル終了後にチュートリアル表示判定
  useEffect(() => {
    if (!showWelcome && !isTutorialDone()) {
      // ウェルカムモーダルがない場合は少し遅延して表示
      const timer = setTimeout(() => setShowTutorial(true), 500);
      return () => clearTimeout(timer);
    }
  }, [showWelcome]);

  const handleWelcomeTemplate = (templateId: string) => {
    loadTemplate(templateId);
    setShowWelcome(false);
    localStorage.setItem('porano-perse-welcome-dismissed', 'true');
  };

  const handleWelcomeEmpty = () => {
    setShowWelcome(false);
    localStorage.setItem('porano-perse-welcome-dismissed', 'true');
  };

  const handleWelcomeOpenTemplates = () => {
    setShowWelcome(false);
    localStorage.setItem('porano-perse-welcome-dismissed', 'true');
    // テンプレートセクションは設定パネルを開くことで表示
    if (isMobile) {
      setShowMobilePanel(true);
      setMobileTab('settings');
    }
  };

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [mobileTab, setMobileTab] = useState<'2d' | '3d' | 'settings'>('2d');
  const [fabOpen, setFabOpen] = useState(false);

  const [showAIPanel, setShowAIPanel] = useState(false);
  const [fullscreen3D, setFullscreen3D] = useState(false);

  // モバイル長押しコンテキストメニュー
  const [contextMenu, setContextMenu] = useState<{ furnitureId: string; position: { x: number; y: number } } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFurnitureRef = useRef<string | null>(null);

  // ピンチズーム用
  const lastPinchDistRef = useRef<number | null>(null);

  // カスタムフック: ドラッグ&ドロップ
  const { isDragOver, dragHandlers } = useDragDrop();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    // debounce: resizeイベントの高頻度発火を抑制（200ms）
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedCheck = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(check, 200);
    };
    window.addEventListener('resize', debouncedCheck);
    return () => {
      window.removeEventListener('resize', debouncedCheck);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // ダークモード: htmlタグにクラスを切り替え
  const darkMode = useUIStore(s => s.darkMode);
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Auto-save
  useAutoSave();

  // カスタムフック: キーボードショートカット
  useKeyboardShortcuts();

  // カスタムフック: スクリーンショット
  const { takeScreenshot, takeHiResScreenshot, isRendering } = useScreenshot(canvasRef);

  // Restore from localStorage on mount
  useEffect(() => {
    restoreFromLocalStorage();
  }, [restoreFromLocalStorage]);

  // GLBモデルのプリロード
  useEffect(() => {
    FURNITURE_CATALOG.filter(c => c.modelUrl).forEach(c => {
      preloadGLTFModel(c.modelUrl!);
    });
  }, []);

  // URLハッシュまたはクエリパラメータからプロジェクト復元
  useEffect(() => {
    // 新形式: #project=<lz-compressed>
    const hash = window.location.hash;
    if (hash.startsWith('#project=')) {
      const encoded = hash.slice('#project='.length);
      if (encoded) {
        loadFromShareUrl(encoded);
        showToast('共有プロジェクトを読み込みました', 'success');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
    }
    // レガシー形式: ?project=<base64>
    const params = new URLSearchParams(window.location.search);
    const projectData = params.get('project');
    if (projectData) {
      loadFromShareUrl(projectData);
      showToast('共有プロジェクトを読み込みました', 'success');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadFromShareUrl]);

  // Mキーでミニマップ表示切替
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 入力フォーカス中は無視
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'm' || e.key === 'M') {
        setShowMinimap(!showMinimap);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showMinimap, setShowMinimap]);

  // ミニマップクリック時のカメラ移動
  const handleMinimapNavigate = useCallback((x: number, z: number) => {
    // カメラプリセットとして座標を送信（CameraControllerがハンドリング）
    setCameraPreset(`navigate:${x},${z}`);
  }, [setCameraPreset]);

  // ピンチズーム: 2D図面エリア用タッチハンドラ
  const handleTouchStart2D = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove2D = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / lastPinchDistRef.current;
      const currentZoom = useUIStore.getState().zoom;
      useUIStore.getState().setZoom(currentZoom * ratio);
      lastPinchDistRef.current = dist;
    }
  }, []);

  const handleTouchEnd2D = useCallback(() => {
    lastPinchDistRef.current = null;
  }, []);

  // 3Dビュー長押しコンテキストメニュー用ハンドラ
  const handle3DTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const touchPos = { x: touch.clientX, y: touch.clientY };
    // 長押しタイマー設定
    longPressFurnitureRef.current = selectedFurnitureId;
    longPressTimerRef.current = setTimeout(() => {
      if (longPressFurnitureRef.current) {
        setContextMenu({
          furnitureId: longPressFurnitureRef.current,
          position: touchPos,
        });
      }
    }, 500);
  }, [selectedFurnitureId]);

  const handle3DTouchMove = useCallback(() => {
    // 指が動いたら長押しキャンセル
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handle3DTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExportPDF = useCallback(() => {
    const state = useEditorStore.getState();
    exportProposalPDF(canvasRef, canvasRef2D, {
      projectName: state.projectName,
      walls: state.walls,
      furniture: state.furniture,
      style: state.style,
      roomHeight: state.roomHeight,
      annotations: state.annotations,
      openings: state.openings,
    });
  }, []);

  // Sync mobileTab with viewMode
  const handleMobileTab = (tab: '2d' | '3d' | 'settings') => {
    setMobileTab(tab);
    if (tab === '2d') {
      setViewMode('2d');
      setShowMobilePanel(false);
    } else if (tab === '3d') {
      setViewMode('3d');
      setShowMobilePanel(false);
    } else {
      setShowMobilePanel(true);
    }
  };

  // Welcome modal (shared between mobile and desktop)
  const welcomeModal = showWelcome ? (
    <WelcomeModal
      onSelectTemplate={handleWelcomeTemplate}
      onStartEmpty={handleWelcomeEmpty}
      onOpenTemplates={handleWelcomeOpenTemplates}
    />
  ) : null;

  const tutorialModal = showTutorial ? (
    <OnboardingTutorial onComplete={() => setShowTutorial(false)} />
  ) : null;

  // Mobile layout
  if (isMobile) {
    return (
      <div className="h-dvh-safe flex flex-col bg-gray-100" role="main" aria-label="Porano Perse エディタ">
        {welcomeModal}
        {tutorialModal}
        <QuickTipsContainer />
        <ToastContainer />
        <StyleComparisonModal canvasRef={canvasRef} />
        {!fullscreen3D && (
          <Header onScreenshot={takeScreenshot} onHiResScreenshot={takeHiResScreenshot} onExportPDF={handleExportPDF} onPrint={handlePrint} canvasRef={canvasRef} />
        )}
        <MeasurementTool active={measurementActive} canvasRef={canvasRef} />

        {/* Rendering overlay */}
        {isRendering && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
            <div className="bg-white rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
              <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-sm font-medium text-gray-700" aria-live="polite">レンダリング中...</span>
            </div>
          </div>
        )}

        {/* Full viewport: 2D or 3D or Pixel */}
        <div className="flex-1 overflow-hidden relative min-h-0">
          {(viewMode === '2d' || viewMode === 'split') && (
            <div
              className="absolute inset-0 bg-white tab-content-enter"
              aria-label="2D図面エディタ"
            >
              <FloorPlanEditor canvasRef2D={canvasRef2D} />
              <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-xs text-gray-500 font-semibold tracking-wider uppercase px-2.5 py-1.5 rounded-md border border-gray-200 pointer-events-none">
                2D 図面
              </div>
            </div>
          )}
          {viewMode === '3d' && (
            <div
              className="absolute inset-0 tab-content-enter"
              aria-label="3Dプレビュー"
              {...dragHandlers}
              onTouchStart={handle3DTouchStart}
              onTouchMove={handle3DTouchMove}
              onTouchEnd={handle3DTouchEnd}
            >
              <ErrorBoundary>
                <SceneCanvas
                  selectedFurniture={selectedFurnitureId}
                  selectedFurnitureIds={selectedFurnitureIds}
                  onSelectFurniture={setSelectedFurniture}
                  onToggleFurnitureSelection={toggleFurnitureSelection}
                  onMoveFurniture={moveFurniture}
                  canvasRef={canvasRef}
                />
              </ErrorBoundary>
              <EmptyStateOverlay isMobile />
              {!photoMode && !fullscreen3D && (
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-xs text-white font-semibold tracking-wider uppercase px-2.5 py-1.5 rounded-md pointer-events-none">
                  3D プレビュー
                </div>
              )}
              {!photoMode && <CameraPresetButtons canvasRef={canvasRef} />}
              {!photoMode && <AlignmentToolbar />}
              {!photoMode && showMinimap && (
                <MiniMap
                  walls={walls}
                  furniture={furniture}
                  cameraPosition={liveCameraPosition}
                  cameraRotation={liveCameraRotationY}
                  onNavigate={handleMinimapNavigate}
                />
              )}
              {/* 座席数カウンター */}
              {!photoMode && !fullscreen3D && <SeatCounter furniture={furniture} />}
              {/* フルスクリーン3Dモード UI */}
              {fullscreen3D && !photoMode && (
                <div className="absolute top-3 left-3 right-3 z-40 flex items-center justify-between">
                  <button
                    onClick={() => setFullscreen3D(false)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-full active:scale-90 transition-transform min-h-[44px]"
                    aria-label="フルスクリーン終了"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                    </svg>
                    <span>戻る</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => takeScreenshot(1)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-full active:scale-90 transition-transform min-h-[44px]"
                      aria-label="スクリーンショット"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => { setPhotoMode(true); }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full shadow-lg active:scale-90 transition-transform min-h-[44px]"
                      aria-label="フォトモード"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>HD撮影</span>
                    </button>
                  </div>
                </div>
              )}
              {!photoMode && !fullscreen3D && (
                <div className="absolute bottom-14 left-2 right-2 flex items-center justify-between">
                  <div className="bg-black/50 text-white text-xs px-3 py-2 rounded-md backdrop-blur-sm pointer-events-none flex items-center gap-2" aria-live="polite">
                    <span>ドラッグ: 回転</span>
                    <span className="text-white/40">|</span>
                    <span>ピンチ: ズーム</span>
                  </div>
                  <button
                    onClick={() => { setPhotoMode(true); setMobileTab('3d'); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-full shadow-lg active:scale-90 transition-transform min-h-[44px]"
                    aria-label="フォトモードで撮影"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>撮影</span>
                  </button>
                </div>
              )}
              {isDragOver && (
                <div className="absolute inset-0 bg-purple-500/20 border-4 border-dashed border-purple-400 rounded-lg flex items-center justify-center z-50 pointer-events-none">
                  <div className="bg-purple-600/90 text-white px-6 py-4 rounded-xl shadow-2xl text-center">
                    <div className="text-3xl mb-2">📦</div>
                    <div className="text-sm font-medium">3Dモデルをドロップして読込</div>
                    <div className="text-xs text-purple-200 mt-1">.glb / .gltf</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* フォトモード: モバイル撮影UI -- 3Dビュー条件やErrorBoundaryの外に配置 */}
          {photoMode && (
            <div className="absolute bottom-4 right-3 flex flex-col items-end gap-2 z-50">
              <button
                onClick={() => takeHiResScreenshot()}
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-full shadow-lg active:scale-95 transition-transform min-h-[48px]"
                aria-label="高解像度で撮影"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>撮影 (HD)</span>
              </button>
              <button
                onClick={() => takeScreenshot(1)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/90 text-gray-700 font-medium rounded-full shadow-lg active:scale-95 transition-transform text-sm min-h-[44px]"
                aria-label="通常撮影"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>通常撮影</span>
              </button>
              <button
                onClick={() => { setPhotoMode(false); setFullscreen3D(false); }}
                className="px-3 py-2 bg-black/50 text-white/80 text-xs rounded-full backdrop-blur-sm active:scale-95 transition-transform min-h-[44px]"
                aria-label="フォトモードを終了"
              >
                フォトモード終了
              </button>
            </div>
          )}
        </div>

        {/* Floating Action Button -- モバイルクイックアクション（セーフエリア対応）フォトモード/フルスクリーン中は非表示 */}
        <div className={`absolute bottom-[calc(var(--safe-bottom)+76px)] right-3 z-30 flex flex-col-reverse items-center gap-2.5 ${photoMode || fullscreen3D ? 'hidden' : ''}`}>
          {/* FABメニュー項目（展開時のみ表示） */}
          {fabOpen && (
            <>
              {/* 背景オーバーレイ（メニュー外タップで閉じる） */}
              <div
                className="fixed inset-0 z-[-1]"
                onClick={() => setFabOpen(false)}
              />
              {/* 什器カタログ */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm whitespace-nowrap">什器</span>
                <button
                  onClick={() => {
                    setFabOpen(false);
                    setShowMobilePanel(true);
                    setMobileTab('settings');
                  }}
                  className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center active:scale-90 transition-transform"
                  aria-label="什器カタログを開く"
                >
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12H3l9-9 9 9h-2M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                </button>
              </div>
              {/* 壁表示切替 */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm whitespace-nowrap">壁</span>
                <button
                  onClick={() => {
                    setFabOpen(false);
                    setWallDisplayMode(
                      wallDisplayMode === 'solid' ? 'transparent' :
                      wallDisplayMode === 'transparent' ? 'hidden' :
                      wallDisplayMode === 'hidden' ? 'section' : 'solid'
                    );
                  }}
                  className="w-12 h-12 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center active:scale-90 transition-transform"
                  aria-label="壁表示切替"
                >
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 12h18M12 3v18" />
                  </svg>
                </button>
              </div>
              {/* フォトモード */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm whitespace-nowrap">撮影</span>
                <button
                  onClick={() => {
                    setFabOpen(false);
                    setPhotoMode(true);
                    setMobileTab('3d');
                    setViewMode('3d');
                  }}
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg border border-orange-300 flex items-center justify-center active:scale-90 transition-transform"
                  aria-label="フォトモードで撮影"
                >
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </button>
              </div>
              {/* AIアシスト */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm whitespace-nowrap">AI</span>
                <button
                  onClick={() => {
                    setFabOpen(false);
                    setShowAIPanel(true);
                  }}
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg border border-purple-400 flex items-center justify-center active:scale-90 transition-transform"
                  aria-label="AIアシスト"
                >
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </button>
              </div>
              {/* フルスクリーン3D */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-white bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm whitespace-nowrap">全画面</span>
                <button
                  onClick={() => {
                    setFabOpen(false);
                    setViewMode('3d');
                    setMobileTab('3d');
                    setFullscreen3D(true);
                  }}
                  className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg border border-blue-400 flex items-center justify-center active:scale-90 transition-transform"
                  aria-label="フルスクリーン3Dモード"
                >
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
                  </svg>
                </button>
              </div>
            </>
          )}
          {/* メインFABボタン */}
          <button
            onClick={() => setFabOpen(!fabOpen)}
            className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white active:scale-90 transition-all duration-200 ${
              fabOpen ? 'rotate-45 bg-gray-600' : 'bg-blue-600'
            }`}
            aria-label="クイックアクション"
            aria-expanded={fabOpen}
          >
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Bottom tab bar -- セーフエリア対応 + SVGアイコン + タッチフィードバック（フォトモード/フルスクリーン中は非表示） */}
        <div className={`flex-shrink-0 bg-white border-t border-gray-200 flex pb-safe ${photoMode || fullscreen3D ? 'hidden' : ''}`} role="tablist" aria-label="エディタビュー切替">
          {([
            { key: '2d' as const, label: '図面', iconPath: 'M3 3h7v7H3zM14 3l4 7H10zM3 14h7v4H3zM14 14h4v4h-4z' },
            { key: '3d' as const, label: '3D', iconPath: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
            { key: 'settings' as const, label: '設定', iconPath: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' },
          ]).map(({ key, label, iconPath }) => (
            <button
              key={key}
              role="tab"
              aria-selected={mobileTab === key}
              onClick={() => { handleMobileTab(key); setFabOpen(false); }}
              className={`flex-1 flex flex-col items-center justify-center min-h-[56px] py-2 text-xs font-medium transition-all active:scale-95 active:bg-gray-50 ${
                mobileTab === key
                  ? 'text-blue-600'
                  : 'text-gray-400'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 mb-0.5">
                <path d={iconPath} />
              </svg>
              <span className="text-[11px]">{label}</span>
              {mobileTab === key && <div className="w-5 h-0.5 bg-blue-600 rounded-full mt-0.5" />}
            </button>
          ))}
        </div>

        {/* Mobile control panel (bottom sheet) */}
        <EditorControlPanel
          isMobile
          isOpen={showMobilePanel}
          onClose={() => {
            setShowMobilePanel(false);
            // photoMode中はZustandのviewModeが'3d'に変わっているが、
            // クロージャ内のviewModeはレンダー時の値なので直接チェック
            const currentVM = useUIStore.getState().viewMode;
            setMobileTab(currentVM === '3d' ? '3d' : '2d');
          }}
        />

        {/* AI Assist Panel */}
        <AIAssistPanel isOpen={showAIPanel} onClose={() => setShowAIPanel(false)} />

        {/* モバイル長押しコンテキストメニュー */}
        {contextMenu && (
          <FurnitureContextMenu
            furnitureId={contextMenu.furnitureId}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="h-dvh-safe flex flex-col bg-gray-100" role="main" aria-label="Porano Perse エディタ">
      {welcomeModal}
      {tutorialModal}
      <QuickTipsContainer />
      <ToastContainer />
        <StyleComparisonModal canvasRef={canvasRef} />
      <Header onScreenshot={takeScreenshot} onHiResScreenshot={takeHiResScreenshot} onExportPDF={handleExportPDF} onPrint={handlePrint} canvasRef={canvasRef} />
      <MeasurementTool active={measurementActive} canvasRef={canvasRef} />

      {/* Rendering overlay */}
      {isRendering && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
            <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full" />
            <span className="text-sm font-medium text-gray-700" aria-live="polite">レンダリング中...</span>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* メインビューポート */}
        <div className="flex-1 flex">
          {/* 2D図面 */}
          {(viewMode === '2d' || viewMode === 'split') && (
            <div
              className={`relative bg-white ${
                viewMode === 'split' ? 'w-1/2' : 'flex-1'
              }`}
              aria-label="2D図面エディタ"
            >
              <FloorPlanEditor canvasRef2D={canvasRef2D} />
              {/* 2Dラベル */}
              <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-[10px] text-gray-500 font-semibold tracking-wider uppercase px-2 py-1 rounded-md border border-gray-200 pointer-events-none">
                2D 図面
              </div>
            </div>
          )}

          {/* 分割線インジケーター（splitモード時のみ） */}
          {viewMode === 'split' && (
            <div className="relative w-[6px] bg-gray-200 hover:bg-blue-300 transition-colors flex-shrink-0 group" role="separator" aria-orientation="vertical">
              {/* 上部ハンドル */}
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-[3px]">
                <div className="w-[3px] h-[3px] rounded-full bg-gray-400 group-hover:bg-blue-500 transition-colors" />
                <div className="w-[3px] h-[3px] rounded-full bg-gray-400 group-hover:bg-blue-500 transition-colors" />
                <div className="w-[3px] h-[3px] rounded-full bg-gray-400 group-hover:bg-blue-500 transition-colors" />
                <div className="w-[3px] h-[3px] rounded-full bg-gray-400 group-hover:bg-blue-500 transition-colors" />
                <div className="w-[3px] h-[3px] rounded-full bg-gray-400 group-hover:bg-blue-500 transition-colors" />
              </div>
              {/* ドラッグハンドルのラベル（ホバー時のみ） */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-gray-700 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                  2D / 3D
                </div>
              </div>
            </div>
          )}

          {/* 3Dビュー */}
          {(viewMode === '3d' || viewMode === 'split') && (
            <div
              className={`relative print-area ${
                viewMode === 'split' ? 'w-1/2' : 'flex-1'
              }`}
              aria-label="3Dプレビュー"
              {...dragHandlers}
            >
              <ErrorBoundary>
                <SceneCanvas
                  selectedFurniture={selectedFurnitureId}
                  selectedFurnitureIds={selectedFurnitureIds}
                  onSelectFurniture={setSelectedFurniture}
                  onToggleFurnitureSelection={toggleFurnitureSelection}
                  onMoveFurniture={moveFurniture}
                  canvasRef={canvasRef}
                />
              </ErrorBoundary>
              <EmptyStateOverlay isMobile={false} />
              {/* 3Dラベル */}
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-[10px] text-white font-semibold tracking-wider uppercase px-2 py-1 rounded-md pointer-events-none">
                3D プレビュー
              </div>
              {/* カメラプリセット */}
              {!photoMode && <CameraPresetButtons canvasRef={canvasRef} />}
              {/* 整列ツールバー（複数選択時） */}
              {!photoMode && <AlignmentToolbar />}
              {/* ミニマップ */}
              {showMinimap && !photoMode && (
                <MiniMap
                  walls={walls}
                  furniture={furniture}
                  cameraPosition={liveCameraPosition}
                  cameraRotation={liveCameraRotationY}
                  onNavigate={handleMinimapNavigate}
                />
              )}
              {/* 操作ヘルプ + フォトモード入口 */}
              {!photoMode && (
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <div className="bg-black/50 text-white text-[10px] px-2.5 py-1.5 rounded-md backdrop-blur-sm pointer-events-none flex items-center gap-2" aria-live="polite">
                    <span>ドラッグ: 回転</span>
                    <span className="text-white/40">|</span>
                    <span>右ドラッグ: 移動</span>
                    <span className="text-white/40">|</span>
                    <span>スクロール: ズーム</span>
                  </div>
                  <button
                    onClick={() => setPhotoMode(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 text-white text-xs rounded-md backdrop-blur-sm hover:bg-amber-600/80 transition-colors"
                    title="フォトモード (P)"
                  >
                    <span>📷</span>
                    <span>フォトモード</span>
                  </button>
                </div>
              )}
              {/* フォトモード: 撮影フローティングボタン */}
              {photoMode && (
                <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 z-40">
                  <button
                    onClick={() => takeHiResScreenshot()}
                    className="group flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-full shadow-lg hover:from-amber-600 hover:to-orange-600 hover:shadow-2xl hover:scale-105 hover:-translate-y-0.5 transition-all duration-200 active:scale-95"
                    aria-label="4K高解像度で撮影"
                  >
                    <span className="text-lg group-hover:animate-pulse">📷</span>
                    <span>撮影 (4K)</span>
                  </button>
                  <button
                    onClick={() => setPhotoMode(false)}
                    className="px-3 py-1.5 bg-black/50 text-white/80 text-xs rounded-full backdrop-blur-sm hover:bg-black/70 hover:text-white hover:scale-105 transition-all duration-200"
                    aria-label="フォトモードを終了"
                  >
                    フォトモード終了 <span className="text-white/50 ml-1">P</span>
                  </button>
                </div>
              )}
              {isDragOver && (
                <div className="absolute inset-0 bg-purple-500/20 backdrop-blur-[2px] border-4 border-dashed border-purple-400 rounded-lg flex items-center justify-center z-50 pointer-events-none animate-[dropzonePulse_1.5s_ease-in-out_infinite]">
                  <div className="bg-purple-600/90 text-white px-8 py-5 rounded-xl shadow-2xl text-center animate-[dropzoneBounce_0.3s_ease-out]">
                    <div className="text-4xl mb-2 animate-bounce">📦</div>
                    <div className="text-sm font-bold">3Dモデルをドロップして読込</div>
                    <div className="text-xs text-purple-200 mt-1.5 bg-purple-700/50 px-3 py-1 rounded-full inline-block">.glb / .gltf</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右パネル */}
        <EditorControlPanel />

        {/* AI Assist toggle button (desktop) */}
        {!showAIPanel && (
          <button
            onClick={() => setShowAIPanel(true)}
            className="fixed bottom-4 right-[304px] z-[100] flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-105 transition-all duration-200"
            aria-label="AIアシストを開く"
            title="AIアシスト"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span className="text-xs font-semibold">AI</span>
          </button>
        )}

        {/* AI Assist Panel (desktop) */}
        <AIAssistPanel isOpen={showAIPanel} onClose={() => setShowAIPanel(false)} />
      </div>
      <KeyboardShortcutHelp />
    </div>
  );
}
