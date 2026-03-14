'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';

// ────────────────────────────────────────────────
// WebXR対応チェック
// ────────────────────────────────────────────────

/**
 * WebXR VRモードが利用可能かをチェックするカスタムフック
 *
 * navigator.xr.isSessionSupported を使ってブラウザ＋デバイスの
 * immersive-vr対応状態を返す。
 */
export function useWebXRAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        if (typeof navigator === 'undefined') return;
        if (!('xr' in navigator)) return;
        const xr = navigator.xr as XRSystem;
        const supported = await xr.isSessionSupported('immersive-vr');
        if (!cancelled) setAvailable(supported);
      } catch {
        // WebXR APIが存在しないかエラー → 非対応
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
// VRセッション管理
// ────────────────────────────────────────────────

interface WebXRModeProps {
  /** VRモード有効フラグ */
  enabled: boolean;
}

/**
 * WebXR VRモードコンポーネント
 *
 * enabled=true でimmersive-vrセッションを開始する。
 * @react-three/xr がインストールされていないため、
 * 生のWebXR APIを使用してR3FのレンダラーにXRセッションを接続する。
 *
 * VR非対応環境では「VR未対応」メッセージを表示する。
 */
export const WebXRMode = function WebXRMode({ enabled }: WebXRModeProps) {
  const { gl } = useThree();
  const sessionRef = useRef<XRSession | null>(null);
  const isAvailable = useWebXRAvailable();

  /** VRセッション開始 */
  const startVR = useCallback(async () => {
    if (sessionRef.current) return; // 既にセッション中

    try {
      if (!('xr' in navigator)) {
        console.warn('[WebXRMode] navigator.xr が存在しません');
        return;
      }

      const xr = navigator.xr as XRSystem;
      const supported = await xr.isSessionSupported('immersive-vr');
      if (!supported) {
        console.warn('[WebXRMode] immersive-vr は非対応です');
        return;
      }

      // WebGLレンダラーのXRを有効化
      gl.xr.enabled = true;

      // immersive-vrセッションをリクエスト
      const session = await xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });

      sessionRef.current = session;

      // セッション終了時のクリーンアップ
      session.addEventListener('end', () => {
        sessionRef.current = null;
        gl.xr.enabled = false;
      });

      // レンダラーにXRセッションを設定
      await gl.xr.setSession(session);

      console.info('[WebXRMode] VRセッション開始');
    } catch (err) {
      console.error('[WebXRMode] VRセッション開始エラー:', err);
    }
  }, [gl]);

  /** VRセッション終了 */
  const endVR = useCallback(async () => {
    if (sessionRef.current) {
      try {
        await sessionRef.current.end();
      } catch {
        // セッション終了エラーは無視
      }
      sessionRef.current = null;
    }
    gl.xr.enabled = false;
  }, [gl]);

  // enabledプロパティに応じてVRセッションを制御
  useEffect(() => {
    if (enabled) {
      startVR();
    } else {
      endVR();
    }

    // アンマウント時にセッションを終了
    return () => {
      endVR();
    };
  }, [enabled, startVR, endVR]);

  // このコンポーネントはR3Fシーン内に配置されるため、
  // 直接DOMは描画しない（nullを返す）
  return null;
};

// ────────────────────────────────────────────────
// VRボタン（HTMLオーバーレイUI）
// ────────────────────────────────────────────────

interface VRButtonProps {
  /** VR開始/終了トグルコールバック */
  onToggle: (enterVR: boolean) => void;
  /** 現在VRセッション中かどうか */
  isActive: boolean;
}

/**
 * VRモード切り替えボタン
 *
 * HTMLオーバーレイとして表示する。R3Fの<Canvas>外に配置すること。
 * WebXR非対応環境では「VR未対応」を表示する。
 */
export function VRButton({ onToggle, isActive }: VRButtonProps) {
  const isAvailable = useWebXRAvailable();

  if (!isAvailable) {
    return (
      <button
        disabled
        className="px-4 py-2 rounded-lg bg-gray-700 text-gray-400 text-sm cursor-not-allowed
                   flex items-center gap-2"
        title="このブラウザ/デバイスはWebXR VRに対応していません"
      >
        {/* VRアイコン */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="6" width="20" height="12" rx="3" />
          <circle cx="8" cy="12" r="2" />
          <circle cx="16" cy="12" r="2" />
          <path d="M10 14h4" />
        </svg>
        VR未対応
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
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
    >
      {/* VRアイコン */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="6" width="20" height="12" rx="3" />
        <circle cx="8" cy="12" r="2" />
        <circle cx="16" cy="12" r="2" />
        <path d="M10 14h4" />
      </svg>
      {isActive ? 'VR終了' : 'VRモード'}
    </button>
  );
}

// ────────────────────────────────────────────────
// テレポーテーション（簡易レイキャスト）
// ────────────────────────────────────────────────

/**
 * VRコントローラからの簡易テレポーテーション計算
 *
 * レイの原点と方向から、Y=0平面との交点を求める。
 * 実際のVRコントローラ入力はWebXR APIのXRInputSourceで取得する想定。
 */
export function calculateTeleportTarget(
  rayOrigin: [number, number, number],
  rayDirection: [number, number, number],
): [number, number, number] | null {
  // Y=0平面との交差判定
  // rayOrigin + t * rayDirection の y成分 = 0 を解く
  const oy = rayOrigin[1];
  const dy = rayDirection[1];

  // レイが下を向いていない場合は交差なし
  if (dy >= 0) return null;

  const t = -oy / dy;
  if (t < 0 || t > 50) return null; // 遠すぎる場合は無視

  return [
    rayOrigin[0] + t * rayDirection[0],
    0,
    rayOrigin[2] + t * rayDirection[2],
  ];
}
