'use client';

/**
 * ERP連携パネル
 *
 * パースの家具・仕上げ材・設備データから見積書を生成し、
 * ERPへのエクスポートやPDF出力を行う。
 *
 * 環境変数 NEXT_PUBLIC_ERP_INTEGRATION_ENABLED=true で表示される。
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import {
  FURNITURE_PRICES,
  calculateCostEstimate,
  formatJPY,
  type CostEstimate,
} from '@/lib/cost-estimate';
import type { FurnitureType } from '@/types/scene';
import type { GenerateEstimateResponse } from '@/app/api/erp/generate-estimate/route';

// --- 型 ---

interface ERPIntegrationPanelProps {
  onClose: () => void;
}

type ExportStatus = 'idle' | 'generating' | 'exporting' | 'success' | 'error';

// --- コンポーネント ---

export function ERPIntegrationPanel({ onClose }: ERPIntegrationPanelProps) {
  // フォーム状態
  const [clientName, setClientName] = useState('');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [estimateData, setEstimateData] = useState<GenerateEstimateResponse | null>(null);
  const [exportResult, setExportResult] = useState<{ estimateNumber: string; erpUrl: string } | null>(null);

  // ストアからデータ取得（セレクタで最小限）
  const projectName = useEditorStore((s) => s.projectName);
  const furniture = useEditorStore((s) => s.furniture);

  // 家具コスト見積もりをリアルタイム計算
  const furnitureEstimate: CostEstimate = useMemo(
    () => calculateCostEstimate(furniture),
    [furniture]
  );

  // 見積データ生成
  const handleGenerate = useCallback(async () => {
    if (!clientName.trim()) {
      setErrorMsg('顧客名を入力してください');
      return;
    }
    setStatus('generating');
    setErrorMsg('');

    try {
      const res = await fetch('/api/erp/generate-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName || '無題のプロジェクト',
          clientName: clientName.trim(),
          furniture,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '見積生成に失敗しました');
      }

      const data: GenerateEstimateResponse = await res.json();
      setEstimateData(data);
      setStatus('idle');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '不明なエラー');
      setStatus('error');
    }
  }, [clientName, projectName, furniture]);

  // ERPにエクスポート
  const handleExportToERP = useCallback(async () => {
    if (!estimateData) return;
    setStatus('exporting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/erp/export-to-erp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: estimateData.projectName,
          clientName: estimateData.clientName,
          subject: subject.trim() || `${estimateData.projectName} 内装工事見積`,
          lineItems: estimateData.lineItems,
          taxRate: estimateData.taxRate,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'ERPエクスポートに失敗しました');
      }

      const result = await res.json();
      setExportResult({
        estimateNumber: result.estimateNumber,
        erpUrl: result.erpUrl,
      });
      setStatus('success');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '不明なエラー');
      setStatus('error');
    }
  }, [estimateData, subject, notes]);

  // PDF出力
  const handleDownloadPDF = useCallback(async () => {
    if (!estimateData) return;

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageWidth = 210;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    // ヘッダー
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('ESTIMATE', margin, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${new Date().toLocaleDateString('ja-JP')}`, pageWidth - margin, y, { align: 'right' });
    y += 12;

    // 顧客情報
    doc.setFontSize(11);
    doc.text(`Client: ${estimateData.clientName}`, margin, y);
    y += 6;
    doc.text(`Project: ${estimateData.projectName}`, margin, y);
    y += 10;

    // 区切り線
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // テーブルヘッダー
    const colX = [margin, margin + 10, margin + 80, margin + 110, margin + 130, margin + 155];
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y - 4, contentWidth, 7, 'F');
    doc.text('#', colX[0], y);
    doc.text('Item', colX[1], y);
    doc.text('Category', colX[2], y);
    doc.text('Qty', colX[3], y);
    doc.text('Unit Price', colX[4], y);
    doc.text('Subtotal', colX[5], y);
    y += 7;

    // 明細
    doc.setFont('helvetica', 'normal');
    for (const item of estimateData.lineItems) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(String(item.sort_order), colX[0], y);
      doc.text(item.item_name.substring(0, 25), colX[1], y);
      doc.text(item.category.substring(0, 12), colX[2], y);
      doc.text(`${item.quantity} ${item.unit}`, colX[3], y);
      doc.text(item.unit_price.toLocaleString(), colX[4], y);
      doc.text((item.unit_price * item.quantity).toLocaleString(), colX[5], y);
      y += 5;
    }

    y += 5;
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // 合計
    doc.setFontSize(10);
    doc.text('Subtotal:', colX[4], y);
    doc.text(estimateData.subtotal.toLocaleString(), colX[5], y);
    y += 6;
    doc.text(`Tax (${(estimateData.taxRate * 100).toFixed(0)}%):`, colX[4], y);
    doc.text(estimateData.taxAmount.toLocaleString(), colX[5], y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Total:', colX[4], y);
    doc.text(estimateData.total.toLocaleString(), colX[5], y);
    y += 12;

    // フッター
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text('Generated by Porano Perse 3D', margin, 285);

    // ダウンロード
    const fileName = `${estimateData.projectName.replace(/\s+/g, '_')}_estimate.pdf`;
    doc.save(fileName);
  }, [estimateData]);

  return (
    <div className="space-y-4">
      {/* 家具サマリー */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-blue-700">
            配置家具 {furniture.length} 点
          </span>
          <span className="text-sm font-bold text-blue-900">
            {furnitureEstimate.formatted.total}（税込）
          </span>
        </div>
        {furnitureEstimate.items.length > 0 ? (
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-blue-200">
                  <th className="text-left py-1 font-medium">品目</th>
                  <th className="text-right py-1 font-medium">数量</th>
                  <th className="text-right py-1 font-medium">単価</th>
                  <th className="text-right py-1 font-medium">小計</th>
                </tr>
              </thead>
              <tbody>
                {furnitureEstimate.items.map((item, i) => (
                  <tr key={i} className="border-b border-blue-100">
                    <td className="py-1 text-gray-800">{item.nameJa}</td>
                    <td className="py-1 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-1 text-right text-gray-600">{formatJPY(item.unitPrice)}</td>
                    <td className="py-1 text-right font-medium text-gray-800">{formatJPY(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-blue-600">家具を配置すると見積が表示されます</p>
        )}
      </div>

      {/* 顧客情報入力 */}
      <div className="space-y-2">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">
            顧客名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="例: 株式会社ABC"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">件名</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="例: 新宿店 内装工事見積"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">備考</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="見積に付記する備考"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
          />
        </div>
      </div>

      {/* エラー表示 */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* 成功表示 */}
      {status === 'success' && exportResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-green-800 mb-1">
            ERPに見積書を送信しました
          </p>
          <p className="text-xs text-green-700 mb-2">
            見積番号: {exportResult.estimateNumber}
          </p>
          <a
            href={exportResult.erpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-green-700 underline hover:text-green-900"
          >
            ERPで確認
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
              <path d="M6 3h7v7M13 3L6 10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      )}

      {/* 見積生成結果プレビュー */}
      {estimateData && status !== 'success' && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600">見積プレビュー</span>
            <span className="text-xs text-gray-500">
              {estimateData.lineItems.length} 明細
            </span>
          </div>
          <div className="max-h-32 overflow-y-auto mb-2">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-400 border-b">
                  <th className="text-left py-0.5">カテゴリ</th>
                  <th className="text-left py-0.5">品目</th>
                  <th className="text-right py-0.5">金額</th>
                </tr>
              </thead>
              <tbody>
                {estimateData.lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-0.5 text-gray-500">{item.category}</td>
                    <td className="py-0.5 text-gray-700">{item.item_name}</td>
                    <td className="py-0.5 text-right text-gray-700">
                      {formatJPY(item.unit_price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end text-sm font-bold text-gray-800">
            合計: {estimateData.formatted.total}
          </div>
        </div>
      )}

      {/* アクションボタン */}
      <div className="flex gap-2">
        {!estimateData ? (
          <button
            onClick={handleGenerate}
            disabled={status === 'generating' || furniture.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'generating' ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.3" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
                </svg>
                生成中...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M9 7h6m-6 4h6m-6 4h4m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                見積書を生成
              </>
            )}
          </button>
        ) : status !== 'success' ? (
          <>
            <button
              onClick={handleDownloadPDF}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              PDF
            </button>
            <button
              onClick={handleExportToERP}
              disabled={status === 'exporting'}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'exporting' ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.3" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
                  </svg>
                  送信中...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  ERPに送信
                </>
              )}
            </button>
            <button
              onClick={() => { setEstimateData(null); setStatus('idle'); }}
              className="px-3 py-2.5 text-gray-500 hover:text-gray-700 text-sm"
              title="やり直し"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115.2-4.8M20 15a9 9 0 01-15.2 4.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            閉じる
          </button>
        )}
      </div>
    </div>
  );
}
