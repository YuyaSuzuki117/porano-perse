import { FurnitureItem, FurnitureType } from '@/types/scene';

export interface RoomNameSuggestion {
  nameJa: string;
  nameEn: string;
  roomType: string;
  confidence: number;
  seatCount: number;
}

interface CategoryCount {
  seating: number;
  tables: number;
  storage: number;
  equipment: number;
  display: number;
  grooming: number;
  office: number;
  kitchen: number;
}

const SEATING_TYPES: FurnitureType[] = ['chair', 'stool', 'bench', 'sofa'];
const TABLE_TYPES: FurnitureType[] = ['table_square', 'table_round', 'bar_table', 'kitchen_island'];
const STORAGE_TYPES: FurnitureType[] = ['shelf', 'bookcase', 'wardrobe', 'shoe_rack'];
const EQUIPMENT_TYPES: FurnitureType[] = ['fridge', 'washing_machine', 'air_conditioner', 'sink'];
const DISPLAY_TYPES: FurnitureType[] = ['display_case', 'tv_monitor', 'menu_board'];
const GROOMING_TYPES: FurnitureType[] = ['mirror'];
const OFFICE_TYPES: FurnitureType[] = ['desk', 'bookcase'];
const KITCHEN_TYPES: FurnitureType[] = ['sink', 'fridge', 'kitchen_island'];

function categorize(furniture: FurnitureItem[]): CategoryCount {
  const counts: CategoryCount = {
    seating: 0, tables: 0, storage: 0, equipment: 0,
    display: 0, grooming: 0, office: 0, kitchen: 0,
  };

  for (const item of furniture) {
    if (SEATING_TYPES.includes(item.type)) counts.seating++;
    if (TABLE_TYPES.includes(item.type)) counts.tables++;
    if (STORAGE_TYPES.includes(item.type)) counts.storage++;
    if (EQUIPMENT_TYPES.includes(item.type)) counts.equipment++;
    if (DISPLAY_TYPES.includes(item.type)) counts.display++;
    if (GROOMING_TYPES.includes(item.type)) counts.grooming++;
    if (OFFICE_TYPES.includes(item.type)) counts.office++;
    if (KITCHEN_TYPES.includes(item.type)) counts.kitchen++;
  }
  return counts;
}

function countSeats(furniture: FurnitureItem[]): number {
  let count = 0;
  for (const item of furniture) {
    if (item.type === 'chair' || item.type === 'stool') count += 1;
    else if (item.type === 'bench') count += 2;
    else if (item.type === 'sofa') count += 3;
  }
  return count;
}

function hasType(furniture: FurnitureItem[], type: FurnitureType): boolean {
  return furniture.some(f => f.type === type);
}

interface RoomMatch {
  roomType: string;
  nameJa: string;
  nameEn: string;
  score: number;
}

