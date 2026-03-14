import * as THREE from 'three';
import { WoodType, FabricType, MetalFinish } from '@/types/scene';

/* ─── プロシージャルテクスチャ生成 (Canvas API) ────── */

/** 木目の基本色定義 */
const WOOD_BASE_COLORS: Record<WoodType, { base: [number, number, number]; shades: [number, number, number][] }> = {
  oak:      { base: [180, 140, 80],  shades: [[170, 130, 70], [190, 150, 90], [175, 135, 75]] },
  walnut:   { base: [85, 55, 30],    shades: [[75, 45, 20], [95, 65, 40], [80, 50, 25]] },
  pine:     { base: [220, 195, 150], shades: [[210, 185, 140], [230, 205, 160], [215, 190, 145]] },
  birch:    { base: [235, 220, 195], shades: [[225, 210, 185], [240, 225, 200], [230, 215, 190]] },
  mahogany: { base: [120, 40, 20],   shades: [[110, 30, 15], [130, 50, 30], [115, 35, 18]] },
  teak:     { base: [160, 110, 55],  shades: [[150, 100, 45], [170, 120, 65], [155, 105, 50]] },
  ash:      { base: [230, 220, 200], shades: [[220, 210, 190], [235, 225, 205], [225, 215, 195]] },
  kiri:     { base: [210, 190, 165], shades: [[200, 180, 155], [220, 200, 175], [205, 185, 160]] },
};

/** 木目テクスチャキャッシュ */
const woodTextureCache = new Map<string, THREE.CanvasTexture>();

