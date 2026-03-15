'use client';

import React, { useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WallSegment, Opening } from '@/types/floor-plan';
import { StyleConfig } from '@/types/scene';
import { wallLength, wallAngle } from '@/lib/geometry';
import { DoorWindowMesh } from './DoorWindowMesh';
import { useEditorStore } from '@/stores/useEditorStore';
import { useUIStore } from '@/stores/useUIStore';
import { getCachedTexture, getTextureResolution } from '@/lib/texture-cache';

/* ─── カメラ角度ベースの壁透過ユーティリティ ─────────────────── */

// useFrame内でのnew演算子を避けるため、コンポーネント外にベクトルを確保
const _camDir = new THREE.Vector3();
const _wallNormal3D = new THREE.Vector3();
// フレームスロットリング: 壁の透過計算を間引く
let _wallFrameCounter = 0;
// カメラ位置キャッシュ: 移動量が閾値以下なら壁透過計算をスキップ
const _prevCamPos = new THREE.Vector3();
let _camPosInitialized = false;

/**
 * 壁の2D法線を計算する（左側方向）
 * @returns [nx, ny] 正規化された法線ベクトル
 */
function computeWallNormal2D(wall: WallSegment): [number, number] {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [0, 0];
  return [-dy / len, dx / len];
}

/**
 * カメラ方向と壁法線のドット積からターゲット不透明度を計算する。
 * dot > 0.3: カメラに向いている壁 → 透過 (0.05)
 * dot < -0.3: カメラから離れている壁 → 不透明 (1.0)
 * 中間: 滑らかに補間
 */
function computeWallTargetOpacity(dot: number): number {
  // dot を [-0.3, 0.3] の範囲で [1.0, 0.05] にマッピング
  const t = Math.max(0, Math.min(1, (dot + 0.3) / 0.6));
  return 1.0 - t * 0.95; // 1.0 → 0.05
}

/* ─── useWallTexture フック ─────────────────────────────────────
   Canvas API (品質別: low=512, medium=1024, high=2048) でスタイル別プロシージャルテクスチャを生成し、
   { map, normalMap, roughnessMap, metalness } を返す。
   map はパターンのみ描画し、baseColor を基調色として使用。
   ──────────────────────────────────────────────────────────── */

interface WallTextureResult {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture | null;
  roughnessMap: THREE.CanvasTexture;
  metalness: number;
}

