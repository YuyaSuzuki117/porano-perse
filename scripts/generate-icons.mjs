// Generate PWA icons as simple PNG files with "PP" logo
// Run: node scripts/generate-icons.mjs

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

function generateIcon(size, outputPath) {
  // Since we may not have 'canvas' package, generate via a simpler approach
  // We'll create a minimal valid PNG programmatically
  console.log(`Would generate ${size}x${size} icon at ${outputPath}`);
}

// Alternative: create SVG and let the browser handle it
// For now, create a simple HTML file that generates the PNGs

const html = `<!DOCTYPE html>
<html>
<body>
<canvas id="c192" width="192" height="192"></canvas>
<canvas id="c512" width="512" height="512"></canvas>
<script>
function draw(canvas, size) {
  const ctx = canvas.getContext('2d');
  // Blue gradient background
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#2563EB');
  grad.addColorStop(1, '#1D4ED8');
  ctx.fillStyle = grad;
  // Rounded rect
  const r = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // "PP" text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold ' + (size * 0.4) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PP', size/2, size/2 - size*0.05);

  // Small "3D" subtitle
  ctx.font = (size * 0.12) + 'px sans-serif';
  ctx.fillText('3D', size/2, size/2 + size*0.22);
}
draw(document.getElementById('c192'), 192);
draw(document.getElementById('c512'), 512);

// Right-click each canvas to save as PNG
document.querySelectorAll('canvas').forEach(c => {
  const link = document.createElement('a');
  link.download = 'icon-' + c.width + '.png';
  link.href = c.toDataURL('image/png');
  link.textContent = 'Download ' + c.width;
  link.style.display = 'block';
  document.body.appendChild(link);
});
</script>
</body>
</html>`;

writeFileSync('scripts/generate-icons.html', html);
console.log('Open scripts/generate-icons.html in browser and click download links');
console.log('Save files as public/icon-192.png and public/icon-512.png');
