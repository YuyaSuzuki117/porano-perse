'use client';

import React from 'react';
import {
  RENDER_QUALITY_PRESETS,
  RenderQualityPreset,
} from '@/lib/render-quality-presets';
import {
  TONE_MAPPING_PRESETS,
  ToneMappingPreset,
} from '@/lib/tone-mapping-presets';

interface RenderQualityPanelProps {
  currentQuality: RenderQualityPreset;
  currentToneMapping: ToneMappingPreset;
  onQualityChange: (preset: RenderQualityPreset) => void;
  onToneMappingChange: (preset: ToneMappingPreset) => void;
}

const PRESET_KEYS: RenderQualityPreset[] = ['draft', 'standard', 'cinema', 'ultra'];

export function RenderQualityPanel({
  currentQuality,
  currentToneMapping,
  onQualityChange,
  onToneMappingChange,
}: RenderQualityPanelProps) {
  const toneMappingKeys = Object.keys(TONE_MAPPING_PRESETS) as ToneMappingPreset[];

  return (
    <div className="space-y-4">
      {/* Quality Presets */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">
          レンダリング品質
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PRESET_KEYS.map((key) => {
            const preset = RENDER_QUALITY_PRESETS[key];
            const isActive = currentQuality === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onQualityChange(key)}
                className={`
                  rounded-lg px-3 py-2 text-left transition-all
                  ${
                    isActive
                      ? 'border-2 border-blue-500 bg-blue-50 shadow-sm'
                      : 'border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <span
                  className={`block text-xs font-semibold ${
                    isActive ? 'text-blue-700' : 'text-gray-700'
                  }`}
                >
                  {preset.nameJa}
                </span>
                <span className="block text-[10px] text-gray-500 mt-0.5 leading-tight">
                  {preset.description.split(' — ')[1]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tone Mapping */}
      <div>
        <label
          htmlFor="tone-mapping-select"
          className="block text-xs font-medium text-gray-700 mb-1"
        >
          トーンマッピング
        </label>
        <select
          id="tone-mapping-select"
          value={currentToneMapping}
          onChange={(e) => onToneMappingChange(e.target.value as ToneMappingPreset)}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {toneMappingKeys.map((key) => {
            const tm = TONE_MAPPING_PRESETS[key];
            return (
              <option key={key} value={key}>
                {tm.description}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
