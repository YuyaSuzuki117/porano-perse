'use client';

import { useCallback, useState, type RefObject } from 'react';
import { useProjectStore } from '@/stores/useProjectStore';
import { useCameraStore } from '@/stores/useCameraStore';
import { showToast } from '@/components/ui/Toast';

// ── Types ──

export type ScreenshotFormat = 'png' | 'jpeg';
export type ResolutionPreset = '1x' | '2x' | '4x';

export interface ScreenshotOptions {
  /** 解像度プリセット (default: '2x') */
  resolution?: ResolutionPreset;
  /** 画像フォーマット (default: 'png') */
  format?: ScreenshotFormat;
  /** JPEG品質 0-1 (default: 0.95) */
  jpegQuality?: number;
  /** 背景を透過にする (PNG only, default: false) */
  transparentBackground?: boolean;
}

// ── Resolution mapping ──
const RESOLUTION_SCALE: Record<ResolutionPreset, number> = {
  '1x': 1,
  '2x': 2,
  '4x': 4,
};

// ── Helpers ──

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}

async function saveBlobToDevice(blob: Blob, filename: string): Promise<void> {
  if (isMobile() && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch {
    URL.revokeObjectURL(url);
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ScreenshotFormat = 'png',
  quality: number = 0.95
): Promise<Blob> {
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      mimeType,
      format === 'jpeg' ? quality : undefined
    );
  });
}

/** R3Fの内部ストアからrenderer/scene/cameraを取得するヘルパー */
function getR3FState(canvas: HTMLCanvasElement) {
  type R3FStore = {
    store?: {
      getState: () => {
        gl: {
          setPixelRatio: (r: number) => void;
          render: (scene: unknown, camera: unknown) => void;
          getPixelRatio: () => number;
          domElement: HTMLCanvasElement;
          setClearColor: (color: number, alpha: number) => void;
          getClearColor: (target: { r: number; g: number; b: number }) => { r: number; g: number; b: number };
          getClearAlpha: () => number;
        };
        scene: unknown;
        camera: unknown;
      };
    };
  };
  return (canvas as HTMLCanvasElement & { __r3f?: R3FStore }).__r3f?.store?.getState() ?? null;
}

// ── ZIP utility (lightweight, no dependency) ──

/** CRC32テーブル */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** 最小限のZIPファイルを生成（非圧縮 STORE method） */
function createZipBlob(files: { name: string; data: Uint8Array }[]): Blob {
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);

    // Local file header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(8, 0, true); // compression: STORE
    lv.setUint32(14, crc, true);
    lv.setUint32(18, file.data.length, true); // compressed size
    lv.setUint32(22, file.data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, file.data);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdEntry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(12, 0, true); // compression: STORE
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // local header offset
    cdEntry.set(nameBytes, 46);

    centralDir.push(cdEntry);
    offset += localHeader.length + file.data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const entry of centralDir) {
    parts.push(entry);
    cdSize += entry.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  parts.push(eocd);

  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}

// ── バッチエクスポート用カメラプリセット ──

const BATCH_PRESETS = [
  { id: 'diorama', label: 'ジオラマ' },
  { id: 'perspective', label: 'パース' },
  { id: 'top', label: '上面' },
  { id: 'front', label: '正面' },
  { id: 'side', label: '側面' },
] as const;

// ── Hook ──

/**
 * スクリーンショット撮影ロジックを管理するカスタムフック。
 * 解像度選択(1x/2x/4x)、透過背景、JPEG品質、ウォーターマーク制御、バッチエクスポートをサポート。
 */