/** 木目プロシージャルテクスチャ生成 */
export function generateWoodTexture(width: number, height: number, woodType: WoodType): THREE.CanvasTexture {
  const key = `wood-${woodType}-${width}-${height}`;
  const cached = woodTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const colors = WOOD_BASE_COLORS[woodType];
  const [br, bg, bb] = colors.base;

  // ベースカラー塗りつぶし
  ctx.fillStyle = `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, width, height);

  // 木目ライン（縦方向の平行線 + sin波の揺れ）
  const lineCount = Math.floor(width / 4);
  for (let i = 0; i < lineCount; i++) {
    const shade = colors.shades[i % colors.shades.length];
    const alpha = 0.15 + Math.random() * 0.25;
    ctx.strokeStyle = `rgba(${shade[0]},${shade[1]},${shade[2]},${alpha})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath();
    const baseX = (i / lineCount) * width;
    const amplitude = 2 + Math.random() * 1;
    const period = 40 + Math.random() * 20;
    const phase = Math.random() * Math.PI * 2;
    for (let y = 0; y < height; y += 2) {
      const x = baseX + Math.sin((y / period) * Math.PI * 2 + phase) * amplitude;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 年輪ノット（1-2個）
  const knotCount = 1 + Math.floor(Math.random() * 2);
  for (let k = 0; k < knotCount; k++) {
    const kx = Math.random() * width;
    const ky = Math.random() * height;
    const kRadius = 5 + Math.random() * 3;
    const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kRadius);
    const darkShade = colors.shades[0];
    grad.addColorStop(0, `rgba(${darkShade[0] - 30},${darkShade[1] - 30},${darkShade[2] - 20},0.6)`);
    grad.addColorStop(0.5, `rgba(${darkShade[0] - 15},${darkShade[1] - 15},${darkShade[2] - 10},0.3)`);
    grad.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(kx - kRadius, ky - kRadius, kRadius * 2, kRadius * 2);

    // ノット周辺の同心年輪
    for (let ring = 1; ring <= 3; ring++) {
      ctx.strokeStyle = `rgba(${darkShade[0]},${darkShade[1]},${darkShade[2]},${0.15 / ring})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(kx, ky, kRadius + ring * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // クロスグレイン（端材のように横方向の細い線を少し加える）
  const crossCount = 3 + Math.floor(Math.random() * 4);
  for (let c = 0; c < crossCount; c++) {
    const cy = Math.random() * height;
    ctx.strokeStyle = `rgba(${colors.shades[1][0]},${colors.shades[1][1]},${colors.shades[1][2]},0.08)`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  woodTextureCache.set(key, texture);
  return texture;
}

/** 布地パターン基本色 */
const FABRIC_BASE_COLORS: Record<FabricType, Record<string, [number, number, number]>> = {
  linen:  { japanese: [200, 185, 155], luxury: [180, 160, 130], scandinavian: [230, 220, 205], cafe: [195, 170, 130], industrial: [160, 155, 145], default: [210, 195, 170] },
  velvet: { japanese: [100, 60, 50], luxury: [70, 15, 50], scandinavian: [80, 80, 100], cafe: [120, 70, 50], industrial: [70, 70, 70], default: [90, 40, 60] },
  tweed:  { japanese: [170, 160, 140], luxury: [140, 130, 110], scandinavian: [200, 195, 185], cafe: [165, 145, 120], industrial: [130, 130, 130], default: [180, 170, 155] },
  canvas: { japanese: [190, 175, 150], luxury: [170, 155, 130], scandinavian: [215, 205, 190], cafe: [185, 160, 120], industrial: [100, 100, 100], default: [195, 180, 160] },
  wool:   { japanese: [185, 175, 155], luxury: [160, 145, 120], scandinavian: [210, 205, 200], cafe: [180, 160, 130], industrial: [120, 120, 120], default: [195, 185, 170] },
};

/** 布地テクスチャキャッシュ */
const fabricTextureCache = new Map<string, { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture }>();

/** 布地プロシージャルテクスチャ生成 */
export function generateFabricTexture(width: number, height: number, styleName: string, fabricType: FabricType): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const key = `fabric-${fabricType}-${styleName}-${width}-${height}`;
  const cached = fabricTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = width;
  normalCanvas.height = height;
  const nCtx = normalCanvas.getContext('2d')!;
  // ノーマルマップベース (フラットな法線 = (128,128,255))
  nCtx.fillStyle = 'rgb(128,128,255)';
  nCtx.fillRect(0, 0, width, height);

  const colorSet = FABRIC_BASE_COLORS[fabricType];
  const baseColor = colorSet[styleName] || colorSet.default;
  const [cr, cg, cb] = baseColor;

  ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
  ctx.fillRect(0, 0, width, height);

  switch (fabricType) {
    case 'linen': {
      // クロスハッチ 1pxスペーシング
      for (let y = 0; y < height; y += 2) {
        const light = Math.random() > 0.5;
        const alpha = 0.06 + Math.random() * 0.08;
        ctx.strokeStyle = `rgba(${light ? cr + 20 : cr - 20},${light ? cg + 20 : cg - 20},${light ? cb + 20 : cb - 20},${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        // ノーマル
        nCtx.strokeStyle = `rgba(${light ? 138 : 118},128,255,${alpha * 2})`;
        nCtx.lineWidth = 0.5;
        nCtx.beginPath();
        nCtx.moveTo(0, y);
        nCtx.lineTo(width, y);
        nCtx.stroke();
      }
      for (let x = 0; x < width; x += 2) {
        const light = Math.random() > 0.5;
        const alpha = 0.06 + Math.random() * 0.08;
        ctx.strokeStyle = `rgba(${light ? cr + 15 : cr - 15},${light ? cg + 15 : cg - 15},${light ? cb + 15 : cb - 15},${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        nCtx.strokeStyle = `rgba(128,${light ? 138 : 118},255,${alpha * 2})`;
        nCtx.lineWidth = 0.5;
        nCtx.beginPath();
        nCtx.moveTo(x, 0);
        nCtx.lineTo(x, height);
        nCtx.stroke();
      }
      break;
    }
    case 'tweed': {
      // 斜めラインとフレック
      for (let i = -height; i < width + height; i += 3) {
        const alpha = 0.08 + Math.random() * 0.1;
        const darker = Math.random() > 0.5;
        ctx.strokeStyle = `rgba(${darker ? cr - 25 : cr + 15},${darker ? cg - 25 : cg + 15},${darker ? cb - 25 : cb + 15},${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + height, height);
        ctx.stroke();
        nCtx.strokeStyle = `rgba(${darker ? 115 : 140},${darker ? 115 : 140},255,${alpha * 2})`;
        nCtx.lineWidth = 0.8;
        nCtx.beginPath();
        nCtx.moveTo(i, 0);
        nCtx.lineTo(i + height, height);
        nCtx.stroke();
      }
      // フレックドット
      const dotCount = Math.floor((width * height) / 80);
      for (let d = 0; d < dotCount; d++) {
        const dx = Math.random() * width;
        const dy = Math.random() * height;
        const dotAlpha = 0.15 + Math.random() * 0.2;
        const fleck = [cr + (Math.random() - 0.5) * 40, cg + (Math.random() - 0.5) * 40, cb + (Math.random() - 0.5) * 40];
        ctx.fillStyle = `rgba(${fleck[0]},${fleck[1]},${fleck[2]},${dotAlpha})`;
        ctx.fillRect(dx, dy, 1.5, 1.5);
      }
      break;
    }
    case 'velvet': {
      // スムースグラデーション + 方向性シェーディング
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, `rgba(${cr + 20},${cg + 20},${cb + 20},0.3)`);
      grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.1)`);
      grad.addColorStop(1, `rgba(${cr - 15},${cg - 15},${cb - 15},0.3)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      // 微細なノイズ
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (Math.random() > 0.7) {
            const noise = (Math.random() - 0.5) * 8;
            ctx.fillStyle = `rgba(${cr + noise},${cg + noise},${cb + noise},0.05)`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      // ノーマルマップ: 方向性
      const nGrad = nCtx.createLinearGradient(0, 0, width, height);
      nGrad.addColorStop(0, 'rgba(140,140,255,0.3)');
      nGrad.addColorStop(1, 'rgba(116,116,255,0.3)');
      nCtx.fillStyle = nGrad;
      nCtx.fillRect(0, 0, width, height);
      break;
    }
    case 'canvas': {
      // 粗いクロスハッチ 2pxスペーシング
      for (let y = 0; y < height; y += 4) {
        const alpha = 0.1 + Math.random() * 0.12;
        const light = Math.random() > 0.5;
        ctx.strokeStyle = `rgba(${light ? cr + 15 : cr - 20},${light ? cg + 15 : cg - 20},${light ? cb + 15 : cb - 20},${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        nCtx.strokeStyle = `rgba(${light ? 142 : 114},128,255,${alpha * 2})`;
        nCtx.lineWidth = 1;
        nCtx.beginPath();
        nCtx.moveTo(0, y);
        nCtx.lineTo(width, y);
        nCtx.stroke();
      }
      for (let x = 0; x < width; x += 4) {
        const alpha = 0.1 + Math.random() * 0.12;
        const light = Math.random() > 0.5;
        ctx.strokeStyle = `rgba(${light ? cr + 15 : cr - 20},${light ? cg + 15 : cg - 20},${light ? cb + 15 : cb - 20},${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        nCtx.strokeStyle = `rgba(128,${light ? 142 : 114},255,${alpha * 2})`;
        nCtx.lineWidth = 1;
        nCtx.beginPath();
        nCtx.moveTo(x, 0);
        nCtx.lineTo(x, height);
        nCtx.stroke();
      }
      break;
    }
    case 'wool': {
      // ツイードに似ているが、より密で柔らかい
      for (let y = 0; y < height; y += 2) {
        const alpha = 0.05 + Math.random() * 0.08;
        const light = Math.random() > 0.5;
        ctx.strokeStyle = `rgba(${light ? cr + 10 : cr - 10},${light ? cg + 10 : cg - 10},${light ? cb + 10 : cb - 10},${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let x = 0; x < width; x += 3) {
          const wavY = y + Math.sin(x * 0.3) * 0.5;
          if (x === 0) ctx.moveTo(x, wavY);
          else ctx.lineTo(x, wavY);
        }
        ctx.stroke();
      }
      // フレックドット（少なめ）
      const wDots = Math.floor((width * height) / 120);
      for (let d = 0; d < wDots; d++) {
        const dx = Math.random() * width;
        const dy = Math.random() * height;
        ctx.fillStyle = `rgba(${cr + (Math.random() - 0.5) * 30},${cg + (Math.random() - 0.5) * 30},${cb + (Math.random() - 0.5) * 30},0.1)`;
        ctx.fillRect(dx, dy, 1, 1);
      }
      break;
    }
  }

  const mapTex = new THREE.CanvasTexture(canvas);
  mapTex.wrapS = THREE.RepeatWrapping;
  mapTex.wrapT = THREE.RepeatWrapping;
  const normalTex = new THREE.CanvasTexture(normalCanvas);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;

  const result = { map: mapTex, normalMap: normalTex };
  fabricTextureCache.set(key, result);
  return result;
}

/** 金属テクスチャキャッシュ */
const metalTextureCache = new Map<string, { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture }>();

/** 金属仕上げプロシージャルテクスチャ生成 */
export function generateMetalTexture(width: number, height: number, finish: MetalFinish): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const key = `metal-${finish}-${width}-${height}`;
  const cached = metalTextureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = width;
  normalCanvas.height = height;
  const nCtx = normalCanvas.getContext('2d')!;
  nCtx.fillStyle = 'rgb(128,128,255)';
  nCtx.fillRect(0, 0, width, height);

  switch (finish) {
    case 'brushed': {
      // ベース: 明るいシルバー
      ctx.fillStyle = 'rgb(190,190,195)';
      ctx.fillRect(0, 0, width, height);
      // 水平方向の非常に細い平行線
      for (let y = 0; y < height; y += 1) {
        const alpha = 0.03 + Math.random() * 0.06;
        const brightness = 180 + Math.random() * 30;
        ctx.strokeStyle = `rgba(${brightness},${brightness},${brightness + 5},${alpha})`;
        ctx.lineWidth = 0.3 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        // ノーマルマップ: 水平ラインの微細な凹凸
        nCtx.strokeStyle = `rgba(128,${125 + Math.random() * 6},255,${alpha * 3})`;
        nCtx.lineWidth = 0.3;
        nCtx.beginPath();
        nCtx.moveTo(0, y);
        nCtx.lineTo(width, y);
        nCtx.stroke();
      }
      break;
    }
    case 'polished': {
      // ほぼ均一 + わずかなグラデーション
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, 'rgb(215,215,220)');
      grad.addColorStop(0.4, 'rgb(200,200,205)');
      grad.addColorStop(0.6, 'rgb(210,210,215)');
      grad.addColorStop(1, 'rgb(195,195,200)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      // 微細スペキュラポイント
      for (let i = 0; i < 20; i++) {
        const sx = Math.random() * width;
        const sy = Math.random() * height;
        ctx.fillStyle = `rgba(240,240,245,${0.05 + Math.random() * 0.1})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'oxidized': {
      // ベース: ダークメタル
      ctx.fillStyle = 'rgb(100,95,90)';
      ctx.fillRect(0, 0, width, height);
      // パッチ状の暗いスポット
      const patchCount = 15 + Math.floor(Math.random() * 10);
      for (let p = 0; p < patchCount; p++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pr = 5 + Math.random() * 15;
        const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr);
        const dark = 60 + Math.random() * 30;
        pGrad.addColorStop(0, `rgba(${dark},${dark - 5},${dark - 10},0.4)`);
        pGrad.addColorStop(1, `rgba(${dark + 20},${dark + 15},${dark + 10},0)`);
        ctx.fillStyle = pGrad;
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
        // ノーマルマップ: パッチ凹凸
        const nGrad = nCtx.createRadialGradient(px, py, 0, px, py, pr);
        nGrad.addColorStop(0, 'rgba(118,118,255,0.3)');
        nGrad.addColorStop(1, 'rgba(128,128,255,0)');
        nCtx.fillStyle = nGrad;
        nCtx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      // 細かいノイズ
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
          if (Math.random() > 0.6) {
            const n = 80 + Math.random() * 40;
            ctx.fillStyle = `rgba(${n},${n - 5},${n - 10},0.08)`;
            ctx.fillRect(x, y, 2, 2);
          }
        }
      }
      break;
    }
    case 'matte': {
      // 均一なマット仕上げ
      ctx.fillStyle = 'rgb(175,175,180)';
      ctx.fillRect(0, 0, width, height);
      // 極微細ノイズ
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (Math.random() > 0.8) {
            const n = 170 + Math.random() * 15;
            ctx.fillStyle = `rgba(${n},${n},${n + 3},0.04)`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
      break;
    }
    case 'brass': {
      // ブラス/真鍮
      ctx.fillStyle = 'rgb(195,170,80)';
      ctx.fillRect(0, 0, width, height);
      // パティナ（緑青）のスポット
      const patCount = 8 + Math.floor(Math.random() * 8);
      for (let p = 0; p < patCount; p++) {
        const px = Math.random() * width;
        const py = Math.random() * height;
        const pr = 3 + Math.random() * 10;
        const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr);
        pGrad.addColorStop(0, `rgba(100,140,90,0.2)`);
        pGrad.addColorStop(1, `rgba(120,150,100,0)`);
        ctx.fillStyle = pGrad;
        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
      // ブラッシュライン（わずか）
      for (let y = 0; y < height; y += 3) {
        ctx.strokeStyle = `rgba(210,185,95,${0.03 + Math.random() * 0.05})`;
        ctx.lineWidth = 0.3;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      break;
    }
  }

  const mapTex = new THREE.CanvasTexture(canvas);
  mapTex.wrapS = THREE.RepeatWrapping;
  mapTex.wrapT = THREE.RepeatWrapping;
  const normalTex = new THREE.CanvasTexture(normalCanvas);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;

  const result = { map: mapTex, normalMap: normalTex };
  metalTextureCache.set(key, result);
  return result;
}

/** 品質レベル連動テクスチャ解像度ヘルパー */
export function getFurnitureTexSizes(ql: 'high' | 'medium' | 'low') {
  const size = ql === 'high' ? 2048 : ql === 'medium' ? 512 : 256;
  const small = ql === 'high' ? 1024 : ql === 'medium' ? 256 : 128;
  return { size, small };
}
