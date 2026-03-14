'use client';

import { useState, useCallback, useRef, useMemo } from 'react';

type TextureTarget = 'wall' | 'floor';

interface TextureState {
  dataUrl: string | null;
  tilesPerMeter: number;
  scale: number;
}

const INITIAL_TEXTURE_STATE: TextureState = {
  dataUrl: null,
  tilesPerMeter: 2,
  scale: 1.0,
};

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface CustomTextureStore {
  wallTexture: TextureState;
  floorTexture: TextureState;
  setWallTexture: (texture: TextureState) => void;
  setFloorTexture: (texture: TextureState) => void;
}

// コンポーネント外のシングルトンストア（軽量状態管理）
let wallTextureState: TextureState = { ...INITIAL_TEXTURE_STATE };
let floorTextureState: TextureState = { ...INITIAL_TEXTURE_STATE };
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/**
 * カスタムテクスチャのフックAPI
 * wallTexture / floorTexture の読み取りとセッター
 */
export function useCustomTexture(): CustomTextureStore {
  const [, setTick] = useState(0);

  // subscribe on mount
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  useMemo(() => {
    listeners.add(rerender);
    return () => listeners.delete(rerender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rerender]);

  const setWallTexture = useCallback((texture: TextureState) => {
    wallTextureState = texture;
    notify();
  }, []);

  const setFloorTexture = useCallback((texture: TextureState) => {
    floorTextureState = texture;
    notify();
  }, []);

  return {
    wallTexture: wallTextureState,
    floorTexture: floorTextureState,
    setWallTexture,
    setFloorTexture,
  };
}

export function TextureUploadPanel() {
  const [target, setTarget] = useState<TextureTarget>('wall');
  const [preview, setPreview] = useState<string | null>(null);
  const [tilesPerMeter, setTilesPerMeter] = useState(2);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setWallTexture, setFloorTexture, wallTexture, floorTexture } = useCustomTexture();

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('JPG、PNG、WebP形式のみ対応');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('ファイルサイズは4MB以下にしてください');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleApply = useCallback(() => {
    if (!preview) return;
    const textureState: TextureState = {
      dataUrl: preview,
      tilesPerMeter,
      scale,
    };
    if (target === 'wall') {
      setWallTexture(textureState);
    } else {
      setFloorTexture(textureState);
    }
  }, [preview, tilesPerMeter, scale, target, setWallTexture, setFloorTexture]);

  const handleReset = useCallback(() => {
    setPreview(null);
    setScale(1.0);
    setTilesPerMeter(2);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (target === 'wall') {
      setWallTexture({ ...INITIAL_TEXTURE_STATE });
    } else {
      setFloorTexture({ ...INITIAL_TEXTURE_STATE });
    }
  }, [target, setWallTexture, setFloorTexture]);

  const currentTexture = target === 'wall' ? wallTexture : floorTexture;
  const hasApplied = currentTexture.dataUrl !== null;

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-3 space-y-3">
      {/* ヘッダー */}
      <h3 className="text-sm font-medium text-white">テクスチャアップロード</h3>

      {/* ターゲット選択 */}
      <div className="flex gap-1">
        <button
          onClick={() => setTarget('wall')}
          className={`flex-1 text-xs py-1.5 rounded transition-colors ${
            target === 'wall'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          壁
        </button>
        <button
          onClick={() => setTarget('floor')}
          className={`flex-1 text-xs py-1.5 rounded transition-colors ${
            target === 'floor'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          床
        </button>
      </div>

      {/* ファイル入力 */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleFileSelect}
          className="hidden"
          id="texture-upload"
        />
        <label
          htmlFor="texture-upload"
          className="block w-full text-center text-xs py-2 border border-dashed border-gray-600 rounded cursor-pointer
            text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors"
        >
          画像をアップロード (.jpg / .png / .webp, 4MB以下)
        </label>
      </div>

      {/* エラー */}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* プレビュー */}
      {preview && (
        <div className="space-y-2">
          <div className="relative w-full h-24 bg-gray-800 rounded overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="テクスチャプレビュー"
              className="w-full h-full object-cover"
              style={{ transform: `scale(${scale})` }}
            />
          </div>

          {/* スケール */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400">スケール</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={3.0}
                step={0.1}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-xs text-gray-300 w-10 text-right font-mono">
                {scale.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* リピート */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400">リピート (タイル/m)</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={tilesPerMeter}
                onChange={(e) => setTilesPerMeter(parseInt(e.target.value, 10))}
                className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-xs text-gray-300 w-10 text-right font-mono">
                {tilesPerMeter}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 適用状態インジケータ */}
      {hasApplied && (
        <p className="text-[10px] text-green-400">
          {target === 'wall' ? '壁' : '床'}テクスチャ適用中
        </p>
      )}

      {/* ボタン */}
      <div className="flex gap-2">
        <button
          onClick={handleApply}
          disabled={!preview}
          className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${
            preview
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
        >
          適用
        </button>
        <button
          onClick={handleReset}
          className="flex-1 text-xs py-1.5 rounded font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
        >
          リセット
        </button>
      </div>
    </div>
  );
}
