'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '@/stores/useEditorStore';

interface WalkthroughPoint {
  position: [number, number, number];
  target: [number, number, number];
  /** Duration multiplier for this segment (1.0 = normal) */
  durationScale?: number;
}

/** Speed multipliers for walkthrough */
const SPEED_MAP: Record<string, number> = {
  slow: 0.3,
  normal: 0.6,
  fast: 1.2,
};

/**
 * Generate cinematic walkthrough waypoints:
 * 1. Start at entrance (door or corner)
 * 2. Move to room center
 * 3. 360-degree panoramic rotation
 * 4. Visit furniture clusters
 * 5. End at overview angle
 */
function generateCinematicWaypoints(
  walls: { start: { x: number; y: number }; end: { x: number; y: number } }[],
  roomHeight: number,
  furniture: { position: [number, number, number] }[],
  openings: { wallId: string; type: string }[]
): WalkthroughPoint[] {
  // Default room if no walls
  if (walls.length === 0) {
    return [
      { position: [3, 1.6, 3], target: [0, 1, 0] },
      { position: [0, 1.6, 0], target: [2, 1, 0] },
      { position: [0, 1.6, 0], target: [0, 1, -2] },
      { position: [0, 1.6, 0], target: [-2, 1, 0] },
      { position: [0, 1.6, 0], target: [0, 1, 2] },
      { position: [-3, 1.6, -3], target: [0, 1, 0] },
      { position: [3, 3.5, 3], target: [0, 0, 0] },
    ];
  }

  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const zs = walls.flatMap((w) => [w.start.y, w.end.y]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const eyeH = Math.min(1.6, roomHeight * 0.55);
  const lookH = roomHeight * 0.35;
  const margin = 0.5;
  const maxDim = Math.max(w, d);

  const points: WalkthroughPoint[] = [];

  // 1. Start at entrance (maxZ corner - typically entrance side)
  const startX = minX + margin;
  const startZ = maxZ - margin;
  points.push({
    position: [startX, eyeH, startZ],
    target: [cx, lookH, cz],
    durationScale: 1.2,
  });

  // 2. Move to room center
  points.push({
    position: [cx, eyeH, cz],
    target: [maxX - margin, lookH, cz],
    durationScale: 1.0,
  });

  // 3. 360-degree panoramic rotation at center (4 waypoints)
  const panRadius = 0.1; // Slight offset for natural feel
  const panTargetDist = Math.max(w, d) * 0.4;
  const panAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  for (const angle of panAngles) {
    points.push({
      position: [cx + Math.cos(angle) * panRadius, eyeH, cz + Math.sin(angle) * panRadius],
      target: [
        cx + Math.cos(angle) * panTargetDist,
        lookH,
        cz + Math.sin(angle) * panTargetDist,
      ],
      durationScale: 0.8,
    });
  }

  // 4. Visit furniture clusters
  if (furniture.length > 0) {
    // K-means-ish clustering: group furniture by proximity
    const clusters = clusterFurniture(furniture, minX, maxX, minZ, maxZ);
    for (const cluster of clusters.slice(0, 4)) {
      // Position camera offset from cluster center, looking at cluster
      const dx = cluster.x - cx;
      const dz = cluster.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const offsetScale = dist > 0.5 ? 1.2 / dist : 1.5;
      const camX = THREE.MathUtils.clamp(
        cluster.x - dx * offsetScale,
        minX + margin,
        maxX - margin
      );
      const camZ = THREE.MathUtils.clamp(
        cluster.z - dz * offsetScale,
        minZ + margin,
        maxZ - margin
      );
      points.push({
        position: [camX, eyeH, camZ],
        target: [cluster.x, lookH * 0.8, cluster.z],
        durationScale: 1.0,
      });
    }
  }

  // 5. Perimeter walk (2 corners)
  points.push({
    position: [maxX - margin, eyeH, minZ + margin],
    target: [cx, lookH, cz],
    durationScale: 1.0,
  });

  points.push({
    position: [minX + margin, eyeH, minZ + margin],
    target: [cx, lookH, maxZ],
    durationScale: 1.0,
  });

  // 6. Return to start position
  points.push({
    position: [startX, eyeH, startZ],
    target: [cx, lookH, cz],
    durationScale: 1.2,
  });

  // 7. Final overview (bird's eye)
  points.push({
    position: [cx + w * 0.3, maxDim * 1.2, cz + d * 0.3],
    target: [cx, 0, cz],
    durationScale: 1.5,
  });

  return points;
}

/** Simple spatial clustering for furniture items */
function clusterFurniture(
  furniture: { position: [number, number, number] }[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): { x: number; z: number; count: number }[] {
  if (furniture.length === 0) return [];

  // Grid-based clustering
  const gridSize = Math.max(maxX - minX, maxZ - minZ) / 3;
  const cellMap = new Map<string, { sx: number; sz: number; count: number }>();

  for (const f of furniture) {
    const gx = Math.floor((f.position[0] - minX) / gridSize);
    const gz = Math.floor((f.position[2] - minZ) / gridSize);
    const key = `${gx},${gz}`;
    const cell = cellMap.get(key) || { sx: 0, sz: 0, count: 0 };
    cell.sx += f.position[0];
    cell.sz += f.position[2];
    cell.count += 1;
    cellMap.set(key, cell);
  }

  return Array.from(cellMap.values())
    .map((c) => ({ x: c.sx / c.count, z: c.sz / c.count, count: c.count }))
    .sort((a, b) => b.count - a.count);
}

// Reusable Vector3 instances to avoid GC in useFrame
const _posFrom = new THREE.Vector3();
const _posTo = new THREE.Vector3();
const _tgtFrom = new THREE.Vector3();
const _tgtTo = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _splinePos = new THREE.Vector3();
const _splineTgt = new THREE.Vector3();

export function CameraController() {
  const { camera, gl } = useThree();
  const cameraPreset = useEditorStore((s) => s.cameraPreset);
  const setCameraPreset = useEditorStore((s) => s.setCameraPreset);
  const walkthroughPlaying = useEditorStore((s) => s.walkthroughPlaying);
  const setWalkthroughPlaying = useEditorStore((s) => s.setWalkthroughPlaying);
  const isAutoWalkthrough = useEditorStore((s) => s.isAutoWalkthrough);
  const setAutoWalkthrough = useEditorStore((s) => s.setAutoWalkthrough);
  const walkthroughSpeed = useEditorStore((s) => s.walkthroughSpeed);
  const setWalkthroughProgress = useEditorStore((s) => s.setWalkthroughProgress);
  const isFirstPersonMode = useEditorStore((s) => s.isFirstPersonMode);
  const setFirstPersonMode = useEditorStore((s) => s.setFirstPersonMode);
  const walls = useEditorStore((s) => s.walls);
  const roomHeight = useEditorStore((s) => s.roomHeight);
  const furniture = useEditorStore((s) => s.furniture);
  const openings = useEditorStore((s) => s.openings);
  const cameraBookmarks = useEditorStore((s) => s.cameraBookmarks);

  // Auto walkthrough state in refs
  const autoWalkthroughRef = useRef({
    positionSpline: null as THREE.CatmullRomCurve3 | null,
    targetSpline: null as THREE.CatmullRomCurve3 | null,
    totalDuration: 0,
    elapsed: 0,
    active: false,
  });

  // Legacy walkthrough state kept in refs
  const walkthroughRef = useRef({
    points: [] as WalkthroughPoint[],
    currentIndex: 0,
    progress: 0,
  });

  // Progress update throttle
  const lastProgressUpdateRef = useRef(0);

  // Stop walkthrough on click anywhere
  const stopOnClick = useCallback(() => {
    if (isAutoWalkthrough) {
      setAutoWalkthrough(false);
    }
  }, [isAutoWalkthrough, setAutoWalkthrough]);

  useEffect(() => {
    if (!isAutoWalkthrough) return;
    const domElement = gl.domElement;
    domElement.addEventListener('click', stopOnClick);
    return () => {
      domElement.removeEventListener('click', stopOnClick);
    };
  }, [isAutoWalkthrough, gl.domElement, stopOnClick]);

  // Stop on user orbit (pointerdown + pointermove)
  useEffect(() => {
    if (!isAutoWalkthrough) return;
    let pointerDown = false;
    const domElement = gl.domElement;
    const onDown = () => { pointerDown = true; };
    const onMove = () => {
      if (pointerDown && isAutoWalkthrough) {
        setAutoWalkthrough(false);
      }
    };
    const onUp = () => { pointerDown = false; };
    domElement.addEventListener('pointerdown', onDown);
    domElement.addEventListener('pointermove', onMove);
    domElement.addEventListener('pointerup', onUp);
    return () => {
      domElement.removeEventListener('pointerdown', onDown);
      domElement.removeEventListener('pointermove', onMove);
      domElement.removeEventListener('pointerup', onUp);
    };
  }, [isAutoWalkthrough, gl.domElement, setAutoWalkthrough]);

  // Generate CatmullRom spline when auto walkthrough starts
  useEffect(() => {
    if (isAutoWalkthrough) {
      const waypoints = generateCinematicWaypoints(walls, roomHeight, furniture, openings);
      const positions = waypoints.map((wp) => new THREE.Vector3(...wp.position));
      const targets = waypoints.map((wp) => new THREE.Vector3(...wp.target));

      // CatmullRom spline for smooth camera path
      const positionSpline = new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5);
      const targetSpline = new THREE.CatmullRomCurve3(targets, false, 'catmullrom', 0.5);

      // Total duration based on path length (0.5m/s base speed)
      const pathLength = positionSpline.getLength();
      const baseDuration = pathLength / 0.5;
      // Minimum 10 seconds, maximum 60 seconds
      const totalDuration = THREE.MathUtils.clamp(baseDuration, 10, 60);

      autoWalkthroughRef.current = {
        positionSpline,
        targetSpline,
        totalDuration,
        elapsed: 0,
        active: true,
      };
    } else {
      autoWalkthroughRef.current.active = false;
      autoWalkthroughRef.current.elapsed = 0;
    }
  }, [isAutoWalkthrough, walls, roomHeight, furniture, openings]);

  // Generate legacy walkthrough points when playback starts (non-auto)
  useEffect(() => {
    if (walkthroughPlaying && !isAutoWalkthrough) {
      const points = generateLegacyWalkthroughPoints(walls, roomHeight);
      walkthroughRef.current = { points, currentIndex: 0, progress: 0 };
    }
  }, [walkthroughPlaying, isAutoWalkthrough, walls, roomHeight]);

  // Camera preset handling
  useEffect(() => {
    if (!cameraPreset) return;

    // Stop walkthrough / first-person if a preset is selected
    if (walkthroughPlaying) {
      setWalkthroughPlaying(false);
    }
    if (isAutoWalkthrough) {
      setAutoWalkthrough(false);
    }
    if (isFirstPersonMode) {
      setFirstPersonMode(false);
    }

    // Handle camera bookmark presets
    if (cameraPreset.startsWith('bookmark:')) {
      const bookmarkId = cameraPreset.slice('bookmark:'.length);
      const bookmark = cameraBookmarks.find((b) => b.id === bookmarkId);
      if (bookmark) {
        camera.position.set(...bookmark.position);
        camera.lookAt(...bookmark.target);
        camera.updateProjectionMatrix();
      }
      setCameraPreset(null);
      return;
    }

    let cx = 0, cz = 0, w = 8, d = 6;
    if (walls.length > 0) {
      const xs = walls.flatMap((wall) => [wall.start.x, wall.end.x]);
      const ys = walls.flatMap((wall) => [wall.start.y, wall.end.y]);
      cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      cz = (Math.min(...ys) + Math.max(...ys)) / 2;
      w = Math.max(...xs) - Math.min(...xs);
      d = Math.max(...ys) - Math.min(...ys);
    }
    const maxDim = Math.max(w, d);

    switch (cameraPreset) {
      case 'perspective':
        camera.position.set(cx + w * 0.4, roomHeight * 0.6, cz + d * 0.4);
        camera.lookAt(cx - w * 0.2, roomHeight * 0.3, cz - d * 0.2);
        break;
      case 'top':
        camera.position.set(cx, maxDim * 1.5, cz + 0.001);
        camera.lookAt(cx, 0, cz);
        break;
      case 'front':
        camera.position.set(cx, roomHeight * 0.55, cz - d * 0.4);
        camera.lookAt(cx, roomHeight * 0.3, cz + d * 0.3);
        break;
      case 'side':
        camera.position.set(cx - w * 0.4, roomHeight * 0.55, cz);
        camera.lookAt(cx + w * 0.3, roomHeight * 0.3, cz);
        break;
      case 'bird-eye':
        camera.position.set(cx, maxDim * 1.5, cz + d * 0.1);
        camera.lookAt(cx, 0, cz);
        break;
      case 'entrance':
        camera.position.set(cx, roomHeight * 0.55, cz + d * 0.5 - 0.3);
        camera.lookAt(cx, roomHeight * 0.3, cz - d * 0.5);
        break;
      case 'window':
        camera.position.set(cx - w * 0.5 + 0.5, roomHeight * 0.55, cz);
        camera.lookAt(cx + w * 0.5, roomHeight * 0.3, cz);
        break;
      case 'interior':
        camera.position.set(cx, roomHeight * 0.95, cz);
        camera.lookAt(cx, 0, cz);
        break;
      case 'corner': {
        const cornerMinX = cx - w / 2;
        const cornerMaxZ = cz + d / 2;
        const cornerMargin = 0.4;
        camera.position.set(
          cornerMinX + cornerMargin,
          Math.min(1.5, roomHeight * 0.55),
          cornerMaxZ - cornerMargin
        );
        camera.lookAt(cx + w * 0.2, roomHeight * 0.3, cz - d * 0.2);
        break;
      }
    }
    camera.updateProjectionMatrix();
    setCameraPreset(null);
  }, [cameraPreset, camera, walls, roomHeight, setCameraPreset, walkthroughPlaying, setWalkthroughPlaying, isAutoWalkthrough, setAutoWalkthrough, isFirstPersonMode, setFirstPersonMode, cameraBookmarks]);

  // Animation in useFrame
  useFrame((state, delta) => {
    // Auto walkthrough (cinematic CatmullRom spline)
    if (isAutoWalkthrough && autoWalkthroughRef.current.active) {
      const awt = autoWalkthroughRef.current;
      if (!awt.positionSpline || !awt.targetSpline) return;

      const speedMult = SPEED_MAP[walkthroughSpeed] || 0.6;
      awt.elapsed += delta * speedMult;

      const t = awt.elapsed / awt.totalDuration;

      if (t >= 1) {
        // Tour complete
        setAutoWalkthrough(false);
        setWalkthroughProgress(1);
        return;
      }

      // Throttle progress state updates to ~10fps
      const now = state.clock.elapsedTime;
      if (now - lastProgressUpdateRef.current > 0.1) {
        setWalkthroughProgress(t);
        lastProgressUpdateRef.current = now;
      }

      // Smooth easing for start and end
      const easedT = easeInOutCubic(t);

      awt.positionSpline.getPoint(easedT, _splinePos);
      awt.targetSpline.getPoint(easedT, _splineTgt);

      camera.position.copy(_splinePos);
      camera.lookAt(_splineTgt);

      // Update OrbitControls target if available
      const controls = state.controls as unknown as { target?: THREE.Vector3; update?: () => void };
      if (controls?.target) {
        controls.target.copy(_splineTgt);
        controls.update?.();
      }

      return;
    }

    // Legacy walkthrough (segment-based interpolation)
    if (!walkthroughPlaying) return;

    const wt = walkthroughRef.current;
    if (wt.points.length < 2) return;

    wt.progress += delta / 3;

    if (wt.progress >= 1) {
      wt.progress = 0;
      wt.currentIndex = (wt.currentIndex + 1) % wt.points.length;

      if (wt.currentIndex === 0) {
        setWalkthroughPlaying(false);
        return;
      }
    }

    const from = wt.points[wt.currentIndex];
    const to = wt.points[(wt.currentIndex + 1) % wt.points.length];

    const t = wt.progress * wt.progress * (3 - 2 * wt.progress);

    _posFrom.set(from.position[0], from.position[1], from.position[2]);
    _posTo.set(to.position[0], to.position[1], to.position[2]);
    _tgtFrom.set(from.target[0], from.target[1], from.target[2]);
    _tgtTo.set(to.target[0], to.target[1], to.target[2]);

    camera.position.lerpVectors(_posFrom, _posTo, t);

    _lookTarget.lerpVectors(_tgtFrom, _tgtTo, t);
    camera.lookAt(_lookTarget);

    const controls = state.controls as unknown as { target?: THREE.Vector3; update?: () => void };
    if (controls?.target) {
      controls.target.copy(_lookTarget);
      controls.update?.();
    }
  });

  return null;
}

/** Easing function for smooth start/end */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Legacy walkthrough waypoints (simple perimeter walk) */
function generateLegacyWalkthroughPoints(
  walls: { start: { x: number; y: number }; end: { x: number; y: number } }[],
  roomHeight: number
): WalkthroughPoint[] {
  if (walls.length === 0) {
    return [
      { position: [2, 1.5, 2], target: [0, 1, 0] },
      { position: [2, 1.5, -2], target: [0, 1, 0] },
      { position: [-2, 1.5, -2], target: [0, 1, 0] },
      { position: [-2, 1.5, 2], target: [0, 1, 0] },
    ];
  }

  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const zs = walls.flatMap((w) => [w.start.y, w.end.y]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const w = maxX - minX;
  const eyeH = roomHeight * 0.55;
  const targetH = roomHeight * 0.35;
  const margin = 0.5;

  return [
    { position: [minX + margin, eyeH, maxZ - margin], target: [cx, targetH, cz] },
    { position: [maxX - margin, eyeH, cz], target: [cx - w * 0.3, targetH, cz] },
    { position: [maxX - margin, eyeH, minZ + margin], target: [cx, targetH, cz] },
    { position: [cx, eyeH, minZ + margin], target: [cx, targetH, maxZ] },
    { position: [minX + margin, eyeH, cz], target: [cx + w * 0.3, targetH, cz] },
    { position: [minX + margin, eyeH, maxZ - margin], target: [cx, targetH, cz] },
  ];
}
