/**
 * Perlinノイズテクスチャ生成 — 漆喰・コンクリート風の壁面テクスチャ
 * 古典的Perlinノイズ（勾配ノイズ）の2D実装
 * Canvas APIによるプロシージャル生成（外部画像不使用）
 */

// ---------------------------------------------------------------------------
// キャッシュ
// ---------------------------------------------------------------------------

const textureCache = new Map<string, HTMLCanvasElement>();
const normalMapCache = new Map<string, HTMLCanvasElement>();

/** キャッシュキー生成 */
function cacheKey(...args: (string | number)[]): string {
  return args.join('-');
}

// ---------------------------------------------------------------------------
// 順列テーブル（古典的Perlinノイズ用）
// ---------------------------------------------------------------------------

/** Ken Perlinオリジナルの順列テーブル（0-255を2回繰り返し） */
const PERM: number[] = (() => {
  const p = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
    140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
    247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
    57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
    74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
    60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
    65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
    200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
    52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
    207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
    119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
    129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
    218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
    81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
    184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
    222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
  ];
  // 512要素に拡張（ラップアラウンド用）
  const perm = new Array<number>(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
  }
  return perm;
})();

// ---------------------------------------------------------------------------
// 2D Perlinノイズ計算
// ---------------------------------------------------------------------------

/** 勾配ベクトルテーブル（8方向） */
const GRAD_X = [1, -1, 1, -1, 1, -1, 0, 0];
const GRAD_Y = [0, 0, 1, 1, -1, -1, 1, -1];

/** 勾配のドット積 */
function grad2d(hash: number, x: number, y: number): number {
  const h = hash & 7;
  return GRAD_X[h] * x + GRAD_Y[h] * y;
}

/** フェード関数（5次補間 6t^5 - 15t^4 + 10t^3） */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** 線形補間 */
function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

/**
 * 2D Perlinノイズ値を返す
 * @returns -1.0 〜 1.0 の範囲
 */
export function perlin2d(x: number, y: number): number {
  // 格子セルの整数座標
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;

  // セル内の小数座標
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  // フェード補間係数
  const u = fade(xf);
  const v = fade(yf);

  // 4頂点のハッシュ値
  const aa = PERM[PERM[xi] + yi];
  const ab = PERM[PERM[xi] + yi + 1];
  const ba = PERM[PERM[xi + 1] + yi];
  const bb = PERM[PERM[xi + 1] + yi + 1];

  // 各頂点の勾配ドット積を補間
  const x1 = lerp(grad2d(aa, xf, yf), grad2d(ba, xf - 1, yf), u);
  const x2 = lerp(grad2d(ab, xf, yf - 1), grad2d(bb, xf - 1, yf - 1), u);

  return lerp(x1, x2, v);
}

/**
 * フラクタルブラウン運動（fBm）— 複数オクターブのPerlinノイズ合成
 * @returns -1.0 〜 1.0 の範囲（概算）
 */
export function fbm(x: number, y: number, octaves: number, persistence: number): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += perlin2d(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return total / maxValue;
}

// ---------------------------------------------------------------------------
// カラーユーティリティ
// ---------------------------------------------------------------------------

/** HEXカラーをRGBタプルに変換 */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** 0-255にクランプ */
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ---------------------------------------------------------------------------
// エクスポート関数
// ---------------------------------------------------------------------------

/**
 * Perlinノイズベースの漆喰/コンクリート風テクスチャを生成
 *
 * @param size - キャンバスサイズ（px、正方形）
 * @param scale - ノイズのスケール（大きいほど細かい模様）
 * @param octaves - オクターブ数（ディテールレベル、1-8推奨）
 * @param persistence - 各オクターブの振幅減衰率（0.3-0.7推奨）
 * @param baseColor - ベースカラー（HEX文字列、例: '#E8E0D4'）
 * @returns テクスチャが描画されたHTMLCanvasElement
 */
export function generatePerlinTexture(
  size: number,
  scale: number,
  octaves: number,
  persistence: number,
  baseColor: string,
): HTMLCanvasElement {
  const key = cacheKey('perlin-tex', size, scale, octaves, persistence, baseColor);
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const [br, bg, bb] = parseHex(baseColor);
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  // ノイズ変調の強度（ベースカラーからの明暗変化幅）
  const variationRange = 30;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Perlinノイズ値 (-1 ~ 1)
      const nx = x / size * scale;
      const ny = y / size * scale;
      const noiseVal = fbm(nx, ny, octaves, persistence);

      // 微細なザラつき（高周波ノイズ追加）
      const fineNoise = perlin2d(nx * 8, ny * 8) * 0.15;
      const combined = noiseVal * 0.85 + fineNoise;

      // ベースカラーへのノイズ変調
      const offset = combined * variationRange;
      const idx = (y * size + x) * 4;
      data[idx] = clamp255(br + offset);
      data[idx + 1] = clamp255(bg + offset * 0.95); // 緑チャンネルは若干抑制（暖色寄り）
      data[idx + 2] = clamp255(bb + offset * 0.9);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  textureCache.set(key, canvas);
  return canvas;
}

/**
 * Perlinノイズの高さフィールドからノーマルマップを生成
 *
 * ソーベルフィルタ方式: 隣接ピクセルのノイズ値差分から法線ベクトルを算出
 *
 * @param size - キャンバスサイズ（px、正方形）
 * @param scale - ノイズのスケール
 * @param strength - 法線の強度（0.1-2.0推奨、大きいほど凹凸が強調）
 * @returns ノーマルマップが描画されたHTMLCanvasElement
 */
export function generatePerlinNormalMap(
  size: number,
  scale: number,
  strength: number,
): HTMLCanvasElement {
  const key = cacheKey('perlin-nmap', size, scale, strength);
  const cached = normalMapCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // まず高さフィールドを計算（後でソーベルフィルタに使用）
  const heightField = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size * scale;
      const ny = y / size * scale;
      // 3オクターブのfBmで中程度のディテール
      heightField[y * size + x] = fbm(nx, ny, 3, 0.5);
    }
  }

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  // ソーベルフィルタで法線ベクトルを算出
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 隣接ピクセル（トーラス境界でラップ）
      const xp = (x + 1) % size;
      const xm = (x - 1 + size) % size;
      const yp = (y + 1) % size;
      const ym = (y - 1 + size) % size;

      // X方向の傾斜
      const dxVal = heightField[y * size + xp] - heightField[y * size + xm];
      // Y方向の傾斜
      const dyVal = heightField[yp * size + x] - heightField[ym * size + x];

      // 法線ベクトル構築（tangent space）
      // N = normalize(-dh/dx * strength, -dh/dy * strength, 1)
      const nx = -dxVal * strength;
      const ny = -dyVal * strength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      // [-1,1] → [0,255] にマッピング
      const idx = (y * size + x) * 4;
      data[idx] = clamp255((nx / len * 0.5 + 0.5) * 255);
      data[idx + 1] = clamp255((ny / len * 0.5 + 0.5) * 255);
      data[idx + 2] = clamp255((nz / len * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  normalMapCache.set(key, canvas);
  return canvas;
}
