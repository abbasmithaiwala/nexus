/**
 * useChatMessages — all SpaceTimeDB chat logic for a room.
 *
 * Loads existing ChatMessage events on mount, subscribes to new inserts,
 * and exposes a send function. The component only needs to render.
 */

import { useEffect, useRef, useState } from 'react';
import type { DbConnection } from '@/module_bindings';
import type { RoomEvent } from '@/module_bindings/types';

export interface ChatMessage {
  eventId: string;
  displayName: string;
  message: string;
  timestamp: Date;
  isMe: boolean;
}

interface ChatPayload {
  message: string;
  display_name: string;
}

function parsePayload(payload: string): ChatPayload | null {
  try {
    return JSON.parse(payload) as ChatPayload;
  } catch {
    return null;
  }
}

function eventToMessage(event: RoomEvent, myDisplayName: string): ChatMessage | null {
  if (!('ChatMessage' in event.eventType)) return null;
  const parsed = parsePayload(event.payload);
  if (!parsed) return null;
  return {
    eventId: event.eventId.toString(),
    displayName: parsed.display_name,
    message: parsed.message,
    timestamp: new Date(Number(event.timestamp.microsSinceUnixEpoch / 1000n)),
    isMe: parsed.display_name === myDisplayName,
  };
}

export function formatMessageTime(date: Date): string {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

interface UseChatMessagesOptions {
  db: DbConnection | null;
  roomId: bigint | null;
  myDisplayName: string;
  onNewMessage?: () => void;
}

interface UseChatMessagesResult {
  messages: ChatMessage[];
  send: (text: string) => void;
}

export function useChatMessages({
  db,
  roomId,
  myDisplayName,
  onNewMessage,
}: UseChatMessagesOptions): UseChatMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;

  useEffect(() => {
    if (!db || roomId == null) return;

    // Snapshot of existing messages
    const existing: ChatMessage[] = [];
    for (const event of db.db.room_event.event_by_room.filter(roomId)) {
      const msg = eventToMessage(event, myDisplayName);
      if (msg) existing.push(msg);
    }
    existing.sort((a, b) => (a.eventId < b.eventId ? -1 : 1));
    setMessages(existing);

    // Live subscription
    const handleInsert = (_ctx: unknown, event: RoomEvent) => {
      if (event.roomId !== roomId) return;
      const msg = eventToMessage(event, myDisplayName);
      if (!msg) return;
      setMessages((prev) => {
        if (prev.some((m) => m.eventId === msg.eventId)) return prev;
        onNewMessageRef.current?.();
        return [...prev, msg];
      });
    };

    db.db.room_event.onInsert(handleInsert);
    return () => { db.db.room_event.removeOnInsert(handleInsert); };
  }, [db, roomId, myDisplayName]);

  const send = (text: string) => {
    if (!db || roomId == null || !text.trim()) return;
    db.reducers.sendChatMessage({ roomId, message: text.trim() });
  };

  return { messages, send };
}
