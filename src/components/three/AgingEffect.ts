import * as THREE from 'three';

/* ─── 型定義 ─── */

export type AgingType = 'rust' | 'patina' | 'wear' | 'none';

/* ─── Canvas APIテクスチャ生成ヘルパー ─── */

function createOverlayCanvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // 透明ベース
  ctx.clearRect(0, 0, size, size);
  return { canvas, ctx };
}

/* ─── テクスチャキャッシュ ─── */
const agingTextureCache = new Map<string, {
  colorOverlay: THREE.CanvasTexture;
  roughnessOverlay: THREE.CanvasTexture;
}>();

/* ─── 錆エフェクト ─── */

function generateRustTextures(
  intensity: number,
  size: number,
): { colorOverlay: THREE.CanvasTexture; roughnessOverlay: THREE.CanvasTexture } {
  const key = `rust-${intensity.toFixed(2)}-${size}`;
  const cached = agingTextureCache.get(key);
  if (cached) return cached;

  // カラーオーバーレイ: 茶色/オレンジのパッチ
  const { canvas: colorCanvas, ctx: cCtx } = createOverlayCanvas(size);
  const patchCount = Math.floor(10 + intensity * 40);

  for (let i = 0; i < patchCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 5 + Math.random() * 25 * intensity;
    const grad = cCtx.createRadialGradient(x, y, 0, x, y, radius);

    // 錆色: 茶〜オレンジ
    const r = 140 + Math.floor(Math.random() * 60);
    const g = 50 + Math.floor(Math.random() * 40);
    const b = 10 + Math.floor(Math.random() * 20);
    const alpha = 0.2 + intensity * 0.5 * Math.random();

    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(0.6, `rgba(${r - 20},${g + 10},${b},${alpha * 0.5})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    cCtx.fillStyle = grad;
    cCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // 細かい粒状のノイズ
  for (let py = 0; py < size; py += 2) {
    for (let px = 0; px < size; px += 2) {
      if (Math.random() < intensity * 0.15) {
        const nr = 120 + Math.floor(Math.random() * 80);
        const ng = 40 + Math.floor(Math.random() * 30);
        cCtx.fillStyle = `rgba(${nr},${ng},15,${0.1 + Math.random() * 0.2})`;
        cCtx.fillRect(px, py, 2, 2);
      }
    }
  }

  // ラフネスオーバーレイ: 錆部分は粗い
  const { canvas: roughCanvas, ctx: rCtx } = createOverlayCanvas(size);
  rCtx.fillStyle = `rgba(255,255,255,${0.3 * intensity})`;
  rCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < patchCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 5 + Math.random() * 20 * intensity;
    const grad = rCtx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(255,255,255,${0.5 * intensity})`);
    grad.addColorStop(1, `rgba(255,255,255,0)`);
    rCtx.fillStyle = grad;
    rCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const colorOverlay = new THREE.CanvasTexture(colorCanvas);
  colorOverlay.wrapS = THREE.RepeatWrapping;
  colorOverlay.wrapT = THREE.RepeatWrapping;
  const roughnessOverlay = new THREE.CanvasTexture(roughCanvas);
  roughnessOverlay.wrapS = THREE.RepeatWrapping;
  roughnessOverlay.wrapT = THREE.RepeatWrapping;

  const result = { colorOverlay, roughnessOverlay };
  agingTextureCache.set(key, result);
  return result;
}

/* ─── パティナ（緑青）エフェクト ─── */

function generatePatinaTextures(
  intensity: number,
  size: number,
): { colorOverlay: THREE.CanvasTexture; roughnessOverlay: THREE.CanvasTexture } {
  const key = `patina-${intensity.toFixed(2)}-${size}`;
  const cached = agingTextureCache.get(key);
  if (cached) return cached;

  const { canvas: colorCanvas, ctx: cCtx } = createOverlayCanvas(size);
  const patchCount = Math.floor(8 + intensity * 30);

  for (let i = 0; i < patchCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = 8 + Math.random() * 30 * intensity;
    const grad = cCtx.createRadialGradient(x, y, 0, x, y, radius);

    // 緑青色: 青緑〜灰緑
    const r = 60 + Math.floor(Math.random() * 40);
    const g = 130 + Math.floor(Math.random() * 50);
    const b = 100 + Math.floor(Math.random() * 40);
    const alpha = 0.15 + intensity * 0.45 * Math.random();

    grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    grad.addColorStop(0.4, `rgba(${r + 10},${g - 10},${b + 10},${alpha * 0.7})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    cCtx.fillStyle = grad;
    cCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // 縞模様の流れ（雨だれ風）
  const streakCount = Math.floor(3 + intensity * 8);
  for (let i = 0; i < streakCount; i++) {
    const sx = Math.random() * size;
    cCtx.strokeStyle = `rgba(70,150,120,${0.08 + intensity * 0.12})`;
    cCtx.lineWidth = 1 + Math.random() * 2;
    cCtx.beginPath();
    cCtx.moveTo(sx, 0);
    let cy = 0;
    while (cy < size) {
      cy += 5 + Math.random() * 10;
      cCtx.lineTo(sx + (Math.random() - 0.5) * 6, cy);
    }
    cCtx.stroke();
  }

  const { canvas: roughCanvas, ctx: rCtx } = createOverlayCanvas(size);
  rCtx.fillStyle = `rgba(200,200,200,${0.2 * intensity})`;
  rCtx.fillRect(0, 0, size, size);

  const colorOverlay = new THREE.CanvasTexture(colorCanvas);
  colorOverlay.wrapS = THREE.RepeatWrapping;
  colorOverlay.wrapT = THREE.RepeatWrapping;
  const roughnessOverlay = new THREE.CanvasTexture(roughCanvas);
  roughnessOverlay.wrapS = THREE.RepeatWrapping;
  roughnessOverlay.wrapT = THREE.RepeatWrapping;

  const result = { colorOverlay, roughnessOverlay };
  agingTextureCache.set(key, result);
  return result;
}

/* ─── 摩耗エフェクト ─── */

function generateWearTextures(
  intensity: number,
  size: number,
): { colorOverlay: THREE.CanvasTexture; roughnessOverlay: THREE.CanvasTexture } {
  const key = `wear-${intensity.toFixed(2)}-${size}`;
  const cached = agingTextureCache.get(key);
  if (cached) return cached;

  const { canvas: colorCanvas, ctx: cCtx } = createOverlayCanvas(size);

  // エッジ摩耗パターン: 端に近い部分ほど摩耗が目立つ
  // 四辺のエッジライン
  const edgeWidth = 8 + intensity * 20;
  const edgeAlpha = 0.1 + intensity * 0.35;

  // 上辺
  const topGrad = cCtx.createLinearGradient(0, 0, 0, edgeWidth);
  topGrad.addColorStop(0, `rgba(200,195,185,${edgeAlpha})`);
  topGrad.addColorStop(1, `rgba(200,195,185,0)`);
  cCtx.fillStyle = topGrad;
  cCtx.fillRect(0, 0, size, edgeWidth);

  // 下辺
  const botGrad = cCtx.createLinearGradient(0, size, 0, size - edgeWidth);
  botGrad.addColorStop(0, `rgba(200,195,185,${edgeAlpha})`);
  botGrad.addColorStop(1, `rgba(200,195,185,0)`);
  cCtx.fillStyle = botGrad;
  cCtx.fillRect(0, size - edgeWidth, size, edgeWidth);

  // 左辺
  const leftGrad = cCtx.createLinearGradient(0, 0, edgeWidth, 0);
  leftGrad.addColorStop(0, `rgba(200,195,185,${edgeAlpha})`);
  leftGrad.addColorStop(1, `rgba(200,195,185,0)`);
  cCtx.fillStyle = leftGrad;
  cCtx.fillRect(0, 0, edgeWidth, size);

  // 右辺
  const rightGrad = cCtx.createLinearGradient(size, 0, size - edgeWidth, 0);
  rightGrad.addColorStop(0, `rgba(200,195,185,${edgeAlpha})`);
  rightGrad.addColorStop(1, `rgba(200,195,185,0)`);
  cCtx.fillStyle = rightGrad;
  cCtx.fillRect(size - edgeWidth, 0, edgeWidth, size);

  // ランダムな擦れ傷
  const scratchCount = Math.floor(5 + intensity * 20);
  for (let i = 0; i < scratchCount; i++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const length = 10 + Math.random() * 40 * intensity;
    const angle = Math.random() * Math.PI;
    cCtx.strokeStyle = `rgba(210,205,195,${0.1 + intensity * 0.2})`;
    cCtx.lineWidth = 0.5 + Math.random() * 1.5;
    cCtx.beginPath();
    cCtx.moveTo(sx, sy);
    cCtx.lineTo(sx + Math.cos(angle) * length, sy + Math.sin(angle) * length);
    cCtx.stroke();
  }

  // ラフネス: 摩耗部分はツルツル（低い値）
  const { canvas: roughCanvas, ctx: rCtx } = createOverlayCanvas(size);
  // 摩耗部分を暗く（= ラフネス低い = 研磨された）
  const rEdgeWidth = edgeWidth * 0.8;
  const rAlpha = 0.15 * intensity;
  rCtx.fillStyle = `rgba(0,0,0,${rAlpha})`;
  rCtx.fillRect(0, 0, size, rEdgeWidth);
  rCtx.fillRect(0, size - rEdgeWidth, size, rEdgeWidth);
  rCtx.fillRect(0, 0, rEdgeWidth, size);
  rCtx.fillRect(size - rEdgeWidth, 0, rEdgeWidth, size);

  const colorOverlay = new THREE.CanvasTexture(colorCanvas);
  colorOverlay.wrapS = THREE.RepeatWrapping;
  colorOverlay.wrapT = THREE.RepeatWrapping;
  const roughnessOverlay = new THREE.CanvasTexture(roughCanvas);
  roughnessOverlay.wrapS = THREE.RepeatWrapping;
  roughnessOverlay.wrapT = THREE.RepeatWrapping;

  const result = { colorOverlay, roughnessOverlay };
  agingTextureCache.set(key, result);
  return result;
}

/* ─── 公開API ─── */

/**
 * マテリアルに錆エフェクトを適用
 * @param material - 対象の MeshPhysicalMaterial
 * @param intensity - 0（なし）〜 1（重度の錆）
 * @param textureSize - テクスチャ解像度 (デフォルト 512)
 */
export function applyRustEffect(
  material: THREE.MeshPhysicalMaterial,
  intensity: number,
  textureSize: number = 512,
): void {
  const clamped = Math.max(0, Math.min(1, intensity));
  if (clamped === 0) return;

  const { colorOverlay, roughnessOverlay } = generateRustTextures(clamped, textureSize);
  material.map = colorOverlay;
  material.roughnessMap = roughnessOverlay;
  material.roughness = Math.min(1, material.roughness + clamped * 0.3);
  material.metalness = Math.max(0, material.metalness - clamped * 0.2);
  material.needsUpdate = true;
}

/**
 * マテリアルにパティナ（緑青）エフェクトを適用
 * @param material - 対象の MeshPhysicalMaterial
 * @param intensity - 0（なし）〜 1（厚い緑青）
 * @param textureSize - テクスチャ解像度 (デフォルト 512)
 */
export function applyPatinaEffect(
  material: THREE.MeshPhysicalMaterial,
  intensity: number,
  textureSize: number = 512,
): void {
  const clamped = Math.max(0, Math.min(1, intensity));
  if (clamped === 0) return;

  const { colorOverlay, roughnessOverlay } = generatePatinaTextures(clamped, textureSize);
  material.map = colorOverlay;
  material.roughnessMap = roughnessOverlay;
  material.roughness = Math.min(1, material.roughness + clamped * 0.15);
  material.needsUpdate = true;
}

/**
 * マテリアルに摩耗エフェクトを適用（エッジが擦れて下地色が見える）
 * @param material - 対象の MeshPhysicalMaterial
 * @param intensity - 0（なし）〜 1（激しい摩耗）
 * @param textureSize - テクスチャ解像度 (デフォルト 512)
 */
export function applyWearEffect(
  material: THREE.MeshPhysicalMaterial,
  intensity: number,
  textureSize: number = 512,
): void {
  const clamped = Math.max(0, Math.min(1, intensity));
  if (clamped === 0) return;

  const { colorOverlay, roughnessOverlay } = generateWearTextures(clamped, textureSize);
  material.map = colorOverlay;
  material.roughnessMap = roughnessOverlay;
  material.roughness = Math.max(0, material.roughness - clamped * 0.1);
  material.needsUpdate = true;
}

/**
 * 統合エージングエフェクト適用関数
 * @param material - 対象の MeshPhysicalMaterial
 * @param agingType - エージングタイプ
 * @param intensity - 0（なし）〜 1（最大効果）
 * @param textureSize - テクスチャ解像度 (デフォルト 512)
 */
export function applyAgingEffect(
  material: THREE.MeshPhysicalMaterial,
  agingType: AgingType,
  intensity: number,
  textureSize: number = 512,
): void {
  switch (agingType) {
    case 'rust':
      applyRustEffect(material, intensity, textureSize);
      break;
    case 'patina':
      applyPatinaEffect(material, intensity, textureSize);
      break;
    case 'wear':
      applyWearEffect(material, intensity, textureSize);
      break;
    case 'none':
      break;
  }
}

/**
 * エージングテクスチャキャッシュをクリア
 */
export function clearAgingCache(): void {
  agingTextureCache.clear();
}
