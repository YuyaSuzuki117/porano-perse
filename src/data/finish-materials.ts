import { FinishMaterial } from '@/types/finishing';

export const FINISH_MATERIALS: FinishMaterial[] = [
  // === 壁仕上げ ===
  { id: 'wall_vinyl_std', category: 'wall', type: 'vinyl_cloth', name: '量産クロス (白)', unitPrice: 1200, unit: 'm2', colorCode: '#F5F5F0' },
  { id: 'wall_vinyl_beige', category: 'wall', type: 'vinyl_cloth', name: '量産クロス (ベージュ)', unitPrice: 1200, unit: 'm2', colorCode: '#E8DCC8' },
  { id: 'wall_vinyl_gray', category: 'wall', type: 'vinyl_cloth', name: '量産クロス (グレー)', unitPrice: 1200, unit: 'm2', colorCode: '#C0C0C0' },
  { id: 'wall_vinyl_premium', category: 'wall', type: 'vinyl_cloth_premium', name: '1000番台クロス', unitPrice: 1800, unit: 'm2', colorCode: '#E0D8C8' },
  { id: 'wall_paint_ep', category: 'wall', type: 'paint', name: 'EP塗装 (白)', unitPrice: 2500, unit: 'm2', colorCode: '#FFFFFF' },
  { id: 'wall_paint_color', category: 'wall', type: 'paint', name: 'EP塗装 (調色)', unitPrice: 3000, unit: 'm2', colorCode: '#A8C8A0' },
  { id: 'wall_tile_white', category: 'wall', type: 'tile', name: '白タイル 100角', unitPrice: 8000, unit: 'm2', colorCode: '#F0F0F0' },
  { id: 'wall_tile_subway', category: 'wall', type: 'tile', name: 'サブウェイタイル', unitPrice: 10000, unit: 'm2', colorCode: '#F8F8F0' },
  { id: 'wall_wood', category: 'wall', type: 'wood_panel', name: '羽目板 (杉)', unitPrice: 12000, unit: 'm2', colorCode: '#C8A870' },
  { id: 'wall_plaster', category: 'wall', type: 'plaster', name: '漆喰', unitPrice: 8000, unit: 'm2', colorCode: '#F0EDE0' },
  // === 床仕上げ ===
  { id: 'floor_composite', category: 'floor', type: 'flooring_composite', name: '複合フローリング', unitPrice: 7000, unit: 'm2', colorCode: '#B89060' },
  { id: 'floor_solid_oak', category: 'floor', type: 'flooring_solid', name: '無垢フローリング (オーク)', unitPrice: 15000, unit: 'm2', colorCode: '#C8A870' },
  { id: 'floor_solid_walnut', category: 'floor', type: 'flooring_solid', name: '無垢フローリング (ウォルナット)', unitPrice: 20000, unit: 'm2', colorCode: '#6A4830' },
  { id: 'floor_tile_porcl', category: 'floor', type: 'tile', name: '磁器タイル 300角', unitPrice: 8000, unit: 'm2', colorCode: '#D0C8B8' },
  { id: 'floor_tile_terracotta', category: 'floor', type: 'tile', name: 'テラコッタタイル', unitPrice: 10000, unit: 'm2', colorCode: '#C87850' },
  { id: 'floor_carpet', category: 'floor', type: 'carpet', name: 'タイルカーペット', unitPrice: 4000, unit: 'm2', colorCode: '#808080' },
  { id: 'floor_vinyl', category: 'floor', type: 'vinyl_sheet', name: '長尺シート', unitPrice: 3500, unit: 'm2', colorCode: '#B0A890' },
  { id: 'floor_tatami', category: 'floor', type: 'tatami', name: '畳 (半帖)', unitPrice: 12000, unit: 'm2', colorCode: '#A0B060' },
  { id: 'floor_marble', category: 'floor', type: 'marble', name: '大理石タイル', unitPrice: 25000, unit: 'm2', colorCode: '#E8E0D0' },
  { id: 'floor_concrete', category: 'floor', type: 'concrete', name: 'コンクリート打ちっぱなし', unitPrice: 5000, unit: 'm2', colorCode: '#A0A0A0' },
  // === 天井仕上げ ===
  { id: 'ceil_gypsum', category: 'ceiling', type: 'gypsum_board_ep', name: '石膏ボード + EP塗装', unitPrice: 2500, unit: 'm2', colorCode: '#F5F5F5' },
  { id: 'ceil_wood', category: 'ceiling', type: 'wood_panel', name: '木目天井材', unitPrice: 8000, unit: 'm2', colorCode: '#C0A060' },
  { id: 'ceil_exposed', category: 'ceiling', type: 'exposed', name: 'スケルトン天井', unitPrice: 1500, unit: 'm2', colorCode: '#505050' },
  { id: 'ceil_system', category: 'ceiling', type: 'system_ceiling', name: 'システム天井', unitPrice: 6000, unit: 'm2', colorCode: '#E8E8E8' },
];

export function getFinishMaterial(id: string): FinishMaterial | undefined {
  return FINISH_MATERIALS.find(m => m.id === id);
}

export function getFinishByCategory(category: string): FinishMaterial[] {
  return FINISH_MATERIALS.filter(m => m.category === category);
}
