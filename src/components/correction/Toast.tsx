'use client';

import { useEffect, useState } from 'react';

let toastListeners: ((msg: string) => void)[] = [];

export function showToast(msg: string) {
  toastListeners.forEach(fn => fn(msg));
}

export default function Toast() {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    let nextId = 0;
    const handler = (msg: string) => {
      const id = nextId++;
      setMessages(prev => [...prev, { id, text: msg }]);
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== id));
      }, 2000);
    };
    toastListeners.push(handler);
    return () => {
      toastListeners = toastListeners.filter(fn => fn !== handler);
    };
  }, []);

  if (messages.length === 0) return null;

  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1.5">
      {messages.map(m => (
        <div
          key={m.id}
          className="bg-[#0d1b2a] border border-[#1e3a5f] text-[#c8d8e8] px-3 py-1.5 rounded shadow-lg text-[11px] font-mono animate-fade-in"
        >
          {m.text}
        </div>
      ))}
    </div>
  );
}
