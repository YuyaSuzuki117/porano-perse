'use client';

import { useCallback, useState, type RefObject } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}

async function saveBlobToDevice(blob: Blob, filename: string): Promise<void> {
  // Try Web Share API first (best for mobile)
  if (isMobile() && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      // User cancelled or share failed - fall through to other methods
      if ((e as DOMException).name === 'AbortError') return;
    }
  }

  // Desktop: standard download link
  const url = URL.createObjectURL(blob);
  try {
    if (isMobile()) {
      // Mobile fallback: open in new tab for long-press save
      window.open(url, '_blank');
      // Keep URL alive a bit for the new tab
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else {
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    URL.revokeObjectURL(url);
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/**
 * スクリーンショット撮影ロジックを管理するカスタムフック。
 * 通常撮影と高解像度撮影の両方をサポート。
 * モバイルではWeb Share APIまたは新しいタブで保存。
 */
export function useScreenshot(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const enableWatermark = useEditorStore((s) => s.enableWatermark);
  const [isRendering, setIsRendering] = useState(false);

  /** ウォーターマークを描画 */
  const applyWatermark = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#000000';
    const fontSize = Math.max(14, Math.min(width, height) * 0.03);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Porano Plaza', width - fontSize * 0.8, height - fontSize * 0.5);
    ctx.restore();
  }, []);

  const takeScreenshot = useCallback(async (scale: number = 1) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const filename = `porano-perse-${Date.now()}.png`;

    try {
      if (scale <= 1 && !enableWatermark) {
        const blob = await canvasToBlob(canvas);
        await saveBlobToDevice(blob, filename);
      } else {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width * Math.max(scale, 1);
        offscreen.height = canvas.height * Math.max(scale, 1);
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
        if (enableWatermark) {
          applyWatermark(ctx, offscreen.width, offscreen.height);
        }
        const blob = await canvasToBlob(offscreen);
        await saveBlobToDevice(blob, filename);
      }
    } catch (e) {
      console.error('[Screenshot] Failed:', e);
    }
  }, [canvasRef, enableWatermark, applyWatermark]);

  /** 高解像度キャプチャ（R3Fレンダラーのピクセル比を一時的に上げる） */
  const takeHiResScreenshot = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsRendering(true);

    const canvas = canvasRef.current;
    const mobile = isMobile();
    const filename = `porano-perse-${mobile ? 'HD' : '4K'}-${Date.now()}.png`;

    try {
      const gl = (canvas as HTMLCanvasElement & { __r3f?: { store?: { getState: () => { gl: { setPixelRatio: (r: number) => void; render: (scene: unknown, camera: unknown) => void; getPixelRatio: () => number; domElement: HTMLCanvasElement }; scene: unknown; camera: unknown } } } }).__r3f?.store?.getState();

      if (gl) {
        const renderer = gl.gl;
        const origRatio = renderer.getPixelRatio();
        // Mobile: 2x max to avoid memory crash. Desktop: 4x
        const hiResRatio = mobile ? Math.min(origRatio * 2, 2) : Math.max(origRatio * 3, 4);

        renderer.setPixelRatio(hiResRatio);
        renderer.render(gl.scene as Parameters<typeof renderer.render>[0], gl.camera as Parameters<typeof renderer.render>[1]);

        await new Promise(resolve => setTimeout(resolve, 100));

        const srcCanvas = renderer.domElement;
        let finalCanvas = srcCanvas;

        if (enableWatermark) {
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

        const blob = await canvasToBlob(finalCanvas);
        await saveBlobToDevice(blob, filename);

        // Restore original
        renderer.setPixelRatio(origRatio);
        renderer.render(gl.scene as Parameters<typeof renderer.render>[0], gl.camera as Parameters<typeof renderer.render>[1]);
      } else {
        // Fallback: scale capture (2x on mobile, 3x on desktop)
        await takeScreenshot(mobile ? 2 : 3);
      }
    } catch (e) {
      console.error('[HiRes Screenshot] Failed:', e);
    } finally {
      setIsRendering(false);
    }
  }, [canvasRef, enableWatermark, applyWatermark, takeScreenshot]);

  return { takeScreenshot, takeHiResScreenshot, isRendering };
}
