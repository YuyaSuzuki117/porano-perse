/**
 * タイムラプスレコーダー
 *
 * 日照サイクルのタイムラプス動画を記録する。
 * MediaRecorder API を使用してキャンバスから WebM 動画を生成する。
 * 呼び出し側が提供するコールバックで timeOfDay を更新し、
 * フレームごとにレンダリング → キャプチャ → 次の時刻ステップへ進む。
 */

/** レコーダーのオプション */
export interface TimelapseOptions {
  /** フレームレート (fps) */
  fps: number;
  /** 出力動画の全体尺 (秒) */
  duration: number;
  /** 時刻範囲 [開始, 終了] (0-24時間制) */
  timeRange: [number, number];
}

/** 進捗コールバック */
export type ProgressCallback = (progress: number, currentTime: number) => void;

/** 時刻更新コールバック（ストアの timeOfDay を変更するために使う） */
export type TimeUpdateCallback = (timeOfDay: number) => void;

/**
 * タイムラプスレコーダークラス
 *
 * キャンバスのストリームを MediaRecorder で記録し、
 * 各フレームごとに時刻を進めてレンダリングをキャプチャする。
 */
export class TimelapseRecorder {
  private canvas: HTMLCanvasElement;
  private options: TimelapseOptions;
  private onTimeUpdate: TimeUpdateCallback;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private isRecording = false;
  private isCancelled = false;
  private animationFrameId: number | null = null;

  /** 進捗通知コールバック */
  onProgress: ProgressCallback | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    onTimeUpdate: TimeUpdateCallback,
    options: TimelapseOptions,
  ) {
    this.canvas = canvas;
    this.onTimeUpdate = onTimeUpdate;
    this.options = {
      fps: Math.max(1, Math.min(60, options.fps)),
      duration: Math.max(1, options.duration),
      timeRange: [
        Math.max(0, Math.min(24, options.timeRange[0])),
        Math.max(0, Math.min(24, options.timeRange[1])),
      ],
    };
  }

  /**
   * レコーディング開始
   * 全フレームをキャプチャし終えたら WebM Blob を返す
   */
  async start(): Promise<Blob> {
    if (this.isRecording) {
      throw new Error('既にレコーディング中です');
    }

    this.isRecording = true;
    this.isCancelled = false;
    this.chunks = [];

    const { fps, duration, timeRange } = this.options;
    const totalFrames = Math.ceil(fps * duration);
    const [startTime, endTime] = timeRange;
    const timeSpan = endTime >= startTime
      ? endTime - startTime
      : (24 - startTime) + endTime; // 日をまたぐ場合

    // MediaRecorder の設定
    const stream = this.canvas.captureStream(0); // 手動フレームキャプチャ
    const mimeType = this.detectSupportedMimeType();

    return new Promise<Blob>((resolve, reject) => {
      try {
        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 5_000_000, // 5Mbps
        });
      } catch (e) {
        this.isRecording = false;
        reject(new Error(`MediaRecorder の初期化に失敗しました: ${e}`));
        return;
      }

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        if (this.isCancelled) {
          reject(new Error('レコーディングがキャンセルされました'));
          return;
        }
        const blob = new Blob(this.chunks, { type: mimeType });
        this.chunks = [];
        resolve(blob);
      };

      this.mediaRecorder.onerror = () => {
        this.isRecording = false;
        reject(new Error('MediaRecorder でエラーが発生しました'));
      };

      this.mediaRecorder.start();
      this.captureFrames(totalFrames, startTime, timeSpan, stream).catch(reject);
    });
  }

  /**
   * レコーディング中止
   */
  stop(): void {
    this.isCancelled = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * フレームを1枚ずつキャプチャする内部処理
   */
  private async captureFrames(
    totalFrames: number,
    startTime: number,
    timeSpan: number,
    stream: MediaStream,
  ): Promise<void> {
    const { fps } = this.options;
    const frameInterval = 1000 / fps;

    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.isCancelled) return;

      // 現在の時刻を計算
      const progress = frame / (totalFrames - 1 || 1);
      const currentTime = (startTime + progress * timeSpan) % 24;

      // 時刻を更新してレンダリングを待つ
      this.onTimeUpdate(currentTime);

      // レンダリング完了を待つ（次のアニメーションフレームまで）
      await this.waitForRender();

      // フレームをキャプチャ
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'requestFrame' in videoTrack) {
        // @ts-expect-error requestFrame は CanvasCaptureMediaStreamTrack の非標準API
        videoTrack.requestFrame();
      }

      // 進捗通知
      if (this.onProgress) {
        this.onProgress(progress, currentTime);
      }

      // フレーム間隔を待つ（レートに基づく最小待ち時間）
      await this.wait(frameInterval);
    }

    // 全フレームキャプチャ完了、レコーダー停止
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * 次のアニメーションフレームを待つ
   */
  private waitForRender(): Promise<void> {
    return new Promise((resolve) => {
      this.animationFrameId = requestAnimationFrame(() => {
        this.animationFrameId = null;
        resolve();
      });
    });
  }

  /**
   * 指定ミリ秒待つ
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * ブラウザがサポートする動画 MIME タイプを検出
   */
  private detectSupportedMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    // フォールバック
    return 'video/webm';
  }
}

/**
 * タイムラプスレコーダーのファクトリ関数
 *
 * @param canvas - キャプチャ対象のキャンバス要素
 * @param onTimeUpdate - 時刻更新コールバック（ストアの timeOfDay を変更）
 * @param options - レコーダーオプション
 * @returns TimelapseRecorder インスタンス
 */
export function createTimelapseRecorder(
  canvas: HTMLCanvasElement,
  onTimeUpdate: TimeUpdateCallback,
  options: Partial<TimelapseOptions> = {},
): TimelapseRecorder {
  const defaultOptions: TimelapseOptions = {
    fps: 30,
    duration: 10,
    timeRange: [6, 22], // 朝6時〜夜10時
  };

  const merged: TimelapseOptions = {
    fps: options.fps ?? defaultOptions.fps,
    duration: options.duration ?? defaultOptions.duration,
    timeRange: options.timeRange ?? defaultOptions.timeRange,
  };

  return new TimelapseRecorder(canvas, onTimeUpdate, merged);
}
