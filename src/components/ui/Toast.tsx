'use client';

import { create } from 'zustand';
import { useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: number) => void;
}

let _toastId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = ++_toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** showToast — コンポーネント外から呼べるヘルパー */
export function showToast(message: string, type?: ToastType) {
  useToastStore.getState().addToast(message, type);
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // mount時にアニメーション開始
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 2700);
    return () => clearTimeout(timer);
  }, []);

  const bgColor =
    toast.type === 'success' ? 'bg-green-600' :
    toast.type === 'error' ? 'bg-red-600' :
    'bg-gray-800';

  const icon =
    toast.type === 'success' ? (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-white flex-shrink-0">
        <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) : toast.type === 'error' ? (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-white flex-shrink-0">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3.5M8 10.5v.5" strokeLinecap="round" />
      </svg>
    ) : (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-white flex-shrink-0">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 7v4M8 5v.5" strokeLinecap="round" />
      </svg>
    );

  return (
    <div
      className={`${bgColor} text-white text-sm px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 cursor-pointer transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      onClick={onDismiss}
    >
      {icon}
      <span>{toast.message}</span>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-auto">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </div>
  );
}
