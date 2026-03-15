import { EquipmentType } from '@/types/finishing';

export interface EquipmentCatalogItem {
  type: EquipmentType;
  name: string;
  icon: string;
  defaultUnitPrice: number;
  specs?: string[];
  placement: 'wall' | 'ceiling' | 'floor';
}

export const EQUIPMENT_CATALOG: EquipmentCatalogItem[] = [
  { type: 'air_conditioner', name: 'エアコン', icon: '❄️', defaultUnitPrice: 150000, specs: ['2.2kW (6畳)', '2.8kW (8畳)', '3.6kW (12畳)', '4.0kW (14畳)', '5.6kW (18畳)'], placement: 'wall' },
  { type: 'outlet', name: 'コンセント (2口)', icon: '🔌', defaultUnitPrice: 4000, placement: 'wall' },
  { type: 'switch', name: 'スイッチ', icon: '🔲', defaultUnitPrice: 3000, specs: ['片切', '3路', '調光付'], placement: 'wall' },
  { type: 'lighting_downlight', name: 'ダウンライト', icon: '💡', defaultUnitPrice: 8000, specs: ['電球色', '昼白色', '調色'], placement: 'ceiling' },
  { type: 'lighting_ceiling', name: 'シーリングライト', icon: '🔆', defaultUnitPrice: 25000, placement: 'ceiling' },
  { type: 'fire_alarm', name: '火災報知器', icon: '🔔', defaultUnitPrice: 5000, specs: ['煙式', '熱式'], placement: 'ceiling' },
  { type: 'exhaust_fan', name: '換気扇', icon: '🌀', defaultUnitPrice: 25000, specs: ['天井埋込', '壁付'], placement: 'wall' },
  { type: 'lan_port', name: 'LANコンセント', icon: '🌐', defaultUnitPrice: 6000, placement: 'wall' },
  { type: 'intercom', name: 'インターホン', icon: '📞', defaultUnitPrice: 35000, placement: 'wall' },
];

export const ROUTE_TYPES = [
  { type: 'electrical' as const, name: '電気配線', icon: '⚡', color: '#E04040', unitPrice: 3000, unit: 'm' },
  { type: 'plumbing_water' as const, name: '給水配管', icon: '💧', color: '#4080E0', unitPrice: 5000, unit: 'm' },
  { type: 'plumbing_drain' as const, name: '排水配管', icon: '🚿', color: '#40A040', unitPrice: 6000, unit: 'm' },
  { type: 'gas' as const, name: 'ガス配管', icon: '🔥', color: '#E0A020', unitPrice: 8000, unit: 'm' },
  { type: 'lan' as const, name: 'LAN配線', icon: '🌐', color: '#8040C0', unitPrice: 2500, unit: 'm' },
];
