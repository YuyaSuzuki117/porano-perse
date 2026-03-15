/**
 * GLB家具モデル生成スクリプト
 * Three.jsでプリミティブより高品質なジオメトリを組み合わせてGLBとして出力
 *
 * Usage: node scripts/generate-models.mjs
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'models');
mkdirSync(OUTPUT_DIR, { recursive: true });

function createMaterial(color, roughness = 0.5, metalness = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const WOOD = createMaterial('#8B6914', 0.7, 0.05);
const WOOD_DARK = createMaterial('#5C3A1E', 0.7, 0.05);
const WOOD_LIGHT = createMaterial('#C4A06A', 0.6, 0.05);
const FABRIC_RED = createMaterial('#B84848', 0.85, 0.0);
const FABRIC_BLUE = createMaterial('#4A6A9A', 0.85, 0.0);
const METAL_SILVER = createMaterial('#B0B0B8', 0.3, 0.8);
const METAL_DARK = createMaterial('#404048', 0.4, 0.7);
const GREEN_LEAF = createMaterial('#3D7A3D', 0.8, 0.0);
const GREEN_DARK = createMaterial('#2A5A2A', 0.8, 0.0);
const TERRACOTTA = createMaterial('#B85C38', 0.7, 0.1);
const CREAM = createMaterial('#F0E8D0', 0.6, 0.05);
const GLASS = createMaterial('#B8D8E8', 0.1, 0.2);
GLASS.transparent = true;
GLASS.opacity = 0.4;
const WHITE = createMaterial('#F8F8F0', 0.5, 0.05);

function addMesh(group, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// ─── Chair ─────────────────────────
function createChair() {
  const g = new THREE.Group();
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.015, 0.018, 0.45, 8);
  addMesh(g, legGeo, WOOD_DARK, [-0.17, 0.225, -0.17]);
  addMesh(g, legGeo, WOOD_DARK, [0.17, 0.225, -0.17]);
  addMesh(g, legGeo, WOOD_DARK, [-0.17, 0.225, 0.17]);
  addMesh(g, legGeo, WOOD_DARK, [0.17, 0.225, 0.17]);
  // Seat
  const seatGeo = new THREE.BoxGeometry(0.42, 0.035, 0.40);
  addMesh(g, seatGeo, WOOD, [0, 0.46, 0]);
  // Seat cushion
  const cushionGeo = new THREE.BoxGeometry(0.38, 0.04, 0.36);
  addMesh(g, cushionGeo, FABRIC_RED, [0, 0.50, 0]);
  // Back rest - curved
  const backGeo = new THREE.BoxGeometry(0.42, 0.38, 0.025);
  addMesh(g, backGeo, WOOD, [0, 0.68, -0.19]);
  // Back slats
  const slatGeo = new THREE.BoxGeometry(0.03, 0.28, 0.015);
  addMesh(g, slatGeo, WOOD_DARK, [-0.12, 0.66, -0.18]);
  addMesh(g, slatGeo, WOOD_DARK, [0, 0.66, -0.18]);
  addMesh(g, slatGeo, WOOD_DARK, [0.12, 0.66, -0.18]);
  // Cross brace
  const braceGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.34, 6);
  addMesh(g, braceGeo, WOOD_DARK, [0, 0.15, 0], [0, 0, Math.PI / 2]);
  return g;
}

// ─── Table Square ──────────────────
function createTableSquare() {
  const g = new THREE.Group();
  // Top
  const topGeo = new THREE.BoxGeometry(0.9, 0.04, 0.9);
  addMesh(g, topGeo, WOOD_LIGHT, [0, 0.74, 0]);
  // Apron
  const apronGeo = new THREE.BoxGeometry(0.82, 0.06, 0.04);
  addMesh(g, apronGeo, WOOD, [0, 0.69, 0.42]);
  addMesh(g, apronGeo, WOOD, [0, 0.69, -0.42]);
  const apronSideGeo = new THREE.BoxGeometry(0.04, 0.06, 0.82);
  addMesh(g, apronSideGeo, WOOD, [0.42, 0.69, 0]);
  addMesh(g, apronSideGeo, WOOD, [-0.42, 0.69, 0]);
  // Legs
  const legGeo = new THREE.BoxGeometry(0.05, 0.66, 0.05);
  addMesh(g, legGeo, WOOD_DARK, [-0.40, 0.33, -0.40]);
  addMesh(g, legGeo, WOOD_DARK, [0.40, 0.33, -0.40]);
  addMesh(g, legGeo, WOOD_DARK, [-0.40, 0.33, 0.40]);
  addMesh(g, legGeo, WOOD_DARK, [0.40, 0.33, 0.40]);
  return g;
}

// ─── Sofa ──────────────────────────
function createSofa() {
  const g = new THREE.Group();
  // Base frame
  const baseGeo = new THREE.BoxGeometry(1.6, 0.12, 0.75);
  addMesh(g, baseGeo, WOOD_DARK, [0, 0.16, 0]);
  // Seat cushions (2)
  const cushGeo = new THREE.BoxGeometry(0.72, 0.14, 0.62);
  addMesh(g, cushGeo, FABRIC_RED, [-0.38, 0.35, 0.04]);
  addMesh(g, cushGeo, FABRIC_RED, [0.38, 0.35, 0.04]);
  // Back
  const backGeo = new THREE.BoxGeometry(1.52, 0.42, 0.14);
  addMesh(g, backGeo, FABRIC_RED, [0, 0.56, -0.30]);
  // Armrests
  const armGeo = new THREE.BoxGeometry(0.12, 0.28, 0.65);
  addMesh(g, armGeo, FABRIC_RED, [-0.76, 0.42, 0.02]);
  addMesh(g, armGeo, FABRIC_RED, [0.76, 0.42, 0.02]);
  // Pillow
  const pillowGeo = new THREE.SphereGeometry(0.12, 12, 8);
  pillowGeo.scale(1, 0.6, 1.2);
  addMesh(g, pillowGeo, FABRIC_BLUE, [-0.55, 0.52, -0.15]);
  // Feet
  const footGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.10, 8);
  addMesh(g, footGeo, WOOD_DARK, [-0.65, 0.05, 0.28]);
  addMesh(g, footGeo, WOOD_DARK, [0.65, 0.05, 0.28]);
  addMesh(g, footGeo, WOOD_DARK, [-0.65, 0.05, -0.28]);
  addMesh(g, footGeo, WOOD_DARK, [0.65, 0.05, -0.28]);
  return g;
}

// ─── Counter ───────────────────────
function createCounter() {
  const g = new THREE.Group();
  // Top surface
  const topGeo = new THREE.BoxGeometry(1.5, 0.04, 0.6);
  addMesh(g, topGeo, CREAM, [0, 0.92, 0]);
  // Front panel
  const frontGeo = new THREE.BoxGeometry(1.46, 0.58, 0.04);
  addMesh(g, frontGeo, WOOD, [0, 0.62, 0.28]);
  // Sides
  const sideGeo = new THREE.BoxGeometry(0.04, 0.58, 0.56);
  addMesh(g, sideGeo, WOOD, [-0.73, 0.62, 0]);
  addMesh(g, sideGeo, WOOD, [0.73, 0.62, 0]);
  // Shelf
  const shelfGeo = new THREE.BoxGeometry(1.42, 0.02, 0.52);
  addMesh(g, shelfGeo, WOOD_LIGHT, [0, 0.45, 0]);
  // Back
  const backGeo = new THREE.BoxGeometry(1.46, 0.58, 0.02);
  addMesh(g, backGeo, WOOD_DARK, [0, 0.62, -0.29]);
  // Base
  const baseGeo = new THREE.BoxGeometry(1.46, 0.04, 0.56);
  addMesh(g, baseGeo, WOOD_DARK, [0, 0.33, 0]);
  return g;
}

// ─── Stool ─────────────────────────
function createStool() {
  const g = new THREE.Group();
  // Seat (round)
  const seatGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16);
  addMesh(g, seatGeo, METAL_SILVER, [0, 0.72, 0]);
  // Cushion
  const cushGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.03, 16);
  addMesh(g, cushGeo, FABRIC_RED, [0, 0.755, 0]);
  // Pole
  const poleGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.55, 8);
  addMesh(g, poleGeo, METAL_DARK, [0, 0.42, 0]);
  // Footrest ring
  const ringGeo = new THREE.TorusGeometry(0.18, 0.012, 8, 24);
  addMesh(g, ringGeo, METAL_SILVER, [0, 0.30, 0], [Math.PI / 2, 0, 0]);
  // Base legs (4)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const legGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.30, 6);
    const leg = addMesh(g, legGeo, METAL_DARK, [Math.cos(angle) * 0.15, 0.08, Math.sin(angle) * 0.15]);
    leg.rotation.set(0, 0, Math.cos(angle) * 0.2);
  }
  return g;
}

// ─── Shelf ─────────────────────────
function createShelf() {
  const g = new THREE.Group();
  // Frame sides
  const sideGeo = new THREE.BoxGeometry(0.03, 1.2, 0.35);
  addMesh(g, sideGeo, WOOD_DARK, [-0.42, 0.60, 0]);
  addMesh(g, sideGeo, WOOD_DARK, [0.42, 0.60, 0]);
  // Shelves (4)
  const shelfGeo = new THREE.BoxGeometry(0.84, 0.02, 0.34);
  for (let i = 0; i < 4; i++) {
    addMesh(g, shelfGeo, WOOD_LIGHT, [0, 0.05 + i * 0.38, 0]);
  }
  // Books on shelves
  const bookColors = [FABRIC_RED, FABRIC_BLUE, GREEN_DARK, WOOD];
  for (let shelf = 0; shelf < 3; shelf++) {
    let x = -0.35;
    for (let b = 0; b < 8; b++) {
      const h = 0.12 + Math.random() * 0.15;
      const w = 0.03 + Math.random() * 0.04;
      const bookGeo = new THREE.BoxGeometry(w, h, 0.22);
      addMesh(g, bookGeo, bookColors[b % 4], [x, 0.12 + shelf * 0.38 + h / 2, 0]);
      x += w + 0.01;
      if (x > 0.35) break;
    }
  }
  return g;
}

// ─── Plant ─────────────────────────
function createPlant() {
  const g = new THREE.Group();
  // Pot
  const potGeo = new THREE.CylinderGeometry(0.12, 0.09, 0.18, 12);
  addMesh(g, potGeo, TERRACOTTA, [0, 0.09, 0]);
  // Pot rim
  const rimGeo = new THREE.TorusGeometry(0.125, 0.015, 8, 16);
  addMesh(g, rimGeo, TERRACOTTA, [0, 0.18, 0], [Math.PI / 2, 0, 0]);
  // Soil
  const soilGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.02, 12);
  addMesh(g, soilGeo, WOOD_DARK, [0, 0.185, 0]);
  // Stem
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.015, 0.25, 6);
  addMesh(g, stemGeo, GREEN_DARK, [0, 0.32, 0]);
  // Leaf clusters (spheres)
  const leafPositions = [
    [0, 0.52, 0], [-0.1, 0.48, 0.08], [0.1, 0.48, -0.06],
    [0.05, 0.55, 0.05], [-0.06, 0.53, -0.08], [0.08, 0.42, 0.1],
    [-0.08, 0.45, 0.06], [0.02, 0.58, -0.04],
  ];
  for (const pos of leafPositions) {
    const size = 0.06 + Math.random() * 0.04;
    const leafGeo = new THREE.SphereGeometry(size, 8, 6);
    leafGeo.scale(1.3, 0.8, 1.1);
    addMesh(g, leafGeo, Math.random() > 0.5 ? GREEN_LEAF : GREEN_DARK, pos);
  }
  return g;
}

// ─── Desk ──────────────────────────
function createDesk() {
  const g = new THREE.Group();
  // Top
  const topGeo = new THREE.BoxGeometry(1.2, 0.03, 0.6);
  addMesh(g, topGeo, WOOD_LIGHT, [0, 0.74, 0]);
  // Drawer unit (right side)
  const drawerGeo = new THREE.BoxGeometry(0.40, 0.30, 0.55);
  addMesh(g, drawerGeo, WOOD, [0.38, 0.56, 0]);
  // Drawer handles
  const handleGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6);
  addMesh(g, handleGeo, METAL_SILVER, [0.38, 0.62, 0.28], [0, 0, Math.PI / 2]);
  addMesh(g, handleGeo, METAL_SILVER, [0.38, 0.50, 0.28], [0, 0, Math.PI / 2]);
  // Legs (left side)
  const legGeo = new THREE.BoxGeometry(0.04, 0.72, 0.04);
  addMesh(g, legGeo, METAL_DARK, [-0.56, 0.36, -0.26]);
  addMesh(g, legGeo, METAL_DARK, [-0.56, 0.36, 0.26]);
  // Cross support
  const crossGeo = new THREE.BoxGeometry(0.04, 0.04, 0.52);
  addMesh(g, crossGeo, METAL_DARK, [-0.56, 0.15, 0]);
  return g;
}

// ─── Bench ─────────────────────────
function createBench() {
  const g = new THREE.Group();
  // Seat
  const seatGeo = new THREE.BoxGeometry(1.2, 0.04, 0.35);
  addMesh(g, seatGeo, WOOD, [0, 0.44, 0]);
  // Legs (A-frame style)
  const legGeo = new THREE.BoxGeometry(0.04, 0.43, 0.30);
  addMesh(g, legGeo, WOOD_DARK, [-0.48, 0.215, 0]);
  addMesh(g, legGeo, WOOD_DARK, [0.48, 0.215, 0]);
  // Support bar
  const barGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.96, 6);
  addMesh(g, barGeo, METAL_DARK, [0, 0.15, 0], [0, 0, Math.PI / 2]);
  return g;
}

// ─── Bookcase ──────────────────────
function createBookcase() {
  const g = new THREE.Group();
  // Frame
  const sideGeo = new THREE.BoxGeometry(0.03, 1.8, 0.35);
  addMesh(g, sideGeo, WOOD_DARK, [-0.44, 0.90, 0]);
  addMesh(g, sideGeo, WOOD_DARK, [0.44, 0.90, 0]);
  // Top
  const topGeo = new THREE.BoxGeometry(0.91, 0.03, 0.35);
  addMesh(g, topGeo, WOOD_DARK, [0, 1.80, 0]);
  // Shelves (5)
  const shelfGeo = new THREE.BoxGeometry(0.88, 0.02, 0.34);
  for (let i = 0; i < 5; i++) {
    addMesh(g, shelfGeo, WOOD_LIGHT, [0, 0.02 + i * 0.355, 0]);
  }
  // Back panel
  const backGeo = new THREE.BoxGeometry(0.88, 1.76, 0.01);
  addMesh(g, backGeo, WOOD, [0, 0.90, -0.17]);
  // Books
  const bookMats = [FABRIC_RED, FABRIC_BLUE, GREEN_DARK, WOOD, CREAM];
  for (let shelf = 0; shelf < 4; shelf++) {
    let x = -0.38;
    for (let b = 0; b < 10; b++) {
      const h = 0.15 + Math.random() * 0.14;
      const w = 0.025 + Math.random() * 0.03;
      const bookGeo = new THREE.BoxGeometry(w, h, 0.24);
      addMesh(g, bookGeo, bookMats[b % 5], [x, 0.08 + shelf * 0.355 + h / 2, 0]);
      x += w + 0.008;
      if (x > 0.38) break;
    }
  }
  return g;
}

// ─── Export ────────────────────────
const models = {
  chair: createChair,
  table_square: createTableSquare,
  sofa: createSofa,
  counter: createCounter,
  stool: createStool,
  shelf: createShelf,
  plant: createPlant,
  desk: createDesk,
  bench: createBench,
  bookcase: createBookcase,
};

const exporter = new GLTFExporter();

// Polyfill for Node.js (Three.js GLTFExporter uses browser APIs)
import { Blob as NodeBlob } from 'buffer';
if (typeof globalThis.Blob === 'undefined') globalThis.Blob = NodeBlob;
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() { this.result = null; this.onload = null; }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab;
        if (this.onload) this.onload({ target: this });
      });
    }
    readAsDataURL() { if (this.onload) this.onload({ target: this }); }
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElementNS: () => ({ getContext: () => null }) };
}

async function exportModel(name, createFn) {
  const scene = new THREE.Scene();
  const group = createFn();
  scene.add(group);

  return new Promise((resolve, reject) => {
    exporter.parse(scene, (result) => {
      const output = Buffer.from(result);
      const path = join(OUTPUT_DIR, `${name}.glb`);
      writeFileSync(path, output);
      console.log(`✓ ${name}.glb (${(output.length / 1024).toFixed(1)}KB)`);
      resolve();
    }, (error) => reject(error), { binary: true });
  });
}

async function main() {
  console.log('Generating GLB furniture models...\n');
  for (const [name, fn] of Object.entries(models)) {
    await exportModel(name, fn);
  }
  console.log(`\nDone! ${Object.keys(models).length} models saved to public/models/`);
}
main().catch(console.error);
