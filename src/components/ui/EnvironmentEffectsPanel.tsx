'use client';

import React from 'react';
import { useCameraStore } from '@/stores/useCameraStore';

/**
 * 環境エフェクトパネル (Round 9)
 *
 * プロシージャル空・エリアライト・ガラス結露・コースティクス・
 * 日照シミュレーション・音響・窓枠表示などの環境設定UIを提供する。
 */
export function EnvironmentEffectsPanel() {
  // --- ストアから環境エフェクト状態を取得 ---
  const showProceduralSky = useCameraStore((s) => s.showProceduralSky);
  const skyTimeOfDay = useCameraStore((s) => s.skyTimeOfDay);
  const showAreaLights = useCameraStore((s) => s.showAreaLights);
  const glassCondensation = useCameraStore((s) => s.glassCondensation);
  const showCaustics = useCameraStore((s) => s.showCaustics);
  const causticsIntensity = useCameraStore((s) => s.causticsIntensity);
  const showSunSimulation = useCameraStore((s) => s.showSunSimulation);
  const showAcoustics = useCameraStore((s) => s.showAcoustics);
  const showWindowDoorFrames = useCameraStore((s) => s.showWindowDoorFrames);

  // --- ストアからセッター/トグルを取得 ---
  const toggleProceduralSky = useCameraStore((s) => s.toggleProceduralSky);
  const setSkyTimeOfDay = useCameraStore((s) => s.setSkyTimeOfDay);
  const toggleAreaLights = useCameraStore((s) => s.toggleAreaLights);
  const setGlassCondensation = useCameraStore((s) => s.setGlassCondensation);
  const toggleCaustics = useCameraStore((s) => s.toggleCaustics);
  const setCausticsIntensity = useCameraStore((s) => s.setCausticsIntensity);
  const toggleSunSimulation = useCameraStore((s) => s.toggleSunSimulation);
  const toggleAcoustics = useCameraStore((s) => s.toggleAcoustics);
  const toggleWindowDoorFrames = useCameraStore((s) => s.toggleWindowDoorFrames);

  /** 結露モードの選択肢 */
  const condensationOptions: { value: 'off' | 'warm' | 'cold' | 'frost'; label: string }[] = [
    { value: 'off', label: 'オフ' },
    { value: 'warm', label: '温暖' },
    { value: 'cold', label: '寒冷' },
    { value: 'frost', label: '霜' },
  ];

  /** 時刻を HH:MM 形式に変換する */
  const formatTime = (hour: number): string => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-700 mb-2">
        環境エフェクト
      </h3>

      {/* プロシージャル空 */}
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-600">プロシージャル空</label>
          <button
            type="button"
            onClick={toggleProceduralSky}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              showProceduralSky ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                showProceduralSky ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {/* 時刻スライダー（プロシージャル空が有効時のみ表示） */}
        {showProceduralSky && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>時刻</span>
              <span>{formatTime(skyTimeOfDay)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={skyTimeOfDay}
              onChange={(e) => setSkyTimeOfDay(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full accent-blue-500"
            />
          </div>
        )}
      </div>

      {/* エリアライト */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2">
        <label className="text-xs text-gray-600">エリアライト</label>
        <button
          type="button"
          onClick={toggleAreaLights}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            showAreaLights ? 'bg-blue-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              showAreaLights ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* ガラス結露 */}
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <label className="block text-xs text-gray-600 mb-1">ガラス結露</label>
        <div className="grid grid-cols-4 gap-1">
          {condensationOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGlassCondensation(opt.value)}
              className={`rounded px-1.5 py-1 text-xs transition-colors ${
                glassCondensation === opt.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* コースティクス */}
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-600">コースティクス</label>
          <button
            type="button"
            onClick={toggleCaustics}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              showCaustics ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                showCaustics ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        {/* 強度スライダー（コースティクス有効時のみ） */}
        {showCaustics && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>強度</span>
              <span>{Math.round(causticsIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={causticsIntensity}
              onChange={(e) => setCausticsIntensity(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full accent-blue-500"
            />
          </div>
        )}
      </div>

      {/* 日照シミュレーション */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2">
        <label className="text-xs text-gray-600">日照シミュレーション</label>
        <button
          type="button"
          onClick={toggleSunSimulation}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            showSunSimulation ? 'bg-blue-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              showSunSimulation ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* 音響ビジュアライゼーション */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2">
        <label className="text-xs text-gray-600">音響可視化</label>
        <button
          type="button"
          onClick={toggleAcoustics}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            showAcoustics ? 'bg-blue-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              showAcoustics ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* 窓・ドア枠表示 */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-2">
        <label className="text-xs text-gray-600">窓・ドア枠</label>
        <button
          type="button"
          onClick={toggleWindowDoorFrames}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            showWindowDoorFrames ? 'bg-blue-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              showWindowDoorFrames ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
