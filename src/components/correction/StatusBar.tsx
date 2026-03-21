'use client';

import { useCorrectionStore } from '@/stores/useCorrectionStore';
import type { CorrectionTool } from '@/types/blueprint';

const toolLabels: Record<CorrectionTool, { name: string; hint: string }> = {
  select: { name: '選択', hint: 'クリックで要素を選択' },
  editName: { name: '室名編集', hint: 'Tab/Shift+Tabで不明室を巡回' },
  moveVertex: { name: '頂点移動', hint: 'ドラッグで頂点を移動' },
  addRoom: { name: '部屋追加', hint: 'クリックで頂点追加、ダブルクリックで確定' },
  deleteRoom: { name: '部屋削除', hint: 'クリックで部屋を削除' },
  moveFixture: { name: '什器移動', hint: 'ドラッグで什器を移動' },
  wallAdd: { name: '壁追加', hint: '2点クリックで壁を追加' },
  wallMove: { name: '壁移動', hint: 'ドラッグで壁を移動' },
  wallDelete: { name: '壁削除', hint: 'クリックで壁を削除' },
  measure: { name: '計測', hint: '2点クリックで距離を測定' },
  moveAll: { name: '全体移動', hint: 'ドラッグで全要素を移動' },
  splitRoom: { name: '部屋分割', hint: '2点クリックで分割線を引く' },
};

/**
 * 下部ステータスバー: ツール情報・進捗・マウス座標・ズーム
 */
export default function StatusBar() {
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const activeTool = useCorrectionStore((s) => s.activeTool);
  const zoom = useCorrectionStore((s) => s.zoom);

  if (!blueprint) return null;

  const toolInfo = toolLabels[activeTool];
  const unknownCount = blueprint.rooms.filter((r) => r.name === '不明' || r.name === '').length;
  const namedCount = blueprint.rooms.length - unknownCount;
  const totalRooms = blueprint.rooms.length;
  const progressPercent = totalRooms > 0 ? Math.round((namedCount / totalRooms) * 100) : 0;
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex items-center gap-3 px-3 py-0.5 bg-[#0d1117] border-t border-[#1e3a5f] text-[10px] font-mono select-none">
      {/* 現在のツール + ヒント */}
      <div className="flex items-center gap-1.5">
        <span className="text-[#4a90d9] font-bold">{toolInfo.name}</span>
        <span className="text-[#4a6a8a]">: {toolInfo.hint}</span>
      </div>

      <div className="w-px h-3 bg-[#1e3a5f]" />

      {/* 進捗 */}
      <span className={`font-medium ${progressPercent === 100 ? 'text-green-400' : unknownCount > 0 ? 'text-amber-400' : 'text-[#8ba4c4]'}`}>
        室名: {namedCount}/{totalRooms} ({progressPercent}%)
      </span>

      {/* スペーサー */}
      <div className="flex-1" />

      {/* ズームレベル */}
      <span className="text-[#6b8ab5]">{zoomPercent}%</span>
    </div>
  );
}
