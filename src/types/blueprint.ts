/**
 * PDF→DXF 抽出JSONの型定義
 * (pdf-extract-vectors.py の出力形式)
 */

export interface BlueprintOpening {
  type: 'window' | 'swing_door' | 'sliding_door' | 'folding_door' | 'opening';
  position_mm: number;
  width_mm: number;
  height_mm: number;
  sill_mm?: number;
}

export interface BlueprintWall {
  id: string;
  start_x_mm: number;
  start_y_mm: number;
  end_x_mm: number;
  end_y_mm: number;
  thickness_mm: number;
  type: 'exterior' | 'interior' | 'partition';
  openings: BlueprintOpening[];
}

export interface BlueprintRoom {
  name: string;
  wall_ids: string[];
  area_m2: number;
  center_mm: [number, number];
  polygon_mm: [number, number][];
  confidence?: number;      // 0.0-1.0, extraction confidence
  nearby_texts?: string[];   // nearby text labels for name suggestions
}

export interface BlueprintFixture {
  name: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  depth_mm: number;
  rotation_deg: number;
  estimated: boolean;
}

export interface BlueprintJson {
  source: string;
  pdf_file: string;
  scale_detected: string;
  confidence: number;
  pages_analyzed: number;
  project_name: string;
  origin_offset_mm: { x: number; y: number };
  room: {
    width_mm: number;
    depth_mm: number;
    ceiling_height_mm: number;
    shape: string;
  };
  walls: BlueprintWall[];
  rooms: BlueprintRoom[];
  fixtures: BlueprintFixture[];
  warnings: string[];
}

export interface PdfRenderInfo {
  imageUrl: string;
  pageWidthPt: number;
  pageHeightPt: number;
  dpi: number;
  pageWidthPx: number;
  pageHeightPx: number;
}

export type CorrectionTool =
  | 'select'
  | 'editName'
  | 'moveVertex'
  | 'addRoom'
  | 'deleteRoom'
  | 'moveFixture'
  | 'wallAdd'
  | 'wallMove'
  | 'wallDelete'
  | 'measure';

export interface LayerVisibility {
  pdf: boolean;
  grid: boolean;
  rooms: boolean;
  walls: boolean;
  fixtures: boolean;
  labels: boolean;
  dimensions: boolean;
}