function useWallTexture(
  styleName: string,
  baseColor: string,
  wall: WallSegment,
): WallTextureResult {
  // 品質レベルに応じた解像度を取得
  const qualityLevel = useEditorStore((s) => s.qualityLevel);
  const res = getTextureResolution(qualityLevel);

  const map = useMemo(() => {
    const S = res.wall;
    // キャッシュキー: スタイル+色+解像度で一意（壁個別のrepeatは後で設定）
    const cacheKey = `wall-map-${styleName}-${baseColor}-${S}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;

    // ベースカラー塗り
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, S, S);

    switch (styleName) {
      case 'japanese': {
        // 漆喰風 — より強いザラつき感、左官コテ跡、微かな色ムラ
        // 広い色ムラ（Perlin風の大きな斑点）
        for (let i = 0; i < 20; i++) {
          const cx = Math.random() * S;
          const cy = Math.random() * S;
          const radius = 30 + Math.random() * 80;
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          gradient.addColorStop(0, adjustBrightness(baseColor, (Math.random() - 0.5) * 10));
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.globalAlpha = 0.2;
          ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        }
        ctx.globalAlpha = 1;
        // 砂粒（密度増加）
        for (let i = 0; i < 1800; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          const sz = Math.random() * 2.5 + 0.3;
          ctx.fillStyle = adjustBrightness(baseColor, Math.random() > 0.5 ? 10 : -10);
          ctx.fillRect(x, y, sz, sz);
        }
        // 左官コテ跡（横方向の薄い筋 — より多様な太さ）
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = adjustBrightness(baseColor, -20);
        for (let y = 0; y < S; y += 2 + Math.random() * 5) {
          ctx.lineWidth = 0.5 + Math.random() * 1.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          // わずかにうねる曲線
          const cp1x = S * 0.33;
          const cp1y = y + (Math.random() - 0.5) * 3;
          const cp2x = S * 0.66;
          const cp2y = y + (Math.random() - 0.5) * 3;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, S, y + (Math.random() - 0.5) * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 微かなピンホール（漆喰特有の小さな気泡跡）
        for (let i = 0; i < 40; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const pr = 0.5 + Math.random() * 1;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fillStyle = adjustBrightness(baseColor, -18);
          ctx.globalAlpha = 0.15;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'luxury': {
        // スエード/ベルベット風 — 微かな布目パターン
        // 極細の布目ドット
        for (let i = 0; i < 800; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          const sz = Math.random() * 1.2 + 0.3;
          ctx.fillStyle = adjustBrightness(baseColor, Math.random() > 0.7 ? 12 : 4);
          ctx.fillRect(x, y, sz, sz);
        }
        // 斜め布目ライン（超薄く）
        ctx.globalAlpha = 0.025;
        ctx.strokeStyle = adjustBrightness(baseColor, 20);
        ctx.lineWidth = 0.5;
        for (let i = -S; i < S * 2; i += 6) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + S, S);
          ctx.stroke();
        }
        // 逆方向の布目
        for (let i = -S; i < S * 2; i += 6) {
          ctx.beginPath();
          ctx.moveTo(i, S);
          ctx.lineTo(i + S, 0);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'industrial': {
        // レンガ風 — レンガパターンの目地線
        const brickW = 64;
        const brickH = 28;
        const mortarW = 3;
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, S, S);
        // 目地色（少し暗め）
        const mortarColor = adjustBrightness(baseColor, -35);
        for (let row = 0; row < S; row += brickH + mortarW) {
          const rowIdx = Math.floor(row / (brickH + mortarW));
          const offset = (rowIdx % 2) * (brickW / 2);
          // 水平目地
          ctx.fillStyle = mortarColor;
          ctx.fillRect(0, row + brickH, S, mortarW);
          // 垂直目地
          for (let col = -brickW; col < S + brickW; col += brickW + mortarW) {
            const x = col + offset;
            ctx.fillStyle = mortarColor;
            ctx.fillRect(x + brickW, row, mortarW, brickH);
            // レンガ面に微かな色ムラ
            const brightness = (Math.random() - 0.5) * 12;
            ctx.fillStyle = adjustBrightness(baseColor, brightness);
            ctx.globalAlpha = 0.3;
            ctx.fillRect(x + 2, row + 2, brickW - 4, brickH - 4);
            ctx.globalAlpha = 1;
          }
        }
        break;
      }
      case 'modern': {
        // 滑らかな塗装 — ごく微かなローラー跡
        // 極薄ノイズ
        for (let i = 0; i < 300; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          const sz = Math.random() * 1.5 + 0.5;
          ctx.fillStyle = adjustBrightness(baseColor, (Math.random() - 0.5) * 5);
          ctx.fillRect(x, y, sz, sz);
        }
        // ローラー跡（縦方向の薄い筋）
        ctx.globalAlpha = 0.03;
        ctx.strokeStyle = adjustBrightness(baseColor, -10);
        ctx.lineWidth = 1;
        for (let x = 0; x < S; x += 4 + Math.random() * 3) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + (Math.random() - 0.5) * 2, S);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'cafe': {
        // 漆喰風（warm tone）— 温かみのある凹凸
        for (let i = 0; i < 1000; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          const sz = Math.random() * 2.5 + 0.5;
          ctx.fillStyle = adjustBrightness(baseColor, Math.random() > 0.5 ? 10 : -10);
          ctx.fillRect(x, y, sz, sz);
        }
        // コテ跡（やや不規則な横ライン）
        ctx.globalAlpha = 0.05;
        ctx.strokeStyle = adjustBrightness(baseColor, -25);
        ctx.lineWidth = 1;
        for (let y = 0; y < S; y += 4 + Math.random() * 6) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(S, y + (Math.random() - 0.5) * 3);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'minimal': {
        // 完全に滑らか — テクスチャなしか微かなグレイン
        for (let i = 0; i < 160; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          const sz = Math.random() * 1 + 0.3;
          ctx.fillStyle = adjustBrightness(baseColor, (Math.random() - 0.5) * 3);
          ctx.fillRect(x, y, sz, sz);
        }
        break;
      }
      case 'scandinavian': {
        // 白壁にごく微かな木目パネル線
        // 微細ノイズ
        for (let i = 0; i < 400; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          const sz = Math.random() * 1.5 + 0.5;
          ctx.fillStyle = adjustBrightness(baseColor, (Math.random() - 0.5) * 6);
          ctx.fillRect(x, y, sz, sz);
        }
        // 縦のパネル線（木目風）
        ctx.globalAlpha = 0.04;
        ctx.strokeStyle = adjustBrightness(baseColor, -15);
        ctx.lineWidth = 1;
        for (let x = 0; x < S; x += 64) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, S);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'retro': {
        // タイル風 — 正方形の薄い目地
        const tileSize = 48;
        const groutW = 2;
        const groutColor = adjustBrightness(baseColor, -20);
        for (let row = 0; row < S; row += tileSize + groutW) {
          for (let col = 0; col < S; col += tileSize + groutW) {
            // タイル面に微かな色ムラ
            const brightness = (Math.random() - 0.5) * 8;
            ctx.fillStyle = adjustBrightness(baseColor, brightness);
            ctx.globalAlpha = 0.4;
            ctx.fillRect(col + 1, row + 1, tileSize - 2, tileSize - 2);
            ctx.globalAlpha = 1;
          }
          // 水平目地
          ctx.fillStyle = groutColor;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(0, row + tileSize, S, groutW);
          ctx.globalAlpha = 1;
        }
        // 垂直目地
        for (let col = 0; col < S; col += tileSize + groutW) {
          ctx.fillStyle = groutColor;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(col + tileSize, 0, groutW, S);
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'medical': {
        // 清潔な白 — 微かなスペックル
        for (let i = 0; i < 240; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          const sz = Math.random() * 1.2 + 0.3;
          ctx.fillStyle = adjustBrightness(baseColor, (Math.random() - 0.5) * 4);
          ctx.fillRect(x, y, sz, sz);
        }
        // ごく薄い青みがかったスペックル
        ctx.globalAlpha = 0.02;
        for (let i = 0; i < 80; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          ctx.fillStyle = '#D0D8E8';
          ctx.fillRect(x, y, 1.5, 1.5);
        }
        ctx.globalAlpha = 1;
        break;
      }
      default: {
        // フォールバック — 微細ノイズ
        for (let i = 0; i < 300; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          const sz = Math.random() * 1.5 + 0.5;
          ctx.fillStyle = adjustBrightness(baseColor, (Math.random() - 0.5) * 5);
          ctx.fillRect(x, y, sz, sz);
        }
        break;
      }
    }

    return canvas;
    }); // getCachedTexture 終了
    // キャッシュされたテクスチャをクローンし、壁ごとの repeat を設定
    const texture = baseTex.clone();
    texture.needsUpdate = true;
    const len = wallLength(wall);
    texture.repeat.set(Math.max(1, len / 2), Math.max(1, wall.height / 2));
    return texture;
  }, [baseColor, wall, styleName, res.wall]);

  const normalMap = useMemo(() => {
    // low品質ではノーマルマップを省略（フラット）
    if (!res.useNormalMap) {
      return null;
    }
    // 壁ノーマルマップ: HIGH=2048, MEDIUM=1024 (resのnormalとは独立)
    const S = qualityLevel === 'high' ? 2048 : 1024;
    const cacheKey = `wall-normal-${styleName}-${S}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;

    // 中性ノーマルマップ色 (128,128,255) = フラット
    ctx.fillStyle = '#8080FF';
    ctx.fillRect(0, 0, S, S);

    switch (styleName) {
      case 'japanese': {
        // 左官コテ跡 — 横方向の微妙なラインと変化（強化版）
        for (let y = 0; y < S; y += 2 + Math.random() * 3) {
          const r = 128 + (Math.random() - 0.5) * 18;
          const g = 128 + (Math.random() - 0.5) * 10;
          ctx.strokeStyle = `rgb(${r}, ${g}, 255)`;
          ctx.lineWidth = 0.8 + Math.random() * 1.2;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo(0, y);
          const cp1x = S * 0.33;
          const cp1y = y + (Math.random() - 0.5) * 4;
          const cp2x = S * 0.66;
          const cp2y = y + (Math.random() - 0.5) * 4;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, S, y + (Math.random() - 0.5) * 3);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 砂粒の凹凸（ノーマルマップ上のランダムなドット — 高解像度対応で密度増加）
        for (let i = 0; i < 800; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const r = 128 + (Math.random() - 0.5) * 25;
          const g = 128 + (Math.random() - 0.5) * 25;
          ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
          ctx.fillRect(px, py, 1.5, 1.5);
        }
        // ピンホールの凹み
        for (let i = 0; i < 30; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const pr = 0.5 + Math.random() * 1.5;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgb(100, 100, 255)';
          ctx.globalAlpha = 0.4;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'luxury': {
        // スエード風微細布目バンプ
        // 細かいクロスハッチ（高解像度で間隔を密に）
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = 'rgb(132, 132, 255)';
        ctx.lineWidth = 0.5;
        const luxStep = Math.max(3, Math.round(5 * 512 / S));
        for (let i = 0; i < S * 2; i += luxStep) {
          ctx.beginPath();
          ctx.moveTo(i - S, 0);
          ctx.lineTo(i, S);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i - S, S);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 微細ノイズ（高解像度対応で密度増加）
        for (let i = 0; i < 500; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const r = 128 + (Math.random() - 0.5) * 8;
          const g = 128 + (Math.random() - 0.5) * 8;
          ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
          ctx.fillRect(px, py, 1.5, 1.5);
        }
        break;
      }
      case 'industrial': {
        // レンガ風バンプ — 目地が凹み、レンガ面がやや凸
        const brickW = 64;
        const brickH = 28;
        const mortarW = 3;
        for (let row = 0; row < S; row += brickH + mortarW) {
          const rowIdx = Math.floor(row / (brickH + mortarW));
          const offset = (rowIdx % 2) * (brickW / 2);
          for (let col = -brickW; col < S + brickW; col += brickW + mortarW) {
            const x = col + offset;
            // レンガ表面（やや凸）
            const r = 135 + Math.random() * 8;
            const g = 135 + Math.random() * 8;
            ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
            ctx.fillRect(x, row, brickW, brickH);
          }
          // 水平目地の溝（凹）
          ctx.fillStyle = 'rgb(115, 115, 255)';
          ctx.fillRect(0, row + brickH, S, mortarW);
        }
        // 垂直目地
        for (let row = 0; row < S; row += brickH + mortarW) {
          const rowIdx = Math.floor(row / (brickH + mortarW));
          const offset = (rowIdx % 2) * (brickW / 2);
          for (let col = -brickW; col < S + brickW; col += brickW + mortarW) {
            const x = col + offset + brickW;
            ctx.fillStyle = 'rgb(115, 115, 255)';
            ctx.fillRect(x, row, mortarW, brickH);
          }
        }
        break;
      }
      case 'modern': {
        // ローラー跡 — 縦方向の微妙な凹凸
        for (let x = 0; x < S; x += 4 + Math.random() * 3) {
          const r = 128 + (Math.random() - 0.5) * 6;
          ctx.strokeStyle = `rgb(${r}, 128, 255)`;
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + (Math.random() - 0.5) * 2, S);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'cafe': {
        // 漆喰の不均一な凹凸
        for (let i = 0; i < 160; i++) {
          const cx = Math.random() * S;
          const cy = Math.random() * S;
          const radius = 3 + Math.random() * 10;
          const r = 128 + (Math.random() - 0.5) * 16;
          const g = 128 + (Math.random() - 0.5) * 16;
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          gradient.addColorStop(0, `rgb(${r}, ${g}, 255)`);
          gradient.addColorStop(1, 'rgb(128, 128, 255)');
          ctx.fillStyle = gradient;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // コテ跡の横線
        for (let y = 0; y < S; y += 4 + Math.random() * 5) {
          const r = 128 + (Math.random() - 0.5) * 8;
          ctx.strokeStyle = `rgb(${r}, 128, 255)`;
          ctx.lineWidth = 0.8;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(S, y + (Math.random() - 0.5) * 3);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'minimal': {
        // ほぼフラット — 極微ノイズのみ
        for (let i = 0; i < 100; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const r = 128 + (Math.random() - 0.5) * 4;
          const g = 128 + (Math.random() - 0.5) * 4;
          ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
          ctx.fillRect(px, py, 1, 1);
        }
        break;
      }
      case 'scandinavian': {
        // 縦の木目パネル溝
        for (let x = 0; x < S; x += 64) {
          ctx.fillStyle = 'rgb(118, 118, 255)';
          ctx.fillRect(x, 0, 2, S);
          ctx.fillStyle = 'rgb(122, 135, 255)';
          ctx.fillRect(x - 1, 0, 1, S);
          ctx.fillStyle = 'rgb(135, 122, 255)';
          ctx.fillRect(x + 2, 0, 1, S);
        }
        // パネル面の微細な木目（横方向）
        for (let y = 0; y < S; y += 8) {
          const r = 128 + (Math.random() - 0.5) * 6;
          ctx.strokeStyle = `rgb(${r}, 128, 255)`;
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(S, y + (Math.random() - 0.5) * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'retro': {
        // タイル風 — 正方形目地の凹み
        const tileSize = 48;
        const groutW = 2;
        // タイル面を少し凸に
        for (let row = 0; row < S; row += tileSize + groutW) {
          for (let col = 0; col < S; col += tileSize + groutW) {
            const r = 133 + Math.random() * 5;
            const g = 133 + Math.random() * 5;
            ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
            ctx.fillRect(col, row, tileSize, tileSize);
          }
          // 水平目地
          ctx.fillStyle = 'rgb(118, 118, 255)';
          ctx.fillRect(0, row + tileSize, S, groutW);
        }
        for (let col = 0; col < S; col += tileSize + groutW) {
          ctx.fillStyle = 'rgb(118, 118, 255)';
          ctx.fillRect(col + tileSize, 0, groutW, S);
        }
        break;
      }
      case 'medical': {
        // ほぼフラット、非常に微細なノイズのみ
        for (let i = 0; i < 120; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const r = 128 + (Math.random() - 0.5) * 5;
          const g = 128 + (Math.random() - 0.5) * 5;
          ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
          ctx.fillRect(px, py, 1.5, 1.5);
        }
        break;
      }
      default: {
        for (let i = 0; i < 400; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const r = 128 + (Math.random() - 0.5) * 15;
          const g = 128 + (Math.random() - 0.5) * 15;
          ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
          ctx.fillRect(px, py, 2, 2);
        }
        break;
      }
    }

    return canvas;
    }); // getCachedTexture 終了
    const texture = baseTex.clone();
    texture.needsUpdate = true;
    const len = wallLength(wall);
    texture.repeat.set(Math.max(1, len / 2), Math.max(1, wall.height / 2));
    return texture;
  }, [wall, styleName, res.normal, res.useNormalMap, qualityLevel]);

  const roughnessMap = useMemo(() => {
    // 壁ラフネスマップ: HIGH=512, MEDIUM=256 (resのroughnessとは独立)
    const S = qualityLevel === 'high' ? 512 : res.roughness;
    const cacheKey = `wall-roughness-${styleName}-${S}`;
    const baseTex = getCachedTexture(cacheKey, () => {
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;

    let baseVal: number;
    let variationRange: number;

    switch (styleName) {
      case 'japanese': {
        // 漆喰 — 中程度に粗い (140-180)
        baseVal = 160;
        variationRange = 40;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let y = 0; y < S; y += 3) {
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(0, y, S, 3);
        }
        break;
      }
      case 'luxury': {
        // スエード — 滑らか (50-80)
        baseVal = 65;
        variationRange = 30;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 300; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, 2, 2);
        }
        break;
      }
      case 'industrial': {
        // レンガ — 粗い (180-230)
        baseVal = 200;
        variationRange = 50;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 800; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, Math.random() * 4 + 1, Math.random() * 4 + 1);
        }
        break;
      }
      case 'modern': {
        // 塗装 — やや滑らか (100-130)
        baseVal = 115;
        variationRange = 30;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 300; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, 2, 2);
        }
        break;
      }
      case 'cafe': {
        // 漆喰 — 中程度 (140-170)
        baseVal = 155;
        variationRange = 30;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 600; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, Math.random() * 3 + 1, Math.random() * 3 + 1);
        }
        break;
      }
      case 'minimal': {
        // 滑らか (60-80)
        baseVal = 70;
        variationRange = 20;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 120; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, 1.5, 1.5);
        }
        break;
      }
      case 'scandinavian': {
        // 中程度 (120-150)
        baseVal = 135;
        variationRange = 30;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 400; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, 2, 2);
        }
        break;
      }
      case 'retro': {
        // タイル — やや滑らか (90-120)
        baseVal = 105;
        variationRange = 30;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 400; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, 2, 2);
        }
        break;
      }
      case 'medical': {
        // 滑らか (60-90)
        baseVal = 75;
        variationRange = 30;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 160; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, 2, 2);
        }
        break;
      }
      default: {
        baseVal = 140;
        variationRange = 40;
        ctx.fillStyle = `rgb(${baseVal}, ${baseVal}, ${baseVal})`;
        ctx.fillRect(0, 0, S, S);
        for (let i = 0; i < 400; i++) {
          const px = Math.random() * S;
          const py = Math.random() * S;
          const v = baseVal + (Math.random() - 0.5) * variationRange;
          ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
          ctx.fillRect(px, py, Math.random() * 3 + 1, Math.random() * 3 + 1);
        }
        break;
      }
    }

    return canvas;
    }); // getCachedTexture 終了
    const texture = baseTex.clone();
    texture.needsUpdate = true;
    const len = wallLength(wall);
    texture.repeat.set(Math.max(1, len / 2), Math.max(1, wall.height / 2));
    return texture;
  }, [wall, styleName, res.roughness, qualityLevel]);

  const metalness = styleName === 'luxury' ? 0.1 : 0.0;

  return { map, normalMap, roughnessMap, metalness };
}

