'use client';

import FloorPlanCanvas from './FloorPlanCanvas';
import FloorPlanToolbar from './FloorPlanToolbar';
import { useEditorStore } from '@/stores/useEditorStore';

export default function FloorPlanEditor() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const selectedWallId = useEditorStore((s) => s.selectedWallId);
  const walls = useEditorStore((s) => s.walls);

  const selectedWall = selectedWallId
    ? walls.find((w) => w.id === selectedWallId)
    : null;

  return (
    <div className="flex w-full h-full min-h-[500px] bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      {/* 左: ツールバー */}
      <FloorPlanToolbar />

      {/* 中央: キャンバス */}
      <div className="flex-1 relative">
        <FloorPlanCanvas />

        {/* ステータスバー */}
        <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
          <span className="bg-white/90 text-xs text-gray-500 px-2 py-1 rounded shadow-sm">
            {toolHint(activeTool)}
          </span>
          {selectedWall && (
            <span className="bg-blue-50 text-xs text-blue-600 px-2 py-1 rounded shadow-sm">
              壁 {selectedWall.id.slice(-4)} |{' '}
              {Math.sqrt(
                (selectedWall.end.x - selectedWall.start.x) ** 2 +
                  (selectedWall.end.y - selectedWall.start.y) ** 2
              ).toFixed(2)}
              m
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function toolHint(tool: string): string {
  switch (tool) {
    case 'select':
      return '選択: 壁/家具をクリック';
    case 'wall':
      return '壁描画: クリックで始点→クリックで確定 / Esc取消';
    case 'door':
      return 'ドア: 壁上をクリックして配置';
    case 'window':
      return '窓: 壁上をクリックして配置';
    case 'measure':
      return '計測: 各壁の寸法を表示中';
    case 'delete':
      return '削除: 壁/家具をクリックで削除';
    case 'furniture':
      return '家具: 配置する家具を選択';
    default:
      return '';
  }
}
