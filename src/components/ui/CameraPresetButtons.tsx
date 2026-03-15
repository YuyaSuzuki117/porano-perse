'use client';

import { useState } from 'react';
import { useCameraStore } from '@/stores/useCameraStore';
import { useUIStore } from '@/stores/useUIStore';
import { CameraBookmarkPanel } from './CameraBookmarkPanel';
import { cn } from '@/lib/cn';

const VIEW_PRESETS = [
  { id: 'diorama', label: 'ジオラマ' },
  { id: 'perspective', label: 'パース' },
  { id: 'top', label: '上面' },
  { id: 'front', label: '正面' },
  { id: 'side', label: '側面' },
];

const PRESENTATION_PRESETS = [
  { id: 'bird-eye', label: '鳥瞰' },
  { id: 'entrance', label: '入口' },
  { id: 'window', label: '窓際' },
  { id: 'interior', label: '俯瞰' },
  { id: 'corner', label: 'コーナー' },
];

const SPEED_LABELS: Record<string, string> = {
  slow: '遅い',
  normal: '普通',
  fast: '速い',
};

const SPEED_CYCLE: ('slow' | 'normal' | 'fast')[] = ['slow', 'normal', 'fast'];

interface CameraPresetButtonsProps {
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

export function CameraPresetButtons({ canvasRef }: CameraPresetButtonsProps) {
  const setCameraPreset = useCameraStore((s) => s.setCameraPreset);
  const cameraPreset = useCameraStore((s) => s.cameraPreset);
  const activateDioramaMode = useUIStore(s => s.activateDioramaMode);
  const walkthroughPlaying = useCameraStore((s) => s.walkthroughPlaying);
  const setWalkthroughPlaying = useCameraStore((s) => s.setWalkthroughPlaying);
  const isAutoWalkthrough = useCameraStore((s) => s.isAutoWalkthrough);
  const setAutoWalkthrough = useCameraStore((s) => s.setAutoWalkthrough);
  const walkthroughSpeed = useCameraStore((s) => s.walkthroughSpeed);
  const setWalkthroughSpeed = useCameraStore((s) => s.setWalkthroughSpeed);
  const walkthroughProgress = useCameraStore((s) => s.walkthroughProgress);
  const isFirstPersonMode = useCameraStore((s) => s.isFirstPersonMode);
  const setFirstPersonMode = useCameraStore((s) => s.setFirstPersonMode);

  const [viewOpen, setViewOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);

  const toggleAutoWalkthrough = () => {
    if (isAutoWalkthrough) {
      setAutoWalkthrough(false);
    } else {
      if (isFirstPersonMode) setFirstPersonMode(false);
      if (walkthroughPlaying) setWalkthroughPlaying(false);
      setAutoWalkthrough(true);
    }
  };

  const toggleWalkthrough = () => {
    if (isAutoWalkthrough) setAutoWalkthrough(false);
    if (isFirstPersonMode) setFirstPersonMode(false);
    setWalkthroughPlaying(!walkthroughPlaying);
  };

  const toggleFirstPerson = () => {
    if (walkthroughPlaying) setWalkthroughPlaying(false);
    if (isAutoWalkthrough) setAutoWalkthrough(false);
    setFirstPersonMode(!isFirstPersonMode);
  };

  const cycleSpeed = () => {
    const idx = SPEED_CYCLE.indexOf(walkthroughSpeed);
    const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length];
    setWalkthroughSpeed(next);
  };

  const handleViewSelect = (id: string) => {
    if (id === 'diorama') {
      activateDioramaMode();
    } else {
      setCameraPreset(id);
    }
    setViewOpen(false);
  };

  // Current view label
  const currentViewLabel = VIEW_PRESETS.find(p => p.id === cameraPreset)?.label
    || PRESENTATION_PRESETS.find(p => p.id === cameraPreset)?.label
    || 'パース';

