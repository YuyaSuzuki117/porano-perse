/**
 * 木材断面（年輪パターン）テクスチャ生成
 *
 * 木口面（こぐちめん）の同心円状年輪をCanvas APIでプロシージャル生成する。
 * 樹種ごとの色・年輪特徴・髄線（放射組織）を再現。
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 対応樹種 */
export type RingWoodSpecies = 'oak' | 'walnut' | 'pine' | 'cherry' | 'maple';

/** 樹種別カラー定義 */
interface SpeciesColorProfile {
  /** 心材の基本色 RGB */
  heartwood: [number, number, number];
  /** 辺材の基本色 RGB */
  sapwood: [number, number, number];
  /** 年輪暗部の色 RGB */
  ringDark: [number, number, number];
  /** 年輪明部の色 RGB */
  ringLight: [number, number, number];
  /** 髄線（放射組織）を描画するか */
  hasRays: boolean;
  /** 髄線の色 RGB（hasRays=true のときのみ使用） */
  rayColor: [number, number, number];
  /** 樹脂線を描画するか（マツ科） */
  hasResinLines: boolean;
}

// ---------------------------------------------------------------------------
// 樹種別カラープロファイル
// ---------------------------------------------------------------------------

const SPECIES_PROFILES: Record<RingWoodSpecies, SpeciesColorProfile> = {
  oak: {
    // ゴールデンブラウン・目立つ髄線
    heartwood: [178, 140, 75],
    sapwood: [220, 200, 160],
    ringDark: [145, 110, 55],
    ringLight: [195, 160, 95],
    hasRays: true,
    rayColor: [210, 185, 130],
    hasResinLines: false,
  },
  walnut: {
    // ダークチョコレート・明るい辺材
    heartwood: [75, 50, 30],
    sapwood: [180, 160, 130],
    ringDark: [55, 35, 18],
    ringLight: [95, 65, 40],
    hasRays: false,
    rayColor: [0, 0, 0],
    hasResinLines: false,
  },
  pine: {
    // ライトイエロー・目立つ樹脂線
    heartwood: [215, 190, 140],
    sapwood: [235, 220, 180],
    ringDark: [185, 155, 100],
    ringLight: [230, 210, 165],
    hasRays: false,
    rayColor: [0, 0, 0],
    hasResinLines: true,
  },
  cherry: {
    // 温かみのある赤茶色
    heartwood: [165, 90, 55],
    sapwood: [215, 180, 150],
    ringDark: [135, 70, 38],
    ringLight: [185, 110, 70],
    hasRays: false,
    rayColor: [0, 0, 0],
    hasResinLines: false,
  },
  maple: {
    // 淡いクリーム色・微細な杢
    heartwood: [230, 215, 190],
    sapwood: [240, 230, 210],
    ringDark: [205, 190, 160],
    ringLight: [238, 225, 200],
    hasRays: false,
    rayColor: [0, 0, 0],
    hasResinLines: false,
  },
};

// ---------------------------------------------------------------------------
// シード付き疑似乱数（Mulberry32）
// ---------------------------------------------------------------------------