/* ─── コンポーネント ──────────────────────────────────────────── */

interface WallMeshGroupProps {
  walls: WallSegment[];
  openings: Opening[];
  style: StyleConfig;
}

export const WallMeshGroup = React.memo(function WallMeshGroup({ walls, openings, style }: WallMeshGroupProps) {
  const dayNight = useEditorStore((s) => s.dayNight);
  const wallColorOverride = useUIStore(s => s.wallColorOverride);
  const wallTextureType = useUIStore(s => s.wallTextureType);
  const wallDisplayMode = useUIStore(s => s.wallDisplayMode);
  const sectionCutHeight = useUIStore(s => s.sectionCutHeight);
  const isNight = dayNight === 'night';

  // hidden モードでは壁を一切レンダリングしない
  if (wallDisplayMode === 'hidden') return null;

  // section モード: カメラに向いている壁を sectionCutHeight でクリップ
  const { camera } = useThree();

  const sectionCutWallIds = useMemo(() => {
    if (wallDisplayMode !== 'section') return new Set<string>();
    const camPos2D = { x: camera.position.x, y: camera.position.z };
    const ids = new Set<string>();

    for (const wall of walls) {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      // 壁の法線（左側方向）
      const nx = -dy / len;
      const ny = dx / len;
      const cx = (wall.start.x + wall.end.x) / 2;
      const cy = (wall.start.y + wall.end.y) / 2;
      // カメラ方向との内積: 正ならカメラに向いている壁 → カット対象
      const dot = nx * (camPos2D.x - cx) + ny * (camPos2D.y - cy);
      if (dot > 0) {
        ids.add(wall.id);
      }
    }
    return ids;
  }, [wallDisplayMode, walls, camera.position.x, camera.position.z]);

  // セクションカット用クリッピングプレーン: sectionCutHeight より上をカット
  const sectionClipPlane = useMemo(() => {
    return new THREE.Plane(new THREE.Vector3(0, -1, 0), sectionCutHeight);
  }, [sectionCutHeight]);

  return (
    <group>
      {walls.map((wall) => {
        const wallOpenings = openings.filter((o) => o.wallId === wall.id);
        const isSectionCut = wallDisplayMode === 'section' && sectionCutWallIds.has(wall.id);
        return (
          <WallMesh
            key={wall.id}
            wall={wall}
            openings={wallOpenings}
            style={style}
            isNight={isNight}
            wallColorOverride={wallColorOverride}
            wallTextureType={wallTextureType}
            wallDisplayMode={wallDisplayMode}
            sectionClipPlane={isSectionCut ? sectionClipPlane : null}
            sectionCutHeight={sectionCutHeight}
          />
        );
      })}
    </group>
  );
});

