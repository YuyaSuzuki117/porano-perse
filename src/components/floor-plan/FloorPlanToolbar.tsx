'use client';

import { useEditorStore } from '@/stores/useEditorStore';
import { EditorTool } from '@/types/floor-plan';
import { useEffect, type ReactNode } from 'react';

interface ToolConfig {
  id: EditorTool;
  label: string;
  shortcut: string;
  icon: ReactNode;
}

const tools: ToolConfig[] = [
  {
    id: 'select',
    label: '選択',
    shortcut: 'V',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        <path d="M13 13l6 6" />
      </svg>
    ),
  },
  {
    id: 'wall',
    label: '壁描画',
    shortcut: 'W',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="12" y1="3" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: 'door',
    label: 'ドア',
    shortcut: 'D',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <rect x="6" y="2" width="12" height="20" rx="1" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'window',
    label: '窓',
    shortcut: 'N',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </svg>
    ),
  },
  {
    id: 'measure',
    label: '計測',
    shortcut: 'M',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <path d="M2 12h4m4 0h4m4 0h4" />
        <path d="M6 8v8" />
        <path d="M18 8v8" />
      </svg>
    ),
  },
  {
    id: 'delete',
    label: '削除',
    shortcut: 'X',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
      </svg>
    ),
  },
];

export default function FloorPlanToolbar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

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

  return (
    <div className="flex flex-col gap-1 p-2 bg-gray-50 border-r border-gray-200 w-16 shrink-0">
      <div className="text-[10px] text-gray-400 text-center mb-1 font-medium">
        ツール
      </div>
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            className={`
              flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-lg
              transition-colors duration-100 text-xs
              ${
                isActive
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {tool.icon}
            <span className="text-[9px] leading-tight">{tool.label}</span>
            <span
              className={`text-[8px] leading-none ${
                isActive ? 'text-blue-100' : 'text-gray-400'
              }`}
            >
              {tool.shortcut}
            </span>
          </button>
        );
      })}
    </div>
  );
}
