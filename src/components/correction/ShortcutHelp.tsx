'use client';

import React, { useState, useEffect, useCallback } from 'react';

/** ショートカットカテゴリ */
interface ShortcutCategory {
  label: string;
  shortcuts: { keys: string; description: string }[];
}

/** 全ショートカット一覧（CorrectionCanvas.tsx の handleKeyDown に基づく） */
const shortcutCategories: ShortcutCategory[] = [
  {
    label: 'ツール切替',
    shortcuts: [
      { keys: 'V', description: '選択ツール' },
      { keys: 'N', description: '室名編集' },
      { keys: 'M', description: '頂点移動' },
      { keys: 'W', description: '壁追加' },
      { keys: 'R', description: '測定' },
      { keys: 'Del', description: '選択中の部屋/壁を削除' },
      { keys: 'Esc', description: '選択解除・ツールリセット' },
    ],
  },
  {
    label: '操作',
    shortcuts: [
      { keys: 'Ctrl+Z', description: '元に戻す' },
      { keys: 'Ctrl+Y', description: 'やり直す' },
      { keys: 'Space+ドラッグ', description: '画面を移動（パン）' },
      { keys: 'Ctrl', description: '軸ロック（水平/垂直に制限）' },
      { keys: 'Shift', description: '壁移動時の微調整' },
    ],
  },
  {
    label: '表示',
    shortcuts: [
      { keys: 'Ctrl+0', description: '全体表示（フィット）' },
      { keys: 'ホイール', description: 'ズーム' },
      { keys: 'G', description: 'グリッド表示 ON/OFF' },
      { keys: 'S', description: 'スナップ ON/OFF' },
      { keys: '1', description: 'PDF背景レイヤー' },
      { keys: '2', description: 'グリッドレイヤー' },
      { keys: '3', description: '部屋レイヤー' },
      { keys: '4', description: '壁レイヤー' },
      { keys: '5', description: '什器レイヤー' },
      { keys: '6', description: 'ラベルレイヤー' },
      { keys: '7', description: '寸法レイヤー' },
    ],
  },
];

/**
 * ショートカットヘルプパネル
 * "?" キーまたはボタンクリックで開閉
 */
export default function ShortcutHelp() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // "?" キーで開閉
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggle]);

  return (
    <>
      {/* ヘルプボタン（画面左下） */}
      <button
        onClick={toggle}
        className={`absolute bottom-4 left-4 flex items-center justify-center w-9 h-9 rounded-full z-50 transition-all shadow-lg ${
          isOpen
            ? 'bg-[#4a90d9] text-white'
            : 'bg-[#0d1b2a]/90 border border-[#1e3a5f] text-[#8ba4c4] hover:bg-[#16213e] hover:text-[#b0c8e8]'
        }`}
        title="ショートカット一覧 (?)"
      >
        <span className="text-sm font-bold">?</span>
      </button>

      {/* オーバーレイパネル */}
      {isOpen && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center"
          onClick={(e) => {
            // 背景クリックで閉じる
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          {/* 半透明背景 */}
          <div className="absolute inset-0 bg-black/50" />

          {/* パネル */}
          <div className="relative bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e3a5f]">
              <h2 className="text-sm font-bold text-[#b0c8e8]">
                キーボードショートカット
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-center w-7 h-7 rounded text-[#6b8ab5] hover:bg-[#16213e] hover:text-[#b0c8e8] transition-all"
                title="閉じる"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* ショートカット一覧 */}
            <div className="px-5 py-3 space-y-4">
              {shortcutCategories.map((cat) => (
                <div key={cat.label}>
                  <h3 className="text-[11px] font-bold text-[#4a90d9] uppercase tracking-wider mb-2">
                    {cat.label}
                  </h3>
                  <div className="space-y-1">
                    {cat.shortcuts.map((sc) => (
                      <div
                        key={sc.keys}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-[12px] text-[#8ba4c4]">
                          {sc.description}
                        </span>
                        <kbd className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-[#16213e] border border-[#1e3a5f] text-[#6b8ab5] min-w-[32px] justify-center">
                          {sc.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* フッター */}
            <div className="px-5 py-2 border-t border-[#1e3a5f] text-center">
              <span className="text-[10px] text-[#4a5f7a]">
                ? キーで開閉 / パネル外クリックで閉じる
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
