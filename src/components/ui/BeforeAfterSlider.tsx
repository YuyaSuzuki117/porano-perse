'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

interface BeforeAfterSliderProps {
  /** 左側画像（base64またはdataURL） */
  leftImage: string;
  /** 右側画像（base64またはdataURL） */
  rightImage: string;
  /** 左側ラベル */
  leftLabel: string;
  /** 右側ラベル */
  rightLabel: string;
  /** 閉じるコールバック */
  onClose: () => void;
}

/**
 * ビフォー・アフター比較スライダー
 *
 * 全画面オーバーレイでドラッグ可能な仕切り線により
 * 2枚の画像を左右に比較表示する。
 */
export function BeforeAfterSlider({
  leftImage,
  rightImage,
  leftLabel,
  rightLabel,
  onClose,
}: BeforeAfterSliderProps) {
  // 仕切り位置（0〜1、初期値0.5＝中央）
  const [dividerPos, setDividerPos] = useState(0.5);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  /** マウス/タッチ位置からdividerPosを計算 */
  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    setDividerPos(ratio);
  }, []);

  /** ドラッグ開始 */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true;
      // ポインターキャプチャで確実にドラッグ追従
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updatePosition(e.clientX);
    },
    [updatePosition],
  );

  /** ドラッグ中 */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      updatePosition(e.clientX);
    },
    [updatePosition],
  );

  /** ドラッグ終了 */
  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  /** Escapeキーで閉じる */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const percentLeft = `${dividerPos * 100}%`;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center">
      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40
                   flex items-center justify-center text-white text-xl transition-colors backdrop-blur-sm"
        aria-label="閉じる"
      >
        ✕
      </button>

      {/* 比較コンテナ */}
      <div
        ref={containerRef}
        className="relative w-[90vw] h-[80vh] select-none overflow-hidden rounded-lg"
        style={{ cursor: 'col-resize' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* 右側画像（背景全体に表示） */}
        <img
          src={rightImage}
          alt={rightLabel}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />

        {/* 左側画像（clip-pathで仕切り位置まで表示） */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: `inset(0 ${100 - dividerPos * 100}% 0 0)`,
          }}
        >
          <img
            src={leftImage}
            alt={leftLabel}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            draggable={false}
          />
        </div>

        {/* 仕切り線 */}
        <div
          className="absolute top-0 bottom-0 w-[3px] bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)] pointer-events-none"
          style={{ left: percentLeft, transform: 'translateX(-50%)' }}
        >
          {/* ドラッグハンドル（仕切り線中央の丸ボタン） */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                       w-10 h-10 rounded-full bg-white/90 shadow-lg
                       flex items-center justify-center pointer-events-none"
          >
            {/* 左右矢印アイコン */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M6 10L2 10M2 10L5 7M2 10L5 13" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 10L18 10M18 10L15 7M18 10L15 13" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* 左側ラベル */}
        <div
          className="absolute top-4 left-4 px-3 py-1.5 bg-black/60 text-white text-sm rounded-md
                     backdrop-blur-sm pointer-events-none select-none"
          style={{
            opacity: dividerPos > 0.12 ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          {leftLabel}
        </div>

        {/* 右側ラベル */}
        <div
          className="absolute top-4 right-4 px-3 py-1.5 bg-black/60 text-white text-sm rounded-md
                     backdrop-blur-sm pointer-events-none select-none"
          style={{
            opacity: dividerPos < 0.88 ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          {rightLabel}
        </div>
      </div>

      {/* 操作ヒント */}
      <p className="absolute bottom-6 text-white/50 text-xs select-none pointer-events-none">
        ドラッグで比較 ・ Escで閉じる
      </p>
    </div>
  );
}
