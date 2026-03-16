#!/usr/bin/env npx tsx
/**
 * template-to-json.ts
 *
 * テンプレートデータからBlender用シーンJSONを生成するスクリプト。
 * ROOM_TEMPLATES / STORE_TEMPLATES / STYLE_PRESETS / FURNITURE_CATALOG を読み込み、
 * Blenderレンダリングパイプライン用の構造化JSONを出力する。
 *
 * Usage:
 *   npx tsx scripts/template-to-json.ts --template=rt_small_cafe --style=cafe
 *   npx tsx scripts/template-to-json.ts --template=cafe_30
 *   npx tsx scripts/template-to-json.ts --list
 *
 * Must be run from the project root directory.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Imports — use relative paths from scripts/ directory
// ---------------------------------------------------------------------------

import { ROOM_TEMPLATES } from '../src/data/room-templates';
import { STORE_TEMPLATES } from '../src/data/templates';
import { STYLE_PRESETS } from '../src/data/styles';
import { FURNITURE_CATALOG } from '../src/data/furniture';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SceneJSON {
  template: {
    id: string;
    name: string;
  };
  room: {
    width: number;
    depth: number;
    height: number;
    wallThickness: number;
  };
  openings: Array<{
    wall: 'north' | 'south' | 'east' | 'west';
    positionAlongWall: number;
    width: number;
    height: number;
    elevation: number;
    type: 'door' | 'window';
  }>;
  style: Record<string, unknown>;
  furniture: Array<{
    type: string;
    name: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    defaultMaterial?: string;
  }>;
  modelsDir: string;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { template?: string; style?: string; output?: string; list: boolean } {
  const args = process.argv.slice(2);
  const result: { template?: string; style?: string; output?: string; list: boolean } = { list: false };

  for (const arg of args) {
    if (arg === '--list') {
      result.list = true;
    } else if (arg.startsWith('--template=')) {
      result.template = arg.split('=')[1];
    } else if (arg.startsWith('--style=')) {
      result.style = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Template lookup
// ---------------------------------------------------------------------------

interface TemplateData {
  id: string;
  name: string;
  style: string;
  walls: Array<{ id: string; thickness: number; height: number }>;
  openings: Array<{ wallId: string; type: string; positionAlongWall: number; width: number; height: number; elevation: number }>;
  furniture: Array<{ type: string; name: string; position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }>;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}

function findTemplate(templateId: string): TemplateData | null {
  // Search ROOM_TEMPLATES first
  const rt = ROOM_TEMPLATES.find((t: { id: string }) => t.id === templateId);
  if (rt) {
    // RoomTemplate uses createRectRoom(w, d, h) — extract dimensions from walls
    // walls[0] = North: from (-hw, -hd) to (hw, -hd) → width = distance = w
    const wall0 = rt.walls[0];
    const width = Math.abs(wall0.end.x - wall0.start.x);
    const wall1 = rt.walls[1];
    const depth = Math.abs(wall1.end.y - wall1.start.y);
    return {
      id: rt.id,
      name: rt.name,
      style: rt.style,
      walls: rt.walls,
      openings: rt.openings,
      furniture: rt.furniture,
      roomWidth: width,
      roomDepth: depth,
      roomHeight: rt.roomHeight,
    };
  }

  // Search STORE_TEMPLATES
  const st = STORE_TEMPLATES.find((t: { id: string }) => t.id === templateId);
  if (st) {
    return {
      id: st.id,
      name: st.name,
      style: st.style,
      walls: st.walls,
      openings: st.openings,
      furniture: st.furniture,
      roomWidth: st.roomWidth,
      roomDepth: st.roomDepth,
      roomHeight: st.roomHeight,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Wall direction mapping
// ---------------------------------------------------------------------------

const WALL_DIRECTIONS: Array<'north' | 'east' | 'south' | 'west'> = ['north', 'east', 'south', 'west'];

function getWallDirection(wallId: string, walls: Array<{ id: string }>): 'north' | 'south' | 'east' | 'west' {
  const idx = walls.findIndex(w => w.id === wallId);
  if (idx >= 0 && idx < 4) {
    return WALL_DIRECTIONS[idx];
  }
  // Fallback: if more than 4 walls (L-shape etc.), default to south
  return 'south';
}

// ---------------------------------------------------------------------------
// Furniture catalog lookup
// ---------------------------------------------------------------------------

function getFurnitureMaterial(type: string): string | undefined {
  const item = FURNITURE_CATALOG.find((f: { type: string }) => f.type === type);
  return item?.defaultMaterial;
}

// ---------------------------------------------------------------------------
// Build scene JSON
// ---------------------------------------------------------------------------

function buildSceneJSON(template: TemplateData, styleName: string): SceneJSON {
  const styleConfig = STYLE_PRESETS[styleName as keyof typeof STYLE_PRESETS];
  if (!styleConfig) {
    console.error(`[Error] Style "${styleName}" not found.`);
    console.error(`Available styles: ${Object.keys(STYLE_PRESETS).join(', ')}`);
    process.exit(1);
  }

  const wallThickness = template.walls[0]?.thickness ?? 0.12;

  const openings = template.openings.map(o => ({
    wall: getWallDirection(o.wallId, template.walls),
    positionAlongWall: o.positionAlongWall,
    width: o.width,
    height: o.height,
    elevation: o.elevation,
    type: o.type as 'door' | 'window',
  }));

  const furniture = template.furniture.map(f => ({
    type: f.type,
    name: f.name,
    position: f.position,
    rotation: f.rotation,
    scale: f.scale,
    defaultMaterial: getFurnitureMaterial(f.type),
  }));

  const modelsDir = path.resolve(PROJECT_ROOT, 'public', 'models');

  return {
    template: {
      id: template.id,
      name: template.name,
    },
    room: {
      width: template.roomWidth,
      depth: template.roomDepth,
      height: template.roomHeight,
      wallThickness,
    },
    openings,
    style: styleConfig as unknown as Record<string, unknown>,
    furniture,
    modelsDir,
  };
}

// ---------------------------------------------------------------------------
// List templates
// ---------------------------------------------------------------------------

function listTemplates(): void {
  console.log('\n=== Room Templates (ROOM_TEMPLATES) ===');
  for (const t of ROOM_TEMPLATES) {
    console.log(`  ${t.id.padEnd(20)} ${t.name.padEnd(20)} style=${t.style}`);
  }

  console.log('\n=== Store Templates (STORE_TEMPLATES) ===');
  for (const t of STORE_TEMPLATES) {
    console.log(`  ${t.id.padEnd(20)} ${t.name.padEnd(20)} style=${t.style}`);
  }

  console.log(`\n=== Styles ===`);
  console.log(`  ${Object.keys(STYLE_PRESETS).join(', ')}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs();

  if (args.list) {
    listTemplates();
    return;
  }

  if (!args.template) {
    console.error('Usage: npx tsx scripts/template-to-json.ts --template=<id> [--style=<style>] [--output=<path>]');
    console.error('       npx tsx scripts/template-to-json.ts --list');
    process.exit(1);
  }

  const template = findTemplate(args.template);
  if (!template) {
    console.error(`[Error] Template "${args.template}" not found.`);
    console.error('Use --list to see available templates.');
    process.exit(1);
  }

  const styleName = args.style ?? template.style;
  console.log(`[Info] Template: ${template.name} (${template.id})`);
  console.log(`[Info] Style: ${styleName}`);
  console.log(`[Info] Room: ${template.roomWidth}m x ${template.roomDepth}m x ${template.roomHeight}m`);

  const sceneJSON = buildSceneJSON(template, styleName);

  // Determine output path
  const outputDir = path.resolve(PROJECT_ROOT, 'output', 'scene-json');
  const outputPath = args.output ?? path.join(outputDir, `${template.id}.json`);

  // Create output directory
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Write JSON
  fs.writeFileSync(outputPath, JSON.stringify(sceneJSON, null, 2), 'utf-8');
  console.log(`[Output] ${outputPath}`);
  console.log(`[Info] Furniture items: ${sceneJSON.furniture.length}`);
  console.log(`[Info] Openings: ${sceneJSON.openings.length}`);
}

main();
