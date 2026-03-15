/**
 * Minimal GLB generator using raw binary format (no Three.js GLTFExporter needed)
 * Generates simple but properly proportioned furniture as GLB files
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'models');
mkdirSync(OUT, { recursive: true });

// Build a minimal valid glTF JSON + binary buffer, then pack as GLB
function buildGLB(meshes) {
  // meshes: [{positions: Float32Array, indices: Uint16Array, color: [r,g,b], name: string}]
  const gltf = {
    asset: { version: '2.0', generator: 'porano-gen' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    accessors: [],
    bufferViews: [],
    materials: [],
    buffers: [{ byteLength: 0 }],
  };

  let totalBytes = 0;
  const bufferParts = [];

  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    const positions = m.positions;
    const indices = m.indices;
    const normals = computeNormals(positions, indices);

    // Material
    const matIdx = gltf.materials.length;
    gltf.materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: [...m.color, 1.0],
        metallicFactor: m.metallic || 0.0,
        roughnessFactor: m.roughness || 0.6,
      },
      name: m.name + '_mat',
    });

    // Indices buffer view
    const indBuf = Buffer.from(indices.buffer);
    const indOffset = totalBytes;
    bufferParts.push(indBuf);
    totalBytes += indBuf.byteLength;
    // Pad to 4 bytes
    const indPad = (4 - (totalBytes % 4)) % 4;
    if (indPad) { bufferParts.push(Buffer.alloc(indPad)); totalBytes += indPad; }

    const indBVIdx = gltf.bufferViews.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset: indOffset, byteLength: indBuf.byteLength, target: 34963 });

    // Positions buffer view
    const posBuf = Buffer.from(positions.buffer);
    const posOffset = totalBytes;
    bufferParts.push(posBuf);
    totalBytes += posBuf.byteLength;
    const posPad = (4 - (totalBytes % 4)) % 4;
    if (posPad) { bufferParts.push(Buffer.alloc(posPad)); totalBytes += posPad; }

    const posBVIdx = gltf.bufferViews.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset: posOffset, byteLength: posBuf.byteLength, target: 34962, byteStride: 12 });

    // Normals buffer view
    const normBuf = Buffer.from(normals.buffer);
    const normOffset = totalBytes;
    bufferParts.push(normBuf);
    totalBytes += normBuf.byteLength;
    const normPad = (4 - (totalBytes % 4)) % 4;
    if (normPad) { bufferParts.push(Buffer.alloc(normPad)); totalBytes += normPad; }

    const normBVIdx = gltf.bufferViews.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset: normOffset, byteLength: normBuf.byteLength, target: 34962, byteStride: 12 });

    // Compute bounds
    let minP = [Infinity, Infinity, Infinity], maxP = [-Infinity, -Infinity, -Infinity];
    for (let j = 0; j < positions.length; j += 3) {
      for (let k = 0; k < 3; k++) {
        minP[k] = Math.min(minP[k], positions[j + k]);
        maxP[k] = Math.max(maxP[k], positions[j + k]);
      }
    }

    // Accessors
    const indAccIdx = gltf.accessors.length;
    gltf.accessors.push({ bufferView: indBVIdx, componentType: 5123, count: indices.length, type: 'SCALAR', max: [Math.max(...indices)], min: [0] });
    const posAccIdx = gltf.accessors.length;
    gltf.accessors.push({ bufferView: posBVIdx, componentType: 5126, count: positions.length / 3, type: 'VEC3', max: maxP, min: minP });
    const normAccIdx = gltf.accessors.length;
    gltf.accessors.push({ bufferView: normBVIdx, componentType: 5126, count: normals.length / 3, type: 'VEC3' });

    // Mesh
    const meshIdx = gltf.meshes.length;
    gltf.meshes.push({
      primitives: [{ attributes: { POSITION: posAccIdx, NORMAL: normAccIdx }, indices: indAccIdx, material: matIdx }],
      name: m.name,
    });

    // Node
    const nodeIdx = gltf.nodes.length;
    gltf.nodes.push({ mesh: meshIdx, name: m.name });
    gltf.scenes[0].nodes.push(nodeIdx);
  }

  gltf.buffers[0].byteLength = totalBytes;

  // Pack GLB
  const jsonStr = JSON.stringify(gltf);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBuf.byteLength % 4)) % 4;
  const jsonChunkLen = jsonBuf.byteLength + jsonPad;

  const binBuf = Buffer.concat(bufferParts);
  const binPad = (4 - (binBuf.byteLength % 4)) % 4;
  const binChunkLen = binBuf.byteLength + binPad;

  const totalLen = 12 + 8 + jsonChunkLen + 8 + binChunkLen;
  const out = Buffer.alloc(totalLen);
  let off = 0;

  // Header
  out.writeUInt32LE(0x46546C67, off); off += 4; // 'glTF'
  out.writeUInt32LE(2, off); off += 4;
  out.writeUInt32LE(totalLen, off); off += 4;

  // JSON chunk
  out.writeUInt32LE(jsonChunkLen, off); off += 4;
  out.writeUInt32LE(0x4E4F534A, off); off += 4; // 'JSON'
  jsonBuf.copy(out, off); off += jsonBuf.byteLength;
  for (let i = 0; i < jsonPad; i++) out[off++] = 0x20; // space pad

  // BIN chunk
  out.writeUInt32LE(binChunkLen, off); off += 4;
  out.writeUInt32LE(0x004E4942, off); off += 4; // 'BIN\0'
  binBuf.copy(out, off); off += binBuf.byteLength;
  for (let i = 0; i < binPad; i++) out[off++] = 0;

  return out;
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3, i1 = indices[i+1] * 3, i2 = indices[i+2] * 3;
    const ax = positions[i1] - positions[i0], ay = positions[i1+1] - positions[i0+1], az = positions[i1+2] - positions[i0+2];
    const bx = positions[i2] - positions[i0], by = positions[i2+1] - positions[i0+1], bz = positions[i2+2] - positions[i0+2];
    const nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    for (const idx of [i0, i1, i2]) {
      normals[idx] += nx/len; normals[idx+1] += ny/len; normals[idx+2] += nz/len;
    }
  }
  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(normals[i]**2 + normals[i+1]**2 + normals[i+2]**2) || 1;
    normals[i] /= len; normals[i+1] /= len; normals[i+2] /= len;
  }
  return normals;
}

// Box helper
function box(sx, sy, sz, ox=0, oy=0, oz=0) {
  const hx=sx/2, hy=sy/2, hz=sz/2;
  const p = new Float32Array([
    ox-hx,oy-hy,oz+hz, ox+hx,oy-hy,oz+hz, ox+hx,oy+hy,oz+hz, ox-hx,oy+hy,oz+hz, // front
    ox+hx,oy-hy,oz-hz, ox-hx,oy-hy,oz-hz, ox-hx,oy+hy,oz-hz, ox+hx,oy+hy,oz-hz, // back
    ox-hx,oy+hy,oz+hz, ox+hx,oy+hy,oz+hz, ox+hx,oy+hy,oz-hz, ox-hx,oy+hy,oz-hz, // top
    ox-hx,oy-hy,oz-hz, ox+hx,oy-hy,oz-hz, ox+hx,oy-hy,oz+hz, ox-hx,oy-hy,oz+hz, // bottom
    ox+hx,oy-hy,oz+hz, ox+hx,oy-hy,oz-hz, ox+hx,oy+hy,oz-hz, ox+hx,oy+hy,oz+hz, // right
    ox-hx,oy-hy,oz-hz, ox-hx,oy-hy,oz+hz, ox-hx,oy+hy,oz+hz, ox-hx,oy+hy,oz-hz, // left
  ]);
  const idx = new Uint16Array([
    0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11,
    12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23
  ]);
  return { positions: p, indices: idx };
}

// Cylinder helper (simplified)
function cyl(rTop, rBot, h, segs=8, ox=0, oy=0, oz=0) {
  const pos = [], ind = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i/segs)*Math.PI*2;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(ox+c*rTop, oy+h/2, oz+s*rTop); // top ring
    pos.push(ox+c*rBot, oy-h/2, oz+s*rBot); // bot ring
  }
  for (let i = 0; i < segs; i++) {
    const t0=i*2, t1=i*2+1, t2=i*2+2, t3=i*2+3;
    ind.push(t0,t2,t1, t1,t2,t3);
  }
  // Top cap center
  const tc = pos.length/3;
  pos.push(ox, oy+h/2, oz);
  for (let i = 0; i < segs; i++) ind.push(tc, i*2, ((i+1)%segs)*2 || (segs*2));
  // Bot cap center
  const bc = pos.length/3;
  pos.push(ox, oy-h/2, oz);
  for (let i = 0; i < segs; i++) ind.push(bc, ((i+1)%segs)*2+1 || (segs*2+1), i*2+1);

  return { positions: new Float32Array(pos), indices: new Uint16Array(ind) };
}

function merge(parts) {
  let totalP = 0, totalI = 0;
  for (const p of parts) { totalP += p.positions.length; totalI += p.indices.length; }
  const positions = new Float32Array(totalP);
  const indices = new Uint16Array(totalI);
  let pOff = 0, iOff = 0, vOff = 0;
  for (const p of parts) {
    positions.set(p.positions, pOff);
    for (let i = 0; i < p.indices.length; i++) indices[iOff + i] = p.indices[i] + vOff;
    vOff += p.positions.length / 3;
    pOff += p.positions.length;
    iOff += p.indices.length;
  }
  return { positions, indices };
}

// ─── Furniture definitions ──────────
const W = [0.545, 0.412, 0.078]; // wood
const WD = [0.361, 0.227, 0.118]; // dark wood
const WL = [0.769, 0.627, 0.416]; // light wood
const FR = [0.722, 0.282, 0.282]; // fabric red
const FB = [0.345, 0.498, 0.627]; // fabric blue
const MS = [0.690, 0.690, 0.722]; // metal silver
const MD = [0.251, 0.251, 0.282]; // metal dark
const GL = [0.239, 0.478, 0.239]; // green leaf
const TC = [0.722, 0.361, 0.220]; // terracotta
const CR = [0.941, 0.910, 0.816]; // cream

const furniture = {
  chair: () => {
    const parts = [
      { ...box(0.42, 0.035, 0.40, 0, 0.46, 0), color: W, name: 'seat' },
      { ...box(0.38, 0.04, 0.36, 0, 0.50, 0), color: FR, name: 'cushion', roughness: 0.85 },
      { ...box(0.42, 0.38, 0.025, 0, 0.68, -0.19), color: W, name: 'back' },
      { ...cyl(0.015, 0.018, 0.45, 6, -0.17, 0.225, -0.17), color: WD, name: 'leg1' },
      { ...cyl(0.015, 0.018, 0.45, 6, 0.17, 0.225, -0.17), color: WD, name: 'leg2' },
      { ...cyl(0.015, 0.018, 0.45, 6, -0.17, 0.225, 0.17), color: WD, name: 'leg3' },
      { ...cyl(0.015, 0.018, 0.45, 6, 0.17, 0.225, 0.17), color: WD, name: 'leg4' },
    ];
    return parts.map(p => ({ ...merge([p]), color: p.color, name: p.name, roughness: p.roughness }));
  },
  table_square: () => [
    { ...merge([box(0.9, 0.04, 0.9, 0, 0.74, 0)]), color: WL, name: 'top' },
    { ...merge([box(0.05, 0.66, 0.05, -0.40, 0.33, -0.40), box(0.05, 0.66, 0.05, 0.40, 0.33, -0.40), box(0.05, 0.66, 0.05, -0.40, 0.33, 0.40), box(0.05, 0.66, 0.05, 0.40, 0.33, 0.40)]), color: WD, name: 'legs' },
    { ...merge([box(0.82, 0.06, 0.03, 0, 0.69, 0.42), box(0.82, 0.06, 0.03, 0, 0.69, -0.42), box(0.03, 0.06, 0.82, 0.42, 0.69, 0), box(0.03, 0.06, 0.82, -0.42, 0.69, 0)]), color: W, name: 'apron' },
  ],
  sofa: () => [
    { ...merge([box(1.6, 0.12, 0.75, 0, 0.16, 0)]), color: WD, name: 'frame' },
    { ...merge([box(0.72, 0.14, 0.62, -0.38, 0.35, 0.04), box(0.72, 0.14, 0.62, 0.38, 0.35, 0.04)]), color: FR, name: 'cushions', roughness: 0.85 },
    { ...merge([box(1.52, 0.42, 0.14, 0, 0.56, -0.30)]), color: FR, name: 'back', roughness: 0.85 },
    { ...merge([box(0.12, 0.28, 0.65, -0.76, 0.42, 0.02), box(0.12, 0.28, 0.65, 0.76, 0.42, 0.02)]), color: FR, name: 'arms', roughness: 0.85 },
    { ...merge([box(0.20, 0.12, 0.20, -0.55, 0.52, -0.15)]), color: FB, name: 'pillow', roughness: 0.9 },
  ],
  counter: () => [
    { ...merge([box(1.5, 0.04, 0.6, 0, 0.92, 0)]), color: CR, name: 'top' },
    { ...merge([box(1.46, 0.58, 0.04, 0, 0.62, 0.28), box(0.04, 0.58, 0.56, -0.73, 0.62, 0), box(0.04, 0.58, 0.56, 0.73, 0.62, 0), box(1.46, 0.58, 0.02, 0, 0.62, -0.29)]), color: W, name: 'body' },
    { ...merge([box(1.42, 0.02, 0.52, 0, 0.45, 0)]), color: WL, name: 'shelf' },
  ],
  stool: () => [
    { ...merge([cyl(0.16, 0.16, 0.04, 12, 0, 0.72, 0)]), color: MS, name: 'seat', metallic: 0.7 },
    { ...merge([cyl(0.14, 0.14, 0.03, 12, 0, 0.755, 0)]), color: FR, name: 'cushion', roughness: 0.85 },
    { ...merge([cyl(0.02, 0.025, 0.55, 6, 0, 0.42, 0)]), color: MD, name: 'pole', metallic: 0.7 },
    { ...merge([cyl(0.20, 0.22, 0.03, 12, 0, 0.05, 0)]), color: MD, name: 'base', metallic: 0.7 },
  ],
  shelf: () => [
    { ...merge([box(0.03, 1.2, 0.35, -0.42, 0.60, 0), box(0.03, 1.2, 0.35, 0.42, 0.60, 0)]), color: WD, name: 'sides' },
    { ...merge([box(0.84, 0.02, 0.34, 0, 0.05, 0), box(0.84, 0.02, 0.34, 0, 0.43, 0), box(0.84, 0.02, 0.34, 0, 0.81, 0), box(0.84, 0.02, 0.34, 0, 1.19, 0)]), color: WL, name: 'shelves' },
  ],
  plant: () => [
    { ...merge([cyl(0.12, 0.09, 0.18, 10, 0, 0.09, 0)]), color: TC, name: 'pot' },
    { ...merge([cyl(0.012, 0.015, 0.25, 5, 0, 0.32, 0)]), color: [0.165, 0.353, 0.165], name: 'stem' },
    { ...merge([box(0.22, 0.18, 0.20, 0, 0.52, 0), box(0.18, 0.16, 0.22, -0.08, 0.48, 0.06), box(0.18, 0.14, 0.18, 0.06, 0.46, -0.05)]), color: GL, name: 'leaves' },
  ],
  desk: () => [
    { ...merge([box(1.2, 0.03, 0.6, 0, 0.74, 0)]), color: WL, name: 'top' },
    { ...merge([box(0.40, 0.30, 0.55, 0.38, 0.56, 0)]), color: W, name: 'drawers' },
    { ...merge([box(0.04, 0.72, 0.04, -0.56, 0.36, -0.26), box(0.04, 0.72, 0.04, -0.56, 0.36, 0.26)]), color: MD, name: 'legs', metallic: 0.5 },
  ],
  bench: () => [
    { ...merge([box(1.2, 0.04, 0.35, 0, 0.44, 0)]), color: W, name: 'seat' },
    { ...merge([box(0.04, 0.43, 0.30, -0.48, 0.215, 0), box(0.04, 0.43, 0.30, 0.48, 0.215, 0)]), color: WD, name: 'legs' },
  ],
  bookcase: () => [
    { ...merge([box(0.03, 1.8, 0.35, -0.44, 0.90, 0), box(0.03, 1.8, 0.35, 0.44, 0.90, 0), box(0.91, 0.03, 0.35, 0, 1.80, 0), box(0.88, 1.76, 0.01, 0, 0.90, -0.17)]), color: WD, name: 'frame' },
    { ...merge([box(0.88, 0.02, 0.34, 0, 0.02, 0), box(0.88, 0.02, 0.34, 0, 0.38, 0), box(0.88, 0.02, 0.34, 0, 0.74, 0), box(0.88, 0.02, 0.34, 0, 1.10, 0), box(0.88, 0.02, 0.34, 0, 1.46, 0)]), color: WL, name: 'shelves' },
  ],
  // ─── Additional furniture types ───
  table_round: () => [
    { ...merge([cyl(0.40, 0.40, 0.04, 12, 0, 0.74, 0)]), color: WL, name: 'top' },
    { ...merge([cyl(0.04, 0.06, 0.68, 8, 0, 0.37, 0)]), color: WD, name: 'pedestal' },
    { ...merge([cyl(0.22, 0.24, 0.03, 10, 0, 0.015, 0)]), color: WD, name: 'base' },
  ],
  pendant_light: () => [
    { ...merge([cyl(0.005, 0.005, 0.30, 4, 0, 0.85, 0)]), color: MD, name: 'chain', metallic: 0.8 },
    { ...merge([cyl(0.02, 0.18, 0.15, 10, 0, 0.62, 0)]), color: [0.9, 0.8, 0.3], name: 'shade' },
  ],
  partition: () => [
    { ...merge([box(1.5, 1.8, 0.05, 0, 0.90, 0)]), color: CR, name: 'panel' },
    { ...merge([box(1.54, 0.03, 0.08, 0, 1.80, 0), box(1.54, 0.03, 0.08, 0, 0.01, 0)]), color: WD, name: 'frame' },
    { ...merge([box(0.04, 1.8, 0.30, -0.72, 0.90, 0), box(0.04, 1.8, 0.30, 0.72, 0.90, 0)]), color: WD, name: 'legs' },
  ],
  register: () => [
    { ...merge([box(0.5, 0.08, 0.4, 0, 0.32, 0)]), color: MD, name: 'body', metallic: 0.5 },
    { ...merge([box(0.35, 0.22, 0.02, 0, 0.50, -0.10)]), color: [0.2, 0.3, 0.5], name: 'screen' },
    { ...merge([box(0.40, 0.04, 0.30, 0, 0.22, 0)]), color: MD, name: 'base', metallic: 0.5 },
  ],
  sink: () => [
    { ...merge([box(0.6, 0.04, 0.5, 0, 0.85, 0)]), color: MS, name: 'rim', metallic: 0.8 },
    { ...merge([box(0.50, 0.15, 0.40, 0, 0.76, 0)]), color: [0.9, 0.9, 0.95], name: 'basin' },
    { ...merge([box(0.58, 0.50, 0.48, 0, 0.42, 0)]), color: CR, name: 'cabinet' },
  ],
  fridge: () => [
    { ...merge([box(0.65, 1.7, 0.65, 0, 0.85, 0)]), color: MS, name: 'body', metallic: 0.6 },
    { ...merge([box(0.04, 0.12, 0.04, 0.30, 1.20, 0.34)]), color: MD, name: 'handle', metallic: 0.8 },
    { ...merge([box(0.60, 0.02, 0.60, 0, 0.60, 0)]), color: MD, name: 'divider' },
  ],
  refrigerator: () => [
    { ...merge([box(0.75, 1.8, 0.70, 0, 0.90, 0)]), color: MS, name: 'body', metallic: 0.6 },
    { ...merge([box(0.04, 0.14, 0.04, 0.34, 1.30, 0.37)]), color: MD, name: 'handle', metallic: 0.8 },
  ],
  display_case: () => [
    { ...merge([box(1.0, 0.04, 0.5, 0, 0.90, 0), box(1.0, 0.04, 0.5, 0, 0.02, 0)]), color: WD, name: 'frame' },
    { ...merge([box(0.96, 0.84, 0.02, 0, 0.46, 0.24), box(0.96, 0.84, 0.02, 0, 0.46, -0.24), box(0.02, 0.84, 0.48, 0.49, 0.46, 0), box(0.02, 0.84, 0.48, -0.49, 0.46, 0)]), color: [0.7, 0.85, 0.9], name: 'glass' },
  ],
  showcase: () => [
    { ...merge([box(1.0, 0.04, 0.5, 0, 0.90, 0), box(1.0, 0.04, 0.5, 0, 0.02, 0)]), color: WD, name: 'frame' },
    { ...merge([box(0.96, 0.84, 0.02, 0, 0.46, 0.24), box(0.02, 0.84, 0.48, 0.49, 0.46, 0)]), color: [0.7, 0.85, 0.9], name: 'glass' },
  ],
  mirror: () => [
    { ...merge([box(0.60, 0.80, 0.03, 0, 0.80, 0)]), color: [0.85, 0.88, 0.92], name: 'mirror', metallic: 0.9 },
    { ...merge([box(0.66, 0.86, 0.02, 0, 0.80, -0.02)]), color: WD, name: 'frame' },
  ],
  reception_desk: () => [
    { ...merge([box(1.8, 0.04, 0.7, 0, 0.92, 0)]), color: CR, name: 'top' },
    { ...merge([box(1.76, 0.60, 0.04, 0, 0.61, 0.33), box(0.04, 0.60, 0.66, -0.88, 0.61, 0), box(0.04, 0.60, 0.66, 0.88, 0.61, 0)]), color: W, name: 'body' },
    { ...merge([box(0.80, 0.60, 0.04, 0.48, 0.61, -0.33)]), color: W, name: 'return' },
  ],
  tv_monitor: () => [
    { ...merge([box(0.80, 0.50, 0.03, 0, 0.65, 0)]), color: MD, name: 'screen', metallic: 0.3 },
    { ...merge([box(0.08, 0.20, 0.08, 0, 0.10, 0)]), color: MD, name: 'stand', metallic: 0.5 },
    { ...merge([box(0.30, 0.02, 0.20, 0, 0.01, 0)]), color: MD, name: 'base', metallic: 0.5 },
  ],
  washing_machine: () => [
    { ...merge([box(0.60, 0.85, 0.60, 0, 0.425, 0)]), color: [0.95, 0.95, 0.95], name: 'body' },
    { ...merge([cyl(0.20, 0.20, 0.02, 10, 0, 0.45, 0.30)]), color: [0.7, 0.8, 0.85], name: 'door' },
  ],
  coat_rack: () => [
    { ...merge([cyl(0.02, 0.025, 1.50, 6, 0, 0.75, 0)]), color: WD, name: 'pole' },
    { ...merge([cyl(0.20, 0.22, 0.03, 8, 0, 0.015, 0)]), color: WD, name: 'base' },
    { ...merge([box(0.30, 0.02, 0.02, 0, 1.45, 0), box(0.02, 0.02, 0.20, 0, 1.45, 0)]), color: MD, name: 'hooks', metallic: 0.6 },
  ],
  air_conditioner: () => [
    { ...merge([box(0.80, 0.28, 0.22, 0, 0.14, 0)]), color: [0.95, 0.95, 0.95], name: 'body' },
    { ...merge([box(0.74, 0.04, 0.18, 0, -0.02, 0.02)]), color: [0.90, 0.90, 0.90], name: 'vent' },
  ],
  bar_table: () => [
    { ...merge([box(0.60, 0.03, 0.60, 0, 1.05, 0)]), color: WL, name: 'top' },
    { ...merge([cyl(0.03, 0.04, 1.0, 6, 0, 0.52, 0)]), color: MD, name: 'pole', metallic: 0.7 },
    { ...merge([cyl(0.22, 0.24, 0.03, 10, 0, 0.015, 0)]), color: MD, name: 'base', metallic: 0.7 },
  ],
  bar_stool: () => [
    { ...merge([cyl(0.16, 0.16, 0.04, 10, 0, 0.95, 0)]), color: MS, name: 'seat', metallic: 0.5 },
    { ...merge([cyl(0.02, 0.03, 0.80, 6, 0, 0.52, 0)]), color: MD, name: 'pole', metallic: 0.7 },
    { ...merge([cyl(0.22, 0.24, 0.03, 10, 0, 0.015, 0)]), color: MD, name: 'base', metallic: 0.7 },
  ],
  wardrobe: () => [
    { ...merge([box(0.90, 1.90, 0.55, 0, 0.95, 0)]), color: W, name: 'body' },
    { ...merge([box(0.02, 1.80, 0.01, 0, 0.95, 0.28)]), color: WD, name: 'divider' },
    { ...merge([box(0.04, 0.10, 0.04, -0.20, 0.95, 0.30), box(0.04, 0.10, 0.04, 0.20, 0.95, 0.30)]), color: MS, name: 'handles', metallic: 0.7 },
  ],
  shoe_rack: () => [
    { ...merge([box(0.80, 0.03, 0.30, 0, 0.01, 0), box(0.80, 0.03, 0.30, 0, 0.20, 0), box(0.80, 0.03, 0.30, 0, 0.39, 0)]), color: WL, name: 'shelves' },
    { ...merge([box(0.03, 0.40, 0.30, -0.38, 0.20, 0), box(0.03, 0.40, 0.30, 0.38, 0.20, 0)]), color: WD, name: 'sides' },
  ],
  umbrella_stand: () => [
    { ...merge([cyl(0.12, 0.10, 0.40, 10, 0, 0.20, 0)]), color: MD, name: 'body', metallic: 0.6 },
    { ...merge([cyl(0.13, 0.13, 0.02, 10, 0, 0.40, 0)]), color: MD, name: 'rim', metallic: 0.6 },
  ],
  cash_register: () => [
    { ...merge([box(0.35, 0.10, 0.35, 0, 0.05, 0)]), color: MD, name: 'base', metallic: 0.3 },
    { ...merge([box(0.30, 0.20, 0.02, 0, 0.20, -0.10)]), color: [0.2, 0.3, 0.5], name: 'screen' },
    { ...merge([box(0.25, 0.02, 0.20, 0, 0.12, 0.05)]), color: [0.8, 0.8, 0.8], name: 'keypad' },
  ],
  register_counter: () => [
    { ...merge([box(1.2, 0.04, 0.6, 0, 0.92, 0)]), color: CR, name: 'top' },
    { ...merge([box(1.16, 0.58, 0.56, 0, 0.62, 0)]), color: W, name: 'body' },
    { ...merge([box(0.30, 0.20, 0.02, 0.30, 1.10, 0)]), color: MD, name: 'screen' },
  ],
  menu_board: () => [
    { ...merge([box(0.60, 0.80, 0.03, 0, 0.90, 0)]), color: [0.15, 0.25, 0.15], name: 'board' },
    { ...merge([box(0.64, 0.84, 0.02, 0, 0.90, -0.02)]), color: WD, name: 'frame' },
    { ...merge([box(0.03, 0.55, 0.30, -0.28, 0.28, -0.15), box(0.03, 0.55, 0.30, 0.28, 0.28, -0.15)]), color: WD, name: 'legs' },
  ],
  flower_pot: () => [
    { ...merge([cyl(0.10, 0.07, 0.14, 8, 0, 0.07, 0)]), color: TC, name: 'pot' },
    { ...merge([cyl(0.08, 0.08, 0.02, 8, 0, 0.14, 0)]), color: [0.3, 0.2, 0.1], name: 'soil' },
    { ...merge([box(0.12, 0.10, 0.12, 0, 0.22, 0)]), color: GL, name: 'flowers' },
  ],
  ceiling_fan: () => [
    { ...merge([cyl(0.06, 0.06, 0.08, 8, 0, 0.04, 0)]), color: MD, name: 'motor', metallic: 0.5 },
    { ...merge([box(0.50, 0.01, 0.08, 0, 0, 0), box(0.08, 0.01, 0.50, 0, 0, 0)]), color: WL, name: 'blades' },
  ],
  rug: () => [
    { ...merge([box(1.50, 0.01, 1.00, 0, 0.005, 0)]), color: FR, name: 'rug', roughness: 0.95 },
  ],
  curtain: () => [
    { ...merge([cyl(0.01, 0.01, 1.20, 4, 0, 1.40, 0)]), color: MS, name: 'rod', metallic: 0.7 },
    { ...merge([box(1.10, 1.30, 0.04, 0, 0.70, 0)]), color: FB, name: 'fabric', roughness: 0.9 },
  ],
  clock: () => [
    { ...merge([cyl(0.15, 0.15, 0.03, 12, 0, 0.015, 0)]), color: CR, name: 'face' },
    { ...merge([cyl(0.16, 0.16, 0.02, 12, 0, -0.005, 0)]), color: WD, name: 'frame' },
  ],
  trash_can: () => [
    { ...merge([cyl(0.14, 0.12, 0.35, 10, 0, 0.175, 0)]), color: MS, name: 'body', metallic: 0.5 },
    { ...merge([cyl(0.15, 0.15, 0.02, 10, 0, 0.36, 0)]), color: MD, name: 'lid', metallic: 0.5 },
  ],
  kitchen_island: () => [
    { ...merge([box(1.4, 0.05, 0.7, 0, 0.90, 0)]), color: CR, name: 'top' },
    { ...merge([box(1.36, 0.56, 0.66, 0, 0.61, 0)]), color: W, name: 'body' },
    { ...merge([box(1.32, 0.02, 0.62, 0, 0.45, 0)]), color: WL, name: 'shelf' },
  ],
  bed: () => [
    { ...merge([box(1.40, 0.30, 2.00, 0, 0.15, 0)]), color: WL, name: 'frame' },
    { ...merge([box(1.30, 0.18, 1.90, 0, 0.39, 0)]), color: [0.9, 0.9, 0.95], name: 'mattress' },
    { ...merge([box(1.40, 0.70, 0.05, 0, 0.50, -0.98)]), color: WD, name: 'headboard' },
    { ...merge([box(0.50, 0.10, 0.40, -0.30, 0.52, -0.70)]), color: [0.9, 0.9, 0.95], name: 'pillow' },
  ],
  toilet: () => [
    { ...merge([cyl(0.20, 0.18, 0.35, 10, 0, 0.175, 0)]), color: [0.95, 0.95, 0.95], name: 'bowl' },
    { ...merge([box(0.38, 0.45, 0.18, 0, 0.58, -0.12)]), color: [0.95, 0.95, 0.95], name: 'tank' },
    { ...merge([cyl(0.21, 0.21, 0.02, 10, 0, 0.36, 0)]), color: [0.95, 0.95, 0.95], name: 'lid' },
  ],
  armchair: () => [
    { ...merge([box(0.65, 0.04, 0.55, 0, 0.42, 0)]), color: W, name: 'seat_frame' },
    { ...merge([box(0.55, 0.08, 0.48, 0, 0.48, 0)]), color: FR, name: 'cushion', roughness: 0.85 },
    { ...merge([box(0.65, 0.45, 0.04, 0, 0.66, -0.26)]), color: FR, name: 'back', roughness: 0.85 },
    { ...merge([box(0.08, 0.25, 0.50, -0.32, 0.52, 0), box(0.08, 0.25, 0.50, 0.32, 0.52, 0)]), color: FR, name: 'arms', roughness: 0.85 },
    { ...merge([cyl(0.02, 0.025, 0.40, 6, -0.28, 0.20, -0.22), cyl(0.02, 0.025, 0.40, 6, 0.28, 0.20, -0.22), cyl(0.02, 0.025, 0.40, 6, -0.28, 0.20, 0.22), cyl(0.02, 0.025, 0.40, 6, 0.28, 0.20, 0.22)]), color: WD, name: 'legs' },
  ],
  washbasin: () => [
    { ...merge([box(0.50, 0.04, 0.40, 0, 0.80, 0)]), color: [0.95, 0.95, 0.95], name: 'top' },
    { ...merge([box(0.48, 0.50, 0.38, 0, 0.53, 0)]), color: CR, name: 'cabinet' },
    { ...merge([cyl(0.01, 0.01, 0.20, 4, 0, 0.92, -0.12)]), color: MS, name: 'faucet', metallic: 0.8 },
  ],
  stairs: () => [
    { ...merge([box(0.80, 0.18, 0.25, 0, 0.09, 0), box(0.80, 0.18, 0.25, 0, 0.27, 0.25), box(0.80, 0.18, 0.25, 0, 0.45, 0.50), box(0.80, 0.18, 0.25, 0, 0.63, 0.75)]), color: WL, name: 'steps' },
  ],
  hanger_rack: () => [
    { ...merge([cyl(0.01, 0.01, 1.00, 4, 0, 1.30, 0)]), color: MS, name: 'bar', metallic: 0.7 },
    { ...merge([cyl(0.02, 0.025, 1.30, 6, -0.45, 0.65, 0), cyl(0.02, 0.025, 1.30, 6, 0.45, 0.65, 0)]), color: MS, name: 'poles', metallic: 0.7 },
    { ...merge([cyl(0.20, 0.22, 0.03, 8, -0.45, 0.015, 0), cyl(0.20, 0.22, 0.03, 8, 0.45, 0.015, 0)]), color: MD, name: 'bases', metallic: 0.5 },
  ],
  // ─── 飲食店向け ───
  booth_sofa: () => [
    { ...merge([box(1.50, 0.12, 0.65, 0, 0.16, 0)]), color: WD, name: 'frame' },
    { ...merge([box(1.40, 0.14, 0.55, 0, 0.35, 0.03)]), color: [0.545, 0.271, 0.075], name: 'seat_cushion', roughness: 0.85 },
    { ...merge([box(1.42, 0.55, 0.10, 0, 0.62, -0.28)]), color: [0.545, 0.271, 0.075], name: 'back', roughness: 0.85 },
    { ...merge([box(0.10, 0.42, 0.60, -0.72, 0.48, 0), box(0.10, 0.42, 0.60, 0.72, 0.48, 0)]), color: [0.545, 0.271, 0.075], name: 'arms', roughness: 0.85 },
  ],
  bar_chair: () => [
    { ...merge([cyl(0.17, 0.17, 0.04, 10, 0, 0.90, 0)]), color: MD, name: 'seat', metallic: 0.5 },
    { ...merge([box(0.30, 0.02, 0.04, 0, 0.92, 0)]), color: FR, name: 'cushion', roughness: 0.85 },
    { ...merge([box(0.34, 0.25, 0.02, 0, 1.08, -0.16)]), color: MD, name: 'back', metallic: 0.5 },
    { ...merge([cyl(0.02, 0.025, 0.70, 6, 0, 0.52, 0)]), color: MD, name: 'pole', metallic: 0.7 },
    { ...merge([cyl(0.20, 0.22, 0.03, 10, 0, 0.015, 0)]), color: MD, name: 'base', metallic: 0.7 },
    { ...merge([cyl(0.01, 0.01, 0.12, 4, 0, 0.55, 0.12), cyl(0.01, 0.01, 0.12, 4, 0, 0.55, -0.12)]), color: MD, name: 'footrest', metallic: 0.6 },
  ],
  wine_rack: () => [
    { ...merge([box(0.03, 1.40, 0.30, -0.37, 0.70, 0), box(0.03, 1.40, 0.30, 0.37, 0.70, 0)]), color: WD, name: 'sides' },
    { ...merge([box(0.74, 0.02, 0.28, 0, 0.02, 0), box(0.74, 0.02, 0.28, 0, 0.30, 0), box(0.74, 0.02, 0.28, 0, 0.58, 0), box(0.74, 0.02, 0.28, 0, 0.86, 0), box(0.74, 0.02, 0.28, 0, 1.14, 0), box(0.74, 0.02, 0.28, 0, 1.40, 0)]), color: WL, name: 'shelves' },
    { ...merge([cyl(0.025, 0.025, 0.10, 6, -0.15, 0.18, 0.05), cyl(0.025, 0.025, 0.10, 6, 0.15, 0.18, 0.05), cyl(0.025, 0.025, 0.10, 6, -0.15, 0.46, 0.05), cyl(0.025, 0.025, 0.10, 6, 0.15, 0.46, 0.05)]), color: [0.4, 0.1, 0.15], name: 'bottles' },
  ],
  dish_cabinet: () => [
    { ...merge([box(0.03, 1.75, 0.42, -0.42, 0.88, 0), box(0.03, 1.75, 0.42, 0.42, 0.88, 0)]), color: WD, name: 'sides' },
    { ...merge([box(0.84, 0.02, 0.40, 0, 0.02, 0), box(0.84, 0.02, 0.40, 0, 0.45, 0), box(0.84, 0.02, 0.40, 0, 0.88, 0), box(0.84, 0.02, 0.40, 0, 1.31, 0), box(0.84, 0.02, 0.40, 0, 1.75, 0)]), color: WL, name: 'shelves' },
    { ...merge([box(0.84, 0.42, 0.02, 0, 1.10, 0.21), box(0.84, 0.42, 0.02, 0, 1.53, 0.21)]), color: [0.7, 0.85, 0.9], name: 'glass_doors' },
    { ...merge([box(0.84, 1.75, 0.01, 0, 0.88, -0.21)]), color: WD, name: 'back' },
  ],
  coffee_machine: () => [
    { ...merge([box(0.30, 0.35, 0.35, 0, 0.175, 0)]), color: MD, name: 'body', metallic: 0.4 },
    { ...merge([box(0.10, 0.12, 0.02, 0, 0.40, -0.10)]), color: [0.2, 0.3, 0.5], name: 'screen' },
    { ...merge([box(0.12, 0.03, 0.10, 0, 0.08, 0.14)]), color: MS, name: 'drip_tray', metallic: 0.6 },
    { ...merge([cyl(0.03, 0.03, 0.10, 6, 0, 0.40, 0.10)]), color: MD, name: 'spout', metallic: 0.5 },
  ],
  // ─── オフィス向け ───
  office_desk: () => [
    { ...merge([box(1.40, 0.03, 0.70, 0, 0.74, 0)]), color: WL, name: 'top' },
    { ...merge([box(0.04, 0.72, 0.04, -0.66, 0.36, -0.31), box(0.04, 0.72, 0.04, 0.66, 0.36, -0.31), box(0.04, 0.72, 0.04, -0.66, 0.36, 0.31), box(0.04, 0.72, 0.04, 0.66, 0.36, 0.31)]), color: MS, name: 'legs', metallic: 0.5 },
    { ...merge([box(0.40, 0.30, 0.60, 0.48, 0.56, 0)]), color: W, name: 'drawers' },
    { ...merge([box(1.30, 0.04, 0.02, 0, 0.10, -0.31)]), color: MS, name: 'crossbar', metallic: 0.5 },
  ],
  office_chair: () => [
    { ...merge([cyl(0.20, 0.20, 0.04, 10, 0, 0.45, 0)]), color: MD, name: 'seat_base', metallic: 0.3 },
    { ...merge([box(0.44, 0.06, 0.44, 0, 0.50, 0)]), color: [0.15, 0.15, 0.15], name: 'cushion', roughness: 0.85 },
    { ...merge([box(0.42, 0.45, 0.04, 0, 0.78, -0.20)]), color: [0.15, 0.15, 0.15], name: 'back', roughness: 0.85 },
    { ...merge([cyl(0.025, 0.03, 0.30, 6, 0, 0.28, 0)]), color: MD, name: 'pole', metallic: 0.7 },
    { ...merge([cyl(0.18, 0.18, 0.03, 10, 0, 0.02, 0)]), color: MD, name: 'base', metallic: 0.6 },
    { ...merge([cyl(0.015, 0.015, 0.02, 4, 0.15, 0.01, 0), cyl(0.015, 0.015, 0.02, 4, -0.15, 0.01, 0), cyl(0.015, 0.015, 0.02, 4, 0, 0.01, 0.15), cyl(0.015, 0.015, 0.02, 4, 0, 0.01, -0.15)]), color: MD, name: 'casters', metallic: 0.5 },
    { ...merge([box(0.04, 0.08, 0.20, -0.24, 0.60, 0), box(0.04, 0.08, 0.20, 0.24, 0.60, 0)]), color: MD, name: 'armrests', metallic: 0.4 },
  ],
  file_cabinet: () => [
    { ...merge([box(0.42, 1.25, 0.55, 0, 0.625, 0)]), color: MS, name: 'body', metallic: 0.5 },
    { ...merge([box(0.38, 0.25, 0.02, 0, 0.20, 0.29), box(0.38, 0.25, 0.02, 0, 0.50, 0.29), box(0.38, 0.25, 0.02, 0, 0.80, 0.29), box(0.38, 0.25, 0.02, 0, 1.10, 0.29)]), color: [0.6, 0.6, 0.65], name: 'drawers', metallic: 0.4 },
    { ...merge([box(0.06, 0.03, 0.03, 0, 0.20, 0.31), box(0.06, 0.03, 0.03, 0, 0.50, 0.31), box(0.06, 0.03, 0.03, 0, 0.80, 0.31), box(0.06, 0.03, 0.03, 0, 1.10, 0.31)]), color: MD, name: 'handles', metallic: 0.7 },
  ],
  whiteboard: () => [
    { ...merge([box(1.20, 0.90, 0.02, 0, 0.90, 0)]), color: [0.97, 0.97, 0.97], name: 'board' },
    { ...merge([box(1.24, 0.94, 0.01, 0, 0.90, -0.015)]), color: MS, name: 'frame', metallic: 0.5 },
    { ...merge([box(1.20, 0.04, 0.06, 0, 0.42, 0.04)]), color: MS, name: 'tray', metallic: 0.5 },
    { ...merge([box(0.04, 1.30, 0.40, -0.58, 0.65, -0.20), box(0.04, 1.30, 0.40, 0.58, 0.65, -0.20)]), color: MS, name: 'legs', metallic: 0.5 },
  ],
  printer_stand: () => [
    { ...merge([box(0.55, 0.03, 0.45, 0, 0.65, 0)]), color: WL, name: 'top' },
    { ...merge([box(0.55, 0.03, 0.45, 0, 0.30, 0)]), color: WL, name: 'shelf' },
    { ...merge([box(0.04, 0.63, 0.04, -0.24, 0.32, -0.19), box(0.04, 0.63, 0.04, 0.24, 0.32, -0.19), box(0.04, 0.63, 0.04, -0.24, 0.32, 0.19), box(0.04, 0.63, 0.04, 0.24, 0.32, 0.19)]), color: MS, name: 'legs', metallic: 0.5 },
    { ...merge([box(0.40, 0.15, 0.35, 0, 0.75, 0)]), color: [0.2, 0.2, 0.2], name: 'printer' },
  ],
  // ─── 美容・医療向け ───
  treatment_bed: () => [
    { ...merge([box(0.65, 0.10, 1.85, 0, 0.55, 0)]), color: [0.95, 0.95, 0.95], name: 'mattress', roughness: 0.8 },
    { ...merge([box(0.60, 0.04, 1.80, 0, 0.48, 0)]), color: MS, name: 'frame', metallic: 0.5 },
    { ...merge([box(0.60, 0.15, 0.04, 0, 0.62, -0.90)]), color: [0.95, 0.95, 0.95], name: 'headrest', roughness: 0.8 },
    { ...merge([cyl(0.025, 0.03, 0.45, 6, -0.26, 0.24, -0.80), cyl(0.025, 0.03, 0.45, 6, 0.26, 0.24, -0.80), cyl(0.025, 0.03, 0.45, 6, -0.26, 0.24, 0.80), cyl(0.025, 0.03, 0.45, 6, 0.26, 0.24, 0.80)]), color: MS, name: 'legs', metallic: 0.6 },
  ],
  shampoo_station: () => [
    { ...merge([box(0.55, 0.50, 0.50, 0, 0.60, -0.25)]), color: MD, name: 'cabinet' },
    { ...merge([box(0.45, 0.15, 0.40, 0, 0.90, -0.25)]), color: [0.9, 0.9, 0.95], name: 'basin' },
    { ...merge([box(0.55, 0.08, 0.85, 0, 0.40, 0.10)]), color: [0.15, 0.15, 0.15], name: 'seat_cushion', roughness: 0.85 },
    { ...merge([box(0.55, 0.35, 0.04, 0, 0.40, -0.50)]), color: [0.15, 0.15, 0.15], name: 'back', roughness: 0.85 },
    { ...merge([cyl(0.01, 0.01, 0.25, 4, 0, 1.05, -0.35)]), color: MS, name: 'faucet', metallic: 0.8 },
  ],
  mirror_station: () => [
    { ...merge([box(0.70, 0.03, 0.45, 0, 0.78, 0)]), color: WL, name: 'desk_top' },
    { ...merge([box(0.68, 0.45, 0.42, 0, 0.53, 0)]), color: W, name: 'drawers' },
    { ...merge([box(0.60, 0.70, 0.03, 0, 1.18, -0.20)]), color: [0.85, 0.88, 0.92], name: 'mirror_surface', metallic: 0.9 },
    { ...merge([box(0.64, 0.74, 0.02, 0, 1.18, -0.22)]), color: WD, name: 'mirror_frame' },
  ],
  waiting_sofa: () => [
    { ...merge([box(1.60, 0.12, 0.65, 0, 0.18, 0)]), color: MD, name: 'frame', metallic: 0.3 },
    { ...merge([box(0.70, 0.14, 0.55, -0.38, 0.35, 0.02), box(0.70, 0.14, 0.55, 0.38, 0.35, 0.02)]), color: [0.29, 0.40, 0.25], name: 'cushions', roughness: 0.85 },
    { ...merge([box(1.52, 0.38, 0.10, 0, 0.55, -0.28)]), color: [0.29, 0.40, 0.25], name: 'back', roughness: 0.85 },
    { ...merge([box(0.10, 0.25, 0.58, -0.76, 0.40, 0), box(0.10, 0.25, 0.58, 0.76, 0.40, 0)]), color: [0.29, 0.40, 0.25], name: 'arms', roughness: 0.85 },
  ],
  // ─── 小売向け ───
  display_shelf: () => [
    { ...merge([box(0.03, 1.75, 0.40, -0.57, 0.88, 0), box(0.03, 1.75, 0.40, 0.57, 0.88, 0)]), color: [0.9, 0.9, 0.9], name: 'sides' },
    { ...merge([box(1.14, 0.02, 0.38, 0, 0.02, 0), box(1.14, 0.02, 0.38, 0, 0.37, 0), box(1.14, 0.02, 0.38, 0, 0.72, 0), box(1.14, 0.02, 0.38, 0, 1.07, 0), box(1.14, 0.02, 0.38, 0, 1.42, 0), box(1.14, 0.02, 0.38, 0, 1.75, 0)]), color: [0.95, 0.95, 0.95], name: 'shelves' },
    { ...merge([box(1.14, 1.75, 0.01, 0, 0.88, -0.20)]), color: [0.85, 0.85, 0.85], name: 'back' },
  ],
  glass_showcase: () => [
    { ...merge([box(0.96, 0.04, 0.46, 0, 0.92, 0), box(0.96, 0.04, 0.46, 0, 0.02, 0)]), color: MD, name: 'frame', metallic: 0.5 },
    { ...merge([box(0.92, 0.86, 0.02, 0, 0.48, 0.22), box(0.92, 0.86, 0.02, 0, 0.48, -0.22), box(0.02, 0.86, 0.44, 0.47, 0.48, 0), box(0.02, 0.86, 0.44, -0.47, 0.48, 0)]), color: [0.7, 0.85, 0.9], name: 'glass' },
    { ...merge([box(0.92, 0.02, 0.42, 0, 0.47, 0)]), color: [0.7, 0.85, 0.9], name: 'mid_shelf' },
  ],
  mannequin: () => [
    { ...merge([cyl(0.08, 0.06, 0.40, 8, 0, 0.95, 0)]), color: [0.95, 0.90, 0.82], name: 'head' },
    { ...merge([box(0.35, 0.50, 0.20, 0, 0.55, 0)]), color: [0.95, 0.90, 0.82], name: 'torso' },
    { ...merge([cyl(0.04, 0.04, 0.50, 6, -0.12, 0.15, 0), cyl(0.04, 0.04, 0.50, 6, 0.12, 0.15, 0)]), color: [0.95, 0.90, 0.82], name: 'legs' },
    { ...merge([cyl(0.15, 0.18, 0.03, 10, 0, 0.015, 0)]), color: MD, name: 'base', metallic: 0.5 },
    { ...merge([cyl(0.02, 0.02, 0.10, 4, 0, 0.08, 0)]), color: MD, name: 'pole', metallic: 0.5 },
  ],
  fitting_room: () => [
    { ...merge([box(1.15, 2.10, 0.04, 0, 1.05, -0.58), box(0.04, 2.10, 1.16, -0.56, 1.05, 0), box(0.04, 2.10, 1.16, 0.56, 1.05, 0)]), color: CR, name: 'walls' },
    { ...merge([box(0.80, 2.00, 0.02, 0, 1.00, 0.56)]), color: FB, name: 'curtain', roughness: 0.9 },
    { ...merge([cyl(0.01, 0.01, 0.86, 4, 0, 2.05, 0.56)]), color: MS, name: 'rod', metallic: 0.7 },
    { ...merge([box(0.50, 0.70, 0.02, -0.30, 1.20, -0.55)]), color: [0.85, 0.88, 0.92], name: 'mirror', metallic: 0.9 },
  ],
  // ─── 共通設備 ───
  vending_machine: () => [
    { ...merge([box(0.65, 1.75, 0.65, 0, 0.875, 0)]), color: [0.95, 0.95, 0.95], name: 'body' },
    { ...merge([box(0.55, 1.10, 0.02, 0, 1.10, 0.34)]), color: [0.2, 0.4, 0.8], name: 'display' },
    { ...merge([box(0.55, 0.25, 0.04, 0, 0.30, 0.33)]), color: MD, name: 'dispenser' },
    { ...merge([box(0.10, 0.08, 0.04, 0.20, 0.80, 0.35)]), color: MS, name: 'coin_slot', metallic: 0.6 },
  ],
  atm: () => [
    { ...merge([box(0.45, 1.40, 0.55, 0, 0.70, 0)]), color: [0.18, 0.31, 0.56], name: 'body', metallic: 0.3 },
    { ...merge([box(0.30, 0.25, 0.02, 0, 1.15, 0.29)]), color: [0.15, 0.20, 0.35], name: 'screen' },
    { ...merge([box(0.20, 0.15, 0.04, 0, 0.85, 0.28)]), color: MS, name: 'keypad', metallic: 0.5 },
    { ...merge([box(0.18, 0.02, 0.06, 0, 0.65, 0.28)]), color: MD, name: 'card_slot', metallic: 0.6 },
  ],
  coat_hanger: () => [
    { ...merge([cyl(0.025, 0.03, 1.55, 6, 0, 0.78, 0)]), color: WL, name: 'pole' },
    { ...merge([cyl(0.22, 0.24, 0.03, 8, 0, 0.015, 0)]), color: WD, name: 'base' },
    { ...merge([box(0.25, 0.02, 0.02, 0, 1.50, 0), box(0.02, 0.02, 0.18, 0.12, 1.50, 0), box(0.02, 0.02, 0.18, -0.12, 1.50, 0)]), color: WD, name: 'hooks' },
    { ...merge([box(0.25, 0.02, 0.02, 0, 1.42, 0), box(0.02, 0.02, 0.18, 0.12, 1.42, 0), box(0.02, 0.02, 0.18, -0.12, 1.42, 0)]), color: WD, name: 'hooks2' },
  ],
  fire_extinguisher: () => [
    { ...merge([cyl(0.05, 0.05, 0.35, 8, 0, 0.175, 0)]), color: [0.8, 0.0, 0.0], name: 'body' },
    { ...merge([cyl(0.025, 0.02, 0.06, 6, 0, 0.38, 0)]), color: MD, name: 'valve', metallic: 0.7 },
    { ...merge([box(0.04, 0.06, 0.02, 0.04, 0.40, 0)]), color: MD, name: 'handle', metallic: 0.6 },
    { ...merge([cyl(0.008, 0.008, 0.12, 4, 0.04, 0.30, 0.06)]), color: MD, name: 'hose', metallic: 0.5 },
  ],
  aed: () => [
    { ...merge([box(0.28, 0.30, 0.12, 0, 0.15, 0)]), color: [1.0, 0.4, 0.0], name: 'body' },
    { ...merge([box(0.20, 0.12, 0.01, 0, 0.20, 0.065)]), color: [0.0, 0.5, 0.0], name: 'screen' },
    { ...merge([box(0.06, 0.03, 0.03, 0.08, 0.08, 0.065)]), color: [0.9, 0.9, 0.9], name: 'button' },
  ],
  plant_large: () => [
    { ...merge([cyl(0.16, 0.12, 0.30, 10, 0, 0.15, 0)]), color: TC, name: 'pot' },
    { ...merge([cyl(0.025, 0.03, 0.70, 5, 0, 0.65, 0)]), color: [0.165, 0.353, 0.165], name: 'trunk' },
    { ...merge([cyl(0.015, 0.02, 0.30, 4, 0.10, 0.90, 0.05)]), color: [0.165, 0.353, 0.165], name: 'branch1' },
    { ...merge([box(0.35, 0.30, 0.35, 0, 1.15, 0), box(0.30, 0.25, 0.30, -0.10, 1.05, 0.08), box(0.25, 0.20, 0.28, 0.12, 0.95, -0.05)]), color: GL, name: 'leaves' },
  ],
  plant_small: () => [
    { ...merge([cyl(0.06, 0.04, 0.08, 8, 0, 0.04, 0)]), color: TC, name: 'pot' },
    { ...merge([box(0.10, 0.10, 0.10, 0, 0.14, 0), box(0.08, 0.08, 0.08, 0.03, 0.12, 0.02)]), color: GL, name: 'leaves' },
  ],
  digital_signage: () => [
    { ...merge([box(0.65, 1.10, 0.03, 0, 0.95, 0)]), color: MD, name: 'screen', metallic: 0.3 },
    { ...merge([box(0.69, 1.14, 0.02, 0, 0.95, -0.02)]), color: MD, name: 'frame', metallic: 0.5 },
    { ...merge([cyl(0.03, 0.04, 0.35, 6, 0, 0.18, 0)]), color: MD, name: 'pole', metallic: 0.6 },
    { ...merge([box(0.35, 0.02, 0.25, 0, 0.01, 0)]), color: MD, name: 'base', metallic: 0.5 },
  ],
  indirect_light: () => [
    { ...merge([box(0.75, 0.06, 0.10, 0, 0.03, 0)]), color: MS, name: 'housing', metallic: 0.6 },
    { ...merge([box(0.70, 0.02, 0.06, 0, 0.07, 0)]), color: [0.95, 0.85, 0.50], name: 'light_strip' },
    { ...merge([box(0.75, 0.08, 0.02, 0, 0.04, -0.05)]), color: MS, name: 'back_plate', metallic: 0.5 },
  ],
};

console.log('Generating GLB furniture models...\n');
for (const [name, fn] of Object.entries(furniture)) {
  const meshes = fn();
  const glb = buildGLB(meshes);
  const path = join(OUT, `${name}.glb`);
  writeFileSync(path, glb);
  console.log(`✓ ${name}.glb (${(glb.byteLength / 1024).toFixed(1)}KB)`);
}
console.log(`\nDone! ${Object.keys(furniture).length} models saved to public/models/`);
