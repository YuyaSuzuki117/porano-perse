'use client';

import { useState, useCallback } from 'react';
import { useCameraStore, CameraBookmark } from '@/stores/useCameraStore';

interface CameraBookmarkPanelProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

/** カメラの現在位置を取得するためのグローバル参照 */
let _getCameraState: (() => { position: [number, number, number]; target: [number, number, number] }) | null = null;

export function setCameraStateGetter(
  getter: () => { position: [number, number, number]; target: [number, number, number] }
) {
  _getCameraState = getter;
}

export function CameraBookmarkPanel({ canvasRef }: CameraBookmarkPanelProps) {
  const cameraBookmarks = useCameraStore((s) => s.cameraBookmarks);
  const addCameraBookmark = useCameraStore((s) => s.addCameraBookmark);
  const deleteCameraBookmark = useCameraStore((s) => s.deleteCameraBookmark);
  const applyCameraBookmark = useCameraStore((s) => s.applyCameraBookmark);
  const [showInput, setShowInput] = useState(false);
  const [bookmarkName, setBookmarkName] = useState('');

  const captureThumbnail = useCallback((): string | undefined => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    try {
      // Create a small thumbnail from the 3D canvas
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 200;
      thumbCanvas.height = 150;
      const ctx = thumbCanvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.drawImage(canvas, 0, 0, 200, 150);
      return thumbCanvas.toDataURL('image/jpeg', 0.6);
    } catch {
      return undefined;
    }
  }, [canvasRef]);

  const handleSaveBookmark = useCallback(() => {
    if (!_getCameraState) return;
    const { position, target } = _getCameraState();
    const name = bookmarkName.trim() || `アングル ${cameraBookmarks.length + 1}`;
    const thumbnail = captureThumbnail();
    addCameraBookmark(name, position, target, thumbnail);
    setBookmarkName('');
    setShowInput(false);
  }, [bookmarkName, cameraBookmarks.length, addCameraBookmark, captureThumbnail]);

  const handleApply = useCallback((bookmark: CameraBookmark) => {
    applyCameraBookmark(bookmark.id);
  }, [applyCameraBookmark]);

  return (
    <div className="flex flex-col gap-1">
      <div className="h-px bg-white/20 my-0.5" />
      <div className="text-[9px] text-white/60 px-2 font-medium">ブックマーク</div>

      {/* Saved bookmarks list */}
      {cameraBookmarks.map((bookmark) => (
        <div
          key={bookmark.id}
          className="group relative flex items-center gap-1 px-1"
        >
          <button
            onClick={() => handleApply(bookmark)}
            className="flex-1 flex items-center gap-1.5 px-2 py-1.5 min-h-[32px] bg-blue-600/50 backdrop-blur-sm text-white text-[10px] rounded hover:bg-blue-600/70 transition-colors overflow-hidden"
            title={`${bookmark.name} に移動`}
          >
            {bookmark.thumbnail && (
              <img
                src={bookmark.thumbnail}
                alt=""
                className="w-6 h-4.5 rounded-sm object-cover flex-shrink-0"
                style={{ width: 24, height: 18 }}
              />
            )}
            <span className="truncate">{bookmark.name}</span>
          </button>
          <button
            onClick={() => deleteCameraBookmark(bookmark.id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-white/60 hover:text-red-400 transition-all text-[10px]"
            title="削除"
          >
            x
          </button>
        </div>
      ))}

      {/* Add bookmark UI */}
      {showInput ? (
        <div className="flex items-center gap-1 px-1">
          <input
            type="text"
            value={bookmarkName}
            onChange={(e) => setBookmarkName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveBookmark();
              if (e.key === 'Escape') setShowInput(false);
            }}
            placeholder="アングル名..."
            className="flex-1 px-2 py-1 bg-black/60 text-white text-[10px] rounded border border-white/20 focus:outline-none focus:border-blue-400 placeholder-white/40"
            autoFocus
          />
          <button
            onClick={handleSaveBookmark}
            className="px-2 py-1 bg-blue-600/70 text-white text-[10px] rounded hover:bg-blue-600/90 transition-colors"
          >
            保存
          </button>
          <button
            onClick={() => setShowInput(false)}
            className="px-1.5 py-1 text-white/50 text-[10px] hover:text-white/80"
          >
            x
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="px-2 py-0.5 text-[9px] text-white/50 hover:text-white/80 transition-colors"
          title="現在のアングルを保存"
        >
          + 保存
        </button>
      )}
    </div>
  );
}
