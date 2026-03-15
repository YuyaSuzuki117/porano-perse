/**
 * realtime-collab.ts — Supabase Realtime による共同編集基盤
 *
 * - Broadcast: 家具/壁/スタイルの変更をリアルタイム同期
 * - Presence: オンラインユーザー一覧
 * - Last-Write-Wins: 衝突解決はシンプルに最後の書き込みが勝つ
 */

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

// --- Types ---

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  joinedAt: string;
}

export type ChangeType =
  | 'furniture:add'
  | 'furniture:update'
  | 'furniture:delete'
  | 'wall:add'
  | 'wall:update'
  | 'wall:delete'
  | 'style:change';

export interface CollabChange {
  type: ChangeType;
  payload: Record<string, unknown>;
  userId: string;
  timestamp: number;
}

// --- Constants ---

const CHANNEL_PREFIX = 'perse-collab:';
const USER_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
];

// --- State ---

let currentChannel: RealtimeChannel | null = null;
let currentRoomId: string | null = null;
let currentUser: CollabUser | null = null;
let changeListeners: Array<(change: CollabChange) => void> = [];
let presenceListeners: Array<(users: CollabUser[]) => void> = [];
let statusListeners: Array<(status: 'connected' | 'disconnected' | 'error') => void> = [];

// --- Helpers ---

function generateUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function pickColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// --- Public API ---

/**
 * ルームIDを生成する（共有用）
 */
export function createRoomId(): string {
  return generateRoomId();
}

/**
 * 現在のルームIDを取得
 */
export function getCurrentRoomId(): string | null {
  return currentRoomId;
}

/**
 * 現在のユーザー情報を取得
 */
export function getCurrentUser(): CollabUser | null {
  return currentUser;
}

/**
 * ルームに参加する
 */
export async function joinRoom(roomId: string, userName?: string): Promise<boolean> {
  if (!supabase) {
    console.warn('[Collab] Supabase not configured, skipping realtime');
    return false;
  }

  // 既に同じルームに参加済み
  if (currentRoomId === roomId && currentChannel) {
    return true;
  }

  // 既存チャンネルがあれば離脱
  if (currentChannel) {
    await leaveRoom();
  }

  const userId = generateUserId();
  currentUser = {
    id: userId,
    name: userName || `User ${userId.slice(-4)}`,
    color: pickColor(userId),
    joinedAt: new Date().toISOString(),
  };

  const channelName = `${CHANNEL_PREFIX}${roomId}`;
  currentChannel = supabase.channel(channelName, {
    config: {
      broadcast: { self: false }, // 自分のブロードキャストは受信しない
      presence: { key: userId },
    },
  });

  // Broadcast受信
  currentChannel.on('broadcast', { event: 'change' }, ({ payload }) => {
    const change = payload as CollabChange;
    changeListeners.forEach((cb) => cb(change));
  });

  // Presence同期
  currentChannel.on('presence', { event: 'sync' }, () => {
    if (!currentChannel) return;
    const state = currentChannel.presenceState<CollabUser>();
    const users: CollabUser[] = [];
    for (const key in state) {
      const presences = state[key];
      if (presences && presences.length > 0) {
        const p = presences[0];
        users.push({
          id: p.id || key,
          name: p.name || `User ${key.slice(-4)}`,
          color: p.color || '#999',
          joinedAt: p.joinedAt || new Date().toISOString(),
        });
      }
    }
    presenceListeners.forEach((cb) => cb(users));
  });

  // チャンネル接続
  return new Promise((resolve) => {
    currentChannel!.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        currentRoomId = roomId;
        // Presenceトラッキング開始
        await currentChannel!.track(currentUser!);
        statusListeners.forEach((cb) => cb('connected'));
        resolve(true);
      } else if (status === 'CHANNEL_ERROR') {
        statusListeners.forEach((cb) => cb('error'));
        resolve(false);
      } else if (status === 'CLOSED') {
        statusListeners.forEach((cb) => cb('disconnected'));
      }
    });
  });
}

/**
 * ルームから離脱する
 */
export async function leaveRoom(): Promise<void> {
  if (currentChannel && supabase) {
    await currentChannel.untrack();
    await supabase.removeChannel(currentChannel);
  }
  currentChannel = null;
  currentRoomId = null;
  currentUser = null;
  statusListeners.forEach((cb) => cb('disconnected'));
}

/**
 * 変更をブロードキャストする
 */
export function broadcastChange(type: ChangeType, payload: Record<string, unknown>): void {
  if (!currentChannel || !currentUser) return;

  const change: CollabChange = {
    type,
    payload,
    userId: currentUser.id,
    timestamp: Date.now(),
  };

  currentChannel.send({
    type: 'broadcast',
    event: 'change',
    payload: change,
  });
}

/**
 * リモート変更を受信する
 */
export function onRemoteChange(callback: (change: CollabChange) => void): () => void {
  changeListeners.push(callback);
  return () => {
    changeListeners = changeListeners.filter((cb) => cb !== callback);
  };
}

/**
 * Presenceの変更を受信する（オンラインユーザー一覧）
 */
export function onPresenceChange(callback: (users: CollabUser[]) => void): () => void {
  presenceListeners.push(callback);
  return () => {
    presenceListeners = presenceListeners.filter((cb) => cb !== callback);
  };
}

/**
 * 接続ステータスの変更を受信する
 */
export function onStatusChange(callback: (status: 'connected' | 'disconnected' | 'error') => void): () => void {
  statusListeners.push(callback);
  return () => {
    statusListeners = statusListeners.filter((cb) => cb !== callback);
  };
}

/**
 * 接続中かどうか
 */
export function isConnected(): boolean {
  return currentChannel !== null && currentRoomId !== null;
}
