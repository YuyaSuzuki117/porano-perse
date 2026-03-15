// === 仕上げ材・設備・配線の型定義 ===

export type FinishCategory = 'wall' | 'floor' | 'ceiling';

export interface FinishMaterial {
  id: string;
  category: FinishCategory;
  type: string;
  name: string;
  unitPrice: number;
  unit: 'm2';
  manufacturer?: string;
  colorCode?: string;
}

export interface WallFinishAssignment {
  wallId: string;
  finishMaterialId: string;
}

export interface RoomFinishAssignment {
  roomLabelId: string;
  floorFinishId?: string;
  ceilingFinishId?: string;
  floorAreaOverride?: number;
}

export interface FittingSpec {
  openingId: string;
  productName: string;
  material: 'wood' | 'aluminum' | 'steel' | 'resin';
  unitPrice: number;
  quantity: number;
}

export type EquipmentType = 'air_conditioner' | 'outlet' | 'switch' | 'lighting_downlight' | 'lighting_ceiling' | 'fire_alarm' | 'exhaust_fan' | 'lan_port' | 'intercom';

export interface EquipmentItem {
  id: string;
  type: EquipmentType;
  name: string;
  position: [number, number];
  wallId?: string;
  spec?: string;
  unitPrice: number;
  quantity: number;
}

export type RouteType = 'electrical' | 'plumbing_water' | 'plumbing_drain' | 'gas' | 'lan';

export interface RouteSegment {
  id: string;
  type: RouteType;
  points: [number, number][];
  isConcealed: boolean;
}

export interface FinishCostLineItem {
  name: string;
  spec?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface FinishCostSection {
  label: string;
  items: FinishCostLineItem[];
  subtotal: number;
}
