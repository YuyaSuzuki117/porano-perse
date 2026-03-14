'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
// MeshReflectorMaterial removed — causes WebGL shader errors in some environments
import { WallSegment } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { computeFloorPolygon } from '@/lib/geometry';
import { useEditorStore } from '@/stores/useEditorStore';
import { getCachedTexture, getTextureResolution } from '@/lib/texture-cache';

// ---------------------------------------------------------------------------
// useFloorTexture — スタイル別プロシージャルテクスチャ生成フック
// ---------------------------------------------------------------------------

interface FloorTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture | null;
  roughnessMap: THREE.CanvasTexture;
}

function useFloorTexture(
  style: StyleConfig,
  floorSize: { w: number; d: number },
  colorOverride: string | null,
  textureTypeOverride: string | null,
): FloorTextures {
  // オーバーライド値を適用
  const effectiveColor = colorOverride ?? style.floorColor;
  const effectiveTextureType = textureTypeOverride ?? style.name;

  // 品質レベルに応じた解像度を取得
  const qualityLevel = useEditorStore((s) => s.qualityLevel);
  const res = getTextureResolution(qualityLevel);

  // floorSize を小数点1桁に丸め（微小な変化での再生成を防止）
  const roundedW = Math.round(floorSize.w * 10) / 10;
  const roundedD = Math.round(floorSize.d * 10) / 10;

  const map = useMemo(() => {
    const cacheKey = `floor-map-${effectiveTextureType}-${effectiveColor}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    const base = effectiveColor;

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 1024, 1024);

    switch (effectiveTextureType) {
      case 'japanese':
        drawTatamiTexture(ctx, base);
        break;
      case 'luxury':
        drawMarbleTexture(ctx, base);
        break;
      case 'industrial':
        drawConcreteTexture(ctx, base);
        break;
      case 'modern':
        drawLargeTileTexture(ctx, base);
        break;
      case 'cafe':
        drawWoodFlooringTexture(ctx, base);
        break;
      case 'minimal':
        drawWhiteTileTexture(ctx, base);
        break;
      case 'scandinavian':
        drawLightOakTexture(ctx, base);
        break;
      case 'retro':
        drawCheckerboardTexture(ctx, base);
        break;
      case 'medical':
        drawLinoleumTexture(ctx, base);
        break;
      default:
        drawConcreteTexture(ctx, base);
    }

    return canvas;
    }); // getCachedTexture 終了
    // キャッシュからのテクスチャをクローンし、床サイズに応じた repeat を設定
    const tex = baseTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(
      Math.max(1, Math.round(roundedW)),
      Math.max(1, Math.round(roundedD))
    );
    return tex;
  }, [effectiveColor, effectiveTextureType, roundedW, roundedD]);

  const normalMap = useMemo(() => {
    if (!res.useNormalMap) {
      return null;
    }
    const cacheKey = `floor-normal-${effectiveTextureType}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#8080FF';
    ctx.fillRect(0, 0, 512, 512);

    switch (effectiveTextureType) {
      case 'japanese':
        drawTatamiNormal(ctx);
        break;
      case 'luxury':
        drawMarbleNormal(ctx);
        break;
      case 'industrial':
        drawConcreteNormal(ctx);
        break;
      case 'modern':
        drawTileNormal(ctx, 154); // 60cm = ~154px in 512
        break;
      case 'cafe':
      case 'scandinavian':
        drawWoodNormal(ctx);
        break;
      case 'minimal':
        drawTileNormal(ctx, 128);
        break;
      case 'retro':
        drawCheckerNormal(ctx);
        break;
      case 'medical':
        drawLinoleumNormal(ctx);
        break;
      default:
        drawConcreteNormal(ctx);
    }

    return canvas;
    }); // getCachedTexture 終了
    const tex = baseTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(
      Math.max(1, Math.round(roundedW)),
      Math.max(1, Math.round(roundedD))
    );
    return tex;
  }, [effectiveTextureType, roundedW, roundedD, res.useNormalMap]);

  const roughnessMap = useMemo(() => {
    const cacheKey = `floor-roughness-${effectiveTextureType}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    switch (effectiveTextureType) {
      case 'japanese':
        drawTatamiRoughness(ctx);
        break;
      case 'luxury':
        drawMarbleRoughness(ctx);
        break;
      case 'industrial':
        drawConcreteRoughness(ctx);
        break;
      case 'modern':
        drawTileRoughness(ctx, 64);
        break;
      case 'cafe':
      case 'scandinavian':
        drawWoodRoughness(ctx);
        break;
      case 'minimal':
        drawTileRoughness(ctx, 64);
        break;
      case 'retro':
        drawCheckerRoughness(ctx);
        break;
      case 'medical':
        drawLinoleumRoughness(ctx);
        break;
      default:
        drawConcreteRoughness(ctx);
    }

    return canvas;
    }); // getCachedTexture 終了
    const tex = baseTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(
      Math.max(1, Math.round(roundedW)),
      Math.max(1, Math.round(roundedD))
    );
    return tex;
  }, [effectiveTextureType, roundedW, roundedD]);

  return { map, normalMap, roughnessMap };
}

// ---------------------------------------------------------------------------
// FloorMesh コンポーネント
// ---------------------------------------------------------------------------

interface FloorMeshProps {
  walls: WallSegment[];
  style: StyleConfig;
}

/** 床メッシュのprops比較: walls数・スタイル名のみで判定 */
function floorMeshPropsAreEqual(prev: FloorMeshProps, next: FloorMeshProps): boolean {
  if (prev.walls.length !== next.walls.length) return false;
  if (prev.style.name !== next.style.name) return false;
  if (prev.style.floorColor !== next.style.floorColor) return false;
  return true;
}

export const FloorMesh = React.memo(function FloorMesh({ walls, style }: FloorMeshProps) {
  const floorColorOverride = useEditorStore((s) => s.floorColorOverride);
  const floorTextureType = useEditorStore((s) => s.floorTextureType);

  const floorGeometry = useMemo(() => {
    const polygon = computeFloorPolygon(walls);
    if (polygon.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i].x, polygon[i].y);
    }
    shape.closePath();

    return new THREE.ShapeGeometry(shape);
  }, [walls]);

  const floorSize = useMemo(() => {
    if (walls.length === 0) return { w: 1, d: 1 };
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    return {
      w: Math.max(...xs) - Math.min(...xs),
      d: Math.max(...ys) - Math.min(...ys),
    };
  }, [walls]);

  const { map, normalMap, roughnessMap } = useFloorTexture(style, floorSize, floorColorOverride, floorTextureType);

  // テクスチャタイプに基づく床マテリアルパラメータ
  const effectiveFloorType = floorTextureType ?? style.name;
  const qualityLevel = useEditorStore((s) => s.qualityLevel);

  // 反射性のある床タイプ: marble, tile, checkerboard, linoleum, 木目(clearcoat)
  const REFLECTIVE_FLOORS = new Set(['luxury', 'modern', 'retro', 'minimal', 'medical', 'cafe', 'scandinavian']);

  const { metalness, roughness, envMapIntensity, clearcoat, clearcoatRoughness } = useMemo(() => {
    switch (effectiveFloorType) {
      case 'luxury':
        // 磨き大理石 — 強い反射・高クリアコート（Panelka風の高級感）
        return { metalness: 0.4, roughness: 0.08, envMapIntensity: 3.5, clearcoat: 0.8, clearcoatRoughness: 0.05 };
      case 'modern':
        // 大判磁器タイル — 強めの反射（モダン空間の光沢感）
        return { metalness: 0.25, roughness: 0.2, envMapIntensity: 2.8, clearcoat: 0.5, clearcoatRoughness: 0.1 };
      case 'retro':
        // チェッカーボードタイル — ワックスがけした光沢
        return { metalness: 0.15, roughness: 0.35, envMapIntensity: 1.5, clearcoat: 0.25, clearcoatRoughness: 0.25 };
      case 'minimal':
        // 白タイル — 控えめな反射
        return { metalness: 0.1, roughness: 0.4, envMapIntensity: 1.2, clearcoat: 0.2, clearcoatRoughness: 0.3 };
      case 'medical':
        // リノリウム — 微かな光沢
        return { metalness: 0.1, roughness: 0.45, envMapIntensity: 1.0, clearcoat: 0.15, clearcoatRoughness: 0.35 };
      case 'cafe':
        // 木目フローリング — ワックスがけした控えめな光沢
        return { metalness: 0.05, roughness: 0.55, envMapIntensity: 0.8, clearcoat: 0.15, clearcoatRoughness: 0.4 };
      case 'scandinavian':
        // ライトオーク — ナチュラルオイル仕上げ
        return { metalness: 0.03, roughness: 0.6, envMapIntensity: 0.6, clearcoat: 0.1, clearcoatRoughness: 0.45 };
      case 'japanese':
        // 畳 — マットだが微かな繊維のツヤ
        return { metalness: 0.0, roughness: 0.85, envMapIntensity: 0.3, clearcoat: 0, clearcoatRoughness: 0 };
      case 'industrial':
        return { metalness: 0.1, roughness: 0.7, envMapIntensity: 0.4, clearcoat: 0, clearcoatRoughness: 0 };
      default:
        return { metalness: 0.0, roughness: 0.9, envMapIntensity: 0.3, clearcoat: 0, clearcoatRoughness: 0 };
    }
  }, [effectiveFloorType]);

  if (!floorGeometry) return null;

  // 反射性のある床タイプは meshPhysicalMaterial を使用（low品質では meshStandardMaterial にフォールバック）
  const usePhysical = REFLECTIVE_FLOORS.has(effectiveFloorType) && qualityLevel !== 'low';
  return (
    <mesh
      geometry={floorGeometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      {usePhysical ? (
        <meshPhysicalMaterial
          map={map}
          normalMap={normalMap ?? undefined}
          normalScale={normalMap ? new THREE.Vector2(0.6, 0.6) : undefined}
          roughnessMap={roughnessMap}
          roughness={roughness}
          metalness={metalness}
          envMapIntensity={envMapIntensity}
          clearcoat={clearcoat}
          clearcoatRoughness={clearcoatRoughness}
        />
      ) : (
        <meshStandardMaterial
          map={map}
          normalMap={normalMap ?? undefined}
          normalScale={normalMap ? new THREE.Vector2(0.6, 0.6) : undefined}
          roughnessMap={roughnessMap}
          roughness={roughness}
          metalness={metalness}
        />
      )}
    </mesh>
  );
}, floorMeshPropsAreEqual);

// ===========================================================================
// テクスチャ描画関数 — メインカラーマップ
// ===========================================================================

/** 1. japanese — 畳風（長方形グリッド、薄い緑ベージュの縁取り） */
function drawTatamiTexture(ctx: CanvasRenderingContext2D, base: string) {
  // イ草の編み目パターン
  for (let y = 0; y < 1024; y += 3) {
    const brightness = (y % 6 < 3) ? -8 : 4;
    ctx.strokeStyle = adjustBrightness(base, brightness);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y + (Math.random() - 0.5) * 0.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 色のムラ
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.fillStyle = adjustBrightness(base, (Math.random() - 0.5) * 12);
    ctx.globalAlpha = 0.2;
    ctx.fillRect(x, y, 1, 3);
  }
  ctx.globalAlpha = 1;

  // 畳の縁（ヘリ）— 長方形グリッド
  const tatamiW = 512;
  const tatamiH = 256;
  ctx.strokeStyle = '#6B5B3C';
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.7;
  for (let x = 0; x <= 1024; x += tatamiW) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let y = 0; y <= 1024; y += tatamiH) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ヘリの装飾模様
  ctx.strokeStyle = '#8B7D5C';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (let x = 0; x <= 1024; x += tatamiW) {
    for (let y = 0; y < 1024; y += 8) {
      ctx.beginPath();
      ctx.moveTo(x - 2, y);
      ctx.lineTo(x + 2, y + 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x - 2, y + 4);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** 2. luxury — 大理石風（白〜グレーの斑模様、微かな金の筋） */
function drawMarbleTexture(ctx: CanvasRenderingContext2D, base: string) {
  // 下地を白〜グレーのグラデーションムラにする
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const radius = 40 + Math.random() * 120;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const v = (Math.random() - 0.5) * 20;
    gradient.addColorStop(0, adjustBrightness(base, v));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalAlpha = 1;

  // 大理石の脈（グレーの筋）
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = adjustBrightness(base, -40 + Math.random() * 20);
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath();
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) {
      const cx1 = x + (Math.random() - 0.5) * 200;
      const cy1 = y + (Math.random() - 0.3) * 150;
      const cx2 = cx1 + (Math.random() - 0.5) * 200;
      const cy2 = cy1 + (Math.random() - 0.3) * 150;
      x = cx2 + (Math.random() - 0.5) * 100;
      y = cy2 + (Math.random() - 0.3) * 100;
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 金の筋（微か）
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = '#C9A84C';
    ctx.lineWidth = 0.3 + Math.random() * 0.7;
    ctx.beginPath();
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (Math.random() - 0.5) * 180;
      y += (Math.random() - 0.3) * 140;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 微細な斑点
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.fillStyle = adjustBrightness(base, (Math.random() - 0.5) * 15);
    ctx.globalAlpha = 0.2;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

/** 3. industrial — コンクリート風（微妙な色ムラ、ピンホール、ひび割れ線） */
function drawConcreteTexture(ctx: CanvasRenderingContext2D, base: string) {
  // 大きな色ムラ（Perlin風）
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const radius = 30 + Math.random() * 100;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, adjustBrightness(base, (Math.random() - 0.5) * 18));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalAlpha = 1;

  // 細かい砂粒/骨材
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const size = Math.random() * 3 + 0.5;
    ctx.fillStyle = adjustBrightness(base, (Math.random() - 0.5) * 22);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;

  // ピンホール（コンクリート打設時の気泡跡）
  for (let i = 0; i < 60; i++) {
    const px = Math.random() * 1024;
    const py = Math.random() * 1024;
    const pr = 0.8 + Math.random() * 2;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = adjustBrightness(base, -25);
    ctx.globalAlpha = 0.3;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ひび割れ
  ctx.strokeStyle = adjustBrightness(base, -30);
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 80;
      y += (Math.random() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 型枠跡（かすかな長方形の痕跡）
  ctx.strokeStyle = adjustBrightness(base, -15);
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 3; i++) {
    const rx = Math.random() * 800;
    const ry = Math.random() * 800;
    const rw = 100 + Math.random() * 200;
    const rh = 60 + Math.random() * 120;
    ctx.strokeRect(rx, ry, rw, rh);
  }
  ctx.globalAlpha = 1;
}

/** 4. modern — 大判タイル風（60cm角グリッド、薄い目地線） */
function drawLargeTileTexture(ctx: CanvasRenderingContext2D, base: string) {
  const tileSize = 154; // ~60cm in 1024px for ~4m repeat
  const groutWidth = 2;
  const groutColor = adjustBrightness(base, 30);

  ctx.fillStyle = groutColor;
  ctx.fillRect(0, 0, 1024, 1024);

  for (let x = 0; x < 1024; x += tileSize) {
    for (let y = 0; y < 1024; y += tileSize) {
      const variation = (Math.random() - 0.5) * 6;
      ctx.fillStyle = adjustBrightness(base, variation);
      ctx.fillRect(
        x + groutWidth,
        y + groutWidth,
        tileSize - groutWidth * 2,
        tileSize - groutWidth * 2
      );

      // タイル表面の微細な模様
      for (let i = 0; i < 12; i++) {
        const sx = x + groutWidth + Math.random() * (tileSize - groutWidth * 2);
        const sy = y + groutWidth + Math.random() * (tileSize - groutWidth * 2);
        ctx.fillStyle = adjustBrightness(base, (Math.random() - 0.5) * 5);
        ctx.globalAlpha = 0.2;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
}

/** 5. cafe — 木目フローリング風（縦方向の木目筋、板の境界線、木目節・グレイン変化） */
function drawWoodFlooringTexture(ctx: CanvasRenderingContext2D, base: string) {
  const plankHeight = 64;
  const plankWidth = 128;

  for (let py = 0; py < 1024; py += plankHeight) {
    const offset = (Math.floor(py / plankHeight) % 2) * (plankWidth / 2);

    for (let px = -plankWidth; px < 1024 + plankWidth; px += plankWidth) {
      const x = px + offset;
      // 板ごとに微妙に異なる色調（グレイン変化）
      const plankHueShift = (Math.random() - 0.5) * 15;
      const plankBase = adjustBrightness(base, plankHueShift);
      ctx.fillStyle = plankBase;
      ctx.fillRect(x, py, plankWidth - 2, plankHeight - 1);

      // 木目の線（縦方向メイン）— 密度と太さを板ごとにバリエーション
      const grainDensity = 5 + Math.random() * 4;
      const grainThickness = 0.3 + Math.random() * 0.4;
      ctx.strokeStyle = adjustBrightness(base, -25 + (Math.random() - 0.5) * 8);
      ctx.lineWidth = grainThickness;
      ctx.globalAlpha = 0.25 + Math.random() * 0.15;
      for (let ly = py + 4; ly < py + plankHeight - 2; ly += grainDensity + Math.random() * 3) {
        ctx.beginPath();
        ctx.moveTo(x + 2, ly);
        const cp1x = x + plankWidth * 0.3;
        const cp1y = ly + (Math.random() - 0.5) * 3;
        const cp2x = x + plankWidth * 0.7;
        const cp2y = ly + (Math.random() - 0.5) * 3;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x + plankWidth - 4, ly + (Math.random() - 0.5) * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 木目の節（knot）— まれに出現（約20%の確率）
      if (Math.random() < 0.2) {
        const knotX = x + plankWidth * (0.2 + Math.random() * 0.6);
        const knotY = py + plankHeight * (0.2 + Math.random() * 0.6);
        const knotR = 2 + Math.random() * 4;
        ctx.beginPath();
        ctx.arc(knotX, knotY, knotR, 0, Math.PI * 2);
        ctx.fillStyle = adjustBrightness(base, -30);
        ctx.globalAlpha = 0.3;
        ctx.fill();
        // 節の周囲の年輪
        ctx.strokeStyle = adjustBrightness(base, -20);
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.15;
        for (let r = knotR + 2; r < knotR + 10; r += 2.5) {
          ctx.beginPath();
          ctx.arc(knotX, knotY, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // 板の継ぎ目
      ctx.strokeStyle = adjustBrightness(base, -35);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + plankHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 横の継ぎ目
    ctx.strokeStyle = adjustBrightness(base, -30);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(1024, py);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** 6. minimal — 白タイル風（薄い目地のみ） */
function drawWhiteTileTexture(ctx: CanvasRenderingContext2D, base: string) {
  const tileSize = 128;
  const groutWidth = 1;
  const groutColor = adjustBrightness(base, -12);

  // 目地線のみ、控えめに
  ctx.strokeStyle = groutColor;
  ctx.lineWidth = groutWidth;
  ctx.globalAlpha = 0.35;
  for (let x = 0; x <= 1024; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let y = 0; y <= 1024; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // タイルごとの極わずかな色ムラ
  for (let x = 0; x < 1024; x += tileSize) {
    for (let y = 0; y < 1024; y += tileSize) {
      const v = (Math.random() - 0.5) * 4;
      ctx.fillStyle = adjustBrightness(base, v);
      ctx.globalAlpha = 0.15;
      ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
    }
  }
  ctx.globalAlpha = 1;
}

/** 7. scandinavian — ライトオーク木目風（明るい木目筋、自然なグレイン変化） */
function drawLightOakTexture(ctx: CanvasRenderingContext2D, base: string) {
  const plankHeight = 80;
  const plankWidth = 160;

  for (let py = 0; py < 1024; py += plankHeight) {
    const offset = (Math.floor(py / plankHeight) % 2) * (plankWidth / 2);

    for (let px = -plankWidth; px < 1024 + plankWidth; px += plankWidth) {
      const x = px + offset;
      // 板ごとの色調バリエーション（自然な無垢材感）
      const plankShift = (Math.random() - 0.5) * 10;
      ctx.fillStyle = adjustBrightness(base, plankShift);
      ctx.fillRect(x, py, plankWidth - 2, plankHeight - 1);

      // 明るい木目の線（板ごとにグレイン密度を変化）
      const grainSpacing = 6 + Math.random() * 5;
      ctx.strokeStyle = adjustBrightness(base, -15 + (Math.random() - 0.5) * 5);
      ctx.lineWidth = 0.3 + Math.random() * 0.3;
      ctx.globalAlpha = 0.2 + Math.random() * 0.1;
      for (let ly = py + 5; ly < py + plankHeight - 3; ly += grainSpacing + Math.random() * 3) {
        ctx.beginPath();
        ctx.moveTo(x + 2, ly);
        const cp1x = x + plankWidth * 0.3;
        const cp1y = ly + (Math.random() - 0.5) * 2;
        const cp2x = x + plankWidth * 0.7;
        const cp2y = ly + (Math.random() - 0.5) * 2;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x + plankWidth - 4, ly + (Math.random() - 0.5) * 1.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 微細な節（knot）— 10%の確率で小さめの節
      if (Math.random() < 0.1) {
        const knotX = x + plankWidth * (0.25 + Math.random() * 0.5);
        const knotY = py + plankHeight * (0.25 + Math.random() * 0.5);
        const knotR = 1.5 + Math.random() * 2.5;
        ctx.beginPath();
        ctx.arc(knotX, knotY, knotR, 0, Math.PI * 2);
        ctx.fillStyle = adjustBrightness(base, -20);
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 板の継ぎ目（薄い）
      ctx.strokeStyle = adjustBrightness(base, -20);
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + plankHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 横の継ぎ目
    ctx.strokeStyle = adjustBrightness(base, -18);
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(1024, py);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 明るいハイライトで木肌の質感
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.fillStyle = adjustBrightness(base, 12);
    ctx.globalAlpha = 0.15;
    ctx.fillRect(x, y, Math.random() * 3 + 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** 8. retro — チェッカーボード風（2色交互） */
function drawCheckerboardTexture(ctx: CanvasRenderingContext2D, base: string) {
  const tileSize = 128;
  const colorA = base;
  const colorB = adjustBrightness(base, 35);

  for (let x = 0; x < 1024; x += tileSize) {
    for (let y = 0; y < 1024; y += tileSize) {
      const isEven = ((x / tileSize) + (y / tileSize)) % 2 === 0;
      const tileColor = isEven ? colorA : colorB;
      const variation = (Math.random() - 0.5) * 6;
      ctx.fillStyle = adjustBrightness(tileColor, variation);
      ctx.fillRect(x, y, tileSize, tileSize);

      // エイジング風の微細な汚れ
      for (let i = 0; i < 8; i++) {
        const sx = x + Math.random() * tileSize;
        const sy = y + Math.random() * tileSize;
        ctx.fillStyle = adjustBrightness(tileColor, -15);
        ctx.globalAlpha = 0.06;
        const r = Math.random() * 4 + 1;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // 薄い目地線
  ctx.strokeStyle = adjustBrightness(base, -25);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.2;
  for (let x = 0; x <= 1024; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let y = 0; y <= 1024; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 9. medical — リノリウム風（微かなスペックル模様） */
function drawLinoleumTexture(ctx: CanvasRenderingContext2D, base: string) {
  // 均一な下地にスペックル（粒状の斑点）
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const size = Math.random() * 2 + 0.5;
    const v = (Math.random() - 0.5) * 12;
    ctx.fillStyle = adjustBrightness(base, v);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;

  // 大きめの色ムラ（控えめ）
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const radius = 30 + Math.random() * 50;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, adjustBrightness(base, (Math.random() - 0.5) * 8));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalAlpha = 1;
}

// ===========================================================================
// ノーマルマップ描画
// ===========================================================================

function drawTatamiNormal(ctx: CanvasRenderingContext2D) {
  // イ草の編み目パターン — 横方向のバリエーションを追加してリアルに
  for (let y = 0; y < 512; y += 3) {
    const baseR = 128 + (y % 6 < 3 ? -8 : 6);
    for (let x = 0; x < 512; x += 16) {
      const noise = (Math.random() - 0.5) * 4;
      const r = Math.max(100, Math.min(156, baseR + noise));
      const g = Math.max(100, Math.min(156, 128 + (Math.random() - 0.5) * 3));
      ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
      ctx.fillRect(x, y, 16, 3);
    }
  }
  // 微細な繊維方向のノイズ
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 128 + (Math.random() - 0.5) * 12;
    const g = 128 + (Math.random() - 0.5) * 12;
    ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
    ctx.fillRect(x, y, 1, 2);
  }
  // 縁の溝（深い法線で立体的に）
  ctx.strokeStyle = '#5050FF';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.stroke();
  for (let y = 0; y <= 512; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  // 縁のハイライト側（片側を明るくして立体感）
  ctx.strokeStyle = '#9090FF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(258, 0);
  ctx.lineTo(258, 512);
  ctx.stroke();
  for (let y = 0; y <= 512; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y + 3);
    ctx.lineTo(512, y + 3);
    ctx.stroke();
  }
}

function drawMarbleNormal(ctx: CanvasRenderingContext2D) {
  // ほぼフラット、わずかなうねり
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 128 + (Math.random() - 0.5) * 10;
    const g = 128 + (Math.random() - 0.5) * 10;
    ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawConcreteNormal(ctx: CanvasRenderingContext2D) {
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 128 + (Math.random() - 0.5) * 30;
    const g = 128 + (Math.random() - 0.5) * 30;
    ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
    ctx.fillRect(x, y, 3, 3);
  }
}

function drawTileNormal(ctx: CanvasRenderingContext2D, tileSize: number) {
  ctx.strokeStyle = '#6060FF';
  ctx.lineWidth = 3;
  for (let x = 0; x < 512; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y < 512; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
}

function drawWoodNormal(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#7070FF';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }
}

function drawCheckerNormal(ctx: CanvasRenderingContext2D) {
  // 目地の溝
  const tileSize = 64;
  ctx.strokeStyle = '#6868FF';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 512; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y <= 512; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
}

function drawLinoleumNormal(ctx: CanvasRenderingContext2D) {
  // ほぼフラット、極微細なザラつき
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 128 + (Math.random() - 0.5) * 8;
    const g = 128 + (Math.random() - 0.5) * 8;
    ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
    ctx.fillRect(x, y, 2, 2);
  }
}

// ===========================================================================
// ラフネスマップ描画
// ===========================================================================

function drawTatamiRoughness(ctx: CanvasRenderingContext2D) {
  const baseVal = 242;
  ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const v = baseVal + (Math.random() - 0.5) * 15;
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    ctx.fillRect(0, y, 256, 2);
  }
}

function drawMarbleRoughness(ctx: CanvasRenderingContext2D) {
  // 磨かれた大理石 — 非常に低ラフネス（強い鏡面反射）
  const baseVal = 35;
  ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
  ctx.fillRect(0, 0, 256, 256);
  // 脈に沿ったわずかなラフネス変化
  for (let i = 0; i < 60; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const v = baseVal + (Math.random() - 0.5) * 15;
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    ctx.fillRect(px, py, 3, 3);
  }
  // 磨きムラ（広い範囲の微妙な光沢差）
  for (let i = 0; i < 6; i++) {
    const cx = Math.random() * 256;
    const cy = Math.random() * 256;
    const radius = 20 + Math.random() * 40;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgb(${baseVal + 10}, ${baseVal + 10}, ${baseVal + 10})`);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.globalAlpha = 1;
}

