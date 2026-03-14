'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { FURNITURE_CATALOG } from '@/data/furniture';
import { FurnitureType, FurnitureItem } from '@/types/scene';
import {
  PAL, PalKey, SpriteData, SPRITE_SIZE,
  getSpriteForType,
} from './pixel-sprites';

// ─── Constants ─────────────────────────────────────────────────────────
const TILE_W_BASE = 64;        // isometric tile width at zoom=1
const GRID_SNAP_M = 0.25;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const SELECTION_COLORS = [PAL.golden, PAL.softOrange];

// ─── Animation constants ────────────────────────────────────────────────
const PLACE_ANIM_DURATION = 8;  // frames
const DELETE_ANIM_DURATION = 5; // frames
const ANIM_FPS = 60;
const PLACE_ANIM_MS = (PLACE_ANIM_DURATION / ANIM_FPS) * 1000;
const DELETE_ANIM_MS = (DELETE_ANIM_DURATION / ANIM_FPS) * 1000;

interface AnimationState {
  startTime: number;
  type: 'place' | 'delete';
}

// ─── Isometric coordinate helpers ──────────────────────────────────────
function isoProject(wx: number, wy: number, tileW: number): { ix: number; iy: number } {
  const tileH = tileW / 2;
  return {
    ix: (wx - wy) * tileW / 2,
    iy: (wx + wy) * tileH / 2,
  };
}

function isoUnproject(ix: number, iy: number, tileW: number): { wx: number; wy: number } {
  const tileH = tileW / 2;
  return {
    wx: (ix / (tileW / 2) + iy / (tileH / 2)) / 2,
    wy: (iy / (tileH / 2) - ix / (tileW / 2)) / 2,
  };
}

// ─── Sprite Cache (offscreen canvas pre-rendering) ─────────────────────
const spriteCanvasCache = new Map<string, HTMLCanvasElement>();

function getCachedSprite(type: string, pixelSize: number, rotationSteps: number): HTMLCanvasElement {
  const key = `${type}_${pixelSize.toFixed(2)}_${rotationSteps}`;
  const cached = spriteCanvasCache.get(key);
  if (cached) return cached;

  const size = SPRITE_SIZE;
  const canvasSize = Math.ceil(size * pixelSize);
  const offscreen = document.createElement('canvas');
  offscreen.width = canvasSize;
  offscreen.height = canvasSize;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return offscreen;

  const sprite = getSpriteForType(type);
  const steps = ((rotationSteps % 4) + 4) % 4;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let srcRow = row;
      let srcCol = col;
      if (steps === 1) { srcRow = col; srcCol = size - 1 - row; }
      else if (steps === 2) { srcRow = size - 1 - row; srcCol = size - 1 - col; }
      else if (steps === 3) { srcRow = size - 1 - col; srcCol = row; }

      const palKey = sprite[srcRow]?.[srcCol];
      if (!palKey) continue;
      ctx.fillStyle = PAL[palKey as PalKey] || '#ff00ff';
      ctx.fillRect(
        col * pixelSize,
        row * pixelSize,
        pixelSize + 0.5,
        pixelSize + 0.5,
      );
    }
  }

  spriteCanvasCache.set(key, offscreen);
  // Limit cache size
  if (spriteCanvasCache.size > 200) {
    const firstKey = spriteCanvasCache.keys().next().value;
    if (firstKey) spriteCanvasCache.delete(firstKey);
  }

  return offscreen;
}

// ─── Context menu / Catalog popup ──────────────────────────────────────
interface ContextMenuState {
  x: number;
  y: number;
  furnitureId: string | null;
}

interface CatalogPopupState {
  x: number;
  y: number;
  worldX: number;
  worldZ: number;
}

type PixelTool = 'select' | 'move' | 'rotate' | 'delete' | 'crt';

