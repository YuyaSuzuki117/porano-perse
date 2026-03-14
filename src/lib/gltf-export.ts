/**
 * glTF / GLB エクスポート — 3DシーンをglTF/GLBファイルとしてダウンロード
 *
 * Three.js の GLTFExporter を使用してシーン全体をエクスポートする。
 * ジオメトリ、マテリアル、ライト、位置情報を含む。
 */

import * as THREE from 'three';

/**
 * シーンをGLBファイル（バイナリglTF）としてエクスポート・ダウンロード
 * @param scene - エクスポート対象のThree.jsシーン
 * @param filename - ダウンロードファイル名（拡張子なしでも可、自動で.glbを付与）
 */
export async function exportSceneAsGLB(
  scene: THREE.Scene,
  filename: string = 'scene'
): Promise<void> {
  try {
    const { GLTFExporter } = await import(
      'three/examples/jsm/exporters/GLTFExporter.js'
    );

    const exporter = new GLTFExporter();

    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        scene,
        (gltf) => {
          resolve(gltf as ArrayBuffer);
        },
        (error) => {
          reject(error);
        },
        { binary: true }
      );
    });

    // Blobを生成してダウンロード
    const blob = new Blob([result], { type: 'application/octet-stream' });
    downloadBlob(blob, ensureExtension(filename, '.glb'));
  } catch (error) {
    console.error('[gltf-export] GLBエクスポートに失敗しました:', error);
    throw new Error(
      `GLBエクスポートに失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * シーンをglTFファイル（JSON形式）としてエクスポート・ダウンロード
 * @param scene - エクスポート対象のThree.jsシーン
 * @param filename - ダウンロードファイル名（拡張子なしでも可、自動で.gltfを付与）
 */
export async function exportSceneAsGLTF(
  scene: THREE.Scene,
  filename: string = 'scene'
): Promise<void> {
  try {
    const { GLTFExporter } = await import(
      'three/examples/jsm/exporters/GLTFExporter.js'
    );

    const exporter = new GLTFExporter();

    const result = await new Promise<object>((resolve, reject) => {
      exporter.parse(
        scene,
        (gltf) => {
          resolve(gltf as object);
        },
        (error) => {
          reject(error);
        },
        { binary: false }
      );
    });

    // JSON文字列化してBlobでダウンロード
    const jsonStr = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    downloadBlob(blob, ensureExtension(filename, '.gltf'));
  } catch (error) {
    console.error('[gltf-export] glTFエクスポートに失敗しました:', error);
    throw new Error(
      `glTFエクスポートに失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// --- 内部ユーティリティ ---

/** Blobをファイルとしてダウンロード */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();

  // クリーンアップ
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  }, 100);
}

/** ファイル名に拡張子がなければ付与 */
function ensureExtension(filename: string, ext: string): string {
  if (filename.toLowerCase().endsWith(ext)) return filename;
  return filename + ext;
}