function drawConcreteRoughness(ctx: CanvasRenderingContext2D) {
  const baseVal = 217;
  ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const v = baseVal + (Math.random() - 0.5) * 40;
    const size = Math.random() * 6 + 2;
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    ctx.fillRect(px, py, size, size);
  }
  // 磨かれたスポット
  for (let i = 0; i < 8; i++) {
    const cx = Math.random() * 256;
    const cy = Math.random() * 256;
    const radius = 15 + Math.random() * 25;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgb(${baseVal - 50}, ${baseVal - 50}, ${baseVal - 50})`);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.globalAlpha = 1;
}

function drawTileRoughness(ctx: CanvasRenderingContext2D, tileSize: number) {
  const baseVal = 102;
  ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgb(200, 200, 200)';
  for (let x = 0; x < 256; x += tileSize) {
    ctx.fillRect(x, 0, 3, 256);
  }
  for (let y = 0; y < 256; y += tileSize) {
    ctx.fillRect(0, y, 256, 3);
  }
  for (let i = 0; i < 100; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const v = baseVal + (Math.random() - 0.5) * 20;
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    ctx.fillRect(px, py, 4, 4);
  }
}

function drawWoodRoughness(ctx: CanvasRenderingContext2D) {
  const baseVal = 178;
  ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgb(230, 230, 230)';
  for (let y = 0; y < 256; y += 32) {
    ctx.fillRect(0, y, 256, 2);
  }
  // グレイン方向のラフネス変化（木目に沿った微妙な質感差）
  for (let y = 0; y < 256; y += 4) {
    const v = baseVal + (Math.random() - 0.5) * 40;
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.2)`;
    ctx.fillRect(0, y, 256, 3);
  }
  // 板ごとのラフネス差（ワックスのムラ）
  for (let x = 0; x < 256; x += 64) {
    const plankRoughness = baseVal + (Math.random() - 0.5) * 30;
    ctx.fillStyle = `rgba(${plankRoughness}, ${plankRoughness}, ${plankRoughness}, 0.1)`;
    ctx.fillRect(x, 0, 62, 256);
    ctx.fillStyle = 'rgb(220, 220, 220)';
    ctx.fillRect(x, 0, 2, 256);
  }
  // 微細なスペックル（木肌の質感）
  for (let i = 0; i < 100; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const v = baseVal + (Math.random() - 0.5) * 50;
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    ctx.fillRect(px, py, 2, 1);
  }
}

function drawCheckerRoughness(ctx: CanvasRenderingContext2D) {
  // 2色で微妙にラフネスが違う
  const tileSize = 32;
  for (let x = 0; x < 256; x += tileSize) {
    for (let y = 0; y < 256; y += tileSize) {
      const isEven = ((x / tileSize) + (y / tileSize)) % 2 === 0;
      const v = isEven ? 140 : 120;
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.fillRect(x, y, tileSize, tileSize);
    }
  }
}

function drawLinoleumRoughness(ctx: CanvasRenderingContext2D) {
  // リノリウム — やや滑らか
  const baseVal = 130;
  ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 150; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const v = baseVal + (Math.random() - 0.5) * 15;
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    ctx.fillRect(px, py, 2, 2);
  }
}

// ===========================================================================
// ユーティリティ
// ===========================================================================

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
