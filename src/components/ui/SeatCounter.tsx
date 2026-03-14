'use client';

import React, { useMemo, useState } from 'react';
import { FurnitureItem, FurnitureType } from '@/types/scene';

// --- 座席数定義 ---

/** 家具タイプ別の座席数 */
const SEAT_VALUES: Partial<Record<FurnitureType, number>> = {
  chair: 1,
  stool: 1,
  sofa: 3,
  bench: 3,
};

/** 家具タイプの日本語名 */
const SEAT_TYPE_NAMES: Partial<Record<FurnitureType, string>> = {
  chair: '椅子',
  stool: 'スツール',
  sofa: 'ソファ',
  bench: 'ベンチ',
};

// --- 型定義 ---

interface SeatBreakdown {
  type: FurnitureType;
  name: string;
  count: number;
  seatsPerUnit: number;
  totalSeats: number;
}

interface SeatCounterProps {
  furniture: FurnitureItem[];
}

// --- ユーティリティ ---

/** 家具リストから座席数を集計 */
function calculateSeats(furniture: FurnitureItem[]): {
  total: number;
  breakdown: SeatBreakdown[];
} {
  const countByType: Partial<Record<FurnitureType, number>> = {};

  for (const item of furniture) {
    if (SEAT_VALUES[item.type] !== undefined) {
      countByType[item.type] = (countByType[item.type] ?? 0) + 1;
    }
  }

  const breakdown: SeatBreakdown[] = [];
  let total = 0;

  for (const [type, count] of Object.entries(countByType)) {
    const ft = type as FurnitureType;
    const seatsPerUnit = SEAT_VALUES[ft] ?? 0;
    const totalSeats = count * seatsPerUnit;
    breakdown.push({
      type: ft,
      name: SEAT_TYPE_NAMES[ft] ?? type,
      count,
      seatsPerUnit,
      totalSeats,
    });
    total += totalSeats;
  }

  // 多い順にソート
  breakdown.sort((a, b) => b.totalSeats - a.totalSeats);

  return { total, breakdown };
}

// --- コンポーネント ---

/**
 * 座席数カウンター — 配置された家具から座席数を自動集計
 * コンパクトモード（バッジ）と展開モード（内訳テーブル）を切り替え可能
 */
export default function SeatCounter({ furniture }: SeatCounterProps) {
  const [expanded, setExpanded] = useState(false);
  const { total, breakdown } = useMemo(() => calculateSeats(furniture), [furniture]);

  if (total === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-30">
      {/* コンパクトバッジ */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-white text-sm font-medium shadow-lg hover:bg-blue-700 transition-colors"
        title="座席数の内訳を表示"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
        <span>{total}席</span>
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* 展開モード（内訳テーブル） */}
      {expanded && (
        <div className="absolute bottom-full right-0 mb-2 w-56 rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
              座席数内訳
            </h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-3 py-1.5 font-medium">種類</th>
                <th className="text-right px-3 py-1.5 font-medium">数量</th>
                <th className="text-right px-3 py-1.5 font-medium">席/個</th>
                <th className="text-right px-3 py-1.5 font-medium">小計</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => (
                <tr
                  key={row.type}
                  className="border-b border-gray-50 dark:border-gray-700/50"
                >
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">
                    {row.name}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">
                    {row.count}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">
                    {row.seatsPerUnit}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-gray-800 dark:text-gray-200">
                    {row.totalSeats}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50 dark:bg-blue-900/30">
                <td
                  colSpan={3}
                  className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300"
                >
                  合計
                </td>
                <td className="px-3 py-2 text-right font-bold text-blue-600 dark:text-blue-400">
                  {total}席
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
