'use client';

import React, { useState, useCallback } from 'react';
import * as THREE from 'three';
import { useEditorStore } from '@/stores/useEditorStore';
import { createTimelapseRecorder } from '@/lib/timelapse-recorder';
import { renderStereo3D, StereoMode } from '@/lib/stereo-3d-export';
import {
  generateInteractiveViewer,
  downloadViewerHTML,
} from '@/lib/interactive-viewer-export';

/**
 * 高度エクスポートパネル
 *
 * タイムラプス録画・ステレオ3D出力・HTMLビューア生成・
 * ビフォーアフター比較の4つの高度エクスポート機能を提供する。
 */

interface AdvancedExportPanelProps {
  /** 3Dキャンバスへの参照 */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/** ステレオモード選択肢 */
const STEREO_MODES: { value: StereoMode; label: string }[] = [
  { value: 'anaglyph', label: 'アナグリフ' },
  { value: 'side-by-side', label: 'サイドバイサイド' },
  { value: 'cross-eye', label: 'クロスアイ' },
];

export function AdvancedExportPanel({ canvasRef }: AdvancedExportPanelProps) {
  // --- タイムラプス関連の状態 ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [recordStatus, setRecordStatus] = useState('');

  // --- ステレオ3D関連の状態 ---
  const [stereoMode, setStereoMode] = useState<StereoMode>('anaglyph');
  const [stereoOpen, setStereoOpen] = useState(false);
  const [isStereoExporting, setIsStereoExporting] = useState(false);

  // --- HTMLビューア関連の状態 ---
  const [isGeneratingViewer, setIsGeneratingViewer] = useState(false);

  // --- ストアからセッターを取得 ---
  const setSkyTimeOfDay = useEditorStore((s) => s.setSkyTimeOfDay);
  const setBeforeAfter = useEditorStore((s) => s.setBeforeAfter);

  /**
   * タイムラプス録画を開始する
   * MediaRecorder APIで日照サイクルをWebM動画に記録する。
   */
  const handleTimelapseRecord = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setRecordStatus('キャンバスが見つかりません');
      return;
    }

    setIsRecording(true);
    setRecordProgress(0);
    setRecordStatus('録画中...');

    try {
      const recorder = createTimelapseRecorder(
        canvas,
        // 時刻更新コールバック — ストアの skyTimeOfDay を変更
        (timeOfDay) => setSkyTimeOfDay(timeOfDay),
        { fps: 30, duration: 10, timeRange: [6, 20] },
      );

      // 録画開始
      const blob = await recorder.start();

      // ダウンロード用リンクを生成
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timelapse_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setRecordStatus('録画完了');
    } catch (err) {
      console.error('タイムラプス録画エラー:', err);
      setRecordStatus('録画に失敗しました');
    } finally {
      setIsRecording(false);
      setRecordProgress(0);
    }
  }, [canvasRef, setSkyTimeOfDay]);

  /**
   * ステレオ3D画像を出力する
   * 選択モード（アナグリフ/サイドバイサイド/クロスアイ）で立体視画像を生成。
   */
  const handleStereoExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // WebGLコンテキストからレンダラー/シーン/カメラを取得する
    // Three.jsキャンバスの __r3f プロパティから参照を取得
    const r3f = (canvas as unknown as { __r3f?: { store?: { getState: () => { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } } } }).__r3f;
    if (!r3f?.store) {
      console.error('R3Fストアが見つかりません');
      return;
    }

    setIsStereoExporting(true);
    try {
      const { gl, scene, camera } = r3f.store.getState();
      const dataUrl = await renderStereo3D(
        gl,
        scene,
        camera as THREE.PerspectiveCamera,
        stereoMode,
      );

      // ダウンロード
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `stereo_${stereoMode}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('ステレオ3D出力エラー:', err);
    } finally {
      setIsStereoExporting(false);
      setStereoOpen(false);
    }
  }, [canvasRef, stereoMode]);

  /**
   * HTMLビューアを生成してダウンロードする
   * プロジェクトデータを埋め込んだスタンドアロンHTMLを出力。
   */
  const handleGenerateViewer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsGeneratingViewer(true);
    try {
      // ストアからプロジェクトデータを取得してJSON化
      const state = useEditorStore.getState();
      const projectData = {
        walls: state.walls,
        furniture: state.furniture,
        roomHeight: state.roomHeight,
        style: state.style,
      };
      const projectJson = JSON.stringify(projectData);

      // サムネイル画像を取得
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

      // HTML生成 & ダウンロード
      const html = generateInteractiveViewer(projectJson, thumbnail);
      downloadViewerHTML(html, `3d-viewer_${Date.now()}.html`);
    } catch (err) {
      console.error('HTMLビューア生成エラー:', err);
    } finally {
      setIsGeneratingViewer(false);
    }
  }, [canvasRef]);

  /**
   * ビフォーアフター比較モードを開始する
   * 現在のキャンバスをキャプチャして比較用画像として設定。
   */
  const handleBeforeAfter = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 現在の状態をキャプチャ
    const currentImage = canvas.toDataURL('image/png');

    // ビフォーアフターモードを起動（左=現在, 右=空画像（後で更新される））
    setBeforeAfter(
      currentImage,
      currentImage,
      '変更前',
      '変更後',
    );
  }, [canvasRef, setBeforeAfter]);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-700 mb-2">
        高度エクスポート
      </h3>

      {/* タイムラプス録画 */}
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <button
          type="button"
          onClick={handleTimelapseRecord}
          disabled={isRecording}
          className={`w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            isRecording
              ? 'bg-red-100 text-red-600 cursor-not-allowed'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          {isRecording ? '⏺ 録画中...' : '🎬 タイムラプス録画'}
        </button>
        {/* 進捗バー */}
        {isRecording && (
          <div className="mt-2">
            <div className="h-1.5 w-full rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-red-500 transition-all"
                style={{ width: `${recordProgress * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1 text-center">
              {recordStatus}
            </p>
          </div>
        )}
        {/* 録画完了メッセージ */}
        {!isRecording && recordStatus && (
          <p className="text-xs text-gray-500 mt-1 text-center">
            {recordStatus}
          </p>
        )}
      </div>

      {/* ステレオ3D出力 */}
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <button
          type="button"
          onClick={() => setStereoOpen(!stereoOpen)}
          className="w-full rounded-lg px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          🔮 ステレオ3D出力
        </button>
        {/* モード選択ドロップダウン */}
        {stereoOpen && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-3 gap-1">
              {STEREO_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setStereoMode(mode.value)}
                  className={`rounded px-1.5 py-1 text-xs transition-colors ${
                    stereoMode === mode.value
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleStereoExport}
              disabled={isStereoExporting}
              className={`w-full rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                isStereoExporting
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isStereoExporting ? '出力中...' : '出力する'}
            </button>
          </div>
        )}
      </div>

      {/* HTMLビューア生成 */}
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <button
          type="button"
          onClick={handleGenerateViewer}
          disabled={isGeneratingViewer}
          className={`w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            isGeneratingViewer
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          {isGeneratingViewer ? '生成中...' : '🌐 HTMLビューア生成'}
        </button>
      </div>

      {/* ビフォーアフター比較 */}
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <button
          type="button"
          onClick={handleBeforeAfter}
          className="w-full rounded-lg px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          🔄 ビフォーアフター比較
        </button>
      </div>
    </div>
  );
}
