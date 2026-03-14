/**
 * インタラクティブ3Dビューア HTMLエクスポート
 *
 * プロジェクトデータを埋め込んだスタンドアロンHTMLファイルを生成する。
 * Three.js を CDN から読み込み、壁・床・家具をボックスジオメトリで描画。
 * OrbitControls 付きで、モバイルでもレスポンシブに動作する。
 */

/**
 * スタンドアロンのインタラクティブ3Dビューア HTML を生成する
 *
 * @param projectJson - プロジェクトデータの JSON 文字列
 * @param thumbnail - サムネイル画像のデータURL（ロード画面用）
 * @returns 完全な HTML 文字列
 */
export function generateInteractiveViewer(
  projectJson: string,
  thumbnail: string,
): string {
  // JSON をエスケープ（HTML埋め込み用）
  const escapedJson = projectJson
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>ポラーノパース — 3Dビューア</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
  #canvas-container { width: 100%; height: 100%; position: relative; }
  canvas { display: block; width: 100%; height: 100%; }

  /* ローディング画面 */
  #loading {
    position: fixed; inset: 0; z-index: 100;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: #1a1a2e; color: #e0e0e0;
    font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
    transition: opacity 0.5s;
  }
  #loading.hidden { opacity: 0; pointer-events: none; }
  #loading img {
    max-width: 300px; max-height: 200px;
    border-radius: 12px; margin-bottom: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }
  #loading h2 { font-size: 18px; font-weight: 400; margin-bottom: 10px; }
  .spinner {
    width: 36px; height: 36px;
    border: 3px solid rgba(255,255,255,0.15);
    border-top-color: #64b5f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* UIオーバーレイ */
  #ui-overlay {
    position: fixed; top: 12px; left: 12px; z-index: 10;
    display: flex; flex-direction: column; gap: 8px;
    font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
  }
  .ui-btn {
    background: rgba(0,0,0,0.6); color: #e0e0e0;
    border: 1px solid rgba(255,255,255,0.15);
    padding: 8px 14px; border-radius: 8px;
    cursor: pointer; font-size: 13px;
    backdrop-filter: blur(8px);
    transition: background 0.2s;
  }
  .ui-btn:hover { background: rgba(60,60,100,0.8); }
  .ui-btn.active { background: rgba(100,181,246,0.3); border-color: #64b5f6; }

  #info-panel {
    position: fixed; bottom: 12px; left: 12px; z-index: 10;
    background: rgba(0,0,0,0.6); color: #c0c0c0;
    padding: 10px 16px; border-radius: 8px;
    font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
    font-size: 12px; line-height: 1.6;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1);
    max-width: 280px;
  }

  /* レスポンシブ */
  @media (max-width: 600px) {
    .ui-btn { padding: 10px 12px; font-size: 14px; }
    #info-panel { font-size: 11px; max-width: 200px; }
  }
</style>
</head>
<body>

<div id="loading">
  ${thumbnail ? `<img src="${thumbnail}" alt="プレビュー">` : ''}
  <h2>3Dビューアを読み込み中...</h2>
  <div class="spinner"></div>
</div>

<div id="canvas-container"></div>

<div id="ui-overlay">
  <button class="ui-btn" id="btn-reset" title="視点リセット">🔄 リセット</button>
  <button class="ui-btn" id="btn-wireframe" title="ワイヤーフレーム切替">📐 ワイヤー</button>
  <button class="ui-btn" id="btn-grid" title="グリッド表示切替">🔲 グリッド</button>
</div>

<div id="info-panel">
  <div>マウス: 回転 | スクロール: ズーム</div>
  <div>右クリック: パン | タッチ対応</div>
</div>

<!-- Three.js CDN -->
<script src="https://unpkg.com/three@0.164.1/build/three.module.min.js" type="module"></script>
<script type="module">
import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.min.js';
import { OrbitControls } from 'https://unpkg.com/three@0.164.1/examples/jsm/controls/OrbitControls.js';

// プロジェクトデータ
const PROJECT_DATA = JSON.parse('${escapedJson}');

// シーン初期化
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 20, 50);

// カメラ
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 100);
const initialPos = PROJECT_DATA.cameraPosition || [5, 4, 5];
camera.position.set(initialPos[0], initialPos[1], initialPos[2]);

// レンダラー
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

// コントロール
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.85;
controls.minDistance = 1;
controls.maxDistance = 30;
const targetPos = PROJECT_DATA.cameraTarget || [0, 0, 0];
controls.target.set(targetPos[0], targetPos[1], targetPos[2]);

// === ライティング ===

// 環境光
const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
scene.add(ambientLight);

// ヘミスフィアライト（空+地面）
const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x444422, 0.5);
scene.add(hemiLight);

// メインディレクショナルライト（太陽光シミュレーション）
const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.2);
dirLight.position.set(5, 8, 3);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 25;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
scene.add(dirLight);

// フィルライト
const fillLight = new THREE.DirectionalLight(0x8090b0, 0.4);
fillLight.position.set(-3, 4, -2);
scene.add(fillLight);

// === 部屋の構築 ===

