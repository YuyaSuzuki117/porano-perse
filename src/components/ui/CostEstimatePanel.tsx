'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { FurnitureItem, FurnitureType } from '@/types/scene';
import {
  calculateCostEstimate,
  costEstimateToCSV,
  formatJPY,
  FURNITURE_PRICES,
  CostEstimate,
} from '@/lib/cost-estimate';

// --- 型定義 ---

interface CostEstimatePanelProps {
  furniture: FurnitureItem[];
  onClose?: () => void;
}

// --- コンポーネント ---

/**
 * コスト見積もりパネル — 配置家具の概算費用を表形式で表示
 * 単価の編集、CSV/PDFダウンロード機能付き
 */
export default function CostEstimatePanel({ furniture, onClose }: CostEstimatePanelProps) {
  // ユーザーが上書きした単価
  const [priceOverrides, setPriceOverrides] = useState<Map<FurnitureType, number>>(new Map());

  // 見積もり計算
  const estimate = useMemo(
    () => calculateCostEstimate(furniture, priceOverrides.size > 0 ? priceOverrides : undefined),
    [furniture, priceOverrides]
  );

  // 単価変更ハンドラ
  const handlePriceChange = useCallback((type: FurnitureType, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;
    setPriceOverrides((prev) => {
      const next = new Map(prev);
      next.set(type, numValue);
      return next;
    });
  }, []);

  // 単価リセット
  const handlePriceReset = useCallback((type: FurnitureType) => {
    setPriceOverrides((prev) => {
      const next = new Map(prev);
      next.delete(type);
      return next;
    });
  }, []);

  // CSVダウンロード
  const handleCSVDownload = useCallback(() => {
    const csv = costEstimateToCSV(estimate);
    const bom = '\uFEFF'; // BOM付きでExcel互換
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cost-estimate-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [estimate]);

  // 簡易PDF出力（テキストベース）
  const handlePDFExport = useCallback(async () => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      // タイトル
      doc.setFontSize(18);
      doc.text('Cost Estimate / コスト見積書', 20, 25);
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString('ja-JP')}`, 20, 35);

      // テーブルヘッダー
      const startY = 50;
      const colX = [20, 90, 120, 155];
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Item', colX[0], startY);
      doc.text('Qty', colX[1], startY);
      doc.text('Unit Price', colX[2], startY);
      doc.text('Subtotal', colX[3], startY);
      doc.line(20, startY + 2, 190, startY + 2);

      // 明細行
      doc.setFont('helvetica', 'normal');
      let y = startY + 8;
      for (const item of estimate.items) {
        doc.text(item.nameJa, colX[0], y);
        doc.text(String(item.quantity), colX[1], y);
        doc.text(formatJPY(item.unitPrice), colX[2], y);
        doc.text(formatJPY(item.subtotal), colX[3], y);
        y += 7;
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      }

      // フッター
      y += 5;
      doc.line(20, y, 190, y);
      y += 7;
      doc.setFont('helvetica', 'bold');
      doc.text('Subtotal:', colX[2], y);
      doc.text(estimate.formatted.subtotal, colX[3], y);
      y += 7;
      doc.text(`Tax (${(estimate.taxRate * 100).toFixed(0)}%):`, colX[2], y);
      doc.text(estimate.formatted.taxAmount, colX[3], y);
      y += 7;
      doc.setFontSize(11);
      doc.text('Total:', colX[2], y);
      doc.text(estimate.formatted.total, colX[3], y);

      doc.save(`cost-estimate-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('[CostEstimatePanel] PDF出力に失敗:', error);
      alert('PDF出力に失敗しました。');
    }
  }, [estimate]);

  if (furniture.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
        家具を配置すると見積もりが表示されます
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          コスト見積もり
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleCSVDownload}
            className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            CSV
          </button>
          <button
            onClick={handlePDFExport}
            className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            PDF
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-1 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="閉じる"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* テーブル */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700">
            <tr className="text-xs text-gray-500 dark:text-gray-400">
              <th className="text-left px-4 py-2 font-medium">品目</th>
              <th className="text-right px-2 py-2 font-medium w-12">数量</th>
              <th className="text-right px-2 py-2 font-medium w-28">単価(税抜)</th>
              <th className="text-right px-4 py-2 font-medium w-24">小計</th>
            </tr>
          </thead>
          <tbody>
            {estimate.items.map((item) => (
              <CostRow
                key={item.type}
                item={item}
                isOverridden={priceOverrides.has(item.type)}
                onPriceChange={handlePriceChange}
                onPriceReset={handlePriceReset}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* フッター（合計） */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-1">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>小計</span>
          <span>{estimate.formatted.subtotal}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>消費税({(estimate.taxRate * 100).toFixed(0)}%)</span>
          <span>{estimate.formatted.taxAmount}</span>
        </div>
        <div className="flex justify-between text-base font-bold text-gray-800 dark:text-gray-200 pt-1 border-t border-gray-200 dark:border-gray-600">
          <span>合計</span>
          <span className="text-blue-600 dark:text-blue-400">{estimate.formatted.total}</span>
        </div>
      </div>
    </div>
  );
}

// --- サブコンポーネント ---

interface CostRowProps {
  item: CostEstimate['items'][number];
  isOverridden: boolean;
  onPriceChange: (type: FurnitureType, value: string) => void;
  onPriceReset: (type: FurnitureType) => void;
}

/** 見積もり明細行 — 単価を直接編集可能 */
function CostRow({ item, isOverridden, onPriceChange, onPriceReset }: CostRowProps) {
  const [editing, setEditing] = useState(false);

  return (
    <tr className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{item.nameJa}</td>
      <td className="px-2 py-2 text-right text-gray-600 dark:text-gray-400">{item.quantity}</td>
      <td className="px-2 py-2 text-right">
        {editing ? (
          <input
            type="number"
            className="w-24 px-1 py-0.5 text-right text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            defaultValue={item.unitPrice}
            autoFocus
            onBlur={(e) => {
              setEditing(false);
              onPriceChange(item.type, e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setEditing(false);
                onPriceChange(item.type, (e.target as HTMLInputElement).value);
              }
              if (e.key === 'Escape') {
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            className={`text-right cursor-pointer hover:underline ${
              isOverridden
                ? 'text-orange-600 dark:text-orange-400 font-medium'
                : 'text-gray-600 dark:text-gray-400'
            }`}
            onClick={() => setEditing(true)}
            title="クリックで単価を編集"
          >
            {formatJPY(item.unitPrice)}
            {isOverridden && (
              <span
                className="ml-1 text-xs cursor-pointer hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onPriceReset(item.type);
                }}
                title="デフォルトに戻す"
              >
                x
              </span>
            )}
          </button>
        )}
      </td>
      <td className="px-4 py-2 text-right font-medium text-gray-800 dark:text-gray-200">
        {formatJPY(item.subtotal)}
      </td>
    </tr>
  );
}
