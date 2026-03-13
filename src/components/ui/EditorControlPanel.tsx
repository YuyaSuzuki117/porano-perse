'use client';

import { useEditorStore } from '@/stores/useEditorStore';
import { STYLE_PRESETS } from '@/data/styles';
import { FURNITURE_CATALOG } from '@/data/furniture';
import { StylePreset } from '@/types/scene';
import { wallLength } from '@/lib/geometry';

export function EditorControlPanel() {
  const {
    walls,
    furniture,
    roomHeight,
    style,
    selectedWallId,
    selectedFurnitureId,
    viewMode,
    setStyle,
    setRoomHeight,
    addFurniture,
    deleteFurniture,
    updateFurniture,
    setSelectedFurniture,
    setViewMode,
    deleteWall,
    initRectRoom,
  } = useEditorStore();

  const selectedWall = walls.find((w) => w.id === selectedWallId);
  const selectedFurnitureItem = furniture.find((f) => f.id === selectedFurnitureId);

  const handleAddFurniture = (type: string) => {
    const catalog = FURNITURE_CATALOG.find((c) => c.type === type);
    if (!catalog) return;
    addFurniture({
      id: `${type}_${Date.now()}`,
      type: catalog.type,
      name: catalog.name,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [...catalog.defaultScale],
      color: catalog.defaultColor,
    });
  };

  return (
    <div className="w-72 bg-white border-l border-gray-200 overflow-y-auto flex flex-col text-sm">
      {/* View Mode */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex gap-1">
          {(['2d', 'split', '3d'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {mode === '2d' ? '図面' : mode === '3d' ? '3D' : '分割'}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Room Setup */}
      <Section title="部屋設定">
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">天井高 (m)</label>
            <input
              type="number"
              value={roomHeight}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v > 0 && v <= 10) setRoomHeight(v);
              }}
              min={2}
              max={10}
              step={0.1}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => initRectRoom(6, 4)}
              className="flex-1 text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
            >
              小 6x4m
            </button>
            <button
              onClick={() => initRectRoom(8, 6)}
              className="flex-1 text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
            >
              中 8x6m
            </button>
            <button
              onClick={() => initRectRoom(12, 8)}
              className="flex-1 text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
            >
              大 12x8m
            </button>
          </div>
        </div>
      </Section>

      {/* Style */}
      <Section title="スタイル">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.entries(STYLE_PRESETS) as [StylePreset, (typeof STYLE_PRESETS)[StylePreset]][]).map(
            ([key, config]) => (
              <button
                key={key}
                onClick={() => setStyle(key)}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
                  style === key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <div
                  className="w-full h-1.5 rounded mb-1"
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

      {/* Furniture */}
      <Section title="什器・家具">
        <div className="grid grid-cols-2 gap-1.5">
          {FURNITURE_CATALOG.map((item) => (
            <button
              key={item.type}
              onClick={() => handleAddFurniture(item.type)}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 rounded hover:bg-blue-50 border border-gray-200 text-left text-xs"
            >
              <span className="text-base">{item.icon}</span>
              <span className="text-gray-700">{item.name}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Selected Wall */}
      {selectedWall && (
        <Section title="選択中の壁">
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              長さ: {wallLength(selectedWall).toFixed(2)}m
            </p>
            <p className="text-xs text-gray-500">
              厚さ: {selectedWall.thickness}m | 高さ: {selectedWall.height}m
            </p>
            <button
              onClick={() => deleteWall(selectedWall.id)}
              className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 text-xs font-medium"
            >
              壁を削除
            </button>
          </div>
        </Section>
      )}

      {/* Selected Furniture */}
      {selectedFurnitureItem && (
        <Section title={`選択: ${selectedFurnitureItem.name}`}>
          <div className="space-y-2">
            <div className="flex gap-1">
              <button
                onClick={() =>
                  updateFurniture(selectedFurnitureItem.id, {
                    rotation: [
                      selectedFurnitureItem.rotation[0],
                      selectedFurnitureItem.rotation[1] - Math.PI / 4,
                      selectedFurnitureItem.rotation[2],
                    ],
                  })
                }
                className="flex-1 px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 text-xs"
              >
                ↺ 回転
              </button>
              <button
                onClick={() =>
                  updateFurniture(selectedFurnitureItem.id, {
                    rotation: [
                      selectedFurnitureItem.rotation[0],
                      selectedFurnitureItem.rotation[1] + Math.PI / 4,
                      selectedFurnitureItem.rotation[2],
                    ],
                  })
                }
                className="flex-1 px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 text-xs"
              >
                ↻ 回転
              </button>
            </div>
            <button
              onClick={() => {
                deleteFurniture(selectedFurnitureItem.id);
                setSelectedFurniture(null);
              }}
              className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 text-xs font-medium"
            >
              削除
            </button>
          </div>
        </Section>
      )}

      {/* Stats */}
      <div className="mt-auto p-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-400">
        壁: {walls.length} | 什器: {furniture.length}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 border-b border-gray-100">
      <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}
