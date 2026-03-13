'use client';

import { SceneState, StylePreset, FurnitureItem } from '@/types/scene';
import { STYLE_PRESETS } from '@/data/styles';
import { FURNITURE_CATALOG } from '@/data/furniture';

interface ControlPanelProps {
  scene: SceneState;
  selectedFurniture: string | null;
  onUpdateRoom: (updates: Partial<SceneState['room']>) => void;
  onUpdateStyle: (style: StylePreset) => void;
  onAddFurniture: (type: string) => void;
  onDeleteFurniture: (id: string) => void;
  onRotateFurniture: (id: string, angle: number) => void;
  onScreenshot: () => void;
}

export function ControlPanel({
  scene,
  selectedFurniture,
  onUpdateRoom,
  onUpdateStyle,
  onAddFurniture,
  onDeleteFurniture,
  onRotateFurniture,
  onScreenshot,
}: ControlPanelProps) {
  const selectedItem = scene.furniture.find((f) => f.id === selectedFurniture);

  return (
    <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-bold text-gray-800">設計パネル</h2>
      </div>

      {/* Room Dimensions */}
      <Section title="部屋のサイズ">
        <div className="grid grid-cols-3 gap-2">
          <DimensionInput
            label="幅(m)"
            value={scene.room.width}
            onChange={(v) => onUpdateRoom({ width: v })}
          />
          <DimensionInput
            label="奥行(m)"
            value={scene.room.depth}
            onChange={(v) => onUpdateRoom({ depth: v })}
          />
          <DimensionInput
            label="高さ(m)"
            value={scene.room.height}
            onChange={(v) => onUpdateRoom({ height: v })}
          />
        </div>
      </Section>

      {/* Style Selection */}
      <Section title="スタイル">
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(STYLE_PRESETS) as [StylePreset, typeof STYLE_PRESETS[StylePreset]][]).map(
            ([key, config]) => (
              <button
                key={key}
                onClick={() => onUpdateStyle(key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  scene.style === key
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div
                  className="w-full h-2 rounded mb-1"
                  style={{
                    background: `linear-gradient(90deg, ${config.wallColor}, ${config.floorColor}, ${config.accentColor})`,
                  }}
                />
                {config.nameJa}
              </button>
            )
          )}
        </div>
      </Section>

      {/* Furniture Catalog */}
      <Section title="什器・家具">
        <div className="grid grid-cols-2 gap-2">
          {FURNITURE_CATALOG.map((item) => (
            <button
              key={item.type}
              onClick={() => onAddFurniture(item.type)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-blue-50 hover:border-blue-300 border border-gray-200 transition-all text-left"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs text-gray-700">{item.name}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Selected Furniture Controls */}
      {selectedItem && (
        <Section title={`選択中: ${FURNITURE_CATALOG.find((c) => c.type === selectedItem.type)?.name || selectedItem.type}`}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => onRotateFurniture(selectedItem.id, -Math.PI / 4)}
                className="flex-1 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
              >
                ↺ 45°回転
              </button>
              <button
                onClick={() => onRotateFurniture(selectedItem.id, Math.PI / 4)}
                className="flex-1 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
              >
                ↻ 45°回転
              </button>
            </div>
            <button
              onClick={() => onDeleteFurniture(selectedItem.id)}
              className="w-full px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm font-medium"
            >
              削除
            </button>
          </div>
        </Section>
      )}

      {/* Actions */}
      <div className="mt-auto p-4 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onScreenshot}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
        >
          スクリーンショット保存
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 border-b border-gray-100">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (v > 0 && v <= 50) onChange(v);
        }}
        min={1}
        max={50}
        step={0.5}
        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
