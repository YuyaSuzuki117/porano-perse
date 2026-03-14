'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import type { WallSegment } from '@/types/floor-plan';
import type { FurnitureItem } from '@/types/scene';

/** 家具タイプに基づく色マッピング */
function getFurnitureColor(type: string): string {
  if (['chair', 'stool', 'sofa', 'bench'].includes(type)) return '#f59e0b'; // 座る系: アンバー
  if (['counter', 'table_square', 'table_round', 'bar_table', 'kitchen_island', 'desk', 'reception_desk'].includes(type)) return '#8b5cf6'; // テーブル系: パープル
  if (['shelf', 'bookcase', 'wardrobe', 'display_case'].includes(type)) return '#10b981'; // 収納系: グリーン
  if (['pendant_light', 'ceiling_fan'].includes(type)) return '#fbbf24'; // 照明系: イエロー
  if (['register', 'sink', 'fridge', 'washing_machine', 'air_conditioner', 'tv_monitor'].includes(type)) return '#6366f1'; // 設備系: インディゴ
  return '#94a3b8'; // その他: グレー
}

interface MiniMapProps {
  walls: WallSegment[];
  furniture: FurnitureItem[];
  cameraPosition: [number, number, number];
  cameraRotation: number; // Y回転（ラジアン）
  onNavigate: (x: number, z: number) => void;
}

const MAP_SIZE = 150;
const PADDING = 10;

const MiniMapInner: React.FC<MiniMapProps> = ({ walls, furniture, cameraPosition, cameraRotation, onNavigate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boundsRef = useRef({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, scale: 1 });

  // ルームの境界を計算
  const computeBounds = useCallback(() => {
    if (walls.length === 0) {
      return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const w of walls) {
      // 2D図面のyがZ軸に対応
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minZ = Math.min(minZ, w.start.y, w.end.y);
      maxZ = Math.max(maxZ, w.start.y, w.end.y);
    }
    // 家具位置も考慮
    for (const f of furniture) {
      minX = Math.min(minX, f.position[0] - 1);
      maxX = Math.max(maxX, f.position[0] + 1);
      minZ = Math.min(minZ, f.position[2] - 1);
      maxZ = Math.max(maxZ, f.position[2] + 1);
    }
    // 余白追加
    const pad = 1;
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }, [walls, furniture]);

  // ワールド座標→キャンバス座標変換
  const worldToCanvas = useCallback((worldX: number, worldZ: number) => {
    const b = boundsRef.current;
    const cx = PADDING + (worldX - b.minX) * b.scale;
    const cy = PADDING + (worldZ - b.minZ) * b.scale;
    return { x: cx, y: cy };
  }, []);

  // キャンバス座標→ワールド座標変換
  const canvasToWorld = useCallback((canvasX: number, canvasY: number) => {
    const b = boundsRef.current;
    const worldX = (canvasX - PADDING) / b.scale + b.minX;
    const worldZ = (canvasY - PADDING) / b.scale + b.minZ;
    return { x: worldX, z: worldZ };
  }, []);

  // 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    // 境界計算
    const bounds = computeBounds();
    const rangeX = bounds.maxX - bounds.minX;
    const rangeZ = bounds.maxZ - bounds.minZ;
    const drawArea = MAP_SIZE - PADDING * 2;
    const scale = Math.min(drawArea / rangeX, drawArea / rangeZ);
    boundsRef.current = { ...bounds, scale };

    // 背景
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(0, 0, MAP_SIZE, MAP_SIZE, 8);
    ctx.fill();

    // 壁の描画
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const w of walls) {
      const start = worldToCanvas(w.start.x, w.start.y);
      const end = worldToCanvas(w.end.x, w.end.y);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    // 家具の描画
    for (const f of furniture) {
      const pos = worldToCanvas(f.position[0], f.position[2]);
      const color = getFurnitureColor(f.type);
      const halfW = (f.scale[0] * scale) / 2;
      const halfD = (f.scale[2] * scale) / 2;
      const size = Math.max(3, Math.min(halfW, halfD, 8));

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(f.rotation[1]);

      if (f.locked) {
        // ロック中の家具は枠線を追加
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-size - 1, -size - 1, (size + 1) * 2, (size + 1) * 2);
      }

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // カメラ位置の描画（三角形で方向を示す）
    const camPos = worldToCanvas(cameraPosition[0], cameraPosition[2]);
    ctx.save();
    ctx.translate(camPos.x, camPos.y);
    ctx.rotate(cameraRotation);

    // カメラ視野（フラスタム近似）
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-20, -35);
    ctx.lineTo(20, -35);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-20, -35);
    ctx.moveTo(0, 0);
    ctx.lineTo(20, -35);
    ctx.stroke();

    // カメラ三角形
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-5, 4);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }, [walls, furniture, cameraPosition, cameraRotation, computeBounds, worldToCanvas]);

  // クリックでナビゲーション
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = canvasToWorld(x, y);
    onNavigate(world.x, world.z);
  }, [canvasToWorld, onNavigate]);

  return (
    <div
      className="absolute bottom-3 left-3 z-30 select-none"
      style={{ width: MAP_SIZE, height: MAP_SIZE }}
    >
      <canvas
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        style={{ width: MAP_SIZE, height: MAP_SIZE, cursor: 'crosshair' }}
        onClick={handleClick}
        aria-label="ミニマップ: クリックでカメラ移動"
      />
      <div className="absolute top-1.5 right-2 text-[9px] text-white/50 font-mono pointer-events-none">
        MAP
      </div>
    </div>
  );
};

export const MiniMap = React.memo(MiniMapInner);
