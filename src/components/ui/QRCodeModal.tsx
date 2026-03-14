'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  projectName: string;
}

export function QRCodeModal({ isOpen, onClose, url, projectName }: QRCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen || !canvasRef.current || !url) return;
    setError(false);

    QRCode.toCanvas(canvasRef.current, url, {
      width: 240,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    }).catch(() => {
      setError(true);
    });
  }, [isOpen, url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-xl shadow-2xl p-6 max-w-xs w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>

        <h3 className="text-sm font-semibold text-gray-800 mb-1">QRコードで共有</h3>
        <p className="text-xs text-gray-500 mb-4 truncate">{projectName}</p>

        <div className="flex items-center justify-center bg-gray-50 rounded-lg p-4">
          {error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-500">QRコード生成に失敗しました</p>
              <p className="text-xs text-gray-400 mt-1">URLが長すぎる可能性があります</p>
            </div>
          ) : (
            <canvas ref={canvasRef} />
          )}
        </div>

        <p className="text-[10px] text-gray-400 mt-3 text-center">
          スマートフォンのカメラでスキャンしてプロジェクトを開けます
        </p>
      </div>
    </div>
  );
}
