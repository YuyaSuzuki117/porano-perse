'use client';

import { useCallback, useState, type RefObject } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';

/**
 * スクリーンショット撮影ロジックを管理するカスタムフック。
 * 通常撮影と高解像度(4K)撮影の両方をサポート。
 * ウォーターマーク設定にも対応。
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

  const takeScreenshot = useCallback((scale: number = 1) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    if (scale <= 1) {
      if (enableWatermark) {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, 0);
          applyWatermark(ctx, offscreen.width, offscreen.height);
          const link = document.createElement('a');
          link.download = `porano-perse-${Date.now()}.png`;
          link.href = offscreen.toDataURL('image/png');
          link.click();
        }
      } else {
        const link = document.createElement('a');
        link.download = `porano-perse-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    } else {
      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width * scale;
      offscreen.height = canvas.height * scale;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
        if (enableWatermark) {
          applyWatermark(ctx, offscreen.width, offscreen.height);
        }
        const link = document.createElement('a');
        link.download = `porano-perse-${Date.now()}.png`;
        link.href = offscreen.toDataURL('image/png');
        link.click();
      }
    }
  }, [canvasRef, enableWatermark, applyWatermark]);

  /** 高解像度キャプチャ（R3Fレンダラーのピクセル比を一時的に上げる） */
  const takeHiResScreenshot = useCallback(async () => {
    if (!canvasRef.current) return;
    setIsRendering(true);

    // R3Fのinternalstoreにアクセスしてrendererを取得
    const canvas = canvasRef.current;
    const gl = (canvas as HTMLCanvasElement & { __r3f?: { store?: { getState: () => { gl: { setPixelRatio: (r: number) => void; render: (scene: unknown, camera: unknown) => void; getPixelRatio: () => number; domElement: HTMLCanvasElement } ; scene: unknown; camera: unknown } } } }).__r3f?.store?.getState();

    if (gl) {
      const renderer = gl.gl;
      const origRatio = renderer.getPixelRatio();
      const hiResRatio = Math.max(origRatio * 3, 4);

      // ピクセル比を上げて1フレームレンダリング
      renderer.setPixelRatio(hiResRatio);
      renderer.render(gl.scene as Parameters<typeof renderer.render>[0], gl.camera as Parameters<typeof renderer.render>[1]);

      // キャプチャ
      await new Promise(resolve => setTimeout(resolve, 100));
      const dataUrl = renderer.domElement.toDataURL('image/png');

      // ウォーターマーク追加（必要な場合）
      if (enableWatermark) {
        const img = new Image();
        img.onload = () => {
          const offscreen = document.createElement('canvas');
          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            applyWatermark(ctx, offscreen.width, offscreen.height);
            const link = document.createElement('a');
            link.download = `porano-perse-4K-${Date.now()}.png`;
            link.href = offscreen.toDataURL('image/png');
            link.click();
          }
          renderer.setPixelRatio(origRatio);
          renderer.render(gl.scene as Parameters<typeof renderer.render>[0], gl.camera as Parameters<typeof renderer.render>[1]);
          setIsRendering(false);
        };
        img.src = dataUrl;
      } else {
        const link = document.createElement('a');
        link.download = `porano-perse-4K-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();

        // 元に戻す
        renderer.setPixelRatio(origRatio);
        renderer.render(gl.scene as Parameters<typeof renderer.render>[0], gl.camera as Parameters<typeof renderer.render>[1]);
        setIsRendering(false);
      }
    } else {
      // fallback: 通常の3xスケールキャプチャ
      takeScreenshot(3);
      setIsRendering(false);
    }
  }, [canvasRef, enableWatermark, applyWatermark, takeScreenshot]);

  return { takeScreenshot, takeHiResScreenshot, isRendering };
}
