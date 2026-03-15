'use client';

import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore } from '@/stores/useEditorStore';
import { useCameraStore } from '@/stores/useCameraStore';

const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 2.0; // m/s
const LOOK_SPEED = 0.003;
const ROOM_MARGIN = 0.3; // don't walk right up to walls

// Reusable vectors to avoid GC in useFrame
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _movement = new THREE.Vector3();

export function WalkthroughControls() {
  const { camera, gl } = useThree();
  const isFirstPersonMode = useCameraStore((s) => s.isFirstPersonMode);
  const setFirstPersonMode = useCameraStore((s) => s.setFirstPersonMode);
  const walls = useEditorStore((s) => s.walls);

  // Track keys and mouse state via refs (no setState in frame loop)
  const keysRef = useRef<Set<string>>(new Set());
  const eulerRef = useRef({ yaw: 0, pitch: 0 });
  const isPointerLockedRef = useRef(false);
  const savedCameraRef = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);
  const boundsRef = useRef({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });

  // Compute room bounds from walls
  useEffect(() => {
    if (walls.length === 0) {
      boundsRef.current = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
      return;
    }
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const zs = walls.flatMap((w) => [w.start.y, w.end.y]);
    boundsRef.current = {
      minX: Math.min(...xs) + ROOM_MARGIN,
      maxX: Math.max(...xs) - ROOM_MARGIN,
      minZ: Math.min(...zs) + ROOM_MARGIN,
      maxZ: Math.max(...zs) - ROOM_MARGIN,
    };
  }, [walls]);

  // Enter/exit first-person mode
  useEffect(() => {
    if (isFirstPersonMode) {
      // Save current camera state
      savedCameraRef.current = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
      };

      // Position camera at room center, eye height
      const b = boundsRef.current;
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      camera.position.set(cx, EYE_HEIGHT, cz);

      // Initialize euler from current camera direction
      const dir = new THREE.Vector3(0, 0, -1);
      dir.applyQuaternion(camera.quaternion);
      eulerRef.current.yaw = Math.atan2(-dir.x, -dir.z);
      eulerRef.current.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));

      keysRef.current.clear();
    } else if (savedCameraRef.current) {
      // Restore camera
      camera.position.copy(savedCameraRef.current.position);
      camera.quaternion.copy(savedCameraRef.current.quaternion);
      camera.updateProjectionMatrix();
      savedCameraRef.current = null;

      // Exit pointer lock if active
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  }, [isFirstPersonMode, camera]);

  // Keyboard listeners
  useEffect(() => {
    if (!isFirstPersonMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (e.key === 'Escape') {
        setFirstPersonMode(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isFirstPersonMode, setFirstPersonMode]);

  // Mouse look via pointer lock
  useEffect(() => {
    if (!isFirstPersonMode) return;

    const domElement = gl.domElement;

    const onPointerLockChange = () => {
      isPointerLockedRef.current = document.pointerLockElement === domElement;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isPointerLockedRef.current) return;
      eulerRef.current.yaw -= e.movementX * LOOK_SPEED;
      eulerRef.current.pitch -= e.movementY * LOOK_SPEED;
      // Clamp pitch to avoid flipping
      eulerRef.current.pitch = THREE.MathUtils.clamp(eulerRef.current.pitch, -Math.PI / 2 + 0.1, Math.PI / 2 - 0.1);
    };

    const onClick = () => {
      if (!isPointerLockedRef.current) {
        domElement.requestPointerLock();
      }
    };

    domElement.addEventListener('click', onClick);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);

    return () => {
      domElement.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === domElement) {
        document.exitPointerLock();
      }
    };
  }, [isFirstPersonMode, gl.domElement]);

  // Movement in useFrame
  useFrame((_state, delta) => {
    if (!isFirstPersonMode) return;

    const keys = keysRef.current;
    const { yaw, pitch } = eulerRef.current;

    // Update camera rotation from euler
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Movement direction (WASD)
    _movement.set(0, 0, 0);

    // Forward vector (horizontal only)
    _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    // Right vector
    _right.set(_forward.z, 0, -_forward.x);

    if (keys.has('w') || keys.has('arrowup')) _movement.add(_forward);
    if (keys.has('s') || keys.has('arrowdown')) _movement.sub(_forward);
    if (keys.has('a') || keys.has('arrowleft')) _movement.sub(_right);
    if (keys.has('d') || keys.has('arrowright')) _movement.add(_right);

    if (_movement.lengthSq() > 0) {
      _movement.normalize().multiplyScalar(MOVE_SPEED * delta);
      camera.position.add(_movement);

      // Clamp within room bounds
      const b = boundsRef.current;
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, b.minX, b.maxX);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, b.minZ, b.maxZ);
    }

    // Keep eye height fixed
    camera.position.y = EYE_HEIGHT;
  });

  return null;
}
