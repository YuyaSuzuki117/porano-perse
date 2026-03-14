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

  // 品質連動テクスチャ解像度: low=256, medium=512, high=1024
  const floorTexSize = res.floor;

  const map = useMemo(() => {
    const S = floorTexSize;
    const cacheKey = `floor-map-${effectiveTextureType}-${effectiveColor}-${S}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    const base = effectiveColor;

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, S, S);

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
      case 'herringbone':
        drawHerringboneTexture(ctx, base);
        break;
      case 'chevron':
        drawChevronTexture(ctx, base);
        break;
      case 'basketweave':
        drawBasketWeaveTexture(ctx, base);
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
  }, [effectiveColor, effectiveTextureType, roundedW, roundedD, floorTexSize]);

  const normalMap = useMemo(() => {
    if (!res.useNormalMap) {
      return null;
    }
    // 品質連動ノーマルマップ解像度: HIGH=1024, MEDIUM=512
    const normalSize = qualityLevel === 'high' ? 1024 : 512;
    const cacheKey = `floor-normal-${effectiveTextureType}-${normalSize}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = normalSize;
    canvas.height = normalSize;
    const ctx = canvas.getContext('2d')!;
    // 描画関数は512ベースなのでスケーリングで対応
    const scaleFactor = normalSize / 512;
    if (scaleFactor !== 1) ctx.scale(scaleFactor, scaleFactor);
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
      case 'herringbone':
      case 'chevron':
      case 'basketweave':
        drawWoodNormal(ctx);
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
  }, [effectiveTextureType, roundedW, roundedD, res.useNormalMap, qualityLevel]);

  const roughnessMap = useMemo(() => {
    // 品質連動ラフネスマップ解像度: HIGH=512, MEDIUM=256
    const roughSize = qualityLevel === 'high' ? 512 : 256;
    const cacheKey = `floor-roughness-${effectiveTextureType}-${roughSize}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = roughSize;
    canvas.height = roughSize;
    const ctx = canvas.getContext('2d')!;
    // 描画関数は256ベースなのでスケーリングで対応
    const scaleFactor = roughSize / 256;
    if (scaleFactor !== 1) ctx.scale(scaleFactor, scaleFactor);

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
      case 'herringbone':
      case 'chevron':
      case 'basketweave':
        drawWoodRoughness(ctx);
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
  }, [effectiveTextureType, roundedW, roundedD, qualityLevel]);

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

  // high品質時: テクスチャの異方性フィルタリングを最大化（斜め視点でもシャープ）
  useMemo(() => {
    if (qualityLevel === 'high') {
      const maxAniso = 16;
      if (map) map.anisotropy = maxAniso;
      if (normalMap) normalMap.anisotropy = maxAniso;
      if (roughnessMap) roughnessMap.anisotropy = maxAniso;
    }
  }, [qualityLevel, map, normalMap, roughnessMap]);

  // 反射性のある床タイプ: marble, tile, checkerboard, linoleum, 木目(clearcoat)
  const REFLECTIVE_FLOORS = new Set(['luxury', 'modern', 'retro', 'minimal', 'medical', 'cafe', 'scandinavian', 'herringbone', 'chevron', 'basketweave']);

  const { metalness, roughness, envMapIntensity, clearcoat, clearcoatRoughness } = useMemo(() => {
    // high品質ではポリッシュ系床の反射をさらに強化
    const isHigh = qualityLevel === 'high';
    switch (effectiveFloorType) {
      case 'luxury':
        // 磨き大理石 — 非常に強い反射 (high品質でさらに強化)
        return {
          metalness: isHigh ? 0.4 : 0.4,
          roughness: isHigh ? 0.1 : 0.08,
          envMapIntensity: isHigh ? 2.4 : 3.5,
          clearcoat: isHigh ? 0.5 : 0.8,
          clearcoatRoughness: isHigh ? 0.1 : 0.05,
        };
      case 'modern':
        // 大判磁器タイル — 反射強化 (polished)
        return {
          metalness: isHigh ? 0.25 : 0.25,
          roughness: isHigh ? 0.15 : 0.2,
          envMapIntensity: isHigh ? 1.8 : 2.8,
          clearcoat: isHigh ? 0.3 : 0.5,
          clearcoatRoughness: isHigh ? 0.2 : 0.1,
        };
      case 'medical':
        // リノリウム — ポリッシュ床 (high品質で反射強化)
        return {
          metalness: isHigh ? 0.1 : 0.1,
          roughness: isHigh ? 0.25 : 0.45,
          envMapIntensity: isHigh ? 1.8 : 1.0,
          clearcoat: isHigh ? 0.3 : 0.15,
          clearcoatRoughness: isHigh ? 0.2 : 0.35,
        };
      case 'retro':
        // チェッカーボードタイル — ワックスがけした光沢
        return { metalness: 0.15, roughness: 0.35, envMapIntensity: isHigh ? 1.8 : 1.5, clearcoat: 0.25, clearcoatRoughness: 0.25 };
      case 'minimal':
        // 白タイル — 控えめな反射
        return { metalness: 0.1, roughness: 0.4, envMapIntensity: isHigh ? 1.44 : 1.2, clearcoat: 0.2, clearcoatRoughness: 0.3 };
      case 'cafe':
        // 木目フローリング — ワックスがけした控えめな光沢
        return { metalness: 0.05, roughness: 0.55, envMapIntensity: isHigh ? 0.96 : 0.8, clearcoat: 0.15, clearcoatRoughness: 0.4 };
      case 'scandinavian':
        // ライトオーク — ナチュラルオイル仕上げ
        return { metalness: 0.03, roughness: 0.6, envMapIntensity: isHigh ? 0.72 : 0.6, clearcoat: 0.1, clearcoatRoughness: 0.45 };
      case 'japanese':
        // 畳 — マットだが微かな繊維のツヤ
        return { metalness: 0.0, roughness: 0.85, envMapIntensity: isHigh ? 0.36 : 0.3, clearcoat: 0, clearcoatRoughness: 0 };
      case 'industrial':
        // コンクリート打ちっぱなし — 非常にマット
        return { metalness: 0.05, roughness: 0.92, envMapIntensity: isHigh ? 0.3 : 0.25, clearcoat: 0, clearcoatRoughness: 0 };
      case 'herringbone':
        // ヘリンボーン木目 — ワックスがけした高級木床
        return { metalness: 0.05, roughness: 0.45, envMapIntensity: isHigh ? 1.2 : 1.0, clearcoat: 0.2, clearcoatRoughness: 0.3 };
      case 'chevron':
        // シェブロン木目 — モダンな光沢
        return { metalness: 0.06, roughness: 0.4, envMapIntensity: isHigh ? 1.44 : 1.2, clearcoat: 0.25, clearcoatRoughness: 0.25 };
      case 'basketweave':
        // 市松模様 — 伝統的な木床
        return { metalness: 0.03, roughness: 0.55, envMapIntensity: isHigh ? 0.84 : 0.7, clearcoat: 0.1, clearcoatRoughness: 0.4 };
      default:
        return { metalness: 0.0, roughness: 0.9, envMapIntensity: isHigh ? 0.36 : 0.3, clearcoat: 0, clearcoatRoughness: 0 };
    }
  }, [effectiveFloorType, qualityLevel]);

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
          normalScale={normalMap ? new THREE.Vector2(0.5, 0.5) : undefined}
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
          normalScale={normalMap ? new THREE.Vector2(0.5, 0.5) : undefined}
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

/** 3. industrial — コンクリート風（骨材質感、ピンホール、細いひび割れ、型枠跡） */
function drawConcreteTexture(ctx: CanvasRenderingContext2D, base: string) {
  // 大きな色ムラ（Perlin風の波状）
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const radius = 30 + Math.random() * 120;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, adjustBrightness(base, (Math.random() - 0.5) * 20));
    gradient.addColorStop(0.6, adjustBrightness(base, (Math.random() - 0.5) * 10));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.globalAlpha = 1;

  // 骨材（大きめの砂利粒 — 丸い形状でリアルに）
  for (let i = 0; i < 120; i++) {
    const ax = Math.random() * 1024;
    const ay = Math.random() * 1024;
    const ar = 1.5 + Math.random() * 3.5;
    const agregate = ctx.createRadialGradient(ax, ay, 0, ax, ay, ar);
    const abrightness = (Math.random() - 0.5) * 30;
    agregate.addColorStop(0, adjustBrightness(base, abrightness + 5));
    agregate.addColorStop(0.7, adjustBrightness(base, abrightness));
    agregate.addColorStop(1, adjustBrightness(base, abrightness - 5));
    ctx.fillStyle = agregate;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(ax, ay, ar, ar * (0.7 + Math.random() * 0.3), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 細かい砂粒
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const size = Math.random() * 2.5 + 0.5;
    ctx.fillStyle = adjustBrightness(base, (Math.random() - 0.5) * 22);
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;

  // ピンホール（気泡跡 — グラデーション付きで深さ表現）
  for (let i = 0; i < 70; i++) {
    const px = Math.random() * 1024;
    const py = Math.random() * 1024;
    const pr = 0.8 + Math.random() * 2.5;
    const pinholeGrad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    pinholeGrad.addColorStop(0, adjustBrightness(base, -35));
    pinholeGrad.addColorStop(0.6, adjustBrightness(base, -25));
    pinholeGrad.addColorStop(1, adjustBrightness(base, -10));
    ctx.fillStyle = pinholeGrad;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 細いひび割れ（分岐するリアルなパターン）
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = adjustBrightness(base, -35);
    ctx.lineWidth = 0.3 + Math.random() * 0.4;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    ctx.moveTo(x, y);
    const angle = Math.random() * Math.PI * 2;
    const segments = 6 + Math.floor(Math.random() * 4);
    for (let j = 0; j < segments; j++) {
      const stepLen = 15 + Math.random() * 40;
      const jitter = (Math.random() - 0.5) * 0.8;
      x += Math.cos(angle + jitter) * stepLen;
      y += Math.sin(angle + jitter) * stepLen;
      ctx.lineTo(x, y);
      // 分岐（20%確率）
      if (Math.random() < 0.2) {
        const bx = x + (Math.random() - 0.5) * 30;
        const by = y + (Math.random() - 0.5) * 30;
        ctx.moveTo(x, y);
        ctx.lineTo(bx, by);
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 型枠跡（かすかな長方形の痕跡）
  ctx.strokeStyle = adjustBrightness(base, -12);
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 3; i++) {
    const rx = Math.random() * 800;
    const ry = Math.random() * 800;
    const rw = 100 + Math.random() * 200;
    const rh = 60 + Math.random() * 120;
    ctx.strokeRect(rx, ry, rw, rh);
  }
  ctx.globalAlpha = 1;

  // 水染み跡（大きな薄い染み）
  for (let i = 0; i < 3; i++) {
    const sx = Math.random() * 1024;
    const sy = Math.random() * 1024;
    const sr = 40 + Math.random() * 80;
    const stainGrad = ctx.createRadialGradient(sx, sy, sr * 0.3, sx, sy, sr);
    stainGrad.addColorStop(0, adjustBrightness(base, -8));
    stainGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = stainGrad;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 4. modern — 大判タイル風（60cm角グリッド、目地の陰影強調、タイル表面の微妙な色ムラ） */
function drawLargeTileTexture(ctx: CanvasRenderingContext2D, base: string) {
  const tileSize = 154; // ~60cm in 1024px for ~4m repeat
  const groutWidth = 3;
  const groutColor = adjustBrightness(base, 25);

  // 目地ベース
  ctx.fillStyle = groutColor;
  ctx.fillRect(0, 0, 1024, 1024);

  for (let x = 0; x < 1024; x += tileSize) {
    for (let y = 0; y < 1024; y += tileSize) {
      const variation = (Math.random() - 0.5) * 6;
      const tileBase = adjustBrightness(base, variation);
      ctx.fillStyle = tileBase;
      ctx.fillRect(
        x + groutWidth,
        y + groutWidth,
        tileSize - groutWidth * 2,
        tileSize - groutWidth * 2
      );

      // タイル表面の微妙な色ムラ（放射状グラデーション）
      for (let i = 0; i < 4; i++) {
        const cx = x + groutWidth + Math.random() * (tileSize - groutWidth * 2);
        const cy = y + groutWidth + Math.random() * (tileSize - groutWidth * 2);
        const radius = 15 + Math.random() * 30;
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, adjustBrightness(tileBase, (Math.random() - 0.5) * 8));
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.15;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }

      // 微細なスペックル（磁器質感）
      for (let i = 0; i < 18; i++) {
        const sx = x + groutWidth + Math.random() * (tileSize - groutWidth * 2);
        const sy = y + groutWidth + Math.random() * (tileSize - groutWidth * 2);
        ctx.fillStyle = adjustBrightness(tileBase, (Math.random() - 0.5) * 6);
        ctx.globalAlpha = 0.15;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;

      // 目地の陰影（暗い側 + 明るい側で立体感）
      ctx.strokeStyle = adjustBrightness(base, -20);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.3;
      // 下と右の辺（影側）
      ctx.beginPath();
      ctx.moveTo(x + groutWidth, y + tileSize - groutWidth);
      ctx.lineTo(x + tileSize - groutWidth, y + tileSize - groutWidth);
      ctx.lineTo(x + tileSize - groutWidth, y + groutWidth);
      ctx.stroke();
      // 上と左の辺（光側）
      ctx.strokeStyle = adjustBrightness(base, 12);
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(x + groutWidth, y + tileSize - groutWidth);
      ctx.lineTo(x + groutWidth, y + groutWidth);
      ctx.lineTo(x + tileSize - groutWidth, y + groutWidth);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/** 5. cafe — 木目フローリング風（Perlinノイズ風なめらか木目、年輪曲線、節目、plank色バリエーション） */
function drawWoodFlooringTexture(ctx: CanvasRenderingContext2D, base: string) {
  const plankHeight = 64;
  const plankWidth = 128;

  // plankベースカラーパレット（3-4色からランダム選択で自然な無垢材感）
  const plankBaseColors = [
    adjustBrightness(base, 0),
    adjustBrightness(base, -8),
    adjustBrightness(base, 6),
    adjustBrightness(base, -15),
  ];

  for (let py = 0; py < 1024; py += plankHeight) {
    const offset = (Math.floor(py / plankHeight) % 2) * (plankWidth / 2);

    for (let px = -plankWidth; px < 1024 + plankWidth; px += plankWidth) {
      const x = px + offset;
      // 板ごとに異なるベースカラー（パレットからランダム選択）
      const plankBaseColor = plankBaseColors[Math.floor(Math.random() * plankBaseColors.length)];
      const plankFineShift = (Math.random() - 0.5) * 5;
      const plankBase = adjustBrightness(plankBaseColor, plankFineShift);
      ctx.fillStyle = plankBase;
      ctx.fillRect(x, py, plankWidth - 2, plankHeight - 1);

      // 木目グラデーション（Perlinノイズ風のなめらかな縞模様）
      const grainPhase = Math.random() * Math.PI * 2;
      const grainFreq = 0.08 + Math.random() * 0.06;
      const grainAmp = 8 + Math.random() * 6;
      for (let ly = py; ly < py + plankHeight; ly += 1) {
        const wave = Math.sin(grainPhase + ly * grainFreq) * grainAmp;
        const wave2 = Math.sin(grainPhase * 1.7 + ly * grainFreq * 2.3) * grainAmp * 0.3;
        const brightness = wave + wave2;
        ctx.fillStyle = adjustBrightness(plankBase, brightness);
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x + 2, ly, plankWidth - 4, 1);
      }
      ctx.globalAlpha = 1;

      // 木目の線（縦方向メイン）— 密度と太さを板ごとにバリエーション
      const grainDensity = 4 + Math.random() * 3;
      const grainThickness = 0.3 + Math.random() * 0.5;
      ctx.strokeStyle = adjustBrightness(plankBase, -22 + (Math.random() - 0.5) * 6);
      ctx.lineWidth = grainThickness;
      ctx.globalAlpha = 0.2 + Math.random() * 0.12;
      for (let ly = py + 3; ly < py + plankHeight - 2; ly += grainDensity + Math.random() * 2.5) {
        ctx.beginPath();
        ctx.moveTo(x + 2, ly);
        const cp1x = x + plankWidth * 0.25;
        const cp1y = ly + (Math.random() - 0.5) * 2.5;
        const cp2x = x + plankWidth * 0.5;
        const cp2y = ly + (Math.random() - 0.5) * 3;
        const cp3x = x + plankWidth * 0.75;
        const cp3y = ly + (Math.random() - 0.5) * 2.5;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, cp3x, cp3y);
        ctx.bezierCurveTo(cp3x, cp3y, x + plankWidth * 0.88, ly + (Math.random() - 0.5) * 2, x + plankWidth - 3, ly + (Math.random() - 0.5) * 1.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 木目の節（knot）— まれに出現（約15%の確率）+ 年輪パターン強化
      if (Math.random() < 0.15) {
        const knotX = x + plankWidth * (0.2 + Math.random() * 0.6);
        const knotY = py + plankHeight * (0.2 + Math.random() * 0.6);
        const knotR = 2.5 + Math.random() * 5;
        // 節の中心（暗い）
        const knotGrad = ctx.createRadialGradient(knotX, knotY, 0, knotX, knotY, knotR);
        knotGrad.addColorStop(0, adjustBrightness(plankBase, -45));
        knotGrad.addColorStop(0.6, adjustBrightness(plankBase, -30));
        knotGrad.addColorStop(1, adjustBrightness(plankBase, -15));
        ctx.fillStyle = knotGrad;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(knotX, knotY, knotR, 0, Math.PI * 2);
        ctx.fill();
        // 年輪の同心楕円（自然なゆがみ付き）
        ctx.strokeStyle = adjustBrightness(plankBase, -18);
        ctx.lineWidth = 0.4;
        ctx.globalAlpha = 0.2;
        for (let r = knotR + 1.5; r < knotR + 16; r += 1.8 + Math.random() * 1.2) {
          ctx.beginPath();
          const rx = r * (0.9 + Math.random() * 0.2);
          const ry = r * (0.7 + Math.random() * 0.3);
          ctx.ellipse(knotX, knotY, rx, ry, Math.random() * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // plank間の溝（暗い細線 + ハイライト側で立体感）
      ctx.strokeStyle = adjustBrightness(base, -40);
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + plankHeight);
      ctx.stroke();
      // 溝のハイライト側
      ctx.strokeStyle = adjustBrightness(base, 8);
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(x + 1.5, py);
      ctx.lineTo(x + 1.5, py + plankHeight);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 横の継ぎ目（暗線 + ハイライト）
    ctx.strokeStyle = adjustBrightness(base, -35);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(1024, py);
    ctx.stroke();
    ctx.strokeStyle = adjustBrightness(base, 8);
    ctx.lineWidth = 0.4;
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(0, py + 1.2);
    ctx.lineTo(1024, py + 1.2);
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

/** 7. scandinavian — ライトオーク木目風（明るい木目筋、自然なグレイン変化、plank色バリエーション） */
function drawLightOakTexture(ctx: CanvasRenderingContext2D, base: string) {
  const plankHeight = 80;
  const plankWidth = 160;

  // ライトオーク用パレット（明るめの3色）
  const oakColors = [
    adjustBrightness(base, 0),
    adjustBrightness(base, -5),
    adjustBrightness(base, 4),
  ];

  for (let py = 0; py < 1024; py += plankHeight) {
    const offset = (Math.floor(py / plankHeight) % 2) * (plankWidth / 2);

    for (let px = -plankWidth; px < 1024 + plankWidth; px += plankWidth) {
      const x = px + offset;
      // 板ごとのパレット選択
      const plankBase = oakColors[Math.floor(Math.random() * oakColors.length)];
      const fineShift = (Math.random() - 0.5) * 4;
      ctx.fillStyle = adjustBrightness(plankBase, fineShift);
      ctx.fillRect(x, py, plankWidth - 2, plankHeight - 1);

      // なめらかな木目グラデーション
      const grainPhase = Math.random() * Math.PI * 2;
      const grainFreq = 0.06 + Math.random() * 0.04;
      for (let ly = py; ly < py + plankHeight; ly += 1) {
        const wave = Math.sin(grainPhase + ly * grainFreq) * 6;
        ctx.fillStyle = adjustBrightness(plankBase, wave + fineShift);
        ctx.globalAlpha = 0.12;
        ctx.fillRect(x + 2, ly, plankWidth - 4, 1);
      }
      ctx.globalAlpha = 1;

      // 明るい木目の線
      const grainSpacing = 5 + Math.random() * 4;
      ctx.strokeStyle = adjustBrightness(plankBase, -12 + (Math.random() - 0.5) * 4);
      ctx.lineWidth = 0.3 + Math.random() * 0.3;
      ctx.globalAlpha = 0.18 + Math.random() * 0.08;
      for (let ly = py + 4; ly < py + plankHeight - 3; ly += grainSpacing + Math.random() * 2.5) {
        ctx.beginPath();
        ctx.moveTo(x + 2, ly);
        const cp1x = x + plankWidth * 0.3;
        const cp1y = ly + (Math.random() - 0.5) * 1.8;
        const cp2x = x + plankWidth * 0.7;
        const cp2y = ly + (Math.random() - 0.5) * 1.8;
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x + plankWidth - 4, ly + (Math.random() - 0.5) * 1.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 微細な節 + 年輪
      if (Math.random() < 0.1) {
        const knotX = x + plankWidth * (0.25 + Math.random() * 0.5);
        const knotY = py + plankHeight * (0.25 + Math.random() * 0.5);
        const knotR = 1.5 + Math.random() * 2.5;
        const knotGrad = ctx.createRadialGradient(knotX, knotY, 0, knotX, knotY, knotR);
        knotGrad.addColorStop(0, adjustBrightness(plankBase, -25));
        knotGrad.addColorStop(1, adjustBrightness(plankBase, -10));
        ctx.fillStyle = knotGrad;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(knotX, knotY, knotR, 0, Math.PI * 2);
        ctx.fill();
        // 小さな年輪
        ctx.strokeStyle = adjustBrightness(plankBase, -12);
        ctx.lineWidth = 0.3;
        ctx.globalAlpha = 0.12;
        for (let r = knotR + 1; r < knotR + 8; r += 1.5) {
          ctx.beginPath();
          ctx.arc(knotX, knotY, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // plank溝（暗線 + 光側）
      ctx.strokeStyle = adjustBrightness(base, -22);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + plankHeight);
      ctx.stroke();
      ctx.strokeStyle = adjustBrightness(base, 6);
      ctx.lineWidth = 0.4;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(x + 1.2, py);
      ctx.lineTo(x + 1.2, py + plankHeight);
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
    const lx = Math.random() * 1024;
    const ly = Math.random() * 1024;
    ctx.fillStyle = adjustBrightness(base, 10);
    ctx.globalAlpha = 0.12;
    ctx.fillRect(lx, ly, Math.random() * 3 + 1, 1);
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

/** 10. herringbone — ヘリンボーン（45°交互配置の木目板） */
function drawHerringboneTexture(ctx: CanvasRenderingContext2D, base: string) {
  // プランクサイズ（テクスチャスケール）
  const plankW = 82;  // ≈0.08m比率
  const plankH = 410; // ≈0.4m比率
  const halfW = plankW / 2;

  // 木目用のカラーパレット
  const colors = [
    adjustBrightness(base, 0),
    adjustBrightness(base, -8),
    adjustBrightness(base, 5),
    adjustBrightness(base, -14),
    adjustBrightness(base, 3),
  ];

  ctx.save();
  // 45度回転パターンで描画
  // 行ごとに左右交互に45度/-45度の板を配置
  const step = plankW;
  for (let row = -20; row < 30; row++) {
    for (let col = -20; col < 30; col++) {
      const isEven = (row + col) % 2 === 0;
      const cx = col * step;
      const cy = row * step;
      const plankColor = colors[Math.abs((row * 7 + col * 13) % colors.length)];
      const variation = ((row * 3 + col * 5) % 7 - 3) * 1.5;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(isEven ? Math.PI / 4 : -Math.PI / 4);

      // プランクベース
      ctx.fillStyle = adjustBrightness(plankColor, variation);
      ctx.fillRect(-halfW, -plankH / 2, plankW, plankH);

      // 木目ライン
      ctx.strokeStyle = adjustBrightness(plankColor, -18);
      ctx.lineWidth = 0.4;
      ctx.globalAlpha = 0.2;
      const grainSpacing = 4 + (Math.abs(row + col) % 3);
      for (let g = -plankH / 2 + 3; g < plankH / 2 - 3; g += grainSpacing) {
        ctx.beginPath();
        ctx.moveTo(-halfW + 2, g);
        ctx.lineTo(halfW - 2, g + ((row * col) % 3 - 1) * 0.8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // プランク境界線
      ctx.strokeStyle = adjustBrightness(base, -35);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.strokeRect(-halfW, -plankH / 2, plankW, plankH);
      ctx.globalAlpha = 1;

      ctx.restore();
    }
  }
  ctx.restore();
}

/** 11. chevron — シェブロン（V字パターンの木目板） */
function drawChevronTexture(ctx: CanvasRenderingContext2D, base: string) {
  const plankW = 64;
  const plankH = 300;
  const halfH = plankH / 2;

  const colors = [
    adjustBrightness(base, 0),
    adjustBrightness(base, -10),
    adjustBrightness(base, 6),
    adjustBrightness(base, -6),
  ];

  ctx.save();
  // V字パターン: 中心線を挟んで左右45度で配置
  const vWidth = plankH * Math.cos(Math.PI / 4); // V字1列の幅
  const rowHeight = plankW;

  for (let row = -10; row < 20; row++) {
    for (let vCol = -5; vCol < 10; vCol++) {
      const baseX = vCol * vWidth * 2;
      const baseY = row * rowHeight;
      const plankColor = colors[Math.abs((row * 3 + vCol * 7) % colors.length)];

      // 左半分（45度）
      ctx.save();
      ctx.translate(baseX, baseY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = adjustBrightness(plankColor, ((row + vCol) % 5 - 2) * 2);
      ctx.fillRect(-plankW / 2, -halfH, plankW, plankH);
      // 木目
      ctx.strokeStyle = adjustBrightness(plankColor, -15);
      ctx.lineWidth = 0.3;
      ctx.globalAlpha = 0.18;
      for (let g = -halfH + 4; g < halfH - 2; g += 5) {
        ctx.beginPath();
        ctx.moveTo(-plankW / 2 + 1, g);
        ctx.lineTo(plankW / 2 - 1, g + (row % 3 - 1) * 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 境界
      ctx.strokeStyle = adjustBrightness(base, -30);
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.35;
      ctx.strokeRect(-plankW / 2, -halfH, plankW, plankH);
      ctx.globalAlpha = 1;
      ctx.restore();

      // 右半分（-45度）— 鏡像
      ctx.save();
      ctx.translate(baseX + vWidth, baseY);
      ctx.rotate(-Math.PI / 4);
      const rightColor = colors[Math.abs((row * 5 + vCol * 11) % colors.length)];
      ctx.fillStyle = adjustBrightness(rightColor, ((row + vCol + 1) % 5 - 2) * 2);
      ctx.fillRect(-plankW / 2, -halfH, plankW, plankH);
      ctx.strokeStyle = adjustBrightness(rightColor, -15);
      ctx.lineWidth = 0.3;
      ctx.globalAlpha = 0.18;
      for (let g = -halfH + 4; g < halfH - 2; g += 5) {
        ctx.beginPath();
        ctx.moveTo(-plankW / 2 + 1, g);
        ctx.lineTo(plankW / 2 - 1, g);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = adjustBrightness(base, -30);
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.35;
      ctx.strokeRect(-plankW / 2, -halfH, plankW, plankH);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
  ctx.restore();
}

/** 12. basketweave — 市松編み（2-3本の並行板を交互に水平/垂直配置） */
function drawBasketWeaveTexture(ctx: CanvasRenderingContext2D, base: string) {
  const stripCount = 3; // 1グループ内の板数
  const stripW = 40;    // 各板の幅
  const groupSize = stripCount * stripW; // 1グループのサイズ

  const colors = [
    adjustBrightness(base, 0),
    adjustBrightness(base, -8),
    adjustBrightness(base, 5),
    adjustBrightness(base, -12),
  ];

  for (let gx = 0; gx < 1024; gx += groupSize) {
    for (let gy = 0; gy < 1024; gy += groupSize) {
      const isHorizontal = ((gx / groupSize) + (gy / groupSize)) % 2 === 0;
      const groupColor = colors[Math.abs(((gx / groupSize) * 3 + (gy / groupSize) * 7) % colors.length)];

      for (let s = 0; s < stripCount; s++) {
        const stripColor = adjustBrightness(groupColor, (s - 1) * 3);

        if (isHorizontal) {
          // 水平方向の板
          const sy = gy + s * stripW;
          ctx.fillStyle = stripColor;
          ctx.fillRect(gx, sy, groupSize, stripW - 1);

          // 木目（水平方向）
          ctx.strokeStyle = adjustBrightness(stripColor, -12);
          ctx.lineWidth = 0.3;
          ctx.globalAlpha = 0.15;
          for (let g = sy + 3; g < sy + stripW - 2; g += 4) {
            ctx.beginPath();
            ctx.moveTo(gx + 1, g);
            ctx.lineTo(gx + groupSize - 1, g + (s % 2) * 0.5);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else {
          // 垂直方向の板
          const sx = gx + s * stripW;
          ctx.fillStyle = stripColor;
          ctx.fillRect(sx, gy, stripW - 1, groupSize);

          // 木目（垂直方向）
          ctx.strokeStyle = adjustBrightness(stripColor, -12);
          ctx.lineWidth = 0.3;
          ctx.globalAlpha = 0.15;
          for (let g = sx + 3; g < sx + stripW - 2; g += 4) {
            ctx.beginPath();
            ctx.moveTo(g, gy + 1);
            ctx.lineTo(g + (s % 2) * 0.5, gy + groupSize - 1);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }

      // グループ境界線
      ctx.strokeStyle = adjustBrightness(base, -30);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.strokeRect(gx, gy, groupSize, groupSize);
      ctx.globalAlpha = 1;
    }
  }
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
  // 大理石の脈に沿った微妙な凹凸
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = 'rgb(120, 120, 255)';
    ctx.lineWidth = 1.5 + Math.random() * 2;
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      const cx1 = x + (Math.random() - 0.5) * 100;
      const cy1 = y + (Math.random() - 0.3) * 80;
      const cx2 = cx1 + (Math.random() - 0.5) * 100;
      const cy2 = cy1 + (Math.random() - 0.3) * 80;
      x = cx2 + (Math.random() - 0.5) * 50;
      y = cy2 + (Math.random() - 0.3) * 50;
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x, y);
    }
    ctx.stroke();
    // 脈のハイライト側
    ctx.strokeStyle = 'rgb(136, 136, 255)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 磨かれた表面の微細なうねり
  for (let i = 0; i < 12; i++) {
    const cx = Math.random() * 512;
    const cy = Math.random() * 512;
    const radius = 15 + Math.random() * 40;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const r = Math.round(128 + (Math.random() - 0.5) * 8);
    const g = Math.round(128 + (Math.random() - 0.5) * 8);
    gradient.addColorStop(0, `rgb(${r}, ${g}, 255)`);
    gradient.addColorStop(1, 'rgb(128, 128, 255)');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 微細なスペックル
  for (let i = 0; i < 250; i++) {
    const px = Math.random() * 512;
    const py = Math.random() * 512;
    const pr = 128 + (Math.random() - 0.5) * 8;
    const pg = 128 + (Math.random() - 0.5) * 8;
    ctx.fillStyle = `rgb(${pr}, ${pg}, 255)`;
    ctx.fillRect(px, py, 1.5, 1.5);
  }
}

function drawConcreteNormal(ctx: CanvasRenderingContext2D) {
  // 大きなうねり（コンクリート表面の不均一性）
  for (let i = 0; i < 20; i++) {
    const cx = Math.random() * 512;
    const cy = Math.random() * 512;
    const radius = 20 + Math.random() * 60;
    const angle = Math.random() * Math.PI * 2;
    const strength = 15 + Math.random() * 10;
    const r = Math.round(128 + Math.cos(angle) * strength);
    const g = Math.round(128 + Math.sin(angle) * strength);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, `rgb(${r}, ${g}, 255)`);
    gradient.addColorStop(1, 'rgb(128, 128, 255)');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 骨材の凸（小さな丸い凹凸）
  for (let i = 0; i < 80; i++) {
    const ax = Math.random() * 512;
    const ay = Math.random() * 512;
    const ar = 1 + Math.random() * 2.5;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.round(128 + Math.cos(angle) * 20);
    const g = Math.round(128 + Math.sin(angle) * 20);
    ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fill();
  }
  // 細かいザラつき
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 128 + (Math.random() - 0.5) * 28;
    const g = 128 + (Math.random() - 0.5) * 28;
    ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
    ctx.fillRect(x, y, 2, 2);
  }
  // ピンホールの凹み
  for (let i = 0; i < 30; i++) {
    const px = Math.random() * 512;
    const py = Math.random() * 512;
    const pr = 0.8 + Math.random() * 1.5;
    ctx.fillStyle = '#6060FF'; // 深い凹み
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTileNormal(ctx: CanvasRenderingContext2D, tileSize: number) {
  // 目地の溝（暗い影側）
  ctx.strokeStyle = '#5555FF';
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
  // 目地のハイライト側（立体感強化）
  ctx.strokeStyle = '#9595FF';
  ctx.lineWidth = 1.2;
  for (let x = 0; x < 512; x += tileSize) {
    ctx.beginPath();
    ctx.moveTo(x + 3, 0);
    ctx.lineTo(x + 3, 512);
    ctx.stroke();
  }
  for (let y = 0; y < 512; y += tileSize) {
    ctx.beginPath();
    ctx.moveTo(0, y + 3);
    ctx.lineTo(512, y + 3);
    ctx.stroke();
  }
  // タイル面の微細なテクスチャ凹凸
  for (let i = 0; i < 200; i++) {
    const px = Math.random() * 512;
    const py = Math.random() * 512;
    const pr = 128 + (Math.random() - 0.5) * 6;
    const pg = 128 + (Math.random() - 0.5) * 6;
    ctx.fillStyle = `rgb(${pr}, ${pg}, 255)`;
    ctx.fillRect(px, py, 2, 2);
  }
}

function drawWoodNormal(ctx: CanvasRenderingContext2D) {
  const plankH = 32; // 512px scale equivalent
  const plankW = 64;
  // plank間の溝（深い法線）
  ctx.strokeStyle = '#5858FF';
  ctx.lineWidth = 2.5;
  for (let y = 0; y < 512; y += plankH) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
    // 溝のハイライト側
    ctx.strokeStyle = '#9898FF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(512, y + 2);
    ctx.stroke();
    ctx.strokeStyle = '#5858FF';
    ctx.lineWidth = 2.5;
  }
  // 縦方向の板の溝
  for (let py = 0; py < 512; py += plankH) {
    const offset = (Math.floor(py / plankH) % 2) * (plankW / 2);
    for (let px = offset; px < 512; px += plankW) {
      ctx.strokeStyle = '#5858FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py + plankH);
      ctx.stroke();
      ctx.strokeStyle = '#9090FF';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px + 1.5, py);
      ctx.lineTo(px + 1.5, py + plankH);
      ctx.stroke();
    }
  }
  // 木目のうねり（年輪パターンの凹凸）
  for (let py = 0; py < 512; py += plankH) {
    const grainPhase = Math.random() * Math.PI * 2;
    const grainFreq = 0.12 + Math.random() * 0.08;
    for (let ly = py + 2; ly < py + plankH - 2; ly += 2) {
      const wave = Math.sin(grainPhase + ly * grainFreq);
      const r = Math.round(128 + wave * 12);
      const g = Math.round(128 + wave * 8);
      ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
      ctx.fillRect(0, ly, 512, 2);
    }
  }
  // 微細な表面ノイズ
  for (let i = 0; i < 400; i++) {
    const nx = Math.random() * 512;
    const ny = Math.random() * 512;
    const nr = 128 + (Math.random() - 0.5) * 10;
    const ng = 128 + (Math.random() - 0.5) * 10;
    ctx.fillStyle = `rgb(${nr}, ${ng}, 255)`;
    ctx.fillRect(nx, ny, 2, 1);
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
