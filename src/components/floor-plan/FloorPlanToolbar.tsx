'use client';

import { useEditorStore } from '@/stores/useEditorStore';
import { useUIStore } from '@/stores/useUIStore';
import { EditorTool } from '@/types/floor-plan';
import { useEffect, useState, type ReactNode } from 'react';

interface ToolConfig {
  id: EditorTool;
  label: string;
  shortcut: string;
  icon: ReactNode;
  group?: 'draw' | 'edit' | 'view'; // ツールのグループ分け
}

const tools: ToolConfig[] = [
  {
    id: 'select',
    label: '選択',
    shortcut: 'V',
    group: 'edit',
    // 矢印カーソルアイコン
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path d="M5 3l2 18 4.5-6.5L18 12 5 3z" fill="currentColor" opacity={0.15} />
        <path d="M5 3l2 18 4.5-6.5L18 12 5 3z" />
        <path d="M11.5 14.5l4.5 4.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'wall',
    label: '壁描画',
    shortcut: 'W',
    group: 'draw',
    // 壁の線+角アイコン
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path d="M4 20V8h0" strokeLinecap="round" />
        <path d="M4 8h12" strokeLinecap="round" />
        <path d="M16 8v12" strokeLinecap="round" />
        {/* 壁の厚み表現 */}
        <path d="M4 20V8h12v12" strokeWidth={3} opacity={0.15} />
        {/* 角のドット */}
        <circle cx="4" cy="8" r="1.5" fill="currentColor" />
        <circle cx="16" cy="8" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'door',
    label: 'ドア',
    shortcut: 'D',
    group: 'draw',
    // ドアの弧アイコン
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        {/* 壁の線 */}
        <line x1="4" y1="18" x2="10" y2="18" strokeWidth={3} opacity={0.2} />
        <line x1="18" y1="18" x2="20" y2="18" strokeWidth={3} opacity={0.2} />
        {/* ドアの開き弧 */}
        <path d="M10 18 A8 8 0 0 1 18 18" strokeDasharray="2 2" opacity={0.5} />
        {/* ドアパネル */}
        <line x1="10" y1="18" x2="17.5" y2="12" strokeWidth={2} />
        {/* ヒンジ */}
        <circle cx="10" cy="18" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'window',
    label: '窓',
    shortcut: 'N',
    group: 'draw',
    // 窓の二重線アイコン
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        {/* 壁の線 */}
        <line x1="3" y1="12" x2="7" y2="12" strokeWidth={3} opacity={0.2} />
        <line x1="17" y1="12" x2="21" y2="12" strokeWidth={3} opacity={0.2} />
        {/* 窓の二重線 */}
        <line x1="7" y1="10" x2="17" y2="10" strokeWidth={2} />
        <line x1="7" y1="14" x2="17" y2="14" strokeWidth={2} />
        {/* ガラスの表現 */}
        <line x1="7" y1="10" x2="7" y2="14" strokeWidth={1} opacity={0.5} />
        <line x1="17" y1="10" x2="17" y2="14" strokeWidth={1} opacity={0.5} />
        <line x1="12" y1="10" x2="12" y2="14" strokeWidth={1} opacity={0.3} />
      </svg>
    ),
  },
  {
    id: 'measure',
    label: '計測',
    shortcut: 'M',
    group: 'view',
    // 定規アイコン
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        {/* 定規の本体 */}
        <rect x="2" y="8" width="20" height="8" rx="1" fill="currentColor" opacity={0.08} />
        <rect x="2" y="8" width="20" height="8" rx="1" />
        {/* 目盛り */}
        <line x1="6" y1="8" x2="6" y2="11" />
        <line x1="10" y1="8" x2="10" y2="12" strokeWidth={2} />
        <line x1="14" y1="8" x2="14" y2="11" />
        <line x1="18" y1="8" x2="18" y2="12" strokeWidth={2} />
      </svg>
    ),
  },
  {
    id: 'delete',
    label: '削除',
    shortcut: 'X',
    group: 'edit',
    // ゴミ箱アイコン
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        {/* 蓋 */}
        <path d="M4 6h16" strokeLinecap="round" />
        <path d="M9 6V4.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 4.5V6" />
        {/* 本体 */}
        <path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
        {/* 中の線 */}
        <line x1="10" y1="10" x2="10" y2="18" opacity={0.6} />
        <line x1="14" y1="10" x2="14" y2="18" opacity={0.6} />
      </svg>
    ),
  },
];

// ツールチップコンポーネント
function Tooltip({ text, visible }: { text: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
      <div className="bg-gray-800 text-white text-xs px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap">
        {text}
        {/* 左向き矢印 */}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
      </div>
    </div>
  );
}

export default function FloorPlanToolbar() {
  const activeTool = useUIStore(s => s.activeTool);
  const setActiveTool = useUIStore(s => s.setActiveTool);
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);

  // キーボードショートカット
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 入力欄にフォーカス中は無視
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toUpperCase();
      const tool = tools.find((t) => t.shortcut === key);
      if (tool) {
        e.preventDefault();
        setActiveTool(tool.id);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTool]);

  // グループ分け
  const drawTools = tools.filter((t) => t.group === 'draw');
  const editTools = tools.filter((t) => t.group === 'edit');
  const viewTools = tools.filter((t) => t.group === 'view');

  const renderToolButton = (tool: ToolConfig) => {
    const isActive = activeTool === tool.id;
    return (
      <div key={tool.id} className="relative">
        <button
          onClick={() => setActiveTool(tool.id)}
          onMouseEnter={() => setHoveredTool(tool.id)}
          onMouseLeave={() => setHoveredTool(null)}
          className={`
            flex flex-col items-center justify-center gap-0.5
            w-10 h-10 md:w-11 md:h-11 rounded-sm
            text-xs relative
            active:scale-95
            ${
              isActive
                ? 'text-blue-600 bg-gray-50 border-l-2 border-blue-600'
                : 'text-gray-500 hover:bg-gray-50 border-l-2 border-transparent'
            }
          `}
        >
          {tool.icon}
          <span className="text-[7px] md:text-[8px] leading-none mt-0.5 font-medium blueprint-label" style={{ textTransform: 'none', fontSize: 'inherit' }}>{tool.label}</span>
        </button>
        <Tooltip
          text={`${tool.label} (${tool.shortcut})`}
          visible={hoveredTool === tool.id}
        />
      </div>
    );
  };

  // ディバイダー
  const Divider = () => (
    <div className="w-8 h-px bg-gray-300 mx-auto my-1" />
  );

  return (
    <div className="flex flex-col items-center gap-0.5 py-2 md:py-3 px-1 md:px-1.5 bg-white border-r border-gray-200 w-[48px] md:w-[56px] shrink-0">
      {/* タイトル */}
      <div className="blueprint-label text-center mb-1">
        Tools
      </div>

      {/* 編集ツール */}
      {editTools.map(renderToolButton)}

      <Divider />

      {/* 描画ツール */}
      {drawTools.map(renderToolButton)}

      <Divider />

      {/* 表示ツール */}
      {viewTools.map(renderToolButton)}
    </div>
  );
}
