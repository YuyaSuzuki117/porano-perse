'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';

// ────────────────────────────────────────────────
// AR対応チェックフック
// ────────────────────────────────────────────────

/**
 * WebXR immersive-arセッションが利用可能かを非同期チェック
 * 非対応環境やSSR環境では false を返す
 */
export function useARAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        if (typeof navigator === 'undefined') return;
        if (!('xr' in navigator)) return;
        const xr = navigator.xr as XRSystem;
        const supported = await xr.isSessionSupported('immersive-ar');
        if (!cancelled) setAvailable(supported);
      } catch {
        // WebXR AR APIが利用不可
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}

// ────────────────────────────────────────────────
// ARセッション管理コンポーネント（R3Fシーン内に配置）
// ────────────────────────────────────────────────

interface ARModeProps {
  /** AR表示の有効フラグ */
  enabled: boolean;
}

/**
 * WebXR ARモードコンポーネント
 *
 * enabled=true で immersive-ar セッションを開始し、
 * カメラフィードの上に既存のシーンコンテンツをオーバーレイ描画する。
 * hit-test機能を使って現実世界の平面に部屋モデルを配置する。
 *
 * R3Fの<Canvas>内に配置すること。DOM要素は描画しない（nullを返す）。
 */
export const ARMode = function ARMode({ enabled }: ARModeProps) {
  const { gl, scene, camera } = useThree();
  const sessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const isAvailable = useARAvailable();

  /** ARセッション開始 */
  const startAR = useCallback(async () => {
    if (sessionRef.current) return;

    try {
      if (typeof navigator === 'undefined' || !('xr' in navigator)) {
        console.warn('[ARMode] navigator.xr が存在しません');
        return;
      }

      const xr = navigator.xr as XRSystem;
      const supported = await xr.isSessionSupported('immersive-ar');
      if (!supported) {
        console.warn('[ARMode] immersive-ar は非対応です');
        return;
      }

      // WebGLレンダラーのXR有効化
      gl.xr.enabled = true;

      // DOMオーバーレイ用のルート要素を取得（存在すれば使用）
      const overlayRoot = document.getElementById('ar-overlay');

      // immersive-arセッションをリクエスト
      const sessionInit: XRSessionInit = {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay'],
      };

      // DOMオーバーレイが利用可能な場合は設定
      if (overlayRoot && sessionInit.optionalFeatures) {
        (sessionInit as Record<string, unknown>).domOverlay = { root: overlayRoot };
      }

      const session = await xr.requestSession('immersive-ar', sessionInit);
      sessionRef.current = session;

      // セッション終了時のクリーンアップ
      session.addEventListener('end', () => {
        sessionRef.current = null;
        hitTestSourceRef.current = null;
        gl.xr.enabled = false;
      });

      // レンダラーにXRセッションを設定
      await gl.xr.setSession(session);

      // Hit-testソースを初期化（平面検出用）
      await initHitTestSource(session);

      console.info('[ARMode] ARセッション開始');
    } catch (err) {
      console.error('[ARMode] ARセッション開始エラー:', err);
    }
  }, [gl]);

  /** hit-testソースの初期化 */
  const initHitTestSource = useCallback(async (session: XRSession) => {
    try {
      const referenceSpace = await session.requestReferenceSpace('viewer');
      const hitTestSource = await session.requestHitTestSource!({
        space: referenceSpace,
      });
      if (!hitTestSource) return;
      hitTestSourceRef.current = hitTestSource;

      // セッションのフレームコールバックでhit-test結果を処理
      const onXRFrame = (_time: number, frame: XRFrame) => {
        if (!sessionRef.current || !hitTestSourceRef.current) return;

        const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current);

        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const localSpace = gl.xr.getReferenceSpace();
          if (localSpace) {
            const pose = hit.getPose(localSpace);
            if (pose) {
              // シーンのルート位置をhit-test結果に合わせる
              // （部屋モデルを現実世界の平面上に配置）
              const { position, orientation } = pose.transform;
              scene.position.set(position.x, position.y, position.z);
              scene.quaternion.set(
                orientation.x,
                orientation.y,
                orientation.z,
                orientation.w,
              );
            }
          }
        }

        session.requestAnimationFrame(onXRFrame);
      };

      session.requestAnimationFrame(onXRFrame);
    } catch (err) {
      console.warn('[ARMode] hit-testソース初期化エラー:', err);
    }
  }, [gl, scene]);

  /** ARセッション終了 */
  const endAR = useCallback(async () => {
    // hit-testソースをキャンセル
    if (hitTestSourceRef.current) {
      hitTestSourceRef.current.cancel();
      hitTestSourceRef.current = null;
    }

    if (sessionRef.current) {
      try {
        await sessionRef.current.end();
      } catch {
        // セッション終了エラーは無視
      }
      sessionRef.current = null;
    }

    // シーン位置をリセット
    scene.position.set(0, 0, 0);
    scene.quaternion.identity();
    gl.xr.enabled = false;
  }, [gl, scene]);

  // enabledプロパティに応じてARセッションを制御
  useEffect(() => {
    if (enabled && isAvailable) {
      startAR();
    } else if (!enabled) {
      endAR();
    }

    return () => {
      endAR();
    };
  }, [enabled, isAvailable, startAR, endAR]);

  // R3Fシーン内コンポーネント — DOM要素は描画しない
  // カメラの自動更新はWebXRが処理する
  void camera; // lintエラー回避
  return null;
};

// ────────────────────────────────────────────────
// ARボタン（HTMLオーバーレイUI — Canvas外に配置すること）
// ────────────────────────────────────────────────

interface ARButtonProps {
  /** AR開始/終了トグル */
  onToggle: (enterAR: boolean) => void;
  /** 現在ARセッション中か */
  isActive: boolean;
}

/**
 * AR表示切り替えボタン
 *
 * WebXR AR非対応環境では「AR未対応」ボタンを表示する。
 * R3Fの<Canvas>外に配置すること。
 */
export function ARButton({ onToggle, isActive }: ARButtonProps) {
  const isAvailable = useARAvailable();

  // AR未対応時のフォールバック
  if (!isAvailable) {
    return (
      <button
        disabled
        className="px-4 py-2 rounded-lg bg-gray-700 text-gray-400 text-sm cursor-not-allowed
                   flex items-center gap-2"
        title="このブラウザ/デバイスはWebXR ARに対応していません"
      >
        {/* ARアイコン（カメラ+キューブ） */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="5" width="22" height="14" rx="2" />
          <path d="M7 12l3-3 3 3" />
          <rect x="14" y="9" width="5" height="5" rx="0.5" strokeDasharray="2 1" />
        </svg>
        AR Not Available
      </button>
    );
  }

  return (
    <button
      onClick={() => onToggle(!isActive)}
      className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors
        ${
          isActive
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
    >
      {/* ARアイコン */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="5" width="22" height="14" rx="2" />
        <path d="M7 12l3-3 3 3" />
        <rect x="14" y="9" width="5" height="5" rx="0.5" strokeDasharray="2 1" />
      </svg>
      {isActive ? 'Exit AR' : 'AR View'}
    </button>
  );
}
