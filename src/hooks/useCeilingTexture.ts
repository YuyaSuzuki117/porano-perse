'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getCachedTexture } from '@/lib/texture-cache';

const SIZE = 256;

function createCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

/** 微細ノイズを追加 */
function addNoise(ctx: CanvasRenderingContext2D, count: number, maxAlpha: number) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const alpha = Math.random() * maxAlpha;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** グリッド線を描画 */
function drawGrid(ctx: CanvasRenderingContext2D, spacing: number, color: string, lineWidth: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  for (let x = spacing; x < SIZE; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, SIZE);
    ctx.stroke();
  }
  for (let y = spacing; y < SIZE; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SIZE, y);
    ctx.stroke();
  }
}

function generateJapanese(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // 明るい木色ベース
  ctx.fillStyle = '#E8D8B8';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // 木格子パターン
  drawGrid(ctx, 64, '#C4A87A', 2);
  drawGrid(ctx, 32, '#D4BFA0', 1);
  addNoise(ctx, 400, 0.04);
  return canvas;
}

function generateLuxury(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // クリーム色ベース
  ctx.fillStyle = '#F5EFE0';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // 大パネル区切り
  drawGrid(ctx, 128, '#D8CFC0', 2);
  // モールディング線（パネル内側にもう一本）
  ctx.strokeStyle = '#E0D8C8';
  ctx.lineWidth = 1;
  const inset = 8;
  for (let x = 0; x < SIZE; x += 128) {
    for (let y = 0; y < SIZE; y += 128) {
      ctx.strokeRect(x + inset, y + inset, 128 - inset * 2, 128 - inset * 2);
    }
  }
  addNoise(ctx, 300, 0.03);
  return canvas;
}

function generateIndustrial(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // コンクリート色ベース
  ctx.fillStyle = '#B0AAA0';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // ムラ（大きなブロブ）
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 20 + Math.random() * 40;
    const alpha = 0.03 + Math.random() * 0.05;
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 配管跡の線
  ctx.strokeStyle = 'rgba(80, 80, 80, 0.15)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const y = 40 + Math.random() * (SIZE - 80);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SIZE, y + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }
  addNoise(ctx, 1200, 0.08);
  return canvas;
}

function generateModern(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // 滑らかな白塗装
  ctx.fillStyle = '#F8F8F8';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // ごく微かなテクスチャのみ
  addNoise(ctx, 200, 0.02);
  return canvas;
}

function generateCafe(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // 白塗り木目ベース
  ctx.fillStyle = '#F0E8D8';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // 薄い木目線
  ctx.strokeStyle = 'rgba(180, 160, 130, 0.2)';
  ctx.lineWidth = 1;
  for (let y = 0; y < SIZE; y += 6 + Math.random() * 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    // 微妙なカーブ
    const cp1x = SIZE * 0.33;
    const cp1y = y + (Math.random() - 0.5) * 3;
    const cp2x = SIZE * 0.66;
    const cp2y = y + (Math.random() - 0.5) * 3;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, SIZE, y + (Math.random() - 0.5) * 2);
    ctx.stroke();
  }
  addNoise(ctx, 400, 0.03);
  return canvas;
}

function generateMinimal(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // 完全フラット + 極微ノイズ
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, SIZE, SIZE);
  addNoise(ctx, 100, 0.01);
  return canvas;
}

function generateScandinavian(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // 白木ベース
  ctx.fillStyle = '#F5EDE0';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // 幅広の板目線（水平）
  ctx.strokeStyle = 'rgba(200, 180, 150, 0.15)';
  ctx.lineWidth = 1;
  const boardWidth = 32;
  for (let y = boardWidth; y < SIZE; y += boardWidth) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SIZE, y);
    ctx.stroke();
  }
  // 木目テクスチャ（薄い縦線）
  ctx.strokeStyle = 'rgba(190, 170, 140, 0.08)';
  for (let x = 0; x < SIZE; x += 3 + Math.random() * 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 2, SIZE);
    ctx.stroke();
  }
  addNoise(ctx, 300, 0.02);
  return canvas;
}

function generateRetro(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // 格天井ベース（温かみのあるクリーム）
  ctx.fillStyle = '#F0E8D0';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // 正方形グリッドパターン
  drawGrid(ctx, 64, '#C8B898', 2);
  // 格子の交差点に小さい飾り
  ctx.fillStyle = 'rgba(180, 160, 120, 0.2)';
  for (let x = 64; x < SIZE; x += 64) {
    for (let y = 64; y < SIZE; y += 64) {
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
  }
  addNoise(ctx, 500, 0.04);
  return canvas;
}

function generateMedical(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas();
  // クリーンホワイト
  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // システム天井のグリッド線
  drawGrid(ctx, 96, '#E0E0E0', 1);
  addNoise(ctx, 800, 0.06);
  return canvas;
}

const GENERATORS: Record<string, () => HTMLCanvasElement> = {
  japanese: generateJapanese,
  luxury: generateLuxury,
  industrial: generateIndustrial,
  modern: generateModern,
  cafe: generateCafe,
  minimal: generateMinimal,
  scandinavian: generateScandinavian,
  retro: generateRetro,
  medical: generateMedical,
};

/**
 * スタイル別プロシージャル天井テクスチャを生成するフック
 * 256x256 Canvas -> THREE.CanvasTexture, RepeatWrapping
 */
export function useCeilingTexture(styleName: string): THREE.CanvasTexture {
  return useMemo(() => {
    const cacheKey = `ceiling-${styleName}`;
    const gen = GENERATORS[styleName] || generateModern;
    const baseTex = getCachedTexture(cacheKey, () => gen());
    // キャッシュからのテクスチャをクローンし repeat を設定
    const texture = baseTex.clone();
    texture.needsUpdate = true;
    texture.repeat.set(4, 4);
    return texture;
  }, [styleName]);
}
