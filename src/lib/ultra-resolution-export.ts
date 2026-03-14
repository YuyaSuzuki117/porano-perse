import * as THREE from 'three';

export type ExportResolution = '1080p' | '4k' | '6k' | '8k' | 'custom';

export interface ExportConfig {
  width: number;
  height: number;
  name: string;
  pixelRatio: number;
}

export const EXPORT_RESOLUTIONS: Record<ExportResolution, ExportConfig> = {
  '1080p': { width: 1920, height: 1080, name: 'Full HD (1920\u00d71080)', pixelRatio: 1 },
  '4k': { width: 3840, height: 2160, name: '4K UHD (3840\u00d72160)', pixelRatio: 2 },
  '6k': { width: 6144, height: 3456, name: '6K (6144\u00d73456)', pixelRatio: 3 },
  '8k': { width: 7680, height: 4320, name: '8K UHD (7680\u00d74320)', pixelRatio: 4 },
  'custom': { width: 4000, height: 3000, name: '\u30ab\u30b9\u30bf\u30e0', pixelRatio: 2 },
};

export function getMaxSupportedResolution(
  gl: WebGLRenderingContext
): { width: number; height: number } {
  const maxSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  return { width: maxSize, height: maxSize };
}

export async function renderHighResolution(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  config: ExportConfig
): Promise<Blob> {
  const gl = renderer.getContext();
  const maxSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;

  const targetWidth = Math.min(config.width, maxSize);
  const targetHeight = Math.min(config.height, maxSize);

  // Save current state
  const originalSize = renderer.getSize(new THREE.Vector2());
  const originalPixelRatio = renderer.getPixelRatio();

  try {
    // Set high-resolution rendering
    renderer.setPixelRatio(config.pixelRatio);
    renderer.setSize(targetWidth, targetHeight, false);

    // Update camera aspect if it is a PerspectiveCamera
    if (camera instanceof THREE.PerspectiveCamera) {
      const originalAspect = camera.aspect;
      camera.aspect = targetWidth / targetHeight;
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);

      // Restore camera aspect
      camera.aspect = originalAspect;
      camera.updateProjectionMatrix();
    } else {
      renderer.render(scene, camera);
    }

    // Extract image as PNG blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Failed to create image blob from canvas'));
          }
        },
        'image/png',
        1.0
      );
    });

    return blob;
  } finally {
    // Restore original renderer settings
    renderer.setPixelRatio(originalPixelRatio);
    renderer.setSize(originalSize.x, originalSize.y, false);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup
  requestAnimationFrame(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  });
}
