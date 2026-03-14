'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const TIPS_STORAGE_KEY = 'porano-perse-shown-tips';

interface QuickTip {
  id: string;
  message: string;
}

const TIPS: Record<string, QuickTip> = {
  furniture_drag: {
    id: 'furniture_drag',
    message: 'Shift+クリックで複数の家具を選択できます',
  },
  wall_drawn: {
    id: 'wall_drawn',
    message: '壁をクリックしてドアや窓の開口部を追加できます',
  },
  first_3d: {
    id: 'first_3d',
    message: 'マウスドラッグで回転、右ドラッグで移動、スクロールでズームします',
  },
  first_style: {
    id: 'first_style',
    message: 'H キーで壁表示モードを切替、C キーで天井の表示/非表示を切替できます',
  },
  first_screenshot: {
    id: 'first_screenshot',
    message: 'PDF出力ボタンで提案書も作成できます',
  },
  first_duplicate: {
    id: 'first_duplicate',
    message: 'Ctrl+D で家具を複製、Ctrl+C / Ctrl+V でコピー＆ペーストできます',
  },
};

function getShownTips(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(TIPS_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markTipShown(tipId: string): void {
  const shown = getShownTips();
  shown.add(tipId);
  localStorage.setItem(TIPS_STORAGE_KEY, JSON.stringify([...shown]));
}

/** QuickTipsコンテナ — page.tsxに配置 */
export function QuickTipsContainer() {
  const [activeTip, setActiveTip] = useState<QuickTip | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    setTimeout(() => setActiveTip(null), 300);
  }, []);

  // グローバルイベントリスナーで外部から tip をトリガー
  useEffect(() => {
    const handler = (e: Event) => {
      const tipId = (e as CustomEvent<string>).detail;
      const tip = TIPS[tipId];
      if (!tip) return;

      const shown = getShownTips();
      if (shown.has(tipId)) return;

      markTipShown(tipId);
      setActiveTip(tip);
      requestAnimationFrame(() => setVisible(true));

      // 5秒後に自動消去
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setActiveTip(null), 300);
      }, 5000);
    };

    window.addEventListener('porano-quick-tip', handler);
    return () => {
      window.removeEventListener('porano-quick-tip', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!activeTip) return null;

  return (
    <div
      className={`fixed bottom-20 md:bottom-14 left-1/2 -translate-x-1/2 z-[9998] transition-all duration-300 pointer-events-auto ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="bg-gray-800 text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-sm">
        <div className="flex-shrink-0">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-blue-400">
            <circle cx="10" cy="10" r="8" />
            <path d="M10 7v1M10 10v4" strokeLinecap="round" />
          </svg>
        </div>
        <span className="flex-1 leading-snug">{activeTip.message}</span>
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-gray-400 hover:text-white transition-colors p-0.5"
          aria-label="閉じる"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * クイックヒントをトリガーするヘルパー関数
 * 使用例: triggerQuickTip('furniture_drag');
 */
export function triggerQuickTip(tipId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('porano-quick-tip', { detail: tipId }));
}

/** 表示済みヒントをリセット */
export function resetQuickTips(): void {
  localStorage.removeItem(TIPS_STORAGE_KEY);
}
