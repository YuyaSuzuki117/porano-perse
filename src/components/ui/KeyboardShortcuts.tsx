'use client';

import { useState } from 'react';

const SHORTCUTS = [
  { keys: 'V', desc: '選択ツール' },
  { keys: 'W', desc: '壁描画' },
  { keys: 'D', desc: 'ドア配置' },
  { keys: 'N', desc: '窓配置' },
  { keys: 'M', desc: '測定' },
  { keys: 'Del', desc: '削除' },
  { keys: 'Esc', desc: '壁描画キャンセル' },
  { keys: '', desc: '' },
  { keys: 'Ctrl+C', desc: '什器をコピー' },
  { keys: 'Ctrl+V', desc: '什器を貼り付け' },
  { keys: 'Ctrl+D', desc: '什器を複製' },
  { keys: 'Ctrl+Z', desc: '元に戻す' },
  { keys: 'Ctrl+Shift+Z', desc: 'やり直す' },
  { keys: '', desc: '' },
  { keys: 'Delete', desc: '選択アイテム削除' },
  { keys: 'Esc', desc: '選択解除' },
  { keys: '', desc: '' },
  { keys: 'H', desc: '壁表示モード切替' },
  { keys: 'C', desc: '天井表示トグル' },
  { keys: 'G', desc: 'グリッド表示トグル' },
  { keys: 'D', desc: '寸法表示トグル' },
  { keys: 'F', desc: '家具表示トグル' },
  { keys: '', desc: '' },
  { keys: 'ドラッグ', desc: '3D回転' },
  { keys: '右ドラッグ', desc: '3D移動' },
  { keys: 'スクロール', desc: 'ズーム' },
];

export function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
        title="ショートカット一覧"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
          <rect x="2" y="6" width="16" height="10" rx="1.5" />
          <rect x="4" y="8" width="2" height="2" rx="0.3" />
          <rect x="7" y="8" width="2" height="2" rx="0.3" />
          <rect x="10" y="8" width="2" height="2" rx="0.3" />
          <rect x="13" y="8" width="3" height="2" rx="0.3" />
          <rect x="4" y="11" width="3" height="2" rx="0.3" />
          <rect x="8" y="11" width="5" height="2" rx="0.3" />
          <rect x="14" y="11" width="2" height="2" rx="0.3" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-12 right-4 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-64 z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-gray-700">キーボードショートカット</h4>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">
              ✕
            </button>
          </div>
          <div className="space-y-1">
            {SHORTCUTS.map((s, i) =>
              s.keys === '' ? (
                <div key={i} className="border-t border-gray-100 my-1.5" />
              ) : (
                <div key={i} className="flex items-center justify-between py-0.5">
                  <span className="text-[11px] text-gray-500">{s.desc}</span>
                  <kbd className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                    {s.keys}
                  </kbd>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
