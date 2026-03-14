export interface LightingRecommendation {
  pendantCount: number;
  brightness: number;       // lux
  warmth: string;           // 'very warm' | 'warm' | 'neutral' | 'cool-neutral'
  colorTemp: number;        // Kelvin
  description: string;      // Japanese
}

interface RoomProfile {
  luxMin: number;
  luxMax: number;
  colorTemp: number;
  warmth: string;
  areaPerPendant: number;
  nameJa: string;
}

const ROOM_PROFILES: Record<string, RoomProfile> = {
  cafe: {
    luxMin: 300, luxMax: 500, colorTemp: 3000,
    warmth: '暖色', areaPerPendant: 4, nameJa: 'カフェ',
  },
  office: {
    luxMin: 500, luxMax: 750, colorTemp: 4000,
    warmth: '中間色', areaPerPendant: 3, nameJa: 'オフィス',
  },
  retail: {
    luxMin: 750, luxMax: 1000, colorTemp: 4500,
    warmth: '昼白色', areaPerPendant: 2.5, nameJa: '店舗',
  },
  restaurant: {
    luxMin: 200, luxMax: 400, colorTemp: 2700,
    warmth: '暖色', areaPerPendant: 5, nameJa: 'レストラン',
  },
  bar: {
    luxMin: 100, luxMax: 200, colorTemp: 2200,
    warmth: '超暖色', areaPerPendant: 6, nameJa: 'バー',
  },
  salon: {
    luxMin: 500, luxMax: 750, colorTemp: 4000,
    warmth: '中間色', areaPerPendant: 3, nameJa: 'サロン',
  },
};

const FURNITURE_TO_ROOM: Record<string, string[]> = {
  counter: ['cafe', 'bar'],
  bar_table: ['bar'],
  register: ['retail'],
  cash_register: ['retail'],
  display_case: ['retail'],
  desk: ['office'],
  bookcase: ['office'],
  mirror: ['salon'],
  sofa: ['cafe', 'restaurant'],
  stool: ['bar', 'cafe'],
  chair: ['restaurant', 'cafe', 'office'],
  table_square: ['restaurant', 'cafe'],
  table_round: ['restaurant', 'cafe'],
  kitchen_island: ['restaurant'],
  sink: ['restaurant', 'cafe'],
  fridge: ['restaurant', 'cafe'],
};

function inferRoomType(furnitureTypes: string[]): string {
  const scores: Record<string, number> = {};

  for (const ft of furnitureTypes) {
    const roomTypes = FURNITURE_TO_ROOM[ft];
    if (roomTypes) {
      for (const rt of roomTypes) {
        scores[rt] = (scores[rt] ?? 0) + 1;
      }
    }
  }

  let bestType = 'cafe';
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  return bestType;
}

export function recommendLighting(
  area: number,
  furnitureTypes: string[],
  _style: string
): LightingRecommendation {
  const roomType = inferRoomType(furnitureTypes);
  const profile = ROOM_PROFILES[roomType] ?? ROOM_PROFILES['cafe'];

  const pendantCount = Math.max(1, Math.round(area / profile.areaPerPendant));
  const brightness = Math.round((profile.luxMin + profile.luxMax) / 2);

  const description = [
    `${profile.nameJa}向け照明プラン:`,
    `ペンダントライト ${pendantCount}灯`,
    `推奨照度 ${profile.luxMin}〜${profile.luxMax} lux`,
    `色温度 ${profile.colorTemp}K（${profile.warmth}）`,
    `${area.toFixed(1)}m²の空間に対して、${profile.areaPerPendant}m²あたり1灯を配置します。`,
  ].join('\n');

  return {
    pendantCount,
    brightness,
    warmth: profile.warmth,
    colorTemp: profile.colorTemp,
    description,
  };
}
