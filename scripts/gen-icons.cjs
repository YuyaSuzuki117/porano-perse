// Generate minimal valid PNG icons for PWA
const { writeFileSync } = require('fs');
const { join } = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let cc = n;
    for (let k = 0; k < 8; k++) {
      cc = (cc & 1) ? (0xEDB88320 ^ (cc >>> 1)) : (cc >>> 1);
    }
    table[n] = cc;
  }
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

function createPNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // RGB color
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowLen = 1 + size * 3;
  const rawData = Buffer.alloc(rowLen * size);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0; // no filter

    for (let x = 0; x < size; x++) {
      const px = rowOffset + 1 + x * 3;
      const cx = x / size;
      const cy = y / size;

      // Blue gradient background
      const blueBase = Math.round(0x25 + (0x1D - 0x25) * (cx + cy) / 2);
      const greenBase = Math.round(0x63 + (0x4E - 0x63) * (cx + cy) / 2);
      const redBase = Math.round(0xEB + (0xD8 - 0xEB) * (cx + cy) / 2);

      let r = blueBase, g = greenBase, b = redBase;

      // Draw "PP" as simple block letters
      const isP1 = drawP(cx, cy, 0.18, 0.28);
      const isP2 = drawP(cx, cy, 0.48, 0.28);
      // Draw "3D" smaller below
      const is3 = draw3(cx, cy, 0.28, 0.62);
      const isD = drawD(cx, cy, 0.52, 0.62);

      if (isP1 || isP2 || is3 || isD) {
        r = 255; g = 255; b = 255;
      }

      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Simple block letter drawing functions (normalized 0-1 coords)
function drawP(cx, cy, ox, oy) {
  const x = cx - ox, y = cy - oy;
  const w = 0.22, h = 0.38;
  const t = 0.05; // stroke thickness
  if (x < 0 || x > w || y < 0 || y > h) return false;
  // Left vertical bar
  if (x < t) return true;
  // Top horizontal
  if (y < t && x < w - t) return true;
  // Middle horizontal
  if (y > h * 0.45 && y < h * 0.45 + t && x < w - t) return true;
  // Right vertical (top half only)
  if (x > w - t * 2 && y < h * 0.45 + t) return true;
  return false;
}

function draw3(cx, cy, ox, oy) {
  const x = cx - ox, y = cy - oy;
  const w = 0.15, h = 0.18;
  const t = 0.03;
  if (x < 0 || x > w || y < 0 || y > h) return false;
  if (y < t) return true; // top
  if (y > h * 0.45 && y < h * 0.45 + t) return true; // middle
  if (y > h - t) return true; // bottom
  if (x > w - t * 2) return true; // right bar
  return false;
}

function drawD(cx, cy, ox, oy) {
  const x = cx - ox, y = cy - oy;
  const w = 0.15, h = 0.18;
  const t = 0.03;
  if (x < 0 || x > w || y < 0 || y > h) return false;
  if (x < t) return true; // left bar
  if (y < t && x < w - t) return true; // top
  if (y > h - t && x < w - t) return true; // bottom
  if (x > w - t * 2) return true; // right bar
  return false;
}

const outDir = join(__dirname, '..', 'public');
writeFileSync(join(outDir, 'icon-192.png'), createPNG(192));
writeFileSync(join(outDir, 'icon-512.png'), createPNG(512));
console.log('Generated: public/icon-192.png and public/icon-512.png');