interface WallMeshProps {
  wall: WallSegment;
  openings: Opening[];
  style: StyleConfig;
  isNight: boolean;
  wallColorOverride: string | null;
  wallTextureType: string | null;
  wallDisplayMode: 'solid' | 'transparent' | 'hidden' | 'section';
  sectionClipPlane: THREE.Plane | null;
  sectionCutHeight: number;
}

function WallMesh({ wall, openings, style, isNight, wallColorOverride, wallTextureType, wallDisplayMode, sectionClipPlane, sectionCutHeight }: WallMeshProps) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const currentOpacityRef = useRef(1.0);

  // 壁の2D法線を事前計算
  const wallNormal2D = useMemo(() => computeWallNormal2D(wall), [wall]);

  const { geometry, position, rotationY } = useMemo(() => {
    const len = wallLength(wall);
    const angle = wallAngle(wall);
    const h = wall.height;
    const t = wall.thickness;

    // 壁断面 Shape: 幅 = len, 高さ = h
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(len, 0);
    shape.lineTo(len, h);
    shape.lineTo(0, h);
    shape.closePath();

    // 開口部の穴を作成
    for (const op of openings) {
      const hole = new THREE.Path();
      const x0 = op.positionAlongWall;
      const x1 = x0 + op.width;
      const y0 = op.elevation;
      const y1 = y0 + op.height;
      hole.moveTo(x0, y0);
      hole.lineTo(x1, y0);
      hole.lineTo(x1, y1);
      hole.lineTo(x0, y1);
      hole.closePath();
      shape.holes.push(hole);
    }

    // 奥行方向に thickness 分 extrude
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: t,
      bevelEnabled: false,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // extrude は z 方向に伸びるので、厚み中心がローカル z=0 になるよう移動
    geo.translate(0, 0, -t / 2);

    // 2D → 3D 座標変換: (x, y) → (x, 0, y)
    const pos = new THREE.Vector3(wall.start.x, 0, wall.start.y);

    return {
      geometry: geo,
      position: pos,
      rotationY: -angle, // THREE.js の Y 軸回転は反時計回り、atan2 と逆
    };
  }, [wall, openings]);

  // カメラ角度ベースの壁不透明度を useFrame でスムーズに更新
  // targetOpacityを保持して安定時にスキップ
  const targetOpacityRef = useRef(1.0);

  useFrame(({ camera }) => {
    if (!materialRef.current) return;

    // 「transparent」モードでは固定不透明度0.3、「hidden」では非表示なのでスキップ
    if (wallDisplayMode === 'transparent') {
      materialRef.current.opacity = 0.3;
      return;
    }

    // カメラ位置変化量チェック: 閾値以下なら完全スキップ（最大の最適化）
    const camPos = camera.position;
    if (_camPosInitialized) {
      const dx = camPos.x - _prevCamPos.x;
      const dy = camPos.y - _prevCamPos.y;
      const dz = camPos.z - _prevCamPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 0.0001) { // 0.01^2 = カメラ移動量0.01未満
        // opacityのlerp収束だけ処理
        const delta = targetOpacityRef.current - currentOpacityRef.current;
        if (Math.abs(delta) >= 0.002) {
          currentOpacityRef.current += delta * 0.08;
          materialRef.current.opacity = currentOpacityRef.current;
        }
        return;
      }
    }
    _prevCamPos.copy(camPos);
    _camPosInitialized = true;

    // opacityが安定している場合は3フレームに1回だけ計算
    const opacityDelta = Math.abs(targetOpacityRef.current - currentOpacityRef.current);
    if (opacityDelta < 0.005) {
      _wallFrameCounter++;
      if (_wallFrameCounter % 3 !== 0) return;
    }

    // カメラ方向ベクトル（カメラが向いている方向）
    camera.getWorldDirection(_camDir);

    // 壁の法線を3D空間に変換（2DのnxはX、nyはZ）
    _wallNormal3D.set(wallNormal2D[0], 0, wallNormal2D[1]);

    // カメラ方向と壁法線のドット積
    // 正: カメラが壁に向いている → 透過させる
    const dot = _camDir.dot(_wallNormal3D);

    const targetOpacity = computeWallTargetOpacity(dot);
    targetOpacityRef.current = targetOpacity;

    // lerp でスムーズな遷移（0.08 = ダンピング係数）
    const delta = targetOpacity - currentOpacityRef.current;
    if (Math.abs(delta) < 0.002) {
      currentOpacityRef.current = targetOpacity;
    } else {
      currentOpacityRef.current += delta * 0.08;
    }

    const mat = materialRef.current;
    mat.opacity = currentOpacityRef.current;

    // 透過中はdepthWrite無効 + DoubleSide、不透明時は通常設定に復帰
    const isTransparent = currentOpacityRef.current < 0.95;
    mat.transparent = true; // 常にtrue（lerp中の中間値に対応）
    mat.depthWrite = !isTransparent;
    mat.side = isTransparent ? THREE.DoubleSide : THREE.FrontSide;
  });

  // 壁色: オーバーライド → 壁個別色 → スタイルデフォルト
  const color = wallColorOverride
    ? wallColorOverride
    : wall.materialId
      ? wall.color
      : wall.color !== '#E0E0E0'
        ? wall.color
        : style.wallColor;

  // テクスチャタイプ: オーバーライド → スタイルデフォルト
  const effectiveTextureType = wallTextureType ?? style.name;

  // useWallTexture フックでスタイル別テクスチャ一式を取得
  const { map: wallTexture, normalMap, roughnessMap: wallRoughnessMap, metalness } =
    useWallTexture(effectiveTextureType, color, wall);

  // cinema-grade: スタイル別壁面envMapIntensity / clearcoat（+25%強化）
  const wallEnvMapIntensity = effectiveTextureType === 'luxury' ? 1.875
    : effectiveTextureType === 'modern' ? 1.5
    : effectiveTextureType === 'medical' ? 1.25
    : 1.0;
  const isLuxuryOrModern = effectiveTextureType === 'luxury' || effectiveTextureType === 'modern';
  // clearcoat +強化
  const wallClearcoat = isLuxuryOrModern ? 0.25 : 0.15;
  const wallClearcoatRoughness = effectiveTextureType === 'luxury' ? 0.03
    : effectiveTextureType === 'modern' ? 0.05
    : effectiveTextureType === 'medical' ? 0.08
    : 0.1;

  // セクションカットの断面エッジ（切断位置に暗色の線を表示）
  const sectionEdge = useMemo(() => {
    if (!sectionClipPlane) return null;
    const len = wallLength(wall);
    const edgeColor = adjustBrightness(color, -40);
    return { len, edgeColor };
  }, [sectionClipPlane, wall, color]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          ref={materialRef}
          map={wallTexture}
          normalMap={normalMap ?? undefined}
          normalScale={normalMap ? new THREE.Vector2(1.1, 1.1) : undefined}
          roughnessMap={wallRoughnessMap}
          roughness={1.0}
          metalness={metalness}
          envMapIntensity={wallEnvMapIntensity}
          clearcoat={wallClearcoat}
          clearcoatRoughness={wallClearcoatRoughness}
          specularIntensity={0.5}
          specularColor={new THREE.Color('#ffffff')}
          transparent
          opacity={wallDisplayMode === 'transparent' ? 0.3 : 1}
          side={wallDisplayMode === 'transparent' ? THREE.DoubleSide : THREE.FrontSide}
          depthWrite={wallDisplayMode !== 'transparent'}
          clippingPlanes={sectionClipPlane ? [sectionClipPlane] : []}
          clipShadows={!!sectionClipPlane}
        />
      </mesh>

      {/* セクションカット断面エッジ（切断線の可視化） */}
      {sectionEdge && (
        <mesh
          position={[sectionEdge.len / 2, sectionCutHeight, 0]}
          rotation={[0, 0, 0]}
        >
          <boxGeometry args={[sectionEdge.len, 0.03, wall.thickness + 0.005]} />
          <meshStandardMaterial
            color={sectionEdge.edgeColor}
            roughness={0.6}
            metalness={0.0}
          />
        </mesh>
      )}

      {openings.map((op) => (
        <DoorWindowMesh key={op.id} opening={op} wallThickness={wall.thickness} style={style} />
      ))}
      {/* 窓からの光（自然光表現） */}
      {openings.filter((op) => op.type === 'window').map((op) => (
        <pointLight
          key={`window-light-${op.id}`}
          position={[
            op.positionAlongWall + op.width / 2,
            op.elevation + op.height / 2,
            -wall.thickness / 2 - 0.1, // 壁の法線方向に少しオフセット（室内側）
          ]}
          intensity={isNight ? 0.05 : 0.5}
          distance={4}
          color="#FFF8E0"
          castShadow={false}
        />
      ))}
      {/* 腰壁（ウェインスコット） */}
      <Wainscot wall={wall} openings={openings} style={style} />
      {/* 巾木（ベースボード） */}
      <Baseboard wall={wall} openings={openings} style={style} />
    </group>
  );
}

