'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { WallSegment } from '@/types/floor-plan';
import { useEditorStore } from '@/stores/useEditorStore';

interface MeasurementToolProps {
  active: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/** スナップ判定距離（ピクセル） */
const SNAP_DISTANCE_PX = 20;

/** 壁の角座標を2Dスクリーン座標に射影するため、3D座標を収集 */
function getWallCorners3D(walls: WallSegment[]): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  const seen = new Set<string>();
  for (const wall of walls) {
    const keyS = `${wall.start.x.toFixed(3)}_${wall.start.y.toFixed(3)}`;
    const keyE = `${wall.end.x.toFixed(3)}_${wall.end.y.toFixed(3)}`;
    if (!seen.has(keyS)) {
      seen.add(keyS);
      corners.push(new THREE.Vector3(wall.start.x, 0, wall.start.y));
    }
    if (!seen.has(keyE)) {
      seen.add(keyE);
      corners.push(new THREE.Vector3(wall.end.x, 0, wall.end.y));
    }
  }
  return corners;
}

interface MeasurePoint {
  /** 3D世界座標 */
  world: THREE.Vector3;
  /** 2Dスクリーン座標 */
  screen: { x: number; y: number };
}

/**
 * インタラクティブ3D計測ツール（HTMLオーバーレイ版）
 * Canvas上に重ねて表示し、クリックで2点間の距離を計測
 */