function createSeededRNG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** RGB配列を CSS色文字列に変換 */
function rgb(c: [number, number, number], alpha = 1): string {
  if (alpha >= 1) return `rgb(${c[0]},${c[1]},${c[2]})`;
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/** 2色の線形補間 */
function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ---------------------------------------------------------------------------
// キャッシュ
// ---------------------------------------------------------------------------

const ringTextureCache = new Map<string, HTMLCanvasElement>();
const ringNormalCache = new Map<string, HTMLCanvasElement>();

// ---------------------------------------------------------------------------
// メインAPI: 年輪テクスチャ生成
// ---------------------------------------------------------------------------

/**
 * 木材断面の年輪パターンテクスチャを生成
 *
 * @param size - テクスチャ解像度（正方形ピクセル数）
 * @param species - 樹種
 * @param seed - 再現性確保用のシード値
 * @returns HTMLCanvasElement — THREE.CanvasTexture のソースとして使用可能
 *
 * 統合ポイント:
 * - FloorMesh.tsx: 木口面フローリングパターンの生成に利用可能
 * - wood-grain-variation.ts: 既存の木目（板目/柾目）テクスチャと組み合わせて使用
 * - Furniture コンポーネント: テーブル天板の木口断面描画に利用可能
 */
export function generateWoodRingTexture(
  size: number,
  species: RingWoodSpecies,
  seed: number,
): HTMLCanvasElement {
  const cacheKey = `ring-${size}-${species}-${seed}`;
  const cached = ringTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = createSeededRNG(seed);

  const profile = SPECIES_PROFILES[species];
  const center = size / 2;

  // 年輪の中心をわずかにずらして自然さを出す
  const centerX = center + (rng() - 0.5) * size * 0.08;
  const centerY = center + (rng() - 0.5) * size * 0.08;

  // --- 背景: 心材色で塗りつぶし ---
  ctx.fillStyle = rgb(profile.heartwood);
  ctx.fillRect(0, 0, size, size);

  // --- 年輪の生成 ---
  // 最大半径は対角線の半分（角まで到達するように）
  const maxRadius = Math.sqrt(2) * center;
  // 年輪の平均間隔: サイズに応じて調整
  const avgSpacing = size / 60;

  // 各年輪の半径を事前計算（成長速度の変動を再現）
  const ringRadii: number[] = [];
  let currentRadius = avgSpacing * (0.3 + rng() * 0.5);

  while (currentRadius < maxRadius) {
    ringRadii.push(currentRadius);
    // 成長速度の変動: 狭い年輪（遅い成長年）と広い年輪（速い成長年）
    const growthFactor = 0.4 + rng() * 1.2;
    currentRadius += avgSpacing * growthFactor;
  }

  const totalRings = ringRadii.length;

  // 心材/辺材の境界（全体の約70%の位置）
  const heartwoodBoundary = maxRadius * (0.6 + rng() * 0.15);

  // --- 年輪の描画 ---
  for (let i = 0; i < totalRings; i++) {
    const radius = ringRadii[i];
    const nextRadius = i + 1 < totalRings ? ringRadii[i + 1] : radius + avgSpacing;
    const ringWidth = nextRadius - radius;

    // 心材/辺材に応じた色を決定
    const isHeartwood = radius < heartwoodBoundary;
    const transitionZone = Math.abs(radius - heartwoodBoundary) < avgSpacing * 3;

    let baseColor: [number, number, number];
    if (transitionZone) {
      // 心材/辺材の遷移帯: グラデーション
      const t = clamp((radius - heartwoodBoundary + avgSpacing * 3) / (avgSpacing * 6), 0, 1);
      baseColor = lerpColor(profile.heartwood, profile.sapwood, t);
    } else {
      baseColor = isHeartwood ? profile.heartwood : profile.sapwood;
    }

    // 早材（春材）= 明色・幅広、晩材（夏材）= 暗色・幅狭
    // 早材部分を描画
    const earlyWoodRatio = 0.5 + rng() * 0.25;
    const earlyColor = lerpColor(baseColor, profile.ringLight, 0.3 + rng() * 0.2);
    const lateColor = lerpColor(baseColor, profile.ringDark, 0.3 + rng() * 0.3);

    // 年輪を円弧として描画（自然な揺らぎ付き）
    // 早材（内側の明るい部分）
    ctx.beginPath();
    ctx.strokeStyle = rgb(earlyColor, 0.6 + rng() * 0.3);
    ctx.lineWidth = Math.max(0.5, ringWidth * earlyWoodRatio);
    const earlyRadius = radius + ringWidth * earlyWoodRatio * 0.5;
    drawWobblyCircle(ctx, centerX, centerY, earlyRadius, rng, size);
    ctx.stroke();

    // 晩材（外側の暗い部分）
    ctx.beginPath();
    ctx.strokeStyle = rgb(lateColor, 0.7 + rng() * 0.25);
    ctx.lineWidth = Math.max(0.3, ringWidth * (1 - earlyWoodRatio));
    const lateRadius = radius + ringWidth * (earlyWoodRatio + (1 - earlyWoodRatio) * 0.5);
    drawWobblyCircle(ctx, centerX, centerY, lateRadius, rng, size);
    ctx.stroke();
  }

  // --- 髄線（放射組織）の描画: オーク用 ---
  if (profile.hasRays) {
    drawMedullaryRays(ctx, centerX, centerY, maxRadius, profile.rayColor, rng, size);
  }

  // --- 樹脂線の描画: マツ用 ---
  if (profile.hasResinLines) {
    drawResinLines(ctx, centerX, centerY, maxRadius, rng, size);
  }

  // --- 微細なノイズを追加して質感を向上 ---
  addSurfaceNoise(ctx, size, rng, profile.heartwood);

  ringTextureCache.set(cacheKey, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// メインAPI: 年輪ノーマルマップ生成
// ---------------------------------------------------------------------------

/**
 * 年輪の凹凸を表現するノーマルマップを生成
 *
 * @param size - テクスチャ解像度
 * @param ringCount - 年輪数（密度制御用）
 * @returns HTMLCanvasElement — THREE.CanvasTexture のソースとして使用可能
 *
 * 統合ポイント:
 * - FloorMesh.tsx の normalMap として使用
 * - tile-grout-generator.ts の generateTileNormalMap と同じ座標系
 */
export function generateWoodRingNormalMap(
  size: number,
  ringCount: number,
): HTMLCanvasElement {
  const cacheKey = `ring-normal-${size}-${ringCount}`;
  const cached = ringNormalCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // フラットノーマルで初期化 (128, 128, 255) = 上向き法線
  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  const center = size / 2;
  // 年輪間隔（ピクセル単位）
  const spacing = (size * 0.45) / Math.max(1, ringCount);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px - center;
      const dy = py - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 年輪位置に対する相対位置（0～1の周期）
      const ringPhase = (dist / spacing) % 1;

      // 年輪の凹凸: 晩材境界で溝ができる
      // 晩材境界付近（phase ≈ 0.8～1.0）で凹む
      let depth = 0;
      if (ringPhase > 0.75) {
        // 境界に向かう傾斜
        depth = (ringPhase - 0.75) * 4; // 0→1
      } else if (ringPhase < 0.05) {
        // 境界から戻る傾斜
        depth = 1 - ringPhase * 20; // 1→0
      }

      // 法線の方向: 中心からの放射方向に沿って傾ける
      const normalLen = Math.max(0.001, dist);
      const nx = dx / normalLen;
      const ny = dy / normalLen;

      // 深さに応じたノーマルマップ値
      const strength = depth * 0.3; // 凹凸の強さ（控えめに）
      const idx = (py * size + px) * 4;

      // R = X方向法線, G = Y方向法線, B = Z方向法線
      data[idx] = clamp(Math.round(128 + nx * strength * 127), 0, 255);
      data[idx + 1] = clamp(Math.round(128 + ny * strength * 127), 0, 255);
      data[idx + 2] = clamp(Math.round(255 - depth * 40), 0, 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  ringNormalCache.set(cacheKey, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// 内部描画ヘルパー
// ---------------------------------------------------------------------------

/**
 * 自然な揺らぎのある円を描画
 * 完全な真円ではなく、微細な凹凸で木材断面のリアリティを向上
 */
function drawWobblyCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  rng: () => number,
  size: number,
): void {
  // 揺らぎの振幅は半径に比例（外側ほど大きく）
  const wobbleAmp = Math.max(0.3, radius * 0.012);
  // 揺らぎの周波数（円周に沿った波の数）
  const wobbleFreq = 3 + Math.floor(rng() * 5);
  const phase = rng() * Math.PI * 2;
  const segments = Math.max(24, Math.floor(radius * 0.5));

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble = Math.sin(angle * wobbleFreq + phase) * wobbleAmp;
    // 第2高調波で不規則さを追加
    const wobble2 = Math.sin(angle * wobbleFreq * 2.3 + phase * 1.7) * wobbleAmp * 0.4;
    const r = radius + wobble + wobble2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    // キャンバス範囲外のチェックは不要（clipされる）
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();

  // 未使用パラメータ抑制
  void size;
}

/**
 * 髄線（放射組織）の描画 — オーク材の特徴的なパターン
 * 中心から放射状に広がる明るい筋
 */
function drawMedullaryRays(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxRadius: number,
  color: [number, number, number],
  rng: () => number,
  _size: number,
): void {
  // 主要髄線: 太く目立つもの（8～16本）
  const majorRayCount = 8 + Math.floor(rng() * 9);
  for (let i = 0; i < majorRayCount; i++) {
    const angle = (i / majorRayCount) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const rayLength = maxRadius * (0.4 + rng() * 0.5);
    const rayWidth = 1.5 + rng() * 2.5;
    const alpha = 0.15 + rng() * 0.2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.strokeStyle = rgb(color, alpha);
    ctx.lineWidth = rayWidth;
    // 中心付近から開始（髄のすぐ外側）
    const startR = 3 + rng() * 5;
    ctx.moveTo(startR, 0);
    // 微細な揺れを加えながら放射方向に描画
    const steps = Math.floor(rayLength / 4);
    for (let s = 1; s <= steps; s++) {
      const r = startR + (s / steps) * (rayLength - startR);
      const yOffset = (rng() - 0.5) * 1.5;
      ctx.lineTo(r, yOffset);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 副次髄線: 細く短いもの（20～40本）
  const minorRayCount = 20 + Math.floor(rng() * 21);
  for (let i = 0; i < minorRayCount; i++) {
    const angle = rng() * Math.PI * 2;
    const startDist = maxRadius * (0.1 + rng() * 0.5);
    const rayLength = maxRadius * (0.05 + rng() * 0.15);
    const alpha = 0.06 + rng() * 0.1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.strokeStyle = rgb(color, alpha);
    ctx.lineWidth = 0.5 + rng() * 1.0;
    ctx.moveTo(startDist, 0);
    ctx.lineTo(startDist + rayLength, (rng() - 0.5) * 1);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 樹脂線の描画 — マツ材の特徴
 * 年輪に対して横切る方向の暗い筋
 */
function drawResinLines(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxRadius: number,
  rng: () => number,
  _size: number,
): void {
  const lineCount = 4 + Math.floor(rng() * 6);

  for (let i = 0; i < lineCount; i++) {
    const angle = rng() * Math.PI * 2;
    const startDist = maxRadius * (0.15 + rng() * 0.4);
    const length = maxRadius * (0.08 + rng() * 0.2);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.beginPath();
    // 樹脂線は暗い琥珀色
    ctx.strokeStyle = `rgba(140,100,40,${0.2 + rng() * 0.15})`;
    ctx.lineWidth = 0.8 + rng() * 1.2;
    ctx.moveTo(startDist, 0);

    // 微細なカーブで自然さを出す
    const steps = Math.max(3, Math.floor(length / 3));
    for (let s = 1; s <= steps; s++) {
      const r = startDist + (s / steps) * length;
      const yOffset = (rng() - 0.5) * 2;
      ctx.lineTo(r, yOffset);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * 表面に微細なノイズを追加
 * 木材断面のザラザラした質感を表現
 */
function addSurfaceNoise(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
  baseColor: [number, number, number],
): void {
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  // ピクセル単位のノイズは重いため、間引きして適用
  const step = Math.max(1, Math.floor(size / 256));

  for (let py = 0; py < size; py += step) {
    for (let px = 0; px < size; px += step) {
      const noise = (rng() - 0.5) * 12; // ±6の微細ノイズ
      const idx = (py * size + px) * 4;
      data[idx] = clamp(data[idx] + noise, 0, 255);
      data[idx + 1] = clamp(data[idx + 1] + noise * 0.8, 0, 255);
      data[idx + 2] = clamp(data[idx + 2] + noise * 0.6, 0, 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // 未使用パラメータ抑制
  void baseColor;
}
