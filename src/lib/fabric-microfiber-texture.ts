/**
 * 布地マイクロファイバーノーマルマップ生成
 * 織り方パターン（平織り・綾織り・朱子織り・ニット）をプロシージャル生成
 * Canvas APIによるタンジェントスペースノーマルマップ出力
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** サポートする織り方タイプ */
export type WeaveType = 'plain' | 'twill' | 'satin' | 'knit';

// ---------------------------------------------------------------------------
// キャッシュ
// ---------------------------------------------------------------------------

const normalCache = new Map<string, HTMLCanvasElement>();
const roughnessCache = new Map<string, HTMLCanvasElement>();

/** キャッシュキー生成 */
function cacheKey(prefix: string, size: number, weaveType: string, density: number): string {
  return `${prefix}-${size}-${weaveType}-${density}`;
}

// ---------------------------------------------------------------------------
// ノーマルマップ用ユーティリティ
// ---------------------------------------------------------------------------

/** 0-255にクランプ */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * 高さフィールドからノーマルマップのImageDataを生成
 * ソーベルフィルタによる法線ベクトル算出
 */
function heightFieldToNormalMap(
  heightField: Float32Array,
  size: number,
  strength: number,
): ImageData {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // トーラスラップで隣接取得
      const xp = (x + 1) % size;
      const xm = (x - 1 + size) % size;
      const yp = (y + 1) % size;
      const ym = (y - 1 + size) % size;

      const dxVal = heightField[y * size + xp] - heightField[y * size + xm];
      const dyVal = heightField[yp * size + x] - heightField[ym * size + x];

      // タンジェントスペース法線
      const nx = -dxVal * strength;
      const ny = -dyVal * strength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      const idx = (y * size + x) * 4;
      data[idx] = clamp255((nx / len * 0.5 + 0.5) * 255);     // R: X方向
      data[idx + 1] = clamp255((ny / len * 0.5 + 0.5) * 255); // G: Y方向
      data[idx + 2] = clamp255((nz / len * 0.5 + 0.5) * 255); // B: Z方向（深度）
      data[idx + 3] = 255;
    }
  }

  return imageData;
}

// ---------------------------------------------------------------------------
// 織り方パターン別の高さフィールド生成
// ---------------------------------------------------------------------------

/**
 * 平織り（plain weave）: 縦糸と横糸が1本ずつ交互に交差
 * 最も基本的な織りパターン、均一なグリッド状の凹凸
 */
function generatePlainWeave(size: number, density: number): Float32Array {
  const field = new Float32Array(size * size);
  // 糸の太さ（ピクセル単位）
  const threadWidth = Math.max(2, Math.round(size / density));
  const halfThread = threadWidth / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 糸のインデックス
      const tx = Math.floor(x / threadWidth);
      const ty = Math.floor(y / threadWidth);
      // 糸内のローカル座標（-0.5〜0.5に正規化）
      const lx = (x % threadWidth) / threadWidth - 0.5;
      const ly = (y % threadWidth) / threadWidth - 0.5;

      // 交差判定: 偶数交差点は縦糸が上、奇数は横糸が上
      const isWarpOnTop = (tx + ty) % 2 === 0;

      // 糸の丸み（断面が楕円形）
      const warpBump = Math.cos(ly * Math.PI) * 0.5 + 0.5;
      const weftBump = Math.cos(lx * Math.PI) * 0.5 + 0.5;

      // 距離に基づく高さ
      const distFromCenter = Math.sqrt(lx * lx + ly * ly) * 2;
      const threadShape = Math.max(0, 1 - distFromCenter);

      if (isWarpOnTop) {
        field[y * size + x] = warpBump * 0.7 + threadShape * 0.3;
      } else {
        field[y * size + x] = weftBump * 0.7 + threadShape * 0.3;
      }
    }
  }

  return field;
}

/**
 * 綾織り（twill weave）: デニムのような斜めの畝パターン
 * 2/1綾織り — 縦糸が2本に対し横糸が1本の交差
 */