  // Active mode label
  const activeModeLabel = isAutoWalkthrough ? '巡回' : walkthroughPlaying ? 'ウォークスルー' : isFirstPersonMode ? '一人称' : null;

  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10 w-32">
      {/* View preset dropdown */}
      <div className="relative">
        <button
          onClick={() => { setViewOpen(!viewOpen); setModeOpen(false); }}
          className={cn(
            'w-full flex items-center justify-between px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs text-gray-700 shadow-sm transition-colors',
            viewOpen && 'border-blue-400 ring-1 ring-blue-100'
          )}
          aria-label="カメラビュー選択"
          aria-expanded={viewOpen}
          aria-haspopup="listbox"
        >
          <span className={cn(
            (VIEW_PRESETS.some(p => p.id === cameraPreset) || PRESENTATION_PRESETS.some(p => p.id === cameraPreset)) && 'text-blue-600 font-medium'
          )}>
            {currentViewLabel}
          </span>
          <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3 text-gray-400" aria-hidden="true">
            <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {viewOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-md z-50 py-1" role="listbox">
            <div className="px-2 py-1 text-[10px] text-gray-400 font-medium uppercase tracking-wider">基本ビュー</div>
            {VIEW_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleViewSelect(p.id)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs transition-colors',
                  cameraPreset === p.id
                    ? 'text-blue-600 bg-blue-50 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
                role="option"
                aria-selected={cameraPreset === p.id}
              >
                {p.label}
              </button>
            ))}
            <div className="border-t border-gray-100 my-1" />
            <div className="px-2 py-1 text-[10px] text-gray-400 font-medium uppercase tracking-wider">プレゼン</div>
            {PRESENTATION_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleViewSelect(p.id)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs transition-colors',
                  cameraPreset === p.id
                    ? 'text-blue-600 bg-blue-50 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                )}
                role="option"
                aria-selected={cameraPreset === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mode controls dropdown */}
      <div className="relative">
        <button
          onClick={() => { setModeOpen(!modeOpen); setViewOpen(false); }}
          className={cn(
            'w-full flex items-center justify-between px-2.5 py-1.5 bg-white border border-gray-200 rounded-md text-xs shadow-sm transition-colors',
            activeModeLabel ? 'text-blue-600 font-medium border-blue-200' : 'text-gray-700',
            modeOpen && 'border-blue-400 ring-1 ring-blue-100'
          )}
          aria-label="カメラモード選択"
          aria-expanded={modeOpen}
          aria-haspopup="true"
        >
          <span>{activeModeLabel || 'モード'}</span>
          <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3 text-gray-400" aria-hidden="true">
            <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {modeOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-md z-50 py-1">
            <button
              onClick={() => { toggleAutoWalkthrough(); setModeOpen(false); }}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between',
                isAutoWalkthrough ? 'text-blue-600 bg-blue-50 font-medium' : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <span>{isAutoWalkthrough ? '巡回停止' : '巡回'}</span>
              {isAutoWalkthrough && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
            <button
              onClick={() => { toggleWalkthrough(); setModeOpen(false); }}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between',
                walkthroughPlaying && !isAutoWalkthrough ? 'text-blue-600 bg-blue-50 font-medium' : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <span>{walkthroughPlaying && !isAutoWalkthrough ? 'ウォークスルー停止' : 'ウォークスルー'}</span>
              {walkthroughPlaying && !isAutoWalkthrough && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
            <button
              onClick={() => { toggleFirstPerson(); setModeOpen(false); }}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between',
                isFirstPersonMode ? 'text-blue-600 bg-blue-50 font-medium' : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <span>{isFirstPersonMode ? '一人称終了' : '一人称'}</span>
              {isFirstPersonMode && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Auto walkthrough progress */}
      {isAutoWalkthrough && (
        <div className="flex flex-col gap-1 p-2 bg-white border border-gray-200 rounded-md shadow-sm">
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-[width] duration-100"
              style={{ width: `${Math.min(walkthroughProgress * 100, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-[9px]">
              {Math.round(walkthroughProgress * 100)}%
            </span>
            <button
              onClick={cycleSpeed}
              className="px-1.5 py-0.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-gray-600 text-[9px] transition-colors"
              title="速度変更"
              aria-label="速度変更"
            >
              {SPEED_LABELS[walkthroughSpeed]}
            </button>
          </div>
        </div>
      )}

      {/* First-person mode instructions */}
      {isFirstPersonMode && (
        <div className="p-2 bg-white border border-gray-200 rounded-md shadow-sm text-[10px] text-gray-600 leading-relaxed">
          <div className="font-medium text-gray-800 mb-1">操作方法</div>
          <div>クリックでマウスロック</div>
          <div>WASD: 移動</div>
          <div>マウス: 見回す</div>
          <div>Esc: 終了</div>
          <button
            onClick={() => setFirstPersonMode(false)}
            className="mt-1.5 w-full py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 text-[10px] transition-colors border border-gray-200"
            aria-label="一人称モード終了"
          >
            終了
          </button>
        </div>
      )}

      {/* Camera Bookmarks */}
      {canvasRef && <CameraBookmarkPanel canvasRef={canvasRef} />}
    </div>
  );
}