/* ─── Wainscot（腰壁）設定 ───────────────────────────────────── */

interface WainscotConfig {
  height: number;
  color: string;
  /** 装飾モールディング帯の高さ (luxuryのみ) */
  moldingHeight?: number;
}

function getWainscotConfig(styleName: string, wallColor: string): WainscotConfig | null {
  switch (styleName) {
    case 'japanese':
      return { height: 0.9, color: '#B8976A' };
    case 'luxury':
      return { height: 1.0, color: '#2A1506', moldingHeight: 0.03 };
    case 'cafe':
      return { height: 0.9, color: '#6B4226' };
    case 'scandinavian':
      return { height: 0.8, color: '#E0CDB4' };
    case 'retro':
      return { height: 1.0, color: adjustBrightness(wallColor, -25) };
    default:
      return null; // modern, industrial, minimal, medical — 腰壁なし
  }
}

/* ─── useWainscotTexture フック ─────────────────────────────── */

function useWainscotTexture(styleName: string, panelColor: string, wallLen: number, panelHeight: number): THREE.CanvasTexture {
  return useMemo(() => {
    const S = 512;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = panelColor;
    ctx.fillRect(0, 0, S, S);

    switch (styleName) {
      case 'japanese': {
        // 縦の框線パターン（0.6m間隔 → テクスチャ座標に変換）
        // テクスチャは繰り返しでタイルされるので、1タイル=2mとして0.6m間隔→ ~77px間隔
        const spacing = Math.round((0.6 / 2) * S);
        ctx.strokeStyle = adjustBrightness(panelColor, -30);
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        for (let x = spacing; x < S; x += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, S);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 木目の微細ノイズ
        for (let i = 0; i < 400; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          ctx.fillStyle = adjustBrightness(panelColor, (Math.random() - 0.5) * 15);
          ctx.fillRect(x, y, Math.random() * 2 + 0.5, Math.random() * 1 + 0.3);
        }
        break;
      }
      case 'luxury': {
        // パネルモールディング（長方形のくぼみパターン）
        const panelW = 100;
        const panelH = 180;
        const margin = 20;
        const inset = 8;
        ctx.strokeStyle = adjustBrightness(panelColor, 15);
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        for (let x = margin; x + panelW < S; x += panelW + margin) {
          // 外枠
          ctx.strokeRect(x, margin, panelW, panelH);
          // 内くぼみ
          ctx.strokeStyle = adjustBrightness(panelColor, -15);
          ctx.strokeRect(x + inset, margin + inset, panelW - inset * 2, panelH - inset * 2);
          ctx.strokeStyle = adjustBrightness(panelColor, 15);
        }
        ctx.globalAlpha = 1;
        // 微細な木目ノイズ
        for (let i = 0; i < 300; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          ctx.fillStyle = adjustBrightness(panelColor, (Math.random() - 0.5) * 10);
          ctx.fillRect(x, y, Math.random() * 1.5 + 0.3, Math.random() * 1 + 0.3);
        }
        break;
      }
      case 'cafe': {
        // 縦板の板目線（0.15m間隔 → ~19px間隔）
        const spacing = Math.round((0.15 / 2) * S);
        ctx.strokeStyle = adjustBrightness(panelColor, -18);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        for (let x = spacing; x < S; x += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + (Math.random() - 0.5) * 1, S);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 木目ノイズ
        for (let i = 0; i < 350; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          ctx.fillStyle = adjustBrightness(panelColor, (Math.random() - 0.5) * 12);
          ctx.fillRect(x, y, Math.random() * 2 + 0.5, Math.random() * 1 + 0.3);
        }
        break;
      }
      case 'scandinavian': {
        // 幅広板の継ぎ目線（0.3m間隔 → ~38px間隔）
        const spacing = Math.round((0.3 / 2) * S);
        ctx.strokeStyle = adjustBrightness(panelColor, -20);
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.35;
        for (let x = spacing; x < S; x += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, S);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // 微細ノイズ
        for (let i = 0; i < 200; i++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          ctx.fillStyle = adjustBrightness(panelColor, (Math.random() - 0.5) * 8);
          ctx.fillRect(x, y, Math.random() * 1.5 + 0.5, Math.random() * 1 + 0.3);
        }
        break;
      }
      case 'retro': {
        // 小さな正方形タイルグリッド（0.1m間隔 → ~13px間隔）
        const spacing = Math.round((0.1 / 2) * S);
        const groutW = 1.5;
        const groutColor = adjustBrightness(panelColor, -20);
        for (let row = 0; row < S; row += spacing) {
          ctx.fillStyle = groutColor;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(0, row, S, groutW);
        }
        for (let col = 0; col < S; col += spacing) {
          ctx.fillStyle = groutColor;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(col, 0, groutW, S);
        }
        ctx.globalAlpha = 1;
        // タイル面に微かな色ムラ
        for (let row = 0; row < S; row += spacing) {
          for (let col = 0; col < S; col += spacing) {
            const brightness = (Math.random() - 0.5) * 10;
            ctx.fillStyle = adjustBrightness(panelColor, brightness);
            ctx.globalAlpha = 0.3;
            ctx.fillRect(col + groutW, row + groutW, spacing - groutW * 2, spacing - groutW * 2);
          }
        }
        ctx.globalAlpha = 1;
        break;
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(1, wallLen / 2), Math.max(1, panelHeight / 2));
    return texture;
  }, [styleName, panelColor, wallLen, panelHeight]);
}

/* ─── Wainscot コンポーネント ──────────────────────────────── */

interface WainscotProps {
  wall: WallSegment;
  openings: Opening[];
  style: StyleConfig;
}

function Wainscot({ wall, openings, style }: WainscotProps) {
  const config = useMemo(() => getWainscotConfig(style.name, style.wallColor), [style]);

  const segments = useMemo(() => {
    if (!config) return [];
    const len = wallLength(wall);
    // ドア開口部（床から始まる開口）をスキップ
    const doorGaps = openings
      .filter((o) => o.type === 'door' || o.elevation === 0)
      .map((o) => ({
        start: o.positionAlongWall,
        end: o.positionAlongWall + o.width,
      }));

    // 窓開口部で下端が腰壁高より低いものもスキップ
    const windowGaps = openings
      .filter((o) => o.type === 'window' && o.elevation < config.height)
      .map((o) => ({
        start: o.positionAlongWall,
        end: o.positionAlongWall + o.width,
      }));

    const allGaps = [...doorGaps, ...windowGaps].sort((a, b) => a.start - b.start);

    // ギャップをマージして連続セグメントを生成
    const result: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const gap of allGaps) {
      if (gap.start > cursor) {
        result.push({ start: cursor, end: gap.start });
      }
      cursor = Math.max(cursor, gap.end);
    }
    if (cursor < len) {
      result.push({ start: cursor, end: len });
    }
    return result;
  }, [wall, openings, config]);

  if (!config || segments.length === 0) return null;

  const PANEL_DEPTH = 0.02;
  const CHAIR_RAIL_H = 0.02;
  const CHAIR_RAIL_D = 0.01;
  const FLOAT_OFFSET = 0.005; // Zファイティング防止
  // 壁の内側に配置（Baseboard同様のロジック）
  const zOffset = -(wall.thickness / 2 - PANEL_DEPTH / 2 + FLOAT_OFFSET);
  const chairRailZ = -(wall.thickness / 2 - CHAIR_RAIL_D / 2 + FLOAT_OFFSET);

  return (
    <group>
      {segments.map((seg, i) => {
        const segLen = seg.end - seg.start;
        if (segLen <= 0) return null;
        const xCenter = seg.start + segLen / 2;
        return (
          <WainscotSegment
            key={i}
            xCenter={xCenter}
            segLen={segLen}
            config={config}
            styleName={style.name}
            wallLen={wallLength(wall)}
            panelDepth={PANEL_DEPTH}
            zOffset={zOffset}
            chairRailH={CHAIR_RAIL_H}
            chairRailD={CHAIR_RAIL_D}
            chairRailZ={chairRailZ}
          />
        );
      })}
    </group>
  );
}

