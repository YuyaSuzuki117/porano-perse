'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RECORDING_SECONDS = 60;

/**
 * Canvas要素からMediaRecorder APIを使って動画録画を行うフック。
 * WebM形式で出力（ブラウザネイティブ、外部ライブラリ不要）。
 */
export function useVideoExport(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0); // 秒数

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  /** 録画停止の内部処理 */
  const doStop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    setIsRecording(false);
    setRecordingProgress(0);
  }, []);

  /** 録画開始 */
  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('[useVideoExport] Canvas要素が見つかりません');
      return;
    }

    // ストリーム取得（30fps）
    const stream = canvas.captureStream(30);

    // サポートするMIMEタイプを検出
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';

    if (!mimeType) {
      console.warn('[useVideoExport] MediaRecorderがサポートされていません');
      alert('このブラウザでは動画録画がサポートされていません。Chrome/Edgeをお試しください。');
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5_000_000,
    });

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `porano-perse-walkthrough-${ts}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      chunksRef.current = [];
    };

    mediaRecorderRef.current = recorder;
    startTimeRef.current = Date.now();
    recorder.start(1000); // 1秒ごとにdataavailableイベント
    setIsRecording(true);
    setRecordingProgress(0);

    // 経過秒数を毎秒更新
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setRecordingProgress(elapsed);

      // 最大録画時間を超えたら自動停止
      if (elapsed >= MAX_RECORDING_SECONDS) {
        doStop();
      }
    }, 1000);
  }, [canvasRef, doStop]);

  /** 録画停止（外部から呼ぶ用） */
  const stopRecording = useCallback(() => {
    doStop();
  }, [doStop]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    };
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    recordingProgress,
  };
}
