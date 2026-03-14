'use client';

import { useEditorStore } from '@/stores/useEditorStore';

/**
 * 家具整列ツールバー
 * 2つ以上の家具が選択されている場合にフローティング表示
 */
export function AlignmentToolbar() {
  const selectedFurnitureIds = useEditorStore((s) => s.selectedFurnitureIds);
  const alignLeft = useEditorStore((s) => s.alignLeft);
  const alignRight = useEditorStore((s) => s.alignRight);
  const alignTop = useEditorStore((s) => s.alignTop);
  const alignBottom = useEditorStore((s) => s.alignBottom);
  const alignCenterH = useEditorStore((s) => s.alignCenterH);
  const alignCenterV = useEditorStore((s) => s.alignCenterV);
  const distributeH = useEditorStore((s) => s.distributeH);
  const distributeV = useEditorStore((s) => s.distributeV);
  const duplicateSelectedFurniture = useEditorStore((s) => s.duplicateSelectedFurniture);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);

  if (selectedFurnitureIds.length < 2) return null;

  const count = selectedFurnitureIds.length;

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-gray-900/90 backdrop-blur-md rounded-lg shadow-xl border border-gray-700 px-2 py-1.5 flex items-center gap-1">
      {/* 選択数表示 */}
      <span className="text-xs text-blue-300 font-medium px-1.5 whitespace-nowrap">
        {count}個選択
      </span>
      <div className="w-px h-5 bg-gray-600" />

      {/* 整列ボタン群 */}
      <ToolButton onClick={alignLeft} title="左揃え">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="2" y1="2" x2="2" y2="14" />
          <rect x="4" y="3" width="8" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
          <rect x="4" y="8" width="5" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
        </svg>
      </ToolButton>
      <ToolButton onClick={alignCenterH} title="水平中央">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="8" y1="1" x2="8" y2="15" strokeDasharray="2 1" opacity={0.5} />
          <rect x="3" y="3" width="10" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
          <rect x="5" y="8" width="6" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
        </svg>
      </ToolButton>
      <ToolButton onClick={alignRight} title="右揃え">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="14" y1="2" x2="14" y2="14" />
          <rect x="4" y="3" width="8" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
          <rect x="7" y="8" width="5" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
        </svg>
      </ToolButton>

      <div className="w-px h-5 bg-gray-600" />

      <ToolButton onClick={alignTop} title="上揃え">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="2" y1="2" x2="14" y2="2" />
          <rect x="3" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity={0.4} />
          <rect x="8" y="4" width="3" height="5" rx="0.5" fill="currentColor" opacity={0.4} />
        </svg>
      </ToolButton>
      <ToolButton onClick={alignCenterV} title="垂直中央">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="1" y1="8" x2="15" y2="8" strokeDasharray="2 1" opacity={0.5} />
          <rect x="3" y="2" width="3" height="12" rx="0.5" fill="currentColor" opacity={0.4} />
          <rect x="8" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity={0.4} />
        </svg>
      </ToolButton>
      <ToolButton onClick={alignBottom} title="下揃え">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <line x1="2" y1="14" x2="14" y2="14" />
          <rect x="3" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity={0.4} />
          <rect x="8" y="7" width="3" height="5" rx="0.5" fill="currentColor" opacity={0.4} />
        </svg>
      </ToolButton>

      {count >= 3 && (
        <>
          <div className="w-px h-5 bg-gray-600" />
          <ToolButton onClick={distributeH} title="水平等間隔">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="1" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity={0.4} />
              <rect x="6.5" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity={0.4} />
              <rect x="12" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity={0.4} />
            </svg>
          </ToolButton>
          <ToolButton onClick={distributeV} title="垂直等間隔">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <rect x="4" y="1" width="8" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
              <rect x="4" y="6.5" width="8" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
              <rect x="4" y="12" width="8" height="3" rx="0.5" fill="currentColor" opacity={0.4} />
            </svg>
          </ToolButton>
        </>
      )}

      <div className="w-px h-5 bg-gray-600" />

      {/* 複製 */}
      <ToolButton onClick={duplicateSelectedFurniture} title="複製 (Ctrl+D)">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="1" y="3" width="8" height="8" rx="1" />
          <rect x="5" y="1" width="8" height="8" rx="1" opacity={0.5} />
        </svg>
      </ToolButton>

      {/* 削除 */}
      <ToolButton onClick={deleteSelected} title="削除" variant="danger">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5" strokeLinecap="round" />
          <path d="M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1L12 4" />
        </svg>
      </ToolButton>
    </div>
  );
}

function ToolButton({
  onClick,
  title,
  children,
  variant = 'default',
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}) {
  const baseClass =
    variant === 'danger'
      ? 'text-red-400 hover:text-red-300 hover:bg-red-500/20'
      : 'text-gray-300 hover:text-white hover:bg-gray-700';
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${baseClass}`}
    >
      {children}
    </button>
  );
}
