import * as THREE from 'three';

/* ─── 型定義 ─── */

export type AnisotropyDirection = 'horizontal' | 'vertical' | 'circular';

/* ─── テクスチャキャッシュ ─── */
const anisotropyMapCache = new Map<string, THREE.CanvasTexture>();

/* ─── 方向マップ生成 ─── */

/**
 * 異方性反射の方向を指定するテクスチャを Canvas API で生成
 *
 * RGチャンネルで方向ベクトル (x, y) を符号化:
 *   - horizontal: (1, 0) → rgb(255, 128, 0)
 *   - vertical:   (0, 1) → rgb(128, 255, 0)
 *   - circular:   中心から放射状 → 各ピクセルごとに計算
 *
 * @param direction - 反射方向
 * @param size - テクスチャ解像度 (デフォルト 256)
 */
function generateAnisotropyDirectionMap(
  direction: AnisotropyDirection,
  size: number = 256,
): THREE.CanvasTexture {
  const key = `aniso-dir-${direction}-${size}`;
  const cached = anisotropyMapCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  switch (direction) {
    case 'horizontal': {
      // 水平方向の一様グラデーション
      // 方向ベクトル: (1, 0) → R=255, G=128
      ctx.fillStyle = 'rgb(255,128,128)';
      ctx.fillRect(0, 0, size, size);

      // 微細なバリエーション（ブラシ跡のゆらぎ）
      for (let y = 0; y < size; y += 1) {
        const variation = Math.sin(y * 0.05) * 3;
        ctx.fillStyle = `rgb(${255},${128 + Math.floor(variation)},128)`;
        ctx.fillRect(0, y, size, 1);
      }
      break;
    }
    case 'vertical': {
      // 垂直方向の一様グラデーション
      // 方向ベクトル: (0, 1) → R=128, G=255
      ctx.fillStyle = 'rgb(128,255,128)';
      ctx.fillRect(0, 0, size, size);

      for (let x = 0; x < size; x += 1) {
        const variation = Math.sin(x * 0.05) * 3;
        ctx.fillStyle = `rgb(${128 + Math.floor(variation)},255,128)`;
        ctx.fillRect(x, 0, 1, size);
      }
      break;
    }
    case 'circular': {
      // 放射状パターン（中心から外に向かう方向）
      const imageData = ctx.createImageData(size, size);
      const data = imageData.data;
      const cx = size / 2;
      const cy = size / 2;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const len = Math.sqrt(dx * dx + dy * dy);

          let nx: number;
          let ny: number;
          if (len > 0.001) {
            // 接線方向（放射方向を90°回転）
            nx = -dy / len;
            ny = dx / len;
          } else {
            nx = 1;
            ny = 0;
          }

          const idx = (y * size + x) * 4;
          // 符号化: [-1,1] → [0,255]
          data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
          data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          data[idx + 2] = 128;
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      break;
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  anisotropyMapCache.set(key, texture);
  return texture;
}

/* ─── 公開API ─── */

/**
 * MeshPhysicalMaterial に異方性反射を設定する
 *
 * ブラシ加工金属、シルク/サテン、研磨木材などの方向性のある反射を再現。
 *
 * @param material - 対象の MeshPhysicalMaterial
 * @param direction - 反射方向 ('horizontal' | 'vertical' | 'circular')
 * @param strength - 異方性強度 (0〜1, デフォルト 0.5)
 * @param textureSize - 方向マップの解像度 (デフォルト 256)
 *
 * @example
 * ```ts
 * const mat = new THREE.MeshPhysicalMaterial({ color: 0x888888, metalness: 0.9 });
 * applyAnisotropicReflection(mat, 'horizontal', 0.7);
 * ```
 */
export function applyAnisotropicReflection(
  material: THREE.MeshPhysicalMaterial,
  direction: AnisotropyDirection,
  strength: number = 0.5,
  textureSize: number = 256,
): void {
  const clamped = Math.max(0, Math.min(1, strength));
  if (clamped === 0) return;

  // MeshPhysicalMaterial の anisotropy プロパティを設定
  material.anisotropy = clamped;

  // 方向に応じた回転角を設定
  switch (direction) {
    case 'horizontal':
      material.anisotropyRotation = 0;
      break;
    case 'vertical':
      material.anisotropyRotation = Math.PI / 2;
      break;
    case 'circular':
      // circular の場合は方向マップで制御
      material.anisotropyRotation = 0;
      break;
  }

  // 方向マップを生成・適用
  const directionMap = generateAnisotropyDirectionMap(direction, textureSize);
  material.anisotropyMap = directionMap;

  material.needsUpdate = true;
}

/**
 * ブラシ加工金属向けプリセット
 * 高メタルネス + 低ラフネスでブラシラインが目立つ設定
 */
export function applyBrushedMetalAnisotropy(
  material: THREE.MeshPhysicalMaterial,
  direction: AnisotropyDirection = 'horizontal',
): void {
  material.metalness = 0.9;
  material.roughness = 0.25;
  applyAnisotropicReflection(material, direction, 0.8);
}

/**
 * シルク/サテン布地向けプリセット
 * 低メタルネス + 中程度ラフネスで繊維方向の光沢を再現
 */
export function applySilkAnisotropy(
  material: THREE.MeshPhysicalMaterial,
  direction: AnisotropyDirection = 'vertical',
): void {
  material.metalness = 0.0;
  material.roughness = 0.4;
  material.sheen = 0.8;
  material.sheenColor = material.color.clone().multiplyScalar(1.2);
  applyAnisotropicReflection(material, direction, 0.5);
}

/**
 * 研磨木材向けプリセット
 * 木目方向に沿った微かな異方性反射
 */
export function applyPolishedWoodAnisotropy(
  material: THREE.MeshPhysicalMaterial,
  direction: AnisotropyDirection = 'vertical',
): void {
  material.metalness = 0.0;
  material.roughness = 0.3;
  material.clearcoat = 0.6;
  material.clearcoatRoughness = 0.15;
  applyAnisotropicReflection(material, direction, 0.3);
}

/**
 * 異方性反射テクスチャキャッシュをクリア
 */
export function clearAnisotropyCache(): void {
  anisotropyMapCache.clear();
}
