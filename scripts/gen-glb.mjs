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
      // 座面フレーム（前方やや広め）
      { ...box(0.42, 0.025, 0.40, 0, 0.455, 0), color: W, name: 'seat_frame' },
      // 座面エッジ（前面の丸み表現）
      { ...merge([cyl(0.015, 0.015, 0.40, 8, 0, 0.455, 0.20), cyl(0.015, 0.015, 0.40, 8, 0, 0.455, -0.20)]), color: W, name: 'seat_edges' },
      // クッション（少し沈んだ表現）
      { ...box(0.36, 0.035, 0.34, 0, 0.49, 0.01), color: FR, name: 'cushion', roughness: 0.85 },
      // 背もたれ（3段分割で曲線表現）
      { ...box(0.38, 0.14, 0.022, 0, 0.58, -0.185), color: W, name: 'back_lower' },
      { ...box(0.38, 0.14, 0.020, 0, 0.72, -0.190), color: W, name: 'back_mid' },
      { ...box(0.38, 0.10, 0.018, 0, 0.84, -0.195), color: W, name: 'back_upper' },
      // 背もたれクッション
      { ...box(0.32, 0.28, 0.015, 0, 0.70, -0.17), color: FR, name: 'back_cushion', roughness: 0.85 },
      // 脚4本（テーパー付き円柱）
      { ...merge([cyl(0.014, 0.018, 0.44, 8, -0.18, 0.22, -0.17)]), color: WD, name: 'leg_bl' },
      { ...merge([cyl(0.014, 0.018, 0.44, 8, 0.18, 0.22, -0.17)]), color: WD, name: 'leg_br' },
      { ...merge([cyl(0.014, 0.018, 0.44, 8, -0.18, 0.22, 0.17)]), color: WD, name: 'leg_fl' },
      { ...merge([cyl(0.014, 0.018, 0.44, 8, 0.18, 0.22, 0.17)]), color: WD, name: 'leg_fr' },
      // 横桟（前後左右）
      { ...merge([box(0.32, 0.02, 0.015, 0, 0.12, -0.17), box(0.32, 0.02, 0.015, 0, 0.12, 0.17)]), color: WD, name: 'stretchers_fb' },
      { ...merge([box(0.015, 0.02, 0.30, -0.18, 0.12, 0), box(0.015, 0.02, 0.30, 0.18, 0.12, 0)]), color: WD, name: 'stretchers_lr' },
    ];
    return parts.map(p => ({ ...merge([p]), color: p.color, name: p.name, roughness: p.roughness }));
  },
  table_square: () => [
    // 天板（面取り表現: 本体+エッジ帯）
    { ...merge([box(0.88, 0.035, 0.88, 0, 0.74, 0)]), color: WL, name: 'top' },
    { ...merge([box(0.90, 0.01, 0.90, 0, 0.72, 0)]), color: WL, name: 'top_edge' },
    // テーパー脚（上が細く下が太い円柱）
    { ...merge([cyl(0.022, 0.030, 0.70, 8, -0.39, 0.35, -0.39)]), color: WD, name: 'leg_bl' },
    { ...merge([cyl(0.022, 0.030, 0.70, 8, 0.39, 0.35, -0.39)]), color: WD, name: 'leg_br' },
    { ...merge([cyl(0.022, 0.030, 0.70, 8, -0.39, 0.35, 0.39)]), color: WD, name: 'leg_fl' },
    { ...merge([cyl(0.022, 0.030, 0.70, 8, 0.39, 0.35, 0.39)]), color: WD, name: 'leg_fr' },
    // 幕板（4面）
    { ...merge([box(0.76, 0.055, 0.025, 0, 0.695, 0.41), box(0.76, 0.055, 0.025, 0, 0.695, -0.41)]), color: W, name: 'apron_fb' },
    { ...merge([box(0.025, 0.055, 0.80, 0.41, 0.695, 0), box(0.025, 0.055, 0.80, -0.41, 0.695, 0)]), color: W, name: 'apron_lr' },
    // 横桟（H型補強）
    { ...merge([box(0.74, 0.02, 0.02, 0, 0.15, 0)]), color: WD, name: 'stretcher_x' },
    { ...merge([box(0.02, 0.02, 0.74, 0, 0.15, 0)]), color: WD, name: 'stretcher_z' },
  ],
  sofa: () => [
    // フレーム（木製ベース）
    { ...merge([box(1.60, 0.10, 0.75, 0, 0.15, 0)]), color: WD, name: 'frame' },
    // 脚（円柱4本）
    { ...merge([cyl(0.025, 0.025, 0.08, 8, -0.70, 0.04, -0.30), cyl(0.025, 0.025, 0.08, 8, 0.70, 0.04, -0.30), cyl(0.025, 0.025, 0.08, 8, -0.70, 0.04, 0.30), cyl(0.025, 0.025, 0.08, 8, 0.70, 0.04, 0.30)]), color: WD, name: 'legs' },
    // 座面クッション3分割
    { ...merge([box(0.46, 0.13, 0.58, -0.50, 0.33, 0.04)]), color: FR, name: 'cushion_l', roughness: 0.85 },
    { ...merge([box(0.46, 0.13, 0.58, 0, 0.33, 0.04)]), color: FR, name: 'cushion_c', roughness: 0.85 },
    { ...merge([box(0.46, 0.13, 0.58, 0.50, 0.33, 0.04)]), color: FR, name: 'cushion_r', roughness: 0.85 },
    // 背もたれクッション3分割
    { ...merge([box(0.46, 0.36, 0.12, -0.50, 0.58, -0.28)]), color: FR, name: 'back_l', roughness: 0.85 },
    { ...merge([box(0.46, 0.38, 0.12, 0, 0.59, -0.28)]), color: FR, name: 'back_c', roughness: 0.85 },
    { ...merge([box(0.46, 0.36, 0.12, 0.50, 0.58, -0.28)]), color: FR, name: 'back_r', roughness: 0.85 },
    // アームレスト（丸み: 上に円柱）
    { ...merge([box(0.10, 0.22, 0.62, -0.76, 0.40, 0.02)]), color: FR, name: 'arm_l', roughness: 0.85 },
    { ...merge([cyl(0.05, 0.05, 0.62, 8, -0.76, 0.52, 0.02)]), color: FR, name: 'arm_l_top', roughness: 0.85 },
    { ...merge([box(0.10, 0.22, 0.62, 0.76, 0.40, 0.02)]), color: FR, name: 'arm_r', roughness: 0.85 },
    { ...merge([cyl(0.05, 0.05, 0.62, 8, 0.76, 0.52, 0.02)]), color: FR, name: 'arm_r_top', roughness: 0.85 },
    // クッションピロー
    { ...merge([box(0.18, 0.11, 0.08, -0.55, 0.50, -0.15), box(0.18, 0.11, 0.08, 0.55, 0.50, -0.15)]), color: FB, name: 'pillows', roughness: 0.9 },
  ],
  counter: () => [
    // 天板（オーバーハング: 本体より大きい）
    { ...merge([box(1.54, 0.04, 0.64, 0, 0.93, 0)]), color: CR, name: 'top' },
    // 天板エッジ（面取り表現）
    { ...merge([box(1.56, 0.012, 0.66, 0, 0.905, 0)]), color: CR, name: 'top_edge' },
    // 前面パネル
    { ...merge([box(1.46, 0.58, 0.03, 0, 0.62, 0.29)]), color: W, name: 'front_panel' },
    // 側面パネル
    { ...merge([box(0.03, 0.58, 0.56, -0.73, 0.62, 0), box(0.03, 0.58, 0.56, 0.73, 0.62, 0)]), color: W, name: 'side_panels' },
    // 背面パネル
    { ...merge([box(1.46, 0.58, 0.02, 0, 0.62, -0.29)]), color: WD, name: 'back_panel' },
    // 棚板2段
    { ...merge([box(1.40, 0.02, 0.52, 0, 0.50, 0)]), color: WL, name: 'shelf_upper' },
    { ...merge([box(1.40, 0.02, 0.52, 0, 0.35, 0)]), color: WL, name: 'shelf_lower' },
    // 幕板（前面装飾ライン）
    { ...merge([box(1.42, 0.03, 0.01, 0, 0.88, 0.30)]), color: WD, name: 'apron' },
    // 脚（短い台座）
    { ...merge([box(0.06, 0.04, 0.06, -0.68, 0.02, -0.24), box(0.06, 0.04, 0.06, 0.68, 0.02, -0.24), box(0.06, 0.04, 0.06, -0.68, 0.02, 0.24), box(0.06, 0.04, 0.06, 0.68, 0.02, 0.24)]), color: MD, name: 'feet' },
  ],
  stool: () => [
    // 座面ベース
    { ...merge([cyl(0.16, 0.16, 0.03, 14, 0, 0.72, 0)]), color: MS, name: 'seat_base', metallic: 0.7 },
    // クッション（ふっくら）
    { ...merge([cyl(0.145, 0.145, 0.025, 14, 0, 0.75, 0)]), color: FR, name: 'cushion', roughness: 0.85 },
    { ...merge([cyl(0.13, 0.13, 0.01, 14, 0, 0.77, 0)]), color: FR, name: 'cushion_top', roughness: 0.85 },
    // 支柱（ガスシリンダー表現）
    { ...merge([cyl(0.018, 0.022, 0.50, 8, 0, 0.44, 0)]), color: MD, name: 'cylinder', metallic: 0.7 },
    // カバー
    { ...merge([cyl(0.03, 0.03, 0.04, 8, 0, 0.68, 0)]), color: MD, name: 'collar', metallic: 0.6 },
    // ベース
    { ...merge([cyl(0.20, 0.22, 0.025, 14, 0, 0.05, 0)]), color: MD, name: 'base', metallic: 0.7 },
    { ...merge([cyl(0.18, 0.18, 0.01, 14, 0, 0.065, 0)]), color: [0.22, 0.22, 0.25], name: 'base_top', metallic: 0.6 },
    // フットリング
    { ...merge([cyl(0.12, 0.12, 0.015, 12, 0, 0.30, 0)]), color: MD, name: 'foot_ring', metallic: 0.6 },
  ],
  shelf: () => [
    // 側板
    { ...merge([box(0.025, 1.25, 0.34, -0.43, 0.625, 0), box(0.025, 1.25, 0.34, 0.43, 0.625, 0)]), color: WD, name: 'sides' },
    // 棚板5段
    { ...merge([box(0.86, 0.018, 0.33, 0, 0.02, 0), box(0.86, 0.018, 0.33, 0, 0.27, 0), box(0.86, 0.018, 0.33, 0, 0.52, 0), box(0.86, 0.018, 0.33, 0, 0.77, 0), box(0.86, 0.018, 0.33, 0, 1.02, 0), box(0.86, 0.018, 0.33, 0, 1.24, 0)]), color: WL, name: 'shelves' },
    // 背板
    { ...merge([box(0.84, 1.22, 0.008, 0, 0.625, -0.17)]), color: W, name: 'back_panel' },
    // 棚板前面エッジ（厚み表現）
    { ...merge([box(0.86, 0.025, 0.01, 0, 0.02, 0.17), box(0.86, 0.025, 0.01, 0, 0.27, 0.17), box(0.86, 0.025, 0.01, 0, 0.52, 0.17), box(0.86, 0.025, 0.01, 0, 0.77, 0.17), box(0.86, 0.025, 0.01, 0, 1.02, 0.17)]), color: WD, name: 'shelf_edges' },
  ],
  plant: () => [
    { ...merge([cyl(0.12, 0.09, 0.18, 10, 0, 0.09, 0)]), color: TC, name: 'pot' },
    { ...merge([cyl(0.012, 0.015, 0.25, 5, 0, 0.32, 0)]), color: [0.165, 0.353, 0.165], name: 'stem' },
    { ...merge([box(0.22, 0.18, 0.20, 0, 0.52, 0), box(0.18, 0.16, 0.22, -0.08, 0.48, 0.06), box(0.18, 0.14, 0.18, 0.06, 0.46, -0.05)]), color: GL, name: 'leaves' },
  ],
  desk: () => [
    // 天板
    { ...merge([box(1.22, 0.03, 0.62, 0, 0.74, 0)]), color: WL, name: 'top' },
    { ...merge([box(1.24, 0.01, 0.64, 0, 0.72, 0)]), color: WL, name: 'top_edge' },
    // 引き出しユニット（3段）
    { ...merge([box(0.38, 0.58, 0.54, 0.38, 0.43, 0)]), color: W, name: 'drawer_body' },
    { ...merge([box(0.36, 0.16, 0.02, 0.38, 0.62, 0.28), box(0.36, 0.16, 0.02, 0.38, 0.44, 0.28), box(0.36, 0.16, 0.02, 0.38, 0.26, 0.28)]), color: WL, name: 'drawer_fronts' },
    { ...merge([box(0.06, 0.02, 0.02, 0.38, 0.62, 0.30), box(0.06, 0.02, 0.02, 0.38, 0.44, 0.30), box(0.06, 0.02, 0.02, 0.38, 0.26, 0.30)]), color: MS, name: 'drawer_handles', metallic: 0.6 },
    // 左脚（金属L字フレーム）
    { ...merge([box(0.04, 0.72, 0.04, -0.56, 0.36, -0.26)]), color: MD, name: 'leg_l_back', metallic: 0.5 },
    { ...merge([box(0.04, 0.72, 0.04, -0.56, 0.36, 0.26)]), color: MD, name: 'leg_l_front', metallic: 0.5 },
    { ...merge([box(0.04, 0.04, 0.48, -0.56, 0.02, 0)]), color: MD, name: 'leg_l_base', metallic: 0.5 },
    // キーボードトレイ
    { ...merge([box(0.50, 0.015, 0.28, -0.10, 0.65, 0.15)]), color: WL, name: 'kb_tray' },
    // 配線穴表現
    { ...merge([cyl(0.025, 0.025, 0.035, 8, 0.38, 0.74, -0.15)]), color: MD, name: 'cable_hole', metallic: 0.4 },
  ],
  bench: () => [
    { ...merge([box(1.2, 0.04, 0.35, 0, 0.44, 0)]), color: W, name: 'seat' },
    { ...merge([box(0.04, 0.43, 0.30, -0.48, 0.215, 0), box(0.04, 0.43, 0.30, 0.48, 0.215, 0)]), color: WD, name: 'legs' },
  ],
  bookcase: () => [
    // 側板
    { ...merge([box(0.025, 1.82, 0.34, -0.44, 0.91, 0), box(0.025, 1.82, 0.34, 0.44, 0.91, 0)]), color: WD, name: 'sides' },
    // 天板
    { ...merge([box(0.91, 0.025, 0.35, 0, 1.81, 0)]), color: WD, name: 'top' },
    // 背板
    { ...merge([box(0.86, 1.78, 0.008, 0, 0.91, -0.17)]), color: W, name: 'back' },
    // 棚板5段（エッジ付き）
    { ...merge([box(0.86, 0.018, 0.33, 0, 0.02, 0), box(0.86, 0.018, 0.33, 0, 0.38, 0), box(0.86, 0.018, 0.33, 0, 0.74, 0), box(0.86, 0.018, 0.33, 0, 1.10, 0), box(0.86, 0.018, 0.33, 0, 1.46, 0)]), color: WL, name: 'shelves' },
    // 棚板エッジ
    { ...merge([box(0.86, 0.022, 0.008, 0, 0.02, 0.17), box(0.86, 0.022, 0.008, 0, 0.38, 0.17), box(0.86, 0.022, 0.008, 0, 0.74, 0.17), box(0.86, 0.022, 0.008, 0, 1.10, 0.17), box(0.86, 0.022, 0.008, 0, 1.46, 0.17)]), color: WD, name: 'shelf_edges' },
    // 下段扉（キャビネット部分: パネル2枚）
    { ...merge([box(0.42, 0.34, 0.015, -0.22, 0.20, 0.18)]), color: W, name: 'door_l' },
    { ...merge([box(0.42, 0.34, 0.015, 0.22, 0.20, 0.18)]), color: W, name: 'door_r' },
    // 扉取っ手
    { ...merge([box(0.02, 0.06, 0.02, -0.02, 0.20, 0.20), box(0.02, 0.06, 0.02, 0.02, 0.20, 0.20)]), color: MS, name: 'door_handles', metallic: 0.6 },
    // 台座（巾木）
    { ...merge([box(0.90, 0.04, 0.02, 0, 0.02, 0.18)]), color: WD, name: 'plinth' },
  ],
  // ─── Additional furniture types ───
  table_round: () => [
    // 天板（厚みのある円盤+エッジ）
    { ...merge([cyl(0.40, 0.40, 0.035, 16, 0, 0.74, 0)]), color: WL, name: 'top' },
    { ...merge([cyl(0.41, 0.41, 0.01, 16, 0, 0.72, 0)]), color: WL, name: 'top_edge' },
    // ペデスタル（テーパー）
    { ...merge([cyl(0.035, 0.055, 0.66, 10, 0, 0.37, 0)]), color: WD, name: 'pedestal' },
    // ペデスタル装飾リング
    { ...merge([cyl(0.05, 0.05, 0.03, 10, 0, 0.68, 0)]), color: WD, name: 'collar' },
    // ベース（3本脚＋中心）
    { ...merge([cyl(0.22, 0.24, 0.025, 12, 0, 0.012, 0)]), color: WD, name: 'base' },
    { ...merge([box(0.06, 0.02, 0.20, 0, 0.01, 0.14), box(0.18, 0.02, 0.06, -0.12, 0.01, -0.10), box(0.18, 0.02, 0.06, 0.12, 0.01, -0.10)]), color: WD, name: 'base_feet' },
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
    // 天板（オーバーハング）
    { ...merge([box(1.84, 0.04, 0.74, 0, 0.93, 0)]), color: CR, name: 'top' },
    { ...merge([box(1.86, 0.012, 0.76, 0, 0.905, 0)]), color: CR, name: 'top_edge' },
    // フロントカウンター（2段: 上段高め＋下段来客側）
    { ...merge([box(1.76, 0.20, 0.03, 0, 0.82, 0.34)]), color: W, name: 'front_upper' },
    { ...merge([box(1.76, 0.42, 0.03, 0, 0.50, 0.35)]), color: WL, name: 'front_lower' },
    // 前面装飾ライン
    { ...merge([box(1.72, 0.015, 0.02, 0, 0.71, 0.36)]), color: WD, name: 'front_accent' },
    // 側面パネル
    { ...merge([box(0.03, 0.60, 0.68, -0.88, 0.61, 0), box(0.03, 0.60, 0.68, 0.88, 0.61, 0)]), color: W, name: 'sides' },
    // リターン（L字カウンター）
    { ...merge([box(0.80, 0.60, 0.03, 0.48, 0.61, -0.33)]), color: W, name: 'return_panel' },
    { ...merge([box(0.82, 0.04, 0.36, 0.48, 0.93, -0.50)]), color: CR, name: 'return_top' },
    // 内側棚板
    { ...merge([box(1.70, 0.02, 0.60, 0, 0.45, 0)]), color: WL, name: 'inner_shelf' },
    // 幕板（背面装飾）
    { ...merge([box(1.72, 0.58, 0.02, 0, 0.61, -0.33)]), color: WD, name: 'back_panel' },
    // 台座
    { ...merge([box(1.78, 0.06, 0.04, 0, 0.03, 0.35)]), color: MD, name: 'plinth' },
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
    // 天板（オーバーハング）
    { ...merge([box(1.24, 0.035, 0.64, 0, 0.93, 0)]), color: CR, name: 'top' },
    { ...merge([box(1.26, 0.01, 0.66, 0, 0.905, 0)]), color: CR, name: 'top_edge' },
    // ボディ前面+側面+背面
    { ...merge([box(1.16, 0.56, 0.03, 0, 0.62, 0.29)]), color: W, name: 'front' },
    { ...merge([box(0.03, 0.56, 0.56, -0.58, 0.62, 0), box(0.03, 0.56, 0.56, 0.58, 0.62, 0)]), color: W, name: 'sides' },
    { ...merge([box(1.16, 0.56, 0.02, 0, 0.62, -0.29)]), color: WD, name: 'back' },
    // 内部棚板
    { ...merge([box(1.12, 0.02, 0.52, 0, 0.50, 0)]), color: WL, name: 'shelf' },
    // 台座（巾木）
    { ...merge([box(1.18, 0.05, 0.03, 0, 0.025, 0.29)]), color: MD, name: 'plinth' },
    // レジスクリーン（タブレット型）
    { ...merge([box(0.28, 0.18, 0.015, 0.32, 1.08, 0.05)]), color: [0.10, 0.10, 0.12], name: 'screen' },
    // スクリーンスタンド
    { ...merge([cyl(0.015, 0.02, 0.12, 6, 0.32, 0.98, 0.05)]), color: MD, name: 'screen_stand', metallic: 0.5 },
    { ...merge([box(0.08, 0.01, 0.08, 0.32, 0.94, 0.05)]), color: MD, name: 'screen_base', metallic: 0.5 },
    // カード端末
    { ...merge([box(0.08, 0.02, 0.14, -0.30, 0.94, 0.12)]), color: [0.15, 0.15, 0.15], name: 'card_reader' },
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
    // フレーム（サイドレール）
    { ...merge([box(0.03, 0.24, 1.94, -0.68, 0.12, 0), box(0.03, 0.24, 1.94, 0.68, 0.12, 0)]), color: WL, name: 'side_rails' },
    { ...merge([box(1.36, 0.24, 0.03, 0, 0.12, 0.96)]), color: WL, name: 'footboard' },
    // すのこ
    { ...merge([box(1.32, 0.02, 0.12, 0, 0.23, -0.60), box(1.32, 0.02, 0.12, 0, 0.23, -0.20), box(1.32, 0.02, 0.12, 0, 0.23, 0.20), box(1.32, 0.02, 0.12, 0, 0.23, 0.60)]), color: W, name: 'slats' },
    // 脚
    { ...merge([box(0.06, 0.22, 0.06, -0.64, 0.01, -0.92), box(0.06, 0.22, 0.06, 0.64, 0.01, -0.92), box(0.06, 0.22, 0.06, -0.64, 0.01, 0.92), box(0.06, 0.22, 0.06, 0.64, 0.01, 0.92)]), color: WD, name: 'legs' },
    // マットレス（2層）
    { ...merge([box(1.28, 0.14, 1.86, 0, 0.32, 0)]), color: [0.92, 0.92, 0.95], name: 'mattress' },
    { ...merge([box(1.26, 0.05, 1.84, 0, 0.42, 0)]), color: [0.95, 0.95, 0.98], name: 'mattress_top', roughness: 0.9 },
    // ヘッドボード
    { ...merge([box(1.40, 0.65, 0.04, 0, 0.53, -0.97)]), color: WD, name: 'headboard' },
    { ...merge([box(0.55, 0.48, 0.015, -0.30, 0.50, -0.94), box(0.55, 0.48, 0.015, 0.30, 0.50, -0.94)]), color: W, name: 'hb_panels' },
    // 枕
    { ...merge([box(0.45, 0.08, 0.35, -0.28, 0.50, -0.70)]), color: [0.95, 0.95, 0.98], name: 'pillow', roughness: 0.9 },
    // 掛け布団
    { ...merge([box(1.24, 0.06, 1.10, 0, 0.48, 0.25)]), color: [0.85, 0.85, 0.90], name: 'blanket', roughness: 0.9 },
  ],
  toilet: () => [
    { ...merge([cyl(0.20, 0.18, 0.35, 10, 0, 0.175, 0)]), color: [0.95, 0.95, 0.95], name: 'bowl' },
    { ...merge([box(0.38, 0.45, 0.18, 0, 0.58, -0.12)]), color: [0.95, 0.95, 0.95], name: 'tank' },
    { ...merge([cyl(0.21, 0.21, 0.02, 10, 0, 0.36, 0)]), color: [0.95, 0.95, 0.95], name: 'lid' },
  ],
  armchair: () => [
    // 座面フレーム
    { ...merge([box(0.65, 0.035, 0.55, 0, 0.42, 0)]), color: W, name: 'seat_frame' },
    // 座面クッション（ふっくら2層）
    { ...merge([box(0.52, 0.06, 0.46, 0, 0.47, 0.01)]), color: FR, name: 'cushion', roughness: 0.85 },
    { ...merge([box(0.48, 0.02, 0.42, 0, 0.51, 0.01)]), color: FR, name: 'cushion_top', roughness: 0.85 },
    // 背もたれ（曲面表現: 3段）
    { ...merge([box(0.58, 0.16, 0.035, 0, 0.55, -0.25)]), color: FR, name: 'back_lower', roughness: 0.85 },
    { ...merge([box(0.56, 0.16, 0.03, 0, 0.71, -0.26)]), color: FR, name: 'back_mid', roughness: 0.85 },
    { ...merge([box(0.52, 0.12, 0.025, 0, 0.85, -0.27)]), color: FR, name: 'back_upper', roughness: 0.85 },
    // アームレスト（丸みトップ付き）
    { ...merge([box(0.07, 0.20, 0.48, -0.32, 0.50, 0)]), color: FR, name: 'arm_l', roughness: 0.85 },
    { ...merge([cyl(0.035, 0.035, 0.48, 8, -0.32, 0.61, 0)]), color: FR, name: 'arm_l_top', roughness: 0.85 },
    { ...merge([box(0.07, 0.20, 0.48, 0.32, 0.50, 0)]), color: FR, name: 'arm_r', roughness: 0.85 },
    { ...merge([cyl(0.035, 0.035, 0.48, 8, 0.32, 0.61, 0)]), color: FR, name: 'arm_r_top', roughness: 0.85 },
    // 脚（テーパー円柱）
    { ...merge([cyl(0.018, 0.022, 0.40, 8, -0.28, 0.20, -0.22)]), color: WD, name: 'leg_bl' },
    { ...merge([cyl(0.018, 0.022, 0.40, 8, 0.28, 0.20, -0.22)]), color: WD, name: 'leg_br' },
    { ...merge([cyl(0.018, 0.022, 0.40, 8, -0.28, 0.20, 0.22)]), color: WD, name: 'leg_fl' },
    { ...merge([cyl(0.018, 0.022, 0.40, 8, 0.28, 0.20, 0.22)]), color: WD, name: 'leg_fr' },
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
  booth_sofa: () => {
    const BL = [0.545, 0.271, 0.075]; // brown leather
    const BLD = [0.45, 0.22, 0.06]; // darker brown
    return [
      // 木製ベースフレーム
      { ...merge([box(1.50, 0.10, 0.65, 0, 0.15, 0)]), color: WD, name: 'frame' },
      // 脚
      { ...merge([box(0.05, 0.08, 0.05, -0.68, 0.04, -0.26), box(0.05, 0.08, 0.05, 0.68, 0.04, -0.26), box(0.05, 0.08, 0.05, -0.68, 0.04, 0.26), box(0.05, 0.08, 0.05, 0.68, 0.04, 0.26)]), color: WD, name: 'legs' },
      // 座面クッション2分割
      { ...merge([box(0.66, 0.12, 0.52, -0.35, 0.32, 0.04)]), color: BL, name: 'seat_l', roughness: 0.85 },
      { ...merge([box(0.66, 0.12, 0.52, 0.35, 0.32, 0.04)]), color: BL, name: 'seat_r', roughness: 0.85 },
      // ステッチライン（クッション間）
      { ...merge([box(0.005, 0.13, 0.50, 0, 0.32, 0.04)]), color: BLD, name: 'stitch_center' },
      // 背もたれ（ダイヤモンドタフティング表現: 3分割）
      { ...merge([box(0.44, 0.50, 0.08, -0.46, 0.62, -0.26)]), color: BL, name: 'back_l', roughness: 0.85 },
      { ...merge([box(0.44, 0.52, 0.08, 0, 0.63, -0.26)]), color: BL, name: 'back_c', roughness: 0.85 },
      { ...merge([box(0.44, 0.50, 0.08, 0.46, 0.62, -0.26)]), color: BL, name: 'back_r', roughness: 0.85 },
      // 背もたれステッチライン
      { ...merge([box(0.005, 0.48, 0.085, -0.23, 0.62, -0.26), box(0.005, 0.48, 0.085, 0.23, 0.62, -0.26)]), color: BLD, name: 'back_stitches' },
      // アームレスト（丸みトップ）
      { ...merge([box(0.08, 0.36, 0.58, -0.72, 0.48, 0)]), color: BL, name: 'arm_l', roughness: 0.85 },
      { ...merge([cyl(0.04, 0.04, 0.58, 8, -0.72, 0.67, 0)]), color: BL, name: 'arm_l_top', roughness: 0.85 },
      { ...merge([box(0.08, 0.36, 0.58, 0.72, 0.48, 0)]), color: BL, name: 'arm_r', roughness: 0.85 },
      { ...merge([cyl(0.04, 0.04, 0.58, 8, 0.72, 0.67, 0)]), color: BL, name: 'arm_r_top', roughness: 0.85 },
    ];
  },
  bar_chair: () => [
    // 座面（円形ベース+クッション）
    { ...merge([cyl(0.17, 0.17, 0.03, 12, 0, 0.895, 0)]), color: MD, name: 'seat_base', metallic: 0.5 },
    { ...merge([cyl(0.155, 0.155, 0.03, 12, 0, 0.925, 0)]), color: FR, name: 'cushion', roughness: 0.85 },
    // 背もたれ（湾曲表現: 3パーツ）
    { ...merge([box(0.14, 0.22, 0.02, -0.14, 1.06, -0.14)]), color: MD, name: 'back_l', metallic: 0.5 },
    { ...merge([box(0.12, 0.24, 0.02, 0, 1.07, -0.16)]), color: MD, name: 'back_c', metallic: 0.5 },
    { ...merge([box(0.14, 0.22, 0.02, 0.14, 1.06, -0.14)]), color: MD, name: 'back_r', metallic: 0.5 },
    // 背もたれ上部フレーム
    { ...merge([box(0.34, 0.02, 0.02, 0, 1.19, -0.15)]), color: MD, name: 'back_top', metallic: 0.6 },
    // 細い支柱
    { ...merge([cyl(0.018, 0.022, 0.72, 8, 0, 0.52, 0)]), color: MD, name: 'pole', metallic: 0.7 },
    // ベース（重厚な円盤）
    { ...merge([cyl(0.21, 0.23, 0.025, 12, 0, 0.012, 0)]), color: MD, name: 'base', metallic: 0.7 },
    { ...merge([cyl(0.19, 0.19, 0.01, 12, 0, 0.03, 0)]), color: [0.20, 0.20, 0.24], name: 'base_top', metallic: 0.6 },
    // フットレストリング（円形）
    { ...merge([cyl(0.14, 0.14, 0.015, 12, 0, 0.35, 0)]), color: MD, name: 'footrest_ring', metallic: 0.6 },
    { ...merge([cyl(0.125, 0.125, 0.015, 12, 0, 0.35, 0)]), color: [0.30, 0.30, 0.34], name: 'footrest_inner', metallic: 0.5 },
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
    // 天板（面取りエッジ）
    { ...merge([box(1.40, 0.028, 0.70, 0, 0.74, 0)]), color: WL, name: 'top' },
    { ...merge([box(1.42, 0.008, 0.72, 0, 0.72, 0)]), color: WL, name: 'top_edge' },
    // 金属脚（L字フレーム: 左側）
    { ...merge([box(0.035, 0.72, 0.035, -0.66, 0.36, -0.31)]), color: MS, name: 'leg_lb', metallic: 0.5 },
    { ...merge([box(0.035, 0.72, 0.035, -0.66, 0.36, 0.31)]), color: MS, name: 'leg_lf', metallic: 0.5 },
    { ...merge([box(0.035, 0.035, 0.58, -0.66, 0.02, 0)]), color: MS, name: 'leg_l_base', metallic: 0.5 },
    // 金属脚（L字フレーム: 右側）
    { ...merge([box(0.035, 0.72, 0.035, 0.66, 0.36, -0.31)]), color: MS, name: 'leg_rb', metallic: 0.5 },
    { ...merge([box(0.035, 0.72, 0.035, 0.66, 0.36, 0.31)]), color: MS, name: 'leg_rf', metallic: 0.5 },
    { ...merge([box(0.035, 0.035, 0.58, 0.66, 0.02, 0)]), color: MS, name: 'leg_r_base', metallic: 0.5 },
    // 引き出しユニット（3段）
    { ...merge([box(0.38, 0.56, 0.58, 0.48, 0.43, 0)]), color: W, name: 'drawer_body' },
    { ...merge([box(0.36, 0.16, 0.015, 0.48, 0.62, 0.30), box(0.36, 0.16, 0.015, 0.48, 0.44, 0.30), box(0.36, 0.16, 0.015, 0.48, 0.26, 0.30)]), color: WL, name: 'drawer_fronts' },
    { ...merge([box(0.06, 0.02, 0.02, 0.48, 0.62, 0.32), box(0.06, 0.02, 0.02, 0.48, 0.44, 0.32), box(0.06, 0.02, 0.02, 0.48, 0.26, 0.32)]), color: MS, name: 'drawer_handles', metallic: 0.6 },
    // 背面横桟
    { ...merge([box(1.28, 0.035, 0.02, 0, 0.10, -0.31)]), color: MS, name: 'crossbar', metallic: 0.5 },
    // 配線ダクト
    { ...merge([box(0.40, 0.06, 0.04, -0.20, 0.70, -0.33)]), color: MD, name: 'cable_tray', metallic: 0.3 },
    // 配線穴
    { ...merge([cyl(0.025, 0.025, 0.03, 8, 0.20, 0.74, -0.20)]), color: MD, name: 'cable_hole', metallic: 0.4 },
  ],
  office_chair: () => [
    // 5本脚ベース（星形）
    { ...merge([
      box(0.28, 0.02, 0.03, 0, 0.015, 0),
      box(0.03, 0.02, 0.28, 0, 0.015, 0),
      box(0.20, 0.02, 0.20, 0, 0.015, 0),
      box(0.20, 0.02, 0.20, 0.08, 0.015, -0.08),
    ]), color: MD, name: 'base_star', metallic: 0.6 },
    // キャスター5個
    { ...merge([
      cyl(0.015, 0.015, 0.018, 6, 0.14, 0.005, 0),
      cyl(0.015, 0.015, 0.018, 6, -0.14, 0.005, 0),
      cyl(0.015, 0.015, 0.018, 6, 0, 0.005, 0.14),
      cyl(0.015, 0.015, 0.018, 6, 0, 0.005, -0.14),
      cyl(0.015, 0.015, 0.018, 6, 0.10, 0.005, 0.10),
    ]), color: [0.1, 0.1, 0.1], name: 'casters' },
    // ガスシリンダー
    { ...merge([cyl(0.02, 0.025, 0.28, 8, 0, 0.16, 0)]), color: MD, name: 'cylinder', metallic: 0.7 },
    // 座面プレート
    { ...merge([cyl(0.18, 0.18, 0.025, 10, 0, 0.44, 0)]), color: MD, name: 'seat_plate', metallic: 0.3 },
    // 座面クッション（前方やや広い台形風）
    { ...merge([box(0.44, 0.055, 0.44, 0, 0.48, 0.01)]), color: [0.15, 0.15, 0.15], name: 'cushion', roughness: 0.85 },
    { ...merge([box(0.40, 0.02, 0.40, 0, 0.52, 0.01)]), color: [0.12, 0.12, 0.12], name: 'cushion_top', roughness: 0.85 },
    // 背もたれ（メッシュ表現: 枠+内面）
    { ...merge([box(0.42, 0.03, 0.03, 0, 1.01, -0.20)]), color: MD, name: 'back_top_frame', metallic: 0.4 },
    { ...merge([box(0.42, 0.03, 0.03, 0, 0.58, -0.20)]), color: MD, name: 'back_bot_frame', metallic: 0.4 },
    { ...merge([box(0.02, 0.42, 0.03, -0.20, 0.79, -0.20), box(0.02, 0.42, 0.03, 0.20, 0.79, -0.20)]), color: MD, name: 'back_side_frame', metallic: 0.4 },
    { ...merge([box(0.38, 0.38, 0.015, 0, 0.79, -0.20)]), color: [0.20, 0.20, 0.20], name: 'back_mesh', roughness: 0.9 },
    // ランバーサポート
    { ...merge([box(0.30, 0.08, 0.025, 0, 0.65, -0.18)]), color: [0.12, 0.12, 0.12], name: 'lumbar', roughness: 0.85 },
    // アームレスト（T字型）
    { ...merge([box(0.04, 0.24, 0.03, -0.24, 0.64, -0.05), box(0.04, 0.24, 0.03, 0.24, 0.64, -0.05)]), color: MD, name: 'arm_posts', metallic: 0.4 },
    { ...merge([box(0.04, 0.02, 0.22, -0.24, 0.77, -0.05), box(0.04, 0.02, 0.22, 0.24, 0.77, -0.05)]), color: [0.10, 0.10, 0.10], name: 'arm_pads', roughness: 0.85 },
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
  waiting_sofa: () => {
    const GR = [0.29, 0.40, 0.25]; // green fabric
    const GRD = [0.22, 0.32, 0.18];
    return [
      // 金属フレーム
      { ...merge([box(1.58, 0.08, 0.63, 0, 0.16, 0)]), color: MD, name: 'frame', metallic: 0.3 },
      // 金属脚
      { ...merge([cyl(0.02, 0.02, 0.10, 8, -0.72, 0.05, -0.26), cyl(0.02, 0.02, 0.10, 8, 0.72, 0.05, -0.26), cyl(0.02, 0.02, 0.10, 8, -0.72, 0.05, 0.26), cyl(0.02, 0.02, 0.10, 8, 0.72, 0.05, 0.26)]), color: MD, name: 'legs', metallic: 0.5 },
      // 座面クッション3分割
      { ...merge([box(0.46, 0.12, 0.52, -0.50, 0.32, 0.02)]), color: GR, name: 'seat_l', roughness: 0.85 },
      { ...merge([box(0.46, 0.12, 0.52, 0, 0.32, 0.02)]), color: GR, name: 'seat_c', roughness: 0.85 },
      { ...merge([box(0.46, 0.12, 0.52, 0.50, 0.32, 0.02)]), color: GR, name: 'seat_r', roughness: 0.85 },
      // ステッチライン
      { ...merge([box(0.005, 0.13, 0.50, -0.25, 0.32, 0.02), box(0.005, 0.13, 0.50, 0.25, 0.32, 0.02)]), color: GRD, name: 'seat_stitches' },
      // 背もたれ（分割+厚み）
      { ...merge([box(1.50, 0.34, 0.08, 0, 0.55, -0.27)]), color: GR, name: 'back_main', roughness: 0.85 },
      { ...merge([box(1.46, 0.04, 0.06, 0, 0.74, -0.27)]), color: GRD, name: 'back_top_roll', roughness: 0.85 },
      // アームレスト（丸みトップ）
      { ...merge([box(0.08, 0.22, 0.56, -0.76, 0.40, 0)]), color: GR, name: 'arm_l', roughness: 0.85 },
      { ...merge([cyl(0.04, 0.04, 0.56, 8, -0.76, 0.52, 0)]), color: GR, name: 'arm_l_top', roughness: 0.85 },
      { ...merge([box(0.08, 0.22, 0.56, 0.76, 0.40, 0)]), color: GR, name: 'arm_r', roughness: 0.85 },
      { ...merge([cyl(0.04, 0.04, 0.56, 8, 0.76, 0.52, 0)]), color: GR, name: 'arm_r_top', roughness: 0.85 },
    ];
  },
  // ─── 小売向け ───
  display_shelf: () => [
    // 側板（金属フレーム）
    { ...merge([box(0.025, 1.78, 0.38, -0.57, 0.89, 0), box(0.025, 1.78, 0.38, 0.57, 0.89, 0)]), color: [0.85, 0.85, 0.88], name: 'sides', metallic: 0.3 },
    // 天板
    { ...merge([box(1.16, 0.02, 0.40, 0, 1.78, 0)]), color: [0.90, 0.90, 0.92], name: 'top', metallic: 0.2 },
    // 棚板6段（ガラス風透明感）
    { ...merge([box(1.12, 0.012, 0.36, 0, 0.02, 0), box(1.12, 0.012, 0.36, 0, 0.37, 0), box(1.12, 0.012, 0.36, 0, 0.72, 0), box(1.12, 0.012, 0.36, 0, 1.07, 0), box(1.12, 0.012, 0.36, 0, 1.42, 0)]), color: [0.75, 0.88, 0.92], name: 'glass_shelves' },
    // 棚板ブラケット（各段左右）
    { ...merge([
      box(0.02, 0.03, 0.06, -0.50, 0.02, 0.15), box(0.02, 0.03, 0.06, 0.50, 0.02, 0.15),
      box(0.02, 0.03, 0.06, -0.50, 0.37, 0.15), box(0.02, 0.03, 0.06, 0.50, 0.37, 0.15),
      box(0.02, 0.03, 0.06, -0.50, 0.72, 0.15), box(0.02, 0.03, 0.06, 0.50, 0.72, 0.15),
      box(0.02, 0.03, 0.06, -0.50, 1.07, 0.15), box(0.02, 0.03, 0.06, 0.50, 1.07, 0.15),
      box(0.02, 0.03, 0.06, -0.50, 1.42, 0.15), box(0.02, 0.03, 0.06, 0.50, 1.42, 0.15),
    ]), color: [0.80, 0.80, 0.83], name: 'brackets', metallic: 0.4 },
    // 背板
    { ...merge([box(1.10, 1.76, 0.008, 0, 0.89, -0.19)]), color: [0.90, 0.90, 0.90], name: 'back' },
    // 価格プレートホルダー（前面各段）
    { ...merge([box(1.10, 0.025, 0.005, 0, 0.04, 0.19), box(1.10, 0.025, 0.005, 0, 0.39, 0.19), box(1.10, 0.025, 0.005, 0, 0.74, 0.19)]), color: [0.7, 0.7, 0.72], name: 'price_rails', metallic: 0.3 },
    // ベースキック
    { ...merge([box(1.14, 0.05, 0.03, 0, 0.025, 0.20)]), color: [0.75, 0.75, 0.78], name: 'kick_plate', metallic: 0.3 },
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
  // --- 飲食店 ---
  pizza_oven: () => [
    { ...merge([box(1.0, 0.80, 0.90, 0, 0.40, 0)]), color: [0.75, 0.55, 0.35], name: 'body' },
    { ...merge([cyl(0.50, 0.50, 0.05, 12, 0, 0.82, 0)]), color: [0.65, 0.45, 0.25], name: 'dome_base' },
    { ...merge([cyl(0.45, 0.10, 0.35, 12, 0, 1.02, 0)]), color: [0.65, 0.45, 0.25], name: 'dome' },
    { ...merge([box(0.40, 0.35, 0.02, 0, 0.55, 0.46)]), color: MD, name: 'opening', metallic: 0.5 },
    { ...merge([cyl(0.06, 0.06, 0.30, 6, 0.30, 1.35, -0.20)]), color: [0.55, 0.35, 0.20], name: 'chimney' },
  ],
  beer_server: () => [
    { ...merge([box(0.30, 0.35, 0.25, 0, 0.175, 0)]), color: MS, name: 'body', metallic: 0.6 },
    { ...merge([cyl(0.015, 0.015, 0.20, 6, -0.06, 0.45, 0.05), cyl(0.015, 0.015, 0.20, 6, 0.06, 0.45, 0.05)]), color: [0.85, 0.70, 0.20], name: 'taps', metallic: 0.8 },
    { ...merge([box(0.20, 0.02, 0.15, 0, 0.01, 0.08)]), color: MS, name: 'drip_tray', metallic: 0.7 },
  ],
  ice_cream_case: () => [
    { ...merge([box(1.10, 0.60, 0.65, 0, 0.30, 0)]), color: [0.95, 0.95, 0.95], name: 'body' },
    { ...merge([box(1.0, 0.02, 0.55, 0, 0.62, 0)]), color: [0.7, 0.85, 0.9], name: 'glass_top' },
    { ...merge([box(1.0, 0.30, 0.02, 0, 0.80, -0.27)]), color: [0.7, 0.85, 0.9], name: 'glass_back' },
  ],
  sushi_counter: () => [
    { ...merge([box(2.50, 0.05, 0.70, 0, 0.92, 0)]), color: WL, name: 'top' },
    { ...merge([box(2.46, 0.58, 0.04, 0, 0.62, 0.33), box(0.04, 0.58, 0.66, -1.23, 0.62, 0), box(0.04, 0.58, 0.66, 1.23, 0.62, 0), box(2.46, 0.58, 0.04, 0, 0.62, -0.33)]), color: W, name: 'body' },
    { ...merge([box(2.40, 0.30, 0.02, 0, 1.10, -0.15)]), color: [0.7, 0.85, 0.9], name: 'neta_case' },
    { ...merge([box(2.40, 0.02, 0.20, 0, 0.95, -0.15)]), color: [0.95, 0.95, 0.95], name: 'neta_shelf' },
  ],
  teppan_table: () => [
    { ...merge([box(1.0, 0.04, 0.70, 0, 0.74, 0)]), color: WL, name: 'table_top' },
    { ...merge([box(0.70, 0.03, 0.50, 0, 0.77, 0)]), color: MS, name: 'iron_plate', metallic: 0.8 },
    { ...merge([box(0.04, 0.72, 0.04, -0.46, 0.36, -0.31), box(0.04, 0.72, 0.04, 0.46, 0.36, -0.31), box(0.04, 0.72, 0.04, -0.46, 0.36, 0.31), box(0.04, 0.72, 0.04, 0.46, 0.36, 0.31)]), color: MD, name: 'legs', metallic: 0.5 },
  ],
  noodle_cooker: () => [
    { ...merge([box(0.55, 0.75, 0.55, 0, 0.375, 0)]), color: MS, name: 'body', metallic: 0.6 },
    { ...merge([box(0.45, 0.10, 0.45, 0, 0.80, 0)]), color: MS, name: 'rim', metallic: 0.7 },
    { ...merge([cyl(0.06, 0.06, 0.04, 6, 0.20, 0.55, 0.30)]), color: MD, name: 'knob', metallic: 0.5 },
  ],
  ice_maker: () => [
    { ...merge([box(0.55, 0.85, 0.55, 0, 0.425, 0)]), color: [0.92, 0.92, 0.92], name: 'body' },
    { ...merge([box(0.50, 0.02, 0.50, 0, 0.86, 0)]), color: MS, name: 'top', metallic: 0.4 },
    { ...merge([box(0.04, 0.10, 0.04, 0.22, 0.45, 0.29)]), color: MD, name: 'handle', metallic: 0.6 },
  ],
  // --- ホテル・宿泊 ---
  bed_single: () => [
    // フレーム（サイドレール+フットボード）
    { ...merge([box(0.03, 0.22, 1.90, -0.47, 0.11, 0), box(0.03, 0.22, 1.90, 0.47, 0.11, 0)]), color: WL, name: 'side_rails' },
    { ...merge([box(0.94, 0.22, 0.03, 0, 0.11, 0.94)]), color: WL, name: 'footboard' },
    // すのこ（マットレス受け）
    { ...merge([box(0.90, 0.02, 0.12, 0, 0.21, -0.60), box(0.90, 0.02, 0.12, 0, 0.21, -0.20), box(0.90, 0.02, 0.12, 0, 0.21, 0.20), box(0.90, 0.02, 0.12, 0, 0.21, 0.60)]), color: W, name: 'slats' },
    // 脚
    { ...merge([box(0.05, 0.20, 0.05, -0.44, 0.00, -0.90), box(0.05, 0.20, 0.05, 0.44, 0.00, -0.90), box(0.05, 0.20, 0.05, -0.44, 0.00, 0.90), box(0.05, 0.20, 0.05, 0.44, 0.00, 0.90)]), color: WD, name: 'legs' },
    // マットレス（2層: スプリング+トップ）
    { ...merge([box(0.88, 0.12, 1.82, 0, 0.29, 0)]), color: [0.92, 0.92, 0.95], name: 'mattress_base' },
    { ...merge([box(0.86, 0.05, 1.80, 0, 0.38, 0)]), color: [0.95, 0.95, 0.98], name: 'mattress_top', roughness: 0.9 },
    // ヘッドボード（パネル分割）
    { ...merge([box(0.97, 0.60, 0.04, 0, 0.50, -0.96)]), color: WD, name: 'headboard_frame' },
    { ...merge([box(0.40, 0.45, 0.015, -0.22, 0.48, -0.93)]), color: W, name: 'headboard_panel_l' },
    { ...merge([box(0.40, 0.45, 0.015, 0.22, 0.48, -0.93)]), color: W, name: 'headboard_panel_r' },
    // 枕
    { ...merge([box(0.32, 0.07, 0.25, -0.18, 0.45, -0.72)]), color: [0.95, 0.95, 0.98], name: 'pillow', roughness: 0.9 },
    // 掛け布団
    { ...merge([box(0.84, 0.06, 1.10, 0, 0.44, 0.25)]), color: [0.85, 0.85, 0.90], name: 'blanket', roughness: 0.9 },
  ],
  bed_double: () => [
    // フレーム（サイドレール+フットボード）
    { ...merge([box(0.03, 0.22, 1.90, -0.76, 0.11, 0), box(0.03, 0.22, 1.90, 0.76, 0.11, 0)]), color: WL, name: 'side_rails' },
    { ...merge([box(1.52, 0.22, 0.03, 0, 0.11, 0.94)]), color: WL, name: 'footboard' },
    // すのこ
    { ...merge([box(1.48, 0.02, 0.12, 0, 0.21, -0.60), box(1.48, 0.02, 0.12, 0, 0.21, -0.20), box(1.48, 0.02, 0.12, 0, 0.21, 0.20), box(1.48, 0.02, 0.12, 0, 0.21, 0.60)]), color: W, name: 'slats' },
    // 中央補強
    { ...merge([box(0.04, 0.20, 1.86, 0, 0.11, 0)]), color: WL, name: 'center_support' },
    // 脚
    { ...merge([box(0.05, 0.20, 0.05, -0.72, 0.00, -0.90), box(0.05, 0.20, 0.05, 0.72, 0.00, -0.90), box(0.05, 0.20, 0.05, -0.72, 0.00, 0.90), box(0.05, 0.20, 0.05, 0.72, 0.00, 0.90), box(0.05, 0.20, 0.05, 0, 0.00, -0.90), box(0.05, 0.20, 0.05, 0, 0.00, 0.90)]), color: WD, name: 'legs' },
    // マットレス（2層）
    { ...merge([box(1.44, 0.12, 1.82, 0, 0.29, 0)]), color: [0.92, 0.92, 0.95], name: 'mattress_base' },
    { ...merge([box(1.42, 0.05, 1.80, 0, 0.38, 0)]), color: [0.95, 0.95, 0.98], name: 'mattress_top', roughness: 0.9 },
    // ヘッドボード（装飾パネル3分割）
    { ...merge([box(1.55, 0.65, 0.04, 0, 0.52, -0.96)]), color: WD, name: 'headboard_frame' },
    { ...merge([box(0.42, 0.48, 0.015, -0.42, 0.48, -0.93)]), color: W, name: 'hb_panel_l' },
    { ...merge([box(0.42, 0.48, 0.015, 0, 0.48, -0.93)]), color: W, name: 'hb_panel_c' },
    { ...merge([box(0.42, 0.48, 0.015, 0.42, 0.48, -0.93)]), color: W, name: 'hb_panel_r' },
    // 枕2個
    { ...merge([box(0.30, 0.07, 0.24, -0.32, 0.45, -0.72)]), color: [0.95, 0.95, 0.98], name: 'pillow_l', roughness: 0.9 },
    { ...merge([box(0.30, 0.07, 0.24, 0.32, 0.45, -0.72)]), color: [0.95, 0.95, 0.98], name: 'pillow_r', roughness: 0.9 },
    // 掛け布団
    { ...merge([box(1.40, 0.06, 1.10, 0, 0.44, 0.25)]), color: [0.85, 0.85, 0.90], name: 'blanket', roughness: 0.9 },
  ],
  night_table: () => [
    { ...merge([box(0.40, 0.03, 0.35, 0, 0.52, 0)]), color: WL, name: 'top' },
    { ...merge([box(0.38, 0.20, 0.33, 0, 0.40, 0)]), color: W, name: 'drawer' },
    { ...merge([box(0.38, 0.18, 0.33, 0, 0.18, 0)]), color: W, name: 'cabinet' },
    { ...merge([box(0.06, 0.02, 0.03, 0, 0.40, 0.18)]), color: MS, name: 'handle', metallic: 0.6 },
  ],
  dresser: () => [
    { ...merge([box(0.75, 0.03, 0.40, 0, 0.78, 0)]), color: WL, name: 'top' },
    { ...merge([box(0.73, 0.50, 0.38, 0, 0.50, 0)]), color: W, name: 'drawers' },
    { ...merge([box(0.60, 0.50, 0.03, 0, 1.08, -0.18)]), color: [0.85, 0.88, 0.92], name: 'mirror', metallic: 0.9 },
    { ...merge([box(0.64, 0.54, 0.02, 0, 1.08, -0.20)]), color: WD, name: 'mirror_frame' },
    { ...merge([box(0.04, 0.75, 0.04, -0.34, 0.375, -0.16), box(0.04, 0.75, 0.04, 0.34, 0.375, -0.16)]), color: WD, name: 'legs' },
  ],
  room_service_cart: () => [
    { ...merge([box(0.70, 0.02, 0.45, 0, 0.80, 0)]), color: MS, name: 'top_shelf', metallic: 0.6 },
    { ...merge([box(0.70, 0.02, 0.45, 0, 0.40, 0)]), color: MS, name: 'bottom_shelf', metallic: 0.6 },
    { ...merge([cyl(0.02, 0.02, 0.78, 6, -0.32, 0.40, -0.20), cyl(0.02, 0.02, 0.78, 6, 0.32, 0.40, -0.20), cyl(0.02, 0.02, 0.78, 6, -0.32, 0.40, 0.20), cyl(0.02, 0.02, 0.78, 6, 0.32, 0.40, 0.20)]), color: MS, name: 'poles', metallic: 0.7 },
    { ...merge([cyl(0.03, 0.03, 0.02, 6, -0.32, 0.01, -0.20), cyl(0.03, 0.03, 0.02, 6, 0.32, 0.01, -0.20), cyl(0.03, 0.03, 0.02, 6, -0.32, 0.01, 0.20), cyl(0.03, 0.03, 0.02, 6, 0.32, 0.01, 0.20)]), color: MD, name: 'wheels', metallic: 0.5 },
  ],
  // --- カフェ・バー ---
  espresso_machine: () => [
    { ...merge([box(0.40, 0.40, 0.40, 0, 0.20, 0)]), color: MD, name: 'body', metallic: 0.5 },
    { ...merge([box(0.10, 0.08, 0.02, -0.08, 0.45, -0.12), box(0.10, 0.08, 0.02, 0.08, 0.45, -0.12)]), color: [0.2, 0.3, 0.5], name: 'displays' },
    { ...merge([cyl(0.02, 0.02, 0.08, 6, -0.08, 0.10, 0.22), cyl(0.02, 0.02, 0.08, 6, 0.08, 0.10, 0.22)]), color: MS, name: 'spouts', metallic: 0.7 },
    { ...merge([box(0.15, 0.02, 0.12, 0, 0.05, 0.18)]), color: MS, name: 'drip_tray', metallic: 0.6 },
  ],
  cake_showcase: () => [
    { ...merge([box(1.10, 0.50, 0.65, 0, 0.25, 0)]), color: [0.95, 0.95, 0.95], name: 'base' },
    { ...merge([box(1.06, 0.60, 0.02, 0, 0.80, 0.31), box(1.06, 0.60, 0.02, 0, 0.80, -0.31), box(0.02, 0.60, 0.62, 0.53, 0.80, 0), box(0.02, 0.60, 0.62, -0.53, 0.80, 0)]), color: [0.7, 0.85, 0.9], name: 'glass' },
    { ...merge([box(1.10, 0.03, 0.65, 0, 1.12, 0)]), color: [0.95, 0.95, 0.95], name: 'top' },
    { ...merge([box(1.02, 0.02, 0.58, 0, 0.75, 0)]), color: [0.95, 0.95, 0.95], name: 'shelf' },
  ],
  ice_bin: () => [
    { ...merge([box(0.45, 0.40, 0.35, 0, 0.20, 0)]), color: MS, name: 'body', metallic: 0.6 },
    { ...merge([box(0.47, 0.02, 0.37, 0, 0.41, 0)]), color: MS, name: 'rim', metallic: 0.7 },
    { ...merge([box(0.04, 0.06, 0.04, 0.18, 0.44, 0)]), color: MD, name: 'handle', metallic: 0.6 },
  ],
  cocktail_station: () => [
    { ...merge([box(1.10, 0.04, 0.55, 0, 0.90, 0)]), color: MS, name: 'top', metallic: 0.5 },
    { ...merge([box(1.06, 0.56, 0.51, 0, 0.61, 0)]), color: MD, name: 'body', metallic: 0.3 },
    { ...merge([box(0.30, 0.12, 0.30, -0.30, 0.72, 0)]), color: MS, name: 'sink', metallic: 0.7 },
    { ...merge([box(0.40, 0.20, 0.10, 0.25, 1.05, -0.20)]), color: WD, name: 'speed_rail' },
  ],
  // --- ジム・スパ ---
  treadmill: () => [
    { ...merge([box(0.70, 0.08, 1.50, 0, 0.15, 0)]), color: MD, name: 'deck' },
    { ...merge([box(0.65, 0.04, 1.40, 0, 0.20, 0)]), color: [0.15, 0.15, 0.15], name: 'belt', roughness: 0.9 },
    { ...merge([cyl(0.03, 0.03, 1.10, 6, -0.30, 0.75, -0.50), cyl(0.03, 0.03, 1.10, 6, 0.30, 0.75, -0.50)]), color: MD, name: 'uprights', metallic: 0.5 },
    { ...merge([box(0.55, 0.10, 0.10, 0, 1.30, -0.50)]), color: MD, name: 'console' },
    { ...merge([box(0.30, 0.08, 0.02, 0, 1.35, -0.48)]), color: [0.2, 0.3, 0.5], name: 'display' },
    { ...merge([box(0.50, 0.03, 0.08, 0, 1.05, -0.50)]), color: MD, name: 'handlebar', metallic: 0.6 },
  ],
  dumbbell_rack: () => [
    { ...merge([box(0.03, 1.10, 0.45, -0.55, 0.55, 0), box(0.03, 1.10, 0.45, 0.55, 0.55, 0)]), color: MD, name: 'sides', metallic: 0.5 },
    { ...merge([box(1.10, 0.03, 0.40, 0, 0.10, 0), box(1.10, 0.03, 0.40, 0, 0.40, 0), box(1.10, 0.03, 0.40, 0, 0.70, 0), box(1.10, 0.03, 0.40, 0, 1.00, 0)]), color: MS, name: 'shelves', metallic: 0.4 },
    { ...merge([cyl(0.03, 0.03, 0.15, 6, -0.30, 0.22, 0.05), cyl(0.03, 0.03, 0.15, 6, 0, 0.22, 0.05), cyl(0.03, 0.03, 0.15, 6, 0.30, 0.22, 0.05)]), color: [0.2, 0.2, 0.2], name: 'dumbbells' },
  ],
  yoga_mat: () => [
    { ...merge([box(0.60, 0.008, 1.70, 0, 0.004, 0)]), color: [0.42, 0.36, 0.58], name: 'mat', roughness: 0.95 },
  ],
  locker: () => [
    { ...merge([box(0.85, 1.75, 0.45, 0, 0.875, 0)]), color: MS, name: 'body', metallic: 0.5 },
    { ...merge([box(0.02, 1.70, 0.01, 0, 0.875, 0.23)]), color: MD, name: 'divider', metallic: 0.4 },
    { ...merge([box(0.04, 0.08, 0.04, -0.20, 0.90, 0.25), box(0.04, 0.08, 0.04, 0.20, 0.90, 0.25)]), color: MD, name: 'handles', metallic: 0.6 },
    { ...merge([box(0.82, 0.02, 0.40, 0, 0.88, 0)]), color: [0.6, 0.6, 0.65], name: 'shelf', metallic: 0.4 },
  ],
  sauna_bench: () => [
    { ...merge([box(1.30, 0.04, 0.40, 0, 0.44, 0)]), color: WL, name: 'seat' },
    { ...merge([box(0.06, 0.43, 0.35, -0.55, 0.215, 0), box(0.06, 0.43, 0.35, 0.55, 0.215, 0), box(0.06, 0.43, 0.35, 0, 0.215, 0)]), color: W, name: 'legs' },
  ],
  // --- その他共通 ---
  water_server: () => [
    { ...merge([box(0.30, 0.90, 0.30, 0, 0.45, 0)]), color: [0.95, 0.95, 0.95], name: 'body' },
    { ...merge([cyl(0.12, 0.12, 0.30, 8, 0, 1.05, 0)]), color: [0.7, 0.85, 0.95], name: 'bottle' },
    { ...merge([box(0.08, 0.04, 0.06, 0, 0.50, 0.17)]), color: [0.2, 0.5, 0.8], name: 'tap_cold' },
    { ...merge([box(0.08, 0.04, 0.06, 0, 0.60, 0.17)]), color: [0.8, 0.2, 0.2], name: 'tap_hot' },
  ],
  air_purifier: () => [
    { ...merge([box(0.35, 0.55, 0.20, 0, 0.275, 0)]), color: [0.95, 0.95, 0.95], name: 'body' },
    { ...merge([box(0.25, 0.15, 0.02, 0, 0.48, 0.11)]), color: [0.85, 0.85, 0.85], name: 'vent' },
    { ...merge([box(0.08, 0.04, 0.02, 0.10, 0.30, 0.11)]), color: [0.2, 0.5, 0.3], name: 'indicator' },
  ],
  projector: () => [
    { ...merge([box(0.30, 0.08, 0.24, 0, 0.04, 0)]), color: [0.15, 0.15, 0.15], name: 'body' },
    { ...merge([cyl(0.04, 0.04, 0.03, 8, 0, 0.04, 0.14)]), color: [0.2, 0.3, 0.5], name: 'lens' },
    { ...merge([box(0.20, 0.02, 0.16, 0, -0.01, 0)]), color: MD, name: 'base' },
  ],
  speaker: () => [
    { ...merge([box(0.22, 0.30, 0.18, 0, 0.15, 0)]), color: [0.12, 0.12, 0.12], name: 'body' },
    { ...merge([cyl(0.06, 0.06, 0.02, 8, 0, 0.20, 0.10)]), color: [0.2, 0.2, 0.2], name: 'woofer' },
    { ...merge([cyl(0.025, 0.025, 0.02, 8, 0, 0.08, 0.10)]), color: [0.2, 0.2, 0.2], name: 'tweeter' },
  ],
  security_camera: () => [
    { ...merge([box(0.08, 0.06, 0.04, 0, 0.03, -0.04)]), color: [0.95, 0.95, 0.95], name: 'mount' },
    { ...merge([cyl(0.03, 0.03, 0.10, 8, 0, 0.03, 0.02)]), color: [0.95, 0.95, 0.95], name: 'body' },
    { ...merge([cyl(0.02, 0.015, 0.04, 6, 0, 0.03, 0.09)]), color: MD, name: 'lens', metallic: 0.5 },
  ],
  guide_board: () => [
    { ...merge([box(0.55, 0.75, 0.03, 0, 0.95, 0)]), color: [0.15, 0.15, 0.15], name: 'board' },
    { ...merge([box(0.59, 0.79, 0.02, 0, 0.95, -0.02)]), color: MS, name: 'frame', metallic: 0.5 },
    { ...merge([cyl(0.025, 0.03, 0.55, 6, 0, 0.28, 0)]), color: MS, name: 'pole', metallic: 0.6 },
    { ...merge([cyl(0.18, 0.20, 0.03, 8, 0, 0.015, 0)]), color: MD, name: 'base', metallic: 0.5 },
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