function generateTwillWeave(size: number, density: number): Float32Array {
  const field = new Float32Array(size * size);
  const threadWidth = Math.max(2, Math.round(size / density));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tx = Math.floor(x / threadWidth);
      const ty = Math.floor(y / threadWidth);
      const lx = (x % threadWidth) / threadWidth - 0.5;
      const ly = (y % threadWidth) / threadWidth - 0.5;

      // 綾織りパターン: 斜め方向にシフト（2/1パターン）
      const twillPhase = (tx + ty) % 3;
      const isWarpOnTop = twillPhase < 2; // 2本上、1本下

      // 斜めの畝（ridge）を表現する追加バンプ
      const diagonalPhase = ((x + y) / threadWidth) % 1;
      const ridgeBump = Math.cos(diagonalPhase * Math.PI * 2) * 0.15;

      const threadBump = Math.cos(
        (isWarpOnTop ? ly : lx) * Math.PI,
      ) * 0.5 + 0.5;

      const distFromCenter = Math.sqrt(lx * lx + ly * ly) * 2;
      const threadShape = Math.max(0, 1 - distFromCenter);

      field[y * size + x] = threadBump * 0.55 + threadShape * 0.3 + ridgeBump;
    }
  }

  return field;
}

/**
 * 朱子織り（satin weave）: 滑らかで光沢のある表面
 * 交差点が分散配置され、長い浮き糸が光を均一に反射
 */
function generateSatinWeave(size: number, density: number): Float32Array {
  const field = new Float32Array(size * size);
  const threadWidth = Math.max(2, Math.round(size / density));
  // 朱子織りのリピート単位（5本サテン）
  const satinRepeat = 5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tx = Math.floor(x / threadWidth);
      const ty = Math.floor(y / threadWidth);
      const ly = (y % threadWidth) / threadWidth - 0.5;

      // 朱子織りの交差パターン: 交差点は (tx % 5, ty % 5) で
      // 特定のオフセット位置のみ交差（2シフト）
      const satinTx = tx % satinRepeat;
      const satinTy = ty % satinRepeat;
      const intersectionPoint = (satinTx * 2) % satinRepeat;
      const isIntersection = satinTy === intersectionPoint;

      // 浮き糸区間は滑らかで高い、交差点のみ凹む
      const baseHeight = 0.7;
      const intersectionDip = isIntersection ? -0.25 : 0;

      // 微細な糸の断面凹凸（朱子織りは控えめ）
      const subtleBump = Math.cos(ly * Math.PI) * 0.1;

      // 光沢方向を強調する微小な方向性バイアス
      const dirBias = Math.sin((x / size) * Math.PI * density * 0.3) * 0.05;

      field[y * size + x] = baseHeight + intersectionDip + subtleBump + dirBias;
    }
  }

  return field;
}

/**
 * ニット（knit）: 編み物のV字ループパターン
 * メリヤス編みの表目を模倣
 */
function generateKnitWeave(size: number, density: number): Float32Array {
  const field = new Float32Array(size * size);
  // ニットのステッチサイズ
  const stitchW = Math.max(4, Math.round(size / density));
  const stitchH = Math.round(stitchW * 1.4); // ステッチは縦長

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // ステッチのインデックスとローカル座標
      const sx = Math.floor(x / stitchW);
      const sy = Math.floor(y / stitchH);
      const lx = (x % stitchW) / stitchW; // 0-1
      const ly = (y % stitchH) / stitchH; // 0-1

      // 偶数行はハーフステッチオフセット（千鳥配置）
      const offsetX = sy % 2 === 0 ? 0 : 0.5;
      const adjLx = ((lx + offsetX) % 1);

      // V字ループ形状の生成
      // 上半分: V字の左右の脚、下半分: ループの底
      let loopHeight: number;

      if (ly < 0.5) {
        // V字の上部 — 2本の斜めの脚
        const leftLeg = Math.exp(-Math.pow((adjLx - 0.3 + ly * 0.4) * 5, 2));
        const rightLeg = Math.exp(-Math.pow((adjLx - 0.7 - ly * 0.4 + 1) * 5, 2));
        loopHeight = Math.max(leftLeg, rightLeg);
      } else {
        // ループの底部 — U字カーブ
        const centerDist = Math.abs(adjLx - 0.5);
        const bottomCurve = Math.cos(centerDist * Math.PI) * Math.cos((ly - 0.75) * Math.PI * 2);
        loopHeight = Math.max(0, bottomCurve * 0.8);
      }

      // 糸の断面（円形）による微細な丸み
      const threadRadius = 0.3;
      const nearestThreadDist = Math.min(
        Math.abs(adjLx - 0.3),
        Math.abs(adjLx - 0.7),
        Math.abs(adjLx - 0.5),
      );
      const threadSection = Math.max(0, 1 - nearestThreadDist / threadRadius);
      const roundness = Math.sqrt(threadSection) * 0.2;

      field[y * size + x] = loopHeight * 0.7 + roundness + 0.1;
    }
  }

  return field;
}

