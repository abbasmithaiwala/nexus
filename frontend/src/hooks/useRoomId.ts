/**
 * useRoomId — resolves a room code string to its bigint primary key.
 *
 * Reads the local SpaceTimeDB cache synchronously on mount, then subscribes
 * to new room inserts in case the row hasn't arrived yet.
 *
 * The insert listener is registered once per `db` instance (not once per
 * `roomCode` change) using the stable-ref pattern: the handler logic is kept
 * in a ref that is updated every render, so the subscription never needs to
 * be torn down and re-created just because roomCode changed.
 */

import { useEffect, useRef, useState } from 'react';
import type { DbConnection } from '@/module_bindings';

export function useRoomId(
  db: DbConnection | null,
  roomCode: string | undefined,
): bigint | null {
  const [roomId, setRoomId] = useState<bigint | null>(null);

  // Keep roomCode in a ref so the stable insert handler always reads the latest value.
  const roomCodeRef = useRef(roomCode);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  // Synchronous lookup whenever db or roomCode changes.
  useEffect(() => {
    if (!db || !roomCode) return;
    const room = db.db.room.room_by_code.filter(roomCode).next().value ?? null;
    if (room) setRoomId(room.roomId);
  }, [db, roomCode]);

  // Subscribe to inserts once per db instance.
  useEffect(() => {
    if (!db) return;

    // The wrapper is stable — it delegates to the ref so it captures the latest roomCode.
    function onInsert(_ctx: unknown, row: { roomCode: string; roomId: bigint }) {
      if (row.roomCode === roomCodeRef.current) setRoomId(row.roomId);
    }

    db.db.room.onInsert(onInsert);
    return () => { db.db.room.removeOnInsert(onInsert); };
  }, [db]);

  return roomId;
}
