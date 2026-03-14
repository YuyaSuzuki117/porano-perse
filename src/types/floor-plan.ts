// 図面データの型定義

export interface Point2D {
  x: number; // メートル単位
  y: number;
}

export interface WallSegment {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number;  // デフォルト 0.12m
  height: number;     // デフォルト部屋天井高
  materialId?: string;
  color: string;
}

export interface Opening {
  id: string;
  wallId: string;
  type: 'door' | 'window';
  positionAlongWall: number; // 壁始点からの距離(m)
  width: number;
  height: number;
  elevation: number; // 床からの高さ(窓の場合)
}

export type EditorTool = 'select' | 'wall' | 'door' | 'window' | 'measure' | 'delete' | 'furniture' | 'annotation';

export interface SnapResult {
  point: Point2D;
  type: 'grid' | 'endpoint' | 'midpoint' | 'none';
}

export interface RoomLabel {
  id: string;
  name: string;
  position: Point2D; // ラベルの配置位置（ワールド座標）
}
