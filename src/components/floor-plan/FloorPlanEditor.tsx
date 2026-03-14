'use client';

import FloorPlanCanvas from './FloorPlanCanvas';
import FloorPlanToolbar from './FloorPlanToolbar';
import { useEditorStore } from '@/stores/useEditorStore';

interface FloorPlanEditorProps {
  /** External ref to access the 2D canvas (for PDF export) */
  canvasRef2D?: React.RefObject<HTMLCanvasElement | null>;
}

export default function FloorPlanEditor({ canvasRef2D }: FloorPlanEditorProps = {}) {
  const activeTool = useEditorStore((s) => s.activeTool);
  const selectedWallId = useEditorStore((s) => s.selectedWallId);
  const walls = useEditorStore((s) => s.walls);

  const selectedWall = selectedWallId
    ? walls.find((w) => w.id === selectedWallId)
    : null;

  // ツールに応じたカーソル（エディタ全体のカーソルヒント）
  const cursorHintColor = (() => {
    switch (activeTool) {
      case 'wall': return 'bg-blue-500';
      case 'door': return 'bg-green-500';
      case 'window': return 'bg-cyan-500';
      case 'delete': return 'bg-red-500';
      case 'measure': return 'bg-amber-500';
      case 'select': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  })();

  return (
    <div className="flex w-full h-full min-h-0 bg-white overflow-hidden">
      {/* 左: ツールバー — モバイルではコンパクト */}
      <FloorPlanToolbar />

      {/* 中央: キャンバス */}
      <div className="flex-1 relative min-w-0">
        <FloorPlanCanvas canvasRef2D={canvasRef2D} />

        {/* ステータスバー（上部） — モバイルではコンパクト */}
        <div className="absolute top-2 left-2 md:top-3 md:left-3 flex items-center gap-1.5 md:gap-2 pointer-events-none">
          {/* アクティブツール表示 */}
          <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-xs md:text-sm px-2 py-1.5 md:px-3 md:py-2 rounded-lg shadow-md border border-gray-200">
            <div className={`w-2 h-2 rounded-full ${cursorHintColor}`} />
            <span className="font-medium text-gray-700">
              {toolHint(activeTool)}
            </span>
          </div>

          {/* 選択中壁の情報 */}
          {selectedWall && (
            <div className="hidden md:flex items-center gap-1.5 bg-blue-50/95 backdrop-blur-sm text-sm text-blue-700 px-3 py-2 rounded-lg shadow-md border border-blue-200">
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth={2}>
                <rect x="2" y="6" width="12" height="4" rx="0.5" />
              </svg>
              <span className="font-medium">
                壁 {selectedWall.id.slice(-4)}
              </span>
              <span className="text-blue-500 mx-0.5">|</span>
              <span className="font-mono">
                {Math.sqrt(
                  (selectedWall.end.x - selectedWall.start.x) ** 2 +
                    (selectedWall.end.y - selectedWall.start.y) ** 2
                ).toFixed(2)}m
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function toolHint(tool: string): string {
  switch (tool) {
    case 'select':
      return '選択: 壁・家具をクリック';
    case 'wall':
      return '壁描画: クリックで始点 → 連続描画 / Escで確定';
    case 'door':
      return 'ドア: 壁上をクリックして配置';
    case 'window':
      return '窓: 壁上をクリックして配置';
    case 'measure':
      return '計測: 各壁の寸法を表示中';
    case 'delete':
      return '削除: 壁・家具をクリックで削除';
    case 'furniture':
      return '家具: 配置する家具を選択';
    default:
      return '';
  }
}