function matchPatterns(furniture: FurnitureItem[], cats: CategoryCount, area: number): RoomMatch[] {
  const matches: RoomMatch[] = [];

  // Cafe pattern: seating + tables + counter
  if (cats.seating >= 2 && cats.tables >= 1) {
    let score = 0.4;
    if (hasType(furniture, 'counter')) score += 0.2;
    if (hasType(furniture, 'register') || hasType(furniture, 'cash_register')) score += 0.15;
    if (hasType(furniture, 'menu_board')) score += 0.1;
    if (hasType(furniture, 'plant')) score += 0.05;
    matches.push({ roomType: 'cafe', nameJa: 'カフェ', nameEn: 'Cafe', score });
  }

  // Restaurant pattern
  if (cats.seating >= 4 && cats.tables >= 2 && cats.kitchen >= 1) {
    let score = 0.5;
    if (hasType(furniture, 'kitchen_island')) score += 0.15;
    if (hasType(furniture, 'fridge')) score += 0.1;
    matches.push({ roomType: 'restaurant', nameJa: 'レストラン', nameEn: 'Restaurant', score });
  }

  // Bar pattern
  if (hasType(furniture, 'bar_table') || (hasType(furniture, 'counter') && hasType(furniture, 'stool'))) {
    let score = 0.5;
    if (hasType(furniture, 'bar_table')) score += 0.2;
    const stoolCount = furniture.filter(f => f.type === 'stool').length;
    if (stoolCount >= 3) score += 0.1;
    matches.push({ roomType: 'bar', nameJa: 'バー', nameEn: 'Bar', score });
  }

  // Office pattern
  if (cats.office >= 2) {
    let score = 0.4;
    const deskCount = furniture.filter(f => f.type === 'desk').length;
    if (deskCount >= 2) score += 0.2;
    if (hasType(furniture, 'bookcase')) score += 0.15;
    if (hasType(furniture, 'tv_monitor')) score += 0.1;
    matches.push({ roomType: 'office', nameJa: 'オフィス', nameEn: 'Office', score });
  }

  // Salon pattern
  if (cats.grooming >= 1 && cats.seating >= 1) {
    let score = 0.45;
    const mirrorCount = furniture.filter(f => f.type === 'mirror').length;
    if (mirrorCount >= 2) score += 0.2;
    if (hasType(furniture, 'washing_machine')) score += 0.15;
    matches.push({ roomType: 'salon', nameJa: 'サロン', nameEn: 'Salon', score });
  }

  // Retail pattern
  if (cats.display >= 1 && (hasType(furniture, 'register') || hasType(furniture, 'cash_register'))) {
    let score = 0.5;
    if (hasType(furniture, 'display_case')) score += 0.2;
    if (hasType(furniture, 'shelf')) score += 0.1;
    matches.push({ roomType: 'retail', nameJa: '店舗', nameEn: 'Retail shop', score });
  }

  // Waiting room
  if (cats.seating >= 3 && cats.tables <= 1 && hasType(furniture, 'reception_desk')) {
    matches.push({ roomType: 'waiting', nameJa: '待合室', nameEn: 'Waiting room', score: 0.6 });
  }

  return matches;
}

function buildDetails(
  furniture: FurnitureItem[],
  seatCount: number,
  roomType: string
): { detailJa: string; detailEn: string } {
  const parts: string[] = [];
  const partsEn: string[] = [];

  if (seatCount > 0) {
    parts.push(`${seatCount}席`);
    partsEn.push(`${seatCount} seats`);
  }

  if (hasType(furniture, 'counter')) {
    parts.push('カウンター付き');
    partsEn.push('with counter');
  }

  if (hasType(furniture, 'kitchen_island')) {
    parts.push('キッチン付き');
    partsEn.push('with kitchen');
  }

  if (hasType(furniture, 'reception_desk')) {
    parts.push('受付あり');
    partsEn.push('with reception');
  }

  return {
    detailJa: parts.length > 0 ? ` ${parts.join(' ')}` : '',
    detailEn: parts.length > 0 ? `, ${partsEn.join(', ')}` : '',
  };
}

export function inferRoomName(
  furniture: FurnitureItem[],
  _area: number
): RoomNameSuggestion {
  if (furniture.length === 0) {
    return {
      nameJa: '空の部屋',
      nameEn: 'Empty room',
      roomType: 'empty',
      confidence: 1.0,
      seatCount: 0,
    };
  }

  const cats = categorize(furniture);
  const seatCount = countSeats(furniture);
  const matches = matchPatterns(furniture, cats, _area);

  if (matches.length === 0) {
    return {
      nameJa: '多目的スペース',
      nameEn: 'Multi-purpose space',
      roomType: 'general',
      confidence: 0.2,
      seatCount,
    };
  }

  // Pick best match
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  const confidence = Math.min(best.score, 1.0);

  const { detailJa, detailEn } = buildDetails(furniture, seatCount, best.roomType);

  return {
    nameJa: `${best.nameJa}${detailJa}`,
    nameEn: `${best.nameEn}${detailEn}`,
    roomType: best.roomType,
    confidence,
    seatCount,
  };
}
