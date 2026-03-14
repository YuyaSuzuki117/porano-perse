'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

interface ProceduralSkyboxProps {
  /** 時刻（0-24の数値） */
  timeOfDay: number;
  /** スカイボックスの有効/無効 */
  enabled: boolean;
}

/** 時刻帯に応じたグラデーション色を返す */
function getGradientColors(time: number): { top: string; middle: string; bottom: string } {
  if (time < 5) {
    // 深夜: 暗い紺 → 深い青
    return { top: '#0a0a2e', middle: '#12124a', bottom: '#1a1a4e' };
  } else if (time < 7) {
    // 日の出: 紺 → オレンジ → ゴールド
    const t = (time - 5) / 2;
    return {
      top: lerpColor('#0a0a2e', '#4a90d9', t),
      middle: lerpColor('#1a1a4e', '#e67e22', t),
      bottom: lerpColor('#1a1a4e', '#f1c40f', t),
    };
  } else if (time < 12) {
    // 午前: 青空 → 水色
    return { top: '#4a90d9', middle: '#6baed6', bottom: '#87CEEB' };
  } else if (time < 17) {
    // 午後: 鮮やかな青 → 暖かい午後色
    const t = (time - 12) / 5;
    return {
      top: lerpColor('#4a90d9', '#5a8abf', t),
      middle: lerpColor('#6baed6', '#8faacc', t),
      bottom: lerpColor('#87CEEB', '#c4a87a', t),
    };
  } else if (time < 20) {
    // 夕焼け: 暖色オレンジ → ピンク → 紫
    const t = (time - 17) / 3;
    return {
      top: lerpColor('#5a8abf', '#2e1a47', t),
      middle: lerpColor('#e67e22', '#c0392b', t),
      bottom: lerpColor('#f39c12', '#8e44ad', t),
    };
  } else {
    // 夜空: 暗い紺（星付き）
    return { top: '#0a0a2e', middle: '#12124a', bottom: '#1a1a4e' };
  }
}

/** 2色間の線形補間 */
function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** HEX → RGB変換 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** 擬似乱数シード生成（星の配置を固定するため） */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * 時刻ベースのプロシージャル空球
 * Canvas APIで時刻帯に応じたグラデーションテクスチャを生成し、
 * 半径100の内側向き球体にマッピングする
 */
export const ProceduralSkybox = React.memo(function ProceduralSkybox({
  timeOfDay,
  enabled,
}: ProceduralSkyboxProps) {
  // 時刻の整数部分でのみテクスチャを再生成（パフォーマンス最適化）
  const timeKey = Math.floor(timeOfDay);

  const skyTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const colors = getGradientColors(timeKey);

    // 縦方向グラデーション描画
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, colors.top);
    gradient.addColorStop(0.5, colors.middle);
    gradient.addColorStop(1, colors.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    // 夜間（20-24, 0-5）: 星を描画
    if (timeKey >= 20 || timeKey < 5) {
      const rand = seededRandom(42);
      const starCount = 150;
      // 星の明るさ: 深夜ほど明るく
      const brightness = (timeKey >= 20)
        ? Math.min(1, (timeKey - 20) / 3)
        : Math.min(1, (5 - timeKey) / 3);

      for (let i = 0; i < starCount; i++) {
        const x = rand() * 512;
        // 上半分に集中（空の上部）
        const y = rand() * 350;
        const size = rand() * 2 + 0.5;
        const alpha = (rand() * 0.5 + 0.5) * brightness;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }, [timeKey]);

  if (!enabled) return null;

  return (
    <mesh>
      {/* 半径100の球体、内側から見る */}
      <sphereGeometry args={[100, 32, 32]} />
      <meshBasicMaterial
        map={skyTexture}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
});
