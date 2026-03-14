'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface PanoramaExporterProps {
  /** trueになった瞬間にパノラマ書き出しを実行 */
  trigger: boolean;
  /** 書き出し完了コールバック */
  onComplete: () => void;
}

/**
 * R3Fシーン内で使用するパノラマ書き出しコンポーネント。
 * 4方向(正面/右/背面/左) + 上 + 下 の6視点をレンダリングし、
 * パノラマストリップ画像（3:1横長）として出力する。
 *
 * Canvas内部で useThree() を利用するため、<Canvas> 内に配置する必要がある。
 */
const PanoramaExporter = React.memo(function PanoramaExporter({
  trigger,
  onComplete,
}: PanoramaExporterProps) {
  const { gl, scene } = useThree();
  const prevTriggerRef = useRef(false);

  /** シーンの中心位置を壁から計算 */
  const computeSceneCenter = useCallback((): THREE.Vector3 => {
    const box = new THREE.Box3();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const geo = obj.geometry;
        if (geo) {
          geo.computeBoundingBox();
          if (geo.boundingBox) {
            const cloned = geo.boundingBox.clone();
            cloned.applyMatrix4(obj.matrixWorld);
            box.union(cloned);
          }
        }
      }
    });
    const center = new THREE.Vector3();
    box.getCenter(center);
    // カメラを部屋の中心、やや上寄りに配置
    center.y = Math.max(center.y, 1.5);
    return center;
  }, [scene]);

  /** 単一方向をオフスクリーンでレンダリング */
  const renderView = useCallback(
    (
      camera: THREE.PerspectiveCamera,
      target: THREE.WebGLRenderTarget,
      lookDir: THREE.Vector3,
      up: THREE.Vector3
    ): HTMLCanvasElement => {
      const center = camera.position.clone();
      camera.up.copy(up);
      camera.lookAt(center.clone().add(lookDir));
      camera.updateMatrixWorld(true);

      gl.setRenderTarget(target);
      gl.render(scene, camera);
      gl.setRenderTarget(null);

      // ピクセル読み出し
      const w = target.width;
      const h = target.height;
      const pixels = new Uint8Array(w * h * 4);
      gl.readRenderTargetPixels(target, 0, 0, w, h, pixels);

      // WebGLは上下反転しているので修正
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const imageData = ctx.createImageData(w, h);

      for (let row = 0; row < h; row++) {
        const srcRow = h - 1 - row;
        const srcOffset = srcRow * w * 4;
        const dstOffset = row * w * 4;
        for (let col = 0; col < w; col++) {
          imageData.data[dstOffset + col * 4] = pixels[srcOffset + col * 4];
          imageData.data[dstOffset + col * 4 + 1] = pixels[srcOffset + col * 4 + 1];
          imageData.data[dstOffset + col * 4 + 2] = pixels[srcOffset + col * 4 + 2];
          imageData.data[dstOffset + col * 4 + 3] = pixels[srcOffset + col * 4 + 3];
        }
      }

      ctx.putImageData(imageData, 0, 0);
      return canvas;
    },
    [gl, scene]
  );

  /** パノラマ書き出し本体 */
  const exportPanorama = useCallback(() => {
    const resolution = 1024;
    const center = computeSceneCenter();

    // 一時カメラ（FOV 90度で各方向をカバー）
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    camera.position.copy(center);

    // レンダーターゲット
    const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    // 6方向: Front, Right, Back, Left, Up, Down
    const directions: Array<{ dir: THREE.Vector3; up: THREE.Vector3; label: string }> = [
      { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), label: 'Front' },
      { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: 'Right' },
      { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), label: 'Back' },
      { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: 'Left' },
      { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1), label: 'Up' },
      { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, -1), label: 'Down' },
    ];

    const viewCanvases: HTMLCanvasElement[] = [];
    for (const d of directions) {
      const viewCanvas = renderView(camera, renderTarget, d.dir, d.up);
      viewCanvases.push(viewCanvas);
    }

    // 6面をクロスレイアウトに合成 (4x3 グリッド)
    //        [Up]
    // [Left][Front][Right][Back]
    //        [Down]
    const crossW = resolution * 4;
    const crossH = resolution * 3;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = crossW;
    outputCanvas.height = crossH;
    const ctx = outputCanvas.getContext('2d')!;

    // 背景を黒で塗る
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, crossW, crossH);

    // クロス配置
    // [Front=0] center-middle
    ctx.drawImage(viewCanvases[0], resolution * 1, resolution * 1);
    // [Right=1] right-middle
    ctx.drawImage(viewCanvases[1], resolution * 2, resolution * 1);
    // [Back=2] far-right-middle
    ctx.drawImage(viewCanvases[2], resolution * 3, resolution * 1);
    // [Left=3] left-middle
    ctx.drawImage(viewCanvases[3], resolution * 0, resolution * 1);
    // [Up=4] center-top
    ctx.drawImage(viewCanvases[4], resolution * 1, resolution * 0);
    // [Down=5] center-bottom
    ctx.drawImage(viewCanvases[5], resolution * 1, resolution * 2);

    // ラベル描画
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `${Math.round(resolution * 0.03)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelPositions = [
      { x: resolution * 1.5, y: resolution * 1 + 4, label: 'Front' },
      { x: resolution * 2.5, y: resolution * 1 + 4, label: 'Right' },
      { x: resolution * 3.5, y: resolution * 1 + 4, label: 'Back' },
      { x: resolution * 0.5, y: resolution * 1 + 4, label: 'Left' },
      { x: resolution * 1.5, y: resolution * 0 + 4, label: 'Up' },
      { x: resolution * 1.5, y: resolution * 2 + 4, label: 'Down' },
    ];
    for (const lp of labelPositions) {
      ctx.fillText(lp.label, lp.x, lp.y);
    }

    // PNG としてダウンロード
    const dataUrl = outputCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `porano-perse-panorama-${ts}.png`;
    link.href = dataUrl;
    link.click();

    // クリーンアップ
    renderTarget.dispose();

    onComplete();
  }, [computeSceneCenter, renderView, onComplete]);

  // trigger が false→true に変わった時のみ実行
  useEffect(() => {
    if (trigger && !prevTriggerRef.current) {
      exportPanorama();
    }
    prevTriggerRef.current = trigger;
  }, [trigger, exportPanorama]);

  return null;
});

export default PanoramaExporter;
