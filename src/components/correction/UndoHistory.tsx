'use client';
import { useCorrectionStore } from '@/stores/useCorrectionStore';

/**
 * UndoHistory: サイドバー下部に表示する操作履歴パネル
 * クリックで任意の履歴状態にジャンプ可能
 */
export default function UndoHistory() {
  const history = useCorrectionStore((s) => s.history);
  const historyIdx = useCorrectionStore((s) => s.historyIdx);
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const jumpToHistory = useCorrectionStore((s) => s.jumpToHistory);

  if (!blueprint || history.length <= 1) return null;

  return (
    <div className="border-t border-[#1e3a5f] mt-1">
      <div className="px-3 py-1.5">
        <h3 className="text-[10px] font-bold text-[#6b8ab5] uppercase tracking-wider">
          履歴 ({historyIdx + 1}/{history.length})
        </h3>
      </div>
      <ul className="max-h-32 overflow-y-auto">
        {history.slice(0, 20).map((_, i) => (
          <li key={i}>
            <button
              onClick={() => jumpToHistory(i)}
              className={`w-full text-left px-3 py-1 text-[10px] transition-colors ${
                i === historyIdx
                  ? 'bg-[#1e3a5f]/60 text-[#4a90d9] font-bold'
                  : i > historyIdx
                    ? 'text-[#4a5a6a] hover:bg-[#1e3a5f]/20'
                    : 'text-[#6b8ab5] hover:bg-[#1e3a5f]/20'
              }`}
            >
              {i === 0 ? '初期状態' : `操作 ${i}`}
              {i === historyIdx && ' \u25C0'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
