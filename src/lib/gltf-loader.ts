/**
 * glTF/GLBモデルローダーユーティリティ
 *
 * @react-three/drei の useGLTF を活用した3Dモデル読み込み。
 * モデルが無い場合はプリミティブジオメトリにフォールバックする設計。
 */

import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';

/** useGLTF の戻り値型（drei内部型を再定義） */
interface GLTFResult {
  scene: THREE.Group;
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, THREE.Material>;
}

/**
 * glTFモデルのプリロード
 * アプリ起動時やカタログ表示時に呼び出し、ロード待ちを削減する
 */
export function preloadGLTFModel(url: string): void {
  useGLTF.preload(url);
}

/**
 * 複数モデルの一括プリロード
 */
export function preloadGLTFModels(urls: string[]): void {
  urls.forEach((url) => useGLTF.preload(url));
}

/**
 * glTFモデルをロードし、指定サイズにスケール調整したクローンを返すフック
 *
 * @param url - glTF/GLBファイルのURL
 * @param targetDimensions - 目標サイズ [幅, 高さ, 奥行] (メートル)
 * @returns スケール調整済みのシーンクローン
 */
export function useScaledGLTF(
  url: string,
  targetDimensions: [number, number, number],
): THREE.Group {
  const gltf = useGLTF(url) as unknown as GLTFResult;

  const scaledScene = useMemo(() => {
    // シーンのクローンを作成（同一モデルの複数配置に対応）
    const clone = gltf.scene.clone(true);

    // バウンディングボックスでモデルの実サイズを計測
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    // 各軸のスケール比率を計算し、最小比率で均一スケーリング
    // （アスペクト比を維持しつつ、指定ボックスに収める）
    const scaleX = size.x > 0 ? targetDimensions[0] / size.x : 1;
    const scaleY = size.y > 0 ? targetDimensions[1] / size.y : 1;
    const scaleZ = size.z > 0 ? targetDimensions[2] / size.z : 1;
    const uniformScale = Math.min(scaleX, scaleY, scaleZ);

    clone.scale.setScalar(uniformScale);

    // モデルの底面を原点(y=0)に合わせる
    const scaledBox = new THREE.Box3().setFromObject(clone);
    clone.position.y = -scaledBox.min.y;

    // 中心をXZ平面の原点に合わせる
    const center = new THREE.Vector3();
    scaledBox.getCenter(center);
    clone.position.x = -center.x;
    clone.position.z = -center.z;

    return clone;
  }, [gltf.scene, targetDimensions]);

  // クリーンアップ: アンマウント時にクローンを破棄
  useEffect(() => {
    return () => {
      scaledScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    };
  }, [scaledScene]);

  return scaledScene;
}

/**
 * モデルのマテリアルカラーをオーバーライドする
 *
 * @param object - Three.jsオブジェクト（Group/Mesh）
 * @param color - 適用する色（hex文字列）
 */
export function overrideModelColor(object: THREE.Object3D, color: string): void {
  const threeColor = new THREE.Color(color);
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => {
          if ('color' in mat) {
            (mat as THREE.MeshStandardMaterial).color.copy(threeColor);
          }
        });
      } else if ('color' in child.material) {
        (child.material as THREE.MeshStandardMaterial).color.copy(threeColor);
      }
    }
  });
}

/**
 * モデルに選択ハイライト（emissive）を適用する
 *
 * @param object - Three.jsオブジェクト
 * @param highlight - ハイライトON/OFF
 * @param emissiveColor - エミッシブ色（デフォルト: 青）
 * @param intensity - 発光強度
 */
export function applyModelHighlight(
  object: THREE.Object3D,
  highlight: boolean,
  emissiveColor = '#3B82F6',
  intensity = 0.3,
): void {
  const color = highlight ? new THREE.Color(emissiveColor) : new THREE.Color(0x000000);
  const emissiveIntensity = highlight ? intensity : 0;

  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const applyToMat = (mat: THREE.Material) => {
        if ('emissive' in mat) {
          const stdMat = mat as THREE.MeshStandardMaterial;
          stdMat.emissive.copy(color);
          stdMat.emissiveIntensity = emissiveIntensity;
        }
      };
      if (Array.isArray(child.material)) {
        child.material.forEach(applyToMat);
      } else {
        applyToMat(child.material);
      }
    }
  });
}

/**
 * モデルのシャドウ設定を有効化する
 */
export function enableModelShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}