export const MeasurementTool = React.memo(function MeasurementTool({
  active,
  canvasRef,
}: MeasurementToolProps) {
  const [startPoint, setStartPoint] = useState<MeasurePoint | null>(null);
  const [endPoint, setEndPoint] = useState<MeasurePoint | null>(null);
  const [hoverScreen, setHoverScreen] = useState<{ x: number; y: number } | null>(null);
  const [hoverWorld, setHoverWorld] = useState<THREE.Vector3 | null>(null);
  const [measurePhase, setMeasurePhase] = useState<'idle' | 'placed-start' | 'done'>('idle');
  const walls = useEditorStore((s) => s.walls);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 壁の角の3D座標
  const wallCorners3D = useMemo(() => getWallCorners3D(walls), [walls]);

  // アクティブ切替時にリセット
  useEffect(() => {
    if (!active) {
      setStartPoint(null);
      setEndPoint(null);
      setHoverScreen(null);
      setHoverWorld(null);
      setMeasurePhase('idle');
    }
  }, [active]);

  /** R3FのThreeインスタンスから camera, scene を取得（canvasの __r3f に格納されている） */
  const getThreeState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // R3F stores its state on the canvas element
    const r3f = (canvas as unknown as { __r3f?: { store: { getState: () => { camera: THREE.Camera; scene: THREE.Scene; gl: THREE.WebGLRenderer } } } }).__r3f;
    if (!r3f) return null;
    return r3f.store.getState();
  }, [canvasRef]);

  /** マウスイベントからフロア上の3D座標を取得 */
  const getFloorPoint = useCallback(
    (clientX: number, clientY: number): { world: THREE.Vector3; screen: { x: number; y: number } } | null => {
      const state = getThreeState();
      if (!state) return null;
      const { camera } = state;
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      const result = raycaster.ray.intersectPlane(floorPlane, hit);
      if (!result) return null;

      // 壁角スナップ判定
      let bestDist = Infinity;
      let snappedWorld = hit.clone();
      for (const corner of wallCorners3D) {
        // 3D座標→スクリーン座標へ射影してピクセル距離で比較
        const projected = corner.clone().project(camera);
        const sx = (projected.x * 0.5 + 0.5) * rect.width + rect.left;
        const sy = (-projected.y * 0.5 + 0.5) * rect.height + rect.top;
        const dx = sx - clientX;
        const dy = sy - clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < SNAP_DISTANCE_PX && dist < bestDist) {
          bestDist = dist;
          snappedWorld = corner.clone();
        }
      }

      return {
        world: snappedWorld,
        screen: { x: clientX, y: clientY },
      };
    },
    [canvasRef, getThreeState, wallCorners3D]
  );

  // マウスムーブ
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMove = (e: MouseEvent) => {
      const pt = getFloorPoint(e.clientX, e.clientY);
      if (pt) {
        setHoverScreen(pt.screen);
        setHoverWorld(pt.world);
      }
    };

    canvas.addEventListener('mousemove', handleMove);
    return () => canvas.removeEventListener('mousemove', handleMove);
  }, [active, canvasRef, getFloorPoint]);

  // クリック
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const pt = getFloorPoint(e.clientX, e.clientY);
      if (!pt) return;

      if (measurePhase === 'idle' || measurePhase === 'done') {
        setStartPoint({ world: pt.world, screen: pt.screen });
        setEndPoint(null);
        setMeasurePhase('placed-start');
      } else if (measurePhase === 'placed-start') {
        setEndPoint({ world: pt.world, screen: pt.screen });
        setMeasurePhase('done');
      }
    };

    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [active, canvasRef, getFloorPoint, measurePhase]);

  // カーソル切替
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (active) {
      canvas.style.cursor = 'crosshair';
      return () => { canvas.style.cursor = ''; };
    }
  }, [active, canvasRef]);

  /** スクリーン上の3D→2D変換（リアルタイム更新用） */
  const project = useCallback((world: THREE.Vector3): { x: number; y: number } | null => {
    const state = getThreeState();
    if (!state) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const projected = world.clone().project(state.camera);
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }, [canvasRef, getThreeState]);

  // カメラ変更に追従するためのリアルタイム座標更新
  const [frameCounter, setFrameCounter] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const update = () => {
      setFrameCounter((c) => c + 1);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // リアルタイム射影座標
  const startScreen = useMemo(() => {
    if (!startPoint) return null;
    return project(startPoint.world);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPoint, project, frameCounter]);

  const endScreen = useMemo(() => {
    if (!endPoint) return null;
    return project(endPoint.world);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endPoint, project, frameCounter]);

  const hoverScreenRT = useMemo(() => {
    if (!hoverWorld || measurePhase !== 'placed-start') return null;
    return project(hoverWorld);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverWorld, project, measurePhase, frameCounter]);

  if (!active) return null;

  // 距離計算
  const calcDist = (a: THREE.Vector3, b: THREE.Vector3): number => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return Math.sqrt(dx * dx + dz * dz);
  };

  const lineEnd = measurePhase === 'placed-start' ? hoverScreenRT : endScreen;
  const lineEndWorld = measurePhase === 'placed-start' ? hoverWorld : endPoint?.world;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 pointer-events-none z-20"
      style={{ mixBlendMode: 'normal' }}
    >
      {/* SVG: ライン描画 */}
      <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        {/* 計測ライン */}
        {startScreen && lineEnd && (
          <line
            x1={startScreen.x}
            y1={startScreen.y}
            x2={lineEnd.x}
            y2={lineEnd.y}
            stroke="#3B82F6"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
      </svg>

      {/* 開始点マーカー */}
      {startScreen && (
        <div
          className="absolute w-3 h-3 rounded-full"
          style={{
            left: startScreen.x - 6,
            top: startScreen.y - 6,
            background: 'radial-gradient(circle, #ef4444, #dc2626)',
            boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)',
          }}
        />
      )}

      {/* 終了点マーカー */}
      {endScreen && (
        <div
          className="absolute w-3 h-3 rounded-full"
          style={{
            left: endScreen.x - 6,
            top: endScreen.y - 6,
            background: 'radial-gradient(circle, #ef4444, #dc2626)',
            boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)',
          }}
        />
      )}

      {/* 完了時の距離ラベル */}
      {startScreen && endScreen && startPoint && endPoint && measurePhase === 'done' && (
        <div
          className="absolute"
          style={{
            left: (startScreen.x + endScreen.x) / 2,
            top: (startScreen.y + endScreen.y) / 2 - 20,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
            }}
          >
            {calcDist(startPoint.world, endPoint.world).toFixed(2)}m
          </div>
        </div>
      )}

      {/* ドラッグ中の仮距離ラベル */}
      {startScreen && hoverScreenRT && startPoint && hoverWorld && measurePhase === 'placed-start' && (
        <div
          className="absolute"
          style={{
            left: (startScreen.x + hoverScreenRT.x) / 2,
            top: (startScreen.y + hoverScreenRT.y) / 2 - 16,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.8)',
              color: 'white',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {calcDist(startPoint.world, hoverWorld).toFixed(2)}m
          </div>
        </div>
      )}
    </div>
  );
});
