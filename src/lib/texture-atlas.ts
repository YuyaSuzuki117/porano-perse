/**
 * texture-atlas — 家具テクスチャのアトラスパッキング
 *
 * 複数の小さなテクスチャを1枚の大きなテクスチャに統合し、
 * マテリアル切り替えによるドローコール増加を防ぐ。
 * シェルフパッキングアルゴリズム（行単位）を使用。
 */

import * as THREE from 'three';

// ─── UV座標の型 ─────────────────────────────────────
interface AtlasRegion {
  /** アトラス内のU座標（0〜1の正規化座標） */
  u: number;
  /** アトラス内のV座標（0〜1の正規化座標） */
  v: number;
  /** 領域の幅（0〜1の正規化座標） */
  w: number;
  /** 領域の高さ（0〜1の正規化座標） */
  h: number;
}

// ─── シェルフ（棚）構造 ─────────────────────────────────
interface Shelf {
  /** この棚のY開始位置（ピクセル） */
  y: number;
  /** この棚の高さ（ピクセル） */
  height: number;
  /** 次に配置可能なX位置（ピクセル） */
  currentX: number;
}

/**
 * テクスチャアトラスクラス
 *
 * 複数のCanvasテクスチャを1枚のアトラステクスチャに統合する。
 * シェルフパッキングアルゴリズムにより効率的に配置。
 */
export class TextureAtlas {
  /** アトラスのピクセルサイズ（正方形） */
  private readonly size: number;

  /** 内部キャンバス */
  private readonly canvas: HTMLCanvasElement;

  /** 2Dコンテキスト */
  private readonly ctx: CanvasRenderingContext2D;

  /** 棚リスト（行単位の配置管理） */
  private shelves: Shelf[] = [];

  /** テクスチャキー → UV座標のマップ */
  private regions: Map<string, AtlasRegion> = new Map();

  /** Three.jsテクスチャ（キャッシュ） */
  private texture: THREE.CanvasTexture | null = null;

  /** テクスチャが更新されたか（再生成フラグ） */
  private dirty = true;

  constructor(size: number = 2048) {
    this.size = size;

    // オフスクリーンキャンバスを生成
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2Dコンテキストの取得に失敗');
    }
    this.ctx = ctx;

    // 背景を透明で初期化
    this.ctx.clearRect(0, 0, size, size);
  }

  /**
   * テクスチャをアトラスに追加する。
   *
   * @param key テクスチャの一意キー
   * @param canvas 描画済みのCanvasElement
   * @returns UV座標情報。領域が足りない場合はnull。
   */
  addTexture(
    key: string,
    canvas: HTMLCanvasElement,
  ): AtlasRegion | null {
    // 既に追加済みの場合は既存領域を返す
    const existing = this.regions.get(key);
    if (existing) return existing;

    const texW = canvas.width;
    const texH = canvas.height;

    // アトラスサイズを超えるテクスチャは追加不可
    if (texW > this.size || texH > this.size) {
      console.warn(`テクスチャ "${key}" がアトラスサイズ(${this.size})を超過`);
      return null;
    }

    // 既存の棚で収まるか探索
    const region = this.findShelfSpace(texW, texH);
    if (!region) {
      console.warn(`アトラスの空き容量不足: "${key}" (${texW}x${texH})`);
      return null;
    }

    // キャンバスに描画
    const pixelX = region.u * this.size;
    const pixelY = region.v * this.size;
    this.ctx.drawImage(canvas, pixelX, pixelY, texW, texH);

    // 登録
    this.regions.set(key, region);
    this.dirty = true;

    return region;
  }

  /**
   * シェルフパッキングで配置可能な領域を探す。
   * 既存の棚に収まらなければ新しい棚を作成する。
   */
  private findShelfSpace(texW: number, texH: number): AtlasRegion | null {
    // 既存の棚を順に確認
    for (const shelf of this.shelves) {
      if (shelf.currentX + texW <= this.size && texH <= shelf.height) {
        // この棚に収まる
        const region: AtlasRegion = {
          u: shelf.currentX / this.size,
          v: shelf.y / this.size,
          w: texW / this.size,
          h: texH / this.size,
        };
        shelf.currentX += texW;
        return region;
      }
    }

    // 新しい棚を作成
    const nextY = this.shelves.length === 0
      ? 0
      : this.shelves[this.shelves.length - 1].y + this.shelves[this.shelves.length - 1].height;

    if (nextY + texH > this.size) {
      // 高さ方向に余裕なし
      return null;
    }

    const newShelf: Shelf = {
      y: nextY,
      height: texH,
      currentX: texW,
    };
    this.shelves.push(newShelf);

    return {
      u: 0,
      v: nextY / this.size,
      w: texW / this.size,
      h: texH / this.size,
    };
  }

  /**
   * 指定キーのUV座標を取得する。
   *
   * @param key テクスチャキー
   * @returns UV座標情報。未登録の場合はnull。
   */
  getUVs(key: string): AtlasRegion | null {
    return this.regions.get(key) ?? null;
  }

  /**
   * 統合済みアトラステクスチャを取得する。
   * テクスチャが更新されている場合は再生成される。
   */
  getAtlasTexture(): THREE.CanvasTexture {
    if (!this.texture || this.dirty) {
      if (this.texture) {
        this.texture.dispose();
      }
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.flipY = false;
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
    return this.texture;
  }

  /** 登録済みテクスチャ数 */
  get count(): number {
    return this.regions.size;
  }

  /** アトラスリソースを解放する */
  dispose(): void {
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    this.regions.clear();
    this.shelves = [];
  }
}

/**
 * 家具タイプ名からアトラスを生成するファクトリ関数。
 *
 * 各タイプに対してプロシージャルテクスチャ（64x64の単色Canvas）を生成し、
 * アトラスにパッキングする。
 *
 * @param furnitureTypes 家具タイプ名の配列
 * @returns 生成済みのTextureAtlas
 */
export function createFurnitureAtlas(furnitureTypes: string[]): TextureAtlas {
  const atlas = new TextureAtlas(2048);

  // タイプごとにプロシージャルテクスチャを生成
  const TEXTURE_SIZE = 64;
  const TYPE_COLORS: Record<string, string> = {
    chair: '#654321',
    stool: '#8B7355',
    table_square: '#A0522D',
    table_round: '#A0522D',
    counter: '#8B6914',
    shelf: '#DEB887',
    desk: '#CD853F',
    sofa: '#708090',
    pendant_light: '#FFD700',
    plant: '#228B22',
    partition: '#C0C0C0',
  };

  for (const type of furnitureTypes) {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // 単色塗りつぶし + 微妙なノイズでリアリティ追加
    const baseColor = TYPE_COLORS[type] ?? '#888888';
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    // 簡易ノイズ（格子状の明暗パターン）
    for (let y = 0; y < TEXTURE_SIZE; y += 4) {
      for (let x = 0; x < TEXTURE_SIZE; x += 4) {
        const brightness = ((x + y) % 8 === 0) ? 20 : -10;
        ctx.fillStyle = `rgba(${brightness > 0 ? 255 : 0}, ${brightness > 0 ? 255 : 0}, ${brightness > 0 ? 255 : 0}, 0.05)`;
        ctx.fillRect(x, y, 4, 4);
      }
    }

    atlas.addTexture(type, canvas);
  }

  return atlas;
}