interface WainscotSegmentProps {
  xCenter: number;
  segLen: number;
  config: WainscotConfig;
  styleName: string;
  wallLen: number;
  panelDepth: number;
  zOffset: number;
  chairRailH: number;
  chairRailD: number;
  chairRailZ: number;
}

function WainscotSegment({
  xCenter,
  segLen,
  config,
  styleName,
  wallLen,
  panelDepth,
  zOffset,
  chairRailH,
  chairRailD,
  chairRailZ,
}: WainscotSegmentProps) {
  const panelTexture = useWainscotTexture(styleName, config.color, wallLen, config.height);
  const chairRailColor = adjustBrightness(config.color, 15);
  const moldingColor = adjustBrightness(config.color, 20);

  return (
    <group>
      {/* パネル本体 */}
      <mesh
        position={[xCenter, config.height / 2, zOffset]}
        castShadow={false}
        receiveShadow
      >
        <boxGeometry args={[segLen, config.height, panelDepth]} />
        <meshStandardMaterial
          map={panelTexture}
          roughness={0.7}
          metalness={0.0}
        />
      </mesh>

      {/* チェアレール（腰壁上端の帯） */}
      <mesh
        position={[xCenter, config.height + chairRailH / 2, chairRailZ]}
        castShadow={false}
        receiveShadow
      >
        <boxGeometry args={[segLen, chairRailH, chairRailD]} />
        <meshStandardMaterial
          color={chairRailColor}
          roughness={0.4}
          metalness={0.02}
        />
      </mesh>

      {/* 装飾モールディング帯 (luxuryのみ) */}
      {config.moldingHeight && (
        <mesh
          position={[xCenter, config.height - config.moldingHeight / 2, chairRailZ]}
          castShadow={false}
          receiveShadow
        >
          <boxGeometry args={[segLen, config.moldingHeight, chairRailD]} />
          <meshStandardMaterial
            color={moldingColor}
            roughness={0.35}
            metalness={0.05}
          />
        </mesh>
      )}
    </group>
  );
}

