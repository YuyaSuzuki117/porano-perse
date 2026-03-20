'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import type { BlueprintJson, PdfRenderInfo } from '@/types/blueprint';
import CorrectionCanvas from '@/components/correction/CorrectionCanvas';
import CorrectionToolbar from '@/components/correction/CorrectionToolbar';
import CorrectionSidebar from '@/components/correction/CorrectionSidebar';
import RoomNameEditor from '@/components/correction/RoomNameEditor';
import ExportBar from '@/components/correction/ExportBar';
import Toast from '@/components/correction/Toast';

export default function CorrectionPage() {
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const loadBlueprint = useCorrectionStore((s) => s.loadBlueprint);
  const setPdfInfo = useCorrectionStore((s) => s.setPdfInfo);
  const loadAutosave = useCorrectionStore((s) => s.loadAutosave);
  const clearAutosave = useCorrectionStore((s) => s.clearAutosave);

  const [autosaveTime, setAutosaveTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // 自動保存チェック
  useEffect(() => {
    try {
      const ts = localStorage.getItem('porano-correction-autosave-timestamp');
      if (ts && localStorage.getItem('porano-correction-autosave')) {
        setAutosaveTime(ts);
      }
    } catch { /* ignore */ }
  }, []);

  const handleRestore = useCallback(() => {
    loadAutosave();
    setAutosaveTime(null);
  }, [loadAutosave]);

  const handleDiscard = useCallback(() => {
    clearAutosave();
    setAutosaveTime(null);
  }, [clearAutosave]);

  // ファイル処理の共通関数
  const processFiles = useCallback(async (jsonFile: File, pdfFile?: File | null) => {
    setLoading(true);
    setLoadingMsg('JSONを読み込み中...');
    setError(null);

    try {
      const jsonText = await jsonFile.text();
      const bp: BlueprintJson = JSON.parse(jsonText);
      loadBlueprint(bp);

      if (pdfFile) {
        setLoadingMsg('PDFを変換中...');
        const formData = new FormData();
        formData.append('pdf', pdfFile);
        formData.append('page', '0');

        const res = await fetch('/api/correction/render-pdf', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'PDF変換に失敗しました');
        }

        const info: PdfRenderInfo = await res.json();
        setPdfInfo(info);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }, [loadBlueprint, setPdfInfo]);

  const handleUpload = useCallback(async () => {
    const pdfFile = pdfInputRef.current?.files?.[0];
    const jsonFile = jsonInputRef.current?.files?.[0];

    if (!jsonFile) {
      setError('抽出JSONファイルを選択してください');
      return;
    }

    await processFiles(jsonFile, pdfFile);
  }, [processFiles]);

  // ドラッグ＆ドロップ
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const jsonFile = files.find(f => f.name.endsWith('.json'));
    const pdfFile = files.find(f => f.name.endsWith('.pdf'));

    if (!jsonFile) {
      setError('JSONファイルをドロップしてください（.json）');
      return;
    }

    setJsonFileName(jsonFile.name);
    if (pdfFile) setPdfFileName(pdfFile.name);

    await processFiles(jsonFile, pdfFile);
  }, [processFiles]);

  // サンプルで試す
  const handleLoadDemo = useCallback(async () => {
    setLoading(true);
    setLoadingMsg('サンプルデータを読み込み中...');
    setError(null);

    try {
      const res = await fetch('/api/correction/demo');
      if (!res.ok) {
        throw new Error('サンプルデータの取得に失敗しました');
      }
      const bp: BlueprintJson = await res.json();
      loadBlueprint(bp);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'サンプル読み込みに失敗しました');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }, [loadBlueprint]);

  // ローディングスピナー
  const spinner = useMemo(() => (
    <svg className="animate-spin h-5 w-5 inline-block mr-2" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ), []);

  // 未読み込み: アップロード画面
  if (!blueprint) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">
            図面補正ツール
          </h1>
          <p className="mb-6 text-sm text-gray-600">
            PDF→DXF自動抽出の結果を確認・修正できます。
            <br />
            不明な部屋名の入力や、部屋境界の調整が可能です。
          </p>

          {/* 自動保存復元バナー */}
          {autosaveTime && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="mb-2 text-sm text-amber-800">
                前回の作業データがあります（{new Date(autosaveTime).toLocaleString('ja-JP')}）
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRestore}
                  className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
                >
                  復元
                </button>
                <button
                  onClick={handleDiscard}
                  className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
                >
                  破棄
                </button>
              </div>
            </div>
          )}

          {/* ドラッグ＆ドロップゾーン */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`mb-4 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              isDragOver
                ? 'border-blue-400 bg-blue-50 text-blue-600'
                : 'border-gray-300 bg-gray-50 text-gray-500'
            }`}
          >
            <div className="mb-2 text-3xl">{isDragOver ? '📂' : '📁'}</div>
            <p className="text-sm font-medium">
              {isDragOver ? 'ここにドロップ' : 'ファイルをドラッグ＆ドロップ'}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              JSON（必須）＋ PDF（任意）をまとめてドロップできます
            </p>
          </div>

          <div className="relative mb-4 text-center text-xs text-gray-400">
            <span className="bg-white px-2">または</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-gray-200" />
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                抽出JSON（必須）
              </label>
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json"
                onChange={(e) => setJsonFileName(e.target.files?.[0]?.name ?? null)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
              />
              {jsonFileName && (
                <p className="mt-1 text-xs text-green-600">選択中: {jsonFileName}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                元PDF（任意 — 背景表示用）
              </label>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFileName(e.target.files?.[0]?.name ?? null)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-gray-600 hover:file:bg-gray-100"
              />
              {pdfFileName && (
                <p className="mt-1 text-xs text-green-600">選択中: {pdfFileName}</p>
              )}
            </div>

            {error && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              onClick={handleUpload}
              disabled={loading}
              className="w-full rounded bg-blue-600 px-4 py-2.5 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  {spinner}
                  {loadingMsg || '読み込み中...'}
                </span>
              ) : (
                '読み込んで補正開始'
              )}
            </button>

            <button
              onClick={handleLoadDemo}
              disabled={loading}
              className="w-full rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              サンプルで試す
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 読み込み済み: 補正UI (ダークテーマ)
  return (
    <div className="flex h-screen flex-col bg-[#1a1a2e]">
      {/* ツールバー */}
      <CorrectionToolbar />

      {/* メインエリア */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="relative flex-1">
          <CorrectionCanvas />
          <RoomNameEditor />
        </div>

        {/* サイドバー */}
        <CorrectionSidebar />
      </div>

      {/* 出力バー */}
      <ExportBar />

      {/* トースト通知 */}
      <Toast />
    </div>
  );
}
