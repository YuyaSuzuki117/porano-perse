'use client';

import { useEditorStore } from '@/stores/useEditorStore';
import { useUIStore } from '@/stores/useUIStore';
import { CameraBookmarkPanel } from './CameraBookmarkPanel';

const PRESETS = [
  { id: 'perspective', label: 'パース', icon: '🎥', description: '斜め上からの透視図ビュー' },
  { id: 'top', label: '上面', icon: '⬇', description: '真上から見下ろす平面図' },
  { id: 'front', label: '正面', icon: '👁', description: '正面から見た立面図' },
  { id: 'side', label: '側面', icon: '👈', description: '横から見た側面図' },
];

const PRESENTATION_PRESETS = [
  { id: 'bird-eye', label: '鳥瞰', icon: '📐', description: '全体を俯瞰する鳥目線' },
  { id: 'entrance', label: '入口', icon: '🚪', description: '入口から店内を見渡す' },
  { id: 'window', label: '窓際', icon: '🪟', description: '窓際の席から店内方向' },
  { id: 'interior', label: '俯瞰', icon: '🔽', description: '店内中央からの俯瞰' },
  { id: 'corner', label: 'コーナー', icon: '📷', description: 'コーナーからの対角ビュー' },
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
  const setCameraPreset = useEditorStore((s) => s.setCameraPreset);
  const cameraPreset = useEditorStore((s) => s.cameraPreset);
  const activateDioramaMode = useUIStore(s => s.activateDioramaMode);
  const walkthroughPlaying = useEditorStore((s) => s.walkthroughPlaying);
  const setWalkthroughPlaying = useEditorStore((s) => s.setWalkthroughPlaying);
  const isAutoWalkthrough = useEditorStore((s) => s.isAutoWalkthrough);
  const setAutoWalkthrough = useEditorStore((s) => s.setAutoWalkthrough);
  const walkthroughSpeed = useEditorStore((s) => s.walkthroughSpeed);
  const setWalkthroughSpeed = useEditorStore((s) => s.setWalkthroughSpeed);
  const walkthroughProgress = useEditorStore((s) => s.walkthroughProgress);
  const isFirstPersonMode = useEditorStore((s) => s.isFirstPersonMode);
  const setFirstPersonMode = useEditorStore((s) => s.setFirstPersonMode);

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

  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
      {/* ジオラマモード: ワンクリックでアイソメ断面ビュー */}
      <div className="relative group">
        <button
          onClick={activateDioramaMode}
          className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] md:min-h-0 md:py-1.5 md:px-2 bg-gradient-to-r from-orange-600/80 to-amber-600/80 backdrop-blur-sm text-white text-xs md:text-[11px] font-bold rounded active:from-orange-700 active:to-amber-700 hover:from-orange-600 hover:to-amber-600 transition-all ring-1 ring-orange-400/30 ${
            cameraPreset === 'diorama' ? 'ring-2 ring-orange-300 shadow-md shadow-orange-500/30' : ''
          }`}
          title="ジオラマモード（アイソメトリック断面ビュー）"
        >
          <span>&#x1F3E0;</span>
          <span>ジオラマ</span>
        </button>
        <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
          <div className="bg-gray-900 text-white text-[10px] px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap">
            アイソメトリック断面ビュー
          </div>
        </div>
      </div>
      <div className="h-px bg-white/20 my-0.5" />
      {PRESETS.map((p) => (
        <div key={p.id} className="relative group">
          <button
            onClick={() => setCameraPreset(p.id)}
            className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] md:min-h-0 md:py-1 md:px-2 backdrop-blur-sm text-white text-xs md:text-[10px] rounded transition-all duration-200 ${
              cameraPreset === p.id
                ? 'bg-blue-600/80 ring-1 ring-blue-400/60 shadow-md shadow-blue-500/20'
                : 'bg-black/50 active:bg-black/80 hover:bg-black/70'
            }`}
            title={p.label}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
            {cameraPreset === p.id && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-300 animate-pulse" />
            )}
          </button>
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
            <div className="bg-gray-900 text-white text-[10px] px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap">
              {p.description}
            </div>
          </div>
        </div>
      ))}
      <div className="h-px bg-white/20 my-0.5" />
      {PRESENTATION_PRESETS.map((p) => (
        <div key={p.id} className="relative group">
          <button
            onClick={() => setCameraPreset(p.id)}
            className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] md:min-h-0 md:py-1 md:px-2 backdrop-blur-sm text-white text-xs md:text-[10px] rounded transition-all duration-200 ${
              cameraPreset === p.id
                ? 'bg-emerald-600/90 ring-1 ring-emerald-400/60 shadow-md shadow-emerald-500/20'
                : 'bg-emerald-700/60 active:bg-emerald-700/90 hover:bg-emerald-700/80'
            }`}
            title={p.label}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
            {cameraPreset === p.id && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
            )}
          </button>
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
            <div className="bg-gray-900 text-white text-[10px] px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap">
              {p.description}
            </div>
          </div>
        </div>
      ))}

      {/* Auto Walkthrough (cinematic tour) */}
      <button
        onClick={toggleAutoWalkthrough}
        className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] md:min-h-0 md:py-1 md:px-2 backdrop-blur-sm text-white text-xs md:text-[10px] rounded transition-colors ${
          isAutoWalkthrough
            ? 'bg-red-600/70 active:bg-red-600/95 hover:bg-red-600/90 ring-1 ring-red-400/50'
            : 'bg-purple-600/60 active:bg-purple-600/90 hover:bg-purple-600/80'
        }`}
        title={isAutoWalkthrough ? '巡回停止' : '自動巡回（シネマティック）'}
      >
        <span>{isAutoWalkthrough ? '⏹' : '🎬'}</span>
        <span>{isAutoWalkthrough ? '停止' : '巡回'}</span>
      </button>

      {/* Progress bar and speed control during auto walkthrough */}
      {isAutoWalkthrough && (
        <div className="flex flex-col gap-1 p-2 bg-black/70 backdrop-blur-sm rounded">
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-400 rounded-full transition-[width] duration-100"
              style={{ width: `${Math.min(walkthroughProgress * 100, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-[9px]">
              {Math.round(walkthroughProgress * 100)}%
            </span>
            {/* Speed control */}
            <button
              onClick={cycleSpeed}
              className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded text-white text-[9px] transition-colors"
              title="速度変更"
            >
              {SPEED_LABELS[walkthroughSpeed]}
            </button>
          </div>
          <div className="text-white/40 text-[8px] text-center">
            クリックで停止
          </div>
        </div>
      )}

      {/* Legacy walkthrough */}
      <button
        onClick={toggleWalkthrough}
        className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] md:min-h-0 md:py-1 md:px-2 backdrop-blur-sm text-white text-xs md:text-[10px] rounded transition-colors ${
          walkthroughPlaying && !isAutoWalkthrough
            ? 'bg-red-600/70 active:bg-red-600/95 hover:bg-red-600/90'
            : 'bg-amber-600/60 active:bg-amber-600/90 hover:bg-amber-600/80'
        }`}
        title={walkthroughPlaying ? 'ウォークスルー停止' : 'ウォークスルー'}
      >
        <span>{walkthroughPlaying && !isAutoWalkthrough ? '⏹' : '🚶'}</span>
        <span>{walkthroughPlaying && !isAutoWalkthrough ? '停止' : 'ウォークスルー'}</span>
      </button>
      <button
        onClick={toggleFirstPerson}
        className={`flex items-center gap-1.5 px-3 py-2 min-h-[36px] md:min-h-0 md:py-1 md:px-2 backdrop-blur-sm text-white text-xs md:text-[10px] rounded transition-colors ${
          isFirstPersonMode
            ? 'bg-red-600/70 active:bg-red-600/95 hover:bg-red-600/90'
            : 'bg-blue-600/60 active:bg-blue-600/90 hover:bg-blue-600/80'
        }`}
        title={isFirstPersonMode ? '一人称モード終了' : '一人称ウォークスルー'}
      >
        <span>{isFirstPersonMode ? '⏹' : '🏃'}</span>
        <span>{isFirstPersonMode ? '終了' : '一人称'}</span>
      </button>

      {/* First-person mode instructions overlay */}
      {isFirstPersonMode && (
        <div className="mt-2 p-2 bg-black/70 backdrop-blur-sm rounded text-white text-[10px] leading-relaxed">
          <div className="font-bold mb-1">操作方法</div>
          <div>クリックでマウスロック</div>
          <div>WASD: 移動</div>
          <div>マウス: 見回す</div>
          <div>Esc: 終了</div>
          <button
            onClick={() => setFirstPersonMode(false)}
            className="mt-1.5 w-full py-1 bg-red-600/80 rounded hover:bg-red-600 transition-colors text-[10px]"
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
