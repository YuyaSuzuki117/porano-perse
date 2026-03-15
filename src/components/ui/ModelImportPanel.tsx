'use client';

import React, { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// ---------- 定数 ----------
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const GLB_MAGIC = 0x46546C67; // "glTF" in little-endian

// ---------- カスタムモデル永続化 ----------
export interface CustomModelEntry {
  id: string;
  name: string;
  category: string;
  scale: [number, number, number];
  /** base64 encoded GLB data */
  data: string;
  createdAt: number;
}

const STORAGE_KEY = 'porano_perse_custom_models';

export function loadCustomModels(): CustomModelEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomModelEntry[];
  } catch {
    return [];
  }
}

export function saveCustomModel(entry: CustomModelEntry): void {
  const models = loadCustomModels();
  models.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

export function deleteCustomModel(id: string): void {
  const models = loadCustomModels().filter((m) => m.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
}

/** Base64 → Blob URL 変換 */
export function base64ToBlobUrl(base64: string): string {
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'model/gltf-binary' });
  return URL.createObjectURL(blob);
}

// ---------- バリデーション ----------
function validateGLBFile(file: File): Promise<{ valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (file.size > MAX_FILE_SIZE) {
      resolve({ valid: false, error: `ファイルサイズが上限(10MB)を超えています: ${(file.size / 1024 / 1024).toFixed(1)}MB` });
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf') {
      resolve({ valid: false, error: '対応形式: .glb / .gltf ファイルのみ' });
      return;
    }

    // GLBファイルのマジックナンバー検証
    if (ext === 'glb') {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        if (buffer.byteLength < 12) {
          resolve({ valid: false, error: 'GLBファイルが破損しています（ヘッダー不足）' });
          return;
        }
        const view = new DataView(buffer);
        const magic = view.getUint32(0, true);
        if (magic !== GLB_MAGIC) {
          resolve({ valid: false, error: 'GLBマジックナンバーが不正です。有効なGLBファイルではありません。' });
          return;
        }
        const version = view.getUint32(4, true);
        if (version !== 2) {
          resolve({ valid: false, error: `glTFバージョン ${version} は未対応です。バージョン2のみ対応。` });
          return;
        }
        resolve({ valid: true });
      };
      reader.onerror = () => resolve({ valid: false, error: 'ファイル読み込みに失敗しました' });
      reader.readAsArrayBuffer(file.slice(0, 12));
    } else {
      // .gltf は JSON テキスト — 拡張子チェックのみ
      resolve({ valid: true });
    }
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      resolve(btoa(binary));
    };
    reader.onerror = () => reject(new Error('ファイル読み込みに失敗'));
    reader.readAsArrayBuffer(file);
  });
}

// ---------- プレビュー3Dコンポーネント ----------
interface ModelPreviewSceneProps {
  url: string;
}

function ModelPreviewScene({ url }: ModelPreviewSceneProps) {
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };

  const cloned = React.useMemo(() => {
    const clone = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      clone.scale.setScalar(2 / maxDim);
    }
    // 中心に配置
    const scaledBox = new THREE.Box3().setFromObject(clone);
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);
    clone.position.sub(center);
    // シャドウ
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [gltf.scene]);

  return <primitive object={cloned} />;
}

