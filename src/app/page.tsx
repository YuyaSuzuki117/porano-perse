'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@/stores/useEditorStore';
import { useAutoSave } from '@/hooks/useAutoSave';
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
import { exportProposalPDF } from '@/lib/pdf-export';

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

const PixelRoomEditor = dynamic(
  () => import('@/components/pixel-editor/PixelRoomEditor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-[#1a1a2e]">
        <div className="text-center">
          <div className="text-[#e94560] font-mono text-sm font-bold mb-2">LOADING...</div>
          <div className="animate-pulse text-[#5a5a5a] font-mono text-xs">Pixel Editor</div>
        </div>
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
      <div className="text-center px-6 py-8 bg-black/40 backdrop-blur-sm rounded-2xl max-w-xs">
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
  const viewMode = useEditorStore((s) => s.viewMode);
  const setViewMode = useEditorStore((s) => s.setViewMode);
  const selectedFurnitureId = useEditorStore((s) => s.selectedFurnitureId);
  const selectedFurnitureIds = useEditorStore((s) => s.selectedFurnitureIds);
  const setSelectedFurniture = useEditorStore((s) => s.setSelectedFurniture);
  const toggleFurnitureSelection = useEditorStore((s) => s.toggleFurnitureSelection);
  const duplicateSelectedFurniture = useEditorStore((s) => s.duplicateSelectedFurniture);
  const selectAllFurniture = useEditorStore((s) => s.selectAllFurniture);
  const moveFurniture = useEditorStore((s) => s.moveFurniture);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const copyFurniture = useEditorStore((s) => s.copyFurniture);
  const pasteFurniture = useEditorStore((s) => s.pasteFurniture);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const duplicateFurniture = useEditorStore((s) => s.duplicateFurniture);
  const restoreFromLocalStorage = useEditorStore((s) => s.restoreFromLocalStorage);
  const loadTemplate = useEditorStore((s) => s.loadTemplate);
  const loadFromShareUrl = useEditorStore((s) => s.loadFromShareUrl);
  const wallDisplayMode = useEditorStore((s) => s.wallDisplayMode);
  const setWallDisplayMode = useEditorStore((s) => s.setWallDisplayMode);
  const ceilingVisible = useEditorStore((s) => s.ceilingVisible);
  const setCeilingVisible = useEditorStore((s) => s.setCeilingVisible);
  const showGrid = useEditorStore((s) => s.showGrid);
  const setShowGrid = useEditorStore((s) => s.setShowGrid);
  const showDimensions = useEditorStore((s) => s.showDimensions);
  const setShowDimensions = useEditorStore((s) => s.setShowDimensions);
  const showFurniture = useEditorStore((s) => s.showFurniture);
  const setShowFurniture = useEditorStore((s) => s.setShowFurniture);
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
  const [mobileTab, setMobileTab] = useState<'2d' | '3d' | 'pixel' | 'settings'>('2d');
  const [fabOpen, setFabOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showPixelEditor, setShowPixelEditor] = useState(false);

  const addFurniture = useEditorStore((s) => s.addFurniture);

  const handleDrop3DModel = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf') return;
    const nameWithoutExt = file.name.replace(/\.(glb|gltf)$/i, '');
    const name = window.prompt('モデル名を入力', nameWithoutExt) || nameWithoutExt;
    const blobUrl = URL.createObjectURL(file);
    addFurniture({
      id: `custom_${Date.now()}`,
      type: 'custom',
      name,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      modelUrl: blobUrl,
    });
  }, [addFurniture]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
    if (hasFiles) setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const modelFile = files.find(f => /\.(glb|gltf)$/i.test(f.name));
    if (modelFile) handleDrop3DModel(modelFile);
  }, [handleDrop3DModel]);

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

  // Auto-save
  useAutoSave();

  // Restore from localStorage on mount
  useEffect(() => {
    restoreFromLocalStorage();
  }, [restoreFromLocalStorage]);

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // テキスト入力中は無視
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          redo();
        } else if (e.key === 'c') {
          e.preventDefault();
          copyFurniture();
        } else if (e.key === 'v') {
          e.preventDefault();
          pasteFurniture();
        } else if (e.key === 'a') {
          e.preventDefault();
          selectAllFurniture();
        } else if (e.key === 'd') {
          e.preventDefault();
          if (selectedFurnitureIds.length > 1) {
            duplicateSelectedFurniture();
          } else if (selectedFurnitureId) {
            duplicateFurniture(selectedFurnitureId);
          }
        }
      }

      // Delete / Backspace で選択中のアイテムを削除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }

      // Escape で選択解除
      if (e.key === 'Escape') {
        setSelectedFurniture(null);
      }

      // H キー: 壁表示モード切替 (solid → transparent → hidden → section → solid)
      if (e.key === 'h' || e.key === 'H') {
        const modes: Array<'solid' | 'transparent' | 'hidden' | 'section'> = ['solid', 'transparent', 'hidden', 'section'];
        const currentIndex = modes.indexOf(wallDisplayMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setWallDisplayMode(modes[nextIndex]);
      }

      // C キー: 天井表示トグル
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          setCeilingVisible(!ceilingVisible);
        }
      }

      // G キー: グリッド表示トグル
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
        setShowGrid(!showGrid);
      }

      // D キー: 寸法表示トグル (Ctrl/Cmd なしの場合のみ)
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
        setShowDimensions(!showDimensions);
      }

      // F キー: 家具表示トグル
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        setShowFurniture(!showFurniture);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copyFurniture, pasteFurniture, deleteSelected, duplicateFurniture, duplicateSelectedFurniture, selectAllFurniture, selectedFurnitureId, selectedFurnitureIds, setSelectedFurniture, wallDisplayMode, setWallDisplayMode, ceilingVisible, setCeilingVisible, showGrid, setShowGrid, showDimensions, setShowDimensions, showFurniture, setShowFurniture]);

  const enableWatermark = useEditorStore((s) => s.enableWatermark);
  const [isRendering, setIsRendering] = useState(false);

  /** ウォーターマークを描画 */
  const applyWatermark = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000000';
    const fontSize = Math.max(14, Math.min(width, height) * 0.03);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Porano Plaza', width - fontSize * 0.8, height - fontSize * 0.5);
    ctx.restore();
  }, []);

  const takeScreenshot = useCallback((scale: number = 1) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    if (scale <= 1) {
      if (enableWatermark) {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, 0);
          applyWatermark(ctx, offscreen.width, offscreen.height);
          const link = document.createElement('a');
          link.download = `porano-perse-${Date.now()}.png`;
          link.href = offscreen.toDataURL('image/png');
          link.click();
        }
      } else {
        const link = document.createElement('a');
        link.download = `porano-perse-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } else {
      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width * scale;
      offscreen.height = canvas.height * scale;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
        if (enableWatermark) {
          applyWatermark(ctx, offscreen.width, offscreen.height);
        }
        const link = document.createElement('a');
        link.download = `porano-perse-${Date.now()}.png`;
        link.href = offscreen.toDataURL('image/png');
        link.click();
      }
    }
  }, [enableWatermark, applyWatermark]);

  /** 高解像度キャプチャ（R3Fレンダラーのピクセル比を一時的に上げる） */
  const takeHiResScreenshot = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsRendering(true);

    // R3Fのinternalstoreにアクセスしてrendererを取得
    const canvas = canvasRef.current;
    const gl = (canvas as HTMLCanvasElement & { __r3f?: { store?: { getState: () => { gl: { setPixelRatio: (r: number) => void; render: (scene: unknown, camera: unknown) => void; getPixelRatio: () => number; domElement: HTMLCanvasElement } ; scene: unknown; camera: unknown } } } }).__r3f?.store?.getState();

    if (gl) {
      const renderer = gl.gl;
      const origRatio = renderer.getPixelRatio();
      const hiResRatio = Math.max(origRatio * 3, 4);

      // ピクセル比を上げて1フレームレンダリング
      renderer.setPixelRatio(hiResRatio);
      renderer.render(gl.scene as Parameters<typeof renderer.render>[0], gl.camera as Parameters<typeof renderer.render>[1]);

      // キャプチャ
      await new Promise(resolve => setTimeout(resolve, 100));
      const dataUrl = renderer.domElement.toDataURL('image/png');

      // ウォーターマーク追加（必要な場合）
      if (enableWatermark) {
        const img = new Image();
        img.onload = () => {
          const offscreen = document.createElement('canvas');
          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            applyWatermark(ctx, offscreen.width, offscreen.height);
            const link = document.createElement('a');
            link.download = `porano-perse-4K-${Date.now()}.png`;
            link.href = offscreen.toDataURL('image/png');
            link.click();
          }
          renderer.setPixelRatio(origRatio);
          renderer.render(gl.scene as Parameters<typeof renderer.render>[0], gl.camera as Parameters<typeof renderer.render>[1]);
          setIsRendering(false);
        };
        img.src = dataUrl;
      } else {
        const link = document.createElement('a');
        link.download = `porano-perse-4K-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();

        // 元に戻す
        renderer.setPixelRatio(origRatio);
        renderer.render(gl.scene as Parameters<typeof renderer.render>[0], gl.camera as Parameters<typeof renderer.render>[1]);
        setIsRendering(false);
      }
    } else {
      // fallback: 通常の3xスケールキャプチャ
      takeScreenshot(3);
      setIsRendering(false);
    }
  }, [enableWatermark, applyWatermark, takeScreenshot]);

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
    });
  }, []);

  // Sync mobileTab with viewMode
  const handleMobileTab = (tab: '2d' | '3d' | 'pixel' | 'settings') => {
    setMobileTab(tab);
    if (tab === '2d') {
      setViewMode('2d');
      setShowMobilePanel(false);
    } else if (tab === '3d') {
      setViewMode('3d');
      setShowMobilePanel(false);
    } else if (tab === 'pixel') {
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
      <div className="h-dvh-safe flex flex-col bg-gray-100">
        {welcomeModal}
        {tutorialModal}
        <QuickTipsContainer />
        <ToastContainer />
        <StyleComparisonModal canvasRef={canvasRef} />
        <Header onScreenshot={takeScreenshot} onHiResScreenshot={takeHiResScreenshot} onExportPDF={handleExportPDF} onPrint={handlePrint} canvasRef={canvasRef} />

        {/* Rendering overlay */}
        {isRendering && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
            <div className="bg-white rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
              <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full" />
              <span className="text-sm font-medium text-gray-700">レンダリング中...</span>
            </div>
          </div>
        )}

        {/* Full viewport: 2D or 3D or Pixel */}
        <div className="flex-1 overflow-hidden relative min-h-0">
          {mobileTab === 'pixel' && (
            <div className="absolute inset-0 tab-content-enter">
              <PixelRoomEditor />
            </div>
          )}
          {mobileTab !== 'pixel' && (viewMode === '2d' || viewMode === 'split') && (
            <div className="absolute inset-0 bg-white tab-content-enter">
              <FloorPlanEditor canvasRef2D={canvasRef2D} />
              <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-xs text-gray-500 font-semibold tracking-wider uppercase px-2.5 py-1.5 rounded-md border border-gray-200 pointer-events-none">
                2D 図面
              </div>
            </div>
          )}
          {mobileTab !== 'pixel' && viewMode === '3d' && (
            <div
              className="absolute inset-0 tab-content-enter"
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
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
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-xs text-white font-semibold tracking-wider uppercase px-2.5 py-1.5 rounded-md pointer-events-none">
                3D プレビュー
              </div>
              <CameraPresetButtons canvasRef={canvasRef} />
              <AlignmentToolbar />
              <div className="absolute bottom-14 left-2 bg-black/50 text-white text-xs px-3 py-2 rounded-md backdrop-blur-sm pointer-events-none flex items-center gap-2">
                <span>ドラッグ: 回転</span>
                <span className="text-white/40">|</span>
                <span>ピンチ: ズーム</span>
              </div>
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
        </div>

        {/* Floating Action Button — モバイルクイックアクション */}
        <div className="absolute bottom-[76px] right-3 z-30 flex flex-col-reverse items-center gap-2">
          {/* FABメニュー項目（展開時のみ表示） */}
          {fabOpen && (
            <>
              {/* 背景オーバーレイ（メニュー外タップで閉じる） */}
              <div
                className="fixed inset-0 z-[-1]"
                onClick={() => setFabOpen(false)}
              />
              <button
                onClick={() => {
                  setFabOpen(false);
                  setShowMobilePanel(true);
                  setMobileTab('settings');
                }}
                className="w-11 h-11 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-lg active:scale-90 transition-transform"
                title="什器カタログ"
              >
                🪑
              </button>
              <button
                onClick={() => {
                  setFabOpen(false);
                  setWallDisplayMode(
                    wallDisplayMode === 'solid' ? 'transparent' :
                    wallDisplayMode === 'transparent' ? 'hidden' :
                    wallDisplayMode === 'hidden' ? 'section' : 'solid'
                  );
                }}
                className="w-11 h-11 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-lg active:scale-90 transition-transform"
                title="壁表示切替"
              >
                🧱
              </button>
              <button
                onClick={() => {
                  setFabOpen(false);
                  takeScreenshot(1);
                }}
                className="w-11 h-11 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center text-lg active:scale-90 transition-transform"
                title="スクリーンショット"
              >
                📸
              </button>
            </>
          )}
          {/* メインFABボタン */}
          <button
            onClick={() => setFabOpen(!fabOpen)}
            className={`w-14 h-14 rounded-full bg-blue-600 shadow-xl flex items-center justify-center text-white text-2xl font-light active:scale-90 transition-all duration-200 ${
              fabOpen ? 'rotate-45 bg-gray-600' : ''
            }`}
            title="クイックアクション"
          >
            +
          </button>
        </div>

        {/* Bottom tab bar — セーフエリア対応 + タッチフィードバック */}
        <div className="flex-shrink-0 bg-white border-t border-gray-200 flex pb-safe">
          {([
            { key: '2d' as const, label: '図面', icon: '📐' },
            { key: '3d' as const, label: '3D', icon: '🏠' },
            { key: 'pixel' as const, label: 'ドット', icon: '🎮' },
            { key: 'settings' as const, label: '設定', icon: '⚙️' },
          ]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => { handleMobileTab(key); setFabOpen(false); }}
              className={`flex-1 flex flex-col items-center justify-center min-h-[56px] py-2 text-xs font-medium transition-all active:scale-95 active:bg-gray-100 ${
                mobileTab === key
                  ? 'text-blue-600'
                  : 'text-gray-400'
              }`}
            >
              <span className="text-xl mb-0.5">{icon}</span>
              <span className="text-[11px]">{label}</span>
            </button>
          ))}
        </div>

        {/* Mobile control panel (bottom sheet) */}
        <EditorControlPanel
          isMobile
          isOpen={showMobilePanel}
          onClose={() => {
            setShowMobilePanel(false);
            setMobileTab(viewMode === '3d' ? '3d' : '2d');
          }}
        />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="h-dvh-safe flex flex-col bg-gray-100">
      {welcomeModal}
      {tutorialModal}
      <QuickTipsContainer />
      <ToastContainer />
        <StyleComparisonModal canvasRef={canvasRef} />
      <Header onScreenshot={takeScreenshot} onHiResScreenshot={takeHiResScreenshot} onExportPDF={handleExportPDF} onPrint={handlePrint} canvasRef={canvasRef} />

      {/* Rendering overlay */}
      {isRendering && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3">
            <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full" />
            <span className="text-sm font-medium text-gray-700">レンダリング中...</span>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* メインビューポート */}
        <div className="flex-1 flex">
          {/* Pixel editor (replaces 2D when active) */}
          {showPixelEditor && viewMode !== '3d' && (
            <div className="relative flex-1">
              <PixelRoomEditor />
              {/* Toggle back to 2D */}
              <button
                onClick={() => setShowPixelEditor(false)}
                className="absolute top-2 right-2 z-20 bg-[#16213e] text-[#e94560] text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-md border border-[#0f3460] hover:bg-[#2a2a50] transition-colors"
              >
                2D図面に戻す
              </button>
            </div>
          )}
          {/* 2D図面 */}
          {!showPixelEditor && (viewMode === '2d' || viewMode === 'split') && (
            <div
              className={`relative bg-white ${
                viewMode === 'split' ? 'w-1/2' : 'flex-1'
              }`}
            >
              <FloorPlanEditor canvasRef2D={canvasRef2D} />
              {/* 2Dラベル */}
              <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-[10px] text-gray-500 font-semibold tracking-wider uppercase px-2 py-1 rounded-md border border-gray-200 pointer-events-none">
                2D 図面
              </div>
              {/* Pixel editor toggle */}
              <button
                onClick={() => setShowPixelEditor(true)}
                className="absolute top-2 right-2 z-20 bg-[#1a1a2e] text-[#e94560] text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-md border border-[#0f3460] hover:bg-[#2a2a50] hover:text-white transition-colors flex items-center gap-1"
              >
                <span>🎮</span>
                <span>ドットエディタ</span>
              </button>
            </div>
          )}

          {/* 分割線インジケーター（splitモード時のみ） */}
          {viewMode === 'split' && (
            <div className="relative w-[6px] bg-gray-200 hover:bg-blue-300 transition-colors flex-shrink-0 group">
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
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
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
              <CameraPresetButtons canvasRef={canvasRef} />
              {/* 整列ツールバー（複数選択時） */}
              <AlignmentToolbar />
              {/* 操作ヘルプ */}
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2.5 py-1.5 rounded-md backdrop-blur-sm pointer-events-none flex items-center gap-2">
                <span>ドラッグ: 回転</span>
                <span className="text-white/40">|</span>
                <span>右ドラッグ: 移動</span>
                <span className="text-white/40">|</span>
                <span>スクロール: ズーム</span>
              </div>
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
        </div>

        {/* 右パネル */}
        <EditorControlPanel />
      </div>
      <KeyboardShortcutHelp />
    </div>
  );
}
