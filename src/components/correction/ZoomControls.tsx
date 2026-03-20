'use client';

import React, { useCallback } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { parseScale, mmToCanvas } from '@/lib/blueprint-geometry';

/**
 * ズームコントロール（画面右下に配置）
 * マウスホイール操作を知らない事務員向けに +/- ボタンを提供
 */
export default function ZoomControls() {
  const zoom = useCorrectionStore((s) => s.zoom);
  const setZoom = useCorrectionStore((s) => s.setZoom);
  const setPan = useCorrectionStore((s) => s.setPan);
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const pdfInfo = useCorrectionStore((s) => s.pdfInfo);

  // ズームイン（25%刻み）
  const handleZoomIn = useCallback(() => {
    const next = Math.min(5, Math.round((zoom + 0.25) * 100) / 100);
    setZoom(next);
  }, [zoom, setZoom]);

  // ズームアウト（25%刻み）
  const handleZoomOut = useCallback(() => {
    const next = Math.max(0.1, Math.round((zoom - 0.25) * 100) / 100);
    setZoom(next);
  }, [zoom, setZoom]);

  // 全体表示（CorrectionToolbarのhandleFitAllと同じロジック）
  const handleFitAll = useCallback(() => {
    if (!blueprint) return;
    const containerEl = document.querySelector('[data-correction-canvas]');
    const cw = containerEl?.clientWidth ?? 800;
    const ch = containerEl?.clientHeight ?? 600;

    const effectiveDpi = pdfInfo?.dpi ?? 150;
    const scale = parseScale(blueprint.scale_detected);
    const effectivePageHeightPx =
      pdfInfo?.pageHeightPx ?? (blueprint.room.depth_mm / scale) * effectiveDpi / 25.4;

    let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
    for (const room of blueprint.rooms) {
      for (const pt of room.polygon_mm) {
        const { cx, cy } = mmToCanvas(pt[0], pt[1], scale, effectiveDpi, effectivePageHeightPx, 1, 0, 0);
        minCx = Math.min(minCx, cx);
        minCy = Math.min(minCy, cy);
        maxCx = Math.max(maxCx, cx);
        maxCy = Math.max(maxCy, cy);
      }
    }
    if (!isFinite(minCx)) return;

    const bboxW = maxCx - minCx;
    const bboxH = maxCy - minCy;
    const padding = 60;
    const fitZoom = Math.min(
      (cw - padding * 2) / Math.max(bboxW, 1),
      (ch - padding * 2) / Math.max(bboxH, 1),
      3
    );
    const centerBboxX = (minCx + maxCx) / 2;
    const centerBboxY = (minCy + maxCy) / 2;
    setZoom(fitZoom);
    setPan(cw / 2 - centerBboxX * fitZoom, ch / 2 - centerBboxY * fitZoom);
  }, [blueprint, pdfInfo, setZoom, setPan]);

  return (
    <div
      className="absolute bottom-4 right-4 flex flex-col items-center gap-1 z-50"
      style={{ pointerEvents: 'auto' }}
    >
      {/* ズームイン */}
      <button
        onClick={handleZoomIn}
        className="flex items-center justify-center w-9 h-9 rounded bg-[#0d1b2a]/90 border border-[#1e3a5f] text-[#8ba4c4] hover:bg-[#16213e] hover:text-[#b0c8e8] active:bg-[#1e3a5f] transition-all shadow-lg"
        title="ズームイン"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* ズームレベル表示 */}
      <div
        className="flex items-center justify-center w-14 h-7 rounded bg-[#0d1b2a]/90 border border-[#1e3a5f] text-[11px] text-[#6b8ab5] font-mono tabular-nums select-none shadow-lg"
        title="現在のズームレベル"
      >
        {Math.round(zoom * 100)}%
      </div>

      {/* ズームアウト */}
      <button
        onClick={handleZoomOut}
        className="flex items-center justify-center w-9 h-9 rounded bg-[#0d1b2a]/90 border border-[#1e3a5f] text-[#8ba4c4] hover:bg-[#16213e] hover:text-[#b0c8e8] active:bg-[#1e3a5f] transition-all shadow-lg"
        title="ズームアウト"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* セパレータ */}
      <div className="w-6 h-px bg-[#1e3a5f] my-0.5" />

      {/* フィット（全体表示）ボタン */}
      <button
        onClick={handleFitAll}
        className="flex items-center justify-center w-9 h-9 rounded bg-[#0d1b2a]/90 border border-[#1e3a5f] text-[#8ba4c4] hover:bg-[#16213e] hover:text-[#b0c8e8] active:bg-[#1e3a5f] transition-all shadow-lg"
        title="全体表示 (Ctrl+0)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
    </div>
  );
}
