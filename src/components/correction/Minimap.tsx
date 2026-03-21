'use client';
import { useRef, useEffect, useCallback } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { parseScale, mmToCanvas } from '@/lib/blueprint-geometry';

/**
 * Minimap: 右下に表示する全体俯瞰図
 * 現在の表示範囲をハイライト、クリックでジャンプ
 */
export default function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const pdfInfo = useCorrectionStore((s) => s.pdfInfo);
  const zoom = useCorrectionStore((s) => s.zoom);
  const panX = useCorrectionStore((s) => s.panX);
  const panY = useCorrectionStore((s) => s.panY);
  const setPan = useCorrectionStore((s) => s.setPan);
  const selectedRoomIdx = useCorrectionStore((s) => s.selectedRoomIdx);

  const SIZE = 180; // minimap size in px
  const PADDING = 8;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !blueprint) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = SIZE;
    canvas.height = SIZE;

    const scale = parseScale(blueprint.scale_detected);
    const dpi = pdfInfo?.dpi ?? 150;
    const pageHPx = pdfInfo?.pageHeightPx ?? 1000;
    const pageWPx = pdfInfo?.pageWidthPx ?? 1400;

    // Calculate bounds of all rooms in image pixel space
    const minX = 0, minY = 0;
    const maxX = pageWPx, maxY = pageHPx;

    // Map ratio: image pixels -> minimap pixels
    const mapZoom = Math.min(
      (SIZE - PADDING * 2) / (maxX - minX),
      (SIZE - PADDING * 2) / (maxY - minY)
    );
    const offsetX = PADDING + ((SIZE - PADDING * 2) - (maxX - minX) * mapZoom) / 2;
    const offsetY = PADDING + ((SIZE - PADDING * 2) - (maxY - minY) * mapZoom) / 2;

    const toMinimap = (imgX: number, imgY: number) => ({
      mx: (imgX - minX) * mapZoom + offsetX,
      my: (imgY - minY) * mapZoom + offsetY,
    });

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // PDF page outline
    const tl = toMinimap(0, 0);
    const br = toMinimap(pageWPx, pageHPx);
    ctx.fillStyle = '#16213e';
    ctx.fillRect(tl.mx, tl.my, br.mx - tl.mx, br.my - tl.my);
    ctx.strokeStyle = '#2a4a6a';
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.mx, tl.my, br.mx - tl.mx, br.my - tl.my);

    // Rooms
    for (let i = 0; i < blueprint.rooms.length; i++) {
      const room = blueprint.rooms[i];
      if (room.polygon_mm.length < 3) continue;

      ctx.beginPath();
      const pts = room.polygon_mm.map(([x, y]) => {
        const { cx, cy } = mmToCanvas(x, y, scale, dpi, pageHPx, 1, 0, 0);
        return toMinimap(cx, cy);
      });
      ctx.moveTo(pts[0].mx, pts[0].my);
      for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j].mx, pts[j].my);
      ctx.closePath();

      const isSelected = i === selectedRoomIdx;
      const isUnknown = !room.name || room.name === '不明';
      ctx.fillStyle = isSelected ? 'rgba(74,144,217,0.5)' : isUnknown ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.2)';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#4a90d9' : isUnknown ? '#ef4444' : '#22c55e';
      ctx.lineWidth = isSelected ? 2 : 0.5;
      ctx.stroke();
    }

    // Viewport indicator
    // The main canvas shows area from (-panX/zoom, -panY/zoom) to ((-panX + canvasW)/zoom, (-panY + canvasH)/zoom)
    const mainCanvas = document.querySelector('[data-correction-canvas]');
    const cw = mainCanvas?.clientWidth ?? 800;
    const ch = mainCanvas?.clientHeight ?? 600;

    const vpLeft = -panX / zoom;
    const vpTop = -panY / zoom;
    const vpRight = vpLeft + cw / zoom;
    const vpBottom = vpTop + ch / zoom;

    const vp1 = toMinimap(vpLeft, vpTop);
    const vp2 = toMinimap(vpRight, vpBottom);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(vp1.mx, vp1.my, vp2.mx - vp1.mx, vp2.my - vp1.my);
    ctx.setLineDash([]);

  }, [blueprint, pdfInfo, zoom, panX, panY, selectedRoomIdx, SIZE, PADDING]);

  // Click to navigate
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!blueprint || !pdfInfo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const pageWPx = pdfInfo.pageWidthPx;
    const pageHPx = pdfInfo.pageHeightPx;
    const mapZoom = Math.min(
      (SIZE - PADDING * 2) / pageWPx,
      (SIZE - PADDING * 2) / pageHPx
    );
    const offsetX = PADDING + ((SIZE - PADDING * 2) - pageWPx * mapZoom) / 2;
    const offsetY = PADDING + ((SIZE - PADDING * 2) - pageHPx * mapZoom) / 2;

    const imgX = (mx - offsetX) / mapZoom;
    const imgY = (my - offsetY) / mapZoom;

    const mainCanvas = document.querySelector('[data-correction-canvas]');
    const cw = mainCanvas?.clientWidth ?? 800;
    const ch = mainCanvas?.clientHeight ?? 600;

    setPan(cw / 2 - imgX * zoom, ch / 2 - imgY * zoom);
  }, [blueprint, pdfInfo, zoom, setPan, SIZE, PADDING]);

  if (!blueprint) return null;

  return (
    <div className="absolute bottom-14 right-3 rounded-lg border border-[#2a4a6a] bg-[#0d1117]/90 shadow-lg overflow-hidden"
         style={{ width: SIZE, height: SIZE }}>
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={handleClick}
        className="cursor-crosshair"
      />
    </div>
  );
}
