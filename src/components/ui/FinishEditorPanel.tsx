'use client';

import { useState } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { FINISH_MATERIALS, getFinishByCategory } from '@/data/finish-materials';
import { EQUIPMENT_CATALOG } from '@/data/equipment-catalog';
import { calcWallArea } from '@/lib/cost-estimate';

type Tab = 'wall' | 'floor' | 'ceiling' | 'equipment';

export function FinishEditorPanel() {
  const [tab, setTab] = useState<Tab>('wall');
  const walls = useEditorStore(s => s.walls);
  const openings = useEditorStore(s => s.openings);
  const roomHeight = useEditorStore(s => s.roomHeight);
  const wallAssignments = useEditorStore(s => s.wallFinishAssignments);
  const roomAssignments = useEditorStore(s => s.roomFinishAssignments);
  const setWallFinish = useEditorStore(s => s.setWallFinish);
  const setAllWallsFinish = useEditorStore(s => s.setAllWallsFinish);
  const setRoomFloorFinish = useEditorStore(s => s.setRoomFloorFinish);
  const setRoomCeilingFinish = useEditorStore(s => s.setRoomCeilingFinish);
  const equipmentItems = useEditorStore(s => s.equipmentItems);
  const addEquipment = useEditorStore(s => s.addEquipment);
  const deleteEquipment = useEditorStore(s => s.deleteEquipment);
  const roomLabels = useEditorStore(s => s.roomLabels);

  const wallFinishes = getFinishByCategory('wall');
  const floorFinishes = getFinishByCategory('floor');
  const ceilingFinishes = getFinishByCategory('ceiling');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'wall', label: '壁' },
    { key: 'floor', label: '床' },
    { key: 'ceiling', label: '天井' },
    { key: 'equipment', label: '設備' },
  ];

  return (
    <div className="border-b border-gray-100">
      <div className="px-3 py-2">
        <div className="text-xs font-semibold text-gray-700 mb-2">仕上げ材・設備</div>
        <div className="flex gap-1 mb-3">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'wall' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-gray-500">一括:</span>
              <select
                className="flex-1 text-xs border rounded px-2 py-1"
                onChange={e => { if (e.target.value) setAllWallsFinish(e.target.value); }}
                defaultValue=""
              >
                <option value="">選択...</option>
                {wallFinishes.map(m => (
                  <option key={m.id} value={m.id}>{m.name} (¥{m.unitPrice.toLocaleString()}/m²)</option>
                ))}
              </select>
            </div>
            {walls.length === 0 && <p className="text-xs text-gray-400">壁を描画してください</p>}
            {walls.map((wall, i) => {
              const area = calcWallArea(wall, roomHeight, openings);
              const assign = wallAssignments.find((a: { wallId: string }) => a.wallId === wall.id);
              const mat = assign ? FINISH_MATERIALS.find(m => m.id === assign.finishMaterialId) : null;
              return (
                <div key={wall.id} className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-500 w-10 shrink-0">壁{i + 1}</span>
                  <span className="text-gray-400 w-11 shrink-0 text-right">{area.toFixed(1)}m²</span>
                  {mat?.colorCode && <span className="w-3 h-3 rounded-sm shrink-0 border border-gray-200" style={{ backgroundColor: mat.colorCode }} />}
                  <select
                    className="flex-1 min-w-0 border rounded px-1 py-0.5 text-xs"
                    value={assign?.finishMaterialId || ''}
                    onChange={e => setWallFinish(wall.id, e.target.value)}
                  >
                    <option value="">未選択</option>
                    {wallFinishes.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {mat && <span className="text-gray-400 text-[10px] w-14 text-right shrink-0">¥{Math.round(area * mat.unitPrice).toLocaleString()}</span>}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'floor' && (
          <div className="space-y-2">
            {roomLabels.length === 0 ? (
              <div className="text-xs text-gray-400 space-y-1">
                <p>部屋ラベルを追加してください</p>
                <p className="text-[10px]">2D図面上でダブルクリック→部屋名入力</p>
              </div>
            ) : roomLabels.map(room => {
              const assign = roomAssignments.find((a: { roomLabelId: string }) => a.roomLabelId === room.id);
              return (
                <div key={room.id} className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">{room.name || '部屋'}</span>
                  <select
                    className="w-full border rounded px-2 py-1 text-xs"
                    value={assign?.floorFinishId || ''}
                    onChange={e => setRoomFloorFinish(room.id, e.target.value)}
                  >
                    <option value="">未選択</option>
                    {floorFinishes.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ¥{m.unitPrice.toLocaleString()}/m²</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'ceiling' && (
          <div className="space-y-2">
            {roomLabels.length === 0 ? (
              <p className="text-xs text-gray-400">部屋ラベルを追加してください</p>
            ) : roomLabels.map(room => {
              const assign = roomAssignments.find((a: { roomLabelId: string }) => a.roomLabelId === room.id);
              return (
                <div key={room.id} className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">{room.name || '部屋'}</span>
                  <select
                    className="w-full border rounded px-2 py-1 text-xs"
                    value={assign?.ceilingFinishId || ''}
                    onChange={e => setRoomCeilingFinish(room.id, e.target.value)}
                  >
                    <option value="">未選択</option>
                    {ceilingFinishes.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ¥{m.unitPrice.toLocaleString()}/m²</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'equipment' && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1">
              {EQUIPMENT_CATALOG.map(eq => (
                <button
                  key={eq.type}
                  onClick={() => addEquipment({ type: eq.type, name: eq.name, position: [0, 0], unitPrice: eq.defaultUnitPrice, quantity: 1 })}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors text-center"
                >
                  <span className="text-lg">{eq.icon}</span>
                  <span className="text-[9px] text-gray-600 leading-tight">{eq.name}</span>
                  <span className="text-[8px] text-gray-400">¥{eq.defaultUnitPrice.toLocaleString()}</span>
                </button>
              ))}
            </div>
            {equipmentItems.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-[10px] font-medium text-gray-500">配置済み ({equipmentItems.length}点)</div>
                {equipmentItems.map(eq => (
                  <div key={eq.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                    <span className="truncate">{eq.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-400">¥{(eq.unitPrice * eq.quantity).toLocaleString()}</span>
                      <button onClick={() => deleteEquipment(eq.id)} className="text-red-400 hover:text-red-600">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
