'use client';

import { useState, useEffect, useCallback } from 'react';

const SHORTCUT_GROUPS = [
  {
    title: '編集',
    items: [
      { keys: 'Ctrl+Z', desc: '元に戻す' },
      { keys: 'Ctrl+Y', desc: 'やり直す' },
      { keys: 'Ctrl+C', desc: 'コピー' },
      { keys: 'Ctrl+V', desc: '貼り付け' },
      { keys: 'Ctrl+D', desc: '複製' },
      { keys: 'Ctrl+A', desc: '全選択' },
      { keys: 'Shift+Click', desc: '複数選択' },
      { keys: 'Del / BS', desc: '選択削除' },
      { keys: 'Esc', desc: '選択解除' },
    ],
  },
  {
    title: '表示切替',
    items: [
      { keys: 'H', desc: '壁モード (実体/透過/断面/非表示)' },
      { keys: 'C', desc: '天井 ON/OFF' },
      { keys: 'G', desc: 'グリッド ON/OFF' },
      { keys: 'D', desc: '寸法 ON/OFF' },
      { keys: 'F', desc: '家具 ON/OFF' },
    ],
  },
  {
    title: '3D操作',
    items: [
      { keys: 'ドラッグ', desc: '回転' },
      { keys: '右ドラッグ', desc: '移動' },
      { keys: 'スクロール', desc: 'ズーム' },
    ],
  },
];

export function KeyboardShortcutHelp() {
  const [isOpen, setIsOpen] = useState(false);

  // Escape key to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  return (
    <>
      {/* 浮動 ? ボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 w-9 h-9 rounded-full bg-gray-800/80 hover:bg-gray-700 text-white text-sm font-bold shadow-lg backdrop-blur-sm transition-all hover:scale-105 flex items-center justify-center"
        title="キーボードショートカット"
        aria-label="キーボードショートカット一覧"
      >
        ?
      </button>

      {/* オーバーレイ */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed bottom-16 right-4 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-72 max-h-[70vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="キーボードショートカット一覧">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-800">キーボードショートカット</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    {group.title}
                  </h4>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <div key={item.keys} className="flex items-center justify-between py-0.5">
                        <span className="text-[11px] text-gray-600">{item.desc}</span>
                        <kbd className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 whitespace-nowrap">
                          {item.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 text-center">
                Mac: Ctrl を Cmd に読み替え
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
