'use client';

import { useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useEditorStore } from '@/stores/useEditorStore';
import { Header } from '@/components/layout/Header';
import { EditorControlPanel } from '@/components/ui/EditorControlPanel';

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
          <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-400 text-sm">3Dエンジンを読み込み中...</p>
        </div>
      </div>
    ),
  }
);

export default function EditorPage() {
  const viewMode = useEditorStore((s) => s.viewMode);
  const selectedFurnitureId = useEditorStore((s) => s.selectedFurnitureId);
  const setSelectedFurniture = useEditorStore((s) => s.setSelectedFurniture);
  const moveFurniture = useEditorStore((s) => s.moveFurniture);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const takeScreenshot = useCallback(() => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `perse_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <Header projectName="新規プロジェクト" onScreenshot={takeScreenshot} />
      <div className="flex flex-1 overflow-hidden">
        {/* Main viewport area */}
        <div className="flex-1 flex">
          {/* 2D Floor Plan */}
          {(viewMode === '2d' || viewMode === 'split') && (
            <div
              className={`relative bg-white ${
                viewMode === 'split' ? 'w-1/2 border-r border-gray-300' : 'flex-1'
              }`}
            >
              <FloorPlanEditor />
              <div className="absolute top-2 left-2 bg-white/80 text-xs text-gray-400 px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                図面
              </div>
            </div>
          )}

          {/* 3D View */}
          {(viewMode === '3d' || viewMode === 'split') && (
            <div
              className={`relative ${
                viewMode === 'split' ? 'w-1/2' : 'flex-1'
              }`}
            >
              <SceneCanvas
                selectedFurniture={selectedFurnitureId}
                onSelectFurniture={setSelectedFurniture}
                onMoveFurniture={moveFurniture}
                canvasRef={canvasRef}
              />
              <div className="absolute top-2 left-2 bg-black/50 text-xs text-white px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                3Dプレビュー
              </div>
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                ドラッグ: 回転 | 右ドラッグ: 移動 | スクロール: ズーム
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <EditorControlPanel />
      </div>
    </div>
  );
}