// ─── Mini sprite thumbnail (no caching needed, small) ──────────────────
function drawMiniSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  x: number,
  y: number,
  totalSize: number,
) {
  const px = totalSize / SPRITE_SIZE;
  for (let row = 0; row < SPRITE_SIZE; row++) {
    for (let col = 0; col < SPRITE_SIZE; col++) {
      const palKey = sprite[row]?.[col];
      if (!palKey) continue;
      ctx.fillStyle = PAL[palKey as PalKey] || '#ff00ff';
      ctx.fillRect(x + col * px, y + row * px, Math.ceil(px), Math.ceil(px));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════
export default function PixelRoomEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const needsRedrawRef = useRef(true);
  const rafIdRef = useRef<number>(0);

  const walls = useEditorStore((s) => s.walls);
  const furniture = useEditorStore((s) => s.furniture);
  const openings = useEditorStore((s) => s.openings);
  const selectedFurnitureId = useEditorStore((s) => s.selectedFurnitureId);
  const setSelectedFurniture = useEditorStore((s) => s.setSelectedFurniture);
  const moveFurniture = useEditorStore((s) => s.moveFurniture);
  const rotateFurniture = useEditorStore((s) => s.rotateFurniture);
  const deleteFurniture = useEditorStore((s) => s.deleteFurniture);
  const duplicateFurniture = useEditorStore((s) => s.duplicateFurniture);
  const addFurniture = useEditorStore((s) => s.addFurniture);

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<PixelTool>('select');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [catalogPopup, setCatalogPopup] = useState<CatalogPopupState | null>(null);
  const [crtEnabled, setCrtEnabled] = useState(false);
  const [blinkPhase, setBlinkPhase] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [dragging, setDragging] = useState<{ id: string; startWorld: { x: number; z: number }; startPos: [number, number, number] } | null>(null);
  const [hoveredFurnitureId, setHoveredFurnitureId] = useState<string | null>(null);
  const animationsRef = useRef<Map<string, AnimationState>>(new Map());
  const pendingDeleteRef = useRef<Set<string>>(new Set());
  const selectionBounceRef = useRef(0);

  useEffect(() => {
    if (!selectedFurnitureId) return;
    const interval = setInterval(() => {
      setBlinkPhase((p) => (p + 1) % 2);
      needsRedrawRef.current = true;
    }, 400);
    return () => clearInterval(interval);
  }, [selectedFurnitureId]);

  // ── Selection bounce animation ──
  useEffect(() => {
    if (!selectedFurnitureId) return;
    let running = true;
    const bounceLoop = () => {
      if (!running) return;
      selectionBounceRef.current = (selectionBounceRef.current + 0.08) % (Math.PI * 2);
      needsRedrawRef.current = true;
      requestAnimationFrame(bounceLoop);
    };
    requestAnimationFrame(bounceLoop);
    return () => { running = false; };
  }, [selectedFurnitureId]);

  const roomBounds = useMemo(() => {
    if (walls.length === 0) return { minX: -3, maxX: 3, minY: -3, maxY: 3 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minY = Math.min(minY, w.start.y, w.end.y);
      maxY = Math.max(maxY, w.start.y, w.end.y);
    }
    const pad = 1;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [walls]);

  const roomArea = useMemo(() => {
    if (walls.length < 3) return 0;
    const pts: { x: number; y: number }[] = [];
    for (const w of walls) pts.push(w.start);
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y;
      area -= pts[j].x * pts[i].y;
    }
    return Math.abs(area) / 2;
  }, [walls]);

  // ── Isometric world <-> screen ──
  const tileW = TILE_W_BASE * zoom;

  const worldToScreen = useCallback(
    (wx: number, wy: number, canvasWidth: number, canvasHeight: number) => {
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const roomCX = (roomBounds.minX + roomBounds.maxX) / 2;
      const roomCY = (roomBounds.minY + roomBounds.maxY) / 2;
      const relX = wx - roomCX;
      const relY = wy - roomCY;
      const iso = isoProject(relX, relY, tileW);
      return {
        sx: cx + iso.ix + panOffset.x,
        sy: cy + iso.iy + panOffset.y,
      };
    },
    [tileW, panOffset, roomBounds],
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number, canvasWidth: number, canvasHeight: number) => {
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const roomCX = (roomBounds.minX + roomBounds.maxX) / 2;
      const roomCY = (roomBounds.minY + roomBounds.maxY) / 2;
      const isoX = sx - cx - panOffset.x;
      const isoY = sy - cy - panOffset.y;
      const world = isoUnproject(isoX, isoY, tileW);
      return {
        wx: world.wx + roomCX,
        wy: world.wy + roomCY,
      };
    },
    [tileW, panOffset, roomBounds],
  );

  const snapToGrid = (v: number) => Math.round(v / GRID_SNAP_M) * GRID_SNAP_M;

  // ── PNG Export (2x resolution) ──
  const handleExportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const exportScale = 2;
    const exportW = Math.round(rect.width * exportScale);
    const exportH = Math.round(rect.height * exportScale);

    const offscreen = document.createElement('canvas');
    offscreen.width = exportW;
    offscreen.height = exportH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    // Scale context for 2x resolution
    ctx.setTransform(exportScale, 0, 0, exportScale, 0, 0);
    const W = rect.width;
    const H = rect.height;

    // ── Redraw the full scene at export resolution ──
    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0d1b2a');
    bgGrad.addColorStop(0.5, '#1b2838');
    bgGrad.addColorStop(1, '#162032');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Stars
    const starSeed = 42;
    for (let i = 0; i < 40; i++) {
      const sx2 = ((starSeed * (i + 1) * 7) % 1000) / 1000 * W;
      const sy2 = ((starSeed * (i + 1) * 13) % 1000) / 1000 * H * 0.5;
      const brightness = 0.1 + ((i * 37) % 100) / 300;
      ctx.fillStyle = `rgba(255,248,240,${brightness})`;
      ctx.fillRect(Math.floor(sx2), Math.floor(sy2), 1.5, 1.5);
    }

    // Vignette
    const vGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, W, H);

    // Now draw the main canvas content on top (reuse existing render)
    // We draw the existing canvas onto the export canvas at 2x
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Draw from the display canvas (which has DPR scaling already)
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, exportW, exportH);

    // Export
    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `porano-perse-pixel-${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, []);

  // ── Hit test (isometric) ──
  const hitTestFurniture = useCallback(
    (sx: number, sy: number, cw: number, ch: number): FurnitureItem | null => {
      const spriteScreenSize = SPRITE_SIZE * (zoom * 1.2);
      for (let i = furniture.length - 1; i >= 0; i--) {
        const f = furniture[i];
        const { sx: fx, sy: fy } = worldToScreen(f.position[0], f.position[2], cw, ch);
        const half = spriteScreenSize / 2;
        if (sx >= fx - half && sx <= fx + half && sy >= fy - half - 8 && sy <= fy + half) {
          return f;
        }
      }
      return null;
    },
    [furniture, zoom, worldToScreen],
  );

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      needsRedrawRef.current = true;
    }
  }, []);

  // ── Draw isometric diamond tile ──
  const drawDiamond = useCallback((
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    tw: number, th: number,
    fillColor: string,
    strokeColor?: string,
  ) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - th / 2);
    ctx.lineTo(cx + tw / 2, cy);
    ctx.lineTo(cx, cy + th / 2);
    ctx.lineTo(cx - tw / 2, cy);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }, []);

  // ── Main render ──
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width;
    const H = rect.height;

    // ── Background: deep indigo gradient (LoM night sky) ──
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0d1b2a');
    bgGrad.addColorStop(0.5, '#1b2838');
    bgGrad.addColorStop(1, '#162032');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle star-like dots
    const starSeed = 42;
    for (let i = 0; i < 40; i++) {
      const sx2 = ((starSeed * (i + 1) * 7) % 1000) / 1000 * W;
      const sy2 = ((starSeed * (i + 1) * 13) % 1000) / 1000 * H * 0.5;
      const brightness = 0.1 + ((i * 37) % 100) / 300;
      ctx.fillStyle = `rgba(255,248,240,${brightness})`;
      ctx.fillRect(Math.floor(sx2), Math.floor(sy2), 1.5, 1.5);
    }

    // Vignette
    const vGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, W, H);

    const currentTileW = tileW;
    const currentTileH = currentTileW / 2;
    const spritePixelSize = zoom * 1.2;

    // ── Find window positions for light effects ──
    const windowPositions: { wx: number; wy: number }[] = [];
    for (const op of openings) {
      if (op.type !== 'window') continue;
      const wall = walls.find(w => w.id === op.wallId);
      if (!wall) continue;
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      const nx = dx / len;
      const ny = dy / len;
      const midM = op.positionAlongWall + op.width / 2;
      windowPositions.push({
        wx: wall.start.x + nx * midM,
        wy: wall.start.y + ny * midM,
      });
    }

    // ── Draw floor tiles (isometric diamond grid) ──
    if (walls.length > 0) {
      ctx.save();
      if (walls.length >= 3) {
        ctx.beginPath();
        const p0 = worldToScreen(walls[0].start.x, walls[0].start.y, W, H);
        ctx.moveTo(p0.sx, p0.sy);
        for (const w of walls) {
          const p = worldToScreen(w.end.x, w.end.y, W, H);
          ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.clip();
      }

      const step = GRID_SNAP_M;
      const padTiles = 2;
      const minTX = Math.floor((roomBounds.minX - padTiles) / step) * step;
      const maxTX = Math.ceil((roomBounds.maxX + padTiles) / step) * step;
      const minTY = Math.floor((roomBounds.minY - padTiles) / step) * step;
      const maxTY = Math.ceil((roomBounds.maxY + padTiles) / step) * step;

      for (let ty = minTY; ty < maxTY; ty += step) {
        for (let tx = minTX; tx < maxTX; tx += step) {
          const center = worldToScreen(tx + step / 2, ty + step / 2, W, H);
          const tilePxW = step * currentTileW;
          const tilePxH = step * currentTileH;

          // Warm wood color with variation
          const hash = ((Math.floor(tx * 4) * 7 + Math.floor(ty * 4) * 13) & 0xFF);
          const colorIdx = hash % 5;
          const tileColors = ['#d4bc8a', '#cdb480', '#c8ae78', '#d0b888', '#c4a870'];
          const baseColor = tileColors[colorIdx];

          // Thin grout/joint line (shadow between tiles)
          drawDiamond(ctx, center.sx, center.sy, tilePxW + 0.5, tilePxH + 0.5, '#a08050');
          drawDiamond(ctx, center.sx, center.sy, tilePxW - 0.5, tilePxH - 0.5, baseColor);

          // Wood grain: 2-3 subtle lines per tile
          const grainCount = 2 + (hash % 2);
          for (let g = 0; g < grainCount; g++) {
            const grainOffset = (g + 1) / (grainCount + 1);
            const gx1 = center.sx - tilePxW * 0.35 + tilePxW * 0.7 * grainOffset;
            const gy1 = center.sy - tilePxH * 0.15;
            const gx2 = gx1 + tilePxW * 0.05;
            const gy2 = center.sy + tilePxH * 0.15;
            ctx.strokeStyle = (hash + g) % 3 === 0 ? '#dcc898' : '#b89860';
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = 0.4;
            ctx.beginPath();
            ctx.moveTo(gx1, gy1);
            ctx.lineTo(gx2, gy2);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          // Highlight on top-left edge (1px light line)
          ctx.save();
          ctx.globalAlpha = 0.2;
          ctx.strokeStyle = '#fff8f0';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(center.sx - tilePxW * 0.45, center.sy);
          ctx.lineTo(center.sx, center.sy - tilePxH * 0.45);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── Window light effect on floor ──
      for (const wp of windowPositions) {
        const { sx: wsx, sy: wsy } = worldToScreen(wp.wx, wp.wy, W, H);
        const lightRadius = currentTileW * 2;
        const lightGrad = ctx.createRadialGradient(wsx, wsy, 0, wsx, wsy, lightRadius);
        lightGrad.addColorStop(0, 'rgba(255,240,200,0.12)');
        lightGrad.addColorStop(0.5, 'rgba(255,230,180,0.06)');
        lightGrad.addColorStop(1, 'rgba(255,220,160,0)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(wsx - lightRadius, wsy - lightRadius, lightRadius * 2, lightRadius * 2);
      }

      ctx.restore();
    }

    // ── Draw walls (isometric 3D walls with height) ──
    const sortedWalls = [...walls].sort((a, b) => {
      const aY = Math.min(a.start.y, a.end.y);
      const bY = Math.min(b.start.y, b.end.y);
      return aY - bY;
    });

    const wallHeight = 0.8;
    const roomMidY = (roomBounds.minY + roomBounds.maxY) / 2;
    const roomMidX = (roomBounds.minX + roomBounds.maxX) / 2;

    for (const w of sortedWalls) {
      const p1 = worldToScreen(w.start.x, w.start.y, W, H);
      const p2 = worldToScreen(w.end.x, w.end.y, W, H);
      const wallUpPx = wallHeight * currentTileH;

      const midY = (w.start.y + w.end.y) / 2;
      const isBackWall = midY < roomMidY;
      const midX = (w.start.x + w.end.x) / 2;
      const isLeftWall = midX < roomMidX;

      const wallTopColor = w.color || '#e8d8c0';
      const wallFrontColor = isBackWall || isLeftWall ? '#c8b8a0' : '#a89878';

      // Check for openings on this wall
      const wallOpenings = openings.filter(op => op.wallId === w.id);
      const wallDx = w.end.x - w.start.x;
      const wallDy = w.end.y - w.start.y;
      const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
      const wallNx = wallLen > 0 ? wallDx / wallLen : 0;
      const wallNy = wallLen > 0 ? wallDy / wallLen : 0;

      // Draw wall front face
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p2.sx, p2.sy - wallUpPx);
      ctx.lineTo(p1.sx, p1.sy - wallUpPx);
      ctx.closePath();
      ctx.fillStyle = wallFrontColor;
      ctx.fill();
      ctx.strokeStyle = PAL.shadow1;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Stucco texture pattern (random dots for plaster feel)
      ctx.save();
      ctx.globalAlpha = 0.06;
      const stuccoSeed = Math.abs(Math.round(w.start.x * 100 + w.start.y * 73));
      for (let i = 0; i < 20; i++) {
        const px = p1.sx + ((stuccoSeed * (i + 1) * 17) % 1000) / 1000 * (p2.sx - p1.sx);
        const py = p1.sy - wallUpPx + ((stuccoSeed * (i + 1) * 23) % 1000) / 1000 * wallUpPx;
        ctx.fillStyle = i % 2 === 0 ? '#fff8f0' : '#8a7a60';
        ctx.fillRect(px, py, 1, 1);
      }
      ctx.restore();

      // Moulding line at top of wall
      ctx.save();
      ctx.strokeStyle = '#d8c8a8';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy - wallUpPx + 2);
      ctx.lineTo(p2.sx, p2.sy - wallUpPx + 2);
      ctx.stroke();
      ctx.strokeStyle = '#b8a888';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy - wallUpPx + 4);
      ctx.lineTo(p2.sx, p2.sy - wallUpPx + 4);
      ctx.stroke();
      ctx.restore();

      // Wall top face (parallelogram)
      const topDepth = currentTileH * 0.06;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy - wallUpPx);
      ctx.lineTo(p2.sx, p2.sy - wallUpPx);
      ctx.lineTo(p2.sx + topDepth, p2.sy - wallUpPx - topDepth);
      ctx.lineTo(p1.sx + topDepth, p1.sy - wallUpPx - topDepth);
      ctx.closePath();
      ctx.fillStyle = wallTopColor;
      ctx.fill();
      ctx.strokeStyle = PAL.shadow2;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Wall base shadow
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p2.sx + 4, p2.sy + 2);
      ctx.lineTo(p1.sx + 4, p1.sy + 2);
      ctx.closePath();
      ctx.fillStyle = '#2a1f14';
      ctx.fill();
      ctx.restore();

      // ── Draw openings on this wall ──
      for (const op of wallOpenings) {
        const startM = op.positionAlongWall;
        const endM = startM + op.width;
        const o1 = worldToScreen(w.start.x + wallNx * startM, w.start.y + wallNy * startM, W, H);
        const o2 = worldToScreen(w.start.x + wallNx * endM, w.start.y + wallNy * endM, W, H);

        const opHeight = op.height * currentTileH;
        const opElevation = op.elevation * currentTileH;

        if (op.type === 'door') {
          // Door: opening in wall from floor to door height
          const doorTop = wallUpPx * 0.9;

          // Cut out door opening (draw dark inside)
          ctx.fillStyle = '#1a1208';
          ctx.beginPath();
          ctx.moveTo(o1.sx, o1.sy);
          ctx.lineTo(o2.sx, o2.sy);
          ctx.lineTo(o2.sx, o2.sy - doorTop);
          ctx.lineTo(o1.sx, o1.sy - doorTop);
          ctx.closePath();
          ctx.fill();

          // Door frame
          ctx.strokeStyle = PAL.darkBrown;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(o1.sx, o1.sy);
          ctx.lineTo(o1.sx, o1.sy - doorTop);
          ctx.lineTo(o2.sx, o2.sy - doorTop);
          ctx.lineTo(o2.sx, o2.sy);
          ctx.stroke();

          // Open door panel (angled)
          const doorPanelW = Math.abs(o2.sx - o1.sx) * 0.3;
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = PAL.brown;
          ctx.beginPath();
          ctx.moveTo(o1.sx, o1.sy);
          ctx.lineTo(o1.sx - doorPanelW, o1.sy - 3);
          ctx.lineTo(o1.sx - doorPanelW, o1.sy - doorTop + 3);
          ctx.lineTo(o1.sx, o1.sy - doorTop);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = PAL.darkBrown;
          ctx.lineWidth = 1;
          ctx.stroke();
          // Door handle
          ctx.fillStyle = PAL.golden;
          ctx.fillRect(o1.sx - doorPanelW + 3, o1.sy - doorTop * 0.45, 2, 3);
          ctx.restore();

        } else if (op.type === 'window') {
          // Window: opening at elevation
          const winBottom = opElevation;
          const winTop = opElevation + opHeight;
          const winBottomPx = Math.min(winBottom, wallUpPx * 0.95);
          const winTopPx = Math.min(winTop, wallUpPx);

          // Window hole
          ctx.fillStyle = '#0d1b2a';
          ctx.beginPath();
          ctx.moveTo(o1.sx, o1.sy - winBottomPx);
          ctx.lineTo(o2.sx, o2.sy - winBottomPx);
          ctx.lineTo(o2.sx, o2.sy - winTopPx);
          ctx.lineTo(o1.sx, o1.sy - winTopPx);
          ctx.closePath();
          ctx.fill();

          // Glass (semi-transparent blue)
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#88b8d0';
          ctx.beginPath();
          ctx.moveTo(o1.sx + 1, o1.sy - winBottomPx - 1);
          ctx.lineTo(o2.sx - 1, o2.sy - winBottomPx - 1);
          ctx.lineTo(o2.sx - 1, o2.sy - winTopPx + 1);
          ctx.lineTo(o1.sx + 1, o1.sy - winTopPx + 1);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Glass highlight (light reflection)
          ctx.save();
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#e0f0ff';
          const hlW = Math.abs(o2.sx - o1.sx) * 0.3;
          const hlH = (winTopPx - winBottomPx) * 0.6;
          ctx.fillRect(o1.sx + 2, o1.sy - winTopPx + 2, hlW, hlH);
          ctx.restore();

          // Window frame
          ctx.strokeStyle = PAL.cream;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(o1.sx, o1.sy - winTopPx, o2.sx - o1.sx, winTopPx - winBottomPx);
          ctx.stroke();

          // Cross frame
          ctx.strokeStyle = PAL.cream;
          ctx.lineWidth = 1;
          const winCx = (o1.sx + o2.sx) / 2;
          const winCy = o1.sy - (winBottomPx + winTopPx) / 2;
          ctx.beginPath();
          ctx.moveTo(winCx, o1.sy - winTopPx);
          ctx.lineTo(winCx, o1.sy - winBottomPx);
          ctx.moveTo(o1.sx, winCy);
          ctx.lineTo(o2.sx, winCy);
          ctx.stroke();

          // Light streaming from window (warm glow on wall below)
          ctx.save();
          ctx.globalAlpha = 0.08;
          const lightGrad2 = ctx.createLinearGradient(
            (o1.sx + o2.sx) / 2, o1.sy - winBottomPx,
            (o1.sx + o2.sx) / 2, o1.sy
          );
          lightGrad2.addColorStop(0, '#ffe8c0');
          lightGrad2.addColorStop(1, 'rgba(255,232,192,0)');
          ctx.fillStyle = lightGrad2;
          ctx.fillRect(o1.sx, o1.sy - winBottomPx, o2.sx - o1.sx, winBottomPx);
          ctx.restore();
        }
      }
    }

    // ── Draw grid snap dots when dragging ──
    if (dragging && walls.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = PAL.golden;
      const step = GRID_SNAP_M;
      for (let ty = roomBounds.minY; ty <= roomBounds.maxY; ty += step) {
        for (let tx = roomBounds.minX; tx <= roomBounds.maxX; tx += step) {
          const { sx: gx, sy: gy } = worldToScreen(tx, ty, W, H);
          ctx.fillRect(gx - 1, gy - 1, 2, 2);
        }
      }
      ctx.restore();
    }

    // ── Draw ghost outline at original position when dragging ──
    if (dragging) {
      const dragItem = furniture.find(fi => fi.id === dragging.id);
      if (dragItem) {
        const { sx: gx, sy: gy } = worldToScreen(dragging.startPos[0], dragging.startPos[2], W, H);
        const ghostSize = SPRITE_SIZE * spritePixelSize;
        const halfGhost = ghostSize / 2;
        const rotStepsGhost = Math.round((dragItem.rotation[1] / (Math.PI / 2))) % 4;
        const ghostCanvas = getCachedSprite(dragItem.type, spritePixelSize, rotStepsGhost);
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.drawImage(ghostCanvas, gx - halfGhost, gy - halfGhost * 0.7);
        // Dashed outline
        ctx.strokeStyle = PAL.golden;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(gx - halfGhost, gy - halfGhost * 0.7, ghostSize, ghostSize);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // ── Draw furniture (sorted by iso depth: painter's algorithm) ──
    const sortedFurniture = [...furniture].sort((a, b) => {
      const depthA = a.position[0] + a.position[2];
      const depthB = b.position[0] + b.position[2];
      return depthA - depthB;
    });

    const now = performance.now();
    // Process animations, cleanup completed ones
    const anims = animationsRef.current;
    for (const [id, anim] of anims.entries()) {
      const elapsed = now - anim.startTime;
      if (anim.type === 'place' && elapsed > PLACE_ANIM_MS) {
        anims.delete(id);
      }
      if (anim.type === 'delete' && elapsed > DELETE_ANIM_MS) {
        anims.delete(id);
        pendingDeleteRef.current.delete(id);
        deleteFurniture(id);
        if (selectedFurnitureId === id) setSelectedFurniture(null);
        needsRedrawRef.current = true;
      }
    }
    // Request redraw if any animations are active
    if (anims.size > 0) {
      needsRedrawRef.current = true;
    }

    for (const f of sortedFurniture) {
      // Skip items being deleted (they are handled by animation)
      const anim = anims.get(f.id);
      let animScale = 1;
      let animOpacity = 1;

      if (anim) {
        const elapsed = now - anim.startTime;
        if (anim.type === 'place') {
          const progress = Math.min(elapsed / PLACE_ANIM_MS, 1);
          if (progress < 5 / PLACE_ANIM_DURATION) {
            // Frame 0-5: scale 0% -> 120%
            const t = progress / (5 / PLACE_ANIM_DURATION);
            animScale = t * 1.2;
          } else {
            // Frame 5-8: scale 120% -> 100%
            const t = (progress - 5 / PLACE_ANIM_DURATION) / (3 / PLACE_ANIM_DURATION);
            animScale = 1.2 - 0.2 * Math.min(t, 1);
          }
        } else if (anim.type === 'delete') {
          const progress = Math.min(elapsed / DELETE_ANIM_MS, 1);
          animScale = 1 - progress;
          animOpacity = 1 - progress;
        }
      }

      const { sx: fx, sy: fy } = worldToScreen(f.position[0], f.position[2], W, H);
      const spriteSize = SPRITE_SIZE * spritePixelSize;
      const halfSprite = spriteSize / 2;

      // Apply animation transforms
      const scaledSize = spriteSize * animScale;
      const scaledHalf = scaledSize / 2;

      ctx.save();
      ctx.globalAlpha = animOpacity;

      // Isometric shadow (elongated, extending to bottom-right)
      ctx.save();
      ctx.globalAlpha = 0.18 * animOpacity;
      ctx.fillStyle = '#2a1f14';
      ctx.beginPath();
      ctx.ellipse(fx + 3, fy + halfSprite * 0.35 + 3, halfSprite * 0.75 * animScale, halfSprite * 0.22 * animScale, Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Rotation steps
      const rotSteps = Math.round((f.rotation[1] / (Math.PI / 2))) % 4;

      // Draw sprite from cache (with scale animation)
      const cachedCanvas = getCachedSprite(f.type, spritePixelSize, rotSteps);
      if (animScale !== 1) {
        ctx.save();
        ctx.translate(fx, fy - halfSprite * 0.7 + halfSprite);
        ctx.scale(animScale, animScale);
        ctx.drawImage(cachedCanvas, -halfSprite, -halfSprite * 1.7 + halfSprite * 0.7);
        ctx.restore();
      } else {
        ctx.drawImage(cachedCanvas, fx - halfSprite, fy - halfSprite * 0.7);
      }

      // Subtle floor reflection (very faint, flipped vertically)
      ctx.save();
      ctx.globalAlpha = 0.04 * animOpacity;
      ctx.translate(fx - scaledHalf, fy + scaledHalf * 0.35);
      ctx.scale(animScale, -0.3 * animScale);
      ctx.drawImage(cachedCanvas, 0, 0);
      ctx.restore();

      // ── Furniture name label below sprite ──
      {
        const catalogItem = FURNITURE_CATALOG.find(c => c.type === f.type);
        const labelText = catalogItem?.name || f.type;
        const labelFontSize = Math.max(9, Math.min(14, spritePixelSize * 4));
        ctx.save();
        ctx.font = `bold ${labelFontSize}px "Hiragino Sans", "Yu Gothic", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelX = fx;
        const labelY = fy - halfSprite * 0.7 + spriteSize + 2;
        // Background pill
        const textMetrics = ctx.measureText(labelText);
        const pillW = textMetrics.width + 8;
        const pillH = labelFontSize + 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const rx = labelX - pillW / 2, ry = labelY, rr = 3;
        ctx.beginPath();
        ctx.moveTo(rx + rr, ry);
        ctx.lineTo(rx + pillW - rr, ry);
        ctx.arcTo(rx + pillW, ry, rx + pillW, ry + rr, rr);
        ctx.lineTo(rx + pillW, ry + pillH - rr);
        ctx.arcTo(rx + pillW, ry + pillH, rx + pillW - rr, ry + pillH, rr);
        ctx.lineTo(rx + rr, ry + pillH);
        ctx.arcTo(rx, ry + pillH, rx, ry + pillH - rr, rr);
        ctx.lineTo(rx, ry + rr);
        ctx.arcTo(rx, ry, rx + rr, ry, rr);
        ctx.closePath();
        ctx.fill();
        // Text
        ctx.fillStyle = '#fff8f0';
        ctx.fillText(labelText, labelX, labelY + 2);
        ctx.restore();
      }

      // ── Hover highlight outline ──
      if (f.id === hoveredFurnitureId && f.id !== selectedFurnitureId && !pendingDeleteRef.current.has(f.id)) {
        ctx.save();
        ctx.strokeStyle = PAL.cream;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        const hm = 1;
        ctx.strokeRect(fx - halfSprite - hm, fy - halfSprite * 0.7 - hm, spriteSize + hm * 2, spriteSize + hm * 2);
        ctx.restore();
      }

      // Selection highlight (blinking pixel frame)
      if (f.id === selectedFurnitureId) {
        const selColor = SELECTION_COLORS[blinkPhase];
        const altColor = SELECTION_COLORS[(blinkPhase + 1) % 2];
        const margin = 3;
        const bx = fx - halfSprite - margin;
        const by = fy - halfSprite * 0.7 - margin;
        const bw = spriteSize + margin * 2;
        const bh = spriteSize + margin * 2;
        const pxSz = Math.max(2, spritePixelSize * 0.5);

        const stepsH = Math.ceil(bw / pxSz);
        const stepsV = Math.ceil(bh / pxSz);
        for (let i = 0; i < stepsH; i++) {
          ctx.fillStyle = i % 2 === 0 ? selColor : altColor;
          ctx.fillRect(bx + i * pxSz, by, pxSz, pxSz);
          ctx.fillRect(bx + i * pxSz, by + bh - pxSz, pxSz, pxSz);
        }
        for (let i = 1; i < stepsV - 1; i++) {
          ctx.fillStyle = i % 2 === 0 ? selColor : altColor;
          ctx.fillRect(bx, by + i * pxSz, pxSz, pxSz);
          ctx.fillRect(bx + bw - pxSz, by + i * pxSz, pxSz, pxSz);
        }

        ctx.fillStyle = PAL.white;
        ctx.fillRect(bx, by, pxSz, pxSz);
        ctx.fillRect(bx + bw - pxSz, by, pxSz, pxSz);
        ctx.fillRect(bx, by + bh - pxSz, pxSz, pxSz);
        ctx.fillRect(bx + bw - pxSz, by + bh - pxSz, pxSz, pxSz);

        // ── Bouncing selection arrow ──
        const bounceY = Math.sin(selectionBounceRef.current) * 4;
        const arrowX = fx;
        const arrowY = fy - halfSprite * 0.7 - margin - 10 + bounceY;
        ctx.fillStyle = PAL.golden;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY + 6);
        ctx.lineTo(arrowX - 4, arrowY);
        ctx.lineTo(arrowX + 4, arrowY);
        ctx.closePath();
        ctx.fill();
        // Arrow stem
        ctx.fillRect(arrowX - 1.5, arrowY - 5, 3, 5);
      }

      ctx.restore();
    }

    // ── Warm overlay ──
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#f0c8a8';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // ── Room info text ──
    if (roomArea > 0) {
      const tsubo = roomArea / 3.30579;
      const text = `${roomArea.toFixed(1)}m\u00B2 / ${tsubo.toFixed(1)}\u5764`;
      ctx.font = '600 13px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const tm = ctx.measureText(text);
      ctx.fillStyle = 'rgba(13,27,42,0.75)';
      ctx.fillRect(8, H - 32, tm.width + 16, 24);
      ctx.fillStyle = PAL.golden;
      ctx.fillText(text, 16, H - 27);
    }
  }, [walls, furniture, openings, selectedFurnitureId, zoom, panOffset, roomBounds, worldToScreen, blinkPhase, roomArea, tileW, drawDiamond, dragging, hoveredFurnitureId, deleteFurniture, setSelectedFurniture]);

  useEffect(() => {
    needsRedrawRef.current = true;
  }, [walls, furniture, openings, selectedFurnitureId, zoom, panOffset, roomBounds, blinkPhase, roomArea, dragging, hoveredFurnitureId]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (needsRedrawRef.current) {
        needsRedrawRef.current = false;
        syncCanvasSize();
        render();
      }
      rafIdRef.current = requestAnimationFrame(loop);
    };
    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [render, syncCanvasSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      needsRedrawRef.current = true;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Ctrl+Shift+E for PNG export
      if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault();
        handleExportPNG();
        return;
      }

      switch (e.key) {
        case '1': e.preventDefault(); setActiveTool('select'); break;
        case '2': e.preventDefault(); setActiveTool('move'); break;
        case '3': e.preventDefault(); setActiveTool('rotate'); break;
        case '4': e.preventDefault(); setActiveTool('delete'); break;
        case '5': e.preventDefault(); setCrtEnabled(prev => !prev); break;
        case 'r':
        case 'R':
          if (selectedFurnitureId) {
            e.preventDefault();
            const f = furniture.find(fi => fi.id === selectedFurnitureId);
            if (f) rotateFurniture(f.id, f.rotation[1] + Math.PI / 2);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedFurnitureId && !pendingDeleteRef.current.has(selectedFurnitureId)) {
            e.preventDefault();
            pendingDeleteRef.current.add(selectedFurnitureId);
            animationsRef.current.set(selectedFurnitureId, { startTime: performance.now(), type: 'delete' });
            needsRedrawRef.current = true;
          }
          break;
        case 'Escape':
          e.preventDefault();
          setSelectedFurniture(null);
          setContextMenu(null);
          setCatalogPopup(null);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFurnitureId, furniture, rotateFurniture, setSelectedFurniture, handleExportPNG]);

  // ── Touch handlers ──
  const getTouchCanvasPos = useCallback((touch: { clientX: number; clientY: number }): { sx: number; sy: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 0, sy: 0 };
    const rect = canvas.getBoundingClientRect();
    return { sx: touch.clientX - rect.left, sy: touch.clientY - rect.top };
  }, []);

  const touchStartRef = useRef<{ id: number; sx: number; sy: number; time: number } | null>(null);
  const touchPinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setContextMenu(null);
    setCatalogPopup(null);

    if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      touchPinchRef.current = { dist, zoom };
      return;
    }

    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const { sx, sy } = getTouchCanvasPos(touch);
    touchStartRef.current = { id: touch.identifier, sx, sy, time: Date.now() };

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;

    if (activeTool === 'delete') {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit && !pendingDeleteRef.current.has(hit.id)) {
        pendingDeleteRef.current.add(hit.id);
        animationsRef.current.set(hit.id, { startTime: performance.now(), type: 'delete' });
        needsRedrawRef.current = true;
      }
      return;
    }

    if (activeTool === 'rotate') {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) rotateFurniture(hit.id, hit.rotation[1] + Math.PI / 2);
      return;
    }

    const hit = hitTestFurniture(sx, sy, cw, ch);
    if (hit && !pendingDeleteRef.current.has(hit.id)) {
      setSelectedFurniture(hit.id);
      if (activeTool === 'select' || activeTool === 'move') {
        const world = screenToWorld(sx, sy, cw, ch);
        setDragging({ id: hit.id, startWorld: { x: world.wx, z: world.wy }, startPos: [...hit.position] });
      }
    } else {
      setSelectedFurniture(null);
      setIsPanning(true);
      panStartRef.current = { x: touch.clientX, y: touch.clientY, ox: panOffset.x, oy: panOffset.y };
    }
  }, [activeTool, hitTestFurniture, selectedFurnitureId, panOffset, zoom, setSelectedFurniture, rotateFurniture, screenToWorld, getTouchCanvasPos]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2 && touchPinchRef.current) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const scale = dist / touchPinchRef.current.dist;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, touchPinchRef.current.zoom * scale));
      setZoom(newZoom);
      return;
    }

    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    if (isPanning) {
      const dx = touch.clientX - panStartRef.current.x;
      const dy = touch.clientY - panStartRef.current.y;
      setPanOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      return;
    }

    if (dragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = touch.clientX - rect.left;
      const sy = touch.clientY - rect.top;
      const world = screenToWorld(sx, sy, rect.width, rect.height);
      const dx = world.wx - dragging.startWorld.x;
      const dz = world.wy - dragging.startWorld.z;
      const newX = snapToGrid(dragging.startPos[0] + dx);
      const newZ = snapToGrid(dragging.startPos[2] + dz);
      moveFurniture(dragging.id, [newX, dragging.startPos[1], newZ]);
    }
  }, [isPanning, dragging, screenToWorld, moveFurniture]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 0) {
      touchPinchRef.current = null;
      setIsPanning(false);
      setDragging(null);
      touchStartRef.current = null;
    }
  }, []);

  // ── Mouse handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu(null);
    setCatalogPopup(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cw = rect.width;
    const ch = rect.height;

    if (e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
      return;
    }

    if (e.button === 2) {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) {
        setSelectedFurniture(hit.id);
        setContextMenu({ x: e.clientX, y: e.clientY, furnitureId: hit.id });
      }
      return;
    }

    if (activeTool === 'delete') {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit && !pendingDeleteRef.current.has(hit.id)) {
        // Animate deletion instead of immediate remove
        pendingDeleteRef.current.add(hit.id);
        animationsRef.current.set(hit.id, { startTime: performance.now(), type: 'delete' });
        needsRedrawRef.current = true;
      }
      return;
    }

    if (activeTool === 'rotate') {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) rotateFurniture(hit.id, hit.rotation[1] + Math.PI / 2);
      return;
    }

    const hit = hitTestFurniture(sx, sy, cw, ch);
    if (hit && !pendingDeleteRef.current.has(hit.id)) {
      setSelectedFurniture(hit.id);
      if (activeTool === 'select' || activeTool === 'move') {
        const world = screenToWorld(sx, sy, cw, ch);
        setDragging({ id: hit.id, startWorld: { x: world.wx, z: world.wy }, startPos: [...hit.position] });
      }
    } else {
      setSelectedFurniture(null);
    }
  }, [activeTool, hitTestFurniture, selectedFurnitureId, panOffset, setSelectedFurniture, rotateFurniture, screenToWorld]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      return;
    }

    if (dragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy, rect.width, rect.height);
      const dx = world.wx - dragging.startWorld.x;
      const dz = world.wy - dragging.startWorld.z;
      const newX = snapToGrid(dragging.startPos[0] + dx);
      const newZ = snapToGrid(dragging.startPos[2] + dz);
      moveFurniture(dragging.id, [newX, dragging.startPos[1], newZ]);
      return;
    }

    // Hover detection
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTestFurniture(sx, sy, rect.width, rect.height);
    const newHoverId = hit ? hit.id : null;
    if (newHoverId !== hoveredFurnitureId) {
      setHoveredFurnitureId(newHoverId);
      needsRedrawRef.current = true;
    }
  }, [isPanning, dragging, screenToWorld, moveFurniture, hitTestFurniture, hoveredFurnitureId]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragging(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTestFurniture(sx, sy, rect.width, rect.height);
    if (!hit) {
      const world = screenToWorld(sx, sy, rect.width, rect.height);
      setCatalogPopup({ x: e.clientX, y: e.clientY, worldX: snapToGrid(world.wx), worldZ: snapToGrid(world.wy) });
    }
  }, [hitTestFurniture, screenToWorld]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleContextAction = useCallback((action: string) => {
    if (!contextMenu?.furnitureId) return;
    const id = contextMenu.furnitureId;
    switch (action) {
      case 'rotate':
        rotateFurniture(id, (furniture.find(f => f.id === id)?.rotation[1] ?? 0) + Math.PI / 2);
        break;
      case 'duplicate':
        duplicateFurniture(id);
        break;
      case 'delete':
        if (!pendingDeleteRef.current.has(id)) {
          pendingDeleteRef.current.add(id);
          animationsRef.current.set(id, { startTime: performance.now(), type: 'delete' });
          needsRedrawRef.current = true;
        }
        break;
    }
    setContextMenu(null);
  }, [contextMenu, rotateFurniture, duplicateFurniture, furniture, selectedFurnitureId, setSelectedFurniture]);

  const handleCatalogAdd = useCallback((type: FurnitureType) => {
    if (!catalogPopup) return;
    const catalogItem = FURNITURE_CATALOG.find(c => c.type === type);
    if (!catalogItem) return;
    const newId = `pixel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    addFurniture({
      id: newId,
      type,
      name: catalogItem.name,
      position: [catalogPopup.worldX, 0, catalogPopup.worldZ],
      rotation: [0, 0, 0],
      scale: catalogItem.defaultScale,
      color: catalogItem.defaultColor,
      material: catalogItem.defaultMaterial,
    });
    // Trigger placement animation
    animationsRef.current.set(newId, { startTime: performance.now(), type: 'place' });
    needsRedrawRef.current = true;
    setCatalogPopup(null);
  }, [catalogPopup, addFurniture]);

  const tools: { key: PixelTool; label: string; shortcut: string; iconPath: string }[] = [
    { key: 'select', label: 'SELECT', shortcut: '1', iconPath: 'M5 3l10 8-5 2-3 5-2-1 3-5 5-2z' },
    { key: 'move', label: 'MOVE', shortcut: '2', iconPath: 'M8 2l2 4h-4l2-4zm0 14l-2-4h4l-2 4zm-6-6l4-2v4l-4-2zm14 0l-4 2v-4l4 2z' },
    { key: 'rotate', label: 'ROTATE', shortcut: '3', iconPath: 'M12 4a6 6 0 11-6 6h2a4 4 0 104-4V4l3 3-3 3V6z' },
    { key: 'delete', label: 'DELETE', shortcut: '4', iconPath: 'M4 4l10 10M14 4L4 14' },
  ];

  const paletteCategories = useMemo(() => {
    const cats: { label: string; items: typeof FURNITURE_CATALOG }[] = [
      { label: 'TABLE', items: FURNITURE_CATALOG.filter(f => ['counter','table_square','table_round','bar_table','kitchen_island','reception_desk','desk'].includes(f.type)) },
      { label: 'SEAT', items: FURNITURE_CATALOG.filter(f => ['chair','stool','sofa','bench'].includes(f.type)) },
      { label: 'STORAGE', items: FURNITURE_CATALOG.filter(f => ['shelf','bookcase','wardrobe','shoe_rack','display_case','showcase'].includes(f.type)) },
      { label: 'APPLIANCE', items: FURNITURE_CATALOG.filter(f => ['fridge','sink','washing_machine','register','cash_register','tv_monitor','air_conditioner'].includes(f.type)) },
      { label: 'DECOR', items: FURNITURE_CATALOG.filter(f => ['plant','flower_pot','rug','mirror','pendant_light','ceiling_fan','clock','curtain','partition','menu_board','coat_rack','umbrella_stand','trash_can'].includes(f.type)) },
    ];
    return cats.filter(c => c.items.length > 0);
  }, []);

  const handlePaletteAdd = useCallback((type: FurnitureType) => {
    const catalogItem = FURNITURE_CATALOG.find(c => c.type === type);
    if (!catalogItem) return;
    const canvas = canvasRef.current;
    let wx = 0, wz = 0;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const center = screenToWorld(rect.width / 2, rect.height / 2, rect.width, rect.height);
      wx = snapToGrid(center.wx);
      wz = snapToGrid(center.wy);
    }
    const newId = `pixel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    addFurniture({
      id: newId,
      type,
      name: catalogItem.name,
      position: [wx, 0, wz],
      rotation: [0, 0, 0],
      scale: catalogItem.defaultScale,
      color: catalogItem.defaultColor,
      material: catalogItem.defaultMaterial,
    });
    // Trigger placement animation
    animationsRef.current.set(newId, { startTime: performance.now(), type: 'place' });
    needsRedrawRef.current = true;
  }, [addFurniture, screenToWorld]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-[#0d1b2a] overflow-hidden select-none">
      {/* ── Toolbar ── */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 bg-[#162032] border-b border-[#2a3848]">
        {tools.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTool(t.key)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold tracking-wider font-mono transition-all ${
              activeTool === t.key
                ? 'bg-[#c8584a] text-white shadow-[0_0_8px_rgba(200,88,74,0.5)]'
                : 'bg-[#1b2838] text-[#8a8a90] hover:bg-[#2a3848] hover:text-white'
            }`}
            title={`${t.label} [${t.shortcut}]`}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
              <path d={t.iconPath} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">{t.label}</span>
            <span className="hidden sm:inline text-[8px] opacity-50 ml-0.5">[{t.shortcut}]</span>
          </button>
        ))}

        <div className="w-px h-5 bg-[#2a3848] mx-1" />

        <button
          onClick={() => setCrtEnabled(!crtEnabled)}
          className={`px-2.5 py-1.5 rounded text-[10px] font-bold tracking-wider font-mono transition-all ${
            crtEnabled
              ? 'bg-[#a888c0] text-white shadow-[0_0_8px_rgba(168,136,192,0.5)]'
              : 'bg-[#1b2838] text-[#8a8a90] hover:bg-[#2a3848] hover:text-white'
          }`}
          title="CRT Effect [5]"
        >
          CRT
          <span className="hidden sm:inline text-[8px] opacity-50 ml-0.5">[5]</span>
        </button>

        <div className="w-px h-5 bg-[#2a3848] mx-1" />

        <button
          onClick={handleExportPNG}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold tracking-wider font-mono transition-all bg-[#1b2838] text-[#8a8a90] hover:bg-[#2a3848] hover:text-white"
          title="Export PNG [Ctrl+Shift+E]"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
            <path d="M3 10v3h10v-3M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">PNG</span>
        </button>

        <div className="ml-auto text-[10px] font-mono text-[#607888] px-2">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Side furniture palette ── */}
        <div className="flex-shrink-0 w-[52px] bg-[#162032] border-r border-[#2a3848] overflow-y-auto scrollbar-thin">
          <div className="py-1 px-0.5">
            {paletteCategories.map((cat) => (
              <div key={cat.label}>
                <div className="text-[7px] font-mono font-bold text-[#607888] text-center py-0.5 border-b border-[#2a3848] mb-0.5">
                  {cat.label}
                </div>
                <div className="space-y-1 mb-1">
                  {cat.items.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => handlePaletteAdd(item.type)}
                      className="w-full aspect-square bg-[#1b2838] rounded border border-[#2a3848] hover:border-[#c8584a] hover:bg-[#2a3848] transition-all group relative"
                      title={item.name}
                    >
                      <PaletteThumbnail type={item.type} />
                      <div className="absolute left-full ml-1 top-1/2 -translate-y-1/2 bg-black/90 text-white text-[9px] font-mono px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        {item.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Canvas ── */}
        <div className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            style={{ imageRendering: 'pixelated' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />

          {/* CRT overlay */}
          {crtEnabled && (
            <>
              <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 1px, transparent 1px, transparent 3px)', mixBlendMode: 'multiply' }} />
              <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'repeating-linear-gradient(90deg, rgba(255,0,0,0.03) 0px, rgba(0,255,0,0.03) 1px, rgba(0,0,255,0.03) 2px, transparent 3px)', mixBlendMode: 'screen' }} />
              <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)' }} />
              <div className="absolute inset-0 pointer-events-none z-10 rounded-[8px]" style={{ boxShadow: 'inset 0 0 80px 20px rgba(0,0,0,0.3), inset 0 0 4px 1px rgba(255,255,255,0.02)' }} />
            </>
          )}

          {/* Empty state */}
          {walls.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center px-6 py-4 bg-black/50 rounded-lg border border-[#2a3848]">
                <div className="text-[#c8584a] font-mono text-sm font-bold mb-1">NO ROOM DATA</div>
                <div className="text-[#607888] font-mono text-[10px]">
                  Draw walls in the floor plan editor first
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-[#162032] border border-[#2a3848] rounded shadow-2xl shadow-black/50 min-w-[140px] py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {[
              { action: 'rotate', label: 'Rotate 90\u00B0', icon: '\u21BB' },
              { action: 'duplicate', label: 'Duplicate', icon: '\u2750' },
              { action: 'delete', label: 'Delete', icon: '\u2716' },
            ].map(({ action, label, icon }) => (
              <button
                key={action}
                onClick={() => handleContextAction(action)}
                className={`w-full text-left px-3 py-1.5 text-[11px] font-mono flex items-center gap-2 transition-colors ${
                  action === 'delete'
                    ? 'text-[#c8584a] hover:bg-[#c8584a]/20'
                    : 'text-[#8a8a90] hover:bg-[#2a3848] hover:text-white'
                }`}
              >
                <span className="text-sm">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Catalog popup ── */}
      {catalogPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCatalogPopup(null)} />
          <div
            className="fixed z-50 bg-[#162032] border border-[#2a3848] rounded-lg shadow-2xl shadow-black/50 p-2 max-w-[280px] max-h-[320px] overflow-y-auto"
            style={{
              left: Math.min(catalogPopup.x, window.innerWidth - 300),
              top: Math.min(catalogPopup.y, window.innerHeight - 340),
            }}
          >
            <div className="text-[10px] font-mono font-bold text-[#c8584a] px-1 pb-1 border-b border-[#2a3848] mb-1">
              ADD FURNITURE
            </div>
            <div className="grid grid-cols-4 gap-1">
              {FURNITURE_CATALOG.map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleCatalogAdd(item.type)}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-[#1b2838] hover:bg-[#2a3848] border border-transparent hover:border-[#c8584a] transition-all"
                  title={item.name}
                >
                  <CatalogThumbnail type={item.type} />
                  <span className="text-[8px] font-mono text-[#8a8a90] truncate w-full text-center">
                    {item.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Palette thumbnail ──
function PaletteThumbnail({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 40;
    canvas.height = 40;
    ctx.clearRect(0, 0, 40, 40);
    const sprite = getSpriteForType(type);
    drawMiniSprite(ctx, sprite, 4, 4, 32);
  }, [type]);
  return (
    <canvas
      ref={canvasRef}
      width={40}
      height={40}
      className="w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// ── Catalog popup thumbnail ──
function CatalogThumbnail({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 28;
    canvas.height = 28;
    ctx.clearRect(0, 0, 28, 28);
    const sprite = getSpriteForType(type);
    drawMiniSprite(ctx, sprite, 2, 2, 24);
  }, [type]);
  return (
    <canvas
      ref={canvasRef}
      width={28}
      height={28}
      className="w-7 h-7"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
