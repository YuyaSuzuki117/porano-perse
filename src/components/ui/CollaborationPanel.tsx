'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import {
  joinRoom,
  leaveRoom,
  broadcastChange,
  onRemoteChange,
  onPresenceChange,
  onStatusChange,
  createRoomId,
  getCurrentRoomId,
  isConnected,
  type CollabUser,
  type CollabChange,
  type ChangeType,
} from '@/lib/realtime-collab';
import { supabase } from '@/lib/supabase';
import type { WallSegment } from '@/types/floor-plan';
import type { FurnitureItem, StylePreset } from '@/types/scene';

// --- Remote change handler hook ---

function useRemoteChangeHandler() {
  useEffect(() => {
    const unsubscribe = onRemoteChange((change: CollabChange) => {
      const store = useEditorStore.getState();
      switch (change.type) {
        case 'furniture:add':
          store.addFurniture(change.payload.item as FurnitureItem);
          break;
        case 'furniture:update':
          store.updateFurniture(
            change.payload.id as string,
            change.payload.updates as Partial<FurnitureItem>
          );
          break;
        case 'furniture:delete':
          store.deleteFurniture(change.payload.id as string);
          break;
        case 'wall:add':
          store.addWall(change.payload.wall as WallSegment);
          break;
        case 'wall:update':
          store.updateWall(
            change.payload.id as string,
            change.payload.updates as Partial<WallSegment>
          );
          break;
        case 'wall:delete':
          store.deleteWall(change.payload.id as string);
          break;
        case 'style:change':
          store.setStyle(change.payload.style as StylePreset);
          break;
      }
    });
    return unsubscribe;
  }, []);
}

// --- Collab broadcast helpers (importable by other components) ---

export function broadcastFurnitureAdd(item: FurnitureItem) {
  broadcastChange('furniture:add', { item });
}

export function broadcastFurnitureUpdate(id: string, updates: Partial<FurnitureItem>) {
  broadcastChange('furniture:update', { id, updates });
}

export function broadcastFurnitureDelete(id: string) {
  broadcastChange('furniture:delete', { id });
}

export function broadcastWallAdd(wall: WallSegment) {
  broadcastChange('wall:add', { wall });
}

export function broadcastWallUpdate(id: string, updates: Partial<WallSegment>) {
  broadcastChange('wall:update', { id, updates });
}

export function broadcastWallDelete(id: string) {
  broadcastChange('wall:delete', { id });
}

export function broadcastStyleChange(style: StylePreset) {
  broadcastChange('style:change', { style: style as unknown as Record<string, unknown> });
}

// --- UI Component ---

export function CollaborationPanel() {
  const [status, setStatus] = useState<'disconnected' | 'connected' | 'error'>('disconnected');
  const [users, setUsers] = useState<CollabUser[]>([]);
  const [roomInput, setRoomInput] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Supabase未設定時はレンダリングしない
  if (!supabase) return null;

  // リモート変更の適用
  useRemoteChangeHandler();

  // Presenceとステータスのリスナー
  useEffect(() => {
    const unsubPresence = onPresenceChange(setUsers);
    const unsubStatus = onStatusChange(setStatus);
    return () => {
      unsubPresence();
      unsubStatus();
    };
  }, []);

  // パネル外クリックで閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    };
    if (showPanel) {
      window.addEventListener('click', handleClick, true);
      return () => window.removeEventListener('click', handleClick, true);
    }
  }, [showPanel]);

  const handleCreateRoom = useCallback(async () => {
    const roomId = createRoomId();
    const success = await joinRoom(roomId);
    if (success) {
      const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleJoinRoom = useCallback(async () => {
    if (!roomInput.trim()) return;
    // URLからroomIdを抽出、またはそのままIDとして使用
    let roomId = roomInput.trim();
    try {
      const url = new URL(roomId);
      const param = url.searchParams.get('room');
      if (param) roomId = param;
    } catch {
      // URLでなければそのままIDとして使用
    }
    await joinRoom(roomId);
    setRoomInput('');
  }, [roomInput]);

  const handleLeave = useCallback(async () => {
    await leaveRoom();
    setUsers([]);
  }, []);

  const handleCopyLink = useCallback(async () => {
    const roomId = getCurrentRoomId();
    if (!roomId) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const connected = status === 'connected';
  const roomId = getCurrentRoomId();

  return (
    <div className="relative" ref={panelRef}>
      {/* トリガーボタン */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          connected
            ? 'bg-green-50 text-green-700 hover:bg-green-100'
            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
        }`}
        title="共同編集"
      >
        {/* Users icon */}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        {connected && (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span>{users.length}</span>
          </>
        )}
      </button>

      {/* オンラインユーザーアバター（接続中のみ、パネル外に表示） */}
      {connected && users.length > 0 && !showPanel && (
        <div className="hidden md:flex items-center gap-0.5 ml-1">
          {users.slice(0, 5).map((user) => (
            <div
              key={user.id}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
              style={{ backgroundColor: user.color }}
              title={user.name}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
          ))}
          {users.length > 5 && (
            <span className="text-[10px] text-gray-500 ml-0.5">+{users.length - 5}</span>
          )}
        </div>
      )}

      {/* ドロップダウンパネル */}
      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* ヘッダー */}
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">共同編集</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              リアルタイムで一緒に編集
            </p>
          </div>

          {connected ? (
            <>
              {/* 接続中のステータス */}
              <div className="px-4 py-3 bg-green-50 border-b border-green-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-700">接続中</span>
                  </div>
                  <span className="text-[10px] text-green-600 font-mono bg-green-100 px-1.5 py-0.5 rounded">
                    {roomId}
                  </span>
                </div>
              </div>

              {/* オンラインユーザー一覧 */}
              <div className="px-4 py-2">
                <p className="text-[11px] text-gray-400 mb-2">
                  オンライン ({users.length})
                </p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {users.map((user) => (
                    <div key={user.id} className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ backgroundColor: user.color }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-700 truncate">{user.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* アクションボタン */}
              <div className="px-4 py-3 border-t border-gray-100 space-y-2">
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copied ? 'コピーしました!' : 'リンクをコピー'}
                </button>
                <button
                  onClick={handleLeave}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors"
                >
                  退出する
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 未接続時 */}
              <div className="px-4 py-3 space-y-3">
                {/* ルーム作成 */}
                <button
                  onClick={handleCreateRoom}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  共同編集を開始
                </button>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[10px] text-gray-400">または</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {/* ルーム参加 */}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                    placeholder="ルームID or URL"
                    className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={!roomInput.trim()}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    参加
                  </button>
                </div>
              </div>

              {status === 'error' && (
                <div className="px-4 pb-3">
                  <p className="text-[11px] text-red-500">接続エラーが発生しました。再試行してください。</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