// ---------------------------------------------------------------------------
// エクスポート関数
// ---------------------------------------------------------------------------

/**
 * 指定した織り方のノーマルマップを生成
 *
 * @param size - キャンバスサイズ（px、正方形）
 * @param weaveType - 織り方タイプ（'plain'|'twill'|'satin'|'knit'）
 * @param density - 糸密度（1m2あたりの糸数概念、20-80推奨）
 * @returns タンジェントスペースのノーマルマップ
 */
export function generateFabricNormalMap(
  size: number,
  weaveType: WeaveType,
  density: number,
): HTMLCanvasElement {
  const key = cacheKey('fabric-nmap', size, weaveType, density);
  const cached = normalCache.get(key);
  if (cached) return cached;

  // 織り方に応じた高さフィールド生成
  let heightField: Float32Array;
  switch (weaveType) {
    case 'twill':
      heightField = generateTwillWeave(size, density);
      break;
    case 'satin':
      heightField = generateSatinWeave(size, density);
      break;
    case 'knit':
      heightField = generateKnitWeave(size, density);
      break;
    case 'plain':
    default:
      heightField = generatePlainWeave(size, density);
      break;
  }

  // 高さフィールドからノーマルマップに変換
  const normalStrength = weaveType === 'satin' ? 1.5 : 3.0;
  const normalData = heightFieldToNormalMap(heightField, size, normalStrength);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.putImageData(normalData, 0, 0);
  normalCache.set(key, canvas);
  return canvas;
}

/**
 * 指定した織り方のラフネスマップを生成
 *
 * 織り目の凹凸が大きい部分ほどラフネスが高い（散乱光が多い）
 * 朱子織りは全体的にラフネスが低い（光沢感）
 *
 * @param size - キャンバスサイズ（px、正方形）
 * @param weaveType - 織り方タイプ文字列
 * @returns ラフネスマップ（白=ラフ、黒=スムース）
 */
export function generateFabricRoughnessMap(
  size: number,
  weaveType: string,
): HTMLCanvasElement {
  const key = cacheKey('fabric-rough', size, weaveType, 0);
  const cached = roughnessCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  // ベースラフネス（織り方による基準値）
  const baseRoughness: Record<string, number> = {
    plain: 0.75,
    twill: 0.65,
    satin: 0.35, // 朱子織りは光沢が高い
    knit: 0.80,
  };
  const base = baseRoughness[weaveType] ?? 0.7;

  // 微細なラフネスバリエーション（疑似乱数で糸ごとの粗さの違い）
  const variation = weaveType === 'satin' ? 0.08 : 0.15;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 決定論的な疑似ランダムノイズ（シード付きsin）
      const seed = x * 12.9898 + y * 78.233;
      const noise = Math.sin(seed) * 43758.5453;
      const rand = (noise - Math.floor(noise)) * 2 - 1; // -1〜1

      const roughness = Math.max(0, Math.min(1, base + rand * variation));
      const val = Math.round(roughness * 255);

      const idx = (y * size + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  roughnessCache.set(key, canvas);
  return canvas;
}