const walls = PROJECT_DATA.walls || [];
const furniture = PROJECT_DATA.furniture || [];
const room = PROJECT_DATA.room || { width: 6, depth: 5, height: 2.7 };
const roomHeight = room.height || 2.7;

// 床
let floorWidth = room.width || 6;
let floorDepth = room.depth || 5;

// 壁データから床サイズを推定
if (walls.length > 0) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  walls.forEach(w => {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minZ = Math.min(minZ, w.start.y, w.end.y);
    maxZ = Math.max(maxZ, w.start.y, w.end.y);
  });
  floorWidth = maxX - minX;
  floorDepth = maxZ - minZ;
}

const floorGeo = new THREE.PlaneGeometry(floorWidth + 0.2, floorDepth + 0.2);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0xc4a882, roughness: 0.7, metalness: 0.0,
});
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

// 壁の描画
const wallMat = new THREE.MeshStandardMaterial({
  color: 0xf0ebe0, roughness: 0.85, metalness: 0.0,
  side: THREE.DoubleSide,
});

walls.forEach(w => {
  const sx = w.start.x;
  const sz = w.start.y; // 2DのYは3DのZ
  const ex = w.end.x;
  const ez = w.end.y;
  const dx = ex - sx;
  const dz = ez - sz;
  const wallLen = Math.sqrt(dx * dx + dz * dz);
  if (wallLen < 0.01) return;

  const thickness = w.thickness || 0.12;
  const height = w.height || roomHeight;

  const wallGeo = new THREE.BoxGeometry(wallLen, height, thickness);
  const wallMesh = new THREE.Mesh(wallGeo, w.color
    ? new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.85, side: THREE.DoubleSide })
    : wallMat.clone()
  );

  // 壁の中央座標
  wallMesh.position.set(
    (sx + ex) / 2,
    height / 2,
    (sz + ez) / 2,
  );

  // 壁の回転角度
  const angle = Math.atan2(dz, dx);
  wallMesh.rotation.y = -angle;
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  scene.add(wallMesh);
});

// === 家具の描画 ===

// 家具タイプ別のデフォルト色
const FURNITURE_COLORS = {
  counter: 0x8b7355, table_square: 0xa0845c, table_round: 0xa0845c,
  chair: 0x6b5b45, stool: 0x7a6a54, sofa: 0x607080,
  shelf: 0x8b7355, pendant_light: 0xe0d0c0, plant: 0x4a7a3a,
  partition: 0xb0a090, register: 0x505050, sink: 0xd0d0d0,
  fridge: 0xe8e8e8, display_case: 0xb0c4de, bench: 0x6b5b45,
  mirror: 0xc0c8d0, reception_desk: 0x8b7355, tv_monitor: 0x202020,
  desk: 0x8b7355, bookcase: 0x7a5c3a, rug: 0x8b6550,
  curtain: 0xd0c0a0, clock: 0x404040, trash_can: 0x606060,
};

furniture.forEach(item => {
  const sx = item.scale[0] || 1;
  const sy = item.scale[1] || 1;
  const sz = item.scale[2] || 1;
  const color = item.color
    ? new THREE.Color(item.color)
    : new THREE.Color(FURNITURE_COLORS[item.type] || 0x888888);

  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: item.material === 'metal' ? 0.3 : 0.7,
    metalness: item.material === 'metal' ? 0.6 : 0.0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(
    item.position[0] || 0,
    item.position[1] || sy / 2,
    item.position[2] || 0,
  );
  if (item.rotation) {
    mesh.rotation.set(item.rotation[0] || 0, item.rotation[1] || 0, item.rotation[2] || 0);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.name = item.name || item.type;
  scene.add(mesh);
});

// グリッド
const gridHelper = new THREE.GridHelper(20, 40, 0x444466, 0x333355);
gridHelper.position.y = 0.001;
scene.add(gridHelper);

// === UI制御 ===

let wireframeMode = false;
let gridVisible = true;

document.getElementById('btn-reset').addEventListener('click', () => {
  camera.position.set(initialPos[0], initialPos[1], initialPos[2]);
  controls.target.set(targetPos[0], targetPos[1], targetPos[2]);
  controls.update();
});

document.getElementById('btn-wireframe').addEventListener('click', (e) => {
  wireframeMode = !wireframeMode;
  e.target.classList.toggle('active', wireframeMode);
  scene.traverse(obj => {
    if (obj.isMesh && obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => { m.wireframe = wireframeMode; });
      } else {
        obj.material.wireframe = wireframeMode;
      }
    }
  });
});

document.getElementById('btn-grid').addEventListener('click', (e) => {
  gridVisible = !gridVisible;
  e.target.classList.toggle('active', !gridVisible);
  gridHelper.visible = gridVisible;
});

// === リサイズ対応 ===

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// === アニメーションループ ===

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ローディング画面を非表示にして開始
const loading = document.getElementById('loading');
loading.classList.add('hidden');
setTimeout(() => { loading.style.display = 'none'; }, 600);

animate();
</script>
</body>
</html>`;
}

/**
 * HTML文字列をBlobとしてダウンロードする
 *
 * @param html - ダウンロード対象の HTML 文字列
 * @param filename - ファイル名（.html 拡張子推奨）
 */
export function downloadViewerHTML(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();

  // クリーンアップ
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}