function ModelPreview({ url }: { url: string }) {
  return (
    <div className="w-full h-40 bg-gray-900 rounded-lg overflow-hidden border border-gray-600">
      <Canvas camera={{ position: [3, 2, 3], fov: 45 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          <ModelPreviewScene url={url} />
        </Suspense>
        <OrbitControls enableZoom enablePan={false} autoRotate autoRotateSpeed={4} />
      </Canvas>
    </div>
  );
}

// ---------- カテゴリ選択肢 ----------
const CUSTOM_CATEGORIES = [
  { value: 'furniture', label: '家具' },
  { value: 'equipment', label: '設備' },
  { value: 'decoration', label: '装飾' },
  { value: 'fixture', label: '什器' },
  { value: 'other', label: 'その他' },
];

// ---------- メインパネル ----------
export interface ModelImportResult {
  name: string;
  category: string;
  scale: [number, number, number];
  blobUrl: string;
  customModelId: string;
}

interface ModelImportPanelProps {
  onImport: (result: ModelImportResult) => void;
  onClose: () => void;
}

export default function ModelImportPanel({ onImport, onClose }: ModelImportPanelProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('furniture');
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);
  const [scaleZ, setScaleZ] = useState(1);
  const [uniformScale, setUniformScale] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const processFile = useCallback(async (f: File) => {
    setError(null);
    setLoading(true);

    const validation = await validateGLBFile(f);
    if (!validation.valid) {
      setError(validation.error || '不正なファイル');
      setLoading(false);
      return;
    }

    // 前回のプレビューURLを解放
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const url = URL.createObjectURL(f);
    setFile(f);
    setPreviewUrl(url);
    setName(f.name.replace(/\.(glb|gltf)$/i, ''));
    setLoading(false);
  }, [previewUrl]);

  // ドラッグ&ドロップ
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  }, [processFile]);

  const handleScaleChange = useCallback((axis: 'x' | 'y' | 'z', value: number) => {
    if (uniformScale) {
      setScaleX(value);
      setScaleY(value);
      setScaleZ(value);
    } else {
      if (axis === 'x') setScaleX(value);
      if (axis === 'y') setScaleY(value);
      if (axis === 'z') setScaleZ(value);
    }
  }, [uniformScale]);

  const handleImport = useCallback(async () => {
    if (!file || !previewUrl) return;
    setLoading(true);

    try {
      // localStorage に保存
      const base64 = await fileToBase64(file);
      const id = `custom_${Date.now()}`;
      const entry: CustomModelEntry = {
        id,
        name,
        category,
        scale: [scaleX, scaleY, scaleZ],
        data: base64,
        createdAt: Date.now(),
      };

      try {
        saveCustomModel(entry);
      } catch (storageError) {
        // localStorage容量超過の場合、保存なしで続行
        console.warn('localStorageへの保存に失敗（容量超過の可能性）:', storageError);
      }

      onImport({
        name,
        category,
        scale: [scaleX, scaleY, scaleZ],
        blobUrl: previewUrl,
        customModelId: id,
      });
    } catch {
      setError('インポートに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [file, previewUrl, name, category, scaleX, scaleY, scaleZ, onImport]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <span className="text-lg">📦</span>
            3Dモデルインポート
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ドロップゾーン */}
          {!file && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-400 bg-blue-50 scale-[1.02]'
                  : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <div className="text-3xl mb-2">{isDragging ? '📥' : '📁'}</div>
              <p className="text-xs text-gray-600 font-medium">
                {isDragging ? 'ここにドロップ' : 'クリックまたはドラッグ&ドロップ'}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                .glb / .gltf | 最大10MB
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* エラー表示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* ファイル選択後 */}
          {file && previewUrl && (
            <>
              {/* プレビュー */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">プレビュー</label>
                  <button
                    onClick={() => {
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setFile(null);
                      setPreviewUrl(null);
                      setError(null);
                    }}
                    className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                  >
                    ファイルを変更
                  </button>
                </div>
                <ModelPreview url={previewUrl} />
                <div className="mt-1 text-[10px] text-gray-400 flex justify-between">
                  <span>{file.name}</span>
                  <span>{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              </div>

              {/* モデル名 */}
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">モデル名</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: カスタムテーブル"
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-xs focus:border-blue-400 focus:outline-none"
                />
              </div>

              {/* カテゴリ */}
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">カテゴリ</label>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOM_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                        category === cat.value
                          ? 'bg-blue-50 text-blue-600 border border-blue-300'
                          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* スケール */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">スケール</label>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={uniformScale}
                      onChange={(e) => setUniformScale(e.target.checked)}
                      className="w-3 h-3"
                    />
                    均一
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['x', 'y', 'z'] as const).map((axis) => {
                    const value = axis === 'x' ? scaleX : axis === 'y' ? scaleY : scaleZ;
                    return (
                      <div key={axis}>
                        <label className="block text-[9px] text-gray-400 mb-0.5 text-center uppercase">{axis}</label>
                        <input
                          type="number"
                          value={value}
                          onChange={(e) => handleScaleChange(axis, parseFloat(e.target.value) || 0.1)}
                          min={0.01}
                          max={50}
                          step={0.1}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-center focus:border-blue-400 focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* インポートボタン */}
              <button
                onClick={handleImport}
                disabled={loading || !name.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    処理中...
                  </>
                ) : (
                  <>
                    <span>✅</span>
                    カタログに追加
                  </>
                )}
              </button>
            </>
          )}

          {/* ローディング */}
          {loading && !file && (
            <div className="text-center py-4">
              <span className="animate-spin inline-block text-xl">⏳</span>
              <p className="text-xs text-gray-500 mt-1">検証中...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
