/**
 * ステレオスコピック3D画像エクスポート
 *
 * Three.jsシーンを左右の目用に微小オフセットしたカメラで2回レンダリングし、
 * アナグリフ・サイドバイサイド・クロスアイの3形式で立体視画像を生成する。
 */

import * as THREE from 'three';

/** 瞳孔間距離 (m) — 人間の平均値 */
const IPD = 0.065;

/** 出力画像の幅（片目あたり） */
const DEFAULT_EYE_WIDTH = 1024;

/** 出力画像の高さ */
const DEFAULT_EYE_HEIGHT = 768;

/** ステレオモード */
export type StereoMode = 'anaglyph' | 'side-by-side' | 'cross-eye';

/**
 * 指定カメラ位置からシーンをレンダリングし、ImageData として返す
 *
 * @param gl - WebGLRenderer
 * @param scene - レンダリング対象シーン
 * @param camera - カメラ
 * @param width - 出力幅
 * @param height - 出力高さ
 * @returns ImageData
 */
export function renderFromCamera(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): ImageData {
  // オフスクリーン用レンダーターゲット
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });

  // 現在のレンダーターゲットを保存
  const prevTarget = gl.getRenderTarget();
  const prevSize = new THREE.Vector2();
  gl.getSize(prevSize);

  // レンダリング
  gl.setRenderTarget(renderTarget);
  gl.setSize(width, height, false);
  gl.render(scene, camera);

  // ピクセルデータ読み出し
  const pixels = new Uint8Array(width * height * 4);
  gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

  // 元の状態に復元
  gl.setRenderTarget(prevTarget);
  gl.setSize(prevSize.x, prevSize.y, false);
  renderTarget.dispose();

  // WebGL座標は下から上なので上下反転する
  const flipped = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const srcOffset = row * width * 4;
    const dstOffset = (height - 1 - row) * width * 4;
    flipped.set(pixels.subarray(srcOffset, srcOffset + width * 4), dstOffset);
  }

  return new ImageData(flipped, width, height);
}

/**
 * ステレオ3D画像をレンダリングしてデータURLとして返す
 *
 * @param gl - WebGLRenderer
 * @param scene - Three.jsシーン
 * @param camera - PerspectiveCamera（中央視点）
 * @param mode - ステレオモード
 * @returns PNG形式のデータURL
 */
export async function renderStereo3D(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  mode: StereoMode,
): Promise<string> {
  const eyeWidth = DEFAULT_EYE_WIDTH;
  const eyeHeight = DEFAULT_EYE_HEIGHT;

  // 左目用カメラ
  const leftCamera = camera.clone() as THREE.PerspectiveCamera;
  leftCamera.aspect = eyeWidth / eyeHeight;
  leftCamera.updateProjectionMatrix();

  // 右目用カメラ
  const rightCamera = camera.clone() as THREE.PerspectiveCamera;
  rightCamera.aspect = eyeWidth / eyeHeight;
  rightCamera.updateProjectionMatrix();

  // カメラの右方向ベクトルを取得してIPD分オフセット
  const rightVector = new THREE.Vector3();
  camera.getWorldDirection(new THREE.Vector3());
  rightVector.setFromMatrixColumn(camera.matrixWorld, 0).normalize();

  const halfIPD = IPD / 2;
  leftCamera.position.copy(camera.position).addScaledVector(rightVector, -halfIPD);
  rightCamera.position.copy(camera.position).addScaledVector(rightVector, halfIPD);

  // 両カメラとも元カメラと同じ注視点を見る
  const target = new THREE.Vector3();
  camera.getWorldDirection(target);
  target.multiplyScalar(10).add(camera.position);
  leftCamera.lookAt(target);
  rightCamera.lookAt(target);
  leftCamera.updateMatrixWorld(true);
  rightCamera.updateMatrixWorld(true);

  // 左右の目の画像をレンダリング
  const leftImage = renderFromCamera(gl, scene, leftCamera, eyeWidth, eyeHeight);
  const rightImage = renderFromCamera(gl, scene, rightCamera, eyeWidth, eyeHeight);

  // モードに応じて合成
  switch (mode) {
    case 'anaglyph':
      return composeAnaglyph(leftImage, rightImage, eyeWidth, eyeHeight);
    case 'side-by-side':
      return composeSideBySide(leftImage, rightImage, eyeWidth, eyeHeight, false);
    case 'cross-eye':
      return composeSideBySide(leftImage, rightImage, eyeWidth, eyeHeight, true);
    default:
      throw new Error(`未対応のステレオモード: ${mode}`);
  }
}

/**
 * アナグリフ合成（赤/シアン）
 * 左目: 赤チャンネルのみ使用
 * 右目: 緑・青チャンネルのみ使用
 */
function composeAnaglyph(
  left: ImageData,
  right: ImageData,
  width: number,
  height: number,
): string {
  const canvas = createCompositeCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const output = ctx.createImageData(width, height);
  const out = output.data;
  const leftData = left.data;
  const rightData = right.data;

  for (let i = 0; i < leftData.length; i += 4) {
    // 左目のグレースケール値を赤チャンネルに
    const leftGray = leftData[i] * 0.299 + leftData[i + 1] * 0.587 + leftData[i + 2] * 0.114;
    // 右目のグレースケール値をシアンチャンネル（緑+青）に
    const rightGray = rightData[i] * 0.299 + rightData[i + 1] * 0.587 + rightData[i + 2] * 0.114;

    out[i] = Math.min(255, leftGray);      // R: 左目
    out[i + 1] = Math.min(255, rightGray); // G: 右目
    out[i + 2] = Math.min(255, rightGray); // B: 右目
    out[i + 3] = 255;                       // A: 不透明
  }

  ctx.putImageData(output, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * サイドバイサイド / クロスアイ合成
 *
 * @param reversed - true の場合、左右を反転（クロスアイ用）
 */
function composeSideBySide(
  left: ImageData,
  right: ImageData,
  eyeWidth: number,
  eyeHeight: number,
  reversed: boolean,
): string {
  const totalWidth = eyeWidth * 2;
  const canvas = createCompositeCanvas(totalWidth, eyeHeight);
  const ctx = canvas.getContext('2d')!;

  // 一時キャンバスに各目の画像を描画
  const leftCanvas = createCompositeCanvas(eyeWidth, eyeHeight);
  const leftCtx = leftCanvas.getContext('2d')!;
  leftCtx.putImageData(left, 0, 0);

  const rightCanvas = createCompositeCanvas(eyeWidth, eyeHeight);
  const rightCtx = rightCanvas.getContext('2d')!;
  rightCtx.putImageData(right, 0, 0);

  if (reversed) {
    // クロスアイ: 右目画像が左、左目画像が右
    ctx.drawImage(rightCanvas, 0, 0);
    ctx.drawImage(leftCanvas, eyeWidth, 0);
  } else {
    // 通常サイドバイサイド
    ctx.drawImage(leftCanvas, 0, 0);
    ctx.drawImage(rightCanvas, eyeWidth, 0);
  }

  return canvas.toDataURL('image/png');
}

/**
 * 合成用 Canvas を生成する
 * OffscreenCanvas が利用可能ならそちらを使う
 */
function createCompositeCanvas(
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