interface BaseboardProps {
  wall: WallSegment;
  openings: Opening[];
  style: StyleConfig;
}

function Baseboard({ wall, openings, style }: BaseboardProps) {
  const segments = useMemo(() => {
    const len = wallLength(wall);
    // ドア開口部（elevation === 0、つまり床から始まる開口）を収集してソート
    const doorGaps = openings
      .filter((o) => o.type === 'door' || o.elevation === 0)
      .map((o) => ({
        start: o.positionAlongWall,
        end: o.positionAlongWall + o.width,
      }))
      .sort((a, b) => a.start - b.start);

    // ドア開口部をスキップしたセグメントを生成
    const result: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const gap of doorGaps) {
      if (gap.start > cursor) {
        result.push({ start: cursor, end: gap.start });
      }
      cursor = Math.max(cursor, gap.end);
    }
    if (cursor < len) {
      result.push({ start: cursor, end: len });
    }
    return result;
  }, [wall, openings]);

  // スタイル別の幅木カラー・マテリアル設定
  const materialProps = useMemo(() => {
    const baseProps: { color: string; roughness: number; metalness: number } = {
      color: '#333333',
      roughness: 0.5,
      metalness: 0,
    };
    switch (style.name) {
      case 'japanese':
        baseProps.color = '#D4C5A0';
        break;
      case 'luxury':
        baseProps.color = '#3D1F0A';
        baseProps.metalness = 0.05;
        break;
      case 'industrial':
        baseProps.color = '#555555';
        baseProps.roughness = 0.9;
        break;
      case 'modern':
        baseProps.color = '#333333';
        break;
      case 'cafe':
        baseProps.color = '#8B6F47';
        break;
      case 'minimal':
        baseProps.color = '#FFFFFF';
        break;
      case 'scandinavian':
        baseProps.color = '#E8D5B7';
        break;
      case 'retro':
        baseProps.color = '#704214';
        break;
      case 'medical':
        baseProps.color = '#E8E8E8';
        break;
      default:
        baseProps.color = adjustBrightness(style.wallColor, -40);
        break;
    }
    return baseProps;
  }, [style]);

  const BASEBOARD_H = 0.08;
  const BASEBOARD_D = 0.015;
  // 壁の法線方向（内側）にオフセット: 壁厚の半分からベースボード奥行の半分を引いた位置
  const zOffset = -(wall.thickness / 2 - BASEBOARD_D / 2 + 0.0075);

  return (
    <group>
      {segments.map((seg, i) => {
        const segLen = seg.end - seg.start;
        if (segLen <= 0) return null;
        const xCenter = seg.start + segLen / 2;
        return (
          <mesh
            key={i}
            position={[xCenter, BASEBOARD_H / 2, zOffset]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[segLen, BASEBOARD_H, BASEBOARD_D]} />
            <meshStandardMaterial
              color={materialProps.color}
              roughness={materialProps.roughness}
              metalness={materialProps.metalness}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** HEXカラーの明度を調整するユーティリティ */
function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
