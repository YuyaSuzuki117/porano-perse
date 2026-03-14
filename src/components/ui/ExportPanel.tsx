'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { computeFloorArea } from '@/lib/geometry';
import { STYLE_PRESETS } from '@/data/styles';
import { FurnitureItem } from '@/types/scene';

/** 提案書の顧客情報 */
interface ProposalInfo {
  customerName: string;
  propertyName: string;
  proposalDate: string;
  companyName: string;
}

interface ExportPanelProps {
  onCapture3D: (scale?: number) => void;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

/** 坪数への変換 (1坪 = 3.305785 m2) */
function sqmToTsubo(sqm: number): number {
  return sqm / 3.305785;
}

/** 今日の日付をYYYY-MM-DD形式で返す */
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 仕様書テキストを生成 */
function buildSpecText(
  projectName: string,
  info: ProposalInfo,
  styleNameJa: string,
  area: number,
  roomHeight: number,
  furniture: FurnitureItem[]
): string {
  const lines = [
    '==========================================================',
    '  インテリアパース仕様書',
    '==========================================================',
    '',
    `プロジェクト名: ${projectName}`,
    `顧客名: ${info.customerName || '(未入力)'}`,
    `物件名: ${info.propertyName || '(未入力)'}`,
    `提案日: ${info.proposalDate}`,
    `会社名: ${info.companyName || '(未入力)'}`,
    '',
    '----------------------------------------------------------',
    '  空間仕様',
    '----------------------------------------------------------',
    `スタイル: ${styleNameJa}`,
    `床面積: ${area.toFixed(1)} m2 (${sqmToTsubo(area).toFixed(1)} 坪)`,
    `天井高: ${roomHeight} m`,
    `什器数: ${furniture.length} 点`,
    '',
    '----------------------------------------------------------',
    '  什器・家具リスト',
    '----------------------------------------------------------',
    ...furniture.map((f, i) =>
      `${String(i + 1).padStart(3, ' ')}. ${f.name} (${f.type})` +
      `\n     サイズ: ${f.scale[0].toFixed(2)} x ${f.scale[1].toFixed(2)} x ${f.scale[2].toFixed(2)} m` +
      `\n     位置: (${f.position[0].toFixed(2)}, ${f.position[2].toFixed(2)})` +
      (f.material ? `\n     素材: ${f.material}` : '') +
      (f.color ? `\n     色: ${f.color}` : '')
    ),
    '',
    '==========================================================',
    `出力日時: ${new Date().toLocaleString('ja-JP')}`,
  ];
  return lines.join('\n');
}

/** 提案書HTMLを生成 */
function buildProposalHTML(
  projectName: string,
  info: ProposalInfo,
  styleNameJa: string,
  area: number,
  roomHeight: number,
  furniture: FurnitureItem[],
  screenshotDataUrl: string
): string {
  const furnitureRows = furniture.map((f, i) =>
    `<tr>
      <td style="text-align:center;color:#64748b">${i + 1}</td>
      <td style="font-weight:500">${f.name}</td>
      <td>${f.type}</td>
      <td>${f.scale[0].toFixed(2)} x ${f.scale[1].toFixed(2)} x ${f.scale[2].toFixed(2)} m</td>
      <td>${f.material || '-'}</td>
    </tr>`
  ).join('');

  const screenshotSection = screenshotDataUrl
    ? `<div style="margin:24px 0 16px">
        <img src="${screenshotDataUrl}" alt="3Dパース" style="width:100%;border-radius:8px;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,0.08)" />
      </div>`
    : '<div style="height:200px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px;margin:24px 0 16px">3Dプレビューが取得できませんでした</div>';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${info.propertyName || projectName} - インテリアパース提案書</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', sans-serif; color: #1e293b; line-height: 1.6; }

    .page { max-width: 210mm; margin: 0 auto; padding: 20mm 18mm; }
    .page-break { page-break-before: always; }

    /* ヘッダー */
    .header { border-bottom: 3px solid #1e40af; padding-bottom: 20px; margin-bottom: 28px; }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .header-title { font-size: 22px; font-weight: 700; color: #1e293b; letter-spacing: 2px; }
    .header-subtitle { font-size: 11px; color: #64748b; margin-top: 4px; letter-spacing: 1px; }
    .header-right { text-align: right; }
    .header-company { font-size: 13px; font-weight: 600; color: #1e40af; }
    .header-date { font-size: 11px; color: #94a3b8; margin-top: 2px; }

    /* 顧客情報 */
    .customer-info { display: flex; gap: 32px; margin-bottom: 24px; padding: 16px 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #1e40af; }
    .customer-item { }
    .customer-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
    .customer-value { font-size: 15px; font-weight: 600; margin-top: 2px; }

    /* 仕様カード */
    .spec-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .spec-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center; }
    .spec-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
    .spec-value { font-size: 17px; font-weight: 700; margin-top: 4px; color: #0f172a; }
    .spec-sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }

    /* セクションタイトル */
    .section-title { font-size: 15px; font-weight: 700; margin: 28px 0 14px; padding-left: 14px; border-left: 4px solid #1e40af; color: #1e293b; }

    /* テーブル */
    .furniture-table { width: 100%; border-collapse: collapse; }
    .furniture-table th { background: #f1f5f9; text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 600; color: #64748b; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px; }
    .furniture-table td { padding: 10px 14px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
    .furniture-table tbody tr:hover { background: #f8fafc; }

    /* 備考 */
    .notes-section { margin-top: 32px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; min-height: 100px; }
    .notes-title { font-size: 11px; color: #94a3b8; margin-bottom: 8px; font-weight: 600; }

    /* フッター */
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }

    /* 印刷用 */
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .page { padding: 0; max-width: none; }
    }

    /* ツールバー */
    .toolbar { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e2e8f0; padding: 12px 24px; display: flex; justify-content: flex-end; gap: 12px; z-index: 100; box-shadow: 0 -4px 16px rgba(0,0,0,0.06); }
    .toolbar button { padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
    .btn-print { background: #1e40af; color: white; }
    .btn-print:hover { background: #1e3a8a; }
    .btn-close { background: #f1f5f9; color: #64748b; }
    .btn-close:hover { background: #e2e8f0; }
  </style>
</head>
<body>
  <!-- ページ1: ヘッダー + 顧客情報 + 3Dパース画像 -->
  <div class="page">
    <div class="header">
      <div class="header-top">
        <div>
          <div class="header-title">インテリアパース提案書</div>
          <div class="header-subtitle">${info.propertyName || projectName}</div>
        </div>
        <div class="header-right">
          <div class="header-company">${info.companyName || ''}</div>
          <div class="header-date">${new Date(info.proposalDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>
    </div>

    <div class="customer-info">
      <div class="customer-item">
        <div class="customer-label">顧客名</div>
        <div class="customer-value">${info.customerName || '-'}</div>
      </div>
      <div class="customer-item">
        <div class="customer-label">物件名</div>
        <div class="customer-value">${info.propertyName || '-'}</div>
      </div>
    </div>

    <div class="spec-grid">
      <div class="spec-card">
        <div class="spec-label">スタイル</div>
        <div class="spec-value">${styleNameJa}</div>
      </div>
      <div class="spec-card">
        <div class="spec-label">床面積</div>
        <div class="spec-value">${area.toFixed(1)} m<sup>2</sup></div>
        <div class="spec-sub">${sqmToTsubo(area).toFixed(1)} 坪</div>
      </div>
      <div class="spec-card">
        <div class="spec-label">天井高</div>
        <div class="spec-value">${roomHeight} m</div>
      </div>
      <div class="spec-card">
        <div class="spec-label">什器数</div>
        <div class="spec-value">${furniture.length} 点</div>
      </div>
    </div>

    <div class="section-title">3D パースイメージ</div>
    ${screenshotSection}
  </div>

  <!-- ページ2: 什器リスト + 備考 -->
  <div class="page page-break">
    <div class="section-title">什器・家具リスト</div>
    <table class="furniture-table">
      <thead>
        <tr>
          <th style="width:40px;text-align:center">#</th>
          <th>名称</th>
          <th>タイプ</th>
          <th>サイズ (幅 x 高 x 奥)</th>
          <th>素材</th>
        </tr>
      </thead>
      <tbody>${furnitureRows}</tbody>
    </table>

    <div class="notes-section">
      <div class="notes-title">備考・特記事項</div>
    </div>

    <div class="footer">
      ${info.companyName ? info.companyName + ' - ' : ''}インテリアパース提案書 | Porano Perse
    </div>
  </div>

  <div class="toolbar no-print">
    <button class="btn-close" onclick="window.close()">閉じる</button>
    <button class="btn-print" onclick="window.print()">PDF として保存 / 印刷</button>
  </div>
</body>
</html>`;
}

export function ExportPanel({ onCapture3D, canvasRef }: ExportPanelProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'proposal' | 'image' | 'data'>('proposal');
  const [previewHtml, setPreviewHtml] = useState('');

  // 提案書情報
  const [proposalInfo, setProposalInfo] = useState<ProposalInfo>({
    customerName: '',
    propertyName: '',
    proposalDate: todayString(),
    companyName: '',
  });

  const modalRef = useRef<HTMLDivElement>(null);
  const projectName = useEditorStore((s) => s.projectName);
  const exportProject = useEditorStore((s) => s.exportProject);

  // モーダル外クリックで閉じる
  useEffect(() => {
    if (!isModalOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setIsModalOpen(false);
      }
    };
    // 少し遅延させてから登録（開くボタンのクリックイベントと衝突防止）
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isModalOpen]);

  // Escキーで閉じる
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isModalOpen]);

  /** ストアから最新データを取得 */
  const getStoreData = useCallback(() => {
    const { furniture, walls, roomHeight, style } = useEditorStore.getState();
    const area = computeFloorArea(walls);
    const styleNameJa = STYLE_PRESETS[style]?.nameJa ?? style;
    return { furniture, walls, roomHeight, style, area, styleNameJa };
  }, []);

  /** 3Dキャンバスからスクリーンショットを取得 */
  const getScreenshot = useCallback((): string => {
    if (!canvasRef?.current) return '';
    try {
      return canvasRef.current.toDataURL('image/png');
    } catch {
      return '';
    }
  }, [canvasRef]);

  /** プレビューHTML生成 */
  const generatePreview = useCallback(() => {
    const { furniture, roomHeight, area, styleNameJa } = getStoreData();
    const screenshot = getScreenshot();
    const html = buildProposalHTML(
      projectName,
      proposalInfo,
      styleNameJa,
      area,
      roomHeight,
      furniture,
      screenshot
    );
    setPreviewHtml(html);
  }, [getStoreData, getScreenshot, projectName, proposalInfo]);

  /** プレビュー更新（タブ切替時）*/
  useEffect(() => {
    if (isModalOpen && activeTab === 'proposal') {
      generatePreview();
    }
  }, [isModalOpen, activeTab, generatePreview]);

  // --- ハンドラー ---

  /** 提案書HTML印刷 */
  const handlePrintProposal = useCallback(() => {
    const { furniture, roomHeight, area, styleNameJa } = getStoreData();
    const screenshot = getScreenshot();
    const html = buildProposalHTML(
      projectName,
      proposalInfo,
      styleNameJa,
      area,
      roomHeight,
      furniture,
      screenshot
    );
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    setIsModalOpen(false);
  }, [getStoreData, getScreenshot, projectName, proposalInfo]);

  /** 仕様書テキスト出力 */
  const handleCopySpec = useCallback(() => {
    const { furniture, roomHeight, area, styleNameJa } = getStoreData();
    const text = buildSpecText(projectName, proposalInfo, styleNameJa, area, roomHeight, furniture);
    navigator.clipboard.writeText(text).catch(() => {
      // フォールバック: テキストファイルダウンロード
      const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName.replace(/\s+/g, '_')}_仕様書.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
    setIsModalOpen(false);
  }, [getStoreData, projectName, proposalInfo]);

  /** 仕様書テキストダウンロード */
  const handleDownloadSpec = useCallback(() => {
    const { furniture, roomHeight, area, styleNameJa } = getStoreData();
    const text = buildSpecText(projectName, proposalInfo, styleNameJa, area, roomHeight, furniture);
    const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_仕様書.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setIsModalOpen(false);
  }, [getStoreData, projectName, proposalInfo]);

  /** プロジェクトJSON出力 */
  const handleExportJSON = useCallback(() => {
    const json = exportProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}.perse.json`;
    a.click();
    URL.revokeObjectURL(url);
    setIsModalOpen(false);
  }, [exportProject, projectName]);

  /** 高解像度PNG出力 */
  const handleCapturePNG = useCallback((scale: number) => {
    onCapture3D(scale);
    setIsModalOpen(false);
  }, [onCapture3D]);

  // --- レンダリング ---

  /** 出力ボタン（トリガー） */
  const triggerButton = (
    <button
      onClick={() => setIsModalOpen(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-medium hover:bg-green-700 transition-colors shadow-sm"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
        <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" strokeLinecap="round" />
      </svg>
      <span>出力</span>
    </button>
  );

  if (!isModalOpen) return triggerButton;

  // タブ定義
  const tabs: { key: typeof activeTab; label: string; icon: string }[] = [
    { key: 'proposal', label: '提案書', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'image', label: '画像出力', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { key: 'data', label: 'データ', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4' },
  ];

  return (
    <>
      {triggerButton}

      {/* モーダルオーバーレイ */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
        <div
          ref={modalRef}
          className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* モーダルヘッダー */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <h2 className="text-sm font-bold text-gray-800">エクスポート</h2>
            <button
              onClick={() => setIsModalOpen(false)}
              className="p-1 rounded-md hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* タブ */}
          <div className="flex border-b border-gray-200 px-5 flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
                  <path d={tab.icon} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {tab.label}
              </button>
            ))}
          </div>

          {/* タブコンテンツ */}
          <div className="flex-1 overflow-y-auto">
            {/* 提案書タブ */}
            {activeTab === 'proposal' && (
              <div className="p-5 space-y-5">
                {/* 顧客情報フォーム */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">顧客名</label>
                    <input
                      type="text"
                      value={proposalInfo.customerName}
                      onChange={(e) => setProposalInfo((p) => ({ ...p, customerName: e.target.value }))}
                      placeholder="例: 株式会社ABC"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">物件名</label>
                    <input
                      type="text"
                      value={proposalInfo.propertyName}
                      onChange={(e) => setProposalInfo((p) => ({ ...p, propertyName: e.target.value }))}
                      placeholder="例: 新宿店 改装工事"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">提案日</label>
                    <input
                      type="date"
                      value={proposalInfo.proposalDate}
                      onChange={(e) => setProposalInfo((p) => ({ ...p, proposalDate: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-500 mb-1">会社名 (フッター表示)</label>
                    <input
                      type="text"
                      value={proposalInfo.companyName}
                      onChange={(e) => setProposalInfo((p) => ({ ...p, companyName: e.target.value }))}
                      placeholder="例: ポラーノプラザ株式会社"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    />
                  </div>
                </div>

                {/* プレビュー */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-gray-500">プレビュー</span>
                    <button
                      onClick={generatePreview}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                    >
                      更新
                    </button>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-inner" style={{ height: 280 }}>
                    {previewHtml ? (
                      <iframe
                        srcDoc={previewHtml}
                        title="提案書プレビュー"
                        className="w-full h-full border-0"
                        sandbox="allow-same-origin"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                        プレビュー読み込み中...
                      </div>
                    )}
                  </div>
                </div>

                {/* アクションボタン */}
                <div className="flex gap-3">
                  <button
                    onClick={handlePrintProposal}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    提案書を印刷 / PDF保存
                  </button>
                  <button
                    onClick={handleCopySpec}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    仕様書コピー
                  </button>
                </div>
              </div>
            )}

            {/* 画像出力タブ */}
            {activeTab === 'image' && (
              <div className="p-5 space-y-3">
                <p className="text-xs text-gray-500 mb-4">3Dビューのスクリーンショットを PNG 形式でダウンロードします。</p>
                <div className="space-y-2">
                  {([
                    { scale: 1, label: '標準 (1x)', desc: '画面表示と同じ解像度', badge: '' },
                    { scale: 2, label: '高品質 (2x)', desc: 'プレゼン資料向け', badge: 'おすすめ' },
                    { scale: 4, label: '超高品質 (4x)', desc: 'A4印刷・大判出力向け', badge: '' },
                  ] as const).map(({ scale, label, desc, badge }) => (
                    <button
                      key={scale}
                      onClick={() => handleCapturePNG(scale)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-blue-50 hover:border-blue-200 border border-gray-200 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm group-hover:bg-blue-200 transition-colors">
                          {scale}x
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-medium text-gray-800">{label}</div>
                          <div className="text-[11px] text-gray-400">{desc}</div>
                        </div>
                      </div>
                      {badge && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                          {badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* データ出力タブ */}
            {activeTab === 'data' && (
              <div className="p-5 space-y-3">
                <p className="text-xs text-gray-500 mb-4">プロジェクトデータや仕様情報を出力します。</p>
                <div className="space-y-2">
                  <button
                    onClick={handleExportJSON}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200 transition-all"
                  >
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={1.5} className="w-5 h-5">
                        <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-800">プロジェクトJSON保存</div>
                      <div className="text-[11px] text-gray-400">再編集可能な .perse.json ファイル</div>
                    </div>
                  </button>

                  <button
                    onClick={handleDownloadSpec}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200 transition-all"
                  >
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={1.5} className="w-5 h-5">
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-800">仕様書テキストダウンロード</div>
                      <div className="text-[11px] text-gray-400">什器リスト・空間仕様のテキストファイル</div>
                    </div>
                  </button>

                  <button
                    onClick={handleCopySpec}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 border border-gray-200 transition-all"
                  >
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth={1.5} className="w-5 h-5">
                        <path d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-800">仕様書をクリップボードにコピー</div>
                      <div className="text-[11px] text-gray-400">メール・チャットに貼り付け可能</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
