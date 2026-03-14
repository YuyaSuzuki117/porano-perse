'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface HistoryEntry {
  walls: unknown[];
  openings: unknown[];
  furniture: unknown[];
  roomLabels: unknown[];
  roomHeight: number;
  style: string;
}

interface UndoTimelineProps {
  history: HistoryEntry[];
  historyIndex: number;
  onJump: (index: number) => void;
}

function formatRelativeTime(secondsAgo: number): string {
  if (secondsAgo < 60) return '数秒前';
  const minutes = Math.floor(secondsAgo / 60);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function describeSnapshot(entry: HistoryEntry, index: number): string {
  const parts: string[] = [];
  if (entry.walls.length > 0) parts.push(`壁${entry.walls.length}`);
  if (entry.furniture.length > 0) parts.push(`家具${entry.furniture.length}`);
  if (entry.openings.length > 0) parts.push(`開口${entry.openings.length}`);
  if (parts.length === 0) return `状態 #${index}`;
  return parts.join(' / ');
}

export function UndoTimeline({ history, historyIndex, onJump }: UndoTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // タイムスタンプの近似（エントリ間隔を30秒と仮定）
  const now = Date.now();
  const getSecondsAgo = useCallback((index: number): number => {
    return (history.length - 1 - index) * 30;
  }, [history.length]);

  // 現在位置にスクロール
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [historyIndex]);

  const displayHistory = history.slice(-50);
  const offset = Math.max(0, history.length - 50);

  if (history.length <= 1) return null;

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-2 select-none">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs text-gray-400 font-medium">
          履歴 ({historyIndex + 1}/{history.length})
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          {expanded ? '縮小' : '展開'}
        </button>
      </div>

      {/* タイムライン */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent"
      >
        {expanded ? (
          /* 展開モード: 完全な説明 */
          <div className="flex gap-1 pb-1 min-w-max">
            {displayHistory.map((entry, i) => {
              const realIndex = i + offset;
              const isCurrent = realIndex === historyIndex;
              const isPast = realIndex < historyIndex;

              return (
                <button
                  key={realIndex}
                  ref={isCurrent ? activeRef : undefined}
                  onClick={() => onJump(realIndex)}
                  className={`
                    flex flex-col items-center px-2 py-1.5 rounded-md
                    min-w-[80px] max-w-[100px] transition-all text-left
                    ${isCurrent
                      ? 'bg-blue-600/30 border border-blue-500 ring-1 ring-blue-500/50'
                      : isPast
                        ? 'bg-gray-800/60 border border-gray-700 hover:bg-gray-700/60'
                        : 'bg-gray-800/30 border border-gray-700/50 hover:bg-gray-700/40 opacity-60'
                    }
                  `}
                >
                  <span className={`text-[10px] font-mono ${isCurrent ? 'text-blue-300' : 'text-gray-500'}`}>
                    #{realIndex + 1}
                  </span>
                  <span className="text-[10px] text-gray-400 truncate w-full text-center">
                    {describeSnapshot(entry, realIndex)}
                  </span>
                  <span className="text-[9px] text-gray-500 mt-0.5">
                    {formatRelativeTime(getSecondsAgo(realIndex))}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          /* コンパクトモード: ドットマーカー */
          <div className="flex items-center gap-0.5 py-1 min-w-max px-1">
            {displayHistory.map((_, i) => {
              const realIndex = i + offset;
              const isCurrent = realIndex === historyIndex;
              const isPast = realIndex < historyIndex;

              return (
                <button
                  key={realIndex}
                  ref={isCurrent ? activeRef : undefined}
                  onClick={() => onJump(realIndex)}
                  title={`#${realIndex + 1} — ${describeSnapshot(displayHistory[i], realIndex)}`}
                  className={`
                    rounded-full transition-all flex-shrink-0
                    ${isCurrent
                      ? 'w-3 h-3 bg-blue-500 ring-2 ring-blue-400/50'
                      : isPast
                        ? 'w-2 h-2 bg-gray-500 hover:bg-gray-400'
                        : 'w-2 h-2 bg-gray-700 hover:bg-gray-600'
                    }
                  `}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