export function useScreenshot(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const enableWatermark = useProjectStore((s) => s.enableWatermark);
  const watermarkPosition = useProjectStore((s) => s.watermarkPosition);
  const watermarkOpacity = useProjectStore((s) => s.watermarkOpacity);
  const watermarkFontScale = useProjectStore((s) => s.watermarkFontScale);
  const [isRendering, setIsRendering] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  /** ウォーターマークを描画（位置・透明度・フォントサイズ制御付き） */
  const applyWatermark = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (watermarkPosition === 'none') return;

    ctx.save();
    ctx.globalAlpha = watermarkOpacity;
    ctx.fillStyle = '#000000';
    const baseFontSize = Math.max(14, Math.min(width, height) * 0.03);
    const fontSize = baseFontSize * watermarkFontScale;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'bottom';

    if (watermarkPosition === 'bottom-right') {
      ctx.textAlign = 'right';
      ctx.fillText('Porano Plaza', width - fontSize * 0.8, height - fontSize * 0.5);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText('Porano Plaza', fontSize * 0.8, height - fontSize * 0.5);
    }

    ctx.restore();
  }, [watermarkPosition, watermarkOpacity, watermarkFontScale]);

  /** 単発スクリーンショット（オプション対応） */
  const takeScreenshot = useCallback(async (scaleOrOptions: number | ScreenshotOptions = {}) => {
    if (!canvasRef.current) {
      showToast('3Dキャンバスが見つかりません。3Dビューを表示してから撮影してください', 'error');
      return;
    }

    const opts: ScreenshotOptions = typeof scaleOrOptions === 'number'
      ? { resolution: scaleOrOptions <= 1 ? '1x' : scaleOrOptions <= 2 ? '2x' : '4x' }
      : scaleOrOptions;

    const {
      resolution = '2x',
      format = 'png',
      jpegQuality = 0.95,
      transparentBackground = false,
    } = opts;

    const canvas = canvasRef.current;
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const filename = `porano-perse-${resolution}-${Date.now()}.${ext}`;
    const scale = RESOLUTION_SCALE[resolution];

    // devicePixelRatio考慮: 最低でもdevicePixelRatioを確保
    const effectiveScale = Math.max(scale, window.devicePixelRatio || 1);

    try {
      const gl = getR3FState(canvas);

      if (gl) {
        const renderer = gl.gl;
        const origRatio = renderer.getPixelRatio();
        const origAlpha = renderer.getClearAlpha();

        // 透過背景対応
        if (transparentBackground && format === 'png') {
          renderer.setClearColor(0x000000, 0);
        }

        renderer.setPixelRatio(effectiveScale);
        renderer.render(
          gl.scene as Parameters<typeof renderer.render>[0],
          gl.camera as Parameters<typeof renderer.render>[1]
        );

        await new Promise<void>(r => requestAnimationFrame(() => r()));

        const srcCanvas = renderer.domElement;
        let finalCanvas = srcCanvas;

        if (enableWatermark && watermarkPosition !== 'none') {
          const offscreen = document.createElement('canvas');
          offscreen.width = srcCanvas.width;
          offscreen.height = srcCanvas.height;
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.drawImage(srcCanvas, 0, 0);
            applyWatermark(ctx, offscreen.width, offscreen.height);
            finalCanvas = offscreen;
          }
        }

        const blob = await canvasToBlob(finalCanvas, format, jpegQuality);
        await saveBlobToDevice(blob, filename);

        // Restore original state
        renderer.setPixelRatio(origRatio);
        if (transparentBackground) {
          renderer.setClearColor(0x000000, origAlpha);
        }
        renderer.render(
          gl.scene as Parameters<typeof renderer.render>[0],
          gl.camera as Parameters<typeof renderer.render>[1]
        );
      } else {
        // Fallback: offscreen canvas拡大
        await new Promise<void>(r => requestAnimationFrame(() => r()));
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width * effectiveScale;
        offscreen.height = canvas.height * effectiveScale;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
        if (enableWatermark && watermarkPosition !== 'none') {
          applyWatermark(ctx, offscreen.width, offscreen.height);
        }
        const blob = await canvasToBlob(offscreen, format, jpegQuality);
        await saveBlobToDevice(blob, filename);
      }

      showToast(`スクリーンショットを保存しました (${resolution})`, 'success');
    } catch (e) {
      console.error('[Screenshot] Failed:', e);
      showToast('スクリーンショットに失敗しました', 'error');
    }
  }, [canvasRef, enableWatermark, watermarkPosition, applyWatermark]);

  /** 高解像度キャプチャ（R3Fレンダラーのピクセル比を一時的に上げる） */
  const takeHiResScreenshot = useCallback(async () => {
    if (!canvasRef.current) {
      showToast('3Dキャンバスが見つかりません。3Dビューを表示してから撮影してください', 'error');
      return;
    }
    setIsRendering(true);

    const mobile = isMobile();
    try {
      await takeScreenshot({
        resolution: mobile ? '2x' : '4x',
        format: 'png',
        transparentBackground: false,
      });
    } finally {
      setIsRendering(false);
    }
  }, [canvasRef, takeScreenshot]);

  /** バッチエクスポート: 全カメラプリセットを一括撮影してZIPダウンロード */
  const takeBatchScreenshots = useCallback(async (options?: ScreenshotOptions) => {
    if (!canvasRef.current) {
      showToast('3Dキャンバスが見つかりません', 'error');
      return;
    }

    const canvas = canvasRef.current;
    const gl = getR3FState(canvas);
    if (!gl) {
      showToast('3Dレンダラーが取得できません', 'error');
      return;
    }

    const {
      resolution = '2x',
      format = 'png',
      jpegQuality = 0.95,
      transparentBackground = false,
    } = options ?? {};

    const scale = RESOLUTION_SCALE[resolution];
    const effectiveScale = Math.max(scale, window.devicePixelRatio || 1);
    const ext = format === 'jpeg' ? 'jpg' : 'png';

    setIsRendering(true);
    setBatchProgress({ current: 0, total: BATCH_PRESETS.length });

    const files: { name: string; data: Uint8Array }[] = [];
    const renderer = gl.gl;
    const origRatio = renderer.getPixelRatio();
    const origAlpha = renderer.getClearAlpha();
    const { setCameraPreset } = useCameraStore.getState();

    try {
      for (let i = 0; i < BATCH_PRESETS.length; i++) {
        const preset = BATCH_PRESETS[i];
        setBatchProgress({ current: i + 1, total: BATCH_PRESETS.length });

        // カメラプリセットを適用
        setCameraPreset(preset.id);

        // カメラアニメーション完了を待つ（十分なフレーム数）
        for (let f = 0; f < 30; f++) {
          await new Promise<void>(r => requestAnimationFrame(() => r()));
        }

        // 透過背景対応
        if (transparentBackground && format === 'png') {
          renderer.setClearColor(0x000000, 0);
        }

        renderer.setPixelRatio(effectiveScale);
        renderer.render(
          gl.scene as Parameters<typeof renderer.render>[0],
          gl.camera as Parameters<typeof renderer.render>[1]
        );

        await new Promise<void>(r => requestAnimationFrame(() => r()));

        const srcCanvas = renderer.domElement;
        let finalCanvas = srcCanvas;

        if (enableWatermark && watermarkPosition !== 'none') {
          const offscreen = document.createElement('canvas');
          offscreen.width = srcCanvas.width;
          offscreen.height = srcCanvas.height;
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.drawImage(srcCanvas, 0, 0);
            applyWatermark(ctx, offscreen.width, offscreen.height);
            finalCanvas = offscreen;
          }
        }

        const blob = await canvasToBlob(finalCanvas, format, jpegQuality);
        const arrayBuffer = await blob.arrayBuffer();
        files.push({
          name: `${String(i + 1).padStart(2, '0')}_${preset.label}_${preset.id}.${ext}`,
          data: new Uint8Array(arrayBuffer),
        });

        // Restore between shots
        renderer.setPixelRatio(origRatio);
        if (transparentBackground) {
          renderer.setClearColor(0x000000, origAlpha);
        }
      }

      // ZIP生成 & ダウンロード
      const zipBlob = createZipBlob(files);
      await saveBlobToDevice(zipBlob, `porano-perse-batch-${Date.now()}.zip`);
      showToast(`${files.length}枚のスクリーンショットをZIPで保存しました`, 'success');
    } catch (e) {
      console.error('[Batch Screenshot] Failed:', e);
      showToast('バッチエクスポートに失敗しました', 'error');
    } finally {
      // 元の状態に復元
      renderer.setPixelRatio(origRatio);
      renderer.setClearColor(0x000000, origAlpha);
      renderer.render(
        gl.scene as Parameters<typeof renderer.render>[0],
        gl.camera as Parameters<typeof renderer.render>[1]
      );
      setIsRendering(false);
      setBatchProgress(null);
    }
  }, [canvasRef, enableWatermark, watermarkPosition, applyWatermark]);

  return {
    takeScreenshot,
    takeHiResScreenshot,
    takeBatchScreenshots,
    isRendering,
    batchProgress,
  };
}
